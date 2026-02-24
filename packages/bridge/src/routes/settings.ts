import { Hono } from 'hono';
import { settingsService } from '../services/settings.js';

export function createSettingsRoutes() {
  const app = new Hono();

  /** GET /settings/roles - return current roles config */
  app.get('/roles', (c) => {
    return c.json({
      rolesConfig: settingsService.getRolesConfig(),
      defaultModel: settingsService.getDefaultModel(),
    });
  });

  /** PUT /settings/roles - save roles config from dashboard */
  app.put('/roles', async (c) => {
    try {
      const body = await c.req.json();
      const roles = body.rolesConfig || body;
      if (!Array.isArray(roles)) {
        return c.json({ error: 'Expected array of role configs' }, 400);
      }
      settingsService.setRolesConfig(roles);
      if (body.defaultModel !== undefined) {
        settingsService.setDefaultModel(body.defaultModel);
      }
      return c.json({ ok: true, count: roles.length });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  return app;
}
