/**
 * Scope Enforcer - Validates file access against whitelist/blocklist
 */

import { minimatch } from 'minimatch';
import type { Task, FileCheckResult } from './types.js';

export class ScopeEnforcer {
  private task: Task;

  constructor(task: Task) {
    this.task = task;
  }

  /**
   * Check if a file is allowed to be modified
   */
  check(filePath: string): FileCheckResult {
    // First check blocked patterns - they take precedence
    for (const pattern of this.task.blocked_files || []) {
      if (this.matchesPattern(filePath, pattern)) {
        return {
          allowed: false,
          reason: 'File is explicitly blocked',
          matched_pattern: pattern,
        };
      }
    }

    // Then check allowed patterns
    for (const pattern of this.task.allowed_files || []) {
      if (this.matchesPattern(filePath, pattern)) {
        return {
          allowed: true,
          matched_pattern: pattern,
        };
      }
    }

    // If no patterns matched, file is not allowed
    return {
      allowed: false,
      reason: 'File is not in the allowed list',
    };
  }

  /**
   * Check multiple files at once
   */
  checkMultiple(filePaths: string[]): Map<string, FileCheckResult> {
    const results = new Map<string, FileCheckResult>();
    for (const filePath of filePaths) {
      results.set(filePath, this.check(filePath));
    }
    return results;
  }

  /**
   * Get list of violations from a set of files
   */
  getViolations(filePaths: string[]): string[] {
    const violations: string[] = [];
    for (const filePath of filePaths) {
      const result = this.check(filePath);
      if (!result.allowed) {
        violations.push(filePath);
      }
    }
    return violations;
  }

  /**
   * Match a file path against a glob pattern
   */
  private matchesPattern(filePath: string, pattern: string): boolean {
    return minimatch(filePath, pattern, {
      dot: true,
      matchBase: true,
    });
  }
}

