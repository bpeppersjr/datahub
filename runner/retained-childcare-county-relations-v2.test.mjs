import test from 'node:test';
import assert from 'node:assert/strict';
import { createRetainedCountyIndex, deriveRetainedCountyRelations } from './retained-childcare-county-relations.mjs';
import { calculateSyntheticCountyRelationsV2, loadRetainedCountyRelationsV2, buildRetainedCountyRelationsV2,
  inspectRetainedCountyRelationsV2 } from './retained-childcare-county-relations-v2.mjs';
const states = [{ geoid: '24', postal_abbreviation: 'MD' }, { geoid: '42', postal_abbreviation: 'PA' }];
const box = (id, left, right) => ({ type: 'Feature', properties: { GEOID: id }, geometry: { type: 'Polygon',
  coordinates: [[[left, 39], [right, 39], [right, 41], [left, 41], [left, 39]]] } });
const index = () => createRetainedCountyIndex([box('42001', -78, -77), box('24001', -77, -76)],
  [{ geoid: '42001', state_fips: '42' }, { geoid: '24001', state_fips: '24' }]);
const row = (n, overrides = {}) => ({ candidate_id: `candidate:childcare:${String(n).padStart(64, '0')}`,
  source: { dataset_id: 'md-msde-childcare-centers' }, geocode: { latitude: 40, longitude: -76.5, crs: 'EPSG:4326' },
  reported_address: { state: 'MD', zip_code: '00123', zip4: '0045' }, ...overrides });
test('synthetic successor changes only eligible MD relationships and preserves postal and source evidence', async () => {
  const records = [row(1), row(2, { geocode: { latitude: 40, longitude: -77.5, crs: 'EPSG:4326' } }),
    row(3, { reported_address: { state: null, zip_code: '00123', zip4: '0045' } }),
    row(4, { geocode: { latitude: 40, longitude: -77, crs: 'EPSG:4326' } }),
    row(5, { geocode: { latitude: 0, longitude: 0, crs: 'EPSG:4326' } }),
    row(6, { geocode: { latitude: null, longitude: -77, crs: 'EPSG:4326' } }),
    row(7, { geocode: { latitude: 40, longitude: -76.5, crs: null } }),
    row(8, { geocode: { latitude: null, longitude: null, crs: null } }),
    row(9, { source: { dataset_id: 'pa-dhs-childcare-centers' }, geocode: { latitude: 40, longitude: -77.5, crs: 'EPSG:4326' },
      reported_address: { state: 'PA', zip_code: '17001', zip4: '0123' } })];
  const original = structuredClone(records), previous = await deriveRetainedCountyRelations(records, index());
  const result = await calculateSyntheticCountyRelationsV2(records, index(), states);
  assert.deepEqual(records, original); assert.equal(result.evidence_mode, 'synthetic-test'); assert.equal(result.publication_eligible, false);
  assert.equal(result.successor.maryland_candidate_rows, 8); assert.equal(result.successor.eligibility_decisions_changed, 5);
  assert.deepEqual(result.rows.slice(0, 5).map(r => r.status), ['assigned-single-county', 'assigned-single-county', 'assigned-single-county', 'ambiguous-county-boundary', 'coordinate-not-in-county-polygon']);
  assert.deepEqual(result.rows.slice(0, 3).map(r => r.reported_state_relation), ['matches', 'requires-review', 'unresolved']);
  for (let n = 5; n < records.length; n++) assert.deepEqual(result.rows[n], previous.rows[n]);
  for (let n = 0; n < records.length; n++) for (const key of ['candidate_id', 'dataset_id', 'reported_state', 'reported_zip5', 'reported_zip4']) assert.equal(result.rows[n][key], previous.rows[n][key]);
  assert.equal(Object.values(result.counts.by_status).reduce((a, b) => a + b, 0), records.length);
  assert.equal(result.counts.by_county.reduce((sum, r) => sum + r.candidate_rows, 0), result.counts.by_status['assigned-single-county']);
  assert.equal(result.public_export_authorized, false); assert.equal(result.national_reporting_integrated, false);
  assert.equal(JSON.stringify(result).includes('geometry'), false);
});
test('successor rejects duplicate state maps, forged production inputs and cancellation', async () => {
  await assert.rejects(calculateSyntheticCountyRelationsV2([row(1)], index(), [states[0], states[0]]));
  await assert.rejects(calculateSyntheticCountyRelationsV2([row(1), row(1)], index(), states));
  await assert.rejects(calculateSyntheticCountyRelationsV2([], index(), states, { signal: AbortSignal.abort() }));
  for (const value of [{ records: [] }, { policy: {} }, { context: {} }, { report: {} }, { fetchImpl() {} }, { geometry: index() }]) {
    await assert.rejects(loadRetainedCountyRelationsV2(value)); await assert.rejects(buildRetainedCountyRelationsV2(value));
  }
  await assert.rejects(buildRetainedCountyRelationsV2({ signal: AbortSignal.abort() }));
  await assert.rejects(inspectRetainedCountyRelationsV2('manifest.json'));
});
test('actual successor independently verifies retained source and county evidence without acquisition', {
  skip: !process.env.DATAHUB_TEST_RETAINED_COUNTY_V2_MANIFEST,
}, async () => {
  const result = await inspectRetainedCountyRelationsV2(process.env.DATAHUB_TEST_RETAINED_COUNTY_V2_MANIFEST);
  assert.equal(result.counts.candidate_rows, 12206); assert.equal(result.source_requests_this_build, 0);
  assert.equal(result.successor.eligibility_decisions_changed, 1772);
  assert.equal(result.counts.by_status['unknown-coordinate-system'], 1476);
  assert.equal(result.counts.by_status['missing-source-point'], 4028);
  assert.equal(result.counts.by_status['source-not-enabled-for-overlay'], 0);
  assert.equal(result.counts.by_status['assigned-single-county'], 6702);
  const maryland = result.counts.by_county.filter(row => row.county_geoid.startsWith('24'));
  const pennsylvania = result.counts.by_county.filter(row => row.county_geoid.startsWith('42'));
  assert.equal(maryland.length, 24); assert.equal(pennsylvania.length, 66);
  assert.equal(maryland.reduce((sum, row) => sum + row.candidate_rows, 0), 1772);
  assert.equal(pennsylvania.reduce((sum, row) => sum + row.candidate_rows, 0), 4930);
  assert.equal(result.successor.non_maryland_relationships_preserved, true);
});
