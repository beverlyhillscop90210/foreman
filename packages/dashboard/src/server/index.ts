import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createServer } from 'http';
import type { IncomingMessage, ServerResponse } from 'http';
import { WebSocketManager } from './websocket';
import { tasksRouter } from './routes/tasks';
import { configRouter, initConfigService } from './routes/config';
import { statusRouter } from './routes/status';

const app = new Hono();

// Middleware
app.use('/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.route('/tasks', tasksRouter);
app.route('/config', configRouter);
app.route('/status', statusRouter);

// Root endpoint
app.get('/', (c) => {
  return c.json({
    name: 'Foreman Bridge API',
    version: '0.2.0',
    endpoints: {
      health: '/health',
      status: '/status',
      tasks: '/tasks',
      config: '/config',
      websocket: '/ws',
    },
  });
});

async function startServer() {
  try {
    // Initialize config service
    console.log('Initializing config service...');
    await initConfigService();
    console.log('Config service initialized');

    const port = parseInt(process.env.PORT || '3001', 10);

    // Create HTTP server
    const server = createServer();

    // Initialize WebSocket manager
    console.log('Initializing WebSocket manager...');
    new WebSocketManager(server);
    console.log('WebSocket manager initialized');

    // Attach Hono app to the server
    server.on('request', async (req: IncomingMessage, res: ServerResponse) => {
      const response = await app.fetch(
        new Request(`http://${req.headers.host}${req.url}`, {
          method: req.method,
          headers: req.headers as Record<string, string>,
          body: req.method !== 'GET' && req.method !== 'HEAD' ? (req as any) : undefined,
        })
      );

      res.statusCode = response.status;
      response.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });

      if (response.body) {
        const reader = response.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      }
      res.end();
    });

    // Start listening
    server.listen(port, () => {
      console.log(`🚀 Foreman Bridge API running on http://localhost:${port}`);
      console.log(`📡 WebSocket endpoint available at ws://localhost:${port}/ws`);
      console.log(`📊 Status endpoint: http://localhost:${port}/status`);
      console.log(`🔧 Config endpoint: http://localhost:${port}/config`);
      console.log(`📋 Tasks endpoint: http://localhost:${port}/tasks`);
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down gracefully...');
  process.exit(0);
});

// Start the server
startServer();

