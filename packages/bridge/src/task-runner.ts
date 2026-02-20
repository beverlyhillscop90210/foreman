/**
 * Task Runner - Spawns and manages agent processes
 * 
 * Supports auggie (Augment CLI) and claude-code as agent backends.
 * Default agent: auggie
 */

import { spawn, type ChildProcess } from 'child_process';
import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import type { Task } from './types.js';
import { ScopeEnforcer } from './scope-enforcer.js';
import { RoleManager } from './role-manager.js';

export class TaskRunner {
  private projectsDir: string;
  private augmentSessionAuth: string;
  private roleManager: RoleManager;

  constructor(roleManager: RoleManager) {
    this.roleManager = roleManager;
    this.projectsDir = process.env.PROJECTS_DIR || '/home/foreman/projects';

    // Load Augment session - prefer env var, fall back to session.json
    if (process.env.AUGMENT_SESSION_AUTH) {
      this.augmentSessionAuth = process.env.AUGMENT_SESSION_AUTH;
    } else {
      try {
        const sessionPath = process.env.AUGMENT_SESSION_FILE
          || join(process.env.HOME || '/home/foreman', '.augment', 'session.json');
        this.augmentSessionAuth = readFileSync(sessionPath, 'utf-8').trim();
      } catch {
        this.augmentSessionAuth = '';
        console.warn('⚠️  No Augment session found. Augment agent will not work.');
      }
    }
  }

  /**
   * Run a task with the specified agent
   */
  async runTask(task: Task): Promise<{ output: string[] }> {
    const output: string[] = [];

    // Get project directory
    const projectDir = join(this.projectsDir, task.project);

    // Create briefing file
    const briefingPath = join(projectDir, '.foreman', 'briefing.md');
    mkdirSync(join(projectDir, '.foreman'), { recursive: true });
    writeFileSync(briefingPath, this.generateBriefing(task), 'utf-8');

    // Initialize scope enforcer
    const scopeEnforcer = new ScopeEnforcer(task);

    // Spawn agent based on type
    switch (task.agent) {
      case 'augment':
        return await this.runAugment(task, projectDir, output, scopeEnforcer);
      case 'claude-code':
        return await this.runClaudeCode(task, projectDir, output, scopeEnforcer);
      default:
        throw new Error(`Unsupported agent: ${task.agent}`);
    }
  }

  /**
   * Spawn an agent process and collect output
   */
  private spawnAgent(
    command: string,
    args: string[],
    projectDir: string,
    env: Record<string, string>,
    task: Task,
    output: string[]
  ): Promise<{ output: string[] }> {
    return new Promise((resolve, reject) => {
      console.log(`[${task.id}] Spawning: ${command} ${args.join(' ')}`);
      console.log(`[${task.id}] CWD: ${projectDir}`);

      const proc: ChildProcess = spawn(command, args, {
        cwd: projectDir,
        env: { ...process.env, ...env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stderrBuffer = '';

      proc.stdout?.on('data', (data) => {
        const lines = data.toString().split('\n').filter((l: string) => l.trim());
        for (const line of lines) {
          output.push(line);
          console.log(`[${task.id}] ${line}`);
        }
      });

      proc.stderr?.on('data', (data) => {
        const text = data.toString();
        stderrBuffer += text;
        // Only log real errors, not progress/warnings
        const lines = text.split('\n').filter((l: string) => l.trim());
        for (const line of lines) {
          // Skip known non-error auggie output
          if (line.includes('Warning: Indexing') || line.includes('Request ID:')) continue;
          output.push(`STDERR: ${line}`);
          console.error(`[${task.id}] STDERR: ${line}`);
        }
      });

      proc.on('close', (code) => {
        console.log(`[${task.id}] Agent exited with code ${code}`);
        if (code === 0) {
          resolve({ output });
        } else {
          // Include stderr in error for debugging
          const errMsg = stderrBuffer.trim().slice(-500) || `Agent exited with code ${code}`;
          reject(new Error(errMsg));
        }
      });

      proc.on('error', (error) => {
        console.error(`[${task.id}] Spawn error:`, error);
        reject(error);
      });
    });
  }

  /**
   * Run Augment agent (auggie CLI)
   * 
   * Uses auggie in --print mode for one-shot task execution.
   * The agent gets full tool access (file read/write, bash, etc.)
   */
  private async runAugment(
    task: Task,
    projectDir: string,
    output: string[],
    scopeEnforcer: ScopeEnforcer
  ): Promise<{ output: string[] }> {
    if (!this.augmentSessionAuth) {
      throw new Error('Augment session not configured. Set AUGMENT_SESSION_AUTH env var.');
    }

    const instruction = this.generateInstruction(task);
    const briefingPath = join(projectDir, '.foreman', 'briefing.md');

    // Build auggie args
    const args: string[] = [
      '--print',                          // One-shot mode, no interactive prompt
      '--workspace-root', projectDir,     // Set project root
      '--instruction-file', briefingPath, // Full briefing as instruction
      '--output-format', 'json',          // Structured output for parsing
    ];

    // No --quiet flag: we want full output for live streaming to dashboard
    // Max turns: default 100, override with env var
    const maxTurns = parseInt(process.env.AUGMENT_MAX_TURNS || '100', 10);
    args.push('--max-turns', maxTurns.toString());

    // Add rules file if it exists in the project
    // TODO: Support custom rules per project

    const env: Record<string, string> = {
      AUGMENT_SESSION_AUTH: this.augmentSessionAuth,
    };

    return this.spawnAgent('auggie', args, projectDir, env, task, output);
  }

  /**
   * Run Claude Code CLI
   */
  private async runClaudeCode(
    task: Task,
    projectDir: string,
    output: string[],
    scopeEnforcer: ScopeEnforcer
  ): Promise<{ output: string[] }> {
    const briefingPath = join(projectDir, '.foreman', 'briefing.md');

    const args: string[] = [
      '--print',
      '--output-format', 'json',
      '--max-turns', process.env.CLAUDE_CODE_MAX_TURNS || '25',
    ];

    const env: Record<string, string> = {};

    // Claude Code reads instruction from positional arg or stdin
    args.push(this.generateInstruction(task));

    return this.spawnAgent('claude', args, projectDir, env, task, output);
  }

  /**
   * Generate the full instruction string for the agent
   */
  private generateInstruction(task: Task): string {
    const role = task.role ? this.roleManager.getRole(task.role) : undefined;
    const systemPrompt = role ? role.system_prompt : 'You are a helpful AI coding assistant.';

    return [
      `# Role: ${role ? role.id : 'default'}`,
      systemPrompt,
      '',
      `# Task: ${task.title}`,
      '',
      task.briefing,
      '',
      '## File Scope Rules (STRICT)',
      '',
      '### Allowed Files (you may ONLY modify these):',
      ...task.allowed_files.map((f) => `- ${f}`),
      '',
      ...(task.blocked_files.length > 0
        ? [
            '### Blocked Files (NEVER touch these):',
            ...task.blocked_files.map((f) => `- ${f}`),
            '',
          ]
        : []),
      ...(task.verification
        ? ['## Verification', '', task.verification, '']
        : []),
      '---',
      '*This task is managed by Foreman. Only modify files within the allowed scope.*',
      '*When done, provide a clear summary of all changes made.*',
    ].join('\n');
  }

  /**
   * Generate briefing markdown (saved to disk for --instruction-file)
   */
  private generateBriefing(task: Task): string {
    return this.generateInstruction(task);
  }
}

