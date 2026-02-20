import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { TaskManager } from './task-manager.js';
import { TaskRunner } from './task-runner.js';
import { KanbanCoordinator } from './kanban-coordinator.js';
import { WebSocketManager } from './websocket.js';
import { createKanbanRoutes } from './routes/kanban.js';
import { configRouter, initConfigService, configService } from './routes/config.js';

/**
 * Bridge Backend - Integrates WebSocket, QC Runner, and Kanban Coordinator
 */

const app = new Hono();

// Middleware
app.use('/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

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

// Chat endpoint for Smartass
app.post('/chat', async (c) => {
  try {
    const body = await c.req.json();
    const { message, history } = body;
    
    const apiKeyEntry = await configService.getConfig('OPENROUTER_API_KEY', true);
    if (!apiKeyEntry || !apiKeyEntry.value) {
      return c.json({ error: 'OPENROUTER_API_KEY not configured' }, 500);
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKeyEntry.value}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openrouter/anthropic/claude-3.5-sonnet',
        messages: [
          { role: 'system', content: 'You are Smartass, an expert AI assistant for the Foreman project. You help the user with their tasks, knowledge base, and project management.' },
          ...(history || []),
          { role: 'user', content: message }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenRouter API error:', errorText);
      return c.json({ error: `OpenRouter API error: ${response.statusText}` }, 500);
    }

    const data = await response.json() as any;
    return c.json({ content: data.choices[0].message.content });
  } catch (error) {
    console.error('Chat error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Mount Config routes
app.route('/config', configRouter);

const PORT = parseInt(process.env.PORT || '3000', 10);

// Initialize config service before starting server
await initConfigService();

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

