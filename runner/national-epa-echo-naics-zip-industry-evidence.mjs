import fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import zlib from 'node:zlib';
import { PassThrough, Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { APP_ROOT } from './paths.mjs';

export const DATASET = 'national-epa-echo-naics-zip-industry-evidence';
export const VERSION = `${DATASET}@1.0.0`;
export const STATE_DC_CODES = ['AK','AL','AR','AZ','CA','CO','CT','DC','DE','FL','GA','HI','IA','ID','IL','IN','KS','KY','LA','MA','MD','ME','MI','MN','MO','MS','MT','NC','ND','NE','NH','NJ','NM','NV','NY','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VA','VT','WA','WI','WV','WY'];
const TERRITORIES = ['AS','GU','MP','PR','VI'];
const ALL_CODES = [...STATE_DC_CODES, ...TERRITORIES].sort();
const CONTRACTS = [`config/connectors/${DATASET}.json`, `config/schemas/${DATASET}.schema.json`, `config/source-policies/${DATASET}.json`];
const LIMITS = { compressed: 110_000_000, decoded: 2_000_000_000, line: 262_144, source_rows: 2_000_000, naics_per_record: 256, distinct_naics: 10_000, zip_naics_cells_per_prefix: 1_000_000, output_compressed: 200_000_000, output_decoded: 512_000_000 };
const METRICS = ['active_facility_count','reported_zip4_count','retained_coordinate_count','centroid_warning_count','coordinate_accuracy_missing_count','record_zcta_count','record_nonpolygon_count','air_association_count','npdes_association_count','rcra_association_count','safe_drinking_water_association_count','toxics_release_inventory_association_count','greenhouse_gas_reporting_association_count'];
const CLASSIFICATIONS = ['same-code-census-zcta','source-contributed-outside-zcta','denominator-only-outside-zcta','explicit-placeholder'];
const sha = value => createHash('sha256').update(value).digest('hex');
const encoded = value => Buffer.from(`${JSON.stringify(value)}\n`);
const check = (value, message) => { if (!value) throw new Error(`EPA ECHO NAICS evidence rejected: ${message}.`); };
const stop = signal => signal?.throwIfAborted();
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value, keys) => object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const count = value => Number.isSafeInteger(value) && value >= 0;
const equal = (a, b) => Array.isArray(b) ? Array.isArray(a) && a.length === b.length && b.every((item, index) => equal(a[index], item))
  : object(b) ? exact(a, Object.keys(b)) && Object.entries(b).every(([key, value]) => equal(a[key], value)) : a === b;
const contained = (root, relative) => {
  check(typeof relative === 'string' && relative.length > 0, 'empty path');
  const resolved = path.resolve(root, relative), part = path.relative(root, resolved);
  check(part && !part.startsWith('..') && !path.isAbsolute(part), 'path containment');
  return resolved;
};
const stableIdentity = (a, b) => a.isFile() && b.isFile() && !a.isSymbolicLink() && !b.isSymbolicLink() && a.nlink === 1n && b.nlink === 1n && ['dev','ino','size','mtimeNs','ctimeNs'].every(key => a[key] === b[key]);

async function canonical(root, filename) {
  contained(root, filename);
  let probe = filename;
  while (probe !== root) { check(!(await fs.lstat(probe)).isSymbolicLink(), 'symlink ancestry'); probe = path.dirname(probe); }
  check(await fs.realpath(filename) === filename, 'noncanonical path');
}

async function secureBuffer(root, filename, max, signal, hook) {
  stop(signal); await canonical(root, filename);
  const named = await fs.lstat(filename, { bigint: true }), handle = await fs.open(filename, 'r'), chunks = [];
  let bytes = 0;
  try {
    check(named.size <= BigInt(max) && stableIdentity(named, await handle.stat({ bigint: true })), 'unsafe input identity');
    for (;;) { stop(signal); const buffer = Buffer.alloc(65_536), result = await handle.read(buffer); if (!result.bytesRead) break; bytes += result.bytesRead; check(bytes <= max, 'input byte bound'); chunks.push(buffer.subarray(0, result.bytesRead)); }
    await hook?.();
    check(stableIdentity(named, await handle.stat({ bigint: true })) && stableIdentity(named, await fs.lstat(filename, { bigint: true })), 'input identity changed');
    const raw = Buffer.concat(chunks, bytes); return { raw, bytes, sha256: sha(raw) };
  } finally { await handle.close(); }
}

