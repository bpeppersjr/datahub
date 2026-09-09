import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {APP_ROOT} from './paths.mjs';
import {loadUtChildcareReportingEnrollment as load, projectUtChildcareStateEvidence as project} from './ut-childcare-reporting-enrollment.mjs';

const binding = {schema_version: 'ut-childcare-reporting-enrollment@1.0.0', app_receipt_path: 'data/missing/receipt.json', app_receipt_sha256: 'a'.repeat(64)};
test('UT enrollment distinguishes missing evidence from zero and rejects malformed binding or caller overrides', async () => {
  const root = await mkdtemp(path.join(APP_ROOT, 'data/tmp/ut-enrollment-test-'));
  try {
    await mkdir(path.join(root, 'config'));
    const file = path.join(root, 'config/ut-childcare-reporting-enrollment.json');
    assert.deepEqual(await load({root}), {status: 'not-enrolled'});
    await writeFile(file, JSON.stringify(binding));
    const missing = await load({root});
    assert.equal(missing.status, 'unavailable');assert.equal(missing.reason, 'enrolled-receipt-not-installed');
    assert.equal(project(missing, 'UT').candidateRows, undefined);
    for (const options of [null, {root, url: 'private'}, {root, signal: {}}, {root: 'relative'}, Object.create({root})]) await assert.rejects(load(options));
    await assert.rejects(load({root, signal: AbortSignal.abort()}));
    for (const changed of [{...binding, extra: true}, {...binding, app_receipt_sha256: 'bad'}, {...binding, app_receipt_path: 'data/../escape'},
      {...binding, app_receipt_path: 'data\\receipt.json'}, {...binding, app_receipt_path: 'data/file:stream'}, {...binding, app_receipt_path: 'data//receipt.json'}]) {
      await writeFile(file, JSON.stringify(changed));await assert.rejects(load({root}));
    }
    await mkdir(path.join(root, 'data/missing'), {recursive: true});
    await writeFile(path.join(root, binding.app_receipt_path), '{}');
    await writeFile(file, JSON.stringify(binding));await assert.rejects(load({root}));
  } finally {await rm(root, {recursive: true, force: true});}
});

test('UT projection keeps candidate denominators and observation/adoption clocks distinct', () => {
  const enrollment = {status: 'available', sourceId: 'ut-dlbc-childcare-centers', summary: {
    source_candidate_rows: 4, accepted_candidate_rows: 4, quarantined_candidate_rows: 0,
    by_reported_state: [{state: 'UT', candidate_rows: 3, percent_of_accepted_cohort: 75}, {state: null, candidate_rows: 1, percent_of_accepted_cohort: 25}],
    by_reported_zip: [{state: 'UT', zip5: '84001'}, {state: 'UT', zip5: null}], quality: {missing_points: 4},
    provenance: {observed_at: '2026-09-08T22:59:26.309Z', adoption_finished_at: '2026-09-09T00:55:46.000Z'},
  }};
  const result = project(enrollment, 'UT');
  assert.equal(result.candidateRows, 3);assert.equal(result.percentOfAcceptedCohort, 75);assert.equal(result.reportedZIP5Count, 1);
  assert.equal(result.reportedAddressStateUnavailableRows, 1);assert.notEqual(result.observedAt, result.adoptedAt);
  assert.equal(result.nationalIndustryPercent, null);assert.equal(result.uniqueActiveBusinessCount, null);
  assert.equal(result.currentOperationsVerified, false);assert.equal(result.boundaryAssignmentVerified, false);
  assert.equal(project(enrollment, 'CO').status, 'outside-publisher-scope');
});

test('UT installed enrollment replays real retained evidence without acquisition', {skip: process.env.DATAHUB_TEST_APP_PDF !== '1'}, async () => {
  const original = globalThis.fetch;globalThis.fetch = () => assert.fail('no fetch');
  try {
    const enrollment = await load(), evidence = project(enrollment, 'UT');
    assert.equal(enrollment.status, 'available');assert.equal(evidence.candidateRows, 422);
    assert.equal(evidence.reportedZIP5Count, 113);assert.equal(evidence.percentOfAcceptedCohort, 100);
    assert.equal(evidence.quality.with_points, 0);assert.equal(evidence.quality.with_zip4, 0);
    assert.equal(evidence.appReceiptSha256, '79e3303235bbcf04dc366cc4b85c7c22de5b05a896f8d5f910bbd8d17424e190');
  } finally {globalThis.fetch = original;}
});

test('UT reporting CLI help and invalid arguments do not expose supplied values', () => {
  const args = ['scripts/report-ut-childcare.mjs'];
  assert.match(execFileSync(process.execPath, [...args, '--help'], {cwd: APP_ROOT, encoding: 'utf8', windowsHide: true}), /no downloads/);
  assert.throws(() => execFileSync(process.execPath, [...args, '--private', 'secret-value'], {cwd: APP_ROOT, encoding: 'utf8', windowsHide: true, stdio: 'pipe'}),
    error => error.status === 1 && !String(error.stderr).includes('secret-value'));
});
