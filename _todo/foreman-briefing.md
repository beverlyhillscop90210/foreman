# FOREMAN – AI Agent Supervisor System

## Product Briefing v0.1 | February 2026

---

## The Problem

AI coding agents (Augment, Copilot, Cursor, Claude Code, Codex) are powerful but reckless. They hallucinate, modify files outside their scope, break working systems, and require constant babysitting. Today's developer workflow:

1. Developer gives agent a task
2. Agent works unsupervised
3. Agent breaks unrelated code
4. Developer spends hours debugging what the agent broke
5. Developer reverts everything and starts over

There is no tool that enforces task scope, reviews agent output before it lands, or acts as an intelligent middleware between the developer and the agent.

**VS Code has basic building blocks** (glob patterns for file approval, checkpoints, terminal sandboxing) but nothing that provides intelligent, context-aware supervision. Microsoft even has an open feature request for file-scope restrictions in agent mode – the gap is recognized but unsolved.

---

## The Solution

**Foreman** is an AI-powered supervisor layer that sits between the developer and coding agents. It acts as a Lead Engineer / Vorarbeiter:

- **Receives the goal** from the developer
- **Creates the action plan** with explicit scope boundaries per task
- **Delegates to agents** with enforced file whitelists
- **Reviews every diff** before it can be committed
- **Approves or rejects** changes with reasoning
- **Maintains project context** across sessions

Think of it as a senior engineer who never sleeps, never forgets the codebase architecture, and physically prevents junior devs from pushing to files they shouldn't touch.

---

## Architecture

```
┌─────────────────────────────────────────────┐
│                 DEVELOPER                    │
│            (VS Code / IDE)                   │
└──────────────────┬──────────────────────────┘
                   │
                   │  Goal / High-level task
                   ▼
┌─────────────────────────────────────────────┐
│              FOREMAN (Opus)                  │
│                                             │
│  • Breaks goal into scoped tasks            │
│  • Defines file whitelist per task          │
│  • Maintains project architecture context   │
│  • Reviews all diffs before commit          │
│  • Approves / rejects / requests changes    │
│  • Tracks progress across tasks             │
└──────────┬──────────────┬───────────────────┘
           │              │
           ▼              ▼
┌──────────────┐  ┌──────────────┐
│   Agent A    │  │   Agent B    │
│  (Augment)   │  │  (Copilot)   │
│              │  │              │
│  Scoped to:  │  │  Scoped to:  │
│  - file1.ts  │  │  - file3.tsx │
│  - file2.ts  │  │  - file4.css │
└──────────────┘  └──────────────┘
```

---

## Core Capabilities

### 1. Task Scoping
Developer says: "Fix the KMZ generator so waylines.wpml contains actual waypoints."

Foreman produces:
```json
{
  "task": "Fix KMZ wayline generation",
  "allowed_files": [
    "src/missions/kmz-packager.ts",
    "src/missions/wpml-generator.ts",
    "src/missions/grid-generator.ts"
  ],
  "blocked_files": ["**/admin-ui/**", "**/mqtt/**", "**/services/**"],
  "pre_conditions": "git commit current state before changes",
  "post_conditions": "unzip generated KMZ, verify waylines.wpml contains <Placemark> elements",
  "review_required": true
}
```

### 2. File Gatekeeper
Any file write outside `allowed_files` is:
- **Blocked** (hard mode) – write is prevented entirely
- **Flagged** (soft mode) – write goes through but Foreman alerts the developer and marks the change for review

### 3. Diff Review
Before any commit, Foreman receives the full diff and evaluates:
- Are changes within scope?
- Do changes break existing functionality?
- Are imports/dependencies correctly maintained?
- Does the code match the task requirements?

Returns: `APPROVE`, `REJECT (reason)`, or `REQUEST_CHANGES (details)`

### 4. Context Persistence
Foreman maintains a living document of:
- Project architecture and file responsibilities
- Previous agent mistakes and patterns to watch for
- Deployment pipeline and environment details
- Known working states and commit hashes

### 5. Multi-Agent Orchestration
For complex tasks, Foreman can split work across multiple agents:
- Agent A: backend changes (scoped to `/src/api/`)
- Agent B: frontend changes (scoped to `/src/ui/`)
- Agent C: test coverage (scoped to `/tests/`)

Each agent only sees and can modify their assigned files. Foreman merges and reviews the combined output.

---

## Implementation Options

### Option A: MCP Server (Fastest to Build)
- Runs as an MCP server that any agent client can connect to
- Exposes tools: `plan_task`, `check_file_access`, `submit_for_review`, `get_approval`
- Agent calls these tools before/after file operations
- Works with: Augment, Claude Code, Copilot, Cursor, any MCP-compatible client
- **Limitation**: Relies on agent cooperation – a rogue agent can bypass the tools

### Option B: VS Code Extension (Most Integrated)
- Native VS Code extension with sidebar UI
- Intercepts file save events via `workspace.onWillSaveTextDocument`
- Intercepts git operations via custom git hooks
- Shows approval UI inline with diffs
- **Limitation**: VS Code only, deeper development effort

