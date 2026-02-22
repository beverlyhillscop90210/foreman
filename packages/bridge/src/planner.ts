// ── Planner Agent ──────────────────────────────────────────────
// Decomposes a high-level project brief into an executable DAG
// by calling an LLM (via OpenRouter) with the Planner role prompt.

import { AGENT_ROLES, listRoles } from './agent-roles.js';
import type { DagNode, DagEdge, ApprovalMode } from './dag-executor.js';

export interface PlannerInput {
  project: string;
  brief: string;
  /** Optional extra context (e.g. codebase summary, existing architecture) */
  context?: string;
}

export interface PlannerOutput {
  name: string;
  description: string;
  project: string;
  created_by: 'planner';
  approval_mode: ApprovalMode;
  nodes: Partial<DagNode>[];
  edges: DagEdge[];
}

// ── JSON Schema for the DAG (given to the LLM) ────────────────

const DAG_SCHEMA = `{
  "name": "string — descriptive pipeline name",
  "description": "string — what this DAG achieves",
  "approval_mode": "per_task | end_only | gate_configured",
  "nodes": [
    {
      "id": "string — unique node ID (e.g. 'arch-design', 'impl-auth')",
      "type": "task | gate",
      "title": "string — short title",
      "briefing": "string — detailed, self-contained instructions for the agent",
      "role": "string — one of the available role IDs",
      "allowed_files": ["glob patterns"],
      "blocked_files": ["glob patterns"],
      "gate_condition": "all_pass | any_pass | manual  (only for gate nodes)"
    }
  ],
  "edges": [
    { "from": "source-node-id", "to": "target-node-id" }
  ]
}`;

/**
 * Generate a DAG from a high-level brief using an LLM.
 */
export async function generateDagFromBrief(
  input: PlannerInput,
  apiKey?: string,
): Promise<PlannerOutput> {
  const key = apiKey || process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error('OPENROUTER_API_KEY is required for the Planner agent');
  }

  const plannerRole = AGENT_ROLES['planner'];
  const availableRoles = listRoles()
    .filter(r => r.id !== 'planner')
    .map(r => `- **${r.id}**: ${r.description} (capabilities: ${r.capabilities.join(', ')})`)
    .join('\n');

  const systemPrompt = `${plannerRole.system_prompt}

## Available Agent Roles
${availableRoles}

## Output Schema
Return a single JSON object matching this schema:
${DAG_SCHEMA}

Important rules:
- Each task node MUST have a "role" field set to one of the available role IDs.
- Gate nodes do NOT need a role.
- Ensure the graph is a valid DAG (no cycles).
- Make task briefings self-contained and actionable.
- Use parallel execution where tasks are independent.
- Place "gate" nodes with "gate_condition": "manual" before critical phases (e.g. before implementation, before deployment).
- The project is: "${input.project}"`;

  const userMessage = input.context
    ? `## Brief\n${input.brief}\n\n## Additional Context\n${input.context}`
    : input.brief;

  console.log(`🧠 Planner: Generating DAG for project "${input.project}"...`);

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: plannerRole.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.3,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Planner LLM call failed: ${response.status} ${errorText}`);
  }

  const data = await response.json() as any;
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('Planner LLM returned empty response');
  }

  // Extract JSON from the response (may be wrapped in ```json blocks)
  const jsonMatch = content.match(/```json\s*([\s\S]*?)```/) || content.match(/(\{[\s\S]*\})/);
  if (!jsonMatch) {
    throw new Error(`Planner LLM did not return valid JSON. Response:\n${content.slice(0, 500)}`);
  }

  let dagJson: any;
  try {
    dagJson = JSON.parse(jsonMatch[1]);
  } catch (err) {
    throw new Error(`Failed to parse Planner JSON: ${err}\nRaw:\n${jsonMatch[1].slice(0, 500)}`);
  }

  // Validate basic structure
  if (!dagJson.nodes || !Array.isArray(dagJson.nodes)) {
    throw new Error('Planner output missing "nodes" array');
  }
  if (!dagJson.edges || !Array.isArray(dagJson.edges)) {
    throw new Error('Planner output missing "edges" array');
  }

  // Validate node IDs are unique
  const nodeIds = new Set<string>();
  for (const node of dagJson.nodes) {
    if (!node.id) throw new Error('Planner node missing "id"');
    if (nodeIds.has(node.id)) throw new Error(`Duplicate node ID: ${node.id}`);
    nodeIds.add(node.id);
  }

  // Validate edges reference valid nodes
  for (const edge of dagJson.edges) {
    if (!nodeIds.has(edge.from)) throw new Error(`Edge references unknown source: ${edge.from}`);
    if (!nodeIds.has(edge.to)) throw new Error(`Edge references unknown target: ${edge.to}`);
  }

  // Validate roles exist
  for (const node of dagJson.nodes) {
    if (node.type !== 'gate' && node.role && !AGENT_ROLES[node.role]) {
      console.warn(`Planner assigned unknown role "${node.role}" to node "${node.id}", defaulting to "implementer"`);
      node.role = 'implementer';
    }
  }

  const result: PlannerOutput = {
    name: dagJson.name || `Plan: ${input.brief.slice(0, 50)}`,
    description: dagJson.description || input.brief,
    project: input.project,
    created_by: 'planner',
    approval_mode: dagJson.approval_mode || 'gate_configured',
    nodes: dagJson.nodes,
    edges: dagJson.edges,
  };

  console.log(`🧠 Planner: Generated DAG "${result.name}" with ${result.nodes.length} nodes, ${result.edges.length} edges`);
  return result;
}
