/**
 * Tasks API routes
 */

import { Hono, Context } from 'hono';
import { TaskManager } from '../task-manager.js';
import type { CreateTaskRequest, ApproveRequest, RejectRequest } from '../types.js';
import { authMiddleware } from '../middleware/auth.js';

// Define context variables type
type Variables = {
  user: {
    id: string;
    role: string;
  };
};

export const tasksRouter = new Hono<{ Variables: Variables }>();
const taskManager = new TaskManager();

// Apply auth middleware to all task routes
tasksRouter.use('/*', authMiddleware);

// Export taskManager for WebSocket integration
export function getTaskManager(): TaskManager {
  return taskManager;
}

// POST /tasks - Create new task
tasksRouter.post('/', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json<CreateTaskRequest>();

    // Validate required fields
    if (!body.project || (!body.description && !body.briefing) || !body.allowed_files) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    // Map briefing to description if needed
    if (body.briefing && !body.description) {
      body.description = body.briefing;
    }

    const task = await taskManager.createTask({
      ...body,
      user_id: user.id,
    });
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
  const user = c.get('user');
  const id = c.req.param('id');
  const task = await taskManager.getTask(id, user.id);

  if (!task) {
    return c.json({ error: 'Task not found' }, 404);
  }

  return c.json(task);
});

// GET /tasks/:id/diff - Get task diff
tasksRouter.get('/:id/diff', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  // Verify ownership first
  const task = await taskManager.getTask(id, user.id);
  if (!task) {
    return c.json({ error: 'Task not found' }, 404);
  }

  const diff = await taskManager.getTaskDiff(id);
  if (!diff) {
    return c.json({ error: 'No diff available' }, 404);
  }

  return c.text(diff);
});

// POST /tasks/:id/start - Start a task
tasksRouter.post('/:id/start', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const task = await taskManager.getTask(id, user.id);

  if (!task) {
    return c.json({ error: 'Task not found' }, 404);
  }

  if (task.status !== 'pending') {
    return c.json({ error: 'Task is not in pending state' }, 400);
  }

  // Import taskRunner dynamically or get it from somewhere
  // Actually, we can just emit an event or use the global taskRunner
  // Since taskRunner is exported from index.ts, we can import it
  const { taskRunner } = await import('../index.js');
  taskRunner.runTask(task).catch(err => console.error('Failed to run task:', err));

  return c.json({ success: true, message: 'Task started' });
});

// POST /tasks/:id/approve - Approve and commit
tasksRouter.post('/:id/approve', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  // Verify ownership first
  const task = await taskManager.getTask(id, user.id);
  if (!task) {
    return c.json({ error: 'Task not found' }, 404);
  }

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
  const user = c.get('user');
  const id = c.req.param('id');

  // Verify ownership first
  const task = await taskManager.getTask(id, user.id);
  if (!task) {
    return c.json({ error: 'Task not found' }, 404);
  }

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

// GET /tasks - List all tasks (filtered by user)
tasksRouter.get('/', async (c) => {
  const user = c.get('user');
  const tasks = await taskManager.listTasks(user.id);
  return c.json({ tasks });
});

// DELETE /tasks/:id - Delete a task
tasksRouter.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  // Verify ownership first
  const task = await taskManager.getTask(id, user.id);
  if (!task) {
    return c.json({ error: 'Task not found' }, 404);
  }

  if (task.status === 'running') {
    return c.json({ error: 'Cannot delete a running task' }, 400);
  }

  taskManager.deleteTask(id);
  return c.json({ success: true, message: `Task ${id} deleted` });
});