export async function readSecureEchoNaicsFileForTest(root, filename, maximum, hook) {
  return secureBuffer(await fs.realpath(root), path.resolve(filename), maximum, undefined, hook);
}

// The compressed digest, decoded byte budget, fatal UTF-8 parser and line budget
// all apply to the same open handle. Oversized newline-free input stays bounded.
async function streamArtifact(root, base, declaration, signal, consume, maximum = LIMITS.compressed) {
  check(object(declaration) && count(declaration.bytes) && declaration.bytes <= maximum && /^[a-f0-9]{64}$/.test(declaration.sha256), 'artifact declaration');
  const filename = contained(base, declaration.path); contained(root, filename); await canonical(root, filename);
  const named = await fs.lstat(filename, { bigint: true }), handle = await fs.open(filename, 'r');
  let bytes = 0, decoded = 0, records = 0, carry = Buffer.alloc(0);
  const digest = createHash('sha256'), decoder = new TextDecoder('utf-8', { fatal: true });
  const rawMeter = new Transform({ transform(chunk, encoding, callback) { bytes += chunk.length; digest.update(chunk); callback(bytes > maximum ? new Error('EPA ECHO NAICS evidence rejected: compressed byte bound.') : null, chunk); } });
  const decodeMeter = new Transform({ transform(chunk, encoding, callback) { decoded += chunk.length; callback(decoded > LIMITS.decoded ? new Error('EPA ECHO NAICS evidence rejected: decoded byte bound.') : null, chunk); } });
  const parseLine = async raw => {
    stop(signal); if (raw.at(-1) === 13) raw = raw.subarray(0, -1);
    check(raw.length > 0 && raw.length <= LIMITS.line, 'JSONL line bound/empty row');
    await consume(JSON.parse(decoder.decode(raw))); records++; check(records <= LIMITS.source_rows, 'artifact row bound');
  };
  const sink = new Writable({ write(chunk, encoding, callback) {
    (async () => {
      const buffer = carry.length ? Buffer.concat([carry, chunk]) : chunk; let offset = 0, end;
      while ((end = buffer.indexOf(10, offset)) >= 0) { await parseLine(buffer.subarray(offset, end)); offset = end + 1; }
      carry = Buffer.from(buffer.subarray(offset)); check(carry.length <= LIMITS.line, 'JSONL line bound');
    })().then(() => callback(), callback);
  }, final(callback) { (async () => { if (carry.length) await parseLine(carry); })().then(() => callback(), callback); } });
  let source;
  try {
    check(named.size === BigInt(declaration.bytes) && stableIdentity(named, await handle.stat({ bigint: true })), 'open identity/byte declaration');
    source = createReadStream(filename, { fd: handle.fd, autoClose: false, highWaterMark: 65_536 });
    const streams = [source, rawMeter, ...(declaration.path.endsWith('.gz') ? [zlib.createGunzip()] : []), decodeMeter, sink];
    await pipeline(...streams, { signal });
    check(bytes === declaration.bytes && digest.digest('hex') === declaration.sha256 && records === declaration.record_count, `parsed-byte binding: ${declaration.path}`);
    check(stableIdentity(named, await handle.stat({ bigint: true })) && stableIdentity(named, await fs.lstat(filename, { bigint: true })), 'stable replay identity');
  } finally { source?.destroy(); rawMeter.destroy(); decodeMeter.destroy(); sink.destroy(); await handle.close().catch(() => {}); }
}

async function pinned(root, binding, max, signal) {
  check(exact(binding, ['manifest','manifest_sha256','release_id']) && /^[a-f0-9]{64}$/.test(binding.manifest_sha256), 'manifest pin shape');
  const filename = contained(root, binding.manifest), proof = await secureBuffer(root, filename, max, signal);
  check(proof.sha256 === binding.manifest_sha256, `manifest drift: ${binding.manifest}`);
  const value = JSON.parse(proof.raw); check(value.release_id === binding.release_id, 'release binding');
  return { filename, proof, value };
}

