import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { APP_ROOT } from './paths.mjs';
import { evaluateNationalZipGoalAcceptanceFixture as evaluate, readNationalZipGoalAcceptance, NATIONAL_ZIP_GOAL_ACCEPTANCE_TEST_HOOKS as hooks,
  NATIONAL_ZIP_GOAL_ACCEPTANCE_READINESS_TEST_HOOKS as readinessHooks, activeBusinessResolutionGateEstablished, lifecycleActiveEligibilityEstablished } from './national-zip-goal-acceptance.mjs';

function fixture() {
  return {
    registry: { complete_national_business_registry: false, coverage: { zip_union_records: 3, zips_with_record_level_contributions: 2, authoritative_current_usps_zip_denominator: null } },
    coverage: { complete_all_businesses: false, authoritative_current_usps_zip_denominator: null,
      spatial_zip_polygon_denominator: { geography_type: 'census-zcta5', zip4_polygon_applicability: 'not-applicable', count: 2,
        zcta_member_set_sha256: createHash('sha256').update('00123\n00124\n').digest('hex'), source_vintage: 'fixture-Census' },
      coverage: { spatial_zip_polygon_denominator_count: 2, zip_views_with_zcta_polygon: 2, zip_views: 3,
        zip_views_with_record_level_source_contribution: 2, zip_views_without_record_level_source_contribution: 1, zip_views_without_zcta_polygon: 1 } },
    geography: { complete_national_release: true, coverage: { zctas: 2, source_available_counts: { zctas: 2 } } },
    candidate: { dataset_id: 'usps-city-state-operational-denominator-candidate', production_admission: false },
    zctaMembers: new Set(['00123', '00124']), zipMembers: new Set(['00000', '00123', '00124']), contributionMembers: new Set(['00000', '00123']), bindings: {},
  };
}

test('Census/source coverage reporting remains accepted while USPS universal completion is rejected', () => {
  for (const claim of ['report-only', 'complete-selected-census-zcta-denominator', 'source-reported-zip-membership']) {
    const report = evaluate(fixture(), claim);
    assert.equal(report.acceptance.accepted, true);
    assert.equal(report.census_zcta_spatial_denominator.complete_selected_index_membership, true);
    assert.equal(report.census_zcta_spatial_denominator.polygon_geometry_bytes_replayed, false);
    assert.equal(report.source_reported_zip_membership.includes_explicit_00000_placeholder, true);
    assert.equal(report.source_reported_zip_membership.operational_zip_validity_verified, false);
    assert.equal(report.authoritative_current_operational_usps_zip_denominator.every_valid_zip_completion_accepted, false);
    assert.equal(report.all_business_completion_percent, null);
    assert.equal(report.zip4_geometric, false);
  }
  for (const claim of ['every-valid-usps-zip', 'every-active-business-by-valid-zip']) {
    const report = evaluate(fixture(), claim);
    assert.equal(report.acceptance.accepted, false);
    assert.ok(report.acceptance.blockers.includes('authoritative-current-usps-denominator-unavailable'));
  }
  const assignment = evaluate(fixture(), 'complete-current-usps-area-district-assignment-set');
  assert.equal(assignment.acceptance.accepted, false);
  assert.ok(assignment.acceptance.blockers.includes('authoritative-current-usps-denominator-unavailable'));
});

test('an independently verified Area/District set accepts only the narrow assignment claim', () => {
  const input = fixture(), digest = createHash('sha256').update('00123\n00124\n').digest('hex');
  const denominator = { count: 2, member_set_sha256: digest, evidence_scope: 'current-usps-area-district-5-digit-zip-assignments' };
  input.registry.coverage.authoritative_current_usps_zip_denominator = denominator;
  input.coverage.authoritative_current_usps_zip_denominator = denominator;
  input.uspsProof = { verified: true, member_count: 2, member_set_sha256: digest };
  const assignment = evaluate(input, 'complete-current-usps-area-district-assignment-set');
  assert.equal(assignment.acceptance.accepted, true);
  assert.equal(assignment.authoritative_current_operational_usps_zip_denominator.complete_current_area_district_assignment_set_accepted, true);
  assert.equal(assignment.authoritative_current_operational_usps_zip_denominator.every_valid_zip_completion_accepted, false);
  assert.equal(assignment.authoritative_current_operational_usps_zip_denominator.complete_current_delivery_zip_registry, false);
  const valid = evaluate(input, 'every-valid-usps-zip');
  assert.equal(valid.acceptance.accepted, false);
  assert.ok(valid.acceptance.blockers.includes('complete-current-delivery-zip-registry-not-established'));
  const businesses = evaluate(input, 'every-active-business-by-valid-zip');
  assert.equal(businesses.acceptance.accepted, false);
  assert.ok(businesses.acceptance.blockers.includes('all-business-universe-unmeasured'));
  assert.ok(businesses.acceptance.blockers.includes('current-business-operations-not-independently-verified'));
});

