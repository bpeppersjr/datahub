import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { access, lstat, mkdir, readFile, readdir, realpath, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import initGeos from 'geos-wasm';
import { APP_ROOT } from './paths.mjs';
import { buildResidualGeometry, geometryBounds, geometryBoundsOverlap, loadGovernedResidualInputs } from './census-zcta-residual-geos-capability.mjs';

export const RESIDUAL_DATASET = 'us-census-non-zcta-state-residual';
export const RESIDUAL_VERSION = 'us-census-non-zcta-state-residual@1.0.0';
const ALGORITHM = 'geos-3.13-fixed-precision-state-minus-clipped-zcta@1.0.0';
const SHA = /^[a-f0-9]{64}$/;
const check = (value, message) => { if (!value) throw new Error(`CENSUS_RESIDUAL_RELEASE_INVALID: ${message}`); };
const sha = value => createHash('sha256').update(value).digest('hex');
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const json = value => Buffer.from(`${JSON.stringify(stable(value))}\n`);
const checkpoint = signal => signal?.throwIfAborted();
const exact = (value, keys, label) => check(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join('|') === [...keys].sort().join('|'), `${label} schema`);
async function exists(file) { try { await access(file); return true; } catch { return false; } }
async function safeRoot(root, target) { root = path.resolve(root); target = path.resolve(target); check(target.startsWith(`${root}${path.sep}`), 'output escapes root'); let cursor = root; for (const part of path.relative(root, target).split(path.sep)) { cursor = path.join(cursor, part); if (!await exists(cursor)) break; const stat = await lstat(cursor); check(stat.isDirectory() && !stat.isSymbolicLink() && await realpath(cursor) === cursor, 'unsafe output ancestry'); } return target; }
async function safeFile(root, relative, maximum = 250_000_000) { const file = path.resolve(root, relative); check(file.startsWith(`${path.resolve(root)}${path.sep}`), 'artifact escapes release'); const stat = await lstat(file); check(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.size > 0 && stat.size <= maximum, 'unsafe artifact'); const bytes = await readFile(file); return { file, bytes, sha256: sha(bytes) }; }
async function atomicFile(directory, name, bytes) { const temporary = path.join(directory, `.${name}.${randomUUID()}.tmp`); await writeFile(temporary, bytes, { flag: 'wx' }); await rename(temporary, path.join(directory, name)); }

function candidatesByState(stateFeatures, zctaFeatures) {
  const rows = new Map(stateFeatures.map(state => [state.properties.STUSAB, { state, bounds: geometryBounds(state.geometry), zctas: [] }]));
  for (const zcta of zctaFeatures) { const bounds = geometryBounds(zcta.geometry); for (const row of rows.values()) if (geometryBoundsOverlap(row.bounds, bounds)) row.zctas.push(zcta); }
  return rows;
}

function stateArtifact(state, result) {
  const properties = state.properties;
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {
    state_geoid: properties.GEOID, state_abbreviation: properties.STUSAB, state_name: properties.NAME,
    geography_semantics: 'Census state-equivalent area outside selected 2020 Census ZCTA polygons; non-postal optional context only',
    intersecting_zcta_features: result.intersecting_zcta_features, precision_grid_degrees: result.precision_grid_degrees,
    park_status: null, tribal_or_native_status: null, private_land_status: null, population: null, business_count: null,
  }, geometry: result.geometry }] };
}

function claims() { return { optional_context_only: true, full_national_state_equivalent_release: true, residual_geometry_published: true,
  existing_map_blocked: false, network_requests: 0, acquisition_performed: false, current_pointer_written: false, production_enrollment: false,
  zip_or_postal_geography: false, usps_operation: false, park_status: null, tribal_or_native_status: null, private_land_status: null,
  population: null, business_geography: null, business_gap: null, zip_completion: false }; }

async function acquireLock(base) {
  const directory = path.join(base, '.residual-release-build.lock'), owner = { pid: process.pid, token: randomUUID(), created_at: new Date().toISOString() };
  try { await mkdir(directory); } catch (error) { if (error?.code !== 'EEXIST') throw error; throw new Error('CENSUS_RESIDUAL_RELEASE_LOCKED: existing lock preserved for inspection'); }
  await writeFile(path.join(directory, 'owner.json'), json(owner), { flag: 'wx' });
  return async () => { const current = JSON.parse(await readFile(path.join(directory, 'owner.json'))); check(current.token === owner.token, 'lock ownership'); await rm(path.join(directory, 'owner.json')); await rmdir(directory); };
}

