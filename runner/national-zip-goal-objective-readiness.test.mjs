import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readNationalZipGoalAcceptance, projectNationalZipObjectiveReadiness, NATIONAL_ZIP_GOAL_ACCEPTANCE_READINESS_TEST_HOOKS } from './national-zip-goal-acceptance.mjs';
import { nationalZipGoalObjectiveReadinessHttp } from './national-zip-goal-objective-readiness-http.mjs';

const codes = ['entity-resolution-benchmark-gate-not-passed', 'entity-resolution-not-applied', 'nationwide-industry-universe-unmeasured', 'broad-jurisdiction-source-gaps', 'current-operation-not-independently-verified', 'reporting-only-sites-not-eligible-or-verified', 'entity-geography-relationship-not-complete', 'lifecycle-active-eligibility-not-established', 'lifecycle-stale-records-present', 'lifecycle-unknown-or-contradictory'];
const ledger = [['geography','achieved'],['entity-geography-relationship','partial'],['postal-denominator','blocked'],['source-authorization-policy-and-provenance','partial'],['broad-state-coverage','blocked'],['industry-coverage','unmeasured'],['temporal-and-current-operation','blocked'],['lifecycle-eligibility','blocked'],['reconciliation-and-benchmark','blocked'],['all-business-completeness-denominator','unmeasured'],['reporting-only-site-qualification','partial'],['business-entity-source-policy-provenance','achieved']];
const actual = async () => projectNationalZipObjectiveReadiness(await readNationalZipGoalAcceptance({ claim: 'every-active-business-by-valid-zip' }));

function harness(method = 'GET', options = {}) {
  const request = new EventEmitter(); Object.assign(request, { method, headers: {}, aborted: false, resume() {}, ...options.request });
  const response = new EventEmitter(); Object.assign(response, { writableEnded: false, destroyed: false, headers: {}, setHeader(name, value) { this.headers[name] = value; } });
  const result = { request, response, calls: 0, status: null, body: null };
  const json = (res, status, body) => { result.calls++; result.status = status; result.body = body; res.writableEnded = true; };
  return { ...result, run: (url = new URL('http://local/api/business-map/national-objective-readiness'), deps = {}) => nationalZipGoalObjectiveReadinessHttp(request, response, url, json, deps), get: () => result };
}

