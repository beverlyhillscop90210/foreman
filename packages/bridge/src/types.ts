export type TaskStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'reviewing'
  | 'qc_failed';

export interface Task {
  id: string;
  title?: string;
  project: string;
  description: string;
  briefing?: string;
  agent?: string;
  model?: string;
  status: TaskStatus;
  created_at: string;
  updated_at?: string;
  started_at?: string;
  completed_at?: string;
  agent_output?: string;
  output?: any[];
  diff?: string;
  allowed_files?: string[];
  blocked_files?: string[];
  qc_result?: {
    passed: boolean;
    checks: { name: string; passed: boolean; details: string; severity: string }[];
    summary: string;
    score: number;
  };
}

export interface CreateTaskRequest {
  project: string;
  title?: string;
  description: string;
  briefing?: string;
  allowed_files?: string[];
  blocked_files?: string[];
  verification?: string;
  agent?: 'claude-code' | 'augment' | 'custom';
  role?: string;
}

export interface ApproveRequest {
  commit_message?: string;
  push?: boolean;
}

export interface RejectRequest {
  reason: string;
  retry?: boolean;
}

export interface FileCheckResult {
  allowed: boolean;
  reason?: string;
  matched_pattern?: string;
}

// Config types
export interface ConfigEntry {
  key: string;
  value: string; // encrypted value
  category: string;
  description: string;
  masked: boolean;
  updated_at: string;
}

export interface ConfigEntryInput {
  value: string;
  category?: string;
  description?: string;
  masked?: boolean;
}

export interface ConfigEntryResponse {
  key: string;
  value: string; // masked or revealed based on query param
  category: string;
  description: string;
  masked: boolean;
  updated_at: string;
}

/**
 * Kanban Board Types
 */

export type KanbanColumn = 'backlog' | 'in_progress' | 'review' | 'commit_review' | 'done';

export interface KanbanCard {
  id: string;
  taskId?: string;       // linked foreman task ID
  title: string;
  description?: string;
  column: KanbanColumn;
  project: string;        // e.g. 'foreman-dashboard', 'zeon-api'
  agentId?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  labels: string[];
  createdAt: string;
  updatedAt: string;
  qcResult?: {
    passed: boolean;
    score: number;
    summary: string;
  };
}

/**
 * WebSocket Event Types
 */

export interface KanbanCardCreatedEvent {
  type: 'card:created';
  card: KanbanCard;
}

export interface KanbanCardMovedEvent {
  type: 'card:moved';
  card: KanbanCard;
  from: KanbanColumn;
  to: KanbanColumn;
}

export interface KanbanCardAssignedEvent {
  type: 'card:assigned';
  card: KanbanCard;
}

export type KanbanEvent =
  | KanbanCardCreatedEvent
  | KanbanCardMovedEvent
  | KanbanCardAssignedEvent;

