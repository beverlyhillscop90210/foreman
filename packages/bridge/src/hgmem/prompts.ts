/**
 * HGMem — LLM prompt templates.
 *
 * Based on Appendix D, E of arXiv:2512.23959.
 * Each function returns a { system, user } pair for the LLM.
 */

// ── Sufficiency Check ────────────────────────────────────────

export function sufficiencyCheckPrompt(query: string, memoryText: string) {
  return {
    system: `You are a reasoning agent that decides whether the current working memory contains sufficient information to answer a target query.

Respond with a JSON object:
{
  "sufficient": true | false,
  "reasoning": "brief explanation"
}

Return ONLY the JSON, no other text.`,
    user: `## Target Query
${query}

## Current Memory
${memoryText}

Is the information in the current memory sufficient to comprehensively answer the target query? Consider whether all relevant aspects, relationships, and evidence have been gathered.`,
  };
}

// ── Subquery Generation: Raise Concerns ──────────────────────
// (Figure 6 from the paper)

export function raiseConcernsPrompt(query: string, memoryText: string) {
  return {
    system: `You are a reasoning agent analyzing a hypergraph-based working memory to identify gaps.

Given a target query and the current memory (composed of memory points, each connecting multiple entities), you must raise concerns — aspects that need further investigation.

There are two types of concerns:
1. **Local Investigation**: A concern that targets a SPECIFIC existing memory point that needs deeper inspection. You must reference the memory point ID.
2. **Global Exploration**: A concern about information NOT yet represented in current memory that could help answer the query.

Respond with a JSON array of concerns:
[
  {
    "type": "local",
    "target_memory_point_id": "he_xxxx",
    "concern": "description of what needs investigation"
  },
  {
    "type": "global",
    "concern": "description of what new information to explore"
  }
]

Rules:
- Generate 2-4 concerns total.
- Mix local and global when appropriate.
- If memory is empty, generate only global concerns.
- Return ONLY the JSON array.`,
    user: `## Target Query
${query}

## Current Memory
${memoryText}`,
  };
}

// ── Subquery Generation: Generate Subqueries ─────────────────
// (Figure 7 from the paper)

export function generateSubqueriesPrompt(
  query: string,
  concerns: Array<{ type: string; concern: string; target_memory_point_id?: string }>,
) {
  const concernsText = concerns
    .map((c, i) => {
      const tag = c.type === 'local' ? `[Local → ${c.target_memory_point_id}]` : '[Global]';
      return `${i + 1}. ${tag} ${c.concern}`;
    })
    .join('\n');

  return {
    system: `You are a query generation agent. Given a target query and a list of concerns, generate precise subqueries to retrieve relevant information.

For each concern, generate 1-2 short, focused subqueries that would help resolve the concern when used to search a knowledge base.

Respond with a JSON array:
[
  {
    "query": "the search query text",
    "strategy": "local" | "global",
    "target_hyperedge_id": "he_xxxx or null"
  }
]

Return ONLY the JSON array.`,
    user: `## Target Query
${query}

## Concerns
${concernsText}`,
  };
}

// ── Memory Evolution: Update & Insert ────────────────────────
// (Figure 4 from the paper)

export function memoryEvolutionPrompt(
  query: string,
  memoryText: string,
  retrievedEvidence: string,
) {
  return {
    system: `You are a memory evolution agent managing a hypergraph-based working memory. Each memory point (hyperedge) connects multiple entities and describes a relationship or insight.

Given retrieved evidence, you must evolve the current memory through these operations:

1. **Update**: Modify the description of an existing memory point based on new evidence. Do NOT change its subordinate entities.
2. **Insert**: Add a new memory point when the evidence introduces a new relationship or insight not captured by existing memory points.

Respond with a JSON object:
{
  "updates": [
    {
      "hyperedge_id": "he_xxxx",
      "new_description": "revised description incorporating new evidence"
    }
  ],
  "insertions": [
    {
      "description": "description of the new memory point",
      "entity_names": ["entity1", "entity2", ...]
    }
  ]
}

Rules:
- Only update memory points whose content is directly affected by the new evidence.
- Entity names in insertions should be specific, identifiable concepts (files, functions, components, people, etc.).
- Each insertion must connect at least 2 entities.
- Be concise but precise in descriptions.
- Return ONLY the JSON object.`,
    user: `## Target Query
${query}

## Current Memory
${memoryText}

## Retrieved Evidence
${retrievedEvidence}

Analyze the retrieved evidence and decide which memory points to update and what new memory points to insert.`,
  };
}

// ── Memory Evolution: Merge ──────────────────────────────────
// (Figure 5 from the paper)

export function memoryMergePrompt(query: string, memoryText: string) {
  return {
    system: `You are a memory consolidation agent. After updates and insertions, you inspect the current memory to find memory points that should be MERGED into higher-order relationships.

Merging combines two memory points into a single, more expressive memory point whose subordinate entities are the union of both originals. This creates higher-order correlations that help answer complex queries.

Respond with a JSON object:
{
  "merges": [
    {
      "hyperedge_id_1": "he_xxxx",
      "hyperedge_id_2": "he_yyyy",
      "merged_description": "unified description that synthesizes both memory points in relation to the target query"
    }
  ]
}

Rules:
- Only merge memory points that are semantically or logically cohesive.
- The merged description should synthesize (not concatenate) the two descriptions.
- Typically 0-2 merges per step.
- If no merges are appropriate, return {"merges": []}.
- Return ONLY the JSON object.`,
    user: `## Target Query
${query}

## Current Memory (after updates and insertions)
${memoryText}

Inspect the memory points and identify pairs that would benefit from being merged into higher-order relationships to better answer the target query.`,
  };
}

// ── Final Response Generation ────────────────────────────────

export function responseGenerationPrompt(
  query: string,
  memoryText: string,
  sourceChunks: string,
) {
  return {
    system: `You are an expert analyst. Using the structured working memory and source evidence provided, generate a comprehensive response to the target query.

Your response should:
- Synthesize information from multiple memory points
- Draw on higher-order relationships when relevant
- Be thorough yet concise
- Reference specific evidence when making claims`,
    user: `## Target Query
${query}

## Working Memory
${memoryText}

## Source Evidence
${sourceChunks}

Based on the working memory and source evidence above, provide a comprehensive answer to the query.`,
  };
}

// ── Entity Extraction (for building the source graph) ────────

export function entityExtractionPrompt(text: string) {
  return {
    system: `Extract named entities and their relationships from the given text. Focus on specific, identifiable concepts: files, functions, classes, components, people, tools, APIs, configurations, etc.

Respond with a JSON object:
{
  "entities": [
    { "name": "entity name", "description": "brief description" }
  ],
  "relationships": [
    { "source": "entity1 name", "target": "entity2 name", "description": "relationship description" }
  ]
}

Rules:
- Entity names should be specific and reusable (e.g. "TaskRunner" not "the task runner module").
- Limit to the 10 most important entities.
- Return ONLY the JSON object.`,
    user: text.slice(0, 4000),
  };
}