function declaration(input, name) { const matches = input.value.artifacts?.filter(item => item.path === name); check(matches?.length === 1, `artifact roster: ${name}`); return matches[0]; }
async function jsonArtifact(root, input, name, maximum, signal) {
  const item = declaration(input, name), proof = await secureBuffer(root, contained(path.dirname(input.filename), item.path), maximum, signal);
  check(proof.bytes === item.bytes && proof.sha256 === item.sha256, `JSON artifact binding: ${name}`); return JSON.parse(proof.raw);
}

async function load(root, configPath, signal) {
  const proof = await secureBuffer(root, contained(root, configPath ?? `config/${DATASET}.json`), 100_000, signal), config = JSON.parse(proof.raw);
  check(exact(config, ['schema_version','echo','coverage','geography','zip_cohort','expected']) && config.schema_version === `${DATASET}-config@1.0.0`, 'config shape/version');
  check(exact(config.expected, ['source_rows','jurisdictions','positive_source_zips','coverage_zip_rows','cohort_zip_rows','zcta_rows','shards']) && Object.values(config.expected).every(count) && config.expected.source_rows <= LIMITS.source_rows && config.expected.jurisdictions === 56 && config.expected.shards === 10 && config.expected.cohort_zip_rows <= 50_000 && config.expected.zcta_rows <= 40_000, 'config count bounds');
  const echo = await pinned(root, config.echo, 200_000, signal), coverage = await pinned(root, config.coverage, 100_000, signal), geography = await pinned(root, config.geography, 100_000, signal), zipCohort = await pinned(root, config.zip_cohort, 100_000, signal);
  check(echo.value.dataset_id === 'epa-echo-active-facilities' && echo.value.status === 'published' && echo.value.complete_echo_exporter_snapshot === true && echo.value.active_filter === 'FAC_ACTIVE_FLAG=Y' && echo.value.coverage.accepted_active_facilities === config.expected.source_rows, 'ECHO source envelope');
  check(echo.value.coverage.source_active_y_records === config.expected.source_rows + echo.value.coverage.quarantined_active_or_unexpected_records && echo.value.coverage.source_unexpected_active_flag_records_quarantined === 0, 'source exclusions');
  check(coverage.value.dataset_id === 'national-epa-echo-active-facility-coverage' && coverage.value.source.release_id === config.echo.release_id && coverage.value.source.manifest_sha256 === config.echo.manifest_sha256 && coverage.value.geography.release_id === config.geography.release_id && coverage.value.geography.manifest_sha256 === config.geography.manifest_sha256 && coverage.value.coverage.accepted_active_facilities === config.expected.source_rows && coverage.value.coverage.zip5_union_rows === config.expected.coverage_zip_rows && coverage.value.additive_to_generic_totals === false && coverage.value.production_enrollment === false, 'coverage lineage/counts');
  check(geography.value.dataset_id === 'us-census-geography' && geography.value.coverage.zctas === config.expected.zcta_rows && echo.value.dependencies.some(item => item.dataset_id === 'us-census-geography' && item.release_id === config.geography.release_id && item.manifest_sha256 === config.geography.manifest_sha256), 'geography lineage');
  check(zipCohort.value.dataset_id === 'zip-denominator-gap-cohort', 'ZIP cohort identity');
  const contractHashes = {};
  for (const relative of CONTRACTS) contractHashes[relative] = (await secureBuffer(root, contained(root, relative), 200_000, signal)).sha256;
  return { root, config, proof, echo, coverage, geography, zipCohort, contractHashes };
}

