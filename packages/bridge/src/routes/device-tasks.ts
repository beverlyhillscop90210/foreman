import { Hono } from 'hono';
import { deviceTaskQueue } from '../services/device-task-queue.js';

export function createDeviceTaskRoutes() {
  const app = new Hono();

  /** GET /device-tasks/:deviceId — device polls for pending tasks */
  app.get('/:deviceId', (c) => {
    const deviceId = c.req.param('deviceId');
    const tasks = deviceTaskQueue.getPendingForDevice(deviceId);
    return c.json({ tasks });
  });

  /** POST /device-tasks/:dtId/pick — device claims a task */
  app.post('/:dtId/pick', (c) => {
    const dtId = c.req.param('dtId');
    const dt = deviceTaskQueue.markRunning(dtId);
    if (!dt) return c.json({ error: 'Task not found' }, 404);
    return c.json({ ok: true, task: dt });
  });

  /** POST /device-tasks/:dtId/chunk — stream output chunk from device */
  app.post('/:dtId/chunk', async (c) => {
    const dtId = c.req.param('dtId');
    const body = await c.req.json().catch(() => ({}));
    const chunk: string = body.chunk || '';
    if (chunk) deviceTaskQueue.appendOutput(dtId, chunk);
    return c.json({ ok: true });
  });

  /** POST /device-tasks/:dtId/complete — device submits final result */
  app.post('/:dtId/complete', async (c) => {
    const dtId = c.req.param('dtId');
    const body = await c.req.json().catch(() => ({}));
    const output: string = body.output || '';
    const dt = deviceTaskQueue.complete(dtId, output);
    if (!dt) return c.json({ error: 'Task not found' }, 404);
    return c.json({ ok: true });
  });

  /** POST /device-tasks/:dtId/fail — device reports failure */
  app.post('/:dtId/fail', async (c) => {
    const dtId = c.req.param('dtId');
    const body = await c.req.json().catch(() => ({}));
    const error: string = body.error || 'Unknown error';
    const dt = deviceTaskQueue.fail(dtId, error);
    if (!dt) return c.json({ error: 'Task not found' }, 404);
    return c.json({ ok: true });
  });

  return app;
}
