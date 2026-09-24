import { createHash, randomUUID } from 'node:crypto';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { link, lstat, mkdir, open, readdir, realpath, rename, rm, rmdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { APP_ROOT } from './paths.mjs';
import { verifyIrsEoBmf } from './irs-eo-bmf.mjs';

const DATASET_ID = 'national-irs-eo-bmf-organization-coverage';
const SCHEMA_VERSION = `${DATASET_ID}@1.0.0`;
const SOURCE_POINTER = path.join(APP_ROOT, 'data/business-sources/irs-eo-bmf-organizations/current.json');
const GEOGRAPHY_POINTER = path.join(APP_ROOT, 'data/geography/current.json');
const OUTPUT_ROOT = path.join(APP_ROOT, `data/${DATASET_ID}`);
const SOURCE_RELEASE = 'irs-eo-bmf-20260903-003447217Z-565da6cd';
const SOURCE_MANIFEST_SHA = '999233d73e42eac72a094d1248d6790680d39d276c3a9e849a496d01ed5288f8';
const SOURCE_POINTER_SHA = '799f3dab2080f40225f2f41c830b433d721eea647e8981e65eca387e23c85148';
const GEOGRAPHY_RELEASE = 'us-census-geography-20260830-132803990Z-3629abc0';
const GEOGRAPHY_MANIFEST_SHA = '5426cae150c0fba64f8ff43a48ca39c4e78b5b4ba8a8007fbd211615540d1c8b';
const GEOGRAPHY_POINTER_SHA = '5f89350482630a7d2e888772512aca36fdd21f68c8d3f01f1113dc6c2c400403';
const SOURCE_DATE = '2026-08-11';
const RETRIEVED_AT = '2026-09-03T00:34:47.217Z';
const SOURCE_RELEASE_ID = 'irs-eo-bmf-2026-08-11-d272cdb9c6c4afef';
const TERRITORIES = new Set(['AS', 'GU', 'MP', 'PR', 'VI']);
const CONTRACT_PATHS = [
  'config/connectors/national-irs-eo-bmf-organization-coverage.json',
  'config/datasets/national-irs-eo-bmf-organization-coverage.json',
  'config/schemas/national-irs-eo-bmf-organization-coverage.schema.json',
  'config/source-policies/national-irs-eo-bmf-organization-coverage.json',
];
const PRIVACY_WARNING = 'Aggregate counts exclude names, filing addresses, EINs, source record identifiers, tax-profile details, raw records, and quarantine records.';
const runtimeMetrics = { sourceReplayCount: 0, runtimeLoadCount: 0, runtimeCacheHitCount: 0 };
let runtimeCache = null;

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
  return { organization_count: 0, reported_zip4_count: 0, record_zcta_count: 0, record_nonpolygon_count: 0, exempt_status_01_count: 0, exempt_status_02_count: 0, exempt_status_12_count: 0, exempt_status_25_count: 0 };
}

function add(accumulator, record) {
  accumulator.organization_count += 1;
  accumulator.reported_zip4_count += record.reported_filing_address.zip4 ? 1 : 0;
  const hasZcta = record.geography.zcta_geoid === record.reported_filing_address.zip_code;
  accumulator.record_zcta_count += hasZcta ? 1 : 0;
  accumulator.record_nonpolygon_count += hasZcta ? 0 : 1;
  accumulator[`exempt_status_${record.tax_exempt_profile.exempt_status.code}_count`] += 1;
}

function claims() {
  return {
    source_current_extract_organization_cohort: true,
    organization_records_additive_across_geographies: true,
    exempt_status_counts_mutually_exclusive: true,
    unique_business: false,
    current_operation_beyond_source: false,
    verified_physical_site: false,
    all_tax_exempt_organizations: false,
    all_nonprofits: false,
    all_businesses: false,
    usable_premise_geocodes: false,
    nationwide_business_completeness: false,
    current_usps_validity: null,
    filing_addresses_exported: false,
    eins_exported: false,
    additive_to_generic_totals: false,
  };
}

async function contracts() {
  const result = {};
  for (const relative of CONTRACT_PATHS) result[relative] = sha(await stable(path.join(APP_ROOT, relative), 2_000_000));
  return result;
}

