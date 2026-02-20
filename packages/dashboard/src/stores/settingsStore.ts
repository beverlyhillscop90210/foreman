import { create } from 'zustand';

export interface EnvVar {
  key: string;
  value: string;
  category: string;
  masked?: boolean;
  description?: string;
}

export interface AgentConfig {
  maxConcurrentAgents: number;
  defaultMaxTurns: number;
  defaultAgentType: string;
}

interface SettingsStore {
  envVars: EnvVar[];
  agentConfig: AgentConfig;
  isLoading: boolean;
  
  // Env var actions
  setEnvVars: (vars: EnvVar[]) => void;
  addEnvVar: (envVar: EnvVar) => void;
  updateEnvVar: (key: string, updates: Partial<EnvVar>) => void;
  deleteEnvVar: (key: string) => void;
  
  // Agent config actions
  setAgentConfig: (config: Partial<AgentConfig>) => void;
  
  // Persistence
  loadFromLocalStorage: () => void;
  saveToLocalStorage: () => void;
  
  // API sync
  syncWithAPI: () => Promise<void>;
  saveToAPI: () => Promise<void>;
}

const DEFAULT_AGENT_CONFIG: AgentConfig = {
  maxConcurrentAgents: 5,
  defaultMaxTurns: 50,
  defaultAgentType: 'augment-agent',
};

const MOCK_ENV_VARS: EnvVar[] = [
  { key: 'GITHUB_TOKEN', value: 'ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', category: 'Authentication', masked: true },
  { key: 'AUGMENT_API_KEY', value: 'aug_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', category: 'API Keys', masked: true },
  { key: 'ANTHROPIC_API_KEY', value: 'sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', category: 'API Keys', masked: true },
  { key: 'ZEON_API_URL', value: 'https://api.zeon.dev/v1', category: 'Configuration', masked: false },
  { key: 'FOREMAN_MASTER_KEY', value: 'fmk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', category: 'Authentication', masked: true },
  { key: 'WEBHOOK_URL', value: 'https://hooks.foreman.dev/events', category: 'Configuration', masked: false },
];

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  envVars: MOCK_ENV_VARS,
  agentConfig: DEFAULT_AGENT_CONFIG,
  isLoading: false,

  setEnvVars: (vars) => set({ envVars: vars }),

  addEnvVar: (envVar) => set((state) => ({
    envVars: [...state.envVars, envVar]
  })),

  updateEnvVar: (key, updates) => set((state) => ({
    envVars: state.envVars.map(v => v.key === key ? { ...v, ...updates } : v)
  })),

  deleteEnvVar: (key) => set((state) => ({
    envVars: state.envVars.filter(v => v.key !== key)
  })),

  setAgentConfig: (config) => set((state) => ({
    agentConfig: { ...state.agentConfig, ...config }
  })),

  loadFromLocalStorage: () => {
    try {
      const stored = localStorage.getItem('foreman-settings');
      if (stored) {
        const data = JSON.parse(stored);
        set({
          envVars: data.envVars || MOCK_ENV_VARS,
          agentConfig: data.agentConfig || DEFAULT_AGENT_CONFIG,
        });
      }
    } catch (error) {
      console.error('Failed to load settings from localStorage:', error);
    }
  },

  saveToLocalStorage: () => {
    try {
      const { envVars, agentConfig } = get();
      localStorage.setItem('foreman-settings', JSON.stringify({ envVars, agentConfig }));
    } catch (error) {
      console.error('Failed to save settings to localStorage:', error);
    }
  },

  syncWithAPI: async () => {
    // This will be implemented to fetch from the Bridge API
    // For now, just load from localStorage
    get().loadFromLocalStorage();
  },

  saveToAPI: async () => {
    // This will be implemented to save to the Bridge API
    // For now, just save to localStorage
    get().saveToLocalStorage();
  },
}));

