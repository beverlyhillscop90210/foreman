/**
 * HGMem — Hypergraph-based Memory for Multi-step RAG
 * Based on: "Improving Multi-step RAG with Hypergraph-based Memory
 * for Long-Context Complex Relational Modeling" (arXiv:2512.23959)
 *
 * Type definitions for the hypergraph memory structure.
 */

// ── Vertex (Entity) ────────────────────────────────────────────

/** A vertex in the hypergraph, representing an identified entity. */
export interface HGVertex {
  /** Unique vertex ID */
  id: string;
  /** Entity name (e.g. a function name, file path, concept) */
  name: string;
  /** Description of the entity */
  description: string;
  /** Text chunks associated (source passages where this entity was found) */
  source_chunks: string[];
  /** Embedding vector for vector-based retrieval */
  embedding?: number[];
  /** Metadata (entity type, language, etc.) */
  metadata?: Record<string, any>;
  /** Timestamp */
  created_at: string;
  updated_at: string;
}

// ── Hyperedge (Memory Point) ───────────────────────────────────

/**
 * A hyperedge in the hypergraph. Each hyperedge is a "memory point"
 * that describes a relationship connecting an arbitrary number of vertices.
 * This is the key distinction from regular graphs: edges connect n≥2 vertices.
 */
export interface HGHyperedge {
  /** Unique hyperedge ID */
  id: string;
  /** Relationship description — the semantic content of this memory point */
  description: string;
  /** IDs of subordinate vertices connected by this hyperedge */
  vertex_ids: string[];
  /** Order = number of connected vertices. Higher order = more complex relation */
  order: number;
  /** How this memory point was created: 'insertion' | 'merge' */
  origin: 'insertion' | 'merge';
  /** If created by merge, IDs of the parent hyperedges */
  merged_from?: string[];
  /** Embedding vector for similarity search */
  embedding?: number[];
  /** The RAG step at which this hyperedge was created/updated */
  step_created: number;
  step_updated: number;
  /** Metadata */
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

// ── Hypergraph Memory ──────────────────────────────────────────

/**
 * The hypergraph memory structure ℳ = (𝒱_ℳ, ℰ̃_ℳ).
 * Vertices are entities, hyperedges are memory points.
 */
export interface HGMemory {
  vertices: Map<string, HGVertex>;
  hyperedges: Map<string, HGHyperedge>;
}

// ── RAG Session ────────────────────────────────────────────────

/** Tracks the state of a multi-step RAG session. */
export interface HGMemSession {
  /** Unique session ID */
  id: string;
  /** The target query being resolved */
  query: string;
  /** Associated project */
  project: string;
  /** Current interaction step (t) */
  current_step: number;
  /** Maximum steps allowed */
  max_steps: number;
  /** Session status */
  status: 'active' | 'completed' | 'failed';
  /** The evolving memory for this session */
  memory: HGMemory;
  /** History of subqueries generated at each step */
  subquery_history: StepSubqueries[];
  /** Final response (when completed) */
  response?: string;
  /** Cost tracking */
  total_tokens: number;
  total_cost_usd: number;
  created_at: string;
  updated_at: string;
}

/** Subqueries generated at a particular step, with their type. */
export interface StepSubqueries {
  step: number;
  subqueries: SubQuery[];
}

/** A subquery with its retrieval strategy. */
export interface SubQuery {
  /** The query text */
  query: string;
  /** Retrieval strategy: local investigation targets a specific memory point,
   *  global exploration searches beyond current memory. */
  strategy: 'local' | 'global';
  /** If local, the target hyperedge (memory point) ID */
  target_hyperedge_id?: string;
}

// ── Memory Operations ──────────────────────────────────────────

/** An update operation: revise description without changing vertices. */
export interface MemoryOpUpdate {
  type: 'update';
  hyperedge_id: string;
  new_description: string;
}

/** An insertion operation: create a new hyperedge. */
export interface MemoryOpInsert {
  type: 'insert';
  description: string;
  vertex_names: string[];
}

/** A merge operation: combine two hyperedges into a higher-order one. */
export interface MemoryOpMerge {
  type: 'merge';
  hyperedge_ids: [string, string];
  merged_description: string;
}

export type MemoryOperation = MemoryOpUpdate | MemoryOpInsert | MemoryOpMerge;

// ── Retrieved Evidence ─────────────────────────────────────────

/** Evidence retrieved at a step (entities + relationships + chunks). */
export interface RetrievedEvidence {
  /** Retrieved vertices */
  vertices: HGVertex[];
  /** Edges/relationships from the source graph */
  relationships: Array<{ source: string; target: string; description: string }>;
  /** Source text chunks */
  chunks: string[];
}

// ── LLM Interface ──────────────────────────────────────────────

/** Configuration for the LLM backend used by HGMem. */
export interface HGMemLLMConfig {
  /** OpenRouter or OpenAI API key */
  api_key: string;
  /** API base URL */
  api_url: string;
  /** Model identifier */
  model: string;
  /** Temperature for generation */
  temperature: number;
  /** Max output tokens */
  max_tokens: number;
}

/** Configuration for the HGMem engine. */
export interface HGMemConfig {
  /** LLM config for reasoning calls */
  llm: HGMemLLMConfig;
  /** Embedding model config (reuses knowledge service pattern) */
  embedding_api_key?: string;
  embedding_api_url?: string;
  embedding_model?: string;
  /** Max interaction steps */
  max_steps: number;
  /** Number of entities to retrieve per subquery */
  entities_per_query: number;
  /** Similarity threshold for vector retrieval */
  similarity_threshold: number;
  /** Whether to persist sessions to database */
  persist: boolean;
}
