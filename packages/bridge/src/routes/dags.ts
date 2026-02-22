import { Hono } from 'hono';
import { DagExecutor } from '../dag-executor.js';
import { generateDagFromBrief } from '../planner.js';
import type { KnowledgeService } from '../services/knowledge.js';

export function createDagRoutes(dagExecutor: DagExecutor, knowledgeService?: KnowledgeService) {
  const app = new Hono();

  /**
   * POST /plan - Use the Planner agent to generate a DAG from a brief
   * This must be BEFORE /:id routes to avoid matching "plan" as an ID
   */
  app.post('/plan', async (c) => {
    try {
      const body = await c.req.json();
      if (!body.project || !body.brief) {
        return c.json({ error: 'project and brief are required' }, 400);
      }

      // Optionally load project knowledge as extra context
      let context = body.context || '';
      if (knowledgeService && !context) {
        try {
          const docs = await knowledgeService.semanticSearch(body.brief, { limit: 3 });
          if (docs.length > 0) {
            context = docs.map(d => `### ${d.title}\n${d.content.slice(0, 800)}`).join('\n\n');
          }
        } catch { /* no knowledge available, continue without */ }
      }

      const dagInput = await generateDagFromBrief({
        project: body.project,
        brief: body.brief,
        context,
      });

      // Auto-create the DAG if requested (default: true)
      if (body.auto_create !== false) {
        const dag = dagExecutor.createDag(dagInput);
        return c.json({ dag, planned: dagInput }, 201);
      }

      // Just return the planned DAG without creating it
      return c.json({ planned: dagInput });
    } catch (error) {
      console.error('Planner error:', error);
      return c.json({ error: error instanceof Error ? error.message : 'Planning failed' }, 500);
    }
  });

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
   * POST /:id/nodes - Add a node dynamically (sub-agent spawning)
   */
  app.post('/:id/nodes', async (c) => {
    try {
      const dagId = c.req.param('id');
      const body = await c.req.json();
      if (!body.node) {
        return c.json({ error: 'node is required' }, 400);
      }
      const newNode = dagExecutor.addNode(dagId, {
        node: body.node,
        edges: body.edges || [],
      });
      return c.json({ node: newNode }, 201);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : 'Failed to add node' }, 400);
    }
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
