import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { open, lstat, mkdir, link, unlink, readdir, statfs } from 'node:fs/promises';
import { isDeepStrictEqual as same } from 'node:util';
import { APP_ROOT } from './paths.mjs';
import { mnSelectionCanonical as canonical, mnSelectionReadJson as readJson } from './mn-construction-retained-selection.mjs';
import { buildWiChildcareAcquiredJournalWithTransport, inspectWiChildcareAcquiredJournal } from './wi-childcare-acquired-journal.mjs';
import { buildWiChildcareRelease, verifyWiChildcareRelease } from './wi-childcare-release.mjs';

export const WI_CHILDCARE_APP_VERSION = 'wi-childcare-app@1.0.0';
function freeze(v) { for (const child of Object.values(v)) if (child && typeof child === 'object') freeze(child); return Object.freeze(v); }
export const WI_CHILDCARE_APP_CONTRACT = freeze({
  version: WI_CHILDCARE_APP_VERSION, connector_id: 'wi-childcare-development-app',
  input_artifact_types: ['verified-wi-injected-acquisition-journal'],
  output_artifact_types: ['wi-app-start', 'wi-app-acquired-checkpoint', 'wi-app-normalized-checkpoint', 'wi-app-terminal-receipt', 'wi-offline-review-release'],
  named_secret_references: [], allowed_hosts: [], native_dispatch_enabled: false,
  redirect_policy: 'No native requests. Injected transport retains its fixed URL, no-redirect, no-credential contract.',
  provider_budget_key: 'wi-dhs-licensed-group-childcare',
  resource_class: 'bounded-state-industry-development-app',
  execution_limits: { cooperative_deadline_ms: 1800000, minimum_free_disk_bytes: 1000000000, max_parallel_requests: 1, journal_maximum_requests: 2000 },
  retry: 'No app retries or automatic resume; injected transport has up to three attempts per logical request, each journaled.',
  checkpoint: 'Start, independently verified journal and normalized release; terminal receipt last.',
  idempotency: 'Immutable UUID output roots; explicit retained input never refetched.',
  cancellation: 'Await child settlement before terminal persistence and release of owned locks. OS stalls require inspection.',
  source_policy: 'wi-childcare-local-review@1.0.0', retention_profile: 'Immutable internal development evidence; no automatic deletion.',
  produced_entities: ['unverified-childcare-source-candidate', 'quarantined-source-record'], produced_identifiers: ['release-scoped-source-key', 'zip5', 'zip4'],
});
const POLICY = 'cd62a0a4b83c84b5b5e7107dfd3281f87f67cc34f18d99e5dcacce665f1a328b';
const uuid = v => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const hash = v => createHash('sha256').update(v).digest('hex');
const encode = v => Buffer.from(JSON.stringify(v) + '\n');
const check = v => { if (!v) throw Object.assign(Error('Wisconsin app evidence rejected.'), { code: 'WI_CHILDCARE_APP_REJECTED' }); };
const time = v => typeof v === 'string' && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const exact = (v, keys) => v && Object.getPrototypeOf(v) === Object.prototype && same(Object.keys(v).sort(), [...keys].sort());
const claims = () => ({ source_use_authorized: false, source_authenticity_verified: false, native_app_enrolled: false,
  public_export_authorized: false, national_reporting_integrated: false, current_operations_verified: false, automatic_resume_supported: false });
