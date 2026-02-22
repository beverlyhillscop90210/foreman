import { useEffect, useState, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  MarkerType,
  type Node,
  type Edge,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useDagStore, type Dag, type DagNodeStatus } from '../stores/dagStore';

// ── Theme constants ────────────────────────────────────────────

const STATUS_STYLES: Record<DagNodeStatus, { border: string; bg: string; text: string; glow?: string }> = {
  pending:          { border: '#4b5563', bg: '#1f2937', text: '#9ca3af' },
  running:          { border: '#3b82f6', bg: '#1e3a5f', text: '#93c5fd', glow: '0 0 12px rgba(59,130,246,0.4)' },
  completed:        { border: '#22c55e', bg: '#14532d', text: '#86efac' },
  failed:           { border: '#ef4444', bg: '#450a0a', text: '#fca5a5' },
  skipped:          { border: '#6b7280', bg: '#1a1a2e', text: '#6b7280' },
  waiting_approval: { border: '#eab308', bg: '#422006', text: '#fde047', glow: '0 0 12px rgba(234,179,8,0.3)' },
};

const ROLE_ACCENT: Record<string, string> = {
  planner:              '#a855f7',
  'backend-architect':  '#3b82f6',
  'frontend-architect': '#06b6d4',
  'security-auditor':   '#ef4444',
  implementer:          '#22c55e',
  reviewer:             '#eab308',
};

const ROLE_ICONS: Record<string, string> = {
  planner:              '🧠',
  'backend-architect':  '🏗️',
  'frontend-architect': '🎨',
  'security-auditor':   '🛡️',
  implementer:          '⚡',
  reviewer:             '👁️',
};

// ── Custom Node Components ─────────────────────────────────────

