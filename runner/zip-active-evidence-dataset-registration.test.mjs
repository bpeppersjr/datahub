import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { APP_ROOT } from './paths.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const catalogPath = 'config/datasets/zip-active-evidence-qualification.json';

// Metadata only: deliberately no projection builder or publisher imports.
async function regular(relative) {
  assert.ok(typeof relative === 'string' && !path.isAbsolute(relative) && !relative.split(/[\\/]/).includes('..'));
  const file = path.join(APP_ROOT, relative);
  assert.equal(await realpath(file), file);
  const stat = await lstat(file);
  assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1);
  return { file, stat };
}
async function boundedRead(relative, maximum = 1_000_000) {
  const { file, stat } = await regular(relative);
  assert.ok(stat.size <= maximum);
  const bytes = await readFile(file);
  assert.ok(bytes.length <= maximum);
  return bytes;
}

function reconcile(catalog, manifestBytes, projectionBytes) {
  const m = JSON.parse(manifestBytes), p = JSON.parse(projectionBytes), r = catalog.retained_release;
  assert.equal(catalog.dataset_id, 'zip-active-evidence-qualification');
  assert.equal(catalog.status, 'registered-local-derived-evidence');
  assert.equal(catalog.runtime_pointer, null);
  assert.equal(catalog.release_only, true);
  for (const key of ['production_enrollment', 'national_reporting_denominator_enrollment', 'current_pointer_written']) assert.equal(catalog[key], false);
  assert.equal(catalog.export_policy, 'local-review-only');
  assert.deepEqual(catalog.required_datasets, ['national-business-coverage-views', 'national-business-registry']);
  assert.equal(r.manifest, `data/zip-active-evidence-qualification/releases/${m.release_id}/manifest.json`);
  assert.equal(r.manifest_sha256, hash(manifestBytes));
  assert.equal(r.manifest_bytes, manifestBytes.length);
  assert.equal(r.manifest_schema_version, m.schema_version);
  for (const key of ['release_id', 'projection_schema', 'status', 'as_of', 'created_at', 'source_zip_rows', 'bindings']) assert.deepEqual(r[key], m[key], key);
  assert.equal(m.schema_version, 'zip-active-evidence-release@1.0.0');
  assert.equal(m.status, 'immutable-local-derived-release');
  assert.equal(r.projection_schema, p.schema_version);
  for (const key of ['as_of', 'created_at', 'bindings', 'claims']) assert.deepEqual(m[key], p[key], key);
  assert.equal(r.as_of, '2026-10-02T16:30:00.000Z');
  assert.equal(r.created_at, r.as_of);
  assert.equal(r.temporal_policy_version, p.temporal_policy_version);
  assert.equal(r.temporal_policy_version, '1.1.0');
  assert.equal(r.zip_members, p.zip_members);
  assert.equal(r.zip_members, 48194);
  assert.equal(r.source_conservation_entries, p.conservation.length);
  assert.equal(r.source_conservation_entries, 30);
  assert.equal(new Set(p.conservation.map(row => row.source_key)).size, 30);
  assert.deepEqual(catalog.limitations, p.limitations);
  assert.deepEqual(catalog.claims, m.claims);
  assert.deepEqual(catalog.claims, {
    current_operations_verified: false, active_business_count: null, all_business_denominator: null,
    all_business_completion_percent: null, overlapping_units_additive: false,
    source_record_status_distribution_replayed: false, source_replay_performed: false,
    network_requests: 0, production_pointers_changed: false, export_policy: 'local-review-only',
  });
  assert.equal(r.artifact_count, m.artifacts.length);
  assert.equal(r.artifact_count, 1399);
  assert.equal(r.artifact_bytes, m.artifacts.reduce((sum, item) => sum + item.bytes, 0));
  assert.equal(r.artifact_bytes, 2289977727);
  assert.equal(r.artifact_inventory_sha256, hash(JSON.stringify(m.artifacts)));
  assert.equal(r.artifact_inventory_hash_encoding, 'SHA-256 of UTF-8 JSON.stringify(manifest.artifacts), in retained order');
  assert.deepEqual(r.projection_artifact, m.artifacts[0]);
  assert.equal(m.artifacts[0].path, 'projection.json');
  assert.equal(m.artifacts[0].bytes, projectionBytes.length);
  assert.equal(m.artifacts[0].sha256, hash(projectionBytes));
  assert.equal(m.artifacts[0].record_count, 1);
  for (const [index, item] of m.artifacts.slice(1).entries()) {
    assert.equal(item.path, `rows-${String(index).padStart(4, '0')}.jsonl`);
    assert.match(item.sha256, /^[a-f0-9]{64}$/);
    assert.ok(Number.isSafeInteger(item.bytes) && item.bytes > 0 && item.bytes <= 2_000_000);
    assert.equal(item.record_count, index === 1397 ? 626 : 1000);
  }
  assert.equal(m.artifacts.slice(1).reduce((sum, item) => sum + item.record_count, 0), r.source_zip_rows);
  assert.equal(r.source_zip_rows, 1397626);
  return m;
}

