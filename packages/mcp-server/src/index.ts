#!/usr/bin/env node
/**
 * Foreman MCP Server — The control interface for the Foreman agentic orchestration system.
 *
 * ## Architecture
 * Claude Desktop ←(MCP/stdio)→ This MCP Server ←(HTTP REST)→ Bridge API ←→ Agent Workers (Claude Code, etc.)
 *
 * ## How It Works
 * Foreman runs AI coding agents on a remote server. Each agent gets a sandboxed project directory,
 * a detailed briefing, and file scope constraints. The Bridge API (running on the server) manages
 * tasks, DAGs, and agent processes. This MCP server is the CLI-style interface that Claude Desktop
 * uses to control everything.
 *
 * ## Workflow Options
 *
 * ### Option A: Quick Single Task
 * 1. foreman_init_project → creates project folder + private GitHub repo
 * 2. foreman_create_task → creates + auto-starts a task
 * 3. foreman_task_status → poll until status is "completed" or "failed" (poll every 15-30s)
 * 4. foreman_get_diff → see what the agent changed
 * 5. foreman_approve / foreman_reject → accept or reject changes
 *
 * ### Option B: Multi-Agent DAG Workflow (recommended for complex projects)
 * 1. foreman_init_project → creates project folder + private GitHub repo
 * 2. foreman_plan → AI planner decomposes a brief into a DAG of tasks with roles
 * 3. foreman_execute_dag → starts the DAG (runs tasks in dependency order)
 * 4. foreman_dag_status → poll until all nodes are "completed" (poll every 15-30s)
 *    - Gate nodes pause execution until you call foreman_approve_gate
 * 5. Review final output in the dashboard or via foreman_task_status per node
 *
 * ### Option C: Manual DAG Assembly
 * 1. foreman_init_project → creates project folder + private GitHub repo
 * 2. foreman_list_roles → see available agent roles
 * 3. foreman_create_dag → manually define nodes + edges
 * 4. foreman_execute_dag → start it
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

// ── Configuration ──────────────────────────────────────────────
const BRIDGE_URL = process.env.BRIDGE_URL || 'http://localhost:3000';
const FOREMAN_AUTH_TOKEN = process.env.FOREMAN_AUTH_TOKEN || '';

if (!FOREMAN_AUTH_TOKEN) {
  console.error('❌ FOREMAN_AUTH_TOKEN environment variable is required');
  process.exit(1);
}

// ── Bridge HTTP Client ─────────────────────────────────────────
async function callBridge(path: string, options: RequestInit = {}): Promise<any> {
  const url = `${BRIDGE_URL}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${FOREMAN_AUTH_TOKEN}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Bridge API error (${response.status}): ${error}`);
  }

  return response.json();
}

function textResult(text: string): CallToolResult {
  return { content: [{ type: 'text', text }] };
}

function errorResult(error: unknown): CallToolResult {
  const msg = error instanceof Error ? error.message : String(error);
  return { content: [{ type: 'text', text: `❌ Error: ${msg}` }] };
}

// ── MCP Server Setup ───────────────────────────────────────────
const server = new McpServer(
  { name: 'foreman-mcp-server', version: '0.2.0' },
  { capabilities: {} }
);

// Helper to bypass TS2589 deep type instantiation in MCP SDK generics
const registerTool = (name: string, config: any, handler: any) =>
  (server as any).registerTool(name, config, handler);

// ════════════════════════════════════════════════════════════════
// TOOL 1: Initialize Project
// ════════════════════════════════════════════════════════════════
registerTool(
  'foreman_init_project',
  {
    description:
      `Create a new project workspace on the Foreman server with an optional private GitHub repository. ` +
      `This is typically the FIRST step before creating tasks or DAGs. ` +
      `Creates a directory at /home/foreman/projects/<name>, initializes git, creates a README, ` +
      `and optionally creates a private GitHub repo and pushes the initial commit. ` +
      `After this, use the returned project name as the "project" parameter in other tools.`,
    inputSchema: {
      name: z.string().describe('Project name (used as directory name and optionally GitHub repo name). Use kebab-case, e.g. "dgx-spark-training"'),
      description: z.string().describe('Project description for README and GitHub repo. Pass empty string to skip.'),
      github_repo: z.string().describe('GitHub repo name, or "true" to use project name, or "false" to skip. Defaults to "true".'),
      github_org: z.string().describe('GitHub organization to create the repo under. Pass empty string for personal account.'),
    },
  },
  async (params: any): Promise<CallToolResult> => {
    try {
      const body: any = { ...params };
      // Convert string github_repo to boolean/string for bridge
      if (body.github_repo === 'false') body.github_repo = false;
      else if (body.github_repo === 'true' || !body.github_repo || !body.github_repo.trim()) body.github_repo = true;
      // Clean up empty strings
      if (!body.description || !body.description.trim()) delete body.description;
      if (!body.github_org || !body.github_org.trim()) delete body.github_org;
      const result = await callBridge('/projects/init', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      let text = `✅ Project initialized!\n\n`;
      text += `📁 Directory: ${result.project_dir}\n`;
      text += `📋 Name: ${result.project_name}\n`;
      text += `🐙 GitHub: ${result.github_repo}\n\n`;
      text += `Use this as the "project" parameter in subsequent commands:\n`;
      text += `  project: "${result.project_name}"`;
      return textResult(text);
    } catch (error) {
      return errorResult(error);
    }
  }
);

// ════════════════════════════════════════════════════════════════
// TOOL 2: Create Task
// ════════════════════════════════════════════════════════════════
registerTool(
  'foreman_create_task',
  {
    description:
      `Create and immediately start a coding task for an AI agent on the Foreman server. ` +
      `The agent (Claude Code by default) runs in the project directory with file scope enforcement. ` +
      `The task auto-starts — you do NOT need to start it separately. ` +
      `After creating, poll foreman_task_status every 15-30 seconds until status is "completed" or "failed". ` +
      `IMPORTANT: The "project" param should be the project name (not a full path) — it maps to /home/foreman/projects/<project>. ` +
      `If you haven't initialized the project yet, use foreman_init_project first.`,
    inputSchema: {
      project: z.string().describe('Project name (e.g. "dgx-spark-training"). Maps to /home/foreman/projects/<name> on the server.'),
      title: z.string().describe('Short task title (1 line summary)'),
      briefing: z.string().describe(
        'Detailed task description. Write this like a thorough spec: what to build, acceptance criteria, ' +
        'technical requirements, file structure. The agent has NO prior context — everything it needs to know must be here.'
      ),
      allowed_files: z.string().describe(
        'Comma-separated glob patterns for files the agent CAN modify (e.g. "src/**,tests/**"). Use "**/*" for all files.'
      ),
      blocked_files: z.string().describe(
        'Comma-separated glob patterns for files the agent must NOT touch. Pass empty string if none.'
      ),
      role: z.string().describe(
        'Agent role ID from foreman_list_roles (e.g. "implementer", "backend-architect"). ' +
        'Pass empty string for general purpose.'
      ),
      agent: z.string().describe('AI agent runtime: "claude-code" (default) or "augment"'),
    },
  },
  async (params: any): Promise<CallToolResult> => {
    try {
      const body: any = { ...params };
      // Convert comma-sep strings to arrays, handle empty strings
      if (body.allowed_files && body.allowed_files.trim()) body.allowed_files = body.allowed_files.split(',').map((s: string) => s.trim());
      else body.allowed_files = ['**/*'];
      if (body.blocked_files && body.blocked_files.trim()) body.blocked_files = body.blocked_files.split(',').map((s: string) => s.trim());
      else delete body.blocked_files;
      if (!body.role || !body.role.trim()) delete body.role;
      if (!body.agent || !body.agent.trim()) body.agent = 'claude-code';
      const result = await callBridge('/tasks', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const task = result.task || result;

      return textResult(
        `✅ Task created and started!\n\n` +
        `🆔 Task ID: ${task.id}\n` +
        `📋 Title: ${task.title}\n` +
        `🤖 Agent: ${task.agent}\n` +
        `📁 Project: ${task.project}\n` +
        `📊 Status: ${task.status}\n\n` +
        `⏳ The agent is now working. Poll foreman_task_status with task_id="${task.id}" every 15-30 seconds to check progress.\n` +
        `When status is "completed", use foreman_get_diff to review changes.`
      );
    } catch (error) {
      return errorResult(error);
    }
  }
);

