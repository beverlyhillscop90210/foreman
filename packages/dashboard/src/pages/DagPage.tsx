import { useEffect, useState } from 'react';
import { useDagStore, Dag, DagNode, DagNodeStatus } from '../stores/dagStore';

// ── Status Colors & Icons ──────────────────────────────────────

const STATUS_CONFIG: Record<DagNodeStatus, { color: string; bg: string; icon: string }> = {
  pending:           { color: 'text-gray-400',   bg: 'bg-gray-800',   icon: '○' },
  running:           { color: 'text-blue-400',   bg: 'bg-blue-900/40', icon: '◉' },
  completed:         { color: 'text-green-400',  bg: 'bg-green-900/40', icon: '✓' },
  failed:            { color: 'text-red-400',    bg: 'bg-red-900/40',   icon: '✗' },
  skipped:           { color: 'text-gray-500',   bg: 'bg-gray-800/50',  icon: '⊘' },
  waiting_approval:  { color: 'text-yellow-400', bg: 'bg-yellow-900/40', icon: '⏸' },
};

const ROLE_COLORS: Record<string, string> = {
  planner:              'border-purple-500/60',
  'backend-architect':  'border-blue-500/60',
  'frontend-architect': 'border-cyan-500/60',
  'security-auditor':   'border-red-500/60',
  implementer:          'border-green-500/60',
  reviewer:             'border-yellow-500/60',
};

const ROLE_ICONS: Record<string, string> = {
  planner:              '🧠',
  'backend-architect':  '🏗️',
  'frontend-architect': '🎨',
  'security-auditor':   '🛡️',
  implementer:          '⚡',
  reviewer:             '👁️',
};

// ── Planner Dialog ─────────────────────────────────────────────

