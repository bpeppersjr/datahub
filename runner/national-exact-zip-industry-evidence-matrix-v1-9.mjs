import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, readdir, realpath, rename, rm, unlink } from 'node:fs/promises';
import { APP_ROOT } from './paths.mjs';
import { projectWaLniExactZipDimension, readExactZipIndustryEvidence as readV18Evidence,
  WA_LNI_EXACT_ZIP_DIMENSION as WA } from './national-exact-zip-industry-evidence-matrix.mjs';

export const VERSION = 'national-exact-zip-industry-evidence-matrix@1.9.0';
const ROW_VERSION = 'national-exact-zip-industry-evidence-matrix-row@1.9.0';
const DATASET = 'national-exact-zip-industry-evidence-matrix';
const V18_ID = 'national-exact-zip-industry-evidence-matrix-ada7e938a0bfa31a51b4cc165b0a3e357f025704eff853fb88a4ccadf2c9ceb6';
const V18_SHA = '743d1bad94a7e8b122969cbb0cb9618e20b820b4b1b5afb46285bd70458d9ffe';
const PREFIX = /^prefix=(\d{2})\.json$/;
const MAX_BYTES = 20_000_000;
const REGISTRATION = 'config/datasets/national-exact-zip-industry-evidence-matrix-v1-9.json';
const RELEASE_ID = 'national-exact-zip-industry-evidence-matrix-0055db697e2ef0900edb00b43e8114c146ad446a0bbb41633b938d445f74b003';
const MANIFEST_SHA = 'aa155af612f232bafe83d59583500452326bcd16d565c4445425b9f99a8f4ad1';
const WA_ROW_KEYS = ['count', 'status', 'zip4', 'zip5'];
const WA_ROOT_KEYS = ['bindings', 'claims', 'dimension_id', 'rows', 'source_id', 'summary'];
const WA_BINDING_KEYS = ['artifact_sha256', 'manifest_sha256', 'pointer_sha256', 'release_id', 'source_policy_sha256', 'source_release_id'];
const EXPECTED_WA_CLAIMS = {
  wa_broad_jurisdiction_gap_complete: false, physical_site_inference_permitted: false,
  establishment_inference_permitted: false, current_operations_verified: false,
  all_business_completeness_percent: null, nonadditive: true,
  record_level_export_policy: 'local-review-only',
  aggregate_export_policy: 'public-under-pddl-with-attribution-and-semantic-limitations',
  zip4_joined_to_zip5: false, production_enrollment: false, network_requests: 0,
};

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = message => { throw new Error(`Exact-ZIP v1.9 rejected: ${message}.`); };
const check = (value, message) => { if (!value) fail(message); };
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
const claims = () => ({ ...EXPECTED_WA_CLAIMS, current_pointer_written: false });
const sameIdentity = (left, right) => left && right && left.dev === right.dev && left.ino === right.ino;

async function safeDirectory(root, target, { create = false } = {}) {
  const canonicalRoot = await realpath(root);
  const resolved = path.resolve(target);
  check(resolved === canonicalRoot || resolved.startsWith(`${canonicalRoot}${path.sep}`), 'path containment');
  let cursor = canonicalRoot;
  for (const component of path.relative(canonicalRoot, resolved).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, component);
    let stat;
    try { stat = await lstat(cursor, { bigint: true }); }
    catch (error) {
      if (error.code !== 'ENOENT' || !create) throw error;
      await mkdir(cursor);
      stat = await lstat(cursor, { bigint: true });
    }
    check(stat.isDirectory() && !stat.isSymbolicLink(), 'linked or non-directory ancestry');
    check(await realpath(cursor) === cursor, 'linked ancestry');
  }
  return resolved;
}

async function stableBytes(root, file, max = MAX_BYTES) {
  await safeDirectory(root, path.dirname(file));
  const before = await lstat(file, { bigint: true });
  check(before.isFile() && !before.isSymbolicLink() && before.nlink === 1n, 'single-link file');
  check(before.size <= BigInt(max), 'byte ceiling');
  const bytes = await readFile(file);
  const after = await lstat(file, { bigint: true });
  check(sameIdentity(before, after) && after.nlink === 1n && before.size === after.size
    && before.mtimeNs === after.mtimeNs && bytes.length === Number(before.size), 'stable input');
  return { bytes, sha256: sha256(bytes) };
}

