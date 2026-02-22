import { Hono } from 'hono';
import { listRoles, getRole } from '../agent-roles.js';

export function createRolesRoutes() {
  const app = new Hono();

  /**
   * GET / - List all available agent roles
   */
  app.get('/', (c) => {
    const roles = listRoles().map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      model: r.model,
      capabilities: r.capabilities,
      icon: r.icon,
      default_allowed_files: r.default_allowed_files,
      default_blocked_files: r.default_blocked_files,
    }));
    return c.json({ roles });
  });

  /**
   * GET /:id - Get a specific role (includes full system prompt)
   */
  app.get('/:id', (c) => {
    const id = c.req.param('id');
    const role = getRole(id);
    if (!role) return c.json({ error: 'Role not found' }, 404);
    return c.json(role);
  });

  return app;
}
