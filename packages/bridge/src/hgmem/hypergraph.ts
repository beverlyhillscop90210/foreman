/**
 * HGMem — In-memory Hypergraph data structure.
 *
 * Manages vertices (entities) and hyperedges (memory points).
 * Supports insert, update, merge, neighbor lookup, and serialization.
 */

import { randomBytes } from 'crypto';
import type { HGVertex, HGHyperedge, HGMemory, MemoryOpUpdate, MemoryOpInsert, MemoryOpMerge } from './types.js';

function genId(prefix: string): string {
  return `${prefix}_${randomBytes(6).toString('hex')}`;
}

export class Hypergraph {
  private vertices: Map<string, HGVertex> = new Map();
  private hyperedges: Map<string, HGHyperedge> = new Map();

  // ── Vertex Operations ──────────────────────────────────────

  /** Get or create a vertex by name. Returns the vertex. */
  getOrCreateVertex(name: string, description = '', source_chunks: string[] = []): HGVertex {
    // Look up by name (case-insensitive)
    for (const v of this.vertices.values()) {
      if (v.name.toLowerCase() === name.toLowerCase()) {
        // Merge any new source chunks
        for (const chunk of source_chunks) {
          if (!v.source_chunks.includes(chunk)) {
            v.source_chunks.push(chunk);
          }
        }
        if (description && !v.description) {
          v.description = description;
        }
        v.updated_at = new Date().toISOString();
        return v;
      }
    }
    // Create new
    const vertex: HGVertex = {
      id: genId('v'),
      name,
      description,
      source_chunks,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.vertices.set(vertex.id, vertex);
    return vertex;
  }

  getVertex(id: string): HGVertex | undefined {
    return this.vertices.get(id);
  }

  getVertexByName(name: string): HGVertex | undefined {
    for (const v of this.vertices.values()) {
      if (v.name.toLowerCase() === name.toLowerCase()) return v;
    }
    return undefined;
  }

  getAllVertices(): HGVertex[] {
    return Array.from(this.vertices.values());
  }

  /** Get vertex IDs that are NOT yet in memory (complement set). */
  getComplementVertexIds(allSourceVertexIds: string[]): string[] {
    const memIds = new Set(this.vertices.keys());
    return allSourceVertexIds.filter((id) => !memIds.has(id));
  }

  // ── Hyperedge Operations ───────────────────────────────────

  /** Insert a new hyperedge (memory point). */
  insertHyperedge(description: string, vertexIds: string[], step: number): HGHyperedge {
    const he: HGHyperedge = {
      id: genId('he'),
      description,
      vertex_ids: vertexIds,
      order: vertexIds.length,
      origin: 'insertion',
      step_created: step,
      step_updated: step,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.hyperedges.set(he.id, he);
    return he;
  }

  /** Update the description of an existing hyperedge. */
  updateHyperedge(id: string, newDescription: string, step: number): HGHyperedge | null {
    const he = this.hyperedges.get(id);
    if (!he) return null;
    he.description = newDescription;
    he.step_updated = step;
    he.updated_at = new Date().toISOString();
    return he;
  }

  /**
   * Merge two hyperedges into a new higher-order one.
   * The original edges are removed and replaced by the merged edge.
   * V_merged = V_i ∪ V_j (Equation 8 from paper).
   */
  mergeHyperedges(id1: string, id2: string, mergedDescription: string, step: number): HGHyperedge | null {
    const he1 = this.hyperedges.get(id1);
    const he2 = this.hyperedges.get(id2);
    if (!he1 || !he2) return null;

    // Union of vertex sets
    const mergedVertexIds = [...new Set([...he1.vertex_ids, ...he2.vertex_ids])];

    const merged: HGHyperedge = {
      id: genId('he'),
      description: mergedDescription,
      vertex_ids: mergedVertexIds,
      order: mergedVertexIds.length,
      origin: 'merge',
      merged_from: [id1, id2],
      step_created: step,
      step_updated: step,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Remove originals
    this.hyperedges.delete(id1);
    this.hyperedges.delete(id2);
    // Insert merged
    this.hyperedges.set(merged.id, merged);
    return merged;
  }

  getHyperedge(id: string): HGHyperedge | undefined {
    return this.hyperedges.get(id);
  }

  getAllHyperedges(): HGHyperedge[] {
    return Array.from(this.hyperedges.values());
  }

  // ── Neighborhood Queries ───────────────────────────────────

  /**
   * Get neighboring vertices of a vertex within the memory hypergraph.
   * 𝒩_ℳ(v): all vertices that share at least one hyperedge with v.
   */
  getMemoryNeighbors(vertexId: string): string[] {
    const neighbors = new Set<string>();
    for (const he of this.hyperedges.values()) {
      if (he.vertex_ids.includes(vertexId)) {
        for (const vid of he.vertex_ids) {
          if (vid !== vertexId) neighbors.add(vid);
        }
      }
    }
    return Array.from(neighbors);
  }

  /**
   * Get all hyperedges that involve a particular vertex.
   */
  getHyperedgesForVertex(vertexId: string): HGHyperedge[] {
    return this.getAllHyperedges().filter((he) => he.vertex_ids.includes(vertexId));
  }

  /**
   * Get subordinate vertices of a hyperedge.
   */
  getSubordinateVertices(hyperedgeId: string): HGVertex[] {
    const he = this.hyperedges.get(hyperedgeId);
    if (!he) return [];
    return he.vertex_ids.map((vid) => this.vertices.get(vid)).filter(Boolean) as HGVertex[];
  }

  // ── Statistics ─────────────────────────────────────────────

  vertexCount(): number { return this.vertices.size; }
  hyperedgeCount(): number { return this.hyperedges.size; }

  /** Average entities per hyperedge (Avg-N_v). */
  avgVerticesPerHyperedge(): number {
    if (this.hyperedges.size === 0) return 0;
    let total = 0;
    for (const he of this.hyperedges.values()) total += he.vertex_ids.length;
    return total / this.hyperedges.size;
  }

  /** Max hyperedge order (most complex memory point). */
  maxOrder(): number {
    let max = 0;
    for (const he of this.hyperedges.values()) {
      if (he.order > max) max = he.order;
    }
    return max;
  }

  // ── Serialization ──────────────────────────────────────────

  /** Export to a plain object for JSON serialization / DB persistence. */
  serialize(): { vertices: HGVertex[]; hyperedges: HGHyperedge[] } {
    return {
      vertices: this.getAllVertices(),
      hyperedges: this.getAllHyperedges(),
    };
  }

  /** Restore from serialized data. */
  static deserialize(data: { vertices: HGVertex[]; hyperedges: HGHyperedge[] }): Hypergraph {
    const hg = new Hypergraph();
    for (const v of data.vertices) {
      hg.vertices.set(v.id, v);
    }
    for (const he of data.hyperedges) {
      hg.hyperedges.set(he.id, he);
    }
    return hg;
  }

  /** Get memory state as the formal ℳ = (𝒱_ℳ, ℰ̃_ℳ) tuple. */
  toMemory(): HGMemory {
    return {
      vertices: new Map(this.vertices),
      hyperedges: new Map(this.hyperedges),
    };
  }

  /** Render memory as a human-readable string for LLM prompts. */
  renderForPrompt(): string {
    const lines: string[] = [];

    if (this.hyperedges.size === 0) {
      return '(Memory is empty — no memory points yet)';
    }

    let i = 1;
    for (const he of this.hyperedges.values()) {
      const vertices = this.getSubordinateVertices(he.id);
      const entityNames = vertices.map((v) => v.name).join(', ');
      lines.push(`**Memory Point ${i} [${he.id}]:**`);
      lines.push(`  Subordinate Entities: ${entityNames}`);
      lines.push(`  Description: ${he.description}`);
      lines.push(`  Order: ${he.order} | Created at step ${he.step_created}`);
      if (he.origin === 'merge') {
        lines.push(`  (Merged from: ${(he.merged_from || []).join(', ')})`);
      }
      lines.push('');
      i++;
    }

    return lines.join('\n');
  }
}
