import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { TaskManager } from './task-manager.js';
import { TaskRunner } from './task-runner.js';
import { KanbanCoordinator } from './kanban-coordinator.js';
import { WebSocketManager } from './websocket.js';
import { createKanbanRoutes } from './routes/kanban.js';
import { createKnowledgeRoutes } from './routes/knowledge.js';
import { createDagRoutes } from './routes/dags.js';
import { createRolesRoutes } from './routes/roles.js';
import { KnowledgeService } from './services/knowledge.js';
import { DagExecutor } from './dag-executor.js';
import { generateDagFromBrief } from './planner.js';
import { configRouter, initConfigService, configService } from './routes/config.js';
import { HGMemEngine, loadHGMemSessions, saveHGMemSessions } from './hgmem/index.js';
import { createHGMemRoutes } from './routes/hgmem.js';
import { DeviceRegistry } from './services/device-registry.js';
import { TunnelService } from './services/tunnel.js';
import { createDeviceRoutes } from './routes/devices.js';
import { createLogger } from './logger.js';
import { createSettingsRoutes } from './routes/settings.js';
import { createDeviceTaskRoutes } from './routes/device-tasks.js';
import { deviceTaskQueue } from './services/device-task-queue.js';

const log = createLogger('server');

/**
 * Bridge Backend - Integrates WebSocket, QC Runner, and Kanban Coordinator
 */

const app = new Hono();

