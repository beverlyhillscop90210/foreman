import { useEffect, useState } from 'react';
import { useDagStore, type Dag } from '../stores/dagStore';
import { DagFlowGraph, NodeDetailPanel } from '../components/dag/DagFlowGraph';
import { PlannerDialog } from '../components/dag/PlannerDialog';
import { wsClient } from '../lib/ws';

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
          {dag.status !== 'running' && (
            <button
              onClick={() => { deleteDag(dag.id); selectDag(null); }}
              className="text-[#f85149] font-mono text-[10px] px-2 py-1 rounded border border-[#f8514930] hover:bg-[#f8514920]"
            >
              ✕
            </button>
          )}
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

// ── Main Dashboard Page ────────────────────────────────────────

export const DashboardPage = () => {
  const { dags, selectedDagId, selectedNodeId, loading, error, fetchDags, fetchRoles, handleWsMessage } = useDagStore();
  const [showPlanner, setShowPlanner] = useState(false);

  useEffect(() => {
    fetchDags();
    fetchRoles();
  }, []);

  // Connect WebSocket for real-time DAG updates
  useEffect(() => {
    wsClient.connect();
    const unsub = wsClient.onMessage((msg: any) => {
      // Route DAG-related WS messages to the store
      if (typeof msg.type === 'string' && msg.type.startsWith('dag:')) {
        handleWsMessage(msg);
      }
    });
    return unsub;
  }, [handleWsMessage]);

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
      {/* Left Sidebar: DAG List */}
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
            <div className="text-xs text-[#484f58] italic text-center py-6 font-mono leading-relaxed">
              No DAGs yet.<br />Click + PLAN to create one.
            </div>
          )}
          {dags.map(dag => (
            <DagListItem key={dag.id} dag={dag} isSelected={dag.id === selectedDagId} />
          ))}
        </div>
      </div>

      {/* Main Content: Graph + Node Detail */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedDag ? (
          <>
            {/* Action bar */}
            <DagActionBar dag={selectedDag} />

            {/* Top: React Flow Graph */}
            <div className={`${selectedNodeId ? 'h-[55%]' : 'flex-1'} transition-all duration-200`}>
              <DagFlowGraph dag={selectedDag} selectedNodeId={selectedNodeId} />
            </div>

            {/* Bottom: Node Detail Panel (shown on node click) */}
            {selectedNodeId && (
              <div className="h-[45%] shrink-0">
                <NodeDetailPanel dag={selectedDag} />
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-[#0d1117]">
            <div className="text-center">
              <div className="text-5xl mb-4 opacity-10">📊</div>
              <p className="font-mono text-xs text-[#484f58]">Select a DAG or plan a new one</p>
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

