import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useDagStore, type Dag } from '../stores/dagStore';
import { DagFlowGraph, NodeDetailPanel } from '../components/dag/DagFlowGraph';
import { PlannerDialog } from '../components/dag/PlannerDialog';
import { wsClient } from '../lib/ws';
import { api, type Task } from '../lib/api';

// ── DAG List Sidebar ───────────────────────────────────────────

function DagListItem({ dag, isSelected }: { dag: Dag; isSelected: boolean }) {
  const selectDag = useDagStore(s => s.selectDag);

  const statusColor =
    dag.status === 'completed' ? '#22c55e' :
    dag.status === 'running'   ? '#3b82f6' :
    dag.status === 'failed'    ? '#ef4444' :
    '#6b7280';

  const progress = dag.nodes.length > 0
    ? Math.round((dag.nodes.filter(n => n.status === 'completed').length / dag.nodes.length) * 100)
    : 0;

  return (
    <button
      onClick={() => selectDag(dag.id)}
      className={`w-full text-left rounded-md p-2.5 transition-all border ${
        isSelected
          ? 'border-[#f0883e]/40 bg-[#f0883e]/5'
          : 'border-[#30363d]/60 bg-[#161b22]/40 hover:border-[#484f58]'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-[#c9d1d9] font-semibold truncate">{dag.name}</span>
        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: statusColor }} />
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="font-mono text-[10px] text-[#484f58]">{dag.project} · {dag.nodes.length}n</span>
        <span className="font-mono text-[10px] text-[#484f58]">{progress}%</span>
      </div>
      <div className="h-0.5 bg-[#21262d] rounded-full mt-1 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: statusColor }} />
      </div>
    </button>
  );
}

// ── DAG Action Bar (above graph) ───────────────────────────────

function DagActionBar({ dag }: { dag: Dag }) {
  const { executeDag, deleteDag, selectDag } = useDagStore();

  const dagStatusColor =
    dag.status === 'completed' ? '#22c55e' :
    dag.status === 'running'   ? '#3b82f6' :
    dag.status === 'failed'    ? '#ef4444' :
    '#6b7280';

  const stats = {
    total: dag.nodes.length,
    completed: dag.nodes.filter(n => n.status === 'completed').length,
    running: dag.nodes.filter(n => n.status === 'running').length,
    failed: dag.nodes.filter(n => n.status === 'failed').length,
    waiting: dag.nodes.filter(n => n.status === 'waiting_approval').length,
  };

  return (
    <div className="shrink-0">
      <div className="h-10 border-b border-[#30363d] bg-[#161b22] flex items-center justify-between px-3">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-[#c9d1d9] font-bold truncate">{dag.name}</span>
          <span
            className="font-mono text-[9px] uppercase font-bold px-1.5 py-0.5 rounded"
            style={{ color: dagStatusColor, background: `${dagStatusColor}20`, border: `1px solid ${dagStatusColor}40` }}
          >
            {dag.status}
          </span>
          <span className="font-mono text-[9px] text-[#484f58]">
            {stats.completed}/{stats.total}
            {stats.running > 0 && <span className="text-blue-400 ml-1">⚡{stats.running}</span>}
            {stats.waiting > 0 && <span className="text-yellow-400 ml-1">⏸{stats.waiting}</span>}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {dag.status === 'created' && (
            <button
              onClick={() => executeDag(dag.id)}
              className="bg-[#f0883e] text-black font-mono text-[10px] font-bold px-3 py-1 rounded hover:bg-[#f0883e]/80"
            >
              ▶ EXECUTE
            </button>
          )}
          <button
            onClick={() => { deleteDag(dag.id); selectDag(null); }}
            className="text-[#f85149] font-mono text-[10px] px-2 py-1 rounded border border-[#f8514930] hover:bg-[#f8514920]"
          >
            ✕
          </button>
        </div>
      </div>
      {/* Progress bar */}
      <div className="h-0.5 bg-[#161b22] flex">
        <div className="h-full bg-green-500 transition-all duration-500" style={{ width: `${(stats.completed / stats.total) * 100}%` }} />
        <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${(stats.running / stats.total) * 100}%` }} />
        <div className="h-full bg-red-500 transition-all duration-500" style={{ width: `${(stats.failed / stats.total) * 100}%` }} />
        <div className="h-full bg-yellow-500 transition-all duration-500" style={{ width: `${(stats.waiting / stats.total) * 100}%` }} />
      </div>
    </div>
  );
}

