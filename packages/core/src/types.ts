/**
 * Foreman configuration types
 */

export interface ForemanConfig {
  project: string;
  api_url?: string;
  api_token?: string;
  review_model?: string;
  architecture: Record<string, string>;
  active_task: ActiveTask | null;
  known_good_states: Record<string, string>;
}

export interface ActiveTask {
  name: string;
  allowed_files: string[];
  blocked_files: string[];
  review_required?: boolean;
  auto_commit?: boolean;
  created_at?: string;
}

export interface FileCheckResult {
  allowed: boolean;
  reason?: string;
  matched_pattern?: string;
}

export interface DiffReview {
  status: 'APPROVE' | 'REJECT' | 'REQUEST_CHANGES';
  reason: string;
  suggestions?: string[];
}

