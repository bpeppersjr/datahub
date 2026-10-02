import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

// Metadata-only reconciliation: no acquisition, production execution, artifact
// decompression, pointer writes or replacement of independent content verification.
async function snapshot(relative) {
  const filename = path.resolve(root, relative);
  const actual = await realpath(filename);
  assert.ok(!path.relative(root, actual).startsWith('..') && !path.isAbsolute(path.relative(root, actual)));
  const stat = await lstat(filename);
  assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 4_000_000);
  const bytes = await readFile(filename);
  return { value: JSON.parse(bytes), hash: sha256(bytes) };
}

async function retained(folder) {
  const pointerPath = `data/${folder}/current.json`;
  const { value: pointer } = await snapshot(pointerPath);
  assert.match(pointer.manifest, /^releases\/[a-z0-9-]+\/manifest\.json$/i);
  const manifestPath = path.posix.join(`data/${folder}`, pointer.manifest);
  const { value: manifest, hash } = await snapshot(manifestPath);
  assert.equal(pointer.dataset_id, manifest.dataset_id);
  assert.equal(pointer.release_id, manifest.release_id);
  assert.equal(pointer.updated_at, manifest.created_at);
  if (pointer.status !== undefined) assert.equal(pointer.status, manifest.status);
  return { manifest, hash, manifestPath, pointerPath };
}

function dependency(declared, source) {
  assert.equal(declared.dataset_id, source.manifest.dataset_id);
  assert.equal(declared.release_id, source.manifest.release_id);
  assert.equal(declared.manifest_sha256, source.hash);
  if (declared.publisher_version !== undefined) assert.equal(declared.publisher_version, source.manifest.publisher.version);
}

