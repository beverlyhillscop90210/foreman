import { Hono } from 'hono';
import { dagManager } from '../services.js';

export const dagsRouter = new Hono();

// Create DAG
dagsRouter.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const dag = await dagManager.createDAG(body);
    return c.json(dag, 201);
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

// List DAGs
dagsRouter.get('/', async (c) => {
  const dags = await dagManager.listDAGs();
  return c.json(dags);
});

// Get DAG
dagsRouter.get('/:id', async (c) => {
  const id = c.req.param('id');
  const dag = await dagManager.getDAG(id);
  
  if (!dag) {
    return c.json({ error: 'DAG not found' }, 404);
  }
  
  return c.json(dag);
});

// Execute DAG
dagsRouter.post('/:id/execute', async (c) => {
  const id = c.req.param('id');
  
  try {
    const dag = await dagManager.executeDAG(id);
    return c.json(dag);
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

// Cancel DAG
dagsRouter.post('/:id/cancel', async (c) => {
  const id = c.req.param('id');
  
  try {
    const dag = await dagManager.cancelDAG(id);
    return c.json(dag);
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});
