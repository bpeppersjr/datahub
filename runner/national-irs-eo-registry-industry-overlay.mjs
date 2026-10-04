import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { Transform } from 'node:stream';
import { createHash, randomUUID } from 'node:crypto';
import { APP_ROOT } from './paths.mjs';

export const DATASET = 'national-irs-eo-registry-industry-overlay';
export const VERSION = `${DATASET}@1.0.0`;
const sha = value => createHash('sha256').update(value).digest('hex');
const fail = message => { throw new Error(`IRS EO registry industry overlay rejected: ${message}.`); };
const check = (value, message) => { if (!value) fail(message); };
const stop = signal => signal?.throwIfAborted();
const inside = (root, file) => { const resolved = path.resolve(root, file), relative = path.relative(root, resolved); check(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'path containment'); return resolved; };
const line = value => `${JSON.stringify(value)}\n`;
const same = (a, b) => a.isFile() && b.isFile() && !a.isSymbolicLink() && !b.isSymbolicLink() && a.nlink === 1n && b.nlink === 1n && ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].every(k => a[k] === b[k]);

async function canonicalFile(root, file) {
  const canonicalRoot = await fs.realpath(root); let probe = file;
  while (probe !== root) { const info = await fs.lstat(probe, { bigint: true }); check(!info.isSymbolicLink(), 'symlink ancestry'); probe = path.dirname(probe); }
  check(await fs.realpath(file) === file && file.startsWith(`${canonicalRoot}${path.sep}`), 'canonical containment');
}

async function secureBuffer(root, file, max, signal, hook) {
  await canonicalFile(root, file); const named = await fs.lstat(file, { bigint: true }), handle = await fs.open(file, 'r'), chunks = []; let bytes = 0;
  try { check(named.size <= BigInt(max) && same(named, await handle.stat({ bigint: true })), 'unsafe input identity'); for (;;) { stop(signal); const buffer = Buffer.alloc(65_536), result = await handle.read(buffer); if (!result.bytesRead) break; bytes += result.bytesRead; check(bytes <= max, 'input byte bound'); chunks.push(buffer.subarray(0, result.bytesRead)); } await hook?.({ file, named }); check(same(named, await handle.stat({ bigint: true })) && same(named, await fs.lstat(file, { bigint: true })), 'input identity changed'); const value = Buffer.concat(chunks, bytes); return { value, bytes, sha256: sha(value) }; } finally { await handle.close(); }
}

export async function readSecureOverlayFileForTest(root, file, max, hook) { return secureBuffer(await fs.realpath(root), path.resolve(file), max, undefined, hook); }

export function validateIrsEoOverlayIdentity(record, seen = new Set()) {
  const ein = record.external_identifiers?.find(x => x.type === 'ein')?.value;
  const organization = `organization:irs_ein_${ein}`;
  check(/^\d{9}$/.test(ein ?? '') && record.entity_candidates?.organization_id === organization
    && !record.entity_candidates?.physical_site_id && !record.entity_candidates?.establishment_id, 'source identity');
  check(!seen.has(ein), 'duplicate EIN'); seen.add(ein); return { ein, organization };
}

export function validateIrsEoJurisdictionConservation(rows, expectedRows, expectedTotal) {
  const codes = new Set(); let total = 0; for (const row of rows) { check(typeof row.code === 'string' && row.code && !codes.has(row.code), 'jurisdiction identity'); codes.add(row.code); check(Number.isSafeInteger(row.organization_count) && row.organization_count >= 0, 'jurisdiction count'); total += row.organization_count; } check(rows.length === expectedRows && total === expectedTotal, 'jurisdiction conservation'); return true;
}

export function validateIrsEoZipConservation(rows, expectedRows, expectedPositive, expectedTotal) {
  const keys = new Set(); let positive = 0, total = 0; for (const row of rows) { check(/^\d{5}$/.test(row.zip5) && !keys.has(row.zip5), 'denominator ZIP identity'); keys.add(row.zip5); check(Number.isSafeInteger(row.count) && row.count >= 0, 'ZIP count'); if (row.count > 0) positive += 1; total += row.count; } check(rows.length === expectedRows && positive === expectedPositive && total === expectedTotal, 'ZIP conservation'); return true;
}

