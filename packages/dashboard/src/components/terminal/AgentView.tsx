import { useTerminalStore } from '../../stores/terminalStore';
import { TerminalPanel } from './TerminalPanel';
import { AgentTelemetry } from './AgentTelemetry';

export const AgentView = () => {
  const { agents, selectedProject, panels } = useTerminalStore();

  const selectedAgent = agents.find(a => a.id === selectedProject);
  const panel = panels.find(p => p.agentId === selectedProject);

  if (!selectedAgent) {
    return (
      <div className="w-full h-full bg-foreman-bg-deep flex items-center justify-center">
        <div className="text-center">
          <div className="font-mono text-foreman-text opacity-50 text-sm mb-2">
            Select an agent from the sidebar to view details.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-foreman-bg-deep flex overflow-hidden">
      {/* Terminal Section */}
      <div className="flex-1 border-r border-foreman-border p-4 flex flex-col">
        <h2 className="font-mono text-sm text-foreman-text font-bold mb-4">Terminal Output</h2>
        <div className="flex-1 relative">
          {panel ? (
            <TerminalPanel
              panelId={panel.id}
              agent={selectedAgent}
              isMaximized={false}
              isMinimized={false}
            />
          ) : (
            <div className="w-full h-full border border-foreman-border bg-foreman-bg-dark flex items-center justify-center">
              <span className="font-mono text-xs text-foreman-text opacity-50">Terminal not available</span>
            </div>
          )}
        </div>
      </div>

      {/* Telemetry Section */}
      <div className="w-[400px] p-4 flex flex-col bg-foreman-bg-dark overflow-y-auto">
        <h2 className="font-mono text-sm text-foreman-text font-bold mb-4">Telemetry</h2>
        <AgentTelemetry agent={selectedAgent} />
      </div>
    </div>
  );
};
