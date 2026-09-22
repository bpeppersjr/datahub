import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createGunzip, createGzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { finished } from 'node:stream/promises';
import { isDeepStrictEqual } from 'node:util';
import { APP_ROOT } from './paths.mjs';

export const NPPES_PHARMACY_SCHEMA_VERSION = '1.0.0';
export const NPPES_PHARMACY_TRANSFORMATION = 'cms-nppes-community-retail-pharmacy@1.0.0';
export const COMMUNITY_RETAIL_TAXONOMY = '3336C0003X';
export const MAIL_ORDER_TAXONOMY = '3336M0002X';
export const NPPES_PHARMACY_POLICY_ID = 'cms-nppes-community-retail-pharmacy';
export const NPPES_PHARMACY_SOURCE_POLICY_PATH = 'config/source-policies/cms-nppes-organizations.json';

const STATE_CODES = Object.freeze([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
  'AS', 'GU', 'MP', 'PR', 'VI',
]);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function hashFile(filename) {
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(filename)) {
    bytes += chunk.length;
    hash.update(chunk);
  }
  return { bytes, sha256: hash.digest('hex') };
}

function assertContained(parent, child, label) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`${label} escapes its local release directory.`);
}

function checkCancelled(signal) {
  if (signal?.aborted) throw Object.assign(new Error('Pharmacy projection cancelled before publication.'), { name: 'AbortError', code: 'ABORT_ERR' });
}

function json(value) { return `${JSON.stringify(value)}\n`; }

const NPPES_NPI_STATUS_VALUES = new Set(['npi-active-as-of-source-release', 'npi-reactivated-as-of-source-release']);
const ADDRESS_KEYS = new Set(['street', 'unit_or_additional', 'city', 'state', 'zip_code', 'zip4', 'postal_code', 'country']);
const GEOGRAPHY_KEYS = new Set(['zip_code', 'zcta_match_status', 'zcta_geo_id', 'zcta_geoid', 'zcta_geometry_file']);

function exactKeys(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => !allowed.has(key))) throw new Error(`${label} has unsupported fields.`);
}

async function loadSourcePolicy(policyPath = path.join(APP_ROOT, NPPES_PHARMACY_SOURCE_POLICY_PATH)) {
  const absolute = path.resolve(policyPath);
  assertContained(APP_ROOT, absolute, 'CMS NPPES source policy');
  const buffer = await readFile(absolute);
  const policy = JSON.parse(buffer.toString('utf8'));
  const field = policy.field_export_policy ?? {};
  const allowedUses = new Set(policy.allowed_use ?? []);
  const prohibited = (policy.prohibited_use ?? []).join(' ').toLowerCase();
  if (policy.policy_id !== 'cms-nppes-organizations' || !/^\d+\.\d+\.\d+$/.test(policy.version ?? '')
    || policy.publisher !== 'U.S. Centers for Medicare & Medicaid Services'
    || field.active_organization_normalization !== 'public'
    || field.raw_source_snapshot !== 'internal'
    || field.active_individual_records !== 'excluded'
    || field.authorized_official_fields !== 'excluded'
    || field.ein_tin !== 'excluded'
    || field.endpoint_records !== 'excluded'
    || !allowedUses.has('organization-provider normalization')
    || !allowedUses.has('public redistribution of allowed normalized active-organization fields with provenance')
    || !prohibited.includes('active individual') || !prohibited.includes('authorized-official')
    || policy.contains_secrets !== false || policy.normalized_public_layer_contains_individual_provider_data !== false) {
    throw new Error('CMS NPPES source policy does not satisfy the mandatory safe field/export contract.');
  }
  return { absolute, buffer, policy, sha256: sha256(buffer) };
}

async function readPointer(pointerPath, datasetId) {
  const pointerBuffer = await readFile(pointerPath);
  const pointer = JSON.parse(pointerBuffer.toString('utf8'));
  if (pointer.dataset_id !== datasetId || !pointer.release_id || !pointer.manifest) throw new Error(`Invalid ${datasetId} current pointer.`);
  const root = path.dirname(pointerPath);
  const manifestPath = path.resolve(root, pointer.manifest);
  assertContained(root, manifestPath, `${datasetId} manifest`);
  const manifestBuffer = await readFile(manifestPath);
  if (pointer.manifest_sha256 && sha256(manifestBuffer) !== pointer.manifest_sha256) throw new Error(`${datasetId} pointer manifest SHA-256 does not match.`);
  const manifest = JSON.parse(manifestBuffer.toString('utf8'));
  if (manifest.dataset_id !== datasetId || manifest.release_id !== pointer.release_id || manifest.status !== 'published') throw new Error(`Invalid ${datasetId} published manifest.`);
  return { pointer, pointerPath: path.resolve(pointerPath), pointerBuffer, manifest, manifestPath, manifestBuffer };
}

async function verifyArtifactSet(releaseDirectory, artifacts, label = 'artifact') {
  for (const artifact of artifacts ?? []) {
    const filename = path.resolve(releaseDirectory, artifact.path);
    assertContained(releaseDirectory, filename, `${label} ${artifact.path}`);
    const actual = await hashFile(filename);
    if (actual.bytes !== artifact.bytes || actual.sha256 !== artifact.sha256) throw new Error(`${label} ${artifact.path} failed byte or SHA-256 verification.`);
  }
}

async function loadNppesDependency(sourcePointerPath, signal) {
  checkCancelled(signal);
  const source = await readPointer(sourcePointerPath, 'cms-nppes-organizations');
  const sourceReleaseDirectory = path.dirname(source.manifestPath);
  if (source.manifest.complete_cms_monthly_source_snapshot !== true) throw new Error('NPPES dependency is not a complete CMS monthly source snapshot.');
  if (source.manifest.source_release_id === undefined || source.manifest.source_release_id === null) throw new Error('NPPES dependency is missing source release identity.');
  const organizationArtifacts = (source.manifest.artifacts ?? []).filter((item) => item.artifact_type === 'normalized-nppes-organization-jsonl-gzip').sort((left, right) => left.path.localeCompare(right.path));
  if (organizationArtifacts.length !== 11) throw new Error('NPPES dependency must contain ten ZIP-prefix organization artifacts plus the no-ZIP partition.');
  const zipArtifact = source.manifest.artifacts.find((item) => item.artifact_type === 'nppes-organization-zip-coverage-jsonl');
  if (!zipArtifact) throw new Error('NPPES dependency has no governed ZIP coverage artifact.');
  await verifyArtifactSet(sourceReleaseDirectory, [...organizationArtifacts, zipArtifact], 'NPPES dependency artifact');
  return {
    ...source,
    sourceReleaseDirectory,
    organizationArtifacts,
    zipArtifact,
    pointerSha256: sha256(source.pointerBuffer),
    manifestSha256: sha256(source.manifestBuffer),
  };
}

