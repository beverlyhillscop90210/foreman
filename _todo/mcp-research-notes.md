# MCP Integration Research Notes

## Overview

**Model Context Protocol (MCP)** is Anthropic's protocol for LLMs to connect with external data sources and tools. It uses **JSON-RPC 2.0** over various transports.

## Key Findings

### 1. Protocol Basics
- **Protocol**: JSON-RPC 2.0
- **Transports**: 
  - **stdio** (standard input/output)
  - **HTTP with SSE** (Server-Sent Events) - called "Streamable HTTP"
- **Latest SDK**: `@modelcontextprotocol/sdk` (TypeScript)
  - Split into `@modelcontextprotocol/server` and `@modelcontextprotocol/client`
  - Requires `zod` as peer dependency (v4)

### 2. MCP Server Capabilities

MCP servers can provide three main types of capabilities:

1. **Resources**: File-like data that can be read by clients
2. **Prompts**: Pre-written templates for specific tasks
3. **Tools**: Functions that can be called by the LLM ⭐ **This is what we need!**

### 3. HTTP Transport (Streamable HTTP)

- Uses **HTTP with Server-Sent Events (SSE)** for streaming
- GET request establishes SSE connection
- POST request handles JSON-RPC messages
- Supports both request/response and streaming patterns

### 4. Tool Registration Format

Tools are registered with:
- **name**: Tool identifier
- **description**: What the tool does
- **inputSchema**: JSON Schema for parameters (using Zod)

Example tool call flow:
```
Client → Server: tools/list (discover available tools)
Server → Client: List of tools with schemas
Client → Server: tools/call (invoke a specific tool)
Server → Client: Tool result
```

### 5. For Foreman Bridge

We need to create an MCP server that exposes these tools:

1. **`foreman_create_task`** - Create and start a new task
2. **`foreman_task_status`** - Get task status and output
3. **`foreman_get_diff`** - Get git diff for a task
4. **`foreman_approve`** - Approve and commit task changes
5. **`foreman_reject`** - Reject task with feedback

### 6. Implementation Plan

**Package to use**: `@modelcontextprotocol/server` + `@modelcontextprotocol/node` (for HTTP transport)

**Architecture**:
```
Claude.ai (MCP Client)
    ↓ HTTP + SSE
MCP Server (packages/mcp-server/)
    ↓ HTTP calls
Foreman Bridge API (packages/bridge/)
    ↓ Spawns agents
Claude Code CLI / Augment
```

### 7. Key SDK Packages

- **`@modelcontextprotocol/server`**: Build MCP servers
- **`@modelcontextprotocol/node`**: Node.js HTTP transport wrapper
- **`zod`**: Schema validation (required peer dependency)

### 8. Example Code Structure

Based on SDK examples, we'll need:

```typescript
import { Server } from '@modelcontextprotocol/server';
import { createNodeHttpTransport } from '@modelcontextprotocol/node';
import { z } from 'zod';

const server = new Server({
  name: 'foreman-mcp-server',
  version: '0.1.0',
});

// Register tools
server.tool({
  name: 'foreman_create_task',
  description: 'Create a new coding task for an AI agent',
  inputSchema: z.object({
    project: z.string(),
    title: z.string(),
    briefing: z.string(),
    allowed_files: z.array(z.string()),
    blocked_files: z.array(z.string()).optional(),
    agent: z.enum(['claude-code', 'augment']).optional(),
  }),
  handler: async (params) => {
    // Call Foreman Bridge API
    const response = await fetch('http://localhost:3000/tasks', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FOREMAN_AUTH_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });
    return await response.json();
  },
});

// Start HTTP server with SSE transport
const transport = createNodeHttpTransport(server);
const httpServer = http.createServer(transport);
httpServer.listen(3001);
```

### 9. Next Steps

1. ✅ Research complete
2. ⏳ Create `packages/mcp-server/` package
3. ⏳ Implement MCP server with HTTP transport
4. ⏳ Register all 5 Foreman tools
5. ⏳ Add WebSocket for real-time updates (optional enhancement)
6. ⏳ Deploy to droplet alongside Bridge
7. ⏳ Test with Claude.ai

### 10. References

- MCP Specification: https://spec.modelcontextprotocol.io
- TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk
- SDK Docs: https://modelcontextprotocol.github.io/typescript-sdk/
- MCP Homepage: https://modelcontextprotocol.io