async function fixture() {
  const catalog = JSON.parse(await boundedRead(catalogPath));
  const manifestBytes = await boundedRead(catalog.retained_release.manifest);
  const base = path.posix.dirname(catalog.retained_release.manifest);
  const projectionBytes = await boundedRead(`${base}/projection.json`);
  return { catalog, manifestBytes, projectionBytes, base };
}

test('ZIP registration pins exact retained metadata, inventory, clocks, upstream chain and non-enrollment', async () => {
  const { catalog, manifestBytes, projectionBytes, base } = await fixture();
  const m = reconcile(catalog, manifestBytes, projectionBytes);
  assert.deepEqual((await readdir(path.join(APP_ROOT, base))).sort(), ['manifest.json', ...m.artifacts.map(item => item.path)].sort());
  for (const item of m.artifacts) assert.equal((await regular(`${base}/${item.path}`)).stat.size, item.bytes);
  for (const [key, dataset, directory] of [['coverage', 'national-business-coverage-views', 'business-coverage-views'], ['registry', 'national-business-registry', 'business-registry']]) {
    const binding = m.bindings[key], pointerBytes = await boundedRead(`data/${directory}/current.json`), pointer = JSON.parse(pointerBytes);
    const upstreamBytes = await boundedRead(`data/${directory}/${pointer.manifest}`), upstream = JSON.parse(upstreamBytes);
    assert.equal(pointer.dataset_id, dataset);
    assert.equal(hash(pointerBytes), binding.pointerSha256 ?? binding.pointer_sha256);
    assert.equal(hash(upstreamBytes), binding.manifestSha256 ?? binding.manifest_sha256);
    assert.equal(upstream.release_id, binding.coverageReleaseId ?? binding.release_id);
    assert.equal(pointer.release_id, upstream.release_id);
    if (key === 'coverage') {
      const zip = upstream.artifacts.find(item => item.path === 'views/zips.jsonl');
      for (const [field, value] of Object.entries(m.bindings.zip_artifact)) assert.deepEqual(zip[field], value);
      for (const [name, artifact] of Object.entries(binding.artifacts)) {
        const retained = upstream.artifacts.find(item => item.path === `views/${name}.jsonl`);
        assert.ok(retained);
        assert.equal(retained.sha256, artifact.sha256);
        assert.equal(retained.bytes, artifact.bytes);
        assert.equal(retained.record_count, artifact.recordCount);
        assert.equal(retained.export_policy, artifact.exportPolicy);
      }
    }
  }
});

test('ZIP metadata registration rejects pin, inventory, clock, count, policy and claim drift', async () => {
  const { catalog, manifestBytes, projectionBytes } = await fixture();
  for (const mutate of [
    value => { value.retained_release.manifest_sha256 = '0'.repeat(64); },
    value => { value.retained_release.artifact_inventory_sha256 = '0'.repeat(64); },
    value => { value.retained_release.artifact_count++; },
    value => { value.retained_release.artifact_bytes++; },
    value => { value.retained_release.source_zip_rows++; },
    value => { value.retained_release.zip_members++; },
    value => { value.retained_release.as_of = '2026-10-03T00:00:00.000Z'; },
    value => { value.retained_release.bindings.registry.manifest_sha256 = '0'.repeat(64); },
    value => { value.production_enrollment = true; },
    value => { value.national_reporting_denominator_enrollment = true; },
    value => { value.runtime_pointer = 'data/zip-active-evidence-qualification/current.json'; },
    value => { value.claims.current_operations_verified = true; },
    value => { value.claims.all_business_completion_percent = 100; },
    value => { value.export_policy = 'public'; },
  ]) {
    const changed = structuredClone(catalog); mutate(changed);
    assert.throws(() => reconcile(changed, manifestBytes, projectionBytes));
  }
  assert.throws(() => reconcile(catalog, manifestBytes, Buffer.concat([projectionBytes, Buffer.from('\n')])));
});
