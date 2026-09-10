import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveOkSpatialInventory, buildOkSpatialInventory } from './ok-childcare-spatial-inventory.mjs';

const relation = (zip, state, share, county = '001') => ({
  zcta: zip, state_fips: state, county_fips: county, county_geo_id: `county:${state}${county}`,
  relationship_id: `${zip}:${state}${county}`, raw_share_of_zcta_polygon_area: share,
  material_intersection: share >= 0.001, allocation_semantics: 'polygon-area-only-not-business-location',
});

test('Oklahoma inventory includes material and sliver intersections without dominant-state exclusion', () => {
  const rows = deriveOkSpatialInventory([
    relation('66778', '20', 0.9), relation('66778', '40', 0.1),
    relation('73102', '40', 1), relation('00001', '40', 0.0001), relation('00001', '20', 0.9999),
    relation('99999', '20', 1),
  ]);
  assert.deepEqual(rows.map(r => r.zip5), ['00001', '66778', '73102']);
  assert.equal(rows[0].spatial_priority, 'sliver-only-review');
  assert.deepEqual(rows[1].materially_intersecting_state_fips, ['20', '40']);
  assert.ok(rows.every(r => r.zip4 === null && r.source_rows === null && r.operational_zip_validity === 'unverified'));
  assert.ok(rows.every(r => r.acquisition_status === 'not-queried-in-this-inventory' && !r.business_address_assignment_from_polygon));
});

test('Oklahoma inventory deduplicates ZIP queries but preserves county relationships', () => {
  const rows = deriveOkSpatialInventory([relation('73102', '40', 0.8), relation('73102', '40', 0.2, '003')]);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].oklahoma_county_geo_ids, ['county:40001', 'county:40003']);
});

test('Oklahoma inventory rejects malformed, repeated or inconsistent relationships', () => {
  const row = relation('73102', '40', 1);
  for (const changed of [{ zcta: 73102 }, { zcta: '73102-1234' }, { raw_share_of_zcta_polygon_area: NaN },
    { material_intersection: false }, { county_geo_id: 'county:20001' }, { allocation_semantics: 'business-count' }]) {
    assert.throws(() => deriveOkSpatialInventory([{ ...row, ...changed }]), /verification failed/);
  }
  assert.throws(() => deriveOkSpatialInventory([row, row]), /verification failed/);
});

test('Oklahoma native spatial inventory replays pinned local evidence without downloads', {
  skip: process.env.DATAHUB_TEST_OK_SPATIAL_INVENTORY !== '1',
}, async () => {
  const result = await buildOkSpatialInventory();
  assert.deepEqual(result.counts, { spatial_candidates: 769, material_candidates: 667, sliver_only_candidates: 102,
    material_cross_state_candidates: 4, retained_queries: 1, retained_source_rows: 4,
    not_queried_in_this_inventory: 768, unqueried_material_candidates: 666 });
  assert.equal(result.items.find(r => r.zip5 === '73102').acquisition_status, 'retained-results');
  assert.ok(Object.values(result.claims).every(v => v === false));
});

test('Oklahoma inventory respects cancellation before reading', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(buildOkSpatialInventory({ signal: controller.signal }), { name: 'AbortError' });
});