// ── Resizable Divider ──────────────────────────────────────────

function ResizeDivider({ onDrag }: { onDrag: (deltaX: number) => void }) {
  const isDragging = useRef(false);
  const lastX = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    lastX.current = e.clientX;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = ev.clientX - lastX.current;
      lastX.current = ev.clientX;
      onDrag(delta);
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [onDrag]);

  return (
    <div
      onMouseDown={handleMouseDown}
      className="w-[5px] shrink-0 cursor-col-resize group relative z-10"
      style={{ background: '#21262d' }}
    >
      <div className="absolute inset-y-0 -left-1 -right-1 group-hover:bg-[#f0883e]/30 transition-colors" />
      <div className="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 w-[3px] h-8 rounded-full bg-[#484f58] group-hover:bg-[#f0883e] transition-colors" />
    </div>
  );
}

// ── Metrics Panel (right side) ─────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  planner: '#a78bfa',
  'backend-architect': '#60a5fa',
  'frontend-architect': '#34d399',
  'security-auditor': '#f87171',
  implementer: '#fb923c',
  reviewer: '#facc15',
};

function MetricCard({ label, value, color, sub }: { label: string; value: string | number; color?: string; sub?: string }) {
  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-md p-3">
      <div className="font-mono text-[9px] text-[#484f58] uppercase tracking-wider mb-1">{label}</div>
      <div className="font-mono text-lg font-bold" style={{ color: color || '#c9d1d9' }}>{value}</div>
      {sub && <div className="font-mono text-[9px] text-[#484f58] mt-0.5">{sub}</div>}
    </div>
  );
}

