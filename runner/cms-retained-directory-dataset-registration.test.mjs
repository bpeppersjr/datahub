import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { APP_ROOT } from './paths.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const catalogPath = 'config/datasets/cms-retained-directory-coverage-catalog.json';

// Deliberately no builder/verifier imports: this test reads the already published
// small metadata/aggregate files and cannot dispatch source replay or publication.
async function boundedRead(relative, maximum = 100000) {
  assert.equal(typeof relative, 'string');
  assert.ok(!path.isAbsolute(relative) && !relative.split(/[\\/]/).includes('..'));
  const file = path.join(APP_ROOT, relative);
  assert.equal(await realpath(file), file);
  const stat = await lstat(file);
  assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.size <= maximum);
  const bytes = await readFile(file);
  assert.ok(bytes.length <= maximum);
  return bytes;
}

function reconcile(catalog, manifestBytes, artifacts) {
  const manifest = JSON.parse(manifestBytes), retained = catalog.retained_release;
  assert.equal(catalog.dataset_id, manifest.dataset_id);
  assert.equal(retained.release_id, manifest.release_id);
  assert.equal(retained.manifest, `data/cms-retained-directory-coverage-catalog/releases/${manifest.release_id}/manifest.json`);
  assert.equal(retained.manifest_sha256, hash(manifestBytes));
  assert.equal(retained.manifest_bytes, manifestBytes.length);
  assert.equal(retained.manifest_schema_version, manifest.schema_version);
  assert.equal(catalog.status, manifest.status);
  assert.equal(catalog.status, 'published-pre-production-evidence');
  assert.equal(catalog.runtime_pointer, null);
  assert.equal(catalog.release_only, true);
  for (const key of ['release_only', 'production_enrollment', 'national_reporting_denominator_enrollment', 'current_pointer_written', 'export_policy']) assert.equal(catalog[key], manifest[key], key);
  for (const key of ['production_enrollment', 'national_reporting_denominator_enrollment', 'current_pointer_written']) assert.equal(catalog[key], false);
  assert.equal(catalog.export_policy, 'local-review-only');
  assert.equal(manifest.source_actions_performed, 0);
  assert.equal(manifest.network_requests_performed, 0);
  assert.deepEqual(catalog.claims, manifest.claims);
  for (const key of ['named_business_count', 'unique_business_count', 'physical_site_count', 'current_operating_count', 'national_completeness_percent']) assert.equal(catalog.claims[key], null);
  for (const key of ['geographic_assignment_performed', 'county_assignment_performed', 'zcta_membership_inferred', 'spatial_assignment_performed', 'publisher_coordinates_spatially_approved', 'zip4_aggregated', 'coordinates_retained', 'zip_values_retained', 'public_export_authorized']) assert.equal(catalog.claims[key], false);
  assert.equal(catalog.claims.identity_reconciliation_status, 'not-yet-reconciled');
  for (const key of ['jurisdiction_count', 'source_count', 'denominators', 'source_denominators', 'artifacts']) assert.deepEqual(retained[key], manifest[key], key);
  assert.equal(retained.artifact_count, manifest.artifacts.length);
  assert.equal(retained.artifact_count, 2);
  assert.equal(retained.artifact_bytes, manifest.artifacts.reduce((sum, item) => sum + item.bytes, 0));
  assert.deepEqual(manifest.artifacts.map(item => item.path), ['jurisdictions.jsonl', 'sources.json']);
  for (const descriptor of manifest.artifacts) {
    const bytes = artifacts[descriptor.path];
    assert.equal(bytes.length, descriptor.bytes);
    assert.equal(hash(bytes), descriptor.sha256);
    assert.equal(descriptor.export_policy, 'local-review-only');
  }
  const rows = artifacts['jurisdictions.jsonl'].toString('utf8').trimEnd().split('\n').map(JSON.parse);
  const sourceArtifact = JSON.parse(artifacts['sources.json']);
  assert.equal(rows.length, retained.jurisdiction_count);
  assert.equal(rows.length, manifest.artifacts[0].record_count);
  assert.equal(new Set(rows.map(row => row.jurisdiction_code)).size, 56);
  assert.equal(sourceArtifact.sources.length, retained.source_count);
  assert.equal(sourceArtifact.sources.length, manifest.artifacts[1].record_count);
  assert.deepEqual(catalog.required_datasets, sourceArtifact.sources.map(row => row.source_id));
  assert.deepEqual(sourceArtifact.combined_denominators, retained.denominators);
  assert.deepEqual(sourceArtifact.claims, catalog.claims);
  assert.equal(sourceArtifact.export_policy, catalog.export_policy);
  assert.equal(retained.denominators.all_retained_directory_rows, 20109);
  assert.equal(retained.source_denominators.hospital.all_retained_directory_rows, 5419);
  assert.equal(retained.source_denominators.nursing_home.all_retained_directory_rows, 14690);
  assert.deepEqual(rows.slice(51).map(row => row.jurisdiction_code), ['AS', 'GU', 'MP', 'PR', 'VI']);
  for (const row of rows) {
    assert.deepEqual(Object.keys(row).sort(), ['claims', 'denominator_scope', 'directory_row_counts', 'export_policy', 'jurisdiction_code']);
    assert.deepEqual(row.claims, catalog.claims);
    assert.equal(row.export_policy, catalog.export_policy);
    assert.equal(row.directory_row_counts.combined, row.directory_row_counts.hospital + row.directory_row_counts.nursing_home);
  }
  for (const [index, key] of ['hospital', 'nursing_home'].entries()) {
    const source = sourceArtifact.sources[index], expected = retained.source_denominators[key];
    assert.deepEqual(source.claims, catalog.claims);
    assert.equal(source.export_policy, catalog.export_policy);
    assert.equal(source.directory_rows, expected.all_retained_directory_rows);
    for (const [selected, scope, countKey, sourceMap] of [[rows.slice(0, 51), '50-states-and-dc', 'state_dc_retained_directory_rows', source.state_rows], [rows.slice(51), 'territories-outside-50-states-and-dc', 'territory_retained_directory_rows', source.territory_rows]]) {
      assert.equal(selected.reduce((sum, row) => sum + row.directory_row_counts[key], 0), expected[countKey]);
      for (const row of selected) {
        assert.equal(row.denominator_scope, scope);
        assert.equal(row.directory_row_counts[key], sourceMap[row.jurisdiction_code]);
      }
    }
    assert.equal(expected.all_retained_directory_rows, expected.state_dc_retained_directory_rows + expected.territory_retained_directory_rows);
  }
  return sourceArtifact;
}

