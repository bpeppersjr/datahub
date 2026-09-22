import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, realpath, rename, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { Transform } from 'node:stream';
import { createGunzip } from 'node:zlib';
import { APP_ROOT, assertInsideApp } from './paths.mjs';
import { verifyCensusNonemployerRelease } from './census-nonemployer.mjs';

export const INDUSTRY_CONTEXT_VERSION = 'census-nonemployer-county-industry-context@1.0.0';
const DATASET_CONFIG = 'config/datasets/census-nonemployer-baseline.json';
const CONTEXT_DATASET_CONFIG = 'config/datasets/census-nonemployer-county-industry-context.json';
const FIXED_RELEASE = 'census-nonemployer-2023-20260830-230249716Z-78268f89';
const MAX_LINE_BYTES = 65_536;
const MAX_SOURCE_DECOMPRESSED_BYTES = 1_000_000_000;
const MAX_OUTPUT_BYTES = 25_000_000;
const EXPECTED_COUNTIES = 3_143;
const EXPECTED_ARTIFACT_ROWS = Object.freeze({ county: 701_010, national: 6_412, state: 94_825 });
export const INDUSTRY_SELECTION = Object.freeze([
  { code: '23', label: 'Construction' },
  { code: '62441', label: 'Child Day Care Services' },
]);
const fail = (message) => { throw new Error(`Census Nonemployer industry context rejected: ${message}.`); };
const hash = (value) => createHash('sha256').update(value).digest('hex');
const jsonLine = (value) => `${JSON.stringify(value)}\n`;

function validateNormalizedRow(row, expectedReferenceYear, geographyType, sourceRunId, seenIds) {
  if (!row || row.schema_version !== '1.0.0' || row.reference_year !== expectedReferenceYear
    || row.geography_type !== geographyType || !row.naics || !row.measures || row.measures.flags_preserved_without_reinterpretation !== true || !row.provenance) fail('malformed normalized row');
  if (typeof row.naics.code !== 'string' || !/^\d{2,6}(?:-\d{2,6})?$/.test(row.naics.code)
    || !['string', 'object'].includes(typeof row.naics.label) || !['string', 'object'].includes(typeof row.naics.footnote)
    || !Number.isSafeInteger(row.naics.industry_level) && row.naics.industry_level !== null
    || !['string', 'object'].includes(typeof row.naics.sector) || !['string', 'object'].includes(typeof row.naics.subsector)) fail(`invalid 2022 NAICS fields ${JSON.stringify(row.naics)}`);
  const geoOk = geographyType === 'national'
    ? row.geoid === 'US' && row.state_fips === null && row.county_fips === null
    : geographyType === 'state'
      ? /^\d{2}$/.test(row.geoid) && row.geoid !== '00' && row.state_fips === row.geoid && row.county_fips === null
      : /^\d{5}$/.test(row.geoid) && row.geoid.slice(0, 2) !== '00' && row.geoid.slice(2) !== '000'
        && row.state_fips === row.geoid.slice(0, 2) && row.county_fips === row.geoid.slice(2);
  if (!geoOk) fail(`invalid ${geographyType} GEOID ${row.geoid}`);
  if (!row.legal_form || typeof row.legal_form.code !== 'string' || !row.receipt_size || typeof row.receipt_size.code !== 'string') fail('invalid classification key');
  for (const value of [row.measures.nonemployer_establishments, row.measures.receipts_thousands_usd, row.measures.receipts_noise_range_thousands_usd]) {
    if (value !== null && (!Number.isSafeInteger(value) || value < 0)) fail('invalid measure value');
  }
  for (const value of [row.measures.nonemployer_establishments_flag, row.measures.receipts_flag, row.measures.receipts_noise_range_flag]) {
    if (value !== null && typeof value !== 'string') fail('invalid measure flag');
  }
  const expectedId = [geographyType, row.geoid, row.naics.code, row.legal_form.code, row.receipt_size.code].join(':');
  if (row.record_id !== expectedId || row.provenance.source_record_id !== expectedId
    || row.provenance.source_release_id !== FIXED_RELEASE || row.provenance.source_id !== `census-nonemployer-${expectedReferenceYear}`
    || row.provenance.ingest_run_id !== sourceRunId || row.provenance.policy_id !== 'us-census-nonemployer'
    || row.provenance.transformation_version !== 'us-census-nonemployer@1.0.0') fail(`record identity/provenance mismatch ${expectedId}`);
  if (seenIds.has(expectedId)) fail(`duplicate record id ${expectedId}`);
  seenIds.add(expectedId);
}