async function deriveArtifacts(inputs, { signal, progress } = {}) {
  const candidates = candidatesByState(inputs.stateFeatures, inputs.zctaFeatures), geos = await initGeos();
  check(/^3\.13\.0-CAPI-/.test(geos.GEOSversion()), 'GEOS runtime version');
  const artifacts = [], payloads = new Map(), summaries = [];
  for (const state of inputs.stateFeatures) {
    checkpoint(signal); const code = state.properties.STUSAB, started = performance.now();
    const result = await buildResidualGeometry(state.geometry, candidates.get(code).zctas, { geos });
    const bytes = json(stateArtifact(state, result)), relative = `states/${code}.geojson`;
    artifacts.push({ path: relative, artifact_type: 'census-non-zcta-state-residual-geojson', bytes: bytes.length, sha256: sha(bytes), record_count: 1, export_policy: 'public-census-derived' });
    payloads.set(relative, bytes); summaries.push({ state_geoid: state.properties.GEOID, state_abbreviation: code, state_name: state.properties.NAME,
      bbox_candidates: candidates.get(code).zctas.length, intersecting_zcta_features: result.intersecting_zcta_features, geometry_type: result.geometry.type,
      artifact_path: relative, artifact_sha256: sha(bytes), artifact_bytes: bytes.length });
    await progress?.({ state: code, completed: summaries.length, total: inputs.stateFeatures.length, elapsed_ms: Math.round(performance.now() - started) });
  }
  return { artifacts, payloads, summaries, geosVersion: geos.GEOSversion() };
}

export async function buildCensusZctaResidualRelease({ root = APP_ROOT, createdAt, outputRoot = 'data/us-census-non-zcta-state-residual/releases', signal, progress, _hooks = {} } = {}) {
  root = path.resolve(root); check(typeof createdAt === 'string' && new Date(createdAt).toISOString() === createdAt, 'created_at'); checkpoint(signal);
  const base = await safeRoot(root, path.resolve(root, outputRoot)); await mkdir(base, { recursive: true }); const releaseLock = await acquireLock(base); let staging;
  try {
    const inputs = await loadGovernedResidualInputs({ root, signal }); checkpoint(signal); await _hooks.afterInputs?.();
    const derived = await deriveArtifacts(inputs, { signal, progress }); checkpoint(signal);
    const summary = { schema_version: RESIDUAL_VERSION, dataset_id: RESIDUAL_DATASET, created_at: createdAt, status: 'immutable-complete-state-equivalent-residual-geometry',
      publication_mode: 'pointer-free-local-review-only', algorithm: { id: ALGORITHM, geos_version: derived.geosVersion, precision_grid_degrees: 1e-7 },
      upstream: { release_id: inputs.readiness.view.upstream.pointer.release_id, manifest_path: inputs.readiness.view.upstream.manifest.path, manifest_sha256: inputs.readiness.view.upstream.manifest.sha256 },
      conservation: { upstream_state_equivalents: 56, published_state_equivalents: derived.summaries.length, upstream_zcta_features: 33791, state_artifact_count: derived.artifacts.length },
      states: derived.summaries, claims: claims() };
    const summaryBytes = json(summary), summaryArtifact = { path: 'summary.json', artifact_type: 'census-non-zcta-state-residual-summary', bytes: summaryBytes.length, sha256: sha(summaryBytes), record_count: 56, export_policy: 'public-census-derived' };
    const manifestBody = { schema_version: '1.0.0', dataset_id: RESIDUAL_DATASET, status: summary.status, created_at: createdAt, publication_mode: summary.publication_mode,
      algorithm: summary.algorithm, upstream: summary.upstream, artifacts: [summaryArtifact, ...derived.artifacts], claims: summary.claims };
    const releaseId = `${RESIDUAL_DATASET}-${sha(json(manifestBody)).slice(0, 40)}`, directory = path.join(base, releaseId), manifestPath = path.join(directory, 'manifest.json');
    if (await exists(directory)) { const verified = await verifyCensusZctaResidualRelease({ root, manifestPath: path.relative(root, manifestPath), replay: false, signal }); check(verified.release_id === releaseId, 'existing release mismatch'); return { release_id: releaseId, manifest: manifestPath, reused: true }; }
    staging = path.join(base, `.staging-${releaseId}-${randomUUID()}`); await mkdir(path.join(staging, 'states'), { recursive: true });
    await atomicFile(staging, 'summary.json', summaryBytes); for (const [relative, bytes] of derived.payloads) await atomicFile(path.dirname(path.join(staging, relative)), path.basename(relative), bytes);
    checkpoint(signal); await _hooks.beforeManifest?.(staging); await atomicFile(staging, 'manifest.json', json({ release_id: releaseId, ...manifestBody })); checkpoint(signal); await _hooks.beforePublish?.(staging);
    await rename(staging, directory); staging = null; await verifyCensusZctaResidualRelease({ root, manifestPath: path.relative(root, manifestPath), replay: false, signal });
    return { release_id: releaseId, manifest: manifestPath, reused: false };
  } finally { await releaseLock(); }
}

