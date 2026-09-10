import path from 'node:path';
import { APP_ROOT } from './paths.mjs';
import { mnSelectionReadJson as readJson, mnSelectionReadLines as readLines } from './mn-construction-retained-selection.mjs';
import { readOkRetainedSearch } from './ok-childcare-retained-bundle.mjs';

// Immutable inputs: newer geography or acquisitions require an explicit successor.
export const OK_SPATIAL_INPUTS = Object.freeze({
  crosswalk: 'data/zcta-jurisdiction-crosswalk/releases/us-census-zcta-jurisdiction-crosswalk-20260830-222631137Z-4b9227f8/manifest.json',
  crosswalk_sha256: '02e19bd98ad587426628cd50013942acc0cc3e9c9a48ac653eaf96cf534b8fe2',
  relationships: 'derived/zcta-county-area-weights.jsonl',
  relationships_sha256: 'ee8916fdfb67fc2863be74812803c24389ae884d9e3e8006899fd014f32e2358',
  relationships_bytes: 46510951,
  relationships_records: 65631,
  operation_id: 'a5f5ca7d-89b7-450a-9278-3430b436aff6',
  retained: 'data/managed-operations/a5f5ca7d-89b7-450a-9278-3430b436aff6/output/jobs/4acdd407-ae61-43fb-ba66-6464f3a5a2a4/manifest.json',
  retained_sha256: 'bd26af2f1f0e83358188fea44cd553ac7d4ed55f022943c57527f6f332fe074b',
});
const fail = () => { throw new Error('Oklahoma spatial inventory input verification failed.'); };

// Pure derivation; callers cannot establish native provenance with this helper.
export function deriveOkSpatialInventory(relationships) {
  const zips = new Map(), ids = new Set();
  for (const row of relationships) {
    if (!row || typeof row.zcta !== 'string' || typeof row.state_fips !== 'string' || typeof row.county_fips !== 'string'
      || !/^[0-9]{5}$/.test(row.zcta) || !/^[0-9]{2}$/.test(row.state_fips)
      || row.county_geo_id !== `county:${row.state_fips}${row.county_fips}`
      || !/^[0-9]{3}$/.test(row.county_fips) || ids.has(row.relationship_id)
      || typeof row.relationship_id !== 'string' || !row.relationship_id
      || row.allocation_semantics !== 'polygon-area-only-not-business-location'
      || !Number.isFinite(row.raw_share_of_zcta_polygon_area) || row.raw_share_of_zcta_polygon_area <= 0
      || row.material_intersection !== (row.raw_share_of_zcta_polygon_area >= 0.001)) fail();
    ids.add(row.relationship_id);
    const item = zips.get(row.zcta) ?? { zip5: row.zcta, zip4: null, states: new Set(), materialStates: new Set(), counties: new Set(), material: false };
    item.states.add(row.state_fips);
    if (row.material_intersection) item.materialStates.add(row.state_fips);
    if (row.state_fips === '40') {
      item.counties.add(row.county_geo_id);
      item.material ||= row.material_intersection;
    }
    zips.set(row.zcta, item);
  }
  return [...zips.values()].filter(item => item.counties.size).map(item => ({
    zip5: item.zip5, zip4: null,
    query_identity: `ok-childcare-center:zip5:${item.zip5}`,
    spatial_priority: item.material ? 'material-intersection' : 'sliver-only-review',
    intersecting_state_fips: [...item.states].sort(),
    materially_intersecting_state_fips: [...item.materialStates].sort(),
    oklahoma_county_geo_ids: [...item.counties].sort(),
    operational_zip_validity: 'unverified',
    acquisition_status: 'not-queried-in-this-inventory',
    observed_at: null, source_rows: null,
    retained_evidence: null,
    selected_search_completeness: 'unknown',
    business_address_assignment_from_polygon: false,
  })).sort((a, b) => a.zip5.localeCompare(b.zip5));
}

export async function buildOkSpatialInventory({ signal } = {}) {
  signal?.throwIfAborted();
  const input = OK_SPATIAL_INPUTS, manifestMeter = {}, relationMeter = {};
  const manifestPath = path.join(APP_ROOT, input.crosswalk);
  const manifest = await readJson(manifestPath, 100000, signal, manifestMeter);
  if (manifestMeter.sha256 !== input.crosswalk_sha256 || manifest.status !== 'published') fail();
  const artifact = manifest.artifacts.find(a => a.path === input.relationships);
  if (!artifact || artifact.sha256 !== input.relationships_sha256 || artifact.bytes !== input.relationships_bytes) fail();
  const rows = [];
  for await (const row of readLines(path.join(path.dirname(manifestPath), input.relationships), input.relationships_bytes, signal, relationMeter)) rows.push(row);
  if (relationMeter.sha256 !== input.relationships_sha256 || relationMeter.records !== input.relationships_records
    || relationMeter.bytes !== input.relationships_bytes) fail();
  const inventory = deriveOkSpatialInventory(rows);
  const retained = await readOkRetainedSearch(path.join(APP_ROOT, input.retained), input.retained_sha256, {
    operationId: input.operation_id, requireNative: true, signal,
    operationRoot: path.join(APP_ROOT, 'data/managed-operations', input.operation_id, 'output'),
  });
  if (retained.manifest.status !== 'accepted-internal-source-candidates') fail();
  const reused = inventory.find(row => row.zip5 === '73102');
  if (!reused) fail();
  Object.assign(reused, {
    acquisition_status: retained.manifest.counts.rows === 0 ? 'retained-zero-results' : 'retained-results',
    observed_at: retained.manifest.observed_at, source_rows: retained.manifest.counts.rows,
    retained_evidence: { manifest: input.retained, sha256: input.retained_sha256, operation_id: input.operation_id },
  });
  signal?.throwIfAborted();
  const material = inventory.filter(row => row.spatial_priority === 'material-intersection');
  return {
    schema_version: 'ok-childcare-spatial-inventory@1.0.0',
    scope: 'oklahoma-childcare-centers-census-zcta-search-seeds',
    inputs: { ...input },
    counts: {
      spatial_candidates: inventory.length,
      material_candidates: material.length,
      sliver_only_candidates: inventory.length - material.length,
      material_cross_state_candidates: material.filter(row => row.materially_intersecting_state_fips.length > 1).length,
      retained_queries: 1, retained_source_rows: reused.source_rows,
      not_queried_in_this_inventory: inventory.length - 1,
      unqueried_material_candidates: material.filter(row => row.acquisition_status === 'not-queried-in-this-inventory').length,
    },
    claims: { dispatch_authorized: false, statewide_collection_implemented: false, operational_zip_universe_complete: false,
      statewide_business_coverage_complete: false, current_operations_verified: false, public_export_authorized: false },
    limitations: [
      'Census ZCTAs are statistical areas, not an exhaustive operational USPS ZIP list.',
      'Spatial intersection does not assign a business address, county, or state.',
      'Not queried means no linked acquisition in this pinned inventory, not proof of no other retained acquisition.',
      'Query completion and row counts do not measure the percentage of businesses covered.',
      'This local inventory performs no source requests and does not authorize or dispatch collection.',
    ],
    items: inventory,
  };
}
