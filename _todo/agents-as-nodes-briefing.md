# Foreman: Agents as Nodes – Architecture Briefing

## Executive Summary

Erweiterung des bestehenden Foreman DAG-Systems um **spezialisierte Agent-Rollen als Node-Typen**. Statt generischer `claude-code` Agents für jeden Task gibt es vordefinierte Rollen mit eigenem System Prompt, Model, und Scope – orchestriert durch einen **Planner-Agent** der High-Level Briefs in ausführbare DAGs zerlegt.

---

## Status Quo

### Was existiert

- **DAG-Executor** (`dag-executor.ts`): Vollständig implementiert
  - Node Types: `task`, `gate`, `fan_out`, `fan_in`
  - Gate Conditions: `all_pass`, `any_pass`, `manual`
  - Approval Modes: `per_task`, `end_only`, `gate_configured`
  - Persistence via JSON file
  - Event-driven task routing

- **Task System**: Flach, jeder Task nutzt `agent: 'claude-code' | 'augment' | 'custom'`

- **MCP Tools verfügbar**:
  - `foreman_create_dag` – DAG manuell erstellen
  - `foreman_execute_dag` – DAG starten
  - `foreman_dag_status` – Status abfragen
  - `foreman_plan` – *Planner Agent* aufrufen (Tool existiert, Planner nicht implementiert)

### Was fehlt

1. **Planner Agent** – Kein Agent der Briefs → DAGs transformiert
2. **Agent Roles** – Keine spezialisierten Rollen, nur generische Agents
3. **Role-based System Prompts** – Agents bekommen keine rollenspezifischen Instructions
4. **Knowledge Loading** – Agents laden kein Kontext-Wissen vor Task-Execution

---

## Architektur: Agents as Nodes

### 1. Agent Roles

Definiere spezialisierte Rollen als First-Class Entities:

```typescript
// packages/bridge/src/agent-roles.ts

export interface AgentRole {
  id: string;                    // e.g. 'backend-architect'
  name: string;                  // e.g. 'Backend Architect'
  model: string;                 // e.g. 'claude-sonnet-4-5-20250929'
  system_prompt: string;         // Role-specific instructions
  default_allowed_files?: string[];
  default_blocked_files?: string[];
  capabilities: string[];        // e.g. ['api-design', 'database', 'security']
  max_parallel?: number;         // Max concurrent tasks for this role
}

export const AGENT_ROLES: Record<string, AgentRole> = {
  'planner': {
    id: 'planner',
    name: 'Planner',
    model: 'claude-sonnet-4-5-20250929',
    system_prompt: `You are a Planner Agent. Your job is to decompose high-level briefs into 
executable DAGs. Output valid JSON matching the DAG schema. Consider:
- Task dependencies and parallelization opportunities
- Appropriate agent roles for each task
- QC gates between critical phases
- File scope boundaries`,
    capabilities: ['planning', 'decomposition'],
  },

  'backend-architect': {
    id: 'backend-architect',
    name: 'Backend Architect',
    model: 'claude-sonnet-4-5-20250929',
    system_prompt: `You are a Backend Architect. Focus on:
- API design and endpoint structure
- Database schema and migrations
- Service architecture and patterns
- Error handling and validation
Do NOT implement frontend code.`,
    default_allowed_files: ['src/api/**', 'src/services/**', 'src/models/**', 'prisma/**'],
    default_blocked_files: ['src/components/**', 'src/pages/**', '*.css'],
    capabilities: ['api-design', 'database', 'architecture'],
  },

  'frontend-architect': {
    id: 'frontend-architect',
    name: 'Frontend Architect',
    model: 'claude-sonnet-4-5-20250929',
    system_prompt: `You are a Frontend Architect. Focus on:
- React component structure
- State management
- UI/UX implementation
- Styling and responsive design
Do NOT modify backend/API code.`,
    default_allowed_files: ['src/components/**', 'src/pages/**', 'src/hooks/**', '*.css', '*.scss'],
    default_blocked_files: ['src/api/**', 'src/services/**', 'prisma/**'],
    capabilities: ['react', 'ui', 'state-management'],
  },

  'security-auditor': {
    id: 'security-auditor',
    name: 'Security Auditor',
    model: 'claude-sonnet-4-5-20250929',
    system_prompt: `You are a Security Auditor. Your job is to:
- Review code for security vulnerabilities
- Check for hardcoded secrets
- Validate auth/authz implementations
- Ensure input sanitization
Output a security report, do NOT modify code directly.`,
    default_allowed_files: ['**/*'],
    capabilities: ['security', 'audit', 'review'],
  },

  'implementer': {
    id: 'implementer',
    name: 'Implementer',
    model: 'claude-sonnet-4-5-20250929',
    system_prompt: `You are an Implementer. Execute the specific task assigned to you.
