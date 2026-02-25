import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createLogger } from '../logger.js';

const log = createLogger('api-keys');

export interface ApiKey {
  id: string;
  user_id: string;
  provider: string; // 'anthropic', 'openrouter', 'openai', etc.
  key_value: string;
  is_shared: boolean;
  created_at: string;
}

/**
 * API Key Service - Manages per-user API keys stored in Supabase
 * Falls back to environment variables if no user key is found
 */
export class ApiKeyService {
  private supabase: SupabaseClient;

  constructor() {
    const url = process.env.SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    
    if (!url || !key) {
      log.warn('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set - API key service will use env vars only');
    }
    
    this.supabase = createClient(url, key);
  }

  /**
   * Get API key for a specific provider and user
   * Falls back to environment variable if no user key found
   */
  async getKey(provider: string, userId?: string): Promise<string | null> {
    // If user ID provided, try to get user-specific key first
    if (userId) {
      try {
        const { data, error } = await this.supabase
          .from('api_keys')
          .select('key_value')
          .eq('user_id', userId)
          .eq('provider', provider)
          .single();

        if (!error && data) {
          log.info('Using user-specific API key', { provider, userId });
          return data.key_value;
        }
      } catch (err) {
        log.warn('Failed to fetch user API key', { provider, userId, error: String(err) });
      }
    }

    // Fallback to environment variable
    const envKey = this.getEnvKey(provider);
    if (envKey) {
      log.info('Using environment variable API key', { provider });
      return envKey;
    }

    log.warn('No API key found', { provider, userId });
    return null;
  }

  /**
   * Get API key from environment variable
   */
  private getEnvKey(provider: string): string | null {
    const envMap: Record<string, string> = {
      'anthropic': 'ANTHROPIC_API_KEY',
      'openrouter': 'OPENROUTER_API_KEY',
      'openai': 'OPENAI_API_KEY',
      'gemini': 'GEMINI_API_KEY',
    };

    const envVar = envMap[provider.toLowerCase()];
    return envVar ? process.env[envVar] || null : null;
  }

  /**
   * Set API key for a user
   */
  async setKey(userId: string, provider: string, keyValue: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('api_keys')
        .upsert({
          user_id: userId,
          provider,
          key_value: keyValue,
          is_shared: false,
        }, {
          onConflict: 'user_id,provider',
        });

      if (error) {
        throw new Error(`Failed to save API key: ${error.message}`);
      }

      log.info('API key saved', { provider, userId });
    } catch (err) {
      log.error('Failed to save API key', { provider, userId, error: String(err) });
      throw err;
    }
  }

  /**
   * Delete API key for a user
   */
  async deleteKey(userId: string, provider: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('api_keys')
        .delete()
        .eq('user_id', userId)
        .eq('provider', provider);

      if (error) {
        throw new Error(`Failed to delete API key: ${error.message}`);
      }

      log.info('API key deleted', { provider, userId });
    } catch (err) {
      log.error('Failed to delete API key', { provider, userId, error: String(err) });
      throw err;
    }
  }

  /**
   * List all API keys for a user (without revealing values)
   */
  async listKeys(userId: string): Promise<Array<{ provider: string; created_at: string }>> {
    try {
      const { data, error } = await this.supabase
        .from('api_keys')
        .select('provider, created_at')
        .eq('user_id', userId);

      if (error) {
        throw new Error(`Failed to list API keys: ${error.message}`);
      }

      return data || [];
    } catch (err) {
      log.error('Failed to list API keys', { userId, error: String(err) });
      return [];
    }
  }
}

export const apiKeyService = new ApiKeyService();

