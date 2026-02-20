import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';
import { RiskTierConfig } from './types.js';

export class RiskManager {
  private configDir: string;
  private config: RiskTierConfig;

  constructor() {
    this.configDir = process.env.CONFIG_DIR || join(process.env.HOME || '/home/foreman', 'config');
    this.config = this.loadConfig();
  }

  /**
   * Load risk tier configuration from YAML
   */
  private loadConfig(): RiskTierConfig {
    const configPath = join(this.configDir, 'risk-tiers.yaml');
    
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, 'utf-8');
        return parse(content) as RiskTierConfig;
      } catch (error) {
        console.error(`❌ Failed to load risk tiers from ${configPath}:`, error);
      }
    }

    // Fallback default configuration
    return {
      rules: {
        critical: ['**/auth/**', '**/payment/**', 'db/schema.*'],
        high: ['**/api/**', 'lib/tools/**'],
        medium: ['**/components/**'],
        low: ['**']
      },
      gates: {
        critical: {
          required_checks: ['security_audit', 'code_review', 'integration_test', 'manual_approve'],
          auto_approve: false
        },
        high: {
          required_checks: ['code_review', 'integration_test'],
          auto_approve: false
        },
        medium: {
          required_checks: ['code_review'],
          auto_approve: true
        },
        low: {
          required_checks: [],
          auto_approve: true
        }
      }
    };
  }

  /**
   * Determine the risk tier for a set of files
   */
  determineRiskTier(files: string[]): 'low' | 'medium' | 'high' | 'critical' {
    // Simple glob matching logic (in a real app, use a proper glob library like minimatch)
    const matchGlob = (file: string, pattern: string) => {
      // Very basic glob to regex conversion for demonstration
      const regexStr = pattern
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*')
        .replace(/\./g, '\\.');
      return new RegExp(`^${regexStr}$`).test(file);
    };

    for (const file of files) {
      if (this.config.rules.critical.some(p => matchGlob(file, p))) return 'critical';
    }
    for (const file of files) {
      if (this.config.rules.high.some(p => matchGlob(file, p))) return 'high';
    }
    for (const file of files) {
      if (this.config.rules.medium.some(p => matchGlob(file, p))) return 'medium';
    }
    
    return 'low';
  }

  /**
   * Get gate configuration for a specific risk tier
   */
  getGateConfig(tier: 'low' | 'medium' | 'high' | 'critical') {
    return this.config.gates[tier];
  }
}
