import { Hono } from 'hono';
import { KnowledgeService } from '../services/knowledge.js';

export function createKnowledgeRoutes(knowledgeService: KnowledgeService) {
  const app = new Hono();

  /**
   * GET / - List knowledge documents
   * Query: ?search=...&category=...
   */
  app.get('/', async (c) => {
    const search = c.req.query('search');
    const category = c.req.query('category');
    const documents = await knowledgeService.list(search, category);
    return c.json({ documents });
  });

  /**
   * GET /categories - List distinct categories
   */
  app.get('/categories', async (c) => {
    const categories = await knowledgeService.getCategories();
    return c.json({ categories });
  });

  /**
   * GET /search - Semantic (vector) search
   * Query: ?q=...&threshold=0.5&limit=10&category=...
   */
  app.get('/search', async (c) => {
    const q = c.req.query('q');
    if (!q) return c.json({ error: 'Missing query parameter q' }, 400);

    const threshold = parseFloat(c.req.query('threshold') || '0.5');
    const limit = parseInt(c.req.query('limit') || '10', 10);
    const category = c.req.query('category');

    const documents = await knowledgeService.semanticSearch(q, { threshold, limit, category });
    return c.json({ documents });
  });

  /**
   * GET /:id - Get single document
   */
  app.get('/:id', async (c) => {
    const id = c.req.param('id');
    const doc = await knowledgeService.get(id);
    if (!doc) return c.json({ error: 'Not found' }, 404);
    return c.json({ document: doc });
  });

  /**
   * POST / - Create new document
   */
  app.post('/', async (c) => {
    try {
      const body = await c.req.json();
      const doc = await knowledgeService.create({
        title: body.title,
        content: body.content,
        category: body.category,
        source_type: body.source_type,
        source_url: body.source_url,
        source_task_id: body.source_task_id,
        tags: body.tags,
        metadata: body.metadata,
      });
      return c.json({ document: doc }, 201);
    } catch (error) {
      console.error('Knowledge create error:', error);
      return c.json({ error: error instanceof Error ? error.message : 'Create failed' }, 500);
    }
  });

  /**
   * PUT /:id - Update document
   */
  app.put('/:id', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json();
    const doc = await knowledgeService.update(id, body);
    if (!doc) return c.json({ error: 'Not found' }, 404);
    return c.json({ document: doc });
  });

  /**
   * DELETE /:id - Delete document
   */
  app.delete('/:id', async (c) => {
    const id = c.req.param('id');
    const ok = await knowledgeService.delete(id);
    if (!ok) return c.json({ error: 'Not found' }, 404);
    return c.json({ ok: true });
  });

  return app;
}
