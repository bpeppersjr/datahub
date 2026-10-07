import test from 'node:test';
import assert from 'node:assert/strict';
import { readCensusZctaResidualView } from './census-zcta-residual-geography.mjs';

test('runtime verifies the immutable national residual release without blocking the existing map', async () => {
  const view = await readCensusZctaResidualView({ state: 'DC' });
  assert.equal(view.schema_version, 'us-census-non-zcta-state-residual-view@1.0.0');
  assert.equal(view.ready, true); assert.equal(view.available, true);
  assert.equal(view.status, 'verified-state-equivalent-residual-release');
  assert.equal(view.release.release_id, 'us-census-non-zcta-state-residual-af772d3aa8d9f7a0266a0aa5e507d6ebf8bd4998');
  assert.equal(view.release.state_artifacts, 56);
  assert.equal(view.state.state_abbreviation, 'DC'); assert.equal(view.state.state_geoid, '11');
  assert.deepEqual(view.inventory, { state_equivalents: 56, zcta_features: 33791 });
  assert.equal(view.conservation.published_state_equivalents, 56);
  assert.deepEqual(view.claims, { zip_completion: false, population: null, business_count: null, park_status: null,
    tribal_status: null, private_land_status: null, existing_map_blocked: false, zip_or_postal_geography: false });
});

test('runtime rejects noncanonical or unretained state selectors', async () => {
  await assert.rejects(readCensusZctaResidualView({ state: 'dc' }), /Invalid residual state selection/);
  await assert.rejects(readCensusZctaResidualView({ state: 'ZZ' }), /not retained/);
});
