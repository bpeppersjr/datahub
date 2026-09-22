import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildCmsNppesCommunityRetailPharmacies, verifyCmsNppesCommunityRetailPharmacies, COMMUNITY_RETAIL_TAXONOMY, MAIL_ORDER_TAXONOMY } from './cms-nppes-community-retail-pharmacy.mjs';

const root = path.join(process.cwd(), 'data/tmp/cms-nppes-pharmacy-test');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const record = (npi, address, taxonomies) => ({
  schema_version: '1.0.0',
  normalized_record_id: `cms-nppes:${npi}:primary`,
  entity_candidates: { organization_id: `organization:cms_npi_${npi}`, identity_status: 'provisional' },
  external_identifiers: [{ type: 'npi', value: npi, source_field: 'NPI' }],
  legal_business_name: `Test Pharmacy ${npi}`,
  other_organization_name: null,
  parent_organization_name: 'Reported Parent Text',
  primary_practice_location: address ? { address, geography: { zip_code: address.zip_code, zcta_match_status: '2020-zcta-polygon-available', zcta_geoid: address.zip_code, zcta_geo_id: `zcta:${address.zip_code}`, zcta_geometry_file: 'source/zctas/prefix=7.geojson' } } : null,
  healthcare_taxonomies: taxonomies,
  npi_status: { value: 'npi-active-as-of-source-release', scope: 'NPI enumeration status only; issuance does not validate licensure or credentials and does not prove a practice location is open' },
  provider_enumeration_date: '2010-01-01',
  source_last_update_date: '2026-08-01',
  observed_at: '2026-08-02T00:00:00.000Z',
  provenance: { source_id: 'cms-nppes-monthly-v2', source_release_id: 'NPPES_Data_Dissemination_Fixture_V2', source_record_id: `${npi}:primary`, ingest_run_id: 'fixture', transformation_version: 'cms-nppes-organizations@1.0.1', policy_id: 'cms-nppes-organizations' },
  export_policy: 'public',
});

async function fixture() {
  await rm(root, { recursive: true, force: true });
  const sourceRoot = path.join(root, 'source');
  const releaseId = 'cms-nppes-organizations-fixture';
  const release = path.join(sourceRoot, 'releases', releaseId);
  await mkdir(path.join(release, 'derived/organizations'), { recursive: true });
  const address = { street: '1 Main St', unit_or_additional: null, city: 'Austin', state: 'TX', zip_code: '78701', zip4: '1234', postal_code: '78701', country: 'US' };
  const rows = [
    record('1000000001', address, [{ code: COMMUNITY_RETAIL_TAXONOMY, primary: true }, { code: COMMUNITY_RETAIL_TAXONOMY, primary: false }, { code: MAIL_ORDER_TAXONOMY, primary: false }]),
    record('1000000002', null, [{ code: COMMUNITY_RETAIL_TAXONOMY, primary: true }]),
  ];
  const artifacts = [];
  for (const prefix of '0123456789') {
    const relative = `derived/organizations/prefix=${prefix}.jsonl.gz`;
    const buffer = gzipSync(prefix === '1' ? `${rows.map(JSON.stringify).join('\n')}\n` : '');
    await writeFile(path.join(release, relative), buffer);
    artifacts.push({ path: relative, bytes: buffer.length, sha256: hash(buffer), record_count: prefix === '1' ? rows.length : 0, artifact_type: 'normalized-nppes-organization-jsonl-gzip' });
  }
  const noZipRelative = 'derived/organizations/no-valid-us-zip.jsonl.gz';
  const noZip = gzipSync('');
  await writeFile(path.join(release, noZipRelative), noZip);
  artifacts.push({ path: noZipRelative, bytes: noZip.length, sha256: hash(noZip), record_count: 0, artifact_type: 'normalized-nppes-organization-jsonl-gzip' });
  const zipRelative = 'derived/zip-coverage.jsonl';
  const zipBuffer = Buffer.from(`${JSON.stringify({ zip_code: '78701', geography: { status: '2020-zcta-polygon-available', geoid: '78701', geo_id: 'zcta:78701' } })}\n${JSON.stringify({ zip_code: '99999', geography: { status: 'no-2020-zcta-polygon' } })}\n`);
  await writeFile(path.join(release, zipRelative), zipBuffer);
  artifacts.push({ path: zipRelative, bytes: zipBuffer.length, sha256: hash(zipBuffer), record_count: 2, artifact_type: 'nppes-organization-zip-coverage-jsonl' });
  const manifest = { schema_version: '1.0.0', dataset_id: 'cms-nppes-organizations', release_id: releaseId, status: 'published', complete_cms_monthly_source_snapshot: true, observed_at: '2026-08-02T00:00:00.000Z', source_release_id: 'NPPES_Data_Dissemination_Fixture_V2', source_through_date: '2026-08-01', retrieved_at: '2026-08-02T00:00:00.000Z', artifacts };
  const manifestBuffer = Buffer.from(`${JSON.stringify(manifest)}\n`);
  await writeFile(path.join(release, 'manifest.json'), manifestBuffer);
  const pointer = { dataset_id: 'cms-nppes-organizations', release_id: releaseId, manifest: `releases/${releaseId}/manifest.json` };
  const pointerPath = path.join(sourceRoot, 'current.json');
  await writeFile(pointerPath, `${JSON.stringify(pointer)}\n`);
  return { sourcePointer: pointerPath, outputRoot: path.join(root, 'projection') };
}

