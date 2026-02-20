import { useEffect, useRef, useState } from 'react';
import { useTerminalStore } from '../../stores/terminalStore';
import { TerminalPanel } from './TerminalPanel';

export const TerminalGrid = () => {
  const {
    agents,
    panels,
    updatePanel,
    selectedProject,
    isInitialized,
// isLoading removed - unused
// errorMessage removed - unused
// retry removed - unused
// maxAgents removed - unused
  } = useTerminalStore();
  const gridRef = useRef<HTMLDivElement>(null);
  const [resizing, setResizing] = useState<{ panelId: string; edge: 'right' | 'bottom' } | null>(null);

  const handleMouseDown = (panelId: string, edge: 'right' | 'bottom') => {
    setResizing({ panelId, edge });
  };

  useEffect(() => {
    if (!resizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!gridRef.current) return;
      
      const panel = panels.find(p => p.id === resizing.panelId);
      if (!panel) return;

      const rect = gridRef.current.getBoundingClientRect();
      
      if (resizing.edge === 'right') {
        const newWidth = Math.max(300, Math.min(e.clientX - rect.left - panel.position.x, rect.width - panel.position.x));
        updatePanel(resizing.panelId, {
          position: { ...panel.position, width: newWidth }
        });
      } else {
        const newHeight = Math.max(200, Math.min(e.clientY - rect.top - panel.position.y, rect.height - panel.position.y));
        updatePanel(resizing.panelId, {
          position: { ...panel.position, height: newHeight }
        });
      }
    };

    const handleMouseUp = () => {
      setResizing(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizing, panels, updatePanel]);

  // Show empty state if no agents

  return (
    <div ref={gridRef} className="w-full h-full bg-foreman-bg-deep relative p-3 overflow-hidden">
      {isInitialized && agents.length === 0 && (
        <div className="w-full h-full flex items-center justify-center">
          <div className="text-center">
            <div className="font-mono text-foreman-text opacity-50 text-xs mb-2">
              No active agents. Tasks will appear here when agents are running.
            </div>
          </div>
        </div>
      )}

      {panels.filter(p => !p.isHidden).map((panel) => {
        const agent = agents.find(a => a.id === panel.agentId);
        if (!agent) return null;

        // Filter by selected project
        if (selectedProject && agent.bucket !== selectedProject) return null;

        if (panel.isMaximized) {
          return (
            <TerminalPanel
              key={panel.id}
              panelId={panel.id}
              agent={agent}
              isMaximized={true}
              isMinimized={false}
            />
          );
        }

        return (
          <div
            key={panel.id}
            className="absolute"
            style={{
              left: panel.position.x,
              top: panel.position.y,
              width: panel.position.width,
              height: panel.isMinimized ? 40 : panel.position.height,
            }}
          >
            <TerminalPanel
              panelId={panel.id}
              agent={agent}
              isMaximized={false}
              isMinimized={panel.isMinimized}
            />

            {/* Resize handles */}
            {!panel.isMinimized && (
              <>
                <div
                  className="absolute right-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-foreman-orange"
                  onMouseDown={() => handleMouseDown(panel.id, 'right')}
                />
                <div
                  className="absolute left-0 right-0 bottom-0 h-1 cursor-ns-resize hover:bg-foreman-orange"
                  onMouseDown={() => handleMouseDown(panel.id, 'bottom')}
                />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
};