function selectNormalizedRow(row) {
  return row.legal_form.code === '001' && row.receipt_size.code === '001'
    && (INDUSTRY_SELECTION.some((industry) => industry.code === row.naics.code)
      || row.geography_type === 'county' && row.naics.code === '00');
}

function validateRows(rows, expectedReferenceYear) {
  if (!Array.isArray(rows) || !Number.isSafeInteger(expectedReferenceYear)) fail('input rows or reference year');
  const selected = new Map(INDUSTRY_SELECTION.map((industry) => [industry.code, industry]));
  const cells = new Map();
  const countyGeoids = new Set();
  const seen = new Set();
  for (const row of rows) {
    if (!['national', 'state', 'county'].includes(row.geography_type)) fail('malformed geography type');
    validateNormalizedRow(row, expectedReferenceYear, row.geography_type, row.provenance.ingest_run_id, seen);
    if (row.naics.code === '00' && row.legal_form?.code === '001' && row.receipt_size?.code === '001'
      && row.geography_type === 'county') countyGeoids.add(row.geoid);
    const industry = selected.get(row.naics.code);
    if (!industry || row.legal_form.code !== '001' || row.receipt_size.code !== '001') continue;
    const key = `${industry.code}:${row.geography_type}:${row.geoid}`;
    if (cells.has(key)) fail(`duplicate selected total ${key}`);
    cells.set(key, { row, industry });
  }
  if (!countyGeoids.size) fail('county geography universe is empty');
  return { cells, countyGeoids: [...countyGeoids].sort() };
}

function knownSum(values) {
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) fail('unusable value entered a known-cell sum');
  return values.reduce((sum, value) => sum + value, 0);
}

function assertNativePartitionCounts(derived, countyCount, expectations) {
  if (countyCount !== EXPECTED_COUNTIES) fail('fixed native county universe size');
  if (expectations?.county_geographies !== EXPECTED_COUNTIES
    || JSON.stringify(Object.keys(expectations.by_naics ?? {}).sort()) !== JSON.stringify(INDUSTRY_SELECTION.map((item) => item.code).sort())) fail(`retained partition contract ${JSON.stringify(expectations)}`);
  for (const [code, target] of Object.entries(expectations.by_naics)) {
    const rows = derived.rows.filter((row) => row.naics.code === code && row.geography_type === 'county');
    const actual = {
      usable: rows.filter((row) => !row.missing_cell && !row.measures.nonemployer_establishments_flag && Number.isSafeInteger(row.measures.nonemployer_establishments)).length,
      flagged: rows.filter((row) => !row.missing_cell && Boolean(row.measures.nonemployer_establishments_flag)).length,
      absent: rows.filter((row) => row.missing_cell).length,
    };
    const residual = derived.residuals.find((row) => row.naics_code === code);
    if (actual.usable !== target.usable || actual.flagged !== target.flagged || actual.absent !== target.absent
      || residual?.national_minus_known_counties !== target.national_minus_known_counties
      || residual?.county_expected_count !== EXPECTED_COUNTIES) fail(`fixed retained ${code} native partition/difference counts`);
  }
}

async function assertAllowedOutputRoot(target) {
  const dataRoot = path.join(APP_ROOT, 'data');
  const relative = path.relative(dataRoot, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)
    || relative.split(path.sep).some((part) => /^\.?worktrees?$/i.test(part))) fail('output root must be under data and outside worktrees');
  let current = dataRoot;
  const dataInfo = await lstat(dataRoot, { bigint: true });
  if (!dataInfo.isDirectory() || dataInfo.isSymbolicLink() || await realpath(dataRoot) !== dataRoot) fail('data output root is not canonical');
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    try {
      const item = await lstat(current, { bigint: true });
      if (!item.isDirectory() || item.isSymbolicLink() || await realpath(current) !== current) fail('output directory is not canonical');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await mkdir(current);
    }
  }
  return target;
}

