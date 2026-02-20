export type TaskStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'reviewing'
  | 'qc_failed';

export interface Task {
  id: string;
  project: string;
  description: string;
  status: TaskStatus;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  agent_output?: string;
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

