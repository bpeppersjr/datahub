import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { acquireIndustrySourceLocks } from './industry-source-locks.mjs';

export const OK_PUBLISHER_LOCK_TASK = Object.freeze({ sourceId: 'ok-childcare-public-origin', scope: 'state', state: 'OK' });
// Shared across the fixed retained collector and the ZIP successor. A crash
// leaves an inspection-required exclusion receipt; PID age never reclaims it.
export async function withOkPublisherLock(signal, callback) {
  signal?.throwIfAborted();
  const held = await acquireIndustrySourceLocks([OK_PUBLISHER_LOCK_TASK], { runId: randomUUID() });
  try { signal?.throwIfAborted(); return await callback(); }
  finally {
    // Keep the exclusion through the inter-query gap, including cancellation.
    try { await delay(2000); } finally { await held.release(); }
  }
}
