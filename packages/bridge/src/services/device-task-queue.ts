import { EventEmitter } from 'events';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { createLogger } from '../logger.js';

const log = createLogger('device-task-queue');
const DATA_FILE = process.env.DEVICE_TASKS_FILE || '/home/foreman/data/device-tasks.json';

export interface DeviceTask {
  id: string;
  taskId: string;           // The parent Foreman task ID
  deviceId: string;
  model: string;            // e.g. "qwen3:4b"
  prompt: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  created_at: string;
  picked_at?: string;
  completed_at?: string;
  output?: string;
  error?: string;
}

class DeviceTaskQueue extends EventEmitter {
  private tasks: Map<string, DeviceTask> = new Map();

  private generateId(): string {
    return Math.random().toString(36).slice(2, 11);
  }

  /** Load persisted tasks from disk. Resets any in-flight 'running' tasks back to 'pending' so the device can re-pick them. */
  load(): void {
    try {
      const raw = readFileSync(DATA_FILE, 'utf8');
      const arr: DeviceTask[] = JSON.parse(raw);
      this.tasks.clear();
      let reset = 0;
      for (const dt of arr) {
        // Keep only tasks that haven't finished — no need to replay completed/failed
        if (dt.status === 'completed' || dt.status === 'failed') continue;
        // Running tasks lost their executor — reset to pending so device re-picks them
        if (dt.status === 'running') {
          dt.status = 'pending';
          dt.picked_at = undefined;
          reset++;
        }
        this.tasks.set(dt.id, dt);
      }
      log.info('Device task queue loaded', { total: arr.length, active: this.tasks.size, reset });
    } catch {
      // File doesn't exist yet — start fresh
    }
  }

  private save(): void {
    try {
      const arr = Array.from(this.tasks.values());
      mkdirSync(dirname(DATA_FILE), { recursive: true });
      writeFileSync(DATA_FILE, JSON.stringify(arr, null, 2));
    } catch (e) {
      log.warn('Failed to persist device task queue', { error: String(e) });
    }
  }

  /** Enqueue a task for a specific device */
  enqueue(params: { taskId: string; deviceId: string; model: string; prompt: string }): DeviceTask {
    const dt: DeviceTask = {
      id: this.generateId(),
      ...params,
      status: 'pending',
      created_at: new Date().toISOString(),
    };
    this.tasks.set(dt.id, dt);
    this.save();
    log.info('Device task enqueued', { dtId: dt.id, taskId: params.taskId, deviceId: params.deviceId, model: params.model });
    return dt;
  }

  /** Get pending tasks for a device (called by device via polling) */
  getPendingForDevice(deviceId: string): DeviceTask[] {
    return Array.from(this.tasks.values()).filter(t => t.deviceId === deviceId && t.status === 'pending');
  }

  /** Mark a task as picked up by a device */
  markRunning(dtId: string): DeviceTask | null {
    const dt = this.tasks.get(dtId);
    if (!dt) return null;
    dt.status = 'running';
    dt.picked_at = new Date().toISOString();
    this.save();
    return dt;
  }

  /** Submit a result from a device */
  complete(dtId: string, output: string): DeviceTask | null {
    const dt = this.tasks.get(dtId);
    if (!dt) return null;
    dt.status = 'completed';
    dt.completed_at = new Date().toISOString();
    dt.output = output;
    this.save();
    this.emit('task:completed', dt);
    log.info('Device task completed', { dtId, taskId: dt.taskId });
    return dt;
  }

  fail(dtId: string, error: string): DeviceTask | null {
    const dt = this.tasks.get(dtId);
    if (!dt) return null;
    dt.status = 'failed';
    dt.completed_at = new Date().toISOString();
    dt.error = error;
    this.save();
    this.emit('task:failed', dt);
    log.warn('Device task failed', { dtId, taskId: dt.taskId, error });
    return dt;
  }

  /** Wait for a device task to complete or fail (times out in maxWaitMs) */
  waitForCompletion(dtId: string, maxWaitMs = 10 * 60 * 1000): Promise<DeviceTask> {
    const dt = this.tasks.get(dtId);
    if (!dt) return Promise.reject(new Error('Device task not found'));
    if (dt.status === 'completed' || dt.status === 'failed') return Promise.resolve(dt);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.removeListener('task:completed', onComplete);
        this.removeListener('task:failed', onFail);
        const t = this.tasks.get(dtId);
        if (t) { t.status = 'failed'; t.error = 'Timeout waiting for device'; }
        reject(new Error('Timeout waiting for device to execute Ollama task'));
      }, maxWaitMs);

      const onComplete = (t: DeviceTask) => {
        if (t.id !== dtId) return;
        clearTimeout(timeout);
        this.removeListener('task:failed', onFail);
        resolve(t);
      };
      const onFail = (t: DeviceTask) => {
        if (t.id !== dtId) return;
        clearTimeout(timeout);
        this.removeListener('task:completed', onComplete);
        reject(new Error(t.error || 'Device task failed'));
      };

      this.on('task:completed', onComplete);
      this.on('task:failed', onFail);
    });
  }

  getTask(dtId: string): DeviceTask | null {
    return this.tasks.get(dtId) ?? null;
  }

  getByTaskId(taskId: string): DeviceTask | undefined {
    return Array.from(this.tasks.values()).find(t => t.taskId === taskId);
  }

  /** Add a single output chunk during streaming from device */
  appendOutput(dtId: string, chunk: string): void {
    const dt = this.tasks.get(dtId);
    if (!dt) return;
    dt.output = (dt.output || '') + chunk;
    this.emit('task:chunk', { dtId, taskId: dt.taskId, chunk });
  }
}

export const deviceTaskQueue = new DeviceTaskQueue();
