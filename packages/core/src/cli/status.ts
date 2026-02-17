/**
 * foreman status - Show active task and scope status
 */

import chalk from 'chalk';
import { simpleGit } from 'simple-git';
import { ConfigManager } from '../config.js';
import { FileChecker } from '../file-checker.js';

export async function statusCommand(): Promise<void> {
  console.log(chalk.blue.bold('\n📊 Foreman Status\n'));

  const configManager = new ConfigManager();

  if (!configManager.exists()) {
    throw new Error('.foreman.json not found. Run "foreman init" first.');
  }

  const config = configManager.read();
  const activeTask = config.active_task;

  // Show project info
  console.log(chalk.bold('Project:'), config.project);

  // Show active task
  if (!activeTask) {
    console.log(chalk.yellow('\n⚠️  No active task set'));
    console.log(chalk.gray('Run "foreman scope" to set a task\n'));
    return;
  }

  console.log(chalk.bold('\nActive Task:'), activeTask.name);
  console.log(
    chalk.gray(`Created: ${activeTask.created_at || 'Unknown'}`)
  );

  // Show scope
  console.log(chalk.bold('\nAllowed files:'));
  activeTask.allowed_files.forEach((pattern) => {
    console.log(chalk.green(`  ✓ ${pattern}`));
  });

  if (activeTask.blocked_files.length > 0) {
    console.log(chalk.bold('\nBlocked files:'));
    activeTask.blocked_files.forEach((pattern) => {
      console.log(chalk.red(`  ✗ ${pattern}`));
    });
  }

  // Check git status
  try {
    const git = simpleGit();
    const status = await git.status();

    if (status.modified.length > 0 || status.created.length > 0) {
      console.log(chalk.bold('\nModified files:'));

      const checker = new FileChecker(activeTask);
      const allFiles = [...status.modified, ...status.created];

      for (const file of allFiles) {
        const result = checker.check(file);
        if (result.allowed) {
          console.log(chalk.green(`  ✓ ${file}`));
        } else {
          console.log(chalk.red(`  ✗ ${file} (${result.reason})`));
        }
      }

      const violations = checker.getViolations(allFiles);
      if (violations.length > 0) {
        console.log(
          chalk.red(
            `\n⚠️  ${violations.length} file(s) outside scope!`
          )
        );
      } else {
        console.log(chalk.green('\n✅ All changes within scope'));
      }
    } else {
      console.log(chalk.gray('\nNo modified files'));
    }
  } catch (error) {
    console.log(
      chalk.yellow(
        `\n⚠️  Could not check git status: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    );
  }

  console.log();
}

