# Briefing: Device Connection Layer für Foreman

## Vision

Foreman soll beliebige Compute-Ressourcen verbinden können – DGX Spark, Jetson, lokales Ollama, Home Server, Cloud VMs. Alles über Cloudflare Tunnel, zero port-forwarding, zero VPN.

## Architektur

```
┌─────────────────────────────────────────────────────────────┐
│                    Foreman Cloud                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Dashboard   │  │ REST API    │  │ Device Registry     │  │
│  │ (Settings)  │  │             │  │ (SQLite/Postgres)   │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│         │                │                   │               │
│         └────────────────┼───────────────────┘               │
│                          │                                   │
│              Cloudflare Access (Zero Trust)                  │
└──────────────────────────┼───────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
   ┌──────┴──────┐  ┌──────┴──────┐  ┌──────┴──────┐
   │ DGX Spark   │  │ Jetson AGX  │  │ Home Server │
   │ cloudflared │  │ cloudflared │  │ cloudflared │
   │             │  │             │  │ ollama:11434│
   │ Isaac Lab   │  │ TensorRT    │  │             │
   │ Training    │  │ Inference   │  │             │
   └─────────────┘  └─────────────┘  └─────────────┘
```

---

## User Flow

### 1. Device hinzufügen (Dashboard)

```
Settings → Devices → Add Device

Name: [DGX Spark - Training     ]
Type: [● GPU Compute  ○ Inference  ○ LLM Endpoint]
      
[Generate Connection Token]

↓

"Run this on your device:"
┌────────────────────────────────────────────────────────┐
│ curl -fsSL https://foreman.ai/install-agent.sh | bash │
│ foreman-agent connect --token eyJhbG...              │
└────────────────────────────────────────────────────────┘
```

### 2. Agent Installation auf Device

```bash
# install-agent.sh macht:
# 1. Installiert cloudflared
# 2. Installiert foreman-agent (Go/Rust binary)
# 3. Registriert als systemd service

foreman-agent connect --token <TOKEN>

# Output:
✓ Authenticated with Foreman Cloud
✓ Cloudflare Tunnel established: spark-3f9e.foreman.run
✓ Device registered: DGX Spark - Training
✓ Capabilities detected:
  - NVIDIA GB10 (128GB unified)
  - CUDA 13.0
  - Isaac Lab 0.54.3
  - Python 3.11

Listening for tasks...
```

### 3. Device erscheint im Dashboard

```
Settings → Devices

┌─────────────────────────────────────────────────────────┐
│ 🟢 DGX Spark - Training                                 │
│    spark-3f9e.foreman.run                               │
│    GPU: GB10 128GB │ CUDA 13.0 │ Isaac Lab 0.54.3      │
│    Last seen: just now                                  │
│    [SSH Terminal] [Logs] [Disconnect]                   │
├─────────────────────────────────────────────────────────┤
│ 🟢 Jetson AGX Orin                                      │
│    jetson-zeon.foreman.run                              │
│    GPU: Ampere 64GB │ TensorRT 10.3                     │
│    Last seen: 2 min ago                                 │
│    [SSH Terminal] [Logs] [Disconnect]                   │
├─────────────────────────────────────────────────────────┤
│ 🟢 Local Ollama                                         │
│    ollama-mbp.foreman.run                               │
│    Models: llama3.2, codestral, qwen2.5-coder          │
│    Last seen: just now                                  │
│    [Configure as Agent Backend]                         │
└─────────────────────────────────────────────────────────┘
```

### 4. Device in DAG nutzen

```json
{
  "nodes": [
    {
      "id": "train-policy",
      "role": "TRAIN-RUNNER",
      "device": "dgx-spark-training",
      "briefing": "..."
    },
    {
      "id": "deploy",
      "role": "INFRA-JETSON", 
      "device": "jetson-zeon",
      "briefing": "..."
    }
  ]
}
```

### 5. Ollama als Agent Backend

```
Settings → Agent Backends

Default: Claude Code (Anthropic API)

Custom:
┌─────────────────────────────────────────────────────────┐
│ ☑ Local Ollama                                          │
│   Endpoint: ollama-mbp.foreman.run                      │
│   Model: qwen2.5-coder:32b                              │
│   Use for: [☑ Code tasks] [☐ Research] [☐ All]         │
└─────────────────────────────────────────────────────────┘
```

