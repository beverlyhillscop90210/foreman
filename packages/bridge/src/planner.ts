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
  let key = apiKey || process.env.OPENROUTER_API_KEY;

  // Fallback: try loading from configService (same as chat endpoint)
  if (!key) {
    try {
      const { configService } = await import('./routes/config.js');
      if (configService) {
        const entry = await configService.getConfig('OPENROUTER_API_KEY', true);
        if (entry && entry.value) key = entry.value;
      }
    } catch { /* config not available */ }
  }

  if (!key) {
    throw new Error('OPENROUTER_API_KEY is required for the Planner agent. Set it via environment variable or in Settings > Config.');
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
- Make task briefings concise but actionable (MAX 3-4 sentences per briefing). Do NOT write essays.
- Keep node titles short (max 6 words).
- Use parallel execution where tasks are independent.
- Place "gate" nodes with "gate_condition": "manual" before critical phases (e.g. before implementation, before deployment).
- Aim for 8-15 nodes total. Do NOT create more than 20 nodes.
- Return ONLY the JSON object, no explanation text before or after.
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
      max_tokens: 16384,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Planner LLM call failed: ${response.status} ${errorText}`);
  }

  const data = await response.json() as any;
  const content = data.choices?.[0]?.message?.content;
  const finishReason = data.choices?.[0]?.finish_reason;

  if (!content) {
    throw new Error('Planner LLM returned empty response');
  }

  if (finishReason === 'length') {
    console.warn('⚠️ Planner: LLM output was truncated (finish_reason=length). Attempting JSON repair...');
  }

  // Extract JSON from the response (may be wrapped in ```json blocks)
  const jsonMatch = content.match(/```json\s*([\s\S]*?)```/) || content.match(/(\{[\s\S]*\})/);
  if (!jsonMatch) {
    throw new Error(`Planner LLM did not return valid JSON. Response:\n${content.slice(0, 500)}`);
  }

  let rawJson = jsonMatch[1].trim();

  // Attempt to repair truncated JSON by closing open brackets/braces
  function repairTruncatedJson(json: string): string {
    // Remove any trailing incomplete string or value
    // Strip trailing comma, incomplete key-value, etc.
    let repaired = json.replace(/,\s*$/, '');
    // If we end mid-string, close the string
    const quoteCount = (repaired.match(/(?<!\\)"/g) || []).length;
    if (quoteCount % 2 !== 0) {
      repaired += '"';
    }
    // Count open vs close brackets/braces
    let braces = 0, brackets = 0;
    let inString = false;
    for (let i = 0; i < repaired.length; i++) {
      const ch = repaired[i];
      if (ch === '"' && (i === 0 || repaired[i - 1] !== '\\')) {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === '{') braces++;
      else if (ch === '}') braces--;
      else if (ch === '[') brackets++;
      else if (ch === ']') brackets--;
    }
    // Remove trailing comma before closing
    repaired = repaired.replace(/,\s*$/, '');
    // Close any open brackets/braces
    for (let i = 0; i < brackets; i++) repaired += ']';
    for (let i = 0; i < braces; i++) repaired += '}';
    return repaired;
  }

  let dagJson: any;
  try {
    dagJson = JSON.parse(rawJson);
  } catch (err) {
    // Try to repair truncated JSON
    console.warn(`⚠️ Planner: Initial JSON parse failed, attempting repair...`);
    try {
      const repaired = repairTruncatedJson(rawJson);
      dagJson = JSON.parse(repaired);
      console.log('✅ Planner: JSON repair succeeded');
    } catch (repairErr) {
      throw new Error(`Failed to parse Planner JSON (repair also failed): ${err}\nRaw (first 800 chars):\n${rawJson.slice(0, 800)}\n...\nRaw (last 300 chars):\n${rawJson.slice(-300)}`);
    }
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
