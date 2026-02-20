import { QCResult } from '../qc';
import { TaskQueue } from './task-queue';
import {
  TaskDefinition,
  CoordinatorConfig,
  CoordinatorState,
  TaskStatus,
} from './types';

/**
 * KanbanCoordinator - Autonomous orchestration module for task lifecycle management
 * 
 * This is the brain that decides what gets worked on, assigns agents, triggers QC,
 * and manages the pipeline. It does NOT spawn agents directly - that's the bridge's job.
 * It PREPARES task definitions and signals readiness.
 */
export class KanbanCoordinator {
  private tasks: Map<string, TaskDefinition>;
  private config: CoordinatorConfig;
  private activeAgents: number;
  private backlogQueue: TaskQueue;

  constructor(config?: Partial<CoordinatorConfig>) {
    this.tasks = new Map();
    this.activeAgents = 0;
    this.backlogQueue = new TaskQueue();
    
    // Default configuration
    this.config = {
      maxConcurrentAgents: config?.maxConcurrentAgents ?? 5,
      defaultMaxTurns: config?.defaultMaxTurns ?? 100,
      defaultAgent: config?.defaultAgent ?? 'augment',
      autoQC: config?.autoQC ?? true,
      autoMergeOnQCPass: config?.autoMergeOnQCPass ?? false,
    };
  }

  /**
   * Add a task to the backlog
   */
  addTask(task: Omit<TaskDefinition, 'id' | 'status' | 'createdAt'>): string {
    const id = this.generateTaskId();
    const newTask: TaskDefinition = {
      ...task,
      id,
      status: 'backlog',
      createdAt: new Date().toISOString(),
    };

    this.tasks.set(id, newTask);
    this.backlogQueue.enqueue(newTask);

    return id;
  }

  /**
   * Process backlog: find next eligible task (no unmet dependencies, priority order)
   * Returns task ID or null if nothing to process
   */
  async processBacklog(): Promise<string | null> {
    // Check if we're at capacity
    if (this.isAtCapacity()) {
      return null;
    }

    // Get next eligible task from queue
    const task = this.backlogQueue.dequeue();
    if (!task) {
      return null;
    }

    // Update task status
    task.status = 'in_progress';
    task.startedAt = new Date().toISOString();
    this.tasks.set(task.id, task);
    this.activeAgents++;

    return task.id;
  }

  /**
   * Called when an agent completes a task
   * Triggers QC automatically if autoQC is true
   */
  async onTaskComplete(taskId: string, _agentOutput: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    // Move to review status
    task.status = 'review';
    task.completedAt = new Date().toISOString();
    this.tasks.set(taskId, task);
    this.activeAgents--;

    // Auto-trigger QC if enabled
    // Note: The actual QC execution happens externally (by the bridge)
    // This just signals that QC should be run
    if (this.config.autoQC) {
      // The bridge will call onQCComplete when QC finishes
    }
  }

  /**
   * Called after QC runs
   * If passed: move to commit_review
   * If failed: move back to backlog with QC feedback appended to briefing
   */
  onQCComplete(taskId: string, qcResult: QCResult): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    task.qcResult = qcResult;

    if (qcResult.passed) {
      // QC passed - move to commit review
      task.status = 'commit_review';
      
      // Auto-merge if enabled
      if (this.config.autoMergeOnQCPass) {
        task.status = 'done';
      }
    } else {
      // QC failed - move back to backlog with feedback
      task.status = 'backlog';
      task.briefing = `${task.briefing}\n\n## QC Feedback (${qcResult.timestamp})\n${qcResult.summary}\n\nFailed checks:\n${
        qcResult.checks
          .filter(c => !c.passed)
          .map(c => `- ${c.name}: ${c.message}`)
          .join('\n')
      }`;
      
      // Clear previous attempt data
      task.startedAt = undefined;
      task.completedAt = undefined;
      task.assignedAgent = undefined;
      
      // Re-enqueue for retry
      this.backlogQueue.enqueue(task);
    }

    this.tasks.set(taskId, task);
  }

  /**
   * Called by Claude to approve and move to done
   */
  async approveTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    if (task.status !== 'commit_review') {
      throw new Error(`Task ${taskId} is not in commit_review status`);
    }

    task.status = 'done';
    this.tasks.set(taskId, task);
  }

  /**
   * Get current state for dashboard display
   */
  getState(): CoordinatorState {
    return {
      tasks: Array.from(this.tasks.values()),
      activeAgents: this.activeAgents,
      maxAgents: this.config.maxConcurrentAgents,
      queueDepth: this.backlogQueue.size(),
    };
  }

  /**
   * Get a specific task by ID
   */
  getTask(taskId: string): TaskDefinition | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Handle sub-agent requests from running agents
   * Returns true if agent was spawned, false if at capacity
   */
  async handleSubAgentRequest(
    parentTaskId: string,
    type: 'scrape' | 'knowledge',
    query: string
  ): Promise<boolean> {
    if (this.isAtCapacity()) {
      return false;
    }

    // Create a sub-task
    const parentTask = this.tasks.get(parentTaskId);
    if (!parentTask) {
      throw new Error(`Parent task ${parentTaskId} not found`);
    }

    this.addTask({
      title: `${type === 'scrape' ? 'Scrape' : 'Knowledge'}: ${query}`,
      briefing: `Sub-agent request from task ${parentTaskId}\nType: ${type}\nQuery: ${query}`,
      project: parentTask.project,
      priority: parentTask.priority,
      allowedFiles: [],
      blockedFiles: [],
      dependencies: [],
    });

    // Immediately process this sub-task
    await this.processBacklog();

    return true;
  }

  /**
   * Check if at capacity
   */
  isAtCapacity(): boolean {
    return this.activeAgents >= this.config.maxConcurrentAgents;
  }

  /**
   * Update configuration
   */
  updateConfig(partial: Partial<CoordinatorConfig>): void {
    this.config = {
      ...this.config,
      ...partial,
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): CoordinatorConfig {
    return { ...this.config };
  }

  /**
   * Update task status manually (for external control)
   */
  updateTaskStatus(taskId: string, status: TaskStatus): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    task.status = status;
    this.tasks.set(taskId, task);

    // Update queue tracking
    this.backlogQueue.updateTask(task);
  }

  /**
   * Generate a unique task ID
   */
  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clear all tasks and reset state
   */
  clear(): void {
    this.tasks.clear();
    this.backlogQueue.clear();
    this.activeAgents = 0;
  }
}
