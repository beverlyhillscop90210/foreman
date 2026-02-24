# Briefing: Ollama Integration & Model Selection

## Ziel

Benutzer soll:
1. Ollama als LLM Backend auswählen können (statt Claude)
2. Ein spezifisches Modell wählen können (z.B. `qwen2.5-coder:32b`, nicht nur "Ollama")
3. Connection persistent halten (kein Timeout/Disconnect)

---

## Aktueller Stand

Foreman nutzt aktuell nur Claude Code als Agent Backend. Es gibt keine UI/API um:
- Alternative LLM Endpoints zu konfigurieren
- Zwischen Modellen zu wechseln
- Lokale Ollama Instanzen zu verbinden

---

## Lösung

### 1. Settings UI: LLM Backends

```
Settings → LLM Backends

┌─────────────────────────────────────────────────────────────┐
│ Default Backend                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ○ Claude (Anthropic API)                                │ │
│ │   Model: claude-sonnet-4-20250514                       │ │
│ │   Status: ✓ Connected                                   │ │
│ │                                                         │ │
│ │ ● Ollama (Local)                                        │ │
│ │   Endpoint: http://localhost:11434                      │ │
│ │   Model: [▼ qwen2.5-coder:32b____________]              │ │
│ │          ├─ qwen2.5-coder:32b (18.5 GB)                │ │
│ │          ├─ qwen2.5-coder:14b (9.0 GB)                 │ │
│ │          ├─ codestral:22b (12.3 GB)                    │ │
│ │          ├─ llama3.2:8b (4.7 GB)                       │ │
│ │          └─ deepseek-coder-v2:16b (8.9 GB)             │ │
│ │   Status: ✓ Connected (5 models available)              │ │
│ │                                                         │ │
│ │ ○ Ollama (Remote via Tunnel)                            │ │
│ │   Endpoint: https://ollama-home.foreman.run             │ │
│ │   Model: [▼ Select model...]                            │ │
│ │   Status: ⏳ Connecting...                              │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ [+ Add Custom Endpoint]                                     │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ☐ Fallback to Claude if Ollama unavailable              │ │
│ │ ☐ Use Ollama for code tasks, Claude for research        │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│                                          [Save Settings]    │
└─────────────────────────────────────────────────────────────┘
```

---

### 2. Database Schema

```sql
-- Migration: 008_llm_backends.sql

CREATE TABLE llm_backends (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,                    -- "Local Ollama", "Home Server Ollama"
  type TEXT NOT NULL,                    -- 'claude' | 'ollama' | 'openai' | 'custom'
  endpoint TEXT,                         -- http://localhost:11434, https://ollama-home.foreman.run
  api_key TEXT,                          -- encrypted, nullable for Ollama
  is_default BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE llm_backend_models (
  id TEXT PRIMARY KEY,
  backend_id TEXT REFERENCES llm_backends(id) ON DELETE CASCADE,
  model_name TEXT NOT NULL,              -- "qwen2.5-coder:32b"
  model_size_bytes BIGINT,               -- 18500000000
  is_selected BOOLEAN DEFAULT FALSE,     -- currently selected model for this backend
  last_seen_at TIMESTAMP,                -- when model was last detected
  created_at TIMESTAMP DEFAULT NOW()
);

-- User preference: which backend is default
CREATE TABLE user_llm_preferences (
  user_id TEXT PRIMARY KEY,
  default_backend_id TEXT REFERENCES llm_backends(id),
  fallback_to_claude BOOLEAN DEFAULT TRUE,
  use_ollama_for_code BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

### 3. Backend Service

```typescript
// src/services/llm-backend.service.ts

import Anthropic from '@anthropic-ai/sdk';

interface LLMBackend {
  id: string;
  type: 'claude' | 'ollama' | 'openai' | 'custom';
  endpoint?: string;
  apiKey?: string;
  selectedModel?: string;
}

interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
}

export class LLMBackendService {
  
  /**
   * Discover available models from Ollama endpoint
   */
  async discoverOllamaModels(endpoint: string): Promise<OllamaModel[]> {
    const response = await fetch(`${endpoint}/api/tags`);
    if (!response.ok) {
      throw new Error(`Ollama not reachable: ${response.status}`);
    }
    const data = await response.json();
    return data.models.map((m: any) => ({
      name: m.name,
      size: m.size,
      modified_at: m.modified_at,
    }));
  }

