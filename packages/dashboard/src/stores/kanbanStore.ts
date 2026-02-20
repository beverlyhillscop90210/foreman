import { create } from 'zustand';
import { KanbanTask, KanbanStatus } from '../types';
import { api, Task } from '../lib/api';

interface KanbanStore {
  tasks: KanbanTask[];
  isLoading: boolean;
  error: string | null;
  selectedTask: KanbanTask | null;
  setSelectedTask: (task: KanbanTask | null) => void;
  fetchTasks: () => Promise<void>;
  startPolling: () => void;
  stopPolling: () => void;
}

// Map Bridge API task status to Kanban column status
function mapTaskStatus(apiStatus: Task['status']): KanbanStatus {
  switch (apiStatus) {
    case 'pending':
      return 'backlog';
    case 'running':
      return 'in-progress';
    case 'reviewing':
      return 'review';
    case 'approved':
      return 'done';
    case 'rejected':
    case 'failed':
      return 'backlog';
    default:
      return 'backlog';
  }
}

// Calculate elapsed time from timestamps
function calculateElapsedTime(task: Task): string {
  const now = Date.now();
  let startTime: number;

  // For completed/approved/reviewing tasks, use updated_at as completion time
  if (task.status === 'approved' || task.status === 'reviewing') {
    const completedTime = new Date(task.updated_at).getTime();
    startTime = task.started_at ? new Date(task.started_at).getTime() : new Date(task.created_at).getTime();
    const elapsed = completedTime - startTime;
    return formatDuration(elapsed);
  } else if (task.started_at) {
    // Task is running, show time since started
    startTime = new Date(task.started_at).getTime();
    const elapsed = now - startTime;
    return formatDuration(elapsed);
  } else {
    // Task hasn't started yet
    return '0m';
  }
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m`;
  } else {
    return `${seconds}s`;
  }
}

// Convert Bridge API Task to KanbanTask
function convertToKanbanTask(task: Task): KanbanTask {
  const status = mapTaskStatus(task.status);

  // Add rejection/failure notes to briefing if applicable
  let briefing = task.briefing;
  if (task.status === 'rejected') {
    briefing = `${task.briefing}\n\n## ⚠️ REJECTED\nThis task was rejected and returned to backlog.`;
  } else if (task.status === 'failed') {
    briefing = `${task.briefing}\n\n## ❌ FAILED\nThis task failed and returned to backlog.`;
  }

  // Parse output array to extract agent log
  let agentLog = '';
  if (task.output && Array.isArray(task.output) && task.output.length > 0) {
    task.output.forEach((item) => {
      if (typeof item === 'string') {
        try {
          const parsed = JSON.parse(item);
          // If it's a result object, extract the result text
          if (parsed.type === 'result' && parsed.result) {
            agentLog += parsed.result + '\n';
          } else {
            agentLog += item + '\n';
          }
        } catch {
          agentLog += item + '\n';
        }
      } else if (typeof item === 'object' && item !== null) {
        agentLog += JSON.stringify(item, null, 2) + '\n';
      }
    });
  }

  return {
    id: task.id,
    title: task.title,
    project: task.project,
    agentId: task.model || task.agent || "unknown",
    elapsedTime: calculateElapsedTime(task),
    status,
    briefing,
    agentLog: agentLog.trim(),
    filesChanged: task.allowed_files || [],
  };
}

let pollingInterval: number | null = null;

export const useKanbanStore = create<KanbanStore>((set, get) => ({
  tasks: [],
  isLoading: false,
  error: null,
  selectedTask: null,

  setSelectedTask: (task) => set({ selectedTask: task }),

  fetchTasks: async () => {
    set({ isLoading: true, error: null });
    try {
      // Create a timeout promise (5 seconds)
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout - API took too long to respond')), 5000);
      });

      // Race between the API call and the timeout
      const apiTasks = await Promise.race([
        api.getTasks(),
        timeoutPromise
      ]);

      const kanbanTasks = apiTasks.map(convertToKanbanTask);
      set({ tasks: kanbanTasks, isLoading: false });
    } catch (error) {
      console.error('[KanbanStore] Failed to fetch tasks:', error);

      // Provide more helpful error messages
      let errorMessage = 'Failed to fetch tasks';
      if (error instanceof Error) {
        if (error.message.includes('timeout')) {
          errorMessage = 'Request timeout - API is not responding';
        } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
          errorMessage = 'Network error - Cannot reach API (possible CORS issue)';
        } else {
          errorMessage = error.message;
        }
      }

      set({
        error: errorMessage,
        isLoading: false
      });
    }
  },

  startPolling: () => {
    const { fetchTasks } = get();

    // Initial fetch
    fetchTasks();

    // Poll every 10 seconds
    if (pollingInterval === null) {
      pollingInterval = window.setInterval(() => {
        fetchTasks();
      }, 10000);
    }
  },

  stopPolling: () => {
    if (pollingInterval !== null) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
  },
}));

