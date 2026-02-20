import { Hono } from 'hono';
import { ConfigService } from '../services/config.js';

const configRouter = new Hono();
export let configService: ConfigService;

// Initialize config service
export async function initConfigService() {
  configService = new ConfigService();
  await configService.loadConfig();
}

// GET /config - list all config entries (values masked by default)
configRouter.get('/', async (c) => {
  try {
    const reveal = c.req.query('reveal') === 'true';
    const entries = await configService.listConfig(reveal);
    return c.json(entries);
  } catch (error) {
    console.error('Error listing config:', error);
    return c.json({ error: 'Failed to list config entries' }, 500);
  }
});

// GET /config/:key - get single entry, optionally reveal value
configRouter.get('/:key', async (c) => {
  try {
    const key = c.req.param('key');
    const reveal = c.req.query('reveal') === 'true';
    
    const entry = await configService.getConfig(key, reveal);
    
    if (!entry) {
      return c.json({ error: 'Config entry not found' }, 404);
    }
    
    return c.json(entry);
  } catch (error) {
    console.error('Error getting config:', error);
    return c.json({ error: 'Failed to get config entry' }, 500);
  }
});

// PUT /config/:key - upsert a config entry
configRouter.put('/:key', async (c) => {
  try {
    const key = c.req.param('key');
    const body = await c.req.json();
    
    if (!body.value) {
      return c.json({ error: 'Value is required' }, 400);
    }
    
    const entry = await configService.setConfig(key, {
      value: body.value,
      category: body.category,
      description: body.description,
      masked: body.masked,
    });
    
    return c.json(entry);
  } catch (error) {
    console.error('Error setting config:', error);
    return c.json({ error: 'Failed to set config entry' }, 500);
  }
});

// DELETE /config/:key - remove a config entry
configRouter.delete('/:key', async (c) => {
  try {
    const key = c.req.param('key');
    const deleted = await configService.deleteConfig(key);
    
    if (!deleted) {
      return c.json({ error: 'Config entry not found' }, 404);
    }
    
    return c.json({ success: true, message: 'Config entry deleted' });
  } catch (error) {
    console.error('Error deleting config:', error);
    return c.json({ error: 'Failed to delete config entry' }, 500);
  }
});

export { configRouter };

