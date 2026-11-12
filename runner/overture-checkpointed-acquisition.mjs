import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readdir, statfs } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { isDeepStrictEqual } from 'node:util';
import { mnSelectionCanonical as canonical, mnSelectionReadJson as readJson } from './mn-construction-retained-selection.mjs';
import { writeReconciliationReceipt } from './reconciliation-receipt.mjs';
import { createOvertureAcquisitionJournal, inspectOvertureAcquisitionJournal } from './overture-acquisition-journal.mjs';
import { createOvertureAssetTransport, createOvertureAssetTransportForTest } from './overture-asset-transport.mjs';
import { startOvertureAssetBridge } from './overture-asset-bridge.mjs';
import { runOvertureBoundedEngine } from './overture-bounded-engine.mjs';
import { validateOvertureSelectedFile } from './overture-acquisition-receipt.mjs';
import { OVERTURE_LARGE_ACQUISITION_CONFIRMATION } from './overture-us-places.mjs';
import { SESSION_VERSION, CHECKPOINT_VERSION, ACQUISITION_STATUS, SELECTED_NAME, MAX_REQUESTS, MAX_NETWORK_BYTES, MAX_SELECTED_BYTES,
  MAX_RAW_BYTES, MAX_ROWS, uuid, sha, iso, exact, check, digestJson, bounded, assetDirectory, assetFingerprint, claims, validResume,
  acquisitionPrerequisites, acquisitionPlan, optionalStat, pinRecord, readOvertureAssetCheckpoint, auditAcquisitionLineage, selectedDescriptor,
  successorPath, successorRecord } from './overture-acquisition-checkpoints.mjs';

const SELECTED_PATH = 'selected/' + SELECTED_NAME;
const JSON_LIMIT = 1024 ** 2;
const FAILURE_VERSION = 'overture-acquisition-failure@2.0.0';
const PREREQUISITE_STATUSES = ['metadata-verified-no-place-acquisition', 'runtime-verified-no-place-acquisition'];
const ENGINE_PLAN = Object.freeze({ query_fingerprint: assetFingerprint, strategy: 'one-asset-at-a-time' });
const modeFor = synthetic => synthetic ? 'injected-test-transport' : 'native-fetch';
const failure = () => new Error('Overture acquisition session did not complete; preserve operation outputs for inspection.');
const posixRelative = (base, file) => path.relative(base, file).split(path.sep).join('/');
const sameFile = (before, after) => before?.isFile() && after?.isFile() && before.nlink === 1n && after.nlink === 1n
  && before.dev === after.dev && before.ino === after.ino;
const sameDirectory = (before, after) => before?.isDirectory() && after?.isDirectory()
  && before.dev === after.dev && before.ino === after.ino;

async function verifyDirectory(directory, owner, signal) {
  await canonical(directory, { signal });
  check(sameDirectory(owner, await optionalStat(directory)));
}

function scope(output, operationId) {
  check(typeof output === 'string' && output === path.resolve(output) && uuid(operationId) && path.basename(output) === 'output'
    && path.basename(path.dirname(output)) === operationId);
  return path.dirname(path.dirname(output));
}

function references(root, operationId, metadata, runtime, resume, synthetic) {
  if (resume !== null && resume !== undefined) check(validResume(resume));
  const ids = [operationId];
  for (const [index, reference] of [metadata, runtime].entries()) {
    check(exact(reference, ['output', 'operation_id', 'descriptor']) && uuid(reference.operation_id)
      && (reference.output === path.join(root, reference.operation_id, 'output') || (synthetic && index === 1)));
    const descriptor = reference.descriptor;
    check(exact(descriptor, ['run_id', 'operation_id', 'manifest', 'sha256', 'status', 'cancellation_after_publication'])
      && uuid(descriptor.run_id) && descriptor.operation_id === reference.operation_id
      && descriptor.manifest === path.join(reference.output, 'jobs', descriptor.run_id, 'manifest.json')
      && sha(descriptor.sha256) && descriptor.status === PREREQUISITE_STATUSES[index] && descriptor.cancellation_after_publication === false);
    ids.push(reference.operation_id);
  }
  if (resume) ids.push(resume.operationId);
  check(new Set(ids).size === ids.length);
}

async function persist(filename, value, signal) {
  signal?.throwIfAborted();
  await canonical(path.dirname(filename), { signal });
  check(!await optionalStat(filename) && Buffer.byteLength(JSON.stringify(value, null, 2)) < JSON_LIMIT);
  await writeReconciliationReceipt(filename, value);
  const meter = {};
  check(isDeepStrictEqual(await readJson(filename, JSON_LIMIT, undefined, meter), value));
  return meter.sha256;
}

