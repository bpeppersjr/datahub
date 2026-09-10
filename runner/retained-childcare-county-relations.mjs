import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, lstat, link, unlink, rmdir } from 'node:fs/promises';
import { setImmediate as yieldTurn } from 'node:timers/promises';
import { isDeepStrictEqual as same } from 'node:util';
import RBush from 'rbush';
import { APP_ROOT } from './paths.mjs';
import { geometryBounds } from './census-geography.mjs';
import { assignPointToCounty } from './national-business-coverage-views.mjs';
import { verifyRetainedChildcareRegistryExtension } from './retained-childcare-registry-input.mjs';
import { mnSelectionReadJson as readJson, mnSelectionReadLines as readLines, mnSelectionCanonical as canonical,
  mnSelectionWriter as writer } from './mn-construction-retained-selection.mjs';

export const COUNTY_RELATION_VERSION = 'retained-childcare-county-relations@1.0.0';
export const COUNTY_RELATION_INPUTS = Object.freeze({
  registry: 'data/business-registry/releases/national-business-registry-20260910-132939322Z-176d0af2/manifest.json',
  registry_sha256: '4e770785282968b8a217f4a8906fa82901eb1fcd462310b3fa57de1763456de9',
  geography: 'data/geography/releases/us-census-geography-20260830-132803990Z-3629abc0/manifest.json',
  geography_sha256: '5426cae150c0fba64f8ff43a48ca39c4e78b5b4ba8a8007fbd211615540d1c8b',
  pa_policy: 'config/source-policies/pa-childcare-centers-internal.json',
  pa_policy_sha256: 'a513ca1b2e1158164017a53386c14bdcd6963d291a1d3b4815932ebfd9ad63ec',
});
const CAP = 20_000_000;
const fail = () => { throw Error('Retained childcare county relationships require inspection.'); };
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const statuses = ['missing-source-point', 'invalid-source-point', 'unknown-coordinate-system', 'source-not-enabled-for-overlay',
  'assigned-single-county', 'coordinate-not-in-county-polygon', 'ambiguous-county-boundary'];
const claims = () => ({ relation_basis: 'source-reported-point-intersects-census-county', business_location_verified: false,
  identity_matching_applied: false, current_operations_verified: false, postal_membership_inferred: false,
  national_reporting_integrated: false, public_export_authorized: false, export_policy: 'internal' });

function shift(value) {
  if (!Array.isArray(value)) fail();
  if (typeof value[0] === 'number') {
    if (value.length < 2 || !Number.isFinite(value[0]) || !Number.isFinite(value[1]) || Math.abs(value[0]) > 180 || Math.abs(value[1]) > 90) fail();
    return [value[0] < 0 ? value[0] + 360 : value[0], value[1]];
  }
  return value.map(shift);
}
export function createRetainedCountyIndex(features, metadata) {
  if (!Array.isArray(features) || !Array.isArray(metadata) || features.length !== metadata.length || features.length > 10000) fail();
  const records = new Map(metadata.map(row => [row.geoid, row])), seen = new Set(), entries = [];
  if (records.size !== metadata.length) fail();
  for (const feature of features) {
    const geoid = feature.properties?.GEOID, record = records.get(geoid);
    if (typeof geoid !== 'string' || !/^\d{5}$/.test(geoid) || !record || record.state_fips !== geoid.slice(0, 2)
      || seen.has(geoid) || !['Polygon', 'MultiPolygon'].includes(feature.geometry?.type)) fail();
    seen.add(geoid);
    const shifted = shift(feature.geometry.coordinates), original = geometryBounds(feature.geometry);
    const wrapped = original[2] - original[0] > 180;
    const geometry = wrapped ? { ...feature.geometry, coordinates: shifted } : feature.geometry;
    const bounds = geometryBounds(geometry);
    if (bounds.length !== 4 || !bounds.every(Number.isFinite)) fail();
    entries.push({ minX: bounds[0], minY: bounds[1], maxX: bounds[2], maxY: bounds[3], geoid,
      stateFips: record.state_fips, wrapped, feature: { type: 'Feature', properties: { GEOID: geoid }, geometry } });
  }
  return new RBush().load(entries);
}

