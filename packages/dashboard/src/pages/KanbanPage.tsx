import { useEffect } from 'react';
import { KanbanTask } from '../types';
import { useKanbanStore } from '../stores/kanbanStore';
import { TaskDetailModal } from '../components/kanban/TaskDetailModal';

const COLUMNS = [
  { id: 'backlog', title: 'Backlog', color: '#666666' },
  { id: 'in-progress', title: 'In Progress', color: '#FF6B2B' },
  { id: 'review', title: 'Review', color: '#FFA500' },
  { id: 'commit-review', title: 'Commit Review', color: '#FF6B2B' },
  { id: 'done', title: 'Done', color: '#22C55E' },
] as const;

const TaskCard = ({ task, onClick }: { task: KanbanTask; onClick: () => void }) => {
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

  const isCommitReview = task.status === 'commit-review';

  return (
    <div
      className={`bg-foreman-bg-medium border border-foreman-border p-3 mb-2 hover:border-foreman-orange transition-colors cursor-pointer ${
        isCommitReview ? 'border-l-2 !border-l-[#FF6B2B]' : ''
      }`}
      onClick={onClick}
    >
      <div className="font-sans text-xs text-foreman-text mb-2">{task.title}</div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="font-mono text-[11px] px-2 py-0.5"
            style={{ backgroundColor: getProjectColor(task.project) + '20', color: getProjectColor(task.project) }}
          >
            {task.project}
          </span>
          <span className="font-mono text-[11px] text-foreman-text opacity-50">
            {task.agentId}
          </span>
        </div>
        <span className="font-mono text-[11px] text-foreman-text opacity-70">
          {task.elapsedTime}
        </span>
      </div>
      {isCommitReview && (
        <div className="mt-2 font-mono text-xs text-[#22C55E]">
          QC PASSED
        </div>
      )}
    </div>
  );
};

const KanbanColumn = ({ column, tasks, onTaskClick }: {
  column: typeof COLUMNS[number];
  tasks: KanbanTask[];
  onTaskClick: (task: KanbanTask) => void;
}) => {
  const isCommitReview = column.id === 'commit-review';

  return (
    <div className="flex-1 min-w-[280px] flex flex-col bg-foreman-bg-dark border border-foreman-border">
      <div className="bg-foreman-bg-medium border-b border-foreman-border p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isCommitReview && (
              <div className="w-2 h-2 rounded-full bg-[#FF6B2B]"></div>
            )}
            <h3 className="font-mono text-[11px] text-foreman-text font-semibold uppercase tracking-wide">
              {column.title}
            </h3>
          </div>
          <span className="font-mono text-[11px] text-foreman-text opacity-50 bg-foreman-bg-deep px-2 py-1">
            {tasks.length}
          </span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {tasks.length === 0 ? (
          <div className="text-center py-8">
            <div className="font-mono text-xs text-foreman-text opacity-30">
              No tasks yet
            </div>
          </div>
        ) : (
          tasks.map(task => (
            <TaskCard key={task.id} task={task} onClick={() => onTaskClick(task)} />
          ))
        )}
      </div>
    </div>
  );
};

export const KanbanPage = () => {
  const { tasks, isLoading, error, selectedTask, setSelectedTask, startPolling, stopPolling, fetchTasks } = useKanbanStore();

  // Start polling on mount, stop on unmount
  useEffect(() => {
    startPolling();
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  return (
    <div className="w-full h-full bg-foreman-bg-deep p-4 flex flex-col overflow-hidden">
      {/* Error banner at the top if there's an error */}
      {error && (
        <div className="bg-red-500 bg-opacity-10 border border-red-500 p-3 mb-4 flex items-center justify-between">
          <div>
            <div className="font-mono text-sm text-red-500 mb-1">
              Error loading tasks
            </div>
            <div className="font-mono text-xs text-foreman-text opacity-70">
              {error}
            </div>
          </div>
          <button
            onClick={() => fetchTasks()}
            className="font-mono text-xs bg-foreman-orange text-white px-4 py-2 hover:bg-opacity-80 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading indicator at the top if loading initial data */}
      {isLoading && tasks.length === 0 && !error && (
        <div className="bg-foreman-bg-medium border border-foreman-border p-3 mb-4 flex items-center justify-center">
          <div className="font-mono text-sm text-foreman-text opacity-70 mr-3">
            Loading tasks...
          </div>
          <div className="w-5 h-5 border-2 border-foreman-orange border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}

      {/* Always show the Kanban board with columns */}
      <div className="flex gap-4 flex-1 overflow-hidden">
        {COLUMNS.map(column => (
          <KanbanColumn
            key={column.id}
            column={column}
            tasks={tasks.filter(task => task.status === column.id)}
            onTaskClick={setSelectedTask}
          />
        ))}
      </div>

      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </div>
  );
};

