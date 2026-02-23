import { EventEmitter } from 'events';
import { randomBytes, createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { createLogger } from '../logger.js';
import type {
  Device,
  DeviceToken,
  DeviceType,
  DeviceStatus,
  DeviceCapabilities,
  CreateDeviceRequest,
  DeviceConnectRequest,
  DeviceHeartbeatRequest,
} from '../types.js';

const log = createLogger('device-registry');

const DEVICES_FILE = process.env.DEVICES_FILE || '/home/foreman/data/devices.json';
const HEARTBEAT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes → offline
const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

interface DevicesStore {
  devices: Device[];
  tokens: DeviceToken[];
}

export class DeviceRegistry extends EventEmitter {
  private devices: Map<string, Device> = new Map();
  private tokens: Map<string, DeviceToken> = new Map(); // keyed by token_hash
  private healthCheckInterval?: ReturnType<typeof setInterval>;

  constructor() {
    super();
    this.loadFromDisk();
    this.startHealthCheck();
  }

  // ── Persistence ──────────────────────────────────────────────

  private loadFromDisk(): void {
    try {
      if (existsSync(DEVICES_FILE)) {
        const raw = readFileSync(DEVICES_FILE, 'utf-8');
        const store: DevicesStore = JSON.parse(raw);
        for (const d of store.devices || []) {
          this.devices.set(d.id, d);
        }
        for (const t of store.tokens || []) {
          this.tokens.set(t.token_hash, t);
        }
        log.info('Loaded devices from disk', { count: this.devices.size, tokens: this.tokens.size });
      }
    } catch (err) {
      log.error('Failed to load devices file', { error: String(err) });
    }
  }

  private saveToDisk(): void {
    try {
      const dir = dirname(DEVICES_FILE);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const store: DevicesStore = {
        devices: Array.from(this.devices.values()),
        tokens: Array.from(this.tokens.values()),
      };
      writeFileSync(DEVICES_FILE, JSON.stringify(store, null, 2));
    } catch (err) {
      log.error('Failed to save devices file', { error: String(err) });
    }
  }

  // ── Health Check Loop ────────────────────────────────────────

  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(() => {
      const now = Date.now();
      for (const device of this.devices.values()) {
        if (device.status === 'online' && device.last_seen_at) {
          const lastSeen = new Date(device.last_seen_at).getTime();
          if (now - lastSeen > HEARTBEAT_TIMEOUT_MS) {
            log.warn('Device went offline (heartbeat timeout)', { deviceId: device.id, name: device.name });
            device.status = 'offline';
            device.updated_at = new Date().toISOString();
            this.saveToDisk();
            this.emit('device:offline', device);
          }
        }
      }
    }, 60_000); // check every minute
  }

  destroy(): void {
    if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);
  }

  // ── CRUD ─────────────────────────────────────────────────────

  createDevice(req: CreateDeviceRequest): { device: Device; token: string } {
    const id = randomBytes(8).toString('base64url');
    const now = new Date().toISOString();

    const device: Device = {
      id,
      name: req.name,
      type: req.type,
      status: 'pending',
      tags: req.tags || [],
      metadata: req.metadata || {},
      created_at: now,
      updated_at: now,
    };

    // Generate a one-time connection token
    const tokenPlain = `fmd_${randomBytes(32).toString('hex')}`;
    const tokenHash = createHash('sha256').update(tokenPlain).digest('hex');
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MS).toISOString();

    const deviceToken: DeviceToken = {
      id: randomBytes(8).toString('base64url'),
      device_id: id,
      token_hash: tokenHash,
      expires_at: expiresAt,
    };

    this.devices.set(id, device);
    this.tokens.set(tokenHash, deviceToken);
    this.saveToDisk();

    log.info('Device created', { deviceId: id, name: req.name, type: req.type });
    this.emit('device:created', device);

    return { device, token: tokenPlain };
  }

  getDevice(id: string): Device | undefined {
    return this.devices.get(id);
  }

  listDevices(): Device[] {
    return Array.from(this.devices.values());
  }

  updateDevice(id: string, updates: Partial<Pick<Device, 'name' | 'type' | 'tags' | 'metadata'>>): Device | null {
    const device = this.devices.get(id);
    if (!device) return null;

    if (updates.name !== undefined) device.name = updates.name;
    if (updates.type !== undefined) device.type = updates.type;
    if (updates.tags !== undefined) device.tags = updates.tags;
    if (updates.metadata !== undefined) device.metadata = { ...device.metadata, ...updates.metadata };
    device.updated_at = new Date().toISOString();

    this.saveToDisk();
    this.emit('device:updated', device);
    return device;
  }

  deleteDevice(id: string): boolean {
    const device = this.devices.get(id);
    if (!device) return false;

    // Remove associated tokens
    for (const [hash, token] of this.tokens.entries()) {
      if (token.device_id === id) {
        this.tokens.delete(hash);
      }
    }

    this.devices.delete(id);
    this.saveToDisk();

    log.info('Device deleted', { deviceId: id, name: device.name });
    this.emit('device:deleted', device);
    return true;
  }

  // ── Connection Flow ──────────────────────────────────────────

  /**
   * Agent calls this with the one-time token to register itself.
   * Returns the device if token is valid.
   */
  connectDevice(req: DeviceConnectRequest): Device | null {
    const tokenHash = createHash('sha256').update(req.token).digest('hex');
    const deviceToken = this.tokens.get(tokenHash);

    if (!deviceToken) {
      log.warn('Connection attempt with invalid token');
      return null;
    }

    // Check expiry
    if (new Date(deviceToken.expires_at).getTime() < Date.now()) {
      log.warn('Connection attempt with expired token', { deviceId: deviceToken.device_id });
      this.tokens.delete(tokenHash);
      this.saveToDisk();
      return null;
    }

    // Check if already used
    if (deviceToken.used_at) {
      log.warn('Connection attempt with already-used token', { deviceId: deviceToken.device_id });
      return null;
    }

    const device = this.devices.get(deviceToken.device_id);
    if (!device) {
      log.error('Token references non-existent device', { deviceId: deviceToken.device_id });
      return null;
    }

    // Mark token as used
    deviceToken.used_at = new Date().toISOString();

    // Update device
    device.status = 'online';
    device.last_seen_at = new Date().toISOString();
    device.updated_at = new Date().toISOString();
    if (req.capabilities) device.capabilities = req.capabilities;
    if (req.hostname) device.tunnel_hostname = req.hostname;

    this.saveToDisk();
    log.info('Device connected', { deviceId: device.id, name: device.name, capabilities: req.capabilities });
    this.emit('device:connected', device);
    return device;
  }

  // ── Heartbeat ────────────────────────────────────────────────

  heartbeat(deviceId: string, req?: DeviceHeartbeatRequest): Device | null {
    const device = this.devices.get(deviceId);
    if (!device) return null;

    device.last_seen_at = new Date().toISOString();
    device.updated_at = new Date().toISOString();

    if (device.status !== 'online') {
      device.status = 'online';
      log.info('Device back online', { deviceId, name: device.name });
      this.emit('device:online', device);
    }

    if (req?.capabilities) {
      device.capabilities = { ...device.capabilities, ...req.capabilities };
    }

    // Store metrics in metadata
    if (req?.metrics) {
      device.metadata = { ...device.metadata, last_metrics: req.metrics };
    }

    this.saveToDisk();
    return device;
  }

  // ── Tunnel Management ────────────────────────────────────────

  setTunnelInfo(deviceId: string, tunnelId: string, tunnelHostname: string, tunnelToken?: string): Device | null {
    const device = this.devices.get(deviceId);
    if (!device) return null;

    device.tunnel_id = tunnelId;
    device.tunnel_hostname = tunnelHostname;
    if (tunnelToken) device.tunnel_token = tunnelToken;
    device.updated_at = new Date().toISOString();

    this.saveToDisk();
    return device;
  }

  // ── Query Helpers ────────────────────────────────────────────

  getOnlineDevices(): Device[] {
    return Array.from(this.devices.values()).filter(d => d.status === 'online');
  }

  getDevicesByType(type: DeviceType): Device[] {
    return Array.from(this.devices.values()).filter(d => d.type === type);
  }

  getDeviceByName(name: string): Device | undefined {
    return Array.from(this.devices.values()).find(d => d.name === name);
  }

  getDeviceByHostname(hostname: string): Device | undefined {
    return Array.from(this.devices.values()).find(d => d.tunnel_hostname === hostname);
  }
}
