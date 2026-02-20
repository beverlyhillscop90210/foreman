import { create } from 'zustand';
import { supabase } from '../lib/supabase';

export interface EnvVar {
  key: string;
  value: string;
  category: string;
  masked?: boolean;
  description?: string;
  userEmail?: string; // If set, this key is only for this user
}

export interface AgentConfig {
  maxConcurrentAgents: number;
  defaultMaxTurns: number;
  defaultAgentType: string;
}

export interface RoleSystemPrompt {
  userEmail: string;
  userName: string;
  prompt: string;
}

export interface RoleConfig {
  id: string;
  name: string;
  model: string;
  systemPrompts: RoleSystemPrompt[];
  activePromptUserEmail?: string;
}

export interface AccessControlUser {
  email: string;
  name: string;
  role: 'Super Admin' | 'Admin' | 'User';
}

export interface AccessControl {
  users: AccessControlUser[];
}

interface SettingsStore {
  envVars: EnvVar[];
  agentConfig: AgentConfig;
  accessControl: AccessControl;
  rolesConfig: RoleConfig[];
  isLoading: boolean;
  
  // Env var actions
  setEnvVars: (vars: EnvVar[]) => void;
  addEnvVar: (envVar: EnvVar) => void;
  updateEnvVar: (key: string, updates: Partial<EnvVar>) => void;
  deleteEnvVar: (key: string) => void;
  
  // Agent config actions
  setAgentConfig: (config: Partial<AgentConfig>) => void;

  // Access control actions
  setAccessControl: (config: Partial<AccessControl>) => void;

  // Role config actions
  setRolesConfig: (roles: RoleConfig[]) => void;
  updateRoleConfig: (id: string, updates: Partial<RoleConfig>) => void;
  
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

const DEFAULT_ACCESS_CONTROL: AccessControl = {
  users: [
    { email: 'peter@beverlyhillscop.io', name: 'Peter Schings', role: 'Super Admin' },
    { email: 'peterschings@gmail.com', name: 'Peter Schings', role: 'Super Admin' }
  ]
};

const DEFAULT_ROLES_CONFIG: RoleConfig[] = [
  { id: 'augment-agent', name: 'Augment Agent', model: 'claude-3-5-sonnet-20241022', systemPrompts: [{ userEmail: 'peterschings@gmail.com', userName: 'Peter Schings', prompt: 'You are an expert coding assistant. Your task is to help the user write, refactor, and debug code.' }], activePromptUserEmail: 'peterschings@gmail.com' },
  { id: 'code-agent', name: 'Code Agent', model: 'claude-3-5-sonnet-20241022', systemPrompts: [{ userEmail: 'peterschings@gmail.com', userName: 'Peter Schings', prompt: 'You are an expert software engineer. Your task is to implement features according to the provided specifications.' }], activePromptUserEmail: 'peterschings@gmail.com' },
  { id: 'research-agent', name: 'Research Agent', model: 'openrouter/anthropic/claude-3.5-sonnet', systemPrompts: [{ userEmail: 'peterschings@gmail.com', userName: 'Peter Schings', prompt: 'You are an expert researcher. Your task is to gather information, analyze data, and provide comprehensive reports.' }], activePromptUserEmail: 'peterschings@gmail.com' },
  { id: 'test-agent', name: 'Test Agent', model: 'claude-3-5-sonnet-20241022', systemPrompts: [{ userEmail: 'peterschings@gmail.com', userName: 'Peter Schings', prompt: 'You are an expert QA engineer. Your task is to write comprehensive test suites and identify edge cases.' }], activePromptUserEmail: 'peterschings@gmail.com' },
  { id: 'qc-agent', name: 'QC Agent', model: 'claude-3-5-sonnet-20241022', systemPrompts: [{ userEmail: 'peterschings@gmail.com', userName: 'Peter Schings', prompt: 'You are the Quality Control (QC) Agent. Your task is to review completed tasks, verify code quality, and manage the Kanban board. If a task is poorly executed, you must reassign it or spawn a new agent. When you are satisfied, notify the user via MCP for final approval before merging.' }], activePromptUserEmail: 'peterschings@gmail.com' },
];

const MOCK_ENV_VARS: EnvVar[] = [
  { key: 'GITHUB_TOKEN', value: 'ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', category: 'Authentication', masked: true },
  { key: 'AUGMENT_API_KEY', value: 'aug_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', category: 'API Keys', masked: true },
  { key: 'ANTHROPIC_API_KEY', value: 'sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', category: 'API Keys', masked: true },
  { key: 'OPENROUTER_API_KEY', value: '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', category: 'API Keys', masked: true },
  { key: 'ZEON_API_URL', value: 'https://api.zeon.dev/v1', category: 'Configuration', masked: false },
  { key: 'FOREMAN_MASTER_KEY', value: 'fmk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', category: 'Authentication', masked: true },
  { key: 'WEBHOOK_URL', value: 'https://hooks.foreman.dev/events', category: 'Configuration', masked: false },
];

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  envVars: MOCK_ENV_VARS,
  agentConfig: DEFAULT_AGENT_CONFIG,
  accessControl: DEFAULT_ACCESS_CONTROL,
  rolesConfig: DEFAULT_ROLES_CONFIG,
  isLoading: false,

