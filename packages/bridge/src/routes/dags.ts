import { Hono } from 'hono';
import { DagExecutor } from '../dag-executor.js';

export function createDagRoutes(dagExecutor: DagExecutor) {
  const app = new Hono();

  /**
   * GET / - List all DAGs
   */
  app.get('/', (c) => {
    const dags = dagExecutor.listDags();
    return c.json({ dags });
  });

  /**
   * POST / - Create a new DAG
   */
  app.post('/', async (c) => {
    try {
      const body = await c.req.json();
      const dag = dagExecutor.createDag({
        name: body.name,
        description: body.description,
        project: body.project,
        created_by: body.created_by || 'manual',
        approval_mode: body.approval_mode || 'per_task',
        nodes: body.nodes || [],
        edges: body.edges || [],
      });
      return c.json(dag, 201);
    } catch (error) {
      console.error('DAG create error:', error);
      return c.json({ error: error instanceof Error ? error.message : 'Create failed' }, 400);
    }
  });

  /**
   * GET /:id - Get DAG details
   */
  app.get('/:id', (c) => {
    const id = c.req.param('id');
    const dag = dagExecutor.getDag(id);
    if (!dag) return c.json({ error: 'DAG not found' }, 404);
    return c.json(dag);
  });

  /**
   * POST /:id/execute - Start DAG execution
   */
  app.post('/:id/execute', async (c) => {
    try {
      const id = c.req.param('id');
      const dag = await dagExecutor.executeDag(id);
      return c.json(dag);
    } catch (error) {
      console.error('DAG execute error:', error);
      return c.json({ error: error instanceof Error ? error.message : 'Execute failed' }, 400);
    }
  });

  /**
   * POST /:id/nodes/:nodeId/approve - Approve a gate node
   */
  app.post('/:id/nodes/:nodeId/approve', (c) => {
    const dagId = c.req.param('id');
    const nodeId = c.req.param('nodeId');
    const ok = dagExecutor.approveGate(dagId, nodeId);
    if (!ok) return c.json({ error: 'Gate not found or not waiting for approval' }, 400);
    return c.json({ ok: true });
  });

  /**
   * DELETE /:id - Delete a DAG
   */
  app.delete('/:id', (c) => {
    try {
      const id = c.req.param('id');
      const ok = dagExecutor.deleteDag(id);
      if (!ok) return c.json({ error: 'DAG not found' }, 404);
      return c.json({ ok: true });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : 'Delete failed' }, 400);
    }
  });

  return app;
}