---

## Backend Implementation

### Device Registry Schema

```typescript
// src/db/schema.ts
export const devices = sqliteTable('devices', {
  id: text('id').primaryKey(), // uuid
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  type: text('type').notNull(), // 'gpu_compute' | 'inference' | 'llm_endpoint'
  tunnelId: text('tunnel_id'), // Cloudflare tunnel ID
  tunnelHostname: text('tunnel_hostname'), // spark-3f9e.foreman.run
  capabilities: text('capabilities', { mode: 'json' }), // detected hardware/software
  status: text('status').default('pending'), // 'pending' | 'online' | 'offline'
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).defaultNow(),
});

export const deviceTokens = sqliteTable('device_tokens', {
  id: text('id').primaryKey(),
  deviceId: text('device_id').references(() => devices.id),
  tokenHash: text('token_hash').notNull(), // bcrypt hash
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  usedAt: integer('used_at', { mode: 'timestamp' }),
});
```

### API Endpoints

```typescript
// POST /api/v1/devices - Create device & generate token
// GET /api/v1/devices - List user's devices
// GET /api/v1/devices/:id - Get device details
// DELETE /api/v1/devices/:id - Disconnect & remove
// POST /api/v1/devices/:id/heartbeat - Agent health check
// POST /api/v1/devices/connect - Agent uses token to establish tunnel
```

### Cloudflare Tunnel Integration

```typescript
// src/services/TunnelService.ts
export class TunnelService {
  constructor(
    private cfAccountId: string,
    private cfApiToken: string
  ) {}

  async createTunnel(deviceId: string, deviceName: string): Promise<{
    tunnelId: string;
    tunnelToken: string; // für cloudflared auf dem device
    hostname: string;
  }> {
    // 1. Create tunnel via Cloudflare API
    const tunnel = await this.cfApi.post('/tunnels', {
      name: `foreman-${deviceId}`,
      tunnel_secret: generateSecret(),
    });

    // 2. Create DNS record: <slug>.foreman.run → tunnel
    const hostname = `${slugify(deviceName)}.foreman.run`;
    await this.cfApi.post('/dns_records', {
      type: 'CNAME',
      name: hostname,
      content: `${tunnel.id}.cfargotunnel.com`,
      proxied: true,
    });

    // 3. Create Access policy (Zero Trust)
    await this.cfApi.post('/access/apps', {
      name: `foreman-${deviceId}`,
      domain: hostname,
      type: 'self_hosted',
      policies: [{
        decision: 'allow',
        include: [{ service_token: { token_id: deviceId } }],
      }],
    });

    return {
      tunnelId: tunnel.id,
      tunnelToken: tunnel.token,
      hostname,
    };
  }
}
```

### Foreman Agent (auf Device)

```go
// foreman-agent/main.go (oder Rust)
package main

func main() {
    token := flag.String("token", "", "Connection token")
    flag.Parse()

    // 1. Exchange token for tunnel credentials
    creds := api.ExchangeToken(*token)

    // 2. Start cloudflared tunnel
    tunnel := cloudflared.Connect(creds.TunnelToken)

    // 3. Detect capabilities
    caps := detectCapabilities() // nvidia-smi, python --version, etc.

    // 4. Register with Foreman
    api.RegisterDevice(creds.DeviceId, caps)

    // 5. Start heartbeat loop
    go heartbeatLoop(creds.DeviceId)

    // 6. Listen for task execution requests
    for task := range tunnel.Tasks() {
        executeTask(task)
    }
}

func detectCapabilities() Capabilities {
    return Capabilities{
        GPU: runCmd("nvidia-smi --query-gpu=name,memory.total --format=csv,noheader"),
        CUDA: runCmd("nvcc --version"),
        Python: runCmd("python3 --version"),
        IsaacLab: checkIsaacLab(),
        Ollama: checkOllama(),
    }
}
```

---

## Mobile Integration

### Push Notifications für Device Events

```typescript
// Events die Push Notifications triggern:
- Device goes offline (nach 5 min no heartbeat)
- Device comes online
- Task started on device
- Task completed/failed on device
- Resource warning (GPU memory > 90%)
```

