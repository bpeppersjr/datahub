import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, lstat, open, link, unlink } from 'node:fs/promises';
import { mnSelectionCanonical as canonical } from './mn-construction-retained-selection.mjs';
import { readOvertureSourcePreflight, readOvertureSourcePreflightForTest } from './overture-source-preflight.mjs';
import { readOvertureHttpfsRuntime } from './overture-httpfs-runtime.mjs';
import { createOvertureAssetTransport, createOvertureAssetTransportForTest } from './overture-asset-transport.mjs';
import { startOvertureAssetBridge } from './overture-asset-bridge.mjs';
import { createOvertureAcquisitionJournal, inspectOvertureAcquisitionJournal } from './overture-acquisition-journal.mjs';
import { runOvertureBoundedEngine } from './overture-bounded-engine.mjs';
import { OVERTURE_LARGE_ACQUISITION_CONFIRMATION, overtureStreamingQueryFingerprint } from './overture-us-places.mjs';
import { readOvertureAcquisitionSession, readOvertureAcquisitionSessionForTest } from './overture-acquisition-receipt.mjs';

const VERSION = 'overture-acquisition-session@1.0.0';
const STATUS = 'selected-source-retained-not-published';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const failure = () => new Error('Overture acquisition session did not complete; preserve operation outputs for inspection.');
const exact = (v, keys) => v && Object.getPrototypeOf(v) === Object.prototype && Reflect.ownKeys(v).length === keys.length
  && keys.every(k => Object.hasOwn(v, k)) && Object.values(Object.getOwnPropertyDescriptors(v)).every(d => Object.hasOwn(d, 'value'));
const claims = () => ({ native_acquisition_verified: false, normalized_businesses_published: false, complete_us_business_coverage: false,
  restart_resume_supported: false, process_memory_cap_enforced: false, hard_deadline_enforced: false, public_export_authorized: false });
const digest = raw => createHash('sha256').update(raw).digest('hex');
const same = (a, b) => a.ino === b.ino && a.dev === b.dev && !a.isSymbolicLink() && !b.isSymbolicLink();

function reference(v, status) {
  if (!exact(v, ['output', 'operation_id', 'descriptor']) || typeof v.output !== 'string' || v.output !== path.resolve(v.output)
    || typeof v.operation_id !== 'string' || !UUID.test(v.operation_id)) throw failure();
  const d = v.descriptor;
  if (!exact(d, ['run_id', 'operation_id', 'manifest', 'sha256', 'status', 'cancellation_after_publication'])
    || typeof d.run_id !== 'string' || !UUID.test(d.run_id) || d.operation_id !== v.operation_id
    || typeof d.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(d.sha256) || d.status !== status || d.cancellation_after_publication !== false
    || d.manifest !== path.join(v.output, 'jobs', d.run_id, 'manifest.json')) throw failure();
  return { output: v.output, operation_id: v.operation_id, descriptor: { ...d } };
}

function validate(v, synthetic) {
  const keys = ['output', 'operationId', 'metadata', 'runtime', synthetic ? 'fetchImpl' : 'authorization'];
  for (const key of synthetic ? ['signal', 'runEngine'] : ['signal']) if (Object.hasOwn(v ?? {}, key)) keys.push(key);
  if (!exact(v, keys) || typeof v.output !== 'string' || v.output !== path.resolve(v.output)
    || typeof v.operationId !== 'string' || !UUID.test(v.operationId) || path.basename(v.output) !== 'output'
    || path.basename(path.dirname(v.output)) !== v.operationId || (v.signal !== undefined && !(v.signal instanceof AbortSignal))
    || (synthetic ? typeof v.fetchImpl !== 'function' || (v.runEngine !== undefined && typeof v.runEngine !== 'function')
      : v.authorization !== OVERTURE_LARGE_ACQUISITION_CONFIRMATION)) throw failure();
  const metadata = reference(v.metadata, 'metadata-verified-no-place-acquisition'), runtime = reference(v.runtime, 'runtime-verified-no-place-acquisition');
  if (new Set([v.operationId, metadata.operation_id, runtime.operation_id]).size !== 3) throw failure();
  return { ...v, metadata, runtime };
}