async function pinned(root, relative, expected, max, signal) {
  stop(signal); const file = inside(root, relative), proof = await secureBuffer(root, file, max, signal); stop(signal);
  check(proof.bytes <= max && proof.sha256 === expected, `pinned input drift: ${relative}`);
  return { file, proof, value: JSON.parse(proof.value) };
}

function rows(buffer, declaration, onRow, signal) {
  check(declaration.bytes <= 110_000_000 && declaration.record_count <= 3_000_000, 'artifact declaration bounds');
  const raw = declaration.path.endsWith('.gz') ? zlib.gunzipSync(buffer, { maxOutputLength: 900_000_000 }) : buffer;
  let offset = 0, count = 0;
  while (offset < raw.length) {
    stop(signal); let end = raw.indexOf(10, offset); if (end < 0) end = raw.length; let part = raw.subarray(offset, end); offset = end + 1;
    if (part.at(-1) === 13) part = part.subarray(0, -1); if (!part.length) continue;
    check(part.length <= 262_144, 'JSONL line bound'); onRow(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(part))); count += 1;
  }
  check(count === declaration.record_count, `row count: ${declaration.path}`);
}

async function artifact(root, base, declaration, signal, onRow, limits = {}) {
  const maximumCompressedBytes = limits.maximumCompressedBytes ?? 110_000_000;
  // The largest retained IRS shard expands below 900 MB; 1.2 GB leaves bounded format overhead without the former 2 GB allowance.
  const maximumDecodedBytes = limits.maximumDecodedBytes ?? 1_200_000_000;
  check(declaration.bytes <= maximumCompressedBytes && declaration.record_count <= 3_000_000, 'artifact declaration bounds');
  const file = inside(root, path.relative(root, path.join(base, declaration.path))); await canonicalFile(root, file); const named = await fs.lstat(file, { bigint: true }), handle = await fs.open(file, 'r');
  const digest = createHash('sha256'); let bytes = 0, decodedBytes = 0, count = 0, input, decoded, completed = false;
  try {
    check(named.size === BigInt(declaration.bytes) && named.size <= BigInt(maximumCompressedBytes) && same(named, await handle.stat({ bigint: true })), `open identity/size: ${declaration.path}`);
    await limits.afterOpen?.({ file, handle });
    input = createReadStream(file, { fd: handle.fd, autoClose: false, highWaterMark: 1024 * 1024 });
    const meter = new Transform({ transform(chunk, encoding, callback) { bytes += chunk.length; if (bytes > maximumCompressedBytes || bytes > declaration.bytes) return callback(new Error('IRS EO registry industry overlay rejected: compressed byte bound.')); digest.update(chunk); callback(null, chunk); } });
    const inflated = declaration.path.endsWith('.gz') ? input.pipe(meter).pipe(zlib.createGunzip()) : input.pipe(meter);
    decoded = inflated.pipe(new Transform({ transform(chunk, encoding, callback) { decodedBytes += chunk.length; callback(decodedBytes > maximumDecodedBytes ? new Error('IRS EO registry industry overlay rejected: decompressed byte bound.') : null, chunk); } }));
    for (const stream of new Set([input, meter, inflated])) stream.on('error', error => decoded.destroy(error));
    let pending = Buffer.alloc(0);
    for await (const chunk of decoded) {
      stop(signal); let offset = 0;
      for (;;) {
        const newline = chunk.indexOf(10, offset);
        if (newline < 0) { const tail = chunk.subarray(offset); check(pending.length + tail.length <= 262_144, 'JSONL line bound'); pending = pending.length ? Buffer.concat([pending, tail]) : Buffer.from(tail); break; }
        const segment = chunk.subarray(offset, newline); check(pending.length + segment.length <= 262_144, 'JSONL line bound'); let record = pending.length ? Buffer.concat([pending, segment]) : segment; pending = Buffer.alloc(0); if (record.at(-1) === 13) record = record.subarray(0, -1);
        if (record.length) { await onRow(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(record))); count += 1; } offset = newline + 1;
      }
    }
    if (pending.length) { let record = pending; if (record.at(-1) === 13) record = record.subarray(0, -1); if (record.length) { await onRow(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(record))); count += 1; } }
    check(count === declaration.record_count && bytes === declaration.bytes && digest.digest('hex') === declaration.sha256, `parsed-byte binding: ${declaration.path}`);
    check(same(named, await handle.stat({ bigint: true })) && same(named, await fs.lstat(file, { bigint: true })), `stable row replay: ${declaration.path}`);
    completed = true; return { bytes, sha256: declaration.sha256, decodedBytes };
  } finally { if (!completed) { decoded?.on('error', () => {}); input?.on('error', () => {}); decoded?.destroy(); input?.destroy(); } await handle.close().catch(() => {}); }
}