  /**
   * Test connection to Ollama endpoint
   */
  async testOllamaConnection(endpoint: string): Promise<{ 
    connected: boolean; 
    models: OllamaModel[];
    error?: string;
  }> {
    try {
      const models = await this.discoverOllamaModels(endpoint);
      return { connected: true, models };
    } catch (error) {
      return { 
        connected: false, 
        models: [], 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Send completion request to appropriate backend
   */
  async complete(
    backend: LLMBackend,
    messages: Array<{ role: string; content: string }>,
    options?: { stream?: boolean }
  ): Promise<AsyncIterable<string> | string> {
    
    switch (backend.type) {
      case 'claude':
        return this.completeClaude(backend, messages, options);
      
      case 'ollama':
        return this.completeOllama(backend, messages, options);
      
      default:
        throw new Error(`Unknown backend type: ${backend.type}`);
    }
  }

  private async completeOllama(
    backend: LLMBackend,
    messages: Array<{ role: string; content: string }>,
    options?: { stream?: boolean }
  ): Promise<AsyncIterable<string> | string> {
    
    const response = await fetch(`${backend.endpoint}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: backend.selectedModel,
        messages,
        stream: options?.stream ?? true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status}`);
    }

    if (options?.stream) {
      return this.streamOllamaResponse(response);
    } else {
      const data = await response.json();
      return data.message.content;
    }
  }

  private async *streamOllamaResponse(response: Response): AsyncIterable<string> {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(Boolean);
      
      for (const line of lines) {
        try {
          const json = JSON.parse(line);
          if (json.message?.content) {
            yield json.message.content;
          }
        } catch {
          // skip invalid JSON lines
        }
      }
    }
  }

  private async completeClaude(
    backend: LLMBackend,
    messages: Array<{ role: string; content: string }>,
    options?: { stream?: boolean }
  ): Promise<AsyncIterable<string> | string> {
    const client = new Anthropic({ apiKey: backend.apiKey });
    
    // ... existing Claude implementation
  }
}
```

---

### 4. Keep Connection Alive

Das Problem: Ollama schließt idle connections. Lösung: Heartbeat + Connection Pool.

```typescript
// src/services/ollama-connection.service.ts

export class OllamaConnectionService {
  private endpoints: Map<string, {
    lastPing: number;
    healthy: boolean;
    models: string[];
  }> = new Map();

  private heartbeatInterval: NodeJS.Timeout | null = null;

  /**
   * Start heartbeat loop für alle registrierten Ollama endpoints
   */
  startHeartbeat(intervalMs = 30000) {
    if (this.heartbeatInterval) return;

    this.heartbeatInterval = setInterval(async () => {
      for (const [endpoint, state] of this.endpoints) {
        try {
          // Lightweight ping - just check /api/tags
          const response = await fetch(`${endpoint}/api/tags`, {
            signal: AbortSignal.timeout(5000),
          });
          
          if (response.ok) {
            const data = await response.json();
            state.healthy = true;
            state.lastPing = Date.now();
            state.models = data.models.map((m: any) => m.name);
          } else {
            state.healthy = false;
          }
        } catch {
          state.healthy = false;
        }
      }
    }, intervalMs);
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Register endpoint für monitoring
   */
  registerEndpoint(endpoint: string) {
    if (!this.endpoints.has(endpoint)) {
      this.endpoints.set(endpoint, {
        lastPing: 0,
        healthy: false,
        models: [],
      });
    }
  }

  /**
   * Get connection status
   */
  getStatus(endpoint: string): { healthy: boolean; lastPing: number; models: string[] } | null {
    return this.endpoints.get(endpoint) || null;
  }

  /**
   * Check if endpoint is healthy before making request
   */
  isHealthy(endpoint: string): boolean {
    const state = this.endpoints.get(endpoint);
    if (!state) return false;
    
    // Consider unhealthy if no ping in last 60 seconds
    const staleThreshold = 60000;
    return state.healthy && (Date.now() - state.lastPing) < staleThreshold;
  }
}
```

---

### 5. API Endpoints

```typescript
// src/api/llm-backends.routes.ts

router.get('/backends', async (req, res) => {
  // List all configured backends for user
});

router.post('/backends', async (req, res) => {
  // Add new backend (Ollama endpoint, API key, etc.)
});

router.patch('/backends/:id', async (req, res) => {
  // Update backend (change model, endpoint, etc.)
});

router.delete('/backends/:id', async (req, res) => {
  // Remove backend
});

router.post('/backends/:id/test', async (req, res) => {
  // Test connection, return available models
});

router.get('/backends/:id/models', async (req, res) => {
  // Refresh and return available models for Ollama backend
});

router.post('/backends/:id/select-model', async (req, res) => {
  // Select which model to use for this backend
  const { modelName } = req.body;
  // Update llm_backend_models.is_selected
});

router.get('/backends/status', async (req, res) => {
  // Get health status of all backends
  // Returns connection state, selected model, last ping, etc.
});

router.post('/preferences', async (req, res) => {
  // Update user preferences (default backend, fallback settings)
});
```

---

### 6. Frontend: Model Selector Component

```tsx
// components/ModelSelector.tsx

interface ModelSelectorProps {
  backendId: string;
  endpoint: string;
  selectedModel?: string;
  onModelSelect: (model: string) => void;
}

export function ModelSelector({ backendId, endpoint, selectedModel, onModelSelect }: ModelSelectorProps) {
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadModels();
  }, [endpoint]);

