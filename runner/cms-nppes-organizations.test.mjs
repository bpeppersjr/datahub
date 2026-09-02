import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildCmsNppesOrganizations,
  normalizeNppesOrganization,
  normalizeNppesPracticeLocation,
  verifyCmsNppesOrganizations,
} from './cms-nppes-organizations.mjs';

function hash(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

const context = {
  runId: 'fixture-run',
  observedAt: '2026-08-30T15:00:00.000Z',
  sourceReleaseId: 'NPPES_Data_Dissemination_August_2026_V2',
  baselineByZip: new Map([['60601', { geography: { status: '2020-zcta-polygon-available', geo_id: 'zcta:60601', geoid: '60601' } }]]),
};

function organization(overrides = {}) {
  return {
    npi: '1234567890',
    entityType: '2',
    legalName: 'FIXTURE HEALTH LLC',
    otherName: 'FIXTURE CLINIC',
    otherNameType: '3',
    address1: '10 MAIN ST',
    address2: 'SUITE 2',
    city: 'CHICAGO',
    state: 'IL',
    postalCode: '606011234',
    country: 'US',
    telephone: '3125550100',
    enumerationDate: '01/02/2020',
    lastUpdateDate: '08/01/2026',
    deactivationDate: '',
    reactivationDate: '',
    organizationSubpart: 'N',
    parentOrganizationName: '',
    taxonomies: [{ code: '261Q00000X', primary: true }],
    ...overrides,
  };
}

test('normalizes an active organization NPI without claiming licensure or an open location', () => {
  const result = normalizeNppesOrganization(organization(), context);
  assert.equal(result.kind, 'active-organization');
  assert.equal(result.record.entity_candidates.organization_id, 'organization:cms_npi_1234567890');
  assert.equal(result.record.primary_practice_location.address.postal_code, '60601');
  assert.equal(result.record.primary_practice_location.address.zip4, '1234');
  assert.equal(result.record.other_organization_name_type, 'doing-business-as');
  assert.equal(result.record.npi_status.value, 'npi-active-as-of-source-release');
  assert.match(result.record.npi_status.scope, /does not prove a practice location is open/);
  assert.equal(result.record.provenance.policy_id, 'cms-nppes-organizations');
});

test('limits deactivated records and gives secondary practice locations stable identities', () => {
  const deactivated = normalizeNppesOrganization(organization({ entityType: '', legalName: '', deactivationDate: '08/10/2026' }), context);
  assert.equal(deactivated.kind, 'deactivated');
  assert.deepEqual(Object.keys(deactivated.record).sort(), ['export_policy', 'npi', 'npi_deactivation_date', 'schema_version', 'source_release_id'].sort());
  const fields = {
    npi: '1234567890',
    address1: '20 OAK AVE',
    address2: '',
    city: 'CHICAGO',
    state: 'IL',
    postalCode: '60602',
    country: 'US',
    telephone: '3125550101',
  };
  const first = normalizeNppesPracticeLocation(fields, context);
  const second = normalizeNppesPracticeLocation(fields, context);
  assert.equal(first.record.normalized_record_id, second.record.normalized_record_id);
  assert.match(first.record.source_status.scope, /not independent evidence.*currently open/);
});

test('preserves an unanswered organization-subpart code as unknown', () => {
  const result = normalizeNppesOrganization(organization({ organizationSubpart: 'X' }), context);
  assert.equal(result.record.organization_subpart, null);
});

async function writeFixtureSource(directory) {
  await mkdir(directory, { recursive: true });
  const mainHeaders = [
    'NPI',
    'Entity Type Code',
    'Provider Organization Name (Legal Business Name)',
    'Provider Other Organization Name',
    'Provider Other Organization Name Type Code',
    'Provider First Line Business Practice Location Address',
    'Provider Second Line Business Practice Location Address',
    'Provider Business Practice Location Address City Name',
    'Provider Business Practice Location Address State Name',
    'Provider Business Practice Location Address Postal Code',
    'Provider Business Practice Location Address Country Code (If outside U.S.)',
    'Provider Business Practice Location Address Telephone Number',
    'Provider Enumeration Date',
    'Last Update Date',
    'NPI Deactivation Date',
    'NPI Reactivation Date',
    'Healthcare Provider Taxonomy Code_1',
    'Healthcare Provider Primary Taxonomy Switch_1',
    'Is Organization Subpart',
    'Parent Organization LBN',
  ];
  const mainRows = [
    mainHeaders,
    ['1111111111', '2', 'ALPHA HEALTH LLC', 'ALPHA CLINIC', '3', '10 MAIN ST', '', 'CHICAGO', 'IL', '606011234', 'US', '3125550100', '01/01/2020', '08/01/2026', '', '', '261Q00000X', 'Y', 'N', ''],
    ['2222222222', '2', 'BETA HEALTH LLC', '', '', '', '', '', '', '', 'US', '', '01/01/2020', '08/01/2026', '', '', '282N00000X', 'Y', 'Y', 'PARENT HEALTH'],
    ['3333333333', '1', '', '', '', '30 ELM ST', '', 'CHICAGO', 'IL', '60603', 'US', '', '01/01/2020', '08/01/2026', '', '', '207Q00000X', 'Y', '', ''],
    ['4444444444', '', '', '', '', '', '', '', '', '', '', '', '', '', '08/10/2026', '', '', '', '', ''],
  ];
  const practiceRows = [
    ['NPI', 'Provider Secondary Practice Location Address- Address Line 1', 'Provider Secondary Practice Location Address-  Address Line 2', 'Provider Secondary Practice Location Address - City Name', 'Provider Secondary Practice Location Address - State Name', 'Provider Secondary Practice Location Address - Postal Code', 'Provider Secondary Practice Location Address - Country Code (If outside U.S.)', 'Provider Secondary Practice Location Address - Telephone Number'],
    ['2222222222', '20 OAK AVE', '', 'CHICAGO', 'IL', '60602', 'US', '3125550101'],
    ['3333333333', '30 ELM ST', '', 'CHICAGO', 'IL', '60603', 'US', '3125550102'],
  ];
  const nameRows = [
    ['NPI', 'Provider Other Organization Name', 'Provider Other Organization Name Type Code', 'Created Date'],
    ['1111111111', 'ALPHA CLINIC', '3', '01/01/2020'],
    ['2222222222', 'OLD BETA HEALTH', '4', '01/01/2020'],
    ['3333333333', 'INDIVIDUAL NAME', '5', '01/01/2020'],
  ];
  const endpointRows = [['NPI', 'Endpoint Type', 'Endpoint'], ['1111111111', 'DIRECT', 'example@example.test']];
  const definitions = [
    { kind: 'main', file: 'npidata_pfile_20050523-20260809.csv', rows: mainRows },
    { kind: 'other-names', file: 'othername_pfile_20050523-20260809.csv', rows: nameRows },
    { kind: 'practice-locations', file: 'pl_pfile_20050523-20260809.csv', rows: practiceRows },
    { kind: 'endpoints', file: 'endpoint_pfile_20050523-20260809.csv', rows: endpointRows },
  ];
  const files = [];
  for (const definition of definitions) {
    const buffer = Buffer.from(`${definition.rows.map((row) => row.map((value) => JSON.stringify(value)).join(',')).join('\n')}\n`);
    await writeFile(path.join(directory, definition.file), buffer);
    files.push({ kind: definition.kind, file: definition.file, uncompressedBytes: buffer.length, sha256: hash(buffer) });
  }
  const metadata = {
    schemaVersion: 1,
    sourcePage: 'https://download.cms.gov/nppes/NPI_Files.html',
    sourceUrl: 'https://download.cms.gov/nppes/NPPES_Data_Dissemination_August_2026_V2.zip',
    archiveName: 'NPPES_Data_Dissemination_August_2026_V2.zip',
    releaseId: 'NPPES_Data_Dissemination_August_2026_V2',
    archiveSha256: 'a'.repeat(64),
    fetchedAt: '2026-08-30T14:00:00.000Z',
    files,
  };
  await writeFile(path.join(directory, 'source.json'), `${JSON.stringify(metadata)}\n`);
}

async function writeFixtureBaseline(root) {
  const releaseDirectory = path.join(root, 'releases', 'zbp-fixture');
  await mkdir(path.join(releaseDirectory, 'derived'), { recursive: true });
  const rows = ['60601', '60602', '99999'].map((zipCode) => ({
    zip_code: zipCode,
    coverage_status: 'zbp-and-zcta',
    current_usps_validity: { status: 'unverified' },
    geography: { status: '2020-zcta-polygon-available', geo_id: `zcta:${zipCode}`, geoid: zipCode },
    employer_baseline: { status: 'published', establishments: 10 },
  }));
  const buffer = Buffer.from(`${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);
  await writeFile(path.join(releaseDirectory, 'derived', 'zip-coverage.jsonl'), buffer);
  const manifest = {
    dataset_id: 'census-zbp-baseline',
    release_id: 'zbp-fixture',
    complete_national_release: true,
    geography_dependency: { dataset_id: 'us-census-geography', release_id: 'geo-fixture' },
    artifacts: [{ path: 'derived/zip-coverage.jsonl', bytes: buffer.length, sha256: hash(buffer) }],
  };
  await writeFile(path.join(releaseDirectory, 'manifest.json'), `${JSON.stringify(manifest)}\n`);
  const pointer = path.join(root, 'current.json');
  await writeFile(pointer, `${JSON.stringify({ manifest: 'releases/zbp-fixture/manifest.json' })}\n`);
  return pointer;
}

test('builds and verifies the full organization-provider fixture with denominator-only ZIPs', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'datahub-nppes-organizations-'));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const sourceDirectory = path.join(root, 'source');
  await writeFixtureSource(sourceDirectory);
  const zbpPointer = await writeFixtureBaseline(path.join(root, 'zbp'));
  const result = await buildCmsNppesOrganizations({
    outputRoot: path.join(root, 'output'),
    sourceDirectory,
    zbpPointer,
    minimumOrganizations: 1,
    logger: () => {},
    now: () => new Date('2026-08-30T16:00:00.000Z'),
  });
  assert.equal(result.manifest.coverage.active_organization_npis, 2);
  assert.equal(result.manifest.coverage.active_individual_npis_excluded, 1);
  assert.equal(result.manifest.coverage.deactivated_npis_limited, 1);
  assert.equal(result.manifest.coverage.organization_primary_locations_with_us_zip, 1);
  assert.equal(result.manifest.coverage.organizations_without_valid_us_primary_zip, 1);
  assert.equal(result.manifest.coverage.accepted_non_primary_practice_locations, 1);
  assert.equal(result.manifest.coverage.accepted_other_names, 2);
  assert(result.manifest.artifacts.filter((artifact) => artifact.path.startsWith('source/')).every((artifact) => artifact.export_policy === 'internal-source-snapshot'));
  const verification = await verifyCmsNppesOrganizations(path.join(result.releaseDirectory, 'manifest.json'));
  assert.equal(verification.coverage.zip_union_records, 3);
  const zipArtifact = result.manifest.artifacts.find((artifact) => artifact.artifact_type === 'nppes-organization-zip-coverage-jsonl');
  const rows = (await readFile(path.join(result.releaseDirectory, zipArtifact.path), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(rows.find((row) => row.zip_code === '99999').nppes_organization_provider_snapshot.status, 'no-organization-provider-location-in-source-snapshot');
});
