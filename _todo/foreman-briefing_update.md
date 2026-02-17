# FOREMAN – Build Plan

## What We're Building

An AI agent supervisor system. Local CLI + MCP Server that enforces task scope on coding agents, with a cloud API + mobile-friendly dashboard for live monitoring and approvals from anywhere.

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

## Tech Stack

- **Core**: TypeScript, Node.js
- **MCP Server**: `@modelcontextprotocol/sdk`
- **Git Hooks**: `simple-git`, native pre-commit hooks
- **Cloud API**: Cloudflare Workers + KV (or D1 for SQLite)
- **Dashboard**: React PWA (single page, mobile-first)
- **AI Review**: Anthropic API (Claude Opus) for diff analysis
- **Auth**: Simple token-based for now

## Repo Structure

```
foreman/
├── packages/
│   ├── core/                  # Local CLI + Git hooks
│   │   ├── src/
│   │   │   ├── cli.ts         # CLI entry point (foreman init, foreman scope, foreman status)
│   │   │   ├── git-hooks/
│   │   │   │   ├── pre-commit.ts    # Validates staged files against whitelist
│   │   │   │   └── install.ts       # Installs hooks into .git/hooks
│   │   │   ├── config.ts     # .foreman.json reader/writer
│   │   │   └── watcher.ts    # File system watcher for real-time blocking
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── mcp-server/            # MCP Server for agent integration
│   │   ├── src/
│   │   │   ├── server.ts      # MCP server entry
│   │   │   ├── tools/
│   │   │   │   ├── plan-task.ts       # Break goal into scoped tasks
│   │   │   │   ├── check-access.ts    # Validate file access
│   │   │   │   ├── submit-review.ts   # Submit diff for review
│   │   │   │   └── get-approval.ts    # Check approval status
│   │   │   └── reviewer.ts   # Anthropic API diff reviewer
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── api/                   # Cloudflare Worker
│   │   ├── src/
│   │   │   ├── index.ts       # Worker entry
│   │   │   ├── routes/
│   │   │   │   ├── events.ts  # POST /events (from local core)
│   │   │   │   ├── tasks.ts   # GET /tasks, PATCH /tasks/:id
│   │   │   │   ├── diffs.ts   # GET /diffs/:id, POST /diffs/:id/approve
│   │   │   │   └── ws.ts     # WebSocket for live updates
│   │   │   └── store.ts      # KV/D1 storage layer
│   │   ├── wrangler.toml
│   │   └── package.json
│   │
│   └── dashboard/             # PWA (mobile-first)
│       ├── src/
│       │   ├── App.tsx
│       │   ├── pages/
│       │   │   ├── TaskList.tsx      # Active tasks with status
│       │   │   ├── TaskDetail.tsx    # Scope, files, agent activity
│       │   │   ├── DiffReview.tsx    # Side-by-side diff with approve/reject
│       │   │   └── History.tsx       # Past tasks and audit trail
│       │   └── components/
│       │       ├── FileScope.tsx     # Green/red file indicators
│       │       ├── DiffViewer.tsx    # Syntax-highlighted diff
│       │       └── ApprovalButton.tsx
│       ├── package.json
│       └── vite.config.ts
│
├── .foreman.example.json      # Example config
├── package.json               # Monorepo root (pnpm workspaces)
├── pnpm-workspace.yaml
├── LICENSE
└── README.md
```

## .foreman.json

```json
{
  "project": "my-project",
  "api_url": "https://foreman-api.your-domain.workers.dev",
  "api_token": "fm_xxxx",
  "review_model": "claude-opus-4-6",
  "architecture": {
    "src/api/": "Backend API routes – CRITICAL",
    "src/ui/": "Frontend components",
    "src/services/": "Core business logic – CRITICAL",
    "src/utils/": "Shared utilities"
  },
  "active_task": null,
  "known_good_states": {}
}
```

## CLI Commands

```bash
foreman init                          # Initialize .foreman.json + install git hooks
foreman scope "Fix KMZ generator"     # Set active task (interactive file selector)
foreman scope --allow "src/missions/**" --block "src/mqtt/**"  # Direct scope
foreman status                        # Show active task, modified files, violations
foreman review                        # Trigger AI review of current staged changes
foreman approve                       # Approve current changes
foreman reject                        # Reject and revert current changes
foreman history                       # Show past tasks
foreman push                          # Push events to cloud API
```

## MCP Tools

Agents call these tools automatically:

| Tool | Purpose |
|------|---------|
| `foreman_plan_task` | AI breaks goal into scoped subtasks with file whitelists |
| `foreman_check_access` | Returns allowed/blocked for a file path |
| `foreman_submit_diff` | Sends diff to Foreman for review before commit |
| `foreman_get_approval` | Checks if diff was approved |
| `foreman_get_context` | Returns project architecture + active task scope |

## Build Order

### Sprint 1: Core + Git Hooks (today)
1. Monorepo setup (pnpm workspaces)
2. `.foreman.json` config reader/writer
3. CLI: `init`, `scope`, `status`
4. Pre-commit hook: validate staged files against whitelist
5. File watcher: real-time alerts when agent touches blocked files

### Sprint 2: MCP Server (today/tomorrow)
1. MCP server with stdio transport
2. `check_access` tool
3. `submit_diff` tool
4. `get_context` tool
5. Basic Anthropic API integration for diff review

### Sprint 3: Cloud API (tomorrow)
1. Cloudflare Worker with KV storage
2. Event ingestion endpoint
3. Task CRUD endpoints
4. WebSocket for live updates
5. Token auth

### Sprint 4: Dashboard (tomorrow)
1. Vite + React + Tailwind PWA
2. Task list view
3. Diff review view with approve/reject
4. Mobile-optimized layout
5. Push notifications for review requests