function TaskNode({ data }: NodeProps) {
  const d = data as any;
  const ss = STATUS_STYLES[d.status as DagNodeStatus] || STATUS_STYLES.pending;
  const roleAccent = d.role ? ROLE_ACCENT[d.role] || '#6b7280' : '#6b7280';

  return (
    <div
      style={{
        background: ss.bg,
        border: `2px solid ${ss.border}`,
        borderLeft: `4px solid ${roleAccent}`,
        borderRadius: 8,
        padding: '10px 14px',
        minWidth: 200,
        maxWidth: 280,
        boxShadow: ss.glow || 'none',
        fontFamily: 'ui-monospace, monospace',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: ss.border, width: 8, height: 8 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        {d.role && <span style={{ fontSize: 14 }}>{ROLE_ICONS[d.role] || '🔧'}</span>}
        <span style={{ color: ss.text, fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {d.label}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        {d.role && (
          <span style={{ fontSize: 9, color: roleAccent, textTransform: 'uppercase', letterSpacing: 1 }}>
            {d.role}
          </span>
        )}
        <span style={{ fontSize: 9, color: ss.text, textTransform: 'uppercase', letterSpacing: 1 }}>
          {(d.status as string).replace('_', ' ')}
        </span>
      </div>

      {d.briefing && (
        <div style={{ marginTop: 6, fontSize: 10, color: '#9ca3af', lineHeight: 1.3, overflow: 'hidden', maxHeight: 40, textOverflow: 'ellipsis' }}>
          {d.briefing.slice(0, 120)}{d.briefing.length > 120 ? '…' : ''}
        </div>
      )}

      {d.error && (
        <div style={{ marginTop: 4, fontSize: 10, color: '#fca5a5' }}>⚠ {d.error.slice(0, 80)}</div>
      )}

      {d.status === 'waiting_approval' && d.onApprove && (
        <button
          onClick={(e) => { e.stopPropagation(); d.onApprove(); }}
          style={{
            marginTop: 8,
            width: '100%',
            background: '#ca8a04',
            color: '#000',
            border: 'none',
            borderRadius: 4,
            padding: '4px 0',
            fontSize: 10,
            fontWeight: 700,
            fontFamily: 'ui-monospace, monospace',
            cursor: 'pointer',
            letterSpacing: 1,
          }}
        >
          APPROVE GATE
        </button>
      )}

      <Handle type="source" position={Position.Bottom} style={{ background: ss.border, width: 8, height: 8 }} />
    </div>
  );
}

function GateNode({ data }: NodeProps) {
  const d = data as any;
  const ss = STATUS_STYLES[d.status as DagNodeStatus] || STATUS_STYLES.pending;

  return (
    <div
      style={{
        background: ss.bg,
        border: `2px solid ${ss.border}`,
        borderRadius: 6,
        padding: '8px 16px',
        minWidth: 160,
        textAlign: 'center',
        boxShadow: ss.glow || 'none',
        fontFamily: 'ui-monospace, monospace',
        position: 'relative',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: ss.border, width: 8, height: 8 }} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <span style={{ fontSize: 14 }}>⬡</span>
        <span style={{ color: ss.text, fontSize: 11, fontWeight: 700 }}>{d.label}</span>
      </div>

      <div style={{ fontSize: 9, color: ss.text, textTransform: 'uppercase', marginTop: 2, letterSpacing: 1 }}>
        {d.gate_condition || 'gate'} · {(d.status as string).replace('_', ' ')}
      </div>

      {d.status === 'waiting_approval' && d.onApprove && (
        <button
          onClick={(e) => { e.stopPropagation(); d.onApprove(); }}
          style={{
            marginTop: 6,
            width: '100%',
            background: '#ca8a04',
            color: '#000',
            border: 'none',
            borderRadius: 4,
            padding: '4px 0',
            fontSize: 10,
            fontWeight: 700,
            fontFamily: 'ui-monospace, monospace',
            cursor: 'pointer',
          }}
        >
          APPROVE
        </button>
      )}

      <Handle type="source" position={Position.Bottom} style={{ background: ss.border, width: 8, height: 8 }} />
    </div>
  );
}

const nodeTypes = {
  taskNode: TaskNode,
  gateNode: GateNode,
};

// ── Layout algorithm (Dagre-like layered) ──────────────────────

function layoutDag(dag: Dag, approveGate: (dagId: string, nodeId: string) => void): { nodes: Node[]; edges: Edge[] } {
  // 1. Compute layers via topological sort
  const inDeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const n of dag.nodes) { inDeg.set(n.id, 0); adj.set(n.id, []); }
  for (const e of dag.edges) { inDeg.set(e.to, (inDeg.get(e.to) || 0) + 1); adj.get(e.from)?.push(e.to); }

  const layers: string[][] = [];
  const nodeLayer = new Map<string, number>();
  let queue = dag.nodes.filter(n => (inDeg.get(n.id) || 0) === 0).map(n => n.id);

  while (queue.length > 0) {
    layers.push(queue);
    const layerIdx = layers.length - 1;
    for (const id of queue) nodeLayer.set(id, layerIdx);
    const next: string[] = [];
    for (const id of queue) {
      for (const nid of adj.get(id) || []) {
        const nd = (inDeg.get(nid) || 1) - 1;
        inDeg.set(nid, nd);
        if (nd === 0) next.push(nid);
      }
    }
    queue = next;
  }

  // 2. Position nodes
  const NODE_W = 260;
  const NODE_H = 120;
  const GAP_X = 60;
  const GAP_Y = 80;
  const nodeMap = new Map(dag.nodes.map(n => [n.id, n]));

  const rfNodes: Node[] = [];
  for (let li = 0; li < layers.length; li++) {
    const layer = layers[li];
    const totalWidth = layer.length * NODE_W + (layer.length - 1) * GAP_X;
    const startX = -totalWidth / 2;

    for (let ni = 0; ni < layer.length; ni++) {
      const dn = nodeMap.get(layer[ni])!;
      const isGate = dn.type === 'gate';

      rfNodes.push({
        id: dn.id,
        type: isGate ? 'gateNode' : 'taskNode',
        position: { x: startX + ni * (NODE_W + GAP_X), y: li * (NODE_H + GAP_Y) },
        data: {
          label: dn.title,
          status: dn.status,
          role: dn.role,
          briefing: dn.briefing,
          error: dn.error,
          gate_condition: dn.gate_condition,
          onApprove: dn.status === 'waiting_approval' ? () => approveGate(dag.id, dn.id) : undefined,
        },
      });
    }
  }

  // 3. Build edges
  const rfEdges: Edge[] = dag.edges.map((e, i) => {
    const sourceNode = nodeMap.get(e.from);
    const targetNode = nodeMap.get(e.to);
    const sourceCompleted = sourceNode?.status === 'completed';
    const targetRunning = targetNode?.status === 'running';

    return {
      id: `e-${i}`,
      source: e.from,
      target: e.to,
      animated: targetRunning,
      style: {
        stroke: sourceCompleted ? '#22c55e' : '#4b5563',
        strokeWidth: sourceCompleted ? 2 : 1.5,
        opacity: sourceCompleted ? 1 : 0.5,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: sourceCompleted ? '#22c55e' : '#4b5563',
        width: 16,
        height: 16,
      },
    };
  });

  return { nodes: rfNodes, edges: rfEdges };
}

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
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-[#0d1117] border border-[#30363d] rounded-lg w-[560px] max-h-[80vh] overflow-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b border-[#30363d] flex items-center justify-between">
          <h2 className="font-mono text-sm text-[#f0883e] font-bold">🧠 Plan New DAG</h2>
          <button onClick={onClose} className="text-[#8b949e] hover:text-white text-lg leading-none">×</button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block font-mono text-xs text-[#8b949e] mb-1">Project</label>
            <input
              value={project}
              onChange={e => setProject(e.target.value)}
              placeholder="e.g. zeon-api"
              className="w-full bg-[#161b22] border border-[#30363d] rounded px-3 py-2 text-sm text-[#c9d1d9] font-mono focus:border-[#f0883e] outline-none"
            />
          </div>
          <div>
            <label className="block font-mono text-xs text-[#8b949e] mb-1">Brief</label>
            <textarea
              value={brief}
              onChange={e => setBrief(e.target.value)}
              placeholder="Describe what needs to be built..."
              rows={6}
              className="w-full bg-[#161b22] border border-[#30363d] rounded px-3 py-2 text-sm text-[#c9d1d9] font-mono focus:border-[#f0883e] outline-none resize-none"
            />
          </div>
          <button
            onClick={handleSubmit}
            disabled={planning || !project.trim() || !brief.trim()}
            className="w-full bg-[#f0883e] text-black font-mono text-sm font-bold py-2 rounded hover:bg-[#f0883e]/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {planning ? '🧠 Planning…' : 'Generate DAG'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Flow Canvas ────────────────────────────────────────────────

function DagFlow({ dag }: { dag: Dag }) {
  const approveGate = useDagStore(s => s.approveGate);
  const layout = useMemo(() => layoutDag(dag, approveGate), [dag, approveGate]);

  const [nodes, setNodes, onNodesChange] = useNodesState(layout.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layout.edges);

  // Sync when dag changes (e.g. status updates)
  useEffect(() => {
    const newLayout = layoutDag(dag, approveGate);
    setNodes(newLayout.nodes);
    setEdges(newLayout.edges);
  }, [dag, approveGate]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.3 }}
      minZoom={0.3}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
      style={{ background: '#0d1117' }}
    >
      <Background color="#21262d" gap={20} size={1} />
      <Controls
        showInteractive={false}
        style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6 }}
      />
      <MiniMap
        nodeStrokeColor={() => '#30363d'}
        nodeColor={(n) => {
          const s = (n.data as any)?.status;
          if (s === 'completed') return '#22c55e';
          if (s === 'running') return '#3b82f6';
          if (s === 'failed') return '#ef4444';
          if (s === 'waiting_approval') return '#eab308';
          return '#4b5563';
        }}
        maskColor="rgba(13,17,23,0.8)"
        style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6 }}
      />
    </ReactFlow>
  );
}

