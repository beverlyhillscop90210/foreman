import { useEffect, useState } from 'react';
import { useTerminalStore } from '../../stores/terminalStore';
import { TerminalOutput } from './TerminalOutput';
import { Agent } from '../../types';

interface TerminalPanelProps {
  panelId: string;
  agent: Agent;
  isMaximized: boolean;
  isMinimized: boolean;
}

export const TerminalPanel = ({ panelId, agent, isMaximized, isMinimized }: TerminalPanelProps) => {
  const { toggleMinimize, toggleMaximize, hidePanel } = useTerminalStore();
  const [elapsedTime, setElapsedTime] = useState('00:00');

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - agent.startTime) / 1000);
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      setElapsedTime(`${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
    }, 1000);

    return () => clearInterval(interval);
  }, [agent.startTime]);

  const getStatusColor = (status: Agent['status']) => {
    switch (status) {
      case 'running':
        return 'bg-green-500';
      case 'completed':
        return 'bg-gray-500';
      case 'failed':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getAgentTypeBadge = () => {
    // Extract agent type from bucket or use default
    return agent.bucket || 'agent';
  };

  return (
    <div className={`flex flex-col bg-foreman-bg-dark border border-foreman-border h-full
                     ${isMaximized ? 'fixed inset-0 z-50' : ''}`}>
      {/* Header */}
      <div className="h-10 bg-foreman-bg-medium border-b border-foreman-border flex items-center justify-between px-3 flex-shrink-0">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span className="font-sans text-xs text-foreman-text truncate">
            {agent.taskTitle}
          </span>
          <span className="font-mono text-[11px] text-foreman-text opacity-50 px-2 py-0.5 bg-foreman-bg-deep">
            {getAgentTypeBadge()}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] text-foreman-text opacity-70">
            {elapsedTime}
          </span>
          <div className={`w-2 h-2 rounded-full ${getStatusColor(agent.status)}`}
               title={agent.status} />

          {/* Controls */}
          <div className="flex items-center gap-1 ml-2">
            <button
              onClick={() => toggleMinimize(panelId)}
              className="text-foreman-text hover:text-foreman-orange p-1"
              title="Minimize"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              </svg>
            </button>
            <button
              onClick={() => toggleMaximize(panelId)}
              className="text-foreman-text hover:text-foreman-orange p-1"
              title="Maximize"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </button>
            <button
              onClick={() => hidePanel(panelId)}
              className="text-foreman-text hover:text-red-500 p-1"
              title="Close"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      {!isMinimized && (
        <div className="flex-1 overflow-y-auto min-h-0">
          {agent.status === 'running' && agent.output.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="flex items-center gap-2 text-foreman-text opacity-50">
                <div className="w-2 h-2 bg-foreman-orange rounded-full animate-pulse" />
                <span className="font-mono text-xs">Agent working...</span>
              </div>
            </div>
          ) : (
            <TerminalOutput lines={agent.output} status={agent.status} />
          )}
        </div>
      )}
    </div>
  );
};

