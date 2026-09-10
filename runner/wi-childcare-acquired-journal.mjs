import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, open, lstat, link, unlink, readdir, statfs } from 'node:fs/promises';
import { isDeepStrictEqual as same } from 'node:util';
import { APP_ROOT } from './paths.mjs';
import { mnSelectionCanonical as canonical, mnSelectionReadJson as readJson } from './mn-construction-retained-selection.mjs';
import { acquireWiChildcarePolicyBoundWithTransport } from './wi-childcare-transport.mjs';
import { replayWiChildcareAcquisition, validateWiSourcePolicy, wiInventoryUrl, wiFeatureUrl, wiBatches, wiInventory, wiFeatures } from './wi-childcare-acquisition.mjs';
import { validateWiChildcarePreflight, wiPreflightUrl } from './wi-childcare-preflight.mjs';

const VERSION = 'wi-childcare-acquired-journal@1.0.0', MAX = 350_000_000;
const POLICY = 'cd62a0a4b83c84b5b5e7107dfd3281f87f67cc34f18d99e5dcacce665f1a328b';
const uuid = v => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const bytes = v => Buffer.from(JSON.stringify(v) + '\n');
const hash = v => createHash('sha256').update(v).digest('hex');
const check = v => { if (!v) throw Error('Wisconsin durable acquisition requires inspection.'); };
const instant = v => typeof v === 'string' && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const exact = (v, keys) => v && Object.getPrototypeOf(v) === Object.prototype && same(Object.keys(v).sort(), [...keys].sort());
const claims = () => ({ execution_mode: 'injected-test-transport', source_use_authorized: false, source_authenticity_verified: false,
  native_app_enrolled: false, public_export_authorized: false, national_reporting_integrated: false, automatic_resume_supported: false });
