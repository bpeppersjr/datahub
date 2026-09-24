import { createHash, randomUUID } from 'node:crypto';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { link, lstat, mkdir, open, readdir, realpath, rename, rm, rmdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { APP_ROOT } from './paths.mjs';
import { verifyCmsNppesOrganizations } from './cms-nppes-organizations.mjs';

const DATASET_ID = 'national-cms-nppes-organization-practice-location-coverage';
const SCHEMA_VERSION = `${DATASET_ID}@1.0.0`;
const SOURCE_POINTER = path.join(APP_ROOT, 'data/business-sources/cms-nppes-organizations/current.json');
const GEOGRAPHY_POINTER = path.join(APP_ROOT, 'data/geography/current.json');
const OUTPUT_ROOT = path.join(APP_ROOT, `data/${DATASET_ID}`);
const SOURCE_RELEASE = 'cms-nppes-organizations-20260903-013253062Z-7ee97568';
const SOURCE_MANIFEST_SHA = '00e645a99a5f8b6b793b5fa250dd40bacec3850fdc83bb872845e86750585778';
const SOURCE_POINTER_SHA = '117140134ece328e29a134440e0c12b68e0217417675da03f844f1de5cca52d9';
const GEOGRAPHY_RELEASE = 'us-census-geography-20260830-132803990Z-3629abc0';
const GEOGRAPHY_MANIFEST_SHA = '5426cae150c0fba64f8ff43a48ca39c4e78b5b4ba8a8007fbd211615540d1c8b';
const GEOGRAPHY_POINTER_SHA = '5f89350482630a7d2e888772512aca36fdd21f68c8d3f01f1113dc6c2c400403';
const SOURCE_DATE = '2026-08-09';
const RETRIEVED_AT = '2026-08-30T14:13:17.460Z';
const OBSERVED_AT = '2026-09-03T01:32:53.062Z';
const SOURCE_RELEASE_ID = 'NPPES_Data_Dissemination_August_2026_V2';
const TERRITORIES = new Set(['AS', 'GU', 'MP', 'PR', 'VI']);
const MILITARY = new Set(['AA', 'AE', 'AP']);
const ASSOCIATED_STATES = new Set(['FM', 'MH']);
const CONTRACT_PATHS = [
  'config/connectors/national-cms-nppes-organization-practice-location-coverage.json',
  'config/datasets/national-cms-nppes-organization-practice-location-coverage.json',
  'config/schemas/national-cms-nppes-organization-practice-location-coverage.schema.json',
  'config/source-policies/national-cms-nppes-organization-practice-location-coverage.json',
];
const PRIVACY_WARNING = 'Aggregate counts exclude organization names, NPIs, addresses, telephone numbers, taxonomies, source record identifiers, raw records, and quarantine records.';
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
  return { practice_location_count: 0, primary_practice_location_count: 0, non_primary_practice_location_count: 0, reported_zip4_location_count: 0, location_zcta_count: 0, location_nonpolygon_count: 0 };
}

function add(accumulator, kind, address, geography) {
  accumulator.practice_location_count += 1;
  accumulator[`${kind}_practice_location_count`] += 1;
  accumulator.reported_zip4_location_count += address.zip4 ? 1 : 0;
  const hasZcta = geography.zcta_geoid === address.zip_code;
  accumulator.location_zcta_count += hasZcta ? 1 : 0;
  accumulator.location_nonpolygon_count += hasZcta ? 0 : 1;
}

