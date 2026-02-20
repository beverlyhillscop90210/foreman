import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname } from 'path';
import type { ConfigEntry, ConfigEntryInput, ConfigEntryResponse } from '../types.js';

const CONFIG_FILE_PATH = '/home/foreman/data/config.json';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

export class ConfigService {
  private masterKey: Buffer;
  private configCache: Map<string, ConfigEntry> = new Map();

  constructor() {
    const masterKeyEnv = process.env.FOREMAN_MASTER_KEY;
    if (!masterKeyEnv) {
      throw new Error('FOREMAN_MASTER_KEY environment variable is required');
    }
    // Derive a 32-byte key from the master key
    this.masterKey = scryptSync(masterKeyEnv, 'foreman-salt', 32);
  }

  private encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.masterKey, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    // Format: iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  private decrypt(ciphertext: string): string {
    const parts = ciphertext.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];

    const decipher = createDecipheriv(ALGORITHM, this.masterKey, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  private maskValue(value: string): string {
    if (value.length <= 4) {
      return '****';
    }
    return value.substring(0, 2) + '*'.repeat(value.length - 4) + value.substring(value.length - 2);
  }

  async loadConfig(): Promise<void> {
    try {
      if (!existsSync(CONFIG_FILE_PATH)) {
        // Initialize with empty config
        await this.saveConfig();
        return;
      }

      const data = await readFile(CONFIG_FILE_PATH, 'utf-8');
      const entries: ConfigEntry[] = JSON.parse(data);
      
      this.configCache.clear();
      for (const entry of entries) {
        this.configCache.set(entry.key, entry);
      }
    } catch (error) {
      console.error('Failed to load config:', error);
      throw error;
    }
  }

  private async saveConfig(): Promise<void> {
    try {
      const dir = dirname(CONFIG_FILE_PATH);
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }

      const entries = Array.from(this.configCache.values());
      await writeFile(CONFIG_FILE_PATH, JSON.stringify(entries, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to save config:', error);
      throw error;
    }
  }

  async listConfig(reveal: boolean = false): Promise<ConfigEntryResponse[]> {
    const entries: ConfigEntryResponse[] = [];
    
    for (const entry of this.configCache.values()) {
      const decryptedValue = this.decrypt(entry.value);
      entries.push({
        key: entry.key,
        value: reveal ? decryptedValue : (entry.masked ? this.maskValue(decryptedValue) : decryptedValue),
        category: entry.category,
        description: entry.description,
        masked: entry.masked,
        updated_at: entry.updated_at,
      });
    }

    return entries;
  }

  async getConfig(key: string, reveal: boolean = false): Promise<ConfigEntryResponse | null> {
    const entry = this.configCache.get(key);
    if (!entry) {
      return null;
    }

    const decryptedValue = this.decrypt(entry.value);
    return {
      key: entry.key,
      value: reveal ? decryptedValue : (entry.masked ? this.maskValue(decryptedValue) : decryptedValue),
      category: entry.category,
      description: entry.description,
      masked: entry.masked,
      updated_at: entry.updated_at,
    };
  }

  async setConfig(key: string, input: ConfigEntryInput): Promise<ConfigEntryResponse> {
    const encryptedValue = this.encrypt(input.value);

    const entry: ConfigEntry = {
      key,
      value: encryptedValue,
      category: input.category || 'general',
      description: input.description || '',
      masked: input.masked !== undefined ? input.masked : true,
      updated_at: new Date().toISOString(),
    };

    this.configCache.set(key, entry);
    await this.saveConfig();

    return {
      key: entry.key,
      value: entry.masked ? this.maskValue(input.value) : input.value,
      category: entry.category,
      description: entry.description,
      masked: entry.masked,
      updated_at: entry.updated_at,
    };
  }

  async deleteConfig(key: string): Promise<boolean> {
    const existed = this.configCache.has(key);
    if (existed) {
      this.configCache.delete(key);
      await this.saveConfig();
    }
    return existed;
  }
}

