import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { createLogger } from '../logger.js';

const log = createLogger('settings-service');
const SETTINGS_FILE = process.env.SETTINGS_FILE || '/home/foreman/data/settings.json';

export interface RoleConfig {
  id: string;
  name: string;
  model: string;
  systemPrompts?: { userEmail: string; userName: string; prompt: string }[];
  activePromptUserEmail?: string;
}

interface SettingsStore {
  rolesConfig: RoleConfig[];
}

class SettingsService {
  private data: SettingsStore = { rolesConfig: [] };

  constructor() {
    this.load();
  }

  private load() {
    try {
      if (existsSync(SETTINGS_FILE)) {
        const raw = readFileSync(SETTINGS_FILE, 'utf-8');
        this.data = JSON.parse(raw);
        log.info('Settings loaded', { roles: this.data.rolesConfig?.length ?? 0 });
      }
    } catch (err) {
      log.warn('Failed to load settings file, using defaults', { error: String(err) });
    }
  }

  private save() {
    try {
      const dir = dirname(SETTINGS_FILE);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(SETTINGS_FILE, JSON.stringify(this.data, null, 2));
    } catch (err) {
      log.error('Failed to save settings file', { error: String(err) });
    }
  }

  getRolesConfig(): RoleConfig[] {
    return this.data.rolesConfig || [];
  }

  setRolesConfig(roles: RoleConfig[]) {
    this.data.rolesConfig = roles;
    this.save();
    log.info('Roles config saved', { roles: roles.length });
  }

  /** Look up the configured model for a role ID */
  getModelForRole(roleId: string): string | null {
    const role = this.data.rolesConfig.find(r => r.id === roleId);
    return role?.model ?? null;
  }
}

export const settingsService = new SettingsService();
