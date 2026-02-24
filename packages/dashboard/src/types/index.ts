export type AgentStatus = 'running' | 'completed' | 'failed' | 'idle';

export interface TerminalLine {
  id: string;
  timestamp: number;
  text: string;
  type: 'stdout' | 'stderr' | 'system';
}

export interface Agent {
  id: string;
  taskTitle: string;
  bucket: string;
  status: AgentStatus;
  startTime: number;
  output: TerminalLine[];
}

export interface TerminalPanel {
  id: string;
  agentId: string;
  position: { x: number; y: number; width: number; height: number };
  isMinimized: boolean;
  isMaximized: boolean;
  isHidden: boolean;
}

// Kanban types
export type KanbanStatus = 'backlog' | 'in-progress' | 'review' | 'commit-review' | 'done';

export interface KanbanTask {
  id: string;
  title: string;
  project: string;
  agentId: string;
  model?: string;
  role?: string;
  elapsedTime: string;
  status: KanbanStatus;
  briefing?: string;
  agentLog?: string;
  filesChanged?: string[];
}

// Knowledge Base types
export type DocumentCategory =
  | 'Architecture'
  | 'Training Scripts'
  | 'Scrape Results'
  | 'Deployment'
  | 'API Docs';

export type DocumentSourceType = 'web' | 'pdf' | 'md' | 'repo' | 'image';

export interface KnowledgeDocument {
  id: string;
  title: string;
  category: DocumentCategory;
  updated: string;
  size: string;
  preview: string;
  sourceType: DocumentSourceType;
  sourceUrl: string;
  dateAdded: string;
  tags: string[];
  content?: string;
}

// Orchestrator types (re-exported for convenience)
export type {
  TaskDefinition,
  TaskPriority,
  TaskStatus as OrchestratorTaskStatus,
  AgentType,
  CoordinatorConfig,
  CoordinatorState,
  SubAgentRequest,
} from '../orchestrator';
