import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { nationalCmsNppesOrganizationPracticeLocationCoverageStatusHttp } from './national-cms-nppes-organization-practice-location-coverage-status-http.mjs';

const json = (response, status, payload) => Object.assign(response, { status, payload });
const url = (query) => new URL(`http://localhost${query}`);
const request = (method = 'GET', headers = {}) => ({ method, headers, readableEnded: true, readableLength: 0 });

test('CMS NPPES status endpoint is empty-GET-only and redacts failures', async () => {
  let calls = 0;
  const load = async () => { calls += 1; return { available: true }; };
  for (const [input, target, status] of [[request(), '/?x=1', 400], [request('POST'), '/', 405], [request('OPTIONS'), '/', 405], [request('GET', { 'content-length': '1' }), '/', 400], [request('GET', { 'transfer-encoding': 'chunked' }), '/', 400]]) {
    const response = {};
    await nationalCmsNppesOrganizationPracticeLocationCoverageStatusHttp(input, response, url(target), load, json);
    assert.equal(response.status, status);
  }
  assert.equal(calls, 0);
  const ok = {};
  await nationalCmsNppesOrganizationPracticeLocationCoverageStatusHttp(request(), ok, url('/'), load, json);
  assert.equal(ok.status, 200);
  const failed = {};
  await nationalCmsNppesOrganizationPracticeLocationCoverageStatusHttp(request(), failed, url('/'), async () => { throw new Error('private'); }, json);
  assert.equal(failed.status, 503);
  assert.doesNotMatch(JSON.stringify(failed), /private/);
});

test('CMS NPPES status loader remains separately governed and non-additive', async () => {
  const source = await readFile(new URL('./national-cms-nppes-organization-practice-location-coverage-status.mjs', import.meta.url), 'utf8');
  for (const expected of [/readNationalCmsNppesOrganizationPracticeLocationCoverage/, /CMS NPPES active organization practice-location coverage/, /generic_business_totals: false/, /generic_pharmacy_totals: false/, /generic_exports: false/, /production_enrollment: false/]) assert.match(source, expected);
});
