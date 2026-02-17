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

