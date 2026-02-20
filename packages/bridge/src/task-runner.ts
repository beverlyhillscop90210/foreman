import { EventEmitter } from 'events';
import type { Task, TaskStatus } from './types.js';

/**
 * TaskRunner manages task execution and emits events
 */
export class TaskRunner extends EventEmitter {
  private runningTasks: Map<string, Task> = new Map();

  /**
   * Start a task
   */
  startTask(task: Task): void {
    this.runningTasks.set(task.id, task);
    this.emit('task:started', task);
  }

  /**
   * Update task status
   */
  updateTaskStatus(taskId: string, status: TaskStatus, data?: Partial<Task>): void {
    const task = this.runningTasks.get(taskId);
    if (task) {
      task.status = status;
      if (data) {
        Object.assign(task, data);
      }
      this.emit('task:updated', task);
    }
  }

  /**
   * Complete a task
   */
  completeTask(taskId: string, result: { status: TaskStatus; qc_result?: any; diff?: string }): void {
    const task = this.runningTasks.get(taskId);
    if (task) {
      task.status = result.status;
      task.completed_at = new Date().toISOString();
      if (result.qc_result) {
        task.qc_result = result.qc_result;
      }
      if (result.diff) {
        task.diff = result.diff;
      }
      this.emit('task:completed', task);
      this.runningTasks.delete(taskId);
    }
  }

  /**
   * Fail a task
   */
  failTask(taskId: string, error: string): void {
    const task = this.runningTasks.get(taskId);
    if (task) {
      task.status = 'failed';
      task.agent_output = error;
      task.completed_at = new Date().toISOString();
      this.emit('task:failed', task);
      this.runningTasks.delete(taskId);
    }
  }

  /**
   * Get running tasks
   */
  getRunningTasks(): Task[] {
    return Array.from(this.runningTasks.values());
  }
}

