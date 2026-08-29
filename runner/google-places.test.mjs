import assert from 'node:assert/strict';
import test from 'node:test';
import { collectGooglePlacesByZip, normalizeGooglePlacesConfig } from './google-places.mjs';

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const segments = [
  {
    name: 'Restaurants',
    includedTypes: ['restaurant'],
    includePlaceIds: true,
  },
  {
    name: 'Retail',
    includedTypes: ['store'],
    includePlaceIds: false,
  },
];

test('collects count and place-ID segments across ZIP codes', async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url: String(url), options });
    const parsed = new URL(url);
    if (parsed.hostname === 'geocode.googleapis.com') {
      const zipCode = decodeURIComponent(parsed.pathname).match(/\d{5}/)?.[0];
      return jsonResponse({ results: [{ placeId: `zip-${zipCode}`, types: ['postal_code'] }] });
    }
    const body = JSON.parse(options.body);
    const zipCode = body.filter.locationFilter.region.place.replace('places/zip-', '');
    const type = body.filter.typeFilter.includedTypes[0];
    if (body.insights.includes('INSIGHT_PLACES')) {
      return jsonResponse({ placeInsights: [{ place: `places/${zipCode}-${type}-a` }, { place: `places/${zipCode}-${type}-b` }] });
    }
    return jsonResponse({ count: type === 'restaurant' ? '12' : '34' });
  };

  const result = await collectGooglePlacesByZip({
    config: {
      zipCodes: ['60601', '60602'],
      segments,
      maxRequestsPerRun: 8,
      delayMs: 0,
      retries: 0,
      resume: false,
    },
    jobId: 'test-job',
    apiKey: 'test-key',
    fetchImpl,
    checkpointFile: null,
  });

  assert.equal(requests.length, 8);
  assert.equal(result.rows.length, 4);
  assert.equal(result.rows[0].count, '12');
  assert.equal(result.rows[0].placeIds.length, 2);
  assert.equal(result.rows[1].count, '34');
  assert.deepEqual(result.rows[1].placeIds, []);
  assert.equal(result.summary.zipCodes, 2);
  assert.equal(result.summary.segments, 2);
  assert.equal(result.summary.placeIds, 4);
  assert.equal(result.unresolvedZipCodes.length, 0);
});

test('rejects a ZIP collection that exceeds its request budget', async () => {
  await assert.rejects(
    normalizeGooglePlacesConfig({
      zipCodes: ['60601', '60602'],
      segments,
      maxRequestsPerRun: 7,
    }),
    /above its 7 request budget/,
  );
});

test('normalizes numeric and ZIP+4 input without duplicates', async () => {
  const config = await normalizeGooglePlacesConfig({
    zipCodes: [501, '00501-1234', '60601'],
    segments: [segments[0]],
    maxRequestsPerRun: 6,
  });
  assert.deepEqual(config.zipCodes, ['00501', '60601']);
  assert.equal(config.estimatedRequests, 6);
});
