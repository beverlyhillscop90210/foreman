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

// Clean up stale tasks left in 'running' state from previous process
for (const task of taskManager.getTasks()) {
  if (task.status === 'running' || task.status === 'pending') {
    console.log(`Cleaning up stale task: ${task.id} "${task.title}" (was ${task.status})`);
    taskManager.updateTaskStatus(task.id, 'failed', {
      agent_output: 'Task was interrupted by bridge restart',
      completed_at: new Date().toISOString(),
    });
  }
}

// Wire up TaskRunner events to WebSocket
taskRunner.on('task:started', (task) => {
  console.log(`Task started: ${task.id}`);
  taskManager.updateTaskStatus(task.id, 'running', { started_at: new Date().toISOString() });
  wsManager.broadcast({ type: 'task_event', event: 'started', taskId: task.id, task });
});

taskRunner.on('task:updated', (task) => {
  console.log(`Task updated: ${task.id} - ${task.status}`);
  taskManager.updateTaskStatus(task.id, task.status, task);
  wsManager.broadcast({ type: 'task_event', event: 'updated', taskId: task.id, task });
});

taskRunner.on('task:completed', (task) => {
  console.log(`Task completed: ${task.id}`);
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
  console.log(`Task failed: ${task.id}`);
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

// Wire up KanbanCoordinator events to WebSocket
kanbanCoordinator.on('card:created', (card) => {
  console.log(`Card created: ${card.id}`);
  wsManager.broadcast({ type: 'card:created', card });
});

kanbanCoordinator.on('card:moved', (event) => {
  console.log(`Card moved: ${event.card.id} from ${event.from} to ${event.to}`);
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

// POST /tasks - Create and optionally run a task
app.post('/tasks', async (c) => {
  try {
    const body = await c.req.json();
    const newTask = await taskManager.createTask({
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

// Chat endpoint for Smartass
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

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3.5-sonnet',
        messages: [
          { role: 'system', content: 'You are Smartass, an expert AI assistant for the Foreman project. You help the user with their tasks, knowledge base, and project management. You can create tasks for the user using the create_task tool.' },
          ...(history || []),
          { role: 'user', content: message }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'create_task',
              description: 'Create a new task in the Foreman system.',
              parameters: {
                type: 'object',
                properties: {
                  title: { type: 'string', description: 'A short, descriptive title for the task.' },
                  description: { type: 'string', description: 'A detailed description of what needs to be done.' },
                  project: { type: 'string', description: 'The project name or bucket this task belongs to.' },
                  agent: { type: 'string', description: 'The agent type to assign to this task (e.g., claude-code, custom).' }
                },
                required: ['title', 'description', 'project']
              }
            }
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenRouter API error:', errorText);
      return c.json({ error: `OpenRouter API error: ${response.statusText}` }, 500);
    }

    const data = await response.json() as any;
    const responseMessage = data.choices[0].message;

    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      let content = responseMessage.content || '';
      
      for (const toolCall of responseMessage.tool_calls) {
        if (toolCall.function.name === 'create_task') {
          try {
            const args = JSON.parse(toolCall.function.arguments);
            const newTask = await taskManager.createTask({
              title: args.title,
              description: args.description,
              project: args.project,
              agent: args.agent || 'claude-code',
              briefing: args.description
            });
            
            // Start the task automatically
            taskRunner.runTask(newTask).catch(err => console.error('Failed to run task:', err));
            
            content += `\n\n✅ Created task: **${newTask.title}** (ID: ${newTask.id}) in project \`${newTask.project}\`.`;
          } catch (err) {
            console.error('Failed to create task from tool call:', err);
            content += `\n\n❌ Failed to create task: ${err instanceof Error ? err.message : 'Unknown error'}`;
          }
        }
      }
      
      return c.json({ content: content.trim() });
    }

    return c.json({ content: responseMessage.content });
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

console.log(`🏗️  Foreman Bridge running on port ${PORT}`);
console.log(`📡 WebSocket endpoint: ws://localhost:${PORT}/ws`);

// Export for testing
export { app, taskManager, taskRunner, kanbanCoordinator, wsManager };

