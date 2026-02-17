/**
 * Configuration file reader/writer for .foreman.json
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { ForemanConfig, ActiveTask } from './types.js';

const CONFIG_FILENAME = '.foreman.json';

export class ConfigManager {
  private configPath: string;

  constructor(projectRoot: string = process.cwd()) {
    this.configPath = join(projectRoot, CONFIG_FILENAME);
  }

  /**
   * Check if .foreman.json exists
   */
  exists(): boolean {
    return existsSync(this.configPath);
  }

  /**
   * Read and parse .foreman.json
   */
  read(): ForemanConfig {
    if (!this.exists()) {
      throw new Error(
        `.foreman.json not found. Run 'foreman init' to create one.`
      );
    }

    try {
      const content = readFileSync(this.configPath, 'utf-8');
      return JSON.parse(content) as ForemanConfig;
    } catch (error) {
      throw new Error(
        `Failed to parse .foreman.json: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Write config to .foreman.json
   */
  write(config: ForemanConfig): void {
    try {
      const content = JSON.stringify(config, null, 2);
      writeFileSync(this.configPath, content, 'utf-8');
    } catch (error) {
      throw new Error(
        `Failed to write .foreman.json: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Create initial .foreman.json
   */
  init(projectName: string): ForemanConfig {
    if (this.exists()) {
      throw new Error('.foreman.json already exists');
    }

    const config: ForemanConfig = {
      project: projectName,
      review_model: 'claude-opus-4-20250514',
      architecture: {},
      active_task: null,
      known_good_states: {},
    };

    this.write(config);
    return config;
  }

  /**
   * Set active task
   */
  setActiveTask(task: ActiveTask): void {
    const config = this.read();
    config.active_task = {
      ...task,
      created_at: new Date().toISOString(),
    };
    this.write(config);
  }

  /**
   * Clear active task
   */
  clearActiveTask(): void {
    const config = this.read();
    config.active_task = null;
    this.write(config);
  }

  /**
   * Get active task
   */
  getActiveTask(): ActiveTask | null {
    const config = this.read();
    return config.active_task;
  }

  /**
   * Update architecture description
   */
  updateArchitecture(path: string, description: string): void {
    const config = this.read();
    config.architecture[path] = description;
    this.write(config);
  }

  /**
   * Save known good state
   */
  saveKnownGoodState(name: string, commitHash: string): void {
    const config = this.read();
    config.known_good_states[name] = commitHash;
    this.write(config);
  }
}

