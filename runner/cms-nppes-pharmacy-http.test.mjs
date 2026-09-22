import test from 'node:test';
import assert from 'node:assert/strict';
import { cmsNppesPharmacyHttp } from './cms-nppes-pharmacy-http.mjs';

function harness(query, method = 'GET') {
  const output = {};
  const response = {};
  const url = new URL(`http://localhost/api/business-map/pharmacies/map${query}`);
  const view = { get: async (value) => { output.query = value; return { ok: true }; } };
  return { output, response, request: { method }, url, view, json: (target, status, body) => { output.status = status; output.body = body; } };
}

test('pharmacy API accepts bounded read-only filters', async () => {
  const testCase = harness('?level=zctas&state=TX&zip=75001&query=Main&limit=5');
  await cmsNppesPharmacyHttp(testCase.request, testCase.response, testCase.url, testCase.view, testCase.json);
  assert.equal(testCase.output.status, 200);
  assert.deepEqual(testCase.output.query, { level: 'zctas', state: 'TX', zip: '75001', query: 'Main', limit: '5' });
});

test('pharmacy API rejects unknown and repeated options', async () => {
  for (const query of ['?download=true', '?state=TX&state=CA']) {
    const testCase = harness(query);
    await cmsNppesPharmacyHttp(testCase.request, testCase.response, testCase.url, testCase.view, testCase.json);
    assert.equal(testCase.output.status, 400);
  }
});

test('pharmacy API is GET-only', async () => {
  const testCase = harness('', 'POST');
  await cmsNppesPharmacyHttp(testCase.request, testCase.response, testCase.url, testCase.view, testCase.json);
  assert.equal(testCase.output.status, 405);
});