// Middleware
app.use('/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

const taskManager = new TaskManager();
const taskRunner = new TaskRunner();
const kanbanCoordinator = new KanbanCoordinator();
const knowledgeService = new KnowledgeService();
const dagExecutor = new DagExecutor(taskRunner, taskManager);
const deviceRegistry = new DeviceRegistry();
const tunnelService = new TunnelService();
// Wire device registry into task runner for Ollama task routing
taskRunner.deviceRegistry = deviceRegistry;
const hgmemEngine = new HGMemEngine(knowledgeService);
loadHGMemSessions(hgmemEngine);

// Wire knowledge loader into TaskRunner so role-aware prompts include relevant knowledge
taskRunner.knowledgeLoader = async (query: string): Promise<string> => {
  try {
    const results = await knowledgeService.semanticSearch(query, { limit: 3 });
    if (results.length === 0) return '';
    return results.map(r => `### ${r.title}\n${r.content.slice(0, 1000)}`).join('\n\n');
  } catch {
    return '';
  }
};

// Load device task queue from disk first so we can check for recoverable tasks
deviceTaskQueue.load();

// Clean up stale tasks left in 'running' state from previous process
for (const task of taskManager.getTasks()) {
  if (task.status === 'running' || task.status === 'pending') {
    const dt = deviceTaskQueue.getByTaskId(task.id);
    if (dt && dt.status === 'pending') {
      // The device task was reset to pending on load — wait for the device to re-pick it
      log.info('Recovering task: device task is pending, will resume when device picks up', { taskId: task.id, dtId: dt.id });
      deviceTaskQueue.waitForCompletion(dt.id).then((completedDt) => {
        taskManager.updateTaskStatus(task.id, 'completed', {
          agent_output: completedDt.output || '',
          completed_at: new Date().toISOString(),
        });
        log.info('Recovered task completed via device queue', { taskId: task.id, dtId: dt.id });
      }).catch((err) => {
        taskManager.updateTaskStatus(task.id, 'failed', {
          agent_output: err.message,
          completed_at: new Date().toISOString(),
        });
        log.warn('Recovered task failed via device queue', { taskId: task.id, error: err.message });
      });
    } else {
      log.warn('Cleaning up stale task from previous run', { taskId: task.id, title: task.title, was: task.status });
      taskManager.updateTaskStatus(task.id, 'failed', {
        agent_output: 'Task was interrupted by bridge restart',
        completed_at: new Date().toISOString(),
      });
    }
  }
}

// Wire up TaskRunner events to WebSocket
taskRunner.on('task:started', (task) => {
  log.info('Task started', { taskId: task.id, title: task.title });
  taskManager.updateTaskStatus(task.id, 'running', { started_at: new Date().toISOString() });
  wsManager.broadcast({ type: 'task_event', event: 'started', taskId: task.id, task });
});

taskRunner.on('task:updated', (task) => {
  log.debug('Task updated', { taskId: task.id, status: task.status });
  taskManager.updateTaskStatus(task.id, task.status, task);
  wsManager.broadcast({ type: 'task_event', event: 'updated', taskId: task.id, task });
});

taskRunner.on('task:completed', (task) => {
  log.info('Task completed', { taskId: task.id, title: task.title });
  taskManager.updateTaskStatus(task.id, task.status, { ...task, completed_at: new Date().toISOString() });
  wsManager.broadcast({ type: 'task_event', event: 'completed', taskId: task.id, task });

  // Update Kanban board when task completes
  if (task.qc_result) {
    kanbanCoordinator.onTaskCompleted(task.id, {
      passed: task.qc_result.passed,
      score: task.qc_result.score,
      summary: task.qc_result.summary,
    });
  }

  // Auto-create knowledge entry from completed task output
  const outputText = Array.isArray(task.output) ? task.output.join('\n') : (task.output || '');
  if (outputText.trim()) {
    knowledgeService.create({
      title: task.title || `Task ${task.id} Output`,
      content: outputText,
      category: task.project || 'Tasks',
      source_type: 'task',
      source_task_id: task.id,
      tags: ['auto-generated', 'task-output', task.project || 'default'].filter(Boolean),
      metadata: { task_id: task.id, agent: task.agent, status: task.status },
    }).catch(err => console.error('Failed to create knowledge entry from task:', err));
  }
});

taskRunner.on('task:failed', (task) => {
  log.error('Task failed', { taskId: task.id, title: task.title, error: task.agent_output });
  taskManager.updateTaskStatus(task.id, 'failed', { ...task, completed_at: new Date().toISOString() });
  wsManager.broadcast({ type: 'task_event', event: 'failed', taskId: task.id, task });
});

taskRunner.on('task:output', (event) => {
  // Also save output to taskManager
  const task = taskManager.getTask(event.taskId);
  if (task) {
    if (!task.output) task.output = [];
    task.output.push(event.line);
    taskManager.updateTaskStatus(task.id, task.status, { output: task.output });
  }
  wsManager.broadcast({ type: 'agent_output', taskId: event.taskId, line: event.line, stream: event.stream });

  // Also emit DAG-specific terminal event so dashboard can route it to the correct node
  const dagMapping = dagExecutor.getDagNodeMapping(event.taskId);
  if (dagMapping) {
    wsManager.broadcast({
      type: 'dag:node:output',
      dagId: dagMapping.dagId,
      nodeId: dagMapping.nodeId,
      line: event.line,
      stream: event.stream,
    });
  }
});

taskRunner.on('task:model_resolved', (event: { taskId: string; model: string; role: string | null }) => {
  const task = taskManager.getTask(event.taskId);
  if (task) {
    taskManager.updateTaskStatus(task.id, task.status, {
      model: event.model,
      ...(event.role ? { role: event.role } as any : {}),
    });
    // Broadcast updated task so dashboard cards refresh immediately
    wsManager.broadcast({ type: 'task_event', event: 'updated', taskId: task.id, task: taskManager.getTask(task.id) });
  }
});

// Wire up KanbanCoordinator events to WebSocket
kanbanCoordinator.on('card:created', (card) => {
  log.debug('Card created', { cardId: card.id });
  wsManager.broadcast({ type: 'card:created', card });
});

kanbanCoordinator.on('card:moved', (event) => {
  log.debug('Card moved', { cardId: event.card.id, from: event.from, to: event.to });
  wsManager.broadcast({ type: 'card:moved', card: event.card, from: event.from, to: event.to });
});

kanbanCoordinator.on('card:assigned', (card) => {
  console.log(`Card assigned: ${card.id} to agent ${card.agentId}`);
  wsManager.broadcast({ type: 'card:assigned', card });
});

// Health check endpoint
app.get('/health', (c) => {
  return c.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    websocket_clients: wsManager.getClientCount(),
  });
});

// Task endpoints
app.get('/tasks', (c) => {
  const tasks = taskManager.getTasks();
  return c.json({ tasks });
});