function validateNppesOrganizationRecord(record, dependency) {
  if (!record || record.schema_version !== '1.0.0' || record.export_policy !== 'public') throw new Error('NPPES pharmacy candidate is not a public normalized organization record.');
  const npi = record.external_identifiers?.find((item) => item?.type === 'npi')?.value;
  if (!/^\d{10}$/.test(npi ?? '') || record.normalized_record_id !== `cms-nppes:${npi}:primary` || record.entity_candidates?.identity_status !== 'provisional' || record.entity_candidates?.organization_id !== `organization:cms_npi_${npi}`) throw new Error(`NPPES pharmacy candidate has an invalid organization/NPI identity ${npi ?? '(missing)'}.`);
  if (!Array.isArray(record.external_identifiers) || record.external_identifiers.length !== 1 || record.external_identifiers[0]?.type !== 'npi' || record.external_identifiers[0]?.value !== npi || record.external_identifiers[0]?.source_field !== 'NPI') throw new Error(`NPPES pharmacy candidate ${npi} exposes an unsupported external identifier.`);
  const provenance = record.provenance;
  if (provenance?.source_id !== 'cms-nppes-monthly-v2' || provenance.source_release_id !== dependency.manifest.source_release_id || provenance.source_record_id !== `${npi}:primary` || provenance.policy_id !== 'cms-nppes-organizations' || provenance.transformation_version !== 'cms-nppes-organizations@1.0.1' || !provenance.ingest_run_id) throw new Error(`NPPES pharmacy candidate ${npi} has invalid provenance.`);
  if (!NPPES_NPI_STATUS_VALUES.has(record.npi_status?.value) || !String(record.npi_status.scope ?? '').startsWith('NPI enumeration status only;')) throw new Error(`NPPES pharmacy candidate ${npi} has an invalid NPI status scope.`);
  if (record.observed_at !== dependency.manifest.observed_at) throw new Error(`NPPES pharmacy candidate ${npi} has an unexpected observation time.`);
  if (!Array.isArray(record.healthcare_taxonomies) || record.healthcare_taxonomies.length < 1 || record.healthcare_taxonomies.length > 15 || record.healthcare_taxonomies.some((item) => !/^[0-9A-Z]{10}$/.test(item?.code ?? '') || typeof item.primary !== 'boolean')) throw new Error(`NPPES pharmacy candidate ${npi} has an invalid taxonomy shape.`);
  const address = record.primary_practice_location?.address;
  if (address != null) {
    exactKeys(address, ADDRESS_KEYS, `NPPES pharmacy candidate ${npi} address`);
    if (address.country !== 'US' || !/^[A-Z]{2}$/.test(address.state ?? '') || !/^\d{5}$/.test(address.zip_code ?? '') || (address.zip4 !== null && !/^\d{4}$/.test(address.zip4 ?? '')) || address.postal_code !== address.zip_code) throw new Error(`NPPES pharmacy candidate ${npi} has an invalid normalized primary address.`);
    const geography = record.primary_practice_location?.geography;
    exactKeys(geography, GEOGRAPHY_KEYS, `NPPES pharmacy candidate ${npi} geography`);
    if (geography.zip_code !== address.zip_code || !['2020-zcta-polygon-available', 'no-2020-zcta-polygon'].includes(geography.zcta_match_status)) throw new Error(`NPPES pharmacy candidate ${npi} has an invalid governed ZIP/ZCTA relationship.`);
    if (geography.zcta_match_status === '2020-zcta-polygon-available' && (!/^\d{5}$/.test(geography.zcta_geoid ?? '') || geography.zcta_geo_id !== `zcta:${geography.zcta_geoid}`)) throw new Error(`NPPES pharmacy candidate ${npi} has an invalid ZCTA identity.`);
  } else if (record.primary_practice_location !== null) throw new Error(`NPPES pharmacy candidate ${npi} has an invalid missing-address shape.`);
  return npi;
}

async function readGzipJsonl(filename, consume, signal) {
  const lines = createInterface({ input: createReadStream(filename).pipe(createGunzip()), crlfDelay: Infinity });
  let count = 0;
  for await (const line of lines) {
    checkCancelled(signal);
    if (!line) continue;
    await consume(JSON.parse(line), count + 1);
    count += 1;
  }
  return count;
}

function hasTaxonomy(record, code) {
  return (record.healthcare_taxonomies ?? []).some((item) => String(item.code ?? '').trim().toUpperCase() === code);
}

function selectedTaxonomies(record) {
  return (record.healthcare_taxonomies ?? [])
    .filter((item) => [COMMUNITY_RETAIL_TAXONOMY, MAIL_ORDER_TAXONOMY].includes(String(item.code ?? '').trim().toUpperCase()))
    .map((item) => ({ code: String(item.code).trim().toUpperCase(), primary: item.primary === true }));
}

function pharmacyRecord(record, context) {
  const npi = record.external_identifiers?.find((item) => item.type === 'npi')?.value ?? null;
  const address = record.primary_practice_location?.address ?? null;
  const selected = selectedTaxonomies(record);
  const mailOrderAssertions = selected.filter((item) => item.code === MAIL_ORDER_TAXONOMY);
  return {
    schema_version: NPPES_PHARMACY_SCHEMA_VERSION,
    pharmacy_record_id: `cms-nppes-community-retail-pharmacy:${npi}`,
    organization_id: record.entity_candidates?.organization_id ?? null,
    npi,
    legal_business_name: record.legal_business_name ?? null,
    other_organization_name: record.other_organization_name ?? null,
    source_reported_parent_organization_name: record.parent_organization_name ?? null,
    address: address ? {
      street: address.street ?? null,
      unit_or_additional: address.unit_or_additional ?? null,
      city: address.city ?? null,
      state: address.state ?? null,
      zip_code: address.zip_code ?? null,
      zip4: address.zip4 ?? null,
      country: address.country ?? 'US',
    } : null,
    geography: address ? {
      zip_code: address.zip_code ?? null,
      zip4: address.zip4 ?? null,
      zcta_match_status: record.primary_practice_location?.geography?.zcta_match_status ?? 'not-governed',
      zcta_geoid: record.primary_practice_location?.geography?.zcta_geoid ?? null,
      zcta_geo_id: record.primary_practice_location?.geography?.zcta_geo_id ?? null,
    } : null,
    taxonomy_assertions: selected,
    mail_order_taxonomy_assertions: mailOrderAssertions.length ? mailOrderAssertions : null,
    claims: {
      entity_type_2_organization: true,
      npi_status: record.npi_status?.value ?? null,
      unique_business: null,
      current_operation: null,
      physical_site: false,
      governed_geocode: false,
      nationwide_completeness: false,
      nabp_number: null,
      ncpdp_number: null,
      drive_through: null,
      network_affiliation: null,
      parent_company: null,
    },
    temporal: {
      npi_status: record.npi_status?.value ?? null,
      provider_enumeration_date: record.provider_enumeration_date ?? null,
      source_last_update_date: record.source_last_update_date ?? null,
      source_through_date: context.sourceThroughDate ?? null,
      retrieved_at: context.retrievedAt ?? null,
      observed_at: context.observedAt,
    },
    provenance: {
      ...record.provenance,
      projection_source_dataset_id: 'cms-nppes-organizations',
      projection_source_release_id: context.sourceReleaseId,
      projection_transformation_version: NPPES_PHARMACY_TRANSFORMATION,
      projection_policy_id: 'cms-nppes-community-retail-pharmacy',
    },
    observed_at: context.observedAt,
    export_policy: 'public-normalized-source-evidence',
  };
}

