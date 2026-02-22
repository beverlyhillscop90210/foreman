#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod/v3';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

// Configuration
const BRIDGE_URL = process.env.BRIDGE_URL || 'http://localhost:3000';
const FOREMAN_AUTH_TOKEN = process.env.FOREMAN_AUTH_TOKEN || '';

if (!FOREMAN_AUTH_TOKEN) {
  console.error('❌ FOREMAN_AUTH_TOKEN environment variable is required');
  process.exit(1);
}

// Helper function to call Bridge API
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

  const json = await response.json();
  return json;
}

// Helper to make tool results from text
function textResult(text: string): CallToolResult {
  return { content: [{ type: 'text', text }] };
}

// Helper to make error results
function errorResult(error: unknown): CallToolResult {
  const msg = error instanceof Error ? error.message : String(error);
  return { content: [{ type: 'text', text: `❌ Error: ${msg}` }] };
}

// Create MCP server
const server = new McpServer(
  {
    name: 'foreman-mcp-server',
    version: '0.1.0',
  },
  {
    capabilities: {},
  }
);

// Tool 1: Create Task
server.registerTool(
  'foreman_create_task',
  {
    description: 'Create a new coding task for an AI agent. The agent will execute the task in a sandboxed environment with file scope enforcement.',
    inputSchema: {
      project: z.string().describe('Project directory path'),
      title: z.string().describe('Task title/summary'),
      briefing: z.string().describe('Detailed task description and requirements'),
      allowed_files: z.array(z.string()).describe('Glob patterns for files the agent can modify (e.g., ["src/api/**", "tests/**"])'),
      blocked_files: z.array(z.string()).optional().describe('Glob patterns for files the agent must not touch (takes precedence over allowed_files)'),
      agent: z.enum(['claude-code', 'augment']).optional().default('claude-code').describe('Which AI agent to use'),
      verification: z.string().optional().describe('How to verify the task was completed correctly'),
    },
  },
  async (params): Promise<CallToolResult> => {
    try {
      const result = await callBridge('/tasks', {
        method: 'POST',
        body: JSON.stringify(params),
      });

      // Bridge returns the task object directly (or may wrap in { task })
      const task = result.task || result;

      return textResult(
        `✅ Task created successfully!\n\n` +
        `Task ID: ${task.id}\n` +
        `Status: ${task.status}\n` +
        `Agent: ${task.agent}\n` +
        `Project: ${task.project}\n` +
        `\nThe agent is now working on: "${task.title}"\n\n` +
        `Use foreman_task_status to check progress.`
      );
    } catch (error) {
      return errorResult(error);
    }
  }
);

// Tool 2: Get Task Status
server.registerTool(
  'foreman_task_status',
  {
    description: 'Get the current status and output of a task',
    inputSchema: {
      task_id: z.string().describe('The task ID returned from foreman_create_task'),
    },
  },
  async (params): Promise<CallToolResult> => {
    try {
      const result = await callBridge(`/tasks/${params.task_id}`);
      const task = result.task || result;

      let statusText = `📊 Task Status: ${task.status}\n\n`;
      statusText += `Title: ${task.title}\n`;
      statusText += `Agent: ${task.agent}\n`;
      statusText += `Project: ${task.project}\n`;
      statusText += `Created: ${task.created_at}\n`;

      if (task.started_at) statusText += `Started: ${task.started_at}\n`;
      if (task.completed_at) statusText += `Completed: ${task.completed_at}\n`;

      if (task.output && task.output.length > 0) {
        const outputLines = task.output.slice(-50); // last 50 lines
        statusText += `\n📝 Agent Output (last ${outputLines.length} lines):\n${outputLines.join('\n')}\n`;
      }

      if (task.error || task.agent_output) {
        statusText += `\n❌ Error: ${task.error || task.agent_output}\n`;
      }

      if (task.status === 'completed') {
        statusText += `\n✅ Task completed! Use foreman_get_diff to see changes.`;
      }

      return textResult(statusText);
    } catch (error) {
      return errorResult(error);
    }
  }
);

// Tool 3: Get Diff
server.registerTool(
  'foreman_get_diff',
  {
    description: 'Get the git diff showing all changes made by the agent',
    inputSchema: {
      task_id: z.string().describe('The task ID'),
    },
  },
  async (params): Promise<CallToolResult> => {
    try {
      const result = await callBridge(`/tasks/${params.task_id}/diff`);

      if (!result.diff || result.diff.trim() === '') {
        return textResult('📝 No changes detected. The agent may still be working or the task produced no file modifications.');
      }

      return textResult(
        `📝 Git Diff for Task ${params.task_id}:\n\n\`\`\`diff\n${result.diff}\n\`\`\`\n\n` +
        `Use foreman_approve to commit these changes or foreman_reject to discard them.`
      );
    } catch (error) {
      return errorResult(error);
    }
  }
);

