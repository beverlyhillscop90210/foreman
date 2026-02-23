/**
 * HGMemGraph — React Flow visualization of the hypergraph working memory.
 *
 * Vertices (entities) are rendered as small rounded nodes.
 * Hyperedges (memory points) are rendered as larger cards connecting their vertices.
 * Layout: hyperedges in concentric rings, vertices pulled toward their connected edges.
 */

import React, { useMemo, useCallback } from 'react';
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
import type { HGVertex, HGHyperedge } from '../../stores/hgmemStore';

// ── Palette ─────────────────────────────────────────────────────

const EDGE_COLORS = [
  '#FF6B2B', '#38bdf8', '#a78bfa', '#34d399', '#f472b6',
  '#fbbf24', '#6ee7b7', '#e879f9', '#60a5fa', '#fb923c',
];

function colorForStep(step: number): string {
  return EDGE_COLORS[step % EDGE_COLORS.length];
}

// ── Custom Node: Vertex (Entity) ────────────────────────────────

function VertexNode({ data }: NodeProps) {
  const d = data as any;
  return (
    <div
      style={{
        background: '#161b22',
        border: `1.5px solid ${d.borderColor || '#30363d'}`,
        borderRadius: 20,
        padding: '4px 10px',
        minWidth: 60,
        maxWidth: 160,
        textAlign: 'center',
        cursor: 'pointer',
      }}
      title={d.description}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0, width: 1, height: 1 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, width: 1, height: 1 }} />
      <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#e5e5e5', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {d.label}
      </div>
    </div>
  );
}

// ── Custom Node: Hyperedge (Memory Point) ───────────────────────

function HyperedgeNode({ data }: NodeProps) {
  const d = data as any;
  const color = colorForStep(d.step ?? 0);
  const isMerge = d.origin === 'merge';
  return (
    <div
      style={{
        background: `${color}10`,
        border: `1.5px solid ${color}`,
        borderRadius: isMerge ? 12 : 6,
        padding: '8px 12px',
        width: 220,
        cursor: 'pointer',
        boxShadow: d.selected ? `0 0 12px ${color}44` : 'none',
      }}
      title={d.description}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0, width: 1, height: 1 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, width: 1, height: 1 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: color, opacity: 0.7 }}>
          {isMerge ? '⟐ MERGE' : '◆ MP'}
        </span>
        <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: '#666' }}>
          step {d.step} · order {d.order}
        </span>
      </div>
      <div style={{
        fontSize: 10,
        fontFamily: 'Inter, sans-serif',
        color: '#c9d1d9',
        lineHeight: 1.35,
        display: '-webkit-box',
        WebkitLineClamp: 3,
        WebkitBoxOrient: 'vertical' as any,
        overflow: 'hidden',
      }}>
        {d.description}
      </div>
      <div style={{ marginTop: 4, fontSize: 9, color: '#484f58', fontFamily: 'JetBrains Mono, monospace' }}>
        {d.vertexCount} entities
      </div>
    </div>
  );
}

const nodeTypes = {
  vertex: VertexNode,
  hyperedge: HyperedgeNode,
};

// ── Layout Algorithm ────────────────────────────────────────────

/**
 * Radial layout: Hyperedges in the center area arranged by step.
 * Vertices orbit around their connected hyperedges.
 */
function layoutGraph(
  vertices: HGVertex[],
  hyperedges: HGHyperedge[],
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  if (hyperedges.length === 0 && vertices.length === 0) return { nodes, edges };

  // Group hyperedges by step
  const byStep = new Map<number, HGHyperedge[]>();
  for (const he of hyperedges) {
    const step = he.step_created;
    if (!byStep.has(step)) byStep.set(step, []);
    byStep.get(step)!.push(he);
  }
  const steps = Array.from(byStep.keys()).sort((a, b) => a - b);

  // Position hyperedges in columns by step
  const HE_COL_WIDTH = 300;
  const HE_ROW_HEIGHT = 140;
  const hePositions = new Map<string, { x: number; y: number }>();

  for (let si = 0; si < steps.length; si++) {
    const stepHEs = byStep.get(steps[si])!;
    const colX = si * HE_COL_WIDTH + 300; // offset from left for vertex space
    for (let hi = 0; hi < stepHEs.length; hi++) {
      const y = hi * HE_ROW_HEIGHT + 40;
      hePositions.set(stepHEs[hi].id, { x: colX, y });
    }
  }

  // Track which vertices have been positioned
  const vtxPositions = new Map<string, { x: number; y: number }>();
  const vtxEdgeCount = new Map<string, number>();

  // Count vertex connections
  for (const he of hyperedges) {
    for (const vid of he.vertex_ids) {
      vtxEdgeCount.set(vid, (vtxEdgeCount.get(vid) || 0) + 1);
    }
  }

  // Position vertices to the left of their first connected hyperedge
  const VTX_SPACING = 36;
  for (const he of hyperedges) {
    const hePos = hePositions.get(he.id);
    if (!hePos) continue;
    const unpositioned = he.vertex_ids.filter(vid => !vtxPositions.has(vid));
    for (let i = 0; i < unpositioned.length; i++) {
      vtxPositions.set(unpositioned[i], {
        x: hePos.x - 180,
        y: hePos.y + i * VTX_SPACING,
      });
    }
  }

  // Position orphan vertices (not connected to any hyperedge)
  let orphanY = 0;
  for (const v of vertices) {
    if (!vtxPositions.has(v.id)) {
      vtxPositions.set(v.id, { x: 40, y: orphanY });
      orphanY += VTX_SPACING;
    }
  }

  // Build vertex lookup
  const vtxMap = new Map<string, HGVertex>();
  for (const v of vertices) vtxMap.set(v.id, v);

  // Create vertex nodes
  for (const v of vertices) {
    const pos = vtxPositions.get(v.id) || { x: 0, y: 0 };
    // Determine dominant color from connected hyperedges
    const connectedHEs = hyperedges.filter(he => he.vertex_ids.includes(v.id));
    const borderColor = connectedHEs.length > 0
      ? colorForStep(connectedHEs[0].step_created)
      : '#30363d';

    nodes.push({
      id: v.id,
      type: 'vertex',
      position: pos,
      data: {
        label: v.name,
        description: v.description,
        borderColor,
        connectionCount: connectedHEs.length,
      },
    });
  }

  // Create hyperedge nodes
  for (const he of hyperedges) {
    const pos = hePositions.get(he.id) || { x: 0, y: 0 };
    nodes.push({
      id: he.id,
      type: 'hyperedge',
      position: pos,
      data: {
        label: he.id,
        description: he.description,
        step: he.step_created,
        order: he.order,
        origin: he.origin,
        vertexCount: he.vertex_ids.length,
      },
    });
  }

  // Create edges: vertex → hyperedge
  for (const he of hyperedges) {
    const color = colorForStep(he.step_created);
    for (const vid of he.vertex_ids) {
      if (!vtxMap.has(vid)) continue;
      edges.push({
        id: `${vid}-${he.id}`,
        source: vid,
        target: he.id,
        type: 'smoothstep',
        animated: false,
        style: { stroke: color, strokeWidth: 1.5, opacity: 0.6 },
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 8, height: 8 },
      });
    }
  }

  return { nodes, edges };
}