async function persist(file, value) {
  const raw = Buffer.from(JSON.stringify(value) + '\n');
  if (raw.length > 1024 ** 2) throw failure();
  const handle = await open(file, 'wx+');
  try {
    const owner = await handle.stat({ bigint: true });
    await handle.writeFile(raw); await handle.sync();
    const retained = Buffer.alloc(raw.length); const result = await handle.read(retained, 0, retained.length, 0);
    for (const s of [await handle.stat({ bigint: true }), await lstat(file, { bigint: true })]) {
      if (!same(owner, s) || !s.isFile() || s.nlink !== 1n || s.size !== BigInt(raw.length)) throw failure();
    }
    if (result.bytesRead !== raw.length || !retained.equals(raw)) throw failure();
    return digest(raw);
  } finally { await handle.close(); }
}

async function acquire(value, synthetic) {
  const options = validate(value, synthetic), { output, operationId, metadata, runtime } = options;
  const controller = new AbortController(), abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true }); if (options.signal?.aborted) abort();
  const signal = controller.signal, deadline = setTimeout(abort, 4 * 60 * 60 * 1000);
  const check = () => signal.throwIfAborted();
  const readMetadata = synthetic ? readOvertureSourcePreflightForTest : readOvertureSourcePreflight;
  const readReceipt = synthetic ? readOvertureAcquisitionSessionForTest : readOvertureAcquisitionSession;
  const mode = synthetic ? 'injected-test-transport' : 'native-fetch';
  let journal, transport, bridge, descriptor, published = false;
  let diagnosticContext, phase = 'prerequisites', cleanupFailed = false;
  try {
    check();
    const preflight = (await readMetadata(metadata.descriptor, { output: metadata.output, operationId: metadata.operation_id })).manifest.result;
    await readOvertureHttpfsRuntime(runtime.descriptor, { output: runtime.output, operationId: runtime.operation_id }); check();
    await canonical(output, { create: true, output: true, signal });
    const jobs = path.join(output, 'jobs'); await canonical(jobs, { create: true, output: true, signal });
    const run = randomUUID(), directory = path.join(jobs, run); await mkdir(directory);
    const owner = await lstat(directory, { bigint: true });
    async function owned() { await canonical(directory); if (!same(owner, await lstat(directory, { bigint: true }))) throw failure(); }
    diagnosticContext = { directory, run, owned };
    phase = 'plan';
    const startedAt = new Date().toISOString(), assetUrls = preflight.assets.map(a => a.url), queryFingerprint = overtureStreamingQueryFingerprint(assetUrls.length);
    const plan = { schema_version: VERSION, run_id: run, operation_id: operationId, execution_mode: mode, started_at: startedAt,
      metadata_reference: metadata, runtime_reference: runtime, asset_urls: assetUrls, query_fingerprint: queryFingerprint };
    const planHash = await persist(path.join(directory, 'plan.json'), plan); check(); await owned();
    let execution, heads, transportCounters, retainedJournal, journalDirectory, failed = false;
    try {
      phase = 'transport-setup';
      journal = await createOvertureAcquisitionJournal({ output: path.join(directory, 'journal'), operationId, executionMode: mode, assetCount: assetUrls.length }); check();
      const transportOptions = { assetUrls, onEvent: journal.onEvent, signal };
      transport = synthetic ? createOvertureAssetTransportForTest({ ...transportOptions, fetchImpl: options.fetchImpl, limits: { minIntervalMs: 0 } })
        : createOvertureAssetTransport({ ...transportOptions, authorization: options.authorization });
      heads = [];
      phase = 'asset-heads';
      for (let index = 0; index < assetUrls.length; index++) {
        check(); const head = await transport.head(index);
        heads.push({ asset_index: index, content_length: head.contentLength, etag: head.etag });
      }
      phase = 'bridge-setup';
      check(); bridge = await startOvertureAssetBridge({ transport, assetCount: assetUrls.length, signal });
      phase = 'engine';
      execution = await (options.runEngine ?? runOvertureBoundedEngine)({ output: path.join(directory, 'engine'),
        runtimeDescriptor: runtime.descriptor, runtimeOutput: runtime.output, runtimeOperationId: runtime.operation_id, bridgeUrls: bridge.urls, signal });
      check();
    } catch { failed = true; }
    finally {
      // Independent cleanup attempts: a failed bridge close must not strand the journal or transport.
      for (const resource of [bridge, transport, journal]) if (resource) try { await resource.close(); } catch { failed = true; cleanupFailed = true; }
    }
    if (failed) throw failure(); check(); await owned();
    phase = 'accounting-verification';
    const bridgeState = bridge.snapshot(), state = transport.snapshot();
    if (bridgeState.state !== 'closed' || bridgeState.active_handlers || bridgeState.open_sockets || bridgeState.rejected_requests
      || bridgeState.completed_requests !== bridgeState.admitted_requests || state.state !== 'closed' || state.active_request || state.queued_requests) throw failure();
    journalDirectory = path.relative(directory, journal.directory).replaceAll('\\', '/');
    retainedJournal = await inspectOvertureAcquisitionJournal(journal.directory, { operationId });
    transportCounters = Object.fromEntries(['requests_reserved', 'fetch_calls', 'bytes_reserved', 'bytes_observed', 'bytes_delivered'].map(key => [key, state[key]]));
    phase = 'prerequisite-reverification';
    await readMetadata(metadata.descriptor, { output: metadata.output, operationId: metadata.operation_id });
    await readOvertureHttpfsRuntime(runtime.descriptor, { output: runtime.output, operationId: runtime.operation_id }); check();
    const manifest = { schema_version: VERSION, run_id: run, operation_id: operationId, status: STATUS, execution_mode: mode,
      started_at: startedAt, completed_at: new Date().toISOString(), metadata_reference: metadata, runtime_reference: runtime, plan_sha256: planHash,
      engine: { directory: path.relative(directory, execution.directory).replaceAll('\\', '/'), query_fingerprint: execution.query_fingerprint, engine_settings: execution.engine_settings },
      selected: { path: path.relative(directory, path.join(execution.selected.directory, execution.selected.artifact.path)).replaceAll('\\', '/'),
        bytes: execution.selected.artifact.bytes, sha256: execution.selected.artifact.sha256, record_count: execution.selected.record_count, uncompressed_bytes: execution.selected.uncompressed_bytes },
      journal: { directory: journalDirectory, sha256: retainedJournal.sha256, counters: retainedJournal.counters }, transport: transportCounters, heads, claims: claims() };
    phase = 'manifest-publication';
    const temporary = path.join(directory, 'manifest.tmp'), filename = path.join(directory, 'manifest.json');
    const hash = await persist(temporary, manifest); check(); await owned();
    descriptor = { run_id: run, operation_id: operationId, manifest: filename, sha256: hash, status: STATUS, cancellation_after_publication: false };
    await link(temporary, filename); published = true; await unlink(temporary);
    await readReceipt(descriptor, { output, operationId });
    descriptor.cancellation_after_publication = signal.aborted;
    return descriptor;
  } catch {
    // Best-effort, private diagnostic evidence only. Never alter a published
    // snapshot inventory, copy arbitrary exception text, or infer readiness.
    if (diagnosticContext && !published) try {
      await diagnosticContext.owned();
      await persist(path.join(diagnosticContext.directory, 'failure.json'), {
        schema_version: 'overture-acquisition-failure@1.0.0', operation_id: operationId,
        run_id: diagnosticContext.run, execution_mode: mode, recorded_at: new Date().toISOString(),
        phase, cancellation_requested: signal.aborted, cleanup_failed: cleanupFailed,
        transport: transport?.snapshot() ?? null, bridge: bridge?.snapshot() ?? null,
        snapshot_ready: false,
      });
    } catch { /* Preserve original failure and all existing evidence if storage is unsafe or unavailable. */ }
    const error = failure(); if (published) error.recovery = descriptor; throw error;
  } finally { clearTimeout(deadline); options.signal?.removeEventListener('abort', abort); }
}

export async function runOvertureAcquisitionSession(options) {
  try { return await acquire(options, false); } catch (error) { const fixed = failure(); if (error?.recovery) fixed.recovery = error.recovery; throw fixed; }
}
export async function runOvertureAcquisitionSessionForTest(options) {
  try { return await acquire(options, true); } catch (error) { const fixed = failure(); if (error?.recovery) fixed.recovery = error.recovery; throw fixed; }
}
