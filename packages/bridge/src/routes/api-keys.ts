import { Hono, Context } from 'hono';
import { apiKeyService } from '../services/api-keys.js';
import { authMiddleware } from '../middleware/auth.js';

// Define context variables type
type Variables = {
  user: {
    id: string;
    role: string;
  };
};

export const apiKeysRouter = new Hono<{ Variables: Variables }>();

// Apply auth middleware to all routes
apiKeysRouter.use('/*', authMiddleware);

// GET /api-keys - List user's API keys (without values)
apiKeysRouter.get('/', async (c) => {
  try {
    const user = c.get('user');
    const keys = await apiKeyService.listKeys(user.id);
    return c.json({ keys });
  } catch (error) {
    console.error('Error listing API keys:', error);
    return c.json(
      { error: error instanceof Error ? error.message : 'Failed to list API keys' },
      500
    );
  }
});

// PUT /api-keys/:provider - Set API key for a provider
apiKeysRouter.put('/:provider', async (c) => {
  try {
    const user = c.get('user');
    const provider = c.req.param('provider');
    const body = await c.req.json<{ key_value: string }>();

    if (!body.key_value) {
      return c.json({ error: 'key_value is required' }, 400);
    }

    // Validate provider
    const validProviders = ['anthropic', 'openrouter', 'openai', 'gemini'];
    if (!validProviders.includes(provider.toLowerCase())) {
      return c.json({ error: `Invalid provider. Must be one of: ${validProviders.join(', ')}` }, 400);
    }

    await apiKeyService.setKey(user.id, provider.toLowerCase(), body.key_value);
    
    return c.json({ 
      success: true, 
      message: `API key for ${provider} saved successfully` 
    });
  } catch (error) {
    console.error('Error setting API key:', error);
    return c.json(
      { error: error instanceof Error ? error.message : 'Failed to set API key' },
      500
    );
  }
});

// DELETE /api-keys/:provider - Delete API key for a provider
apiKeysRouter.delete('/:provider', async (c) => {
  try {
    const user = c.get('user');
    const provider = c.req.param('provider');

    await apiKeyService.deleteKey(user.id, provider.toLowerCase());
    
    return c.json({ 
      success: true, 
      message: `API key for ${provider} deleted successfully` 
    });
  } catch (error) {
    console.error('Error deleting API key:', error);
    return c.json(
      { error: error instanceof Error ? error.message : 'Failed to delete API key' },
      500
    );
  }
});