test('strict projection exposes twelve ordered requirements, blockers, forty gaps, null completeness, and pinned lineage', async () => {
  const value = await actual();
  assert.equal(value.status, 'not-accepted'); assert.equal(value.acceptance.accepted, false);
  assert.deepEqual(value.requirements_ledger.map(row => [row.requirement, row.status]), ledger);
  assert.equal(value.requirements_ledger.length, 12); assert.equal(value.requirements_ledger.find(row => row.requirement === 'broad-state-coverage').current_gap_count, 40);
  const reporting = value.requirements_ledger.find(row => row.requirement === 'reporting-only-site-qualification');
  assert.deepEqual([reporting.site_count, reporting.matching_profile_count, reporting.zip_present_count, reporting.zip_absent_count,
    reporting.active_business_eligible_count, reporting.current_operation_verified_count, reporting.usps_unverified_count], [13182, 0, 13010, 172, 0, 0, 13182]);
  const geoRow = value.requirements_ledger.find(row => row.requirement === 'entity-geography-relationship');
  assert.equal(geoRow.status, 'partial'); assert.equal(geoRow.profile_count, 8011835); assert.equal(geoRow.registry_profile_count, 8011835);
  assert.equal(geoRow.postal_counts['same-code-zcta-candidate'], 7963395); assert.equal(geoRow.postal_counts['outside-zcta'], 48439);
  assert.equal(geoRow.postal_counts['explicit-placeholder'], 1); assert.equal(geoRow.postal_counts.missing, 0);
  assert.equal(geoRow.point_assignment_counts['assigned-single-county'], 372079); assert.equal(geoRow.point_assignment_counts['missing-geocode'], 6976397);
  assert.equal(geoRow.point_assignment_counts['unassignable-legacy-coordinate-crs-unproven'], 640383); assert.equal(geoRow.reported_state_conflict_count, 11);
  assert.equal(geoRow.usps_unverified_profile_count, 8011835); assert.equal(geoRow.same_code_zcta_is_membership, false);
  assert.equal(geoRow.entity_polygons_present, false); assert.equal(geoRow.usps_operational_assignment_verified, false);
  assert.deepEqual(value.requirements_ledger.find(row => row.requirement === 'lifecycle-eligibility'), { requirement: 'lifecycle-eligibility', status: 'blocked', profile_count: 8011835, registry_profile_count: 8011835, active_business_eligible_count: 0, stale_count: 24230, unknown_or_contradictory_count: 635899, verified_current_operation_count: 0, evidence: 'Retained lifecycle evidence is conservative: stale, unknown, and contradictory profiles remain ineligible; no row independently verifies current operation.' });
  assert.equal(value.broad_jurisdiction_gap_count, 40); assert.equal(value.claims.all_business_completion_percent, null);
  assert.equal(value.claims.active_business_count, null); assert.equal(value.claims.current_operating_business_count, null);
  assert.equal(value.claims.current_operations_verified, false); assert.equal(value.claims.all_business_completeness, false);
  assert.equal(value.claims.public_export_authorized, false); assert.equal(value.claims.network_requests, 0);
  for (const code of codes) assert.ok(value.acceptance.blockers.includes(code));
  assert.deepEqual(Object.keys(value.lineage).sort(), ['broad_organization_projection','goal_completion_matrix','temporal_claim_matrix','zip_entity_resolution','zip_industry_matrix','lifecycle_eligibility','business_entity_geography_relationship','reporting_only_site_qualification','business_entity_source_policy_provenance'].sort());
  for (const key of ['zip_entity_resolution','zip_industry_matrix','temporal_claim_matrix']) assert.match(value.lineage[key].manifest_sha256, /^[a-f0-9]{64}$/);
  assert.match(value.lineage.goal_completion_matrix.report_sha256, /^[a-f0-9]{64}$/);
  assert.match(value.lineage.broad_organization_projection.program_manifest_sha256, /^[a-f0-9]{64}$/);
  assert.equal(value.lineage.lifecycle_eligibility.profile_count, 8011835);
  assert.equal(value.lineage.lifecycle_eligibility.active_business_eligible_count, 0);
  assert.equal(value.lineage.lifecycle_eligibility.registry_profile_count, 8011835);
  assert.equal(value.lineage.business_entity_geography_relationship.release_id, 'business-entity-geography-relationship-99d70051979cb4d4e116b832994daef87f84ab919d6392f4fa9e98ea3798f8d7');
  assert.equal(value.lineage.business_entity_geography_relationship.registration_sha256, 'bc81d33b80a92da55f31713d36813807e7224da599ab24aa3898522b338f5829');
  assert.equal(value.lineage.business_entity_geography_relationship.artifact_inventory_sha256, 'ca92485cf7659fc8f4565fe81de5728c960de9667f9b5c605f66c9e07d24a5f5');
  assert.equal(value.lineage.business_entity_geography_relationship.artifact_count, 100);
  assert.equal(value.lineage.reporting_only_site_qualification.record_count, 13182);
  assert.equal(value.lineage.business_entity_source_policy_provenance.release_id, 'business-entity-source-policy-provenance-c43ddd5a681702e77c1446a31bdd07264a6a206a5435947d353e0d7c3e3ed098');
  assert.equal(value.lineage.business_entity_source_policy_provenance.registration_sha256, 'dea750ba0c597b4792189f321cdba2d6f73e69664fcb901587ad0d43302e603f');
  assert.equal(value.lineage.business_entity_source_policy_provenance.source_count, 15);
  assert.equal(value.requirements_ledger.find(row => row.requirement === 'business-entity-source-policy-provenance').profile_policy_rows_verified, 8011835);
  assert.equal(value.lineage.reporting_only_site_qualification.registration_sha256, '0eb4e02a94d3618362b2d9fbc0f58c34a826481befbafbc0655a8a0a69b049ba');
  assert.deepEqual(value.lineage.reporting_only_site_qualification.source_manifest_hashes, { MA: 'c6d811e5743a03d7126d1e34b3763f4c1acbd495a5b4cf68f82c716c50fba1fc', NJ: 'b873a912c61e1cc13b53bac9ad6265380625344e3d9bb7795217913b8632049e', TN: '98234ee44e52e9fcf8cdecfb1812b49029a2444316832df95f90b18518ffa55d', OH: 'e4de0ed529da81c09522c52b9990b41a1edad1adf906f9eea2b95363ff241171' });
  assert.equal(value.lineage.reporting_only_site_qualification.source_bindings.MA.transformation_version, 'ma-childcare-normalization@1.0.0');
  assert.equal(value.lineage.reporting_only_site_qualification.zip_temporal_qualification_artifact_sha256, '958cb73f61dc27bf8bbbcb3f3e666917f8c885a59bf1470129ccadb5e2a862ed');
  assert.equal(value.lineage.reporting_only_site_qualification.geography_manifest_sha256, '5426cae150c0fba64f8ff43a48ca39c4e78b5b4ba8a8007fbd211615540d1c8b');
  assert.equal(value.claims.active_business_eligible_count, 0);
  const report = await readNationalZipGoalAcceptance({ claim: 'every-active-business-by-valid-zip' });
  assert.throws(() => projectNationalZipObjectiveReadiness({ ...report, objective_readiness: { ...report.objective_readiness, requirements_ledger: report.objective_readiness.requirements_ledger.map(row => row.requirement === 'industry-coverage' ? { ...row, status: 'achieved' } : row) } }), /rejected/);
  assert.throws(() => projectNationalZipObjectiveReadiness({ ...report, objective_readiness: { ...report.objective_readiness, bindings: { ...report.objective_readiness.bindings, lifecycle_eligibility: { ...report.objective_readiness.bindings.lifecycle_eligibility, artifact_inventory_sha256: '0'.repeat(64) } } } }), /rejected/);
  const geo = report.objective_readiness.bindings.business_entity_geography_relationship;
  for (const mutate of [
    value => { delete value.bindings.business_entity_geography_relationship; },
    value => { value.bindings.business_entity_geography_relationship.registration_sha256 = '0'.repeat(64); },
    value => { value.bindings.business_entity_geography_relationship.manifest_sha256 = '0'.repeat(64); },
    value => { value.bindings.business_entity_geography_relationship.artifact_inventory_sha256 = '0'.repeat(64); },
    value => { value.bindings.business_entity_geography_relationship.artifacts[0].sha256 = '0'.repeat(64); },
    value => { value.bindings.business_entity_geography_relationship.profile_count++; },
    value => { value.bindings.business_entity_geography_relationship.point_assignment_counts['assigned-single-county']++; },
    value => { value.bindings.business_entity_geography_relationship.claims.postal_validity_verified = true; },
    value => { value.bindings.business_entity_geography_relationship.upstream.zip_audit_manifest_sha256 = '0'.repeat(64); },
    value => { value.requirements_ledger = value.requirements_ledger.filter(row => row.requirement !== 'entity-geography-relationship'); },
    value => { value.bindings.reporting_only_site_qualification.artifact_sha256 = '0'.repeat(64); },
    value => { value.bindings.reporting_only_site_qualification.source_manifest_policy_hashes.MA = '0'.repeat(64); },
    value => { value.bindings.reporting_only_site_qualification.policy_profile_hashes.MA = '0'.repeat(64); },
    value => { value.bindings.reporting_only_site_qualification.source_bindings.NJ.policy_profile_path = '../njdep-childcare-local-review.json'; },
    value => { value.requirements_ledger.find(row => row.requirement === 'reporting-only-site-qualification').site_count++; },
    value => { delete value.bindings.reporting_only_site_qualification; },
  ]) {
    const changed = structuredClone(report.objective_readiness); mutate(changed);
    assert.throws(() => projectNationalZipObjectiveReadiness({ ...report, objective_readiness: changed }), /rejected/);
  }
  assert.equal(geo.profile_count, 8011835);
});