  setEnvVars: (vars) => {
    set({ envVars: vars });
    get().saveToAPI();
  },

  addEnvVar: (envVar) => {
    set((state) => ({ envVars: [...state.envVars, envVar] }));
    get().saveToAPI();
  },

  updateEnvVar: (key, updates) => {
    set((state) => ({
      envVars: state.envVars.map(v => v.key === key ? { ...v, ...updates } : v)
    }));
    get().saveToAPI();
  },

  deleteEnvVar: (key) => {
    set((state) => ({
      envVars: state.envVars.filter(v => v.key !== key)
    }));
    get().saveToAPI();
  },

  setAgentConfig: (config) => {
    set((state) => ({
      agentConfig: { ...state.agentConfig, ...config }
    }));
    get().saveToAPI();
  },

  setAccessControl: (config) => {
    set((state) => ({
      accessControl: { ...state.accessControl, ...config }
    }));
    get().saveToAPI();
  },

  setRolesConfig: (roles) => {
    set({ rolesConfig: roles });
    get().saveToAPI();
  },

  updateRoleConfig: (id, updates) => {
    set((state) => ({
      rolesConfig: state.rolesConfig.map(r => r.id === id ? { ...r, ...updates } : r)
    }));
    get().saveToAPI();
  },

  loadFromLocalStorage: () => {
    try {
      const stored = localStorage.getItem('foreman-settings');
      if (stored) {
        const data = JSON.parse(stored);
        
        // Merge envVars to ensure new default keys (like OPENROUTER_API_KEY) are added
        // even if the user has an older version of settings in localStorage
        const loadedEnvVars = data.envVars || [];
        const mergedEnvVars = [...MOCK_ENV_VARS];
        
        loadedEnvVars.forEach((loadedVar: EnvVar) => {
          const index = mergedEnvVars.findIndex(v => v.key === loadedVar.key);
          if (index >= 0) {
            // Force update OPENROUTER_API_KEY if it's empty or the old placeholder
            if (loadedVar.key === 'OPENROUTER_API_KEY' && (!loadedVar.value || loadedVar.value.includes('xxxxxxxx'))) {
              mergedEnvVars[index].value = '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';
            } else {
              mergedEnvVars[index] = loadedVar;
            }
          } else {
            mergedEnvVars.push(loadedVar);
          }
        });

        // Handle migration from old accessControl format
        let loadedAccessControl = data.accessControl || DEFAULT_ACCESS_CONTROL;
        if (loadedAccessControl.allowedEmails) {
          // Migrate old format to new format
          const users = loadedAccessControl.allowedEmails.map((email: string) => ({
            email,
            name: email.split('@')[0],
            role: loadedAccessControl.adminEmails?.includes(email) ? 'Admin' : 'User'
          }));
          // Ensure Peter is Super Admin
          const peter1 = users.find((u: any) => u.email === 'peter@beverlyhillscop.io');
          if (peter1) peter1.role = 'Super Admin';
          else users.push({ email: 'peter@beverlyhillscop.io', name: 'Peter Schings', role: 'Super Admin' });

          const peter2 = users.find((u: any) => u.email === 'peterschings@gmail.com');
          if (peter2) peter2.role = 'Super Admin';
          else users.push({ email: 'peterschings@gmail.com', name: 'Peter Schings', role: 'Super Admin' });
          
          loadedAccessControl = { users };
        }

        set({
          envVars: mergedEnvVars,
          agentConfig: data.agentConfig || DEFAULT_AGENT_CONFIG,
          accessControl: loadedAccessControl,
          rolesConfig: data.rolesConfig || DEFAULT_ROLES_CONFIG,
        });
      }
    } catch (error) {
      console.error('Failed to load settings from localStorage:', error);
    }
  },