async function replay(sourcePointer, geographyPointer, signal) {
  runtimeMetrics.sourceReplayCount += 1;
  cancelled(signal);
  const source = await pointer(sourcePointer, 'irs-eo-bmf-organizations', SOURCE_RELEASE, SOURCE_POINTER_SHA, SOURCE_MANIFEST_SHA);
  const geography = await pointer(geographyPointer, 'us-census-geography', GEOGRAPHY_RELEASE, GEOGRAPHY_POINTER_SHA, GEOGRAPHY_MANIFEST_SHA);
  await verifyIrsEoBmf(source.manifestPath);
  const manifest = source.manifest;
  check(manifest.source_posting_date === SOURCE_DATE && manifest.retrieved_at === RETRIEVED_AT && manifest.source_release_id === SOURCE_RELEASE_ID && manifest.complete_current_eo_bmf_snapshot === true, 'source temporal envelope changed');
  check(JSON.stringify(manifest.coverage) === JSON.stringify({ source_records: 1957340, source_page_claimed_records: 1957340, accepted_current_exempt_organizations: 1955841, excluded_outside_supported_us_scope: 1498, quarantined_records: 1, source_zip_codes: 36950, zip_union_records: 39217, states_and_territories: 56, unknown_ruling_date_000000_records: 11547, unknown_accounting_period_00_records: 52 }), 'source coverage changed');
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
  const organizationArtifacts = byType('normalized-irs-eo-organization-jsonl-gzip');
  const sourceSummaryArtifact = byType('irs-eo-bmf-source-summary')[0];
  const zipArtifact = byType('irs-eo-bmf-zip-coverage-jsonl')[0];
  check(sourceSummaryArtifact && zipArtifact && organizationArtifacts.length === 10, 'source artifact inventory changed');
  const sourceSummary = JSON.parse(await artifactBytes(sourceSummaryArtifact, 100_000));
  const zipUnionText = (await artifactBytes(zipArtifact)).toString().trim();
  const zipUnion = zipUnionText.split(/\r?\n/).map(JSON.parse);
  const national = blank();
  const jurisdictions = new Map();
  const zips = new Map();
  let recordCount = 0;
  for (const artifact of organizationArtifacts) {
    cancelled(signal);
    const bytes = await artifactBytes(artifact);
    const lines = createInterface({ input: Readable.from([bytes]).pipe(createGunzip()), crlfDelay: Infinity });
    let partitionCount = 0;
    for await (const line of lines) {
      if (!line) continue;
      partitionCount += 1;
      const record = JSON.parse(line);
      recordCount += 1;
      check(record.schema_version === '1.0.0' && record.source_status?.value === 'listed-in-current-irs-eo-bmf-extract-as-of-source-posting' && record.source_status.source_posting_date === SOURCE_DATE && record.observed_at === RETRIEVED_AT && record.provenance?.source_release_id === SOURCE_RELEASE_ID, 'source record semantics changed');
      check(/^[A-Z]{2}$/.test(record.reported_filing_address?.state) && /^\d{5}$/.test(record.reported_filing_address?.zip_code) && /^\d{4}$/.test(record.reported_filing_address?.zip4), 'source geography key changed');
      check(['01', '02', '12', '25'].includes(record.tax_exempt_profile?.exempt_status?.code), 'source exempt status changed');
      check(['2020-zcta-polygon-available', 'no-2020-zcta-polygon'].includes(record.geography?.zcta_match_status), 'source ZCTA evidence changed');
      const state = record.reported_filing_address.state;
      const zip = record.reported_filing_address.zip_code;
      if (!jurisdictions.has(state)) jurisdictions.set(state, blank());
      if (!zips.has(zip)) zips.set(zip, blank());
      add(national, record);
      add(jurisdictions.get(state), record);
      add(zips.get(zip), record);
      if (recordCount % 10_000 === 0) cancelled(signal);
    }
    check(partitionCount === artifact.record_count, 'source partition count changed');
  }
  const orderedJurisdictions = [...jurisdictions.keys()].sort();
  check(recordCount === 1955841 && jurisdictions.size === 56 && zips.size === 36950, 'source conservation changed');
  check(JSON.stringify(sourceSummary.states_and_territories) === JSON.stringify(Object.fromEntries(orderedJurisdictions.map((code) => [code, jurisdictions.get(code).organization_count]))) && JSON.stringify(sourceSummary.exempt_status_codes) === JSON.stringify({ '12': national.exempt_status_12_count, '25': national.exempt_status_25_count, '01': national.exempt_status_01_count, '02': national.exempt_status_02_count }), 'source summary changed');
  check(zipUnion.length === 39217 && zipUnion.every((row, index) => /^\d{5}$/.test(row.zip_code) && (index === 0 || zipUnion[index - 1].zip_code < row.zip_code)), 'source ZIP union changed');
  const zipSet = new Set();
  for (const row of zipUnion) {
    check(!zipSet.has(row.zip_code), 'duplicate ZIP union row');
    zipSet.add(row.zip_code);
    const count = row.irs_eo_bmf_current_snapshot?.organization_filing_address_count;
    check(Number.isSafeInteger(count) && count >= 0 && count === (zips.get(row.zip_code)?.organization_count ?? 0), 'source ZIP count changed');
    check(['2020-zcta-polygon-available', 'no-2020-zcta-polygon'].includes(row.geography?.status) && (row.geography.geoid === row.zip_code) === (row.geography.status === '2020-zcta-polygon-available'), 'source ZIP ZCTA evidence changed');
  }
  check([...zips.keys()].every((zip) => zipSet.has(zip)), 'positive source ZIP omitted from union');
  check((await stable(source.pointerPath, 100_000)).equals(source.pointerBytes) && (await stable(geography.pointerPath, 100_000)).equals(geography.pointerBytes), 'dependency pointer changed during replay');
  return { source, geography, sourceSummary, zipUnion, national, jurisdictions, zips, contractHashes: await contracts() };
}

