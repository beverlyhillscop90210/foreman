import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { platform } from 'os';
import type { Task, TaskStatus } from './types.js';
import { getRoleSystemPrompt, getRole } from './agent-roles.js';
import { createLogger } from './logger.js';
import { settingsService } from './services/settings.js';
import { deviceTaskQueue } from './services/device-task-queue.js';
import type { DeviceRegistry } from './services/device-registry.js';

const log = createLogger('task-runner');

/**
 * TaskRunner manages task execution and emits events
 */
export class TaskRunner extends EventEmitter {
  private runningTasks: Map<string, Task> = new Map();
  private taskTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private taskProcesses: Map<string, any> = new Map();
  private readonly TASK_TIMEOUT_MS = 120 * 60 * 1000; // 120 minutes
  /** Optional callback to load knowledge context for a task */
  public knowledgeLoader?: (query: string) => Promise<string>;
  /** Device registry reference for Ollama routing */
  public deviceRegistry?: DeviceRegistry;

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
    log.info('Task registered', { taskId: task.id, title: task.title, agent: task.agent });
    this.emit('task:started', task);
  }

  /**
   * Run a task
   */
  async runTask(task: Task): Promise<void> {
    this.startTask(task);
    this.updateTaskStatus(task.id, 'running');

    log.info('Starting task execution', { taskId: task.id, title: task.title, agent: task.agent, project: task.project });
    this.emit('task:output', { taskId: task.id, line: `Starting task execution for ${task.title}...`, stream: 'stdout' });
    
    // Build the enriched prompt (role system prompt + knowledge + briefing)
    const prompt = await this.buildTaskPrompt(task);
    log.debug('Prompt built', { taskId: task.id, promptLength: prompt.length });

    // ── Resolve the model for this task ────────────────────────────
    const roleId: string | undefined = (task as any).role;
    const configuredModel = roleId ? settingsService.getModelForRole(roleId) : null;
    const effectiveModel = configuredModel || (task as any).model || null;

    const modelLabel = effectiveModel || (task.agent === 'claude-code' ? 'claude-code (default)' : task.agent || 'claude-code');
    this.emit('task:output', { taskId: task.id, line: `🎭 Role: ${roleId || 'none'} | 🤖 Model: ${modelLabel}`, stream: 'system' });
    log.info('Resolved model for task', { taskId: task.id, roleId, configuredModel, effectiveModel });

    // ── Route to Ollama device execution if model is ollama:* ───────
    if (effectiveModel?.startsWith('ollama:')) {
      const ollamaModel = effectiveModel.replace(/^ollama:/, '');
      await this.runOllamaDeviceTask(task, ollamaModel, prompt);
      return;
    }

    let command = '';
    let args: string[] = [];

    const isClaude = task.agent === 'claude-code' || task.agent === 'claude' || !effectiveModel || effectiveModel.includes('claude');
    if (isClaude) {
      command = 'claude';
      // If a specific non-ollama model was configured, pass it via --model flag
      if (effectiveModel && !effectiveModel.startsWith('ollama:') && !effectiveModel.includes('claude-code')) {
        args = ['-p', '--verbose', '--output-format', 'stream-json', '--dangerously-skip-permissions', '--model', effectiveModel, prompt];
      } else {
        args = ['-p', '--verbose', '--output-format', 'stream-json', '--dangerously-skip-permissions', prompt];
      }
    } else if (task.agent === 'augment' || task.agent === 'augment-agent') {
      command = 'augment';
      args = ['run', prompt];
    } else {
      // Default to claude
      command = 'claude';
      args = ['-p', '--verbose', '--output-format', 'stream-json', '--dangerously-skip-permissions', prompt];
    }

    log.info('Spawning agent process', { taskId: task.id, command, argsLength: args.length, agent: task.agent, model: effectiveModel });
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
    let useShell = false;
    const isLinuxNonClaude = platform() === 'linux' && !isClaude && (command !== 'echo');
    
    if (isLinuxNonClaude) {
      // Build the full command string, properly quoted for the shell
      const escapedArgs = args.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(' ');
      const fullCmd = `${command} ${escapedArgs}`;
      // Pass the whole thing as a single shell command
      spawnCommand = `script -qc ${JSON.stringify(fullCmd)} /dev/null`;
      spawnArgs = [];
      useShell = true;
      this.emit('task:output', { taskId: task.id, line: `Using pseudo-TTY wrapper for headless execution`, stream: 'system' });
    } else {
      spawnCommand = command;
      spawnArgs = args;
      // IMPORTANT: For Claude CLI, do NOT use shell:true — the prompt contains
      // special chars (parentheses, newlines, etc.) that get interpreted by /bin/sh.
      // With shell:false, Node passes each arg directly as argv without shell parsing.
      useShell = !isClaude;
    }

    try {
      const child = spawn(spawnCommand, spawnArgs, {
        cwd: projectDir,
        shell: useShell,
        // CRITICAL: Use 'ignore' for stdin so Claude CLI doesn't block waiting for input.
        // stdout/stderr remain as pipes so we can capture output.
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          HOME: process.env.HOME || '/home/foreman',
        },
      });

      // Store the child process so we can kill it on timeout
      this.taskProcesses.set(task.id, child);
      log.info('Process spawned', { taskId: task.id, pid: child.pid, cwd: projectDir });

      // Set a timeout to kill stuck tasks
      const timeout = setTimeout(() => {
        log.error('Task timed out, killing process', { taskId: task.id, pid: child.pid, timeoutMin: this.TASK_TIMEOUT_MS / 60000 });
        this.emit('task:output', { taskId: task.id, line: `Task timed out after ${this.TASK_TIMEOUT_MS / 60000} minutes. Killing process.`, stream: 'stderr' });
        try { child.kill('SIGKILL'); } catch (_) {}
        this.failTask(task.id, `Task timed out after ${this.TASK_TIMEOUT_MS / 60000} minutes`);
      }, this.TASK_TIMEOUT_MS);
      this.taskTimeouts.set(task.id, timeout);

      // Buffer for partial JSON lines (stream may split across data events)
      let jsonBuffer = '';

      let stdoutBytes = 0;
      let stderrBytes = 0;
      let lastOutputAt = Date.now();

      // Periodic liveness check — log if no output for 60s
      const livenessInterval = setInterval(() => {
        const silentSec = Math.round((Date.now() - lastOutputAt) / 1000);
        if (silentSec >= 60) {
          log.warn('Task process silent', { taskId: task.id, pid: child.pid, silentSec, stdoutBytes, stderrBytes });
        }
      }, 60_000);

      child.stdout.on('data', (data) => {
        stdoutBytes += data.length;
        lastOutputAt = Date.now();
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
        stderrBytes += data.length;
        lastOutputAt = Date.now();
        const lines = data.toString().split('\n');
        for (const line of lines) {
          if (line.trim()) {
            log.debug('stderr', { taskId: task.id, line: line.trim().slice(0, 200) });
            this.emit('task:output', { taskId: task.id, line, stream: 'stderr' });
          }
        }
      });

      child.on('close', (code) => {
        // Clear timeout, liveness interval, and process reference
        clearInterval(livenessInterval);
        const t = this.taskTimeouts.get(task.id);
        if (t) { clearTimeout(t); this.taskTimeouts.delete(task.id); }
        this.taskProcesses.delete(task.id);

        const durationSec = Math.round((Date.now() - (Date.parse(task.started_at || '') || Date.now())) / 1000);
        log.info('Process exited', { taskId: task.id, pid: child.pid, code, durationSec, stdoutBytes, stderrBytes });
        this.emit('task:output', { taskId: task.id, line: `Process exited with code ${code}`, stream: 'stdout' });
        if (code === 0) {
          this.completeTask(task.id, { status: 'completed' });
        } else {
          this.failTask(task.id, `Process exited with code ${code}`);
        }
      });

      child.on('error', (error) => {
        clearInterval(livenessInterval);
        log.error('Process error', { taskId: task.id, pid: child.pid, error: error.message });
        this.emit('task:output', { taskId: task.id, line: `Error: ${error.message}`, stream: 'stderr' });
        this.failTask(task.id, error.message);
      });

    } catch (error: any) {
      log.error('Failed to start process', { taskId: task.id, error: error.message, stack: error.stack });
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
      log.info('Task completed', { taskId, title: task.title });
      this.emit('task:completed', task);
      this.runningTasks.delete(taskId);
    } else {
      log.warn('completeTask called for unknown task', { taskId });
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
      log.error('Task failed', { taskId, title: task.title, error });
      this.emit('task:failed', task);
      this.runningTasks.delete(taskId);
    } else {
      log.warn('failTask called for unknown task', { taskId });
    }
  }

  /**
   * Execute a task on a connected device via Ollama
   * Dispatches to the device task queue; the device polls and runs it locally.
   */
  private async runOllamaDeviceTask(task: Task, ollamaModel: string, prompt: string): Promise<void> {
    // Find a device that has this model in its Ollama capabilities
    let deviceId: string | null = null;
    let deviceName: string = 'unknown';

    if (!this.deviceRegistry) {
      this.emit('task:output', { taskId: task.id, line: `❌ Device registry not available for Ollama routing`, stream: 'stderr' });
      this.failTask(task.id, 'Device registry not configured in TaskRunner');
      return;
    }

    const onlineDevices = this.deviceRegistry.getOnlineDevices();
    for (const device of onlineDevices) {
      const models: string[] = device.capabilities?.ollama?.models ?? [];
      if (models.includes(ollamaModel)) {
        deviceId = device.id;
        deviceName = device.name;
        break;
      }
    }

    if (!deviceId) {
      const allDevices = this.deviceRegistry.listDevices();
      for (const device of allDevices) {
        const models: string[] = device.capabilities?.ollama?.models ?? [];
        if (models.includes(ollamaModel)) {
          deviceId = device.id;
          deviceName = device.name;
          break;
        }
      }
      if (deviceId) {
        this.emit('task:output', { taskId: task.id, line: `⚠️  Device "${deviceName}" has model ${ollamaModel} but is OFFLINE. Waiting for it to reconnect...`, stream: 'stderr' });
      } else {
        const available = this.deviceRegistry.getOnlineDevices().flatMap((d: any) => d.capabilities?.ollama?.models ?? []).join(', ') || 'none';
        this.emit('task:output', { taskId: task.id, line: `❌ No device found with Ollama model "${ollamaModel}". Available models: ${available}`, stream: 'stderr' });
        this.failTask(task.id, `No device with Ollama model "${ollamaModel}" is available`);
        return;
      }
    }

    this.emit('task:output', { taskId: task.id, line: `📡 Dispatching to device "${deviceName}" via Ollama model: ${ollamaModel}`, stream: 'system' });
    this.emit('task:output', { taskId: task.id, line: `⏳ Waiting for device to pick up task... (ensure heartbeat script is running)`, stream: 'system' });

    // Enqueue the device task
    const dt = deviceTaskQueue.enqueue({ taskId: task.id, deviceId: deviceId!, model: ollamaModel, prompt });

    // Stream output chunks as they arrive
    const onChunk = (evt: { dtId: string; taskId: string; chunk: string }) => {
      if (evt.dtId === dt.id) {
        this.emit('task:output', { taskId: task.id, line: evt.chunk, stream: 'stdout' });
      }
    };
    deviceTaskQueue.on('task:chunk', onChunk);

    try {
      const completed = await deviceTaskQueue.waitForCompletion(dt.id, 15 * 60 * 1000);
      deviceTaskQueue.off('task:chunk', onChunk);

      if (completed.output) {
        // Final output already streamed via chunks — just mark done
        this.emit('task:output', { taskId: task.id, line: `✅ Ollama task completed on device "${deviceName}"`, stream: 'system' });
      }

      task.agent_output = completed.output || '';
      this.completeTask(task.id, { status: 'completed' });
    } catch (err: any) {
      deviceTaskQueue.off('task:chunk', onChunk);
      this.emit('task:output', { taskId: task.id, line: `❌ Ollama task failed: ${err.message}`, stream: 'stderr' });
      this.failTask(task.id, err.message);
    }
  }

  /**
   * Get running tasks
   */
  getRunningTasks(): Task[] {
    return Array.from(this.runningTasks.values());
  }
}