async function fixture() {
  const catalog = JSON.parse(await boundedRead(catalogPath));
  const manifestBytes = await boundedRead(catalog.retained_release.manifest);
  const base = path.posix.dirname(catalog.retained_release.manifest), artifacts = {};
  for (const file of ['jurisdictions.jsonl', 'sources.json']) artifacts[file] = await boundedRead(`${base}/${file}`);
  return { catalog, manifestBytes, artifacts };
}

test('metadata registration exactly binds retained CMS catalog artifacts, counts, lineage and non-enrollment claims', async () => {
  const { catalog, manifestBytes, artifacts } = await fixture();
  const sourceArtifact = reconcile(catalog, manifestBytes, artifacts);
  for (const [index, filename] of ['config/cms-hospital-retained-selection.json', 'config/cms-nursing-home-retained-selection.json'].entries()) {
    const selectionBytes = await boundedRead(filename), selection = JSON.parse(selectionBytes), source = sourceArtifact.sources[index];
    assert.equal(hash(selectionBytes), source.selection_sha256);
    assert.equal(selection.manifestSha256, source.source_manifest_sha256);
    const bytes = await boundedRead(selection.manifestPath);
    assert.equal(hash(bytes), source.source_manifest_sha256);
    assert.equal(JSON.parse(bytes).runId, source.release_id);
  }
});

test('registration reconciliation rejects changed pins, count inflation, artifact drift and upgraded claims', async () => {
  const { catalog, manifestBytes, artifacts } = await fixture();
  for (const mutate of [
    value => { value.retained_release.manifest_sha256 = '0'.repeat(64); },
    value => { value.retained_release.denominators.all_retained_directory_rows++; },
    value => { value.retained_release.artifact_bytes++; },
    value => { value.production_enrollment = true; },
    value => { value.national_reporting_denominator_enrollment = true; },
    value => { value.claims.current_operating_count = 20109; },
    value => { value.claims.national_completeness_percent = 100; },
    value => { value.export_policy = 'public'; },
    value => { value.runtime_pointer = 'data/business-coverage-views/current.json'; },
  ]) {
    const changed = structuredClone(catalog); mutate(changed);
    assert.throws(() => reconcile(changed, manifestBytes, artifacts));
  }
  assert.throws(() => reconcile(catalog, manifestBytes, { ...artifacts, 'jurisdictions.jsonl': Buffer.concat([artifacts['jurisdictions.jsonl'], Buffer.from('\n')]) }));
});