/** Pure projection for synthetic fixtures and deterministic retained processing. */
export function deriveCensusNonemployerIndustryContext(rows, referenceYear, provenance) {
  const { cells, countyGeoids } = validateRows(rows, referenceYear);
  const outputs = [];
  const residuals = [];
  for (const industry of INDUSTRY_SELECTION) {
    const nationalCell = cells.get(`${industry.code}:national:US`);
    const states = [...cells.values()].filter(({ row, industry: item }) => item.code === industry.code && row.geography_type === 'state');
    const counties = [...cells.values()].filter(({ row, industry: item }) => item.code === industry.code && row.geography_type === 'county');
    const measure = (row) => row?.measures?.nonemployer_establishments_flag ? null : row?.measures?.nonemployer_establishments ?? null;
    const stateValues = states.map(({ row }) => measure(row)).filter(Number.isSafeInteger);
    const countyValues = counties.map(({ row }) => measure(row)).filter(Number.isSafeInteger);
    const stateSum = knownSum(stateValues);
    const countySum = knownSum(countyValues);
    const countyFlaggedCount = counties.filter(({ row }) => Boolean(row.measures.nonemployer_establishments_flag)).length;
    const countyAbsentCount = countyGeoids.length - counties.length;
    if (countyAbsentCount < 0) fail('selected county cells exceed the retained county universe');
    const nationalUsable = measure(nationalCell?.row);
    residuals.push({
      naics_code: industry.code,
      national_establishments_usable: nationalUsable,
      state_establishments_usable_sum: stateSum,
      county_establishments_usable_sum: countySum,
      national_minus_states_usable: nationalUsable === null ? null : nationalUsable - stateSum,
      national_minus_known_counties: nationalUsable === null ? null : nationalUsable - countySum,
      states_minus_known_counties: stateSum === null ? null : stateSum - countySum,
      state_count: states.length,
      county_published_count: counties.length,
      county_expected_count: countyGeoids.length,
      county_usable_count: countyValues.length,
      county_flagged_count: countyFlaggedCount,
      county_absent_count: countyAbsentCount,
      state_usable_count: stateValues.length,
      state_flagged_count: states.filter(({ row }) => Boolean(row.measures.nonemployer_establishments_flag)).length,
      difference_semantics: 'national/state totals minus sum of usable known county cells only; not a measure of completeness or missing businesses',
      residual_status: 'known-cell-differences-only',
    });
    for (const row of [
      ...(nationalCell ? [{ ...nationalCell.row, geography_type: 'national', geoid: 'US' }] : []),
      ...states.map((item) => item.row),
      ...counties.map((item) => item.row),
    ]) {
      outputs.push(projectedCell(row, industry, provenance));
    }
    const present = new Set(counties.map(({ row }) => row.geoid));
    for (const geoid of countyGeoids) if (!present.has(geoid)) {
      outputs.push({
        schema_version: INDUSTRY_CONTEXT_VERSION,
        naics: { ...industry, classification: '2022 NAICS' },
        geography_type: 'county', geoid, state_fips: geoid.slice(0, 2), county_fips: geoid.slice(2),
        geography_name: null, reference_year: referenceYear,
        status: 'not-published-in-retained-selected-total-cells',
        measures: { nonemployer_establishments: null, nonemployer_establishments_raw: null, nonemployer_establishments_flag: null,
          receipts_thousands_usd: null, receipts_flag: null, receipts_noise_range_thousands_usd: null,
          receipts_noise_range_flag: null, flags_preserved_without_reinterpretation: true },
        missing_cell: true,
        provenance: { ...provenance, source_record_id: null, retained_source_record_id: null },
      });
    }
  }
  outputs.sort((a, b) => a.naics.code.localeCompare(b.naics.code)
    || a.geography_type.localeCompare(b.geography_type) || a.geoid.localeCompare(b.geoid));
  return { rows: outputs, residuals };
}

function projectedCell(row, industry, provenance) {
  const artifactPaths = provenance.source_artifact_path_by_geography ?? {};
  const artifactHashes = provenance.source_artifact_sha256_by_geography ?? {};
  return {
    schema_version: INDUSTRY_CONTEXT_VERSION,
    naics: { code: industry.code, label: row.naics.label || industry.label, classification: '2022 NAICS' },
    geography_type: row.geography_type, geoid: row.geoid, state_fips: row.state_fips, county_fips: row.county_fips,
    geography_name: row.geography_name, reference_year: row.reference_year,
    status: row.measures.nonemployer_establishments_flag ? 'published-flagged-establishment-measure' : 'published-annual-aggregate', missing_cell: false,
    measures: { ...row.measures,
      nonemployer_establishments_raw: row.measures.nonemployer_establishments,
      nonemployer_establishments: row.measures.nonemployer_establishments_flag ? null : row.measures.nonemployer_establishments,
      receipts_thousands_usd_raw: row.measures.receipts_thousands_usd,
      receipts_thousands_usd: row.measures.receipts_flag ? null : row.measures.receipts_thousands_usd,
      receipts_noise_range_thousands_usd_raw: row.measures.receipts_noise_range_thousands_usd,
      receipts_noise_range_thousands_usd: row.measures.receipts_noise_range_flag ? null : row.measures.receipts_noise_range_thousands_usd },
    provenance: { ...provenance,
      source_artifact_path: artifactPaths[row.geography_type] ?? provenance.source_county_artifact_path ?? null,
      source_artifact_sha256: artifactHashes[row.geography_type] ?? provenance.source_county_artifact_sha256 ?? null,
      source_record_id: row.record_id, retained_source_record_id: row.record_id },
  };
}

