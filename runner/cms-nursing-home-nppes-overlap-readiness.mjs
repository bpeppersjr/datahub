import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash, randomUUID } from 'node:crypto';
import { APP_ROOT } from './paths.mjs';

export const VERSION = 'cms-nursing-home-nppes-overlap-readiness@1.1.0';
const DATASET = 'cms-nursing-home-nppes-overlap-readiness';
const SHA = /^[a-f0-9]{64}$/;
const MAX_GZIP_BYTES = 50_000_000;
const MAX_DECOMPRESSED_BYTES = 700_000_000;
const MAX_JSONL_LINE_BYTES = 262_144;
const fail = message => { throw new Error(`CMS nursing-home/NPPES overlap readiness rejected: ${message}.`); };
const check = (value, message) => { if (!value) fail(message); };
const hash = value => createHash('sha256').update(value).digest('hex');
const jsonBytes = value => Buffer.from(`${JSON.stringify(value)}\n`);
const stop = signal => signal?.throwIfAborted();
const sameFile = (a, b) => a?.isFile() && b?.isFile() && !a.isSymbolicLink() && !b.isSymbolicLink() && a.nlink === 1n && b.nlink === 1n && ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].every(key => a[key] === b[key]);
const sameDirectory = (a, b) => a?.isDirectory() && b?.isDirectory() && !a.isSymbolicLink() && !b.isSymbolicLink() && a.dev === b.dev && a.ino === b.ino;
const invoke = async (hooks, name, value) => { if (hooks?.[name]) await hooks[name](value); };

function inside(root, value) {
  const resolved = path.resolve(root, value);
  const relative = path.relative(root, resolved);
  check(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'path containment');
  return resolved;
}