test('HTTP accepts only bodyless GET and projects through the bound reader', async () => {
  const h = harness(); let args;
  await h.run(undefined, { reader: async value => { args = value; return {}; }, projector: () => ({ available: true }) });
  assert.equal(h.get().status, 200); assert.equal(h.get().body.available, true); assert.equal(args.claim, 'every-active-business-by-valid-zip');
  assert.ok(args.signal instanceof AbortSignal); assert.equal(h.response.headers['Cache-Control'], 'no-store');
  for (const invalid of [
    harness('POST'),
    harness('GET', { request: { headers: { 'content-length': '1' } } }),
    harness('GET', { request: { headers: { 'transfer-encoding': 'chunked' } } }),
  ]) {
    await invalid.run(); assert.equal(invalid.get().status, 400); assert.equal(invalid.get().calls, 1);
  }
  const query = harness(); await query.run(new URL('http://local/api/business-map/national-objective-readiness?state=CA'));
  assert.equal(query.get().status, 400);
});

test('reader and strict projector failures are redacted as 503', async () => {
  const h = harness(); await h.run(undefined, { reader: async () => { throw Error('secret-path-do-not-leak'); } });
  assert.equal(h.get().status, 503); assert.doesNotMatch(JSON.stringify(h.get().body), /secret-path/);
  assert.equal(Object.hasOwn(h.get().body, 'blocker_code'), false);
  const lifecycleInvalid = harness(); await lifecycleInvalid.run(undefined, { reader: async () => { const error = Error('private lifecycle path'); error.code = 'LIFECYCLE_RELEASE_INVALID'; throw error; } });
  assert.equal(lifecycleInvalid.get().status, 503); assert.deepEqual(lifecycleInvalid.get().body, {
    error: 'National objective readiness evidence is unavailable or incompatible.', blocker_code: 'lifecycle-release-unavailable-or-invalid' });
  const reportingInvalid = harness(); await reportingInvalid.run(undefined, { reader: async () => { const error = Error('private reporting path'); error.code = 'REPORTING_SITE_RELEASE_INVALID'; throw error; } });
  assert.equal(reportingInvalid.get().status, 503); assert.deepEqual(reportingInvalid.get().body, {
    error: 'National objective readiness evidence is unavailable or incompatible.', blocker_code: 'reporting-only-site-release-unavailable-or-invalid' });
  const policyInvalid = harness(); await policyInvalid.run(undefined, { reader: async () => { const error = Error('private raw policy path'); error.code = 'SOURCE_POLICY_PROVENANCE_INVALID'; throw error; } });
  assert.equal(policyInvalid.get().status, 503); assert.deepEqual(policyInvalid.get().body, {
    error: 'National objective readiness evidence is unavailable or incompatible.', blocker_code: 'business-entity-source-policy-provenance-release-unavailable-or-invalid' });
  const invalid = harness(); await invalid.run(undefined, { reader: async () => ({}), projector: () => { throw Error('private'); } });
  assert.equal(invalid.get().status, 503); assert.doesNotMatch(JSON.stringify(invalid.get().body), /private/);
});