export async function verifyCensusZctaResidualRelease({ root = APP_ROOT, manifestPath, replay = true, signal } = {}) {
  root = path.resolve(root); check(typeof manifestPath === 'string', 'manifest path required'); const absolute = path.resolve(root, manifestPath); check(absolute.startsWith(`${root}${path.sep}`), 'manifest escapes root');
  const directory = path.dirname(absolute), entries = (await readdir(directory)).sort(); check(entries.join('|') === 'manifest.json|states|summary.json', 'release entries');
  const stateEntries = (await readdir(path.join(directory, 'states'))).sort(); check(stateEntries.length === 56 && stateEntries.every(name => /^[A-Z]{2}\.geojson$/.test(name)), 'state artifact entries');
  const manifestRead = await safeFile(directory, 'manifest.json', 2_000_000), manifest = JSON.parse(manifestRead.bytes); exact(manifest, ['release_id','schema_version','dataset_id','status','created_at','publication_mode','algorithm','upstream','artifacts','claims'], 'manifest');
  const { release_id: releaseId, ...manifestBody } = manifest;
  check(manifest.schema_version === '1.0.0' && manifest.dataset_id === RESIDUAL_DATASET && path.basename(directory) === releaseId && releaseId === `${RESIDUAL_DATASET}-${sha(json(manifestBody)).slice(0,40)}`, 'manifest identity');
  check(Array.isArray(manifest.artifacts) && manifest.artifacts.length === 57, 'artifact cardinality'); const seen = new Set();
  for (const artifact of manifest.artifacts) { exact(artifact, ['path','artifact_type','bytes','sha256','record_count','export_policy'], 'artifact'); check(!seen.has(artifact.path) && Number.isSafeInteger(artifact.bytes) && artifact.bytes > 0 && SHA.test(artifact.sha256), 'artifact descriptor'); seen.add(artifact.path); const read = await safeFile(directory, artifact.path); check(read.bytes.length === artifact.bytes && read.sha256 === artifact.sha256, `${artifact.path} identity`); }
  const summary = JSON.parse((await safeFile(directory, 'summary.json')).bytes); check(summary.schema_version === RESIDUAL_VERSION && summary.states?.length === 56 && summary.conservation?.published_state_equivalents === 56 && JSON.stringify(summary.claims) === JSON.stringify(manifest.claims), 'summary contract');
  const inputs = await loadGovernedResidualInputs({ root, signal }); check(summary.upstream.manifest_sha256 === inputs.readiness.view.upstream.manifest.sha256 && summary.upstream.release_id === inputs.readiness.view.upstream.pointer.release_id, 'upstream drift');
  if (replay) { const derived = await deriveArtifacts(inputs, { signal }); for (const artifact of derived.artifacts) { const declared = manifest.artifacts.find(item => item.path === artifact.path); check(declared?.sha256 === artifact.sha256 && declared.bytes === artifact.bytes, `${artifact.path} replay`); }
    check(JSON.stringify(stable(summary.states)) === JSON.stringify(stable(derived.summaries)), 'state summary replay');
    check(summary.algorithm?.id === ALGORITHM && summary.algorithm?.geos_version === derived.geosVersion && summary.algorithm?.precision_grid_degrees === 1e-7, 'algorithm replay');
    check(JSON.stringify(stable(summary.conservation)) === JSON.stringify(stable({ upstream_state_equivalents: 56, published_state_equivalents: derived.summaries.length, upstream_zcta_features: 33791, state_artifact_count: derived.artifacts.length })), 'conservation replay');
  }
  return { release_id: manifest.release_id, manifest_sha256: manifestRead.sha256, state_artifacts: 56, replayed: replay, claims: manifest.claims, summary };
}