async function canonicalDirectory(root, directory, { create = false, signal } = {}) {
  root = await fs.realpath(path.resolve(root));
  directory = path.resolve(directory);
  const relative = path.relative(root, directory);
  check(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'directory containment');
  let current = root;
  for (const segment of relative.split(path.sep)) {
    stop(signal);
    current = path.join(current, segment);
    if (create) try { await fs.mkdir(current); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    const stat = await fs.lstat(current, { bigint: true });
    check(stat.isDirectory() && !stat.isSymbolicLink() && await fs.realpath(current) === current, 'non-canonical directory');
  }
  return directory;
}

async function stableRead(root, file, maxBytes, signal, hooks) {
  file = inside(root, file);
  await canonicalDirectory(root, path.dirname(file), { signal });
  check(await fs.realpath(file) === file, 'non-canonical input');
  const handle = await fs.open(file, 'r');
  try {
    const before = await handle.stat({ bigint: true });
    check(before.isFile() && before.nlink === 1n && before.size <= BigInt(maxBytes), 'unsafe or oversized input');
    const raw = await handle.readFile();
    await invoke(hooks, 'afterInputRead', { file });
    stop(signal);
    const after = await handle.stat({ bigint: true });
    check(sameFile(before, after) && sameFile(after, await fs.lstat(file, { bigint: true })) && await fs.realpath(file) === file, 'input changed during read');
    return { raw, stat: after };
  } finally { await handle.close(); }
}

function normalized(value) {
  check(typeof value === 'string' && !/[\u0000-\u001f\u007f]/u.test(value), 'invalid match text');
  const result = value.normalize('NFKC').toUpperCase().replace(/&/g, ' AND ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
  check(result.length > 0, 'empty normalized match text');
  return result;
}

function addressKey(address) {
  const street = normalized(address?.street ?? '');
  const city = normalized(address?.city ?? '');
  const state = normalized(address?.state ?? '');
  const zip5 = address?.postal?.zip5 ?? address?.zip_code;
  check(street && city && /^[A-Z]{2}$/.test(state) && /^\d{5}$/.test(zip5 ?? ''), 'incomplete exact-match address');
  return `${street}\u001f${city}\u001f${state}\u001f${zip5}`;
}

function fullNppesAddress(address) {
  return {
    street: [address?.street, address?.unit_or_additional].filter(Boolean).join(' '),
    city: address?.city,
    state: address?.state,
    zip_code: address?.zip_code,
  };
}

function matchKey(name, address) { return `${normalized(name)}\u001e${addressKey(address)}`; }

async function loadInputs(root, configPath, signal, hooks) {
  const configFile = inside(root, configPath ?? 'config/cms-nursing-home-nppes-overlap-readiness.json');
  const configRead = await stableRead(root, configFile, 100_000, signal, hooks);
  const config = JSON.parse(configRead.raw);
  check(config.schema_version === 'cms-nursing-home-nppes-overlap-readiness-config@1.0.0', 'configuration version');
  const nursingManifestFile = inside(root, config.nursing_home.manifest);
  const nppesManifestFile = inside(root, config.nppes.manifest);
  const nursingManifestRead = await stableRead(root, nursingManifestFile, 100_000, signal, hooks);
  const nppesManifestRead = await stableRead(root, nppesManifestFile, 1_000_000, signal, hooks);
  check(hash(nursingManifestRead.raw) === config.nursing_home.manifest_sha256, 'nursing manifest binding');
  check(hash(nppesManifestRead.raw) === config.nppes.manifest_sha256, 'NPPES manifest binding');
  const nursingManifest = JSON.parse(nursingManifestRead.raw);
  const nppesManifest = JSON.parse(nppesManifestRead.raw);
  check(nursingManifest.claims?.currentOperationsVerified === false && nursingManifest.claims?.publicExportAuthorized === false, 'nursing claim boundary');
  check(nppesManifest.release_id === config.nppes.release_id && nppesManifest.source_release_id === config.nppes.source_release_id, 'NPPES release binding');
  const nursingArtifact = nursingManifest.artifact;
  check(nursingArtifact?.path === config.nursing_home.selected_artifact && nursingArtifact.sha256 === config.nursing_home.selected_sha256 && nursingArtifact.rows === 14_690, 'nursing artifact binding');
  const organizations = nppesManifest.artifacts.filter(item => item.artifact_type === 'normalized-nppes-organization-jsonl-gzip');
  const practices = nppesManifest.artifacts.filter(item => item.artifact_type === 'normalized-nppes-practice-location-jsonl-gzip');
  check(organizations.length === 11 && practices.length === 10, 'NPPES artifact roster');
  check(organizations.reduce((sum, x) => sum + x.record_count, 0) === nppesManifest.coverage.active_organization_npis, 'NPPES organization count');
  check(practices.reduce((sum, x) => sum + x.record_count, 0) === nppesManifest.coverage.accepted_non_primary_practice_locations, 'NPPES practice count');
  return { root, config, configHash: hash(configRead.raw), nursingManifest, nursingManifestHash: hash(nursingManifestRead.raw), nursingManifestFile, nursingArtifact, nppesManifest, nppesManifestHash: hash(nppesManifestRead.raw), nppesManifestFile, organizations, practices };
}

async function gzipRows(input, artifact, signal, onRow, hooks) {
  const maxGzip = hooks?.limits?.maxGzipBytes ?? MAX_GZIP_BYTES, maxDecompressed = hooks?.limits?.maxDecompressedBytes ?? MAX_DECOMPRESSED_BYTES, maxLine = hooks?.limits?.maxLineBytes ?? MAX_JSONL_LINE_BYTES;
  check(SHA.test(artifact.sha256) && artifact.bytes <= maxGzip, 'NPPES artifact bounds');
  const file = path.join(path.dirname(input.nppesManifestFile), artifact.path);
  await canonicalDirectory(input.root, path.dirname(file), { signal });
  check(await fs.realpath(file) === file, 'NPPES artifact canonical path');
  const handle = await fs.open(file, 'r'); let source, gunzip;
  const abort = () => { source?.destroy(); gunzip?.destroy(); };
  try {
    const before = await handle.stat({ bigint: true });
    check(before.isFile() && before.nlink === 1n && before.size === BigInt(artifact.bytes) && sameFile(before, await fs.lstat(file, { bigint: true })), 'NPPES artifact identity');
    const digest = createHash('sha256'); source = handle.createReadStream({ autoClose: false }); source.on('data', chunk => digest.update(chunk)); gunzip = source.pipe(zlib.createGunzip());
    signal?.addEventListener('abort', abort, { once: true });
    let count = 0, total = 0, pending = Buffer.alloc(0);
    for await (const chunk of gunzip) {
      stop(signal); total += chunk.length; check(total <= maxDecompressed, 'NPPES decompressed artifact ceiling');
      pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
      let newline;
      while ((newline = pending.indexOf(10)) >= 0) {
        let line = pending.subarray(0, newline); pending = pending.subarray(newline + 1); if (line.at(-1) === 13) line = line.subarray(0, -1);
        check(line.length <= maxLine, 'NPPES JSONL line ceiling'); if (!line.length) continue;
        count += 1; await onRow(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(line)));
      }
      check(pending.length <= maxLine, 'NPPES JSONL line ceiling');
    }
    if (pending.length) { check(pending.length <= maxLine, 'NPPES JSONL line ceiling'); count += 1; await onRow(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(pending))); }
    await invoke(hooks, 'afterGzipRead', { file }); stop(signal);
    const after = await handle.stat({ bigint: true }), named = await fs.lstat(file, { bigint: true });
    check(count === artifact.record_count && digest.digest('hex') === artifact.sha256 && sameFile(before, after) && sameFile(after, named) && await fs.realpath(file) === file, 'NPPES artifact replay');
  } finally { signal?.removeEventListener('abort', abort); source?.destroy(); gunzip?.destroy(); await handle.close(); }
}

