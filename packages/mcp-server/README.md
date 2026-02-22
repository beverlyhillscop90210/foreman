# Foreman MCP Server

MCP (Model Context Protocol) server that enables Claude Desktop (or any MCP client) to orchestrate multi-agent coding workflows via the Foreman Bridge.

## Architecture

```
Claude Desktop (MCP Client)
    ↓  stdio
Foreman MCP Server
    ↓  HTTP
Foreman Bridge API
    ↓
Coding Agents (Claude Code, etc.)
```

## Prerequisites

- **Node.js** ≥ 18
- **A running Foreman Bridge** — see the [main README](../../README.md) for setup
- **Claude Desktop** (or any MCP-compatible client)

## Installation

### Option A: From the monorepo

```bash
git clone https://github.com/beverlyhillscop90210/foreman.git
cd foreman
pnpm install
cd packages/mcp-server
pnpm build
```

### Option B: Standalone (npm)

```bash
# Coming soon — once published to npm
npm install -g @foreman/mcp-server
```

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BRIDGE_URL` | No | `http://localhost:3000` | URL of your Foreman Bridge server |
| `FOREMAN_AUTH_TOKEN` | **Yes** | — | Auth token matching your Bridge's `FOREMAN_AUTH_TOKEN` |

### Automatic Setup (recommended)

Run the setup script to auto-configure Claude Desktop:

```bash
cd packages/mcp-server
bash setup-claude-desktop.sh
```

The script will:
1. Detect your OS (macOS / Windows / Linux)
2. Prompt for your Bridge URL and auth token
3. Write the Claude Desktop config file
4. Back up any existing config

### Manual Setup

Add this to your Claude Desktop MCP configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
**Linux**: `~/.config/claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "foreman": {
      "command": "node",
      "args": [
        "/absolute/path/to/foreman/packages/mcp-server/dist/index.js"
      ],
      "env": {
        "BRIDGE_URL": "https://your-bridge-server.example.com",
        "FOREMAN_AUTH_TOKEN": "your-auth-token"
      }
    }
  }
}
```

> **Important:** The path in `args` must be an absolute path to the built `dist/index.js`.

After updating the configuration, **restart Claude Desktop** to load the MCP server.

## Available Tools

### DAG Orchestration

| Tool | Description |
|------|-------------|
| `foreman_plan` | AI-powered decomposition of a high-level brief into an executable DAG workflow |
| `foreman_create_dag` | Create a DAG manually with custom nodes and edges |
| `foreman_execute_dag` | Start executing a DAG workflow |
| `foreman_dag_status` | Get current status of a DAG and all its nodes |

### Task Management

| Tool | Description |
|------|-------------|
| `foreman_create_task` | Create a standalone coding task for an AI agent |
| `foreman_task_status` | Get task status, output, and progress |
| `foreman_get_diff` | Get the git diff showing all changes made by the agent |
| `foreman_approve` | Approve and commit the task changes to git |
| `foreman_reject` | Reject the task with optional feedback for retry |

### Agent Roles

| Tool | Description |
|------|-------------|
| `foreman_list_roles` | List all available agent roles with capabilities |

## Example Usage in Claude Desktop

Once configured, you can use Foreman directly in Claude Desktop:

```
You: Plan and execute a feature to add user authentication to my Express app

Claude: I'll use Foreman to plan this out as a multi-agent workflow.
[calls foreman_plan with your brief]
[creates DAG with backend-architect, implementer, security-auditor, reviewer nodes]
[calls foreman_execute_dag]

The DAG is now running. Here's the progress:
- ✅ Backend Architect: Designed auth schema and API routes
- 🔄 Implementer: Writing auth middleware...
- ⏳ Security Auditor: Waiting for implementation
- ⏳ Reviewer: Waiting for security audit
```

## Tool Details

### `foreman_plan`

Ask the Planner agent to decompose a high-level brief into an executable DAG.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `project` | string | Yes | Project directory path on the Bridge server |
| `brief` | string | Yes | High-level description of what needs to be built |
| `context` | string | No | Additional context (architecture notes, constraints) |
| `auto_create` | boolean | No | Auto-create the DAG (default: true) or just return the plan |

### `foreman_create_task`

Create a standalone coding task.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `project` | string | Yes | Project directory path |
| `title` | string | Yes | Task title |
| `briefing` | string | Yes | Detailed task description |
| `allowed_files` | string[] | Yes | Glob patterns for files the agent can modify |
| `blocked_files` | string[] | No | Glob patterns for files the agent must not touch |
| `agent` | enum | No | `claude-code` or `augment` (default: `claude-code`) |
| `verification` | string | No | How to verify task completion |

### `foreman_create_dag`

Create a DAG workflow manually.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | Workflow name |
| `description` | string | Yes | Workflow description |
| `project` | string | Yes | Project directory path |
| `created_by` | enum | No | `planner` or `manual` (default: `manual`) |
| `approval_mode` | enum | No | `per_task`, `end_only`, or `gate_configured` |
| `nodes` | array | Yes | Array of DAG nodes |
| `edges` | array | Yes | Array of DAG edges (dependencies) |

## Troubleshooting

### Server not appearing in Claude Desktop

1. Verify the config file path is correct for your OS
2. Ensure the path to `dist/index.js` is an absolute path
3. Check Claude Desktop logs: `~/Library/Logs/Claude/mcp*.log` (macOS)
4. Restart Claude Desktop completely (quit + reopen)

### Connection errors

1. Verify the Bridge is running: `curl <your-bridge-url>/health`
2. Check the auth token matches the Bridge's `FOREMAN_AUTH_TOKEN`
3. Ensure the Bridge URL is reachable from your machine

### "FOREMAN_AUTH_TOKEN is required" error

The `FOREMAN_AUTH_TOKEN` env variable must be set in the Claude Desktop config's `env` block. Double-check the JSON syntax.

## Development

```bash
# Build
pnpm build

# Watch mode (auto-rebuild on changes)
pnpm dev

# Type check
pnpm typecheck
```

## License

MIT © Peter Schings

