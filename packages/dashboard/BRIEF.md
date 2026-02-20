# Foreman Dashboard – Design & Build Brief

## Overview

Build a **read-only observation dashboard** for the Foreman agent orchestration system. This is "mission control" – Peter watches agents work in real-time but never writes directly. All commands go through Claude via MCP.

## Tech Stack

- **React 18 + Vite + TypeScript**
- **Tailwind CSS** (utility-first, no component libraries)
- **WebSocket** for real-time agent output streaming
- The dashboard connects to the Foreman Bridge API at `/tasks` and a new `/ws` endpoint for live streaming

## Design Language

- **Dark mode only** – deep blacks (#0a0a0a, #111111), not gray
- **Accent color**: Orange (#FF6B2B) for active states, progress, highlights
- **Secondary**: Muted whites (#e5e5e5) for text, dim grays (#333, #444) for borders
- **Font**: JetBrains Mono for terminal output, Inter for UI text
- **Aesthetic**: VS Code meets Bloomberg Terminal meets RunPod. Dense information, zero fluff. No rounded cards with drop shadows. Sharp, technical, precise.
- **NO generic "AI dashboard" aesthetics** – no gradient blobs, no glassmorphism, no decorative illustrations

## Layout Structure

### Top Bar (fixed, 48px)
- Left: Foreman logo (simple text: "FOREMAN" in JetBrains Mono, weight 700)
- Center: Agent status pills showing running agents (e.g., "3/5 ACTIVE") with orange dot for running
- Right: Bucket selector dropdown (Zeon, Isaac Lab, Research, Trading, Meta)

### Main Area: Terminal Grid (VS Code-style)
- **Resizable terminal panels** in a grid layout
- Each panel = one running agent's live output
- Panel header: Agent ID, task title, bucket tag, elapsed time, status badge
- Panel body: Scrolling monospace terminal output (dark bg, green/white/orange text)
- Panels can be: resized (drag borders), minimized (collapse to header bar), maximized (full screen), closed (hides panel, does NOT kill agent)
- When no agents are running: show last completed tasks in muted state

### Left Sidebar (collapsible, 280px)
- **Kanban section**: Collapsible task board (Backlog → Running → Review → Done)
- **Knowledge Base**: Tree view of saved scripts, training configs, scrape results
- **Config Panel**: RunPod-style env var editor (key-value pairs, masked secrets, edit button)

### Bottom Bar (fixed, 32px)
- Git-style status: current branch, last commit, connected agents count
- WebSocket connection indicator (green dot = connected)
- Timestamp of last activity

## Pages / Views

### 1. Dashboard (default)
The terminal grid + sidebar. This is where Peter lives 90% of the time.

### 2. Kanban Board (full page)
- Columns: Backlog, In Progress, Review, Done
- Cards show: title, bucket tag, agent assigned, time elapsed
- Read-only for now (Claude manages this)

### 3. Knowledge Base (full page)
- File browser tree on left
- Content viewer on right (syntax highlighted for code, markdown rendered for docs)
- Search bar at top
- Categories: Training Scripts, Scrape Results, Architecture Docs, Agent Outputs

### 4. Config (full page, RunPod-style)
- Sections: Environment Variables, API Keys, Endpoints, Webhooks
- Each entry: key, masked value, "reveal" toggle, edit button, last modified date
- Add new entry button
- Categories/tags for organization

### 5. Login
- Clean, minimal Google OAuth button
- "FOREMAN" logo centered
- Dark background, single orange accent button

## API Requirements (Backend additions needed)

The Bridge needs these new endpoints:
- `GET /ws` – WebSocket for live agent output streaming
- `GET /tasks` – already exists (list tasks)
- `GET /tasks/:id` – already exists (task detail)
- `GET /config` – list env vars/keys (masked)
- `PUT /config/:key` – update a config value
- `GET /knowledge` – list stored files/results
- `GET /knowledge/:path` – get file content

## Authentication

- Google OAuth 2.0
- Whitelist: Only Peter's Google email is allowed to login
- JWT session token after OAuth
- All API routes protected

## File Structure

```
packages/dashboard/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
├── postcss.config.js
├── public/
│   └── favicon.svg
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css (tailwind imports)
│   ├── components/
│   │   ├── layout/
│   │   │   ├── TopBar.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── BottomBar.tsx
│   │   │   └── Layout.tsx
│   │   ├── terminal/
│   │   │   ├── TerminalGrid.tsx
│   │   │   ├── TerminalPanel.tsx
│   │   │   └── TerminalOutput.tsx
│   │   ├── kanban/
│   │   │   ├── KanbanBoard.tsx
│   │   │   └── KanbanCard.tsx
│   │   ├── knowledge/
│   │   │   ├── FileBrowser.tsx
│   │   │   └── ContentViewer.tsx
│   │   ├── config/
│   │   │   ├── ConfigPanel.tsx
│   │   │   └── ConfigEntry.tsx
│   │   └── auth/
│   │       └── LoginPage.tsx
│   ├── hooks/
│   │   ├── useWebSocket.ts
│   │   ├── useTasks.ts
│   │   └── useConfig.ts
│   ├── stores/
│   │   └── taskStore.ts (zustand)
│   ├── types/
│   │   └── index.ts
│   └── lib/
│       ├── api.ts
│       └── ws.ts
```

## Critical Rules

1. **Read-only UI** – No buttons that directly execute agent commands. Display only.
2. **Emergency stop is the ONE exception** – A red stop button per agent panel that calls POST /tasks/:id/stop
3. **Performance** – Terminal output can be hundreds of lines. Virtualize scrolling.
4. **Responsive** – Works on desktop (primary) and tablet. Mobile is nice-to-have.
5. **No external component libraries** – Pure Tailwind + custom components. Keep it lean.

## DNS

Dashboard will be served at: `dashboard.beverlyhillscop.io`
Add DNS A record: dashboard → 207.154.246.112
Caddy will handle SSL automatically.