Follow the file scope strictly. Write clean, tested code.`,
    capabilities: ['implementation', 'coding'],
  },

  'reviewer': {
    id: 'reviewer',
    name: 'Code Reviewer',
    model: 'claude-sonnet-4-5-20250929',
    system_prompt: `You are a Code Reviewer. Review the diff and provide:
- Code quality feedback
- Bug detection
- Suggested improvements
Output structured review comments.`,
    capabilities: ['review', 'quality'],
  },
};
```

### 2. DAG Node Extension

Erweitere `DagNode` um Role-Referenz:

```typescript
// In dag-executor.ts

export interface DagNode {
  id: string;
  type: DagNodeType;
  title: string;
  briefing?: string;
  
  // NEW: Role-based agent assignment
  role?: string;                 // References AgentRole.id
  agent?: string;                // Fallback: 'claude-code' | 'augment'
  
  status: DagNodeStatus;
  taskId?: string;
  project?: string;
  allowed_files?: string[];      // Overrides role defaults
  blocked_files?: string[];      // Overrides role defaults
  
  // Gate-specific
  gate_condition?: 'all_pass' | 'any_pass' | 'manual';
  
  // NEW: Output artifacts for downstream nodes
  artifacts?: Record<string, any>;
}
```

### 3. Planner Agent

Implementiere den Planner als speziellen Agent der via `foreman_plan` MCP Tool aufgerufen wird:

```typescript
// packages/bridge/src/planner.ts

import Anthropic from '@anthropic-ai/sdk';
import { AGENT_ROLES } from './agent-roles.js';
import type { Dag, DagNode, DagEdge } from './dag-executor.js';

const PLANNER_SYSTEM_PROMPT = `You are Foreman's Planner Agent. Your job is to decompose a high-level brief into an executable DAG.

## Available Agent Roles
${Object.values(AGENT_ROLES).map(r => `- **${r.id}**: ${r.name} - Capabilities: ${r.capabilities.join(', ')}`).join('\n')}

## Output Format
Return a JSON object with this structure:
{
  "name": "DAG name",
  "description": "What this DAG accomplishes",
  "nodes": [
    {
      "id": "unique-id",
      "type": "task" | "gate",
      "title": "Node title",
      "briefing": "Detailed instructions for the agent",
      "role": "agent-role-id",
      "allowed_files": ["glob patterns"],
      "gate_condition": "all_pass" | "any_pass" | "manual" // only for gates
    }
  ],
  "edges": [
    { "from": "node-id-1", "to": "node-id-2" }
  ]
}

## Planning Principles
1. **Parallelize** independent tasks (multiple edges from one node)
2. **Gate critical phases** (e.g., gate after architecture before implementation)
3. **Scope files narrowly** per task
4. **Use specialized roles** for each task type
5. **Keep tasks atomic** (one clear deliverable per task)
`;

export async function generateDagFromBrief(
  brief: string,
  project: string
): Promise<{ name: string; description: string; nodes: Partial<DagNode>[]; edges: DagEdge[] }> {
  const client = new Anthropic();

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 4096,
    system: PLANNER_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Project: ${project}\n\nBrief:\n${brief}\n\nGenerate a DAG to accomplish this. Return only valid JSON.`,
      },
    ],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  
  // Extract JSON from response (handle markdown code blocks)
  const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/) || [null, text];
  const dagSpec = JSON.parse(jsonMatch[1] || text);

  return dagSpec;
}
```

### 4. Role-Aware Task Execution

Modifiziere `TaskRunner` um Role System Prompts zu injecten:

```typescript
// In task-runner.ts

import { AGENT_ROLES } from './agent-roles.js';