test('assignment artifact traversal and self-consistent semantic widening fail closed', () => {
  const manifest = 'data/zip-validity/usps-operational-zips/releases/release-1/manifest.json';
  assert.equal(hooks.assignmentArtifactPath(manifest, 'derived/operational-zip-assignments.jsonl'),
    'data/zip-validity/usps-operational-zips/releases/release-1/derived/operational-zip-assignments.jsonl');
  for (const value of ['../outside.jsonl', 'derived/../outside.jsonl', '/outside.jsonl', 'derived/other.jsonl']) {
    assert.throws(() => hooks.assignmentArtifactPath(manifest, value), /escapes immutable release/);
  }
  const row = { schema_version: '1.0.0', zip_code: '00501', assignment_status: 'listed-in-current-usps-area-district-file',
    evidence_scope: 'operational-area-district-5-digit-zip-assignment', deliverability_status: 'not-asserted', zcta_status: 'not-asserted',
    source_month: '2026-08', export_policy: 'permission-governed' };
  hooks.validateAssignmentRow(row, '2026-08', 'permission-governed');
  for (const mutate of [value => { value.assignment_status = 'valid-usps-zip'; }, value => { value.deliverability_status = 'deliverable'; },
    value => { value.zcta_status = 'included'; }, value => { value.source_month = '2026-09'; }, value => { value.export_policy = 'public'; },
    value => { value.evidence_scope = 'complete-delivery-zip-registry'; }]) {
    const widened = structuredClone(row); mutate(widened); assert.throws(() => hooks.validateAssignmentRow(widened, '2026-08', 'permission-governed'), /widened/);
  }
});

test('non-null, malformed, or mismatched USPS proof fails closed', () => {
  const digest = createHash('sha256').update('00123\n').digest('hex');
  for (const proof of [null, { verified: false, member_count: 1, member_set_sha256: digest },
    { verified: true, member_count: 2, member_set_sha256: digest }, { verified: true, member_count: 1, member_set_sha256: '0'.repeat(64) }]) {
    const input = fixture(), denominator = { count: 1, member_set_sha256: digest };
    input.registry.coverage.authoritative_current_usps_zip_denominator = denominator;
    input.coverage.authoritative_current_usps_zip_denominator = denominator;
    input.uspsProof = proof;
    assert.throws(() => evaluate(input, 'every-valid-usps-zip'), /USPS operational proof mismatch/);
  }
});

test('incompatible Census, source membership, postal or completeness evidence fails closed', () => {
  for (const mutate of [
    value => { value.geography.complete_national_release = false; },
    value => { value.geography.coverage.source_available_counts.zctas = 3; },
    value => { value.coverage.spatial_zip_polygon_denominator.zcta_member_set_sha256 = '0'.repeat(64); },
    value => { value.coverage.spatial_zip_polygon_denominator.zip4_polygon_applicability = 'polygon'; },
    value => { value.zipMembers.delete('00124'); value.zipMembers.add('00999'); },
    value => { value.contributionMembers.delete('00123'); value.contributionMembers.add('00999'); },
    value => { value.registry.coverage.zips_with_record_level_contributions++; },
    value => { value.coverage.authoritative_current_usps_zip_denominator = 42; },
    value => { delete value.registry.coverage.authoritative_current_usps_zip_denominator; },
    value => { value.registry.complete_national_business_registry = true; },
    value => { value.candidate.production_admission = 'false'; },
  ]) { const value = fixture(); mutate(value); assert.throws(() => evaluate(value), /rejected/); }
  assert.throws(() => evaluate(fixture(), 'complete'), /unknown completion claim/);
});