// SQLite's OS-backed file lock is released when a worker exits, including
// forced termination. The file stays in place so contenders share one inode.
async function lockAcquisition(root, signal) {
  await canonical(root, { signal });
  const filename = path.join(root, '.overture-acquisition-lock.sqlite');
  const seed = await open(filename, 'wx').catch(error => { if (error.code === 'EEXIST') return null; throw error; });
  await seed?.close();
  const before = await optionalStat(filename);
  check(sameFile(before, before));
  const { DatabaseSync } = await import('node:sqlite');
  const database = new DatabaseSync(filename);
  try {
    database.exec('PRAGMA busy_timeout=0; BEGIN IMMEDIATE;');
    const assertOwned = async () => {
      signal.throwIfAborted();
      await canonical(root, { signal });
      check(sameFile(before, await optionalStat(filename)));
    };
    await assertOwned();
    return { assertOwned, close: () => database.close() };
  } catch (error) { database.close(); throw error; }
}

function auditBridge(bridge, transport) {
  const bridgeState = bridge.snapshot(), state = transport.snapshot();
  check(bridgeState.state === 'closed' && !bridgeState.active_handlers && !bridgeState.open_sockets && !bridgeState.rejected_requests
    && bridgeState.completed_requests === bridgeState.admitted_requests && state.state === 'closed' && !state.active_request && !state.queued_requests);
}

async function acquireAsset({ directory, plan, planHash, index, options, signal, verifyRun, synthetic, priorHead, budget, completed, diagnostic }) {
  const asset = assetDirectory(directory, index);
  await verifyRun();
  await canonical(path.dirname(asset), { signal });
  await mkdir(asset);
  const owner = await optionalStat(asset);
  async function verifyAsset() {
    await verifyRun();
    await verifyDirectory(asset, owner, signal);
  }
  let journal, transport, bridge, execution, pinHash, failure;
  try {
    diagnostic.phase = 'transport-setup';
    journal = await createOvertureAcquisitionJournal({ output: path.join(asset, 'journal'), operationId: plan.operation_id,
      executionMode: plan.execution_mode, assetCount: 1 });
    const onEvent = async event => {
      await verifyAsset();
      if (event.type === 'request-reserved') {
        check(budget.requests_reserved < MAX_REQUESTS && budget.bytes_reserved + event.reserved_bytes <= MAX_NETWORK_BYTES);
        await journal.onEvent(event);
        budget.requests_reserved++; budget.bytes_reserved += event.reserved_bytes;
      } else await journal.onEvent(event);
    };
    const transportOptions = { assetUrls: [plan.assets[index].url], onEvent, signal };
    transport = synthetic ? createOvertureAssetTransportForTest({ ...transportOptions, fetchImpl: options.fetchImpl, limits: { minIntervalMs: 0 } })
      : createOvertureAssetTransport({ ...transportOptions, authorization: options.authorization });
    diagnostic.phase = 'asset-head';
    const head = await transport.head(0);
    const pinned = { content_length: head.contentLength, etag: head.etag };
    check(!priorHead || isDeepStrictEqual(priorHead, pinned));
    pinHash = await persist(path.join(asset, 'pin.json'), pinRecord(plan, planHash, index, pinned), signal);
    diagnostic.phase = 'asset-engine';
    const bridgeTransport = { ...transport, head: async index => { check(index === 0); return { ...head }; } };
    bridge = await startOvertureAssetBridge({ transport: bridgeTransport, assetCount: 1, signal });
    const runtime = plan.runtime_reference;
    execution = await (options.runEngine ?? runOvertureBoundedEngine)({ output: path.join(asset, 'engine'),
      runtimeDescriptor: runtime.descriptor, runtimeOutput: runtime.output, runtimeOperationId: runtime.operation_id, bridgeUrls: bridge.urls, signal });
    signal.throwIfAborted();
  } catch (error) { failure = error; }
  finally {
    for (const resource of [bridge, transport, journal]) if (resource) try { await resource.close(); }
    catch (error) { failure ??= error; diagnostic.cleanup_failed = true; }
    diagnostic.transport = transport?.snapshot() ?? null;
    diagnostic.bridge = bridge?.snapshot() ?? null;
  }
  if (failure) throw failure;
  diagnostic.phase = 'asset-verification';
  await verifyAsset();
  auditBridge(bridge, transport);
  const retained = await inspectOvertureAcquisitionJournal(journal.directory, { operationId: plan.operation_id });
  check(retained.pending_request === null && retained.counters.requests_completed === transport.snapshot().fetch_calls);
  const { selected } = execution, selectedFile = path.join(selected.directory, selected.artifact.path);
  const selectedEvidence = { path: posixRelative(asset, selectedFile), bytes: selected.artifact.bytes, sha256: selected.artifact.sha256,
    record_count: selected.record_count, uncompressed_bytes: selected.uncompressed_bytes };
  check(selectedDescriptor(selectedEvidence) && selectedEvidence.record_count <= plan.assets[index].declared_rows);
  const checkpoint = { schema_version: CHECKPOINT_VERSION, pin_sha256: pinHash, completed_at: new Date().toISOString(),
    engine: { directory: posixRelative(asset, execution.directory), query_fingerprint: execution.query_fingerprint, engine_settings: execution.engine_settings },
    selected: selectedEvidence, journal: { directory: posixRelative(asset, journal.directory), sha256: retained.sha256, counters: retained.counters } };
  check(checkpoint.engine.query_fingerprint === assetFingerprint);
  const checkpointFile = path.join(asset, 'checkpoint.json');
  const evidence = await readOvertureAssetCheckpoint(directory, plan, planHash, index, { signal, unpublishedCheckpoint: checkpoint });
  selectedTotals([...completed.values(), evidence]);
  await validateOvertureSelectedFile(evidence.selectedFile, selectedEvidence, { signal });
  evidence.reference.sha256 = await persist(checkpointFile, checkpoint, signal);
  return evidence;
}

