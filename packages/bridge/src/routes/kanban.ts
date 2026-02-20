import { Hono } from 'hono';
import { KanbanCoordinator } from '../kanban-coordinator';
import type { KanbanColumn } from '../types';

export function createKanbanRoutes(coordinator: KanbanCoordinator) {
  const app = new Hono();

  /**
   * GET /kanban - List all cards
   * Query params:
   *   - column: filter by column (optional)
   *   - project: filter by project (optional)
   */
  app.get('/', (c) => {
    const column = c.req.query('column') as KanbanColumn | undefined;
    const project = c.req.query('project');
    
    const filter: { column?: KanbanColumn; project?: string } = {};
    if (column) filter.column = column;
    if (project) filter.project = project;
    
    const cards = coordinator.getCards(Object.keys(filter).length > 0 ? filter : undefined);
    return c.json({ cards });
  });

  /**
   * GET /kanban/summary - Board summary (counts per column)
   */
  app.get('/summary', (c) => {
    const summary = coordinator.getSummary();
    return c.json({ summary });
  });

  /**
   * POST /kanban - Add new card
   * Body: {
   *   title: string,
   *   description?: string,
   *   column: KanbanColumn,
   *   project: string,
   *   priority: 'low' | 'medium' | 'high' | 'critical',
   *   labels?: string[]
   * }
   */
  app.post('/', async (c) => {
    const body = await c.req.json();
    
    const { title, description, column, project, priority, labels } = body;
    
    if (!title || !column || !project || !priority) {
      return c.json({ error: 'Missing required fields: title, column, project, priority' }, 400);
    }
    
    const card = coordinator.addCard({
      title,
      description,
      column,
      project,
      priority,
      labels: labels || [],
    });
    
    return c.json({ card }, 201);
  });

  /**
   * PUT /kanban/:id/move - Move card to column
   * Body: { column: KanbanColumn }
   */
  app.put('/:id/move', async (c) => {
    const cardId = c.req.param('id');
    const body = await c.req.json();
    const { column } = body;
    
    if (!column) {
      return c.json({ error: 'Missing required field: column' }, 400);
    }
    
    const card = coordinator.moveCard(cardId, column);
    
    if (!card) {
      return c.json({ error: 'Card not found' }, 404);
    }
    
    return c.json({ card });
  });

  /**
   * PUT /kanban/:id/assign - Assign agent to card
   * Body: { taskId: string, agentId: string }
   */
  app.put('/:id/assign', async (c) => {
    const cardId = c.req.param('id');
    const body = await c.req.json();
    const { taskId, agentId } = body;
    
    if (!taskId || !agentId) {
      return c.json({ error: 'Missing required fields: taskId, agentId' }, 400);
    }
    
    const card = coordinator.assignAgent(cardId, taskId, agentId);
    
    if (!card) {
      return c.json({ error: 'Card not found' }, 404);
    }
    
    return c.json({ card });
  });

  return app;
}

