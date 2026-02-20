import { Hono } from 'hono';
import { taskRunner } from '../services/taskRunner';
import type { SystemStatus } from '../types';

const statusRouter = new Hono();

const startTime = Date.now();

// GET /status - get system status
statusRouter.get('/', (c) => {
  const taskStats = taskRunner.getTaskStats();
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  
  const status: SystemStatus = {
    agents: {
      running: taskRunner.getRunningTasksCount(),
      max: taskRunner.getMaxAgents(),
    },
    tasks: taskStats,
    uptime,
    version: '0.2.0',
  };
  
  return c.json(status);
});

export { statusRouter };

