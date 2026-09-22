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

test('pharmacy API routes explicitly selected non-primary practice-address evidence through the same read-only view', async () => {
  const testCase = harness('?address_role=non-primary-practice-location&state=TX&zip=75002&query=Main&limit=5');
  const secondaryView = { get: async (value) => { testCase.output.secondary = value; return { status: 'available', semantics: 'reported secondary addresses' }; } };
  await cmsNppesPharmacyHttp(testCase.request, testCase.response, testCase.url, testCase.view, testCase.json, secondaryView);
  assert.equal(testCase.output.status, 200);
  assert.deepEqual(testCase.output.secondary, { state: 'TX', zip: '75002', query: 'Main', limit: 5 });
  assert.deepEqual(testCase.output.body, { status: 'available', semantics: 'reported secondary addresses' });
});

test('pharmacy API rejects unsupported address roles', async () => {
  const testCase = harness('?address_role=physical-site');
  await cmsNppesPharmacyHttp(testCase.request, testCase.response, testCase.url, testCase.view, testCase.json);
  assert.equal(testCase.output.status, 400);
});