test('downstream catalogs bind the retained release chain without upgrading evidence claims', async () => {
  const registry = await retained('business-registry');
  const resolution = await retained('business-entity-resolution');
  const benchmark = await retained('business-entity-resolution-benchmark');
  const coverage = await retained('business-coverage-views');
  const catalogs = new Map();
  for (const item of [resolution, benchmark, coverage]) {
    const { value: catalog } = await snapshot(`config/datasets/${item.manifest.dataset_id}.json`);
    const current = catalog.current_verified_release ?? catalog.current_verified_sample;
    catalogs.set(item.manifest.dataset_id, catalog);
    assert.equal(catalog.dataset_id, item.manifest.dataset_id);
    assert.equal(catalog.runtime_pointer, item.pointerPath);
    assert.equal(current.output, item.pointerPath);
    assert.equal(current.manifest, item.manifestPath);
    assert.equal(current.manifest_sha256, item.hash);
    for (const key of ['release_id', 'publisher', 'created_at', 'status']) assert.deepEqual(current[key], item.manifest[key], key);
    assert.match(current.scope_authority, /manifest is authoritative/);
    assert.deepEqual(current.dependencies, item.manifest.dependencies ?? { registry: item.manifest.dependency });
    assert.equal(current.verified_artifact_count, item.manifest.artifacts.length);
    assert.equal(current.verified_bytes, item.manifest.artifacts.reduce((sum, artifact) => sum + artifact.bytes, 0));
  }
  dependency(resolution.manifest.dependency, registry);
  dependency(benchmark.manifest.dependencies.registry, registry);
  dependency(benchmark.manifest.dependencies.resolution, resolution);
  for (const source of [registry, resolution, benchmark]) {
    const matches = coverage.manifest.dependencies.filter(item => item.dataset_id === source.manifest.dataset_id);
    assert.equal(matches.length, 1);
    dependency(matches[0], source);
  }

  const r = catalogs.get(resolution.manifest.dataset_id).current_verified_release;
  for (const [key, value] of Object.entries(resolution.manifest.coverage)) assert.equal(r[key], value, key);
  assert.equal(r.profiles, registry.manifest.coverage.resolution_location_profiles);
  assert.equal(r.complete_entity_resolution, false);
  assert.equal(r.complete_entity_resolution, resolution.manifest.complete_entity_resolution);
  assert.equal(r.export_policy, resolution.manifest.export_policy);
  assert.match(r.export_policy, /^Local review only until benchmarked precision/);

  const b = catalogs.get(benchmark.manifest.dataset_id).current_verified_sample;
  assert.deepEqual(b.coverage, benchmark.manifest.coverage);
  assert.equal(b.coverage.total_sampled_candidates, Object.values(b.coverage.sampled_candidates).reduce((a, n) => a + n, 0));
  assert.equal(b.coverage.candidate_universe['review-candidate'], r.review_candidate_decisions);
  assert.equal(b.complete_labeled_benchmark, benchmark.manifest.complete_labeled_benchmark);
  assert.equal(b.complete_labeled_benchmark, false);
  assert.equal(b.coverage.submitted_labels, 0);
  assert.equal(b.coverage.benchmark_gate_passed, false);
  assert.equal(b.automatic_precision_gate_passed, false);
  assert.equal(b.export_authorized, false);

  const catalog = catalogs.get(coverage.manifest.dataset_id);
  const v = catalog.current_verified_release;
  const coverageKeys = ['national_views', 'state_views', 'county_views', 'zip_views', 'source_views', 'gap_views',
    'location_profiles_assessed', 'geographic_evidence_assessed', 'reporting_only_locations_assessed',
    'reporting_only_coordinate_assigned', 'reporting_only_identity_matching_eligible', 'coordinate_assigned_profiles',
    'profiles_without_valid_coordinate_assignment', 'geographic_evidence_coordinate_assigned',
    'geographic_evidence_without_valid_coordinate_assignment', 'spatial_zip_polygon_denominator_count',
    'zip_views_with_zcta_polygon', 'zip_views_without_zcta_polygon', 'zip_views_with_record_level_source_contribution',
    'zip_views_without_record_level_source_contribution', 'zip_views_with_published_employer_baseline',
    'zip_views_without_published_employer_baseline', 'nonemployer_reference_year',
    'national_nonemployer_establishments', 'county_nonemployer_establishments'];
  for (const key of coverageKeys) assert.equal(v[key], coverage.manifest.coverage[key], key);
  for (const [key, file] of Object.entries({ national_views: 'national', state_views: 'states', county_views: 'counties', zip_views: 'zips', source_views: 'sources', gap_views: 'coverage-gaps' })) {
    assert.equal(v[key], coverage.manifest.artifacts.find(item => item.path === `views/${file}.jsonl`).record_count);
  }
  assert.equal(v.location_profiles_assessed, r.profiles);
  assert.equal(v.reporting_only_locations_assessed, registry.manifest.coverage.reporting_location_evidence);
  assert.equal(v.reporting_only_locations_assessed, 13182);
  assert.equal(v.geographic_evidence_assessed, v.location_profiles_assessed + v.reporting_only_locations_assessed);
  assert.equal(v.location_profiles_assessed, v.coordinate_assigned_profiles + v.profiles_without_valid_coordinate_assignment);
  assert.equal(v.geographic_evidence_assessed, v.geographic_evidence_coordinate_assigned + v.geographic_evidence_without_valid_coordinate_assignment);
  assert.equal(v.zip_views, v.zip_views_with_zcta_polygon + v.zip_views_without_zcta_polygon);
  assert.equal(v.zip_views, v.zip_views_with_record_level_source_contribution + v.zip_views_without_record_level_source_contribution);
  assert.equal(v.zip_views, v.zip_views_with_published_employer_baseline + v.zip_views_without_published_employer_baseline);
  assert.equal(v.retained_childcare_candidate_rows, registry.manifest.coverage.retained_childcare_candidate_rows);
  assert.equal(v.retained_childcare_candidate_rows, coverage.manifest.retained_childcare_reporting.summary.candidate_rows);
  assert.equal(v.retained_childcare_candidate_rows, 12206);
  assert.equal(v.mn_construction_credential_rows, registry.manifest.coverage.mn_construction_credential_rows);
  assert.equal(v.mn_construction_credential_rows, coverage.manifest.mn_construction_credential_reporting.selected_cohort_rows);
  assert.equal(v.mn_construction_credential_rows, 11456);
  assert.equal(v.reporting_only_identity_matching_eligible, false);
  assert.equal(coverage.manifest.retained_childcare_reporting.summary.current_operations_verified, false);
  assert.equal(coverage.manifest.retained_childcare_reporting.summary.national_completeness_percent, null);
  assert.equal(coverage.manifest.mn_construction_credential_reporting.identity_matching_applied, false);
  assert.equal(coverage.manifest.mn_construction_credential_reporting.public_export_authorized, false);
  assert.deepEqual(v.spatial_zip_polygon_denominator, coverage.manifest.spatial_zip_polygon_denominator);
  assert.equal(v.spatial_zip_polygon_denominator.count, 33791);
  assert.equal(v.spatial_zip_polygon_denominator_count, 33791);
  assert.equal(v.spatial_zip_polygon_denominator.geography_type, 'census-zcta5');
  assert.equal(v.spatial_zip_polygon_denominator.zip4_polygon_applicability, 'not-applicable');
  assert.equal(v.authoritative_current_usps_zip_denominator, coverage.manifest.authoritative_current_usps_zip_denominator);
  assert.equal(v.authoritative_current_usps_zip_denominator, registry.manifest.coverage.authoritative_current_usps_zip_denominator);
  assert.equal(v.authoritative_current_usps_zip_denominator, null);
  assert.deepEqual(v.normalized_postal_field_migration, coverage.manifest.normalized_postal_field_migration);
  assert.equal(v.normalized_postal_field_migration.registry_publisher_version, registry.manifest.publisher.version);
  assert.equal(v.normalized_postal_field_migration.joined_zip4_allowed_in_new_normalized_output, false);
  assert.match(v.normalized_postal_field_migration.normalized_output_contract, /zip4-is-separate-or-null/);
  for (const key of ['complete_all_businesses', 'entity_resolution_applied']) {
    assert.equal(v[key], coverage.manifest[key]);
    assert.equal(v[key], false);
  }
  assert.equal(catalog.completeness_claim, false);
  assert.equal(v.export_policy, coverage.manifest.export_policy);
  assert.match(catalog.count_semantics.national_completeness, /Unmeasured/);
  assert.match(catalog.count_semantics.reporting_boundaries, /not additive unique-business counts/);
  assert.match(catalog.count_semantics.zip4, /separate or null, never joined and never geometric/);
});