  saveToLocalStorage: () => {
    try {
      const { envVars, agentConfig, accessControl, rolesConfig } = get();
      localStorage.setItem('foreman-settings', JSON.stringify({ envVars, agentConfig, accessControl, rolesConfig }));
    } catch (error) {
      console.error('Failed to save settings to localStorage:', error);
    }
  },

  syncWithAPI: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        get().loadFromLocalStorage();
        return;
      }

      // Try to fetch from Supabase
      const { data: globalSettings, error: globalError } = await supabase
        .from('settings')
        .select('*');

      const { data: userSettings, error: userError } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', session.user.id);

      if (globalError || userError) {
        console.warn('Failed to fetch from Supabase, falling back to localStorage', globalError || userError);
        get().loadFromLocalStorage();
        return;
      }

      // Parse settings
      let newEnvVars = [...MOCK_ENV_VARS];
      let newAgentConfig = DEFAULT_AGENT_CONFIG;
      let newAccessControl = DEFAULT_ACCESS_CONTROL;
      let newRolesConfig = DEFAULT_ROLES_CONFIG;

      if (globalSettings) {
        const envVarsSetting = globalSettings.find(s => s.key === 'envVars');
        if (envVarsSetting) {
          const loadedEnvVars = envVarsSetting.value || [];
          loadedEnvVars.forEach((loadedVar: EnvVar) => {
            const index = newEnvVars.findIndex(v => v.key === loadedVar.key && !v.userEmail);
            if (index >= 0) {
              if (loadedVar.key === 'OPENROUTER_API_KEY' && (!loadedVar.value || loadedVar.value.includes('xxxxxxxx'))) {
                newEnvVars[index].value = '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';
              } else {
                newEnvVars[index] = loadedVar;
              }
            } else {
              newEnvVars.push(loadedVar);
            }
          });
        }

        const agentConfigSetting = globalSettings.find(s => s.key === 'agentConfig');
        if (agentConfigSetting) newAgentConfig = agentConfigSetting.value;

        const accessControlSetting = globalSettings.find(s => s.key === 'accessControl');
        if (accessControlSetting) newAccessControl = accessControlSetting.value;

        const rolesConfigSetting = globalSettings.find(s => s.key === 'rolesConfig');
        if (rolesConfigSetting) newRolesConfig = rolesConfigSetting.value;
      }

      if (userSettings) {
        const userEnvVarsSetting = userSettings.find(s => s.key === 'envVars');
        if (userEnvVarsSetting) {
          // Merge user env vars
          const userVars = userEnvVarsSetting.value;
          userVars.forEach((uv: EnvVar) => {
            const index = newEnvVars.findIndex(v => v.key === uv.key && v.userEmail === uv.userEmail);
            if (index >= 0) {
              newEnvVars[index] = uv;
            } else {
              newEnvVars.push(uv);
            }
          });
        }
      }

      set({
        envVars: newEnvVars,
        agentConfig: newAgentConfig,
        accessControl: newAccessControl,
        rolesConfig: newRolesConfig,
      });

      // Also save to local storage as backup
      get().saveToLocalStorage();
    } catch (error) {
      console.error('Error syncing with API:', error);
      get().loadFromLocalStorage();
    }
  },

  saveToAPI: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        get().saveToLocalStorage();
        return;
      }

      const { envVars, agentConfig, accessControl, rolesConfig } = get();

      // Separate global and user-specific env vars
      const globalEnvVars = envVars.filter(v => !v.userEmail);
      const userEnvVars = envVars.filter(v => v.userEmail === session.user.email);

      // Save global settings
      const globalUpdates = [
        { key: 'envVars', value: globalEnvVars },
        { key: 'agentConfig', value: agentConfig },
        { key: 'accessControl', value: accessControl },
        { key: 'rolesConfig', value: rolesConfig },
      ];

      for (const update of globalUpdates) {
        await supabase
          .from('settings')
          .upsert(update, { onConflict: 'key' });
      }

      // Save user settings
      if (userEnvVars.length > 0) {
        await supabase
          .from('user_settings')
          .upsert({
            user_id: session.user.id,
            key: 'envVars',
            value: userEnvVars
          }, { onConflict: 'user_id,key' });
      }

      // Also save to local storage as backup
      get().saveToLocalStorage();
    } catch (error) {
      console.error('Error saving to API:', error);
      get().saveToLocalStorage();
    }
  },
}));

