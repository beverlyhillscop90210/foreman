import { create } from 'zustand';
import { api } from '../lib/api';

// ── Types (mirroring bridge HGMem types for the frontend) ──────

export interface HGVertex {
  id: string;
  name: string;
  description: string;
  source_chunks: string[];
  created_at: string;
  updated_at: string;
}

export interface HGHyperedge {
  id: string;
  description: string;
  vertex_ids: string[];
  order: number;
  origin: 'insertion' | 'merge';
  merged_from?: string[];
  step_created: number;
  step_updated: number;
  created_at: string;
  updated_at: string;
}

export interface SubQuery {
  query: string;
  strategy: 'local' | 'global';
  target_hyperedge_id?: string;
}

export interface StepSubqueries {
  step: number;
  subqueries: SubQuery[];
}

export interface HGMemSessionSummary {
  id: string;
  query: string;
  project: string;
  status: 'active' | 'completed' | 'failed';
  steps: number;
  max_steps: number;
  created_at: string;
  updated_at: string;
}

export interface HGMemSession {
  id: string;
  query: string;
  project: string;
  current_step: number;
  max_steps: number;
  status: 'active' | 'completed' | 'failed';
  subquery_history: StepSubqueries[];
  response?: string;
  total_tokens: number;
  total_cost_usd: number;
  created_at: string;
  updated_at: string;
}

export interface HGMemStats {
  id: string;
  status: string;
  steps: number;
  max_steps: number;
  vertices: number;
  hyperedges: number;
  avg_order: number;
  max_order: number;
  subqueries_total: number;
}

export interface HGMemMemory {
  memory: string;
  vertices: number;
  hyperedges: number;
  avg_order: number;
}

export interface HGMemSessionDetail {
  session: HGMemSession;
  stats: HGMemStats;
  graphData?: { vertices: HGVertex[]; hyperedges: HGHyperedge[] };
}

// ── Store ──────────────────────────────────────────────────────

interface HGMemStore {
  sessions: HGMemSessionSummary[];
  selectedId: string | null;
  detail: HGMemSessionDetail | null;
  graphData: { vertices: HGVertex[]; hyperedges: HGHyperedge[] } | null;
  memoryText: string;
  loading: boolean;
  running: boolean;
  error: string | null;

  fetchSessions: () => Promise<void>;
  selectSession: (id: string) => Promise<void>;
  clearSelection: () => void;
  createAndRun: (query: string, project?: string) => Promise<void>;
  runStep: (id: string) => Promise<{ done: boolean }>;
  deleteSession: (id: string) => Promise<void>;
  fetchGraphData: (id: string) => Promise<void>;
}

export const useHGMemStore = create<HGMemStore>((set, get) => ({
  sessions: [],
  selectedId: null,
  detail: null,
  graphData: null,
  memoryText: '',
  loading: false,
  running: false,
  error: null,

  fetchSessions: async () => {
    try {
      set({ loading: true, error: null });
      const data = await api.fetch<{ sessions: HGMemSessionSummary[] }>('/hgmem/sessions');
      set({ sessions: data.sessions, loading: false });
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  selectSession: async (id: string) => {
    try {
      set({ selectedId: id, loading: true, error: null });
      const [detailRes, memoryRes] = await Promise.all([
        api.fetch<{ session: HGMemSession; stats: HGMemStats }>(`/hgmem/sessions/${id}`),
        api.fetch<HGMemMemory>(`/hgmem/sessions/${id}/memory`),
      ]);
      set({
        detail: { session: detailRes.session, stats: detailRes.stats },
        memoryText: memoryRes.memory,
        loading: false,
      });
      // Fetch graph data separately (from the session's memory field serialized in detail)
      await get().fetchGraphData(id);
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  fetchGraphData: async (id: string) => {
    try {
      // The session detail includes memory as Maps, but the REST API also provides
      // the rendered memory. We need the raw graph data for visualization.
      // We can get it from the full session response which includes the memory field.
      const res = await api.fetch<{ session: any; stats: any }>(`/hgmem/sessions/${id}`);
      const session = res.session;
      // The memory field contains the serialized Maps (as JSON objects from persistence)
      if (session.memory) {
        const vertices: HGVertex[] = [];
        const hyperedges: HGHyperedge[] = [];
        // Memory might be serialized as { vertices: Map-like, hyperedges: Map-like }
        // From the engine's exportSessions, graphData is { vertices: [], hyperedges: [] }
        const mem = session.memory;
        if (mem.vertices) {
          if (Array.isArray(mem.vertices)) {
            vertices.push(...mem.vertices);
          } else if (typeof mem.vertices === 'object') {
            // Map serialized as object
            for (const v of Object.values(mem.vertices) as HGVertex[]) {
              vertices.push(v);
            }
          }
        }
        if (mem.hyperedges) {
          if (Array.isArray(mem.hyperedges)) {
            hyperedges.push(...mem.hyperedges);
          } else if (typeof mem.hyperedges === 'object') {
            for (const h of Object.values(mem.hyperedges) as HGHyperedge[]) {
              hyperedges.push(h);
            }
          }
        }
        set({ graphData: { vertices, hyperedges } });
      }
    } catch {
      // Non-critical — graph just won't show
      set({ graphData: null });
    }
  },

  clearSelection: () => {
    set({ selectedId: null, detail: null, graphData: null, memoryText: '' });
  },

  createAndRun: async (query: string, project?: string) => {
    try {
      set({ running: true, error: null });
      const data = await api.fetch<{ session: HGMemSession; stats: HGMemStats }>('/hgmem', {
        method: 'POST',
        body: JSON.stringify({ query, project: project || 'default' }),
      });
      set({ running: false });
      // Refresh sessions list and select the new one
      await get().fetchSessions();
      await get().selectSession(data.session.id);
    } catch (err: any) {
      set({ error: err.message, running: false });
    }
  },

  runStep: async (id: string) => {
    try {
      set({ running: true, error: null });
      const data = await api.fetch<{ done: boolean; step: number; response?: string; stats: HGMemStats }>(`/hgmem/sessions/${id}/step`, {
        method: 'POST',
      });
      set({ running: false });
      // Refresh detail
      await get().selectSession(id);
      return { done: data.done };
    } catch (err: any) {
      set({ error: err.message, running: false });
      return { done: false };
    }
  },

  deleteSession: async (id: string) => {
    try {
      await api.fetch<{ deleted: boolean }>(`/hgmem/sessions/${id}`, { method: 'DELETE' });
      if (get().selectedId === id) get().clearSelection();
      await get().fetchSessions();
    } catch (err: any) {
      set({ error: err.message });
    }
  },
}));
