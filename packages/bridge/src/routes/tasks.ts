/**
 * Tasks API routes
 */

import { Hono } from 'hono';
import { TaskManager } from '../task-manager.js';
import type { CreateTaskRequest, ApproveRequest, RejectRequest } from '../types.js';

export const tasksRouter = new Hono();
const taskManager = new TaskManager();

// POST /tasks - Create new task
tasksRouter.post('/', async (c) => {
  try {
    const body = await c.req.json<CreateTaskRequest>();
    
    // Validate required fields
    if (!body.project || !body.title || !body.briefing || !body.allowed_files) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    const task = await taskManager.createTask(body);
    return c.json(task, 201);
  } catch (error) {
    console.error('Error creating task:', error);
    return c.json(
      { error: error instanceof Error ? error.message : 'Failed to create task' },
      500
    );
  }
});

// GET /tasks/:id - Get task status
tasksRouter.get('/:id', async (c) => {
  const id = c.req.param('id');
  const task = await taskManager.getTask(id);

  if (!task) {
    return c.json({ error: 'Task not found' }, 404);
  }

  return c.json(task);
});

// GET /tasks/:id/diff - Get task diff
tasksRouter.get('/:id/diff', async (c) => {
  const id = c.req.param('id');
  const diff = await taskManager.getTaskDiff(id);

  if (!diff) {
    return c.json({ error: 'Task not found or no diff available' }, 404);
  }

  return c.text(diff);
});

// POST /tasks/:id/approve - Approve and commit
tasksRouter.post('/:id/approve', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<ApproveRequest>();

  try {
    const result = await taskManager.approveTask(id, body);
    return c.json(result);
  } catch (error) {
    console.error('Error approving task:', error);
    return c.json(
      { error: error instanceof Error ? error.message : 'Failed to approve task' },
      500
    );
  }
});

// POST /tasks/:id/reject - Reject with feedback
tasksRouter.post('/:id/reject', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<RejectRequest>();

  try {
    const result = await taskManager.rejectTask(id, body);
    return c.json(result);
  } catch (error) {
    console.error('Error rejecting task:', error);
    return c.json(
      { error: error instanceof Error ? error.message : 'Failed to reject task' },
      500
    );
  }
});

// GET /tasks - List all tasks
tasksRouter.get('/', async (c) => {
  const tasks = await taskManager.listTasks();
  return c.json({ tasks });
});

