import { useEffect, useMemo, useCallback } from 'react';
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
import { useDagStore, type Dag, type DagNodeStatus } from '../../stores/dagStore';

// ── Theme constants ────────────────────────────────────────────

const STATUS_STYLES: Record<DagNodeStatus, { border: string; bg: string; text: string; glow?: string }> = {
  pending:          { border: '#4b5563', bg: '#1f2937', text: '#9ca3af' },
  running:          { border: '#3b82f6', bg: '#1e3a5f', text: '#93c5fd', glow: '0 0 12px rgba(59,130,246,0.4)' },
  completed:        { border: '#22c55e', bg: '#14532d', text: '#86efac' },
  failed:           { border: '#ef4444', bg: '#450a0a', text: '#fca5a5' },
  skipped:          { border: '#6b7280', bg: '#1a1a2e', text: '#6b7280' },
  waiting_approval: { border: '#eab308', bg: '#422006', text: '#fde047', glow: '0 0 12px rgba(234,179,8,0.3)' },
};

export const ROLE_ACCENT: Record<string, string> = {
  planner:              '#a855f7',
  'backend-architect':  '#3b82f6',
  'frontend-architect': '#06b6d4',
  'security-auditor':   '#ef4444',
  implementer:          '#22c55e',
  reviewer:             '#eab308',
};

export const ROLE_ICONS: Record<string, string> = {
  planner:              '🧠',
  'backend-architect':  '🏗️',
  'frontend-architect': '🎨',
  'security-auditor':   '🛡️',
  implementer:          '⚡',
  reviewer:             '👁️',
};

// ── Custom Node Components ─────────────────────────────────────

function TaskNode({ data, id }: NodeProps) {
  const d = data as any;
  const ss = STATUS_STYLES[d.status as DagNodeStatus] || STATUS_STYLES.pending;
  const roleAccent = d.role ? ROLE_ACCENT[d.role] || '#6b7280' : '#6b7280';
  const isSelected = d.isSelected;

  return (
    <div
      onClick={() => d.onSelect?.(id)}
      style={{
        background: ss.bg,
        border: `2px solid ${isSelected ? '#f0883e' : ss.border}`,
        borderLeft: `4px solid ${roleAccent}`,
        borderRadius: 8,
        padding: '10px 14px',
        minWidth: 200,
        maxWidth: 280,
        boxShadow: isSelected ? '0 0 16px rgba(240,136,62,0.4)' : ss.glow || 'none',
        fontFamily: 'ui-monospace, monospace',
        cursor: 'pointer',
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
            marginTop: 8, width: '100%', background: '#ca8a04', color: '#000', border: 'none',
            borderRadius: 4, padding: '4px 0', fontSize: 10, fontWeight: 700,
            fontFamily: 'ui-monospace, monospace', cursor: 'pointer', letterSpacing: 1,
          }}
        >
          APPROVE GATE
        </button>
      )}

      <Handle type="source" position={Position.Bottom} style={{ background: ss.border, width: 8, height: 8 }} />
    </div>
  );
}

function GateNode({ data, id }: NodeProps) {
  const d = data as any;
  const ss = STATUS_STYLES[d.status as DagNodeStatus] || STATUS_STYLES.pending;
  const isSelected = d.isSelected;

  return (
    <div
      onClick={() => d.onSelect?.(id)}
      style={{
        background: ss.bg,
        border: `2px solid ${isSelected ? '#f0883e' : ss.border}`,
        borderRadius: 6, padding: '8px 16px', minWidth: 160, textAlign: 'center',
        boxShadow: isSelected ? '0 0 16px rgba(240,136,62,0.4)' : ss.glow || 'none',
        fontFamily: 'ui-monospace, monospace', cursor: 'pointer',
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
            marginTop: 6, width: '100%', background: '#ca8a04', color: '#000', border: 'none',
            borderRadius: 4, padding: '4px 0', fontSize: 10, fontWeight: 700,
            fontFamily: 'ui-monospace, monospace', cursor: 'pointer',
          }}
        >
          APPROVE
        </button>
      )}

      <Handle type="source" position={Position.Bottom} style={{ background: ss.border, width: 8, height: 8 }} />
    </div>
  );
}

