import { useState, useMemo } from 'react';
import { useTerminalStore } from '../../stores/terminalStore';

export const Sidebar = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { agents, selectedProject, setSelectedProject } = useTerminalStore();

  // Group agents by status
  const activeAgents = useMemo(() => agents.filter(a => a.status === 'running'), [agents]);
  const queuedAgents = useMemo(() => agents.filter(a => a.status === 'idle'), [agents]);
  const pastAgents = useMemo(() => agents.filter(a => a.status === 'completed' || a.status === 'failed'), [agents]);

  if (isCollapsed) {
    return (
      <div className="w-12 bg-foreman-bg-dark border-r border-foreman-border flex flex-col">
        <button
          onClick={() => setIsCollapsed(false)}
          className="h-12 flex items-center justify-center text-foreman-text hover:bg-foreman-bg-medium"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="w-[280px] bg-foreman-bg-dark border-r border-foreman-border flex flex-col">
      {/* Header */}
      <div className="h-12 border-b border-foreman-border flex items-center justify-between px-3">
        <span className="font-mono text-sm text-foreman-text font-bold">Agents</span>
        <button
          onClick={() => setIsCollapsed(true)}
          className="text-foreman-text hover:text-foreman-orange"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Active Agents */}
        <div className="px-3 py-2">
          <h3 className="font-mono text-xs text-foreman-text opacity-50 uppercase tracking-wider mb-2">Active</h3>
          {activeAgents.length === 0 ? (
            <div className="text-xs text-foreman-text opacity-30 italic px-2">No active agents</div>
          ) : (
            activeAgents.map((agent) => (
              <button
                key={agent.id}
                onClick={() => setSelectedProject(agent.id)}
                className={`w-full px-3 py-2 text-left rounded mb-1 hover:bg-foreman-bg-medium
                            ${selectedProject === agent.id ? 'bg-foreman-bg-medium border-l-2 border-l-foreman-orange' : ''}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-sans text-xs text-foreman-text font-medium truncate pr-2">{agent.taskTitle}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  <span className="font-mono text-[10px] text-foreman-text opacity-50 truncate">
                    {agent.bucket}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Queued Agents */}
        <div className="px-3 py-2 mt-4">
          <h3 className="font-mono text-xs text-foreman-text opacity-50 uppercase tracking-wider mb-2">Backlog</h3>
          {queuedAgents.length === 0 ? (
            <div className="text-xs text-foreman-text opacity-30 italic px-2">No queued tasks</div>
          ) : (
            queuedAgents.map((agent) => (
              <button
                key={agent.id}
                onClick={() => setSelectedProject(agent.id)}
                className={`w-full px-3 py-2 text-left rounded mb-1 hover:bg-foreman-bg-medium
                            ${selectedProject === agent.id ? 'bg-foreman-bg-medium border-l-2 border-l-foreman-orange' : ''}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-sans text-xs text-foreman-text font-medium truncate pr-2">{agent.taskTitle}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                  <span className="font-mono text-[10px] text-foreman-text opacity-50 truncate">
                    {agent.bucket}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Past Agents */}
        <div className="px-3 py-2 mt-4">
          <h3 className="font-mono text-xs text-foreman-text opacity-50 uppercase tracking-wider mb-2">History</h3>
          {pastAgents.length === 0 ? (
            <div className="text-xs text-foreman-text opacity-30 italic px-2">No past agents</div>
          ) : (
            pastAgents.map((agent) => (
              <button
                key={agent.id}
                onClick={() => setSelectedProject(agent.id)}
                className={`w-full px-3 py-2 text-left rounded mb-1 hover:bg-foreman-bg-medium
                            ${selectedProject === agent.id ? 'bg-foreman-bg-medium border-l-2 border-l-foreman-orange' : ''}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-sans text-xs text-foreman-text font-medium truncate pr-2">{agent.taskTitle}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${agent.status === 'completed' ? 'bg-gray-500' : 'bg-red-500'}`} />
                  <span className="font-mono text-[10px] text-foreman-text opacity-50 truncate">
                    {agent.bucket}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

