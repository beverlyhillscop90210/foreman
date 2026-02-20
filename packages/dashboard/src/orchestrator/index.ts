// Export the main coordinator class
export { KanbanCoordinator } from './coordinator';

// Export the pipeline integration
export { Pipeline } from './pipeline';

// Export the task queue
export { TaskQueue } from './task-queue';

// Export all types
export type {
  TaskDefinition,
  TaskPriority,
  TaskStatus,
  AgentType,
  CoordinatorConfig,
  CoordinatorState,
  SubAgentRequest,
} from './types';