const nodeTypes = { taskNode: TaskNode, gateNode: GateNode };

// ── Layout algorithm ───────────────────────────────────────────

function layoutDag(
  dag: Dag,
  approveGate: (dagId: string, nodeId: string) => void,
  selectedNodeId: string | null,
  onSelectNode: (id: string) => void,
): { nodes: Node[]; edges: Edge[] } {
  const inDeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const n of dag.nodes) { inDeg.set(n.id, 0); adj.set(n.id, []); }
  for (const e of dag.edges) { inDeg.set(e.to, (inDeg.get(e.to) || 0) + 1); adj.get(e.from)?.push(e.to); }

  const layers: string[][] = [];
  let queue = dag.nodes.filter(n => (inDeg.get(n.id) || 0) === 0).map(n => n.id);

  while (queue.length > 0) {
    layers.push(queue);
    for (const id of queue) {
      for (const nid of adj.get(id) || []) {
        const nd = (inDeg.get(nid) || 1) - 1;
        inDeg.set(nid, nd);
        if (nd === 0) {
          if (!layers[layers.length]?.includes(nid)) {
            // next layer
          }
        }
      }
    }
    // Recompute zero-in-degree for next layer
    const next: string[] = [];
    const visited = new Set(layers.flat());
    for (const n of dag.nodes) {
      if (visited.has(n.id)) continue;
      const deps = dag.edges.filter(e => e.to === n.id).map(e => e.from);
      if (deps.every(d => visited.has(d))) next.push(n.id);
    }
    queue = next;
  }

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
          isSelected: dn.id === selectedNodeId,
          onSelect: onSelectNode,
          onApprove: dn.status === 'waiting_approval' ? () => approveGate(dag.id, dn.id) : undefined,
        },
      });
    }
  }

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
        width: 16, height: 16,
      },
    };
  });

  return { nodes: rfNodes, edges: rfEdges };
}

// ── Exported DagFlowGraph component ────────────────────────────

interface DagFlowGraphProps {
  dag: Dag;
  selectedNodeId?: string | null;
  onSelectNode?: (nodeId: string) => void;
  compact?: boolean;
}

export function DagFlowGraph({ dag, selectedNodeId, onSelectNode, compact }: DagFlowGraphProps) {
  const approveGate = useDagStore(s => s.approveGate);
  const selectNode = useDagStore(s => s.selectNode);

  const handleSelectNode = useCallback((nodeId: string) => {
    selectNode(nodeId);
    onSelectNode?.(nodeId);
  }, [selectNode, onSelectNode]);

  const effectiveSelectedNodeId = selectedNodeId ?? useDagStore.getState().selectedNodeId;

  const layout = useMemo(
    () => layoutDag(dag, approveGate, effectiveSelectedNodeId, handleSelectNode),
    [dag, approveGate, effectiveSelectedNodeId, handleSelectNode],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(layout.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layout.edges);

  useEffect(() => {
    const newLayout = layoutDag(dag, approveGate, effectiveSelectedNodeId, handleSelectNode);
    setNodes(newLayout.nodes);
    setEdges(newLayout.edges);
  }, [dag, approveGate, effectiveSelectedNodeId, handleSelectNode]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.3 }}
      minZoom={0.2}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
      style={{ background: '#0d1117' }}
    >
      <Background color="#21262d" gap={20} size={1} />
      {!compact && (
        <Controls
          showInteractive={false}
          style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6 }}
        />
      )}
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

// ── Node Detail Panel (bottom half) ────────────────────────────