function PlannerDialog({ onClose }: { onClose: () => void }) {
  const [project, setProject] = useState('');
  const [brief, setBrief] = useState('');
  const [planning, setPlanning] = useState(false);
  const planDag = useDagStore(s => s.planDag);

  const handleSubmit = async () => {
    if (!project.trim() || !brief.trim()) return;
    setPlanning(true);
    await planDag(project.trim(), brief.trim());
    setPlanning(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-foreman-bg-dark border border-foreman-border rounded-lg w-[560px] max-h-[80vh] overflow-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b border-foreman-border flex items-center justify-between">
          <h2 className="font-mono text-sm text-foreman-orange font-bold">🧠 Plan New DAG</h2>
          <button onClick={onClose} className="text-foreman-text hover:text-white text-lg">×</button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block font-mono text-xs text-foreman-text opacity-60 mb-1">Project</label>
            <input
              value={project}
              onChange={e => setProject(e.target.value)}
              placeholder="e.g. zeon-api"
              className="w-full bg-foreman-bg-medium border border-foreman-border rounded px-3 py-2 text-sm text-foreman-text font-mono focus:border-foreman-orange outline-none"
            />
          </div>
          <div>
            <label className="block font-mono text-xs text-foreman-text opacity-60 mb-1">Brief</label>
            <textarea
              value={brief}
              onChange={e => setBrief(e.target.value)}
              placeholder="Describe what needs to be built..."
              rows={6}
              className="w-full bg-foreman-bg-medium border border-foreman-border rounded px-3 py-2 text-sm text-foreman-text font-mono focus:border-foreman-orange outline-none resize-none"
            />
          </div>
          <button
            onClick={handleSubmit}
            disabled={planning || !project.trim() || !brief.trim()}
            className="w-full bg-foreman-orange text-black font-mono text-sm font-bold py-2 rounded hover:bg-foreman-orange/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {planning ? 'Planning…' : 'Generate DAG'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Node Card ──────────────────────────────────────────────────

function NodeCard({ node, dagId }: { node: DagNode; dagId: string }) {
  const approveGate = useDagStore(s => s.approveGate);
  const sc = STATUS_CONFIG[node.status] || STATUS_CONFIG.pending;
  const roleColor = node.role ? ROLE_COLORS[node.role] || 'border-gray-600' : 'border-gray-600';
  const roleIcon = node.role ? ROLE_ICONS[node.role] || '🔧' : '';
  const isGate = node.type === 'gate';

  return (
    <div
      className={`border-l-4 ${roleColor} ${sc.bg} rounded-r px-3 py-2 transition-all ${
        node.status === 'running' ? 'ring-1 ring-blue-500/30' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-sm ${sc.color}`}>{sc.icon}</span>
          <span className="font-mono text-xs text-foreman-text font-semibold truncate max-w-[220px]">
            {isGate ? `⬡ ${node.title}` : node.title}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {node.role && (
            <span className="font-mono text-[10px] text-foreman-text opacity-50" title={node.role}>
              {roleIcon} {node.role}
            </span>
          )}
          <span className={`font-mono text-[10px] uppercase ${sc.color}`}>{node.status.replace('_', ' ')}</span>
        </div>
      </div>

      {node.briefing && (
        <p className="mt-1 text-[11px] text-foreman-text opacity-40 line-clamp-2">{node.briefing}</p>
      )}

      {node.error && (
        <p className="mt-1 text-[11px] text-red-400 truncate">⚠ {node.error}</p>
      )}

      {node.status === 'waiting_approval' && (
        <button
          onClick={() => approveGate(dagId, node.id)}
          className="mt-2 bg-yellow-600 text-black font-mono text-[10px] font-bold px-3 py-1 rounded hover:bg-yellow-500 transition-colors"
        >
          APPROVE GATE
        </button>
      )}
    </div>
  );
}

// ── DAG Detail View ────────────────────────────────────────────

function DagDetail({ dag }: { dag: Dag }) {
  const { executeDag, deleteDag, selectDag } = useDagStore();

  // Group nodes into layers using topological sort
  const layers = computeLayers(dag);

  const dagStatusColor =
    dag.status === 'completed' ? 'text-green-400' :
    dag.status === 'running'   ? 'text-blue-400' :
    dag.status === 'failed'    ? 'text-red-400' :
    'text-gray-400';

  const nodeStats = {
    total: dag.nodes.length,
    completed: dag.nodes.filter(n => n.status === 'completed').length,
    running: dag.nodes.filter(n => n.status === 'running').length,
    failed: dag.nodes.filter(n => n.status === 'failed').length,
    waiting: dag.nodes.filter(n => n.status === 'waiting_approval').length,
  };

  return (
    <div className="flex-1 overflow-auto p-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <button
            onClick={() => selectDag(null)}
            className="font-mono text-[10px] text-foreman-text opacity-40 hover:text-foreman-orange mb-1"
          >
            ← Back to DAGs
          </button>
          <h2 className="font-mono text-lg text-foreman-text font-bold">{dag.name}</h2>
          <p className="text-xs text-foreman-text opacity-40 mt-0.5">{dag.description}</p>
          <div className="flex items-center gap-3 mt-2">
            <span className={`font-mono text-xs uppercase font-bold ${dagStatusColor}`}>{dag.status}</span>
            <span className="font-mono text-[10px] text-foreman-text opacity-30">
              {dag.project} · {dag.created_by} · {new Date(dag.created_at).toLocaleString()}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {dag.status === 'created' && (
            <button
              onClick={() => executeDag(dag.id)}
              className="bg-foreman-orange text-black font-mono text-xs font-bold px-4 py-1.5 rounded hover:bg-foreman-orange/80 transition-colors"
            >
              ▶ EXECUTE
            </button>
          )}
          {dag.status !== 'running' && (
            <button
              onClick={() => { deleteDag(dag.id); selectDag(null); }}
              className="bg-red-900/40 text-red-400 font-mono text-xs px-3 py-1.5 rounded hover:bg-red-900/60 border border-red-800/40 transition-colors"
            >
              DELETE
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-mono text-[10px] text-foreman-text opacity-40">
            {nodeStats.completed}/{nodeStats.total} nodes
          </span>
          {nodeStats.running > 0 && <span className="font-mono text-[10px] text-blue-400">{nodeStats.running} running</span>}
          {nodeStats.failed > 0 && <span className="font-mono text-[10px] text-red-400">{nodeStats.failed} failed</span>}
          {nodeStats.waiting > 0 && <span className="font-mono text-[10px] text-yellow-400">{nodeStats.waiting} waiting</span>}
        </div>
        <div className="h-1.5 bg-foreman-bg-medium rounded-full overflow-hidden flex">
          <div className="h-full bg-green-500 transition-all" style={{ width: `${(nodeStats.completed / nodeStats.total) * 100}%` }} />
          <div className="h-full bg-blue-500 transition-all" style={{ width: `${(nodeStats.running / nodeStats.total) * 100}%` }} />
          <div className="h-full bg-red-500 transition-all" style={{ width: `${(nodeStats.failed / nodeStats.total) * 100}%` }} />
          <div className="h-full bg-yellow-500 transition-all" style={{ width: `${(nodeStats.waiting / nodeStats.total) * 100}%` }} />
        </div>
      </div>

      {/* Layered Node Graph */}
      <div className="space-y-3">
        {layers.map((layer, i) => (
          <div key={i}>
            <div className="font-mono text-[9px] text-foreman-text opacity-20 uppercase mb-1">
              Layer {i + 1} {layer.length > 1 ? `(${layer.length} parallel)` : ''}
            </div>
            <div className={`grid gap-2 ${layer.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {layer.map(node => (
                <NodeCard key={node.id} node={node} dagId={dag.id} />
              ))}
            </div>
            {i < layers.length - 1 && (
              <div className="flex justify-center py-1">
                <span className="text-foreman-text opacity-20 text-xs">↓</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── DAG List View ──────────────────────────────────────────────

function DagListItem({ dag, isSelected }: { dag: Dag; isSelected: boolean }) {
  const selectDag = useDagStore(s => s.selectDag);

  const sc =
    dag.status === 'completed' ? 'border-green-500/30 bg-green-900/10' :
    dag.status === 'running'   ? 'border-blue-500/30 bg-blue-900/10' :
    dag.status === 'failed'    ? 'border-red-500/30 bg-red-900/10' :
    'border-foreman-border/60 bg-foreman-bg-medium/30';

  const progress = dag.nodes.length > 0
    ? Math.round((dag.nodes.filter(n => n.status === 'completed').length / dag.nodes.length) * 100)
    : 0;

  return (
    <button
      onClick={() => selectDag(dag.id)}
      className={`w-full text-left border rounded p-3 transition-all hover:border-foreman-orange/40 ${sc} ${
        isSelected ? 'ring-1 ring-foreman-orange/40' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-foreman-text font-semibold truncate">{dag.name}</span>
        <span className={`font-mono text-[10px] uppercase ${
          dag.status === 'completed' ? 'text-green-400' :
          dag.status === 'running' ? 'text-blue-400' :
          dag.status === 'failed' ? 'text-red-400' : 'text-gray-400'
        }`}>{dag.status}</span>
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="font-mono text-[10px] text-foreman-text opacity-30">{dag.project} · {dag.nodes.length} nodes</span>
        <span className="font-mono text-[10px] text-foreman-text opacity-30">{progress}%</span>
      </div>
    </button>
  );
}

// ── Main Page ──────────────────────────────────────────────────

export const DagPage = () => {
  const { dags, selectedDagId, loading, error, fetchDags, fetchRoles } = useDagStore();
  const [showPlanner, setShowPlanner] = useState(false);

  useEffect(() => {
    fetchDags();
    fetchRoles();
  }, []);

  // Auto-refresh while any DAG is running
  useEffect(() => {
    const hasRunning = dags.some(d => d.status === 'running');
    if (!hasRunning) return;
    const interval = setInterval(fetchDags, 3000);
    return () => clearInterval(interval);
  }, [dags]);

  const selectedDag = selectedDagId ? dags.find(d => d.id === selectedDagId) : null;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar: DAG List */}
      <div className="w-[280px] border-r border-foreman-border bg-foreman-bg-dark flex flex-col">
        <div className="h-12 border-b border-foreman-border flex items-center justify-between px-3">
          <span className="font-mono text-sm text-foreman-text font-bold">DAGs</span>
          <button
            onClick={() => setShowPlanner(true)}
            className="bg-foreman-orange text-black font-mono text-[10px] font-bold px-2 py-1 rounded hover:bg-foreman-orange/80 transition-colors"
          >
            + PLAN
          </button>
        </div>
        <div className="flex-1 overflow-auto p-2 space-y-2">
          {loading && dags.length === 0 && (
            <div className="text-xs text-foreman-text opacity-30 italic text-center py-8">Loading…</div>
          )}
          {!loading && dags.length === 0 && (
            <div className="text-xs text-foreman-text opacity-30 italic text-center py-8">
              No DAGs yet. Click + PLAN to create one.
            </div>
          )}
          {dags.map(dag => (
            <DagListItem key={dag.id} dag={dag} isSelected={dag.id === selectedDagId} />
          ))}
        </div>
      </div>

      {/* Main Content */}
      {selectedDag ? (
        <DagDetail dag={selectedDag} />
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-4xl mb-3 opacity-20">📊</div>
            <p className="font-mono text-xs text-foreman-text opacity-30">Select a DAG or create a new one</p>
          </div>
        </div>
      )}

      {/* Error Toast */}
      {error && (
        <div className="fixed bottom-4 right-4 bg-red-900/80 border border-red-700 text-red-200 px-4 py-2 rounded text-xs font-mono z-50">
          {error}
        </div>
      )}

      {/* Planner Dialog */}
      {showPlanner && <PlannerDialog onClose={() => setShowPlanner(false)} />}
    </div>
  );
};

// ── Helpers ────────────────────────────────────────────────────

/** Compute topological layers for display (nodes in same layer are parallel) */
function computeLayers(dag: Dag): DagNode[][] {
  const nodeMap = new Map(dag.nodes.map(n => [n.id, n]));
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const n of dag.nodes) {
    inDegree.set(n.id, 0);
    adj.set(n.id, []);
  }
  for (const e of dag.edges) {
    inDegree.set(e.to, (inDegree.get(e.to) || 0) + 1);
    adj.get(e.from)?.push(e.to);
  }

  const layers: DagNode[][] = [];
  let queue = dag.nodes.filter(n => (inDegree.get(n.id) || 0) === 0);

  while (queue.length > 0) {
    layers.push(queue);
    const nextQueue: DagNode[] = [];
    for (const node of queue) {
      for (const neighborId of adj.get(node.id) || []) {
        const newDeg = (inDegree.get(neighborId) || 1) - 1;
        inDegree.set(neighborId, newDeg);
        if (newDeg === 0) {
          const neighbor = nodeMap.get(neighborId);
          if (neighbor) nextQueue.push(neighbor);
        }
      }
    }
    queue = nextQueue;
  }

  return layers;
}