function row(scope, code, accumulator) {
  return { schema_version: SCHEMA_VERSION, scope, code, ...accumulator, claims: claims() };
}

function payload(input) {
  const jurisdictions = [...input.jurisdictions.keys()].sort().map((code) => row('jurisdiction', code, input.jurisdictions.get(code)));
  const zips = input.zipUnion.map((sourceRow) => ({
    ...row('zip5', sourceRow.zip_code, input.zips.get(sourceRow.zip_code) ?? blank()),
    evidence_scope: input.zips.has(sourceRow.zip_code) ? 'positive-irs-eo-bmf-organization-filing-address-evidence' : 'denominator-only',
    zcta_membership: { status: sourceRow.geography.status, geoid: sourceRow.geography.geoid },
  }));
  const positiveWithoutZcta = zips.filter((zip) => zip.organization_count > 0 && zip.zcta_membership.geoid === null).length;
  const positiveWithoutZbp = input.zipUnion.filter((zip) => zip.irs_eo_bmf_current_snapshot.organization_filing_address_count > 0 && zip.employer_baseline?.status !== 'published').length;
  const stateDcRows = jurisdictions.filter((item) => !TERRITORIES.has(item.code)).length;
  const summary = {
    ...row('national', null, input.national),
    dataset_id: DATASET_ID,
    contracts: input.contractHashes,
    source_date: SOURCE_DATE,
    source: { dataset_id: input.source.manifest.dataset_id, release_id: input.source.manifest.release_id, source_release_id: input.source.manifest.source_release_id, source_date: SOURCE_DATE, retrieved_at: input.source.manifest.retrieved_at, pointer_sha256: input.source.pointerSha256, manifest_sha256: input.source.manifestSha256 },
    geography: { dataset_id: input.geography.manifest.dataset_id, release_id: input.geography.manifest.release_id, pointer_sha256: input.geography.pointerSha256, manifest_sha256: input.geography.manifestSha256, zcta_count: input.geography.manifest.coverage.zctas },
    coverage: { source_records: 1957340, source_page_claimed_records: 1957340, accepted_current_exempt_organizations: 1955841, excluded_outside_supported_us_scope: 1498, quarantined_records: 1, jurisdiction_rows: jurisdictions.length, state_dc_rows: stateDcRows, territory_rows: jurisdictions.length - stateDcRows, positive_zip5_rows: input.zips.size, zip5_union_rows: zips.length, denominator_only_zip5_rows: zips.length - input.zips.size, positive_source_zip_without_zcta: positiveWithoutZcta, organization_records_without_zcta: input.national.record_nonpolygon_count, positive_source_zip_without_published_zbp: positiveWithoutZbp },
    quarantine_reasons: input.sourceSummary.quarantine_reasons,
    export_policy: 'governed-aggregate-only',
    privacy_warning: PRIVACY_WARNING,
  };
  return { summary, jurisdictions, zips };
}

