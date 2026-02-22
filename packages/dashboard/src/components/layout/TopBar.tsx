import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTerminalStore } from '../../stores/terminalStore';

export const TopBar = () => {
  const { agents, panels, maxAgents, restorePanel } = useTerminalStore();
  const [showHiddenPanels, setShowHiddenPanels] = useState(false);
  const location = useLocation();

  const activeCount = agents.filter(a => a.status === 'running').length;
  const hiddenPanels = panels.filter(p => p.isHidden);

  const navLinks = [
    { path: '/', label: 'Dashboard' },
    { path: '/kanban', label: 'Kanban' },
    { path: '/dags', label: 'DAGs' },
    { path: '/knowledge', label: 'Knowledge' },
    { path: '/settings', label: 'Settings' },
  ];

  return (
    <div className="h-12 min-h-[48px] max-h-[48px] bg-foreman-bg-dark border-b border-foreman-border flex items-center justify-between px-4">
      {/* Left: Logo and Navigation */}
      <div className="flex items-center gap-6">
        <div className="font-mono font-bold text-sm text-foreman-text tracking-widest">
          FOREMAN
        </div>

        {/* Navigation Links */}
        <nav className="flex items-center gap-1">
          {navLinks.map(({ path, label }) => (
            <Link
              key={path}
              to={path}
              className={`font-mono text-xs px-3 py-1 transition-colors ${
                location.pathname === path
                  ? 'text-foreman-orange border-b-2 border-foreman-orange'
                  : 'text-foreman-text hover:text-foreman-orange'
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>

      {/* Right: Agent Status and Hidden Panels */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-foreman-orange animate-pulse" />
          <span className="font-mono text-[11px] text-foreman-text">
            {activeCount}/{maxAgents} ACTIVE
          </span>
        </div>

        {/* Hidden Panels Dropdown */}
        {hiddenPanels.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setShowHiddenPanels(!showHiddenPanels)}
              className="bg-foreman-bg-medium border border-foreman-border text-foreman-text
                         font-sans text-xs px-3 py-1 hover:border-foreman-orange flex items-center gap-2"
            >
              <span>{hiddenPanels.length} Hidden</span>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showHiddenPanels && (
              <div className="absolute top-full mt-1 right-0 bg-foreman-bg-dark border border-foreman-border
                              min-w-[200px] z-50 shadow-lg">
                {hiddenPanels.map((panel) => {
                  const agent = agents.find(a => a.id === panel.agentId);
                  if (!agent) return null;

                  return (
                    <button
                      key={panel.id}
                      onClick={() => {
                        restorePanel(panel.id);
                        setShowHiddenPanels(false);
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-foreman-bg-medium border-b border-foreman-border
                                 last:border-b-0 flex items-center justify-between gap-2"
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="font-mono text-xs text-foreman-orange truncate">{agent.id}</span>
                        <span className="font-sans text-xs text-foreman-text opacity-70 truncate">{agent.taskTitle}</span>
                      </div>
                      <svg className="w-4 h-4 text-foreman-text flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

