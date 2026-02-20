import { Hono } from 'hono';
import { taskRunner } from '../services/taskRunner';

const tasksRouter = new Hono();

// GET /tasks - list all tasks
tasksRouter.get('/', (c) => {
  const tasks = taskRunner.getAllTasks();
  return c.json(tasks);
});

// GET /tasks/:id - get single task
tasksRouter.get('/:id', (c) => {
  const id = c.req.param('id');
  const task = taskRunner.getTask(id);
  
  if (!task) {
    return c.json({ error: 'Task not found' }, 404);
  }
  
  return c.json(task);
});

// POST /tasks - create a new task
tasksRouter.post('/', async (c) => {
  try {
    const body = await c.req.json();
    
    if (!body.title) {
      return c.json({ error: 'Title is required' }, 400);
    }
    
    const task = taskRunner.createTask(
      body.title,
      body.description || '',
      body.bucket || 'default'
    );
    
    return c.json(task, 201);
  } catch (error) {
    console.error('Error creating task:', error);
    return c.json({ error: 'Failed to create task' }, 500);
  }
});

// POST /tasks/:id/start - start a task
tasksRouter.post('/:id/start', async (c) => {
  try {
    const id = c.req.param('id');
    const task = taskRunner.getTask(id);
    
    if (!task) {
      return c.json({ error: 'Task not found' }, 404);
    }
    
    if (task.status !== 'pending') {
      return c.json({ error: 'Task is not in pending state' }, 400);
    }
    
    // Start the task asynchronously
    taskRunner.runTask(id).catch(err => {
      console.error(`Error running task ${id}:`, err);
      taskRunner.updateTaskStatus(id, 'failed');
    });
    
    return c.json({ success: true, message: 'Task started' });
  } catch (error) {
    console.error('Error starting task:', error);
    return c.json({ error: 'Failed to start task' }, 500);
  }
});

// POST /tasks/:id/stop - stop a running task
tasksRouter.post('/:id/stop', async (c) => {
  try {
    const id = c.req.param('id');
    const task = taskRunner.getTask(id);
    
    if (!task) {
      return c.json({ error: 'Task not found' }, 404);
    }
    
    if (task.status !== 'running') {
      return c.json({ error: 'Task is not running' }, 400);
    }
    
    // In a real implementation, this would kill the agent process
    taskRunner.updateTaskStatus(id, 'failed');
    taskRunner.addTaskOutput(id, 'Task stopped by user', 'system');
    
    return c.json({ success: true, message: 'Task stopped' });
  } catch (error) {
    console.error('Error stopping task:', error);
    return c.json({ error: 'Failed to stop task' }, 500);
  }
});

export { tasksRouter };

