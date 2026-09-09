import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, open, lstat, readdir } from 'node:fs/promises';
import { mnSelectionCanonical as canonical, mnSelectionReadLines as readLines } from './mn-construction-retained-selection.mjs';

const VERSION = 'overture-acquisition-journal@1.0.0';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const MODES = ['native-fetch', 'injected-test-transport'];
const MAX_BYTES = 128 * 1024 ** 2;
const eventKeys = ['type','execution_mode','request_index','asset_index','method','reserved_bytes','observed_bytes','delivered_bytes'];
const reject = () => { throw new Error('Overture acquisition journal rejected; preserve existing evidence for inspection.'); };
const exact = (value, keys) => value && Object.getPrototypeOf(value) === Object.prototype
  && Reflect.ownKeys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
  && Object.values(Object.getOwnPropertyDescriptors(value)).every(d => Object.hasOwn(d, 'value'));
const same = (a, b) => a && b && a.dev === b.dev && a.ino === b.ino && !a.isSymbolicLink() && !b.isSymbolicLink();
const initial = () => ({ counters: { requests_reserved: 0, requests_completed: 0, bytes_reserved: 0, bytes_observed: 0, bytes_delivered: 0 }, pending: null });
const claims = () => ({ native_acquisition_verified: false, restart_resume_supported: false, acquisition_complete: false, power_loss_durability_guaranteed: false });

function advance(state, event, header) {
  if (!exact(event, eventKeys) || !['request-reserved','request-completed'].includes(event.type)
    || event.execution_mode !== header.execution_mode || !['HEAD','GET'].includes(event.method)
    || !Number.isSafeInteger(event.asset_index) || event.asset_index < 0 || event.asset_index >= header.asset_count
    || !['request_index','reserved_bytes','observed_bytes','delivered_bytes'].every(key => Number.isSafeInteger(event[key]) && event[key] >= 0)) reject();
  const next = structuredClone(state), c = next.counters;
  if (event.type === 'request-reserved') {
    if (next.pending || event.request_index !== c.requests_reserved + 1 || event.request_index > 100000
      || event.observed_bytes !== 0 || event.delivered_bytes !== 0
      || (event.method === 'HEAD' ? event.reserved_bytes !== 0 : event.reserved_bytes < 1 || event.reserved_bytes > 64 * 1024 ** 2)
      || c.bytes_reserved + event.reserved_bytes > 32 * 1024 ** 3) reject();
    c.requests_reserved++; c.bytes_reserved += event.reserved_bytes; next.pending = { ...event };
  } else {
    const pending = next.pending;
    if (!pending || ['request_index','asset_index','method','reserved_bytes'].some(key => pending[key] !== event[key])
      || event.observed_bytes !== event.reserved_bytes || event.delivered_bytes !== event.reserved_bytes) reject();
    c.requests_completed++; c.bytes_observed += event.observed_bytes; c.bytes_delivered += event.delivered_bytes; next.pending = null;
  }
  return next;
}

async function inventory(directory, owner) {
  await canonical(directory);
  const current = await lstat(directory, { bigint: true });
  if (!current.isDirectory() || (owner && !same(owner, current))) reject();
  const names = await readdir(directory);
  if (names.length !== 1 || names[0] !== 'events.jsonl') reject();
}

