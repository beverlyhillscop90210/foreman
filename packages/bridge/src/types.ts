/**
 * Foreman Bridge types
 */

export interface Task {
  id: string;
  project: string;
  title: string;
  briefing: string;
  allowed_files: string[];
  blocked_files: string[];
  verification?: string;
  agent: 'claude-code' | 'augment' | 'custom';
  role?: string;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
  started_at?: string;
  completed_at?: string;
  output?: string[];
  diff?: string;
  review?: ReviewResult;
  error?: string;
}

export type TaskStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'reviewing'
  | 'approved'
  | 'rejected';

export interface CreateTaskRequest {
  project: string;
  title: string;
  briefing: string;
  allowed_files: string[];
  blocked_files?: string[];
  verification?: string;
  agent?: 'claude-code' | 'augment' | 'custom';
  role?: string;
}

export interface ReviewResult {
  status: 'APPROVE' | 'REJECT' | 'REQUEST_CHANGES';
  reason: string;
  suggestions?: string[];
  scope_violations?: string[];
  build_passed?: boolean;
  tests_passed?: boolean;
}

export interface ApproveRequest {
  commit_message?: string;
  push?: boolean;
}

export interface RejectRequest {
  reason: string;
  retry?: boolean;
}

export interface ProjectContext {
  project: string;
  stack?: string;
  architecture?: Record<string, string>;
  critical_dependencies?: string[];
  past_incidents?: Incident[];
  known_good_commits?: Record<string, string>;
}

export interface Incident {
  date: string;
  what: string;
  impact: string;
  lesson: string;
}

export interface FileCheckResult {
  allowed: boolean;
  reason?: string;
  matched_pattern?: string;
}

export interface DAGDefinition {
  id: string;
  name: string;
  description: string;
  project: string;
  created_by: 'planner' | 'manual';
  approval_mode: 'per_task' | 'end_only' | 'gate_configured';
  nodes: DAGNode[];
  edges: DAGEdge[];
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  created_at: string;
  updated_at: string;
}

export interface DAGNode {
  id: string;
  type: 'task' | 'gate' | 'planner' | 'merge';
  role: string;
  title: string;
  briefing: string;
  config: {
    model?: string;
    reasoning_effort?: 'low' | 'medium' | 'high';
    allowed_files?: string[];
    blocked_files?: string[];
    risk_tier?: 'low' | 'medium' | 'high' | 'critical';
    max_retries?: number;
    timeout_minutes?: number;
  };
  status: 'pending' | 'ready' | 'running' | 'completed' | 'failed' | 'cancelled' | 'skipped';
  output?: any;
  error?: string;
  started_at?: string;
  completed_at?: string;
  updated_at?: string;
}

export interface DAGEdge {
  from: string;
  to: string;
  type: 'dependency' | 'data_flow' | 'gate';
  label?: string;
}

