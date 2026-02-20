export interface AgentBriefingParams {
  systemPrompt: string;
  taskBriefing: string;
  projectManifest?: string;
  branch: string;
  allowedFiles: string[];
  blockedFiles: string[];
}

/**
 * Builds a complete agent briefing by combining system prompt, manifest, and task briefing
 * into a single formatted instruction document.
 * 
 * @param params - Configuration for building the briefing
 * @returns Formatted briefing string ready to be sent to an agent
 */
export function buildAgentBriefing(params: AgentBriefingParams): string {
  const {
    systemPrompt,
    taskBriefing,
    projectManifest,
    branch,
    allowedFiles,
    blockedFiles,
  } = params;

  const sections: string[] = [];

  // 1. System Prompt
  sections.push(systemPrompt);
  sections.push('');

  // 2. Branch Assignment
  sections.push('## Branch Assignment');
  sections.push(`You are assigned to work on branch: \`${branch}\``);
  sections.push('');

  // 3. Project Manifest (if available)
  if (projectManifest) {
    sections.push('## Project Manifest');
    sections.push(projectManifest);
    sections.push('');
  }

  // 4. File Scope
  sections.push('## File Scope');
  sections.push('');
  
  if (allowedFiles.length > 0) {
    sections.push('### Allowed Files (you may ONLY modify these):');
    allowedFiles.forEach(file => {
      sections.push(`- ${file}`);
    });
    sections.push('');
  }

  if (blockedFiles.length > 0) {
    sections.push('### Blocked Files (NEVER touch these):');
    blockedFiles.forEach(file => {
      sections.push(`- ${file}`);
    });
    sections.push('');
  }

  // 5. Task Briefing
  sections.push('## Task Briefing');
  sections.push(taskBriefing);
  sections.push('');

  // 6. Footer
  sections.push('---');
  sections.push('*This task is managed by Foreman. Only modify files within the allowed scope.*');
  sections.push('*When done, provide a clear summary of all changes made.*');

  return sections.join('\n');
}

