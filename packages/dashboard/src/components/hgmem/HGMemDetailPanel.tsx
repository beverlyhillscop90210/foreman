/**
 * HGMemDetailPanel — Bottom detail panel shown when a graph element is selected.
 * Shows full description, connected entities, source chunks, step info.
 */

import type { HGVertex, HGHyperedge } from '../../stores/hgmemStore';

const MONO = 'JetBrains Mono, monospace';
const SANS = 'Inter, sans-serif';

// ── Hyperedge Detail ────────────────────────────────────────────

interface HyperedgeDetailProps {
  hyperedge: HGHyperedge;
  vertices: HGVertex[];
}

export function HyperedgeDetail({ hyperedge, vertices }: HyperedgeDetailProps) {
  const connectedVerts = vertices.filter(v => hyperedge.vertex_ids.includes(v.id));

  return (
    <div style={{ padding: 16, overflow: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{
          fontSize: 10, fontFamily: MONO, color: '#FF6B2B',
          background: '#FF6B2B18', padding: '2px 6px', borderRadius: 3,
        }}>
          {hyperedge.origin === 'merge' ? '⟐ MERGED' : '◆ MEMORY POINT'}
        </span>
        <span style={{ fontSize: 10, fontFamily: MONO, color: '#484f58' }}>
          {hyperedge.id}
        </span>
        <span style={{ fontSize: 10, fontFamily: MONO, color: '#484f58' }}>
          · order {hyperedge.order} · step {hyperedge.step_created}
          {hyperedge.step_updated !== hyperedge.step_created && ` (updated step ${hyperedge.step_updated})`}
        </span>
      </div>

      <div style={{
        fontSize: 12, fontFamily: SANS, color: '#c9d1d9',
        lineHeight: 1.5, marginBottom: 16,
        background: '#161b22', padding: 12, borderRadius: 6, border: '1px solid #30363d',
      }}>
        {hyperedge.description}
      </div>

      {hyperedge.merged_from && hyperedge.merged_from.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontFamily: MONO, color: '#484f58', marginBottom: 4 }}>
            Merged from:
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {hyperedge.merged_from.map(id => (
              <span key={id} style={{
                fontSize: 9, fontFamily: MONO, color: '#a78bfa',
                background: '#a78bfa18', padding: '1px 5px', borderRadius: 3,
              }}>
                {id}
              </span>
            ))}
          </div>
        </div>
      )}

      <div style={{ fontSize: 10, fontFamily: MONO, color: '#484f58', marginBottom: 8 }}>
        Connected Entities ({connectedVerts.length})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {connectedVerts.map(v => (
          <div key={v.id} style={{
            background: '#161b22', border: '1px solid #30363d', borderRadius: 6, padding: 8,
          }}>
            <div style={{ fontSize: 11, fontFamily: MONO, color: '#e5e5e5', marginBottom: 2 }}>
              {v.name}
            </div>
            {v.description && (
              <div style={{ fontSize: 10, fontFamily: SANS, color: '#8b949e', lineHeight: 1.35 }}>
                {v.description.slice(0, 200)}{v.description.length > 200 ? '…' : ''}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Vertex Detail ───────────────────────────────────────────────

interface VertexDetailProps {
  vertex: HGVertex;
  hyperedges: HGHyperedge[];
}

export function VertexDetail({ vertex, hyperedges }: VertexDetailProps) {
  const connectedHEs = hyperedges.filter(he => he.vertex_ids.includes(vertex.id));

  return (
    <div style={{ padding: 16, overflow: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{
          fontSize: 10, fontFamily: MONO, color: '#38bdf8',
          background: '#38bdf818', padding: '2px 6px', borderRadius: 3,
        }}>
          ● ENTITY
        </span>
        <span style={{ fontSize: 12, fontFamily: MONO, color: '#e5e5e5', fontWeight: 600 }}>
          {vertex.name}
        </span>
      </div>

      {vertex.description && (
        <div style={{
          fontSize: 12, fontFamily: SANS, color: '#c9d1d9',
          lineHeight: 1.5, marginBottom: 16,
          background: '#161b22', padding: 12, borderRadius: 6, border: '1px solid #30363d',
        }}>
          {vertex.description}
        </div>
      )}

      <div style={{ fontSize: 10, fontFamily: MONO, color: '#484f58', marginBottom: 8 }}>
        Connected Memory Points ({connectedHEs.length})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {connectedHEs.map(he => (
          <div key={he.id} style={{
            background: '#161b22', border: '1px solid #30363d', borderRadius: 6, padding: 8,
          }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 3 }}>
              <span style={{ fontSize: 9, fontFamily: MONO, color: '#484f58' }}>{he.id}</span>
              <span style={{ fontSize: 9, fontFamily: MONO, color: '#484f58' }}>
                step {he.step_created} · order {he.order}
              </span>
            </div>
            <div style={{ fontSize: 10, fontFamily: SANS, color: '#8b949e', lineHeight: 1.35 }}>
              {he.description.slice(0, 200)}{he.description.length > 200 ? '…' : ''}
            </div>
          </div>
        ))}
      </div>

      {vertex.source_chunks.length > 0 && (
        <>
          <div style={{ fontSize: 10, fontFamily: MONO, color: '#484f58', marginBottom: 8, marginTop: 16 }}>
            Source Chunks ({vertex.source_chunks.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {vertex.source_chunks.slice(0, 3).map((chunk, i) => (
              <div key={i} style={{
                background: '#0d1117', border: '1px solid #21262d', borderRadius: 4, padding: 8,
                fontSize: 10, fontFamily: MONO, color: '#8b949e', lineHeight: 1.4,
                maxHeight: 80, overflow: 'hidden',
              }}>
                {chunk.slice(0, 300)}{chunk.length > 300 ? '…' : ''}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
