import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { APP_ROOT } from './paths.mjs';
import { businessEntityLifecycleInputs, classifyBusinessEntityLifecycle, readBusinessEntityLifecycleEligibilitySummary, validateBusinessEntityProfilePolicy } from './business-entity-lifecycle-eligibility.mjs';

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
  assert.equal(input.registry.release_id, 'national-business-registry-20261112-005851952Z-44f0a338');
  assert.equal(input.registry.manifest_sha256, '657af52b4fb0cf0d7d00d775f6137acd98499e774937ad5d3d7ab1d82f493048');
  assert.equal(input.temporal.release_id, 'national-business-temporal-claim-matrix-ff98f93ab4373d21a55c5db5ff85f43e1259236c6b11349601097c1c1ea635fd');
  assert.equal(input.qualification.release_id, 'exact-zip-industry-temporal-qualification-f94b7d998adaf47defe9512116113811c8c3af3a738db4e623d817b29c402bbb');
});

test('bounded lifecycle summary binds registration, selected manifest, inventory, lineage and exact conservation', async () => {
  const result = await readBusinessEntityLifecycleEligibilitySummary();
  assert.equal(result.release_id, 'business-entity-lifecycle-eligibility-a4b84f5cace847e888832a2efefd09efadb773463864b11bcfad89be3936087f');
  assert.equal(result.registration_sha256, 'b2e3e336977b43f39a90299c40c67b849c792a50c5b495306c823191a594d127');
  assert.equal(result.manifest_sha256, 'd5477035d4cf9f248ecabac77de1a54ac5acf02bb5658ae591eb530e2ad925ac');
  assert.equal(result.taxonomy_sha256, 'cece2430cabd23fdbedb037f9b4a26c302f0ce1a7daf0200345fc94557a2c676');
  assert.equal(result.artifact_count, 100); assert.equal(result.artifact_record_count, 8011213);
  assert.equal(result.artifact_inventory_sha256, '6a24a12d9baf237e3a876e0152e17444faade376600140afe6115e99b6d1d939');
  assert.deepEqual(result.summary.review_status_counts, { 'within-review-window': 7987605, stale: 0, unmeasured: 23608, unmapped: 0 });
  assert.deepEqual(result.summary.lifecycle_evidence_counts, { 'source-defined-current': 5240481, 'non-active-reporting': 2134833, unknown: 633232, contradictory: 2667 });
  assert.equal(result.summary.profile_count, 8011213);
  assert.equal(result.verified_claims.current_operation_verified, false); assert.equal(result.verified_claims.active_business_eligible, false);

  const root = await mkdtemp(path.join(APP_ROOT, 'data/tmp/lifecycle-summary-'));
  try {
    await assert.rejects(readBusinessEntityLifecycleEligibilitySummary({ root }), /ENOENT|rejected/i);
    const config = path.join(root, 'config/datasets'); await mkdir(config, { recursive: true });
    const registration = JSON.parse(await readFile(path.join(APP_ROOT, 'config/datasets/business-entity-lifecycle-eligibility.json'), 'utf8'));
    registration.retained_releases[0].manifest_sha256 = '0'.repeat(64);
    await writeFile(path.join(config, 'business-entity-lifecycle-eligibility.json'), JSON.stringify(registration));
    await assert.rejects(readBusinessEntityLifecycleEligibilitySummary({ root }), /incompatible/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('lifecycle profile verification binds exact policy identity and source export policy', async () => {
  const input = await businessEntityLifecycleInputs();
  const source = [...input.source_by_id.values()][0];
  const profile = { source: { source_id: source.taxonomy.source_id, source_release_id: source.taxonomy.source_release_id, policy_id: source.policy.policy_id },
    export_policy: source.policy.semantics.export.profile_export_policy };
  assert.equal(validateBusinessEntityProfilePolicy(profile, source.policy), true);
  assert.throws(() => validateBusinessEntityProfilePolicy({ ...profile, source: { ...profile.source, policy_id: 'unknown' } }, source.policy));
  assert.throws(() => validateBusinessEntityProfilePolicy({ ...profile, export_policy: profile.export_policy === 'public' ? 'local-review-only' : 'public' }, source.policy));
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
    'new-york-agriculture-markets-retail-food-stores': 23608, 'nyc-dcwp-issued-licenses-active-premises': 31163,
    'texas-comptroller-active-sales-tax-permits': 885097, 'usda-fsis-active-mpi-directory': 7237, 'usda-snap-current-retailers': 252080,
  });
  assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), 8011213);
  assert.equal(taxonomy.separate_scopes.length, 1);
  assert.equal(taxonomy.separate_scopes[0].source_id, 'co-business-registry');
  assert.match(taxonomy.separate_scopes[0].scope, /excluded from the 8,011,835 location-profile decisions/);
  assert.equal(taxonomy.separate_scopes[0].operation_verified, false);
});
