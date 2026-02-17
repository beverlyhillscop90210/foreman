/**
 * Foreman Core - Main exports
 */

export { ConfigManager } from './config.js';
export { FileChecker } from './file-checker.js';
export { FileWatcher } from './watcher.js';
export { installGitHooks, uninstallGitHooks } from './git-hooks/install.js';
export { preCommitHook } from './git-hooks/pre-commit.js';
export type { ForemanConfig, ActiveTask, FileCheckResult, DiffReview } from './types.js';