export async function deriveRetainedCountyRelations(records, index, { signal } = {}) {
  signal?.throwIfAborted();
  if (!Array.isArray(records) || records.length > 25000) fail();
  const seen = new Set(), rows = [], counts = Object.fromEntries(statuses.map(status => [status, 0])), counties = new Map();
  for (let n = 0; n < records.length; n++) {
    if (n % 128 === 0) { await yieldTurn(); signal?.throwIfAborted(); }
    const row = records[n], point = row.geocode;
    if (!/^candidate:childcare:[a-f0-9]{64}$/.test(row.candidate_id) || seen.has(row.candidate_id)
      || !row.source?.dataset_id || !point || !row.reported_address) fail();
    seen.add(row.candidate_id);
    let status, assignment;
    if (point.latitude === null && point.longitude === null) status = 'missing-source-point';
    else if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)
      || Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180) status = 'invalid-source-point';
    else if (point.crs !== 'EPSG:4326') status = 'unknown-coordinate-system';
    else if (row.source.dataset_id !== 'pa-dhs-childcare-centers') status = 'source-not-enabled-for-overlay';
    else { assignment = assignPointToCounty([point.longitude, point.latitude], index); status = assignment.status; }
    if (!Object.hasOwn(counts, status)) fail(); counts[status]++;
    const county = assignment?.county;
    if (county) counties.set(county.geoid, (counties.get(county.geoid) ?? 0) + 1);
    rows.push({ candidate_id: row.candidate_id, dataset_id: row.source.dataset_id, status,
      county_geoid: county?.geoid ?? null, derived_state_fips: county?.stateFips ?? null,
      candidate_county_geoids: assignment?.candidate_geoids ?? [],
      reported_state: row.reported_address.state, reported_zip5: row.reported_address.zip_code, reported_zip4: row.reported_address.zip4,
      reported_state_relation: county ? row.reported_address.state === null ? 'unresolved'
        : row.reported_address.state === 'PA' && county.stateFips === '42' ? 'matches' : 'requires-review' : 'not-assigned' });
  }
  return { schema_version: COUNTY_RELATION_VERSION, evidence_mode: 'caller-supplied-candidates-and-county-index', rows,
    counts: { candidate_rows: rows.length, by_status: counts,
      by_county: [...counties].sort(([a], [b]) => a.localeCompare(b)).map(([county_geoid, candidate_rows]) => ({ county_geoid, candidate_rows })) },
    ...claims() };
}

async function pinned(relative, expected, signal, maximum = 4_000_000) {
  const meter = {}, value = await readJson(path.join(APP_ROOT, relative), maximum, signal, meter);
  if (meter.sha256 !== expected) fail(); return value;
}
export async function loadRetainedCountyRelations({ signal } = {}) {
  signal?.throwIfAborted(); const pins = COUNTY_RELATION_INPUTS;
  await pinned(pins.pa_policy, pins.pa_policy_sha256, signal);
  const registry = await pinned(pins.registry, pins.registry_sha256, signal);
  const input = await verifyRetainedChildcareRegistryExtension(registry, path.dirname(path.join(APP_ROOT, pins.registry)), { signal });
  if (!input || input.records.length !== 12206) fail();
  const geography = await pinned(pins.geography, pins.geography_sha256, signal);
  if (!geography.complete_national_release || geography.coverage.county_equivalents !== 3235) fail();
  const root = path.dirname(path.join(APP_ROOT, pins.geography)), features = [], metadata = [], dependencies = [];
  const artifacts = geography.artifacts.filter(a => a.path === 'derived/index/counties.jsonl'
    || a.geography_type === 'county' && /^source\/counties\/state=\d{2}\.geojson$/.test(a.path));
  if (artifacts.length !== 57) fail();
  for (const artifact of artifacts) {
    signal?.throwIfAborted(); const meter = {}, file = path.join(root, artifact.path);
    if (artifact.path.endsWith('.jsonl')) {
      for await (const row of readLines(file, 2_000_000, signal, meter)) metadata.push(row);
    } else {
      const collection = await readJson(file, 5_000_000, signal, meter);
      if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) fail(); features.push(...collection.features);
    }
    if (meter.sha256 !== artifact.sha256 || meter.bytes !== artifact.bytes) fail();
    dependencies.push({ path: artifact.path, sha256: meter.sha256, bytes: meter.bytes });
  }
  if (features.length !== 3235 || metadata.length !== 3235) fail();
  const report = await deriveRetainedCountyRelations(input.records, createRetainedCountyIndex(features, metadata), { signal });
  await pinned(pins.registry, pins.registry_sha256, signal); await pinned(pins.geography, pins.geography_sha256, signal);
  await pinned(pins.pa_policy, pins.pa_policy_sha256, signal);
  return { ...report, evidence_mode: 'verified-retained-registry-and-census-derivation', inputs: { ...pins },
    source_registry_created_at: registry.created_at,
    source_bindings: input.bindings, county_artifacts: dependencies,
    attribution: 'Pennsylvania Department of Human Services / PA Open Data Portal; U.S. Census Bureau',
    source_requests_this_build: 0 };
}