function sameIdentity(left, right) {
  return left.isFile() && right.isFile() && left.dev === right.dev && left.ino === right.ino
    && left.nlink === 1n && right.nlink === 1n;
}

function sameStableFile(left, right) {
  return sameIdentity(left, right) && left.size === right.size && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

async function assertCanonicalFile(file) {
  const absolute = path.resolve(file);
  const relative = path.relative(APP_ROOT, absolute);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) fail('source path escapes datahub');
  let current = APP_ROOT;
  for (const segment of relative.split(path.sep).slice(0, -1)) {
    current = path.join(current, segment);
    const item = await lstat(current, { bigint: true });
    if (!item.isDirectory() || item.isSymbolicLink() || await realpath(current) !== current) fail('non-canonical source directory');
  }
  const fileStat = await lstat(absolute, { bigint: true });
  if (!fileStat.isFile() || fileStat.isSymbolicLink() || fileStat.nlink !== 1n || await realpath(absolute) !== absolute) fail('source is not a canonical single-link file');
  return fileStat;
}

async function readGzipRows(file, artifact, { signal, geographyType, referenceYear, sourceRunId,
  seenIds = new Set(), countyGeoids = new Set(), stateGeoids = new Set() }) {
  const initial = await assertCanonicalFile(file);
  if (!Number.isSafeInteger(artifact.bytes) || artifact.bytes !== Number(initial.size) || initial.size > 60_000_000n
    || !Number.isSafeInteger(artifact.record_count) || artifact.record_count < 1 || artifact.record_count > EXPECTED_ARTIFACT_ROWS[geographyType]) fail(`source ${geographyType} artifact size/row contract`);
  const handle = await open(file, 'r');
  if (!sameIdentity(initial, await handle.stat({ bigint: true }))) {
    await handle.close();
    fail('source file identity changed before open');
  }
  const digest = createHash('sha256');
  let compressedBytes = 0;
  let expandedBytes = 0;
  let parsedRows = 0;
  const rows = [];
  const source = handle.createReadStream({ autoClose: false });
  const compressedMeter = new Transform({ transform(chunk, _encoding, callback) {
    compressedBytes += chunk.length;
    if (compressedBytes > 60_000_000) return callback(new Error('Compressed Census artifact exceeded its byte limit.'));
    digest.update(chunk);
    callback(null, chunk);
  } });
  const gunzip = createGunzip();
  const expandedMeter = new Transform({ transform(chunk, _encoding, callback) {
    expandedBytes += chunk.length;
    if (expandedBytes > MAX_SOURCE_DECOMPRESSED_BYTES) return callback(new Error('Expanded Census artifact exceeded its byte limit.'));
    callback(null, chunk);
  } });
  const propagateError = (error) => gunzip.destroy(error);
  source.on('error', propagateError);
  compressedMeter.on('error', propagateError);
  gunzip.on('error', (error) => expandedMeter.destroy(error));
  source.on('error', () => {});
  compressedMeter.on('error', () => {});
  gunzip.on('error', () => {});
  expandedMeter.on('error', () => {});
  const abort = () => {
    const error = signal.reason instanceof Error ? signal.reason : Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' });
    source.destroy(error);
  };
  signal?.addEventListener('abort', abort, { once: true });
  source.pipe(compressedMeter).pipe(gunzip).pipe(expandedMeter);
  const lines = createInterface({ input: expandedMeter, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      signal?.throwIfAborted();
      const lineBytes = Buffer.byteLength(line, 'utf8');
      if (!lineBytes || lineBytes > MAX_LINE_BYTES) fail(`source ${geographyType} line byte limit/empty record`);
      let row;
      try { row = JSON.parse(line); } catch { fail(`malformed JSON in ${geographyType} artifact`); }
      validateNormalizedRow(row, referenceYear, geographyType, sourceRunId, seenIds);
      parsedRows += 1;
      if (geographyType === 'county' && row.naics.code === '00' && row.legal_form.code === '001' && row.receipt_size.code === '001') countyGeoids.add(row.geoid);
      if (geographyType === 'state') stateGeoids.add(row.geoid);
      if (selectNormalizedRow(row)) rows.push(row);
    }
    signal?.throwIfAborted();
    const final = await handle.stat({ bigint: true });
    const named = await lstat(file, { bigint: true });
    if (!sameStableFile(initial, final) || !sameStableFile(initial, named) || BigInt(compressedBytes) !== initial.size
      || parsedRows !== artifact.record_count || digest.digest('hex') !== artifact.sha256) fail(`source ${geographyType} stable read/hash/count mismatch`);
    return { rows, parsedRows, compressedBytes, expandedBytes };
  } finally {
    signal?.removeEventListener('abort', abort);
    lines.close();
    source.destroy(); compressedMeter.destroy(); gunzip.destroy(); expandedMeter.destroy();
    await handle.close().catch(() => {});
  }
}