function validateWa(wa, expected = null) {
  check(exactKeys(wa, WA_ROOT_KEYS), 'WA projection keys');
  check(wa.dimension_id === WA.id && wa.source_id === WA.source_id, 'WA identity');
  check(exactKeys(wa.bindings, WA_BINDING_KEYS)
    && ['pointer_sha256', 'manifest_sha256', 'artifact_sha256', 'source_policy_sha256']
      .every(key => wa.bindings[key] === WA[key])
    && wa.bindings.release_id === WA.release_id && wa.bindings.source_release_id === WA.source_release_id,
  'WA bindings');
  check(JSON.stringify(wa.claims) === JSON.stringify(EXPECTED_WA_CLAIMS), 'WA claims');
  check(Array.isArray(wa.rows) && exactKeys(wa.summary, [
    'eligible_mailing_address_rows', 'missing_or_ineligible_mailing_address_rows', 'positive_zip5_rows',
  ]), 'WA summary');
  let prior = '', count = 0;
  for (const row of wa.rows) {
    check(exactKeys(row, WA_ROW_KEYS) && /^\d{5}$/.test(row.zip5) && row.zip4 === null && row.status === 'positive'
      && Number.isSafeInteger(row.count) && row.count > 0, 'WA row');
    check(row.zip5 > prior, 'WA rows unique and strictly sorted');
    prior = row.zip5;
    count += row.count;
  }
  check(wa.rows.length === wa.summary.positive_zip5_rows
    && count === wa.summary.eligible_mailing_address_rows
    && Number.isSafeInteger(wa.summary.missing_or_ineligible_mailing_address_rows)
    && wa.summary.missing_or_ineligible_mailing_address_rows >= 0, 'WA conservation');
  if (expected) check(wa.rows.length === expected.wa_positive_zip5_rows
    && count === expected.wa_eligible_mailing_address_rows
    && wa.summary.missing_or_ineligible_mailing_address_rows === expected.wa_missing_or_ineligible_mailing_address_rows,
  'WA expected conservation');
  return new Map(wa.rows.map(row => [row.zip5, row.count]));
}

function successor(row, waMap) {
  check(row?.schema_version === 'national-exact-zip-industry-evidence-matrix-row@1.8.0'
    && /^\d{5}$/.test(row.zip5) && row.zip4 === null && Object.keys(row.cells ?? {}).length === 39
    && !Object.hasOwn(row.cells, WA.id), 'predecessor row');
  const count = waMap.get(row.zip5) ?? 0;
  return { ...row, schema_version: ROW_VERSION, cells: { ...row.cells, [WA.id]: {
    status: count ? 'positive' : 'absent-from-retained-source-rows', count: count || null,
    measure: 'active_contractor_organization_mailing_address_count', source_release_id: WA.release_id,
    temporal_status: { status: 'source-referenced-current-operation-unverified', source_reference_date: '2026-09-07T00:35:49.000Z' },
  } } };
}

function manifestBody({ artifacts, summary, predecessor, wa }) {
  return { schema_version: VERSION, dataset_id: DATASET, status: 'immutable-pointer-free-local-review-only',
    publication_mode: 'pointer-free', claims: claims(), bindings: { predecessor, wa }, summary, artifacts };
}

async function writeOwned(file, bytes) {
  const handle = await open(file, 'wx');
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
}

async function acquire(file) {
  const handle = await open(file, 'wx');
  const identity = await handle.stat({ bigint: true });
  await handle.writeFile(`${process.pid}\n`); await handle.sync();
  return { handle, identity };
}

async function ownedCleanup(directory, identity, owned) {
  const current = await lstat(directory, { bigint: true }).catch(() => null);
  if (!sameIdentity(identity, current) || !current?.isDirectory() || current.isSymbolicLink()) return;
  for (const name of await readdir(directory)) {
    if (!owned.has(name)) return;
    const stat = await lstat(path.join(directory, name), { bigint: true });
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n) return;
  }
  await rm(directory, { recursive: true });
}

