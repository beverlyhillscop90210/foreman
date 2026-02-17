/**
 * foreman watch - Watch files in real-time
 */

import { FileWatcher } from '../watcher.js';

export async function watchCommand(): Promise<void> {
  const watcher = new FileWatcher();
  await watcher.start();
}

