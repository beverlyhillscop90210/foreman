/**
 * Foreman Bridge - Main HTTP API
 */

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { tasksRouter } from './routes/tasks.js';
import { authMiddleware } from './middleware/auth.js';

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors());

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'ok', service: 'foreman-bridge', version: '0.1.0' });
});

// Protected routes
app.use('/tasks/*', authMiddleware);
app.route('/tasks', tasksRouter);

// 404
app.notFound((c) => {
  return c.json({ error: 'Not found' }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('Error:', err);
  return c.json({ error: err.message || 'Internal server error' }, 500);
});

const port = parseInt(process.env.PORT || '3000', 10);

console.log(`🏗️  Foreman Bridge starting on port ${port}...`);

serve({
  fetch: app.fetch,
  port,
});

console.log(`✅ Foreman Bridge running on http://localhost:${port}`);