export async function readOverlayArtifactForTest(root, base, declaration, limits) {
  let records = 0; return artifact(await fs.realpath(root), path.resolve(base), declaration, undefined, () => { records += 1; }, limits).then(result => ({ ...result, records }));
}

async function load(root, configPath, signal) {
  const configFile = inside(root, configPath ?? `config/${DATASET}.json`), configProof = await secureBuffer(root, configFile, 100_000, signal), config = JSON.parse(configProof.value);
  check(config.schema_version === `${DATASET}-config@1.0.0`, 'config version');
  const irsEo = await pinned(root, config.irs_eo.manifest, config.irs_eo.manifest_sha256, 200_000, signal);
  const registry = await pinned(root, config.registry.manifest, config.registry.manifest_sha256, 2_000_000, signal);
  const coverage = await pinned(root, config.coverage.manifest, config.coverage.manifest_sha256, 100_000, signal);
  const denominator = await pinned(root, config.zip_denominator.manifest, config.zip_denominator.manifest_sha256, 100_000, signal);
  check(irsEo.value.release_id === config.irs_eo.release_id && registry.value.release_id === config.registry.release_id && coverage.value.release_id === config.coverage.release_id, 'release binding');
  check(irsEo.value.coverage.accepted_current_exempt_organizations === config.expected.membership_rows, 'IRS EO count');
  check(registry.value.coverage.irs_eo_organization_records === config.expected.membership_rows, 'registry count');
  check(coverage.value.coverage.accepted_current_exempt_organizations === config.expected.membership_rows && coverage.value.source.manifest_sha256 === config.irs_eo.manifest_sha256, 'coverage lineage');
  const denominatorDecl = denominator.value.artifacts.find(x => x.path === config.zip_denominator.artifact);
  check(denominatorDecl?.sha256 === config.zip_denominator.artifact_sha256 && denominatorDecl.record_count === config.zip_denominator.rows, 'denominator declaration');
  return { root, config, configProof, irsEo, registry, coverage, denominator, denominatorDecl };
}