function candidate(row, type) {
  const npi = type === 'primary' ? row.external_identifiers?.find(x => x.type === 'npi')?.value : row.npi;
  check(/^\d{10}$/.test(npi ?? ''), 'candidate NPI');
  return { npi, location_type: type, nppes_record_id: row.normalized_record_id, organization_id: row.entity_candidates?.organization_id, physical_site_candidate_id: row.entity_candidates?.physical_site_id };
}

async function derive(input, signal, hooks) {
  const nursingFile = path.join(path.dirname(input.nursingManifestFile), input.nursingArtifact.path);
  const nursingRead = await stableRead(input.root, nursingFile, 40_000_000, signal);
  check(hash(nursingRead.raw) === input.nursingArtifact.sha256, 'nursing selected bytes');
  const nursing = [], byAddress = new Map(), byKey = new Map(), sourceIds = new Set();
  for (const line of nursingRead.raw.toString('utf8').split('\n')) {
    if (!line) continue;
    const row = JSON.parse(line); check(typeof row.sourceRecordId === 'string' && !sourceIds.has(row.sourceRecordId), 'duplicate nursing source record'); sourceIds.add(row.sourceRecordId);
    let akey = null, key = null, matchEligibility = 'eligible';
    try { akey = addressKey(row.reportedAddress); key = matchKey(row.facilityName, row.reportedAddress); } catch { matchEligibility = 'ineligible-invalid-or-incomplete-match-fields'; }
    const item = { row, key, akey, matchEligibility, candidates: new Map() };
    nursing.push(item);
    if (key !== null) {
      if (!byAddress.has(akey)) byAddress.set(akey, []);
      byAddress.get(akey).push(item);
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(item);
    }
  }
  check(nursing.length === input.nursingArtifact.rows, 'nursing row count');

  const practiceAtRelevantAddress = new Map();
  for (const artifact of input.practices) await gzipRows(input, artifact, signal, row => {
    let akey;
    try { akey = addressKey(fullNppesAddress(row.address)); } catch { return; }
    if (!byAddress.has(akey)) return;
    if (!practiceAtRelevantAddress.has(row.npi)) practiceAtRelevantAddress.set(row.npi, []);
    practiceAtRelevantAddress.get(row.npi).push(row);
  }, hooks);

  for (const artifact of input.organizations) await gzipRows(input, artifact, signal, row => {
    const name = row.legal_business_name;
    if (!name) return;
    try {
      const primaryKey = matchKey(name, fullNppesAddress(row.primary_practice_location?.address));
      for (const item of byKey.get(primaryKey) ?? []) {
        const value = candidate(row, 'primary'); item.candidates.set(`${value.npi}:primary:${value.nppes_record_id}`, value);
      }
    } catch {}
    for (const practice of practiceAtRelevantAddress.get(row.external_identifiers?.find(x => x.type === 'npi')?.value) ?? []) {
      let key;
      try { key = matchKey(name, fullNppesAddress(practice.address)); } catch { continue; }
      for (const item of byKey.get(key) ?? []) {
        const value = candidate(practice, 'non-primary'); item.candidates.set(`${value.npi}:non-primary:${value.nppes_record_id}`, value);
      }
    }
  }, hooks);

  const rows = nursing.map(item => {
    const assertions = [...item.candidates.values()].sort((a, b) => `${a.npi}:${a.location_type}:${a.nppes_record_id}`.localeCompare(`${b.npi}:${b.location_type}:${b.nppes_record_id}`));
    const grouped = new Map(); for (const assertion of assertions) { if (!grouped.has(assertion.npi)) grouped.set(assertion.npi, []); grouped.get(assertion.npi).push(assertion); }
    const candidates = [...grouped].map(([npi, location_assertions]) => ({ npi, location_assertion_count: location_assertions.length, location_assertions })).sort((a, b) => a.npi.localeCompare(b.npi));
    const status = candidates.length === 0 ? 'unmatched' : candidates.length === 1 ? 'matched-one-distinct-npi-candidate' : 'ambiguous-multiple-distinct-npi-candidates';
    return { schema_version: '1.1.0', nursing_home_source_record_id: item.row.sourceRecordId, cms_certification_number: item.row.identifier?.value, match_eligibility: item.matchEligibility, exact_match_key_sha256: item.key === null ? null : hash(item.key), status, distinct_npi_candidate_count: candidates.length, location_assertion_count: assertions.length, candidates, claims: { identity_merged: false, npi_inferred: false, physical_site_verified: false, current_operation_verified: false } };
  }).sort((a, b) => a.nursing_home_source_record_id.localeCompare(b.nursing_home_source_record_id));
  const counts = { matched_one_distinct_npi_candidate: rows.filter(x => x.status === 'matched-one-distinct-npi-candidate').length, unmatched: rows.filter(x => x.status === 'unmatched').length, ambiguous_multiple_distinct_npi_candidates: rows.filter(x => x.status === 'ambiguous-multiple-distinct-npi-candidates').length, match_eligible_rows: rows.filter(x => x.match_eligibility === 'eligible').length, match_ineligible_rows: rows.filter(x => x.match_eligibility !== 'eligible').length };
  check(counts.matched_one_distinct_npi_candidate + counts.unmatched + counts.ambiguous_multiple_distinct_npi_candidates === nursing.length && counts.match_eligible_rows + counts.match_ineligible_rows === nursing.length, 'result conservation');
  return { rows, counts };
}

