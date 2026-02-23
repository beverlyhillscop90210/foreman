/**
 * HGMemPage — Hypergraph Memory visualization page.
 *
 * Layout: Left sidebar (session list + new query form) | Center (hypergraph visualization) | Right (session stats/response)
 * Bottom: Detail panel when a node is selected.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useHGMemStore } from '../stores/hgmemStore';
import type { HGVertex, HGHyperedge, HGMemSessionSummary } from '../stores/hgmemStore';
import { HGMemGraph, StepLegend } from '../components/hgmem/HGMemGraph';
import { HyperedgeDetail, VertexDetail } from '../components/hgmem/HGMemDetailPanel';
import { wsClient } from '../lib/ws';

const MONO = 'JetBrains Mono, monospace';
const SANS = 'Inter, sans-serif';

export default function HGMemPage() {
  const {
    sessions, selectedId, detail, graphData,
    loading, running, error,
    fetchSessions, selectSession, createAndRun, runStep, deleteSession,
  } = useHGMemStore();

  const [queryInput, setQueryInput] = useState('');
  const [projectInput, setProjectInput] = useState('default');
  const [selectedHE, setSelectedHE] = useState<HGHyperedge | null>(null);
  const [selectedVtx, setSelectedVtx] = useState<HGVertex | null>(null);
  const [showResponse, setShowResponse] = useState(false);

  // Fetch sessions on mount
  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Listen for HGMem WebSocket events
  useEffect(() => {
    wsClient.connect();
    const unsub = wsClient.onMessage((msg: any) => {
      if (typeof msg.type === 'string' && msg.type.startsWith('hgmem:')) {
        fetchSessions();
        if (selectedId && msg.sessionId === selectedId) {
          selectSession(selectedId);
        }
      }
    });
    return unsub;
  }, [fetchSessions, selectSession, selectedId]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!queryInput.trim() || running) return;
    await createAndRun(queryInput.trim(), projectInput.trim() || 'default');
    setQueryInput('');
    setShowResponse(true);
  }, [queryInput, projectInput, running, createAndRun]);

  const handleStepThrough = useCallback(async () => {
    if (!selectedId || running) return;
    const result = await runStep(selectedId);
    if (result.done) setShowResponse(true);
  }, [selectedId, running, runStep]);

  const vertices = graphData?.vertices || [];
  const hyperedges = graphData?.hyperedges || [];
  const stats = detail?.stats;
  const session = detail?.session;
  const maxStep = hyperedges.length > 0 ? Math.max(...hyperedges.map(h => h.step_created)) : 0;
  const hasDetail = selectedHE || selectedVtx;

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden', background: '#0a0a0a' }}>
      {/* ── Left Sidebar: Sessions ────────────────────────── */}
      <div style={{
        width: 260, minWidth: 260, borderRight: '1px solid #333',
        display: 'flex', flexDirection: 'column', background: '#0a0a0a',
      }}>
        {/* New Query Form */}
        <form onSubmit={handleSubmit} style={{ padding: 12, borderBottom: '1px solid #333' }}>
          <div style={{ fontSize: 10, fontFamily: MONO, color: '#484f58', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
            New Research Query
          </div>
          <textarea
            value={queryInput}
            onChange={e => setQueryInput(e.target.value)}
            placeholder="Ask a complex question..."
            style={{
              width: '100%', height: 64, resize: 'none',
              background: '#161b22', border: '1px solid #30363d', borderRadius: 4,
              color: '#e5e5e5', fontSize: 11, fontFamily: SANS, padding: 8,
              outline: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <input
              value={projectInput}
              onChange={e => setProjectInput(e.target.value)}
              placeholder="project"
              style={{
                flex: 1, background: '#161b22', border: '1px solid #30363d', borderRadius: 4,
                color: '#8b949e', fontSize: 10, fontFamily: MONO, padding: '4px 6px', outline: 'none',
              }}
            />
            <button
              type="submit"
              disabled={!queryInput.trim() || running}
              style={{
                background: running ? '#333' : '#FF6B2B',
                color: '#fff', border: 'none', borderRadius: 4,
                fontSize: 10, fontFamily: MONO, padding: '4px 10px',
                cursor: running ? 'wait' : 'pointer', opacity: !queryInput.trim() ? 0.5 : 1,
              }}
            >
              {running ? '⟳ Running...' : '▶ Run'}
            </button>
          </div>
        </form>

        {/* Session List */}
        <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
          <div style={{ fontSize: 10, fontFamily: MONO, color: '#484f58', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1, padding: '0 4px' }}>
            Sessions ({sessions.length})
          </div>
          {loading && sessions.length === 0 && (
            <div style={{ fontSize: 10, fontFamily: MONO, color: '#484f58', textAlign: 'center', marginTop: 20 }}>
              Loading...
            </div>
          )}
          {sessions.map(s => (
            <SessionCard
              key={s.id}
              session={s}
              selected={s.id === selectedId}
              onSelect={() => selectSession(s.id)}
              onDelete={() => deleteSession(s.id)}
            />
          ))}
        </div>
      </div>

      {/* ── Center: Graph + Detail ────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Action Bar */}
        {session && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
            borderBottom: '1px solid #333', background: '#0d1117',
          }}>
            <StatusBadge status={session.status} />
            <span style={{ fontSize: 11, fontFamily: SANS, color: '#c9d1d9', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {session.query}
            </span>
            <span style={{ fontSize: 9, fontFamily: MONO, color: '#484f58' }}>
              step {session.current_step}/{session.max_steps}
            </span>
            {session.status === 'active' && (
              <button
                onClick={handleStepThrough}
                disabled={running}
                style={{
                  background: '#161b22', border: '1px solid #30363d', borderRadius: 4,
                  color: '#e5e5e5', fontSize: 10, fontFamily: MONO, padding: '3px 8px',
                  cursor: running ? 'wait' : 'pointer',
                }}
              >
                {running ? '⟳' : '▶ Step'}
              </button>
            )}
            {session.response && (
              <button
                onClick={() => setShowResponse(!showResponse)}
                style={{
                  background: showResponse ? '#FF6B2B22' : '#161b22',
                  border: `1px solid ${showResponse ? '#FF6B2B' : '#30363d'}`,
                  borderRadius: 4,
                  color: showResponse ? '#FF6B2B' : '#e5e5e5',
                  fontSize: 10, fontFamily: MONO, padding: '3px 8px', cursor: 'pointer',
                }}
              >
                {showResponse ? '✕ Close' : '📝 Response'}
              </button>
            )}
            <StepLegend maxStep={maxStep} />
          </div>
        )}

        {/* Main Content Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {showResponse && session?.response ? (
            /* Response View */
            <div style={{ flex: 1, overflow: 'auto', padding: 24, background: '#0d1117' }}>
              <div style={{ maxWidth: 800 }}>
                <div style={{ fontSize: 10, fontFamily: MONO, color: '#FF6B2B', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
                  HGMem Response
                </div>
                <div style={{
                  fontSize: 13, fontFamily: SANS, color: '#c9d1d9', lineHeight: 1.65,
                  whiteSpace: 'pre-wrap',
                }}>
                  {session.response}
                </div>
              </div>
            </div>
          ) : (
            /* Graph View */
            <>
              <div style={{ flex: hasDetail ? 0.55 : 1, overflow: 'hidden' }}>
                <HGMemGraph
                  vertices={vertices}
                  hyperedges={hyperedges}
                  onSelectHyperedge={setSelectedHE}
                  onSelectVertex={setSelectedVtx}
                />
              </div>
              {hasDetail && (
                <div style={{
                  flex: 0.45, borderTop: '1px solid #333', background: '#111111', overflow: 'hidden',
                }}>
                  {selectedHE && <HyperedgeDetail hyperedge={selectedHE} vertices={vertices} />}
                  {selectedVtx && <VertexDetail vertex={selectedVtx} hyperedges={hyperedges} />}
                </div>
              )}
            </>
          )}
        </div>

        {/* Empty State */}
        {!selectedId && (
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            textAlign: 'center', color: '#484f58', fontFamily: MONO, fontSize: 12,
            pointerEvents: 'none',
          }}>
            <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }}>🧠</div>
            <div>Select a session or run a new query</div>
            <div style={{ fontSize: 10, marginTop: 4 }}>
              Multi-step RAG with hypergraph working memory
            </div>
          </div>
        )}
      </div>

      {/* ── Right Sidebar: Stats ──────────────────────────── */}
      {detail && (
        <div style={{
          width: 220, minWidth: 220, borderLeft: '1px solid #333',
          background: '#0a0a0a', overflow: 'auto', padding: 12,
        }}>
          <div style={{ fontSize: 10, fontFamily: MONO, color: '#484f58', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
            Session Stats
          </div>

          <StatCard label="Status" value={session?.status || '-'} color={session?.status === 'completed' ? '#34d399' : session?.status === 'active' ? '#fbbf24' : '#f87171'} />
          <StatCard label="Steps" value={`${stats?.steps || 0} / ${stats?.max_steps || 6}`} />
          <StatCard label="Memory Points" value={String(stats?.hyperedges || 0)} color="#FF6B2B" />
          <StatCard label="Entities" value={String(stats?.vertices || 0)} color="#38bdf8" />
          <StatCard label="Avg Order" value={(stats?.avg_order || 0).toFixed(1)} />
          <StatCard label="Max Order" value={String(stats?.max_order || 0)} />
          <StatCard label="Total Subqueries" value={String(stats?.subqueries_total || 0)} />

          {/* Subquery History */}
          {session?.subquery_history && session.subquery_history.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 10, fontFamily: MONO, color: '#484f58', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
                Subquery History
              </div>
              {session.subquery_history.map((sh, i) => (
                <div key={i} style={{ marginBottom: 8, padding: 6, background: '#161b22', borderRadius: 4, border: '1px solid #30363d' }}>
                  <div style={{ fontSize: 9, fontFamily: MONO, color: '#484f58', marginBottom: 3 }}>
                    Step {sh.step} · {sh.subqueries.length} queries
                  </div>
                  {sh.subqueries.map((sq, j) => (
                    <div key={j} style={{ fontSize: 10, fontFamily: SANS, color: '#8b949e', marginBottom: 2, display: 'flex', gap: 4 }}>
                      <span style={{
                        fontSize: 8, fontFamily: MONO, padding: '0 3px', borderRadius: 2,
                        background: sq.strategy === 'local' ? '#a78bfa18' : '#38bdf818',
                        color: sq.strategy === 'local' ? '#a78bfa' : '#38bdf8',
                        flexShrink: 0, alignSelf: 'flex-start', marginTop: 1,
                      }}>
                        {sq.strategy}
                      </span>
                      <span style={{ lineHeight: 1.3 }}>
                        {sq.query.slice(0, 60)}{sq.query.length > 60 ? '…' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Error toast */}
      {error && (
        <div style={{
          position: 'fixed', bottom: 16, right: 16, padding: '8px 16px',
          background: '#f8717122', border: '1px solid #f87171', borderRadius: 6,
          color: '#f87171', fontSize: 11, fontFamily: MONO, maxWidth: 400,
          zIndex: 999,
        }}>
          {error}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────

function SessionCard({ session, selected, onSelect, onDelete }: {
  session: HGMemSessionSummary;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      style={{
        padding: 8, marginBottom: 4, borderRadius: 6, cursor: 'pointer',
        background: selected ? '#161b22' : 'transparent',
        border: `1px solid ${selected ? '#FF6B2B44' : 'transparent'}`,
        transition: 'all 0.15s',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
        <StatusBadge status={session.status} />
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          style={{
            background: 'none', border: 'none', color: '#484f58',
            fontSize: 10, cursor: 'pointer', padding: '0 2px',
          }}
          title="Delete session"
        >
          ✕
        </button>
      </div>
      <div style={{
        fontSize: 11, fontFamily: SANS, color: '#c9d1d9',
        lineHeight: 1.35, overflow: 'hidden',
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any,
      }}>
        {session.query}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        <span style={{ fontSize: 9, fontFamily: MONO, color: '#484f58' }}>
          {session.steps}/{session.max_steps} steps
        </span>
        <span style={{ fontSize: 9, fontFamily: MONO, color: '#484f58' }}>
          {session.project}
        </span>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; fg: string }> = {
    active: { bg: '#fbbf2418', fg: '#fbbf24' },
    completed: { bg: '#34d39918', fg: '#34d399' },
    failed: { bg: '#f8717118', fg: '#f87171' },
  };
  const c = colors[status] || colors.active;
  return (
    <span style={{
      fontSize: 9, fontFamily: MONO, padding: '1px 5px', borderRadius: 3,
      background: c.bg, color: c.fg, textTransform: 'uppercase',
    }}>
      {status}
    </span>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      padding: '6px 0', borderBottom: '1px solid #21262d',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    }}>
      <span style={{ fontSize: 10, fontFamily: MONO, color: '#484f58' }}>{label}</span>
      <span style={{ fontSize: 11, fontFamily: MONO, color: color || '#e5e5e5', fontWeight: 600 }}>{value}</span>
    </div>
  );
}