// ── DAG Detail Panel ───────────────────────────────────────────

function DagDetail({ dag }: { dag: Dag }) {
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
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="h-14 border-b border-[#30363d] bg-[#161b22] flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => selectDag(null)}
            className="font-mono text-xs text-[#8b949e] hover:text-[#f0883e] transition-colors"
          >
            ← Back
          </button>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-[#c9d1d9] font-bold">{dag.name}</span>
            <span
              className="font-mono text-[10px] uppercase font-bold px-2 py-0.5 rounded"
              style={{ color: dagStatusColor, background: `${dagStatusColor}20`, border: `1px solid ${dagStatusColor}40` }}
            >
              {dag.status}
            </span>
          </div>
          <span className="font-mono text-[10px] text-[#484f58]">
            {dag.project} · {stats.completed}/{stats.total} nodes
            {stats.running > 0 && <span className="text-blue-400 ml-1">· {stats.running} running</span>}
            {stats.waiting > 0 && <span className="text-yellow-400 ml-1">· {stats.waiting} waiting</span>}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {dag.status === 'created' && (
            <button
              onClick={() => executeDag(dag.id)}
              className="bg-[#f0883e] text-black font-mono text-xs font-bold px-4 py-1.5 rounded hover:bg-[#f0883e]/80 transition-colors"
            >
              ▶ EXECUTE
            </button>
          )}
          {dag.status !== 'running' && (
            <button
              onClick={() => { deleteDag(dag.id); selectDag(null); }}
              className="text-[#f85149] font-mono text-xs px-3 py-1.5 rounded border border-[#f8514930] hover:bg-[#f8514920] transition-colors"
            >
              DELETE
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-[#161b22] flex shrink-0">
        <div className="h-full bg-green-500 transition-all duration-500" style={{ width: `${(stats.completed / stats.total) * 100}%` }} />
        <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${(stats.running / stats.total) * 100}%` }} />
        <div className="h-full bg-red-500 transition-all duration-500" style={{ width: `${(stats.failed / stats.total) * 100}%` }} />
        <div className="h-full bg-yellow-500 transition-all duration-500" style={{ width: `${(stats.waiting / stats.total) * 100}%` }} />
      </div>

      {/* React Flow Canvas */}
      <div className="flex-1">
        <DagFlow dag={dag} />
      </div>
    </div>
  );
}

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
      className={`w-full text-left rounded-md p-3 transition-all border ${
        isSelected
          ? 'border-[#f0883e]/40 bg-[#f0883e]/5'
          : 'border-[#30363d]/60 bg-[#161b22]/40 hover:border-[#484f58]'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-[#c9d1d9] font-semibold truncate">{dag.name}</span>
        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: statusColor }} />
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <span className="font-mono text-[10px] text-[#484f58]">{dag.project} · {dag.nodes.length} nodes</span>
        <span className="font-mono text-[10px] text-[#484f58]">{progress}%</span>
      </div>
      {/* Mini progress bar */}
      <div className="h-0.5 bg-[#21262d] rounded-full mt-1.5 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: statusColor }} />
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
      <div className="w-[260px] border-r border-[#30363d] bg-[#0d1117] flex flex-col shrink-0">
        <div className="h-12 border-b border-[#30363d] flex items-center justify-between px-3">
          <span className="font-mono text-sm text-[#c9d1d9] font-bold">DAGs</span>
          <button
            onClick={() => setShowPlanner(true)}
            className="bg-[#f0883e] text-black font-mono text-[10px] font-bold px-2.5 py-1 rounded hover:bg-[#f0883e]/80 transition-colors"
          >
            + PLAN
          </button>
        </div>
        <div className="flex-1 overflow-auto p-2 space-y-1.5">
          {loading && dags.length === 0 && (
            <div className="text-xs text-[#484f58] italic text-center py-8 font-mono">Loading…</div>
          )}
          {!loading && dags.length === 0 && (
            <div className="text-xs text-[#484f58] italic text-center py-8 font-mono">
              No DAGs yet.<br />Click + PLAN to create one.
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
        <div className="flex-1 flex items-center justify-center bg-[#0d1117]">
          <div className="text-center">
            <div className="text-5xl mb-4 opacity-10">📊</div>
            <p className="font-mono text-xs text-[#484f58]">Select a DAG or create a new one</p>
          </div>
        </div>
      )}

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