async function writeDerived(input, output, signal, hook) {
  const sourceBase = path.dirname(input.irsEo.file), registryBase = path.dirname(input.registry.file), coverageBase = path.dirname(input.coverage.file);
  const source = input.irsEo.value.artifacts.filter(x => x.artifact_type === 'normalized-irs-eo-organization-jsonl-gzip').sort((a, b) => a.path.localeCompare(b.path));
  check(source.length === input.config.expected.shards, 'source shard roster');
  await fs.mkdir(path.join(output, 'proof'), { recursive: true });
  const declarations = []; let total = 0;
  for (let prefix = 0; prefix < 10; prefix += 1) {
    const sourceDecl = source.find(x => x.path.endsWith(`ein-prefix=${prefix}.jsonl.gz`)); check(sourceDecl, `source prefix ${prefix}`);
    const expected = new Map(), seen = new Set(), name = `proof/partition=${prefix}.json`; let membershipRows = 0;
    await artifact(input.root, sourceBase, sourceDecl, signal, async record => {
      const { ein, organization } = validateIrsEoOverlayIdentity(record, seen);
      expected.set(ein, false);
      check(organization === `organization:irs_ein_${ein}`, 'organization identity mapping'); membershipRows += 1; await hook?.('membership-row', { prefix, membershipRows }); stop(signal);
    });
    const registryDecl = input.registry.value.artifacts.find(x => x.artifact_type === 'canonical-organization-jsonl-gzip' && x.path === `entities/organizations/irs-ein-prefix=${prefix}.jsonl.gz`); check(registryDecl, `registry organization prefix ${prefix}`);
    await artifact(input.root, registryBase, registryDecl, signal, entity => {
      const match = entity.entity_id?.match(/^organization:irs_ein_(\d{9})$/); check(match, `extra registry organization identity prefix ${prefix}`);
      check(expected.get(match[1]) === false, `extra/duplicate registry organization identity prefix ${prefix}`); expected.set(match[1], true);
    });
    check([...expected.values()].every(Boolean), `missing registry identity prefix ${prefix}`);
    const proofBody = Buffer.from(line({ schema_version: `${DATASET}-partition-proof@1.0.0`, partition: String(prefix), source_organization_count: expected.size, registry_organization_count: expected.size, exact_identity_matches: expected.size, missing_identities: 0, extra_identities: 0, organization_additions: 0, site_additions: 0, establishment_additions: 0, generic_business_additivity_delta: 0 }));
    await hook?.('before-partition-proof-write', { prefix, target: path.join(output, name) }); stop(signal);
    await fs.writeFile(path.join(output, name), proofBody, { flag: 'wx' });
    declarations.push({ path: name, artifact_type: 'irs-eo-registry-industry-partition-proof-json', bytes: proofBody.length, sha256: sha(proofBody), record_count: 1 }); total += expected.size;
  }
  check(total === input.config.expected.membership_rows, 'membership conservation');

  const jurisdictionDecl = input.coverage.value.artifacts.find(x => x.path === 'jurisdictions.jsonl');
  const jurisdictionRows = [], jurisdictionCodes = new Set(); let jurisdictionTotal = 0; await artifact(input.root, coverageBase, jurisdictionDecl, signal, row => { check(typeof row.code === 'string' && row.code && !jurisdictionCodes.has(row.code), 'jurisdiction identity'); jurisdictionCodes.add(row.code); check(Number.isSafeInteger(row.organization_count) && row.organization_count >= 0, 'jurisdiction count'); jurisdictionTotal += row.organization_count; jurisdictionRows.push({ schema_version: `${DATASET}-jurisdiction@1.0.0`, code: row.code, organization_count: row.organization_count, classification: 'industry-overlay-nonadditive', generic_business_additivity_delta: 0 }); });
  validateIrsEoJurisdictionConservation(jurisdictionRows, input.config.expected.jurisdiction_rows, input.config.expected.membership_rows); check(jurisdictionTotal === input.config.expected.membership_rows, 'jurisdiction aggregate drift');
  const jurisdictionRaw = Buffer.from(jurisdictionRows.map(line).join('')); await fs.writeFile(path.join(output, 'jurisdictions.jsonl'), jurisdictionRaw, { flag: 'wx' });
  declarations.push({ path: 'jurisdictions.jsonl', artifact_type: 'irs-eo-registry-industry-jurisdictions-jsonl', bytes: jurisdictionRaw.length, sha256: sha(jurisdictionRaw), record_count: jurisdictionRows.length });

  const zipDecl = input.coverage.value.artifacts.find(x => x.path === 'zip5-coverage.jsonl'), coverageZips = new Map();
  await artifact(input.root, coverageBase, zipDecl, signal, row => { check(/^\d{5}$/.test(row.code) && !coverageZips.has(row.code), 'coverage ZIP identity'); coverageZips.set(row.code, row); });
  const denominatorFile = path.join(path.dirname(input.denominator.file), input.config.zip_denominator.artifact), denominatorProof = await secureBuffer(input.root, denominatorFile, 100_000_000, signal);
  check(denominatorProof.bytes === input.denominatorDecl.bytes && denominatorProof.sha256 === input.denominatorDecl.sha256, 'denominator artifact binding');
  const zipLines = [], zipChecks = [], denominatorKeys = new Set(); let positive = 0, zipTotal = 0;
  rows(denominatorProof.value, input.denominatorDecl, base => { check(/^\d{5}$/.test(base.zip5) && !denominatorKeys.has(base.zip5), 'denominator ZIP identity'); denominatorKeys.add(base.zip5); const sourceRow = coverageZips.get(base.zip5), count = sourceRow?.organization_count ?? 0; if (count > 0) positive += 1; zipTotal += count;
    zipChecks.push({ zip5: base.zip5, count }); zipLines.push(line({ schema_version: `${DATASET}-zip@1.0.0`, zip5: base.zip5, denominator_classification: base.classification, organization_count: count, classification: 'industry-overlay-nonadditive', generic_business_additivity_delta: 0, authoritative_current_usps_zip: null, current_operating_business_count: null, unique_business_count: null, completeness_percent: null })); }, signal);
  validateIrsEoZipConservation(zipChecks, input.config.zip_denominator.rows, input.config.expected.positive_zip5_rows, input.config.expected.membership_rows); check(positive === input.config.expected.positive_zip5_rows && [...coverageZips.entries()].filter(([, value]) => value.organization_count > 0).every(([key]) => denominatorKeys.has(key)) && zipTotal === input.config.expected.membership_rows, 'ZIP aggregate drift');
  const zipRaw = Buffer.from(zipLines.join('')); await fs.writeFile(path.join(output, 'zip5-overlay.jsonl'), zipRaw, { flag: 'wx' });
  declarations.push({ path: 'zip5-overlay.jsonl', artifact_type: 'irs-eo-registry-industry-zip-overlay-jsonl', bytes: zipRaw.length, sha256: sha(zipRaw), record_count: zipLines.length });
  return { declarations, total, positive };
}

