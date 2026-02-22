import { useEffect, useMemo, useCallback, useRef } from 'react';
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
  running:          { border: '#3b82f6', bg: '#0c1929', text: '#93c5fd', glow: '0 0 20px rgba(59,130,246,0.35)' },
  completed:        { border: '#22c55e', bg: '#0a1f14', text: '#86efac' },
  failed:           { border: '#ef4444', bg: '#1a0a0a', text: '#fca5a5', glow: '0 0 12px rgba(239,68,68,0.25)' },
  skipped:          { border: '#6b7280', bg: '#1a1a2e', text: '#6b7280' },
  waiting_approval: { border: '#eab308', bg: '#1a1606', text: '#fde047', glow: '0 0 12px rgba(234,179,8,0.25)' },
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

// ── Mini-Terminal Component (inside running nodes) ─────────────

function MiniTerminal({ nodeId }: { nodeId: string }) {
  const lines = useDagStore(s => s.nodeTerminals[nodeId]) || [];
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  const displayLines = lines.slice(-8);

  if (displayLines.length === 0) {
    return (
      <div style={{
        marginTop: 8,
        background: '#010409',
        border: '1px solid #21262d',
        borderRadius: 4,
        padding: '6px 8px',
        height: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <span style={{ fontSize: 9, color: '#484f58', fontFamily: 'ui-monospace, monospace' }}>
          ⏳ Waiting for output…
        </span>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      style={{
        marginTop: 8,
        background: '#010409',
        border: '1px solid #21262d',
        borderRadius: 4,
        padding: '4px 6px',
        maxHeight: 110,
        overflowY: 'auto',
        overflowX: 'hidden',
      }}
    >
      {displayLines.map((line, i) => (
        <div
          key={i}
          style={{
            fontSize: 9,
            lineHeight: '13px',
            color: '#39d353',
            fontFamily: 'ui-monospace, SFMono-Regular, monospace',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {line}
        </div>
      ))}
    </div>
  );
}

// ── Outcome display (inside completed/failed nodes) ────────────

function NodeOutcome({ node }: { node: { status: string; error?: string; output?: string[]; completed_at?: string; started_at?: string } }) {
  if (node.status === 'completed') {
    const duration = node.started_at && node.completed_at
      ? Math.round((new Date(node.completed_at).getTime() - new Date(node.started_at).getTime()) / 1000)
      : null;
    const lastLine = node.output?.length ? node.output[node.output.length - 1] : null;
    return (
      <div style={{
        marginTop: 6,
        background: '#0a1f1410',
        border: '1px solid #22c55e20',
        borderRadius: 4,
        padding: '4px 6px',
      }}>
        <div style={{ fontSize: 9, color: '#22c55e', fontFamily: 'ui-monospace, monospace', fontWeight: 700 }}>
          ✓ DONE {duration !== null ? `(${duration}s)` : ''}
        </div>
        {lastLine && (
          <div style={{
            fontSize: 8, color: '#86efac', fontFamily: 'ui-monospace, monospace',
            marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {lastLine.slice(0, 80)}
          </div>
        )}
      </div>
    );
  }

  if (node.status === 'failed' && node.error) {
    return (
      <div style={{
        marginTop: 6,
        background: '#1a0a0a',
        border: '1px solid #ef444420',
        borderRadius: 4,
        padding: '4px 6px',
      }}>
        <div style={{ fontSize: 9, color: '#ef4444', fontFamily: 'ui-monospace, monospace', fontWeight: 700 }}>
          ✖ FAILED
        </div>
        <div style={{
          fontSize: 8, color: '#fca5a5', fontFamily: 'ui-monospace, monospace',
          marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {node.error.slice(0, 100)}
        </div>
      </div>
    );
  }

  return null;
}

// ── Custom Node Components ─────────────────────────────────────

function TaskNode({ data, id }: NodeProps) {
  const d = data as any;
  const ss = STATUS_STYLES[d.status as DagNodeStatus] || STATUS_STYLES.pending;
  const roleAccent = d.role ? ROLE_ACCENT[d.role] || '#6b7280' : '#6b7280';
  const isSelected = d.isSelected;
  const isRunning = d.status === 'running';

  return (
    <div
      onClick={() => d.onSelect?.(id)}
      style={{
        background: ss.bg,
        border: `2px solid ${isSelected ? '#f0883e' : ss.border}`,
        borderLeft: `4px solid ${roleAccent}`,
        borderRadius: 6,
        padding: '10px 12px',
        width: 280,
        boxShadow: isSelected ? '0 0 20px rgba(240,136,62,0.35)' : ss.glow || 'none',
        fontFamily: 'ui-monospace, SFMono-Regular, monospace',
        cursor: 'pointer',
        transition: 'box-shadow 0.2s ease',
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: ss.border,
          border: `2px solid ${ss.bg}`,
          width: 10,
          height: 10,
          top: -5,
        }}
      />

      {/* Header: icon + title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        {d.role && <span style={{ fontSize: 13 }}>{ROLE_ICONS[d.role] || '🔧'}</span>}
        <span style={{
          color: ss.text,
          fontSize: 11,
          fontWeight: 700,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
        }}>
          {d.label}
        </span>
        {isRunning && (
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: '#3b82f6',
            animation: 'pulse 1.5s ease-in-out infinite',
            flexShrink: 0,
          }} />
        )}
      </div>

      {/* Role + Status badges */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        {d.role && (
          <span style={{
            fontSize: 8,
            color: roleAccent,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            fontWeight: 600,
            background: `${roleAccent}15`,
            padding: '1px 5px',
            borderRadius: 3,
          }}>
            {d.role}
          </span>
        )}
        <span style={{
          fontSize: 8,
          color: ss.text,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          fontWeight: 600,
          background: `${ss.border}15`,
          padding: '1px 5px',
          borderRadius: 3,
        }}>
          {(d.status as string).replace('_', ' ')}
        </span>
      </div>

      {/* Briefing snippet (only for pending/skipped) */}
      {d.briefing && (d.status === 'pending' || d.status === 'skipped') && (
        <div style={{
          marginTop: 6, fontSize: 9, color: '#6e7681', lineHeight: '13px',
          overflow: 'hidden', maxHeight: 26, textOverflow: 'ellipsis',
        }}>
          {d.briefing.slice(0, 100)}{d.briefing.length > 100 ? '…' : ''}
        </div>
      )}

      {/* Live terminal output for running nodes */}
      {isRunning && <MiniTerminal nodeId={id} />}

      {/* Outcome for completed/failed nodes */}
      {(d.status === 'completed' || d.status === 'failed') && (
        <NodeOutcome node={d} />
      )}

      {/* Approve button for waiting_approval */}
      {d.status === 'waiting_approval' && d.onApprove && (
        <button
          onClick={(e) => { e.stopPropagation(); d.onApprove(); }}
          style={{
            marginTop: 8, width: '100%', background: '#ca8a04', color: '#000', border: 'none',
            borderRadius: 4, padding: '5px 0', fontSize: 10, fontWeight: 700,
            fontFamily: 'ui-monospace, monospace', cursor: 'pointer', letterSpacing: '0.05em',
          }}
        >
          APPROVE GATE
        </button>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          background: ss.border,
          border: `2px solid ${ss.bg}`,
          width: 10,
          height: 10,
          bottom: -5,
        }}
      />
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
        borderRadius: 6,
        padding: '8px 16px',
        width: 180,
        textAlign: 'center',
        boxShadow: isSelected ? '0 0 20px rgba(240,136,62,0.35)' : ss.glow || 'none',
        fontFamily: 'ui-monospace, SFMono-Regular, monospace',
        cursor: 'pointer',
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: ss.border,
          border: `2px solid ${ss.bg}`,
          width: 10,
          height: 10,
          top: -5,
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <span style={{ fontSize: 13 }}>⬡</span>
        <span style={{ color: ss.text, fontSize: 11, fontWeight: 700 }}>{d.label}</span>
      </div>

      <div style={{ fontSize: 8, color: ss.text, textTransform: 'uppercase', marginTop: 3, letterSpacing: '0.08em', fontWeight: 600 }}>
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

      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          background: ss.border,
          border: `2px solid ${ss.bg}`,
          width: 10,
          height: 10,
          bottom: -5,
        }}
      />
    </div>
  );
}

const nodeTypes = { taskNode: TaskNode, gateNode: GateNode };

// ── Layout algorithm (Kahn's topological layering) ─────────────

const NODE_W = 280;
const GATE_W = 180;
const GAP_X = 60;
const GAP_Y = 40;

function layoutDag(
  dag: Dag,
  approveGate: (dagId: string, nodeId: string) => void,
  selectedNodeId: string | null,
  onSelectNode: (id: string) => void,
): { nodes: Node[]; edges: Edge[] } {
  const nodeMap = new Map(dag.nodes.map(n => [n.id, n]));

  // Build adjacency and in-degree
  const inDeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const n of dag.nodes) {
    inDeg.set(n.id, 0);
    adj.set(n.id, []);
  }
  for (const e of dag.edges) {
    inDeg.set(e.to, (inDeg.get(e.to) || 0) + 1);
    adj.get(e.from)?.push(e.to);
  }

  // Kahn's algorithm: proper topological layering
  const layers: string[][] = [];
  let queue = dag.nodes
    .filter(n => (inDeg.get(n.id) || 0) === 0)
    .map(n => n.id);

  const placed = new Set<string>();
  while (queue.length > 0) {
    queue.sort();
    layers.push([...queue]);
    for (const id of queue) placed.add(id);

    const nextQueue: string[] = [];
    for (const id of queue) {
      for (const nid of adj.get(id) || []) {
        inDeg.set(nid, (inDeg.get(nid) || 1) - 1);
        if (inDeg.get(nid) === 0 && !placed.has(nid)) {
          nextQueue.push(nid);
        }
      }
    }
    queue = nextQueue;
  }

  // Place any remaining nodes
  for (const n of dag.nodes) {
    if (!placed.has(n.id)) {
      if (layers.length === 0) layers.push([]);
      layers[layers.length - 1].push(n.id);
    }
  }

  // Build React Flow nodes with precise alignment
  const rfNodes: Node[] = [];
  let currentY = 0;

  for (let li = 0; li < layers.length; li++) {
    const layer = layers[li];
    const widths = layer.map(id => {
      const dn = nodeMap.get(id)!;
      return dn.type === 'gate' ? GATE_W : NODE_W;
    });
    const totalWidth = widths.reduce((a, b) => a + b, 0) + (layer.length - 1) * GAP_X;
    let currentX = -totalWidth / 2;

    for (let ni = 0; ni < layer.length; ni++) {
      const dn = nodeMap.get(layer[ni])!;
      const isGate = dn.type === 'gate';
      const w = isGate ? GATE_W : NODE_W;

      rfNodes.push({
        id: dn.id,
        type: isGate ? 'gateNode' : 'taskNode',
        position: { x: currentX, y: currentY },
        draggable: false,
        data: {
          label: dn.title,
          status: dn.status,
          role: dn.role,
          briefing: dn.briefing,
          error: dn.error,
          output: dn.output,
          started_at: dn.started_at,
          completed_at: dn.completed_at,
          gate_condition: dn.gate_condition,
          isSelected: dn.id === selectedNodeId,
          onSelect: onSelectNode,
          onApprove: dn.status === 'waiting_approval' ? () => approveGate(dag.id, dn.id) : undefined,
        },
      });

      currentX += w + GAP_X;
    }

    // Estimate layer height - running nodes are taller due to terminal
    const hasRunning = layer.some(id => nodeMap.get(id)?.status === 'running');
    const hasCompleted = layer.some(id => {
      const s = nodeMap.get(id)?.status;
      return s === 'completed' || s === 'failed';
    });
    const layerHeight = hasRunning ? 260 : hasCompleted ? 160 : 120;
    currentY += layerHeight + GAP_Y;
  }

  // ── Edge color palette ──────────────────────────────────────
  // Assign a unique color per source node so you can visually trace
  // which parent feeds which child — even in dense fan-out graphs.
  const EDGE_PALETTE = [
    '#a855f7', // purple
    '#3b82f6', // blue
    '#06b6d4', // cyan
    '#22c55e', // green
    '#eab308', // yellow
    '#f97316', // orange
    '#ec4899', // pink
    '#8b5cf6', // violet
    '#14b8a6', // teal
    '#f43f5e', // rose
  ];

  // Build a stable color map: each unique source node gets its own hue.
  // If the source has a role, prefer its role accent color for consistency.
  const sourceIds = [...new Set(dag.edges.map(e => e.from))];
  const edgeColorMap = new Map<string, string>();
  sourceIds.forEach((srcId, idx) => {
    const srcNode = nodeMap.get(srcId);
    const roleColor = srcNode?.role ? ROLE_ACCENT[srcNode.role] : undefined;
    edgeColorMap.set(srcId, roleColor || EDGE_PALETTE[idx % EDGE_PALETTE.length]);
  });

  // Build edges with orthogonal (smoothstep) routing + color coding
  const rfEdges: Edge[] = dag.edges.map((e, i) => {
    const sourceNode = nodeMap.get(e.from);
    const targetNode = nodeMap.get(e.to);
    const sourceStatus = sourceNode?.status || 'pending';
    const targetStatus = targetNode?.status || 'pending';

    const baseColor = edgeColorMap.get(e.from) || '#30363d';
    const isActive = targetStatus === 'running' || sourceStatus === 'running';
    const isCompleted = sourceStatus === 'completed';
    const isFailed = sourceStatus === 'failed' || targetStatus === 'failed';
    const isPending = sourceStatus === 'pending' && targetStatus === 'pending';

    let strokeColor = baseColor;
    let strokeWidth = 2;
    let opacity = 0.6;
    let animated = false;

    if (isFailed) {
      strokeColor = '#ef4444';
      strokeWidth = 2;
      opacity = 0.5;
    } else if (isActive) {
      // Active path: full color, animated, bright
      strokeColor = baseColor;
      strokeWidth = 2.5;
      opacity = 1;
      animated = true;
    } else if (isCompleted) {
      // Completed path: solid, slightly dimmer
      strokeColor = baseColor;
      strokeWidth = 2;
      opacity = 0.8;
    } else if (isPending) {
      // Not yet reached: very dim
      strokeColor = '#30363d';
      strokeWidth = 1.5;
      opacity = 0.3;
    }

    return {
      id: `e-${i}`,
      source: e.from,
      target: e.to,
      type: 'smoothstep',
      animated,
      style: { stroke: strokeColor, strokeWidth, opacity },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: strokeColor,
        width: 14,
        height: 14,
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
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.8); }
        }
      `}</style>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable={false}
        fitView
        fitViewOptions={{ padding: 0.25, maxZoom: 1.2 }}
        minZoom={0.15}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        style={{ background: '#0d1117' }}
      >
        <Background color="#21262d" gap={24} size={1} />
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
    </div>
  );
}

// ── Node Detail Panel (bottom half) ────────────────────────────

export function NodeDetailPanel({ dag }: { dag: Dag }) {
  const { selectedNodeId, selectNode, approveGate } = useDagStore();
  const terminalLines = useDagStore(s => selectedNodeId ? s.nodeTerminals[selectedNodeId] : undefined) || [];
  const terminalRef = useRef<HTMLDivElement>(null);
  const node = selectedNodeId ? dag.nodes.find(n => n.id === selectedNodeId) : null;

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalLines]);

  if (!node) {
    return (
      <div className="h-full flex items-center justify-center bg-[#0d1117]">
        <p className="font-mono text-xs text-[#484f58]">Click a node in the graph to view details</p>
      </div>
    );
  }

  const ss = STATUS_STYLES[node.status] || STATUS_STYLES.pending;
  const roleAccent = node.role ? ROLE_ACCENT[node.role] || '#6b7280' : '#6b7280';

  // Combine stored output + live terminal lines
  const allOutput = [
    ...(node.output || []),
    ...(terminalLines.length > 0 && node.status === 'running' ? terminalLines : []),
  ];

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
          {node.status === 'running' && (
            <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          )}
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

      {/* Content: left sidebar + full terminal */}
      <div className="flex-1 overflow-hidden flex">
        {/* Left: Briefing + Meta */}
        <div className="w-[320px] border-r border-[#30363d] overflow-auto p-3 space-y-3 shrink-0">
          <div>
            <h4 className="font-mono text-[10px] text-[#484f58] uppercase tracking-wider mb-1">Briefing</h4>
            <div className="bg-[#161b22] border border-[#30363d] rounded p-3 text-xs text-[#c9d1d9] font-mono whitespace-pre-wrap max-h-[160px] overflow-auto leading-relaxed">
              {node.briefing || 'No briefing'}
            </div>
          </div>

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

          {node.error && (
            <div>
              <h4 className="font-mono text-[10px] text-[#f85149] uppercase tracking-wider mb-1">Error</h4>
              <div className="bg-[#450a0a] border border-[#f85149]/30 rounded p-3 text-xs text-[#fca5a5] font-mono whitespace-pre-wrap">
                {node.error}
              </div>
            </div>
          )}
        </div>

        {/* Right: Full terminal / output log */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="h-8 border-b border-[#30363d] bg-[#161b22] flex items-center px-3 shrink-0">
            <span className="font-mono text-[10px] text-[#484f58] uppercase tracking-wider">
              {node.status === 'running' ? '● Terminal' : 'Output Log'}
            </span>
            <span className="font-mono text-[9px] text-[#30363d] ml-2">
              {allOutput.length} lines
            </span>
          </div>
          <div
            ref={terminalRef}
            className="flex-1 overflow-auto p-3 bg-[#010409]"
            style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}
          >
            {allOutput.length === 0 ? (
              <div className="text-[#484f58] text-xs italic">
                {node.status === 'running' ? 'Waiting for output…' : 'No output recorded'}
              </div>
            ) : (
              allOutput.map((line, i) => (
                <div
                  key={i}
                  className="text-[11px] leading-[18px]"
                  style={{ color: node.status === 'running' ? '#39d353' : '#8b949e' }}
                >
                  {line}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
