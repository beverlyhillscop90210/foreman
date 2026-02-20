import { QCResult } from '../qc';

export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';

export type TaskStatus = 
  | 'backlog' 
  | 'in_progress' 
  | 'review' 
  | 'commit_review' 
  | 'done' 
  | 'failed';

export type AgentType = 'augment' | 'claude-code';

export interface TaskDefinition {
  id: string;
  title: string;
  briefing: string;
  project: string;
  priority: TaskPriority;
  allowedFiles: string[];
  blockedFiles: string[];
  dependencies?: string[];
  status: TaskStatus;
  assignedAgent?: string;
  branch?: string;
  qcResult?: QCResult;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  tokenUsage?: number;
}

export interface CoordinatorConfig {
  maxConcurrentAgents: number;
  defaultMaxTurns: number;
  defaultAgent: AgentType;
  autoQC: boolean;
  autoMergeOnQCPass: boolean;
}

export interface CoordinatorState {
  tasks: TaskDefinition[];
  activeAgents: number;
  maxAgents: number;
  queueDepth: number;
}

export interface SubAgentRequest {
  parentTaskId: string;
  type: 'scrape' | 'knowledge';
  query: string;
}