function packageRelease(data) {
  const buffers = [encode(data.summary), jsonLines(data.jurisdictions), jsonLines(data.zips)];
  const definitions = [
    ['coverage-summary.json', 'national-irs-eo-bmf-coverage-summary-json', 1],
    ['jurisdictions.jsonl', 'national-irs-eo-bmf-jurisdiction-coverage-jsonl', 56],
    ['zip5-coverage.jsonl', 'national-irs-eo-bmf-zip5-coverage-jsonl', 39217],
  ];
  const artifacts = definitions.map((definition, index) => ({ path: definition[0], artifact_type: definition[1], record_count: definition[2], bytes: buffers[index].length, sha256: sha(buffers[index]) }));
  const releaseId = `${DATASET_ID}-${sha(Buffer.concat(buffers)).slice(0, 16)}`;
  const manifest = { schema_version: SCHEMA_VERSION, dataset_id: DATASET_ID, release_id: releaseId, status: 'published-governed-aggregate', current_pointer_written: true, production_enrollment: false, source_actions_performed: 0, network_requests_performed: 0, additive_to_generic_totals: false, export_policy: 'governed-aggregate-only', contracts: data.summary.contracts, source: data.summary.source, geography: data.summary.geography, coverage: data.summary.coverage, claims: data.summary.claims, privacy_warning: PRIVACY_WARNING, artifacts };
  return { buffers, manifest };
}

function forbidden(value) {
  const banned = new Set(['name', 'address', 'filing_address', 'reported_filing_address', 'street', 'telephone', 'location', 'coordinates', 'geometry', 'external_identifiers', 'ein', 'group_exemption_number', 'tax_exempt_profile', 'normalized_record_id', 'source_record_id', 'url', 'quarantine_record']);
  const walk = (item) => {
    if (Array.isArray(item)) return item.forEach(walk);
    if (item && typeof item === 'object') for (const [key, nested] of Object.entries(item)) { check(!banned.has(key.toLowerCase()), `forbidden field ${key}`); walk(nested); }
  };
  walk(value);
}

function validateRow(value, scope) {
  const base = ['schema_version', 'scope', 'code', 'organization_count', 'reported_zip4_count', 'record_zcta_count', 'record_nonpolygon_count', 'exempt_status_01_count', 'exempt_status_02_count', 'exempt_status_12_count', 'exempt_status_25_count', 'claims'];
  if (scope !== 'national') exactKeys(value, scope === 'zip5' ? [...base, 'evidence_scope', 'zcta_membership'] : base, `${scope} row`);
  exactKeys(value.claims, Object.keys(claims()), 'claims');
  const countKeys = base.filter((key) => key.endsWith('_count'));
  check(value.schema_version === SCHEMA_VERSION && value.scope === scope && countKeys.every((key) => Number.isSafeInteger(value[key]) && value[key] >= 0) && value.organization_count === value.record_zcta_count + value.record_nonpolygon_count && value.reported_zip4_count <= value.organization_count && value.organization_count === value.exempt_status_01_count + value.exempt_status_02_count + value.exempt_status_12_count + value.exempt_status_25_count && JSON.stringify(value.claims) === JSON.stringify(claims()), `${scope} semantics changed`);
  if (scope === 'jurisdiction') check(/^[A-Z]{2}$/.test(value.code), 'jurisdiction code changed');
  if (scope === 'zip5') {
    exactKeys(value.zcta_membership, ['status', 'geoid'], 'ZCTA membership');
    check(/^\d{5}$/.test(value.code) && ['positive-irs-eo-bmf-organization-filing-address-evidence', 'denominator-only'].includes(value.evidence_scope) && (value.zcta_membership.geoid === value.code) === (value.zcta_membership.status === '2020-zcta-polygon-available'), 'ZIP semantics changed');
  }
}