async function openWriter(stagingDirectory, relativePath) {
  const destination = path.join(stagingDirectory, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp`;
  const output = createWriteStream(temporary, { flags: 'wx' });
  const gzip = createGzip();
  // One writer is retained for each NPI prefix for the full scan; each can
  // legitimately have many backpressure/error waiters during a large build.
  gzip.setMaxListeners(0);
  gzip.pipe(output);
  return { destination, temporary, relativePath, output, gzip, records: 0 };
}

async function writeRecord(writer, record) {
  if (!writer.gzip.write(`${JSON.stringify(record)}\n`)) await new Promise((resolve, reject) => { writer.gzip.once('drain', resolve); writer.gzip.once('error', reject); });
  writer.records += 1;
}

async function closeWriter(writer, artifactType) {
  const done = finished(writer.output);
  writer.gzip.end();
  await done;
  await rename(writer.temporary, writer.destination);
  return { path: writer.relativePath.replaceAll('\\', '/'), ...(await hashFile(writer.destination)), record_count: writer.records, artifact_type: artifactType, export_policy: 'public-normalized-source-evidence' };
}

function emptyZipRow(zipCode, baseline) {
  return {
    schema_version: NPPES_PHARMACY_SCHEMA_VERSION,
    zip_code: zipCode,
    zip4: null,
    reported_address_count: 0,
    unique_npi_count: 0,
    reported_zip4_count: 0,
    mail_order_taxonomy_assertion_count: 0,
    zcta_membership: baseline?.geography ? {
      status: baseline.geography.status ?? 'not-governed',
      geoid: baseline.geography.geoid ?? baseline.geography.zcta_geoid ?? null,
      geo_id: baseline.geography.geo_id ?? baseline.geography.zcta_geo_id ?? null,
    } : { status: 'not-governed', geoid: null, geo_id: null },
    source_reported_zip5_only: true,
    zip4_separate_field: true,
    claims: { current_operation: null, physical_site: false, governed_geocode: false, complete_zip5_pharmacy_coverage: false },
  };
}

function emptyStateRow(state) {
  return {
    schema_version: NPPES_PHARMACY_SCHEMA_VERSION,
    state,
    reported_address_count: 0,
    unique_npi_count: 0,
    reported_zip5_count: 0,
    mail_order_taxonomy_assertion_count: 0,
    source_reported_state_aggregate: true,
    claims: { current_operation: null, physical_site: false, governed_geocode: false, complete_state_pharmacy_coverage: false },
  };
}

function expectedProjectionArtifactPaths() {
  return new Set([
    ...'0123456789'.split('').map((prefix) => `derived/pharmacies/npi-prefix=${prefix}.jsonl.gz`),
    'derived/state-aggregates.json', 'derived/zip5-aggregates.jsonl', 'derived/source-summary.json',
  ]);
}

function expectedSourceArtifactPaths() {
  return new Set([
    ...'0123456789'.split('').map((prefix) => `derived/organizations/prefix=${prefix}.jsonl.gz`),
    'derived/organizations/no-valid-us-zip.jsonl.gz', 'derived/zip-coverage.jsonl',
  ]);
}

function validateProjectionManifest(manifest) {
  const failures = [];
  if (manifest.schema_version !== NPPES_PHARMACY_SCHEMA_VERSION || manifest.dataset_id !== 'cms-nppes-community-retail-pharmacies' || manifest.status !== 'published' || manifest.connector?.id !== 'cms-nppes-community-retail-pharmacy' || manifest.connector?.version !== '1.0.0') failures.push({ path: 'manifest.json', reason: 'projection schema, dataset, status, or connector contract mismatch' });
  const selection = manifest.selection;
  if (selection?.entity_type_code !== '2' || selection.required_taxonomy_code !== COMMUNITY_RETAIL_TAXONOMY || selection.mail_order_taxonomy_code !== MAIL_ORDER_TAXONOMY || selection.source_dataset_id !== 'cms-nppes-organizations') failures.push({ path: 'manifest.json', reason: 'selection contract mismatch' });
  const claims = manifest.claims;
  if (!claims || claims.unique_business !== null || claims.current_operation !== null || claims.physical_site !== false || claims.nationwide_completeness !== false || claims.governed_geocode !== false || claims.nabp_number !== null || claims.ncpdp_number !== null || claims.drive_through !== null || claims.network_affiliation !== null || claims.parent_company !== null || claims.mail_order_only_from_source_taxonomy !== true) failures.push({ path: 'manifest.json', reason: 'pharmacy claim boundary mismatch' });
  if (manifest.policy?.id !== NPPES_PHARMACY_POLICY_ID || manifest.policy.version !== '1.0.0' || manifest.policy.export_policy !== 'public-normalized-source-evidence' || manifest.policy.raw_source_retained !== false || manifest.policy.network_requests_performed !== 0) failures.push({ path: 'manifest.json', reason: 'projection policy boundary mismatch' });
  const artifacts = manifest.artifacts;
  const expected = expectedProjectionArtifactPaths();
  if (!Array.isArray(artifacts) || artifacts.length !== expected.size || new Set(artifacts.map((item) => item.path)).size !== expected.size || artifacts.some((item) => !expected.has(item.path))) failures.push({ path: 'manifest.json', reason: 'projection artifact set is not exactly ten NPI partitions plus three aggregate artifacts' });
  if (Array.isArray(artifacts)) {
    for (const artifact of artifacts) {
      const expectedType = artifact.path.startsWith('derived/pharmacies/') ? 'normalized-nppes-community-retail-pharmacy-jsonl-gzip' : artifact.path === 'derived/state-aggregates.json' ? 'nppes-community-retail-pharmacy-state-aggregate-json' : artifact.path === 'derived/zip5-aggregates.jsonl' ? 'nppes-community-retail-pharmacy-zip5-aggregate-jsonl' : 'nppes-community-retail-pharmacy-source-summary';
      if (artifact.artifact_type !== expectedType || !/^[a-f0-9]{64}$/.test(artifact.sha256 ?? '') || !Number.isSafeInteger(artifact.bytes) || artifact.bytes < 1 || artifact.export_policy === 'internal-source-snapshot') failures.push({ path: artifact.path, reason: 'projection artifact metadata or export policy mismatch' });
    }
  }
  return failures;
}

function validateSourceDependencyManifest(manifest) {
  const failures = [];
  const dependencies = manifest.dependencies;
  const sourceArtifacts = dependencies?.nppes_organizations_artifacts;
  const expected = expectedSourceArtifactPaths();
  if (!Array.isArray(sourceArtifacts) || sourceArtifacts.length !== expected.size || new Set(sourceArtifacts.map((item) => item.path)).size !== expected.size || sourceArtifacts.some((item) => !expected.has(item.path))) failures.push({ path: 'dependencies', reason: 'NPPES dependency artifact set is not exactly eleven organization/ZIP artifacts' });
  const policy = dependencies?.source_policy;
  if (!policy?.path || !/^[a-f0-9]{64}$/.test(policy.sha256 ?? '') || policy.policy_id !== 'cms-nppes-organizations' || policy.version !== '1.0.0') failures.push({ path: 'dependencies', reason: 'exact CMS NPPES source-policy dependency is missing or malformed' });
  return failures;
}

function validateProjectionRecord(record, manifest) {
  if (!record || record.schema_version !== NPPES_PHARMACY_SCHEMA_VERSION || record.export_policy !== 'public-normalized-source-evidence' || record.pharmacy_record_id !== `cms-nppes-community-retail-pharmacy:${record.npi}` || !/^\d{10}$/.test(record.npi ?? '')) throw new Error(`invalid pharmacy record identity ${record?.npi ?? '(missing)'}`);
  if (!record.provenance || record.provenance.projection_source_dataset_id !== 'cms-nppes-organizations' || record.provenance.projection_source_release_id !== manifest.dependencies.nppes_organizations_manifest.release_id || record.provenance.projection_transformation_version !== NPPES_PHARMACY_TRANSFORMATION || record.provenance.projection_policy_id !== NPPES_PHARMACY_POLICY_ID || record.provenance.source_record_id !== `${record.npi}:primary`) throw new Error(`invalid pharmacy provenance ${record.npi}`);
  if (!NPPES_NPI_STATUS_VALUES.has(record.temporal?.npi_status) || record.temporal.observed_at !== manifest.observed_at || record.temporal.source_through_date !== manifest.source_through_date || record.temporal.retrieved_at == null) throw new Error(`invalid pharmacy temporal evidence ${record.npi}`);
  if (!record.claims || record.claims.unique_business !== null || record.claims.current_operation !== null || record.claims.physical_site !== false || record.claims.governed_geocode !== false || record.claims.nationwide_completeness !== false || record.claims.nabp_number !== null || record.claims.ncpdp_number !== null || record.claims.drive_through !== null || record.claims.network_affiliation !== null || record.claims.parent_company !== null) throw new Error(`invalid pharmacy claim boundary ${record.npi}`);
  const retail = (record.taxonomy_assertions ?? []).filter((item) => item.code === COMMUNITY_RETAIL_TAXONOMY);
  const mail = record.mail_order_taxonomy_assertions;
  if (!retail.length || retail.some((item) => typeof item.primary !== 'boolean') || (mail !== null && (!Array.isArray(mail) || mail.some((item) => item.code !== MAIL_ORDER_TAXONOMY || typeof item.primary !== 'boolean')))) throw new Error(`invalid pharmacy taxonomy assertions ${record.npi}`);
  if (record.address === null) {
    if (record.geography !== null) throw new Error(`unassigned pharmacy has geography ${record.npi}`);
  } else {
    exactKeys(record.address, ADDRESS_KEYS, `pharmacy ${record.npi} address`);
    if (record.address.country !== 'US' || !/^[A-Z]{2}$/.test(record.address.state ?? '') || !/^\d{5}$/.test(record.address.zip_code ?? '') || (record.address.zip4 !== null && !/^\d{4}$/.test(record.address.zip4 ?? ''))) throw new Error(`invalid pharmacy address ${record.npi}`);
    exactKeys(record.geography, new Set(['zip_code', 'zip4', 'zcta_match_status', 'zcta_geoid', 'zcta_geo_id']), `pharmacy ${record.npi} geography`);
    if (record.geography.zip_code !== record.address.zip_code || record.geography.zip4 !== record.address.zip4 || !['2020-zcta-polygon-available', 'no-2020-zcta-polygon'].includes(record.geography.zcta_match_status)) throw new Error(`invalid pharmacy geography ${record.npi}`);
  }
  return { retailOccurrences: retail.length, retailPrimary: retail.some((item) => item.primary), mailOccurrences: mail?.length ?? 0, mailOrganization: (mail?.length ?? 0) > 0 };
}

function compareAggregate(actual, expected, pathName, failures) {
  if (!isDeepStrictEqual(actual, expected)) failures.push({ path: pathName, reason: 'aggregate semantics do not reconcile with normalized pharmacy rows' });
}

export async function buildCmsNppesCommunityRetailPharmacies({
  outputRoot = 'data/business-sources/cms-nppes-community-retail-pharmacies',
  sourcePointer = 'data/business-sources/cms-nppes-organizations/current.json',
  sourcePolicy = NPPES_PHARMACY_SOURCE_POLICY_PATH,
  logger = () => {},
  now = () => new Date(),
  signal,
} = {}) {
  if (!outputRoot || !sourcePointer) throw new Error('outputRoot and sourcePointer are required.');
  const observedAt = now().toISOString();
  const sourcePointerAbsolute = path.resolve(sourcePointer);
  assertContained(APP_ROOT, sourcePointerAbsolute, 'NPPES source pointer');
  const dependency = await loadNppesDependency(sourcePointerAbsolute, signal);
  const policy = await loadSourcePolicy(path.resolve(sourcePolicy));
  const runId = `${observedAt.replaceAll(/[-:.]/g, '').replace('T', '-').replace('Z', 'Z')}-${Math.random().toString(16).slice(2, 10)}`;
  const releaseId = `cms-nppes-community-retail-pharmacies-${runId}`;
  const root = path.resolve(outputRoot);
  assertContained(APP_ROOT, root, 'pharmacy projection output');
  const stagingDirectory = path.join(root, '.staging', runId);
  const releaseDirectory = path.join(root, 'releases', releaseId);
  await mkdir(stagingDirectory, { recursive: true });
  const writers = new Map();
  for (const prefix of '0123456789') writers.set(prefix, await openWriter(stagingDirectory, `derived/pharmacies/npi-prefix=${prefix}.jsonl.gz`));
  const recordsByZip = new Map();
  const recordsByState = new Map(STATE_CODES.map((state) => [state, emptyStateRow(state)]));
  const zipRows = new Map();
  let accepted = 0;
  let withAddress = 0;
  let mailOrderAssertions = 0;
  let retailTaxonomyOccurrences = 0;
  let retailPrimaryRows = 0;
  let mailOrderOrganizationRows = 0;
  let repeatedRetailTaxonomyExcess = 0;
  let exactZctaRows = 0;
  let nonPolygonRows = 0;
  let unassignedRows = 0;
  const npiSet = new Set();
  try {
    for (const artifact of dependency.organizationArtifacts) {
      checkCancelled(signal);
      const filename = path.join(dependency.sourceReleaseDirectory, artifact.path);
      await readGzipJsonl(filename, async (record) => {
        checkCancelled(signal);
        if (!hasTaxonomy(record, COMMUNITY_RETAIL_TAXONOMY)) return;
        validateNppesOrganizationRecord(record, dependency);
        const npi = record.external_identifiers?.find((item) => item.type === 'npi')?.value;
        if (!/^\d{10}$/.test(npi ?? '') || npiSet.has(npi)) throw new Error(`Invalid or duplicate pharmacy NPI ${npi ?? '(missing)'}.`);
        npiSet.add(npi);
        const normalized = pharmacyRecord(record, { sourceReleaseId: dependency.manifest.release_id, sourceThroughDate: dependency.manifest.source_through_date, retrievedAt: dependency.manifest.retrieved_at, observedAt });
        await writeRecord(writers.get(npi[0]), normalized);
        accepted += 1;
        const retailAssertions = normalized.taxonomy_assertions.filter((item) => item.code === COMMUNITY_RETAIL_TAXONOMY);
        retailTaxonomyOccurrences += retailAssertions.length;
        repeatedRetailTaxonomyExcess += Math.max(0, retailAssertions.length - 1);
        if (retailAssertions.some((item) => item.primary)) retailPrimaryRows += 1;
        const address = normalized.address;
        const mailAssertions = normalized.mail_order_taxonomy_assertions ?? [];
        const mail = mailAssertions.length > 0;
        mailOrderAssertions += mailAssertions.length;
        if (mail) mailOrderOrganizationRows += 1;
        if (address?.zip_code) {
          withAddress += 1;
          if (normalized.geography?.zcta_match_status === '2020-zcta-polygon-available') exactZctaRows += 1;
          else if (normalized.geography?.zcta_match_status === 'no-2020-zcta-polygon') nonPolygonRows += 1;
          else unassignedRows += 1;
          const zip = recordsByZip.get(address.zip_code) ?? { ...emptyZipRow(address.zip_code, null), _npis: new Set() };
          zip._npis.add(npi);
          zip.reported_address_count += 1;
          zip.unique_npi_count = zip._npis.size;
          zip.mail_order_taxonomy_assertion_count += mailAssertions.length;
          zip.reported_zip4_count += address.zip4 ? 1 : 0;
          zip.zcta_membership = normalized.geography ? { status: normalized.geography.zcta_match_status, geoid: normalized.geography.zcta_geoid, geo_id: normalized.geography.zcta_geo_id } : zip.zcta_membership;
          recordsByZip.set(address.zip_code, zip);
          const state = recordsByState.get(address.state);
          if (state) {
            state.reported_address_count += 1;
            state.unique_npi_count += 1;
            state.reported_zip5_count = new Set([...(state._zips ?? []), address.zip_code]).size;
            state._zips = [...new Set([...(state._zips ?? []), address.zip_code])];
            state.mail_order_taxonomy_assertion_count += mailAssertions.length;
          }
        } else unassignedRows += 1;
      }, signal);
      logger(`Scanned ${artifact.path}; accepted ${accepted.toLocaleString('en-US')} community/retail pharmacy organizations.`);
    }
    const zipArtifactPath = path.join(dependency.sourceReleaseDirectory, dependency.zipArtifact.path);
    const zipLines = await readFile(zipArtifactPath, 'utf8');
    for (const line of zipLines.split(/\r?\n/).filter(Boolean)) {
      checkCancelled(signal);
      const baseline = JSON.parse(line);
      if (!/^\d{5}$/.test(baseline.zip_code)) continue;
      const row = recordsByZip.get(baseline.zip_code) ?? emptyZipRow(baseline.zip_code, baseline);
      if (row._npis) delete row._npis;
      if (!row.zcta_membership || row.zcta_membership.status === 'not-governed') row.zcta_membership = { status: baseline.geography?.status ?? 'not-governed', geoid: baseline.geography?.geoid ?? baseline.geography?.zcta_geoid ?? null, geo_id: baseline.geography?.geo_id ?? baseline.geography?.zcta_geo_id ?? null };
      zipRows.set(baseline.zip_code, row);
    }
    for (const [zip, row] of recordsByZip) {
      if (row._npis) delete row._npis;
      if (!zipRows.has(zip)) zipRows.set(zip, row);
    }
    const zipAggregateContent = [...zipRows.values()].sort((a, b) => a.zip_code.localeCompare(b.zip_code)).map((row) => JSON.stringify(row)).join('\n') + '\n';
    const stateAggregateContent = JSON.stringify({
      schema_version: NPPES_PHARMACY_SCHEMA_VERSION,
      rows: [...recordsByState.values()].sort((a, b) => a.state.localeCompare(b.state)).map((row) => { const copy = { ...row }; delete copy._zips; return copy; }),
    }) + '\n';
    const artifacts = [];
    for (const writer of writers.values()) artifacts.push(await closeWriter(writer, 'normalized-nppes-community-retail-pharmacy-jsonl-gzip'));
    const zipDestination = path.join(stagingDirectory, 'derived/zip5-aggregates.jsonl');
    await mkdir(path.dirname(zipDestination), { recursive: true });
    await writeFile(zipDestination, zipAggregateContent, 'utf8');
    artifacts.push({ path: 'derived/zip5-aggregates.jsonl', ...(await hashFile(zipDestination)), record_count: zipRows.size, artifact_type: 'nppes-community-retail-pharmacy-zip5-aggregate-jsonl', export_policy: 'public-aggregate-source-evidence' });
    const stateDestination = path.join(stagingDirectory, 'derived/state-aggregates.json');
    await writeFile(stateDestination, stateAggregateContent, 'utf8');
    artifacts.push({ path: 'derived/state-aggregates.json', ...(await hashFile(stateDestination)), record_count: recordsByState.size, artifact_type: 'nppes-community-retail-pharmacy-state-aggregate-json', export_policy: 'public-aggregate-source-evidence' });
    const summary = {
      schema_version: NPPES_PHARMACY_SCHEMA_VERSION,
      community_retail_taxonomy: COMMUNITY_RETAIL_TAXONOMY,
      mail_order_taxonomy: MAIL_ORDER_TAXONOMY,
      accepted_organization_rows: accepted,
      retail_taxonomy_occurrences: retailTaxonomyOccurrences,
      repeated_retail_taxonomy_excess: repeatedRetailTaxonomyExcess,
      retail_primary_taxonomy_rows: retailPrimaryRows,
      rows_with_reported_primary_address: withAddress,
      rows_without_reported_primary_address: accepted - withAddress,
      exact_zcta_membership_rows: exactZctaRows,
      nonpolygon_zip_rows: nonPolygonRows,
      unmatched_geography_rows: unassignedRows,
      mail_order_taxonomy_assertion_rows: mailOrderAssertions,
      mail_order_taxonomy_assertion_organization_rows: mailOrderOrganizationRows,
      reported_zip4_rows: [...recordsByZip.values()].reduce((sum, row) => sum + (row.reported_zip4_count ?? 0), 0),
      zip_union_rows: zipRows.size,
      positive_reported_zip5_count: [...recordsByZip.values()].filter((row) => row.reported_address_count > 0).length,
      exact_zcta_positive_zip5_count: [...recordsByZip.values()].filter((row) => row.reported_address_count > 0 && row.zcta_membership.status === '2020-zcta-polygon-available').length,
      nonpolygon_positive_zip5_count: [...recordsByZip.values()].filter((row) => row.reported_address_count > 0 && row.zcta_membership.status === 'no-2020-zcta-polygon').length,
      state_aggregate_rows: recordsByState.size,
    };
    const summaryDestination = path.join(stagingDirectory, 'derived/source-summary.json');
    await writeFile(summaryDestination, json(summary), 'utf8');
    artifacts.push({ path: 'derived/source-summary.json', ...(await hashFile(summaryDestination)), artifact_type: 'nppes-community-retail-pharmacy-source-summary', export_policy: 'public-aggregate-source-evidence' });
    const sourcePointerRelative = path.relative(process.cwd(), dependency.pointerPath).replaceAll('\\', '/');
    const sourceManifestRelative = path.relative(process.cwd(), dependency.manifestPath).replaceAll('\\', '/');
    const manifest = {
      schema_version: NPPES_PHARMACY_SCHEMA_VERSION,
      dataset_id: 'cms-nppes-community-retail-pharmacies',
      connector: { id: 'cms-nppes-community-retail-pharmacy', version: '1.0.0' },
      release_id: releaseId,
      run_id: runId,
      status: 'published',
      observed_at: observedAt,
      source_release_id: dependency.manifest.source_release_id,
      source_through_date: dependency.manifest.source_through_date ?? null,
      selection: { entity_type_code: '2', required_taxonomy_code: COMMUNITY_RETAIL_TAXONOMY, mail_order_taxonomy_code: MAIL_ORDER_TAXONOMY, source_dataset_id: 'cms-nppes-organizations' },
      coverage: { accepted_organization_rows: accepted, retail_taxonomy_occurrences: retailTaxonomyOccurrences, repeated_retail_taxonomy_excess: repeatedRetailTaxonomyExcess, retail_primary_taxonomy_rows: retailPrimaryRows, rows_with_reported_primary_address: withAddress, rows_without_reported_primary_address: accepted - withAddress, reported_zip4_rows: [...recordsByZip.values()].reduce((sum, row) => sum + (row.reported_zip4_count ?? 0), 0), exact_zcta_membership_rows: exactZctaRows, nonpolygon_zip_rows: nonPolygonRows, unmatched_geography_rows: unassignedRows, mail_order_taxonomy_assertion_rows: mailOrderAssertions, mail_order_taxonomy_assertion_organization_rows: mailOrderOrganizationRows, zip_union_rows: zipRows.size, positive_reported_zip5_count: [...recordsByZip.values()].filter((row) => row.reported_address_count > 0).length, exact_zcta_positive_zip5_count: [...recordsByZip.values()].filter((row) => row.reported_address_count > 0 && row.zcta_membership.status === '2020-zcta-polygon-available').length, nonpolygon_positive_zip5_count: [...recordsByZip.values()].filter((row) => row.reported_address_count > 0 && row.zcta_membership.status === 'no-2020-zcta-polygon').length, state_aggregate_rows: recordsByState.size },
      dependencies: {
        nppes_organizations_pointer: { path: sourcePointerRelative, sha256: dependency.pointerSha256, dataset_id: dependency.pointer.dataset_id, release_id: dependency.pointer.release_id },
        nppes_organizations_manifest: { path: sourceManifestRelative, sha256: dependency.manifestSha256, release_id: dependency.manifest.release_id },
        nppes_organizations_artifacts: [...dependency.organizationArtifacts, dependency.zipArtifact].map((item) => ({ path: item.path, bytes: item.bytes, sha256: item.sha256, artifact_type: item.artifact_type })),
        source_policy: { path: path.relative(process.cwd(), policy.absolute).replaceAll('\\', '/'), sha256: policy.sha256, policy_id: policy.policy.policy_id, version: policy.policy.version },
      },
      source: { publisher: 'U.S. Centers for Medicare & Medicaid Services', source_policy: 'config/source-policies/cms-nppes-organizations.json', attribution: 'Source: CMS National Plan and Provider Enumeration System (NPPES) Data Dissemination V2.' },
      policy: { id: NPPES_PHARMACY_POLICY_ID, version: '1.0.0', export_policy: 'public-normalized-source-evidence', raw_source_retained: false, network_requests_performed: 0 },
      claims: { unique_business: null, current_operation: null, physical_site: false, nationwide_completeness: false, governed_geocode: false, nabp_number: null, ncpdp_number: null, drive_through: null, network_affiliation: null, parent_company: null, mail_order_only_from_source_taxonomy: true },
      limitations: ['NPPES taxonomy and address fields are provider-reported source evidence, not proof of licensure, current operation, or an open physical site.', 'This projection is not a complete pharmacy directory and does not assert nationwide completeness.', 'ZIP5 and ZIP4 remain separate; ZIP5 aggregation uses reported primary practice addresses only.', 'ZCTA membership is copied only from the already-governed NPPES organization dependency; no pharmacy geocode or new polygon assignment is produced.', 'Mail-order is asserted only when source taxonomy 3336M0002X is present; it is never inferred from name or address.'],
      artifacts: artifacts.sort((a, b) => a.path.localeCompare(b.path)),
    };
    const manifestDestination = path.join(stagingDirectory, 'manifest.json');
    const manifestBuffer = Buffer.from(json(manifest), 'utf8');
    await writeFile(manifestDestination, manifestBuffer);
    await mkdir(path.dirname(releaseDirectory), { recursive: true });
    await rename(stagingDirectory, releaseDirectory);
    const pointerPath = path.join(root, 'current.json');
    const pointerTemporary = `${pointerPath}.tmp-${runId}`;
    await writeFile(pointerTemporary, json({ dataset_id: manifest.dataset_id, release_id: manifest.release_id, manifest: `releases/${releaseId}/manifest.json`, manifest_sha256: sha256(manifestBuffer), updated_at: observedAt }), 'utf8');
    await rename(pointerTemporary, pointerPath);
    return { manifest, releaseDirectory, pointerPath };
  } catch (error) {
    await rm(stagingDirectory, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

export async function verifyCmsNppesCommunityRetailPharmacies(pointerPath = 'data/business-sources/cms-nppes-community-retail-pharmacies/current.json') {
  const projectionPointerPath = path.resolve(pointerPath);
  assertContained(APP_ROOT, projectionPointerPath, 'pharmacy projection pointer');
  const projection = await readPointer(projectionPointerPath, 'cms-nppes-community-retail-pharmacies');
  const failures = [...validateProjectionManifest(projection.manifest), ...validateSourceDependencyManifest(projection.manifest)];
  const manifest = projection.manifest;
  const dependency = manifest.dependencies?.nppes_organizations_pointer;
  const dependencyManifest = manifest.dependencies?.nppes_organizations_manifest;
  let source = null;
  if (!dependency || !dependencyManifest) failures.push({ path: 'manifest.json', reason: 'missing exact NPPES pointer and manifest dependency hashes' });
  else {
    try {
      const sourcePointerPath = path.resolve(dependency.path);
      assertContained(APP_ROOT, sourcePointerPath, 'NPPES dependency pointer');
      source = await readPointer(sourcePointerPath, 'cms-nppes-organizations');
      if (sha256(source.pointerBuffer) !== dependency.sha256 || sha256(source.manifestBuffer) !== dependencyManifest.sha256 || source.pointer.release_id !== dependency.release_id || source.manifest.release_id !== dependencyManifest.release_id) failures.push({ path: 'dependencies', reason: 'NPPES pointer or manifest hash/release mismatch' });
      const policy = manifest.dependencies?.source_policy;
      const sourcePolicy = await loadSourcePolicy(path.resolve(policy.path));
      if (sourcePolicy.sha256 !== policy.sha256 || sourcePolicy.policy.policy_id !== policy.policy_id || sourcePolicy.policy.version !== policy.version) failures.push({ path: policy.path, reason: 'CMS NPPES source policy bytes/hash drifted' });
      const sourceArtifacts = manifest.dependencies.nppes_organizations_artifacts ?? [];
      await verifyArtifactSet(path.dirname(source.manifestPath), sourceArtifacts, 'NPPES dependency artifact');
      const expectedSource = expectedSourceArtifactPaths();
      if (sourceArtifacts.length !== expectedSource.size || new Set(sourceArtifacts.map((item) => item.path)).size !== expectedSource.size || sourceArtifacts.some((item) => !expectedSource.has(item.path))) failures.push({ path: 'dependencies', reason: 'NPPES dependency artifact set drifted' });
    } catch (error) { failures.push({ path: 'dependencies', reason: error.message }); }
  }
  try { await verifyArtifactSet(path.dirname(projection.manifestPath), manifest.artifacts, 'Projection artifact'); }
  catch (error) { failures.push({ path: 'artifacts', reason: error.message }); }

  const rows = [];
  const pharmacyArtifacts = (manifest.artifacts ?? []).filter((item) => item.artifact_type === 'normalized-nppes-community-retail-pharmacy-jsonl-gzip').sort((a, b) => a.path.localeCompare(b.path));
  const npiSet = new Set();
  const byZip = new Map();
  const byState = new Map(STATE_CODES.map((state) => [state, emptyStateRow(state)]));
  let retailOccurrences = 0, repeatedRetailExcess = 0, retailPrimaryRows = 0, addressRows = 0, exactZctaRows = 0, nonpolygonRows = 0, unmatchedRows = 0, mailOccurrences = 0, mailOrganizationRows = 0, reportedZip4Rows = 0;
  for (const artifact of pharmacyArtifacts) {
    try {
      await readGzipJsonl(path.join(path.dirname(projection.manifestPath), artifact.path), async (record) => {
        const npi = record.npi;
        const counts = validateProjectionRecord(record, manifest);
        if (npiSet.has(npi)) throw new Error(`duplicate pharmacy NPI ${npi}`);
        npiSet.add(npi); rows.push(record);
        retailOccurrences += counts.retailOccurrences; repeatedRetailExcess += Math.max(0, counts.retailOccurrences - 1); if (counts.retailPrimary) retailPrimaryRows += 1; mailOccurrences += counts.mailOccurrences; if (counts.mailOrganization) mailOrganizationRows += 1;
        if (record.address?.zip_code) {
          addressRows += 1; if (record.address.zip4) reportedZip4Rows += 1;
          if (record.geography.zcta_match_status === '2020-zcta-polygon-available') exactZctaRows += 1; else if (record.geography.zcta_match_status === 'no-2020-zcta-polygon') nonpolygonRows += 1; else unmatchedRows += 1;
          const zip = byZip.get(record.address.zip_code) ?? { ...emptyZipRow(record.address.zip_code, null), _npis: new Set() }; zip._npis.add(npi); zip.reported_address_count += 1; zip.unique_npi_count = zip._npis.size; zip.reported_zip4_count += record.address.zip4 ? 1 : 0; zip.mail_order_taxonomy_assertion_count += counts.mailOccurrences; zip.zcta_membership = { status: record.geography.zcta_match_status, geoid: record.geography.zcta_geoid, geo_id: record.geography.zcta_geo_id }; byZip.set(record.address.zip_code, zip);
          const state = byState.get(record.address.state); if (!state) throw new Error(`pharmacy has unsupported state ${record.address.state}`); state.reported_address_count += 1; state.unique_npi_count += 1; state.reported_zip5_count = (state._zips ?? []).includes(record.address.zip_code) ? state.reported_zip5_count : state.reported_zip5_count + 1; state._zips = [...(state._zips ?? []), record.address.zip_code]; state.mail_order_taxonomy_assertion_count += counts.mailOccurrences;
        } else unmatchedRows += 1;
      });
    } catch (error) { failures.push({ path: artifact.path, reason: error.message }); }
  }
  const expected = manifest.coverage ?? {};
  const totals = { accepted_organization_rows: rows.length, retail_taxonomy_occurrences: retailOccurrences, repeated_retail_taxonomy_excess: repeatedRetailExcess, retail_primary_taxonomy_rows: retailPrimaryRows, rows_with_reported_primary_address: addressRows, rows_without_reported_primary_address: rows.length - addressRows, reported_zip4_rows: reportedZip4Rows, exact_zcta_membership_rows: exactZctaRows, nonpolygon_zip_rows: nonpolygonRows, unmatched_geography_rows: unmatchedRows, mail_order_taxonomy_assertion_rows: mailOccurrences, mail_order_taxonomy_assertion_organization_rows: mailOrganizationRows };
  for (const [key, actual] of Object.entries(totals)) if (actual !== expected[key]) failures.push({ path: 'manifest.json', reason: `${key} conservation mismatch` });

  let sourceZipRows = [];
  if (source) {
    try {
      const zipDependency = manifest.dependencies.nppes_organizations_artifacts.find((item) => item.path === 'derived/zip-coverage.jsonl');
      sourceZipRows = (await readFile(path.join(path.dirname(source.manifestPath), zipDependency.path), 'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse);
    } catch (error) { failures.push({ path: 'derived/zip-coverage.jsonl', reason: `unable to read source ZIP baseline: ${error.message}` }); }
  }
  const expectedZipCodes = new Set(sourceZipRows.map((row) => row.zip_code)); for (const zip of byZip.keys()) expectedZipCodes.add(zip);
  const zipArtifact = manifest.artifacts?.find((item) => item.artifact_type === 'nppes-community-retail-pharmacy-zip5-aggregate-jsonl');
  const actualZipRows = [];
  if (!zipArtifact) failures.push({ path: 'derived/zip5-aggregates.jsonl', reason: 'missing ZIP5 aggregate artifact' });
  else {
    try { const lines = (await readFile(path.join(path.dirname(projection.manifestPath), zipArtifact.path), 'utf8')).split(/\r?\n/).filter(Boolean); for (const line of lines) actualZipRows.push(JSON.parse(line)); }
    catch (error) { failures.push({ path: zipArtifact.path, reason: `invalid ZIP aggregate JSONL: ${error.message}` }); }
  }
  const actualZipSet = new Set(actualZipRows.map((row) => row.zip_code));
  if (actualZipRows.length !== expected.zip_union_rows || actualZipSet.size !== actualZipRows.length || actualZipSet.size !== expectedZipCodes.size || [...expectedZipCodes].some((zip) => !actualZipSet.has(zip))) failures.push({ path: zipArtifact?.path ?? 'derived/zip5-aggregates.jsonl', reason: 'ZIP union conservation mismatch' });
  const baselineByZip = new Map(sourceZipRows.map((row) => [row.zip_code, row]));
  for (const row of actualZipRows) {
    const baseline = baselineByZip.get(row.zip_code); const expectedRow = byZip.get(row.zip_code) ?? emptyZipRow(row.zip_code, baseline); if (expectedRow._npis) delete expectedRow._npis; if (baseline && (!expectedRow.zcta_membership || expectedRow.zcta_membership.status === 'not-governed')) expectedRow.zcta_membership = { status: baseline.geography?.status ?? 'not-governed', geoid: baseline.geography?.geoid ?? baseline.geography?.zcta_geoid ?? null, geo_id: baseline.geography?.geo_id ?? baseline.geography?.zcta_geo_id ?? null }; compareAggregate(row, expectedRow, `${zipArtifact?.path ?? 'derived/zip5-aggregates.jsonl'}:${row.zip_code}`, failures);
  }
  const positiveZips = [...byZip.values()].filter((row) => row.reported_address_count > 0); const distinctZipExpected = { zip_union_rows: expectedZipCodes.size, positive_reported_zip5_count: positiveZips.length, exact_zcta_positive_zip5_count: positiveZips.filter((row) => row.zcta_membership.status === '2020-zcta-polygon-available').length, nonpolygon_positive_zip5_count: positiveZips.filter((row) => row.zcta_membership.status === 'no-2020-zcta-polygon').length };
  for (const [key, actual] of Object.entries(distinctZipExpected)) if (actual !== expected[key]) failures.push({ path: 'manifest.json', reason: `${key} conservation mismatch` });

  const stateArtifact = manifest.artifacts?.find((item) => item.artifact_type === 'nppes-community-retail-pharmacy-state-aggregate-json');
  let actualStates = null;
  if (!stateArtifact) failures.push({ path: 'derived/state-aggregates.json', reason: 'missing state aggregate artifact' });
  else { try { actualStates = JSON.parse(await readFile(path.join(path.dirname(projection.manifestPath), stateArtifact.path), 'utf8')); } catch (error) { failures.push({ path: stateArtifact.path, reason: `invalid state aggregate JSON: ${error.message}` }); } }
  if (!actualStates || actualStates.schema_version !== NPPES_PHARMACY_SCHEMA_VERSION || !Array.isArray(actualStates.rows) || actualStates.rows.length !== STATE_CODES.length || new Set(actualStates.rows.map((row) => row.state)).size !== STATE_CODES.length || actualStates.rows.some((row) => !byState.has(row.state))) failures.push({ path: stateArtifact?.path ?? 'derived/state-aggregates.json', reason: 'state aggregate roster mismatch' });
  else for (const row of actualStates.rows) { const expectedRow = { ...byState.get(row.state) }; delete expectedRow._zips; compareAggregate(row, expectedRow, `${stateArtifact.path}:${row.state}`, failures); }
  const summaryArtifact = manifest.artifacts?.find((item) => item.artifact_type === 'nppes-community-retail-pharmacy-source-summary');
  if (!summaryArtifact) failures.push({ path: 'derived/source-summary.json', reason: 'missing source summary artifact' });
  else { try { const summary = JSON.parse(await readFile(path.join(path.dirname(projection.manifestPath), summaryArtifact.path), 'utf8')); const summaryKeys = ['community_retail_taxonomy', 'mail_order_taxonomy', ...Object.keys(totals), ...Object.keys(distinctZipExpected), 'state_aggregate_rows']; const summaryExpected = { community_retail_taxonomy: COMMUNITY_RETAIL_TAXONOMY, mail_order_taxonomy: MAIL_ORDER_TAXONOMY, ...totals, ...distinctZipExpected, state_aggregate_rows: STATE_CODES.length }; for (const key of summaryKeys) if (summary[key] !== summaryExpected[key]) failures.push({ path: `${summaryArtifact.path}:${key}`, reason: 'source summary semantic mismatch' }); } catch (error) { failures.push({ path: summaryArtifact.path, reason: `invalid source summary JSON: ${error.message}` }); } }
  if (failures.length) { const error = new Error(`CMS NPPES pharmacy release verification failed for ${failures.length} check(s).`); error.failures = failures; throw error; }
  return { dataset_id: manifest.dataset_id, release_id: manifest.release_id, source_release_id: manifest.source_release_id, coverage: manifest.coverage, artifact_count: manifest.artifacts.length };
}
