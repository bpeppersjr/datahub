import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import test from 'node:test';
import {APP_ROOT} from './paths.mjs';
import {summarizeUtChildcareAppJob} from './ut-childcare-reporting.mjs';

test('UT reporting rejects unsupported options, accessors and pre-abort without reading evidence', async () => {
  await assert.rejects(summarizeUtChildcareAppJob('missing', {signal: AbortSignal.abort()}), {name: 'AbortError'});
  for (const options of [null, [], {nationalTotal: 1000}, {signal: {}}, Object.create({signal: undefined}),
    Object.defineProperty({}, 'signal', {get() { assert.fail('Do not invoke caller accessors'); }})])
    await assert.rejects(summarizeUtChildcareAppJob('missing', options));
  await assert.rejects(summarizeUtChildcareAppJob('missing'), /Utah retained candidate reporting rejected/);
});

test('UT retained reporting conserves selected cohort, ZIP5, gaps and original observation without network',
  {skip: process.env.DATAHUB_TEST_APP_PDF !== '1', timeout: 120000}, async () => {
    const receiptPath = path.join(APP_ROOT, 'data/industry-segments/runs/c82c25f1-4dcc-4a68-aebe-fd91d81cefe0/state-ut-childcare-centers-retained-UT/jobs/e62e5abb-52f9-4cb7-8984-4917de926293/receipt.json');
    const before = await readFile(receiptPath), receipt = JSON.parse(before), oldFetch = globalThis.fetch;
    globalThis.fetch = () => assert.fail('Read-only retained reporting cannot fetch');
    try {
      const result = await summarizeUtChildcareAppJob(receiptPath);
      assert.equal(result.schema_version, 'ut-childcare-reporting@1.0.0'); assert.equal(result.publisher_scope, 'UT');
      assert.equal(result.source_candidate_rows, 422); assert.equal(result.accepted_candidate_rows, 422); assert.equal(result.quarantined_candidate_rows, 0);
      assert.equal(result.accepted_candidate_rows + result.quarantined_candidate_rows, result.source_candidate_rows);
      assert.deepEqual(result.by_reported_state, [{state: 'UT', candidate_rows: 422, percent_of_accepted_cohort: 100}]);
      assert.equal(result.by_reported_zip.length, 113);
      assert.equal(result.by_reported_zip.reduce((n, row) => n + row.candidate_rows, 0), 422);
      for (const row of result.by_reported_zip) {
        assert.equal(row.state, 'UT'); assert.match(row.zip5, /^\d{5}$/); assert.equal(row.percent_of_accepted_cohort, 100 * row.candidate_rows / 422);
        assert.deepEqual(Object.keys(row), ['state', 'zip5', 'candidate_rows', 'percent_of_accepted_cohort']);
      }
      assert.equal(result.quality.with_zip5, 422); assert.equal(result.quality.with_zip4, 0); assert.equal(result.quality.with_points, 0);
      assert.equal(result.quality.missing_points, 422); assert.equal(result.quality.state_scope_conflicts, 0);
      assert.deepEqual(result.quality.status_unavailable_reasons, {'source-operating-status-not-provided': 422});
      assert.deepEqual(result.quality.point_unavailable_reasons, {'source-coordinates-not-selected': 422});
      assert.deepEqual(result.quality.address_role_unavailable_reasons, {'source-address-role-unspecified': 422});
      assert.equal(result.provenance.app_receipt_sha256, createHash('sha256').update(before).digest('hex'));
      assert.equal(result.provenance.normalized_manifest_sha256, receipt.normalized.manifest_sha256);
      assert.equal(result.provenance.observed_at, '2026-09-08T22:59:26.309Z');
      assert.equal(result.provenance.adoption_started_at, receipt.started_at); assert.equal(result.provenance.adoption_finished_at, receipt.finished_at);
      assert.ok(result.provenance.observed_at < result.provenance.normalization_processed_at);
      assert.ok(result.provenance.normalization_processed_at < result.provenance.adoption_started_at);
      for (const key of ['current_operations_verified', 'national_reporting_integrated', 'public_export_authorized', 'refetch_performed', 'normalization_rebuilt', 'exact_address_geocodes_verified']) assert.equal(result.claims[key], false);
      assert.equal(result.claims.national_completeness_percent, null); assert.equal(result.claims.unique_active_business_count, null);
      assert.doesNotMatch(JSON.stringify(result), /business_name|source_unique_key|facility_id|selected_fields|latitude|longitude/);
      const controller = new AbortController(), pending = summarizeUtChildcareAppJob(receiptPath, {signal: controller.signal});
      setImmediate(() => controller.abort()); await assert.rejects(pending, {name: 'AbortError'});
      assert.deepEqual(await readFile(receiptPath), before);
    } finally { globalThis.fetch = oldFetch; }
  });
