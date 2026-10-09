import test from 'node:test';
import assert from 'node:assert/strict';
import { readCensusZctaResidualGeometryView, readCensusZctaResidualView } from './census-zcta-residual-geography.mjs';

test('runtime verifies the immutable national residual release without blocking the existing map', async () => {
  const view = await readCensusZctaResidualView({ state: 'DC' });
  assert.equal(view.schema_version, 'us-census-non-zcta-state-residual-view@1.0.0');
  assert.equal(view.ready, true); assert.equal(view.available, true);
  assert.equal(view.status, 'verified-state-equivalent-residual-release');
  assert.equal(view.release.release_id, 'us-census-non-zcta-state-residual-af772d3aa8d9f7a0266a0aa5e507d6ebf8bd4998');
  assert.equal(view.release.state_artifacts, 56);
  assert.equal(view.state.state_abbreviation, 'DC'); assert.equal(view.state.state_geoid, '11');
  assert.equal(view.reference_areas.component_count, 167);
  assert.equal(view.reference_areas.rows.length, 100);
  assert.equal(view.reference_areas.next_offset, 100);
  assert.equal(Object.values(view.reference_areas.direction_counts).reduce((sum,n)=>sum+n,0),167);
  assert.deepEqual(view.inventory, { state_equivalents: 56, zcta_features: 33791 });
  assert.equal(view.conservation.published_state_equivalents, 56);
  assert.deepEqual(view.claims, { zip_completion: false, population: null, business_count: null, park_status: null,
    tribal_status: null, private_land_status: null, existing_map_blocked: false, zip_or_postal_geography: false });
});

test('runtime rejects noncanonical or unretained state selectors', async () => {
  await assert.rejects(readCensusZctaResidualView({ state: 'dc' }), /Invalid residual state selection/);
  await assert.rejects(readCensusZctaResidualView({ state: 'ZZ' }), /not retained/);
  await assert.rejects(readCensusZctaResidualView({ offset: 100 }), /Choose a state/);
  await assert.rejects(readCensusZctaResidualView({ state: 'DC', direction: 'park' }), /Unsupported residual reference direction/);
});

test('selected-state geometry is exact, conserved, and classification-free', async () => {
  const view = await readCensusZctaResidualGeometryView({ state: 'DC' });
  assert.equal(view.schema_version, 'us-census-non-zcta-state-residual-geometry-view@1.0.0');
  assert.equal(view.status, 'verified-selected-state-residual-geometry');
  assert.equal(view.state.state_abbreviation, 'DC');
  assert.equal(view.features.length, 167);
  assert.equal(new Set(view.features.map(row => row.properties.id)).size, 167);
  assert.ok(view.features.every(row => row.geometry.type === 'Polygon' && row.properties.state_abbreviation === 'DC'));
  assert.deepEqual(view.claims, { zip_completion: false, population: null, business_count: null, park_status: null,
    tribal_status: null, private_land_status: null, existing_map_blocked: false, zip_or_postal_geography: false });
  for (const feature of view.features) {
    assert.deepEqual(Object.keys(feature.properties).sort(), ['direction','id','label','semantics','state_abbreviation','state_name']);
    assert.doesNotMatch(JSON.stringify(feature.properties), /zip5|postal_code|park_status|population|business_count|tribal_status|private_land_status/i);
  }
  await assert.rejects(readCensusZctaResidualGeometryView(), /Invalid residual state selection/);
  await assert.rejects(readCensusZctaResidualGeometryView({ state: 'dc' }), /Invalid residual state selection/);
});
