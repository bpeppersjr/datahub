import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { APP_ROOT } from './paths.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function regular(relative) {
  assert.ok(typeof relative === 'string' && !path.isAbsolute(relative) && !relative.split(/[\\/]/).includes('..'));
  const file = path.join(APP_ROOT, relative), stat = await lstat(file);
  assert.equal(await realpath(file), file);
  assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1);
  return { file, stat };
}
async function read(relative) {
  const { file, stat } = await regular(relative);
  assert.ok(stat.size <= 1_000_000);
  const bytes = await readFile(file);
  assert.ok(bytes.length <= 1_000_000);
  return bytes;
}
// Read only metadata and stat bucket files: never import publication or lookup.
async function fixture() {
  const catalog = JSON.parse(await read('config/datasets/zip-active-evidence-index.json'));
  const manifestBytes = await read(catalog.retained_release.manifest);
  const sourceCatalogBytes = await read('config/datasets/zip-active-evidence-qualification.json');
  const sourceCatalog = JSON.parse(sourceCatalogBytes);
  const sourceManifestBytes = await read(sourceCatalog.retained_release.manifest);
  const mapCatalogBytes = await read('config/datasets/zip-evidence-category-map.json');
  const mapBytes = await read(JSON.parse(mapCatalogBytes).mapping);
  return { catalog, manifestBytes, sourceCatalogBytes, sourceManifestBytes, mapCatalogBytes, mapBytes };
}
function reconcile({ catalog, manifestBytes, sourceCatalogBytes, sourceManifestBytes, mapCatalogBytes, mapBytes }) {
  const r = catalog.retained_release, m = JSON.parse(manifestBytes), b = m.bindings;
  assert.equal(catalog.dataset_id, 'zip-active-evidence-index');
  assert.equal(catalog.schema_version, '1.0.0');
  assert.equal(catalog.status, 'registered-local-lookup-index');
  assert.equal(catalog.release_only, true);
  assert.equal(catalog.runtime_pointer, null);
  assert.equal(catalog.export_policy, 'local-review-only');
  for (const key of ['production_enrollment', 'national_reporting_denominator_enrollment', 'current_pointer_written']) assert.equal(catalog[key], false);
  assert.deepEqual(catalog.required_datasets, ['zip-active-evidence-qualification', 'zip-evidence-category-map']);
  assert.equal(r.manifest, `data/zip-active-evidence-index/releases/${m.release_id}/manifest.json`);
  assert.equal(r.manifest_sha256, hash(manifestBytes));
  assert.equal(r.manifest_bytes, manifestBytes.length);
  assert.equal(r.manifest_schema_version, m.schema_version);
  assert.equal(m.schema_version, 'zip-active-evidence-index@1.0.0');
  assert.equal(m.status, 'immutable-local-lookup-index');
  for (const key of ['release_id', 'status', 'created_at', 'source_zip_rows', 'indexed_zip_count', 'bindings']) assert.deepEqual(r[key], m[key]);
  assert.equal(r.created_at, '2026-10-02T17:45:00.000Z');
  assert.equal(r.source_zip_rows, 1397626);
  assert.equal(r.indexed_zip_count, 48194);
  assert.equal(r.artifact_count, m.artifacts.length);
  assert.equal(r.artifact_count, 100);
  assert.equal(r.artifact_bytes, m.artifacts.reduce((sum, item) => sum + item.bytes, 0));
  assert.equal(r.artifact_bytes, 4861616);
  assert.equal(r.artifact_inventory_sha256, hash(JSON.stringify(m.artifacts)));
  assert.equal(r.artifact_inventory_hash_encoding, 'SHA-256 of UTF-8 JSON.stringify(manifest.artifacts), in retained order');
  assert.equal(m.artifacts.reduce((sum, item) => sum + item.zip_count, 0), r.indexed_zip_count);
  for (const [i, a] of m.artifacts.entries()) {
    assert.equal(a.path, `zip-${String(i).padStart(2, '0')}.json`);
    assert.match(a.sha256, /^[a-f0-9]{64}$/);
    assert.ok(Number.isSafeInteger(a.bytes) && a.bytes > 0 && a.bytes <= 2_000_000);
    assert.ok(Number.isSafeInteger(a.zip_count) && a.zip_count > 0 && a.zip_count <= 1000);
  }
  assert.deepEqual(catalog.claims, m.claims);
  assert.deepEqual(catalog.claims, { export_policy: 'local-review-only', current_operations_verified: false,
    active_business_count: null, all_business_denominator: null, all_business_completion_percent: null,
    source_record_status_replayed: false, network_requests: 0, production_pointers_changed: false });
  const s = JSON.parse(sourceCatalogBytes).retained_release, sm = JSON.parse(sourceManifestBytes);
  assert.equal(b.registration_sha256, hash(sourceCatalogBytes));
  assert.equal(b.source_manifest_sha256, hash(sourceManifestBytes));
  assert.equal(b.source_manifest_sha256, s.manifest_sha256);
  assert.equal(b.source_release_id, sm.release_id);
  assert.equal(b.source_release_id, s.release_id);
  assert.equal(b.source_inventory_sha256, hash(JSON.stringify(sm.artifacts)));
  assert.equal(b.source_inventory_sha256, s.artifact_inventory_sha256);
  assert.equal(b.projection_sha256, sm.artifacts[0].sha256);
  assert.equal(m.source_zip_rows, sm.source_zip_rows);
  assert.equal(m.indexed_zip_count, s.zip_members);
  const mc = JSON.parse(mapCatalogBytes), map = JSON.parse(mapBytes);
  assert.equal(b.map_registration_sha256, hash(mapCatalogBytes));
  assert.equal(b.map_file_sha256, hash(mapBytes));
  assert.equal(b.mapping_sha256, hash(JSON.stringify(map)));
  for (const key of ['mapping_sha256', 'mapping_version', 'taxonomy_version']) assert.equal(b[key], mc[key]);
  assert.equal(b.mapping_version, map.schema_version);
  assert.equal(b.taxonomy_version, map.taxonomy_version);
  assert.equal(map.bindings.qualification_release_id, b.source_release_id);
  assert.equal(map.bindings.qualification_manifest_sha256, b.source_manifest_sha256);
  assert.equal(map.bindings.projection_sha256, b.projection_sha256);
  return m;
}
test('index metadata registration binds exact native inventory, source release and authored map without enrollment', async () => {
  const data = await fixture(), manifest = reconcile(data);
  const base = path.posix.dirname(data.catalog.retained_release.manifest);
  assert.deepEqual((await readdir(path.join(APP_ROOT, base))).sort(), ['manifest.json', ...manifest.artifacts.map(a => a.path)].sort());
  for (const a of manifest.artifacts) assert.equal((await regular(`${base}/${a.path}`)).stat.size, a.bytes);
});
test('index registration rejects altered pins, mapping, clocks, counts, policy and claims', async () => {
  const data = await fixture();
  for (const mutate of [
    c => { c.retained_release.manifest_sha256 = '0'.repeat(64); },
    c => { c.retained_release.artifact_inventory_sha256 = '0'.repeat(64); },
    c => { c.retained_release.artifact_bytes++; },
    c => { c.retained_release.indexed_zip_count++; },
    c => { c.retained_release.source_zip_rows++; },
    c => { c.retained_release.created_at = '2026-10-03T00:00:00.000Z'; },
    c => { c.retained_release.bindings.mapping_version = 'unknown'; },
    c => { c.retained_release.bindings.source_manifest_sha256 = '0'.repeat(64); },
    c => { c.runtime_pointer = 'data/zip-active-evidence-index/current.json'; },
    c => { c.production_enrollment = true; },
    c => { c.national_reporting_denominator_enrollment = true; },
    c => { c.export_policy = 'public'; },
    c => { c.claims.current_operations_verified = true; },
    c => { c.claims.all_business_completion_percent = 100; },
  ]) {
    const catalog = structuredClone(data.catalog); mutate(catalog);
    assert.throws(() => reconcile({ ...data, catalog }));
  }
  for (const key of ['sourceCatalogBytes', 'sourceManifestBytes', 'mapCatalogBytes', 'mapBytes']) {
    assert.throws(() => reconcile({ ...data, [key]: Buffer.concat([data[key], Buffer.from('\n')]) }));
  }
});
