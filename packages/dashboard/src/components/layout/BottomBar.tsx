import { useTerminalStore } from '../../stores/terminalStore';
import { useEffect, useState } from 'react';

export const BottomBar = () => {
  const agents = useTerminalStore((state) => state.agents);
  const [lastActivity, setLastActivity] = useState(new Date());

  useEffect(() => {
    setLastActivity(new Date());
  }, [agents]);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { hour12: false });
  };

  return (
    <div className="h-8 min-h-[32px] max-h-[32px] bg-foreman-bg-dark border-t border-foreman-border flex items-center justify-between px-4 text-[11px] font-mono">
      {/* Left: Connection Status */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
          <span className="text-foreman-text">Connected</span>
        </div>
        <span className="text-foreman-border">|</span>
        <span className="text-foreman-text opacity-70">master</span>
      </div>

      {/* Right: Stats */}
      <div className="flex items-center gap-3">
        <span className="text-foreman-text opacity-70">
          Last activity: {formatTime(lastActivity)}
        </span>
        <span className="text-foreman-border">|</span>
        <span className="text-foreman-text">
          {agents.length} agent{agents.length !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );
};