function validate(manifest, summary, jurisdictions, zips) {
  exactKeys(manifest, ['schema_version', 'dataset_id', 'release_id', 'status', 'current_pointer_written', 'production_enrollment', 'source_actions_performed', 'network_requests_performed', 'additive_to_generic_totals', 'export_policy', 'contracts', 'source', 'geography', 'coverage', 'claims', 'privacy_warning', 'artifacts'], 'manifest');
  const base = ['schema_version', 'scope', 'code', 'organization_count', 'reported_zip4_count', 'record_zcta_count', 'record_nonpolygon_count', 'exempt_status_01_count', 'exempt_status_02_count', 'exempt_status_12_count', 'exempt_status_25_count', 'claims'];
  exactKeys(summary, [...base, 'dataset_id', 'contracts', 'source_date', 'source', 'geography', 'coverage', 'quarantine_reasons', 'export_policy', 'privacy_warning'], 'summary');
  validateRow(summary, 'national');
  jurisdictions.forEach((item) => validateRow(item, 'jurisdiction'));
  zips.forEach((item) => validateRow(item, 'zip5'));
  check(jurisdictions.length === 56 && zips.length === 39217 && zips.every((item, index) => index === 0 || zips[index - 1].code < item.code), 'coverage row ordering changed');
  for (const key of base.filter((item) => item.endsWith('_count'))) {
    check(jurisdictions.reduce((total, item) => total + item[key], 0) === summary[key] && zips.reduce((total, item) => total + item[key], 0) === summary[key], `${key} conservation failed`);
  }
  const expectedCoverage = { source_records: 1957340, source_page_claimed_records: 1957340, accepted_current_exempt_organizations: 1955841, excluded_outside_supported_us_scope: 1498, quarantined_records: 1, jurisdiction_rows: 56, state_dc_rows: 51, territory_rows: 5, positive_zip5_rows: 36950, zip5_union_rows: 39217, denominator_only_zip5_rows: 2267, positive_source_zip_without_zcta: 5103, organization_records_without_zcta: 143102, positive_source_zip_without_published_zbp: 3139 };
  check(summary.organization_count === 1955841 && summary.reported_zip4_count === 1955841 && summary.record_zcta_count === 1812739 && summary.record_nonpolygon_count === 143102 && summary.exempt_status_01_count === 1947718 && summary.exempt_status_02_count === 640 && summary.exempt_status_12_count === 6637 && summary.exempt_status_25_count === 846 && JSON.stringify(summary.coverage) === JSON.stringify(expectedCoverage), 'national counts changed');
  check(JSON.stringify(summary.quarantine_reasons) === JSON.stringify({ 'invalid-year-month': 1 }), 'source quarantine classifications changed');
  check(summary.source_date === SOURCE_DATE && summary.source.release_id === SOURCE_RELEASE && summary.source.source_release_id === SOURCE_RELEASE_ID && summary.source.retrieved_at === RETRIEVED_AT && summary.geography.release_id === GEOGRAPHY_RELEASE, 'provenance changed');
  check(JSON.stringify(manifest.contracts) === JSON.stringify(summary.contracts) && JSON.stringify(manifest.source) === JSON.stringify(summary.source) && JSON.stringify(manifest.geography) === JSON.stringify(summary.geography) && JSON.stringify(manifest.coverage) === JSON.stringify(summary.coverage) && JSON.stringify(manifest.claims) === JSON.stringify(summary.claims) && manifest.status === 'published-governed-aggregate' && manifest.current_pointer_written === true && manifest.production_enrollment === false && manifest.source_actions_performed === 0 && manifest.network_requests_performed === 0 && manifest.additive_to_generic_totals === false && manifest.export_policy === 'governed-aggregate-only' && manifest.privacy_warning === PRIVACY_WARNING, 'manifest authority changed');
  forbidden({ manifest, summary, jurisdictions, zips });
}