function shape(input, derived, createdAt) {
  const artifactRaw = Buffer.concat(derived.rows.map(jsonBytes));
  const body = { schema_version: VERSION, dataset_id: DATASET, status: 'immutable-local-review-only', publication_mode: 'pointer-free', created_at: createdAt, method: { version: 'exact-normalized-name-full-address@1.1.0', name: 'NFKC uppercase; ampersand expanded to AND; Unicode letter/number preserving; other runs collapsed to spaces', address_fields: ['street including unit/additional', 'city', 'state', 'ZIP5'], nppes_name_field: 'legal_business_name', match_rule: 'exact equality only', ambiguity_unit: 'distinct NPI; every matching location assertion retained beneath its NPI candidate' }, inputs: { nursing_home: { release_id: input.nursingManifest.runId, manifest_path: path.relative(input.root, input.nursingManifestFile).replaceAll('\\', '/'), manifest_sha256: input.nursingManifestHash, selected_artifact_sha256: input.nursingArtifact.sha256, rows: input.nursingArtifact.rows }, nppes: { release_id: input.nppesManifest.release_id, source_release_id: input.nppesManifest.source_release_id, manifest_path: path.relative(input.root, input.nppesManifestFile).replaceAll('\\', '/'), manifest_sha256: input.nppesManifestHash, organization_rows: input.nppesManifest.coverage.active_organization_npis, non_primary_practice_location_rows: input.nppesManifest.coverage.accepted_non_primary_practice_locations }, config_sha256: input.configHash }, summary: { nursing_home_rows: derived.rows.length, ...derived.counts, distinct_npi_candidate_links: derived.rows.reduce((n, x) => n + x.distinct_npi_candidate_count, 0), location_assertion_links: derived.rows.reduce((n, x) => n + x.location_assertion_count, 0), unique_business_count: null, active_business_count: null, completeness_percentage: null }, claims: { network_requests: 0, acquisition_performed: false, current_pointer_written: false, production_enrollment: false, identity_merge_performed: false, npi_inference_performed: false, physical_site_verified: false, current_operations_verified: false, geocode_approved: false, public_export_authorized: false, export_policy: 'local-review-only' }, artifacts: [{ path: 'overlap-readiness.jsonl', artifact_type: 'cms-nursing-home-nppes-exact-overlap-readiness-jsonl', bytes: artifactRaw.length, sha256: hash(artifactRaw), record_count: derived.rows.length, export_policy: 'local-review-only' }] };
  return { manifest: { release_id: `${DATASET}-${hash(JSON.stringify(body))}`, ...body }, artifactRaw };
}