app.get('/tasks/:id', (c) => {
  const id = c.req.param('id');
  const task = taskManager.getTask(id);
  if (!task) {
    return c.json({ error: 'Task not found' }, 404);
  }
  return c.json(task);
});

// POST /tasks - Create and optionally run a task (DEPRECATED - use /api/tasks instead)
app.post('/tasks', async (c) => {
  try {
    const body = await c.req.json();
    const newTask = await taskManager.createTask({
      user_id: 'legacy', // Legacy endpoint - no auth
      title: body.title,
      description: body.description || body.briefing || '',
      project: body.project || 'default',
      agent: body.agent || 'claude-code',
      briefing: body.briefing || body.description || '',
      role: body.role,
      allowed_files: body.allowed_files,
      blocked_files: body.blocked_files,
      verification: body.verification,
    });

    // Auto-start the task
    taskRunner.runTask(newTask).catch(err => console.error('Failed to run task:', err));

    return c.json(newTask, 201);
  } catch (error) {
    console.error('Failed to create task:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Failed to create task' }, 500);
  }
});

// GET /tasks/:id/diff - Get task diff
app.get('/tasks/:id/diff', (c) => {
  const id = c.req.param('id');
  const task = taskManager.getTask(id);
  if (!task) return c.json({ error: 'Task not found' }, 404);
  return c.json({ diff: task.diff || '' });
});

// POST /tasks/:id/approve - Approve and commit task changes
app.post('/tasks/:id/approve', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const result = await taskManager.approveTask(id, body);
    if (!result.success) return c.json({ error: result.message }, 404);
    return c.json({ ok: true, message: result.message, commit_sha: 'n/a', branch: 'main' });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Approve failed' }, 500);
  }
});

// DELETE /tasks/:id - Delete a task
app.delete('/tasks/:id', (c) => {
  const id = c.req.param('id');
  // Kill running process if any
  const runningTasks = taskRunner.getRunningTasks();
  const running = runningTasks.find(t => t.id === id);
  if (running) {
    taskRunner.failTask(id, 'Deleted by user');
  }
  const ok = taskManager.deleteTask(id);
  if (!ok) return c.json({ error: 'Task not found' }, 404);
  wsManager.broadcast({ type: 'task_event', event: 'deleted', taskId: id });
  return c.json({ ok: true });
});

// DELETE /tasks - Delete all tasks
app.delete('/tasks', (c) => {
  // Kill all running processes
  for (const t of taskRunner.getRunningTasks()) {
    taskRunner.failTask(t.id, 'Deleted by user');
  }
  const count = taskManager.deleteAllTasks();
  wsManager.broadcast({ type: 'task_event', event: 'cleared' });
  return c.json({ ok: true, deleted: count });
});

// POST /tasks/:id/reject - Reject task
app.post('/tasks/:id/reject', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const result = await taskManager.rejectTask(id, body);
    if (!result.success) return c.json({ error: result.message }, 404);
    return c.json({ ok: true, message: result.message });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Reject failed' }, 500);
  }
});

// Mount Kanban routes
const kanbanRouter = createKanbanRoutes(kanbanCoordinator);
app.route('/kanban', kanbanRouter);