async function buildTaskPrompt(task: Task, node?: DagNode): Promise<string> {
  let systemPrompt = '';
  
  // Get role-specific system prompt
  if (node?.role && AGENT_ROLES[node.role]) {
    const role = AGENT_ROLES[node.role];
    systemPrompt = role.system_prompt;
  }

  // Load project knowledge (future: from knowledge graph)
  const projectKnowledge = await loadProjectKnowledge(task.project);

  return `${systemPrompt}

## Project Context
${projectKnowledge}

## Task
${task.briefing || task.description}

## File Scope
Allowed: ${(task.allowed_files || ['**/*']).join(', ')}
Blocked: ${(task.blocked_files || []).join(', ') || 'None'}
`;
}
```

---

## Workflow: Brief → DAG → Execution

```
┌──────────────────────────────────────────────────────────────────┐
│ User via Claude Desktop                                          │
│ "Implement user authentication for zeon-api with Keycloak"       │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│ foreman_plan MCP Tool                                            │
│ → Calls Planner Agent with brief                                 │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│ Planner Agent (claude-sonnet-4-5)                                │
│ Decomposes brief into DAG:                                       │
│                                                                  │
│   ┌─────────────┐                                                │
│   │ Architecture│ role: backend-architect                       │
│   │ Design      │ "Design auth flow, endpoints, middleware"     │
│   └──────┬──────┘                                                │
│          │                                                       │
│          ▼                                                       │
│   ┌─────────────┐                                                │
│   │ GATE        │ gate_condition: manual                        │
│   │ Arch Review │ "Review architecture before implementation"   │
│   └──────┬──────┘                                                │
│          │                                                       │
│    ┌─────┴─────┐                                                 │
│    │           │                                                 │
│    ▼           ▼                                                 │
│ ┌──────┐  ┌──────────┐                                           │
│ │Keycloak│  │Middleware│  Parallel: 2 implementers               │
│ │Config │  │Auth      │                                          │
│ └───┬───┘  └────┬─────┘                                          │
│     │           │                                                │
│     └─────┬─────┘                                                │
│           ▼                                                      │
│    ┌─────────────┐                                               │
│    │ GATE        │ gate_condition: all_pass                     │
│    │ Integration │                                               │
│    └──────┬──────┘                                               │
│           │                                                      │
│           ▼                                                      │
│    ┌─────────────┐                                               │
│    │ Security    │ role: security-auditor                       │
│    │ Audit       │                                               │
│    └─────────────┘                                               │
│                                                                  │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│ foreman_create_dag (auto)                                        │
│ → Creates DAG in Bridge                                          │
│ → Returns DAG ID to user for approval                            │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│ User: "Looks good, execute"                                      │
│ → foreman_execute_dag                                            │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│ DAG Executor                                                     │
│ - Spawns tasks with role-specific system prompts                 │
│ - Manages parallelism per role                                   │
│ - Handles gates and approvals                                    │
│ - Routes completions/failures                                    │
└──────────────────────────────────────────────────────────────────┘
```

---

## Implementation Tasks

### Phase 1: Agent Roles (Foundation)

| Task | Files | Role |
|------|-------|------|
| Create `agent-roles.ts` with initial roles | `packages/bridge/src/agent-roles.ts` | backend-architect |
| Extend `DagNode` type with `role` field | `packages/bridge/src/dag-executor.ts` | backend-architect |
| Modify `TaskRunner` to inject role system prompts | `packages/bridge/src/task-runner.ts` | backend-architect |
| Add roles API endpoint `GET /roles` | `packages/bridge/src/routes/` | implementer |

### Phase 2: Planner Agent

| Task | Files | Role |
|------|-------|------|
| Implement `planner.ts` with DAG generation | `packages/bridge/src/planner.ts` | backend-architect |
| Wire up `foreman_plan` MCP tool | `packages/mcp-server/src/tools/` | implementer |
| Add Planner tests | `packages/bridge/src/__tests__/` | implementer |

### Phase 3: Dashboard Integration

| Task | Files | Role |
|------|-------|------|
| DAG visualization component (React Flow) | `packages/dashboard/src/components/` | frontend-architect |
| Role badge/icons in task list | `packages/dashboard/src/components/` | frontend-architect |
| Planner input form | `packages/dashboard/src/pages/` | frontend-architect |

### Phase 4: Knowledge Layer (Future)

| Task | Files | Role |
|------|-------|------|
| Define knowledge graph schema | `packages/bridge/src/knowledge/` | backend-architect |
| Implement knowledge loader | `packages/bridge/src/knowledge/` | backend-architect |
| Auto-learning from completed tasks | `packages/bridge/src/knowledge/` | backend-architect |

---

## File Scope Summary

```
packages/bridge/src/
├── agent-roles.ts          ← NEW: Role definitions
├── planner.ts              ← NEW: Planner agent
├── dag-executor.ts         ← MODIFY: Add role support
├── task-runner.ts          ← MODIFY: Inject role prompts
├── types.ts                ← MODIFY: Extend types
└── routes/
    ├── dags.ts             ← EXISTS
    └── roles.ts            ← NEW: Roles API

packages/mcp-server/src/
└── tools/
    └── plan.ts             ← NEW/MODIFY: Wire planner

packages/dashboard/src/
└── components/
    └── DagView/            ← NEW: DAG visualization
```

---

## Success Criteria

1. **Planner works**: `foreman_plan "Add user auth"` returns valid DAG JSON
2. **Roles respected**: Tasks use role-specific system prompts
3. **Parallel execution**: Independent nodes run simultaneously
4. **Gates block**: Manual gates wait for approval before continuing
5. **Dashboard shows**: DAG visualized as node graph with role badges

---

## Open Questions

1. **Model per Role**: Should expensive roles (architect) use Opus, cheap ones (implementer) use Sonnet?
2. **Knowledge Pre-loading**: How much context to inject? Full codebase scan or selective?
3. **Artifact Passing**: How do downstream nodes receive outputs from upstream? (e.g., architecture doc → implementer)
4. **Rollback**: If a downstream task fails, should upstream completed tasks be reverted?

---

*Briefing Version: 1.0*  
*Created: 2026-02-22*  
*Status: Ready for Implementation*