function manifestFor(input, result, createdAt) {
  const body = { schema_version: VERSION, dataset_id: DATASET, status: 'immutable-local-review-only', publication_mode: 'pointer-free', created_at: createdAt,
    processing: { source_shards: 10, maximum_source_shards_in_memory: 1, registry_partitions_replayed_per_source_shard: 1, aggregate_proof_outputs: 10 },
    inputs: { irs_eo_manifest: { path: path.relative(input.root, input.irsEo.file).replaceAll('\\', '/'), sha256: input.irsEo.proof.sha256, release_id: input.irsEo.value.release_id }, registry_manifest: { path: path.relative(input.root, input.registry.file).replaceAll('\\', '/'), sha256: input.registry.proof.sha256, release_id: input.registry.value.release_id }, coverage_manifest: { path: path.relative(input.root, input.coverage.file).replaceAll('\\', '/'), sha256: input.coverage.proof.sha256, release_id: input.coverage.value.release_id }, zip_denominator_manifest: { path: path.relative(input.root, input.denominator.file).replaceAll('\\', '/'), sha256: input.denominator.proof.sha256, artifact_sha256: input.denominatorDecl.sha256 }, config_sha256: input.configProof.sha256 },
    summary: { irs_eo_rows: result.total, exact_ein_organization_membership_matches: result.total, missing_identities: 0, extra_identities: 0, organization_additions: 0, site_additions: 0, establishment_additions: 0, generic_business_additivity_delta: 0, jurisdiction_rows: input.config.expected.jurisdiction_rows, zip5_denominator_rows: input.config.zip_denominator.rows, positive_zip5_rows: result.positive },
    claims: { source_current_extract_membership_as_of: input.irsEo.value.source_posting_date, filing_address_only: true, every_nonprofit_or_tax_exempt_organization: false, unique_business_across_sources: false, current_operation_beyond_source: false, verified_physical_site: false, public_storefront: false, ownership_or_group_hierarchy: false, contribution_deductibility_beyond_source_code: false, nationwide_business_completeness: false, authoritative_current_usps_zip_denominator: null, zip4_or_zcta_as_usps_identity: false, record_level_sensitive_fields_exported: false, identifier_free_aggregate_output: true, k_anonymous: false, small_cell_suppression_applied: false, disclosure_control_claimed: false, network_requests: 0, acquisition_performed: false, current_pointer_written: false, production_enrollment: false, production_execution: false }, artifacts: result.declarations };
  return { release_id: `${DATASET}-${sha(JSON.stringify(body))}`, ...body };
}

async function inventory(directory) { const top = (await fs.readdir(directory)).sort(); const proof = (await fs.readdir(path.join(directory, 'proof'))).map(x => `proof/${x}`).sort(); return [...top.filter(x => x !== 'proof'), ...proof].sort(); }

async function sealStagedRelease(root, stage, manifest, signal) {
  const expectedInventory = ['jurisdictions.jsonl', 'manifest.json', ...Array.from({ length: 10 }, (_, i) => `proof/partition=${i}.json`), 'zip5-overlay.jsonl'].sort();
  check(JSON.stringify(await inventory(stage)) === JSON.stringify(expectedInventory), 'closed staged inventory');
  for (const declaration of manifest.artifacts) { stop(signal); const actual = await secureBuffer(root, path.join(stage, declaration.path), 100_000_000, signal); check(actual.bytes === declaration.bytes && actual.sha256 === declaration.sha256, `sealed staged artifact: ${declaration.path}`); }
  const manifestRaw = Buffer.from(line(manifest)), actualManifest = await secureBuffer(root, path.join(stage, 'manifest.json'), 200_000, signal); check(actualManifest.bytes === manifestRaw.length && actualManifest.sha256 === sha(manifestRaw), 'sealed staged manifest');
}

