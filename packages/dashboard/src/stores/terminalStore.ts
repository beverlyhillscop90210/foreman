import { create } from 'zustand';
import { Agent, TerminalPanel, TerminalLine, AgentStatus } from '../types';
import { api, type Task } from '../lib/api';
import { wsClient, type WebSocketMessage } from '../lib/ws';

interface TerminalStore {
  agents: Agent[];
  panels: TerminalPanel[];
  maxAgents: number;
  selectedProject: string | null;
  isInitialized: boolean;
  isLoading: boolean;
  error: Error | null;
  errorMessage: string | null;
  pollingInterval: number | null;
  addAgent: (agent: Agent) => void;
  updateAgent: (id: string, updates: Partial<Agent>) => void;
  addOutput: (agentId: string, text: string, type?: 'stdout' | 'stderr' | 'system') => void;
  addPanel: (panel: TerminalPanel) => void;
  updatePanel: (id: string, updates: Partial<TerminalPanel>) => void;
  removePanel: (id: string) => void;
  hidePanel: (id: string) => void;
  restorePanel: (id: string) => void;
  toggleMinimize: (id: string) => void;
  toggleMaximize: (id: string) => void;
  setSelectedProject: (project: string | null) => void;
  initialize: () => Promise<void>;
  handleWebSocketMessage: (message: WebSocketMessage) => void;
  setMaxAgents: (max: number) => void;
  startPolling: () => void;
  stopPolling: () => void;
  refreshTasks: () => Promise<void>;
  retry: () => Promise<void>;
}

// Helper function to convert Task to Agent
function taskToAgent(task: Task): Agent {
  // Map task status to agent status
  let agentStatus: AgentStatus;
  if (task.status === 'pending') {
    agentStatus = 'idle';
  } else if (task.status === 'running') {
    agentStatus = 'running';
  } else if (task.status === 'approved' || task.status === 'reviewing') {
    agentStatus = 'completed';
  } else {
    agentStatus = 'failed';
  }

  // Parse output array into lines
  const outputLines: TerminalLine[] = [];
  if (task.output && Array.isArray(task.output)) {
    task.output.forEach((item, i) => {
      // Output can be a JSON string or plain text
      let text = '';
      if (typeof item === 'string') {
        try {
          const parsed = JSON.parse(item);
          // If it's a result object, extract the result text
          if (parsed.type === 'result' && parsed.result) {
            text = parsed.result;
          } else {
            text = item;
          }
        } catch {
          text = item;
        }
      } else if (typeof item === 'object' && item !== null) {
        // If it's already an object, stringify it
        text = JSON.stringify(item, null, 2);
      }

      if (text.trim()) {
        outputLines.push({
          id: `${task.id}-${i}`,
          timestamp: task.started_at ? new Date(task.started_at).getTime() + i * 100 : Date.now(),
          text,
          type: 'stdout' as const,
        });
      }
    });
  }

  return {
    id: task.id,
    taskTitle: task.title,
    bucket: task.project,
    status: agentStatus,
    startTime: task.started_at ? new Date(task.started_at).getTime() : new Date(task.created_at).getTime(),
    output: outputLines,
  };
}

// Helper function to create a panel for an agent
function createPanelForAgent(agentId: string, index: number): TerminalPanel {
  const cols = 2;
  const panelWidth = 600;
  const panelHeight = 400;
  const gap = 10;

  const col = index % cols;
  const row = Math.floor(index / cols);

  return {
    id: `panel-${agentId}`,
    agentId,
    position: {
      x: gap + col * (panelWidth + gap),
      y: gap + row * (panelHeight + gap),
      width: panelWidth,
      height: panelHeight,
    },
    isMinimized: false,
    isMaximized: false,
    isHidden: false,
  };
}



