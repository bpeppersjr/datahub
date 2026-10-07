import test from 'node:test';
import assert from 'node:assert/strict';
import { buildResidualGeometry, probeGovernedResidualCapability } from './census-zcta-residual-geos-capability.mjs';

const polygon = coordinates => ({ type: 'Polygon', coordinates: [coordinates] });

test('GEOS precision overlay produces a valid polygonal residual with a hole', async () => {
  const state = polygon([[0,0],[10,0],[10,10],[0,10],[0,0]]);
  const zcta = { type: 'Feature', properties: { GEOID: 'fixture' }, geometry: polygon([[2,2],[8,2],[8,8],[2,8],[2,2]]) };
  const result = await buildResidualGeometry(state, [zcta]);
  assert.equal(result.geometry.type, 'Polygon');
  assert.equal(result.geometry.coordinates.length, 2);
  assert.equal(result.intersecting_zcta_features, 1);
  assert.equal(result.precision_grid_degrees, 1e-7);
});

test('governed DC and Rhode Island probes replace the failed polygon-clipping feasibility result', async () => {
  const result = await probeGovernedResidualCapability();
  assert.equal(result.schema_version, 'us-census-non-zcta-state-residual-geos-capability@1.0.0');
  assert.match(result.geos_version, /^3\.13\.0-CAPI-/);
  assert.equal(result.upstream_release_id, 'us-census-geography-20260830-132803990Z-3629abc0');
  assert.deepEqual(result.states.map(row => row.state), ['DC','RI']);
  assert.ok(result.states.every(row => row.intersecting_zcta_features > 0 && row.residual_geometry_type === 'MultiPolygon' && row.residual_coordinate_bytes > 0));
  assert.deepEqual(result.claims, { full_national_release_ready: false, residual_geometry_published: false, park_status: null,
    tribal_or_native_status: null, private_land_status: null, zip_or_postal_geography: false, existing_map_blocked: false, network_requests: 0 });
});
