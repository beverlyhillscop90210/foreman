import { TaskManager } from './task-manager.js';
import { DAGManager } from './dag-manager.js';
import { RoleManager } from './role-manager.js';

export const roleManager = new RoleManager();
export const taskManager = new TaskManager(roleManager);
export const dagManager = new DAGManager(taskManager);