export async function readCensusNonemployerArtifactForTests(file, artifact, options) {
  return readGzipRows(file, artifact, options);
}

async function readFixedSourceInputs(config, sourceManifest, sourceDirectory, referenceYear, signal) {
  const artifactsByPath = new Map(sourceManifest.artifacts.map((artifact) => [artifact.path, artifact]));
  const countyArtifact = artifactsByPath.get(config.normalized_artifacts.county_industry);
  const nationalArtifact = artifactsByPath.get(config.normalized_artifacts.national_industry);
  const stateArtifact = artifactsByPath.get(config.normalized_artifacts.state_industry);
  if (!countyArtifact || !nationalArtifact || !stateArtifact
    || countyArtifact.sha256 !== config.current_verified_release.county_industry_sha256) fail('fixed retained industry artifacts');
  if (countyArtifact.record_count !== EXPECTED_ARTIFACT_ROWS.county || nationalArtifact.record_count !== EXPECTED_ARTIFACT_ROWS.national
    || stateArtifact.record_count !== EXPECTED_ARTIFACT_ROWS.state) fail('fixed retained native source partitions');
  const seenIds = new Set();
  const countyGeoids = new Set();
  const stateGeoids = new Set();
  const sourceRunId = sourceManifest.run_id;
  const countyInput = await readGzipRows(path.join(sourceDirectory, countyArtifact.path), countyArtifact,
    { signal, geographyType: 'county', referenceYear, sourceRunId, seenIds, countyGeoids });
  if (countyInput.parsedRows !== config.current_verified_release.normalized_county_industry_rows
    || countyGeoids.size !== EXPECTED_COUNTIES) fail('retained county row/geography universe');
  const nationalInput = await readGzipRows(path.join(sourceDirectory, nationalArtifact.path), nationalArtifact,
    { signal, geographyType: 'national', referenceYear, sourceRunId, seenIds, countyGeoids });
  const stateInput = await readGzipRows(path.join(sourceDirectory, stateArtifact.path), stateArtifact,
    { signal, geographyType: 'state', referenceYear, sourceRunId, seenIds, countyGeoids, stateGeoids });
  if (nationalInput.parsedRows !== config.current_verified_release.normalized_national_industry_rows
    || stateInput.parsedRows !== config.current_verified_release.normalized_state_industry_rows
    || stateGeoids.size !== config.current_verified_release.state_totals
    || [...countyGeoids].some((geoid) => !stateGeoids.has(geoid.slice(0, 2)))) fail('retained national/state row or GEOID coverage');
  return { combined: [...countyInput.rows, ...nationalInput.rows, ...stateInput.rows], countyGeoids,
    countyArtifact, nationalArtifact, stateArtifact };
}

async function readTextStable(file, maximum) {
  const initial = await assertCanonicalFile(file);
  if (initial.size > BigInt(maximum)) fail('text artifact exceeds byte ceiling');
  const handle = await open(file, 'r');
  try {
    const content = await handle.readFile({ encoding: 'utf8' });
    const final = await handle.stat({ bigint: true });
    const named = await lstat(file, { bigint: true });
    if (!sameStableFile(initial, final) || !sameStableFile(initial, named) || Buffer.byteLength(content) !== Number(initial.size)) fail('text artifact changed during read');
    return content;
  } finally { await handle.close().catch(() => {}); }
}

async function digestFile(file, maximum = MAX_OUTPUT_BYTES) {
  const initial = await assertCanonicalFile(file);
  if (initial.size > BigInt(maximum)) fail('artifact exceeds byte ceiling');
  const handle = await open(file, 'r');
  try {
    const actual = await handle.stat({ bigint: true });
    if (!sameStableFile(initial, actual)) fail('artifact changed before hashing');
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    const named = await lstat(file, { bigint: true });
    if (!sameStableFile(initial, after) || !sameStableFile(initial, named) || bytes.length !== Number(initial.size)) fail('artifact changed while hashing');
    return { bytes: bytes.length, sha256: hash(bytes) };
  } finally { await handle.close(); }
}

function artifactDescriptor(file, relativePath, artifactType, count) {
  return digestFile(file).then(({ bytes, sha256 }) => ({ path: relativePath, bytes, sha256, record_count: count, artifact_type: artifactType }));
}

