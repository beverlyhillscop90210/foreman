/**
 * Install git hooks
 */

import { existsSync, mkdirSync, writeFileSync, chmodSync } from 'fs';
import { join } from 'path';
import { simpleGit } from 'simple-git';

export async function installGitHooks(): Promise<void> {
  const git = simpleGit();

  // Check if we're in a git repo
  const isRepo = await git.checkIsRepo();
  if (!isRepo) {
    throw new Error('Not a git repository');
  }

  // Get git directory
  const gitDir = await git.revparse(['--git-dir']);
  const hooksDir = join(gitDir.trim(), 'hooks');

  // Ensure hooks directory exists
  if (!existsSync(hooksDir)) {
    mkdirSync(hooksDir, { recursive: true });
  }

  // Install pre-commit hook
  const preCommitPath = join(hooksDir, 'pre-commit');
  const preCommitScript = generatePreCommitHook();

  writeFileSync(preCommitPath, preCommitScript, 'utf-8');
  chmodSync(preCommitPath, 0o755);
}

function generatePreCommitHook(): string {
  return `#!/bin/sh
#
# Foreman pre-commit hook
# Validates staged files against task scope
#

# Run the pre-commit validator
node -e "
const { preCommitHook } = require('./.git/../node_modules/@foreman/core/dist/git-hooks/pre-commit.js');
preCommitHook().catch(err => {
  console.error(err.message);
  process.exit(1);
});
"
`;
}

export async function uninstallGitHooks(): Promise<void> {
  const git = simpleGit();
  const isRepo = await git.checkIsRepo();

  if (!isRepo) {
    throw new Error('Not a git repository');
  }

  const gitDir = await git.revparse(['--git-dir']);
  const preCommitPath = join(gitDir.trim(), 'hooks', 'pre-commit');

  if (existsSync(preCommitPath)) {
    const { unlinkSync } = await import('fs');
    unlinkSync(preCommitPath);
  }
}

