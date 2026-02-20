import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { platform } from 'os';
import type { Task, TaskStatus } from './types.js';

/**
 * TaskRunner manages task execution and emits events
 */
export class TaskRunner extends EventEmitter {
  private runningTasks: Map<string, Task> = new Map();
  private taskTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private taskProcesses: Map<string, any> = new Map();
  private readonly TASK_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

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

    if (task.agent === 'claude-code' || task.agent === 'claude') {
      command = 'claude';
      args = ['-p', '--dangerously-skip-permissions', task.briefing || task.description || task.title || ''];
    } else if (task.agent === 'augment' || task.agent === 'augment-agent') {
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

    // Ensure the project directory exists before spawning
    if (!existsSync(projectDir)) {
      try {
        mkdirSync(projectDir, { recursive: true });
        this.emit('task:output', { taskId: task.id, line: `Created project directory: ${projectDir}`, stream: 'system' });
      } catch (err: any) {
        this.emit('task:output', { taskId: task.id, line: `Failed to create project directory: ${err.message}`, stream: 'stderr' });
      }
    }

    // On Linux, claude CLI needs a pseudo-TTY to run in headless mode.
    // Wrap the command with `script -qc` to supply one.
    let spawnCommand: string;
    let spawnArgs: string[];
    const isLinuxClaude = platform() === 'linux' && (command === 'claude');
    
    if (isLinuxClaude) {
      // Build the full command string, properly quoted for the shell
      const escapedArgs = args.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(' ');
      const fullCmd = `${command} ${escapedArgs}`;
      // Pass the whole thing as a single shell command
      spawnCommand = `script -qc ${JSON.stringify(fullCmd)} /dev/null`;
      spawnArgs = [];
      this.emit('task:output', { taskId: task.id, line: `Using pseudo-TTY wrapper for headless execution`, stream: 'system' });
    } else {
      spawnCommand = command;
      spawnArgs = args;
    }

    try {
      const child = spawn(spawnCommand, spawnArgs, {
        cwd: projectDir,
        shell: true,
        env: {
          ...process.env,
          HOME: process.env.HOME || '/home/foreman',
        },
      });

      // Store the child process so we can kill it on timeout
      this.taskProcesses.set(task.id, child);

      // Set a timeout to kill stuck tasks
      const timeout = setTimeout(() => {
        this.emit('task:output', { taskId: task.id, line: `Task timed out after ${this.TASK_TIMEOUT_MS / 60000} minutes. Killing process.`, stream: 'stderr' });
        try { child.kill('SIGKILL'); } catch (_) {}
        this.failTask(task.id, `Task timed out after ${this.TASK_TIMEOUT_MS / 60000} minutes`);
      }, this.TASK_TIMEOUT_MS);
      this.taskTimeouts.set(task.id, timeout);

      child.stdout.on('data', (data) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
          // Strip ANSI escape codes and carriage returns (from pseudo-TTY wrapper)
          const cleaned = line.replace(/\x1b\[[^m]*m|\x1b\[\?[0-9;]*[hl]|\x1b\][^\x07]*\x07|\x1b\[<[^\n]*|\r/g, '').trim();
          if (cleaned) {
            this.emit('task:output', { taskId: task.id, line: cleaned, stream: 'stdout' });
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
        // Clear timeout and process reference
        const t = this.taskTimeouts.get(task.id);
        if (t) { clearTimeout(t); this.taskTimeouts.delete(task.id); }
        this.taskProcesses.delete(task.id);

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

