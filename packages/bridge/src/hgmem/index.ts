/**
 * HGMem — Hypergraph-based Working Memory for Multi-step RAG
 * Implementation of arXiv:2512.23959
 */

export { Hypergraph } from './hypergraph.js';
export { HGMemEngine } from './engine.js';
export type { HGMemConfig, HGMemSession } from './engine.js';
export { loadHGMemSessions, saveHGMemSessions } from './sessions.js';
export * from './types.js';
