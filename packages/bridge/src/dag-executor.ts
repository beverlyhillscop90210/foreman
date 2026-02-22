import { EventEmitter } from 'events';
import { randomBytes } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import type { Task } from './types.js';
import { TaskRunner } from './task-runner.js';
import { TaskManager } from './task-manager.js';
import { AGENT_ROLES, getRoleFileScopes } from './agent-roles.js';

// ── DAG Types ──────────────────────────────────────────────────

export type DagStatus = 'created' | 'running' | 'completed' | 'failed' | 'paused';
export type DagNodeStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'waiting_approval';
export type DagNodeType = 'task' | 'gate' | 'fan_out' | 'fan_in';
export type ApprovalMode = 'per_task' | 'end_only' | 'gate_configured';

export interface DagNode {
  id: string;
  type: DagNodeType;
  title: string;
  briefing?: string;
  agent?: string;
  role?: string;           // Agent role ID (from agent-roles registry)
  status: DagNodeStatus;
  taskId?: string;         // linked Task ID once spawned
  project?: string;
  allowed_files?: string[];
  blocked_files?: string[];
  error?: string;
  started_at?: string;
  completed_at?: string;
  output?: string[];
  artifacts?: Record<string, any>;  // Structured outputs passed to downstream nodes
  // Gate-specific
  gate_condition?: 'all_pass' | 'any_pass' | 'manual';
}

export interface DagEdge {
  from: string;  // source node ID
  to: string;    // target node ID
  label?: string;
}

export interface Dag {
  id: string;
  name: string;
  description: string;
  project: string;
  status: DagStatus;
  created_by: 'planner' | 'manual';
  approval_mode: ApprovalMode;
  nodes: DagNode[];
  edges: DagEdge[];
  created_at: string;
  updated_at: string;
  started_at?: string;
  completed_at?: string;
}

// ── DAG Executor ───────────────────────────────────────────────

const DAG_FILE = process.env.DAG_FILE || '/home/foreman/data/dags.json';

export class DagExecutor extends EventEmitter {
  private dags: Map<string, Dag> = new Map();
  private taskRunner: TaskRunner;
  private taskManager: TaskManager;
  // Map taskId → { dagId, nodeId } for routing task events back to DAG nodes
  private taskToDag: Map<string, { dagId: string; nodeId: string }> = new Map();

  constructor(taskRunner: TaskRunner, taskManager: TaskManager) {
    super();
    this.taskRunner = taskRunner;
    this.taskManager = taskManager;
    this.loadDags();

    // Listen for task completions/failures to advance DAGs
    this.taskRunner.on('task:completed', (task: Task) => this.onTaskDone(task.id, 'completed'));
    this.taskRunner.on('task:failed', (task: Task) => this.onTaskDone(task.id, 'failed'));
  }

  // ── Persistence ────────────────────────────────────────────

  private loadDags(): void {
    try {
      if (existsSync(DAG_FILE)) {
        const data = JSON.parse(readFileSync(DAG_FILE, 'utf-8'));
        for (const dag of data) {
          // Clean up stale running DAGs
          if (dag.status === 'running') {
            for (const node of dag.nodes) {
              if (node.status === 'running') {
                node.status = 'failed';
                node.error = 'Interrupted by bridge restart';
              }
            }
            dag.status = this.computeDagStatus(dag);
          }
          this.dags.set(dag.id, dag);
        }
        console.log(`Loaded ${this.dags.size} DAGs from ${DAG_FILE}`);
      }
    } catch (e) {
      console.error('Failed to load DAGs:', e);
    }
  }