async function writeOwned(file, raw, signal, hooks) {
  const handle = await fs.open(file, 'wx'); let initial, failure;
  try {
    initial = await handle.stat({ bigint: true }); check(initial.isFile() && initial.nlink === 1n, 'new output identity');
    for (let offset = 0; offset < raw.length;) { stop(signal); const end = Math.min(offset + 65_536, raw.length); const result = await handle.write(raw, offset, end - offset, offset); check(result.bytesWritten === end - offset, 'short output write'); offset = end; if (offset < raw.length) await invoke(hooks, 'duringArtifactWrite', { file, offset }); }
    await handle.sync(); check((await handle.stat({ bigint: true })).ino === initial.ino, 'output handle changed');
  } catch (error) { failure = error; } finally { await handle.close(); }
  if (failure) {
    try { const named = await fs.lstat(file, { bigint: true }); check(named.isFile() && !named.isSymbolicLink() && named.nlink === 1n && named.dev === initial.dev && named.ino === initial.ino, 'failed output ownership'); await fs.unlink(file); } catch { failure.inspection_required = true; }
    throw failure;
  }
  const named = await fs.lstat(file, { bigint: true });
  check(named.isFile() && !named.isSymbolicLink() && named.nlink === 1n && named.dev === initial.dev && named.ino === initial.ino && named.size === BigInt(raw.length), 'named output changed');
  return named;
}

async function removeOwnedDirectory(directory, directoryStat, ownerFile, ownerStat, owner, files, hooks, hookName) {
  await invoke(hooks, hookName, { directory, ownerFile });
  const currentDirectory = await fs.lstat(directory, { bigint: true }), currentOwner = await fs.lstat(ownerFile, { bigint: true });
  check(sameDirectory(directoryStat, currentDirectory) && sameFile(ownerStat, currentOwner) && await fs.readFile(ownerFile, 'utf8') === owner, `${hookName} ownership`);
  const entries = (await fs.readdir(directory)).sort(), expected = [...files.keys(), path.basename(ownerFile)].sort();
  check(entries.every(name => expected.includes(name)), `${hookName} unknown contents`);
  for (const name of entries) {
    const file = path.join(directory, name), expectedStat = name === path.basename(ownerFile) ? ownerStat : files.get(name);
    check(expectedStat && sameFile(expectedStat, await fs.lstat(file, { bigint: true })), `${hookName} file ownership`);
    await fs.unlink(file);
  }
  await fs.rmdir(directory);
}

export async function verifyCmsNursingHomeNppesOverlapReadiness(manifestPath, options = {}) {
  const root = await fs.realpath(path.resolve(options.root ?? APP_ROOT));
  const input = await loadInputs(root, options.configPath, options.signal);
  const manifestFile = inside(root, manifestPath);
  const read = await stableRead(root, manifestFile, 500_000, options.signal);
  const manifest = JSON.parse(read.raw), created = Date.parse(manifest.created_at), floor = Math.max(Date.parse(input.nursingManifest.createdAt), Date.parse(input.nppesManifest.observed_at));
  check(new Date(manifest.created_at).toISOString() === manifest.created_at && created >= floor && created <= Date.now() + 60_000 && created <= Number(read.stat.mtimeNs / 1_000_000n) + 60_000, 'creation clock');
  const { release_id: ignored, ...body } = manifest; void ignored;
  check(manifest.release_id === `${DATASET}-${hash(JSON.stringify(body))}`, 'release identity');
  check(path.dirname(manifestFile) === path.join(root, `data/${DATASET}/releases`, manifest.release_id), 'release path');
  const derived = await derive(input, options.signal, options._testHooks), expected = shape(input, derived, manifest.created_at);
  check(JSON.stringify(expected.manifest) === JSON.stringify(manifest), 'manifest reconstruction');
  const artifactFile = path.join(path.dirname(manifestFile), 'overlap-readiness.jsonl');
  const artifact = await stableRead(root, artifactFile, 20_000_000, options.signal);
  check(hash(artifact.raw) === manifest.artifacts[0].sha256 && Buffer.compare(artifact.raw, expected.artifactRaw) === 0, 'artifact reconstruction');
  check(JSON.stringify((await fs.readdir(path.dirname(manifestFile))).sort()) === JSON.stringify(['manifest.json', 'overlap-readiness.jsonl']), 'closed release inventory');
  return { verified: true, release_id: manifest.release_id, manifest_sha256: hash(read.raw), ...manifest.summary, ...manifest.claims };
}