  async function loadModels() {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/llm/backends/${backendId}/models`);
      const data = await response.json();
      setModels(data.models);
    } catch (err) {
      setError('Failed to load models');
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <Spinner />;
  if (error) return <ErrorMessage message={error} onRetry={loadModels} />;

  return (
    <Select value={selectedModel} onValueChange={onModelSelect}>
      <SelectTrigger>
        <SelectValue placeholder="Select model..." />
      </SelectTrigger>
      <SelectContent>
        {models.map((model) => (
          <SelectItem key={model.name} value={model.name}>
            <div className="flex justify-between items-center w-full">
              <span>{model.name}</span>
              <span className="text-muted-foreground text-sm">
                {formatBytes(model.size)}
              </span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

---

### 7. Agent Integration

Der Agent muss wissen welches Backend zu nutzen ist:

```typescript
// src/services/agent.service.ts

export class AgentService {
  constructor(
    private llmBackendService: LLMBackendService,
    private ollamaConnection: OllamaConnectionService,
  ) {}

  async runTask(task: Task, userId: string) {
    // 1. Get user's preferred backend
    const prefs = await this.getUserPreferences(userId);
    const backend = await this.getBackend(prefs.defaultBackendId);

    // 2. Check if Ollama is healthy (if selected)
    if (backend.type === 'ollama') {
      if (!this.ollamaConnection.isHealthy(backend.endpoint!)) {
        if (prefs.fallbackToClaude) {
          // Fallback to Claude
          backend = await this.getClaudeBackend(userId);
          console.log('Ollama unhealthy, falling back to Claude');
        } else {
          throw new Error('Ollama is not available and fallback is disabled');
        }
      }
    }

    // 3. Run with selected backend + model
    const response = await this.llmBackendService.complete(
      backend,
      this.buildMessages(task),
      { stream: true }
    );

    // ... process response
  }
}
```

---

## Implementation Checklist

### Phase 1: Backend Core
- [ ] DB Migration `008_llm_backends.sql`
- [ ] `LLMBackendService` mit Ollama support
- [ ] `OllamaConnectionService` mit Heartbeat
- [ ] API routes für backend CRUD

### Phase 2: Model Discovery
- [ ] Endpoint `/api/llm/backends/:id/models`
- [ ] Model caching in DB
- [ ] Model size display

### Phase 3: UI
- [ ] Settings page "LLM Backends"
- [ ] `ModelSelector` component
- [ ] Connection status indicator
- [ ] Test connection button

### Phase 4: Agent Integration
- [ ] Agent uses configured backend
- [ ] Fallback logic (Ollama → Claude)
- [ ] Per-task backend override (optional)

---

## Config Example

User's final config in DB:

```json
{
  "backend": {
    "id": "ollama-local",
    "type": "ollama",
    "endpoint": "http://localhost:11434",
    "selectedModel": "qwen2.5-coder:32b"
  },
  "preferences": {
    "fallbackToClaude": true,
    "useOllamaForCode": true
  }
}
```

---

## Key Points

1. **Model Selection** – Dropdown zeigt alle verfügbaren Modelle mit Größe
2. **Keep Alive** – 30s Heartbeat hält Connection offen und tracked Health
3. **Fallback** – Optional: wenn Ollama down → automatisch zu Claude
4. **Per-User** – Jeder User hat eigene Backend Config
5. **Multi-Endpoint** – Kann mehrere Ollama Instanzen haben (local + remote)