const configuration = () => ({ contract_sha256: hash(JSON.stringify(WI_CHILDCARE_APP_CONTRACT)), policy_sha256: POLICY });
async function config(signal) { check(hash(JSON.stringify(await readJson(path.join(APP_ROOT, 'config/source-policies/wi-childcare-local-review.json'), 100000, signal))) === POLICY); return configuration(); }
function options(v, keys) {
  check(v && Object.getPrototypeOf(v) === Object.prototype && Reflect.ownKeys(v).every(k => keys.includes(k) && Object.hasOwn(Object.getOwnPropertyDescriptor(v, k), 'value')));
  check(v.signal === undefined || v.signal instanceof AbortSignal); v.signal?.throwIfAborted();
}
function outputRoot(v) {
  check(typeof v === 'string' && v === path.resolve(v)); const relative = path.relative(path.join(APP_ROOT, 'data'), v);
  check(relative && !relative.startsWith('..') && !path.isAbsolute(relative) && !relative.split(path.sep).some(s => ['jobs', 'runs', 'releases', '.staging'].includes(s.toLowerCase()))); return v;
}
async function snapshot(file, signal) { const meter = {}; const value = await readJson(file, 100000, signal, meter); return { value, meter }; }
async function stable(file, original, signal) {
  const final = await snapshot(file, signal); check(same(original.value, final.value) && original.meter.sha256 === final.meter.sha256
    && ['ino', 'dev', 'size', 'mtimeNs', 'ctimeNs'].every(k => original.meter.identity[k] === final.meter.identity[k]));
}
async function write(file, value, ownership) {
  await ownership(); const raw = encode(value); check(raw.length <= 100000);
  const temp = file + '.pending', handle = await open(temp, 'wx'); let identity;
  try { identity = await handle.stat({ bigint: true }); await handle.writeFile(raw); await handle.sync(); } finally { await handle.close(); }
  const saved = await snapshot(temp); check(saved.meter.sha256 === hash(raw) && saved.meter.identity.ino === identity.ino && saved.meter.identity.dev === identity.dev);
  await ownership(); await stable(temp, saved); await link(temp, file); await unlink(temp); return saved.meter.sha256;
}
const terminal = (start, startHash, acquired, normalizationAttempt, normalized, status, finishedAt) => ({ schema_version: WI_CHILDCARE_APP_VERSION,
  run_id: start.run_id, execution_mode: start.execution_mode, status, started_at: start.started_at, finished_at: finishedAt,
  start_sha256: startHash, configuration: start.configuration, acquired, normalization_attempt: normalizationAttempt, normalized, claims: claims(),
  normalization_state: normalized ? 'verified' : normalizationAttempt ? 'inspection-required' : 'not-started',
  output_state: status === 'SUCCEEDED' ? 'verified-offline-review-only' : 'inspection-required', retry_authorized: false });

