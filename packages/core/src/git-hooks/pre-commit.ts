/**
 * Pre-commit hook - validates staged files against task scope
 */

import { simpleGit } from 'simple-git';
import { ConfigManager } from '../config.js';
import { FileChecker } from '../file-checker.js';

export async function preCommitHook(): Promise<void> {
  const configManager = new ConfigManager();

  // Check if .foreman.json exists
  if (!configManager.exists()) {
    // No config, allow commit
    return;
  }

  const activeTask = configManager.getActiveTask();

  // No active task, allow commit
  if (!activeTask) {
    return;
  }

  // Get staged files
  const git = simpleGit();
  const diff = await git.diff(['--cached', '--name-only']);
  const stagedFiles = diff.split('\n').filter((f) => f.length > 0);

  if (stagedFiles.length === 0) {
    return;
  }

  // Check files against scope
  const checker = new FileChecker(activeTask);
  const violations = checker.getViolations(stagedFiles);

  if (violations.length > 0) {
    console.error('\n❌ Foreman: Commit blocked - files outside task scope\n');
    console.error(`Task: ${activeTask.name}\n`);
    console.error('Files outside scope:');
    violations.forEach((file) => {
      const result = checker.check(file);
      console.error(`  ✗ ${file} - ${result.reason}`);
    });
    console.error('\nAllowed patterns:');
    activeTask.allowed_files.forEach((pattern) => {
      console.error(`  ✓ ${pattern}`);
    });
    if (activeTask.blocked_files.length > 0) {
      console.error('\nBlocked patterns:');
      activeTask.blocked_files.forEach((pattern) => {
        console.error(`  ✗ ${pattern}`);
      });
    }
    console.error('\nTo fix:');
    console.error('  1. Unstage out-of-scope files: git reset HEAD <file>');
    console.error('  2. Update task scope: foreman scope');
    console.error('  3. Clear task scope: foreman scope --clear\n');

    throw new Error('Commit blocked by Foreman');
  }

  // All files within scope
  console.log('✅ Foreman: All staged files within task scope');
}