async function inspectRelease(root, directory, expectedManifest) {
  await safeDirectory(root, directory);
  const names = (await readdir(directory)).sort();
  const expectedNames = ['manifest.json', ...expectedManifest.artifacts.map(item => item.path)].sort();
  check(JSON.stringify(names) === JSON.stringify(expectedNames), 'closed release inventory');
  const manifestBytes = await stableBytes(root, path.join(directory, 'manifest.json'), 1_000_000);
  check(manifestBytes.bytes.equals(Buffer.from(`${JSON.stringify(expectedManifest, null, 2)}\n`)), 'release manifest collision');
  for (const artifact of expectedManifest.artifacts) {
    const actual = await stableBytes(root, path.join(directory, artifact.path));
    check(actual.bytes.length === artifact.bytes && actual.sha256 === artifact.sha256, 'release artifact collision');
    const rows = JSON.parse(actual.bytes);
    check(Array.isArray(rows) && rows.length === artifact.record_count, 'release record collision');
  }
}

async function engine({ root, outputRoot, signal, predecessor, wa, expected, afterInputs, recheckWa, manifestWriter }) {
  root = await realpath(root);
  outputRoot = path.resolve(outputRoot);
  check(outputRoot.startsWith(`${root}${path.sep}data${path.sep}`), 'output containment');
  await safeDirectory(root, outputRoot, { create: true });
  const lockPath = path.join(outputRoot, '.v1-9.lock');
  let lock, staging, stagingIdentity;
  const owned = new Set();
  try {
    lock = await acquire(lockPath);
    signal?.throwIfAborted();
    const waMap = validateWa(wa, expected);
    const artifacts = [];
    const summary = { zip5_rows: 0, dimension_count: 40, industry_cells: 0,
      wa_positive_zip5_rows: 0, wa_absent_zip5_rows: 0, wa_eligible_mailing_address_rows: 0,
      wa_missing_or_ineligible_mailing_address_rows: wa.summary.missing_or_ineligible_mailing_address_rows };
    staging = path.join(outputRoot, `.staging-${randomUUID()}`);
    await mkdir(staging); stagingIdentity = await lstat(staging, { bigint: true });
    for (const descriptor of predecessor.artifacts) {
      signal?.throwIfAborted();
      check(exactKeys(descriptor, ['bytes', 'path', 'record_count', 'sha256']) && PREFIX.test(descriptor.path), 'prefix descriptor');
      const input = await stableBytes(root, path.join(predecessor.directory, descriptor.path));
      check(input.sha256 === descriptor.sha256 && input.bytes.length === descriptor.bytes, 'predecessor artifact pin');
      const prior = JSON.parse(input.bytes); check(Array.isArray(prior) && prior.length === descriptor.record_count, 'predecessor artifact count');
      const rows = [];
      for (const [index, row] of prior.entries()) { if (index % 256 === 0) signal?.throwIfAborted(); rows.push(successor(row, waMap)); }
      for (const row of rows) { const cell = row.cells[WA.id]; summary.zip5_rows += 1;
        if (cell.status === 'positive') { summary.wa_positive_zip5_rows += 1; summary.wa_eligible_mailing_address_rows += cell.count; }
        else summary.wa_absent_zip5_rows += 1; }
      const bytes = Buffer.from(`${JSON.stringify(rows)}\n`);
      await writeOwned(path.join(staging, descriptor.path), bytes); owned.add(descriptor.path);
      artifacts.push({ path: descriptor.path, bytes: bytes.length, sha256: sha256(bytes), record_count: rows.length });
    }
    summary.industry_cells = summary.zip5_rows * 40;
    check(JSON.stringify(summary) === JSON.stringify(expected), 'national conservation');
    await afterInputs?.(); signal?.throwIfAborted();
    for (const descriptor of predecessor.artifacts) { const input = await stableBytes(root, path.join(predecessor.directory, descriptor.path));
      check(input.sha256 === descriptor.sha256 && input.bytes.length === descriptor.bytes, 'predecessor changed before commit'); }
    for (const descriptor of artifacts) { const staged = await stableBytes(root, path.join(staging, descriptor.path));
      check(staged.sha256 === descriptor.sha256 && staged.bytes.length === descriptor.bytes, 'staged artifact changed'); }
    if (recheckWa) { const again = await recheckWa(); validateWa(again, expected);
      check(JSON.stringify(again) === JSON.stringify(wa), 'WA input changed before commit'); }
    const body = manifestBody({ artifacts, summary, predecessor: predecessor.binding, wa: wa.bindings });
    const releaseId = `${DATASET}-${sha256(JSON.stringify(body))}`;
    const manifest = { release_id: releaseId, ...body };
    const manifestPath = path.join(staging, 'manifest.json');
    if (manifestWriter) await manifestWriter(manifestPath, manifest);
    else await writeOwned(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    owned.add('manifest.json');
    await inspectRelease(root, staging, manifest);
    const releases = await safeDirectory(root, path.join(outputRoot, 'releases'), { create: true });
    const releaseDir = path.join(releases, releaseId);
    const existing = await lstat(releaseDir).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
    if (existing) {
      await inspectRelease(root, releaseDir, manifest);
      await ownedCleanup(staging, stagingIdentity, owned); staging = null;
      return { release_id: releaseId, manifest: path.join(releaseDir, 'manifest.json'), summary, reused: true };
    }
    signal?.throwIfAborted();
    await rename(staging, releaseDir); staging = null;
    return { release_id: releaseId, manifest: path.join(releaseDir, 'manifest.json'), summary, reused: false };
  } catch (error) {
    if (staging) await ownedCleanup(staging, stagingIdentity, owned);
    throw error;
  } finally {
    if (lock) {
      await lock.handle.close();
      const current = await lstat(lockPath, { bigint: true }).catch(() => null);
      if (sameIdentity(lock.identity, current) && current?.isFile() && current.nlink === 1n) await unlink(lockPath);
    }
  }
}

async function nativeInputs(root, signal) {
  const registrationBytes = await stableBytes(root, path.join(root, 'config/datasets/national-exact-zip-industry-evidence-matrix.json'), 200_000);
  const registration = JSON.parse(registrationBytes.bytes), retained = registration.retained_release;
  check(retained.release_id === V18_ID && retained.manifest_sha256 === V18_SHA, 'v1.8 registration');
  const manifestBytes = await stableBytes(root, path.join(root, retained.manifest), 1_000_000);
  check(manifestBytes.sha256 === V18_SHA, 'v1.8 manifest');
  const manifest = JSON.parse(manifestBytes.bytes), artifacts = manifest.artifacts.filter(item => PREFIX.test(item.path));
  check(artifacts.length === 100 && new Set(artifacts.map(item => item.path)).size === 100, 'v1.8 prefix roster');
  const wa = await projectWaLniExactZipDimension({ root, signal }); validateWa(wa);
  return { predecessor: { artifacts, directory: path.join(root, path.posix.dirname(retained.manifest)),
    binding: { release_id: V18_ID, manifest_sha256: V18_SHA } }, wa };
}

export async function preflightNationalExactZipIndustryEvidenceMatrixV19({ root = APP_ROOT, signal } = {}) {
  const input = await nativeInputs(root, signal);
  validateWa(input.wa, NATIONAL_EXPECTED);
  return { valid: true, dimension_id: input.wa.dimension_id, source_id: input.wa.source_id,
    positive_zip5_rows: input.wa.summary.positive_zip5_rows,
    eligible_mailing_address_rows: input.wa.summary.eligible_mailing_address_rows,
    missing_or_ineligible_mailing_address_rows: input.wa.summary.missing_or_ineligible_mailing_address_rows,
    output_writes: 0 };
}

export async function readExactZipIndustryEvidenceV19({ root = APP_ROOT, zip5, signal } = {}) {
  check(/^\d{5}$/.test(zip5 ?? ''), 'ZIP5'); root = await realpath(root); signal?.throwIfAborted();
  const registrationRead = await stableBytes(root, path.join(root, REGISTRATION), 100_000);
  const registration = JSON.parse(registrationRead.bytes), retained = registration.retained_release;
  check(exactKeys(registration, ['claims', 'dataset_id', 'documentation', 'production_enrollment', 'retained_release', 'runtime_pointer', 'schema_version', 'status'])
    && registration.schema_version === '1.9.0' && registration.dataset_id === DATASET
    && registration.status === 'registered-pointer-free-local-review-only' && registration.runtime_pointer === null
    && registration.production_enrollment === false && JSON.stringify(registration.claims) === JSON.stringify(claims())
    && retained.release_id === RELEASE_ID && retained.manifest_sha256 === MANIFEST_SHA
    && retained.manifest === `data/national-exact-zip-industry-evidence-matrix-v1-9/releases/${RELEASE_ID}/manifest.json`
    && retained.zip5_rows === 48194 && retained.dimension_count === 40 && retained.industry_cells === 1927760
    && retained.artifact_count === 100 && retained.max_prefix_artifact_bytes <= MAX_BYTES, 'registration');
  const manifestRead = await stableBytes(root, path.join(root, retained.manifest), 1_000_000), manifest = JSON.parse(manifestRead.bytes);
  check(manifestRead.sha256 === MANIFEST_SHA && manifest.release_id === RELEASE_ID && manifest.schema_version === VERSION
    && manifest.dataset_id === DATASET && manifest.status === 'immutable-pointer-free-local-review-only'
    && manifest.publication_mode === 'pointer-free' && JSON.stringify(manifest.claims) === JSON.stringify(claims())
    && manifest.artifacts.length === 100 && manifest.summary.dimension_count === 40
    && manifest.summary.zip5_rows === 48194 && manifest.summary.industry_cells === 1927760, 'registered manifest');
  const descriptor = manifest.artifacts.find(item => item.path === `prefix=${zip5.slice(0, 2)}.json`);
  check(descriptor && exactKeys(descriptor, ['bytes', 'path', 'record_count', 'sha256'])
    && descriptor.bytes <= retained.max_prefix_artifact_bytes, 'registered bounded prefix');
  const prefixRead = await stableBytes(root, path.join(path.dirname(path.join(root, retained.manifest)), descriptor.path), retained.max_prefix_artifact_bytes);
  check(prefixRead.sha256 === descriptor.sha256 && prefixRead.bytes.length === descriptor.bytes, 'selected prefix pin');
  const rows = JSON.parse(prefixRead.bytes); check(Array.isArray(rows) && rows.length === descriptor.record_count, 'selected prefix rows');
  const row = rows.find(item => item.zip5 === zip5) ?? null;
  if (row) check(row.schema_version === ROW_VERSION && row.zip5 === zip5 && row.zip4 === null
    && Object.keys(row.cells ?? {}).length === 40 && row.cells[WA.id], 'selected row');
  const predecessor = await readV18Evidence({ root, zip5 });
  const cellStatusCounts = { ...predecessor.cell_status_counts_by_dimension,
    [WA.id]: { positive: 3113, 'measured-zero': 0, 'outside-source-denominator': 0,
      'absent-from-retained-source-rows': 45081, unavailable: 0 } };
  const statusCounts = { ...predecessor.status_counts, positive: predecessor.status_counts.positive + 3113,
    'absent-from-retained-source-rows': predecessor.status_counts['absent-from-retained-source-rows'] + 45081 };
  return { schema_version: VERSION, status: 'present', row, source_metadata: predecessor.source_metadata,
    status_counts: statusCounts, cell_status_counts_by_dimension: cellStatusCounts,
    release_id: RELEASE_ID, manifest_sha256: MANIFEST_SHA,
    source_bytes_read: registrationRead.bytes.length + manifestRead.bytes.length + prefixRead.bytes.length + predecessor.source_bytes_read,
    full_matrix_replay_performed: false, claims: manifest.claims };
}

export async function verifyRegisteredNationalExactZipIndustryEvidenceMatrixV19({ root = APP_ROOT, signal } = {}) {
  await readExactZipIndustryEvidenceV19({ root, zip5: '00000', signal });
  return verifyNationalExactZipIndustryEvidenceMatrixV19(
    path.join(root, `data/national-exact-zip-industry-evidence-matrix-v1-9/releases/${RELEASE_ID}/manifest.json`), { root, signal });
}

const NATIONAL_EXPECTED = { zip5_rows: 48194, dimension_count: 40, industry_cells: 1927760,
  wa_positive_zip5_rows: 3113, wa_absent_zip5_rows: 45081, wa_eligible_mailing_address_rows: 74030,
  wa_missing_or_ineligible_mailing_address_rows: 111 };

export async function buildNationalExactZipIndustryEvidenceMatrixV19({ root = APP_ROOT,
  outputRoot = path.join(APP_ROOT, 'data/national-exact-zip-industry-evidence-matrix-v1-9'), signal } = {}) {
  const inputs = await nativeInputs(root, signal);
  return engine({ root, outputRoot, signal, ...inputs, expected: NATIONAL_EXPECTED,
    recheckWa: () => projectWaLniExactZipDimension({ root, signal }) });
}
export const buildNationalExactZipIndustryEvidenceMatrixV19WithTestInputs = engine;

async function verifyEngine(manifestPath, { root, signal, inputLoader, expected }) {
  root = await realpath(root);
  const manifestBytes = await stableBytes(root, manifestPath, 1_000_000), manifest = JSON.parse(manifestBytes.bytes);
  const manifestKeys = ['release_id', 'schema_version', 'dataset_id', 'status', 'publication_mode', 'claims', 'bindings', 'summary', 'artifacts'];
  check(exactKeys(manifest, manifestKeys), 'manifest keys');
  const { release_id: releaseId, ...body } = manifest;
  check(path.basename(path.dirname(manifestPath)) === releaseId && releaseId === `${DATASET}-${sha256(JSON.stringify(body))}`
    && body.schema_version === VERSION && body.dataset_id === DATASET && body.status === 'immutable-pointer-free-local-review-only'
    && body.publication_mode === 'pointer-free' && JSON.stringify(body.claims) === JSON.stringify(claims())
    && JSON.stringify(body.summary) === JSON.stringify(expected), 'manifest identity/claims');
  const input = await inputLoader(root, signal), waMap = validateWa(input.wa, expected);
  check(JSON.stringify(body.bindings) === JSON.stringify({ predecessor: input.predecessor.binding, wa: input.wa.bindings }), 'live bindings');
  const names = await readdir(path.dirname(manifestPath));
  check(names.length === body.artifacts.length + 1 && names.includes('manifest.json'), 'closed inventory');
  let total = 0;
  for (let index = 0; index < body.artifacts.length; index += 1) {
    signal?.throwIfAborted(); const artifact = body.artifacts[index], predecessor = input.predecessor.artifacts[index];
    check(exactKeys(artifact, ['bytes', 'path', 'record_count', 'sha256']) && artifact.path === predecessor.path && PREFIX.test(artifact.path), 'artifact descriptor/roster');
    const priorBytes = await stableBytes(root, path.join(input.predecessor.directory, predecessor.path));
    check(priorBytes.sha256 === predecessor.sha256 && priorBytes.bytes.length === predecessor.bytes, 'live predecessor pin');
    const actual = await stableBytes(root, path.join(path.dirname(manifestPath), artifact.path));
    check(actual.sha256 === artifact.sha256 && actual.bytes.length === artifact.bytes, 'artifact bytes');
    const rows = JSON.parse(actual.bytes), prior = JSON.parse(priorBytes.bytes);
    check(rows.length === artifact.record_count && rows.length === prior.length, 'artifact row counts');
    for (let row = 0; row < rows.length; row += 1) { if (row % 256 === 0) signal?.throwIfAborted();
      check(JSON.stringify(rows[row]) === JSON.stringify(successor(prior[row], waMap)), 'successor replay'); }
    total += rows.length;
  }
  for (const predecessor of input.predecessor.artifacts) { const final = await stableBytes(root, path.join(input.predecessor.directory, predecessor.path));
    check(final.sha256 === predecessor.sha256 && final.bytes.length === predecessor.bytes, 'predecessor final recheck'); }
  const finalInput = await inputLoader(root, signal); validateWa(finalInput.wa, expected);
  check(JSON.stringify(finalInput.wa) === JSON.stringify(input.wa), 'WA final recheck');
  check(total === expected.zip5_rows, 'row total');
  return { verified: true, release_id: releaseId, rows: total, dimensions: 40 };
}

export function verifyNationalExactZipIndustryEvidenceMatrixV19(manifestPath, { root = APP_ROOT, signal } = {}) {
  return verifyEngine(manifestPath, { root, signal, inputLoader: nativeInputs, expected: NATIONAL_EXPECTED });
}
export const verifyNationalExactZipIndustryEvidenceMatrixV19WithTestInputs = verifyEngine;