const blank = () => ({ source_record_count:0, records_with_naics:0, records_without_naics:0, records_with_multiple_naics:0, exact_naics_assignments:0, naics:new Map() });
const coverageBlank = () => Object.fromEntries(METRICS.map(key => [key, 0]));
function addCoverage(target, record, hasZcta) {
  target.active_facility_count++; target.reported_zip4_count += record.address.zip4 === null ? 0 : 1;
  const point = record.reported_location?.geometry;
  const coordinates = point?.type === 'Point' && Array.isArray(point.coordinates) && point.coordinates.length === 2 && point.coordinates.every(Number.isFinite);
  target.retained_coordinate_count += coordinates ? 1 : 0;
  target.centroid_warning_count += record.reported_location?.precision_warning === 'source-coordinate-is-a-centroid-not-a-premise-level-location' ? 1 : 0;
  target.coordinate_accuracy_missing_count += record.reported_location?.accuracy_meters === null ? 1 : 0;
  target.record_zcta_count += hasZcta ? 1 : 0; target.record_nonpolygon_count += hasZcta ? 0 : 1;
  for (const program of ['air','npdes','rcra','safe_drinking_water','toxics_release_inventory','greenhouse_gas_reporting']) {
    check(typeof record.program_associations?.[program]?.associated === 'boolean', 'program association flag');
    target[`${program}_association_count`] += record.program_associations[program].associated ? 1 : 0;
  }
}

export function validateEchoNaicsRecord(record, manifest, prefix, seen = new Set()) {
  const ids = record.external_identifiers?.filter(item => item.type === 'frs_registry_id');
  const id = ids?.[0]?.value, codes = record.source_classifications?.naics_codes;
  check(ids?.length === 1 && typeof id === 'string' && /^\d+$/.test(id) && !seen.has(id), 'missing/duplicate FRS identity');
  check(record.schema_version === '1.0.0' && record.normalized_record_id === `epa-echo:facility:${id}` && !record.entity_candidates?.organization_id && record.source_status?.value === 'epa-echo-active-program-facility-as-of-source-release' && record.source_status.source_updated_at === manifest.source_updated_at && record.observed_at === manifest.retrieved_at && record.provenance?.source_release_id === manifest.source_release_id && record.provenance?.policy_id === 'epa-echo' && record.export_policy === 'public', 'record status/provenance');
  check(ALL_CODES.includes(record.address?.state) && /^\d{5}$/.test(record.address?.zip_code) && record.address.zip_code.startsWith(String(prefix)) && record.address.zip4 === null, 'reported ZIP/state/partition');
  check(Array.isArray(codes) && codes.length <= LIMITS.naics_per_record && codes.every((code, index) => typeof code === 'string' && /^\d{2,6}$/.test(code) && (index === 0 || codes[index - 1] < code)), 'exact NAICS vocabulary/order/duplicates');
  seen.add(id); check(seen.size <= LIMITS.source_rows, 'identity bound'); return { id, codes };
}

function add(target, codes) {
  target.source_record_count++; target.records_with_naics += codes.length > 0 ? 1 : 0; target.records_without_naics += codes.length === 0 ? 1 : 0;
  target.records_with_multiple_naics += codes.length > 1 ? 1 : 0; target.exact_naics_assignments += codes.length;
  for (const code of codes) target.naics.set(code, (target.naics.get(code) ?? 0) + 1);
  check(target.naics.size <= LIMITS.distinct_naics, 'distinct NAICS bound');
}
function serialize(target) {
  const { naics, ...totals } = target;
  check(totals.records_with_naics + totals.records_without_naics === totals.source_record_count && [...naics.values()].reduce((n, value) => n + value, 0) === totals.exact_naics_assignments, 'NAICS conservation');
  return { ...totals, naics_evidence: [...naics].sort(([a], [b]) => a.localeCompare(b)).map(([naics_code, source_record_count]) => ({ naics_code, source_record_count })) };
}
function reconcile(actual, expected, label) { check(METRICS.every(key => count(expected[key]) && actual[key] === expected[key]), `${label} coverage replay`); }

