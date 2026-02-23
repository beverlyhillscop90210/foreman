/**
 * HGMem Session Persistence — file-based, matching DAG/Task persistence pattern.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { HGMemEngine } from './engine.js';

const HGMEM_FILE = process.env.HGMEM_FILE || '/home/foreman/data/hgmem-sessions.json';

export function loadHGMemSessions(engine: HGMemEngine): void {
  try {
    if (existsSync(HGMEM_FILE)) {
      const data = JSON.parse(readFileSync(HGMEM_FILE, 'utf-8'));
      if (Array.isArray(data)) {
        engine.restoreSessions(data);
        console.log(`Loaded ${data.length} HGMem sessions from ${HGMEM_FILE}`);
      }
    }
  } catch (e) {
    console.error('Failed to load HGMem sessions:', e);
  }
}

export function saveHGMemSessions(engine: HGMemEngine): void {
  try {
    const dir = HGMEM_FILE.substring(0, HGMEM_FILE.lastIndexOf('/'));
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const data = engine.exportSessions();
    writeFileSync(HGMEM_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Failed to save HGMem sessions:', e);
  }
}
