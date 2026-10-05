import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { readNationalZipGoalAcceptance, projectNationalZipObjectiveReadiness } from './national-zip-goal-acceptance.mjs';
import { nationalZipGoalObjectiveReadinessHttp } from './national-zip-goal-objective-readiness-http.mjs';

const codes = ['entity-resolution-benchmark-gate-not-passed', 'entity-resolution-not-applied', 'nationwide-industry-universe-unmeasured', 'broad-jurisdiction-source-gaps', 'current-operation-not-independently-verified', 'lifecycle-active-eligibility-not-established', 'lifecycle-stale-records-present', 'lifecycle-unknown-or-contradictory'];
const ledger = [['geography','achieved'],['postal-denominator','blocked'],['source-authorization-policy-and-provenance','partial'],['broad-state-coverage','blocked'],['industry-coverage','unmeasured'],['temporal-and-current-operation','blocked'],['lifecycle-eligibility','blocked'],['reconciliation-and-benchmark','blocked'],['all-business-completeness-denominator','unmeasured']];
const actual = async () => projectNationalZipObjectiveReadiness(await readNationalZipGoalAcceptance({ claim: 'every-active-business-by-valid-zip' }));

function harness(method = 'GET', options = {}) {
  const request = new EventEmitter(); Object.assign(request, { method, headers: {}, aborted: false, resume() {}, ...options.request });
  const response = new EventEmitter(); Object.assign(response, { writableEnded: false, destroyed: false, headers: {}, setHeader(name, value) { this.headers[name] = value; } });
  const result = { request, response, calls: 0, status: null, body: null };
  const json = (res, status, body) => { result.calls++; result.status = status; result.body = body; res.writableEnded = true; };
  return { ...result, run: (url = new URL('http://local/api/business-map/national-objective-readiness'), deps = {}) => nationalZipGoalObjectiveReadinessHttp(request, response, url, json, deps), get: () => result };
}

test('strict projection exposes exactly eight ordered requirements, blockers, forty gaps, null completeness, and pinned lineage', async () => {
  const value = await actual();
  assert.equal(value.status, 'not-accepted'); assert.equal(value.acceptance.accepted, false);
  assert.deepEqual(value.requirements_ledger.map(row => [row.requirement, row.status]), ledger);
  assert.equal(value.requirements_ledger.length, 9); assert.equal(value.requirements_ledger.find(row => row.requirement === 'broad-state-coverage').current_gap_count, 40);
  assert.deepEqual(value.requirements_ledger.find(row => row.requirement === 'lifecycle-eligibility'), { requirement: 'lifecycle-eligibility', status: 'blocked', profile_count: 8011835, registry_profile_count: 8011835, active_business_eligible_count: 0, stale_count: 24230, unknown_or_contradictory_count: 635899, verified_current_operation_count: 0, evidence: 'Retained lifecycle evidence is conservative: stale, unknown, and contradictory profiles remain ineligible; no row independently verifies current operation.' });
  assert.equal(value.broad_jurisdiction_gap_count, 40); assert.equal(value.claims.all_business_completion_percent, null);
  assert.equal(value.claims.active_business_count, null); assert.equal(value.claims.current_operating_business_count, null);
  assert.equal(value.claims.current_operations_verified, false); assert.equal(value.claims.all_business_completeness, false);
  assert.equal(value.claims.public_export_authorized, false); assert.equal(value.claims.network_requests, 0);
  for (const code of codes) assert.ok(value.acceptance.blockers.includes(code));
  assert.deepEqual(Object.keys(value.lineage).sort(), ['broad_organization_projection','goal_completion_matrix','temporal_claim_matrix','zip_entity_resolution','zip_industry_matrix','lifecycle_eligibility'].sort());
  for (const key of ['zip_entity_resolution','zip_industry_matrix','temporal_claim_matrix']) assert.match(value.lineage[key].manifest_sha256, /^[a-f0-9]{64}$/);
  assert.match(value.lineage.goal_completion_matrix.report_sha256, /^[a-f0-9]{64}$/);
  assert.match(value.lineage.broad_organization_projection.program_manifest_sha256, /^[a-f0-9]{64}$/);
  assert.equal(value.lineage.lifecycle_eligibility.profile_count, 8011835);
  assert.equal(value.lineage.lifecycle_eligibility.active_business_eligible_count, 0);
  assert.equal(value.lineage.lifecycle_eligibility.registry_profile_count, 8011835);
  assert.equal(value.claims.active_business_eligible_count, 0);
  const report = await readNationalZipGoalAcceptance({ claim: 'every-active-business-by-valid-zip' });
  assert.throws(() => projectNationalZipObjectiveReadiness({ ...report, objective_readiness: { ...report.objective_readiness, requirements_ledger: report.objective_readiness.requirements_ledger.map(row => row.requirement === 'industry-coverage' ? { ...row, status: 'achieved' } : row) } }), /rejected/);
  assert.throws(() => projectNationalZipObjectiveReadiness({ ...report, objective_readiness: { ...report.objective_readiness, bindings: { ...report.objective_readiness.bindings, lifecycle_eligibility: { ...report.objective_readiness.bindings.lifecycle_eligibility, artifact_inventory_sha256: '0'.repeat(64) } } } }), /rejected/);
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
  const invalid = harness(); await invalid.run(undefined, { reader: async () => ({}), projector: () => { throw Error('private'); } });
  assert.equal(invalid.get().status, 503); assert.doesNotMatch(JSON.stringify(invalid.get().body), /private/);
});

test('disconnect aborts the acceptance read and emits no response', async () => {
  const h = harness(); let signal;
  const pending = h.run(undefined, { timeoutMs: 1000, reader: ({ signal: received }) => { signal = received; return new Promise(() => {}); } });
  await new Promise(resolve => setImmediate(resolve)); h.request.emit('aborted'); await pending;
  assert.equal(signal.aborted, true); assert.equal(h.get().calls, 0);
});

test('server keeps authorization before the GET-only objective readiness route', async () => {
  const source = await readFile(new URL('./server.mjs', import.meta.url), 'utf8');
  const auth = source.indexOf('controlPlane.authorize(request)'), route = source.indexOf("url.pathname === '/api/business-map/national-objective-readiness'");
  assert.ok(auth >= 0 && route > auth); assert.match(source, /nationalZipGoalObjectiveReadinessHttp\(request, response, url, json\)/);
});