async function writeRows(root, output, name, type, rows, signal, hook) {
  const filename = contained(output, name); await fs.mkdir(path.dirname(filename), { recursive: true });
  const source = new PassThrough(), sink = createWriteStream(filename, { flags: 'wx' }), digest = createHash('sha256');
  let bytes = 0, decodedBytes = 0, records = 0;
  const meter = new Transform({ transform(chunk, encoding, callback) { bytes += chunk.length; digest.update(chunk); callback(bytes > LIMITS.output_compressed ? new Error('EPA ECHO NAICS evidence rejected: output byte bound.') : null, chunk); } });
  const running = pipeline(source, ...(name.endsWith('.gz') ? [zlib.createGzip({ level: 6 })] : []), meter, sink, { signal });
  running.catch(() => {});
  try {
    for (const row of rows) { stop(signal); const raw = encoded(row); decodedBytes += raw.length; records++; check(decodedBytes <= LIMITS.output_decoded && records <= LIMITS.source_rows, 'output decoded/row bound'); await hook?.('output-row', { name, records, source, sink }); stop(signal); await new Promise((resolve, reject) => source.write(raw, error => error ? reject(error) : resolve())); }
    source.end(); await running;
  } catch (error) { source.destroy(error); sink.destroy(error); await running.catch(() => {}); throw error; }
  await canonical(root, filename);
  return { path:name, artifact_type:type, bytes, decoded_bytes:decodedBytes, record_count:records, sha256:digest.digest('hex') };
}

