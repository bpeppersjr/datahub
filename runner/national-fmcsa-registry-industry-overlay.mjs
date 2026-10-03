import fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import readline from 'node:readline';
import { PassThrough, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createHash, randomUUID } from 'node:crypto';
import { APP_ROOT } from './paths.mjs';

export const DATASET = 'national-fmcsa-registry-industry-overlay';
export const VERSION = `${DATASET}@1.0.0`;
const sha = value => createHash('sha256').update(value).digest('hex');
const fail = message => { throw new Error(`FMCSA registry industry overlay rejected: ${message}.`); };
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

export function validateFmcsaOverlayIdentity(record, seen = new Set()) {
  const dot = record.external_identifiers?.find(x => x.type === 'usdot_number')?.value;
  const site = `site:fmcsa_usdot_${dot}_principal_office`, establishment = `establishment:fmcsa_usdot_${dot}_principal_office`;
  check(/^\d+$/.test(dot ?? '') && record.entity_candidates?.physical_site_id === site && record.entity_candidates?.establishment_id === establishment, 'source identity');
  check(!seen.has(dot), 'duplicate USDOT'); seen.add(dot); return { dot, site, establishment };
}

export function validateFmcsaJurisdictionConservation(rows, expectedRows, expectedTotal) {
  const codes = new Set(); let total = 0; for (const row of rows) { check(typeof row.code === 'string' && row.code && !codes.has(row.code), 'jurisdiction identity'); codes.add(row.code); check(Number.isSafeInteger(row.accepted_principal_office_count) && row.accepted_principal_office_count >= 0, 'jurisdiction count'); total += row.accepted_principal_office_count; } check(rows.length === expectedRows && total === expectedTotal, 'jurisdiction conservation'); return true;
}

