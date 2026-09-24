import { createHash, randomUUID } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { link, lstat, mkdir, open, readdir, realpath, rename, rm, rmdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { APP_ROOT } from './paths.mjs';
import { verifyFsisMpi } from './fsis-mpi.mjs';

const DATASET_ID = 'national-fsis-active-establishment-coverage';
const SCHEMA_VERSION = `${DATASET_ID}@1.0.0`;
const SOURCE_POINTER = path.join(APP_ROOT, 'data/business-sources/fsis-active-mpi-establishments/current.json');
const GEOGRAPHY_POINTER = path.join(APP_ROOT, 'data/geography/current.json');
const OUTPUT_ROOT = path.join(APP_ROOT, `data/${DATASET_ID}`);
const SOURCE_RELEASE = 'fsis-mpi-20260903-002210046Z-c0d4d058';
const SOURCE_MANIFEST_SHA = '6c68d892010cf114866121e6ea5adc2e3dc1f21784b350344590032b4562858d';
const SOURCE_POINTER_SHA = '921c5f9f0e94818dd0a10d3a217ebbefb0af03e5e161fd4b07b10fba84dfa957';
const GEOGRAPHY_RELEASE = 'us-census-geography-20260830-132803990Z-3629abc0';
const GEOGRAPHY_MANIFEST_SHA = '5426cae150c0fba64f8ff43a48ca39c4e78b5b4ba8a8007fbd211615540d1c8b';
const GEOGRAPHY_POINTER_SHA = '5f89350482630a7d2e888772512aca36fdd21f68c8d3f01f1113dc6c2c400403';
const SOURCE_DATE = '2026-08-24';
const RETRIEVED_AT = '2026-09-03T00:22:10.046Z';
const SOURCE_RELEASE_ID = 'fsis-mpi-2026-08-24-e7be6d8dfc46f68e';
const TERRITORIES = new Set(['AS', 'GU', 'MP', 'PR', 'VI']);
const CONTRACT_PATHS = [
  'config/connectors/national-fsis-active-establishment-coverage.json',
  'config/datasets/national-fsis-active-establishment-coverage.json',
  'config/schemas/national-fsis-active-establishment-coverage.schema.json',
  'config/source-policies/national-fsis-active-establishment-coverage.json',
];
const PRIVACY_WARNING = 'Aggregate counts exclude names, other names, addresses, phones, coordinates, geometry, establishment identifiers, record identifiers, and raw records.';

const sha = (value) => createHash('sha256').update(value).digest('hex');
const encode = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const jsonLines = (rows) => Buffer.from(`${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);
const fail = (message) => { throw new Error(message); };
const check = (condition, message) => { if (!condition) fail(message); };
const exactKeys = (value, keys, label) => check(value && typeof value === 'object' && !Array.isArray(value) && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort()), `${label} shape changed`);
const inside = (parent, candidate) => {
  const relative = path.relative(parent, candidate);
  check(relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative), 'path escapes governed root');
};
const cancelled = (signal) => {
  if (signal?.aborted) throw new DOMException('Operation cancelled.', 'AbortError');
};

async function stable(filename, maximumBytes = 600_000_000) {
  const before = await lstat(filename);
  check(before.isFile() && !before.isSymbolicLink() && before.nlink === 1 && before.size <= maximumBytes, 'unsafe file');
  const handle = await open(filename, 'r');
  try {
    const opened = await handle.stat();
    check(opened.dev === before.dev && opened.ino === before.ino && opened.size === before.size, 'file changed before read');
    const bytes = await handle.readFile();
    const after = await stat(filename);
    check(after.dev === before.dev && after.ino === before.ino && after.size === before.size && after.mtimeMs === before.mtimeMs, 'file changed during read');
    return bytes;
  } finally {
    await handle.close();
  }
}

async function pointer(pointerPath, expectedDataset, expectedRelease, expectedPointerSha, expectedManifestSha) {
  const pointerBytes = await stable(pointerPath, 100_000);
  check(sha(pointerBytes) === expectedPointerSha, 'pointer hash changed');
  const value = JSON.parse(pointerBytes);
  check(value.dataset_id === expectedDataset && value.release_id === expectedRelease && typeof value.manifest === 'string', 'pointer identity changed');
  const manifestPath = path.resolve(path.dirname(pointerPath), value.manifest);
  inside(path.dirname(pointerPath), manifestPath);
  const manifestBytes = await stable(manifestPath, 2_000_000);
  check(sha(manifestBytes) === expectedManifestSha, 'manifest hash changed');
  return { pointerPath, pointerBytes, pointerSha256: sha(pointerBytes), manifestPath, manifestBytes, manifestSha256: sha(manifestBytes), manifest: JSON.parse(manifestBytes) };
}

function blank() {
  return { active_establishment_count: 0, reported_zip4_count: 0, retained_coordinate_count: 0, missing_coordinate_count: 0, record_zcta_count: 0, record_nonpolygon_count: 0 };
}

function add(accumulator, record) {
  accumulator.active_establishment_count += 1;
  accumulator.reported_zip4_count += record.address.zip4 ? 1 : 0;
  const hasCoordinates = Array.isArray(record.location?.coordinates) && record.location.coordinates.length === 2;
  accumulator.retained_coordinate_count += hasCoordinates ? 1 : 0;
  accumulator.missing_coordinate_count += hasCoordinates ? 0 : 1;
  const hasZcta = record.geography.zcta_geoid === record.address.zip_code;
  accumulator.record_zcta_count += hasZcta ? 1 : 0;
  accumulator.record_nonpolygon_count += hasZcta ? 0 : 1;
}

function claims() {
  return {
    source_defined_active_directory_cohort: true,
    establishment_records_additive_across_geographies: true,
    unique_business: false,
    current_operation_beyond_source: false,
    physical_public_access: false,
    all_food_businesses: false,
    all_businesses: false,
    nationwide_business_completeness: false,
    current_usps_validity: null,
    coordinates_exported: false,
    additive_to_generic_totals: false,
  };
}

async function contracts() {
  const result = {};
  for (const relative of CONTRACT_PATHS) result[relative] = sha(await stable(path.join(APP_ROOT, relative), 2_000_000));
  return result;
}

async function replay(sourcePointer, geographyPointer, signal) {
  cancelled(signal);
  const source = await pointer(sourcePointer, 'fsis-active-mpi-establishments', SOURCE_RELEASE, SOURCE_POINTER_SHA, SOURCE_MANIFEST_SHA);
  const geography = await pointer(geographyPointer, 'us-census-geography', GEOGRAPHY_RELEASE, GEOGRAPHY_POINTER_SHA, GEOGRAPHY_MANIFEST_SHA);
  await verifyFsisMpi(source.manifestPath);
  const manifest = source.manifest;
  check(manifest.source_date === SOURCE_DATE && manifest.retrieved_at === RETRIEVED_AT && manifest.source_release_id === SOURCE_RELEASE_ID && manifest.complete_current_active_directory_snapshot === true, 'source temporal envelope changed');
  check(JSON.stringify(manifest.coverage) === JSON.stringify({ source_directory_records: 7237, source_demographic_records: 7237, accepted_active_establishments: 7237, quarantined_records: 0, source_zip_codes: 4367, zip_union_records: 37859, states_and_territories: 56, activity_types: 25 }), 'source coverage changed');
  check(geography.manifest.coverage?.zctas === 33791, 'geography coverage changed');
  const releaseRoot = path.dirname(source.manifestPath);
  const byType = (type) => manifest.artifacts.filter((artifact) => artifact.artifact_type === type);
  const artifactBytes = async (artifact, maximumBytes = 100_000_000) => {
    const filename = path.resolve(releaseRoot, artifact.path);
    inside(releaseRoot, filename);
    const bytes = await stable(filename, maximumBytes);
    check(bytes.length === artifact.bytes && sha(bytes) === artifact.sha256, 'source artifact changed');
    return bytes;
  };
  const records = [];
  for (const artifact of byType('normalized-fsis-establishment-jsonl-gzip')) {
    cancelled(signal);
    const text = gunzipSync(await artifactBytes(artifact)).toString().trim();
    const partition = text ? text.split(/\r?\n/).map(JSON.parse) : [];
    check(partition.length === artifact.record_count, 'source partition count changed');
    records.push(...partition);
  }
  const sourceSummaryArtifact = byType('fsis-source-summary')[0];
  const zipArtifact = byType('fsis-zip-coverage-jsonl')[0];
  check(sourceSummaryArtifact && zipArtifact && byType('normalized-fsis-establishment-jsonl-gzip').length === 10, 'source artifact inventory changed');
  const sourceSummary = JSON.parse(await artifactBytes(sourceSummaryArtifact, 100_000));
  const zipUnionText = (await artifactBytes(zipArtifact)).toString().trim();
  const zipUnion = zipUnionText.split(/\r?\n/).map(JSON.parse);
  const national = blank();
  const jurisdictions = new Map();
  const zips = new Map();
  const identifiers = new Set();
  const activityCounts = new Map();
  const grantCounts = new Map([['egg', 0], ['meat', 0], ['poultry', 0], ['voluntary', 0]]);
  for (const record of records) {
    cancelled(signal);
    check(record.schema_version === '1.0.0' && record.source_status?.value === 'listed-in-fsis-active-mpi-directory-as-of-release' && record.source_status.source_date === SOURCE_DATE && record.observed_at === RETRIEVED_AT && record.provenance?.source_release_id === SOURCE_RELEASE_ID, 'source record semantics changed');
    check(/^[A-Z]{2}$/.test(record.address?.state) && /^\d{5}$/.test(record.address?.zip_code), 'source geography key changed');
    const identifier = record.external_identifiers?.find((item) => item.type === 'fsis_establishment_id')?.value;
    check(identifier && !identifiers.has(identifier), 'duplicate source establishment identifier');
    identifiers.add(identifier);
    if (!jurisdictions.has(record.address.state)) jurisdictions.set(record.address.state, blank());
    if (!zips.has(record.address.zip_code)) zips.set(record.address.zip_code, blank());
    add(national, record);
    add(jurisdictions.get(record.address.state), record);
    add(zips.get(record.address.zip_code), record);
    for (const activity of record.activities) activityCounts.set(activity, (activityCounts.get(activity) ?? 0) + 1);
    for (const grant of record.active_grants.active) {
      check(grantCounts.has(grant), 'source active-grant vocabulary changed');
      grantCounts.set(grant, grantCounts.get(grant) + 1);
    }
  }
  const orderedJurisdictions = [...jurisdictions.keys()].sort();
  const orderedActivities = Object.fromEntries([...activityCounts.entries()].sort(([left], [right]) => left.localeCompare(right)));
  check(records.length === 7237 && identifiers.size === 7237 && jurisdictions.size === 56 && zips.size === 4367, 'source conservation changed');
  check(JSON.stringify(sourceSummary.states_and_territories) === JSON.stringify(Object.fromEntries(orderedJurisdictions.map((code) => [code, jurisdictions.get(code).active_establishment_count]))) && JSON.stringify(sourceSummary.activities) === JSON.stringify(orderedActivities), 'source summary changed');
  check(zipUnion.length === 37859 && zipUnion.every((row, index) => /^\d{5}$/.test(row.zip_code) && (index === 0 || zipUnion[index - 1].zip_code < row.zip_code)), 'source ZIP union changed');
  const zipSet = new Set();
  for (const row of zipUnion) {
    check(!zipSet.has(row.zip_code), 'duplicate ZIP union row');
    zipSet.add(row.zip_code);
    const count = row.fsis_active_mpi_snapshot?.establishment_count;
    check(Number.isSafeInteger(count) && count >= 0 && count === (zips.get(row.zip_code)?.active_establishment_count ?? 0), 'source ZIP count changed');
    check(['2020-zcta-polygon-available', 'no-2020-zcta-polygon'].includes(row.geography?.status) && (row.geography.geoid === row.zip_code) === (row.geography.status === '2020-zcta-polygon-available'), 'source ZIP ZCTA evidence changed');
  }
  check([...zips.keys()].every((zip) => zipSet.has(zip)), 'positive source ZIP omitted from union');
  check((await stable(source.pointerPath, 100_000)).equals(source.pointerBytes) && (await stable(geography.pointerPath, 100_000)).equals(geography.pointerBytes), 'dependency pointer changed during replay');
  return { source, geography, sourceSummary, zipUnion, national, jurisdictions, zips, activityCounts: orderedActivities, grantCounts: Object.fromEntries(grantCounts), contractHashes: await contracts() };
}

function row(scope, code, accumulator) {
  return { schema_version: SCHEMA_VERSION, scope, code, ...accumulator, claims: claims() };
}

function payload(input) {
  const jurisdictions = [...input.jurisdictions.keys()].sort().map((code) => row('jurisdiction', code, input.jurisdictions.get(code)));
  const zips = input.zipUnion.map((sourceRow) => ({
    ...row('zip5', sourceRow.zip_code, input.zips.get(sourceRow.zip_code) ?? blank()),
    evidence_scope: input.zips.has(sourceRow.zip_code) ? 'positive-fsis-active-establishment-evidence' : 'denominator-only',
    zcta_membership: { status: sourceRow.geography.status, geoid: sourceRow.geography.geoid },
  }));
  const positiveWithoutZcta = zips.filter((zip) => zip.active_establishment_count > 0 && zip.zcta_membership.geoid === null).length;
  const positiveWithoutZbp = input.zipUnion.filter((zip) => zip.fsis_active_mpi_snapshot.establishment_count > 0 && zip.employer_baseline?.status !== 'published').length;
  const stateDcRows = jurisdictions.filter((item) => !TERRITORIES.has(item.code)).length;
  const summary = {
    ...row('national', null, input.national),
    dataset_id: DATASET_ID,
    contracts: input.contractHashes,
    source_date: SOURCE_DATE,
    source: { dataset_id: input.source.manifest.dataset_id, release_id: input.source.manifest.release_id, source_release_id: input.source.manifest.source_release_id, source_date: input.source.manifest.source_date, retrieved_at: input.source.manifest.retrieved_at, pointer_sha256: input.source.pointerSha256, manifest_sha256: input.source.manifestSha256 },
    geography: { dataset_id: input.geography.manifest.dataset_id, release_id: input.geography.manifest.release_id, pointer_sha256: input.geography.pointerSha256, manifest_sha256: input.geography.manifestSha256, zcta_count: input.geography.manifest.coverage.zctas },
    coverage: { source_directory_records: 7237, source_demographic_records: 7237, accepted_active_establishments: 7237, quarantined_records: 0, jurisdiction_rows: jurisdictions.length, state_dc_rows: stateDcRows, territory_rows: jurisdictions.length - stateDcRows, positive_zip5_rows: input.zips.size, zip5_union_rows: zips.length, denominator_only_zip5_rows: zips.length - input.zips.size, positive_source_zip_without_zcta: positiveWithoutZcta, active_establishment_records_without_zcta: input.national.record_nonpolygon_count, positive_source_zip_without_published_zbp: positiveWithoutZbp },
    reported_activity_counts: input.activityCounts,
    active_grant_counts: input.grantCounts,
    export_policy: 'governed-aggregate-only',
    privacy_warning: PRIVACY_WARNING,
  };
  return { summary, jurisdictions, zips };
}

function packageRelease(data) {
  const buffers = [encode(data.summary), jsonLines(data.jurisdictions), jsonLines(data.zips)];
  const definitions = [
    ['coverage-summary.json', 'national-fsis-coverage-summary-json', 1],
    ['jurisdictions.jsonl', 'national-fsis-jurisdiction-coverage-jsonl', 56],
    ['zip5-coverage.jsonl', 'national-fsis-zip5-coverage-jsonl', 37859],
  ];
  const artifacts = definitions.map((definition, index) => ({ path: definition[0], artifact_type: definition[1], record_count: definition[2], bytes: buffers[index].length, sha256: sha(buffers[index]) }));
  const releaseId = `${DATASET_ID}-${sha(Buffer.concat(buffers)).slice(0, 16)}`;
  const manifest = { schema_version: SCHEMA_VERSION, dataset_id: DATASET_ID, release_id: releaseId, status: 'published-governed-aggregate', current_pointer_written: true, production_enrollment: false, source_actions_performed: 0, network_requests_performed: 0, additive_to_generic_totals: false, export_policy: 'governed-aggregate-only', contracts: data.summary.contracts, source: data.summary.source, geography: data.summary.geography, coverage: data.summary.coverage, claims: data.summary.claims, privacy_warning: PRIVACY_WARNING, artifacts };
  return { buffers, manifest };
}

function forbidden(value) {
  const banned = new Set(['name', 'other_names', 'address', 'street', 'telephone', 'location', 'coordinates', 'geometry', 'external_identifiers', 'establishment_id', 'establishment_number', 'normalized_record_id', 'source_record_id', 'duns_number']);
  const walk = (item) => {
    if (Array.isArray(item)) return item.forEach(walk);
    if (item && typeof item === 'object') for (const [key, nested] of Object.entries(item)) { check(!banned.has(key.toLowerCase()), `forbidden field ${key}`); walk(nested); }
  };
  walk(value);
}

function validateRow(value, scope) {
  const base = ['schema_version', 'scope', 'code', 'active_establishment_count', 'reported_zip4_count', 'retained_coordinate_count', 'missing_coordinate_count', 'record_zcta_count', 'record_nonpolygon_count', 'claims'];
  if (scope !== 'national') exactKeys(value, scope === 'zip5' ? [...base, 'evidence_scope', 'zcta_membership'] : base, `${scope} row`);
  exactKeys(value.claims, Object.keys(claims()), 'claims');
  check(value.schema_version === SCHEMA_VERSION && value.scope === scope && Number.isSafeInteger(value.active_establishment_count) && value.active_establishment_count >= 0 && value.active_establishment_count === value.retained_coordinate_count + value.missing_coordinate_count && value.active_establishment_count === value.record_zcta_count + value.record_nonpolygon_count && JSON.stringify(value.claims) === JSON.stringify(claims()), `${scope} semantics changed`);
  if (scope === 'jurisdiction') check(/^[A-Z]{2}$/.test(value.code), 'jurisdiction code changed');
  if (scope === 'zip5') {
    exactKeys(value.zcta_membership, ['status', 'geoid'], 'ZCTA membership');
    check(/^\d{5}$/.test(value.code) && ['positive-fsis-active-establishment-evidence', 'denominator-only'].includes(value.evidence_scope) && (value.zcta_membership.geoid === value.code) === (value.zcta_membership.status === '2020-zcta-polygon-available'), 'ZIP semantics changed');
  }
}

function validate(manifest, summary, jurisdictions, zips) {
  exactKeys(manifest, ['schema_version', 'dataset_id', 'release_id', 'status', 'current_pointer_written', 'production_enrollment', 'source_actions_performed', 'network_requests_performed', 'additive_to_generic_totals', 'export_policy', 'contracts', 'source', 'geography', 'coverage', 'claims', 'privacy_warning', 'artifacts'], 'manifest');
  const base = ['schema_version', 'scope', 'code', 'active_establishment_count', 'reported_zip4_count', 'retained_coordinate_count', 'missing_coordinate_count', 'record_zcta_count', 'record_nonpolygon_count', 'claims'];
  exactKeys(summary, [...base, 'dataset_id', 'contracts', 'source_date', 'source', 'geography', 'coverage', 'reported_activity_counts', 'active_grant_counts', 'export_policy', 'privacy_warning'], 'summary');
  validateRow(summary, 'national');
  jurisdictions.forEach((item) => validateRow(item, 'jurisdiction'));
  zips.forEach((item) => validateRow(item, 'zip5'));
  check(jurisdictions.length === 56 && zips.length === 37859 && zips.every((item, index) => index === 0 || zips[index - 1].code < item.code), 'coverage row ordering changed');
  for (const key of ['active_establishment_count', 'reported_zip4_count', 'retained_coordinate_count', 'missing_coordinate_count', 'record_zcta_count', 'record_nonpolygon_count']) {
    check(jurisdictions.reduce((total, item) => total + item[key], 0) === summary[key] && zips.reduce((total, item) => total + item[key], 0) === summary[key], `${key} conservation failed`);
  }
  const expectedCoverage = { source_directory_records: 7237, source_demographic_records: 7237, accepted_active_establishments: 7237, quarantined_records: 0, jurisdiction_rows: 56, state_dc_rows: 51, territory_rows: 5, positive_zip5_rows: 4367, zip5_union_rows: 37859, denominator_only_zip5_rows: 33492, positive_source_zip_without_zcta: 72, active_establishment_records_without_zcta: 85, positive_source_zip_without_published_zbp: 100 };
  check(summary.active_establishment_count === 7237 && summary.reported_zip4_count === 113 && summary.retained_coordinate_count === 7237 && summary.missing_coordinate_count === 0 && summary.record_zcta_count === 7152 && summary.record_nonpolygon_count === 85 && JSON.stringify(summary.coverage) === JSON.stringify(expectedCoverage), 'national counts changed');
  check(JSON.stringify(summary.active_grant_counts) === JSON.stringify({ egg: 102, meat: 5688, poultry: 4546, voluntary: 2105 }) && Object.keys(summary.reported_activity_counts).length === 25, 'source classifications changed');
  check(summary.source_date === SOURCE_DATE && summary.source.release_id === SOURCE_RELEASE && summary.source.source_release_id === SOURCE_RELEASE_ID && summary.source.retrieved_at === RETRIEVED_AT && summary.geography.release_id === GEOGRAPHY_RELEASE, 'provenance changed');
  check(JSON.stringify(manifest.contracts) === JSON.stringify(summary.contracts) && JSON.stringify(manifest.source) === JSON.stringify(summary.source) && JSON.stringify(manifest.geography) === JSON.stringify(summary.geography) && JSON.stringify(manifest.coverage) === JSON.stringify(summary.coverage) && JSON.stringify(manifest.claims) === JSON.stringify(summary.claims) && manifest.status === 'published-governed-aggregate' && manifest.current_pointer_written === true && manifest.production_enrollment === false && manifest.source_actions_performed === 0 && manifest.network_requests_performed === 0 && manifest.additive_to_generic_totals === false && manifest.export_policy === 'governed-aggregate-only' && manifest.privacy_warning === PRIVACY_WARNING, 'manifest authority changed');
  forbidden({ manifest, summary, jurisdictions, zips });
}

export async function verifyNationalFsisActiveEstablishmentCoverage(manifestPath, { expectedManifestSha256, allowStaging = false } = {}) {
  manifestPath = path.resolve(manifestPath);
  const directory = path.dirname(manifestPath);
  inside(path.join(APP_ROOT, 'data'), directory);
  check(await realpath(directory) === directory && await realpath(manifestPath) === manifestPath, 'release ancestry redirected');
  const manifestBytes = await stable(manifestPath, 2_000_000);
  const manifest = JSON.parse(manifestBytes);
  const manifestSha256 = sha(manifestBytes);
  if (expectedManifestSha256) check(manifestSha256 === expectedManifestSha256, 'manifest hash changed');
  const names = await readdir(directory, { withFileTypes: true });
  check(names.length === 4 && names.every((entry) => entry.isFile() && !entry.isSymbolicLink()) && JSON.stringify(names.map((entry) => entry.name).sort()) === JSON.stringify(['coverage-summary.json', 'jurisdictions.jsonl', 'manifest.json', 'zip5-coverage.jsonl']), 'release inventory changed');
  const definitions = [
    ['coverage-summary.json', 'national-fsis-coverage-summary-json', 1],
    ['jurisdictions.jsonl', 'national-fsis-jurisdiction-coverage-jsonl', 56],
    ['zip5-coverage.jsonl', 'national-fsis-zip5-coverage-jsonl', 37859],
  ];
  check(Array.isArray(manifest.artifacts) && manifest.artifacts.length === 3, 'artifact inventory changed');
  const loaded = {};
  for (let index = 0; index < definitions.length; index += 1) {
    const artifact = manifest.artifacts[index];
    const definition = definitions[index];
    exactKeys(artifact, ['path', 'artifact_type', 'record_count', 'bytes', 'sha256'], 'artifact');
    check(artifact.path === definition[0] && artifact.artifact_type === definition[1] && artifact.record_count === definition[2] && Number.isSafeInteger(artifact.bytes) && artifact.bytes >= 0 && /^[a-f0-9]{64}$/.test(artifact.sha256), 'artifact metadata changed');
    const filename = path.resolve(directory, artifact.path);
    inside(directory, filename);
    const bytes = await stable(filename);
    check(bytes.length === artifact.bytes && sha(bytes) === artifact.sha256, 'artifact bytes changed');
    loaded[artifact.path] = bytes;
  }
  const parseLines = (bytes) => bytes.toString().trim().split(/\r?\n/).map(JSON.parse);
  const summary = JSON.parse(loaded['coverage-summary.json']);
  const jurisdictions = parseLines(loaded['jurisdictions.jsonl']);
  const zips = parseLines(loaded['zip5-coverage.jsonl']);
  validate(manifest, summary, jurisdictions, zips);
  const releaseId = `${DATASET_ID}-${sha(Buffer.concat([loaded['coverage-summary.json'], loaded['jurisdictions.jsonl'], loaded['zip5-coverage.jsonl']])).slice(0, 16)}`;
  check(manifest.release_id === releaseId && (allowStaging || path.basename(directory) === manifest.release_id), 'release identity changed');
  const expected = payload(await replay(SOURCE_POINTER, GEOGRAPHY_POINTER));
  check(JSON.stringify(summary) === JSON.stringify(expected.summary) && JSON.stringify(jurisdictions) === JSON.stringify(expected.jurisdictions) && JSON.stringify(zips) === JSON.stringify(expected.zips), 'release no longer replays from exact retained evidence');
  return { manifest, manifestSha256, releaseDirectory: directory, coverage: manifest.coverage, summary, jurisdictions, zips };
}

async function cleanupOrAggregate(cleanup, primary, message) {
  try { await cleanup(); } catch (error) { if (primary) throw new AggregateError([primary, error], message); throw error; }
}

async function publishPointer(root, manifest, manifestSha256, hooks = {}) {
  check(sha(encode(manifest)) === manifestSha256, 'manifest hash changed');
  const target = path.join(root, 'current.json');
  const temporary = `${target}.tmp-${randomUUID()}`;
  const backup = `${target}.rollback-${randomUUID()}`;
  const lock = path.join(root, '.current-publish-lock');
  const next = encode({ dataset_id: DATASET_ID, release_id: manifest.release_id, status: manifest.status, manifest: `releases/${manifest.release_id}/manifest.json`, manifest_sha256: manifestSha256 });
  await mkdir(lock);
  let prior = null;
  let moved = false;
  let installed = false;
  let primary = null;
  try {
    try { prior = await stable(target, 100_000); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await writeFile(temporary, next, { flag: 'wx' });
    if (prior) {
      check((await stable(target, 100_000)).equals(prior), 'pointer changed during CAS');
      await hooks.afterCompare?.({ target, prior });
      check((await stable(target, 100_000)).equals(prior), 'pointer changed after compare during CAS');
      await rename(target, backup);
      moved = true;
      check((await stable(backup, 100_000)).equals(prior), 'backup identity changed');
      await hooks.afterOldMove?.({ target, backup, prior });
    } else {
      await hooks.afterCompare?.({ target, prior });
      try { await lstat(target); fail('pointer appeared during CAS'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    try { await link(temporary, target); } catch (error) { if (error.code === 'EEXIST') fail('pointer appeared before atomic install'); throw error; }
    installed = true;
    await rm(temporary);
    await hooks.afterNewInstall?.({ target, prior });
    check((await stable(target, 100_000)).equals(next), 'pointer replaced after atomic install');
    if (moved) await rm(backup);
  } catch (error) {
    primary = error;
    try {
      await hooks.beforeRollbackCleanup?.({ target, backup, installed });
      await rm(temporary, { force: true });
      if (moved) {
        await hooks.beforeRollbackRestore?.({ target, backup, installed, prior });
        try { await link(backup, target); } catch (restoreError) { if (restoreError.code !== 'EEXIST') throw restoreError; }
        await rm(backup, { force: true });
      }
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'pointer rollback or cleanup failed');
    }
    throw error;
  } finally {
    await cleanupOrAggregate(() => rmdir(lock).catch((error) => { if (error.code !== 'ENOENT') throw error; }), primary, 'pointer lock cleanup failed');
  }
}

export const publishNationalFsisActiveEstablishmentCoveragePointerForTest = publishPointer;

async function validateOutputRoot(outputRoot) {
  const dataRoot = path.join(APP_ROOT, 'data');
  const resolved = path.resolve(outputRoot);
  inside(dataRoot, resolved);
  let cursor = dataRoot;
  const relative = path.relative(dataRoot, resolved).split(path.sep);
  for (const segment of relative) {
    cursor = path.join(cursor, segment);
    try {
      const entry = await lstat(cursor);
      check(entry.isDirectory() && !entry.isSymbolicLink() && await realpath(cursor) === cursor, 'output ancestry redirected');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      break;
    }
  }
  await mkdir(resolved, { recursive: true });
  check(await realpath(resolved) === resolved, 'output ancestry redirected');
  return resolved;
}

async function existingCanonicalDirectory(directory, label) {
  try {
    const identity = await lstat(directory);
    check(identity.isDirectory() && !identity.isSymbolicLink() && await realpath(directory) === directory, `${label} ancestry redirected`);
    return identity;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function removeOwnedDirectory(directory, identity) {
  const current = await lstat(directory);
  check(current.isDirectory() && !current.isSymbolicLink() && current.dev === identity.dev && current.ino === identity.ino && await realpath(directory) === directory, 'installed release ownership changed');
  await rm(directory, { recursive: true });
}

export async function buildNationalFsisActiveEstablishmentCoverage({ sourcePointer = SOURCE_POINTER, geographyPointer = GEOGRAPHY_POINTER, outputRoot = OUTPUT_ROOT, signal, hooks = {} } = {}) {
  outputRoot = await validateOutputRoot(outputRoot);
  cancelled(signal);
  const input = await replay(sourcePointer, geographyPointer, signal);
  const data = payload(input);
  const packaged = packageRelease(data);
  const manifestBytes = encode(packaged.manifest);
  const manifestSha256 = sha(manifestBytes);
  await hooks.beforeStaging?.();
  cancelled(signal);
  const stagingRoot = path.join(outputRoot, '.staging');
  const staging = path.join(stagingRoot, randomUUID());
  await mkdir(stagingRoot, { recursive: true });
  check(await realpath(stagingRoot) === stagingRoot, 'staging ancestry redirected');
  await mkdir(staging);
  check(await realpath(staging) === staging, 'staging ancestry redirected');
  let releaseLock = null;
  try {
    for (let index = 0; index < packaged.manifest.artifacts.length; index += 1) {
      await writeFile(path.join(staging, packaged.manifest.artifacts[index].path), packaged.buffers[index], { flag: 'wx' });
      if (index === 0) await hooks.betweenWrites?.();
      cancelled(signal);
    }
    await writeFile(path.join(staging, 'manifest.json'), manifestBytes, { flag: 'wx' });
    await verifyNationalFsisActiveEstablishmentCoverage(path.join(staging, 'manifest.json'), { expectedManifestSha256: manifestSha256, allowStaging: true });
    await hooks.afterVerification?.({ staging, manifest: packaged.manifest, manifestSha256 });
    cancelled(signal);
    const releases = path.join(outputRoot, 'releases');
    await mkdir(releases, { recursive: true });
    check(await realpath(releases) === releases, 'release ancestry redirected');
    const release = path.join(releases, packaged.manifest.release_id);
    const candidateReleaseLock = `${release}.publish-lock`;
    try { await mkdir(candidateReleaseLock); } catch (error) { if (error.code === 'EEXIST') fail('release publication locked'); throw error; }
    releaseLock = candidateReleaseLock;
    check(await realpath(releaseLock) === releaseLock, 'release lock ancestry redirected');
    let installed;
    let installedByThisRun = false;
    let installedIdentity = null;
    try {
      const existing = await existingCanonicalDirectory(release, 'release');
      if (existing) {
        installed = await verifyNationalFsisActiveEstablishmentCoverage(path.join(release, 'manifest.json'), { expectedManifestSha256: manifestSha256 });
        check(installed.manifest.release_id === packaged.manifest.release_id, 'existing release differs');
        await rm(staging, { recursive: true, force: true });
      } else {
        try {
          await rename(staging, release);
          installedByThisRun = true;
          installedIdentity = await existingCanonicalDirectory(release, 'release');
          check(installedIdentity, 'installed release is unavailable');
        } catch (error) {
          if (!['EEXIST', 'ENOTEMPTY', 'EPERM'].includes(error.code)) throw error;
          const raced = await existingCanonicalDirectory(release, 'release');
          if (!raced) throw error;
          installed = await verifyNationalFsisActiveEstablishmentCoverage(path.join(release, 'manifest.json'), { expectedManifestSha256: manifestSha256 });
          check(installed.manifest.release_id === packaged.manifest.release_id, 'existing release differs');
          await rm(staging, { recursive: true, force: true });
        }
      }
      try {
        await hooks.afterReleaseInstall?.({ release, manifest: packaged.manifest, manifestSha256 });
        installed = await verifyNationalFsisActiveEstablishmentCoverage(path.join(release, 'manifest.json'), { expectedManifestSha256: manifestSha256 });
        await hooks.beforePointerCas?.({ release, manifest: installed.manifest, manifestSha256: installed.manifestSha256 });
        cancelled(signal);
        installed = await verifyNationalFsisActiveEstablishmentCoverage(path.join(release, 'manifest.json'), { expectedManifestSha256: manifestSha256 });
      } catch (error) {
        if (installedByThisRun) await removeOwnedDirectory(release, installedIdentity);
        throw error;
      }
      await publishPointer(outputRoot, installed.manifest, installed.manifestSha256, hooks);
      return { manifest: installed.manifest, manifestSha256: installed.manifestSha256, releaseDirectory: installed.releaseDirectory, pointerPath: path.join(outputRoot, 'current.json'), coverage: installed.coverage };
    } finally {
      await rmdir(releaseLock);
      releaseLock = null;
    }
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    if (releaseLock) await rmdir(releaseLock).catch(() => {});
    throw error;
  } finally {
    await rmdir(stagingRoot).catch((error) => { if (error.code !== 'ENOENT' && error.code !== 'ENOTEMPTY') throw error; });
  }
}

export async function readNationalFsisActiveEstablishmentCoverage({ pointerPath = path.join(OUTPUT_ROOT, 'current.json'), hooks = {} } = {}) {
  const pointerBytes = await stable(pointerPath, 100_000);
  const pointerValue = JSON.parse(pointerBytes);
  check(pointerValue.dataset_id === DATASET_ID && pointerValue.status === 'published-governed-aggregate' && /^[a-f0-9]{64}$/.test(pointerValue.manifest_sha256), 'coverage pointer changed');
  const manifestPath = path.resolve(path.dirname(pointerPath), pointerValue.manifest);
  inside(path.dirname(pointerPath), manifestPath);
  const verified = await verifyNationalFsisActiveEstablishmentCoverage(manifestPath, { expectedManifestSha256: pointerValue.manifest_sha256 });
  check(verified.manifest.release_id === pointerValue.release_id, 'coverage pointer release changed');
  await hooks.afterVerification?.({ pointerPath, manifestPath, verified });
  check((await stable(pointerPath, 100_000)).equals(pointerBytes), 'coverage pointer changed during read');
  return { verified: { manifest: verified.manifest, manifestSha256: verified.manifestSha256, releaseDirectory: verified.releaseDirectory, coverage: verified.coverage, pointerSha256: sha(pointerBytes), source_date: verified.summary.source_date, retrieved_at: verified.summary.source.retrieved_at }, summary: verified.summary, jurisdictions: verified.jurisdictions, zips: verified.zips };
}

export async function lookupNationalFsisActiveEstablishmentZip5(zip5, options = {}) {
  check(/^\d{5}$/.test(zip5 ?? ''), 'ZIP5 must contain exactly five digits');
  const coverage = await readNationalFsisActiveEstablishmentCoverage(options);
  const rowValue = coverage.zips.find((item) => item.code === zip5) ?? null;
  return { verified: coverage.verified, row: rowValue };
}

export async function verifyNationalFsisActiveEstablishmentCoverageCurrent(options = {}) {
  const coverage = await readNationalFsisActiveEstablishmentCoverage(options);
  return { ...coverage.verified, coverage: coverage.summary.coverage };
}