export async function buildCensusNonemployerIndustryContext({ outputRoot = 'data/business-baselines/census-nonemployer-industry-context', signal, now = () => new Date() } = {}) {
  signal?.throwIfAborted();
  const config = JSON.parse(await readFile(path.join(APP_ROOT, DATASET_CONFIG), 'utf8'));
  const contextConfig = JSON.parse(await readFile(path.join(APP_ROOT, CONTEXT_DATASET_CONFIG), 'utf8'));
  const root = path.join(APP_ROOT, 'data/business-baselines/census-nonemployer');
  const pointer = JSON.parse(await readFile(path.join(root, 'current.json'), 'utf8'));
  if (pointer.release_id !== FIXED_RELEASE || config.current_verified_release.release_id !== FIXED_RELEASE) fail('fixed retained release pin');
  const sourceManifestPath = path.resolve(root, pointer.manifest);
  const verified = await verifyCensusNonemployerRelease(sourceManifestPath);
  signal?.throwIfAborted();
  if (verified.release_id !== FIXED_RELEASE || verified.reference_year !== config.current_verified_release.reference_year) fail('verified retained release identity');
  const sourceManifestHash = (await digestFile(sourceManifestPath)).sha256;
  if (sourceManifestHash !== config.current_verified_release.manifest_sha256) fail('fixed retained manifest hash');
  const sourceManifest = JSON.parse(await readTextStable(sourceManifestPath, 2_000_000));
  const sourceDirectory = path.dirname(sourceManifestPath);
  const sourceInputs = await readFixedSourceInputs(config, sourceManifest, sourceDirectory, verified.reference_year, signal);
  const { countyArtifact, nationalArtifact, stateArtifact, countyGeoids, combined } = sourceInputs;
  const provenance = {
    source_dataset_id: config.dataset_id,
    source_release_id: FIXED_RELEASE,
    source_manifest_sha256: sourceManifestHash,
    source_county_artifact_sha256: countyArtifact.sha256,
    source_county_artifact_path: countyArtifact.path,
    source_artifact_path_by_geography: { county: countyArtifact.path, national: nationalArtifact.path, state: stateArtifact.path },
    source_artifact_sha256_by_geography: { county: countyArtifact.sha256, national: nationalArtifact.sha256, state: stateArtifact.sha256 },
    source_policy: config.source_policy,
    transformation_version: INDUSTRY_CONTEXT_VERSION,
  };
  const derived = deriveCensusNonemployerIndustryContext(combined, verified.reference_year, provenance);
  assertNativePartitionCounts(derived, countyGeoids.size, contextConfig.retained_county_expectations);
  signal?.throwIfAborted();
  const outputDirectory = await assertAllowedOutputRoot(path.resolve(APP_ROOT, outputRoot));
  const runId = randomUUID();
  const releaseId = `census-nonemployer-industry-context-${verified.reference_year}-${runId}`;
  const staging = path.join(outputDirectory, '.staging', runId);
  await assertAllowedOutputRoot(path.dirname(staging));
  await mkdir(staging);
  try {
    signal?.throwIfAborted();
    const recordsPath = path.join(staging, 'county-industry-context.jsonl');
    const residualsPath = path.join(staging, 'geography-residuals.jsonl');
    await writeFile(recordsPath, derived.rows.map(jsonLine).join(''), { flag: 'wx' });
    signal?.throwIfAborted();
    await writeFile(residualsPath, derived.residuals.map(jsonLine).join(''), { flag: 'wx' });
    const artifacts = await Promise.all([
      artifactDescriptor(recordsPath, 'county-industry-context.jsonl', 'census-nonemployer-industry-context-jsonl', derived.rows.length),
      artifactDescriptor(residualsPath, 'geography-residuals.jsonl', 'census-nonemployer-industry-residuals-jsonl', derived.residuals.length),
    ]);
    const createdAt = now().toISOString();
    const manifest = {
      schema_version: INDUSTRY_CONTEXT_VERSION, dataset_id: 'census-nonemployer-county-industry-context',
      release_id: releaseId, run_id: runId, created_at: createdAt, status: 'verified-retained-derived-context',
      source: { dataset_id: config.dataset_id, release_id: FIXED_RELEASE, reference_year: verified.reference_year,
        manifest_path: path.relative(root, sourceManifestPath).replaceAll('\\', '/'), manifest_sha256: sourceManifestHash,
        county_artifact_path: countyArtifact.path, county_artifact_sha256: countyArtifact.sha256,
        national_artifact_sha256: nationalArtifact.sha256, state_artifact_sha256: stateArtifact.sha256 },
      classification: { system: 'NAICS', vintage: 2022, selection: INDUSTRY_SELECTION },
      semantics: { measures: 'Census annual nonemployer aggregate values; flagged numeric values are retained in raw fields while usable measures are null',
        missing_county: 'Expected county geography in the retained release with no selected total row; no value is imputed',
        residuals: 'National/state minus the sums of usable known county cells only; differences do not measure completeness or missing businesses',
        prohibitions: ['Not named businesses', 'Not current operating status', 'No ZIP or ZCTA allocation', 'Not evidence of collection completeness'] },
      coverage: { county_geographies: new Set(derived.rows.filter((row) => row.geography_type === 'county').map((row) => row.geoid)).size,
        industries: INDUSTRY_SELECTION.map((industry) => industry.code), rows: derived.rows.length },
      artifacts,
    };
    await writeFile(path.join(staging, 'manifest.json'), jsonLine(manifest), { flag: 'wx' });
    signal?.throwIfAborted();
    const releaseDirectory = path.join(outputDirectory, 'releases', releaseId);
    await assertAllowedOutputRoot(path.dirname(releaseDirectory));
    await rename(staging, releaseDirectory);
    return { manifest, releaseDirectory, manifestPath: path.join(releaseDirectory, 'manifest.json') };
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

export async function verifyCensusNonemployerIndustryContext(manifestPath) {
  const resolvedManifest = assertInsideApp(path.resolve(manifestPath));
  const directory = path.dirname(resolvedManifest);
  const manifestFileStat = await assertCanonicalFile(resolvedManifest);
  if (manifestFileStat.size > 2_000_000n) fail('manifest byte ceiling');
  const manifest = JSON.parse(await readTextStable(resolvedManifest, 2_000_000));
  if (manifest.schema_version !== INDUSTRY_CONTEXT_VERSION || manifest.dataset_id !== 'census-nonemployer-county-industry-context'
    || manifest.status !== 'verified-retained-derived-context' || manifest.source?.release_id !== FIXED_RELEASE
    || manifest.source?.reference_year !== 2023 || manifest.classification?.system !== 'NAICS'
    || manifest.classification?.vintage !== 2022 || JSON.stringify(manifest.classification.selection) !== JSON.stringify(INDUSTRY_SELECTION)
    || path.basename(directory) !== manifest.release_id) fail('manifest contract');
  const manifestId = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!manifestId.test(manifest.run_id) || manifest.release_id !== `census-nonemployer-industry-context-2023-${manifest.run_id}`
    || !Number.isFinite(Date.parse(manifest.created_at)) || new Date(manifest.created_at).toISOString() !== manifest.created_at) fail('release identity/time');
  const config = JSON.parse(await readFile(path.join(APP_ROOT, DATASET_CONFIG), 'utf8'));
  const contextConfig = JSON.parse(await readFile(path.join(APP_ROOT, CONTEXT_DATASET_CONFIG), 'utf8'));
  const sourceRoot = path.join(APP_ROOT, 'data/business-baselines/census-nonemployer');
  const pointer = JSON.parse(await readFile(path.join(sourceRoot, 'current.json'), 'utf8'));
  if (pointer.release_id !== FIXED_RELEASE || manifest.source.dataset_id !== config.dataset_id
    || manifest.source.manifest_path !== pointer.manifest) fail('source release pin');
  const sourceManifestPath = path.resolve(sourceRoot, pointer.manifest);
  const sourceDigest = await digestFile(sourceManifestPath);
  if (sourceDigest.sha256 !== config.current_verified_release.manifest_sha256
    || sourceDigest.sha256 !== manifest.source.manifest_sha256) fail('source manifest hash');
  const sourceVerification = await verifyCensusNonemployerRelease(sourceManifestPath);
  if (sourceVerification.release_id !== FIXED_RELEASE || sourceVerification.reference_year !== 2023) fail('upstream retained release verification');
  const sourceManifest = JSON.parse(await readTextStable(sourceManifestPath, 2_000_000));
  for (const artifactPath of [config.normalized_artifacts.county_industry, config.normalized_artifacts.national_industry, config.normalized_artifacts.state_industry]) {
    const dependency = sourceManifest.artifacts.find((artifact) => artifact.path === artifactPath);
    const claimedHash = artifactPath === config.normalized_artifacts.county_industry ? manifest.source.county_artifact_sha256
      : artifactPath === config.normalized_artifacts.national_industry ? manifest.source.national_artifact_sha256 : manifest.source.state_artifact_sha256;
    if (!dependency || dependency.sha256 !== claimedHash) fail(`source artifact pin ${artifactPath}`);
  }
  const sourceInputs = await readFixedSourceInputs(config, sourceManifest, path.dirname(sourceManifestPath), 2023);
  const provenance = { source_dataset_id: config.dataset_id, source_release_id: FIXED_RELEASE,
    source_manifest_sha256: sourceDigest.sha256, source_county_artifact_sha256: sourceInputs.countyArtifact.sha256,
    source_county_artifact_path: sourceInputs.countyArtifact.path,
    source_artifact_path_by_geography: { county: sourceInputs.countyArtifact.path, national: sourceInputs.nationalArtifact.path, state: sourceInputs.stateArtifact.path },
    source_artifact_sha256_by_geography: { county: sourceInputs.countyArtifact.sha256, national: sourceInputs.nationalArtifact.sha256, state: sourceInputs.stateArtifact.sha256 },
    source_policy: config.source_policy,
    transformation_version: INDUSTRY_CONTEXT_VERSION };
  const replayed = deriveCensusNonemployerIndustryContext(sourceInputs.combined, 2023, provenance);
  assertNativePartitionCounts(replayed, sourceInputs.countyGeoids.size, contextConfig.retained_county_expectations);
  const results = [];
  if (JSON.stringify((manifest.artifacts ?? []).map((artifact) => artifact.path).sort())
    !== JSON.stringify(['county-industry-context.jsonl', 'geography-residuals.jsonl'])) fail('artifact roster');
  for (const artifact of manifest.artifacts ?? []) {
    const expectedType = artifact.path === 'county-industry-context.jsonl'
      ? 'census-nonemployer-industry-context-jsonl' : 'census-nonemployer-industry-residuals-jsonl';
    const expectedCount = artifact.path === 'county-industry-context.jsonl' ? replayed.rows.length : replayed.residuals.length;
    if (artifact.artifact_type !== expectedType || artifact.record_count !== expectedCount
      || !Number.isSafeInteger(artifact.bytes) || artifact.bytes < 0 || artifact.bytes > MAX_OUTPUT_BYTES
      || !/^[a-f0-9]{64}$/.test(artifact.sha256)) fail(`artifact descriptor ${artifact.path}`);
    const target = path.resolve(directory, artifact.path);
    const relative = path.relative(directory, target);
    if (relative.startsWith('..') || path.isAbsolute(relative)) fail('artifact path escape');
    const actual = await digestFile(target);
    if (actual.bytes !== artifact.bytes || actual.sha256 !== artifact.sha256) fail(`artifact digest mismatch ${artifact.path}`);
    const expectedContent = artifact.path === 'county-industry-context.jsonl'
      ? replayed.rows.map(jsonLine).join('') : replayed.residuals.map(jsonLine).join('');
    const expectedDigest = hash(expectedContent);
    if (actual.bytes !== Buffer.byteLength(expectedContent) || actual.sha256 !== expectedDigest) fail(`source/output conservation mismatch ${artifact.path}; expected ${Buffer.byteLength(expectedContent)} bytes ${expectedDigest}, found ${actual.bytes} bytes ${actual.sha256}`);
    results.push({ path: artifact.path, ...actual });
  }
  if (results.length !== 2) fail('artifact roster');
  const allowedFiles = ['county-industry-context.jsonl', 'geography-residuals.jsonl', 'manifest.json'].sort();
  if (JSON.stringify((await readdir(directory)).sort()) !== JSON.stringify(allowedFiles)) fail('undeclared release files');
  const rows = (await readTextStable(path.join(directory, 'county-industry-context.jsonl'), MAX_OUTPUT_BYTES)).trim().split(/\r?\n/).map(JSON.parse);
  if (manifest.coverage?.county_geographies !== EXPECTED_COUNTIES || manifest.coverage?.rows !== replayed.rows.length
    || JSON.stringify(manifest.coverage?.industries) !== JSON.stringify(INDUSTRY_SELECTION.map((item) => item.code))) fail('output coverage conservation');
  const ids = new Set();
  for (const row of rows) {
    const key = `${row.naics.code}:${row.geography_type}:${row.geoid}`;
    if (ids.has(key)) fail(`duplicate output cell ${key}`);
    ids.add(key);
    if (!INDUSTRY_SELECTION.some((industry) => industry.code === row.naics.code) || row.reference_year !== 2023
      || row.naics.classification !== '2022 NAICS' || row.provenance?.source_release_id !== FIXED_RELEASE
      || row.provenance?.source_manifest_sha256 !== manifest.source.manifest_sha256
      || row.provenance?.source_county_artifact_sha256 !== manifest.source.county_artifact_sha256) fail(`row provenance or selection ${key}`);
    if (row.missing_cell && (row.status !== 'not-published-in-retained-selected-total-cells'
      || row.measures.nonemployer_establishments !== null)) fail(`missing-cell semantics ${key}`);
  }
  return { release_id: manifest.release_id, reference_year: manifest.source.reference_year, row_count: rows.length, verified_artifacts: results.length };
}
