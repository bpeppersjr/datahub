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
  entity_candidates: { organization_id: `organization:cms_npi_${npi}` },
  external_identifiers: [{ type: 'npi', value: npi }],
  legal_business_name: `Test Pharmacy ${npi}`,
  other_organization_name: null,
  parent_organization_name: 'Reported Parent Text',
  primary_practice_location: address ? { address, geography: { zcta_match_status: '2020-zcta-polygon-available', zcta_geoid: address.zip_code, zcta_geo_id: `zcta:${address.zip_code}` } } : null,
  healthcare_taxonomies: taxonomies,
  npi_status: { value: 'npi-active-as-of-source-release' },
  provider_enumeration_date: '2010-01-01',
  source_last_update_date: '2026-08-01',
  provenance: { source_id: 'cms-nppes-monthly-v2', source_release_id: 'monthly', source_record_id: `${npi}:primary`, ingest_run_id: 'fixture', transformation_version: 'fixture', policy_id: 'cms-nppes-organizations' },
});

async function fixture() {
  await rm(root, { recursive: true, force: true });
  const sourceRoot = path.join(root, 'source');
  const releaseId = 'cms-nppes-organizations-fixture';
  const release = path.join(sourceRoot, 'releases', releaseId);
  await mkdir(path.join(release, 'derived/organizations'), { recursive: true });
  const address = { street: '1 Main St', unit_or_additional: null, city: 'Austin', state: 'TX', zip_code: '78701', zip4: '1234', country: 'US' };
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
  const manifest = { schema_version: '1.0.0', dataset_id: 'cms-nppes-organizations', release_id: releaseId, status: 'published', complete_cms_monthly_source_snapshot: true, source_release_id: 'NPPES_Data_Dissemination_Fixture_V2', source_through_date: '2026-08-01', retrieved_at: '2026-08-02T00:00:00.000Z', artifacts };
  const manifestBuffer = Buffer.from(`${JSON.stringify(manifest)}\n`);
  await writeFile(path.join(release, 'manifest.json'), manifestBuffer);
  const pointer = { dataset_id: 'cms-nppes-organizations', release_id: releaseId, manifest: `releases/${releaseId}/manifest.json` };
  const pointerPath = path.join(sourceRoot, 'current.json');
  await writeFile(pointerPath, `${JSON.stringify(pointer)}\n`);
  return { sourcePointer: pointerPath, outputRoot: path.join(root, 'projection') };
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
