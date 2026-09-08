import { randomUUID, createHash } from 'node:crypto';
import { open, lstat, unlink } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { mnConstructionFailure } from './mn-construction-diagnostics.mjs';
import { APP_ROOT } from './paths.mjs';
import { mnSelectionCanonical as canonical, mnSelectionReadJson as readJson } from './mn-construction-retained-selection.mjs';

const ROOT = path.join(APP_ROOT, 'data/business-sources/mn-dli-construction/runtime');
const FILE = path.join(ROOT, 'publisher.lock');
const check = (value, reason) => { if (!value) throw new Error(`Minnesota publisher lock rejected: ${reason}.`); };
const digest = raw => createHash('sha256').update(raw).digest('hex');
const sameFile = (a, b) => a && b && b.isFile() && !b.isSymbolicLink() && b.nlink === 1n && a.ino === b.ino && a.dev === b.dev;
const sameDirectory = (a, b) => a && b && b.isDirectory() && !b.isSymbolicLink() && a.ino === b.ino && a.dev === b.dev;

/** One fixed publisher gate for both cohorts in this app installation. Does not
 * grant source-use permission, enroll a worker, retry, or recover abandoned locks.
 * Work must await all its requests and cooperate with cancellation before return.
 */
export async function withMnConstructionPublisherLock(options, work) {
  check(options && typeof options === 'object' && !Array.isArray(options)
    && Object.keys(options).every(key => ['runId','cohort','signal'].includes(key)), 'options');
  const { runId, cohort, signal } = options;
  check(typeof runId === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(runId)
    && ['registrations','residential'].includes(cohort) && typeof work === 'function'
    && (signal === undefined || signal instanceof AbortSignal), 'run, cohort or callback');
  signal?.throwIfAborted();
  await canonical(ROOT, { create: true, output: true, signal });
  const directoryOwner = await lstat(ROOT, { bigint: true }); signal?.throwIfAborted();
  let handle;
  try { handle = await open(FILE, 'wx+'); }
  catch (error) {
    if (error.code === 'EEXIST') throw Object.assign(new Error('Minnesota publisher gate is occupied; wait for the owning app job or inspect an abandoned lock. No request started.'), { code: 'MN_PUBLISHER_BUSY' });
    throw new Error('Minnesota publisher lock could not be created; no request started.');
  }
  let owner, expected, initialized = false;
  const record = Object.freeze({ schema_version: 'mn-construction-publisher-lock@1.0.0', lease_id: randomUUID(), run_id: runId, cohort,
    publisher_budget: 'mn-dli-construction', pid: process.pid, acquired_at: new Date().toISOString() });
  async function assertHeld() {
    await canonical(ROOT);
    check(sameDirectory(directoryOwner, await lstat(ROOT, { bigint: true })), 'directory ownership changed');
    const meter = {}, stored = await readJson(FILE, 4096, undefined, meter);
    check(sameFile(owner, meter.identity) && sameFile(owner, await handle.stat({ bigint: true }))
      && meter.sha256 === expected && JSON.stringify(stored) === JSON.stringify(record), 'lock ownership or bytes changed');
  }
  let result, failure;
  try {
    owner = await handle.stat({ bigint: true }); check(owner.isFile() && owner.nlink === 1n, 'new file ownership');
    const raw = Buffer.from(JSON.stringify(record) + '\n'); expected = digest(raw);
    await handle.writeFile(raw); initialized = true;
    // Once complete bytes have been written, cleanup must validate their digest
    // even if fsync or the first ownership check fails. Never downgrade a
    // corrupted complete record to inode-only partial-file cleanup.
    await handle.sync(); await assertHeld();
    signal?.throwIfAborted();
    result = await work(Object.freeze({ lease: record, signal, assertHeld }));
    signal?.throwIfAborted(); await assertHeld();
  } catch(error) { failure = Object.assign(mnConstructionFailure(error,'app-finalization-failed'),{message:'Minnesota publisher work failed or was cancelled; source job must report its terminal outcome.'}); }
  // Keep the gate through a fixed handover gap, including failures/cancellation.
  // It is intentionally not abortable: a cancelled job must not let the next job
  // skip provider pacing. Never release while an unawaited callback is still live.
  if (initialized) await delay(1000);
  try {
    if (initialized) await assertHeld();
    else {
      await canonical(ROOT);
      check(sameDirectory(directoryOwner, await lstat(ROOT, { bigint: true })) && sameFile(owner, await lstat(FILE, { bigint: true })), 'incomplete lock ownership changed');
    }
    await handle.close(); handle = null;
    // Recheck the named identity after closing, before removing only our lock.
    check(sameFile(owner, await lstat(FILE, { bigint: true })), 'release ownership changed');
    await unlink(FILE);
  } catch {
    await handle?.close().catch(() => {});
    throw new Error('Minnesota publisher lock release failed; evidence was preserved for inspection. Do not automatically take over this gate.');
  }
  signal?.throwIfAborted(); if (failure) throw failure;
  return { result, publisher_lease: record, handover_gap_ms: 1000, lock_released: true, app_job_enrolled: false };
}