// Chat endpoint for Smartass — with knowledge search + deep research tools
app.post('/chat', async (c) => {
  try {
    const body = await c.req.json();
    const { message, history } = body;
    
    let apiKey = process.env.OPENROUTER_API_KEY || '';
    try {
      const apiKeyEntry = await configService.getConfig('OPENROUTER_API_KEY', true);
      if (apiKeyEntry && apiKeyEntry.value) {
        apiKey = apiKeyEntry.value;
      }
    } catch (e) {
      console.warn('Could not read OPENROUTER_API_KEY from config, using env fallback');
    }

    if (!apiKey) {
      return c.json({ error: 'OPENROUTER_API_KEY not configured' }, 500);
    }

    const systemPrompt = `You are Smartass, an expert AI assistant for the Foreman project.
You help the user with their tasks, knowledge base, and project management.

You have three tools:
• search_knowledge — Semantic search across the knowledge base. Use for quick lookups, factual questions, finding docs.
• deep_research — Multi-step iterative research (HGMem). Use when a question needs thorough analysis across many documents, or when search_knowledge didn't return enough context. This takes longer but produces comprehensive answers.
• create_task — Create and auto-start a task in Foreman. Use when the user asks you to do something that requires an agent.

Always search the knowledge base when the user asks about project-specific information, documentation, or technical details. Start with search_knowledge; escalate to deep_research if needed.

Be concise and direct. Use markdown formatting.`;

    const tools = [
      {
        type: 'function',
        function: {
          name: 'search_knowledge',
          description: 'Semantic search across the Foreman knowledge base. Returns matching documents with titles, categories, and content snippets.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'The search query — be specific and descriptive.' },
              category: { type: 'string', description: 'Optional category filter (e.g., "Architecture", "API", "Deployment").' },
              limit: { type: 'number', description: 'Max results to return (default: 5, max: 20).' }
            },
            required: ['query']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'deep_research',
          description: 'Run a multi-step research session using HGMem (Hypergraph Memory). Iteratively retrieves evidence, builds a knowledge graph, and synthesizes a thorough answer. Use for complex questions that need deep analysis. Takes 30-60 seconds.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'The research question — be detailed about what you want to understand.' },
              project: { type: 'string', description: 'Project context for scoping the research (default: "default").' }
            },
            required: ['query']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'create_task',
          description: 'Create a new task in the Foreman system and auto-start it.',
          parameters: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'A short, descriptive title for the task.' },
              description: { type: 'string', description: 'A detailed description of what needs to be done.' },
              project: { type: 'string', description: 'The project name or bucket this task belongs to.' },
              agent: { type: 'string', description: 'The agent type to assign (e.g., claude-code, custom).' }
            },
            required: ['title', 'description', 'project']
          }
        }
      }
    ];

    // Build initial messages
    const llmMessages: any[] = [
      { role: 'system', content: systemPrompt },
      ...(history || []).slice(-10),
      { role: 'user', content: message }
    ];

    // Tool-call loop: LLM may invoke tools, we execute them and feed results back
    const MAX_TOOL_ROUNDS = 5;
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'anthropic/claude-sonnet-4-20250514',
          messages: llmMessages,
          tools,
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('OpenRouter API error:', errorText);
        return c.json({ error: `OpenRouter API error: ${response.statusText}` }, 500);
      }

      const data = await response.json() as any;
      const assistantMsg = data.choices[0].message;

      // No tool calls → return final content
      if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
        return c.json({ content: assistantMsg.content || 'No response.' });
      }

      // Add assistant message (with tool_calls) to conversation
      llmMessages.push(assistantMsg);

      // Execute each tool call
      for (const toolCall of assistantMsg.tool_calls) {
        const args = JSON.parse(toolCall.function.arguments);
        let result = '';

        try {
          switch (toolCall.function.name) {
            case 'search_knowledge': {
              const docs = await knowledgeService.semanticSearch(args.query, {
                limit: Math.min(args.limit || 5, 20),
                category: args.category,
              });
              if (docs.length === 0) {
                result = 'No documents found matching that query.';
              } else {
                result = docs.map((d: any) =>
                  `### ${d.title}\n**Category:** ${d.category} | **Source:** ${d.source_type} | **Similarity:** ${(d.similarity ?? 0).toFixed(2)}\n\n${d.content.slice(0, 2000)}`
                ).join('\n\n---\n\n');
              }
              log.info(`search_knowledge: "${args.query}" → ${docs.length} results`);
              break;
            }

            case 'deep_research': {
              log.info(`deep_research: "${args.query}" (project: ${args.project || 'default'})`);
              const session = hgmemEngine.createSession(args.query, args.project || 'default');
              const completed = await hgmemEngine.run(session.id);
              result = completed.response || 'Research completed but no synthesized response was generated.';
              log.info(`deep_research complete: ${completed.current_step} steps, ${completed.memory.hyperedges?.size || 0} memory points`);
              break;
            }

            case 'create_task': {
              const newTask = await taskManager.createTask({
                user_id: 'websocket', // WebSocket endpoint - no auth
                title: args.title,
                description: args.description,
                project: args.project,
                agent: args.agent || 'claude-code',
                briefing: args.description
              });
              taskRunner.runTask(newTask).catch(err => console.error('Failed to run task:', err));
              result = `Task created and started: "${newTask.title}" (ID: ${newTask.id}) in project "${newTask.project}"`;
              log.info(`create_task: ${newTask.id} "${newTask.title}"`);
              break;
            }

            default:
              result = `Unknown tool: ${toolCall.function.name}`;
          }
        } catch (err) {
          result = `Tool error: ${err instanceof Error ? err.message : 'Unknown error'}`;
          console.error(`Tool ${toolCall.function.name} error:`, err);
        }

        // Feed tool result back to conversation
        llmMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result,
        });
      }
      // Loop back → LLM sees tool results and either responds or calls more tools
    }

    return c.json({ content: 'Max tool iterations reached. Please try simplifying your question.' });
  } catch (error) {
    console.error('Chat error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// POST /projects/init - Create a new project folder + optional private GitHub repo
app.post('/projects/init', async (c) => {
  try {
    const body = await c.req.json();
    const { name, description, github_repo, github_org } = body;
    if (!name) return c.json({ error: 'name is required' }, 400);

    const projectsDir = process.env.PROJECTS_DIR || '/home/foreman/projects';
    const { existsSync, mkdirSync } = await import('fs');
    const { join } = await import('path');
    const { execSync } = await import('child_process');

    const projectDir = join(projectsDir, name);
    if (existsSync(projectDir)) {
      return c.json({ error: `Project directory already exists: ${projectDir}` }, 409);
    }

    mkdirSync(projectDir, { recursive: true });
    // Init git
    execSync('git init', { cwd: projectDir });
    execSync('git checkout -b main', { cwd: projectDir });

    // Create README
    const readme = `# ${name}\n\n${description || 'Created by Foreman'}\n`;
    const { writeFileSync } = await import('fs');
    writeFileSync(join(projectDir, 'README.md'), readme);
    execSync('git add . && git commit -m "Initial commit by Foreman"', { cwd: projectDir });

    let repoUrl = '';
    // Create GitHub repo if requested
    if (github_repo !== false) {
      const ghToken = process.env.GITHUB_TOKEN;
      if (ghToken) {
        try {
          const repoName = github_repo || name;
          const org = github_org || '';
          const apiUrl = org
            ? `https://api.github.com/orgs/${org}/repos`
            : 'https://api.github.com/user/repos';

          const ghResp = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${ghToken}`,
              'Content-Type': 'application/json',
              'Accept': 'application/vnd.github+json',
            },
            body: JSON.stringify({
              name: repoName,
              description: description || `Created by Foreman`,
              private: true,
              auto_init: false,
            }),
          });

          if (ghResp.ok) {
            const ghData = await ghResp.json() as any;
            repoUrl = ghData.ssh_url || ghData.clone_url;
            // Add remote and push
            execSync(`git remote add origin ${repoUrl}`, { cwd: projectDir });
            // Use deploy key if available
            const deployKey = '/root/.ssh/github_deploy';
            const { existsSync: exists2 } = await import('fs');
            if (exists2(deployKey)) {
              execSync(`GIT_SSH_COMMAND="ssh -i ${deployKey}" git push -u origin main`, { cwd: projectDir });
            } else {
              execSync(`git push -u origin main`, { cwd: projectDir, env: { ...process.env, GH_TOKEN: ghToken } });
            }
            console.log(`Created GitHub repo: ${repoUrl}`);
          } else {
            const errText = await ghResp.text();
            console.warn(`GitHub repo creation failed: ${ghResp.status} ${errText}`);
            repoUrl = `FAILED: ${ghResp.status}`;
          }
        } catch (ghErr: any) {
          console.error('GitHub integration error:', ghErr.message);
          repoUrl = `ERROR: ${ghErr.message}`;
        }
      } else {
        repoUrl = 'SKIPPED: No GITHUB_TOKEN configured';
      }
    }

    return c.json({
      ok: true,
      project_dir: projectDir,
      project_name: name,
      github_repo: repoUrl || 'not requested',
    }, 201);
  } catch (error) {
    console.error('Project init error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Init failed' }, 500);
  }
});

// Mount Knowledge routes
const knowledgeRouter = createKnowledgeRoutes(knowledgeService);
app.route('/knowledge', knowledgeRouter);

// Mount DAG routes
const dagRouter = createDagRoutes(dagExecutor, knowledgeService);
app.route('/dags', dagRouter);

// Mount Roles routes
const rolesRouter = createRolesRoutes();
app.route('/roles', rolesRouter);

// Wire DAG events to WebSocket
dagExecutor.on('dag:created', (dag) => wsManager.broadcast({ type: 'dag:created', dag }));
dagExecutor.on('dag:started', (dag) => wsManager.broadcast({ type: 'dag:started', dag }));
dagExecutor.on('dag:completed', (dag) => wsManager.broadcast({ type: 'dag:completed', dag }));
dagExecutor.on('dag:node:started', (e) => wsManager.broadcast({ type: 'dag:node:started', dagId: e.dag.id, node: e.node }));
dagExecutor.on('dag:node:completed', (e) => wsManager.broadcast({ type: 'dag:node:completed', dagId: e.dag.id, node: e.node }));
dagExecutor.on('dag:node:failed', (e) => wsManager.broadcast({ type: 'dag:node:failed', dagId: e.dag.id, node: e.node }));
dagExecutor.on('dag:node:waiting_approval', (e) => wsManager.broadcast({ type: 'dag:node:waiting_approval', dagId: e.dag.id, node: e.node }));
dagExecutor.on('dag:node:added', (e) => wsManager.broadcast({ type: 'dag:node:added', dagId: e.dag.id, node: e.node, edges: e.edges }));

// Mount HGMem routes
const hgmemRouter = createHGMemRoutes(hgmemEngine);
app.route('/hgmem', hgmemRouter);

// Wire HGMem events to WebSocket
hgmemEngine.on('session:created', (s) => wsManager.broadcast({ type: 'hgmem:session:created', session: s }));
hgmemEngine.on('session:completed', (s) => wsManager.broadcast({ type: 'hgmem:session:completed', session: s }));
hgmemEngine.on('session:step:start', (e) => wsManager.broadcast({ type: 'hgmem:step:start', ...e }));
hgmemEngine.on('session:step:end', (e) => wsManager.broadcast({ type: 'hgmem:step:end', ...e }));

// Mount Device routes
const deviceRouter = createDeviceRoutes(deviceRegistry, tunnelService);
app.route('/devices', deviceRouter);

const settingsRouter = createSettingsRoutes();
app.route('/settings', settingsRouter);

const deviceTaskRouter = createDeviceTaskRoutes();
app.route('/device-tasks', deviceTaskRouter);

// Wire device events to WebSocket
deviceRegistry.on('device:created', (d) => wsManager.broadcast({ type: 'device:created', device: d }));
deviceRegistry.on('device:connected', (d) => wsManager.broadcast({ type: 'device:connected', device: d }));
deviceRegistry.on('device:online', (d) => wsManager.broadcast({ type: 'device:online', device: d }));
deviceRegistry.on('device:offline', (d) => wsManager.broadcast({ type: 'device:offline', device: d }));
deviceRegistry.on('device:deleted', (d) => wsManager.broadcast({ type: 'device:deleted', device: d }));

// Mount Config routes
app.route('/config', configRouter);

const PORT = parseInt(process.env.PORT || '3000', 10);

// Initialize config service before starting server
await initConfigService();

// Use @hono/node-server's serve which returns the underlying http.Server
const server = serve({
  fetch: app.fetch,
  port: PORT,
});

// Attach WebSocket to the HTTP server
// serve() returns a Node.js http.Server
const wsManager = new WebSocketManager(server as any);

log.info('Foreman Bridge starting', { port: PORT, pid: process.pid, node: process.version });
console.log(`🏗️  Foreman Bridge running on port ${PORT}`);
console.log(`📡 WebSocket endpoint: ws://localhost:${PORT}/ws`);

// Export for testing
export { app, taskManager, taskRunner, kanbanCoordinator, wsManager };