test('current retained ZIP membership check binds evidence without accepting every-valid-ZIP completion', async () => {
  const report = await readNationalZipGoalAcceptance({ claim: 'every-valid-usps-zip' });
  assert.equal(report.acceptance.accepted, false);
  assert.equal(report.census_zcta_spatial_denominator.count, 33791);
  assert.equal(report.source_reported_zip_membership.zip_union_count, 48194);
  assert.equal(report.source_reported_zip_membership.with_record_level_source_contribution, 47995);
  assert.equal(report.source_reported_zip_membership.denominator_only_count, 199);
  assert.equal(report.source_reported_zip_membership.outside_selected_zcta_count, 14403);
  assert.equal(report.source_reported_zip_membership.source_contributed_outside_selected_zcta_count, 14361);
  assert.equal(report.source_reported_zip_membership.denominator_only_outside_selected_zcta_count, 41);
  assert.equal(report.authoritative_current_operational_usps_zip_denominator.denominator, null);
  assert.equal(report.authoritative_current_operational_usps_zip_denominator.candidate_production_admission, false);
  assert.equal(Object.keys(report.bindings).length, 9);
  for (const evidence of Object.values(report.bindings)) assert.match(evidence.sha256, /^[a-f0-9]{64}$/);
  assert.equal(report.production_execution, false); assert.equal(report.publication_performed, false); assert.equal(report.network_requests, 0);
});

