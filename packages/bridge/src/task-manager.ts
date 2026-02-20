import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { randomBytes } from "crypto";
import type { Task, TaskStatus } from "./types.js";

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
        console.log(`Loaded ${this.tasks.length} tasks from ${this.tasksFile}`);
      } else {
        this.tasks = [];
        this.saveTasks();
      }
    } catch (e) {
      console.error("Failed to load tasks:", e);
      this.tasks = [];
    }
  }

  private saveTasks(): void {
    try {
      writeFileSync(this.tasksFile, JSON.stringify(this.tasks, null, 2));
    } catch (e) {
      console.error("Failed to save tasks:", e);
    }
  }

  private generateId(): string {
    return randomBytes(8).toString("base64url");
  }

  async createTask(body: {
    project: string;
    title?: string;
    description: string;
    briefing?: string;
    agent?: string;
    allowed_files?: string[];
    blocked_files?: string[];
    verification?: string;
  }): Promise<Task> {
    const task: Task = {
      id: this.generateId(),
      title: body.title,
      project: body.project,
      description: body.description || body.briefing || '',
      status: "pending",
      created_at: new Date().toISOString(),
      allowed_files: body.allowed_files || [],
      blocked_files: body.blocked_files || [],
    };
    this.tasks.push(task);
    this.saveTasks();
    console.log(`Created task ${task.id}: ${body.title}`);
    return task;
  }

  getTasks(): Task[] {
    return this.tasks;
  }

  listTasks(): Task[] {
    return this.tasks;
  }

  getTask(id: string): Task | undefined {
    return this.tasks.find((t) => t.id === id);
  }

  updateTaskStatus(id: string, status: TaskStatus, data?: Partial<Task>): void {
    const task = this.tasks.find((t) => t.id === id);
    if (task) {
      task.status = status;
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
}
