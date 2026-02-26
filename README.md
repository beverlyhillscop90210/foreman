# 🏗️ Foreman

**DAG-based Agentic Orchestration System** — Decompose complex software tasks into multi-agent workflows, monitor execution in real-time, and approve results from a live dashboard.

---

## 🚀 Quick Start

### Installation

```bash
git clone https://github.com/beverlyhillscop90210/foreman.git
cd foreman
./setup.sh
```

Then:
1. Login at **https://dashboard.beverlyhillscop.io** (use Gmail)
2. Settings → Enter your OpenRouter API key ([get one here](https://openrouter.ai/keys))
3. Restart Claude Desktop
4. Say: **"Use foreman_plan to build a REST API for blog posts"**

---

## 🛠️ Available MCP Tools (20 Tools)

### 📋 Project Management
- **`foreman_init_project`** - Create new project with GitHub repo

### 🚀 DAG Workflows (Primary - Use These!)
- **`foreman_plan`** ⭐ - AI planner creates DAG from brief
- **`foreman_execute_dag`** - Start DAG execution
- **`foreman_dag_status`** - Check DAG progress
- **`foreman_approve_gate`** - Approve gate checkpoint
- **`foreman_list_dags`** - List all DAGs
- **`foreman_delete_dag`** - Delete DAG

### 🎯 Simple Tasks (Low-Level)
- **`foreman_create_task`** - Create single task (use DAG instead)
- **`foreman_task_status`** - Check task status
- **`foreman_get_diff`** - Get git diff of changes
- **`foreman_approve`** - Approve task changes
- **`foreman_reject`** - Reject task with feedback
- **`foreman_list_tasks`** - List all tasks
- **`foreman_delete_task`** - Delete single task
- **`foreman_delete_all_tasks`** - Delete all tasks

### 🎭 Agent Roles
- **`foreman_list_roles`** - List available agent roles

### 🧠 HGMem (Advanced RAG)
- **`foreman_hgmem_query`** - Multi-step research query
- **`foreman_hgmem_sessions`** - List/inspect HGMem sessions
- **`foreman_hgmem_memory`** - View hypergraph memory

### 📝 Example Prompts

**Simple:**
```
Use foreman_plan to add JWT authentication to my-app
```

**Complex:**
```
foreman_plan:
Project: ecommerce
Brief: Build shopping cart with React frontend, Node.js backend,
Stripe payments, and full test coverage
```

---

## The Problem

AI coding agents are powerful but difficult to coordinate. A single agent working on a complex feature will lose context, make mistakes across unrelated files, and require constant babysitting. Running multiple agents manually is even worse — no dependency ordering, no scope isolation, no central visibility.

## The Solution

**Foreman** acts as a Lead Engineer (*Vorarbeiter*) that sits between you and your AI agents:

- **DAG Orchestration** — Break complex briefs into multi-step workflows with dependency ordering and parallel execution
- **Specialised Agent Roles** — Planner, Backend Architect, Frontend Architect, Security Auditor, Implementer, Reviewer — each with its own scope and system prompt
- **Scope Enforcement** — Each agent node gets a file whitelist/blocklist so it can only touch what it should
- **Live Dashboard** — React-based UI with real-time DAG graph, node terminal output, metrics, and approval controls
- **MCP Integration** — Use Foreman directly from Claude Desktop or any MCP-compatible client
- **WebSocket Streaming** — Live terminal output, status updates, and progress metrics pushed to the dashboard

## Architecture

```
┌─────────────────────┐     ┌───────────────────────┐     ┌───────────────────────┐
│  Claude Desktop     │     │  Foreman Bridge       │     │  Foreman Dashboard    │
│  (MCP Client)       │────▶│  (Node.js / Hono)     │◀────│  (React / Vite)       │
│                     │     │                       │     │                       │
│  - foreman_plan     │     │  - DAG Executor       │     │  - DAG Flow Graph     │
│  - foreman_create_  │     │  - Task Runner        │     │  - Live Terminal      │
│    dag              │     │  - Agent Roles        │     │  - Metrics Panel      │
│  - foreman_execute_ │     │  - WebSocket Server   │     │  - Approval Controls  │
│    dag              │     │  - Knowledge Base     │     │  - Kanban Board       │
│  - foreman_dag_     │     │  - Planner (LLM)      │     │  - Knowledge Base     │
│    status           │     │                       │     │                       │
└─────────────────────┘     └───────────────────────┘     └───────────────────────┘
         MCP (stdio)              REST + WebSocket              Static Build
```

## Quick Start

### 1. Install MCP Server

```bash
git clone https://github.com/beverlyhillscop90210/foreman.git
cd foreman
./setup.sh
```

The setup script will:
- Install dependencies
- Build the MCP server
- Generate Claude Desktop config

### 2. Login & Set API Key

1. Go to **https://dashboard.beverlyhillscop.io**
2. Login with Gmail
3. Go to Settings → Set your OpenRouter API key
   - Get one at: https://openrouter.ai/keys

### 3. Configure Claude Desktop

The setup script will show you the config. Add it to:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "foreman": {
      "command": "node",
      "args": ["/FULL/PATH/TO/foreman/packages/mcp-server/dist/index.js"],
      "env": {
        "FOREMAN_BRIDGE_URL": "https://foreman.beverlyhillscop.io"
      }
    }
  }
}
```

### 4. Restart Claude Desktop

Open Claude and say: **"Create a Foreman task to add authentication to my-api"**

---

## Self-Hosted Setup

If you want to run your own Foreman Bridge:

### Configure Environment

Create a `.env` file in `packages/bridge/`:

```bash
# Required
FOREMAN_AUTH_TOKEN="your-secret-token"      # Auth token for API + MCP
ANTHROPIC_API_KEY="sk-ant-..."              # For Claude Code agent execution
OPENROUTER_API_KEY="sk-or-..."              # For Planner LLM (Claude via OpenRouter)

