/**
 * Task Manager - Orchestrates task lifecycle
 */

import { nanoid } from 'nanoid';
import type {
  Task,
  CreateTaskRequest,
  ApproveRequest,
  RejectRequest,
} from './types.js';
import { TaskRunner } from './task-runner.js';
import { DiffCapture } from './diff-capture.js';
import { RoleManager } from './role-manager.js';
import { KnowledgeGraph } from './knowledge-graph.js';

export class TaskManager {
  private tasks: Map<string, Task> = new Map();
  private taskRunner: TaskRunner;
  private diffCapture: DiffCapture;
  private roleManager: RoleManager;
  private knowledgeGraph: KnowledgeGraph;

  /** Hard limit: max concurrent running agents */
  private static readonly MAX_CONCURRENT_AGENTS = 10;

  constructor(roleManager: RoleManager, knowledgeGraph: KnowledgeGraph) {
    this.roleManager = roleManager;
    this.knowledgeGraph = knowledgeGraph;
    this.taskRunner = new TaskRunner(roleManager, knowledgeGraph);
    this.diffCapture = new DiffCapture();
  }

  /**
   * Count currently running agent tasks
   */
  private getRunningCount(): number {
    let count = 0;
    for (const task of this.tasks.values()) {
      if (task.status === 'running') count++;
    }
    return count;
  }

  /**
   * Create and start a new task
   */
  async createTask(request: CreateTaskRequest): Promise<Task> {
    const task: Task = {
      id: nanoid(12),
      project: request.project,
      title: request.title,
      briefing: request.briefing,
      allowed_files: request.allowed_files,
      blocked_files: request.blocked_files || [],
      verification: request.verification,
      agent: request.agent || 'augment',
      role: request.role,
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      output: [],
    };

    this.tasks.set(task.id, task);

    // GUARDRAIL: Enforce max concurrent agents
    const running = this.getRunningCount();
    if (running >= TaskManager.MAX_CONCURRENT_AGENTS) {
      task.status = 'failed';
      task.error = `Concurrency limit reached (${running}/${TaskManager.MAX_CONCURRENT_AGENTS} agents running). Try again later.`;
      task.updated_at = new Date().toISOString();
      console.warn(`⛔ Task ${task.id} rejected: ${task.error}`);
      return task;
    }

    // Start task execution in background
    this.executeTask(task).catch((error) => {
      console.error(`Task ${task.id} failed:`, error);
      task.status = 'failed';
      task.error = error.message;
      task.updated_at = new Date().toISOString();
    });

    return task;
  }

  /**
   * Execute task (runs in background)
   */
  private async executeTask(task: Task): Promise<void> {
    task.status = 'running';
    task.started_at = new Date().toISOString();
    task.updated_at = new Date().toISOString();

    try {
      // Run the agent
      const result = await this.taskRunner.runTask(task);

      task.output = result.output;
      task.status = 'completed';
      task.completed_at = new Date().toISOString();
      task.updated_at = new Date().toISOString();

      // Capture diff
      let diff = '';
      try {
        diff = await this.diffCapture.captureDiff(task);
      } catch (e) {
        console.warn(`⚠️  Failed to capture diff for task ${task.id}:`, e);
      }
      task.diff = diff;

      // TODO: Run automated review
      task.status = 'completed'; // Changed from 'reviewing' to 'completed' for testing
      task.updated_at = new Date().toISOString();
    } catch (error: any) {
      task.status = 'failed';
      task.error = error.message;
      task.updated_at = new Date().toISOString();
      throw error;
    }
  }

  /**
   * Get task by ID
   */
  async getTask(id: string): Promise<Task | null> {
    return this.tasks.get(id) || null;
  }

  /**
   * Get task diff
   */
  async getTaskDiff(id: string): Promise<string | null> {
    const task = this.tasks.get(id);
    return task?.diff || null;
  }

  /**
   * Approve task and commit changes
   */
  async approveTask(
    id: string,
    request: ApproveRequest
  ): Promise<{ success: boolean; commit_hash?: string }> {
    const task = this.tasks.get(id);

    if (!task) {
      throw new Error('Task not found');
    }

    if (task.status !== 'reviewing' && task.status !== 'completed') {
      throw new Error(`Cannot approve task in status: ${task.status}`);
    }

    // Commit and optionally push
    const commitHash = await this.diffCapture.commitChanges(
      task,
      request.commit_message || task.title
    );

    if (request.push) {
      await this.diffCapture.pushChanges(task);
    }

    task.status = 'approved';
    task.updated_at = new Date().toISOString();

    return { success: true, commit_hash: commitHash };
  }

  /**
   * Reject task with feedback
   */
  async rejectTask(
    id: string,
    request: RejectRequest
  ): Promise<{ success: boolean }> {
    const task = this.tasks.get(id);

    if (!task) {
      throw new Error('Task not found');
    }

    task.status = 'rejected';
    task.updated_at = new Date().toISOString();

    if (request.retry) {
      // TODO: Restart task with feedback
      console.log(`Task ${id} will be retried with feedback: ${request.reason}`);
    }

    return { success: true };
  }

  /**
   * List all tasks
   */
  async listTasks(): Promise<Task[]> {
    return Array.from(this.tasks.values()).sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }
}