const outputRoot = () => path.join(APP_ROOT, 'data/retained-childcare-county-relations');
export async function discardOwnedCountyStaging(directory, owner, owned) {
  if (path.dirname(directory) !== outputRoot() || !uuid(path.basename(directory))) fail();
  await canonical(directory); const current = await lstat(directory, { bigint: true });
  if (current.ino !== owner.ino || current.dev !== owner.dev) fail();
  const names = await readdir(directory);
  if (names.some(name => name !== 'manifest.pending')) fail();
  if (names.length) {
    const pending = path.join(directory, 'manifest.pending'), expected = owned.get(pending), file = await lstat(pending, { bigint: true });
    if (!expected || !file.isFile() || file.isSymbolicLink() || file.nlink !== 1n || file.ino !== expected.ino || file.dev !== expected.dev) fail();
    await unlink(pending);
  }
  await canonical(directory); const after = await lstat(directory, { bigint: true });
  if (after.ino !== owner.ino || after.dev !== owner.dev || (await readdir(directory)).length) fail();
  await rmdir(directory);
}
export function validateCountyRelationEnvelope(saved, runId) {
  const instant = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
  if (!saved || !same(Object.keys(saved).sort(), ['created_at', 'report', 'run_id']) || saved.run_id !== runId || !uuid(runId)
    || !instant(saved.created_at) || !instant(saved.report?.source_registry_created_at)
    || saved.created_at > new Date().toISOString() || saved.created_at < saved.report.source_registry_created_at) fail();
}
export async function inspectRetainedCountyRelations(manifest, { signal } = {}) {
  if (typeof manifest !== 'string' || manifest !== path.resolve(manifest) || path.basename(manifest) !== 'manifest.json'
    || path.dirname(path.dirname(manifest)) !== outputRoot() || !uuid(path.basename(path.dirname(manifest)))) fail();
  const directory = path.dirname(manifest); await canonical(directory, { signal });
  const owner = await lstat(directory, { bigint: true });
  if (!same(await readdir(directory), ['manifest.json'])) fail();
  const meter = {}, saved = await readJson(manifest, CAP, signal, meter);
  validateCountyRelationEnvelope(saved, path.basename(directory));
  if (!same(saved.report, await loadRetainedCountyRelations({ signal }))) fail();
  const after = {}, reread = await readJson(manifest, CAP, signal, after);
  await canonical(directory, { signal }); const finalOwner = await lstat(directory, { bigint: true });
  if (!same(saved, reread) || meter.sha256 !== after.sha256 || owner.ino !== finalOwner.ino || owner.dev !== finalOwner.dev
    || !['ino', 'dev', 'size', 'mtimeNs', 'ctimeNs', 'nlink'].every(key => meter.identity[key] === after.identity[key])
    || !same(await readdir(directory), ['manifest.json'])) fail();
  return { manifest, sha256: meter.sha256, run_id: saved.run_id, counts: saved.report.counts, source_requests_this_build: 0 };
}
export async function buildRetainedCountyRelations({ signal } = {}) {
  signal?.throwIfAborted(); const report = await loadRetainedCountyRelations({ signal }), runId = randomUUID();
  const root = outputRoot(), directory = path.join(root, runId); await canonical(root, { create: true, output: true, signal });
  await mkdir(directory); const pending = path.join(directory, 'manifest.pending'), manifest = path.join(directory, 'manifest.json');
  const owner = await lstat(directory, { bigint: true }), owned = new Map(); let output, published = false;
  try {
    const saved = { run_id: runId, created_at: new Date().toISOString(), report };
    output = await writer(pending, CAP, signal, owned); await output.write(saved); const descriptor = await output.finish();
    const meter = {}; if (!same(await readJson(pending, CAP, signal, meter), saved) || meter.sha256 !== descriptor.sha256) fail();
    signal?.throwIfAborted(); await link(pending, manifest); published = true; await unlink(pending);
    return await inspectRetainedCountyRelations(manifest, { signal });
  } finally {
    await output?.close();
    if (signal?.aborted && !published) await discardOwnedCountyStaging(directory, owner, owned);
  }
}