async function derive(input, output, signal, hook) {
  const { root, config, echo, coverage, geography, zipCohort } = input;
  const zctas = new Set(), cohort = new Map(), coverageZips = new Map(), coverageStates = new Map();
  await streamArtifact(root, path.dirname(geography.filename), declaration(geography, 'derived/index/zctas.jsonl'), signal, row => { check(/^\d{5}$/.test(row.geoid) && row.geo_type === 'zcta' && row.zcta === row.geoid && !zctas.has(row.geoid), 'ZCTA index identity'); zctas.add(row.geoid); });
  check(zctas.size === config.expected.zcta_rows, 'ZCTA count');
  await streamArtifact(root, path.dirname(zipCohort.filename), declaration(zipCohort, 'cohort.jsonl'), signal, row => {
    check(/^\d{5}$/.test(row.zip5) && !cohort.has(row.zip5) && CLASSIFICATIONS.includes(row.classification) && row.zcta_geoid === (zctas.has(row.zip5) ? row.zip5 : null) && (row.classification === 'same-code-census-zcta') === zctas.has(row.zip5) && row.usps_validity === null, 'ZIP cohort classification');
    cohort.set(row.zip5, { zip5:row.zip5, denominator_classification:row.classification, zcta_geoid:row.zcta_geoid });
  });
  check(cohort.size === config.expected.cohort_zip_rows && [...zctas].every(zip => cohort.has(zip)), 'ZIP cohort conservation');
  await streamArtifact(root, path.dirname(coverage.filename), declaration(coverage, 'jurisdictions.jsonl'), signal, row => { check(ALL_CODES.includes(row.code) && !coverageStates.has(row.code), 'coverage jurisdiction roster'); coverageStates.set(row.code, row); });
  await streamArtifact(root, path.dirname(coverage.filename), declaration(coverage, 'zip5-coverage.jsonl'), signal, row => { check(/^\d{5}$/.test(row.code) && cohort.has(row.code) && !coverageZips.has(row.code) && row.zcta_membership?.geoid === (zctas.has(row.code) ? row.code : null), 'coverage ZIP/geography roster'); coverageZips.set(row.code, row); });
  check(coverageStates.size === config.expected.jurisdictions && coverageZips.size === config.expected.coverage_zip_rows, 'coverage aggregate roster');
  const coverageSummary = await jsonArtifact(root, coverage, 'coverage-summary.json', 100_000, signal);
  check(equal(coverageSummary.coverage, coverage.value.coverage) && equal(coverageSummary.source, coverage.value.source) && equal(coverageSummary.geography, coverage.value.geography), 'coverage summary binding');
  const sourceSummary = await jsonArtifact(root, echo, 'derived/source-summary.json', 100_000, signal);
  const sources = echo.value.artifacts.filter(item => item.artifact_type === 'normalized-epa-echo-facility-jsonl-gzip');
  check(sources.length === 10 && new Set(sources.map(item => item.path)).size === 10 && sources.reduce((n, item) => n + item.record_count, 0) === config.expected.source_rows, 'source shard roster/counts');
  const national = blank(), jurisdictions = new Map(ALL_CODES.map(code => [code, blank()])), metrics = coverageBlank(), jurisdictionMetrics = new Map(ALL_CODES.map(code => [code, coverageBlank()])), seen = new Set(), artifacts = [], denseZips = [];
  let positiveZips = 0, cells = 0;
  for (let prefix = 0; prefix < 10; prefix++) {
    stop(signal); const source = sources.find(item => item.path === `derived/facilities/zip-prefix=${prefix}.jsonl.gz`); check(source, 'source ZIP-prefix roster');
    const zipCounts = new Map(), zipMetrics = new Map(); let records = 0, prefixCells = 0;
    await streamArtifact(root, path.dirname(echo.filename), source, signal, async record => {
      const { codes } = validateEchoNaicsRecord(record, echo.value, prefix, seen), zip = record.address.zip_code, state = record.address.state, hasZcta = zctas.has(zip);
      check(cohort.has(zip) && record.geography?.zcta_geoid === (hasZcta ? zip : null) && record.geography.zcta_match_status === (hasZcta ? '2020-zcta-polygon-available' : 'no-2020-zcta-polygon'), 'record ZIP/ZCTA relation');
      if (!zipCounts.has(zip)) { zipCounts.set(zip, blank()); zipMetrics.set(zip, coverageBlank()); }
      const accumulator = zipCounts.get(zip);
      prefixCells += codes.filter(code => !accumulator.naics.has(code)).length;
      check(prefixCells <= LIMITS.zip_naics_cells_per_prefix, 'ZIP NAICS cell bound');
      add(national, codes); add(jurisdictions.get(state), codes); add(accumulator, codes);
      addCoverage(metrics, record, hasZcta); addCoverage(jurisdictionMetrics.get(state), record, hasZcta); addCoverage(zipMetrics.get(zip), record, hasZcta);
      records++; await hook?.('source-row', { prefix, records }); stop(signal);
    });
    positiveZips += zipCounts.size;
    const cellRows = [];
    for (const [zip, base] of [...cohort].filter(([zip]) => zip.startsWith(String(prefix))).sort(([a], [b]) => a.localeCompare(b))) {
      const accumulator = zipCounts.get(zip) ?? blank(), actualMetrics = zipMetrics.get(zip) ?? coverageBlank(), retainedCoverage = coverageZips.get(zip);
      reconcile(actualMetrics, retainedCoverage ?? coverageBlank(), `ZIP ${zip}`);
      const result = serialize(accumulator), { naics_evidence, ...totals } = result;
      denseZips.push({ schema_version:`${DATASET}-zip@1.0.0`, ...base, ...totals, exact_naics_code_count:naics_evidence.length, naics_status:totals.source_record_count === 0 ? 'no-retained-echo-records' : totals.records_with_naics === 0 ? 'retained-records-without-naics' : 'reported-exact-naics-evidence' });
      for (const item of naics_evidence) cellRows.push({ schema_version:`${DATASET}-zip-naics@1.0.0`, ...base, ...item });
    }
    cells += cellRows.length;
    artifacts.push(await writeRows(root, output, `zip-naics/prefix=${prefix}.jsonl.gz`, 'epa-echo-exact-naics-zip-evidence-jsonl-gzip', cellRows, signal, hook));
  }
  check(national.source_record_count === config.expected.source_rows && positiveZips === config.expected.positive_source_zips, 'source/positive ZIP conservation');
  reconcile(metrics, coverageSummary, 'national');
  for (const code of ALL_CODES) { reconcile(jurisdictionMetrics.get(code), coverageStates.get(code), code); check(sourceSummary.states_and_territories?.[code] === jurisdictions.get(code).source_record_count, 'source state summary'); }
  check(sourceSummary.accepted_active_facilities === config.expected.source_rows && ALL_CODES.reduce((n, code) => n + jurisdictions.get(code).source_record_count, 0) === national.source_record_count, 'jurisdiction conservation');
  const jurisdictionRows = codes => codes.map(code => ({ schema_version:`${DATASET}-jurisdiction@1.0.0`, code, jurisdiction_kind:TERRITORIES.includes(code) ? 'territory' : 'state-or-dc', ...serialize(jurisdictions.get(code)) }));
  const summary = { schema_version:VERSION, evidence_unit:'retained ECHO accepted source record with an exact reported NAICS code', naics_code_interpretation:'exact retained 2–6 digit code; no prefix expansion, primary-code selection, official edition verification, or operational-industry mapping', ...serialize(national), state_dc_source_records:STATE_DC_CODES.reduce((n, code) => n + jurisdictions.get(code).source_record_count, 0), territory_source_records:TERRITORIES.reduce((n, code) => n + jurisdictions.get(code).source_record_count, 0), state_dc_rows:51, territory_rows:5, zip5_cohort_rows:cohort.size, positive_source_zip5_rows:positiveZips, zip5_exact_naics_cells:cells };
  artifacts.push(await writeRows(root, output, 'summary.json', 'epa-echo-naics-evidence-summary-json', [summary], signal, hook));
  artifacts.push(await writeRows(root, output, 'states.jsonl', 'epa-echo-naics-state-dc-evidence-jsonl', jurisdictionRows(STATE_DC_CODES), signal, hook));
  artifacts.push(await writeRows(root, output, 'territories.jsonl', 'epa-echo-naics-territory-evidence-jsonl', jurisdictionRows(TERRITORIES), signal, hook));
  artifacts.push(await writeRows(root, output, 'zip5-evidence.jsonl.gz', 'epa-echo-naics-zip-cohort-evidence-jsonl-gzip', denseZips, signal, hook));
  return { artifacts:artifacts.sort((a, b) => a.path.localeCompare(b.path)), summary };
}

