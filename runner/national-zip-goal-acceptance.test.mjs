import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { APP_ROOT } from './paths.mjs';
import { evaluateNationalZipGoalAcceptanceFixture as evaluate, readNationalZipGoalAcceptance, NATIONAL_ZIP_GOAL_ACCEPTANCE_TEST_HOOKS as hooks } from './national-zip-goal-acceptance.mjs';

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
  assert.equal(report.authoritative_current_operational_usps_zip_denominator.denominator, null);
  assert.equal(report.authoritative_current_operational_usps_zip_denominator.candidate_production_admission, false);
  assert.equal(Object.keys(report.bindings).length, 9);
  for (const evidence of Object.values(report.bindings)) assert.match(evidence.sha256, /^[a-f0-9]{64}$/);
  assert.equal(report.production_execution, false); assert.equal(report.publication_performed, false); assert.equal(report.network_requests, 0);
});

test('abort and unknown claim reject before retained I/O', async () => {
  await assert.rejects(readNationalZipGoalAcceptance({ signal: AbortSignal.abort() }), { name: 'AbortError' });
  await assert.rejects(readNationalZipGoalAcceptance({ claim: 'all-done' }), /unknown completion claim/);
});

test('read-only CLI succeeds for truthful reporting and exits two for universal ZIP completion', () => {
  for (const [claim, status] of [['source-reported-zip-membership', 0], ['every-valid-usps-zip', 2]]) {
    const result = spawnSync(process.execPath, [path.join(APP_ROOT, 'scripts/check-national-zip-goal.mjs'), '--claim', claim],
      { cwd: APP_ROOT, encoding: 'utf8', timeout: 60000, maxBuffer: 1000000, windowsHide: true });
    assert.ifError(result.error); assert.equal(result.status, status, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.requested_claim, claim); assert.equal(report.acceptance.accepted, status === 0);
    assert.equal(report.network_requests, 0); assert.equal(report.publication_performed, false);
  }
});