test('active-business acceptance binds exact governance releases and stays blocked by the closed readiness ledger', async () => {
  const report = await readNationalZipGoalAcceptance({ claim: 'every-active-business-by-valid-zip' });
  assert.equal(report.acceptance.accepted, false);
  const readiness = report.objective_readiness;
  assert.equal(readiness.schema_version, 'national-zip-objective-readiness@1.7.0');
  assert.deepEqual(readiness.bindings.non_zcta_source_geography_context, {
    registration_path:'config/datasets/non-zcta-source-geography-context.json',registration_sha256:'b8d9f6cc7ccea0c031f2ba7bf6a5f4176fcb747cef5594fc83607553c84595bd',
    release_id:'non-zcta-source-geography-context-74bc53b82b5e1b271ba5275c50734eb9aeb7f888fa18156647e62967ccad69fd',manifest_sha256:'c71cb60e9c1f5fe97937f0f55ac3249caa20c871102d6ee57889f44d84dc2c16',summary_sha256:'e2d2d113bb6c6844970eb7ac18d6dc888aafb99df5bbef3ab453b9c3e31bf95b',rows:14402,source_contributed_outside_zcta:14361,denominator_only_outside_zcta:41,relationship_keys:8871,no_relationship_keys:5531,state_assignment:false,cardinal_or_central_grouping:null,map_blocked:false,state_denominator_integration:false,business_completeness:null,
  });
  assert.deepEqual(readiness.requirements_ledger.map(row => [row.requirement, row.status]), [
    ['geography', 'achieved'], ['entity-geography-relationship', 'partial'], ['postal-denominator', 'blocked'], ['source-authorization-policy-and-provenance', 'partial'],
    ['broad-state-coverage', 'blocked'], ['industry-coverage', 'unmeasured'], ['temporal-and-current-operation', 'blocked'], ['lifecycle-eligibility', 'blocked'],
    ['reconciliation-and-benchmark', 'blocked'], ['all-business-completeness-denominator', 'unmeasured'], ['reporting-only-site-qualification', 'partial'],
    ['business-entity-source-policy-provenance', 'achieved'],
  ]);
  assert.equal(readiness.requirements_ledger.find(row => row.requirement === 'broad-state-coverage').current_gap_count, 40);
  assert.deepEqual(readiness.requirements_ledger.find(row=>row.requirement==='temporal-and-current-operation'),{requirement:'temporal-and-current-operation',status:'blocked',effective_source_defined_current_membership_sources:21,effective_non_active_reporting_sources:7,effective_annual_aggregate_sources:1,effective_unknown_status_sources:1,source_cohort_current_membership_sources:22,mismatch_profiles:633232,verified_current_complete_jurisdictions:0,evidence:'Lifecycle reconciliation is authoritative for effective status; the retained source cohort labels and reference clocks do not independently verify current operation.'});
  const geoRow = readiness.requirements_ledger.find(row => row.requirement === 'entity-geography-relationship');
  assert.equal(geoRow.profile_count, 8011835); assert.equal(geoRow.registry_profile_count, 8011835);
  assert.deepEqual(geoRow.postal_counts, { 'same-code-zcta-candidate': 7963395, 'outside-zcta': 48439, 'explicit-placeholder': 1, missing: 0 });
  assert.deepEqual(geoRow.point_assignment_counts, { 'assigned-single-county': 372079, unmatched: 21, ambiguous: 7, conflict: 0, 'missing-geocode': 6976397, 'invalid-coordinate': 0, 'unassignable-legacy-coordinate-crs-unproven': 640383, 'unassignable-coordinate-not-premise-point': 22948 });
  assert.equal(geoRow.reported_state_conflict_count, 11); assert.equal(geoRow.usps_unverified_profile_count, 8011835);
  assert.equal(geoRow.usps_operational_assignment_verified, false); assert.equal(geoRow.usps_deliverability_verified, false);
  assert.equal(geoRow.same_code_zcta_is_membership, false); assert.equal(geoRow.entity_polygons_present, false);
  assert.deepEqual(readiness.blockers.map(row => row.code), ['entity-resolution-benchmark-gate-not-passed', 'entity-resolution-not-applied',
    'nationwide-industry-universe-unmeasured', 'broad-jurisdiction-source-gaps', 'current-operation-not-independently-verified',
    'reporting-only-sites-not-eligible-or-verified', 'entity-geography-relationship-not-complete',
    'lifecycle-active-eligibility-not-established', 'lifecycle-stale-records-present', 'lifecycle-unknown-or-contradictory']);
  assert.equal(readiness.blockers.find(row => row.code === 'broad-jurisdiction-source-gaps').count, 40);
  const lifecycleRow = readiness.requirements_ledger.find(row => row.requirement === 'lifecycle-eligibility');
  assert.equal(lifecycleRow.profile_count, 8011835); assert.equal(lifecycleRow.active_business_eligible_count, 0);
  assert.equal(lifecycleRow.stale_count, 24230); assert.equal(lifecycleRow.unknown_or_contradictory_count, 635899);
  assert.deepEqual(readiness.bindings.lifecycle_eligibility.review_status_counts, { 'within-review-window': 7987605, stale: 24230, unmeasured: 0, unmapped: 0 });
  assert.deepEqual(readiness.bindings.lifecycle_eligibility.lifecycle_evidence_counts, { 'source-defined-current': 5240481, 'non-active-reporting': 2135455, unknown: 633232, contradictory: 2667 });
  const policyRow = readiness.requirements_ledger.find(row => row.requirement === 'business-entity-source-policy-provenance');
  assert.deepEqual([policyRow.source_count, policyRow.profile_count, policyRow.policy_files_verified, policyRow.profile_policy_rows_verified,
    policyRow.authorization_granted, policyRow.acquisition_authorized, policyRow.export_authorized], [15, 8011835, 15, 8011835, false, false, false]);
  assert.equal(report.acceptance.blocker_details.find(row => row.code === 'broad-jurisdiction-source-gaps').count, 40);
  assert.equal(report.acceptance.blocker_details.find(row => row.code === 'lifecycle-active-eligibility-not-established').profile_count, 8011835);
  assert.equal(report.acceptance.blocker_details.find(row => row.code === 'lifecycle-active-eligibility-not-established').eligible_count, 0);
  assert.equal(report.acceptance.blocker_details.find(row => row.code === 'lifecycle-stale-records-present').count, 24230);
  assert.equal(report.acceptance.blocker_details.find(row => row.code === 'lifecycle-unknown-or-contradictory').count, 635899);
  for (const blocker of ['entity-resolution-benchmark-gate-not-passed', 'entity-resolution-not-applied', 'nationwide-industry-universe-unmeasured',
    'broad-jurisdiction-source-gaps', 'current-operation-not-independently-verified', 'reporting-only-sites-not-eligible-or-verified', 'entity-geography-relationship-not-complete', 'lifecycle-active-eligibility-not-established',
    'lifecycle-stale-records-present', 'lifecycle-unknown-or-contradictory']) assert.ok(report.acceptance.blockers.includes(blocker));
  for (const [name, binding] of Object.entries(readiness.bindings)) {
    assert.ok(binding.release_id, name); assert.match(binding.manifest_sha256, /^[a-f0-9]{64}$/);
    assert.match(binding.registration_sha256 ?? binding.manifest_sha256, /^[a-f0-9]{64}$/);
  }
  assert.equal(readiness.bindings.zip_entity_resolution.manifest_sha256, '742ffc2d35cc3f4e5541cc2325879b2da563ae7565a9d86829e9ec20560277ba');
assert.equal(readiness.bindings.zip_industry_matrix.release_id,'national-exact-zip-industry-evidence-matrix-e5287a4adc3f9b657499135d2f5641dac05b67359d9dbaf14ad4b72d598c97c9');
  assert.equal(readiness.bindings.zip_industry_matrix.registration_sha256,'04b0ff129f6ff46cbc38d1374dd3e08babd4dd9852a890ea769be430cef1b72b');
  assert.equal(readiness.bindings.zip_industry_matrix.manifest_sha256, '07192a24eae937d5fbe3d58f4c877d5cfefcc70d3f2ca24237b450d316d111f7');
  assert.deepEqual([readiness.bindings.zip_industry_matrix.zip5_rows,readiness.bindings.zip_industry_matrix.dimension_count,readiness.bindings.zip_industry_matrix.industry_cells],[48194,51,2457894]);
  assert.equal(readiness.bindings.zip_industry_matrix.temporal_qualification.registration_sha256,'fa9c83d1193f72d59c97bd6bdb90cd5a31fafa99a5039236931977aefc85599f');
  assert.equal(readiness.bindings.zip_industry_matrix.temporal_qualification.qualification_cell_total,2457894);
  assert.equal(readiness.bindings.zip_industry_matrix.national_summary.registration_sha256,'6d08eb60a5182fa3316467f67fd3ebfb72daecd0f99993c36faa185be9164155');
  assert.equal(readiness.bindings.zip_industry_matrix.national_summary.raw_status_cell_total,2457894);
  assert.equal(readiness.bindings.zip_industry_matrix.national_summary.derived_evidence_cell_total,2457894);
  assert.equal(readiness.bindings.zip_industry_matrix.national_summary.raw_status_preserved_separately,true);
  assert.equal(readiness.bindings.zip_industry_matrix.recursive_lineage_verified,true);
  assert.equal(readiness.bindings.zip_industry_matrix.claims.publisher_membership,'New York Agriculture and Markets annual licensed retail-food-store snapshot');
  assert.equal(readiness.bindings.zip_industry_matrix.claims.lifecycle_status,'non-active-reporting');
  assert.equal(readiness.bindings.zip_industry_matrix.claims.publisher_scope,'New York State');
  assert.equal(readiness.bindings.zip_industry_matrix.claims.nonadditive_with_ny_retail_food_location_profiles,true);
  assert.equal(readiness.bindings.zip_industry_matrix.claims.address_evidence_may_not_qualify_as_physical_site,true);
  assert.equal(readiness.bindings.zip_industry_matrix.claims.unique_business_count,null);
  assert.equal(readiness.bindings.zip_industry_matrix.claims.complete_selected_official_view_snapshot,true);
  assert.equal(readiness.bindings.zip_industry_matrix.claims.source_coordinates_available,true);
  assert.equal(readiness.bindings.zip_industry_matrix.claims.site_occupancy_verified,false);
  assert.equal(readiness.bindings.zip_industry_matrix.claims.public_access_verified,false);
  assert.equal(readiness.bindings.zip_industry_matrix.claims.aggregate_export_policy,'public-under-open-ny-terms-with-attribution-and-limitations');
  assert.equal(readiness.bindings.zip_industry_matrix.claims.current_operations_verified,false);
  assert.equal(readiness.bindings.zip_industry_matrix.claims.continuous_operation_verified,false);
  assert.equal(readiness.bindings.zip_industry_matrix.claims.complete_all_businesses,false);
  assert.equal(readiness.bindings.zip_industry_matrix.claims.record_export_policy,'local-review-only');
  assert.equal(readiness.bindings.temporal_claim_matrix.manifest_sha256, '342691d68f76cc38bc8ce480266fd5d36be3c7f892d258b8bfde5be94417ed05');
  assert.equal(readiness.bindings.temporal_lifecycle_reconciliation.registration_sha256,'8d772918c6f0bcf3ab664bc769f732a1c4941414bd1b5ce4c430516a252b007e');
  assert.deepEqual(readiness.bindings.temporal_lifecycle_reconciliation.effective_classification_counts,{'source-defined-current-membership':21,'non-active-reporting-membership':7,'annual-aggregate':1,'unknown-source-status':1});
  assert.equal(readiness.bindings.lifecycle_eligibility.release_id, 'business-entity-lifecycle-eligibility-afc1ef2c825cca630134a0d84dbff6777cf5d0b7710d4cff6172439f6c7928d0');
  assert.equal(readiness.bindings.lifecycle_eligibility.registration_sha256, '2afa49be56059b2e61873f6dd328dfbf873b24feb03e5cf5ee8f9c288f9e979c');
  assert.equal(readiness.bindings.reporting_only_site_qualification.record_count, 13182);
  assert.deepEqual(readiness.bindings.reporting_only_site_qualification.source_manifest_policy_hashes, { MA: 'bc5877f6f0b12a875e59464a71814ce7395e2cd8d292abae57e42f93086d8201', NJ: '79c0957df9fcdc66a856e5a6c242e24ef0296179eb93e4c8b298a32df2f61410', TN: '78300cd344afafd62d3a662a30d913871bd3fbd96cb59b03793e11b0b60f3b1b', OH: '53ead19c9463f270ed5def5eb0f848e46d3288d2a59844c53a8b317cad0b5c98' });
  assert.deepEqual(readiness.bindings.reporting_only_site_qualification.policy_profile_hashes, { MA: '8a2812e436c3b2bc9c4c88dd2299d406b8d8610cd88f851a9f5f664fa43a4742', NJ: '3a935abc814e7f46e6048bdb20ec25c67b3a70aa4cfb81b0d9494a35c9cb26cc', TN: '06b8b84549c26d2e3bcabdb89244463ef5fbd525c88170aab548b42267e1110e', OH: 'f1aa0c95eb96ba2cb6d10e75ded2011890cea61816d7b8b337ef1081dda4b6e2' });
  assert.equal(readiness.bindings.lifecycle_eligibility.manifest_sha256, 'd62cd007616c08da7ed71c3b7ecb4ac9890f1d8c0e711a4613e08e8e5cdb296e');
  assert.equal(readiness.bindings.lifecycle_eligibility.taxonomy_sha256, '7c7dcc49afdae859d20de95e785c2efe3e40b43e395091de934ee76a1f99f6cc');
  assert.equal(readiness.bindings.lifecycle_eligibility.artifact_inventory_sha256, 'ef3c2a697f8504656d884b1dde88317d4ed6a04597d99d957e28795f2a417907');
  assert.equal(readiness.bindings.goal_completion_matrix.broad_layer_gaps, 40);
  assert.equal(readiness.bindings.broad_organization_projection.metadata.gate_readiness.distinct_keys_classified, 121);
  assert.equal(readiness.claims.acceptance, false); assert.equal(readiness.claims.report_only, true);
  assert.equal(readiness.claims.network_requests, 0); assert.equal(readiness.claims.writes, 0); assert.equal(readiness.claims.pointers_changed, false);
  const invalids = [
    value => { value.bindings.zip_entity_resolution.manifest_sha256 = '0'.repeat(64); },
    value => { value.bindings.zip_industry_matrix.release_id = 'self-consistent-unverified-release'; },
    value => { value.bindings.zip_industry_matrix.dimension_count = 42; },
    value => { value.bindings.zip_industry_matrix.recursive_lineage_verified = false; },
    value => { value.bindings.zip_industry_matrix.temporal_qualification.registration_sha256='0'.repeat(64); },
    value => { value.bindings.zip_industry_matrix.temporal_qualification.current_operations_verified=true; },
    value => { value.bindings.zip_industry_matrix.claims.nonadditive_with_ny_retail_food_location_profiles=false; },
    value => { value.bindings.zip_industry_matrix.claims.address_evidence_may_not_qualify_as_physical_site=false; },
    value => { value.bindings.zip_industry_matrix.claims.source_coordinates_are_verified_premises=true; },
    value => { value.bindings.zip_industry_matrix.claims.complete_selected_official_view_snapshot=false; },
    value => { value.bindings.zip_industry_matrix.claims.site_occupancy_verified=true; },
    value => { value.bindings.zip_industry_matrix.claims.public_access_verified=true; },
    value => { value.bindings.zip_industry_matrix.claims.current_operations_verified=true; },
    value => { value.bindings.zip_industry_matrix.national_summary.raw_status_cell_total--; },
    value => { value.bindings.zip_industry_matrix.national_summary.raw_status_preserved_separately=false; },
    value => { value.bindings.temporal_claim_matrix.summary.broad_state_dc_gaps = 0; },
    value => { value.bindings.temporal_lifecycle_reconciliation.effective_classification_counts['source-defined-current-membership']=22; },
    value => { value.bindings.temporal_lifecycle_reconciliation.registration_sha256='0'.repeat(64); },
    value => { value.bindings.temporal_lifecycle_reconciliation.current_operations_verified=true; },
    value => { value.bindings.publisher_membership_reconciliation.current_operations_verified=true; },
    value => { value.bindings.publisher_membership_reconciliation.profile_count--; },
    value => { value.requirements_ledger.find(row => row.requirement === 'industry-coverage').status = 'achieved'; },
    value => { value.bindings.broad_organization_projection.metadata.gate_readiness.taxonomy_exhaustive = false; },
    value => { value.bindings.lifecycle_eligibility.taxonomy_sha256 = '0'.repeat(64); },
    value => { value.bindings.lifecycle_eligibility.artifact_inventory_sha256 = '0'.repeat(64); },
    value => { value.bindings.lifecycle_eligibility.profile_count = 1; },
    value => { value.blockers.find(row => row.code === 'broad-jurisdiction-source-gaps').count = 39; },
    value => { delete value.bindings.goal_completion_matrix; },
  ];
  for (const mutate of invalids) { const changed = structuredClone(readiness); mutate(changed); assert.throws(() => readinessHooks.validateGoalReadinessBindings(changed), /rejected/); }
});