export function validateFmcsaZipConservation(rows, expectedRows, expectedPositive, expectedTotal) {
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

async function artifact(root, base, declaration, signal, onRow) {
  check(declaration.bytes <= 110_000_000 && declaration.record_count <= 3_000_000, 'artifact declaration bounds');
  const file = inside(root, path.relative(root, path.join(base, declaration.path))); await canonicalFile(root, file); const named = await fs.lstat(file, { bigint: true }), handle = await fs.open(file, 'r');
  const digest = createHash('sha256'); let bytes = 0, decodedBytes = 0, count = 0, input, decoded, reader;
  try {
    check(same(named, await handle.stat({ bigint: true })), `open identity: ${declaration.path}`);
    input = createReadStream(file, { fd: handle.fd, autoClose: false, highWaterMark: 1024 * 1024 });
    const meter = new Transform({ transform(chunk, encoding, callback) { bytes += chunk.length; digest.update(chunk); callback(null, chunk); } });
    const inflated = declaration.path.endsWith('.gz') ? input.pipe(meter).pipe(zlib.createGunzip()) : input.pipe(meter);
    decoded = inflated.pipe(new Transform({ transform(chunk, encoding, callback) { decodedBytes += chunk.length; callback(decodedBytes > 2_000_000_000 ? new Error('FMCSA registry industry overlay rejected: decompressed byte bound.') : null, chunk); } }));
    reader = readline.createInterface({ input: decoded, crlfDelay: Infinity });
    for await (const text of reader) { stop(signal); if (!text) continue; check(Buffer.byteLength(text) <= 262_144, 'JSONL line bound'); await onRow(JSON.parse(text)); count += 1; }
    check(count === declaration.record_count && bytes === declaration.bytes && digest.digest('hex') === declaration.sha256, `parsed-byte binding: ${declaration.path}`);
    check(same(named, await handle.stat({ bigint: true })) && same(named, await fs.lstat(file, { bigint: true })), `stable row replay: ${declaration.path}`);
    return { bytes, sha256: declaration.sha256, decodedBytes };
  } finally { reader?.close(); decoded?.destroy(); input?.destroy(); await handle.close().catch(() => {}); }
}

async function load(root, configPath, signal) {
  const configFile = inside(root, configPath ?? `config/${DATASET}.json`), configProof = await secureBuffer(root, configFile, 100_000, signal), config = JSON.parse(configProof.value);
  check(config.schema_version === `${DATASET}-config@1.0.0`, 'config version');
  const fmcsa = await pinned(root, config.fmcsa.manifest, config.fmcsa.manifest_sha256, 200_000, signal);
  const registry = await pinned(root, config.registry.manifest, config.registry.manifest_sha256, 2_000_000, signal);
  const coverage = await pinned(root, config.coverage.manifest, config.coverage.manifest_sha256, 100_000, signal);
  const denominator = await pinned(root, config.zip_denominator.manifest, config.zip_denominator.manifest_sha256, 100_000, signal);
  check(fmcsa.value.release_id === config.fmcsa.release_id && registry.value.release_id === config.registry.release_id && coverage.value.release_id === config.coverage.release_id, 'release binding');
  check(fmcsa.value.coverage.accepted_principal_office_records === config.expected.membership_rows, 'FMCSA count');
  check(registry.value.coverage.fmcsa_active_principal_office_records === config.expected.membership_rows, 'registry count');
  check(coverage.value.coverage.accepted_records === config.expected.membership_rows && coverage.value.source.manifest_sha256 === config.fmcsa.manifest_sha256, 'coverage lineage');
  const denominatorDecl = denominator.value.artifacts.find(x => x.path === config.zip_denominator.artifact);
  check(denominatorDecl?.sha256 === config.zip_denominator.artifact_sha256 && denominatorDecl.record_count === config.zip_denominator.rows, 'denominator declaration');
  return { root, config, configProof, fmcsa, registry, coverage, denominator, denominatorDecl };
}

async function writeDerived(input, output, signal, hook) {
  const fbase = path.dirname(input.fmcsa.file), rbase = path.dirname(input.registry.file), cbase = path.dirname(input.coverage.file);
  const source = input.fmcsa.value.artifacts.filter(x => x.artifact_type === 'normalized-fmcsa-company-census-record-jsonl-gzip').sort((a, b) => a.path.localeCompare(b.path));
  check(source.length === input.config.expected.shards, 'source shard roster');
  await fs.mkdir(path.join(output, 'membership'), { recursive: true });
  const declarations = []; let total = 0;
  for (let prefix = 0; prefix < 10; prefix += 1) {
    const sourceDecl = source.find(x => x.path.endsWith(`zip-prefix=${prefix}.jsonl.gz`)); check(sourceDecl, `source prefix ${prefix}`);
    const expected = new Map(), seen = new Set(), name = `membership/prefix=${prefix}.jsonl.gz`, target = path.join(output, name), sourceStream = new PassThrough(), gzip = zlib.createGzip({ level: 9 }), sink = createWriteStream(target, { flags: 'wx' }); let decodedBytes = 0, compressedBytes = 0, membershipRows = 0;
    const decodedMeter = new Transform({ transform(chunk, encoding, callback) { decodedBytes += chunk.length; callback(decodedBytes > 250_000_000 ? new Error('FMCSA registry industry overlay rejected: membership decoded byte bound.') : null, chunk); } });
    const compressedMeter = new Transform({ transform(chunk, encoding, callback) { compressedBytes += chunk.length; callback(compressedBytes > 110_000_000 ? new Error('FMCSA registry industry overlay rejected: membership compressed byte bound.') : null, chunk); } });
    const pipelinePromise = pipeline(sourceStream, decodedMeter, gzip, compressedMeter, sink, { signal }); pipelinePromise.catch(() => {}); let pipelineFailure;
    try { await artifact(input.root, fbase, sourceDecl, signal, async record => {
      const { dot, site, establishment } = validateFmcsaOverlayIdentity(record, seen);
      expected.set(dot, { site: false, establishment: false });
      const membership = { schema_version: `${DATASET}-membership@1.0.0`, usdot_number: dot, site_id: site, establishment_id: establishment, classification: 'already-present-same-source-identity', industry_membership: 'fmcsa-source-active-registration-principal-office', organization_addition: false, site_addition: false, establishment_addition: false, generic_business_additivity_delta: 0 };
      membershipRows += 1; await hook?.('membership-row', { prefix, membershipRows, sourceStream, gzip, sink }); stop(signal); const encoded = line(membership); await new Promise((resolve, reject) => sourceStream.write(encoded, error => error ? reject(error) : resolve()));
    }); sourceStream.end(); await pipelinePromise; }
    catch (error) { pipelineFailure = error; sourceStream.destroy(error); gzip.destroy(error); sink.destroy(error); await pipelinePromise.catch(() => {}); throw error; }
    finally { if (pipelineFailure) { sourceStream.destroy(); decodedMeter.destroy(); gzip.destroy(); compressedMeter.destroy(); sink.destroy(); } }
    for (const [kind, artifactType, template] of [['site', 'canonical-physical-site-jsonl-gzip', `entities/physical-sites/prefix=${prefix}.jsonl.gz`], ['establishment', 'canonical-establishment-jsonl-gzip', `entities/establishments/prefix=${prefix}.jsonl.gz`]]) {
      const decl = input.registry.value.artifacts.find(x => x.artifact_type === artifactType && x.path === template); check(decl, `registry ${kind} prefix ${prefix}`);
      await artifact(input.root, rbase, decl, signal, entity => {
        const match = entity.entity_id?.match(new RegExp(`^${kind === 'site' ? 'site' : 'establishment'}:fmcsa_usdot_(\\d+)_principal_office$`));
        if (!match) return; const state = expected.get(match[1]); check(state && !state[kind], `extra/duplicate registry ${kind} identity prefix ${prefix}`); state[kind] = true;
      });
    }
    check([...expected.values()].every(x => x.site && x.establishment), `missing registry identity prefix ${prefix}`);
    const outputProof = await secureBuffer(input.root, target, 110_000_000, signal); check(outputProof.bytes === compressedBytes, 'membership compressed byte accounting');
    declarations.push({ path: name, artifact_type: 'fmcsa-registry-industry-membership-jsonl-gzip', bytes: outputProof.bytes, decoded_bytes: decodedBytes, sha256: outputProof.sha256, record_count: expected.size }); total += expected.size;
  }
  check(total === input.config.expected.membership_rows, 'membership conservation');

  const jurisdictionDecl = input.coverage.value.artifacts.find(x => x.path === 'jurisdictions.jsonl');
  const jurisdictionRows = [], jurisdictionCodes = new Set(); let jurisdictionTotal = 0; await artifact(input.root, cbase, jurisdictionDecl, signal, row => { check(typeof row.code === 'string' && row.code && !jurisdictionCodes.has(row.code), 'jurisdiction identity'); jurisdictionCodes.add(row.code); check(Number.isSafeInteger(row.accepted_principal_office_count) && row.accepted_principal_office_count >= 0, 'jurisdiction count'); jurisdictionTotal += row.accepted_principal_office_count; jurisdictionRows.push({ ...row, schema_version: `${DATASET}-jurisdiction@1.0.0`, classification: 'industry-overlay-nonadditive', generic_business_additivity_delta: 0 }); });
  validateFmcsaJurisdictionConservation(jurisdictionRows, input.config.expected.jurisdiction_rows, input.config.expected.membership_rows); check(jurisdictionTotal === input.config.expected.membership_rows, 'jurisdiction aggregate drift');
  const jurisdictionRaw = Buffer.from(jurisdictionRows.map(line).join('')); await fs.writeFile(path.join(output, 'jurisdictions.jsonl'), jurisdictionRaw, { flag: 'wx' });
  declarations.push({ path: 'jurisdictions.jsonl', artifact_type: 'fmcsa-registry-industry-jurisdictions-jsonl', bytes: jurisdictionRaw.length, sha256: sha(jurisdictionRaw), record_count: jurisdictionRows.length });

  const zipDecl = input.coverage.value.artifacts.find(x => x.path === 'zip5-coverage.jsonl'), coverageZips = new Map();
  await artifact(input.root, cbase, zipDecl, signal, row => { check(/^\d{5}$/.test(row.code) && !coverageZips.has(row.code), 'coverage ZIP identity'); coverageZips.set(row.code, row); });
  const denominatorFile = path.join(path.dirname(input.denominator.file), input.config.zip_denominator.artifact), denominatorProof = await secureBuffer(input.root, denominatorFile, 100_000_000, signal);
  check(denominatorProof.bytes === input.denominatorDecl.bytes && denominatorProof.sha256 === input.denominatorDecl.sha256, 'denominator artifact binding');
  const zipLines = [], zipChecks = [], denominatorKeys = new Set(); let positive = 0, zipTotal = 0;
  rows(denominatorProof.value, input.denominatorDecl, base => { check(/^\d{5}$/.test(base.zip5) && !denominatorKeys.has(base.zip5), 'denominator ZIP identity'); denominatorKeys.add(base.zip5); const sourceRow = coverageZips.get(base.zip5), count = sourceRow?.accepted_principal_office_count ?? 0; if (count > 0) positive += 1; zipTotal += count;
    zipChecks.push({ zip5: base.zip5, count }); zipLines.push(line({ schema_version: `${DATASET}-zip@1.0.0`, zip5: base.zip5, denominator_classification: base.classification, fmcsa_registration_principal_office_count: count, classification: 'industry-overlay-nonadditive', generic_business_additivity_delta: 0, authoritative_current_usps_zip: null, current_operating_business_count: null, unique_business_count: null, completeness_percent: null })); }, signal);
  validateFmcsaZipConservation(zipChecks, input.config.zip_denominator.rows, input.config.expected.positive_zip5_rows, input.config.expected.membership_rows); check(positive === input.config.expected.positive_zip5_rows && [...coverageZips.entries()].filter(([, value]) => value.accepted_principal_office_count > 0).every(([key]) => denominatorKeys.has(key)) && zipTotal === input.config.expected.membership_rows, 'ZIP aggregate drift');
  const zipRaw = Buffer.from(zipLines.join('')); await fs.writeFile(path.join(output, 'zip5-overlay.jsonl'), zipRaw, { flag: 'wx' });
  declarations.push({ path: 'zip5-overlay.jsonl', artifact_type: 'fmcsa-registry-industry-zip-overlay-jsonl', bytes: zipRaw.length, sha256: sha(zipRaw), record_count: zipLines.length });
  return { declarations, total, positive };
}

function manifestFor(input, result, createdAt) {
  const body = { schema_version: VERSION, dataset_id: DATASET, status: 'immutable-local-review-only', publication_mode: 'pointer-free', created_at: createdAt,
    processing: { source_shards: 10, maximum_source_shards_in_memory: 1, registry_partitions_replayed_per_source_shard: 2, membership_output_shards: 10 },
    inputs: { fmcsa_manifest: { path: path.relative(input.root, input.fmcsa.file).replaceAll('\\', '/'), sha256: input.fmcsa.proof.sha256, release_id: input.fmcsa.value.release_id }, registry_manifest: { path: path.relative(input.root, input.registry.file).replaceAll('\\', '/'), sha256: input.registry.proof.sha256, release_id: input.registry.value.release_id }, coverage_manifest: { path: path.relative(input.root, input.coverage.file).replaceAll('\\', '/'), sha256: input.coverage.proof.sha256, release_id: input.coverage.value.release_id }, zip_denominator_manifest: { path: path.relative(input.root, input.denominator.file).replaceAll('\\', '/'), sha256: input.denominator.proof.sha256, artifact_sha256: input.denominatorDecl.sha256 }, config_sha256: input.configProof.sha256 },
    summary: { fmcsa_rows: result.total, exact_usdot_membership_matches: result.total, exact_site_identity_matches: result.total, exact_establishment_identity_matches: result.total, missing_identities: 0, extra_identities: 0, organization_additions: 0, site_additions: 0, establishment_additions: 0, generic_business_additivity_delta: 0, jurisdiction_rows: input.config.expected.jurisdiction_rows, zip5_denominator_rows: input.config.zip_denominator.rows, positive_zip5_rows: result.positive },
    claims: { source_defined_active_fmcsa_registration_as_of: input.fmcsa.value.source_updated_at, reported_principal_office_only: true, roles_and_classes_exclusive: false, unique_business: false, current_operation_beyond_source: false, verified_physical_site: false, public_access: false, complete_carrier_universe: false, complete_trucking_or_transportation_universe: false, nationwide_completeness: false, authoritative_current_usps_zip_denominator: null, network_requests: 0, acquisition_performed: false, current_pointer_written: false, production_enrollment: false, production_execution: false }, artifacts: result.declarations };
  return { release_id: `${DATASET}-${sha(JSON.stringify(body))}`, ...body };
}

async function inventory(directory) { const top = (await fs.readdir(directory)).sort(); const membership = (await fs.readdir(path.join(directory, 'membership'))).map(x => `membership/${x}`).sort(); return [...top.filter(x => x !== 'membership'), ...membership].sort(); }

export async function buildNationalFmcsaRegistryIndustryOverlay(options = {}) {
  const root = await fs.realpath(path.resolve(options.root ?? APP_ROOT)); check(options.createdAt === undefined || root !== APP_ROOT, 'createdAt override requires isolated root');
  const createdAt = options.createdAt ?? new Date().toISOString(); check(new Date(createdAt).toISOString() === createdAt, 'created_at'); const input = await load(root, options.configPath, options.signal);
  const base = inside(root, `data/${DATASET}`), releases = path.join(base, 'releases'), lock = path.join(base, '.build.lock'); await fs.mkdir(releases, { recursive: true }); let locked = false, stage, published = false;
  try { await fs.mkdir(lock); locked = true; stage = path.join(base, `.stage-${randomUUID()}`); await fs.mkdir(stage); const result = await writeDerived(input, stage, options.signal, options._testHooks), manifest = manifestFor(input, result, createdAt), raw = Buffer.from(line(manifest)); await fs.writeFile(path.join(stage, 'manifest.json'), raw, { flag: 'wx' }); await options._testHooks?.('after-manifest-before-verification', { stage, manifest }); stop(options.signal); await verifyNationalFmcsaRegistryIndustryOverlay(path.join(stage, 'manifest.json'), { root, configPath: options.configPath, signal: options.signal, expectedReleaseId: manifest.release_id, allowStaging: true }); await options._testHooks?.('after-verification-before-publication', { stage, manifest }); stop(options.signal); const destination = path.join(releases, manifest.release_id); await fs.rename(stage, destination); published = true; return { releaseDirectory: destination, manifest, manifest_sha256: sha(raw), ...manifest.summary };
  } catch (error) { if (published) error.inspection_required = true; else if (stage) await fs.rm(stage, { recursive: true, force: true }); throw error; } finally { if (locked) await fs.rmdir(lock).catch(error => { if (!published) throw error; }); }
}

export async function verifyNationalFmcsaRegistryIndustryOverlay(manifestPath, options = {}) {
  const root = await fs.realpath(path.resolve(options.root ?? APP_ROOT)), file = inside(root, manifestPath), proof = await secureBuffer(root, file, 200_000, options.signal), manifest = JSON.parse(proof.value), directory = path.dirname(file);
  check((path.basename(directory) === manifest.release_id || (options.allowStaging === true && options.expectedReleaseId === manifest.release_id && path.basename(directory).startsWith('.stage-'))) && manifest.publication_mode === 'pointer-free', 'release location/boundary');
  const expectedInventory = ['jurisdictions.jsonl', 'manifest.json', ...Array.from({ length: 10 }, (_, i) => `membership/prefix=${i}.jsonl.gz`), 'zip5-overlay.jsonl'].sort(); check(JSON.stringify(await inventory(directory)) === JSON.stringify(expectedInventory), 'closed inventory');
  const input = await load(root, options.configPath, options.signal), replay = await fs.mkdtemp(path.join(path.dirname(directory), '.verify-'));
  try { const result = await writeDerived(input, replay, options.signal), expected = manifestFor(input, result, manifest.created_at); check(JSON.stringify(expected) === JSON.stringify(manifest), 'manifest reconstruction'); for (const declaration of manifest.artifacts) { const maximum = declaration.decoded_bytes ? 110_000_000 : 100_000_000, actual = await secureBuffer(root, path.join(directory, declaration.path), maximum, options.signal), rebuilt = await secureBuffer(root, path.join(replay, declaration.path), maximum, options.signal); check(actual.bytes === declaration.bytes && actual.sha256 === declaration.sha256 && rebuilt.sha256 === declaration.sha256, `artifact replay: ${declaration.path}`); } } finally { await fs.rm(replay, { recursive: true, force: true }); }
  return { verified: true, release_id: manifest.release_id, manifest_sha256: proof.sha256, ...manifest.summary, claims: manifest.claims };
}
