import { create } from 'zustand';
import { api } from '../lib/api';

// ── DAG Types (mirror bridge types) ────────────────────────────

export type DagStatus = 'created' | 'running' | 'completed' | 'failed' | 'paused';
export type DagNodeStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'waiting_approval';
export type DagNodeType = 'task' | 'gate' | 'fan_out' | 'fan_in';

export interface DagNode {
  id: string;
  type: DagNodeType;
  title: string;
  briefing?: string;
  agent?: string;
  role?: string;
  status: DagNodeStatus;
  taskId?: string;
  project?: string;
  allowed_files?: string[];
  blocked_files?: string[];
  error?: string;
  started_at?: string;
  completed_at?: string;
  output?: string[];
  artifacts?: Record<string, any>;
  gate_condition?: 'all_pass' | 'any_pass' | 'manual';
}

export interface DagEdge {
  from: string;
  to: string;
  label?: string;
}

export interface Dag {
  id: string;
  name: string;
  description: string;
  project: string;
  status: DagStatus;
  created_by: 'planner' | 'manual';
  approval_mode: string;
  nodes: DagNode[];
  edges: DagEdge[];
  created_at: string;
  updated_at: string;
  started_at?: string;
  completed_at?: string;
}

export interface AgentRole {
  id: string;
  name: string;
  description: string;
  model: string;
  capabilities: string[];
  icon?: string;
}

// ── Store ──────────────────────────────────────────────────────

interface DagStore {
  dags: Dag[];
  roles: AgentRole[];
  selectedDagId: string | null;
  loading: boolean;
  error: string | null;

  fetchDags: () => Promise<void>;
  fetchRoles: () => Promise<void>;
  selectDag: (id: string | null) => void;
  executeDag: (id: string) => Promise<void>;
  approveGate: (dagId: string, nodeId: string) => Promise<void>;
  deleteDag: (id: string) => Promise<void>;
  planDag: (project: string, brief: string) => Promise<Dag | null>;
}

export const useDagStore = create<DagStore>((set, get) => ({
  dags: [],
  roles: [],
  selectedDagId: null,
  loading: false,
  error: null,

  fetchDags: async () => {
    try {
      set({ loading: true, error: null });
      const data = await api.fetch<{ dags: Dag[] }>('/dags');
      set({ dags: data.dags, loading: false });
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  fetchRoles: async () => {
    try {
      const data = await api.fetch<{ roles: AgentRole[] }>('/roles');
      set({ roles: data.roles });
    } catch (err: any) {
      console.error('Failed to fetch roles:', err);
    }
  },

  selectDag: (id) => set({ selectedDagId: id }),

  executeDag: async (id) => {
    try {
      set({ error: null });
      await api.fetch(`/dags/${id}/execute`, { method: 'POST' });
      await get().fetchDags();
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  approveGate: async (dagId, nodeId) => {
    try {
      set({ error: null });
      await api.fetch(`/dags/${dagId}/nodes/${nodeId}/approve`, { method: 'POST' });
      await get().fetchDags();
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  deleteDag: async (id) => {
    try {
      set({ error: null });
      await api.fetch(`/dags/${id}`, { method: 'DELETE' });
      const state = get();
      set({
        dags: state.dags.filter(d => d.id !== id),
        selectedDagId: state.selectedDagId === id ? null : state.selectedDagId,
      });
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  planDag: async (project, brief) => {
    try {
      set({ loading: true, error: null });
      const data = await api.fetch<{ dag: Dag }>('/dags/plan', {
        method: 'POST',
        body: JSON.stringify({ project, brief, auto_create: true }),
      });
      await get().fetchDags();
      set({ loading: false, selectedDagId: data.dag.id });
      return data.dag;
    } catch (err: any) {
      set({ error: err.message, loading: false });
      return null;
    }
  },
}));
