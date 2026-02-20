import { DAGDefinition, DAGNode, DAGEdge, Task } from './types.js';
import { TaskManager } from './task-manager.js';

export class DAGExecutor {
  private taskManager: TaskManager;
  private maxThreads: number;

  constructor(taskManager: TaskManager, maxThreads: number = 6) {
    this.taskManager = taskManager;
    this.maxThreads = maxThreads;
  }

  /**
   * Execute a DAG workflow
   */
  async execute(dag: DAGDefinition): Promise<void> {
    dag.status = 'running';
    dag.updated_at = new Date().toISOString();

    try {
      // Initialize node statuses
      for (const node of dag.nodes) {
        node.status = 'pending';
      }

      let hasRunningOrReadyNodes = true;

      while (hasRunningOrReadyNodes) {
        // Check if DAG was cancelled or failed (status might be updated by another process)
        const currentStatus = dag.status as string;
        if (currentStatus === 'cancelled' || currentStatus === 'failed') {
          break;
        }

        const readyNodes = this.getNewlyReadyNodes(dag);
        const runningNodes = dag.nodes.filter(n => n.status === 'running');

        // If nothing is ready and nothing is running, we are either done or deadlocked
        if (readyNodes.length === 0 && runningNodes.length === 0) {
          const pendingNodes = dag.nodes.filter(n => n.status === 'pending');
          if (pendingNodes.length > 0) {
            throw new Error(`Deadlock detected. ${pendingNodes.length} nodes are pending but cannot be started.`);
          }
          break; // All nodes completed
        }

        // Start ready nodes up to maxThreads
        const availableThreads = this.maxThreads - runningNodes.length;
        const nodesToStart = readyNodes.slice(0, availableThreads);

        for (const node of nodesToStart) {
          this.executeNode(node, dag).catch(error => {
            console.error(`Node ${node.id} failed:`, error);
            node.status = 'failed';
            node.error = error.message;
            node.completed_at = new Date().toISOString();
            
            // Fail fast: cancel the whole DAG
            dag.status = 'failed';
            dag.updated_at = new Date().toISOString();
          });
        }

        // Wait a bit before checking again (simple polling for now)
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        hasRunningOrReadyNodes = dag.nodes.some(n => n.status === 'running' || n.status === 'pending');
      }

      if (dag.status === 'running') {
        dag.status = 'completed';
        dag.updated_at = new Date().toISOString();
      }
    } catch (error: any) {
      console.error(`DAG ${dag.id} failed:`, error);
      dag.status = 'failed';
      dag.updated_at = new Date().toISOString();
    }
  }

  /**
   * Execute a single node
   */
  private async executeNode(node: DAGNode, dag: DAGDefinition): Promise<void> {
    node.status = 'running';
    node.started_at = new Date().toISOString();

    try {
      if (node.type === 'task' || node.type === 'planner' || node.type === 'merge') {
        // Create a task in the TaskManager
        const task = await this.taskManager.createTask({
          project: dag.project,
          title: node.title,
          briefing: node.briefing,
          allowed_files: node.config.allowed_files || [],
          blocked_files: node.config.blocked_files || [],
          agent: 'augment', // Default for now, should be based on role
          role: node.role
        });

        // Wait for task to complete
        await this.waitForTaskCompletion(task.id);
        
        // Get the completed task to retrieve output
        const completedTask = await this.taskManager.getTask(task.id);
        if (completedTask && completedTask.status === 'completed') {
          node.output = completedTask.output;
          node.status = 'completed';
        } else {
          throw new Error(`Task ${task.id} failed or was rejected.`);
        }
      } else if (node.type === 'gate') {
        // TODO: Implement QC Gate logic
        console.log(`Executing gate node ${node.id}...`);
        // Simulate gate passing for now
        await new Promise(resolve => setTimeout(resolve, 2000));
        node.status = 'completed';
      }

      node.completed_at = new Date().toISOString();
      this.propagateOutputs(node, dag);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Wait for a task to complete in the TaskManager
   */
  private async waitForTaskCompletion(taskId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(async () => {
        const task = await this.taskManager.getTask(taskId);
        if (!task) {
          clearInterval(checkInterval);
          reject(new Error(`Task ${taskId} not found`));
          return;
        }

        if (task.status === 'completed' || task.status === 'approved') {
          clearInterval(checkInterval);
          resolve();
        } else if (task.status === 'failed' || task.status === 'rejected') {
          clearInterval(checkInterval);
          reject(new Error(`Task ${taskId} ended with status ${task.status}`));
        }
      }, 2000);
    });
  }

  /**
   * Find nodes whose dependencies are all met
   */
  private getNewlyReadyNodes(dag: DAGDefinition): DAGNode[] {
    return dag.nodes.filter(node => {
      if (node.status !== 'pending') return false;

      // Find all incoming edges to this node
      const incomingEdges = dag.edges.filter(edge => edge.to === node.id);
      
      // Check if all source nodes of incoming edges are completed
      const allDependenciesMet = incomingEdges.every(edge => {
        const sourceNode = dag.nodes.find(n => n.id === edge.from);
        return sourceNode && sourceNode.status === 'completed';
      });

      return allDependenciesMet;
    });
  }

  /**
   * Propagate outputs from completed node to downstream nodes
   */
  private propagateOutputs(completedNode: DAGNode, dag: DAGDefinition): void {
    const outgoingEdges = dag.edges.filter(edge => edge.from === completedNode.id && edge.type === 'data_flow');
    
    for (const edge of outgoingEdges) {
      const targetNode = dag.nodes.find(n => n.id === edge.to);
      if (targetNode) {
        // Simple propagation: append to briefing or pass as input
        // In a real implementation, this would be more structured
        if (completedNode.output) {
          targetNode.briefing += `\n\n--- Input from ${completedNode.title} ---\n${JSON.stringify(completedNode.output)}`;
        }
      }
    }
  }
}