function claims() {
  return {
    source_active_organization_npi_cohort: true,
    practice_location_records_additive_across_geographies: true,
    primary_and_non_primary_counts_mutually_exclusive: true,
    individual_npi_records_excluded: true,
    unique_business: false,
    current_operation_beyond_source: false,
    verified_physical_site: false,
    licensure_or_credentials_verified: false,
    all_healthcare_organizations: false,
    all_businesses: false,
    usable_premise_geocodes: false,
    nationwide_business_completeness: false,
    current_usps_validity: null,
    organization_names_exported: false,
    practice_addresses_exported: false,
    npis_exported: false,
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
  const source = await pointer(sourcePointer, 'cms-nppes-organizations', SOURCE_RELEASE, SOURCE_POINTER_SHA, SOURCE_MANIFEST_SHA);
  const geography = await pointer(geographyPointer, 'us-census-geography', GEOGRAPHY_RELEASE, GEOGRAPHY_POINTER_SHA, GEOGRAPHY_MANIFEST_SHA);
  await verifyCmsNppesOrganizations(source.manifestPath);
  const manifest = source.manifest;
  check(manifest.source_through_date === SOURCE_DATE && manifest.retrieved_at === RETRIEVED_AT && manifest.observed_at === OBSERVED_AT && manifest.source_release_id === SOURCE_RELEASE_ID && manifest.complete_cms_monthly_source_snapshot === true, 'source temporal envelope changed');
  const expectedSourceCoverage = { source_main_rows: 9726865, active_organization_npis: 1959633, active_individual_npis_excluded: 7415294, deactivated_npis_limited: 351911, organization_primary_locations_with_us_zip: 1958089, organizations_without_valid_us_primary_zip: 1544, source_practice_location_rows: 1241921, accepted_non_primary_practice_locations: 130691, excluded_practice_locations: 1109593, rejected_practice_locations: 31, source_other_name_rows: 859461, accepted_other_names: 808030, excluded_other_names: 51431, quarantined_main_rows: 27, source_zip_codes: 28056, zip_union_records: 38686, states_and_territories: 61, unique_taxonomy_codes: 869 };
  check(JSON.stringify(manifest.coverage) === JSON.stringify(expectedSourceCoverage), 'source coverage changed');
  const deduplicatedPracticeLocationRows = manifest.coverage.source_practice_location_rows - manifest.coverage.accepted_non_primary_practice_locations - manifest.coverage.excluded_practice_locations - manifest.coverage.rejected_practice_locations;
  check(deduplicatedPracticeLocationRows === 1606 && manifest.coverage.source_practice_location_rows === manifest.coverage.accepted_non_primary_practice_locations + manifest.coverage.excluded_practice_locations + manifest.coverage.rejected_practice_locations + deduplicatedPracticeLocationRows, 'source practice-location accounting changed');
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
  const organizationArtifacts = byType('normalized-nppes-organization-jsonl-gzip').filter((artifact) => artifact.path.includes('/prefix='));
  const practiceLocationArtifacts = byType('normalized-nppes-practice-location-jsonl-gzip');
  const sourceSummaryArtifact = byType('nppes-organization-source-summary')[0];
  const zipArtifact = byType('nppes-organization-zip-coverage-jsonl')[0];
  check(sourceSummaryArtifact && zipArtifact && organizationArtifacts.length === 10 && practiceLocationArtifacts.length === 10, 'source artifact inventory changed');
  const sourceSummary = JSON.parse(await artifactBytes(sourceSummaryArtifact, 100_000));
  const zipUnionText = (await artifactBytes(zipArtifact)).toString().trim();
  const zipUnion = zipUnionText.split(/\r?\n/).map(JSON.parse);
  const national = blank();
  const jurisdictions = new Map();
  const zips = new Map();
  let primaryCount = 0;
  let nonPrimaryCount = 0;
  const processArtifacts = async (artifacts, kind) => {
  for (const artifact of artifacts) {
    cancelled(signal);
    const bytes = await artifactBytes(artifact);
    const lines = createInterface({ input: Readable.from([bytes]).pipe(createGunzip()), crlfDelay: Infinity });
    let partitionCount = 0;
    for await (const line of lines) {
      if (!line) continue;
      partitionCount += 1;
      const record = JSON.parse(line);
      if (kind === 'primary') primaryCount += 1; else nonPrimaryCount += 1;
      const address = kind === 'primary' ? record.primary_practice_location?.address : record.address;
      const geographyValue = kind === 'primary' ? record.primary_practice_location?.geography : record.geography;
      check(record.schema_version === '1.0.0' && record.observed_at === OBSERVED_AT && record.provenance?.source_release_id === SOURCE_RELEASE_ID, 'source record semantics changed');
      check(kind === 'primary' ? ['npi-active-as-of-source-release', 'npi-reactivated-as-of-source-release'].includes(record.npi_status?.value) : record.source_status?.value === 'reported-non-primary-practice-location-for-active-npi', 'source cohort changed');
      check(address?.country === 'US' && /^[A-Z]{2}$/.test(address.state) && /^\d{5}$/.test(address.zip_code) && (address.zip4 === null || /^\d{4}$/.test(address.zip4)), 'source geography key changed');
      check(['2020-zcta-polygon-available', 'no-2020-zcta-polygon'].includes(geographyValue?.zcta_match_status), 'source ZCTA evidence changed');
      const state = address.state;
      const zip = address.zip_code;
      if (!jurisdictions.has(state)) jurisdictions.set(state, blank());
      if (!zips.has(zip)) zips.set(zip, blank());
      add(national, kind, address, geographyValue);
      add(jurisdictions.get(state), kind, address, geographyValue);
      add(zips.get(zip), kind, address, geographyValue);
      if ((primaryCount + nonPrimaryCount) % 10_000 === 0) cancelled(signal);
    }
    check(partitionCount === artifact.record_count, 'source partition count changed');
  }
  };
  await processArtifacts(organizationArtifacts, 'primary');
  await processArtifacts(practiceLocationArtifacts, 'non_primary');
  const orderedJurisdictions = [...jurisdictions.keys()].sort();
  check(primaryCount === 1958089 && nonPrimaryCount === 130691 && jurisdictions.size === 61 && zips.size === 28056, 'source conservation changed');
  check(JSON.stringify(sourceSummary.counts) === JSON.stringify(Object.fromEntries(Object.entries(expectedSourceCoverage).filter(([key]) => !['source_zip_codes', 'zip_union_records', 'states_and_territories', 'unique_taxonomy_codes'].includes(key)))) && JSON.stringify(sourceSummary.states_and_territories) === JSON.stringify(Object.fromEntries(orderedJurisdictions.map((code) => [code, jurisdictions.get(code).primary_practice_location_count]))), 'source summary changed');
  check(zipUnion.length === 38686 && zipUnion.every((row, index) => /^\d{5}$/.test(row.zip_code) && (index === 0 || zipUnion[index - 1].zip_code < row.zip_code)), 'source ZIP union changed');
  const zipSet = new Set();
  for (const row of zipUnion) {
    check(!zipSet.has(row.zip_code), 'duplicate ZIP union row');
    zipSet.add(row.zip_code);
    const snapshot = row.nppes_organization_provider_snapshot;
    check(Number.isSafeInteger(snapshot?.primary_practice_location_count) && Number.isSafeInteger(snapshot?.non_primary_practice_location_count) && snapshot.primary_practice_location_count === (zips.get(row.zip_code)?.primary_practice_location_count ?? 0) && snapshot.non_primary_practice_location_count === (zips.get(row.zip_code)?.non_primary_practice_location_count ?? 0), 'source ZIP count changed');
    check(['2020-zcta-polygon-available', 'no-2020-zcta-polygon'].includes(row.geography?.status) && (row.geography.geoid === row.zip_code) === (row.geography.status === '2020-zcta-polygon-available'), 'source ZIP ZCTA evidence changed');
  }
  check([...zips.keys()].every((zip) => zipSet.has(zip)), 'positive source ZIP omitted from union');
  check((await stable(source.pointerPath, 100_000)).equals(source.pointerBytes) && (await stable(geography.pointerPath, 100_000)).equals(geography.pointerBytes), 'dependency pointer changed during replay');
  return { source, geography, sourceSummary, zipUnion, national, jurisdictions, zips, deduplicatedPracticeLocationRows, contractHashes: await contracts() };
}

function row(scope, code, accumulator) {
  return { schema_version: SCHEMA_VERSION, scope, code, ...accumulator, claims: claims() };
}

function payload(input) {
  const jurisdictions = [...input.jurisdictions.keys()].sort().map((code) => row('jurisdiction', code, input.jurisdictions.get(code)));
  const zips = input.zipUnion.map((sourceRow) => ({
    ...row('zip5', sourceRow.zip_code, input.zips.get(sourceRow.zip_code) ?? blank()),
    evidence_scope: input.zips.has(sourceRow.zip_code) ? 'positive-cms-nppes-organization-practice-location-evidence' : 'denominator-only',
    zcta_membership: { status: sourceRow.geography.status, geoid: sourceRow.geography.geoid },
  }));
  const positiveWithoutZcta = zips.filter((zip) => zip.practice_location_count > 0 && zip.zcta_membership.geoid === null).length;
  const positiveWithoutZbp = input.zipUnion.filter((zip) => ((zip.nppes_organization_provider_snapshot.primary_practice_location_count + zip.nppes_organization_provider_snapshot.non_primary_practice_location_count) > 0) && zip.employer_baseline?.status !== 'published').length;
  const stateDcRows = jurisdictions.filter((item) => !TERRITORIES.has(item.code) && !MILITARY.has(item.code) && !ASSOCIATED_STATES.has(item.code)).length;
  const summary = {
    ...row('national', null, input.national),
    dataset_id: DATASET_ID,
    contracts: input.contractHashes,
    source_date: SOURCE_DATE,
    source: { dataset_id: input.source.manifest.dataset_id, release_id: input.source.manifest.release_id, source_release_id: input.source.manifest.source_release_id, source_date: SOURCE_DATE, retrieved_at: input.source.manifest.retrieved_at, observed_at: input.source.manifest.observed_at, pointer_sha256: input.source.pointerSha256, manifest_sha256: input.source.manifestSha256 },
    geography: { dataset_id: input.geography.manifest.dataset_id, release_id: input.geography.manifest.release_id, pointer_sha256: input.geography.pointerSha256, manifest_sha256: input.geography.manifestSha256, zcta_count: input.geography.manifest.coverage.zctas },
    coverage: { ...input.source.manifest.coverage, deduplicated_practice_location_rows: input.deduplicatedPracticeLocationRows, jurisdiction_rows: jurisdictions.length, state_dc_rows: stateDcRows, territory_rows: jurisdictions.filter((item) => TERRITORIES.has(item.code)).length, military_rows: jurisdictions.filter((item) => MILITARY.has(item.code)).length, associated_state_rows: jurisdictions.filter((item) => ASSOCIATED_STATES.has(item.code)).length, positive_zip5_rows: input.zips.size, zip5_union_rows: zips.length, denominator_only_zip5_rows: zips.length - input.zips.size, positive_source_zip_without_zcta: positiveWithoutZcta, practice_location_records_without_zcta: input.national.location_nonpolygon_count, positive_source_zip_without_published_zbp: positiveWithoutZbp },
    export_policy: 'governed-aggregate-only',
    privacy_warning: PRIVACY_WARNING,
  };
  return { summary, jurisdictions, zips };
}

function packageRelease(data) {
  const buffers = [encode(data.summary), jsonLines(data.jurisdictions), jsonLines(data.zips)];
  const definitions = [
    ['coverage-summary.json', 'national-cms-nppes-practice-location-coverage-summary-json', 1],
    ['jurisdictions.jsonl', 'national-cms-nppes-practice-location-jurisdiction-coverage-jsonl', 61],
    ['zip5-coverage.jsonl', 'national-cms-nppes-practice-location-zip5-coverage-jsonl', 38686],
  ];
  const artifacts = definitions.map((definition, index) => ({ path: definition[0], artifact_type: definition[1], record_count: definition[2], bytes: buffers[index].length, sha256: sha(buffers[index]) }));
  const releaseId = `${DATASET_ID}-${sha(Buffer.concat(buffers)).slice(0, 16)}`;
  const manifest = { schema_version: SCHEMA_VERSION, dataset_id: DATASET_ID, release_id: releaseId, status: 'published-governed-aggregate', current_pointer_written: true, production_enrollment: false, source_actions_performed: 0, network_requests_performed: 0, additive_to_generic_totals: false, export_policy: 'governed-aggregate-only', contracts: data.summary.contracts, source: data.summary.source, geography: data.summary.geography, coverage: data.summary.coverage, claims: data.summary.claims, privacy_warning: PRIVACY_WARNING, artifacts };
  return { buffers, manifest };
}

function forbidden(value) {
  const banned = new Set(['name', 'legal_business_name', 'other_organization_name', 'address', 'street', 'telephone', 'location', 'coordinates', 'geometry', 'external_identifiers', 'npi', 'healthcare_taxonomies', 'normalized_record_id', 'source_record_id', 'url', 'quarantine_record']);
  const walk = (item) => {
    if (Array.isArray(item)) return item.forEach(walk);
    if (item && typeof item === 'object') for (const [key, nested] of Object.entries(item)) { check(!banned.has(key.toLowerCase()), `forbidden field ${key}`); walk(nested); }
  };
  walk(value);
}

function validateRow(value, scope) {
  const base = ['schema_version', 'scope', 'code', 'practice_location_count', 'primary_practice_location_count', 'non_primary_practice_location_count', 'reported_zip4_location_count', 'location_zcta_count', 'location_nonpolygon_count', 'claims'];
  if (scope !== 'national') exactKeys(value, scope === 'zip5' ? [...base, 'evidence_scope', 'zcta_membership'] : base, `${scope} row`);
  exactKeys(value.claims, Object.keys(claims()), 'claims');
  const countKeys = base.filter((key) => key.endsWith('_count'));
  check(value.schema_version === SCHEMA_VERSION && value.scope === scope && countKeys.every((key) => Number.isSafeInteger(value[key]) && value[key] >= 0) && value.practice_location_count === value.location_zcta_count + value.location_nonpolygon_count && value.practice_location_count === value.primary_practice_location_count + value.non_primary_practice_location_count && value.reported_zip4_location_count <= value.practice_location_count && JSON.stringify(value.claims) === JSON.stringify(claims()), `${scope} semantics changed`);
  if (scope === 'jurisdiction') check(/^[A-Z]{2}$/.test(value.code), 'jurisdiction code changed');
  if (scope === 'zip5') {
    exactKeys(value.zcta_membership, ['status', 'geoid'], 'ZCTA membership');
    check(/^\d{5}$/.test(value.code) && ['positive-cms-nppes-organization-practice-location-evidence', 'denominator-only'].includes(value.evidence_scope) && (value.zcta_membership.geoid === value.code) === (value.zcta_membership.status === '2020-zcta-polygon-available'), 'ZIP semantics changed');
  }
}

function validate(manifest, summary, jurisdictions, zips) {
  exactKeys(manifest, ['schema_version', 'dataset_id', 'release_id', 'status', 'current_pointer_written', 'production_enrollment', 'source_actions_performed', 'network_requests_performed', 'additive_to_generic_totals', 'export_policy', 'contracts', 'source', 'geography', 'coverage', 'claims', 'privacy_warning', 'artifacts'], 'manifest');
  const base = ['schema_version', 'scope', 'code', 'practice_location_count', 'primary_practice_location_count', 'non_primary_practice_location_count', 'reported_zip4_location_count', 'location_zcta_count', 'location_nonpolygon_count', 'claims'];
  exactKeys(summary, [...base, 'dataset_id', 'contracts', 'source_date', 'source', 'geography', 'coverage', 'export_policy', 'privacy_warning'], 'summary');
  validateRow(summary, 'national');
  jurisdictions.forEach((item) => validateRow(item, 'jurisdiction'));
  zips.forEach((item) => validateRow(item, 'zip5'));
  check(jurisdictions.length === 61 && zips.length === 38686 && zips.every((item, index) => index === 0 || zips[index - 1].code < item.code), 'coverage row ordering changed');
  for (const key of base.filter((item) => item.endsWith('_count'))) {
    check(jurisdictions.reduce((total, item) => total + item[key], 0) === summary[key] && zips.reduce((total, item) => total + item[key], 0) === summary[key], `${key} conservation failed`);
  }
  const expectedCoverage = { source_main_rows: 9726865, active_organization_npis: 1959633, active_individual_npis_excluded: 7415294, deactivated_npis_limited: 351911, organization_primary_locations_with_us_zip: 1958089, organizations_without_valid_us_primary_zip: 1544, source_practice_location_rows: 1241921, accepted_non_primary_practice_locations: 130691, excluded_practice_locations: 1109593, rejected_practice_locations: 31, source_other_name_rows: 859461, accepted_other_names: 808030, excluded_other_names: 51431, quarantined_main_rows: 27, source_zip_codes: 28056, zip_union_records: 38686, states_and_territories: 61, unique_taxonomy_codes: 869, deduplicated_practice_location_rows: 1606, jurisdiction_rows: 61, state_dc_rows: 51, territory_rows: 5, military_rows: 3, associated_state_rows: 2, positive_zip5_rows: 28056, zip5_union_rows: 38686, denominator_only_zip5_rows: 10630, positive_source_zip_without_zcta: 2177, practice_location_records_without_zcta: 7054, positive_source_zip_without_published_zbp: 1465 };
  check(summary.practice_location_count === 2088780 && summary.primary_practice_location_count === 1958089 && summary.non_primary_practice_location_count === 130691 && summary.reported_zip4_location_count === 1908009 && summary.location_zcta_count === 2081726 && summary.location_nonpolygon_count === 7054 && JSON.stringify(summary.coverage) === JSON.stringify(expectedCoverage), `national counts changed: ${JSON.stringify({ practice_location_count: summary.practice_location_count, primary_practice_location_count: summary.primary_practice_location_count, non_primary_practice_location_count: summary.non_primary_practice_location_count, reported_zip4_location_count: summary.reported_zip4_location_count, location_zcta_count: summary.location_zcta_count, location_nonpolygon_count: summary.location_nonpolygon_count, coverage: summary.coverage })}`);
  check(summary.source_date === SOURCE_DATE && summary.source.release_id === SOURCE_RELEASE && summary.source.source_release_id === SOURCE_RELEASE_ID && summary.source.retrieved_at === RETRIEVED_AT && summary.geography.release_id === GEOGRAPHY_RELEASE, 'provenance changed');
  check(JSON.stringify(manifest.contracts) === JSON.stringify(summary.contracts) && JSON.stringify(manifest.source) === JSON.stringify(summary.source) && JSON.stringify(manifest.geography) === JSON.stringify(summary.geography) && JSON.stringify(manifest.coverage) === JSON.stringify(summary.coverage) && JSON.stringify(manifest.claims) === JSON.stringify(summary.claims) && manifest.status === 'published-governed-aggregate' && manifest.current_pointer_written === true && manifest.production_enrollment === false && manifest.source_actions_performed === 0 && manifest.network_requests_performed === 0 && manifest.additive_to_generic_totals === false && manifest.export_policy === 'governed-aggregate-only' && manifest.privacy_warning === PRIVACY_WARNING, 'manifest authority changed');
  forbidden({ manifest, summary, jurisdictions, zips });
}

async function verifyRuntimeBindings(summary, signal) {
  cancelled(signal);
  const source = await pointer(SOURCE_POINTER, 'cms-nppes-organizations', SOURCE_RELEASE, SOURCE_POINTER_SHA, SOURCE_MANIFEST_SHA);
  const geography = await pointer(GEOGRAPHY_POINTER, 'us-census-geography', GEOGRAPHY_RELEASE, GEOGRAPHY_POINTER_SHA, GEOGRAPHY_MANIFEST_SHA);
  check(JSON.stringify(summary.contracts) === JSON.stringify(await contracts()), 'coverage contracts changed');
  check(summary.source.pointer_sha256 === source.pointerSha256 && summary.source.manifest_sha256 === source.manifestSha256 && summary.source.release_id === source.manifest.release_id, 'source binding changed');
  check(summary.geography.pointer_sha256 === geography.pointerSha256 && summary.geography.manifest_sha256 === geography.manifestSha256 && summary.geography.release_id === geography.manifest.release_id, 'geography binding changed');
  cancelled(signal);
}

export async function verifyNationalCmsNppesOrganizationPracticeLocationCoverage(manifestPath, { expectedManifestSha256, allowStaging = false, replaySource = true, signal } = {}) {
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
    ['coverage-summary.json', 'national-cms-nppes-practice-location-coverage-summary-json', 1],
    ['jurisdictions.jsonl', 'national-cms-nppes-practice-location-jurisdiction-coverage-jsonl', 61],
    ['zip5-coverage.jsonl', 'national-cms-nppes-practice-location-zip5-coverage-jsonl', 38686],
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

export const publishNationalCmsNppesOrganizationPracticeLocationCoveragePointerForTest = publishPointer;

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

export async function buildNationalCmsNppesOrganizationPracticeLocationCoverage({ sourcePointer = SOURCE_POINTER, geographyPointer = GEOGRAPHY_POINTER, outputRoot = OUTPUT_ROOT, signal, hooks = {} } = {}) {
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
    await verifyNationalCmsNppesOrganizationPracticeLocationCoverage(path.join(staging, 'manifest.json'), { expectedManifestSha256: manifestSha256, allowStaging: true });
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
        installed = await verifyNationalCmsNppesOrganizationPracticeLocationCoverage(path.join(release, 'manifest.json'), { expectedManifestSha256: manifestSha256 });
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
          installed = await verifyNationalCmsNppesOrganizationPracticeLocationCoverage(path.join(release, 'manifest.json'), { expectedManifestSha256: manifestSha256 });
          check(installed.manifest.release_id === packaged.manifest.release_id, 'existing release differs');
          await rm(staging, { recursive: true, force: true });
        }
      }
      try {
        await hooks.afterReleaseInstall?.({ release, manifest: packaged.manifest, manifestSha256 });
        installed = await verifyNationalCmsNppesOrganizationPracticeLocationCoverage(path.join(release, 'manifest.json'), { expectedManifestSha256: manifestSha256 });
        await hooks.beforePointerCas?.({ release, manifest: installed.manifest, manifestSha256: installed.manifestSha256 });
        cancelled(signal);
        installed = await verifyNationalCmsNppesOrganizationPracticeLocationCoverage(path.join(release, 'manifest.json'), { expectedManifestSha256: manifestSha256 });
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

export function getNationalCmsNppesCoverageRuntimeMetricsForTest() {
  return { ...runtimeMetrics };
}

export function resetNationalCmsNppesCoverageRuntimeCacheForTest() {
  runtimeCache = null;
  runtimeMetrics.sourceReplayCount = 0;
  runtimeMetrics.runtimeLoadCount = 0;
  runtimeMetrics.runtimeCacheHitCount = 0;
}

export async function readNationalCmsNppesOrganizationPracticeLocationCoverage({ pointerPath = path.join(OUTPUT_ROOT, 'current.json'), hooks = {}, signal } = {}) {
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
  const verified = await verifyNationalCmsNppesOrganizationPracticeLocationCoverage(before.manifestPath, { expectedManifestSha256: pointerValue.manifest_sha256, replaySource: false, signal });
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

export async function lookupNationalCmsNppesOrganizationZip5(zip5, options = {}) {
  check(/^\d{5}$/.test(zip5 ?? ''), 'ZIP5 must contain exactly five digits');
  const coverage = await readNationalCmsNppesOrganizationPracticeLocationCoverage(options);
  const rowValue = coverage.zipIndex.get(zip5) ?? null;
  return { verified: coverage.verified, row: rowValue };
}

export async function verifyNationalCmsNppesOrganizationPracticeLocationCoverageCurrent({ pointerPath = path.join(OUTPUT_ROOT, 'current.json'), signal } = {}) {
  cancelled(signal);
  const pointerBytes = await stable(pointerPath, 100_000);
  const pointerValue = JSON.parse(pointerBytes);
  check(pointerValue.dataset_id === DATASET_ID && pointerValue.status === 'published-governed-aggregate' && /^[a-f0-9]{64}$/.test(pointerValue.manifest_sha256), 'coverage pointer changed');
  const manifestPath = path.resolve(path.dirname(pointerPath), pointerValue.manifest);
  inside(path.dirname(pointerPath), manifestPath);
  const verified = await verifyNationalCmsNppesOrganizationPracticeLocationCoverage(manifestPath, { expectedManifestSha256: pointerValue.manifest_sha256, signal });
  check(verified.manifest.release_id === pointerValue.release_id && (await stable(pointerPath, 100_000)).equals(pointerBytes), 'coverage pointer changed during verification');
  return { manifest: verified.manifest, manifestSha256: verified.manifestSha256, releaseDirectory: verified.releaseDirectory, pointerSha256: sha(pointerBytes), source_date: verified.summary.source_date, retrieved_at: verified.summary.source.retrieved_at, coverage: verified.summary.coverage };
}