// ════════════════════════════════════════════════════════════════
// TOOL 3: Task Status
// ════════════════════════════════════════════════════════════════
registerTool(
  'foreman_task_status',
  {
    description:
      `Check the current status of a task. Returns status, agent output, and timing info. ` +
      `Possible statuses: "pending" (queued), "running" (agent working), "completed" (success), ` +
      `"failed" (error), "reviewing" (needs approval). ` +
      `Poll this every 15-30 seconds while status is "running". ` +
      `When "completed": use foreman_get_diff to see changes. When "failed": check the error output.`,
    inputSchema: {
      task_id: z.string().describe('Task ID returned from foreman_create_task'),
    },
  },
  async (params: any): Promise<CallToolResult> => {
    try {
      const result = await callBridge(`/tasks/${params.task_id}`);
      const task = result.task || result;

      let text = `📊 Task: ${task.title}\n`;
      text += `Status: ${task.status}\n`;
      text += `Agent: ${task.agent}\n`;
      text += `Project: ${task.project}\n`;
      text += `Created: ${task.created_at}\n`;
      if (task.started_at) text += `Started: ${task.started_at}\n`;
      if (task.completed_at) text += `Completed: ${task.completed_at}\n`;

      if (task.output && task.output.length > 0) {
        const lines = task.output.slice(-30);
        text += `\n── Agent Output (last ${lines.length} lines) ──\n`;
        text += lines.join('\n');
        text += '\n';
      }

      if (task.agent_output && task.status === 'failed') {
        text += `\n❌ Error: ${task.agent_output}\n`;
      }

      // Guidance
      if (task.status === 'running') {
        text += `\n⏳ Still running. Poll again in 15-30 seconds.`;
      } else if (task.status === 'completed') {
        text += `\n✅ Done! Use foreman_get_diff to review the changes.`;
      } else if (task.status === 'failed') {
        text += `\n❌ Failed. Review the error above. You can retry with foreman_create_task or foreman_reject with feedback.`;
      }

      return textResult(text);
    } catch (error) {
      return errorResult(error);
    }
  }
);