export const useTerminalStore = create<TerminalStore>((set, get) => ({
  agents: [],
  panels: [],
  maxAgents: 5,
  selectedProject: null,
  isInitialized: false,
  isLoading: false,
  error: null,
  errorMessage: null,
  pollingInterval: null,

  addAgent: (agent) => set((state) => {
    // Check if agent already exists
    if (state.agents.some(a => a.id === agent.id)) {
      return state;
    }

    // Create a panel for the new agent
    const panel = createPanelForAgent(agent.id, state.panels.length);

    return {
      agents: [...state.agents, agent],
      panels: [...state.panels, panel],
    };
  }),

  updateAgent: (id, updates) => set((state) => ({
    agents: state.agents.map(a => a.id === id ? { ...a, ...updates } : a)
  })),

  addOutput: (agentId, text, type = 'stdout') => set((state) => ({
    agents: state.agents.map(a =>
      a.id === agentId
        ? {
            ...a,
            output: [...a.output, {
              id: `${agentId}-${Date.now()}-${Math.random()}`,
              timestamp: Date.now(),
              text,
              type
            }]
          }
        : a
    )
  })),

  addPanel: (panel) => set((state) => ({
    panels: [...state.panels, panel]
  })),

  updatePanel: (id, updates) => set((state) => ({
    panels: state.panels.map(p => p.id === id ? { ...p, ...updates } : p)
  })),

  removePanel: (id) => set((state) => ({
    panels: state.panels.filter(p => p.id !== id)
  })),

  hidePanel: (id) => set((state) => ({
    panels: state.panels.map(p =>
      p.id === id ? { ...p, isHidden: true } : p
    )
  })),

  restorePanel: (id) => set((state) => ({
    panels: state.panels.map(p =>
      p.id === id ? { ...p, isHidden: false } : p
    )
  })),

  toggleMinimize: (id) => set((state) => ({
    panels: state.panels.map(p =>
      p.id === id
        ? { ...p, isMinimized: !p.isMinimized, isMaximized: false }
        : p
    )
  })),

  toggleMaximize: (id) => set((state) => ({
    panels: state.panels.map(p =>
      p.id === id
        ? { ...p, isMaximized: !p.isMaximized, isMinimized: false }
        : p
    )
  })),

  setSelectedProject: (project) => set({ selectedProject: project }),

  setMaxAgents: (max) => set({ maxAgents: max }),

  // Initialize store with data from API
  initialize: async () => {
    const state = get();
    if (state.isInitialized) {
      return;
    }

    try {
      console.log('[TerminalStore] Initializing from API...');

      // Fetch tasks
      const tasks = await api.getTasks();

      console.log('[TerminalStore] Loaded', tasks.length, 'tasks');

      // Convert tasks to agents
      const agents = tasks.map(taskToAgent);
      const panels = agents.map((agent, index) => createPanelForAgent(agent.id, index));

      set({
        agents,
        panels,
        maxAgents: 5, // Hardcoded safety limit
        isInitialized: true,
      });

      // Connect to WebSocket
      wsClient.connect();
      wsClient.onMessage((message) => {
        get().handleWebSocketMessage(message);
      });

      // Start polling for updates every 5 seconds
      get().startPolling();

      console.log('[TerminalStore] Initialized successfully');
    } catch (error) {
      console.error('[TerminalStore] Failed to initialize:', error);

      // On error, show empty state
      set({
        agents: [],
        panels: [],
        maxAgents: 5,
        isInitialized: true,
      });
    }
  },

  // Handle WebSocket messages
  handleWebSocketMessage: (message) => {
    const state = get();

    if (message.type === 'agent_output') {
      // Add output to the agent
      const agent = state.agents.find(a => a.id === message.taskId);
      if (agent) {
        state.addOutput(message.taskId, message.line, message.stream);
      } else {
        // Agent doesn't exist yet, fetch it from API
        api.getTask(message.taskId).then(task => {
          const newAgent = taskToAgent(task);
          state.addAgent(newAgent);
        }).catch(err => {
          console.error('[TerminalStore] Failed to fetch task:', err);
        });
      }
    } else if (message.type === 'task_event') {
      // Update agent status based on lifecycle event
      const agent = state.agents.find(a => a.id === message.taskId);

      if (message.event === 'started') {
        if (agent) {
          state.updateAgent(message.taskId, { status: 'running' });
        } else {
          // Fetch the new task
          api.getTask(message.taskId).then(task => {
            const newAgent = taskToAgent(task);
            state.addAgent(newAgent);
          }).catch(err => {
            console.error('[TerminalStore] Failed to fetch task:', err);
          });
        }
      } else if (message.event === 'completed') {
        if (agent) {
          state.updateAgent(message.taskId, { status: 'completed' });
        }
      } else if (message.event === 'failed') {
        if (agent) {
          state.updateAgent(message.taskId, { status: 'failed' });
        }
      }
    }
  },

  // Start polling for task updates
  startPolling: () => {
    const state = get();

    // Clear any existing interval
    if (state.pollingInterval) {
      clearInterval(state.pollingInterval);
    }

    // Poll every 5 seconds
    const interval = window.setInterval(() => {
      get().refreshTasks();
    }, 5000);

    set({ pollingInterval: interval });
  },

  // Stop polling
  stopPolling: () => {
    const state = get();
    if (state.pollingInterval) {
      clearInterval(state.pollingInterval);
      set({ pollingInterval: null });
    }
  },

  // Refresh tasks from API
  refreshTasks: async () => {
    try {
      const tasks = await api.getTasks();
      const state = get();

      // Update existing agents and add new ones
      tasks.forEach(task => {
        const existingAgent = state.agents.find(a => a.id === task.id);

        if (existingAgent) {
          // Update existing agent
          const updatedAgent = taskToAgent(task);
          state.updateAgent(task.id, {
            status: updatedAgent.status,
            output: updatedAgent.output,
          });
        } else {
          // Add new agent
          const newAgent = taskToAgent(task);
          state.addAgent(newAgent);
        }
      });
    } catch (error) {
      console.error('[TerminalStore] Failed to refresh tasks:', error);
    }
  },

  // Retry initialization
  retry: async () => {
    set({ isInitialized: false, error: null, errorMessage: null });
    await get().initialize();
  },
}));