function selectedTotals(ordered) {
  const selected = { path: SELECTED_PATH, bytes: 0, record_count: 0, uncompressed_bytes: 0 };
  for (const asset of ordered) for (const key of ['bytes', 'record_count', 'uncompressed_bytes']) selected[key] += asset.checkpoint.selected[key];
  check(bounded(selected.bytes, 1, MAX_SELECTED_BYTES) && bounded(selected.record_count, 0, MAX_ROWS) && bounded(selected.uncompressed_bytes, 0, MAX_RAW_BYTES));
  return selected;
}

async function combine(directory, ordered, signal) {
  const selected = selectedTotals(ordered), digest = createHash('sha256');
  const selectedDirectory = path.join(directory, 'selected');
  await mkdir(selectedDirectory);
  const filename = path.join(directory, selected.path);
  const output = await open(filename, 'wx');
  try {
    let nextDiskCheck = 0, bytes = 0;
    async function onCompressed(chunk) {
      signal.throwIfAborted();
      if (bytes >= nextDiskCheck) {
        const space = await statfs(directory, { bigint: true });
        check(space.bavail * space.bsize >= 5n * 1024n ** 3n);
        nextDiskCheck = bytes + 64 * 1024 ** 2;
      }
      await output.writeFile(chunk);
      bytes += chunk.length; digest.update(chunk);
    }
    for (const asset of ordered) await validateOvertureSelectedFile(asset.selectedFile, asset.checkpoint.selected, { signal, onCompressed });
    check(bytes === selected.bytes);
    await output.sync();
    const stat = await output.stat({ bigint: true });
    check(sameFile(stat, await optionalStat(filename)) && stat.size === BigInt(selected.bytes));
    return { ...selected, sha256: digest.digest('hex') };
  } finally { await output.close(); }
}

const journalSummary = (ordered, budget) => {
  const checkpoints = ordered.map(asset => asset.reference);
  return { sha256: digestJson(checkpoints), checkpoints, lineage_budget: budget };
};