test('abort and unknown claim reject before retained I/O', async () => {
  await assert.rejects(readNationalZipGoalAcceptance({ signal: AbortSignal.abort() }), { name: 'AbortError' });
  await assert.rejects(readNationalZipGoalAcceptance({ claim: 'all-done' }), /unknown completion claim/);
});

test('lifecycle active-eligibility transition requires full denominator, zero uncertainty/staleness, and every operation verified', () => {
  const safe = { release_manifest_verified: true, registry_profile_count: 12, profile_count: 12, active_business_eligible_count: 12, current_operation_verified_count: 12,
    review_status_counts: { stale: 0, unmeasured: 0, unmapped: 0 }, lifecycle_evidence_counts: { unknown: 0, contradictory: 0 } };
  assert.equal(lifecycleActiveEligibilityEstablished(safe), true);
  for (const changed of [
    { ...safe, active_business_eligible_count: 11 }, { ...safe, current_operation_verified_count: 11 },
    { ...safe, review_status_counts: { ...safe.review_status_counts, stale: 1 } },
    { ...safe, review_status_counts: { ...safe.review_status_counts, unmeasured: 1 } },
    { ...safe, review_status_counts: { ...safe.review_status_counts, unmapped: 1 } },
    { ...safe, lifecycle_evidence_counts: { ...safe.lifecycle_evidence_counts, unknown: 1 } },
    { ...safe, lifecycle_evidence_counts: { ...safe.lifecycle_evidence_counts, contradictory: 1 } },
    { ...safe, profile_count: 0 }, { ...safe, registry_profile_count: 13 }, { ...safe, release_manifest_verified: false },
  ]) assert.equal(lifecycleActiveEligibilityEstablished(changed), false);
  assert.equal(lifecycleActiveEligibilityEstablished({ ...safe, active_business_eligible_count: undefined }), false);
  assert.equal(activeBusinessResolutionGateEstablished(safe, { entity_resolution_applied: true, benchmark_gate_passed: true }), true);
  assert.equal(activeBusinessResolutionGateEstablished(safe, { entity_resolution_applied: false, benchmark_gate_passed: true }), false);
  assert.equal(activeBusinessResolutionGateEstablished(safe, { entity_resolution_applied: true, benchmark_gate_passed: false }), false);
});

test('read-only CLI succeeds for truthful reporting and exits two for universal ZIP completion', () => {
  for (const [claim, status] of [['source-reported-zip-membership', 0], ['every-valid-usps-zip', 2], ['every-active-business-by-valid-zip', 2]]) {
    const result = spawnSync(process.execPath, [path.join(APP_ROOT, 'scripts/check-national-zip-goal.mjs'), '--claim', claim],
      { cwd: APP_ROOT, encoding: 'utf8', timeout: 60000, maxBuffer: 1000000, windowsHide: true });
    assert.ifError(result.error); assert.equal(result.status, status, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.requested_claim, claim); assert.equal(report.acceptance.accepted, status === 0);
    assert.equal(report.network_requests, 0); assert.equal(report.publication_performed, false);
  }
});
