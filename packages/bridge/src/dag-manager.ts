import { nanoid } from 'nanoid';
import { DAGDefinition, DAGNode, DAGEdge } from './types.js';
import { DAGExecutor } from './dag-executor.js';
import { TaskManager } from './task-manager.js';

export class DAGManager {
  private dags: Map<string, DAGDefinition> = new Map();
  private executor: DAGExecutor;

  constructor(taskManager: TaskManager) {
    this.executor = new DAGExecutor(taskManager);
  }

  /**
   * Create a new DAG
   */
  async createDAG(request: Omit<DAGDefinition, 'id' | 'status' | 'created_at' | 'updated_at'>): Promise<DAGDefinition> {
    const dag: DAGDefinition = {
      ...request,
      id: nanoid(12),
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    this.dags.set(dag.id, dag);
    return dag;
  }

  /**
   * Get DAG by ID
   */
  async getDAG(id: string): Promise<DAGDefinition | null> {
    return this.dags.get(id) || null;
  }

  /**
   * List all DAGs
   */
  async listDAGs(): Promise<DAGDefinition[]> {
    return Array.from(this.dags.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }

  /**
   * Execute a DAG
   */
  async executeDAG(id: string): Promise<DAGDefinition> {
    const dag = this.dags.get(id);
    if (!dag) {
      throw new Error(`DAG ${id} not found`);
    }

    if (dag.status === 'running') {
      throw new Error(`DAG ${id} is already running`);
    }

    // Start execution in background
    this.executor.execute(dag).catch(error => {
      console.error(`DAG ${id} execution failed:`, error);
    });

    return dag;
  }

  /**
   * Cancel a running DAG
   */
  async cancelDAG(id: string): Promise<DAGDefinition> {
    const dag = this.dags.get(id);
    if (!dag) {
      throw new Error(`DAG ${id} not found`);
    }

    if (dag.status !== 'running' && dag.status !== 'pending') {
      throw new Error(`Cannot cancel DAG in status: ${dag.status}`);
    }

    dag.status = 'cancelled';
    dag.updated_at = new Date().toISOString();

    // Cancel all pending/running nodes
    for (const node of dag.nodes) {
      if (node.status === 'pending' || node.status === 'running') {
        node.status = 'cancelled';
        node.updated_at = new Date().toISOString();
      }
    }

    return dag;
  }
}