async function run(value, synthetic) {
  const required = ['output', 'operationId', 'metadata', 'runtime', synthetic ? 'fetchImpl' : 'authorization'];
  const optional = synthetic ? ['resume', 'signal', 'runEngine'] : ['resume', 'signal'];
  check(exact(value, [...required, ...optional.filter(key => Object.hasOwn(value ?? {}, key))]));
  const options = { ...value };
  const { output, operationId, metadata, runtime, resume } = options;
  const root = scope(output, operationId), mode = modeFor(synthetic);
  references(root, operationId, metadata, runtime, resume, synthetic);
  check(options.signal === undefined || options.signal instanceof AbortSignal);
  check(synthetic ? typeof options.fetchImpl === 'function' && (options.runEngine === undefined || typeof options.runEngine === 'function')
    : options.authorization === OVERTURE_LARGE_ACQUISITION_CONFIRMATION);
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(4 * 60 * 60 * 1000)]) : AbortSignal.timeout(4 * 60 * 60 * 1000);
  signal.throwIfAborted();
  let lock, directory, owner, descriptor;
  const diagnostic = { phase: 'plan', asset_index: null, cleanup_failed: false, transport: null, bridge: null };
  try {
    lock = await lockAcquisition(root, signal);
    check(!await optionalStat(output));
    const prerequisites = await acquisitionPrerequisites(metadata, runtime, synthetic);
    const jobs = path.join(output, 'jobs');
    const startedAt = new Date().toISOString();
    directory = path.join(jobs, randomUUID());
    const context = { mode, metadata, runtime, prerequisites };
    const plan = acquisitionPlan({ ...context, directory, operationId, startedAt, resume });
    const prior = await auditAcquisitionLineage({ root, current: { directory, plan }, context, signal });
    if (resume) check(prior.completed.size > 0 || prior.pins.size > 0);
    if (prior.completed.size) selectedTotals([...prior.completed.values()]);
    for (const asset of prior.completed.values()) await validateOvertureSelectedFile(asset.selectedFile, asset.checkpoint.selected, { signal });
    await canonical(directory, { create: true, output: true, signal });
    owner = await optionalStat(directory);
    async function verifyRun() {
      await lock.assertOwned();
      await verifyDirectory(directory, owner, signal);
    }
    await verifyRun();
    await mkdir(path.join(directory, 'assets'));
    const planHash = await persist(path.join(directory, 'plan.json'), plan, signal);
    if (resume) {
      const successor = successorPath(root, resume.operationId);
      await canonical(path.dirname(successor), { create: true, output: true, signal });
      await persist(successor, successorRecord(resume.operationId, plan), signal);
    }
    let needsPacing = Boolean(resume);
    for (const index of plan.assets.keys()) {
      if (prior.completed.has(index)) continue;
      if (needsPacing && !synthetic) await delay(250, undefined, { signal });
      diagnostic.asset_index = index;
      const asset = await acquireAsset({ directory, plan, planHash, index, options, signal, verifyRun, synthetic,
        priorHead: prior.pins.get(index), budget: prior.budget, completed: prior.completed, diagnostic });
      prior.completed.set(index, asset); needsPacing = true;
    }
    diagnostic.phase = 'combine';
    diagnostic.asset_index = null;
    const ordered = [...plan.assets.keys()].map(index => prior.completed.get(index));
    const selected = await combine(directory, ordered, signal);
    diagnostic.phase = 'manifest-publication';
    await acquisitionPrerequisites(metadata, runtime, synthetic);
    await verifyRun();
    const manifest = { schema_version: SESSION_VERSION, run_id: plan.run_id, operation_id: operationId, status: ACQUISITION_STATUS,
      execution_mode: mode, started_at: startedAt, completed_at: new Date().toISOString(), metadata_reference: metadata, runtime_reference: runtime,
      plan_sha256: planHash, selected, journal: journalSummary(ordered, prior.budget),
      engine: ENGINE_PLAN,
      resume: plan.resume, claims };
    const filename = path.join(directory, 'manifest.json'), hash = await persist(filename, manifest, signal);
    descriptor = { run_id: plan.run_id, operation_id: operationId, manifest: filename, sha256: hash, status: ACQUISITION_STATUS,
      cancellation_after_publication: signal.aborted };
    return descriptor;
  } catch {
    if (owner && !descriptor) try {
      await verifyDirectory(directory, owner);
      if (!await optionalStat(path.join(directory, 'manifest.json'))) {
        await persist(path.join(directory, 'failure.json'), { schema_version: FAILURE_VERSION, operation_id: operationId, run_id: path.basename(directory),
          execution_mode: mode, recorded_at: new Date().toISOString(), ...diagnostic, cancellation_requested: signal.aborted, snapshot_ready: false });
      }
    } catch { /* Keep the original error if diagnostic storage is unavailable. */ }
    throw failure();
  } finally { lock?.close(); }
}

export async function runCheckpointedAcquisition(options) { try { return await run(options, false); } catch { throw failure(); } }
export async function runCheckpointedAcquisitionForTest(options) { try { return await run(options, true); } catch { throw failure(); } }

