# FOREMAN v2 – Build Plan

## Core Idea

Peter talks to Claude (Opus) in claude.ai. Claude orchestrates coding agents in the background. No separate tools, no dashboards, no context switching. Claude IS the interface.

## The Missing Piece: The Bridge

Claude.ai can't directly call APIs or spawn processes. Foreman Bridge is a lightweight relay service that receives commands from Claude and executes them against coding agents.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  claude.ai (Peter + Opus)                           │
│                                                     │
│  Peter: "Fix the KMZ action groups"                 │
│  Opus:  - Writes briefing + scope                   │
│         - Calls Foreman MCP tool                    │
│         - Monitors agent progress                   │
│         - Reviews diffs                             │
│         - Reports back to Peter                     │
│                                                     │
│  Peter: "Looks good, push it"                       │
│  Opus:  - Calls Foreman approve + deploy            │
└──────────────────────┬──────────────────────────────┘
                       │
                       │ MCP Tool / HTTP API
                       ▼
┌─────────────────────────────────────────────────────┐
│  Foreman Bridge (Cloudflare Worker + DO Droplet)    │
│                                                     │
│  - Receives commands from Claude.ai                 │
│  - Spawns & manages agent sessions                  │
│  - Streams agent output back                        │
│  - Enforces file scope (whitelist/blocklist)         │
│  - Runs build checks (tsc, lint, test)              │
│  - Stores context, history, project knowledge       │
│  - Auth: API token per user                         │
└──────────────────────┬──────────────────────────────┘
                       │
              ┌────────┼────────┐
              ▼        ▼        ▼
         Claude Code  Augment  Future Agents
         (via CLI)    (API)    (any MCP-capable agent)
```

## How It Works – Step by Step

### 1. Peter opens claude.ai, talks normally

```
Peter: "The KMZ generator puts action groups outside 
        the placemarks. Fix that, only touch 
        flighthub-wpml-generator.ts"
```

### 2. Claude (Opus) creates the task

Claude understands the codebase from project knowledge + Foreman context.
Claude calls the Foreman MCP tool:

```json
{
  "tool": "foreman_create_task",
  "params": {
    "project": "zeon-dock-ctrl",
    "title": "Fix KMZ action group placement",
    "briefing": "Action groups 1 and 2 are placed outside Placemarks as trailing children of <Folder>. They must be interleaved with Placemarks or placed inside them per DJI WPML spec. See lines 194-248 of current waylines.wpml output.",
    "allowed_files": ["src/missions/flighthub-wpml-generator.ts"],
    "blocked_files": ["src/mqtt/**", "src/services/**"],
    "verification": "Generate test KMZ, extract waylines.wpml, validate action groups are inside placemarks",
    "agent": "claude-code"
  }
}
```

### 3. Bridge spawns the agent

Bridge receives the command, starts Claude Code CLI in the project directory:

```bash
claude-code --task "Fix KMZ action group placement" \
  --allowed-files "src/missions/flighthub-wpml-generator.ts" \
  --system-prompt "$(cat .foreman/briefing.md)"
```

### 4. Bridge streams progress back

Agent's file operations and output stream back to Bridge.
Bridge watches for scope violations in real-time.
Bridge sends status updates to Claude.ai via MCP response.

```
Claude to Peter: "Agent is working on it. Modified 
flighthub-wpml-generator.ts – moveActionGroupsIntoPlacemarks() 
function added. Running build check..."
```

### 5. Agent submits diff

Agent finishes. Bridge captures the diff, runs automated checks:
- Scope check: only allowed files changed? ✅
- Build: tsc --noEmit passes? ✅
- Tests: npm test passes? ✅

Bridge sends diff to Claude (Opus) via API for intelligent review.

### 6. Claude reviews and reports

```
Claude to Peter: "Done. Here's what changed:

flighthub-wpml-generator.ts:
- New function moveActionGroupsIntoPlacemarks()  
- Action groups now generated per-waypoint inside Placemark elements
- Build passes, test KMZ validates correctly

