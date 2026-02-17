/**
 * Authentication middleware
 */

import type { Context, Next } from 'hono';

const VALID_TOKENS = new Set([
  process.env.FOREMAN_API_TOKEN || 'dev-token-change-me',
]);

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader) {
    return c.json({ error: 'Missing Authorization header' }, 401);
  }

  const token = authHeader.replace('Bearer ', '');

  if (!VALID_TOKENS.has(token)) {
    return c.json({ error: 'Invalid token' }, 401);
  }

  await next();
}

