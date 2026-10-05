import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { APP_ROOT } from './paths.mjs';
import { businessEntityLifecycleInputs, classifyBusinessEntityLifecycle } from './business-entity-lifecycle-eligibility.mjs';

const taxonomy = JSON.parse(await readFile(path.join(APP_ROOT, 'config/datasets/business-entity-lifecycle-eligibility-taxonomy.json'), 'utf8'));
const item = sourceId => taxonomy.sources.find(row => row.source_id === sourceId);
function profile(sourceId, status, override = {}) {
  const source = item(sourceId);
  return { profile_id: 'location-profile:0123456789abcdef0123456789abcdef', zip_code: '10001', observed_at: '2026-09-03T00:00:00.000Z',
    source_status: status, source: { source_id: sourceId, source_release_id: source.source_release_id, source_record_id: 'record-1', source_record_ids: undefined, policy_id: `policy:${sourceId}` }, ...override };
}
function qualification(review_qualification = 'within-review-window') { return { review_qualification, source_reference_at: '2026-09-01T00:00:00.000Z' }; }
const semantic = (lifecycle_evidence = 'source-defined-current') => ({ classification: lifecycle_evidence === 'non-active-reporting' ? 'non-active-reporting-membership' : 'source-defined-current-membership' });

test('lifecycle taxonomy exhaustively pins the retained 15 profile cohorts and 17 status categories including LA null', async () => {
  assert.equal(taxonomy.sources.length, 15);
  assert.equal(new Set(taxonomy.sources.map(row => row.source_id)).size, 15);
  assert.equal(taxonomy.sources.reduce((n, row) => n + row.source_status_values.length, 0), 16);
  assert.equal(taxonomy.sources.filter(row => row.null_status_allowed === true).length, 1);
  assert.equal(taxonomy.profile_source_count, 15);
  assert.equal(taxonomy.source_status_value_count, 17);
  const input = await businessEntityLifecycleInputs();
  assert.equal(input.source_by_id.size, 15);
  assert.equal(input.registry.release_id, 'national-business-registry-20260911-022652067Z-1ec656c3');
  assert.equal(input.registry.manifest_sha256, 'd8ab131697b1df63ed53fdfa9832d6973fd152ddf23565219ee9bb39b25fbb76');
  assert.equal(input.temporal.release_id, 'national-business-temporal-claim-matrix-534d123499d07ec1beace832268a741fd2228897f222354905c43c2fb09d2090');
  assert.equal(input.qualification.release_id, 'exact-zip-industry-temporal-qualification-53f10242b04721edbe71f6214e0930be1ab95c205f4ec95828eb66e6871d0503');
});

test('every membership and review category remains non-operational and never active-business eligible', () => {
  const currentSource = item('alaska-dcced-active-business-licenses');
  const current = classifyBusinessEntityLifecycle({ profile: profile(currentSource.source_id, { value: currentSource.source_status_values[0] }), taxonomy: currentSource, semantic: semantic(), qualification: qualification() });
  assert.equal(current.source_membership_class, 'source-defined-current-membership');
  assert.equal(current.lifecycle_evidence, 'source-defined-current');
  assert.equal(current.review_status, 'within-review-window');
  assert.equal(current.current_operation_verified, false);
  assert.equal(current.active_business_eligible, false);

  const nppesSource = item('cms-nppes-monthly-v2');
  const nppes = classifyBusinessEntityLifecycle({ profile: profile(nppesSource.source_id, { value: 'npi-active-as-of-source-release' }), taxonomy: nppesSource, semantic: semantic('non-active-reporting'), qualification: qualification('within-review-window') });
  assert.equal(nppes.lifecycle_evidence, 'non-active-reporting');
  assert.equal(nppes.active_business_eligible, false);

  const nySource = item('new-york-agriculture-markets-retail-food-stores');
  const ny = classifyBusinessEntityLifecycle({ profile: profile(nySource.source_id, { value: nySource.source_status_values[0] }), taxonomy: nySource, semantic: semantic('non-active-reporting'), qualification: qualification('stale') });
  assert.equal(ny.lifecycle_evidence, 'non-active-reporting');
  assert.equal(ny.review_status, 'stale');
  assert.ok(ny.reason_codes.includes('source-review-window-stale'));

  for (const review_status of ['stale', 'unmeasured', 'unmapped']) {
    const row = classifyBusinessEntityLifecycle({ profile: profile(currentSource.source_id, { value: currentSource.source_status_values[0] }), taxonomy: currentSource, semantic: semantic(), qualification: qualification(review_status) });
    assert.equal(row.review_status, review_status);
    assert.equal(row.current_operation_verified, false);
    assert.equal(row.active_business_eligible, false);
  }
});

