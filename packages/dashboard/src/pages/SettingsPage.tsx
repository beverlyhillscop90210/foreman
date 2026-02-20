import { useState, useEffect } from 'react';
import { useTerminalStore } from '../stores/terminalStore';
import { useSettingsStore, type EnvVar } from '../stores/settingsStore';
import { useToast, ToastContainer } from '../components/settings/Toast';
import { api } from '../lib/api';

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
      <td className="px-4 py-3 font-mono text-sm text-foreman-orange">{envVar.key}</td>
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
  const { envVars, agentConfig, addEnvVar, deleteEnvVar, setAgentConfig, saveToLocalStorage } = useSettingsStore();
  const [showAddForm, setShowAddForm] = useState(false);
  const toast = useToast();

  // Load settings on mount
  useEffect(() => {
    useSettingsStore.getState().loadFromLocalStorage();
  }, []);

  const handleAddVariable = (envVar: EnvVar) => {
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
      // Try to save to API first
      await api.getHealth(); // Test if API is available

      // If API is available, save all env vars
      for (const envVar of envVars) {
        await api.setConfig(envVar.key, {
          value: envVar.value,
          category: envVar.category,
          masked: envVar.masked,
        });
      }

      toast.success('Settings saved to API');
    } catch (error) {
      // Fallback to localStorage
      console.warn('API not available, saving to localStorage', error);
      saveToLocalStorage();
      toast.info('Settings saved locally');
    }

    // Also update terminal store with max agents
    setMaxAgents(agentConfig.maxConcurrentAgents);
  };

  return (
    <div className="w-full h-full bg-foreman-bg-deep p-4 overflow-y-auto">
      <ToastContainer />
      <div className="max-w-6xl mx-auto">
        {/* Environment Variables Section */}
        <section className="mb-6">
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
                {envVars.map((envVar) => (
                  <EnvVarRow
                    key={envVar.key}
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

          <div className="mt-3 flex justify-end">
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
        <section>
          <div className="mb-3">
            <h2 className="font-mono text-sm text-foreman-text font-medium mb-1">Agent Configuration</h2>
            <p className="font-sans text-xs text-foreman-text opacity-70">
              Configure default agent behavior and limits
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

              <div>
                <label className="block font-mono text-sm text-foreman-text mb-2">
                  Default Agent Type
                </label>
                <select
                  value={agentConfig.defaultAgentType}
                  onChange={(e) => setAgentConfig({ defaultAgentType: e.target.value })}
                  className="w-full bg-foreman-bg-medium border border-foreman-border text-foreman-text
                             font-mono text-sm px-3 py-2 focus:outline-none focus:border-foreman-orange"
                >
                  <option value="augment-agent">Augment Agent</option>
                  <option value="code-agent">Code Agent</option>
                  <option value="research-agent">Research Agent</option>
                  <option value="test-agent">Test Agent</option>
                </select>
                <p className="font-sans text-xs text-foreman-text opacity-50 mt-1">
                  Default agent type for new tasks
                </p>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                onClick={handleSaveConfiguration}
                className="bg-foreman-orange text-white font-sans text-xs px-4 py-2 hover:bg-opacity-90"
              >
                Save Configuration
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};


