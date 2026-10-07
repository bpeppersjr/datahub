import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import initGeos from 'geos-wasm';
import { geojsonToGeosGeom, geosGeomToGeojson } from 'geos-wasm/helpers';
import { APP_ROOT } from './paths.mjs';
import { verifyCensusZctaResidualReadiness } from './census-zcta-residual-readiness-release.mjs';

const PRECISION_GRID = 1e-7;
const check = (value, message) => { if (!value) throw new Error(`CENSUS_RESIDUAL_GEOS_CAPABILITY_INVALID: ${message}`); };
const sha = value => createHash('sha256').update(value).digest('hex');
const inside = (root, file) => { const resolved = path.resolve(root, file), relative = path.relative(root, resolved); check(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'path containment'); return resolved; };

export function geometryBounds(geometry) {
  check(['Polygon', 'MultiPolygon'].includes(geometry?.type), 'unsupported geometry');
  const result = [Infinity, Infinity, -Infinity, -Infinity];
  const visit = (value) => {
    if (typeof value?.[0] === 'number') {
      result[0] = Math.min(result[0], value[0]); result[1] = Math.min(result[1], value[1]);
      result[2] = Math.max(result[2], value[0]); result[3] = Math.max(result[3], value[1]);
    } else for (const child of value ?? []) visit(child);
  };
  visit(geometry.coordinates);
  check(result.every(Number.isFinite), 'geometry bounds');
  return result;
}

export const geometryBoundsOverlap = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

export async function buildResidualGeometry(stateGeometry, zctaFeatures, { geos: providedGeos } = {}) {
  check(Array.isArray(zctaFeatures), 'ZCTA features');
  const geos = providedGeos ?? await initGeos(), owned = [];
  const own = (pointer, label) => { check(Number.isSafeInteger(pointer) && pointer > 0, label); owned.push(pointer); return pointer; };
  try {
    const stateRaw = own(geojsonToGeosGeom(stateGeometry, geos), 'state geometry pointer');
    const stateValid = own(geos.GEOSMakeValid(stateRaw), 'valid state geometry');
    const statePrecise = own(geos.GEOSGeom_setPrecision(stateValid, PRECISION_GRID, geos.GEOSPrecisionRules.GEOS_PREC_VALID_OUTPUT), 'precision state geometry');
    const intersecting = [];
    for (const feature of zctaFeatures) {
      check(feature?.type === 'Feature' && ['Polygon', 'MultiPolygon'].includes(feature.geometry?.type), 'ZCTA feature shape');
      const raw = own(geojsonToGeosGeom(feature.geometry, geos), 'ZCTA geometry pointer');
      if (geos.GEOSIntersects(statePrecise, raw) === 1) intersecting.push(feature);
    }
    const collection = own(geojsonToGeosGeom({ type: 'FeatureCollection', features: intersecting }, geos), 'ZCTA collection');
    const validCollection = own(geos.GEOSMakeValid(collection), 'valid ZCTA collection');
    const union = own(geos.GEOSUnaryUnionPrec(validCollection, PRECISION_GRID), 'ZCTA union');
    const clipped = own(geos.GEOSIntersectionPrec(statePrecise, union, PRECISION_GRID), 'clipped ZCTA union');
    const clippedPolygonal = own(geos.GEOSBuffer(clipped, 0, 8), 'polygonal clipped union');
    const residualMixed = own(geos.GEOSDifferencePrec(statePrecise, clippedPolygonal, PRECISION_GRID), 'state residual');
    const residual = own(geos.GEOSBuffer(residualMixed, 0, 8), 'polygonal state residual');
    check(geos.GEOSisValid(residual) === 1 && geos.GEOSisEmpty(residual) !== 1, 'valid nonempty residual');
    const geometry = geosGeomToGeojson(residual, geos);
    check(['Polygon', 'MultiPolygon'].includes(geometry?.type), 'polygonal residual output');
    return { geometry, intersecting_zcta_features: intersecting.length, precision_grid_degrees: PRECISION_GRID };
  } finally {
    for (const pointer of owned.reverse()) geos.GEOSGeom_destroy(pointer);
  }
}