### Option C: Git Middleware (Most Robust)
- Pre-commit hooks that validate every staged change against the active task scope
- Post-checkout hooks that restore task context
- CI/CD integration for deployment gates
- **Limitation**: Only catches issues at commit time, not during editing

### Recommended: A + C (MCP Server + Git Hooks)
MCP Server for real-time guidance and review. Git hooks as the hard enforcement layer that cannot be bypassed. VS Code extension as optional UI enhancement later.

---

## User Flow

```
Developer: "I need to fix the livestream – dock camera feed isn't reaching the UI"

Foreman: "Understood. Here's my plan:

  Task 1: Verify RTMP stream is being published by dock
  - Check: src/mqtt/livestream-handler.ts
  - Check: src/streaming/mediamtx-config.ts

  Task 2: Fix stream routing to frontend
  - Modify: src/streaming/stream-router.ts
  - Modify: src/websocket/video-forwarder.ts

  Task 3: Verify UI receives stream
  - Check only (no modify): admin-ui/src/components/VideoPlayer.tsx

  Blocked from modification:
  - All mission-controller files
  - All telemetry/OSD files
  - All MQTT connection/binding files
  - All keep-alive service files

  Shall I dispatch to your agent?"

Developer: "Go"

[Agent works within scope]
[Agent submits diff]

Foreman: "Review complete. Agent modified 2 files within scope.
  ✅ stream-router.ts – RTMP URL corrected
  ✅ video-forwarder.ts – WebSocket relay added
  ⚠️  Agent also tried to modify mqtt-handler.ts – BLOCKED
  
  Approved for commit. Push?"
```

---

## Market Opportunity

- No existing tool provides intelligent, AI-powered agent supervision
- VS Code has 15M+ monthly active users
- AI coding agent adoption is exploding (4.7M Copilot users, Claude Code at $1B ARR)
- Every team using AI agents has experienced the "agent broke everything" problem
- Enterprise customers especially need governance and audit trails

### Potential Monetization
- Free tier: Basic file whitelisting + git hooks
- Pro tier: Opus-powered diff review + context persistence
- Team tier: Multi-agent orchestration + audit logs + shared context

---

## Development Phases

### Phase 1: Git Hooks + Simple Whitelist (1 week)
- Pre-commit hook that checks staged files against a `.foreman.json` config
- Blocks commits that touch files outside the whitelist
- CLI tool to set/update the active task scope
- **Immediate value**: Prevents the exact problem we hit today

### Phase 2: MCP Server with Opus Review (2-3 weeks)
- MCP server exposing task planning and review tools
- Anthropic API integration for intelligent diff review
- Task context persistence via local markdown files
- Works with any MCP-compatible agent client

### Phase 3: VS Code Extension (4-6 weeks)
- Sidebar UI showing active task, scope, agent activity
- Inline diff approval/rejection
- Visual file scope indicators (green = allowed, red = blocked)
- Task history and audit trail

### Phase 4: Multi-Agent Orchestration (8-12 weeks)
- Parallel agent dispatch with isolated scopes
- Cross-agent dependency resolution
- Merge conflict prevention
- Performance metrics and agent comparison

---

## Technical Stack

- **Foreman Core**: TypeScript (Node.js)
- **MCP Server**: `@modelcontextprotocol/sdk`
- **AI Review Engine**: Anthropic API (Claude Opus)
- **Git Integration**: `simple-git` + native hooks
- **VS Code Extension**: VS Code Extension API
- **Config**: `.foreman.json` per project
- **Context Store**: Local markdown + SQLite for search

---

## .foreman.json Example

```json
{
  "project": "zeon-dock-ctrl",
  "architecture": {
    "mqtt/": "MQTT connection, binding, command sending – CRITICAL",
    "services/": "Keep-alive, telemetry processing – CRITICAL",
    "missions/": "KMZ generation, mission dispatch",
    "streaming/": "Video stream routing",
    "admin-ui/": "Frontend – separate deployment"
  },
  "active_task": {
    "name": "Fix KMZ wayline generation",
    "allowed_files": ["src/missions/**"],
    "blocked_files": ["src/mqtt/**", "src/services/**", "admin-ui/**"],
    "review_model": "claude-opus-4-6",
    "auto_commit": false
  },
  "known_good_states": {
    "telemetry_working": "c938e0f",
    "binding_working": "c938e0f",
    "livestream_working": "844e36c"
  }
}
```

---

## Why "Foreman"

A foreman (Vorarbeiter) on a construction site:
- Reads the blueprint (understands the architecture)
- Assigns workers to specific tasks (scopes agents)
- Inspects work before sign-off (reviews diffs)
- Prevents workers from messing with other teams' work (enforces boundaries)
- Reports to the project owner (keeps developer informed)

That's exactly what this system does for AI coding agents.

---

*Built from real pain. The idea for Foreman came from a day of agents breaking production systems, reverting commits, and re-briefing new agents on the same task three times. There has to be a better way.*
