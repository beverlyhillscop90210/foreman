/**
 * Task Runner - Spawns and manages agent processes
 */

import { spawn } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { Task } from './types.js';
import { ScopeEnforcer } from './scope-enforcer.js';

export class TaskRunner {
  private projectsDir: string;

  constructor() {
    this.projectsDir = process.env.PROJECTS_DIR || '/var/foreman/projects';
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
      case 'claude-code':
        return await this.runClaudeCode(task, projectDir, output, scopeEnforcer);
      case 'augment':
        return await this.runAugment(task, projectDir, output, scopeEnforcer);
      default:
        throw new Error(`Unsupported agent: ${task.agent}`);
    }
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
    return new Promise((resolve, reject) => {
      const briefingPath = join(projectDir, '.foreman', 'briefing.md');

      // TODO: Adjust command based on actual Claude Code CLI interface
      const proc = spawn(
        'claude-code',
        [
          '--task',
          task.title,
          '--briefing',
          briefingPath,
          '--project',
          projectDir,
        ],
        {
          cwd: projectDir,
          env: { ...process.env },
        }
      );

      proc.stdout.on('data', (data) => {
        const line = data.toString();
        output.push(line);
        console.log(`[${task.id}] ${line}`);

        // Check for file modifications
        // TODO: Parse agent output for file changes and validate with scopeEnforcer
      });

      proc.stderr.on('data', (data) => {
        const line = data.toString();
        output.push(`ERROR: ${line}`);
        console.error(`[${task.id}] ERROR: ${line}`);
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve({ output });
        } else {
          reject(new Error(`Agent exited with code ${code}`));
        }
      });

      proc.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Run Augment agent
   */
  private async runAugment(
    task: Task,
    projectDir: string,
    output: string[],
    scopeEnforcer: ScopeEnforcer
  ): Promise<{ output: string[] }> {
    // TODO: Implement Augment integration
    throw new Error('Augment integration not yet implemented');
  }

  /**
   * Generate briefing markdown
   */
  private generateBriefing(task: Task): string {
    return `# ${task.title}

## Task Briefing

${task.briefing}

## File Scope

### Allowed Files
${task.allowed_files.map((f) => `- ${f}`).join('\n')}

${task.blocked_files.length > 0 ? `### Blocked Files\n${task.blocked_files.map((f) => `- ${f}`).join('\n')}` : ''}

${task.verification ? `## Verification\n\n${task.verification}` : ''}

---
*This task is managed by Foreman. Only modify files within the allowed scope.*
`;
  }
}

