import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { platform } from 'os';
import type { Task, TaskStatus } from './types.js';
import { getRoleSystemPrompt, getRole } from './agent-roles.js';

/**
 * TaskRunner manages task execution and emits events
 */
export class TaskRunner extends EventEmitter {
  private runningTasks: Map<string, Task> = new Map();
  private taskTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private taskProcesses: Map<string, any> = new Map();
  private readonly TASK_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
  /** Optional callback to load knowledge context for a task */
  public knowledgeLoader?: (query: string) => Promise<string>;

  /**
   * Parse a stream-json event from Claude CLI into a human-readable line.
   * Returns null if the event should be suppressed.
   */
  private parseStreamEvent(evt: any): string | null {
    switch (evt.type) {
      case 'system':
        return `⚙️ Agent started (model: ${evt.model || 'unknown'}, tools: ${(evt.tools || []).length})`;

      case 'assistant': {
        const msg = evt.message;
        if (!msg?.content) return null;
        const parts: string[] = [];
        for (const block of msg.content) {
          if (block.type === 'text' && block.text) {
            // Truncate long text blocks for the live feed
            const text = block.text.length > 500 ? block.text.slice(0, 500) + '...' : block.text;
            parts.push(text);
          } else if (block.type === 'tool_use') {
            const name = block.name || 'unknown_tool';
            if (name === 'Write' || name === 'Edit') {
              const file = block.input?.file_path || block.input?.filePath || '';
              parts.push(`📝 ${name}: ${file}`);
            } else if (name === 'Bash') {
              const cmd = (block.input?.command || '').slice(0, 200);
              parts.push(`🖥️ Bash: ${cmd}`);
            } else if (name === 'Read') {
              const file = block.input?.file_path || block.input?.filePath || '';
              parts.push(`📖 Read: ${file}`);
            } else if (name === 'Glob' || name === 'Grep') {
              parts.push(`🔍 ${name}: ${block.input?.pattern || block.input?.query || ''}`);
            } else if (name === 'WebSearch' || name === 'WebFetch') {
              parts.push(`🌐 ${name}: ${block.input?.query || block.input?.url || ''}`);
            } else {
              parts.push(`🔧 ${name}`);
            }
          }
        }
        return parts.length > 0 ? parts.join('\n') : null;
      }

      case 'tool_result': {
        // Brief summary of tool result
        if (evt.is_error) {
          return `❌ Tool error: ${(evt.content || '').slice(0, 200)}`;
        }
        return null; // Suppress success results (too verbose)
      }

      case 'result': {
        const r = evt.result || '';
        const cost = evt.total_cost_usd ? `$${evt.total_cost_usd.toFixed(4)}` : '';
        const turns = evt.num_turns || 0;
        const duration = evt.duration_ms ? `${(evt.duration_ms / 1000).toFixed(1)}s` : '';
        return `✅ Agent finished (${turns} turns, ${duration}, ${cost}): ${typeof r === 'string' ? r.slice(0, 300) : 'done'}`;
      }

      default:
        return null;
    }
  }

  /**
   * Build a role-enriched prompt for the task.
   * Prepends the role system prompt and any relevant knowledge.
   */
  private async buildTaskPrompt(task: Task): Promise<string> {
    const parts: string[] = [];

    // Inject role system prompt
    const roleId = (task as any).role;
    if (roleId) {
      const sysPrompt = getRoleSystemPrompt(roleId);
      if (sysPrompt) {
        parts.push(`## Role Instructions\n${sysPrompt}`);
      }
      const role = getRole(roleId);
      if (role) {
        this.emit('task:output', { taskId: task.id, line: `Agent role: ${role.name} (${role.id})`, stream: 'system' });
      }
    }

    // Load relevant knowledge
    if (this.knowledgeLoader) {
      try {
        const searchQuery = task.briefing || task.description || task.title || '';
        const knowledge = await this.knowledgeLoader(searchQuery);
        if (knowledge) {
          parts.push(`## Project Knowledge\n${knowledge}`);
        }
      } catch (err: any) {
        this.emit('task:output', { taskId: task.id, line: `Knowledge load failed: ${err.message}`, stream: 'system' });
      }
    }

    // The actual task briefing
    const briefing = task.briefing || task.description || task.title || '';
    parts.push(`## Task\n${briefing}`);

    // File scope
    const allowed = task.allowed_files?.length ? task.allowed_files.join(', ') : '**/*';
    const blocked = task.blocked_files?.length ? task.blocked_files.join(', ') : 'None';
    parts.push(`## File Scope\nAllowed: ${allowed}\nBlocked: ${blocked}`);

    return parts.join('\n\n');
  }

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
    
    // Build the enriched prompt (role system prompt + knowledge + briefing)
    const prompt = await this.buildTaskPrompt(task);

    let command = '';
    let args: string[] = [];

    const isClaude = task.agent === 'claude-code' || task.agent === 'claude';
    if (isClaude) {
      command = 'claude';
      args = ['-p', '--verbose', '--output-format', 'stream-json', '--dangerously-skip-permissions', prompt];
    } else if (task.agent === 'augment' || task.agent === 'augment-agent') {
      command = 'augment';
      args = ['run', prompt];
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

    // On Linux, non-Claude CLI agents may need a pseudo-TTY.
    // Claude with --output-format stream-json doesn't need it (print mode works headless).
    let spawnCommand: string;
    let spawnArgs: string[];
    const isLinuxNonClaude = platform() === 'linux' && !isClaude && (command !== 'echo');
    
    if (isLinuxNonClaude) {
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

      // Buffer for partial JSON lines (stream may split across data events)
      let jsonBuffer = '';

      child.stdout.on('data', (data) => {
        if (isClaude) {
          // Parse NDJSON stream from claude --output-format stream-json
          jsonBuffer += data.toString();
          const lines = jsonBuffer.split('\n');
          jsonBuffer = lines.pop() || ''; // Keep incomplete last line in buffer
          for (const rawLine of lines) {
            const trimmed = rawLine.trim();
            if (!trimmed) continue;
            try {
              const evt = JSON.parse(trimmed);
              const output = this.parseStreamEvent(evt);
              if (output) {
                this.emit('task:output', { taskId: task.id, line: output, stream: 'stdout' });
              }
            } catch {
              // Not valid JSON — emit raw (stripped of ANSI)
              const cleaned = trimmed.replace(/\x1b\[[^m]*m|\r/g, '').trim();
              if (cleaned) {
                this.emit('task:output', { taskId: task.id, line: cleaned, stream: 'stdout' });
              }
            }
          }
        } else {
          // Non-Claude agents: raw line output
          const lines = data.toString().split('\n');
          for (const line of lines) {
            const cleaned = line.replace(/\x1b\[[^m]*m|\x1b\[\?[0-9;]*[hl]|\x1b\][^\x07]*\x07|\x1b\[<[^\n]*|\r/g, '').trim();
            if (cleaned) {
              this.emit('task:output', { taskId: task.id, line: cleaned, stream: 'stdout' });
            }
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