// ════════════════════════════════════════════════════════════════
// TOOL 4: Get Diff
// ════════════════════════════════════════════════════════════════
registerTool(
  'foreman_get_diff',
  {
    description:
      `Get the git diff of changes made by an agent for a completed task. ` +
      `Only useful after a task reaches "completed" status. ` +
      `After reviewing, use foreman_approve to accept or foreman_reject to discard.`,
    inputSchema: {
      task_id: z.string().describe('Task ID'),
    },
  },
  async (params: any): Promise<CallToolResult> => {
    try {
      const result = await callBridge(`/tasks/${params.task_id}/diff`);
      if (!result.diff || result.diff.trim() === '') {
        return textResult('📝 No file changes detected.');
      }
      return textResult(
        `📝 Changes for task ${params.task_id}:\n\n\`\`\`diff\n${result.diff}\n\`\`\`\n\n` +
        `Use foreman_approve to accept or foreman_reject to discard.`
      );
    } catch (error) {
      return errorResult(error);
    }
  }
);

// ════════════════════════════════════════════════════════════════
// TOOL 5: Approve Task
// ════════════════════════════════════════════════════════════════
registerTool(
  'foreman_approve',
  {
    description: 'Approve and commit the changes from a completed task.',
    inputSchema: {
      task_id: z.string().describe('Task ID'),
      push: z.string().describe('"true" (default) to push to remote GitHub after committing, "false" to skip push'),
    },
  },
  async (params: any): Promise<CallToolResult> => {
    try {
      const push = params.push !== 'false';
      const result = await callBridge(`/tasks/${params.task_id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ push }),
      });
      return textResult(`✅ Approved! ${result.message || 'Changes committed.'}`);
    } catch (error) {
      return errorResult(error);
    }
  }
);

// ════════════════════════════════════════════════════════════════
// TOOL 6: Reject Task
// ════════════════════════════════════════════════════════════════
registerTool(
  'foreman_reject',
  {
    description: 'Reject a completed task\'s changes and optionally retry with feedback.',
    inputSchema: {
      task_id: z.string().describe('Task ID'),
      feedback: z.string().describe('What was wrong and what to do differently. Pass empty string if no feedback.'),
      retry: z.string().describe('"true" to automatically retry the task with feedback, "false" (default) to just reject'),
    },
  },
  async (params: any): Promise<CallToolResult> => {
    try {
      await callBridge(`/tasks/${params.task_id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ feedback: params.feedback || undefined, retry: params.retry === 'true' }),
      });
      let text = `❌ Task rejected.`;
      if (params.feedback) text += `\nFeedback: ${params.feedback}`;
      if (params.retry === 'true') text += `\n🔄 Retrying with feedback.`;
      return textResult(text);
    } catch (error) {
      return errorResult(error);
    }
  }
);

