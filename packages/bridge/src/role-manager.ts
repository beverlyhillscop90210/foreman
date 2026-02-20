import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';

export interface AgentRole {
  id: string;
  description: string;
  model: string;
  reasoning: 'low' | 'medium' | 'high';
  permissions: 'read-only' | 'read-write';
  system_prompt: string;
  allowed_files?: string[];
}

export class RoleManager {
  private rolesDir: string;
  private roles: Map<string, AgentRole> = new Map();

  constructor() {
    this.rolesDir = process.env.ROLES_DIR || join(process.env.HOME || '/home/foreman', 'roles');
    this.loadRoles();
  }

  /**
   * Load all roles from YAML files in the roles directory
   */
  private loadRoles(): void {
    if (!existsSync(this.rolesDir)) {
      console.warn(`⚠️  Roles directory not found: ${this.rolesDir}. Using default roles.`);
      this.loadDefaultRoles();
      return;
    }

    try {
      const files = readdirSync(this.rolesDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
      
      for (const file of files) {
        const roleId = file.replace(/\.ya?ml$/, '');
        const content = readFileSync(join(this.rolesDir, file), 'utf-8');
        const roleData = parse(content);
        
        this.roles.set(roleId, {
          id: roleId,
          ...roleData
        });
      }
      
      console.log(`✅ Loaded ${this.roles.size} agent roles from ${this.rolesDir}`);
    } catch (error) {
      console.error(`❌ Failed to load roles from ${this.rolesDir}:`, error);
      this.loadDefaultRoles();
    }
  }

  /**
   * Fallback default roles if directory is missing
   */
  private loadDefaultRoles(): void {
    this.roles.set('worker', {
      id: 'worker',
      description: 'Implementiert Features aus einem strukturierten Plan',
      model: 'sonnet-4.5',
      reasoning: 'medium',
      permissions: 'read-write',
      system_prompt: 'Du bist ein Senior Developer. Implementiere exakt das was im Task Briefing steht. Halte dich an die vorgegebenen File Scopes. Schreib sauberen, getesteten Code.'
    });
    
    this.roles.set('planner', {
      id: 'planner',
      description: 'Zerlegt High-Level Briefs in DAG-Workflows',
      model: 'opus-4.5',
      reasoning: 'high',
      permissions: 'read-only',
      system_prompt: 'Du bist ein Senior Technical Architect. Deine Aufgabe ist es, einen High-Level Brief in einen DAG von konkreten, ausführbaren Tasks zu zerlegen. Jeder Task muss klar definierte Inputs, Outputs, und Acceptance Criteria haben. Definiere Dependencies explizit. Identifiziere parallelisierbare Arbeit. Setze Risk Tiers pro Task.'
    });
  }

  /**
   * Get a role by ID
   */
  getRole(id: string): AgentRole | undefined {
    return this.roles.get(id);
  }

  /**
   * List all available roles
   */
  listRoles(): AgentRole[] {
    return Array.from(this.roles.values());
  }
}