One concern: the function doesn't handle edge case 
where waypoint has no actions. Want me to tell the 
agent to add that, or is this good enough to push?"
```

### 7. Peter decides

```
Peter: "Add the edge case, then push"
```

Claude sends follow-up task to Bridge. Agent fixes. Claude re-reviews. Pushes.

## Connection: Claude.ai ↔ Bridge

### Option A: MCP Server (Preferred)

Claude.ai supports MCP tools. If we can register Foreman as an MCP server that Claude.ai connects to, this is the cleanest path.

Tools exposed:
- `foreman_create_task` – spawn agent with scoped task
- `foreman_task_status` – check progress  
- `foreman_get_diff` – retrieve agent's changes
- `foreman_review_diff` – run Opus review via API
- `foreman_approve` – approve and commit
- `foreman_reject` – reject with feedback, agent retries
- `foreman_get_context` – load project architecture + history

### Option B: Filesystem MCP + Polling

If direct MCP isn't possible from claude.ai to external servers:
- Claude writes commands to a shared file/API
- Bridge polls for new commands
- Bridge writes results back
- Claude reads results on next turn

Less elegant but works today.

### Option C: Claude.ai Computer Use

Claude.ai has computer use (bash, file creation). Could potentially:
- Write task files that Bridge watches
- Read result files that Bridge writes
- Effectively using the filesystem as a message bus

## Tech Stack

### Foreman Bridge
- **Runtime**: Cloudflare Worker (API + WebSocket) + DigitalOcean Droplet (agent execution)
- **Worker handles**: Auth, event routing, storage, WebSocket relay
- **Droplet handles**: Agent process management, file watching, git operations
- **Storage**: Cloudflare KV (events, status) + D1/SQLite (history, context)
- **Auth**: API tokens, one per user

### Agent Integration
- **Claude Code**: CLI spawning with `--task` and `--allowed-files` flags
- **Augment**: API integration (if available) or VS Code extension automation
- **Generic**: Any agent that accepts a task description and works in a git repo

### Project Context (replaces Claude Projects for API)
```json
// .foreman/context.json – auto-synced to Bridge
{
  "project": "zeon-dock-ctrl",
  "stack": "TypeScript, Node.js, DJI Cloud API, MQTT, K8s",
  "architecture": {
    "src/mqtt/": "MQTT connection + command sending – CRITICAL, breaks telemetry if touched",
    "src/services/": "Keep-alive, telemetry processing – CRITICAL",
    "src/missions/": "KMZ generation, mission dispatch – where most work happens"
  },
  "critical_dependencies": [
    "keep-alive.service.ts → debug_mode_open → all telemetry depends on this",
    "mission-controller.ts → must call startKeepAlive() on mission complete/fail"
  ],
  "past_incidents": [
    {
      "date": "2025-02-17",
      "what": "Agent removed startKeepAlive imports from mission-controller.ts",
      "impact": "Complete telemetry loss, 2 hours debugging",
      "lesson": "NEVER modify keep-alive related code without explicit approval"
    }
  ],
  "known_good_commits": {
    "telemetry_working": "99cad74",
    "kmz_basic_working": "c938e0f"
  }
}
```

This context is sent as system prompt to Opus on every review call. Prompt caching makes this cheap (90% discount on repeated context).

## Build Phases

### Phase 1: Bridge MVP (this week)
**Goal**: Claude.ai can trigger an agent and get results back.

1. DigitalOcean Droplet setup (Ubuntu, Node.js, Claude Code CLI)
2. Simple HTTP API:
   - `POST /tasks` – create task, spawn agent
   - `GET /tasks/:id` – get status + output
   - `GET /tasks/:id/diff` – get file changes
   - `POST /tasks/:id/approve` – commit + push
   - `POST /tasks/:id/reject` – send feedback to agent
3. Auth: Bearer token
4. Agent runner: spawns Claude Code CLI, captures output, enforces file scope
5. Git integration: auto-branch per task, diff capture

**Test**: Claude.ai uses computer tools to POST to the Bridge API, creating a task. Agent works. Claude reads the result. Peter approves.

### Phase 2: MCP Integration (week 2)
**Goal**: Claude.ai calls Foreman as native MCP tools instead of raw HTTP.

1. Register Foreman as MCP server (HTTP transport)
2. Expose tools: create_task, task_status, get_diff, approve, reject
3. Claude.ai can now call `foreman_create_task` naturally in conversation
4. WebSocket for real-time status updates

### Phase 3: Intelligent Review (week 2-3)
**Goal**: Opus reviews agent diffs automatically before presenting to Peter.

1. Anthropic API integration in Bridge
2. On diff submission: send diff + context to Opus for review
3. Opus checks: scope compliance, side effects, dependency awareness
4. Review result attached to task: "APPROVED with notes" / "REJECTED: reason"
5. Peter sees pre-reviewed diffs with Opus's assessment

### Phase 4: Mobile Dashboard (week 3-4)
**Goal**: Peter can approve/reject from phone with push notifications.

1. PWA on Cloudflare Pages
2. Real-time task feed via WebSocket
3. Diff viewer with syntax highlighting  
4. Approve/Reject buttons
5. Push notifications for review requests
6. Optional: still talk to Claude.ai for complex decisions, use dashboard for quick approvals

### Phase 5: Multi-Agent + Learning (month 2+)
**Goal**: Multiple agents in parallel, Foreman learns from history.

1. Parallel task execution (different agents, different scopes)
2. Context accumulation: every task result updates project knowledge
3. Pattern detection: "Last 3 times someone changed X, Y broke"
4. Agent performance tracking: which agent is best at which task type

## Cost Estimate

### Infrastructure
- DigitalOcean Droplet: $12/mo (2GB RAM, enough for agent processes)
- Cloudflare Worker: Free tier (100K requests/day)
- Cloudflare KV: Free tier (100K reads/day)
- Domain: existing or ~$10/year

### API Costs (Anthropic)
- Opus review calls: ~$0.05-0.15 per review (with prompt caching)
- Agent execution (Claude Code): usage-based, ~$0.50-2.00 per task
- Estimated monthly: $50-150 for active development usage

### Total: ~$65-165/month

## What This Enables

### Today (without Foreman)
1. Peter briefs Claude in chat
2. Claude writes briefing document
3. Peter copies briefing to agent
4. Agent works, breaks things
5. Peter debugs for 2 hours
6. Peter comes back to Claude for help fixing
7. Repeat

### With Foreman
1. Peter tells Claude what to do
2. Claude handles everything
3. Peter approves the result
4. Done

## File Structure

```
foreman/
├── bridge/
│   ├── src/
│   │   ├── index.ts              # HTTP API entry
│   │   ├── task-runner.ts        # Spawns + manages agents
│   │   ├── scope-enforcer.ts     # File whitelist/blocklist
│   │   ├── diff-capture.ts       # Git diff extraction
│   │   ├── build-checker.ts      # tsc, lint, test runner
│   │   ├── opus-reviewer.ts      # Anthropic API for reviews
│   │   ├── context-loader.ts     # Reads .foreman/context.json
│   │   └── auth.ts               # Token validation
│   ├── package.json
│   └── Dockerfile
│
├── worker/
│   ├── src/
│   │   ├── index.ts              # CF Worker entry
│   │   ├── routes/
│   │   │   ├── tasks.ts          # Task CRUD relay
│   │   │   ├── events.ts         # Event streaming
│   │   │   └── ws.ts             # WebSocket handler
│   │   ├── mcp/
│   │   │   ├── server.ts         # MCP server implementation
│   │   │   └── tools.ts          # MCP tool definitions
│   │   └── store.ts              # KV/D1 storage
│   ├── wrangler.toml
│   └── package.json
│
├── dashboard/                     # Phase 4
│   ├── src/
│   │   ├── App.tsx
│   │   ├── pages/
│   │   │   ├── TaskFeed.tsx
│   │   │   ├── DiffReview.tsx
│   │   │   └── History.tsx
│   │   └── components/
│   ├── package.json
│   └── vite.config.ts
│
├── .foreman/
│   ├── context.example.json       # Project context template
│   └── config.example.json        # Bridge connection config
│
├── package.json                   # Monorepo root
├── pnpm-workspace.yaml
├── LICENSE
└── README.md
```

## First Test Scenario

Once Phase 1 is deployed, test with the actual KMZ fix:

1. Peter in claude.ai: "Fix the KMZ action group placement"
2. Claude calls Bridge API: create task with briefing
3. Claude Code agent works on zeon-dock-ctrl
4. Bridge captures diff, runs tsc
5. Claude reads diff, reviews
6. Claude to Peter: "Here's what changed, looks correct"
7. Peter: "Ship it"
8. Claude calls Bridge: approve → commit → push → deploy triggers
