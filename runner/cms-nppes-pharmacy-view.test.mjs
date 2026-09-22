import test from 'node:test';
import assert from 'node:assert/strict';
import { createCmsNppesPharmacyView } from './cms-nppes-pharmacy-view.mjs';

test('pharmacy view rejects overlong queries before attempting to load a release', async () => {
  const view = createCmsNppesPharmacyView({ pointerPath: 'data/tmp/does-not-exist-pharmacy/current.json' });
  await assert.rejects(view.get({ query: 'x'.repeat(101) }), (error) => error.statusCode === 400 && /100 characters/.test(error.message));
});

test('pharmacy geographic view renders governed state and exact-ZCTA polygons with conservation totals', async () => {
  const view = createCmsNppesPharmacyView();
  const national = await view.get({ level: 'states' });
  assert.equal(national.features.length, 51);
  assert.equal(national.coverage.global_source_record_count, 89077);
  assert.equal(national.coverage.map_eligible_state_dc_source_record_count, 87659);
  assert.equal(national.coverage.territory_source_record_count, 1415);
  assert.equal(national.coverage.global_unassigned_count, 3);
  assert.equal(national.coverage.global_nonpolygon_count, 175);
  assert.equal(national.geometry.release_id, 'us-census-geography-20260830-132803990Z-3629abc0');
  assert.equal(national.geometry.manifest_sha256, '5426cae150c0fba64f8ff43a48ca39c4e78b5b4ba8a8007fbd211615540d1c8b');
  assert.ok(national.features.every((feature) => ['Polygon', 'MultiPolygon'].includes(feature.geometry.type)));
  const state = await view.get({ level: 'zctas', state: 'AL' });
  assert.ok(state.features.length > 0);
  assert.ok(state.features.every((feature) => feature.properties.level === 'zcta' && feature.properties.state === 'AL'));
  const selectedZip = state.features[0].properties.geoid;
  const selected = await view.get({ level: 'zctas', state: 'AL', zip: selectedZip });
  assert.equal(selected.selected.zip_code, selectedZip);
  assert.equal(selected.selected.source_record_count, selected.names_total);
  assert.ok(selected.names.length <= 25);
  await assert.rejects(view.get({ level: 'counties', state: 'AL' }), (error) => error.statusCode === 400 && /county/i.test(error.message));
  view.close();
});

test('pharmacy geographic view fails closed on a source geometry-release mismatch', async () => {
  const view = createCmsNppesPharmacyView({ geographyManifestSha256: '0'.repeat(64) });
  await assert.rejects(view.get({ level: 'states' }), /different Census geography release|manifest hash/i);
  view.close();
});
