import { createLogger } from '../logger.js';

const log = createLogger('tunnel-service');

export interface TunnelConfig {
  accountId: string;
  apiToken: string;
  domain: string;  // e.g. "foreman.run" or "lum3on.com"
}

export interface TunnelInfo {
  tunnelId: string;
  tunnelToken: string;
  hostname: string;
}

/**
 * Manages Cloudflare Tunnels for device connections.
 * 
 * Uses the Cloudflare API to:
 * 1. Create named tunnels
 * 2. Set up DNS CNAME records
 * 3. Return tunnel credentials for the device agent
 */
export class TunnelService {
  private config: TunnelConfig | null = null;
  private baseUrl = 'https://api.cloudflare.com/client/v4';

  constructor(config?: TunnelConfig) {
    if (config) {
      this.config = config;
    } else {
      // Try to load from environment
      const accountId = process.env.CF_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID;
      const apiToken = process.env.CF_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN;
      const domain = process.env.CF_TUNNEL_DOMAIN || process.env.CLOUDFLARE_TUNNEL_DOMAIN || 'foreman.run';

      if (accountId && apiToken) {
        this.config = { accountId, apiToken, domain };
        log.info('Tunnel service initialized from env', { accountId: accountId.slice(0, 6) + '...', domain });
      } else {
        log.warn('Tunnel service not configured — CF_ACCOUNT_ID and CF_API_TOKEN not set');
      }
    }
  }

  isConfigured(): boolean {
    return this.config !== null;
  }

  private async cfFetch(path: string, options: RequestInit = {}): Promise<any> {
    if (!this.config) throw new Error('Tunnel service not configured');

    const url = `${this.baseUrl}/accounts/${this.config.accountId}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.config.apiToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const data = await res.json() as any;
    if (!data.success) {
      const errors = data.errors?.map((e: any) => e.message).join(', ') || 'Unknown error';
      throw new Error(`Cloudflare API error: ${errors}`);
    }
    return data.result;
  }

  /**
   * Create a new Cloudflare Tunnel for a device.
   */
  async createTunnel(deviceId: string, deviceName: string): Promise<TunnelInfo> {
    if (!this.config) throw new Error('Tunnel service not configured');

    const slug = slugify(deviceName);
    const tunnelName = `foreman-${slug}-${deviceId.slice(0, 6)}`;

    log.info('Creating Cloudflare tunnel', { tunnelName, deviceId });

    // 1. Create the tunnel
    const tunnelSecret = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
    const tunnel = await this.cfFetch('/cfd_tunnel', {
      method: 'POST',
      body: JSON.stringify({
        name: tunnelName,
        tunnel_secret: tunnelSecret,
        config_src: 'cloudflare',
      }),
    });

    const tunnelId = tunnel.id;
    const hostname = `${slug}.${this.config.domain}`;

    // 2. Create tunnel configuration (route traffic)
    await this.cfFetch(`/cfd_tunnel/${tunnelId}/configurations`, {
      method: 'PUT',
      body: JSON.stringify({
        config: {
          ingress: [
            {
              hostname,
              service: 'http://localhost:8080',
              originRequest: {},
            },
            {
              service: 'http_status:404',
            },
          ],
        },
      }),
    });

    // 3. Create DNS CNAME record
    // Need to get the zone ID for the domain
    try {
      const zoneId = await this.getZoneId(this.config.domain);
      if (zoneId) {
        await this.createDnsRecord(zoneId, hostname, `${tunnelId}.cfargotunnel.com`);
      }
    } catch (err) {
      log.warn('Failed to create DNS record — may need manual setup', { hostname, error: String(err) });
    }

    // The tunnel token is a base64-encoded JSON with account tag, tunnel secret, and tunnel ID
    const tunnelToken = Buffer.from(JSON.stringify({
      a: this.config.accountId,
      t: tunnelId,
      s: tunnelSecret,
    })).toString('base64');

    log.info('Tunnel created', { tunnelId, hostname, tunnelName });

    return {
      tunnelId,
      tunnelToken,
      hostname,
    };
  }

  /**
   * Delete a Cloudflare Tunnel.
   */
  async deleteTunnel(tunnelId: string): Promise<void> {
    if (!this.config) throw new Error('Tunnel service not configured');

    log.info('Deleting Cloudflare tunnel', { tunnelId });

    try {
      // Clean up connections first
      await this.cfFetch(`/cfd_tunnel/${tunnelId}/connections`, {
        method: 'DELETE',
      });
    } catch {
      // Ignore — tunnel may have no active connections
    }

    await this.cfFetch(`/cfd_tunnel/${tunnelId}`, {
      method: 'DELETE',
    });

    log.info('Tunnel deleted', { tunnelId });
  }

  /**
   * Get tunnel status from Cloudflare.
   */
  async getTunnelStatus(tunnelId: string): Promise<{ status: string; connections: any[] }> {
    if (!this.config) throw new Error('Tunnel service not configured');

    const tunnel = await this.cfFetch(`/cfd_tunnel/${tunnelId}`);
    return {
      status: tunnel.status,
      connections: tunnel.connections || [],
    };
  }

  /**
   * List all Foreman tunnels.
   */
  async listTunnels(): Promise<any[]> {
    if (!this.config) throw new Error('Tunnel service not configured');
    return this.cfFetch('/cfd_tunnel?name_prefix=foreman-&is_deleted=false');
  }

  // ── Helpers ──────────────────────────────────────────────────

  private async getZoneId(domain: string): Promise<string | null> {
    // Zone lookup is at the top level, not account-scoped
    const res = await fetch(`${this.baseUrl}/zones?name=${domain}`, {
      headers: {
        'Authorization': `Bearer ${this.config!.apiToken}`,
        'Content-Type': 'application/json',
      },
    });
    const data = await res.json() as any;
    if (!data.success || !data.result?.length) return null;
    return data.result[0].id;
  }

  private async createDnsRecord(zoneId: string, hostname: string, target: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/zones/${zoneId}/dns_records`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config!.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'CNAME',
        name: hostname,
        content: target,
        proxied: true,
        comment: 'Foreman device tunnel',
      }),
    });
    const data = await res.json() as any;
    if (!data.success) {
      const errors = data.errors?.map((e: any) => e.message).join(', ') || 'Unknown error';
      throw new Error(`DNS record creation failed: ${errors}`);
    }
    log.info('DNS record created', { hostname, target });
  }
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
}
