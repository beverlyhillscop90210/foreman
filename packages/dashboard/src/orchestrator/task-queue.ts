import { TaskDefinition } from './types';

/**
 * Priority queue for tasks with dependency management
 * - Respects priority: critical > high > medium > low
 * - Within same priority: FIFO (first in, first out)
 * - Only dequeues tasks whose dependencies are all 'done'
 */
export class TaskQueue {
  private queue: TaskDefinition[] = [];
  private taskMap: Map<string, TaskDefinition> = new Map();

  /**
   * Add a task to the queue
   */
  enqueue(task: TaskDefinition): void {
    this.queue.push(task);
    this.taskMap.set(task.id, task);
    this.sort();
  }

  /**
   * Get the next eligible task (highest priority with all dependencies met)
   * Returns null if no eligible tasks
   */
  dequeue(): TaskDefinition | null {
    for (let i = 0; i < this.queue.length; i++) {
      const task = this.queue[i];
      
      // Check if all dependencies are met
      if (this.areDependenciesMet(task)) {
        this.queue.splice(i, 1);
        return task;
      }
    }
    
    return null;
  }

  /**
   * Peek at the next eligible task without removing it
   */
  peek(): TaskDefinition | null {
    for (const task of this.queue) {
      if (this.areDependenciesMet(task)) {
        return task;
      }
    }
    return null;
  }

  /**
   * Get a task by ID (from queue or map)
   */
  getTask(taskId: string): TaskDefinition | undefined {
    return this.taskMap.get(taskId);
  }

  /**
   * Update a task in the map (for tracking completed dependencies)
   */
  updateTask(task: TaskDefinition): void {
    this.taskMap.set(task.id, task);
  }

  /**
   * Remove a task from the queue (if it's still there)
   */
  remove(taskId: string): void {
    const index = this.queue.findIndex(t => t.id === taskId);
    if (index !== -1) {
      this.queue.splice(index, 1);
    }
  }

  /**
   * Get the current queue size
   */
  size(): number {
    return this.queue.length;
  }

  /**
   * Get all tasks in the queue
   */
  getAll(): TaskDefinition[] {
    return [...this.queue];
  }

  /**
   * Check if all dependencies for a task are met
   */
  private areDependenciesMet(task: TaskDefinition): boolean {
    if (!task.dependencies || task.dependencies.length === 0) {
      return true;
    }

    return task.dependencies.every(depId => {
      const depTask = this.taskMap.get(depId);
      return depTask && depTask.status === 'done';
    });
  }

  /**
   * Sort queue by priority (critical > high > medium > low)
   * Within same priority, maintain FIFO order (stable sort)
   */
  private sort(): void {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    
    this.queue.sort((a, b) => {
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      
      // Same priority: maintain FIFO (earlier createdAt comes first)
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }

  /**
   * Clear the entire queue
   */
  clear(): void {
    this.queue = [];
    this.taskMap.clear();
  }
}

