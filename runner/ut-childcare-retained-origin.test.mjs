import assert from 'node:assert/strict';
import test from 'node:test';
import {UT_RETAINED_ORIGIN as C, validateUtOriginMetadata, verifyUtRetainedOrigin} from './ut-childcare-retained-origin.mjs';
function fixture() {
  return [{schema_version: 'ut-childcare-document-assessment@1.0.0', purpose: 'source-format-assessment-not-app-acquisition',
    retained_at: '2026-09-08T23:04:32.833Z', export_policy: 'internal-assessment-only', original_document_unmodified: true,
    source_url: C.sourceUrl, source_observed_at: C.observedAt,
    artifacts: [{path: 'source.pdf', bytes: C.sourceBytes, sha256: C.sourceSha256}, {path: 'assessment-receipt.json', bytes: 638, sha256: C.requestSha256}],
    claims: {production_acquisition_verified: false, normalized_candidates_published: false, current_operations_verified: false, national_coverage_integrated: false}},
  {purpose: 'bounded-source-format-assessment-not-production-acquisition', url: C.sourceUrl, method: 'GET', status: 200,
    started_at: '2026-09-08T22:59:26.064Z', finished_at: C.observedAt, bytes: C.sourceBytes, sha256: C.sourceSha256,
    etag: '"6a9704c0-51445"', last_modified: 'Tue, 01 Sep 2026 17:00:48 GMT', file: 'historical-path-never-followed', export_policy: 'internal-assessment-only'}];
}
test('UT logical origin preserves recorded GET scope without inventing historical app or TLS evidence', () => {
  const result = validateUtOriginMetadata(...fixture());
  assert.equal(result.original_get_recorded, true);
  for (const name of ['historical_app_acquisition_verified', 'independent_publisher_authentication', 'redirect_chain_recorded', 'content_type_recorded']) assert.equal(result[name], false);
});
test('UT logical origin rejects altered purpose, publication claims, source identity and chronology', () => {
  for (const mutate of [(m) => m.original_document_unmodified = false, (m) => m.claims.current_operations_verified = true,
    (m) => m.artifacts[0].path = '../source.pdf', (m) => m.retained_at = '2020-01-01T00:00:00.000Z',
    (m, r) => r.method = 'HEAD', (m, r) => r.status = 302, (m, r) => r.url += '?different',
    (m, r) => r.bytes++, (m, r) => r.started_at = 'invalid', (m, r) => r.extra = 'unexpected']) {
    const values = fixture(); mutate(...values); assert.throws(() => validateUtOriginMetadata(...values), /evidence rejected/);
  }
});
test('UT origin reader rejects overrides and pre-cancel before replay', async () => {
  await assert.rejects(verifyUtRetainedOrigin({source: 'elsewhere'}), /verification failed/);
  await assert.rejects(verifyUtRetainedOrigin({signal: AbortSignal.abort()}), {name: 'AbortError'});
});
test('UT retained origin replays every selected field without source refetch', {skip: process.env.DATAHUB_TEST_APP_PDF !== '1'}, async () => {
  const result = await verifyUtRetainedOrigin();
  assert.equal(result.selected.total_rows, 1961); assert.equal(result.selected.selected_rows, 422);
  assert.equal(result.verification.claims.local_replay_verified, true);
  assert.equal(result.verification.claims.refetch_performed, false);
  assert.equal(result.verification.selected_sha256, C.selectedSha256);
});
