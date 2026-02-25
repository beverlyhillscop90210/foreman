/**
 * HGMem Engine — Core multi-step RAG orchestrator.
 *
 * Implements the iterative loop from arXiv:2512.23959 §3.2:
 *   1. Check sufficiency of current memory
 *   2. If insufficient → raise concerns → generate subqueries
 *   3. Retrieve evidence (local investigation / global exploration)
 *   4. Evolve memory (update, insert, merge)
 *   5. Repeat until sufficient or max steps reached
 *   6. Generate final response from memory
 *
 * Uses OpenRouter for LLM calls (same pattern as planner.ts).
 * Uses existing KnowledgeService for retrieval (semantic search + pgvector).
 */

import { EventEmitter } from 'events';
import { Hypergraph } from './hypergraph.js';
import type {
  HGMemConfig,
  HGMemSession,
  SubQuery,
  StepSubqueries,
  RetrievedEvidence,
} from './types.js';
import {
  sufficiencyCheckPrompt,
  raiseConcernsPrompt,
  generateSubqueriesPrompt,
  memoryEvolutionPrompt,
  memoryMergePrompt,
  responseGenerationPrompt,
  entityExtractionPrompt,
} from './prompts.js';
import type { KnowledgeService } from '../services/knowledge.js';

// Re-export for convenience
export type { HGMemConfig, HGMemSession };

/** Default configuration. */
function defaultConfig(): HGMemConfig {
  return {
    llm: {
      api_key: process.env.OPENROUTER_API_KEY || '',
      api_url: 'https://openrouter.ai/api/v1/chat/completions',
      model: 'anthropic/claude-sonnet-4-20250514',
      temperature: 0.4,
      max_tokens: 4096,
    },
    max_steps: 6,
    entities_per_query: 5,
    similarity_threshold: 0.4,
    persist: true,
  };
}