// ════════════════════════════════════════════════════════════════
// TOOL 7: Delete Task
// ════════════════════════════════════════════════════════════════
registerTool(
  'foreman_delete_task',
  {
    description: 'Delete a task (and kill its running agent process if active). Use foreman_delete_all_tasks to clear everything.',
    inputSchema: {
      task_id: z.string().describe('Task ID to delete'),
    },
  },
  async (params: any): Promise<CallToolResult> => {
    try {
      await callBridge(`/tasks/${params.task_id}`, { method: 'DELETE' });
      return textResult(`🗑️ Task ${params.task_id} deleted.`);
    } catch (error) {
      return errorResult(error);
    }
  }
);

// ════════════════════════════════════════════════════════════════
// TOOL 8: Delete All Tasks
// ════════════════════════════════════════════════════════════════
registerTool(
  'foreman_delete_all_tasks',
  {
    description: 'Delete ALL tasks and kill any running agent processes. Use with caution.',
    inputSchema: {},
  },
  async (): Promise<CallToolResult> => {
    try {
      const result = await callBridge('/tasks', { method: 'DELETE' });
      return textResult(`🗑️ Deleted ${result.deleted} tasks.`);
    } catch (error) {
      return errorResult(error);
    }
  }
);

// ════════════════════════════════════════════════════════════════
// TOOL 9: Plan DAG
// ════════════════════════════════════════════════════════════════
registerTool(
  'foreman_plan',
  {
    description:
      `Use the AI Planner to decompose a high-level project brief into a DAG (Directed Acyclic Graph) workflow. ` +
      `The planner assigns specialised agent roles to each task node and sets up dependencies. ` +
      `By default auto_create=true, which immediately creates the DAG. ` +
      `After creation, call foreman_execute_dag to start execution. ` +
      `IMPORTANT: The planner calls an LLM and may take 20-60 seconds to respond. Be patient.`,
    inputSchema: {
      project: z.string().describe('Project name (must already exist via foreman_init_project)'),
      brief: z.string().describe(
        'High-level description of what needs to be built. Be thorough: include goals, tech stack, ' +
        'architecture, constraints, acceptance criteria. The planner will decompose this into parallel/sequential tasks.'
      ),
      context: z.string().describe('Additional context such as existing codebase info, API specs, or architecture diagrams. Pass empty string if none.'),
      auto_create: z.string().describe('"true" (default) to create the DAG immediately, "false" to just return the plan for review'),
    },
  },
  async (params: any): Promise<CallToolResult> => {
    try {
      const body: any = { ...params };
      // Convert string params to proper types for bridge
      body.auto_create = params.auto_create !== 'false';
      if (!body.context || !body.context.trim()) delete body.context;
      const result = await callBridge('/dags/plan', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      if (result.dag) {
        let text = `✅ DAG planned and created!\n\n`;
        text += `🆔 DAG ID: ${result.dag.id}\n`;
        text += `📋 Name: ${result.dag.name}\n`;
        text += `📊 Nodes: ${result.dag.nodes.length} | Edges: ${result.dag.edges.length}\n\n`;
        text += `── Nodes ──\n`;
        for (const node of result.dag.nodes) {
          const emoji = node.type === 'gate' ? '🚧' : '🔧';
          text += `${emoji} ${node.title} [${node.type}] → role: ${node.role || 'none'}\n`;
          if (node.briefing) text += `   ${node.briefing.slice(0, 100)}${node.briefing.length > 100 ? '...' : ''}\n`;
        }
        text += `\n🚀 Next: Call foreman_execute_dag with dag_id="${result.dag.id}" to start execution.`;
        text += `\n📊 Monitor: Call foreman_dag_status with dag_id="${result.dag.id}" to track progress (poll every 15-30s).`;
        return textResult(text);
      } else {
        return textResult(
          `📋 Planned DAG (not yet created):\n\n` +
          `\`\`\`json\n${JSON.stringify(result.planned, null, 2)}\n\`\`\`\n\n` +
          `Use foreman_create_dag with this data to create it, or foreman_plan with auto_create=true.`
        );
      }
    } catch (error) {
      return errorResult(error);
    }
  }
);

// ════════════════════════════════════════════════════════════════
// TOOL 10: Create DAG (manual)
// ════════════════════════════════════════════════════════════════
registerTool(
  'foreman_create_dag',
  {
    description:
      `Manually create a DAG workflow. For most cases, use foreman_plan instead — it generates the DAG automatically. ` +
      `Use this only when you need precise control over node definitions and dependencies. ` +
      `After creating, call foreman_execute_dag to start it.`,
    inputSchema: {
      name: z.string().describe('DAG name'),
      description: z.string().describe('What this DAG accomplishes'),
      project: z.string().describe('Project name'),
      created_by: z.string().describe('"planner" or "manual" (default: "manual")'),
      approval_mode: z.string().describe('"per_task", "end_only", or "gate_configured" (default). Controls when approval gates trigger.'),
      nodes: z.string().describe(
        'JSON string of node array: [{ id, title, type ("task"|"gate"), briefing, role, allowed_files?, blocked_files?, gate_condition? }]'
      ),
      edges: z.string().describe('JSON string of edge array: [{ from: "node_id", to: "node_id" }]'),
    },
  },
  async (params: any): Promise<CallToolResult> => {
    try {
      const body: any = {
        name: params.name,
        description: params.description,
        project: params.project,
        created_by: params.created_by || 'manual',
        approval_mode: params.approval_mode || 'gate_configured',
        nodes: JSON.parse(params.nodes),
        edges: JSON.parse(params.edges),
      };
      const dag = await callBridge('/dags', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return textResult(
        `✅ DAG created!\n\n` +
        `🆔 DAG ID: ${dag.id}\n` +
        `📋 Name: ${dag.name}\n` +
        `📊 Nodes: ${dag.nodes?.length || 0} | Edges: ${dag.edges?.length || 0}\n\n` +
        `🚀 Call foreman_execute_dag with dag_id="${dag.id}" to start execution.`
      );
    } catch (error) {
      return errorResult(error);
    }
  }
);

// ════════════════════════════════════════════════════════════════
// TOOL 11: Execute DAG
// ════════════════════════════════════════════════════════════════
registerTool(
  'foreman_execute_dag',
  {
    description:
      `Start executing a DAG workflow. Tasks run in dependency order — parallel when possible. ` +
      `Gate nodes will pause execution until you call foreman_approve_gate. ` +
      `After starting, poll foreman_dag_status every 15-30 seconds to monitor progress. ` +
      `Overall DAG status goes: "created" → "running" → "completed" (or "failed").`,
    inputSchema: {
      dag_id: z.string().describe('DAG ID from foreman_plan or foreman_create_dag'),
    },
  },
  async (params: any): Promise<CallToolResult> => {
    try {
      const dag = await callBridge(`/dags/${params.dag_id}/execute`, { method: 'POST' });
      return textResult(
        `🚀 DAG execution started!\n\n` +
        `🆔 DAG ID: ${dag.id}\n` +
        `📊 Status: ${dag.status}\n\n` +
        `⏳ Poll foreman_dag_status with dag_id="${dag.id}" every 15-30 seconds to track progress.\n` +
        `🚧 If a gate node is reached, you'll see status "waiting_approval" — call foreman_approve_gate to continue.`
      );
    } catch (error) {
      return errorResult(error);
    }
  }
);

// ════════════════════════════════════════════════════════════════
// TOOL 12: DAG Status
// ════════════════════════════════════════════════════════════════
registerTool(
  'foreman_dag_status',
  {
    description:
      `Get detailed status of a DAG and all its nodes. ` +
      `Node statuses: "pending" (waiting for deps), "running" (agent active), "completed", "failed", "waiting_approval" (gate). ` +
      `DAG statuses: "created" (not started), "running", "completed", "failed". ` +
      `Poll every 15-30s while status is "running". ` +
      `When a gate node shows "waiting_approval", call foreman_approve_gate to resume execution.`,
    inputSchema: {
      dag_id: z.string().describe('DAG ID'),
    },
  },
  async (params: any): Promise<CallToolResult> => {
    try {
      const dag = await callBridge(`/dags/${params.dag_id}`);

      let text = `📊 DAG: ${dag.name}\n`;
      text += `Status: ${dag.status}\n`;
      text += `Project: ${dag.project}\n`;
      if (dag.started_at) text += `Started: ${dag.started_at}\n`;
      if (dag.completed_at) text += `Completed: ${dag.completed_at}\n`;

      const stats = {
        total: (dag.nodes || []).length,
        completed: (dag.nodes || []).filter((n: any) => n.status === 'completed').length,
        running: (dag.nodes || []).filter((n: any) => n.status === 'running').length,
        failed: (dag.nodes || []).filter((n: any) => n.status === 'failed').length,
        waiting: (dag.nodes || []).filter((n: any) => n.status === 'waiting_approval').length,
        pending: (dag.nodes || []).filter((n: any) => n.status === 'pending').length,
      };
      text += `Progress: ${stats.completed}/${stats.total} completed`;
      if (stats.running) text += ` | ${stats.running} running`;
      if (stats.waiting) text += ` | ${stats.waiting} awaiting approval`;
      if (stats.failed) text += ` | ${stats.failed} failed`;
      text += '\n\n── Nodes ──\n';

      for (const node of (dag.nodes || [])) {
        const icon =
          node.status === 'completed' ? '✅' :
          node.status === 'running' ? '⚡' :
          node.status === 'failed' ? '❌' :
          node.status === 'waiting_approval' ? '🚧' :
          '⏳';
        text += `${icon} ${node.title} [${node.type}] — ${node.status}`;
        if (node.role) text += ` (${node.role})`;
        text += '\n';
        if (node.error) text += `   Error: ${node.error}\n`;
      }

      // Guidance
      if (dag.status === 'running') {
        if (stats.waiting > 0) {
          const gates = (dag.nodes || []).filter((n: any) => n.status === 'waiting_approval');
          text += `\n🚧 Gate(s) waiting for approval:\n`;
          for (const g of gates) {
            text += `  → foreman_approve_gate(dag_id="${dag.id}", node_id="${g.id}")\n`;
          }
        } else {
          text += `\n⏳ Still running. Poll again in 15-30 seconds.`;
        }
      } else if (dag.status === 'completed') {
        text += `\n✅ All nodes completed! Review results in the Foreman dashboard.`;
      } else if (dag.status === 'failed') {
        text += `\n❌ DAG failed. Check node errors above.`;
      }

      return textResult(text);
    } catch (error) {
      return errorResult(error);
    }
  }
);

// ════════════════════════════════════════════════════════════════
// TOOL 13: Approve Gate
// ════════════════════════════════════════════════════════════════
registerTool(
  'foreman_approve_gate',
  {
    description:
      `Approve a gate node in a running DAG to continue execution. ` +
      `Gate nodes act as checkpoints — they pause the DAG until explicitly approved. ` +
      `Use foreman_dag_status to find nodes with status "waiting_approval".`,
    inputSchema: {
      dag_id: z.string().describe('DAG ID'),
      node_id: z.string().describe('Gate node ID (from foreman_dag_status)'),
    },
  },
  async (params: any): Promise<CallToolResult> => {
    try {
      await callBridge(`/dags/${params.dag_id}/nodes/${params.node_id}/approve`, { method: 'POST' });
      return textResult(`✅ Gate "${params.node_id}" approved. DAG execution continues.`);
    } catch (error) {
      return errorResult(error);
    }
  }
);

// ════════════════════════════════════════════════════════════════
// TOOL 14: Delete DAG
// ════════════════════════════════════════════════════════════════
registerTool(
  'foreman_delete_dag',
  {
    description: 'Delete a DAG workflow.',
    inputSchema: {
      dag_id: z.string().describe('DAG ID to delete'),
    },
  },
  async (params: any): Promise<CallToolResult> => {
    try {
      await callBridge(`/dags/${params.dag_id}`, { method: 'DELETE' });
      return textResult(`🗑️ DAG ${params.dag_id} deleted.`);
    } catch (error) {
      return errorResult(error);
    }
  }
);

// ════════════════════════════════════════════════════════════════
// TOOL 15: List Tasks
// ════════════════════════════════════════════════════════════════
registerTool(
  'foreman_list_tasks',
  {
    description: 'List all tasks in the system with their current status.',
    inputSchema: {},
  },
  async (): Promise<CallToolResult> => {
    try {
      const result = await callBridge('/tasks');
      const tasks = result.tasks || [];
      if (tasks.length === 0) return textResult('📋 No tasks.');

      let text = `📋 Tasks (${tasks.length}):\n\n`;
      for (const t of tasks) {
        const icon = t.status === 'completed' ? '✅' : t.status === 'running' ? '⚡' : t.status === 'failed' ? '❌' : '⏳';
        text += `${icon} [${t.status}] ${t.title || 'Untitled'} — ID: ${t.id}\n`;
        text += `   Agent: ${t.agent} | Project: ${t.project}\n\n`;
      }
      return textResult(text);
    } catch (error) {
      return errorResult(error);
    }
  }
);

// ════════════════════════════════════════════════════════════════
// TOOL 16: List DAGs
// ════════════════════════════════════════════════════════════════
registerTool(
  'foreman_list_dags',
  {
    description: 'List all DAG workflows with their current status.',
    inputSchema: {},
  },
  async (): Promise<CallToolResult> => {
    try {
      const result = await callBridge('/dags');
      const dags = result.dags || [];
      if (dags.length === 0) return textResult('📋 No DAGs.');

      let text = `📋 DAGs (${dags.length}):\n\n`;
      for (const d of dags) {
        const icon = d.status === 'completed' ? '✅' : d.status === 'running' ? '⚡' : d.status === 'failed' ? '❌' : '⏳';
        text += `${icon} [${d.status}] ${d.name} — ID: ${d.id}\n`;
        text += `   Nodes: ${d.nodes?.length || 0} | Project: ${d.project}\n\n`;
      }
      return textResult(text);
    } catch (error) {
      return errorResult(error);
    }
  }
);

// ════════════════════════════════════════════════════════════════
// TOOL 17: List Roles
// ════════════════════════════════════════════════════════════════
registerTool(
  'foreman_list_roles',
  {
    description:
      `List all available agent roles. Roles define the expertise and system prompt for each agent. ` +
      `Use role IDs when creating tasks or planning DAGs. ` +
      `Available roles include: planner, backend-architect, frontend-architect, security-auditor, implementer, reviewer.`,
    inputSchema: {},
  },
  async (): Promise<CallToolResult> => {
    try {
      const result = await callBridge('/roles');
      let text = '🎭 Agent Roles:\n\n';
      for (const role of (result.roles || [])) {
        text += `**${role.name}** (ID: \`${role.id}\`)\n`;
        text += `  ${role.description}\n`;
        if (role.capabilities?.length) text += `  Capabilities: ${role.capabilities.join(', ')}\n`;
        text += `  Model: ${role.model}\n\n`;
      }
      return textResult(text);
    } catch (error) {
      return errorResult(error);
    }
  }
);

// ── Start Transport ────────────────────────────────────────────
const transport = new StdioServerTransport();
server.connect(transport).then(() => {
  console.error('🚀 Foreman MCP Server v0.2.0 started');
  console.error(`📡 Bridge: ${BRIDGE_URL}`);
  console.error(`🔧 Tools: 17 registered`);
});

