import { KanbanCoordinator } from './coordinator';
import { runQC } from '../qc/qc-runner';
import { buildAgentBriefing } from '../templates/briefing-template';
import { CoordinatorConfig } from './types';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * The Pipeline class wires together:
 * - KanbanCoordinator (task lifecycle)
 * - QC Agent (post-task verification)  
 * - System Prompt (agent context)
 * - MANIFEST.md (project structure)
 * 
 * Flow:
 * 1. Task added to coordinator backlog
 * 2. Coordinator picks next task based on priority + dependencies
 * 3. Pipeline builds full briefing (system prompt + manifest + task briefing)
 * 4. Bridge spawns agent with the full briefing
 * 5. Agent completes → Pipeline triggers QC
 * 6. QC passes → task moves to commit_review
 * 7. QC fails → task moves back to backlog with feedback
 * 8. Claude approves → merge to master → build → deploy
 */
export class Pipeline {
  private coordinator: KanbanCoordinator;
  private projectDir: string;
  
  constructor(projectDir: string, config?: Partial<CoordinatorConfig>) {
    this.projectDir = projectDir;
    this.coordinator = new KanbanCoordinator(config);
  }
  
  /**
   * Prepare a task for agent execution
   * Returns the full briefing string including system prompt + manifest
   */
  async prepareTask(taskId: string): Promise<{
    briefing: string;
    branch: string;
    allowedFiles: string[];
    blockedFiles: string[];
  } | null> {
    // 1. Get task from coordinator
    const task = this.coordinator.getTask(taskId);
    if (!task) {
      return null;
    }

    // 2. Read AGENT_SYSTEM_PROMPT.md
    const systemPromptPath = join(this.projectDir, 'AGENT_SYSTEM_PROMPT.md');
    let systemPrompt = '';
    if (existsSync(systemPromptPath)) {
      systemPrompt = readFileSync(systemPromptPath, 'utf-8');
    }

    // 3. Read MANIFEST.md if exists
    const manifestPath = join(this.projectDir, 'MANIFEST.md');
    let projectManifest: string | undefined;
    if (existsSync(manifestPath)) {
      projectManifest = readFileSync(manifestPath, 'utf-8');
    }

    // 4. Generate branch name if not already set
    const branch = task.branch || `foreman/${taskId}`;

    // 5. Build full briefing with buildAgentBriefing()
    const briefing = buildAgentBriefing({
      systemPrompt,
      taskBriefing: task.briefing,
      projectManifest,
      branch,
      allowedFiles: task.allowedFiles,
      blockedFiles: task.blockedFiles,
    });

    // 6. Return everything the bridge needs to spawn an agent
    return {
      briefing,
      branch,
      allowedFiles: task.allowedFiles,
      blockedFiles: task.blockedFiles,
    };
  }
  
  /**
   * Called when agent finishes
   */
  async onAgentComplete(taskId: string, output: string): Promise<{
    qcPassed: boolean;
    qcResult: any;
    nextAction: 'commit_review' | 'retry' | 'failed';
  }> {
    // 1. Notify coordinator
    await this.coordinator.onTaskComplete(taskId, output);

    // 2. Get task to find branch name
    const task = this.coordinator.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const branch = task.branch || `foreman/${taskId}`;

    // 3. Run QC
    const qcResult = await runQC(this.projectDir, branch);

    // 4. Handle result
    this.coordinator.onQCComplete(taskId, qcResult);

    // 5. Return what happened
    const nextAction = qcResult.passed ? 'commit_review' : 'retry';
    
    return {
      qcPassed: qcResult.passed,
      qcResult,
      nextAction,
    };
  }
  
  /**
   * Process next task from backlog
   */
  async tick(): Promise<string | null> {
    return this.coordinator.processBacklog();
  }
  
  /**
   * Get full pipeline state for dashboard
   */
  getState() {
    return this.coordinator.getState();
  }

  /**
   * Get the coordinator instance for direct access
   */
  getCoordinator(): KanbanCoordinator {
    return this.coordinator;
  }
}