test('LA null, CA contradictory dates, and unknown raw statuses fail closed without widening', () => {
  const laSource = item('los-angeles-office-of-finance-active-businesses');
  const la = classifyBusinessEntityLifecycle({ profile: profile(laSource.source_id, null), taxonomy: laSource, semantic: semantic(), qualification: qualification() });
  assert.equal(la.source_status_value, null);
  assert.equal(la.source_membership_class, 'unknown-source-status');
  assert.equal(la.lifecycle_evidence, 'unknown');
  assert.ok(la.reason_codes.includes('source-status-not-retained'));

  const caSource = item('california-abc-daily-active-licenses');
  const ca = classifyBusinessEntityLifecycle({ profile: profile(caSource.source_id, { value: caSource.source_status_values[0], expiration_before_observation_count: 2 }), taxonomy: caSource, semantic: semantic(), qualification: qualification() });
  assert.equal(ca.source_membership_class, 'contradictory-source-dates');
  assert.equal(ca.lifecycle_evidence, 'contradictory');
  assert.ok(ca.reason_codes.includes('source-reports-expiration-before-observation'));
  assert.equal(ca.active_business_eligible, false);

  const unknown = classifyBusinessEntityLifecycle({ profile: profile(caSource.source_id, { value: 'future-unregistered-source-label' }), taxonomy: caSource, semantic: semantic(), qualification: qualification() });
  assert.equal(unknown.lifecycle_evidence, 'unknown');
  assert.equal(unknown.active_business_eligible, false);
  assert.ok(unknown.reason_codes.includes('source-status-value-not-in-closed-taxonomy'));
});

test('profile-count denominators, named exceptions, and separate CO assertion scope stay exact', () => {
  const counts = taxonomy.expected_profile_counts;
  assert.deepEqual(counts, {
    'alaska-dcced-active-business-licenses': 94550, 'california-abc-daily-active-licenses': 84497,
    'city-of-chicago-bacp-current-active-business-licenses': 42940, 'cms-nppes-monthly-v2': 2088780,
    'dc-dlcp-active-basic-business-licenses': 54910, 'epa-echo-exporter-active-facility': 1517826,
    'fdic-bankfind-current-structure': 77285, 'fmcsa-company-census-active-us-principal-office': 2195563,
    'los-angeles-office-of-finance-active-businesses': 633232, 'ncua-final-quarterly-call-report': 22445,
    'new-york-agriculture-markets-retail-food-stores': 24230, 'nyc-dcwp-issued-licenses-active-premises': 31163,
    'texas-comptroller-active-sales-tax-permits': 885097, 'usda-fsis-active-mpi-directory': 7237, 'usda-snap-current-retailers': 252080,
  });
  assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), 8011835);
  assert.equal(taxonomy.separate_scopes.length, 1);
  assert.equal(taxonomy.separate_scopes[0].source_id, 'co-business-registry');
  assert.match(taxonomy.separate_scopes[0].scope, /excluded from the 8,011,835 location-profile decisions/);
  assert.equal(taxonomy.separate_scopes[0].operation_verified, false);
});