export async function buildNationalIrsEoRegistryIndustryOverlay(options = {}) {
  const root = await fs.realpath(path.resolve(options.root ?? APP_ROOT)); check(options.createdAt === undefined || root !== APP_ROOT, 'createdAt override requires isolated root');
  const createdAt = options.createdAt ?? new Date().toISOString(); check(new Date(createdAt).toISOString() === createdAt, 'created_at'); const input = await load(root, options.configPath, options.signal);
  let outputRoot=root;
  if(options._testOutputRoot!==undefined){outputRoot=path.resolve(options._testOutputRoot);check(typeof options._testHooks==='function'&&outputRoot.startsWith(`${path.join(root,'tmp')}${path.sep}`),'test output root must be isolated beneath tmp and use test hooks');await canonicalFile(root,outputRoot);}
  const base = inside(outputRoot, `data/${DATASET}`), releases = path.join(base, 'releases'), lock = path.join(base, '.build.lock'); await fs.mkdir(releases, { recursive: true }); let locked = false, stage, published = false;
  try { await fs.mkdir(lock); locked = true; stage = path.join(base, `.stage-${randomUUID()}`); await fs.mkdir(stage); const result = await writeDerived(input, stage, options.signal, options._testHooks), manifest = manifestFor(input, result, createdAt), raw = Buffer.from(line(manifest)); await fs.writeFile(path.join(stage, 'manifest.json'), raw, { flag: 'wx' }); await options._testHooks?.('after-manifest-before-verification', { stage, manifest }); stop(options.signal); await verifyNationalIrsEoRegistryIndustryOverlay(path.join(stage, 'manifest.json'), { root, configPath: options.configPath, signal: options.signal, expectedReleaseId: manifest.release_id, allowStaging: true }); await options._testHooks?.('after-verification-before-publication', Object.freeze({ release_id: manifest.release_id, stage })); await sealStagedRelease(root, stage, manifest, options.signal); stop(options.signal); const destination = path.join(releases, manifest.release_id); await fs.rename(stage, destination); published = true; return { releaseDirectory: destination, manifest, manifest_sha256: sha(raw), ...manifest.summary };
  } catch (error) { if (published) error.inspection_required = true; else if (stage) await fs.rm(stage, { recursive: true, force: true }); throw error; } finally { if (locked) await fs.rmdir(lock).catch(error => { if (!published) throw error; }); }
}

export async function verifyNationalIrsEoRegistryIndustryOverlay(manifestPath, options = {}) {
  const root = await fs.realpath(path.resolve(options.root ?? APP_ROOT)), file = inside(root, manifestPath), proof = await secureBuffer(root, file, 200_000, options.signal), manifest = JSON.parse(proof.value), directory = path.dirname(file);
  check((path.basename(directory) === manifest.release_id || (options.allowStaging === true && options.expectedReleaseId === manifest.release_id && path.basename(directory).startsWith('.stage-'))) && manifest.publication_mode === 'pointer-free', 'release location/boundary');
  const expectedInventory = ['jurisdictions.jsonl', 'manifest.json', ...Array.from({ length: 10 }, (_, i) => `proof/partition=${i}.json`), 'zip5-overlay.jsonl'].sort(); check(JSON.stringify(await inventory(directory)) === JSON.stringify(expectedInventory), 'closed inventory');
  const input = await load(root, options.configPath, options.signal), replay = await fs.mkdtemp(path.join(path.dirname(directory), '.verify-'));
  try { const result = await writeDerived(input, replay, options.signal), expected = manifestFor(input, result, manifest.created_at); check(JSON.stringify(expected) === JSON.stringify(manifest), 'manifest reconstruction'); for (const declaration of manifest.artifacts) { const maximum = declaration.decoded_bytes ? 110_000_000 : 100_000_000, actual = await secureBuffer(root, path.join(directory, declaration.path), maximum, options.signal), rebuilt = await secureBuffer(root, path.join(replay, declaration.path), maximum, options.signal); check(actual.bytes === declaration.bytes && actual.sha256 === declaration.sha256 && rebuilt.sha256 === declaration.sha256, `artifact replay: ${declaration.path}`); } } finally { await fs.rm(replay, { recursive: true, force: true }); }
  return { verified: true, release_id: manifest.release_id, manifest_sha256: proof.sha256, ...manifest.summary, claims: manifest.claims };
}
