import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { randomBytes } from "crypto";
import type { Task, TaskStatus } from "./types.js";
import { createLogger } from './logger.js';

const log = createLogger('task-mgr');

export class TaskManager {
  private tasksFile: string;
  private projectsDir: string;
  private tasks: Task[] = [];

  constructor() {
    this.tasksFile = process.env.TASKS_FILE || "/home/foreman/tasks.json";
    this.projectsDir = process.env.PROJECTS_DIR || "/home/foreman/projects";
    this.loadTasks();
  }

  private loadTasks(): void {
    try {
      if (existsSync(this.tasksFile)) {
        const data = readFileSync(this.tasksFile, "utf-8");
        this.tasks = JSON.parse(data);
        log.info('Tasks loaded', { count: this.tasks.length, file: this.tasksFile });
      } else {
        this.tasks = [];
        this.saveTasks();
      }
    } catch (e) {
      log.error('Failed to load tasks', { error: (e as Error).message });
      this.tasks = [];
    }
  }

  private saveTasks(): void {
    try {
      writeFileSync(this.tasksFile, JSON.stringify(this.tasks, null, 2));
    } catch (e) {
      log.error('Failed to save tasks', { error: (e as Error).message });
    }
  }

  private generateId(): string {
    return randomBytes(8).toString("base64url");
  }

  async createTask(body: {
    user_id: string;
    project: string;
    title?: string;
    description: string;
    briefing?: string;
    agent?: string;
    role?: string;
    allowed_files?: string[];
    blocked_files?: string[];
    verification?: string;
  }): Promise<Task> {
    const task: Task = {
      id: this.generateId(),
      user_id: body.user_id,
      title: body.title,
      project: body.project,
      description: body.description || body.briefing || '',
      briefing: body.briefing || body.description || '',
      agent: body.agent || 'claude-code',
      status: "pending",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      allowed_files: body.allowed_files || [],
      blocked_files: body.blocked_files || [],
    };
    // Store role on the task object for TaskRunner prompt building
    if (body.role) (task as any).role = body.role;
    this.tasks.push(task);
    this.saveTasks();
    log.info('Task created', { taskId: task.id, title: body.title, project: body.project, agent: body.agent, userId: body.user_id });
    return task;
  }

  getTasks(): Task[] {
    return this.tasks;
  }

  listTasks(userId?: string): Task[] {
    if (!userId) {
      return this.tasks;
    }
    return this.tasks.filter((t) => t.user_id === userId);
  }

  getTask(id: string, userId?: string): Task | undefined {
    const task = this.tasks.find((t) => t.id === id);
    if (!task) return undefined;

    // If userId is provided, verify ownership
    if (userId && task.user_id !== userId) {
      return undefined;
    }

    return task;
  }

  updateTaskStatus(id: string, status: TaskStatus, data?: Partial<Task>): void {
    const task = this.tasks.find((t) => t.id === id);
    if (task) {
      task.status = status;
      task.updated_at = new Date().toISOString();
      if (data) {
        Object.assign(task, data);
      }
      this.saveTasks();
    }
  }

  async getTaskDiff(id: string): Promise<string | null> {
    const task = this.tasks.find((t) => t.id === id);
    if (!task) return null;
    return task.diff || null;
  }

  async approveTask(id: string, body?: { push?: boolean }): Promise<{ success: boolean; message: string }> {
    const task = this.tasks.find((t) => t.id === id);
    if (!task) return { success: false, message: "Task not found" };
    task.status = "completed";
    task.completed_at = new Date().toISOString();
    this.saveTasks();
    return { success: true, message: `Task ${id} approved` };
  }

  async rejectTask(id: string, body?: { feedback?: string; retry?: boolean }): Promise<{ success: boolean; message: string }> {
    const task = this.tasks.find((t) => t.id === id);
    if (!task) return { success: false, message: "Task not found" };
    task.status = "failed";
    task.agent_output = body?.feedback || "Rejected";
    this.saveTasks();
    return { success: true, message: `Task ${id} rejected` };
  }

  deleteTask(id: string): boolean {
    const idx = this.tasks.findIndex((t) => t.id === id);
    if (idx === -1) return false;
    this.tasks.splice(idx, 1);
    this.saveTasks();
    log.info('Task deleted', { taskId: id });
    return true;
  }

  deleteAllTasks(): number {
    const count = this.tasks.length;
    this.tasks = [];
    this.saveTasks();
    log.info('All tasks deleted', { count });
    return count;
  }
}