async function create(options) {
  if (!exact(options, ['output','operationId','executionMode','assetCount']) || typeof options.output !== 'string'
    || options.output !== path.resolve(options.output) || typeof options.operationId !== 'string' || !UUID.test(options.operationId) || !MODES.includes(options.executionMode)
    || !Number.isSafeInteger(options.assetCount) || options.assetCount < 1 || options.assetCount > 32) reject();
  options = { ...options };
  await canonical(options.output, { create: true, output: true });
  const runId = randomUUID(), directory = path.join(options.output, runId);
  await mkdir(directory);
  const owner = await lstat(directory, { bigint: true }), filename = path.join(directory, 'events.jsonl');
  const file = await open(filename, 'wx+');
  let identity;
  try { identity = await file.stat({ bigint: true }); } catch { await file.close(); reject(); }
  const header = { type: 'header', schema_version: VERSION, operation_id: options.operationId, run_id: runId,
    execution_mode: options.executionMode, asset_count: options.assetCount };
  let bytes = 0, state = initial(), accepting = true, failed = false, handleClosed = false, tail = Promise.resolve(), closing, expectedIdentity = identity;
  const digest = createHash('sha256');
  let headerBytes, lastBytes, lastOffset = 0;
  async function closeHandle() { if (!handleClosed) { handleClosed = true; await file.close(); } }
  async function stable(beforeWrite = false) {
    await inventory(directory, owner);
    const handleIdentity = await file.stat({ bigint: true }), namedIdentity = await lstat(filename, { bigint: true });
    for (const value of [handleIdentity, namedIdentity]) {
      if (!same(identity, value) || !value.isFile() || value.nlink !== 1n || value.size !== BigInt(bytes)) reject();
      if (beforeWrite && (value.mtimeNs !== expectedIdentity.mtimeNs || value.ctimeNs !== expectedIdentity.ctimeNs)) reject();
    }
    if (handleIdentity.mtimeNs !== namedIdentity.mtimeNs || handleIdentity.ctimeNs !== namedIdentity.ctimeNs) reject();
    expectedIdentity = handleIdentity;
    if (beforeWrite) for (const [raw, offset] of [[headerBytes, 0], [lastBytes, lastOffset]]) if (raw) {
      const buffer = Buffer.alloc(raw.length), result = await file.read(buffer, 0, buffer.length, offset);
      if (result.bytesRead !== raw.length || !buffer.equals(raw)) reject();
    }
  }
  async function append(value) {
    await stable(true);
    const raw = Buffer.from(JSON.stringify(value) + '\n');
    if (bytes + raw.length > MAX_BYTES) reject();
    lastOffset = bytes;
    await file.writeFile(raw); bytes += raw.length;
    await file.sync(); await stable();
    headerBytes ??= raw; lastBytes = raw; digest.update(raw);
  }
  try { await append(header); } catch { await closeHandle(); reject(); }
  function close() {
    accepting = false;
    closing ??= tail.then(async () => {
      try {
        if (!failed) {
          await stable(true);
          const meter = {};
          for await (const line of readLines(filename, MAX_BYTES, undefined, meter)) void line;
          if (meter.sha256 !== digest.copy().digest('hex')) reject();
        }
      } catch { failed = true; reject(); }
      finally { await closeHandle(); }
    });
    return closing;
  }
  function onEvent(value) {
    if (!accepting || failed) return Promise.reject(new Error('Overture acquisition journal is closed.'));
    // Copy before asynchronous admission so callers cannot mutate queued accounting.
    let event;
    try { if (!exact(value, eventKeys)) reject(); event = { ...value }; }
    catch { accepting = false; failed = true; void close().catch(() => {}); return Promise.reject(new Error('Overture acquisition journal event rejected.')); }
    const task = tail.then(async () => {
      if (failed) reject();
      try {
        const next = advance(state, event, header);
        await append(event); state = next;
      } catch {
        failed = true; accepting = false;
        await closeHandle(); reject();
      }
    });
    tail = task.catch(() => {});
    return task;
  }
  return { directory, onEvent, close, snapshot: () => ({ state: failed ? 'failed' : accepting ? 'open' : 'closed',
    execution_mode: header.execution_mode, counters: { ...state.counters }, pending_request: state.pending?.request_index ?? null, claims: claims() }) };
}

async function inspect(directory, options) {
  if (!exact(options, ['operationId']) || typeof options.operationId !== 'string' || !UUID.test(options.operationId) || typeof directory !== 'string'
    || directory !== path.resolve(directory) || !UUID.test(path.basename(directory))) reject();
  options = { ...options };
  await inventory(directory);
  const owner = await lstat(directory, { bigint: true }), meter = {};
  let header, state = initial(), count = 0;
  for await (const line of readLines(path.join(directory, 'events.jsonl'), MAX_BYTES, undefined, meter)) {
    count++;
    if (count === 1) {
      if (!exact(line, ['type','schema_version','operation_id','run_id','execution_mode','asset_count'])
        || line.type !== 'header' || line.schema_version !== VERSION || line.operation_id !== options.operationId
        || line.run_id !== path.basename(directory) || !MODES.includes(line.execution_mode)
        || !Number.isSafeInteger(line.asset_count) || line.asset_count < 1 || line.asset_count > 32) reject();
      header = line;
    } else state = advance(state, line, header);
  }
  if (!header) reject();
  await inventory(directory, owner);
  return { status: 'incomplete-acquisition-evidence', counters: { ...state.counters }, pending_request: state.pending?.request_index ?? null,
    execution_mode: header.execution_mode, sha256: meter.sha256, claims: claims() };
}

export async function inspectOvertureAcquisitionJournal(directory, options) {
  try { return await inspect(directory, options); } catch { reject(); }
}

export async function createOvertureAcquisitionJournal(options) {
  try { return await create(options); } catch { reject(); }
}
