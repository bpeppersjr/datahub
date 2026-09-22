import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { APP_ROOT } from './paths.mjs';
import { buildCmsNppesPharmacyNonprimaryAddresses, loadCmsNppesPharmacyNonprimaryRows, verifyCmsNppesPharmacyNonprimaryAddresses } from './cms-nppes-pharmacy-nonprimary-addresses.mjs';

const sha = (value) => createHash('sha256').update(value).digest('hex');
const json = (value) => `${JSON.stringify(value)}\n`;
const artifact = async (directory, relative, bytes, type, recordCount) => {
  const filename = path.join(directory, relative); await mkdir(path.dirname(filename), { recursive: true }); await writeFile(filename, bytes);
  return { path: relative, bytes: bytes.length, sha256: sha(bytes), artifact_type: type, ...(recordCount == null ? {} : { record_count: recordCount }) };
};
const gzipRows = (rows) => gzipSync(rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''));

async function fixture(t, { orphan = false, invalidSchema = false } = {}) {
  const root = await mkdtemp(path.join(APP_ROOT, 'data', 'tmp', 'pharmacy-secondary-test-')); t.after(() => rm(root, { recursive: true, force: true }));
  const orgRoot = path.join(root, 'org'); const orgRelease = path.join(orgRoot, 'releases', 'org-r1'); await mkdir(orgRelease, { recursive: true });
  const pharmacyRoot = path.join(root, 'pharmacy'); const pharmacyRelease = path.join(pharmacyRoot, 'releases', 'pharmacy-r1'); await mkdir(pharmacyRelease, { recursive: true });
  const npi = '1234567890'; const practiceNpi = orphan ? '2222222222' : npi; const sourceRelease = 'NPPES-fixture-release'; const observedAt = '2026-09-01T00:00:00.000Z'; const sourceRecordId = `${practiceNpi}:practice:0123456789abcdefabcd`;
  const practice = {
    schema_version: '1.0.0', normalized_record_id: `cms-nppes:${sourceRecordId}`, npi: practiceNpi,
    entity_candidates: { organization_id: `organization:cms_npi_${practiceNpi}`, physical_site_id: 'site:test', establishment_id: 'establishment:test', identity_status: 'provisional' },
    address: { street: '2 Secondary St', unit_or_additional: 'Suite 3', city: 'Example', state: 'TX', zip_code: '75002', zip4: '0042', postal_code: '75002', country: 'US' }, telephone: null,
    geography: { zip_code: '75002', zcta_match_status: '2020-zcta-polygon-available', zcta_geo_id: 'zcta:75002', zcta_geoid: '75002', zcta_geometry_file: 'source/zctas/prefix=7.geojson' },
    source_status: { value: 'reported-non-primary-practice-location-for-active-npi', scope: 'Reported association with an active organization NPI; not independent evidence that the location is currently open' },
    observed_at: observedAt,
    provenance: { source_id: 'cms-nppes-monthly-v2', source_release_id: sourceRelease, source_record_id: sourceRecordId, ingest_run_id: 'fixture-run', transformation_version: 'cms-nppes-organizations@1.0.1', policy_id: 'cms-nppes-organizations' },
    field_lineage: { address: 'Provider Secondary Practice Location Address fields', telephone: 'Provider Secondary Practice Location Address - Telephone Number' }, export_policy: 'public',
  };
  if (invalidSchema) practice.address.zip4 = '42';
  const practiceArtifacts = [];
  for (let digit = 0; digit < 10; digit += 1) practiceArtifacts.push(await artifact(orgRelease, `derived/practice-locations/prefix=${digit}.jsonl.gz`, gzipRows(digit === 1 ? [practice] : []), 'normalized-nppes-practice-location-jsonl-gzip', digit === 1 ? 1 : 0));
  const organizationsManifest = { schema_version: '1.0.0', dataset_id: 'cms-nppes-organizations', release_id: 'org-r1', status: 'published', source_release_id: sourceRelease, source_through_date: '2026-08-31', observed_at: observedAt, artifacts: practiceArtifacts };
  const orgManifestBytes = Buffer.from(json(organizationsManifest)); await writeFile(path.join(orgRelease, 'manifest.json'), orgManifestBytes);
  const organizationsPointer = { dataset_id: 'cms-nppes-organizations', release_id: 'org-r1', manifest: 'releases/org-r1/manifest.json', manifest_sha256: sha(orgManifestBytes) };
  const orgPointerBytes = Buffer.from(json(organizationsPointer)); await writeFile(path.join(orgRoot, 'current.json'), orgPointerBytes);
  const orgPointerRelative = path.relative(APP_ROOT, path.join(orgRoot, 'current.json')).replaceAll('\\', '/');
  const orgManifestRelative = path.relative(APP_ROOT, path.join(orgRelease, 'manifest.json')).replaceAll('\\', '/');

  const pharmacyRecord = { schema_version: '1.0.0', pharmacy_record_id: `cms-nppes-community-retail-pharmacy:${npi}`, organization_id: `organization:cms_npi_${npi}`, npi, legal_business_name: 'Fixture Pharmacy', other_organization_name: null, address: { street: '1 Primary St', unit_or_additional: null, city: 'Example', state: 'TX', zip_code: '75001', zip4: '1111', country: 'US' }, taxonomy_assertions: [{ code: '3336C0003X', primary: true }], provenance: { projection_source_dataset_id: 'cms-nppes-organizations', projection_source_release_id: 'org-r1', source_release_id: sourceRelease, source_record_id: `${npi}:primary` }, export_policy: 'public-normalized-source-evidence' };
  const pharmacyArtifacts = [];
  for (let digit = 0; digit < 10; digit += 1) pharmacyArtifacts.push(await artifact(pharmacyRelease, `derived/pharmacies/npi-prefix=${digit}.jsonl.gz`, gzipRows(digit === 1 ? [pharmacyRecord] : []), 'normalized-nppes-community-retail-pharmacy-jsonl-gzip', digit === 1 ? 1 : 0));
  const primaryZip = Buffer.from(json({ zip_code: '75001', reported_address_count: 1, unique_npi_count: 1 }));
  const pharmacyZipArtifact = await artifact(pharmacyRelease, 'derived/zip5-aggregates.jsonl', primaryZip, 'nppes-community-retail-pharmacy-zip5-aggregate-jsonl', 1);
  const pharmacyManifest = { schema_version: '1.0.0', dataset_id: 'cms-nppes-community-retail-pharmacies', release_id: 'pharmacy-r1', status: 'published', source_release_id: sourceRelease, source_through_date: '2026-08-31', observed_at: observedAt, artifacts: [...pharmacyArtifacts, pharmacyZipArtifact], dependencies: {
    nppes_organizations_pointer: { path: orgPointerRelative, sha256: sha(orgPointerBytes), dataset_id: 'cms-nppes-organizations', release_id: 'org-r1' },
    nppes_organizations_manifest: { path: orgManifestRelative, sha256: sha(orgManifestBytes), release_id: 'org-r1' },
  } };
  const pharmacyManifestBytes = Buffer.from(json(pharmacyManifest)); await writeFile(path.join(pharmacyRelease, 'manifest.json'), pharmacyManifestBytes);
  const pharmacyPointer = { dataset_id: 'cms-nppes-community-retail-pharmacies', release_id: 'pharmacy-r1', manifest: 'releases/pharmacy-r1/manifest.json', manifest_sha256: sha(pharmacyManifestBytes) };
  const pharmacyPointerPath = path.join(pharmacyRoot, 'current.json'); await writeFile(pharmacyPointerPath, json(pharmacyPointer));
  return { root, pharmacyPointer: pharmacyPointerPath, organizationsPointer: path.join(orgRoot, 'current.json'), outputRoot: path.join(root, 'projection'), verifyPharmacyProjection: async () => {} };
}