function ElapsedTimer({ startedAt }: { startedAt?: string }) {
  const [elapsed, setElapsed] = useState('00:00');

  useEffect(() => {
    if (!startedAt) return;
    const tick = () => {
      const s = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
      const m = Math.floor(s / 60);
      const sec = s % 60;
      setElapsed(`${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [startedAt]);

  return <>{elapsed}</>;
}

function DagMetricsPanel({ dag }: { dag: Dag }) {
  const stats = useMemo(() => {
    const total = dag.nodes.length;
    const completed = dag.nodes.filter(n => n.status === 'completed').length;
    const running = dag.nodes.filter(n => n.status === 'running').length;
    const failed = dag.nodes.filter(n => n.status === 'failed').length;
    const pending = dag.nodes.filter(n => n.status === 'pending').length;
    const waiting = dag.nodes.filter(n => n.status === 'waiting_approval').length;
    const skipped = dag.nodes.filter(n => n.status === 'skipped').length;
    return { total, completed, running, failed, pending, waiting, skipped };
  }, [dag.nodes]);

  const roleBreakdown = useMemo(() => {
    const counts: Record<string, { total: number; completed: number; running: number; failed: number }> = {};
    dag.nodes.forEach(n => {
      const role = n.role || n.type;
      if (!counts[role]) counts[role] = { total: 0, completed: 0, running: 0, failed: 0 };
      counts[role].total++;
      if (n.status === 'completed') counts[role].completed++;
      if (n.status === 'running') counts[role].running++;
      if (n.status === 'failed') counts[role].failed++;
    });
    return counts;
  }, [dag.nodes]);

  const completionPct = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

  // Duration calculation
  const duration = useMemo(() => {
    if (!dag.started_at) return null;
    if (dag.completed_at) {
      const ms = new Date(dag.completed_at).getTime() - new Date(dag.started_at).getTime();
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      const sec = s % 60;
      return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    }
    return null; // running — use ElapsedTimer
  }, [dag.started_at, dag.completed_at]);

  // Recently completed nodes (last 5)
  const recentNodes = useMemo(() => {
    return [...dag.nodes]
      .filter(n => n.completed_at)
      .sort((a, b) => new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime())
      .slice(0, 5);
  }, [dag.nodes]);

  return (
    <div className="h-full bg-[#0d1117] border-l border-[#30363d] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="h-10 border-b border-[#30363d] bg-[#161b22] flex items-center px-3 shrink-0">
        <span className="font-mono text-xs text-[#c9d1d9] font-bold">Metrics & Telemetry</span>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-4">
        {/* Overview Cards */}
        <div className="grid grid-cols-2 gap-2">
          <MetricCard label="Progress" value={`${completionPct}%`} color="#22c55e" sub={`${stats.completed}/${stats.total} nodes`} />
          <MetricCard
            label="Runtime"
            value={duration || (dag.started_at ? '' : '—')}
            color="#3b82f6"
            sub={dag.status === 'running' ? 'elapsed' : dag.status}
          >
            {/* Rendered as children won't work — handle inline */}
          </MetricCard>
        </div>

        {/* Runtime with live timer */}
        {!duration && dag.started_at && dag.status === 'running' && (
          <div className="bg-[#161b22] border border-[#30363d] rounded-md p-3 -mt-2">
            <div className="font-mono text-[9px] text-[#484f58] uppercase tracking-wider mb-1">Runtime (live)</div>
            <div className="font-mono text-lg font-bold text-[#3b82f6]">
              <ElapsedTimer startedAt={dag.started_at} />
            </div>
            <div className="font-mono text-[9px] text-[#484f58] mt-0.5">running…</div>
          </div>
        )}

        {/* Status Breakdown */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-md p-3">
          <div className="font-mono text-[9px] text-[#484f58] uppercase tracking-wider mb-2">Node Status</div>
          <div className="space-y-1.5">
            {[
              { label: 'Completed', count: stats.completed, color: '#22c55e' },
              { label: 'Running', count: stats.running, color: '#3b82f6' },
              { label: 'Pending', count: stats.pending, color: '#6b7280' },
              { label: 'Failed', count: stats.failed, color: '#ef4444' },
              { label: 'Waiting Approval', count: stats.waiting, color: '#eab308' },
              { label: 'Skipped', count: stats.skipped, color: '#484f58' },
            ].filter(s => s.count > 0).map(s => (
              <div key={s.label} className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
                <span className="font-mono text-xs text-[#c9d1d9] flex-1">{s.label}</span>
                <span className="font-mono text-xs font-bold" style={{ color: s.color }}>{s.count}</span>
                <div className="w-16 h-1.5 bg-[#21262d] rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(s.count / stats.total) * 100}%`, background: s.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Role Breakdown */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-md p-3">
          <div className="font-mono text-[9px] text-[#484f58] uppercase tracking-wider mb-2">By Role</div>
          <div className="space-y-2">
            {Object.entries(roleBreakdown).map(([role, rc]) => {
              const accent = ROLE_COLORS[role] || '#6b7280';
              const pct = rc.total > 0 ? Math.round((rc.completed / rc.total) * 100) : 0;
              return (
                <div key={role}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-mono text-[10px] font-bold" style={{ color: accent }}>{role}</span>
                    <span className="font-mono text-[9px] text-[#484f58]">{rc.completed}/{rc.total}</span>
                  </div>
                  <div className="h-1.5 bg-[#21262d] rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: accent }} />
                  </div>
                  {rc.running > 0 && (
                    <span className="font-mono text-[9px] text-blue-400">⚡ {rc.running} running</span>
                  )}
                  {rc.failed > 0 && (
                    <span className="font-mono text-[9px] text-red-400 ml-2">✗ {rc.failed} failed</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* DAG Info */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-md p-3">
          <div className="font-mono text-[9px] text-[#484f58] uppercase tracking-wider mb-2">DAG Info</div>
          <div className="space-y-1.5">
            {[
              ['Project', dag.project],
              ['Created by', dag.created_by],
              ['Approval', dag.approval_mode],
              ['Created', new Date(dag.created_at).toLocaleString()],
              ['Started', dag.started_at ? new Date(dag.started_at).toLocaleString() : '—'],
              ['Completed', dag.completed_at ? new Date(dag.completed_at).toLocaleString() : '—'],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-[#484f58]">{label}</span>
                <span className="font-mono text-[10px] text-[#c9d1d9] truncate ml-2 max-w-[160px]">{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        {recentNodes.length > 0 && (
          <div className="bg-[#161b22] border border-[#30363d] rounded-md p-3">
            <div className="font-mono text-[9px] text-[#484f58] uppercase tracking-wider mb-2">Recent Activity</div>
            <div className="space-y-1.5">
              {recentNodes.map(n => (
                <div key={n.id} className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${n.status === 'completed' ? 'bg-green-500' : 'bg-red-500'}`} />
                  <span className="font-mono text-[10px] text-[#c9d1d9] truncate flex-1">{n.title}</span>
                  <span className="font-mono text-[9px] text-[#484f58] shrink-0">
                    {n.completed_at ? new Date(n.completed_at).toLocaleTimeString() : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Description */}
        {dag.description && (
          <div className="bg-[#161b22] border border-[#30363d] rounded-md p-3">
            <div className="font-mono text-[9px] text-[#484f58] uppercase tracking-wider mb-1">Description</div>
            <p className="font-mono text-xs text-[#8b949e] leading-relaxed whitespace-pre-wrap">{dag.description}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Task List Item (sidebar) ───────────────────────────────────

function TaskListItem({ task, onDelete }: { task: Task; onDelete?: (id: string) => void }) {
  const statusColor =
    task.status === 'completed' || task.status === 'approved' ? '#22c55e' :
    task.status === 'running'   ? '#3b82f6' :
    task.status === 'failed' || task.status === 'rejected' || task.status === 'qc_failed' ? '#ef4444' :
    task.status === 'reviewing' ? '#f59e0b' :
    '#6b7280';

  const statusEmoji =
    task.status === 'running'   ? '⚡' :
    task.status === 'completed' || task.status === 'approved' ? '✓' :
    task.status === 'failed' || task.status === 'rejected' ? '✗' :
    task.status === 'reviewing' ? '👁' :
    '○';

  const elapsed = task.started_at
    ? (() => {
        const end = task.status === 'running' ? Date.now() : new Date(task.updated_at).getTime();
        const ms = end - new Date(task.started_at).getTime();
        const m = Math.floor(ms / 60000);
        return m > 60 ? `${Math.floor(m / 60)}h${m % 60}m` : `${m}m`;
      })()
    : '';

  return (
    <div className="rounded-md p-2 border border-[#30363d]/60 bg-[#161b22]/40 hover:border-[#484f58] transition-all">
      <div className="flex items-center justify-between gap-1">
        <span className="font-mono text-[10px] truncate text-[#c9d1d9]">{task.title}</span>
        <div className="flex items-center gap-1 shrink-0">
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
              className="text-[9px] text-[#484f58] hover:text-[#ef4444] transition-colors px-0.5"
              title="Delete task"
            >
              ✕
            </button>
          )}
          <span className="text-[10px]" style={{ color: statusColor }}>{statusEmoji}</span>
        </div>
      </div>
      <div className="flex items-center justify-between mt-0.5">
        <span className="font-mono text-[9px] text-[#484f58] truncate">{task.agent}</span>
        <span className="font-mono text-[9px]" style={{ color: statusColor }}>{task.status}{elapsed ? ` · ${elapsed}` : ''}</span>
      </div>
    </div>
  );
}

// ── Main Dashboard Page ────────────────────────────────────────

export const DashboardPage = () => {
  const { dags, selectedDagId, selectedNodeId, loading, error, fetchDags, fetchRoles, handleWsMessage } = useDagStore();
  const [showPlanner, setShowPlanner] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);

  // Resizable split: percentage of available width for left (graph) pane
  const [splitPct, setSplitPct] = useState(60);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleDrag = useCallback((deltaX: number) => {
    if (!containerRef.current) return;
    const containerW = containerRef.current.getBoundingClientRect().width;
    const deltaPct = (deltaX / containerW) * 100;
    setSplitPct(prev => Math.min(85, Math.max(30, prev + deltaPct)));
  }, []);

  // Fetch tasks
  const fetchTasks = useCallback(async () => {
    try {
      const t = await api.getTasks();
      setTasks(t);
    } catch (e) {
      console.error('[DashboardPage] Failed to fetch tasks:', e);
    }
  }, []);

  useEffect(() => {
    fetchDags();
    fetchRoles();
    fetchTasks();
  }, []);

  // Poll tasks every 10s
  useEffect(() => {
    const interval = setInterval(fetchTasks, 10000);
    return () => clearInterval(interval);
  }, [fetchTasks]);

  // Connect WebSocket for real-time DAG + task updates
  useEffect(() => {
    wsClient.connect();
    const unsub = wsClient.onMessage((msg: any) => {
      if (typeof msg.type === 'string' && msg.type.startsWith('dag:')) {
        handleWsMessage(msg);
      }
      // Refresh tasks on task events
      if (msg.type === 'task_event') {
        fetchTasks();
      }
    });
    return unsub;
  }, [handleWsMessage, fetchTasks]);

  // Auto-refresh while any DAG is running (fallback for missed WS events)
  useEffect(() => {
    const hasRunning = dags.some(d => d.status === 'running');
    if (!hasRunning) return;
    const interval = setInterval(fetchDags, 5000);
    return () => clearInterval(interval);
  }, [dags]);

  const selectedDag = selectedDagId ? dags.find(d => d.id === selectedDagId) : null;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left Sidebar: DAG List + Tasks */}
      <div className="w-[220px] border-r border-[#30363d] bg-[#0d1117] flex flex-col shrink-0">
        <div className="h-10 border-b border-[#30363d] flex items-center justify-between px-3">
          <span className="font-mono text-xs text-[#c9d1d9] font-bold">DAGs</span>
          <button
            onClick={() => setShowPlanner(true)}
            className="bg-[#f0883e] text-black font-mono text-[9px] font-bold px-2 py-0.5 rounded hover:bg-[#f0883e]/80"
          >
            + PLAN
          </button>
        </div>
        <div className="flex-1 overflow-auto p-2 space-y-1">
          {loading && dags.length === 0 && (
            <div className="text-xs text-[#484f58] italic text-center py-8 font-mono">Loading…</div>
          )}
          {!loading && dags.length === 0 && (
            <div className="text-xs text-[#484f58] italic text-center py-4 font-mono leading-relaxed">
              No DAGs yet.<br />Click + PLAN to create one.
            </div>
          )}
          {dags.map(dag => (
            <DagListItem key={dag.id} dag={dag} isSelected={dag.id === selectedDagId} />
          ))}
        </div>

        {/* Active Tasks Section - Only show when a DAG is selected */}
        {selectedDagId && (
          <div className="border-t border-[#30363d]">
            <div className="h-8 border-b border-[#30363d] flex items-center justify-between px-3">
              <span className="font-mono text-[10px] text-[#c9d1d9] font-bold">TASKS</span>
              <span className="font-mono text-[9px] text-[#484f58]">{tasks.length}</span>
            </div>
            <div className="max-h-[280px] overflow-auto p-2 space-y-1">
              {tasks.length === 0 ? (
                <div className="text-[10px] text-[#484f58] italic text-center py-3 font-mono">No tasks</div>
              ) : (
                tasks.map(task => <TaskListItem key={task.id} task={task} onDelete={async (id) => { await api.deleteTask(id); fetchTasks(); }} />)
              )}
            </div>
          </div>
        )}
      </div>

      {/* Main Content: Resizable Split */}
      <div ref={containerRef} className="flex-1 flex overflow-hidden">
        {selectedDag ? (
          <>
            {/* Left Pane: Graph */}
            <div className="flex flex-col overflow-hidden" style={{ width: `${splitPct}%` }}>
              {/* Action bar */}
              <DagActionBar dag={selectedDag} />

              {/* Graph area or graph + node detail */}
              {selectedNodeId ? (
                <>
                  <div className="h-[55%] transition-all duration-200">
                    <DagFlowGraph dag={selectedDag} selectedNodeId={selectedNodeId} />
                  </div>
                  <div className="h-[45%] shrink-0">
                    <NodeDetailPanel dag={selectedDag} />
                  </div>
                </>
              ) : (
                <div className="flex-1">
                  <DagFlowGraph dag={selectedDag} selectedNodeId={selectedNodeId} />
                </div>
              )}
            </div>

            {/* Resize Handle */}
            <ResizeDivider onDrag={handleDrag} />

            {/* Right Pane: Metrics & Telemetry */}
            <div className="overflow-hidden" style={{ width: `${100 - splitPct}%` }}>
              <DagMetricsPanel dag={selectedDag} />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-[#0d1117]">
            <div className="text-center">
              <div className="text-5xl mb-4 opacity-10">📊</div>
              <p className="font-mono text-xs text-[#484f58]">Select a DAG to see telemetry</p>
            </div>
          </div>
        )}
      </div>

      {/* Error Toast */}
      {error && (
        <div className="fixed bottom-4 right-4 bg-[#450a0a] border border-[#f85149]/30 text-[#fca5a5] px-4 py-2 rounded-lg text-xs font-mono z-50 shadow-lg">
          {error}
        </div>
      )}

      {/* Planner Dialog */}
      {showPlanner && <PlannerDialog onClose={() => setShowPlanner(false)} />}
    </div>
  );
};

