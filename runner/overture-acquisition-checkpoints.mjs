import path from 'node:path';
import { createHash } from 'node:crypto';
import { lstat, readdir } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { mnSelectionCanonical as canonical, mnSelectionReadJson as readJson } from './mn-construction-retained-selection.mjs';
import { inspectOvertureAcquisitionCheckpointJournal } from './overture-acquisition-journal.mjs';
import { readOvertureSourcePreflight, readOvertureSourcePreflightForTest } from './overture-source-preflight.mjs';
import { readOvertureHttpfsRuntime } from './overture-httpfs-runtime.mjs';
import { OVERTURE_ENGINE_RECEIPT_SETTINGS } from './overture-acquisition-receipt.mjs';
import { overtureStreamingQueryFingerprint } from './overture-us-places.mjs';

export const SESSION_VERSION = 'overture-acquisition-session@2.0.0';
export const CHECKPOINT_VERSION = 'overture-selected-asset-checkpoint@1.0.0';
export const ACQUISITION_STATUS = 'selected-source-retained-not-published';
export const SELECTED_NAME = 'selected-us-places.jsonl.gz';
export const MAX_REQUESTS = 100000;
export const MAX_NETWORK_BYTES = 32 * 1024 ** 3;
export const MAX_SELECTED_BYTES = 4 * 1024 ** 3;
export const MAX_RAW_BYTES = 16 * 1024 ** 3;
export const MAX_ROWS = 20_000_000;
export const MAX_ATTEMPTS = 8;
const JSON_LIMIT = 1024 ** 2;
export const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
export const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
export const exact = (value, keys) => value && Object.getPrototypeOf(value) === Object.prototype && Reflect.ownKeys(value).length === keys.length
  && keys.every(key => Object.hasOwn(value, key) && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'));
export const check = value => { if (!value) throw Error('Overture acquisition checkpoint verification failed; preserve operation evidence.'); };
export const digestJson = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const bounded = (value, minimum, maximum) => Number.isSafeInteger(value) && value >= minimum && value <= maximum;
export const assetDirectory = (directory, index) => path.join(directory, 'assets', String(index).padStart(2, '0'));
export const successorPath = (root, operationId) => path.join(root, '.overture-recovery', operationId + '.json');
export const successorRecord = (previousId, plan) => ({
  schema_version: 'overture-acquisition-successor@1.0.0', previous_operation_id: previousId, operation_id: plan.operation_id, run_id: plan.run_id,
});
export const assetFingerprint = overtureStreamingQueryFingerprint(1);
const relative = (directory, filename) => path.relative(directory, filename).split(path.sep).join('/');

export const claims = Object.freeze({ native_acquisition_verified: false, normalized_businesses_published: false, complete_us_business_coverage: false,
  restart_resume_supported: true, process_memory_cap_enforced: false, hard_deadline_enforced: false, public_export_authorized: false });

export function validResume(value) {
  return exact(value, ['operationId', 'receiptSha256']) && uuid(value.operationId) && sha(value.receiptSha256);
}

export async function acquisitionPrerequisites(metadata, runtime, synthetic) {
  const readMetadata = synthetic ? readOvertureSourcePreflightForTest : readOvertureSourcePreflight;
  const verified = await readMetadata(metadata.descriptor, { output: metadata.output, operationId: metadata.operation_id });
  const checkedRuntime = await readOvertureHttpfsRuntime(runtime.descriptor, { output: runtime.output, operationId: runtime.operation_id });
  return { assets: verified.manifest.result.assets, release: verified.manifest.result.release_id,
    after: [verified.manifest.completed_at, checkedRuntime.manifest.completed_at].sort().at(-1) };
}

export function acquisitionPlan({ directory, operationId, mode, startedAt, metadata, runtime, prerequisites, resume }) {
  return { schema_version: SESSION_VERSION, run_id: path.basename(directory), operation_id: operationId, execution_mode: mode, started_at: startedAt,
    metadata_reference: metadata, runtime_reference: runtime, release_id: prerequisites.release,
    assets: prerequisites.assets.map(({ url, num_rows }) => ({ url, declared_rows: num_rows })),
    asset_query_fingerprint: assetFingerprint, resume: resume ?? null };
}

export async function optionalStat(filename) {
  return lstat(filename, { bigint: true }).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
}

async function inventory(directory, names) {
  await canonical(directory);
  check((await optionalStat(directory))?.isDirectory());
  check(isDeepStrictEqual((await readdir(directory)).sort(), [...names].sort()));
}

export function validHead(head) {
  return exact(head, ['content_length', 'etag']) && bounded(head.content_length, 1, MAX_NETWORK_BYTES)
    && typeof head.etag === 'string' && /^"[\x21\x23-\x7e]{1,254}"$/.test(head.etag);
}

export function pinRecord(plan, planHash, index, head) {
  return { schema_version: CHECKPOINT_VERSION, plan_sha256: planHash, asset_index: index, asset_url: plan.assets[index].url, head };
}

export function selectedDescriptor(selected) {
  return exact(selected, ['path', 'bytes', 'sha256', 'record_count', 'uncompressed_bytes'])
    && typeof selected.path === 'string' && sha(selected.sha256) && bounded(selected.bytes, 1, MAX_SELECTED_BYTES)
    && bounded(selected.record_count, 0, MAX_ROWS) && bounded(selected.uncompressed_bytes, 0, MAX_RAW_BYTES);
}

async function readAsset(directory, plan, planHash, index, { signal, unpublishedCheckpoint = null } = {}) {
  const asset = assetDirectory(directory, index);
  await canonical(asset, { signal });
  if (!await optionalStat(asset)) { check(!unpublishedCheckpoint); return {}; }
  const journalRoot = path.join(asset, 'journal');
  const pinFile = path.join(asset, 'pin.json'), checkpointFile = path.join(asset, 'checkpoint.json');
  const pinMeter = {}, pinStat = await optionalStat(pinFile);
  const pin = pinStat ? await readJson(pinFile, JSON_LIMIT, signal, pinMeter) : null;
  if (pinStat) check(pin && validHead(pin.head) && isDeepStrictEqual(pin, pinRecord(plan, planHash, index, pin.head)));
  const checkpointMeter = {};
  const onDisk = await optionalStat(checkpointFile);
  check(!unpublishedCheckpoint || !onDisk);
  const checkpoint = unpublishedCheckpoint ?? (onDisk ? await readJson(checkpointFile, JSON_LIMIT, signal, checkpointMeter) : null);
  if (onDisk) check(checkpoint);
  let journal, journalRun;
  await canonical(journalRoot, { signal });
  if (await optionalStat(journalRoot)) {
    const names = await readdir(journalRoot);
    check(names.length <= 1 && names.every(uuid));
    if (names.length) {
      journalRun = path.join(journalRoot, names[0]);
      await canonical(journalRun, { signal });
      if (await optionalStat(path.join(journalRun, 'events.jsonl'))) {
        journal = await inspectOvertureAcquisitionCheckpointJournal(journalRun, plan.operation_id, { signal, allowUnterminatedTail: !checkpoint });
        check(journal.asset_count === 1 && journal.execution_mode === plan.execution_mode || !pin && !checkpoint && journal.asset_count === null);
      }
    }
  }
  if (journal?.counters.requests_reserved) check(journal.first_method === 'HEAD' && journal.head_requests === 1);
  if (pin) check(journal?.completed_methods.includes('HEAD'));
  else check(!journal || journal.counters.requests_reserved === journal.head_requests);
  if (!checkpoint) return { pin, journal };
  check(exact(checkpoint, ['schema_version', 'pin_sha256', 'completed_at', 'engine', 'selected', 'journal'])
    && checkpoint.schema_version === CHECKPOINT_VERSION && pin && checkpoint.pin_sha256 === pinMeter.sha256
    && iso(checkpoint.completed_at) && checkpoint.completed_at >= plan.started_at && Date.parse(checkpoint.completed_at) <= Date.now() + 5000);
  check(exact(checkpoint.engine, ['directory', 'query_fingerprint', 'engine_settings']) && /^engine\/[a-f0-9-]{36}$/.test(checkpoint.engine.directory)
    && uuid(checkpoint.engine.directory.slice(7)) && checkpoint.engine.query_fingerprint === assetFingerprint
    && isDeepStrictEqual(checkpoint.engine.engine_settings, OVERTURE_ENGINE_RECEIPT_SETTINGS));
  check(selectedDescriptor(checkpoint.selected) && checkpoint.selected.record_count <= plan.assets[index].declared_rows);
  const prefix = checkpoint.engine.directory + '/selected/';
  const selectedRun = checkpoint.selected.path.slice(prefix.length).split('/')[0];
  check(uuid(selectedRun) && checkpoint.selected.path === prefix + selectedRun + '/' + SELECTED_NAME);
  check(journal && journal.pending_request === null && journal.completed_methods.includes('HEAD') && journal.completed_methods.includes('GET')
    && isDeepStrictEqual(checkpoint.journal, { directory: relative(asset, journalRun), sha256: journal.sha256, counters: journal.counters }));
  await inventory(asset, ['pin.json', 'engine', 'journal', ...(unpublishedCheckpoint ? [] : ['checkpoint.json'])]);
  const engineDirectory = path.join(asset, checkpoint.engine.directory);
  await inventory(path.join(asset, 'engine'), [path.basename(engineDirectory)]);
  await inventory(engineDirectory, ['home', 'extensions', 'spill', 'selected']);
  for (const child of ['home', 'extensions', 'spill']) await inventory(path.join(engineDirectory, child), []);
  await inventory(path.join(engineDirectory, 'selected'), [selectedRun]);
  const selectedFile = path.join(asset, checkpoint.selected.path);
  await inventory(path.dirname(selectedFile), [SELECTED_NAME]);
  return { pin, journal, checkpoint, reference: { operation_id: plan.operation_id, run_id: plan.run_id, asset_index: index, sha256: checkpointMeter.sha256 },
    selectedFile };
}

export { readAsset as readOvertureAssetCheckpoint };

async function priorAttempt(root, resume, context, signal) {
  check(validResume(resume));
  const operationId = resume.operationId, operation = path.join(root, operationId), meter = {};
  const receipt = await readJson(path.join(operation, 'receipt.json'), JSON_LIMIT, signal, meter);
  check(meter.sha256 === resume.receiptSha256 && receipt.id === operationId && receipt.kind === 'source-acquisition'
    && ['FAILED', 'CANCELLED'].includes(receipt.status) && receipt.details?.sourceId === 'overture-us-places'
    && receipt.result?.snapshotReady !== true && isDeepStrictEqual(receipt.details.metadata, context.metadata)
    && isDeepStrictEqual(receipt.details.runtime, context.runtime));
  if (context.mode === 'native-fetch') check(iso(receipt.startedAt) && iso(receipt.finishedAt) && receipt.finishedAt >= receipt.startedAt);
  const jobs = path.join(operation, 'output', 'jobs');
  await canonical(jobs, { signal });
  const names = await readdir(jobs);
  check(names.length === 1 && uuid(names[0]));
  const directory = path.join(jobs, names[0]), planMeter = {};
  const plan = await readJson(path.join(directory, 'plan.json'), JSON_LIMIT, signal, planMeter);
  check(iso(plan.started_at) && plan.started_at >= context.prerequisites.after && Date.parse(plan.started_at) <= Date.now() + 5000
    && (!receipt.startedAt || plan.started_at >= receipt.startedAt) && (!receipt.finishedAt || plan.started_at <= receipt.finishedAt)
    && isDeepStrictEqual(plan, acquisitionPlan({ ...context, directory, operationId, startedAt: plan.started_at, resume: receipt.details.resume })));
  return { directory, plan, planHash: planMeter.sha256 };
}

export async function inspectOvertureResumePlan({ root, resume, context, signal }) {
  check(validResume(resume));
  await canonical(path.dirname(successorPath(root, resume.operationId)), { signal });
  check(!await optionalStat(successorPath(root, resume.operationId)));
  const current = await priorAttempt(root, resume, context, signal);
  const audit = await auditAcquisitionLineage({ root, current, context, signal, requireCurrentClaim: true });
  check(audit.attemptCount < MAX_ATTEMPTS && (audit.completed.size > 0 || audit.pins.size > 0));
  return current;
}

export async function auditAcquisitionLineage({ root, current, context, signal, requireCurrentClaim = false }) {
  const attempts = [], seen = new Set([current.plan.operation_id]);
  let next = current;
  while (next.plan.resume !== null) {
    const resume = next.plan.resume;
    check(attempts.length < MAX_ATTEMPTS - 1 && !seen.has(resume?.operationId));
    const attempt = await priorAttempt(root, resume, context, signal);
    const successor = successorPath(root, attempt.plan.operation_id);
    await canonical(path.dirname(successor), { signal });
    if (next !== current || requireCurrentClaim) {
      check(isDeepStrictEqual(await readJson(successor, JSON_LIMIT, signal), successorRecord(attempt.plan.operation_id, next.plan)));
    } else check(!await optionalStat(successor));
    seen.add(attempt.plan.operation_id);
    attempts.unshift(attempt); next = attempt;
  }
  const pins = new Map(), completed = new Map();
  const budget = { requests_reserved: 0, bytes_reserved: 0 };
  const currentJournals = [];
  for (const attempt of [...attempts, current]) {
    for (const index of attempt.plan.assets.keys()) {
      const asset = await readAsset(attempt.directory, attempt.plan, attempt.planHash, index, { signal });
      if (asset.journal) {
        check(!completed.has(index));
        budget.requests_reserved += asset.journal.counters.requests_reserved;
        budget.bytes_reserved += asset.journal.counters.bytes_reserved;
        check(budget.requests_reserved <= MAX_REQUESTS && budget.bytes_reserved <= MAX_NETWORK_BYTES);
        if (attempt === current) currentJournals.push(asset.journal);
      }
      if (asset.pin) {
        check(!pins.has(index) || isDeepStrictEqual(pins.get(index), asset.pin.head));
        pins.set(index, asset.pin.head);
      }
      if (asset.checkpoint) completed.set(index, asset);
    }
  }
  return { pins, completed, budget, currentJournals, attemptCount: attempts.length + 1 };
}