// Tool 4: Approve Task
server.registerTool(
  'foreman_approve',
  {
    description: 'Approve and commit the task changes to git',
    inputSchema: {
      task_id: z.string().describe('The task ID'),
      push: z.boolean().optional().default(false).describe('Whether to push to remote after committing'),
    },
  },
  async (params): Promise<CallToolResult> => {
    try {
      const result = await callBridge(`/tasks/${params.task_id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ push: params.push }),
      });

      return textResult(
        `✅ Task approved!\n\n` +
        `${result.message || 'Changes committed.'}\n` +
        `${params.push ? '📤 Pushed to remote' : '💾 Committed locally'}`
      );
    } catch (error) {
      return errorResult(error);
    }
  }
);

// Tool 5: Reject Task
server.registerTool(
  'foreman_reject',
  {
    description: 'Reject the task and optionally provide feedback for retry',
    inputSchema: {
      task_id: z.string().describe('The task ID'),
      feedback: z.string().optional().describe('Feedback explaining why the task was rejected'),
      retry: z.boolean().optional().default(false).describe('Whether to automatically retry the task with the feedback'),
    },
  },
  async (params): Promise<CallToolResult> => {
    try {
      await callBridge(`/tasks/${params.task_id}/reject`, {
        method: 'POST',
        body: JSON.stringify({
          feedback: params.feedback,
          retry: params.retry,
        }),
      });

      let text = `❌ Task rejected.\n`;
      if (params.feedback) text += `\nFeedback: ${params.feedback}\n`;
      if (params.retry) text += `\n🔄 Task will be retried with feedback.`;

      return textResult(text);
    } catch (error) {
      return errorResult(error);
    }
  }
);

// Tool 6: Create DAG
server.registerTool(
  'foreman_create_dag',
  {
    description: 'Create a new DAG workflow for multi-agent orchestration',
    inputSchema: {
      name: z.string().describe('Name of the DAG workflow'),
      description: z.string().describe('Description of the workflow'),
      project: z.string().describe('Project directory path'),
      created_by: z.enum(['planner', 'manual']).default('manual').describe('Who created this DAG'),
      approval_mode: z.enum(['per_task', 'end_only', 'gate_configured']).default('per_task').describe('How tasks are approved'),
      nodes: z.array(z.any()).describe('Array of DAG nodes (tasks, gates, etc.)'),
      edges: z.array(z.any()).describe('Array of DAG edges (dependencies)'),
    },
  },
  async (params): Promise<CallToolResult> => {
    try {
      const dag = await callBridge('/dags', {
        method: 'POST',
        body: JSON.stringify(params),
      });

      return textResult(
        `✅ DAG created successfully!\n\n` +
        `DAG ID: ${dag.id}\n` +
        `Name: ${dag.name}\n` +
        `Status: ${dag.status}\n` +
        `Nodes: ${dag.nodes?.length || 0}\n` +
        `Edges: ${dag.edges?.length || 0}\n\n` +
        `Use foreman_execute_dag to start it, or foreman_dag_status to check progress.`
      );
    } catch (error) {
      return errorResult(error);
    }
  }
);

// Tool 7: Execute DAG
server.registerTool(
  'foreman_execute_dag',
  {
    description: 'Start execution of a DAG workflow',
    inputSchema: {
      dag_id: z.string().describe('The DAG ID to execute'),
    },
  },
  async (params): Promise<CallToolResult> => {
    try {
      const dag = await callBridge(`/dags/${params.dag_id}/execute`, {
        method: 'POST',
      });

      return textResult(
        `🚀 DAG execution started!\n\n` +
        `DAG ID: ${dag.id}\n` +
        `Status: ${dag.status}\n\n` +
        `Use foreman_dag_status to check progress.`
      );
    } catch (error) {
      return errorResult(error);
    }
  }
);

// Tool 8: Get DAG Status
server.registerTool(
  'foreman_dag_status',
  {
    description: 'Get the current status of a DAG workflow and its nodes',
    inputSchema: {
      dag_id: z.string().describe('The DAG ID'),
    },
  },
  async (params): Promise<CallToolResult> => {
    try {
      const dag = await callBridge(`/dags/${params.dag_id}`);

      let statusText = `📊 DAG Status: ${dag.status}\n\n`;
      statusText += `Name: ${dag.name}\n`;
      statusText += `Project: ${dag.project}\n`;
      statusText += `Created: ${dag.created_at}\n`;
      if (dag.started_at) statusText += `Started: ${dag.started_at}\n`;
      if (dag.completed_at) statusText += `Completed: ${dag.completed_at}\n`;
      statusText += `\nNodes:\n`;

      for (const node of (dag.nodes || [])) {
        const icon = node.status === 'completed' ? '✅' : node.status === 'running' ? '🔄' : node.status === 'failed' ? '❌' : '⏳';
        statusText += `${icon} [${node.status}] ${node.title} (${node.type}${node.role ? `, role: ${node.role}` : ''})\n`;
        if (node.error) statusText += `   Error: ${node.error}\n`;
      }

      return textResult(statusText);
    } catch (error) {
      return errorResult(error);
    }
  }
);

// Tool 9: Plan DAG
server.registerTool(
  'foreman_plan',
  {
    description: 'Ask the Planner agent to decompose a high-level brief into an executable DAG workflow with specialised agent roles.',
    inputSchema: {
      project: z.string().describe('Project directory path'),
      brief: z.string().describe('High-level description of what needs to be built'),
      context: z.string().optional().describe('Additional context (e.g. architecture notes, constraints)'),
      auto_create: z.boolean().optional().default(true).describe('Whether to auto-create the DAG (true) or just return the plan (false)'),
    },
  },
  async (params): Promise<CallToolResult> => {
    try {
      const result = await callBridge('/dags/plan', {
        method: 'POST',
        body: JSON.stringify({
          project: params.project,
          brief: params.brief,
          context: params.context,
          auto_create: params.auto_create,
        }),
      });

      if (result.dag) {
        let text = `✅ Planner generated and created a DAG!\n\n`;
        text += `DAG ID: ${result.dag.id}\n`;
        text += `Name: ${result.dag.name}\n`;
        text += `Nodes: ${result.dag.nodes.length}\n`;
        text += `Edges: ${result.dag.edges.length}\n\n`;
        text += `Nodes:\n`;
        for (const node of result.dag.nodes) {
          text += `- [${node.type}] ${node.title} (role: ${node.role || 'none'})\n`;
        }
        text += `\nUse foreman_execute_dag with DAG ID "${result.dag.id}" to start execution.`;
        return { content: [{ type: 'text', text }] };
      } else {
        return {
          content: [{
            type: 'text',
            text: `📋 Planned DAG (not yet created):\n\n\`\`\`json\n${JSON.stringify(result.planned, null, 2)}\n\`\`\`\n\nUse foreman_create_dag with this JSON to create it.`,
          }],
        };
      }
    } catch (error: any) {
      return {
        content: [{
          type: 'text',
          text: `❌ Planning failed: ${error.message}`,
        }],
      };
    }
  }
);