### Mobile Device Management

```
Foreman App → Devices Tab

┌─────────────────────────────────────┐
│ Devices                        [+]  │
├─────────────────────────────────────┤
│ 🟢 DGX Spark                        │
│    Training • 23% GPU • 2 tasks     │
│                                     │
│ 🟢 Jetson AGX                       │
│    Inference • Idle                 │
│                                     │
│ 🟡 Home Server                      │
│    Ollama • 1 model loaded          │
│                                     │
│ 🔴 MacBook Pro                      │
│    Offline since 2h ago             │
└─────────────────────────────────────┘

[Swipe on device → Quick Actions]
- View Logs
- SSH Terminal
- Stop All Tasks
- Disconnect
```

---

## Pricing Model

| Tier | Devices | Features | Price |
|------|---------|----------|-------|
| Free | 1 | Basic connection, community support | $0 |
| Pro | 5 | Priority support, SSH terminal, log streaming | $29/mo |
| Team | Unlimited | SSO, audit logs, team management, SLA | $99/mo |
| Enterprise | Unlimited | On-prem option, dedicated support, custom integrations | Contact |

---

## Implementation Phases

### Phase 1: Core Connection (1 Woche)
- [ ] Device Registry DB Schema
- [ ] Token Generation & Exchange API
- [ ] Cloudflare Tunnel Integration
- [ ] Basic Agent Binary (heartbeat only)
- [ ] Device status tracking

### Phase 2: Dashboard UI (1 Woche)
- [ ] Settings → Devices Page
- [ ] Add Device Flow mit Token Generation
- [ ] Device Status Cards (online/offline/pending)
- [ ] Connection Instructions Modal
- [ ] Device deletion flow

### Phase 3: Task Execution (1 Woche)
- [ ] Agent Task Listener
- [ ] SSH-over-Tunnel für Web Terminal
- [ ] Log Streaming via WebSocket
- [ ] Device Selection in DAG (`"device": "device-id"`)
- [ ] Task routing to correct device

### Phase 4: Ollama Integration (3 Tage)
- [ ] LLM Endpoint Device Type
- [ ] Model Discovery (`ollama list`)
- [ ] Agent Backend Routing
- [ ] Fallback Logic (local → cloud)
- [ ] Model selection in settings

### Phase 5: Mobile (1 Woche)
- [ ] Device list in mobile app
- [ ] Push notifications for device events
- [ ] Quick actions (stop, disconnect)
- [ ] Device health monitoring

---

## Security Considerations

### Zero Trust Architecture
- Alle Connections über Cloudflare Tunnel (encrypted, authenticated)
- Service Tokens pro Device
- No inbound ports required auf Devices
- Cloudflare Access Policies für feingranulare Kontrolle

### Token Security
- Tokens einmalig verwendbar (burned after connect)
- Tokens expiren nach 24h wenn nicht verwendet
- Token Hash in DB, nie Plaintext
- Device kann nur eigene Tasks sehen/ausführen

### Audit Logging
```typescript
// Alle Device-Aktionen werden geloggt:
- device.created
- device.connected
- device.disconnected
- device.task.started
- device.task.completed
- device.task.failed
- device.deleted
```

---

## Warum das krass ist

1. **Zero Config Networking** – Cloudflare Tunnel = kein Port Forwarding, kein VPN, kein DynDNS
2. **Bring Your Own Compute** – User's Hardware, Foreman's Orchestration
3. **Hybrid AI** – Claude für komplexe Tasks, lokales Ollama für schnelle/private
4. **Edge Deployment** – Jetson direkt aus der DAG heraus deployen
5. **Enterprise Ready** – Zero Trust Security built-in
6. **Mobile First** – Devices von überall managen

Das macht Foreman zu einer **Plattform**, nicht nur einem Tool.

---

## Open Questions

- [ ] Domain: foreman.run? foreman.ai? foreman.dev?
- [ ] Agent binary: Go oder Rust? (Go = schneller dev, Rust = kleiner binary)
- [ ] Cloudflare Plan requirements (Zero Trust features)
- [ ] Billing integration (Stripe?)
- [ ] Free tier limits (1 device? 100 tasks/mo?)
