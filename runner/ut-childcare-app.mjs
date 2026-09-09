import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {open, mkdir, lstat, link, unlink, readdir, statfs} from 'node:fs/promises';
import {isDeepStrictEqual as same} from 'node:util';
import {APP_ROOT} from './paths.mjs';
import {mnSelectionCanonical as canonical, mnSelectionReadJson as readJson, mnSelectionReadLines as readLines} from './mn-construction-retained-selection.mjs';
import {verifyUtChildcareNormalizedRelease} from './ut-childcare-normalized-release.mjs';

export const UT_CHILDCARE_APP_VERSION = 'ut-childcare-app@1.0.0';
export const UT_CHILDCARE_APP_CONTRACT_SHA256 = '6a3451e3ea94bd2239bae8577dc0ef18a4313d06545640a42f5fc22590c68617';
const NORMALIZATION = '25f707780e977bcb5c99dfb69a3cd770bcbfffca413b416298f9b547ae8ce70b';
const RETAINED = Object.freeze({run_id: '6aaca68b-f0cc-4ada-a301-0ada860574b8', manifest_sha256: '1ff46a94e79a75629707438492f0caa6e9cbc8961fa282748406d38f0c2aec43'});
const MANIFEST = path.join(APP_ROOT, 'data/business-sources/ut-childcare/normalized', RETAINED.run_id, 'manifest.json');
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const hash = value => createHash('sha256').update(value).digest('hex');
const encode = value => Buffer.from(JSON.stringify(value) + '\n');
const check = value => { if (!value) throw Object.assign(Error('Utah app evidence rejected.'), {code: 'UT_CHILDCARE_APP_REJECTED'}); };
const time = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const claims = () => ({execution_mode: 'retained-local-adoption', refetch_performed: false, normalization_rebuilt: false,
  historical_app_acquisition_verified: false, current_operations_verified: false, physical_sites_verified: false,
  national_reporting_integrated: false, public_export_authorized: false, scheduled: false, export_policy: 'internal'});