function claims(input) {
  return { source_defined_active_program_facility_as_of:input.echo.value.source_updated_at, exact_reported_naics_only:true, naics_assignments_nonadditive:true, naics_edition_verified:false, primary_industry_inferred:false, operational_segments_mapped:false, unique_business_count:null, verified_site_count:null, current_operating_business_count:null, business_completeness:null, industry_completeness:null, authoritative_current_usps_zip_denominator:null, reported_zip4_joined:false, zcta_membership_is_usps_validity:false, generic_business_additivity_delta:0, names_addresses_coordinates_identifiers_exported:false, network_requests:0, acquisition_performed:false, current_pointer_written:false, production_enrollment:false, main_matrix_changed:false };
}
function manifestFor(input, result, createdAt) {
  check(typeof createdAt === 'string' && new Date(createdAt).toISOString() === createdAt, 'creation timestamp');
  const inputs = {};
  for (const [name, value] of [['echo',input.echo],['coverage',input.coverage],['geography',input.geography],['zip_cohort',input.zipCohort]]) inputs[name] = { manifest:path.relative(input.root, value.filename).replaceAll('\\', '/'), manifest_sha256:value.proof.sha256, release_id:value.value.release_id };
  const { naics_evidence, ...summary } = result.summary;
  const body = { schema_version:VERSION, dataset_id:DATASET, status:'immutable-local-review-only', publication_mode:'pointer-free', created_at:createdAt, processing:{ source_shards:10, maximum_source_shards_in_memory:1, source_rows_buffered:0, limits:LIMITS }, inputs, config_sha256:input.proof.sha256, contract_sha256:input.contractHashes, summary:{ ...summary, exact_naics_codes:naics_evidence.length }, claims:claims(input), verification_scope:'Independent replay of checksum-bound normalized accepted ECHO rows and retained coverage/ZIP/ZCTA indexes; raw Exporter normalization, official NAICS edition, site identity and current operation are not independently reverified.', artifacts:result.artifacts };
  return { release_id:`${DATASET}-${sha(JSON.stringify(body))}`, ...body };
}

async function inventory(directory) {
  const top = await fs.readdir(directory), nested = top.includes('zip-naics') ? (await fs.readdir(path.join(directory, 'zip-naics'))).map(name => `zip-naics/${name}`) : [];
  return [...top.filter(name => name !== 'zip-naics'), ...nested].sort();
}