# Optional
PORT=3000                                   # Bridge server port (default: 3000)
DAG_FILE="/path/to/dags.json"               # DAG persistence file
TASKS_FILE="/path/to/tasks.json"            # Tasks persistence file
```

### 3. Build & Run

```bash
# Build everything
pnpm build

# Start the bridge server
cd packages/bridge
node dist/index.js

# In another terminal — start dashboard dev server
cd packages/dashboard
pnpm dev
```

### 4. Connect MCP (Claude Desktop)

See [packages/mcp-server/README.md](packages/mcp-server/README.md) for setup instructions.

## Packages

| Package | Description |
|---------|-------------|
| **`@foreman/bridge`** | Backend server (Hono) — DAG executor, task runner, agent roles, REST API, WebSocket |
| **`@foreman/dashboard`** | React + Vite frontend — DAG graph, metrics, terminal, kanban, knowledge base |
| **`@foreman/mcp-server`** | MCP server for Claude Desktop integration — stdio transport |
| **`@foreman/core`** | CLI + Git hooks for local scope enforcement |

## MCP Tools

The MCP server exposes these tools to Claude Desktop:

| Tool | Description |
|------|-------------|
| `foreman_plan` | AI-powered brief decomposition into executable DAG workflows |
| `foreman_create_dag` | Create a DAG manually with nodes and edges |
| `foreman_execute_dag` | Start executing a DAG |
| `foreman_dag_status` | Get DAG status and node progress |
| `foreman_create_task` | Create a standalone coding task |
| `foreman_task_status` | Get task status and output |
| `foreman_get_diff` | Get git diff from a completed task |
| `foreman_approve` | Approve and commit task changes |
| `foreman_reject` | Reject task with feedback |
| `foreman_list_roles` | List available agent roles |

## Agent Roles

| Role | Icon | Description |
|------|------|-------------|
| **Planner** | 🧠 | Decomposes briefs into DAGs with task ordering and parallelism |
| **Backend Architect** | 🖥️ | Designs APIs, schemas, system architecture |
| **Frontend Architect** | 🎨 | Designs UI components, state management |
| **Security Auditor** | 🛡️ | Reviews code for vulnerabilities, auth flows |
| **Implementer** | ⌨️ | Writes production code following architect specs |
| **Reviewer** | 👁️ | Reviews code for correctness, style, performance |

## API Reference

The Bridge exposes a REST API at `http://localhost:3000`:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/tasks` | List tasks |
| `POST` | `/tasks` | Create & start task |
| `GET` | `/tasks/:id` | Get task details |
| `GET` | `/dags` | List DAGs |
| `POST` | `/dags` | Create DAG |
| `POST` | `/dags/plan` | AI-powered DAG generation from brief |
| `GET` | `/dags/:id` | Get DAG details |
| `POST` | `/dags/:id/execute` | Execute DAG |
| `POST` | `/dags/:id/nodes/:nodeId/approve` | Approve gate node |
| `DELETE` | `/dags/:id` | Delete DAG |
| `GET` | `/roles` | List agent roles |
| `GET` | `/knowledge` | List knowledge docs |
| `POST` | `/knowledge` | Create knowledge doc |
| `GET` | `/config` | List config entries |
| `WS` | `/ws` | WebSocket for real-time events |

All endpoints (except `/health`) require `Authorization: Bearer <token>` header.

## Dashboard

The dashboard provides:

- **DAG Flow Graph** — Interactive visualization of workflow nodes with color-coded edges by agent role, animated active paths, and live terminal output inside running nodes
- **Metrics Panel** — Progress tracking, runtime, node status breakdown, role breakdown, recent activity
- **Resizable Layout** — Draggable divider between graph and metrics panels
- **Kanban Board** — Task/card management
- **Knowledge Base** — Documentation storage and search
- **Settings** — Configuration management

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for production deployment instructions (DigitalOcean, Caddy reverse proxy, systemd).

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Dashboard dev server (hot reload)
cd packages/dashboard && pnpm dev

# Bridge dev server
cd packages/bridge && pnpm build && node dist/index.js

# MCP server dev
cd packages/mcp-server && pnpm dev
```

## License

MIT © Peter Schings

