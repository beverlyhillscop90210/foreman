/**
 * File system watcher - Real-time alerts when blocked files are modified
 */

import chokidar from 'chokidar';
import chalk from 'chalk';
import { ConfigManager } from './config.js';
import { FileChecker } from './file-checker.js';
import type { ActiveTask } from './types.js';

export class FileWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private configManager: ConfigManager;
  private activeTask: ActiveTask | null = null;
  private violations: Set<string> = new Set();

  constructor() {
    this.configManager = new ConfigManager();
  }

  /**
   * Start watching files
   */
  async start(): Promise<void> {
    if (!this.configManager.exists()) {
      throw new Error('.foreman.json not found. Run "foreman init" first.');
    }

    this.activeTask = this.configManager.getActiveTask();

    if (!this.activeTask) {
      throw new Error('No active task set. Run "foreman scope" first.');
    }

    console.log(chalk.blue.bold('\n👁️  Foreman File Watcher Started\n'));
    console.log(chalk.bold('Task:'), this.activeTask.name);
    console.log(chalk.gray('Watching for file changes...\n'));

    // Watch all files in the current directory
    this.watcher = chokidar.watch('.', {
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/build/**',
        '**/.foreman.json',
      ],
      persistent: true,
      ignoreInitial: true,
    });

    this.watcher
      .on('change', (path) => this.handleFileChange(path))
      .on('add', (path) => this.handleFileChange(path))
      .on('error', (error) => {
        console.error(chalk.red(`\n❌ Watcher error: ${error.message}\n`));
      });

    // Keep process alive
    process.on('SIGINT', () => {
      this.stop();
      process.exit(0);
    });
  }

  /**
   * Handle file change event
   */
  private handleFileChange(filePath: string): void {
    if (!this.activeTask) return;

    const checker = new FileChecker(this.activeTask);
    const result = checker.check(filePath);

    if (!result.allowed) {
      // New violation
      if (!this.violations.has(filePath)) {
        this.violations.add(filePath);
        console.log(
          chalk.red(
            `\n⚠️  WARNING: Modified file outside scope: ${filePath}`
          )
        );
        console.log(chalk.gray(`   Reason: ${result.reason}`));
        console.log(
          chalk.gray(
            '   This change will be blocked at commit time.\n'
          )
        );
      }
    } else {
      // File is allowed
      if (this.violations.has(filePath)) {
        this.violations.delete(filePath);
      }
      console.log(chalk.green(`✓ ${filePath}`));
    }
  }

  /**
   * Stop watching files
   */
  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
      console.log(chalk.gray('\n👋 File watcher stopped\n'));
    }
  }

  /**
   * Get current violations
   */
  getViolations(): string[] {
    return Array.from(this.violations);
  }
}