function genSessionId(): string {
  return `hgm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export class HGMemEngine extends EventEmitter {
  private config: HGMemConfig;
  private knowledgeService: KnowledgeService;
  private sessions: Map<string, { session: HGMemSession; graph: Hypergraph }> = new Map();
  private userId?: string; // User ID for API key lookup

  constructor(knowledgeService: KnowledgeService, config?: Partial<HGMemConfig>, userId?: string) {
    super();
    this.knowledgeService = knowledgeService;
    this.config = { ...defaultConfig(), ...config };
    this.userId = userId;
    // Override api_key from env if not set in config
    if (!this.config.llm.api_key) {
      this.config.llm.api_key = process.env.OPENROUTER_API_KEY || '';
    }
  }

  // ── LLM Call ───────────────────────────────────────────────

  private async callLLM(system: string, user: string): Promise<string> {
    let key = this.config.llm.api_key;
    if (!key) {
      // Fallback: try configService
      try {
        const { configService } = await import('../routes/config.js');
        if (configService) {
          const entry = await configService.getConfig('OPENROUTER_API_KEY', true);
          if (entry?.value) key = entry.value;
        }
      } catch { /* config not available */ }
    }
    if (!key) throw new Error('HGMem: No OPENROUTER_API_KEY available');

    const response = await fetch(this.config.llm.api_url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.llm.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: this.config.llm.temperature,
        max_tokens: this.config.llm.max_tokens,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`HGMem LLM error: ${response.status} ${errText.slice(0, 200)}`);
    }

    const data = await response.json() as any;
    const content = data.choices?.[0]?.message?.content || '';
    const usage = data.usage;
    if (usage) {
      // Track token usage across the session
      this._lastUsage = {
        prompt_tokens: usage.prompt_tokens || 0,
        completion_tokens: usage.completion_tokens || 0,
      };
    }
    return content;
  }

  private _lastUsage = { prompt_tokens: 0, completion_tokens: 0 };

  /** Parse JSON from LLM response, stripping markdown fences. */
  private parseJSON(raw: string): any {
    const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || raw.match(/(\{[\s\S]*\})/) || raw.match(/(\[[\s\S]*\])/);
    if (!match) throw new Error(`HGMem: Could not extract JSON from LLM response: ${raw.slice(0, 200)}`);
    return JSON.parse(match[1].trim());
  }

  // ── Session Management ─────────────────────────────────────

  /** Create a new HGMem session for a query. */
  createSession(query: string, project: string): HGMemSession {
    const graph = new Hypergraph();
    const session: HGMemSession = {
      id: genSessionId(),
      query,
      project,
      current_step: 0,
      max_steps: this.config.max_steps,
      status: 'active',
      memory: graph.toMemory(),
      subquery_history: [],
      total_tokens: 0,
      total_cost_usd: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.sessions.set(session.id, { session, graph });
    this.emit('session:created', session);
    return session;
  }

  getSession(id: string): HGMemSession | undefined {
    return this.sessions.get(id)?.session;
  }

  getGraph(sessionId: string): Hypergraph | undefined {
    return this.sessions.get(sessionId)?.graph;
  }

  listSessions(): HGMemSession[] {
    return Array.from(this.sessions.values()).map(s => s.session);
  }

  deleteSession(id: string): boolean {
    return this.sessions.delete(id);
  }

  /** Restore sessions from serialized data. */
  restoreSessions(data: Array<{ session: HGMemSession; graphData: { vertices: any[]; hyperedges: any[] } }>) {
    for (const item of data) {
      const graph = Hypergraph.deserialize(item.graphData);
      this.sessions.set(item.session.id, { session: item.session, graph });
    }
  }

  /** Export all sessions for persistence. */
  exportSessions(): Array<{ session: HGMemSession; graphData: { vertices: any[]; hyperedges: any[] } }> {
    return Array.from(this.sessions.values()).map(({ session, graph }) => ({
      session,
      graphData: graph.serialize(),
    }));
  }

  // ── Core Loop: Run One Step ────────────────────────────────

  /**
   * Advance one interaction step for a session.
   * Returns { done, step, response? }.
   */
  async runStep(sessionId: string): Promise<{ done: boolean; step: number; response?: string }> {
    const entry = this.sessions.get(sessionId);
    if (!entry) throw new Error(`Session ${sessionId} not found`);
    const { session, graph } = entry;

    if (session.status !== 'active') {
      return { done: true, step: session.current_step, response: session.response };
    }

    const step = session.current_step;
    const memoryText = graph.renderForPrompt();

    this.emit('session:step:start', { sessionId, step });

    // ── Step 1: Check sufficiency (skip on step 0 — we always retrieve first) ──
    if (step > 0) {
      const suffRes = await this.checkSufficiency(session.query, memoryText);
      if (suffRes.sufficient) {
        const response = await this.generateResponse(session.query, graph);
        session.status = 'completed';
        session.response = response;
        session.memory = graph.toMemory();
        session.updated_at = new Date().toISOString();
        this.emit('session:completed', session);
        return { done: true, step, response };
      }
    }

    // ── Step 2: Check max steps ──
    if (step >= session.max_steps) {
      const response = await this.generateResponse(session.query, graph);
      session.status = 'completed';
      session.response = response;
      session.memory = graph.toMemory();
      session.updated_at = new Date().toISOString();
      this.emit('session:completed', session);
      return { done: true, step, response };
    }

    // ── Step 3: Generate subqueries ──
    let subqueries: SubQuery[];
    if (step === 0) {
      // Initial step: use the target query directly (§3.2: Q^(0) = {q^})
      subqueries = [{ query: session.query, strategy: 'global' }];
    } else {
      subqueries = await this.generateSubqueries(session.query, memoryText);
    }

    const stepSQ: StepSubqueries = { step, subqueries };
    session.subquery_history.push(stepSQ);

    // ── Step 4: Retrieve evidence for each subquery ──
    const allEvidence = await this.retrieveEvidence(subqueries, graph);

    // ── Step 5: Evolve memory (update + insert, then merge) ──
    await this.evolveMemory(session.query, graph, allEvidence, step);

    // ── Advance step counter ──
    session.current_step = step + 1;
    session.memory = graph.toMemory();
    session.updated_at = new Date().toISOString();

    this.emit('session:step:end', { sessionId, step, memoryPoints: graph.hyperedgeCount(), vertices: graph.vertexCount() });
    return { done: false, step };
  }

  /**
   * Run the full multi-step loop until done.
   */
  async run(sessionId: string): Promise<HGMemSession> {
    let result: { done: boolean; step: number; response?: string } = { done: false, step: 0 };
    while (!result.done) {
      result = await this.runStep(sessionId);
    }
    return this.getSession(sessionId)!;
  }

  // ── Sub-routines ───────────────────────────────────────────

  private async checkSufficiency(query: string, memoryText: string): Promise<{ sufficient: boolean; reasoning: string }> {
    const { system, user } = sufficiencyCheckPrompt(query, memoryText);
    const raw = await this.callLLM(system, user);
    try {
      const parsed = this.parseJSON(raw);
      return { sufficient: !!parsed.sufficient, reasoning: parsed.reasoning || '' };
    } catch {
      // Default to continue (not sufficient)
      return { sufficient: false, reasoning: 'Failed to parse sufficiency check' };
    }
  }

  private async generateSubqueries(query: string, memoryText: string): Promise<SubQuery[]> {
    // Stage 1: Raise concerns
    const { system: s1, user: u1 } = raiseConcernsPrompt(query, memoryText);
    const rawConcerns = await this.callLLM(s1, u1);
    let concerns: Array<{ type: string; concern: string; target_memory_point_id?: string }>;
    try {
      concerns = this.parseJSON(rawConcerns);
      if (!Array.isArray(concerns)) concerns = [];
    } catch {
      concerns = [{ type: 'global', concern: 'Explore additional information related to the query' }];
    }

    // Stage 2: Generate subqueries from concerns
    const { system: s2, user: u2 } = generateSubqueriesPrompt(query, concerns);
    const rawSQ = await this.callLLM(s2, u2);
    try {
      const parsed = this.parseJSON(rawSQ);
      if (!Array.isArray(parsed)) return [{ query, strategy: 'global' }];
      return parsed.map((sq: any) => ({
        query: sq.query || query,
        strategy: (sq.strategy === 'local' ? 'local' : 'global') as 'local' | 'global',
        target_hyperedge_id: sq.target_hyperedge_id || undefined,
      }));
    } catch {
      return [{ query, strategy: 'global' }];
    }
  }

  private async retrieveEvidence(
    subqueries: SubQuery[],
    graph: Hypergraph,
  ): Promise<{ subquery: SubQuery; evidence: RetrievedEvidence }[]> {
    const results: { subquery: SubQuery; evidence: RetrievedEvidence }[] = [];

    for (const sq of subqueries) {
      try {
        // Use KnowledgeService semantic search as our "external graph" retrieval
        const docs = await this.knowledgeService.semanticSearch(sq.query, {
          limit: this.config.entities_per_query,
          threshold: this.config.similarity_threshold,
        });

        const vertices = docs.map(doc => ({
          id: doc.id,
          name: doc.title,
          description: (doc.content || '').slice(0, 500),
          source_chunks: [doc.content || ''],
          created_at: doc.created_at,
          updated_at: doc.updated_at,
        }));

        const chunks = docs.map(doc => doc.content || '');

        // Extract relationships from retrieved chunks
        const relationships: Array<{ source: string; target: string; description: string }> = [];
        // We keep relationships lightweight — the memory evolution LLM will handle deeper analysis

        results.push({
          subquery: sq,
          evidence: { vertices, relationships, chunks },
        });
      } catch (err: any) {
        console.error(`HGMem: Retrieval failed for subquery "${sq.query}":`, err.message);
        results.push({
          subquery: sq,
          evidence: { vertices: [], relationships: [], chunks: [] },
        });
      }
    }

    return results;
  }

  private async evolveMemory(
    query: string,
    graph: Hypergraph,
    evidenceResults: Array<{ subquery: SubQuery; evidence: RetrievedEvidence }>,
    step: number,
  ): Promise<void> {
    // Compile all evidence into a text block
    const evidenceText = evidenceResults
      .map(({ subquery, evidence }) => {
        const header = `### Subquery: ${subquery.query} (${subquery.strategy})`;
        const chunks = evidence.chunks.map((c, i) => `[Chunk ${i + 1}] ${c.slice(0, 800)}`).join('\n\n');
        return `${header}\n${chunks}`;
      })
      .join('\n\n---\n\n');

    if (!evidenceText.trim()) return; // No evidence retrieved

    const memoryText = graph.renderForPrompt();

    // ── Phase 1: Update & Insert ──
    const { system: s1, user: u1 } = memoryEvolutionPrompt(query, memoryText, evidenceText);
    const rawEvolution = await this.callLLM(s1, u1);

    try {
      const evolution = this.parseJSON(rawEvolution);

      // Apply updates
      if (Array.isArray(evolution.updates)) {
        for (const upd of evolution.updates) {
          if (upd.hyperedge_id && upd.new_description) {
            graph.updateHyperedge(upd.hyperedge_id, upd.new_description, step);
          }
        }
      }

      // Apply insertions
      if (Array.isArray(evolution.insertions)) {
        for (const ins of evolution.insertions) {
          if (ins.description && Array.isArray(ins.entity_names) && ins.entity_names.length >= 2) {
            // Ensure vertices exist
            const vertexIds = ins.entity_names.map((name: string) => {
              // Find matching evidence vertex for source chunks
              const evidenceMatch = evidenceResults
                .flatMap(r => r.evidence.vertices)
                .find(v => v.name.toLowerCase() === name.toLowerCase());
              const sourceChunks = evidenceMatch?.source_chunks || [];
              const desc = evidenceMatch?.description || '';
              return graph.getOrCreateVertex(name, desc, sourceChunks).id;
            });
            graph.insertHyperedge(ins.description, vertexIds, step);
          }
        }
      }
    } catch (err: any) {
      console.error('HGMem: Failed to parse memory evolution:', err.message);
    }

    // ── Phase 2: Merge ──
    if (graph.hyperedgeCount() >= 2) {
      const updatedMemoryText = graph.renderForPrompt();
      const { system: s2, user: u2 } = memoryMergePrompt(query, updatedMemoryText);
      const rawMerge = await this.callLLM(s2, u2);

      try {
        const mergeResult = this.parseJSON(rawMerge);
        if (Array.isArray(mergeResult.merges)) {
          for (const merge of mergeResult.merges) {
            if (merge.hyperedge_id_1 && merge.hyperedge_id_2 && merge.merged_description) {
              graph.mergeHyperedges(merge.hyperedge_id_1, merge.hyperedge_id_2, merge.merged_description, step);
            }
          }
        }
      } catch (err: any) {
        console.error('HGMem: Failed to parse merge result:', err.message);
      }
    }
  }

  private async generateResponse(query: string, graph: Hypergraph): Promise<string> {
    const memoryText = graph.renderForPrompt();

    // Collect all source chunks from vertices
    const allChunks = graph.getAllVertices()
      .flatMap(v => v.source_chunks)
      .filter(Boolean)
      .map((c, i) => `[Source ${i + 1}] ${c.slice(0, 500)}`)
      .slice(0, 20) // Limit to keep prompt manageable
      .join('\n\n');

    const { system, user } = responseGenerationPrompt(query, memoryText, allChunks);
    return await this.callLLM(system, user);
  }

  // ── Context for TaskRunner ─────────────────────────────────

  /**
   * Get enriched context from a project's most recent HGMem session.
   * This replaces the flat semantic search in the knowledge loader.
   */
  getProjectMemoryContext(project: string): string | null {
    // Find the most recent completed session for this project
    let best: { session: HGMemSession; graph: Hypergraph } | null = null;
    for (const entry of this.sessions.values()) {
      if (entry.session.project === project && entry.session.status === 'completed') {
        if (!best || entry.session.updated_at > best.session.updated_at) {
          best = entry;
        }
      }
    }
    if (!best) return null;

    const memoryText = best.graph.renderForPrompt();
    const stats = `(${best.graph.hyperedgeCount()} memory points, ${best.graph.vertexCount()} entities, avg order ${best.graph.avgVerticesPerHyperedge().toFixed(1)})`;
    return `## HGMem Project Knowledge ${stats}\n${memoryText}`;
  }

  // ── Statistics ─────────────────────────────────────────────

  getSessionStats(sessionId: string): Record<string, any> | null {
    const entry = this.sessions.get(sessionId);
    if (!entry) return null;
    const { session, graph } = entry;
    return {
      id: session.id,
      status: session.status,
      steps: session.current_step,
      max_steps: session.max_steps,
      vertices: graph.vertexCount(),
      hyperedges: graph.hyperedgeCount(),
      avg_order: graph.avgVerticesPerHyperedge(),
      max_order: graph.maxOrder(),
      subqueries_total: session.subquery_history.reduce((sum, s) => sum + s.subqueries.length, 0),
    };
  }
}
