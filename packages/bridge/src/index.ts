import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { TaskManager } from './task-manager.js';
import { TaskRunner } from './task-runner.js';
import { KanbanCoordinator } from './kanban-coordinator.js';
import { WebSocketManager } from './websocket.js';
import { createKanbanRoutes } from './routes/kanban.js';

/**
 * Bridge Backend - Integrates WebSocket, QC Runner, and Kanban Coordinator
 */

const app = new Hono();
const taskManager = new TaskManager();
const taskRunner = new TaskRunner();
const kanbanCoordinator = new KanbanCoordinator();

// Wire up TaskRunner events to WebSocket
taskRunner.on('task:started', (task) => {
  console.log(`Task started: ${task.id}`);
  wsManager.broadcast({ type: 'task:started', task });
});

taskRunner.on('task:updated', (task) => {
  console.log(`Task updated: ${task.id} - ${task.status}`);
  wsManager.broadcast({ type: 'task:updated', task });
});

taskRunner.on('task:completed', (task) => {
  console.log(`Task completed: ${task.id}`);
  wsManager.broadcast({ type: 'task:completed', task });
  
  // Update Kanban board when task completes
  if (task.qc_result) {
    kanbanCoordinator.onTaskCompleted(task.id, {
      passed: task.qc_result.passed,
      score: task.qc_result.score,
      summary: task.qc_result.summary,
    });
  }
});

taskRunner.on('task:failed', (task) => {
  console.log(`Task failed: ${task.id}`);
  wsManager.broadcast({ type: 'task:failed', task });
});

// Wire up KanbanCoordinator events to WebSocket
kanbanCoordinator.on('card:created', (card) => {
  console.log(`Card created: ${card.id}`);
  wsManager.broadcast({ type: 'card:created', card });
});

kanbanCoordinator.on('card:moved', (event) => {
  console.log(`Card moved: ${event.card.id} from ${event.from} to ${event.to}`);
  wsManager.broadcast({ type: 'card:moved', card: event.card, from: event.from, to: event.to });
});

kanbanCoordinator.on('card:assigned', (card) => {
  console.log(`Card assigned: ${card.id} to agent ${card.agentId}`);
  wsManager.broadcast({ type: 'card:assigned', card });
});

// Health check endpoint
app.get('/health', (c) => {
  return c.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    websocket_clients: wsManager.getClientCount(),
  });
});

// Task endpoints
app.get('/tasks', (c) => {
  const tasks = taskManager.getTasks();
  return c.json({ tasks });
});

app.get('/tasks/:id', (c) => {
  const id = c.req.param('id');
  const task = taskManager.getTask(id);
  if (!task) {
    return c.json({ error: 'Task not found' }, 404);
  }
  return c.json({ task });
});

// Mount Kanban routes
const kanbanRouter = createKanbanRoutes(kanbanCoordinator);
app.route('/kanban', kanbanRouter);

const PORT = parseInt(process.env.PORT || '3000', 10);

// Use @hono/node-server's serve which returns the underlying http.Server
const server = serve({
  fetch: app.fetch,
  port: PORT,
});

// Attach WebSocket to the HTTP server
// serve() returns a Node.js http.Server
const wsManager = new WebSocketManager(server as any);

console.log(`🏗️  Foreman Bridge running on port ${PORT}`);
console.log(`📡 WebSocket endpoint: ws://localhost:${PORT}/ws`);

// Export for testing
export { app, taskManager, taskRunner, kanbanCoordinator, wsManager };

