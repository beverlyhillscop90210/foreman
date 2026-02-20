import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import { join } from 'path';
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
   * Run a task
   */
  async runTask(task: Task): Promise<void> {
    this.startTask(task);
    this.updateTaskStatus(task.id, 'running');

    this.emit('task:output', { taskId: task.id, line: `Starting task execution for ${task.title}...`, stream: 'stdout' });
    
    let command = '';
    let args: string[] = [];

    if (task.agent === 'claude-code') {
      command = 'claude';
      args = ['-p', task.briefing || task.description || task.title || ''];
    } else if (task.agent === 'augment') {
      command = 'augment';
      args = ['run', task.briefing || task.description || task.title || ''];
    } else {
      // Default to a simple echo if no agent is specified or recognized
      command = 'echo';
      args = [`Executing custom task: ${task.title || task.description}`];
    }

    this.emit('task:output', { taskId: task.id, line: `Running command: ${command} ${args.join(' ')}`, stream: 'stdout' });

    const projectsDir = process.env.PROJECTS_DIR || '/home/foreman/projects';
    const projectDir = join(projectsDir, task.project);

    try {
      const child = spawn(command, args, {
        cwd: projectDir,
        shell: true, // Use shell to allow for command resolution
      });

      child.stdout.on('data', (data) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
          if (line.trim()) {
            this.emit('task:output', { taskId: task.id, line, stream: 'stdout' });
          }
        }
      });

      child.stderr.on('data', (data) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
          if (line.trim()) {
            this.emit('task:output', { taskId: task.id, line, stream: 'stderr' });
          }
        }
      });

      child.on('close', (code) => {
        this.emit('task:output', { taskId: task.id, line: `Process exited with code ${code}`, stream: 'stdout' });
        if (code === 0) {
          this.completeTask(task.id, { status: 'completed' });
        } else {
          this.failTask(task.id, `Process exited with code ${code}`);
        }
      });

      child.on('error', (error) => {
        this.emit('task:output', { taskId: task.id, line: `Error: ${error.message}`, stream: 'stderr' });
        this.failTask(task.id, error.message);
      });

    } catch (error: any) {
      this.emit('task:output', { taskId: task.id, line: `Failed to start process: ${error.message}`, stream: 'stderr' });
      this.failTask(task.id, error.message);
    }
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