async function repinArtifact(result, relativePath, mutate) {
  const manifestPath = path.join(result.releaseDirectory, 'manifest.json');
  const pointerPath = result.pointerPath;
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const artifact = manifest.artifacts.find((item) => item.path === relativePath);
  const artifactPath = path.join(result.releaseDirectory, relativePath);
  const next = await mutate(await readFile(artifactPath));
  await writeFile(artifactPath, next);
  artifact.bytes = next.length;
  artifact.sha256 = hash(next);
  const manifestBuffer = Buffer.from(`${JSON.stringify(manifest)}\n`);
  await writeFile(manifestPath, manifestBuffer);
  const pointer = JSON.parse(await readFile(pointerPath, 'utf8'));
  pointer.manifest_sha256 = hash(manifestBuffer);
  await writeFile(pointerPath, `${JSON.stringify(pointer)}\n`);
}

test.afterEach(async () => { await rm(root, { recursive: true, force: true }); });

test('builds and verifies a local pharmacy projection with conservation and null claims', async () => {
  const input = await fixture();
  const result = await buildCmsNppesCommunityRetailPharmacies({ ...input, now: () => new Date('2026-09-22T00:00:00.000Z') });
  assert.equal(result.manifest.coverage.accepted_organization_rows, 2);
  assert.equal(result.manifest.coverage.retail_taxonomy_occurrences, 3);
  assert.equal(result.manifest.coverage.repeated_retail_taxonomy_excess, 1);
  assert.equal(result.manifest.coverage.mail_order_taxonomy_assertion_rows, 1);
  assert.equal(result.manifest.coverage.rows_with_reported_primary_address, 1);
  assert.equal(result.manifest.claims.ncpdp_number, null);
  assert.equal(result.manifest.claims.parent_company, null);
  assert.deepEqual(await verifyCmsNppesCommunityRetailPharmacies(result.pointerPath), { dataset_id: result.manifest.dataset_id, release_id: result.manifest.release_id, source_release_id: result.manifest.source_release_id, coverage: result.manifest.coverage, artifact_count: result.manifest.artifacts.length });
});

test('tampering with a source artifact is rejected before publication', async () => {
  const input = await fixture();
  const source = path.join(input.sourcePointer.replace(/current\.json$/, ''), 'releases/cms-nppes-organizations-fixture/derived/organizations/prefix=1.jsonl.gz');
  const before = await readFile(source);
  await writeFile(source, Buffer.concat([before, Buffer.from('tampered')]));
  await assert.rejects(buildCmsNppesCommunityRetailPharmacies(input), /failed byte or SHA-256 verification/);
  assert.equal(await readFile(path.join(input.outputRoot, 'current.json'), 'utf8').catch(() => null), null);
});

test('cancellation leaves no published pointer', async () => {
  const input = await fixture();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(buildCmsNppesCommunityRetailPharmacies({ ...input, signal: controller.signal }), /cancelled/);
  assert.equal(await readFile(path.join(input.outputRoot, 'current.json'), 'utf8').catch(() => null), null);
});

test('a policy with unsafe export semantics is rejected before projection', async () => {
  const input = await fixture();
  const policyPath = path.join(root, 'unsafe-policy.json');
  await writeFile(policyPath, JSON.stringify({ policy_id: 'cms-nppes-organizations', version: '1.0.0', publisher: 'U.S. Centers for Medicare & Medicaid Services', contains_secrets: true }));
  await assert.rejects(buildCmsNppesCommunityRetailPharmacies({ ...input, sourcePolicy: policyPath }), /source policy/);
  assert.equal(await readFile(path.join(input.outputRoot, 'current.json'), 'utf8').catch(() => null), null);
});

test('projection manifest tampering is rejected by pointer hash binding', async () => {
  const input = await fixture();
  const result = await buildCmsNppesCommunityRetailPharmacies(input);
  const manifestPath = path.join(result.releaseDirectory, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.selection.required_taxonomy_code = MAIL_ORDER_TAXONOMY;
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
  await assert.rejects(verifyCmsNppesCommunityRetailPharmacies(result.pointerPath), /manifest SHA-256/);
});

test('state aggregate semantic drift is rejected even when its checksum is repinned', async () => {
  const input = await fixture();
  const result = await buildCmsNppesCommunityRetailPharmacies(input);
  await repinArtifact(result, 'derived/state-aggregates.json', async (buffer) => {
    const document = JSON.parse(buffer.toString('utf8'));
    document.rows[0].reported_address_count += 1;
    return Buffer.from(`${JSON.stringify(document)}\n`);
  });
  await assert.rejects(verifyCmsNppesCommunityRetailPharmacies(result.pointerPath), (error) => error.failures?.some((item) => item.reason.includes('aggregate semantics')));
});
