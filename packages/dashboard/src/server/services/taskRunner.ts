import { EventEmitter } from 'events';
import type { Task, TaskStatus, TaskOutputEvent, TaskLifecycleEvent } from '../types';

export interface TaskRunnerEvents {
  'task:output': (event: TaskOutputEvent) => void;
  'task:lifecycle': (event: TaskLifecycleEvent) => void;
}

export declare interface TaskRunner {
  on<U extends keyof TaskRunnerEvents>(event: U, listener: TaskRunnerEvents[U]): this;
  emit<U extends keyof TaskRunnerEvents>(event: U, ...args: Parameters<TaskRunnerEvents[U]>): boolean;
}

export class TaskRunner extends EventEmitter {
  private tasks: Map<string, Task> = new Map();
  private maxAgents: number = 10;

  constructor() {
    super();
  }

  createTask(title: string, description: string, bucket: string): Task {
    const task: Task = {
      id: this.generateId(),
      title,
      description,
      status: 'pending',
      bucket,
      createdAt: new Date().toISOString(),
      output: [],
    };

    this.tasks.set(task.id, task);
    return task;
  }

  getTask(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  updateTaskStatus(taskId: string, status: TaskStatus): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    task.status = status;

    if (status === 'running' && !task.startedAt) {
      task.startedAt = new Date().toISOString();
      this.emit('task:lifecycle', {
        taskId,
        event: 'started',
      });
    } else if (status === 'completed') {
      task.completedAt = new Date().toISOString();
      this.emit('task:lifecycle', {
        taskId,
        event: 'completed',
      });
    } else if (status === 'failed') {
      task.completedAt = new Date().toISOString();
      this.emit('task:lifecycle', {
        taskId,
        event: 'failed',
      });
    }
  }

  addTaskOutput(taskId: string, line: string, stream: 'stdout' | 'stderr' | 'system' = 'stdout'): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    task.output.push(line);

    // Only emit stdout/stderr to WebSocket clients, not system messages
    if (stream !== 'system') {
      this.emit('task:output', {
        taskId,
        line,
        stream,
      });
    }
  }

  getRunningTasksCount(): number {
    return Array.from(this.tasks.values()).filter(t => t.status === 'running').length;
  }

  getTaskStats() {
    const tasks = Array.from(this.tasks.values());
    return {
      total: tasks.length,
      running: tasks.filter(t => t.status === 'running').length,
      completed: tasks.filter(t => t.status === 'completed').length,
      failed: tasks.filter(t => t.status === 'failed').length,
    };
  }

  getMaxAgents(): number {
    return this.maxAgents;
  }

  private generateId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  // Simulate running a task (for demo purposes)
  async runTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    if (task.status !== 'pending') {
      throw new Error(`Task ${taskId} is not in pending state`);
    }

    this.updateTaskStatus(taskId, 'running');

    // Simulate some output
    this.addTaskOutput(taskId, 'Starting task execution...', 'stdout');
    
    // In a real implementation, this would spawn an actual agent process
    // and stream its output through the event emitter
    
    setTimeout(() => {
      this.addTaskOutput(taskId, 'Task processing...', 'stdout');
    }, 1000);

    setTimeout(() => {
      this.addTaskOutput(taskId, 'Task completed successfully', 'stdout');
      this.updateTaskStatus(taskId, 'completed');
    }, 3000);
  }
}

// Global singleton instance
export const taskRunner = new TaskRunner();

