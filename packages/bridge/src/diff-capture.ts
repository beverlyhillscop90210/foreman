/**
 * Diff Capture - Git integration for task branches and diffs
 */

import { simpleGit } from 'simple-git';
import { join } from 'path';
import { existsSync } from 'fs';
import type { Task } from './types.js';

export class DiffCapture {
  private projectsDir: string;

  constructor() {
    this.projectsDir = process.env.PROJECTS_DIR || join(process.cwd(), 'projects');
  }

  /**
   * Capture git diff for a task
   */
  async captureDiff(task: Task): Promise<string> {
    const projectDir = join(this.projectsDir, task.project);
    
    if (!existsSync(projectDir)) {
      console.warn(`⚠️  Project directory not found for diff capture: ${projectDir}`);
      return '';
    }

    const git = simpleGit(projectDir);

    // Get current branch
    const status = await git.status();
    const currentBranch = status.current || 'main';

    // Create task branch if not exists
    const taskBranch = `foreman/${task.id}`;
    
    try {
      await git.checkout(['-b', taskBranch]);
    } catch (error) {
      // Branch might already exist
      try {
        await git.checkout(taskBranch);
      } catch (e) {
        console.warn(`⚠️  Failed to checkout branch ${taskBranch}:`, e);
      }
    }

    // Stage all changes
    try {
      await git.add('.');
    } catch (e) {
      console.warn(`⚠️  Failed to stage changes:`, e);
    }

    // Get diff
    let diff = '';
    try {
      diff = await git.diff(['--cached']);
    } catch (e) {
      console.warn(`⚠️  Failed to get diff:`, e);
    }

    return diff;
  }

  /**
   * Commit changes for a task
   */
  async commitChanges(task: Task, message: string): Promise<string> {
    const projectDir = join(this.projectsDir, task.project);
    
    if (!existsSync(projectDir)) {
      throw new Error(`Project directory not found: ${projectDir}`);
    }

    const git = simpleGit(projectDir);

    // Commit
    const commitMessage = `[Foreman ${task.id}] ${message}

Task: ${task.title}
Agent: ${task.agent}
Briefing: ${task.briefing}

Managed by Foreman Bridge`;

    await git.commit(commitMessage);

    // Get commit hash
    const log = await git.log({ maxCount: 1 });
    return log.latest?.hash || '';
  }

  /**
   * Push changes to remote
   */
  async pushChanges(task: Task): Promise<void> {
    const projectDir = join(this.projectsDir, task.project);
    
    if (!existsSync(projectDir)) {
      throw new Error(`Project directory not found: ${projectDir}`);
    }

    const git = simpleGit(projectDir);

    const taskBranch = `foreman/${task.id}`;
    await git.push('origin', taskBranch);
  }

  /**
   * Merge task branch to main
   */
  async mergeToMain(task: Task): Promise<void> {
    const projectDir = join(this.projectsDir, task.project);
    
    if (!existsSync(projectDir)) {
      throw new Error(`Project directory not found: ${projectDir}`);
    }

    const git = simpleGit(projectDir);

    const taskBranch = `foreman/${task.id}`;

    // Checkout main
    await git.checkout('main');

    // Merge task branch
    await git.merge([taskBranch]);

    // Delete task branch
    await git.deleteLocalBranch(taskBranch);
  }

  /**
   * Revert task changes
   */
  async revertChanges(task: Task): Promise<void> {
    const projectDir = join(this.projectsDir, task.project);
    const git = simpleGit(projectDir);

    // Checkout main and delete task branch
    await git.checkout('main');
    
    const taskBranch = `foreman/${task.id}`;
    try {
      await git.deleteLocalBranch(taskBranch, true);
    } catch (error) {
      console.error(`Failed to delete branch ${taskBranch}:`, error);
    }
  }
}