test('disconnect aborts the acceptance read and emits no response', async () => {
  const h = harness(); let signal;
  const pending = h.run(undefined, { timeoutMs: 1000, reader: ({ signal: received }) => { signal = received; return new Promise(() => {}); } });
  await new Promise(resolve => setImmediate(resolve)); h.request.emit('aborted'); await pending;
  assert.equal(signal.aborted, true); assert.equal(h.get().calls, 0);
});

test('geography binding reader fails closed on missing or tampered registration, manifest, inventory, and shard bytes', async () => {
  const sourceRegistration = await readFile('config/datasets/business-entity-geography-relationship.json');
  const sourceManifestPath = 'data/business-entity-geography-relationship/releases/business-entity-geography-relationship-99d70051979cb4d4e116b832994daef87f84ab919d6392f4fa9e98ea3798f8d7/manifest.json';
  const sourceManifest = await readFile(sourceManifestPath), manifest = JSON.parse(sourceManifest.toString('utf8'));
  async function fixture({ includeRegistration = true, includeManifest = true, mutateRegistration, mutateManifest, includeFirstShard = false, corruptFirstShard = false } = {}) {
    const root = await mkdtemp(path.join(tmpdir(), 'goal-geography-binding-'));
    const registrationPath = path.join(root, 'config/datasets/business-entity-geography-relationship.json');
    const manifestPath = path.join(root, sourceManifestPath);
    await mkdir(path.dirname(registrationPath), { recursive: true });
    if (includeRegistration) await writeFile(registrationPath, mutateRegistration ? mutateRegistration(sourceRegistration.toString('utf8')) : sourceRegistration);
    if (includeManifest) {
      await mkdir(path.dirname(manifestPath), { recursive: true });
      await writeFile(manifestPath, mutateManifest ? mutateManifest(sourceManifest.toString('utf8')) : sourceManifest);
      if (includeFirstShard) {
        const shard = manifest.artifacts[0], shardPath = path.join(path.dirname(manifestPath), shard.path);
        await mkdir(path.dirname(shardPath), { recursive: true });
        await writeFile(shardPath, corruptFirstShard ? Buffer.alloc(shard.bytes, 0x5a) : Buffer.alloc(shard.bytes));
      }
    }
    return root;
  }
  const cases = [
    await fixture({ includeRegistration: false }),
    await fixture({ includeManifest: false }),
    await fixture({ mutateRegistration: text => text.replace('registered-pointer-free-local-review-only', 'tampered') }),
    await fixture({ mutateManifest: text => text.replace('immutable-pointer-free-local-review-only', 'tampered') }),
    await fixture({ mutateManifest: text => text.replace(manifest.artifacts[0].sha256, '0'.repeat(64)) }),
    await fixture({ includeFirstShard: true }),
    await fixture({ includeFirstShard: true, corruptFirstShard: true }),
  ];
  try {
    for (const root of cases) await assert.rejects(NATIONAL_ZIP_GOAL_ACCEPTANCE_READINESS_TEST_HOOKS.readVerifiedBusinessEntityGeographyBinding({ root }), /rejected|ENOENT|no such file/i);
  } finally { for (const root of cases) await rm(root, { recursive: true, force: true }); }
});

