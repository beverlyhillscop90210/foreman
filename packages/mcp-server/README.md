# Foreman MCP Server

MCP (Model Context Protocol) server that enables Claude.ai to control the Foreman Bridge and orchestrate coding agents.

## Architecture

```
Claude.ai (claude.ai) 
    ↓
Claude Desktop (MCP Client)
    ↓
Foreman MCP Server (stdio transport)
    ↓
Foreman Bridge API (HTTP)
    ↓
Coding Agents (Claude Code CLI, Augment, etc.)
```

## Installation

```bash
cd packages/mcp-server
pnpm install
pnpm build
```

## Configuration

### 1. Set Environment Variables

Create a `.env` file or export these variables:

```bash
export BRIDGE_URL="http://207.154.246.112:3000"
export FOREMAN_AUTH_TOKEN="1ba489d45352894d3b6b74121a498a826cf8252490119d29127add4d0c00c4e3"
```

### 2. Configure Claude Desktop

Add this to your Claude Desktop MCP configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "foreman": {
      "command": "node",
      "args": [
        "/Users/peterschings/Documents/DevOps/_beverlyhillscop/foreman/packages/mcp-server/dist/index.js"
      ],
      "env": {
        "BRIDGE_URL": "http://207.154.246.112:3000",
        "FOREMAN_AUTH_TOKEN": "1ba489d45352894d3b6b74121a498a826cf8252490119d29127add4d0c00c4e3"
      }
    }
  }
}
```

### 3. Restart Claude Desktop

After updating the configuration, restart Claude Desktop to load the MCP server.

## Available Tools

### `foreman_create_task`
Create a new coding task for an AI agent.

**Parameters:**
- `project` (string): Project directory path
- `title` (string): Task title/summary
- `briefing` (string): Detailed task description
- `allowed_files` (string[]): Glob patterns for allowed files
- `blocked_files` (string[], optional): Glob patterns for blocked files
- `agent` (enum, optional): 'claude-code' or 'augment' (default: 'claude-code')
- `verification` (string, optional): How to verify completion

### `foreman_task_status`
Get the current status and output of a task.

**Parameters:**
- `task_id` (string): The task ID

### `foreman_get_diff`
Get the git diff showing all changes made by the agent.

**Parameters:**
- `task_id` (string): The task ID

### `foreman_approve`
Approve and commit the task changes to git.

**Parameters:**
- `task_id` (string): The task ID
- `push` (boolean, optional): Whether to push to remote (default: false)

### `foreman_reject`
Reject the task and optionally provide feedback for retry.

**Parameters:**
- `task_id` (string): The task ID
- `feedback` (string, optional): Feedback explaining rejection
- `retry` (boolean, optional): Whether to retry with feedback (default: false)

## Testing Locally

You can test the MCP server using stdio:

```bash
cd packages/mcp-server
export BRIDGE_URL="http://207.154.246.112:3000"
export FOREMAN_AUTH_TOKEN="1ba489d45352894d3b6b74121a498a826cf8252490119d29127add4d0c00c4e3"
node dist/index.js
```

The server will start and wait for JSON-RPC messages on stdin.

## Troubleshooting

### Server not appearing in Claude Desktop

1. Check the config file path is correct
2. Ensure the path to `dist/index.js` is absolute
3. Check Claude Desktop logs: `~/Library/Logs/Claude/mcp*.log`
4. Restart Claude Desktop

### Connection errors

1. Verify the Bridge is running: `curl http://207.154.246.112:3000/health`
2. Check the auth token is correct
3. Check the MCP server logs in Claude Desktop logs

## Development

```bash
# Build
pnpm build

# Watch mode
pnpm dev
```

