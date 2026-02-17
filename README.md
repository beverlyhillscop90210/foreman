# 🏗️ Foreman

**AI Agent Supervisor System** – Enforce task scope on coding agents, review diffs before commit, and monitor from anywhere.

## The Problem

AI coding agents are powerful but reckless. They hallucinate, modify files outside their scope, break working systems, and require constant babysitting.

## The Solution

**Foreman** acts as a Lead Engineer / Vorarbeiter that sits between you and your AI agents:

- ✅ **Enforces task scope** with file whitelists
- ✅ **Reviews every diff** before commit with AI-powered analysis
- ✅ **Blocks out-of-scope changes** via git hooks
- ✅ **Mobile dashboard** for approving changes from anywhere
- ✅ **MCP Server** for seamless agent integration

## Architecture

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Local Mac   │     │  Cloudflare      │     │  Mobile/Web     │
│              │────▶│  Worker API      │────▶│  Dashboard      │
│  - MCP Server│     │                  │     │  (PWA)          │
│  - Git Hooks │     │  - Event store   │     │  - Live tasks   │
│  - CLI       │     │  - WebSocket     │     │  - Diff review  │
│  - .foreman  │     │  - Auth          │     │  - Approve/Reject│
└──────────────┘     └──────────────────┘     └─────────────────┘
```

## Quick Start

```bash
# Install
pnpm install -g @foreman/cli

# Initialize in your project
cd your-project
foreman init

# Set task scope
foreman scope "Fix the KMZ generator"
# Interactive file selector appears

# Your AI agent works within scope
# Foreman blocks out-of-scope changes
# You approve diffs from your phone
```

## Packages

- **`@foreman/core`** - CLI + Git hooks for local enforcement
- **`@foreman/mcp-server`** - MCP server for agent integration
- **`@foreman/api`** - Cloudflare Worker for cloud sync
- **`@foreman/dashboard`** - Mobile-first PWA for remote monitoring

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run in development mode
pnpm dev

# Run tests
pnpm test
```

## License

MIT © Peter Schings