export async function publishCmsNursingHomeNppesOverlapReadiness(options = {}) {
  const root = await fs.realpath(path.resolve(options.root ?? APP_ROOT));
  check(options.createdAt === undefined || root !== APP_ROOT, 'createdAt override unsupported');
  check(!options._testHooks || root !== APP_ROOT, 'test hooks require isolated root');
  stop(options.signal);
  const input = await loadInputs(root, options.configPath, options.signal, options._testHooks);
  const derived = await derive(input, options.signal, options._testHooks);
  const shaped = shape(input, derived, options.createdAt ?? new Date().toISOString());
  const base = path.join(root, `data/${DATASET}`), releases = path.join(base, 'releases'), staging = path.join(base, '.staging'), locks = path.join(base, '.locks');
  for (const directory of [base, releases, staging, locks]) await canonicalDirectory(root, directory, { create: true, signal: options.signal });
  const lock = path.join(locks, 'build.lock'), owner = randomUUID(); let lockStat, ownerStat, stage, stageStat, published = false, primary; const stageFiles = new Map();
  try {
    await fs.mkdir(lock); lockStat = await fs.lstat(lock, { bigint: true }); check(lockStat.isDirectory() && !lockStat.isSymbolicLink(), 'lock identity');
    const ownerFile = path.join(lock, 'owner'); ownerStat = await writeOwned(ownerFile, Buffer.from(owner), options.signal);
    await invoke(options._testHooks, 'afterLock', { lock, ownerFile });
    stage = path.join(staging, randomUUID()); await fs.mkdir(stage); stageStat = await fs.lstat(stage, { bigint: true }); check(stageStat.isDirectory() && !stageStat.isSymbolicLink(), 'stage identity');
    const stageOwnerFile = path.join(stage, '.owner'); const stageOwnerStat = await writeOwned(stageOwnerFile, Buffer.from(owner), options.signal); stageFiles.set('.owner', stageOwnerStat);
    await invoke(options._testHooks, 'afterStage', { stage }); stop(options.signal);
    stageFiles.set('overlap-readiness.jsonl', await writeOwned(path.join(stage, 'overlap-readiness.jsonl'), shaped.artifactRaw, options.signal, options._testHooks)); stop(options.signal);
    stageFiles.set('manifest.json', await writeOwned(path.join(stage, 'manifest.json'), jsonBytes(shaped.manifest), options.signal, options._testHooks)); stop(options.signal);
    await invoke(options._testHooks, 'afterManifestWrite', { stage }); stop(options.signal);
    await invoke(options._testHooks, 'preRename', { stage }); stop(options.signal);
    check(sameDirectory(stageStat, await fs.lstat(stage, { bigint: true })) && sameFile(stageOwnerStat, await fs.lstat(stageOwnerFile, { bigint: true })) && await fs.readFile(stageOwnerFile, 'utf8') === owner, 'stage precommit ownership');
    check(JSON.stringify((await fs.readdir(stage)).sort()) === JSON.stringify(['.owner', 'manifest.json', 'overlap-readiness.jsonl']), 'stage precommit inventory');
    for (const name of ['manifest.json', 'overlap-readiness.jsonl']) check(sameFile(stageFiles.get(name), await fs.lstat(path.join(stage, name), { bigint: true })), 'stage artifact precommit identity');
    await fs.unlink(stageOwnerFile); stageFiles.delete('.owner');
    const target = path.join(releases, shaped.manifest.release_id); await fs.rename(stage, target); published = true;
    await invoke(options._testHooks, 'postRename', { target }); stop(options.signal);
    return { ...await verifyCmsNursingHomeNppesOverlapReadiness(path.join(target, 'manifest.json'), { root, configPath: options.configPath, signal: options.signal }), directory: target };
  } catch (error) {
    primary = error;
    if (published) { error.inspection_required = true; error.release_id = shaped.manifest.release_id; }
    else if (stage && stageStat) try { const stageOwnerFile = path.join(stage, '.owner'), stageOwnerStat = stageFiles.get('.owner'); check(stageOwnerStat, 'stage owner missing'); const known = new Map([...stageFiles].filter(([name]) => name !== '.owner')); await removeOwnedDirectory(stage, stageStat, stageOwnerFile, stageOwnerStat, owner, known, options._testHooks, 'beforeStageCleanup'); } catch { error.inspection_required = true; }
    throw error;
  } finally {
    if (lockStat && ownerStat) try { const ownerFile = path.join(lock, 'owner'); await removeOwnedDirectory(lock, lockStat, ownerFile, ownerStat, owner, new Map(), options._testHooks, 'beforeLockCleanup'); } catch (error) { if (primary) primary.inspection_required = true; else { error.inspection_required = true; throw error; } }
  }
}
