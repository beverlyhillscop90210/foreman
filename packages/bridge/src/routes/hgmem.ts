/**
 * HGMem REST Routes
 *
 * POST   /              Create session + start full run (async)
 * POST   /sessions      Create session only
 * GET    /sessions      List all sessions
 * GET    /sessions/:id  Get session details
 * POST   /sessions/:id/step   Run one step
 * POST   /sessions/:id/run    Run to completion
 * GET    /sessions/:id/memory  Get rendered memory
 * GET    /sessions/:id/stats   Get session statistics
 * DELETE /sessions/:id  Delete session
 */

import { Hono } from 'hono';
import { HGMemEngine } from '../hgmem/engine.js';
import { saveHGMemSessions } from '../hgmem/sessions.js';

export function createHGMemRoutes(engine: HGMemEngine) {
  const app = new Hono();

  /** POST / — Quick query: create + run to completion. */
  app.post('/', async (c) => {
    try {
      const { query, project } = await c.req.json();
      if (!query) return c.json({ error: 'Missing required field: query' }, 400);

      const session = engine.createSession(query, project || 'default');
      const completed = await engine.run(session.id);
      saveHGMemSessions(engine);

      return c.json({
        session: completed,
        stats: engine.getSessionStats(session.id),
      });
    } catch (error) {
      console.error('HGMem query error:', error);
      return c.json({ error: error instanceof Error ? error.message : 'Query failed' }, 500);
    }
  });

  /** POST /sessions — Create session without running. */
  app.post('/sessions', async (c) => {
    try {
      const { query, project, max_steps } = await c.req.json();
      if (!query) return c.json({ error: 'Missing required field: query' }, 400);

      const session = engine.createSession(query, project || 'default');
      if (max_steps && typeof max_steps === 'number') {
        session.max_steps = max_steps;
      }
      saveHGMemSessions(engine);

      return c.json({ session }, 201);
    } catch (error) {
      console.error('HGMem create error:', error);
      return c.json({ error: error instanceof Error ? error.message : 'Create failed' }, 500);
    }
  });

  /** GET /sessions — List all sessions. */
  app.get('/sessions', async (c) => {
    const project = c.req.query('project');
    let sessions = engine.listSessions();
    if (project) {
      sessions = sessions.filter(s => s.project === project);
    }
    return c.json({
      sessions: sessions.map(s => ({
        id: s.id,
        query: s.query,
        project: s.project,
        status: s.status,
        steps: s.current_step,
        max_steps: s.max_steps,
        created_at: s.created_at,
        updated_at: s.updated_at,
      })),
    });
  });

  /** GET /sessions/:id — Full session detail. */
  app.get('/sessions/:id', async (c) => {
    const session = engine.getSession(c.req.param('id'));
    if (!session) return c.json({ error: 'Session not found' }, 404);
    return c.json({
      session,
      stats: engine.getSessionStats(session.id),
    });
  });

  /** POST /sessions/:id/step — Run one step. */
  app.post('/sessions/:id/step', async (c) => {
    try {
      const id = c.req.param('id');
      const session = engine.getSession(id);
      if (!session) return c.json({ error: 'Session not found' }, 404);
      if (session.status !== 'active') {
        return c.json({ error: 'Session is not active', status: session.status }, 400);
      }

      const result = await engine.runStep(id);
      saveHGMemSessions(engine);

      return c.json({
        ...result,
        stats: engine.getSessionStats(id),
      });
    } catch (error) {
      console.error('HGMem step error:', error);
      return c.json({ error: error instanceof Error ? error.message : 'Step failed' }, 500);
    }
  });

  /** POST /sessions/:id/run — Run to completion. */
  app.post('/sessions/:id/run', async (c) => {
    try {
      const id = c.req.param('id');
      const session = engine.getSession(id);
      if (!session) return c.json({ error: 'Session not found' }, 404);
      if (session.status !== 'active') {
        return c.json({ error: 'Session is not active', status: session.status }, 400);
      }

      const completed = await engine.run(id);
      saveHGMemSessions(engine);

      return c.json({
        session: completed,
        stats: engine.getSessionStats(id),
      });
    } catch (error) {
      console.error('HGMem run error:', error);
      return c.json({ error: error instanceof Error ? error.message : 'Run failed' }, 500);
    }
  });

  /** GET /sessions/:id/memory — Rendered memory text. */
  app.get('/sessions/:id/memory', async (c) => {
    const graph = engine.getGraph(c.req.param('id'));
    if (!graph) return c.json({ error: 'Session not found' }, 404);
    return c.json({
      memory: graph.renderForPrompt(),
      vertices: graph.vertexCount(),
      hyperedges: graph.hyperedgeCount(),
      avg_order: graph.avgVerticesPerHyperedge(),
    });
  });

  /** GET /sessions/:id/stats — Session statistics. */
  app.get('/sessions/:id/stats', async (c) => {
    const stats = engine.getSessionStats(c.req.param('id'));
    if (!stats) return c.json({ error: 'Session not found' }, 404);
    return c.json(stats);
  });

  /** DELETE /sessions/:id — Delete a session. */
  app.delete('/sessions/:id', async (c) => {
    const deleted = engine.deleteSession(c.req.param('id'));
    if (!deleted) return c.json({ error: 'Session not found' }, 404);
    saveHGMemSessions(engine);
    return c.json({ deleted: true });
  });

  return app;
}
