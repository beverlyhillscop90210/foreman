import { TaskManager } from './task-manager.js';
import { DAGManager } from './dag-manager.js';
import { RoleManager } from './role-manager.js';
import { RiskManager } from './risk-manager.js';
import { KnowledgeGraph } from './knowledge-graph.js';

export const roleManager = new RoleManager();
export const riskManager = new RiskManager();
export const knowledgeGraph = new KnowledgeGraph();
export const taskManager = new TaskManager(roleManager, knowledgeGraph);
export const dagManager = new DAGManager(taskManager, riskManager);