test('builds a separately versioned non-primary projection from exact NPI-linked retained artifacts', async (t) => {
  const input = await fixture(t); const built = await buildCmsNppesPharmacyNonprimaryAddresses({ ...input, now: new Date('2026-09-22T18:00:00.000Z') });
  assert.deepEqual(built.manifest.coverage, { rows: 1, distinct_npis: 1, distinct_zip5: 1, view_only_zip5: 1 });
  assert.equal(built.manifest.claims.business_or_site_total_contribution, false);
  const result = await verifyCmsNppesPharmacyNonprimaryAddresses(built.pointerPath, { verifyPharmacyProjection: async () => {} });
  assert.deepEqual(result.coverage, built.manifest.coverage);
  const shard = await readFile(path.join(built.releaseDirectory, 'derived/addresses/zip-prefix=7.jsonl.gz'));
  const row = JSON.parse(gunzipSync(shard).toString('utf8'));
  assert.equal(row.address.zip_code, '75002'); assert.equal(row.address.zip4, '0042');
  assert.equal(row.address_role, 'non-primary-practice-location'); assert.equal(row.claims.confirmed_pharmacy_location, false);
  assert.match(row.semantics, /not a confirmed pharmacy location/);
});

test('independent verification rejects byte tampering and a checksum-updated orphan join', async (t) => {
  const input = await fixture(t); const built = await buildCmsNppesPharmacyNonprimaryAddresses({ ...input });
  const manifestPath = path.join(built.releaseDirectory, 'manifest.json'); const pointerPath = built.pointerPath;
  const pointer = JSON.parse(await readFile(pointerPath, 'utf8')); const readManifest = async () => JSON.parse(await readFile(manifestPath, 'utf8'));
  const writePinnedManifest = async (manifest) => { const bytes = Buffer.from(json(manifest)); await writeFile(manifestPath, bytes); pointer.manifest_sha256 = sha(bytes); await writeFile(pointerPath, json(pointer)); };
  const manifest = await readManifest(); const output = path.join(built.releaseDirectory, 'derived/addresses/zip-prefix=7.jsonl.gz'); const goodBytes = await readFile(output);
  await writeFile(output, Buffer.from('tampered')); await assert.rejects(verifyCmsNppesPharmacyNonprimaryAddresses(pointerPath, { verifyPharmacyProjection: async () => {} }), /verification failed/);
  await writeFile(output, goodBytes);
  const row = JSON.parse(gunzipSync(goodBytes).toString('utf8')); row.pharmacy_record_id = 'cms-nppes-community-retail-pharmacy:9999999999';
  const changed = gzipSync(json(row)); await writeFile(output, changed); manifest.artifacts.find((item) => item.path.endsWith('zip-prefix=7.jsonl.gz')).bytes = changed.length; manifest.artifacts.find((item) => item.path.endsWith('zip-prefix=7.jsonl.gz')).sha256 = sha(changed);
  await writePinnedManifest(manifest);
  await assert.rejects(verifyCmsNppesPharmacyNonprimaryAddresses(pointerPath, { verifyPharmacyProjection: async () => {} }), /verification failed/);
});