async function verifyRuntimeBindings(summary, signal) {
  cancelled(signal);
  const source = await pointer(SOURCE_POINTER, 'irs-eo-bmf-organizations', SOURCE_RELEASE, SOURCE_POINTER_SHA, SOURCE_MANIFEST_SHA);
  const geography = await pointer(GEOGRAPHY_POINTER, 'us-census-geography', GEOGRAPHY_RELEASE, GEOGRAPHY_POINTER_SHA, GEOGRAPHY_MANIFEST_SHA);
  check(JSON.stringify(summary.contracts) === JSON.stringify(await contracts()), 'coverage contracts changed');
  check(summary.source.pointer_sha256 === source.pointerSha256 && summary.source.manifest_sha256 === source.manifestSha256 && summary.source.release_id === source.manifest.release_id, 'source binding changed');
  check(summary.geography.pointer_sha256 === geography.pointerSha256 && summary.geography.manifest_sha256 === geography.manifestSha256 && summary.geography.release_id === geography.manifest.release_id, 'geography binding changed');
  cancelled(signal);
}

export async function verifyNationalIrsEoBmfOrganizationCoverage(manifestPath, { expectedManifestSha256, allowStaging = false, replaySource = true, signal } = {}) {
  cancelled(signal);
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
    ['coverage-summary.json', 'national-irs-eo-bmf-coverage-summary-json', 1],
    ['jurisdictions.jsonl', 'national-irs-eo-bmf-jurisdiction-coverage-jsonl', 56],
    ['zip5-coverage.jsonl', 'national-irs-eo-bmf-zip5-coverage-jsonl', 39217],
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
  if (replaySource) {
    const expected = payload(await replay(SOURCE_POINTER, GEOGRAPHY_POINTER, signal));
    check(JSON.stringify(summary) === JSON.stringify(expected.summary) && JSON.stringify(jurisdictions) === JSON.stringify(expected.jurisdictions) && JSON.stringify(zips) === JSON.stringify(expected.zips), 'release no longer replays from exact retained evidence');
  } else {
    await verifyRuntimeBindings(summary, signal);
  }
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
  let installedIdentity = null;
  let backupIdentity = null;
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
      const retained = await lstat(backup);
      check(retained.isFile() && !retained.isSymbolicLink() && retained.nlink === 1, 'backup identity changed');
      backupIdentity = { dev: retained.dev, ino: retained.ino };
      await hooks.afterOldMove?.({ target, backup, prior });
    } else {
      await hooks.afterCompare?.({ target, prior });
      try { await lstat(target); fail('pointer appeared during CAS'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    try { await link(temporary, target); } catch (error) { if (error.code === 'EEXIST') fail('pointer appeared before atomic install'); throw error; }
    installed = true;
    const linked = await lstat(target);
    check(linked.isFile() && !linked.isSymbolicLink(), 'installed pointer identity changed');
    installedIdentity = { dev: linked.dev, ino: linked.ino };
    await rm(temporary);
    await hooks.afterNewInstall?.({ target, prior });
    check((await stable(target, 100_000)).equals(next), 'pointer replaced after atomic install');
    if (moved) await rm(backup);
  } catch (error) {
    primary = error;
    try {
      await hooks.beforeRollbackCleanup?.({ target, backup, installed });
      await rm(temporary, { force: true });
      let laterPointer = false;
      if (installed && installedIdentity) {
        try {
          const current = await lstat(target);
          const owned = current.isFile() && !current.isSymbolicLink() && current.dev === installedIdentity.dev && current.ino === installedIdentity.ino;
          if (owned) {
            check((await stable(target, 100_000)).equals(next), 'installed pointer changed before rollback');
            await rm(target);
          } else {
            laterPointer = true;
          }
        } catch (targetError) {
          if (targetError.code !== 'ENOENT') throw targetError;
        }
      }
      if (moved) {
        await hooks.beforeRollbackRestore?.({ target, backup, installed, prior });
        const retained = await lstat(backup);
        check(backupIdentity && retained.isFile() && !retained.isSymbolicLink() && retained.nlink === 1 && retained.dev === backupIdentity.dev && retained.ino === backupIdentity.ino && (await stable(backup, 100_000)).equals(prior), 'backup identity changed before rollback');
        let restoredPrior = false;
        if (!laterPointer) {
          try { await link(backup, target); restoredPrior = true; } catch (restoreError) { if (restoreError.code !== 'EEXIST') throw restoreError; laterPointer = true; }
        }
        if (restoredPrior) {
          const restored = await lstat(target);
          const linkedBackup = await lstat(backup);
          check(restored.isFile() && linkedBackup.isFile() && restored.dev === backupIdentity.dev && restored.ino === backupIdentity.ino && linkedBackup.dev === backupIdentity.dev && linkedBackup.ino === backupIdentity.ino, 'prior pointer was not restored');
        }
        check(laterPointer || restoredPrior, 'pointer rollback outcome is ambiguous');
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

export const publishNationalIrsEoBmfOrganizationCoveragePointerForTest = publishPointer;

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

export async function buildNationalIrsEoBmfOrganizationCoverage({ sourcePointer = SOURCE_POINTER, geographyPointer = GEOGRAPHY_POINTER, outputRoot = OUTPUT_ROOT, signal, hooks = {} } = {}) {
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
    await verifyNationalIrsEoBmfOrganizationCoverage(path.join(staging, 'manifest.json'), { expectedManifestSha256: manifestSha256, allowStaging: true });
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
        installed = await verifyNationalIrsEoBmfOrganizationCoverage(path.join(release, 'manifest.json'), { expectedManifestSha256: manifestSha256 });
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
          installed = await verifyNationalIrsEoBmfOrganizationCoverage(path.join(release, 'manifest.json'), { expectedManifestSha256: manifestSha256 });
          check(installed.manifest.release_id === packaged.manifest.release_id, 'existing release differs');
          await rm(staging, { recursive: true, force: true });
        }
      }
      try {
        await hooks.afterReleaseInstall?.({ release, manifest: packaged.manifest, manifestSha256 });
        installed = await verifyNationalIrsEoBmfOrganizationCoverage(path.join(release, 'manifest.json'), { expectedManifestSha256: manifestSha256 });
        await hooks.beforePointerCas?.({ release, manifest: installed.manifest, manifestSha256: installed.manifestSha256 });
        cancelled(signal);
        installed = await verifyNationalIrsEoBmfOrganizationCoverage(path.join(release, 'manifest.json'), { expectedManifestSha256: manifestSha256 });
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

async function runtimeFingerprint(pointerPath, pointerBytes, pointerValue, signal) {
  cancelled(signal);
  const manifestPath = path.resolve(path.dirname(pointerPath), pointerValue.manifest);
  inside(path.dirname(pointerPath), manifestPath);
  const manifestBytes = await stable(manifestPath, 2_000_000);
  check(sha(manifestBytes) === pointerValue.manifest_sha256, 'coverage manifest changed');
  const manifest = JSON.parse(manifestBytes);
  const filenames = [manifestPath, ...(manifest.artifacts ?? []).map((artifact) => path.resolve(path.dirname(manifestPath), artifact.path))];
  const identities = [];
  for (const filename of filenames) {
    if (filename !== manifestPath) inside(path.dirname(manifestPath), filename);
    const identity = await lstat(filename);
    check(identity.isFile() && !identity.isSymbolicLink() && identity.nlink === 1, 'runtime artifact identity changed');
    identities.push([path.relative(path.dirname(manifestPath), filename), identity.dev, identity.ino, identity.size, identity.mtimeMs, identity.ctimeMs]);
  }
  cancelled(signal);
  return { manifestPath, key: sha(Buffer.concat([pointerBytes, manifestBytes, Buffer.from(JSON.stringify(identities))])) };
}

export function getNationalIrsEoBmfCoverageRuntimeMetricsForTest() {
  return { ...runtimeMetrics };
}

export function resetNationalIrsEoBmfCoverageRuntimeCacheForTest() {
  runtimeCache = null;
  runtimeMetrics.sourceReplayCount = 0;
  runtimeMetrics.runtimeLoadCount = 0;
  runtimeMetrics.runtimeCacheHitCount = 0;
}

export async function readNationalIrsEoBmfOrganizationCoverage({ pointerPath = path.join(OUTPUT_ROOT, 'current.json'), hooks = {}, signal } = {}) {
  cancelled(signal);
  pointerPath = path.resolve(pointerPath);
  const pointerBytes = await stable(pointerPath, 100_000);
  const pointerValue = JSON.parse(pointerBytes);
  check(pointerValue.dataset_id === DATASET_ID && pointerValue.status === 'published-governed-aggregate' && /^[a-f0-9]{64}$/.test(pointerValue.manifest_sha256), 'coverage pointer changed');
  const before = await runtimeFingerprint(pointerPath, pointerBytes, pointerValue, signal);
  const cacheable = Object.keys(hooks).length === 0;
  if (cacheable && runtimeCache?.pointerPath === pointerPath && runtimeCache.key === before.key) {
    runtimeMetrics.runtimeCacheHitCount += 1;
    cancelled(signal);
    return runtimeCache.value;
  }
  const verified = await verifyNationalIrsEoBmfOrganizationCoverage(before.manifestPath, { expectedManifestSha256: pointerValue.manifest_sha256, replaySource: false, signal });
  check(verified.manifest.release_id === pointerValue.release_id, 'coverage pointer release changed');
  await hooks.afterVerification?.({ pointerPath, manifestPath: before.manifestPath, verified });
  cancelled(signal);
  check((await stable(pointerPath, 100_000)).equals(pointerBytes), 'coverage pointer changed during read');
  const after = await runtimeFingerprint(pointerPath, pointerBytes, pointerValue, signal);
  check(after.key === before.key, 'coverage artifacts changed during read');
  const value = { verified: { manifest: verified.manifest, manifestSha256: verified.manifestSha256, releaseDirectory: verified.releaseDirectory, coverage: verified.coverage, pointerSha256: sha(pointerBytes), source_date: verified.summary.source_date, retrieved_at: verified.summary.source.retrieved_at }, summary: verified.summary, jurisdictions: verified.jurisdictions, zips: verified.zips, zipIndex: new Map(verified.zips.map((item) => [item.code, item])) };
  runtimeMetrics.runtimeLoadCount += 1;
  if (cacheable) runtimeCache = { pointerPath, key: after.key, value };
  return value;
}

export async function lookupNationalIrsEoBmfOrganizationZip5(zip5, options = {}) {
  check(/^\d{5}$/.test(zip5 ?? ''), 'ZIP5 must contain exactly five digits');
  const coverage = await readNationalIrsEoBmfOrganizationCoverage(options);
  const rowValue = coverage.zipIndex.get(zip5) ?? null;
  return { verified: coverage.verified, row: rowValue };
}

export async function verifyNationalIrsEoBmfOrganizationCoverageCurrent({ pointerPath = path.join(OUTPUT_ROOT, 'current.json'), signal } = {}) {
  cancelled(signal);
  const pointerBytes = await stable(pointerPath, 100_000);
  const pointerValue = JSON.parse(pointerBytes);
  check(pointerValue.dataset_id === DATASET_ID && pointerValue.status === 'published-governed-aggregate' && /^[a-f0-9]{64}$/.test(pointerValue.manifest_sha256), 'coverage pointer changed');
  const manifestPath = path.resolve(path.dirname(pointerPath), pointerValue.manifest);
  inside(path.dirname(pointerPath), manifestPath);
  const verified = await verifyNationalIrsEoBmfOrganizationCoverage(manifestPath, { expectedManifestSha256: pointerValue.manifest_sha256, signal });
  check(verified.manifest.release_id === pointerValue.release_id && (await stable(pointerPath, 100_000)).equals(pointerBytes), 'coverage pointer changed during verification');
  return { manifest: verified.manifest, manifestSha256: verified.manifestSha256, releaseDirectory: verified.releaseDirectory, pointerSha256: sha(pointerBytes), source_date: verified.summary.source_date, retrieved_at: verified.summary.source.retrieved_at, coverage: verified.summary.coverage };
}