  private saveDags(): void {
    try {
      const dir = DAG_FILE.substring(0, DAG_FILE.lastIndexOf('/'));
      if (!existsSync(dir)) {
        const { mkdirSync } = require('fs');
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(DAG_FILE, JSON.stringify(Array.from(this.dags.values()), null, 2));
    } catch (e) {
      console.error('Failed to save DAGs:', e);
    }
  }

  // ── CRUD ───────────────────────────────────────────────────

  createDag(input: {
    name: string;
    description: string;
    project: string;
    created_by?: 'planner' | 'manual';
    approval_mode?: ApprovalMode;
    nodes: Partial<DagNode>[];
    edges: DagEdge[];
  }): Dag {
    const id = randomBytes(6).toString('base64url');
    const now = new Date().toISOString();

    // Normalize nodes — apply role defaults for file scopes when not explicitly set
    const nodes: DagNode[] = input.nodes.map((n, i) => {
      const roleId = n.role;
      const roleScopes = roleId ? getRoleFileScopes(roleId) : null;
      return {
        id: n.id || `node-${i}`,
        type: n.type || 'task',
        title: n.title || `Node ${i}`,
        briefing: n.briefing,
        agent: n.agent || 'claude-code',
        role: roleId,
        status: 'pending' as DagNodeStatus,
        project: n.project || input.project,
        allowed_files: n.allowed_files || roleScopes?.allowed,
        blocked_files: n.blocked_files || roleScopes?.blocked,
        artifacts: n.artifacts,
        gate_condition: n.gate_condition,
      };
    });

    // Validate edges reference valid node IDs
    const nodeIds = new Set(nodes.map(n => n.id));
    for (const edge of input.edges) {
      if (!nodeIds.has(edge.from)) throw new Error(`Edge references unknown source node: ${edge.from}`);
      if (!nodeIds.has(edge.to)) throw new Error(`Edge references unknown target node: ${edge.to}`);
    }

    // Check for cycles
    if (this.hasCycle(nodes, input.edges)) {
      throw new Error('DAG contains a cycle — not a valid DAG');
    }

    const dag: Dag = {
      id,
      name: input.name,
      description: input.description,
      project: input.project,
      status: 'created',
      created_by: input.created_by || 'manual',
      approval_mode: input.approval_mode || 'per_task',
      nodes,
      edges: input.edges,
      created_at: now,
      updated_at: now,
    };

    this.dags.set(id, dag);
    this.saveDags();
    this.emit('dag:created', dag);
    console.log(`📊 DAG created: ${dag.id} "${dag.name}" with ${nodes.length} nodes, ${input.edges.length} edges`);
    return dag;
  }

  getDag(id: string): Dag | undefined {
    return this.dags.get(id);
  }

  listDags(): Dag[] {
    return Array.from(this.dags.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }

  deleteDag(id: string): boolean {
    const dag = this.dags.get(id);
    if (!dag) return false;
    if (dag.status === 'running') throw new Error('Cannot delete a running DAG');
    this.dags.delete(id);
    this.saveDags();
    return true;
  }

  // ── Execution ──────────────────────────────────────────────

  async executeDag(dagId: string): Promise<Dag> {
    const dag = this.dags.get(dagId);
    if (!dag) throw new Error(`DAG not found: ${dagId}`);
    if (dag.status === 'running') throw new Error('DAG is already running');

    dag.status = 'running';
    dag.started_at = new Date().toISOString();
    dag.updated_at = new Date().toISOString();

    // Reset all nodes to pending
    for (const node of dag.nodes) {
      node.status = 'pending';
      node.error = undefined;
      node.taskId = undefined;
      node.started_at = undefined;
      node.completed_at = undefined;
      node.output = undefined;
    }

    this.saveDags();
    this.emit('dag:started', dag);
    console.log(`🚀 DAG execution started: ${dag.id} "${dag.name}"`);

    // Kick off root nodes (no incoming edges)
    await this.advanceDag(dag);
    return dag;
  }

  /**
   * Advance the DAG: find all nodes whose dependencies are met and start them.
   */
  private async advanceDag(dag: Dag): Promise<void> {
    if (dag.status !== 'running') return;

    const ready = this.getReadyNodes(dag);

    for (const node of ready) {
      if (node.type === 'gate') {
        this.processGate(dag, node);
      } else {
        await this.startNode(dag, node);
      }
    }

    // Check if DAG is complete
    const newStatus = this.computeDagStatus(dag);
    if (newStatus !== 'running') {
      dag.status = newStatus;
      dag.completed_at = new Date().toISOString();
      dag.updated_at = new Date().toISOString();
      this.saveDags();
      this.emit('dag:completed', dag);
      console.log(`📊 DAG ${newStatus}: ${dag.id} "${dag.name}"`);
    }
  }

  /**
   * Get nodes that are pending and whose all predecessor nodes are completed.
   */
  private getReadyNodes(dag: Dag): DagNode[] {
    const nodeMap = new Map(dag.nodes.map(n => [n.id, n]));
    const ready: DagNode[] = [];

    for (const node of dag.nodes) {
      if (node.status !== 'pending') continue;

      // Find all predecessor nodes (nodes that have an edge TO this node)
      const predecessors = dag.edges
        .filter(e => e.to === node.id)
        .map(e => nodeMap.get(e.from))
        .filter(Boolean) as DagNode[];

      // If no predecessors, it's a root node — ready to go
      // If all predecessors are completed (or skipped), this node is ready
      const allDone = predecessors.every(p => p.status === 'completed' || p.status === 'skipped');
      if (allDone) {
        ready.push(node);
      }
    }

    return ready;
  }

  /**
   * Start a task node by creating and running a Task via TaskRunner.
   */
  private async startNode(dag: Dag, node: DagNode): Promise<void> {
    node.status = 'running';
    node.started_at = new Date().toISOString();
    dag.updated_at = new Date().toISOString();
    this.saveDags();

    // Collect artifacts from upstream completed nodes
    const upstreamArtifacts = this.collectUpstreamArtifacts(dag, node);
    let enrichedBriefing = node.briefing || node.title;
    if (Object.keys(upstreamArtifacts).length > 0) {
      enrichedBriefing += `\n\n## Upstream Artifacts\n${JSON.stringify(upstreamArtifacts, null, 2)}`;
    }

    try {
      const task = await this.taskManager.createTask({
        title: node.title,
        description: enrichedBriefing,
        project: node.project || dag.project,
        agent: (node.agent as any) || 'claude-code',
        briefing: enrichedBriefing,
        role: node.role,
      });

      node.taskId = task.id;
      this.taskToDag.set(task.id, { dagId: dag.id, nodeId: node.id });
      this.saveDags();

      // Fire and forget — TaskRunner events will call onTaskDone
      this.taskRunner.runTask(task).catch(err => {
        console.error(`DAG node ${node.id} task failed to start:`, err);
        node.status = 'failed';
        node.error = err.message;
        this.saveDags();
        this.advanceDag(dag);
      });

      this.emit('dag:node:started', { dag, node });
      console.log(`  ▶ Node "${node.title}" started (task ${task.id}, role: ${node.role || 'none'})`);
    } catch (err: any) {
      node.status = 'failed';
      node.error = err.message;
      node.completed_at = new Date().toISOString();
      this.saveDags();
      console.error(`  ✖ Node "${node.title}" failed to create task:`, err);
      await this.advanceDag(dag);
    }
  }

  /**
   * Process a gate node — check if its condition is met.
   */
  private processGate(dag: Dag, gate: DagNode): void {
    const predecessors = dag.edges
      .filter(e => e.to === gate.id)
      .map(e => dag.nodes.find(n => n.id === e.from))
      .filter(Boolean) as DagNode[];

    const condition = gate.gate_condition || 'all_pass';

    let passed = false;
    if (condition === 'all_pass') {
      passed = predecessors.every(p => p.status === 'completed');
    } else if (condition === 'any_pass') {
      passed = predecessors.some(p => p.status === 'completed');
    } else if (condition === 'manual') {
      gate.status = 'waiting_approval';
      this.saveDags();
      this.emit('dag:node:waiting_approval', { dag, node: gate });
      return;
    }

    if (passed) {
      gate.status = 'completed';
      gate.completed_at = new Date().toISOString();
      console.log(`  ✓ Gate "${gate.title}" passed`);
    } else {
      gate.status = 'failed';
      gate.error = `Gate condition '${condition}' not met`;
      gate.completed_at = new Date().toISOString();
      console.log(`  ✖ Gate "${gate.title}" failed`);
    }

    dag.updated_at = new Date().toISOString();
    this.saveDags();
    // Continue advancing after gate resolution
    this.advanceDag(dag);
  }

  /**
   * Approve a gate node manually.
   */
  approveGate(dagId: string, nodeId: string): boolean {
    const dag = this.dags.get(dagId);
    if (!dag) return false;
    const node = dag.nodes.find(n => n.id === nodeId);
    if (!node || node.status !== 'waiting_approval') return false;

    node.status = 'completed';
    node.completed_at = new Date().toISOString();
    dag.updated_at = new Date().toISOString();
    this.saveDags();
    console.log(`  ✓ Gate "${node.title}" manually approved`);
    this.advanceDag(dag);
    return true;
  }

  /**
   * Called when a task completes or fails — routes back to the DAG node.
   */
  private onTaskDone(taskId: string, result: 'completed' | 'failed'): void {
    const mapping = this.taskToDag.get(taskId);
    if (!mapping) return; // not a DAG task

    const dag = this.dags.get(mapping.dagId);
    if (!dag) return;

    const node = dag.nodes.find(n => n.id === mapping.nodeId);
    if (!node) return;

    const task = this.taskManager.getTask(taskId);
    node.status = result;
    node.completed_at = new Date().toISOString();
    if (task?.output) node.output = task.output;
    if (result === 'failed') node.error = task?.agent_output || 'Task failed';

    // Store structured artifacts from task output for downstream nodes
    if (result === 'completed' && task?.output) {
      const fullOutput = task.output.join('\n');
      node.artifacts = { output_summary: fullOutput.slice(0, 4000) };
      // Try to extract JSON artifacts from output
      const jsonMatch = fullOutput.match(/```json\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          node.artifacts.structured = JSON.parse(jsonMatch[1]);
        } catch { /* not valid JSON, skip */ }
      }
    }

    dag.updated_at = new Date().toISOString();
    this.taskToDag.delete(taskId);
    this.saveDags();

    console.log(`  ${result === 'completed' ? '✓' : '✖'} Node "${node.title}" ${result}`);
    this.emit(`dag:node:${result}`, { dag, node });

    // Advance the DAG
    this.advanceDag(dag);
  }

  // ── Helpers ────────────────────────────────────────────────

  /**   * Collect artifacts from all completed upstream (predecessor) nodes.
   */
  private collectUpstreamArtifacts(dag: Dag, node: DagNode): Record<string, any> {
    const result: Record<string, any> = {};
    const predecessors = dag.edges
      .filter(e => e.to === node.id)
      .map(e => dag.nodes.find(n => n.id === e.from))
      .filter(Boolean) as DagNode[];

    for (const pred of predecessors) {
      if (pred.status === 'completed' && pred.artifacts) {
        result[pred.id] = { title: pred.title, role: pred.role, ...pred.artifacts };
      }
    }
    return result;
  }

  /**   * Compute overall DAG status from node statuses.
   */
  private computeDagStatus(dag: Dag): DagStatus {
    const statuses = dag.nodes.map(n => n.status);

    // Any node still running or waiting → DAG is running
    if (statuses.some(s => s === 'running' || s === 'waiting_approval')) return 'running';

    // Any pending nodes left → still running (they'll be picked up by advanceDag)
    if (statuses.some(s => s === 'pending')) {
      // But only if there are no failed nodes blocking them
      const failedIds = new Set(dag.nodes.filter(n => n.status === 'failed').map(n => n.id));
      const pendingNodes = dag.nodes.filter(n => n.status === 'pending');
      const blocked = pendingNodes.some(pn => {
        const preds = dag.edges.filter(e => e.to === pn.id).map(e => e.from);
        return preds.some(p => failedIds.has(p));
      });
      if (blocked && pendingNodes.length === dag.nodes.filter(n => n.status === 'pending').length) {
        return 'failed'; // all pending nodes are blocked by failures
      }
      return 'running';
    }

    // All done
    if (statuses.some(s => s === 'failed')) return 'failed';
    return 'completed';
  }

  /**
   * Detect cycles using DFS.
   */
  private hasCycle(nodes: DagNode[], edges: DagEdge[]): boolean {
    const adj = new Map<string, string[]>();
    for (const n of nodes) adj.set(n.id, []);
    for (const e of edges) adj.get(e.from)?.push(e.to);

    const visited = new Set<string>();
    const inStack = new Set<string>();

    const dfs = (nodeId: string): boolean => {
      if (inStack.has(nodeId)) return true;
      if (visited.has(nodeId)) return false;
      visited.add(nodeId);
      inStack.add(nodeId);
      for (const neighbor of adj.get(nodeId) || []) {
        if (dfs(neighbor)) return true;
      }
      inStack.delete(nodeId);
      return false;
    };

    for (const n of nodes) {
      if (dfs(n.id)) return true;
    }
    return false;
  }
}