// ── Main Component ──────────────────────────────────────────────

interface HGMemGraphProps {
  vertices: HGVertex[];
  hyperedges: HGHyperedge[];
  onSelectHyperedge?: (he: HGHyperedge | null) => void;
  onSelectVertex?: (v: HGVertex | null) => void;
}

export function HGMemGraph({ vertices, hyperedges, onSelectHyperedge, onSelectVertex }: HGMemGraphProps) {
  const { nodes: layoutNodes, edges: layoutEdges } = useMemo(
    () => layoutGraph(vertices, hyperedges),
    [vertices, hyperedges],
  );

  const [nodes, , onNodesChange] = useNodesState(layoutNodes);
  const [edges, , onEdgesChange] = useEdgesState(layoutEdges);

  // Update nodes/edges when layout changes
  React.useEffect(() => {
    onNodesChange(layoutNodes.map(n => ({ type: 'replace' as const, id: n.id, item: n })));
    onEdgesChange(layoutEdges.map(e => ({ type: 'replace' as const, id: e.id, item: e })));
  }, [layoutNodes, layoutEdges, onNodesChange, onEdgesChange]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.type === 'hyperedge') {
      const he = hyperedges.find(h => h.id === node.id);
      onSelectHyperedge?.(he || null);
      onSelectVertex?.(null);
    } else {
      const v = vertices.find(vt => vt.id === node.id);
      onSelectVertex?.(v || null);
      onSelectHyperedge?.(null);
    }
  }, [hyperedges, vertices, onSelectHyperedge, onSelectVertex]);

  const onPaneClick = useCallback(() => {
    onSelectHyperedge?.(null);
    onSelectVertex?.(null);
  }, [onSelectHyperedge, onSelectVertex]);

  if (vertices.length === 0 && hyperedges.length === 0) {
    return (
      <div style={{
        width: '100%', height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0d1117', color: '#484f58', fontFamily: 'JetBrains Mono, monospace', fontSize: 12,
      }}>
        No memory data yet. Run a query to build the hypergraph.
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={onNodeClick}
      onPaneClick={onPaneClick}
      nodesDraggable={true}
      nodesConnectable={false}
      edgesFocusable={false}
      fitView
      fitViewOptions={{ padding: 0.3, maxZoom: 1.2 }}
      minZoom={0.1}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
      style={{ background: '#0d1117' }}
    >
      <Background color="#21262d" gap={24} size={1} />
      <Controls
        showInteractive={false}
        style={{
          background: '#161b22',
          border: '1px solid #30363d',
          borderRadius: 6,
        }}
      />
      <MiniMap
        nodeColor={(node) => {
          if (node.type === 'hyperedge') {
            return colorForStep((node.data as any).step ?? 0);
          }
          return '#30363d';
        }}
        style={{ background: '#0d1117', border: '1px solid #30363d' }}
        maskColor="rgba(0,0,0,0.7)"
      />
    </ReactFlow>
  );
}

// ── Step Legend ──────────────────────────────────────────────────

export function StepLegend({ maxStep }: { maxStep: number }) {
  const steps = Array.from({ length: maxStep + 1 }, (_, i) => i);
  return (
    <div style={{
      display: 'flex', gap: 8, padding: '4px 8px',
      background: '#161b22', borderRadius: 4, border: '1px solid #30363d',
    }}>
      <span style={{ fontSize: 9, color: '#484f58', fontFamily: 'JetBrains Mono, monospace', alignSelf: 'center' }}>
        Steps:
      </span>
      {steps.map(s => (
        <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <div style={{
            width: 8, height: 8, borderRadius: 2,
            background: colorForStep(s),
          }} />
          <span style={{ fontSize: 9, color: '#c9d1d9', fontFamily: 'JetBrains Mono, monospace' }}>
            {s}
          </span>
        </div>
      ))}
    </div>
  );
}