// Tool 10: List Agent Roles
server.registerTool(
  'foreman_list_roles',
  {
    description: 'List all available agent roles with their capabilities and descriptions',
    inputSchema: {},
  },
  async (): Promise<CallToolResult> => {
    try {
      const result = await callBridge('/roles');
      let text = '🎭 Available Agent Roles:\n\n';
      for (const role of (result.roles || [])) {
        text += `**${role.name}** (\`${role.id}\`)\n`;
        text += `  ${role.description}\n`;
        text += `  Capabilities: ${role.capabilities?.join(', ') || 'N/A'}\n`;
        text += `  Model: ${role.model}\n\n`;
      }
      return textResult(text);
    } catch (error) {
      return errorResult(error);
    }
  }
);

// Tool 11: List Tasks
server.registerTool(
  'foreman_list_tasks',
  {
    description: 'List all tasks in the system',
    inputSchema: {},
  },
  async (): Promise<CallToolResult> => {
    try {
      const result = await callBridge('/tasks');
      const tasks = result.tasks || result || [];

      if (!Array.isArray(tasks) || tasks.length === 0) {
        return textResult('📋 No tasks found.');
      }

      let text = `📋 Tasks (${tasks.length}):\n\n`;
      for (const t of tasks) {
        const icon = t.status === 'completed' ? '✅' : t.status === 'running' ? '🔄' : t.status === 'failed' ? '❌' : '⏳';
        text += `${icon} **${t.title || 'Untitled'}** (ID: ${t.id})\n`;
        text += `   Status: ${t.status} | Agent: ${t.agent} | Project: ${t.project}\n`;
        if (t.created_at) text += `   Created: ${t.created_at}\n`;
        text += '\n';
      }
      return textResult(text);
    } catch (error) {
      return errorResult(error);
    }
  }
);

// Tool 12: List DAGs
server.registerTool(
  'foreman_list_dags',
  {
    description: 'List all DAG workflows',
    inputSchema: {},
  },
  async (): Promise<CallToolResult> => {
    try {
      const result = await callBridge('/dags');
      const dags = result.dags || result || [];

      if (!Array.isArray(dags) || dags.length === 0) {
        return textResult('📋 No DAGs found.');
      }

      let text = `📋 DAGs (${dags.length}):\n\n`;
      for (const d of dags) {
        const icon = d.status === 'completed' ? '✅' : d.status === 'running' ? '🔄' : d.status === 'failed' ? '❌' : '⏳';
        text += `${icon} **${d.name}** (ID: ${d.id})\n`;
        text += `   Status: ${d.status} | Nodes: ${d.nodes?.length || 0} | Project: ${d.project}\n`;
        if (d.created_at) text += `   Created: ${d.created_at}\n`;
        text += '\n';
      }
      return textResult(text);
    } catch (error) {
      return errorResult(error);
    }
  }
);

// Start stdio transport (standard for MCP servers)
const transport = new StdioServerTransport();
server.connect(transport).then(() => {
  console.error('🚀 Foreman MCP Server started');
  console.error(`📡 Connected to Bridge at ${BRIDGE_URL}`);
  console.error(`✅ Ready to receive commands from Claude.ai`);
});