function options(value, keys) {
  check(value && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
    && Reflect.ownKeys(value).every(key => keys.includes(key) && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value')));
  check(value.signal === undefined || value.signal instanceof AbortSignal);
}
async function configuration(signal) {
  for (const [file, expected] of [['ut-childcare-centers-app.json', UT_CHILDCARE_APP_CONTRACT_SHA256], ['ut-childcare-centers-normalization.json', NORMALIZATION]])
    check(hash(JSON.stringify(await readJson(path.join(APP_ROOT, 'config/connectors', file), 100000, signal))) === expected);
  return {app_sha256: UT_CHILDCARE_APP_CONTRACT_SHA256, normalization_sha256: NORMALIZATION};
}
async function snapshot(file, signal) { const meter = {}; const value = await readJson(file, 100000, signal, meter); return {value, meter}; }
async function unchanged(file, initial, signal) {
  const final = await snapshot(file, signal);
  check(same(final.value, initial.value) && final.meter.sha256 === initial.meter.sha256
    && final.meter.identity.ino === initial.meter.identity.ino && final.meter.identity.dev === initial.meter.identity.dev);
}
async function write(file, value) {
  await canonical(path.dirname(file)); const temporary = file + '.tmp', handle = await open(temporary, 'wx');
  let owner;
  try { owner = await handle.stat({bigint: true}); await handle.writeFile(encode(value)); await handle.sync(); } finally { await handle.close(); }
  const measured = await snapshot(temporary);
  check(same(measured.value, value) && measured.meter.identity.ino === owner.ino && measured.meter.identity.dev === owner.dev);
  await unchanged(temporary, measured); await link(temporary, file); await unlink(temporary); return measured.meter.sha256;
}
// A full semantic replay is followed by bounded artifact rehashes at publication;
// this avoids decoding the same retained PDF repeatedly within one app job.
async function linkedUnchanged(verification, signal) {
  check(verification.manifest_path === MANIFEST && verification.run_id === RETAINED.run_id && verification.manifest_sha256 === RETAINED.manifest_sha256);
  const measured = {}; await readJson(MANIFEST, 100000, signal, measured); check(measured.sha256 === RETAINED.manifest_sha256);
  for (const artifact of verification.artifacts) {
    check(['normalized.jsonl', 'summary.json'].includes(artifact.path)); const meter = {};
    for await (const row of readLines(path.join(path.dirname(MANIFEST), artifact.path), artifact.path === 'normalized.jsonl' ? 16000000 : 100000, signal, meter)) void row;
    check(meter.sha256 === artifact.sha256 && meter.bytes === artifact.bytes && meter.records === artifact.records);
  }
  check(same((await readdir(path.dirname(MANIFEST))).sort(), ['manifest.json', 'normalized.jsonl', 'summary.json']));
}
function terminal(start, startHash, normalized, finishedAt) {
  return {schema_version: UT_CHILDCARE_APP_VERSION, run_id: start.run_id, industry_run_id: start.industry_run_id,
    status: 'SUCCEEDED', started_at: start.started_at, finished_at: finishedAt, execution_mode: 'retained-local-adoption',
    configuration: start.configuration, start_sha256: startHash, normalized, claims: claims()};
}
async function inspect(receiptPath, signal, verified) {
  signal?.throwIfAborted(); const config = await configuration(signal);
  check(typeof receiptPath === 'string' && receiptPath === path.resolve(receiptPath) && ['receipt.json', ...(verified ? ['candidate.json'] : [])].includes(path.basename(receiptPath)));
  const directory = path.dirname(receiptPath), id = path.basename(directory);
  check(UUID.test(id) && path.basename(path.dirname(directory)) === 'jobs'); await canonical(directory, {signal});
  const identity = await lstat(directory, {bigint: true});
  const receipt = await snapshot(receiptPath, signal), start = await snapshot(path.join(directory, 'start.json'), signal), checkpoint = await snapshot(path.join(directory, 'normalized.json'), signal);
  const s = start.value;
  check(same(s, {schema_version: UT_CHILDCARE_APP_VERSION, run_id: id, industry_run_id: s.industry_run_id,
    started_at: s.started_at, execution_mode: 'retained-local-adoption', configuration: config, retained_normalized: {...RETAINED, manifest_path: MANIFEST}}));
  check(time(s.started_at) && (s.industry_run_id === null || typeof s.industry_run_id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(s.industry_run_id)));
  const normalized = verified ?? await verifyUtChildcareNormalizedRelease(MANIFEST, {signal});
  await linkedUnchanged(normalized, signal);
  const manifest = await readJson(MANIFEST, 100000, signal);
  check(manifest.processed_at <= s.started_at && same(checkpoint.value, {retained_at: checkpoint.value.retained_at, verification: normalized})
    && time(checkpoint.value.retained_at) && checkpoint.value.retained_at >= s.started_at);
  check(time(receipt.value.finished_at) && receipt.value.finished_at >= checkpoint.value.retained_at
    && same(receipt.value, terminal(s, start.meter.sha256, normalized, receipt.value.finished_at)));
  const roster = [path.basename(receiptPath), 'start.json', 'normalized.json'].sort();
  for (const [name, value] of [[path.basename(receiptPath), receipt], ['start.json', start], ['normalized.json', checkpoint]]) await unchanged(path.join(directory, name), value, signal);
  await canonical(directory, {signal}); const final = await lstat(directory, {bigint: true});
  check(final.ino === identity.ino && final.dev === identity.dev && same((await readdir(directory)).sort(), roster));
  await configuration(signal); signal?.throwIfAborted();
  return {receiptPath, receipt: receipt.value, receipt_sha256: receipt.meter.sha256};
}
export async function verifyUtChildcareAppJob(receiptPath, value = {}) {
  options(value, ['signal']);
  try { return await inspect(receiptPath, value.signal); } catch { value.signal?.throwIfAborted(); throw Error('Utah app receipt verification failed.'); }
}
export async function runUtChildcareAppJob(value = {}) {
  options(value, ['outputRoot', 'signal', 'industryRunId']);
  const parent = value.signal, controller = new AbortController(), signal = controller.signal;
  const abort = () => controller.abort(); if (parent?.aborted) abort(); else parent?.addEventListener('abort', abort, {once: true});
  const timer = setTimeout(abort, 600000);
  let lock, lockIdentity, lockPath, lockValue, directory, directoryIdentity, start, startHash, normalized = null, committed = false;
  async function owned(file, identity) {
    if (!identity) return false;
    try { await canonical(path.dirname(file)); const current = await lstat(file, {bigint: true});
      return current.ino === identity.ino && current.dev === identity.dev && !current.isSymbolicLink()
        && (identity.isDirectory() ? current.isDirectory() : current.isFile() && current.nlink === 1n);
    } catch { return false; }
  }
  const assertOwned = async () => check(await owned(directory, directoryIdentity) && await owned(lockPath, lockIdentity) && same(await readJson(lockPath, 1000), lockValue));
  try {
    signal.throwIfAborted(); const config = await configuration(signal), industry = value.industryRunId ?? null;
    check(industry === null || typeof industry === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(industry));
    const root = value.outputRoot ?? path.join(APP_ROOT, 'data/business-sources/ut-childcare/app');
    check(typeof root === 'string' && root === path.resolve(root) && !path.relative(APP_ROOT, root).split(path.sep).some(part => part.toLowerCase() === 'jobs'));
    await canonical(root, {output: true, signal});
    for (let current = root; current !== APP_ROOT; current = path.dirname(current)) {
      check(path.dirname(current) !== current);
      if (UUID.test(path.basename(current)) && path.basename(path.dirname(current)) === 'runs') {
        const priorStart = path.join(path.dirname(path.dirname(current)), 'jobs', path.basename(current), 'start.json');
        check(!await lstat(priorStart).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; }));
      }
    }
    await canonical(root, {output: true, create: true, signal}); const disk = await statfs(root, {bigint: true}); check(disk.bavail * disk.bsize >= 64000000n);
    lockPath = path.join(root, '.owner.lock'); lock = await open(lockPath, 'wx'); lockIdentity = await lock.stat({bigint: true});
    lockValue = {run_id: randomUUID(), pid: process.pid}; await lock.writeFile(encode(lockValue)); await lock.sync();
    await canonical(path.join(root, 'jobs'), {output: true, create: true, signal}); directory = path.join(root, 'jobs', lockValue.run_id);
    await mkdir(directory); directoryIdentity = await lstat(directory, {bigint: true});
    start = {schema_version: UT_CHILDCARE_APP_VERSION, run_id: lockValue.run_id, industry_run_id: industry, started_at: new Date().toISOString(),
      execution_mode: 'retained-local-adoption', configuration: config, retained_normalized: {...RETAINED, manifest_path: MANIFEST}};
    await assertOwned(); startHash = await write(path.join(directory, 'start.json'), start);
    normalized = await verifyUtChildcareNormalizedRelease(MANIFEST, {signal}); await linkedUnchanged(normalized, signal);
    await assertOwned(); await write(path.join(directory, 'normalized.json'), {retained_at: new Date().toISOString(), verification: normalized}); signal.throwIfAborted();
    await write(path.join(directory, 'candidate.json'), terminal(start, startHash, normalized, new Date().toISOString()));
    const candidate = await inspect(path.join(directory, 'candidate.json'), signal, normalized);
    await assertOwned(); await linkedUnchanged(normalized, signal); signal.throwIfAborted();
    const finalCandidate = await snapshot(path.join(directory, 'candidate.json'), signal);
    check(finalCandidate.meter.sha256 === candidate.receipt_sha256 && same(finalCandidate.value, candidate.receipt));
    await link(path.join(directory, 'candidate.json'), path.join(directory, 'receipt.json')); committed = true; await unlink(path.join(directory, 'candidate.json'));
    return {...candidate, receiptPath: path.join(directory, 'receipt.json')};
  } catch {
    if (!committed && startHash) {
      try { await assertOwned(); await write(path.join(directory, 'receipt.json'), {...terminal(start, startHash, normalized, new Date().toISOString()),
        status: signal.aborted ? 'CANCELLED' : 'FAILED', error_code: signal.aborted ? 'UT_CHILDCARE_APP_CANCELLED' : 'UT_CHILDCARE_APP_FAILED', output_state: 'inspection-required'}); }
      catch { throw Error('Utah app output incomplete; preserve evidence for inspection.'); }
    }
    throw Error(signal.aborted ? 'Utah app cancelled; inspect retained evidence.' : 'Utah app failed; inspect retained evidence.');
  } finally {
    clearTimeout(timer); parent?.removeEventListener('abort', abort);
    if (lock) { await lock.close(); check(await owned(lockPath, lockIdentity) && same(await readJson(lockPath, 1000), lockValue)); await unlink(lockPath); }
  }
}