export async function loadGovernedResidualInputs({ root = APP_ROOT, signal } = {}) {
  signal?.throwIfAborted();
  const readiness = await verifyCensusZctaResidualReadiness({ root, signal });
  root = path.resolve(root);
  const manifestFile = inside(root, readiness.view.upstream.manifest.path), releaseRoot = path.dirname(manifestFile);
  const manifestBytes = await readFile(manifestFile); check(sha(manifestBytes) === readiness.view.upstream.manifest.sha256, 'manifest identity');
  const manifest = JSON.parse(manifestBytes), artifacts = new Map(manifest.artifacts.map(item => [item.path, item]));
  const readArtifact = async relative => { const descriptor = artifacts.get(relative); check(descriptor && Number.isSafeInteger(descriptor.bytes) && /^[a-f0-9]{64}$/.test(descriptor.sha256), `${relative} descriptor`); const file = inside(releaseRoot, relative), stat = await lstat(file); check(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.size === descriptor.bytes, `${relative} file safety`); const bytes = await readFile(file); check(sha(bytes) === descriptor.sha256, `${relative} identity`); return bytes; };
  const stateCollection = JSON.parse(await readArtifact(readiness.view.upstream.artifacts.state_geometry.path));
  const zctaFeatures = [];
  for (let prefix = 0; prefix < 10; prefix += 1) {
    signal?.throwIfAborted();
    const collection = JSON.parse(await readArtifact(`source/zctas/prefix=${prefix}.geojson`));
    check(collection?.type === 'FeatureCollection' && Array.isArray(collection.features), `ZCTA prefix ${prefix} structure`);
    zctaFeatures.push(...collection.features);
  }
  check(stateCollection?.type === 'FeatureCollection' && stateCollection.features?.length === 56, 'state collection structure');
  check(zctaFeatures.length === 33791, 'ZCTA geometry conservation');
  return { root, readiness, stateFeatures: stateCollection.features, zctaFeatures };
}

export async function probeGovernedResidualCapability({ root = APP_ROOT, states = ['DC', 'RI'], signal } = {}) {
  signal?.throwIfAborted();
  const { readiness, stateFeatures, zctaFeatures } = await loadGovernedResidualInputs({ root, signal });
  const requested = [...new Set(states)];
  check(requested.length > 0 && requested.every(value => /^[A-Z]{2}$/.test(value)), 'state selection');
  const selectedStates = requested.map(code => {
    const feature = stateFeatures.find(item => item.properties?.STUSAB === code);
    check(feature, `missing state ${code}`); return feature;
  });
  const stateBounds = new Map(selectedStates.map(feature => [feature.properties.STUSAB, geometryBounds(feature.geometry)]));
  const candidates = new Map(requested.map(code => [code, []]));
  for (const feature of zctaFeatures) { const bounds = geometryBounds(feature.geometry); for (const code of requested) if (geometryBoundsOverlap(stateBounds.get(code), bounds)) candidates.get(code).push(feature); }
  const geos = await initGeos(), results = [];
  check(/^3\.13\.0-CAPI-/.test(geos.GEOSversion()), 'GEOS runtime version');
  for (const state of selectedStates) {
    signal?.throwIfAborted();
    const started = performance.now(), result = await buildResidualGeometry(state.geometry, candidates.get(state.properties.STUSAB), { geos });
    results.push({ state: state.properties.STUSAB, bbox_candidates: candidates.get(state.properties.STUSAB).length,
      intersecting_zcta_features: result.intersecting_zcta_features, residual_geometry_type: result.geometry.type,
      residual_coordinate_bytes: Buffer.byteLength(JSON.stringify(result.geometry.coordinates)), elapsed_ms: Math.round(performance.now() - started) });
  }
  return { schema_version: 'us-census-non-zcta-state-residual-geos-capability@1.0.0', geos_version: geos.GEOSversion(),
    precision_grid_degrees: PRECISION_GRID, upstream_release_id: readiness.view.upstream.pointer.release_id,
    upstream_manifest_sha256: readiness.view.upstream.manifest.sha256, states: results,
    claims: { full_national_release_ready: false, residual_geometry_published: false, park_status: null, tribal_or_native_status: null,
      private_land_status: null, zip_or_postal_geography: false, existing_map_blocked: false, network_requests: 0 } };
}