/** Offline verification of persisted app lineage; never a source request. */
export async function verifyWiChildcareAppJob(receiptPath, value = {}) {
  options(value, ['signal']); return inspect(receiptPath, value.signal);
}
async function inspect(receiptPath, signal, candidate = false) {
  const cfg = await config(signal);
  check(typeof receiptPath === 'string' && receiptPath === path.resolve(receiptPath) && path.basename(receiptPath) === (candidate ? 'candidate.json' : 'receipt.json'));
  const directory = path.dirname(receiptPath), id = path.basename(directory), root = outputRoot(path.dirname(path.dirname(directory)));
  check(uuid(id) && path.basename(path.dirname(directory)) === 'jobs'); await canonical(directory, { signal }); const identity = await lstat(directory, { bigint: true });
  const receipt = await snapshot(receiptPath, signal), initial = await snapshot(path.join(directory, 'start.json'), signal), start = initial.value;
  check(exact(start, ['schema_version', 'run_id', 'execution_mode', 'started_at', 'configuration', 'retained_journal']) && start.schema_version === WI_CHILDCARE_APP_VERSION
    && start.run_id === id && time(start.started_at) && same(start.configuration, cfg) && ['injected-test-transport', 'retained-local-verification'].includes(start.execution_mode));
  const r = receipt.value; check(['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(r.status) && time(r.finished_at) && r.finished_at >= start.started_at);
  const acquired = r.acquired, normalized = r.normalized, attempt = r.normalization_attempt, roster = ['start.json', path.basename(receiptPath)], checkpoints = [];
  const work = path.join(root, 'runs', id);
  if (acquired !== null) {
    const checkpoint = await snapshot(path.join(directory, 'acquired.json'), signal); checkpoints.push(['acquired.json', checkpoint]); roster.push('acquired.json');
    check(exact(checkpoint.value, ['retained_at', 'verification']) && same(checkpoint.value.verification, acquired) && time(checkpoint.value.retained_at)
      && checkpoint.value.retained_at >= start.started_at && checkpoint.value.retained_at <= r.finished_at);
    check(same(await inspectWiChildcareAcquiredJournal(acquired.receipt, { signal }), acquired) && acquired.status === 'SUCCEEDED');
    const journal = await readJson(acquired.receipt, 500000, signal);
    check(journal.finished_at <= checkpoint.value.retained_at);
    if (start.execution_mode === 'retained-local-verification') check(same(start.retained_journal, acquired) && journal.finished_at <= start.started_at);
    else check(start.retained_journal === null && acquired.receipt === path.join(work, 'acquired', 'jobs', acquired.run_id, 'receipt.json') && journal.started_at >= start.started_at);
  } else if (start.execution_mode === 'retained-local-verification') {
    check(start.retained_journal?.status === 'SUCCEEDED' && same(await inspectWiChildcareAcquiredJournal(start.retained_journal.receipt, { signal }), start.retained_journal));
  } else check(start.retained_journal === null);
  if (attempt !== null) {
    check(acquired !== null && exact(attempt, ['started_at', 'output_root']) && time(attempt.started_at)
      && attempt.started_at >= checkpoints[0][1].value.retained_at && attempt.started_at <= r.finished_at && attempt.output_root === path.join(work, 'normalized'));
    const checkpoint = await snapshot(path.join(directory, 'normalization-start.json'), signal); check(same(checkpoint.value, attempt));
    checkpoints.push(['normalization-start.json', checkpoint]); roster.push('normalization-start.json');
  }
  if (normalized !== null) {
    check(attempt !== null);
    check(acquired !== null); const checkpoint = await snapshot(path.join(directory, 'normalized.json'), signal); checkpoints.push(['normalized.json', checkpoint]); roster.push('normalized.json');
    check(exact(checkpoint.value, ['retained_at', 'verification']) && same(checkpoint.value.verification, normalized) && time(checkpoint.value.retained_at)
      && checkpoint.value.retained_at >= checkpoints[0][1].value.retained_at && checkpoint.value.retained_at <= r.finished_at);
    check(normalized.manifest_path === path.join(work, 'normalized', 'releases', normalized.release_id, 'manifest.json')
      && same(await verifyWiChildcareRelease(normalized.manifest_path, { signal }), normalized) && normalized.storage_state === 'immutable-release');
    const manifest = await readJson(normalized.manifest_path, 100000, signal);
    check(manifest.processed_at >= attempt.started_at && manifest.processed_at <= checkpoint.value.retained_at);
    const source = await readJson(path.join(path.dirname(normalized.manifest_path), 'source-observation.json'), 150000000, signal);
    check(same(source, await readJson(path.join(path.dirname(acquired.receipt), 'acquisition.json'), 150000000, signal)));
  }
  check(r.status !== 'SUCCEEDED' || acquired !== null && normalized !== null);
  check(same(r, terminal(start, initial.meter.sha256, acquired, attempt, normalized, r.status, r.finished_at)) && same((await readdir(directory)).sort(), roster.sort()));
  for (const [name, saved] of [[path.basename(receiptPath), receipt], ['start.json', initial], ...checkpoints]) await stable(path.join(directory, name), saved, signal);
  if (acquired) check(same(await inspectWiChildcareAcquiredJournal(acquired.receipt, { signal }), acquired));
  if (normalized) check(same(await verifyWiChildcareRelease(normalized.manifest_path, { signal }), normalized));
  await canonical(directory, { signal }); const after = await lstat(directory, { bigint: true });
  check(after.ino === identity.ino && after.dev === identity.dev && same((await readdir(directory)).sort(), roster)); await config(signal);
  return { receiptPath, receipt_sha256: receipt.meter.sha256, receipt: r, source_requests_this_verification: 0 };
}

/** Explicit local reuse is available; omission never silently selects acquisition. */
export async function runWiChildcareAppJob(value = {}) {
  options(value, ['signal', 'outputRoot', 'retainedJournalReceipt']);
  if (value.retainedJournalReceipt === undefined) throw Object.assign(Error('Wisconsin source-use approval and native app enrollment are pending. No work was created.'), { code: 'WI_CHILDCARE_LIVE_NOT_ENROLLED' });
  return run(value, 'retained-local-verification');
}
export async function runWiChildcareAppJobWithTransport(value = {}) {
  options(value, ['signal', 'outputRoot', 'fetchImpl', 'now', 'sleep', 'timeoutMs', 'logger', 'beforePersist', 'buildRelease']);
  check(typeof value.fetchImpl === 'function');
  for (const name of ['now', 'sleep', 'logger', 'beforePersist', 'buildRelease']) check(value[name] === undefined || typeof value[name] === 'function');
  check(value.timeoutMs === undefined || Number.isInteger(value.timeoutMs) && value.timeoutMs >= 1 && value.timeoutMs <= 60000);
  return run(value, 'injected-test-transport');
}
async function run(value, mode) {
  const controller = new AbortController(), signal = value.signal ? AbortSignal.any([value.signal, controller.signal]) : controller.signal;
  const timer = setTimeout(() => controller.abort(Error('Wisconsin app cooperative deadline reached.')), 1800000);
  const now = () => { const at = (value.now?.() ?? new Date()).toISOString(); check(time(at)); return at; };
  const locks = []; let directory, directoryIdentity, work, start, startHash, acquired = null, normalizationAttempt = null, normalized = null, committed = false, published = null;
  async function ownership() {
    for (const item of locks) { await canonical(path.dirname(item.file)); const s = await lstat(item.file, { bigint: true });
      check(s.isFile() && !s.isSymbolicLink() && s.nlink === 1n && s.ino === item.identity.ino && s.dev === item.identity.dev && same(await readJson(item.file, 1000), item.value)); }
    if (directoryIdentity) { await canonical(directory); const s = await lstat(directory, { bigint: true }); check(s.ino === directoryIdentity.ino && s.dev === directoryIdentity.dev); }
  }
  async function lock(file, id) {
    const handle = await open(file, 'wx'), item = { file, handle, identity: await handle.stat({ bigint: true }), value: { run_id: id, pid: process.pid } };
    locks.push(item); await handle.writeFile(encode(item.value)); await handle.sync();
  }
  const recovery = () => ({ receipt: directory ? path.join(directory, 'receipt.json') : null, directory: directory ?? null, work_directory: work ?? null,
    normalization_state: normalized ? 'verified' : normalizationAttempt ? 'inspection-required' : 'not-started', published_normalization: published, retry_authorized: false });
  try {
    signal.throwIfAborted(); const cfg = await config(signal);
    const retained = mode === 'retained-local-verification' ? await inspectWiChildcareAcquiredJournal(value.retainedJournalReceipt, { signal }) : null;
    if (retained) check(retained.status === 'SUCCEEDED');
    const root = outputRoot(value.outputRoot ?? path.join(APP_ROOT, 'data/business-sources/wi-dhs-licensed-group-childcare/development-app'));
    await canonical(root, { create: true, output: true, signal }); const disk = await statfs(root, { bigint: true }); check(disk.bavail * disk.bsize >= 1000000000n);
    const id = randomUUID(); await lock(path.join(root, '.owner.lock'), id);
    if (mode === 'injected-test-transport') {
      const publisher = path.join(APP_ROOT, 'data/business-sources/wi-dhs-licensed-group-childcare/development-runtime');
      await canonical(publisher, { create: true, output: true, signal }); await lock(path.join(publisher, 'publisher.lock'), id);
    }
    await canonical(path.join(root, 'jobs'), { create: true, output: true, signal }); directory = path.join(root, 'jobs', id); await mkdir(directory); directoryIdentity = await lstat(directory, { bigint: true });
    work = path.join(root, 'runs', id); start = { schema_version: WI_CHILDCARE_APP_VERSION, run_id: id, execution_mode: mode, started_at: now(), configuration: cfg, retained_journal: retained };
    startHash = await write(path.join(directory, 'start.json'), start, ownership); signal.throwIfAborted();
    await canonical(path.join(root, 'runs'), { create: true, output: true, signal }); await mkdir(work);
    acquired = retained ?? await buildWiChildcareAcquiredJournalWithTransport({ outputRoot: path.join(work, 'acquired'), signal, fetchImpl: value.fetchImpl,
      ...Object.fromEntries(['now', 'sleep', 'timeoutMs', 'beforePersist'].filter(k => value[k] !== undefined).map(k => [k, value[k]])) });
    check(acquired.status === 'SUCCEEDED'); await write(path.join(directory, 'acquired.json'), { retained_at: now(), verification: acquired }, ownership);
    await value.logger?.({ phase: 'acquired-checkpoint', directory, work }); signal.throwIfAborted();
    const journalMeter = {}, journal = await readJson(acquired.receipt, 500000, signal, journalMeter), evidenceMeter = {};
    check(journalMeter.sha256 === acquired.receipt_sha256);
    const evidence = await readJson(path.join(path.dirname(acquired.receipt), 'acquisition.json'), 150000000, signal, evidenceMeter);
    const descriptor = journal.artifacts.find(a => a.path === 'acquisition.json');
    check(descriptor?.sha256 === evidenceMeter.sha256 && descriptor.bytes === evidenceMeter.bytes);
    check(same(await inspectWiChildcareAcquiredJournal(acquired.receipt, { signal }), acquired));
    await ownership(); await canonical(work, { signal }); await mkdir(path.join(work, 'normalized'));
    normalizationAttempt = { started_at: now(), output_root: path.join(work, 'normalized') };
    await write(path.join(directory, 'normalization-start.json'), normalizationAttempt, ownership); signal.throwIfAborted();
    // buildRelease is a trusted injected fault seam, never a native/CLI option.
    const built = await (value.buildRelease ?? buildWiChildcareRelease)({ evidence, outputRoot: normalizationAttempt.output_root, signal, now: () => new Date(now()) });
    published = { manifest_path: built.manifest_path, manifest_sha256: built.manifest_sha256 };
    // The child finishes publication non-cancellably. Capture its committed
    // identity before honoring a stop so a published child is never lost.
    normalized = await verifyWiChildcareRelease(built.manifest_path);
    await write(path.join(directory, 'normalized.json'), { retained_at: now(), verification: normalized }, ownership);
    await value.logger?.({ phase: 'normalized-checkpoint', directory, work }); signal.throwIfAborted();
    const candidatePath = path.join(directory, 'candidate.json'); await write(candidatePath, terminal(start, startHash, acquired, normalizationAttempt, normalized, 'SUCCEEDED', now()), ownership);
    const candidate = await snapshot(candidatePath, signal); await inspect(candidatePath, signal, true); await ownership(); await stable(candidatePath, candidate, signal); signal.throwIfAborted();
    await link(candidatePath, path.join(directory, 'receipt.json')); committed = true; await unlink(candidatePath);
    return await inspect(path.join(directory, 'receipt.json'));
  } catch {
    if (!committed && startHash) {
      try { await write(path.join(directory, 'receipt.json'), terminal(start, startHash, acquired, normalizationAttempt, normalized, signal.aborted ? 'CANCELLED' : 'FAILED', now()), ownership); } catch { /* Preserve partial files for inspection. */ }
    }
    throw Object.assign(Error('Wisconsin app did not complete; inspect retained run and child evidence before retry.'), { code: 'WI_CHILDCARE_APP_INCOMPLETE', recovery: recovery() });
  } finally {
    clearTimeout(timer); let uncertain = false;
    // All child calls/hooks are awaited before releasing any shared ownership.
    for (const item of [...locks].reverse()) {
      try { await ownership(); await item.handle.close(); await unlink(item.file); locks.splice(locks.indexOf(item), 1); }
      catch { uncertain = true; try { await item.handle.close(); } catch { /* Already closed. */ } }
    }
    if (uncertain) throw Object.assign(Error('Wisconsin app ownership requires inspection.'), { code: 'WI_CHILDCARE_APP_INCOMPLETE', recovery: recovery() });
  }
}
