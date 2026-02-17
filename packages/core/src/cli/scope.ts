/**
 * foreman scope - Set active task scope
 */

import chalk from 'chalk';
import { input } from '@inquirer/prompts';
import { ConfigManager } from '../config.js';
import type { ActiveTask } from '../types.js';

interface ScopeOptions {
  allow?: string[];
  block?: string[];
  interactive?: boolean;
}

export async function scopeCommand(
  taskName: string | undefined,
  options: ScopeOptions
): Promise<void> {
  console.log(chalk.blue.bold('\n🎯 Set Task Scope\n'));

  const configManager = new ConfigManager();

  if (!configManager.exists()) {
    throw new Error(
      '.foreman.json not found. Run "foreman init" first.'
    );
  }

  // Get task name
  const name =
    taskName ||
    (await input({
      message: 'Task name/description:',
      validate: (value) => value.length > 0 || 'Task name is required',
    }));

  // Get allowed files
  let allowedFiles: string[] = options.allow || [];
  if (allowedFiles.length === 0) {
    const allowInput = await input({
      message: 'Allowed file patterns (comma-separated, e.g., src/api/**,src/utils/**):',
      validate: (value) => value.length > 0 || 'At least one pattern is required',
    });
    allowedFiles = allowInput.split(',').map((p) => p.trim());
  }

  // Get blocked files
  let blockedFiles: string[] = options.block || [];
  if (blockedFiles.length === 0) {
    const blockInput = await input({
      message: 'Blocked file patterns (comma-separated, optional):',
      default: '',
    });
    if (blockInput) {
      blockedFiles = blockInput.split(',').map((p) => p.trim());
    }
  }

  // Create task
  const task: ActiveTask = {
    name,
    allowed_files: allowedFiles,
    blocked_files: blockedFiles,
    review_required: true,
    auto_commit: false,
  };

  // Save task
  configManager.setActiveTask(task);

  console.log(chalk.green('\n✅ Task scope set successfully!\n'));
  console.log(chalk.bold('Task:'), name);
  console.log(chalk.bold('\nAllowed files:'));
  allowedFiles.forEach((pattern) => {
    console.log(chalk.green(`  ✓ ${pattern}`));
  });

  if (blockedFiles.length > 0) {
    console.log(chalk.bold('\nBlocked files:'));
    blockedFiles.forEach((pattern) => {
      console.log(chalk.red(`  ✗ ${pattern}`));
    });
  }

  console.log(
    chalk.gray('\n💡 Git hooks will now enforce this scope on commits\n')
  );
}

