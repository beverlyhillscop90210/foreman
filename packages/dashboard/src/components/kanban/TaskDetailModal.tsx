import { useEffect } from 'react';
import { KanbanTask } from '../../types';

interface TaskDetailModalProps {
  task: KanbanTask;
  onClose: () => void;
}

export const TaskDetailModal = ({ task, onClose }: TaskDetailModalProps) => {
  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const getProjectColor = (project: string) => {
    const colors: Record<string, string> = {
      'Zeon': '#FF6B2B',
      'Isaac Lab': '#3B82F6',
      'Research': '#8B5CF6',
      'Trading': '#10B981',
      'Meta': '#F59E0B',
    };
    return colors[project] || '#666666';
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'backlog': '#666666',
      'in-progress': '#FF6B2B',
      'review': '#FFA500',
      'done': '#22C55E',
    };
    return colors[status] || '#666666';
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="bg-[#111] border border-[#333] max-w-[800px] w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-[#111] border-b border-[#333] p-4 flex items-start justify-between">
          <div className="flex-1">
            <h2 className="font-sans text-xl text-foreman-text mb-2">{task.title}</h2>
            <div className="flex items-center gap-2">
              <span 
                className="font-mono text-xs px-2 py-1"
                style={{ backgroundColor: getProjectColor(task.project) + '20', color: getProjectColor(task.project) }}
              >
                {task.project}
              </span>
              <span 
                className="font-mono text-xs px-2 py-1"
                style={{ backgroundColor: getStatusColor(task.status) + '20', color: getStatusColor(task.status) }}
              >
                {task.status}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-foreman-text hover:text-foreman-orange transition-colors text-2xl leading-none ml-4"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Agent Info */}
          <div className="bg-foreman-bg-medium border border-foreman-border p-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="font-mono text-xs text-foreman-text opacity-50 mb-1">Agent</div>
                <div className="font-mono text-sm text-foreman-text">{task.agentId}</div>
              </div>
              <div>
                <div className="font-mono text-xs text-foreman-text opacity-50 mb-1">Runtime</div>
                <div className="font-mono text-sm text-foreman-text">{task.elapsedTime}</div>
              </div>
              {task.role && (
                <div>
                  <div className="font-mono text-xs text-foreman-text opacity-50 mb-1">Role</div>
                  <div className="font-mono text-sm text-foreman-orange">{task.role}</div>
                </div>
              )}
              {task.model && (
                <div>
                  <div className="font-mono text-xs text-foreman-text opacity-50 mb-1">Model</div>
                  <div className="font-mono text-sm text-foreman-orange">{task.model}</div>
                </div>
              )}
            </div>
          </div>

          {/* Briefing Section */}
          <div>
            <h3 className="font-mono text-sm text-foreman-orange mb-2">Briefing</h3>
            <div className="bg-foreman-bg-medium border border-foreman-border p-4">
              <pre className="font-mono text-xs text-foreman-text whitespace-pre-wrap">
                {task.briefing || 'No briefing available'}
              </pre>
            </div>
          </div>

          {/* Agent Log Section */}
          <div>
            <h3 className="font-mono text-sm text-foreman-orange mb-2">Agent Log</h3>
            <div className="bg-foreman-bg-deep border border-foreman-border p-4 max-h-[300px] overflow-y-auto">
              <pre className="font-mono text-xs text-foreman-text whitespace-pre-wrap">
                {task.agentLog || 'No log output available'}
              </pre>
            </div>
          </div>

          {/* Files Changed Section */}
          <div>
            <h3 className="font-mono text-sm text-foreman-orange mb-2">Files Changed</h3>
            <div className="bg-foreman-bg-medium border border-foreman-border p-4">
              {task.filesChanged && task.filesChanged.length > 0 ? (
                <ul className="space-y-1">
                  {task.filesChanged.map((file, index) => (
                    <li key={index} className="font-mono text-xs text-foreman-text">
                      <span className="text-foreman-orange mr-2">M</span>
                      {file}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="font-mono text-xs text-foreman-text opacity-50">No files changed</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