test('source schema drift and pre-aborted builds fail before publication', async (t) => {
  const invalid = await fixture(t, { invalidSchema: true });
  await assert.rejects(buildCmsNppesPharmacyNonprimaryAddresses({ ...invalid }), /practice address is invalid/);
  const valid = await fixture(t); const controller = new AbortController(); controller.abort();
  await assert.rejects(buildCmsNppesPharmacyNonprimaryAddresses({ ...valid, signal: controller.signal }), { name: 'AbortError' });
});

test('different NPIs do not join even when other organization fields look alike', async (t) => {
  const input = await fixture(t, { orphan: true }); const built = await buildCmsNppesPharmacyNonprimaryAddresses({ ...input });
  assert.deepEqual(built.manifest.coverage, { rows: 0, distinct_npis: 0, distinct_zip5: 0, view_only_zip5: 0 });
  assert.deepEqual((await verifyCmsNppesPharmacyNonprimaryAddresses(built.pointerPath, { verifyPharmacyProjection: async () => {} })).coverage, built.manifest.coverage);
});

test('concurrent publications cannot replace a pointer from the same initial snapshot', async (t) => {
  const input = await fixture(t); let arrivals = 0; let releaseBarrier;
  const barrier = new Promise((resolve) => { releaseBarrier = resolve; });
  const onProgress = async () => { arrivals += 1; if (arrivals === 2) releaseBarrier(); await barrier; };
  const results = await Promise.allSettled([
    buildCmsNppesPharmacyNonprimaryAddresses({ ...input, onProgress }),
    buildCmsNppesPharmacyNonprimaryAddresses({ ...input, onProgress }),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  const pointer = JSON.parse(await readFile(path.join(input.outputRoot, 'current.json'), 'utf8'));
  assert.equal(pointer.dataset_id, 'cms-nppes-pharmacy-nonprimary-addresses');
  assert.equal(results.find((result) => result.status === 'fulfilled').value.manifest.release_id, pointer.release_id);
});

test('cached views recheck immutable artifact bytes on later requests', async (t) => {
  const input = await fixture(t); const built = await buildCmsNppesPharmacyNonprimaryAddresses({ ...input });
  const verifyProjection = (pointer, options) => verifyCmsNppesPharmacyNonprimaryAddresses(pointer, { ...options, verifyPharmacyProjection: async () => {} });
  const request = { pointerPath: built.pointerPath, state: 'TX', zip: '75002', verifyProjection };
  assert.equal((await loadCmsNppesPharmacyNonprimaryRows(request)).total, 1);
  const emptyShard = path.join(built.releaseDirectory, 'derived/addresses/zip-prefix=8.jsonl.gz'); await writeFile(emptyShard, Buffer.from('changed'));
  await assert.rejects(loadCmsNppesPharmacyNonprimaryRows(request), /failed byte or SHA-256 verification/);
});

test('output ancestry rejects a junction that escapes the owned release tree', async (t) => {
  const input = await fixture(t); const target = path.join(input.root, 'external-output'); const junction = path.join(input.root, 'output-junction');
  await mkdir(target, { recursive: true });
  try { await symlink(target, junction, 'junction'); }
  catch (error) { if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) { t.skip(`Junction creation unavailable: ${error.code}`); return; } throw error; }
  await assert.rejects(buildCmsNppesPharmacyNonprimaryAddresses({ ...input, outputRoot: junction }), /symbolic link or junction/);
});
