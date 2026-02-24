import { useState, useEffect } from 'react';
import { useTerminalStore } from '../stores/terminalStore';
import { useSettingsStore, type EnvVar } from '../stores/settingsStore';
import { useToast, ToastContainer } from '../components/settings/Toast';
import { api } from '../lib/api';
import { supabase } from '../lib/supabase';

interface EnvVarRowProps {
  envVar: EnvVar;
  // onEdit removed - unused
  onDelete: (key: string) => void;
}

const EnvVarRow = ({ envVar, onDelete }: EnvVarRowProps) => {
  const [revealed, setRevealed] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(envVar.value);
  const updateEnvVar = useSettingsStore(state => state.updateEnvVar);
  const toast = useToast();

  const handleSave = () => {
    updateEnvVar(envVar.key, { value: editValue });
    setIsEditing(false);
    toast.success('Variable updated');
  };

  const handleCancel = () => {
    setEditValue(envVar.value);
    setIsEditing(false);
  };

  const handleDelete = () => {
    if (confirm(`Delete ${envVar.key}?`)) {
      onDelete(envVar.key);
    }
  };

  return (
    <tr className="border-b border-foreman-border hover:bg-foreman-bg-medium">
      <td className="px-4 py-3 font-mono text-sm text-foreman-orange">
        {envVar.key}
        {envVar.userEmail && (
          <span className="ml-2 text-xs text-foreman-text opacity-50 bg-foreman-bg-dark px-1 py-0.5 rounded">
            {envVar.userEmail}
          </span>
        )}
      </td>
      <td className="px-4 py-3 font-mono text-sm text-foreman-text">
        {isEditing ? (
          <input
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="w-full bg-foreman-bg-deep border border-foreman-orange text-foreman-text
                       font-mono text-sm px-2 py-1 focus:outline-none"
          />
        ) : (
          revealed ? envVar.value : '•'.repeat(40)
        )}
      </td>
      <td className="px-4 py-3 font-sans text-sm text-foreman-text opacity-70">{envVar.category}</td>
      <td className="px-4 py-3">
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <button
                onClick={handleSave}
                className="bg-green-600 border border-green-700 text-white
                           font-sans text-xs px-3 py-1 hover:bg-green-700"
              >
                Save
              </button>
              <button
                onClick={handleCancel}
                className="bg-foreman-bg-medium border border-foreman-border text-foreman-text
                           font-sans text-xs px-3 py-1 hover:border-foreman-orange"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setRevealed(!revealed)}
                className="bg-foreman-bg-medium border border-foreman-border text-foreman-text
                           font-sans text-xs px-3 py-1 hover:border-foreman-orange"
              >
                {revealed ? 'Hide' : 'Reveal'}
              </button>
              <button
                onClick={() => setIsEditing(true)}
                className="bg-foreman-bg-medium border border-foreman-border text-foreman-text
                           font-sans text-xs px-3 py-1 hover:border-foreman-orange"
              >
                Edit
              </button>
              <button
                onClick={handleDelete}
                className="bg-red-600 border border-red-700 text-white
                           font-sans text-xs px-3 py-1 hover:bg-red-700"
                title="Delete"
              >
                🗑
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
};

const AddVariableForm = ({ onAdd, onCancel }: { onAdd: (envVar: EnvVar) => void; onCancel: () => void }) => {
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [category, setCategory] = useState('Configuration');

  const handleSubmit = () => {
    if (!key || !value) {
      alert('Key and Value are required');
      return;
    }
    onAdd({ key, value, category, masked: true });
    setKey('');
    setValue('');
    setCategory('Configuration');
  };

  return (
    <tr className="bg-foreman-bg-medium border-t-2 border-foreman-orange">
      <td className="px-4 py-3">
        <input
          type="text"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="KEY_NAME"
          className="w-full bg-foreman-bg-deep border border-foreman-border text-foreman-text
                     font-mono text-sm px-2 py-1 focus:outline-none focus:border-foreman-orange"
        />
      </td>
      <td className="px-4 py-3">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="value"
          className="w-full bg-foreman-bg-deep border border-foreman-border text-foreman-text
                     font-mono text-sm px-2 py-1 focus:outline-none focus:border-foreman-orange"
        />
      </td>
      <td className="px-4 py-3">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full bg-foreman-bg-deep border border-foreman-border text-foreman-text
                     font-sans text-sm px-2 py-1 focus:outline-none focus:border-foreman-orange"
        >
          <option value="Authentication">Authentication</option>
          <option value="API Keys">API Keys</option>
          <option value="Configuration">Configuration</option>
        </select>
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-2">
          <button
            onClick={handleSubmit}
            className="bg-foreman-orange text-white font-sans text-xs px-3 py-1 hover:bg-opacity-90"
          >
            Add
          </button>
          <button
            onClick={onCancel}
            className="bg-foreman-bg-medium border border-foreman-border text-foreman-text
                       font-sans text-xs px-3 py-1 hover:border-foreman-orange"
          >
            Cancel
          </button>
        </div>
      </td>
    </tr>
  );
};

export const SettingsPage = () => {
  const { setMaxAgents } = useTerminalStore();
  const { envVars, agentConfig, accessControl, rolesConfig, addEnvVar, deleteEnvVar, setAgentConfig, setAccessControl, updateRoleConfig } = useSettingsStore();
  const [showAddForm, setShowAddForm] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [openRouterModels, setOpenRouterModels] = useState<{id: string, name: string}[]>([]);
  const [ollamaModels, setOllamaModels] = useState<{name: string, size: number}[]>([]);
  const toast = useToast();

  // Load settings on mount
  useEffect(() => {
    useSettingsStore.getState().syncWithAPI();
    
    // Get current user
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email) {
        setCurrentUserEmail(session.user.email);
      }
    });

    // Fetch OpenRouter models
    fetch('https://openrouter.ai/api/v1/models')
      .then(res => res.json())
      .then(data => {
        if (data.data) {
          const models = data.data.map((m: any) => ({ id: m.id, name: m.name }));
          setOpenRouterModels(models);
        }
      })
      .catch(err => console.error('Failed to fetch OpenRouter models:', err));

    // Fetch Ollama models directly from local Ollama instance
    fetch('http://localhost:11434/api/tags')
      .then(res => res.json())
      .then(data => {
        if (data.models) setOllamaModels(data.models.map((m: any) => ({ name: m.name, size: m.size })));
      })
      .catch(err => console.error('Failed to fetch local Ollama models:', err));
  }, []);

  // Determine user role
  const currentUserRole = currentUserEmail 
    ? accessControl.users?.find(u => u.email === currentUserEmail)?.role || 'User'
    : 'User';
  
  const isAdmin = !currentUserEmail || currentUserRole === 'Super Admin' || currentUserRole === 'Admin';

  // Filter env vars based on role
  // Admins see everything. Users only see their own keys.
  const visibleEnvVars = envVars.filter(envVar => {
    if (isAdmin) return true;
    return envVar.userEmail === currentUserEmail;
  });

  const handleAddVariable = (envVar: EnvVar) => {
    // If not admin, automatically assign the key to the current user
    if (!isAdmin && currentUserEmail) {
      envVar.userEmail = currentUserEmail;
    }
    addEnvVar(envVar);
    setShowAddForm(false);
    toast.success('Variable added');
  };

  const handleDeleteVariable = (key: string) => {
    deleteEnvVar(key);
    toast.success('Variable deleted');
  };

  const handleSaveConfiguration = async () => {
    try {
      // Save to Supabase first
      await useSettingsStore.getState().saveToAPI();
      
      // Try to save to Bridge API
      try {
        await api.getHealth(); // Test if API is available

        // Merge keys: start with global keys, then override with user's keys
        const globalKeys = envVars.filter(v => !v.userEmail);
        const userKeys = envVars.filter(v => v.userEmail === currentUserEmail);
        
        const mergedKeys = [...globalKeys];
        userKeys.forEach(uk => {
          const index = mergedKeys.findIndex(gk => gk.key === uk.key);
          if (index >= 0) {
            mergedKeys[index] = uk;
          } else {
            mergedKeys.push(uk);
          }
        });

        // If API is available, save merged env vars
        for (const envVar of mergedKeys) {
          await api.setConfig(envVar.key, {
            value: envVar.value,
            category: envVar.category,
            masked: envVar.masked,
          });
        }
        toast.success('Settings saved to Supabase and Bridge API');
      } catch (apiError) {
        console.warn('Bridge API not available, but saved to Supabase', apiError);
        toast.success('Settings saved to Supabase (Bridge API offline)');
      }
    } catch (error) {
      console.error('Failed to save settings', error);
      toast.error('Failed to save settings');
    }

    // Also update terminal store with max agents
    setMaxAgents(agentConfig.maxConcurrentAgents);
  };

  return (
    <div className="w-full h-full bg-foreman-bg-deep p-4 overflow-y-auto">
      <ToastContainer />
      <div className="max-w-6xl mx-auto">
        {/* Environment Variables Section */}
        <section className="mb-8">
          <div className="mb-3">
            <h2 className="font-mono text-sm text-foreman-text font-medium mb-1">Environment Variables</h2>
            <p className="font-sans text-xs text-foreman-text opacity-70">
              Manage API keys and configuration values
            </p>
          </div>

          <div className="bg-foreman-bg-dark border border-foreman-border overflow-hidden">
            <table className="w-full">
              <thead className="bg-foreman-bg-medium">
                <tr>
                  <th className="px-4 py-3 text-left font-mono text-xs text-foreman-text uppercase tracking-wider">Key</th>
                  <th className="px-4 py-3 text-left font-mono text-xs text-foreman-text uppercase tracking-wider">Value</th>
                  <th className="px-4 py-3 text-left font-mono text-xs text-foreman-text uppercase tracking-wider">Category</th>
                  <th className="px-4 py-3 text-left font-mono text-xs text-foreman-text uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleEnvVars.map((envVar) => (
                  <EnvVarRow
                    key={envVar.key + (envVar.userEmail || '')}
                    envVar={envVar}
                    onDelete={handleDeleteVariable}
                  />
                ))}
                {showAddForm && (
                  <AddVariableForm
                    onAdd={handleAddVariable}
                    onCancel={() => setShowAddForm(false)}
                  />
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex justify-end gap-2">
            <button
              onClick={handleSaveConfiguration}
              className="bg-foreman-bg-medium border border-foreman-border text-foreman-text font-sans text-sm px-4 py-2 hover:border-foreman-orange"
            >
              Sync to Bridge API
            </button>
            <button
              onClick={() => setShowAddForm(true)}
              disabled={showAddForm}
              className="bg-foreman-orange text-white font-sans text-sm px-4 py-2 hover:bg-opacity-90
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              + Add Variable
            </button>
          </div>
        </section>

        {/* Agent Configuration Section */}
        <section className="mb-8">
          <div className="mb-3">
            <h2 className="font-mono text-sm text-foreman-text font-medium mb-1">Agent Configuration</h2>
            <p className="font-sans text-xs text-foreman-text opacity-70">
              Global settings for agent behavior and limits
            </p>
          </div>

            <div className="bg-foreman-bg-dark border border-foreman-border p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-mono text-sm text-foreman-text mb-2">
                    Max Concurrent Agents
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={agentConfig.maxConcurrentAgents}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 1;
                      setAgentConfig({ maxConcurrentAgents: Math.min(10, Math.max(1, val)) });
                    }}
                    className="w-full bg-foreman-bg-medium border border-foreman-border text-foreman-text
                               font-mono text-sm px-3 py-2 focus:outline-none focus:border-foreman-orange"
                  />
                  <p className="font-sans text-xs text-foreman-text opacity-50 mt-1">
                    Maximum number of agents that can run simultaneously (1-10)
                  </p>
                </div>

                <div>
                  <label className="block font-mono text-sm text-foreman-text mb-2">
                    Default Max Turns
                  </label>
                  <input
                    type="number"
                    min="10"
                    max="1000"
                    value={agentConfig.defaultMaxTurns}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 10;
                      setAgentConfig({ defaultMaxTurns: Math.min(1000, Math.max(10, val)) });
                    }}
                    className="w-full bg-foreman-bg-medium border border-foreman-border text-foreman-text
                               font-mono text-sm px-3 py-2 focus:outline-none focus:border-foreman-orange"
                  />
                  <p className="font-sans text-xs text-foreman-text opacity-50 mt-1">
                    Default maximum turns per agent execution (10-1000)
                  </p>
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  onClick={handleSaveConfiguration}
                  className="bg-foreman-orange text-white font-sans text-xs px-4 py-2 hover:bg-opacity-90"
                >
                  Sync to Bridge API
                </button>
              </div>
            </div>
        </section>

        {/* Access Control Section */}
        <section className="mb-8">
          <div className="mb-3">
            <h2 className="font-mono text-sm text-foreman-text font-medium mb-1">Access Control</h2>
            <p className="font-sans text-xs text-foreman-text opacity-70">
              Manage who can access the dashboard and who has admin rights
            </p>
          </div>

            <div className="bg-foreman-bg-dark border border-foreman-border overflow-hidden">
              <table className="w-full">
                <thead className="bg-foreman-bg-medium">
                  <tr>
                    <th className="px-4 py-3 text-left font-mono text-xs text-foreman-text uppercase tracking-wider">Name</th>
                    <th className="px-4 py-3 text-left font-mono text-xs text-foreman-text uppercase tracking-wider">Email</th>
                    <th className="px-4 py-3 text-left font-mono text-xs text-foreman-text uppercase tracking-wider">Role</th>
                    <th className="px-4 py-3 text-left font-mono text-xs text-foreman-text uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {accessControl.users?.map((user, index) => (
                    <tr key={index} className="border-b border-foreman-border hover:bg-foreman-bg-medium">
                      <td className="px-4 py-3 font-sans text-sm text-foreman-text">{user.name}</td>
                      <td className="px-4 py-3 font-mono text-sm text-foreman-text">{user.email}</td>
                      <td className="px-4 py-3 font-sans text-sm text-foreman-text">
                        <select
                          value={user.role}
                          onChange={(e) => {
                            const newUsers = [...accessControl.users];
                            newUsers[index].role = e.target.value as any;
                            setAccessControl({ users: newUsers });
                          }}
                          disabled={user.role === 'Super Admin'}
                          className="bg-foreman-bg-deep border border-foreman-border text-foreman-text
                                     font-sans text-sm px-2 py-1 focus:outline-none focus:border-foreman-orange
                                     disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <option value="Super Admin">Super Admin</option>
                          <option value="Admin">Admin</option>
                          <option value="User">User</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => {
                            if (user.role === 'Super Admin') {
                              alert('Cannot delete Super Admin');
                              return;
                            }
                            if (confirm(`Delete user ${user.email}?`)) {
                              const newUsers = accessControl.users.filter((_, i) => i !== index);
                              setAccessControl({ users: newUsers });
                            }
                          }}
                          disabled={user.role === 'Super Admin'}
                          className="bg-red-600 border border-red-700 text-white
                                     font-sans text-xs px-3 py-1 hover:bg-red-700
                                     disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Delete"
                        >
                          🗑
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-foreman-bg-medium border-t-2 border-foreman-orange">
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        id="newUserName"
                        placeholder="Name"
                        className="w-full bg-foreman-bg-deep border border-foreman-border text-foreman-text
                                   font-sans text-sm px-2 py-1 focus:outline-none focus:border-foreman-orange"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="email"
                        id="newUserEmail"
                        placeholder="email@example.com"
                        className="w-full bg-foreman-bg-deep border border-foreman-border text-foreman-text
                                   font-mono text-sm px-2 py-1 focus:outline-none focus:border-foreman-orange"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <select
                        id="newUserRole"
                        className="w-full bg-foreman-bg-deep border border-foreman-border text-foreman-text
                                   font-sans text-sm px-2 py-1 focus:outline-none focus:border-foreman-orange"
                      >
                        <option value="User">User</option>
                        <option value="Admin">Admin</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => {
                          const nameInput = document.getElementById('newUserName') as HTMLInputElement;
                          const emailInput = document.getElementById('newUserEmail') as HTMLInputElement;
                          const roleInput = document.getElementById('newUserRole') as HTMLSelectElement;
                          
                          if (!nameInput.value || !emailInput.value) {
                            alert('Name and Email are required');
                            return;
                          }
                          
                          const newUsers = [...(accessControl.users || []), {
                            name: nameInput.value,
                            email: emailInput.value,
                            role: roleInput.value as any
                          }];
                          
                          setAccessControl({ users: newUsers });
                          nameInput.value = '';
                          emailInput.value = '';
                          roleInput.value = 'User';
                        }}
                        className="bg-foreman-orange text-white font-sans text-xs px-3 py-1 hover:bg-opacity-90"
                      >
                        Add User
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
        </section>

        {/* Role Configuration Section */}
        <section className="mb-8">
          <div className="mb-3">
            <h2 className="font-mono text-sm text-foreman-text font-medium mb-1">Role Configuration</h2>
            <p className="font-sans text-xs text-foreman-text opacity-70">
              Configure the model and system prompt for each agent role
            </p>
            </div>

            <div className="space-y-4">
              {rolesConfig.map((role) => (
                <div key={role.id} className="bg-foreman-bg-dark border border-foreman-border p-4">
                  <h3 className="font-mono text-sm text-foreman-orange mb-3">{role.name}</h3>
                  
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="block font-mono text-sm text-foreman-text mb-2">
                        Model
                      </label>
                      <select
                        value={role.model}
                        onChange={(e) => updateRoleConfig(role.id, { model: e.target.value })}
                        className="w-full bg-foreman-bg-medium border border-foreman-border text-foreman-text
                                   font-mono text-sm px-3 py-2 focus:outline-none focus:border-foreman-orange"
                      >
                        {ollamaModels.length > 0 && (
                          <optgroup label="Ollama (Local)">
                            {ollamaModels.map((m) => (
                              <option key={`ollama-${m.name}`} value={`ollama:${m.name}`}>
                                {m.name}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        <optgroup label="Anthropic">
                          <option value="claude-3-5-sonnet-20241022">claude-3-5-sonnet-20241022</option>
                          <option value="claude-3-5-haiku-20241022">claude-3-5-haiku-20241022</option>
                        </optgroup>
                        <optgroup label="OpenAI">
                          <option value="gpt-4o">gpt-4o</option>
                          <option value="gpt-4o-mini">gpt-4o-mini</option>
                        </optgroup>
                        <optgroup label="OpenRouter">
                          {openRouterModels.length > 0 ? (
                            openRouterModels.map(m => (
                              <option key={m.id} value={m.id}>{m.name} ({m.id})</option>
                            ))
                          ) : (
                            <>
                              <option value="anthropic/claude-3.5-sonnet">anthropic/claude-3.5-sonnet</option>
                              <option value="openai/gpt-4o">openai/gpt-4o</option>
                              <option value="google/gemini-1.5-pro">google/gemini-1.5-pro</option>
                              <option value="meta-llama/llama-3.1-405b-instruct">meta-llama/llama-3.1-405b-instruct</option>
                            </>
                          )}
                        </optgroup>
                      </select>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="block font-mono text-sm text-foreman-text">
                          System Prompt
                        </label>
                        <select
                          value={role.activePromptUserEmail || currentUserEmail || ''}
                          onChange={(e) => updateRoleConfig(role.id, { activePromptUserEmail: e.target.value })}
                          className="bg-foreman-bg-deep border border-foreman-border text-foreman-text
                                     font-sans text-xs px-2 py-1 focus:outline-none focus:border-foreman-orange"
                        >
                          {role.systemPrompts?.map(p => (
                            <option key={p.userEmail} value={p.userEmail}>
                              {p.userName} ({p.userEmail})
                            </option>
                          ))}
                          {(!role.systemPrompts?.find(p => p.userEmail === currentUserEmail) && currentUserEmail) && (
                            <option value={currentUserEmail}>
                              My Prompt (New)
                            </option>
                          )}
                        </select>
                      </div>
                      <textarea
                        value={role.systemPrompts?.find(p => p.userEmail === role.activePromptUserEmail)?.prompt || ''}
                        onChange={(e) => {
                          const newPrompts = [...(role.systemPrompts || [])];
                          const promptIndex = newPrompts.findIndex(p => p.userEmail === currentUserEmail);
                          
                          if (promptIndex >= 0) {
                            newPrompts[promptIndex].prompt = e.target.value;
                          } else if (currentUserEmail) {
                            newPrompts.push({
                              userEmail: currentUserEmail,
                              userName: accessControl.users?.find(u => u.email === currentUserEmail)?.name || 'Unknown',
                              prompt: e.target.value
                            });
                          }
                          
                          updateRoleConfig(role.id, { 
                            systemPrompts: newPrompts,
                            activePromptUserEmail: currentUserEmail || role.activePromptUserEmail
                          });
                        }}
                        disabled={role.activePromptUserEmail !== currentUserEmail}
                        rows={4}
                        className={`w-full bg-foreman-bg-medium border border-foreman-border text-foreman-text
                                   font-mono text-sm px-3 py-2 focus:outline-none focus:border-foreman-orange
                                   ${role.activePromptUserEmail !== currentUserEmail ? 'opacity-50 cursor-not-allowed' : ''}`}
                        placeholder="Enter the system prompt for this role..."
                      />
                      {role.activePromptUserEmail !== currentUserEmail && (
                        <p className="text-xs text-foreman-text opacity-70 mt-1">
                          You are viewing another user's prompt. Switch to your prompt to edit.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
        </section>
      </div>
    </div>
  );
};


