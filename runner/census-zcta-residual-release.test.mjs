import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyCensusZctaResidualRelease } from './census-zcta-residual-release.mjs';

const MANIFEST = 'data/us-census-non-zcta-state-residual/releases/us-census-non-zcta-state-residual-af772d3aa8d9f7a0266a0aa5e507d6ebf8bd4998/manifest.json';

test('retained national residual release verifies all immutable state artifacts without widening its claims', async () => {
  const verified = await verifyCensusZctaResidualRelease({ manifestPath: MANIFEST, replay: false });
  assert.equal(verified.release_id, 'us-census-non-zcta-state-residual-af772d3aa8d9f7a0266a0aa5e507d6ebf8bd4998');
  assert.equal(verified.manifest_sha256, '43e51063af731659d5750e4bb1ae39ecc54c1e7e9b3bf580202360804c87f09d');
  assert.equal(verified.state_artifacts, 56); assert.equal(verified.summary.states.length, 56);
  assert.equal(verified.summary.conservation.upstream_zcta_features, 33791);
  assert.equal(verified.claims.residual_geometry_published, true);
  assert.equal(verified.claims.existing_map_blocked, false);
  assert.equal(verified.claims.zip_or_postal_geography, false);
  assert.equal(verified.claims.park_status, null); assert.equal(verified.claims.population, null); assert.equal(verified.claims.business_geography, null);
});

test('release verifier rejects paths outside the application root', async () => {
  await assert.rejects(verifyCensusZctaResidualRelease({ manifestPath: '../outside/manifest.json', replay: false }), /escapes root/);
});