export async function readCheckpointedAcquisition(descriptor, options, synthetic) {
  check(exact(options, ['output', 'operationId', ...['startedAt', 'signal'].filter(key => Object.hasOwn(options ?? {}, key))]));
  const { output, operationId, startedAt, signal } = options;
  const root = scope(output, operationId), mode = modeFor(synthetic);
  check((startedAt === undefined || iso(startedAt)) && (signal === undefined || signal instanceof AbortSignal));
  check(exact(descriptor, ['run_id', 'operation_id', 'status', 'manifest', 'sha256', 'cancellation_after_publication'])
    && uuid(descriptor.run_id) && descriptor.operation_id === operationId && descriptor.status === ACQUISITION_STATUS && sha(descriptor.sha256)
    && typeof descriptor.cancellation_after_publication === 'boolean');
  const directory = path.join(output, 'jobs', descriptor.run_id), meter = {};
  check(descriptor.manifest === path.join(directory, 'manifest.json'));
  const manifest = await readJson(descriptor.manifest, JSON_LIMIT, signal, meter);
  check(meter.sha256 === descriptor.sha256 && exact(manifest, ['schema_version', 'run_id', 'operation_id', 'status', 'execution_mode', 'started_at',
    'completed_at', 'metadata_reference', 'runtime_reference', 'plan_sha256', 'selected', 'journal', 'engine', 'resume', 'claims'])
    && manifest.schema_version === SESSION_VERSION && manifest.run_id === descriptor.run_id && manifest.operation_id === operationId
    && manifest.status === ACQUISITION_STATUS && manifest.execution_mode === mode && isDeepStrictEqual(manifest.claims, claims)
    && iso(manifest.started_at) && (!startedAt || manifest.started_at >= startedAt) && iso(manifest.completed_at)
    && manifest.completed_at >= manifest.started_at && Date.parse(manifest.completed_at) <= Date.now() + 5000);
  const metadata = manifest.metadata_reference, runtime = manifest.runtime_reference, resume = manifest.resume;
  references(root, operationId, metadata, runtime, resume, synthetic);
  const prerequisites = await acquisitionPrerequisites(metadata, runtime, synthetic);
  check(manifest.started_at >= prerequisites.after);
  const context = { mode, metadata, runtime, prerequisites }, planMeter = {};
  const planFile = path.join(directory, 'plan.json');
  const plan = await readJson(planFile, JSON_LIMIT, signal, planMeter);
  check(planMeter.sha256 === manifest.plan_sha256
    && isDeepStrictEqual(plan, acquisitionPlan({ ...context, directory, operationId, startedAt: manifest.started_at, resume })));
  check(isDeepStrictEqual(manifest.engine, ENGINE_PLAN));
  const audit = await auditAcquisitionLineage({ root, current: { directory, plan, planHash: planMeter.sha256 }, context, signal, requireCurrentClaim: true });
  check(audit.completed.size === plan.assets.length);
  const ordered = [...plan.assets.keys()].map(index => audit.completed.get(index));
  check(isDeepStrictEqual(manifest.journal, journalSummary(ordered, audit.budget)));
  check(audit.currentJournals.length === ordered.filter(asset => asset.reference.operation_id === operationId).length);
  const digest = createHash('sha256');
  for (const asset of ordered) {
    check(asset.checkpoint.completed_at <= manifest.completed_at);
    await validateOvertureSelectedFile(asset.selectedFile, asset.checkpoint.selected, { signal, onCompressed: chunk => { digest.update(chunk); } });
  }
  const selected = { ...selectedTotals(ordered), sha256: digest.digest('hex') };
  check(isDeepStrictEqual(manifest.selected, selected));
  await validateOvertureSelectedFile(path.join(directory, selected.path), selected, { signal });
  await acquisitionPrerequisites(metadata, runtime, synthetic);
  await canonical(path.join(directory, 'selected'), { signal });
  check(isDeepStrictEqual((await readdir(directory)).sort(), ['assets', 'manifest.json', 'plan.json', 'selected'])
    && isDeepStrictEqual(await readdir(path.join(directory, 'selected')), [SELECTED_NAME]));
  const expectedAssets = ordered.filter(asset => asset.reference.operation_id === operationId)
    .map(asset => path.basename(assetDirectory(directory, asset.reference.asset_index)));
  const assetsRoot = path.join(directory, 'assets');
  await canonical(assetsRoot, { signal });
  check(isDeepStrictEqual((await readdir(assetsRoot)).sort(), expectedAssets));
  const finalMeter = {}, finalPlanMeter = {};
  await readJson(planFile, JSON_LIMIT, signal, finalPlanMeter);
  await readJson(descriptor.manifest, JSON_LIMIT, signal, finalMeter);
  check(finalMeter.sha256 === meter.sha256 && sameFile(meter.identity, finalMeter.identity)
    && finalPlanMeter.sha256 === planMeter.sha256 && sameFile(planMeter.identity, finalPlanMeter.identity));
  return { manifest, sha256: descriptor.sha256, verification: { artifact_integrity_verified: true, selected_field_contract_verified: true, native_source_replayed: false } };
}
