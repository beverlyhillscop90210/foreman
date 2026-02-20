import { Agent } from '../../types';
import { useEffect, useState } from 'react';

interface AgentTelemetryProps {
  agent: Agent;
}

export const AgentTelemetry = ({ agent }: AgentTelemetryProps) => {
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

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-foreman-bg-medium border border-foreman-border p-3 rounded">
        <div className="font-mono text-[10px] text-foreman-text opacity-50 uppercase tracking-wider mb-1">Status</div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${agent.status === 'running' ? 'bg-green-500' : agent.status === 'completed' ? 'bg-gray-500' : 'bg-red-500'}`} />
          <span className="font-sans text-sm text-foreman-text capitalize">{agent.status}</span>
        </div>
      </div>

      <div className="bg-foreman-bg-medium border border-foreman-border p-3 rounded">
        <div className="font-mono text-[10px] text-foreman-text opacity-50 uppercase tracking-wider mb-1">Runtime</div>
        <div className="font-mono text-sm text-foreman-text">{elapsedTime}</div>
      </div>

      <div className="bg-foreman-bg-medium border border-foreman-border p-3 rounded">
        <div className="font-mono text-[10px] text-foreman-text opacity-50 uppercase tracking-wider mb-1">Task</div>
        <div className="font-sans text-sm text-foreman-text">{agent.taskTitle}</div>
      </div>

      <div className="bg-foreman-bg-medium border border-foreman-border p-3 rounded">
        <div className="font-mono text-[10px] text-foreman-text opacity-50 uppercase tracking-wider mb-1">Agent Type</div>
        <div className="font-mono text-sm text-foreman-text">{agent.bucket}</div>
      </div>

      {/* Placeholder for future telemetry data */}
      <div className="bg-foreman-bg-medium border border-foreman-border p-3 rounded opacity-50">
        <div className="font-mono text-[10px] text-foreman-text uppercase tracking-wider mb-1">Tokens Used</div>
        <div className="font-mono text-sm text-foreman-text">N/A</div>
      </div>

      <div className="bg-foreman-bg-medium border border-foreman-border p-3 rounded opacity-50">
        <div className="font-mono text-[10px] text-foreman-text uppercase tracking-wider mb-1">Estimated Cost</div>
        <div className="font-mono text-sm text-foreman-text">N/A</div>
      </div>

      <div className="bg-foreman-bg-medium border border-foreman-border p-3 rounded opacity-50">
        <div className="font-mono text-[10px] text-foreman-text uppercase tracking-wider mb-1">Languages</div>
        <div className="font-mono text-sm text-foreman-text">N/A</div>
      </div>
    </div>
  );
};