export function NodeDetailPanel({ dag }: { dag: Dag }) {
  const { selectedNodeId, selectNode, approveGate } = useDagStore();
  const node = selectedNodeId ? dag.nodes.find(n => n.id === selectedNodeId) : null;

  if (!node) {
    return (
      <div className="h-full flex items-center justify-center bg-[#0d1117]">
        <p className="font-mono text-xs text-[#484f58]">Click a node in the graph to view details</p>
      </div>
    );
  }

  const ss = STATUS_STYLES[node.status] || STATUS_STYLES.pending;
  const roleAccent = node.role ? ROLE_ACCENT[node.role] || '#6b7280' : '#6b7280';

  return (
    <div className="h-full bg-[#0d1117] border-t border-[#30363d] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="h-10 border-b border-[#30363d] bg-[#161b22] flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          {node.role && <span className="text-sm">{ROLE_ICONS[node.role] || '🔧'}</span>}
          <span className="font-mono text-xs text-[#c9d1d9] font-bold truncate">{node.title}</span>
          {node.role && (
            <span className="font-mono text-[9px] uppercase font-bold px-1.5 py-0.5 rounded" style={{ color: roleAccent, background: `${roleAccent}20` }}>
              {node.role}
            </span>
          )}
          <span
            className="font-mono text-[9px] uppercase font-bold px-1.5 py-0.5 rounded"
            style={{ color: ss.text, background: `${ss.border}20`, border: `1px solid ${ss.border}40` }}
          >
            {node.status.replace('_', ' ')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {node.status === 'waiting_approval' && (
            <button
              onClick={() => approveGate(dag.id, node.id)}
              className="bg-[#ca8a04] text-black font-mono text-[10px] font-bold px-3 py-1 rounded hover:bg-[#ca8a04]/80"
            >
              APPROVE
            </button>
          )}
          <button
            onClick={() => selectNode(null)}
            className="text-[#8b949e] hover:text-white text-sm leading-none"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 grid grid-cols-2 gap-4">
        {/* Left: Briefing */}
        <div className="space-y-3">
          <div>
            <h4 className="font-mono text-[10px] text-[#484f58] uppercase tracking-wider mb-1">Briefing</h4>
            <div className="bg-[#161b22] border border-[#30363d] rounded p-3 text-xs text-[#c9d1d9] font-mono whitespace-pre-wrap max-h-[200px] overflow-auto">
              {node.briefing || 'No briefing'}
            </div>
          </div>
          {node.error && (
            <div>
              <h4 className="font-mono text-[10px] text-[#f85149] uppercase tracking-wider mb-1">Error</h4>
              <div className="bg-[#450a0a] border border-[#f85149]/30 rounded p-3 text-xs text-[#fca5a5] font-mono whitespace-pre-wrap">
                {node.error}
              </div>
            </div>
          )}
        </div>

        {/* Right: Metadata */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {[
              ['Type', node.type],
              ['Project', node.project || dag.project],
              ['Task ID', node.taskId || '—'],
              ['Started', node.started_at ? new Date(node.started_at).toLocaleTimeString() : '—'],
              ['Completed', node.completed_at ? new Date(node.completed_at).toLocaleTimeString() : '—'],
              ['Gate', node.gate_condition || '—'],
            ].map(([label, value]) => (
              <div key={label}>
                <span className="font-mono text-[9px] text-[#484f58] uppercase">{label}</span>
                <p className="font-mono text-xs text-[#c9d1d9] truncate">{value}</p>
              </div>
            ))}
          </div>

          {node.allowed_files && node.allowed_files.length > 0 && (
            <div>
              <h4 className="font-mono text-[10px] text-[#484f58] uppercase tracking-wider mb-1">File Scope</h4>
              <div className="flex flex-wrap gap-1">
                {node.allowed_files.map(f => (
                  <span key={f} className="font-mono text-[9px] bg-[#161b22] border border-[#30363d] rounded px-1.5 py-0.5 text-[#8b949e]">
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}

          {node.output && node.output.length > 0 && (
            <div>
              <h4 className="font-mono text-[10px] text-[#484f58] uppercase tracking-wider mb-1">Output</h4>
              <div className="bg-[#161b22] border border-[#30363d] rounded p-2 text-[10px] text-[#8b949e] font-mono max-h-[120px] overflow-auto whitespace-pre-wrap">
                {node.output.slice(-20).join('\n')}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