test('entity-geography requirement cannot become achieved until exact ZIP and point completeness conditions hold', () => {
  const complete = { profile_count: 5, registry_profile_count: 5, usps_unverified_profile_count: 0,
    postal_counts: { 'same-code-zcta-candidate': 5, 'outside-zcta': 0, 'explicit-placeholder': 0, missing: 0 },
    point_assignment_counts: { 'assigned-single-county': 5, unmatched: 0, ambiguous: 0, conflict: 0, 'missing-geocode': 0,
      'invalid-coordinate': 0, 'unassignable-legacy-coordinate-crs-unproven': 0, 'unassignable-coordinate-not-premise-point': 0 },
    reported_state_conflict_count: 0, claims: { postal_validity_verified: true },
    semantics: { usps_deliverability_verified: true, same_code_zcta_is_membership: false } };
  assert.equal(NATIONAL_ZIP_GOAL_ACCEPTANCE_READINESS_TEST_HOOKS.entityGeographyRequirementComplete(complete), true);
  for (const mutate of [
    value => { value.registry_profile_count--; },
    value => { value.postal_counts['explicit-placeholder'] = 1; },
    value => { value.postal_counts.missing = 1; },
    value => { value.usps_unverified_profile_count = 1; },
    value => { value.point_assignment_counts['missing-geocode'] = 1; value.point_assignment_counts['assigned-single-county']--; },
    value => { value.semantics.same_code_zcta_is_membership = true; },
    value => { value.reported_state_conflict_count = 1; },
  ]) { const changed = structuredClone(complete); mutate(changed); assert.equal(NATIONAL_ZIP_GOAL_ACCEPTANCE_READINESS_TEST_HOOKS.entityGeographyRequirementComplete(changed), false); }
});

test('server keeps authorization before the GET-only objective readiness route', async () => {
  const source = await readFile(new URL('./server.mjs', import.meta.url), 'utf8');
  const auth = source.indexOf('controlPlane.authorize(request)'), route = source.indexOf("url.pathname === '/api/business-map/national-objective-readiness'");
  assert.ok(auth >= 0 && route > auth); assert.match(source, /nationalZipGoalObjectiveReadinessHttp\(request, response, url, json\)/);
});