const nameFor = (kind, n) => `${kind}-${String(n).padStart(6, '0')}.json`;
const metadataUrls = new Set(['server', 'layer', 'service-item', 'layer-item', 'iteminfo', 'notice-item', 'notice-data', 'xml', 'count'].map(wiPreflightUrl));
function validRequestUrl(url) {
  if (metadataUrls.has(url) || url === wiInventoryUrl()) return true;
  try {
    const text = new URL(url).searchParams.get('objectIds');
    if (!text || !/^[1-9]\d*(,[1-9]\d*)*$/.test(text)) return false;
    const ids = text.split(',').map(Number);
    return ids.length <= 100 && ids.every((n, i) => Number.isSafeInteger(n) && (!i || n > ids[i - 1])) && wiFeatureUrl(ids) === url;
  } catch { return false; }
}
function options(value) {
  check(value && Object.getPrototypeOf(value) === Object.prototype && Reflect.ownKeys(value).every(key =>
    ['fetchImpl', 'outputRoot', 'signal', 'now', 'sleep', 'timeoutMs', 'beforePersist'].includes(key)
    && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value')));
  check(typeof value.fetchImpl === 'function' && (value.signal === undefined || value.signal instanceof AbortSignal));
  for (const key of ['now', 'sleep', 'beforePersist']) check(value[key] === undefined || typeof value[key] === 'function');
  check(value.timeoutMs === undefined || Number.isInteger(value.timeoutMs) && value.timeoutMs >= 1 && value.timeoutMs <= 60000);
  value.signal?.throwIfAborted();
}
function rootPath(value) {
  check(typeof value === 'string' && value === path.resolve(value));
  const relative = path.relative(path.join(APP_ROOT, 'data'), value);
  check(relative && !relative.startsWith('..') && !path.isAbsolute(relative)
    && !relative.split(path.sep).some(s => ['jobs', 'releases', '.staging'].includes(s.toLowerCase())));
  return value;
}

/** Injected-only development lifecycle. beforePersist is a trusted fault-test
 * seam, never a native/API input. No native transport or acquisition approval.
 */
export async function buildWiChildcareAcquiredJournalWithTransport(value = {}) {
  options(value);
  const { signal, now = () => new Date() } = value;
  const root = rootPath(value.outputRoot ?? path.join(APP_ROOT, 'data/business-sources/wi-dhs-licensed-group-childcare/injected-acquired'));
  await canonical(root, { create: true, output: true, signal });
  const disk = await statfs(root, { bigint: true }); check(disk.bavail * disk.bsize >= 600_000_000n);
  const lockPath = path.join(root, '.owner.lock'), lock = await open(lockPath, 'wx');
  const lockIdentity = await lock.stat({ bigint: true }), runId = randomUUID(), lockValue = { run_id: runId, pid: process.pid };
  const directory = path.join(root, 'jobs', runId), receiptPath = path.join(directory, 'receipt.json');
  let directoryIdentity, ordinal = 0, observation = 0, sealed = false, total = 0, queue = Promise.resolve();
  const pending = new Set(), artifacts = [];
  const stamp = () => { const at = now().toISOString(); check(instant(at)); return at; };
  async function ownership() {
    await canonical(root); const current = await lstat(lockPath, { bigint: true });
    check(current.isFile() && !current.isSymbolicLink() && current.nlink === 1n && current.ino === lockIdentity.ino && current.dev === lockIdentity.dev
      && same(await readJson(lockPath, 1000), lockValue));
    if (directoryIdentity) { await canonical(directory); const d = await lstat(directory, { bigint: true }); check(d.ino === directoryIdentity.ino && d.dev === directoryIdentity.dev); }
  }
  function stage(name, record, maximum = 8_200_000) {
    const work = queue.then(async () => {
      check(!sealed); await ownership(); await value.beforePersist?.({ name, directory }); await ownership();
      const raw = bytes(record); total += raw.length; check(raw.length <= maximum && total <= MAX);
      const temporary = path.join(directory, `${name}.pending`), destination = path.join(directory, name);
      const handle = await open(temporary, 'wx'); let identity;
      try { identity = await handle.stat({ bigint: true }); await handle.writeFile(raw); await handle.sync(); } finally { await handle.close(); }
      const meter = {}; check(same(await readJson(temporary, maximum, undefined, meter), record) && meter.sha256 === hash(raw)
        && meter.identity.ino === identity.ino && meter.identity.dev === identity.dev);
      await ownership(); await link(temporary, destination); await unlink(temporary);
      artifacts.push({ path: name, bytes: raw.length, sha256: hash(raw) });
    });
    queue = work.catch(() => {}); pending.add(work); void work.finally(() => pending.delete(work)).catch(() => {}); return work;
  }
  async function drain() { while (pending.size) await Promise.allSettled([...pending]); }
  let status = 'FAILED', startedAt, result, failure;
  try {
    await lock.writeFile(bytes(lockValue)); await lock.sync();
    await canonical(path.join(root, 'jobs'), { create: true, output: true, signal }); await mkdir(directory); directoryIdentity = await lstat(directory, { bigint: true });
    startedAt = stamp(); await stage('run.json', { schema_version: VERSION, run_id: runId, started_at: startedAt, claims: claims() }, 2000);
    result = await acquireWiChildcarePolicyBoundWithTransport({ signal, now,
      ...(value.sleep ? { sleep: value.sleep } : {}), ...(value.timeoutMs !== undefined ? { timeoutMs: value.timeoutMs } : {}),
      fetchImpl: async (url, requestOptions) => {
        requestOptions.signal.throwIfAborted(); const sequence = ordinal++; check(sequence < 2000 && validRequestUrl(url));
        await stage(nameFor('request', sequence), { sequence, url, intended_at: stamp(), delivery: 'possible-not-proven' }, 4000);
        // The attempt deadline may have won while its intent was syncing.
        requestOptions.signal.throwIfAborted(); return value.fetchImpl(url, requestOptions);
      },
      onPreflight: async ({ phase, preflight }) => { await stage(`preflight-${phase}.json`, preflight, 2_000_000); },
      onObservation: async entry => { const sequence = observation++; check(sequence < 1000); await stage(nameFor('observation', sequence), entry); },
    });
    await drain(); signal?.throwIfAborted(); await stage('acquisition.json', result.evidence, 150_000_000);
    check(result.transport.requests === ordinal); status = 'SUCCEEDED';
  } catch (error) { failure = error; status = signal?.aborted ? 'CANCELLED' : 'FAILED'; }
  try {
    await drain();
    if (directoryIdentity) {
      const receipt = { schema_version: VERSION, run_id: runId, status, started_at: startedAt ?? stamp(), finished_at: stamp(),
        claims: claims(), request_intents: artifacts.filter(a => /^request-/.test(a.path)).length,
        retained_observations: artifacts.filter(a => /^observation-/.test(a.path)).length,
        record_count: status === 'SUCCEEDED' ? result.features.length : null,
        artifacts: structuredClone(artifacts), wrapper_retries: 0, transport_retry_limit: 3, restart_action: 'inspect-never-auto-resume' };
      await stage('receipt.json', receipt, 500_000); sealed = true;
      await ownership();
      if (status === 'SUCCEEDED') return await inspectWiChildcareAcquiredJournal(receiptPath);
    }
    throw failure ?? Error('Wisconsin durable acquisition did not complete.');
  } catch {
    throw Object.assign(Error('Wisconsin acquisition evidence requires inspection; no wrapper retry was made.'), {
      recovery: { receipt: receiptPath, run_id: runId, directory, status: 'inspection-required', retry_authorized: false },
    });
  } finally {
    await drain(); await lock.close();
    try { await ownership(); await unlink(lockPath); }
    catch { throw Object.assign(Error('Wisconsin acquisition ownership requires inspection.'), { recovery: { receipt: receiptPath, directory, run_id: runId, retry_authorized: false } }); }
  }
}

/** Offline inspection only. No record authenticity, native delivery or approval. */
export async function inspectWiChildcareAcquiredJournal(receiptPath, { signal } = {}) {
  signal?.throwIfAborted();
  check(typeof receiptPath === 'string' && receiptPath === path.resolve(receiptPath) && path.basename(receiptPath) === 'receipt.json');
  const directory = path.dirname(receiptPath), runId = path.basename(directory); check(uuid(runId) && path.basename(path.dirname(directory)) === 'jobs');
  rootPath(path.dirname(path.dirname(directory))); await canonical(directory, { signal }); const owner = await lstat(directory, { bigint: true });
  const rm = {}, receipt = await readJson(receiptPath, 500_000, signal, rm);
  check(exact(receipt, ['schema_version', 'run_id', 'status', 'started_at', 'finished_at', 'claims', 'request_intents', 'retained_observations', 'record_count', 'artifacts', 'wrapper_retries', 'transport_retry_limit', 'restart_action'])
    && receipt.schema_version === VERSION && receipt.run_id === runId && ['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(receipt.status)
    && instant(receipt.started_at) && instant(receipt.finished_at) && receipt.started_at <= receipt.finished_at && same(receipt.claims, claims())
    && receipt.wrapper_retries === 0 && receipt.transport_retry_limit === 3 && receipt.restart_action === 'inspect-never-auto-resume'
    && Array.isArray(receipt.artifacts) && receipt.artifacts.length <= 3004);
  const retained = new Map(); let total = 0;
  for (const artifact of receipt.artifacts) {
    signal?.throwIfAborted();
    check(exact(artifact, ['path', 'bytes', 'sha256']) && /^(run|preflight-before|preflight-after|acquisition|request-\d{6}|observation-\d{6})\.json$/.test(artifact.path)
      && !retained.has(artifact.path) && Number.isSafeInteger(artifact.bytes) && artifact.bytes > 0 && artifact.bytes <= 150_000_000 && /^[a-f0-9]{64}$/.test(artifact.sha256));
    total += artifact.bytes; check(total <= MAX);
    const meter = {}, record = await readJson(path.join(directory, artifact.path), artifact.bytes, signal, meter);
    check(meter.bytes === artifact.bytes && meter.sha256 === artifact.sha256); retained.set(artifact.path, { record, meter });
  }
  const roster = [...retained.keys(), 'receipt.json'].sort(); check(same((await readdir(directory)).sort(), roster));
  const run = retained.get('run.json')?.record;
  check(same(run, { schema_version: VERSION, run_id: runId, started_at: receipt.started_at, claims: claims() }));
  const requests = [...retained].filter(([name]) => name.startsWith('request-')), observations = [...retained].filter(([name]) => name.startsWith('observation-'));
  check(requests.length === receipt.request_intents && observations.length === receipt.retained_observations && requests.length <= 2000 && observations.length <= 1000);
  let prior = receipt.started_at;
  for (const [index, [name, { record }]] of requests.entries()) {
    check(name === nameFor('request', index) && exact(record, ['sequence', 'url', 'intended_at', 'delivery']) && record.sequence === index
      && typeof record.url === 'string' && record.url.length <= 2000 && validRequestUrl(record.url) && record.delivery === 'possible-not-proven'
      && instant(record.intended_at) && record.intended_at >= prior && record.intended_at <= receipt.finished_at); prior = record.intended_at;
  }
  if (receipt.status === 'SUCCEEDED') {
    const evidence = retained.get('acquisition.json')?.record, replayed = replayWiChildcareAcquisition(evidence, { signal });
    check(same(retained.get('preflight-before.json')?.record, evidence.preflight_before) && same(retained.get('preflight-after.json')?.record, evidence.preflight_after)
      && replayed.features.length === receipt.record_count && observations.length === evidence.observations.length);
    for (const phase of ['before', 'after']) check(validateWiSourcePolicy(retained.get(`preflight-${phase}.json`).record).policy_sha256 === POLICY);
    for (const [index, [name, { record }]] of observations.entries()) check(name === nameFor('observation', index) && same(record, evidence.observations[index]));
    check(evidence.started_at >= receipt.started_at && evidence.observed_at <= receipt.finished_at && receipt.artifacts.at(-1).path === 'acquisition.json');
    const position = name => receipt.artifacts.findIndex(a => a.path === name);
    const logical = [
      ...evidence.preflight_before.observations.map(o => ({ ...o, anchor: 'run.json', staged: 'preflight-before.json' })),
      ...evidence.observations.map((o, i) => ({ ...o, anchor: i ? nameFor('observation', i - 1) : 'preflight-before.json', staged: nameFor('observation', i) })),
      ...evidence.preflight_after.observations.map(o => ({ ...o, anchor: nameFor('observation', observations.length - 1), staged: 'preflight-after.json' })),
    ];
    check(position('preflight-after.json') < position('acquisition.json'));
    // Retry-aware matching handles adjacent identical count URLs without claiming
    // which failed attempt reached the source. Every possible match must still
    // precede its observation in time and durable artifact order.
    let reachable = new Set([0]), previousObservation = evidence.started_at;
    for (const event of logical) {
      const next = new Set();
      for (const start of reachable) for (let attempts = 1; attempts <= 3 && start + attempts <= requests.length; attempts++) {
        const group = requests.slice(start, start + attempts);
        if (group.every(([name, { record }]) => record.url === event.url && record.intended_at >= previousObservation
          && record.intended_at <= event.observed_at && position(name) > position(event.anchor) && position(name) < position(event.staged))) next.add(start + attempts);
      }
      check(next.size > 0); reachable = next; previousObservation = event.observed_at;
    }
    check(reachable.has(requests.length));
  } else {
    check(receipt.record_count === null && !retained.has('acquisition.json'));
    const before = retained.get('preflight-before.json')?.record;
    if (before) { validateWiChildcarePreflight(before); check(validateWiSourcePolicy(before).policy_sha256 === POLICY); }
    if (retained.has('preflight-after.json')) { const after = retained.get('preflight-after.json').record; validateWiChildcarePreflight(after); check(validateWiSourcePolicy(after).policy_sha256 === POLICY); }
    let ids, batches, priorObservation = before?.finished_at;
    for (const [index, [name, { record }]] of observations.entries()) {
      check(before && name === nameFor('observation', index) && exact(record, ['kind', 'url', 'observed_at', 'payload', 'payload_sha256', 'response_bytes'])
        && instant(record.observed_at) && record.observed_at >= priorObservation && record.observed_at <= receipt.finished_at
        && record.payload_sha256 === hash(Buffer.from(JSON.stringify(record.payload))) && Number.isSafeInteger(record.response_bytes)
        && record.response_bytes > 0 && record.response_bytes <= 8_000_000);
      priorObservation = record.observed_at;
      if (index === 0) { check(record.kind === 'inventory' && record.url === wiInventoryUrl()); ids = wiInventory(record.payload, before.source.source_record_count); batches = wiBatches(ids); }
      else if (index <= batches.length) { check(record.kind === 'features' && record.url === wiFeatureUrl(batches[index - 1])); wiFeatures(record.payload, batches[index - 1], before); }
      else { check(index === batches.length + 1 && record.kind === 'inventory' && record.url === wiInventoryUrl() && same(ids, wiInventory(record.payload, ids.length))); }
      const position = receipt.artifacts.findIndex(a => a.path === name);
      check(requests.some(([requestName, { record: intent }]) => intent.url === record.url && intent.intended_at <= record.observed_at
        && receipt.artifacts.findIndex(a => a.path === requestName) < position));
    }
    // A failed attempt is never upgraded to a successful acquisition by inspection.
  }
  for (const [name, { meter }] of retained) { const final = {}; await readJson(path.join(directory, name), meter.bytes, signal, final);
    check(final.sha256 === meter.sha256 && ['ino', 'dev', 'size', 'mtimeNs', 'ctimeNs'].every(key => final.identity[key] === meter.identity[key])); }
  const final = {}; await readJson(receiptPath, 500_000, signal, final); const after = await lstat(directory, { bigint: true });
  await canonical(directory, { signal });
  check(final.sha256 === rm.sha256 && ['ino', 'dev', 'size', 'mtimeNs', 'ctimeNs'].every(key => final.identity[key] === rm.identity[key])
    && after.ino === owner.ino && after.dev === owner.dev && same((await readdir(directory)).sort(), roster));
  return { receipt: receiptPath, receipt_sha256: rm.sha256, run_id: runId, status: receipt.status,
    request_intents: requests.length, retained_observations: observations.length, record_count: receipt.record_count, ...claims(), source_requests_this_inspection: 0 };
}
