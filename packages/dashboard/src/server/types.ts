// Task types
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  bucket: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  output: string[];
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

// WebSocket message types
export type WebSocketMessageType = 'agent_output' | 'task_event';

export interface AgentOutputMessage {
  type: 'agent_output';
  taskId: string;
  line: string;
  stream: 'stdout' | 'stderr';
  timestamp: string;
}

export interface TaskEventMessage {
  type: 'task_event';
  taskId: string;
  event: 'started' | 'completed' | 'failed';
  timestamp: string;
}

export type WebSocketMessage = AgentOutputMessage | TaskEventMessage;

// Status types
export interface SystemStatus {
  agents: {
    running: number;
    max: number;
  };
  tasks: {
    total: number;
    running: number;
    completed: number;
    failed: number;
  };
  uptime: number;
  version: string;
}

// TaskRunner event types
export interface TaskOutputEvent {
  taskId: string;
  line: string;
  stream: 'stdout' | 'stderr';
}

export interface TaskLifecycleEvent {
  taskId: string;
  event: 'started' | 'completed' | 'failed';
}