export async function buildNationalEpaEchoNaicsZipIndustryEvidence(options = {}) {
  const root = await fs.realpath(path.resolve(options.root ?? APP_ROOT)); stop(options.signal);
  check(options.createdAt === undefined || root !== APP_ROOT, 'creation override requires isolated root');
  const input = await load(root, options.configPath, options.signal), createdAt = options.createdAt ?? new Date().toISOString();
  const base = contained(root, `data/${DATASET}`), releases = path.join(base, 'releases'), lock = path.join(base, '.build.lock');
  await fs.mkdir(releases, { recursive:true }); await canonical(root, releases);
  let locked = false, stage, published = false;
  try {
    await fs.mkdir(lock); locked = true; stage = path.join(base, `.stage-${randomUUID()}`); await fs.mkdir(stage);
    const result = await derive(input, stage, options.signal, options.hooks), manifest = manifestFor(input, result, createdAt), raw = encoded(manifest);
    stop(options.signal); await fs.writeFile(path.join(stage, 'manifest.json'), raw, { flag:'wx' });
    await options.hooks?.('after-manifest-before-verification', { stage, manifest }); stop(options.signal);
    await verifyNationalEpaEchoNaicsZipIndustryEvidence(path.join(stage, 'manifest.json'), { root, configPath:options.configPath, signal:options.signal, allowStaging:true, expectedReleaseId:manifest.release_id });
    await options.hooks?.('after-verification-before-publication', { stage, manifest }); stop(options.signal);
    const destination = path.join(releases, manifest.release_id);
    try { await fs.lstat(destination); check(false, 'immutable destination already exists'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await fs.rename(stage, destination); published = true;
    return { releaseDirectory:destination, manifest, manifest_sha256:sha(raw), ...manifest.summary };
  } catch (error) { if (published) error.inspection_required = true; else if (stage) { contained(base, stage); await fs.rm(stage, { recursive:true, force:true }); } throw error; }
  finally { if (locked) await fs.rmdir(lock); }
}

export async function verifyNationalEpaEchoNaicsZipIndustryEvidence(manifestPath, options = {}) {
  const root = await fs.realpath(path.resolve(options.root ?? APP_ROOT)), filename = contained(root, manifestPath), proof = await secureBuffer(root, filename, 200_000, options.signal), manifest = JSON.parse(proof.raw), directory = path.dirname(filename);
  check(manifest.schema_version === VERSION && manifest.dataset_id === DATASET && manifest.publication_mode === 'pointer-free' && /^national-epa-echo-naics-zip-industry-evidence-[a-f0-9]{64}$/.test(manifest.release_id), 'manifest identity/boundary');
  check(path.basename(directory) === manifest.release_id || options.allowStaging === true && options.expectedReleaseId === manifest.release_id && /^\.stage-[a-f0-9-]+$/.test(path.basename(directory)), 'release location');
  const expectedInventory = ['manifest.json','summary.json','states.jsonl','territories.jsonl','zip5-evidence.jsonl.gz',...Array.from({ length:10 }, (_, prefix) => `zip-naics/prefix=${prefix}.jsonl.gz`)].sort();
  check(equal(await inventory(directory), expectedInventory), 'closed output inventory');
  const input = await load(root, options.configPath, options.signal), replay = await fs.mkdtemp(path.join(path.dirname(directory), '.verify-'));
  try {
    const result = await derive(input, replay, options.signal), expected = manifestFor(input, result, manifest.created_at);
    check(equal(manifest, expected), 'independent manifest reconstruction');
    for (const item of expected.artifacts) {
      const actual = await secureBuffer(root, contained(directory, item.path), LIMITS.output_compressed, options.signal);
      check(actual.bytes === item.bytes && actual.sha256 === item.sha256, `independent artifact replay: ${item.path}`);
    }
    check((await secureBuffer(root, filename, 200_000, options.signal)).sha256 === proof.sha256, 'manifest changed during verification');
    return { verified:true, release_id:manifest.release_id, manifest_sha256:proof.sha256, ...manifest.summary, claims:manifest.claims };
  } finally { contained(root, replay); await fs.rm(replay, { recursive:true, force:true }); }
}
