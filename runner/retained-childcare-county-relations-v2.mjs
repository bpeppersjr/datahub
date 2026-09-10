import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, lstat, link, unlink } from 'node:fs/promises';
import { isDeepStrictEqual as same } from 'node:util';
import { setImmediate as yieldTurn } from 'node:timers/promises';
import { APP_ROOT } from './paths.mjs';
import { countyPublicationSequence } from './county-publication-sequence.mjs';
import { assignPointToCounty } from './national-business-coverage-views.mjs';
import { verifyRetainedChildcareRegistryExtension } from './retained-childcare-registry-input.mjs';
import { COUNTY_RELATION_INPUTS, createRetainedCountyIndex, deriveRetainedCountyRelations,
  discardOwnedCountyStaging, validateCountyRelationEnvelope } from './retained-childcare-county-relations.mjs';
import { loadMdCountyOverlayAuthorization, mdCountyOverlayBindings, reverifyMdCountyOverlayAuthorization } from './md-childcare-county-policy.mjs';
import { mnSelectionReadJson as readJson, mnSelectionReadLines as readLines,
  mnSelectionCanonical as canonical, mnSelectionWriter as writer } from './mn-construction-retained-selection.mjs';

export const COUNTY_RELATION_V2 = 'retained-childcare-county-relations@2.0.0';
const MD = 'md-msde-childcare-centers', CAP = 20_000_000;
const fail = () => { throw Error('Retained childcare county successor requires inspection.'); };
const outputRoot = () => path.join(APP_ROOT, 'data/retained-childcare-county-relations');
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
function options(value) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(value).some(key => key !== 'signal'
    || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'))) fail();
  if (value.signal !== undefined && !(value.signal instanceof AbortSignal)) fail();
  value.signal?.throwIfAborted(); return value.signal;
}
async function pinned(relative, expected, signal, maximum = 4_000_000) {
  const meter = {}, value = await readJson(path.join(APP_ROOT, relative), maximum, signal, meter);
  if (meter.sha256 !== expected) fail(); return value;
}
async function calculate(records, index, states, signal) {
  if (!Array.isArray(states) || states.length > 60) fail();
  const stateCodes = new Map(), ids = new Set();
  for (const state of states) {
    if (typeof state.geoid !== 'string' || typeof state.postal_abbreviation !== 'string'
      || !/^\d{2}$/.test(state.geoid) || !/^[A-Z]{2}$/.test(state.postal_abbreviation)
      || stateCodes.has(state.postal_abbreviation) || ids.has(state.geoid)) fail();
    stateCodes.set(state.postal_abbreviation, state.geoid); ids.add(state.geoid);
  }
  const before = await deriveRetainedCountyRelations(records, index, { signal });
  const byStatus = { ...before.counts.by_status }, byCounty = new Map(before.counts.by_county.map(row => [row.county_geoid, row.candidate_rows]));
  let marylandRows = 0, changed = 0;
  const rows = [];
  for (const [n, row] of before.rows.entries()) {
    if (n % 128 === 0) { await yieldTurn(); signal?.throwIfAborted(); }
    if (row.dataset_id !== MD) { rows.push(row); continue; }
    marylandRows++;
    if (row.status !== 'source-not-enabled-for-overlay') { rows.push(row); continue; }
    const point = records[n].geocode, assignment = assignPointToCounty([point.longitude, point.latitude], index);
    if (!Object.hasOwn(byStatus, assignment.status)) fail();
    changed++; byStatus[row.status]--; byStatus[assignment.status]++;
    const county = assignment.county, reportedFips = stateCodes.get(row.reported_state);
    if (county) {
      if (!ids.has(county.stateFips)) fail();
      byCounty.set(county.geoid, (byCounty.get(county.geoid) ?? 0) + 1);
    }
    rows.push({ ...row, status: assignment.status, county_geoid: county?.geoid ?? null, derived_state_fips: county?.stateFips ?? null,
      candidate_county_geoids: assignment.candidate_geoids ?? [],
      reported_state_relation: county ? !reportedFips ? 'unresolved' : reportedFips === county.stateFips ? 'matches' : 'requires-review' : 'not-assigned' });
  }
  if (Object.values(byStatus).some(n => !Number.isSafeInteger(n) || n < 0)
    || Object.values(byStatus).reduce((a, b) => a + b, 0) !== records.length) fail();
  for (let n = 0; n < rows.length; n++) {
    if (rows[n].dataset_id !== MD && !same(rows[n], before.rows[n])) fail();
    for (const field of ['candidate_id', 'dataset_id', 'reported_state', 'reported_zip5', 'reported_zip4']) if (!same(rows[n][field], before.rows[n][field])) fail();
  }
  return { ...before, schema_version: COUNTY_RELATION_V2, rows,
    counts: { candidate_rows: rows.length, by_status: byStatus,
      by_county: [...byCounty].sort(([a], [b]) => a.localeCompare(b)).map(([county_geoid, candidate_rows]) => ({ county_geoid, candidate_rows })) },
    successor: { predecessor_version: before.schema_version, changed_source_dataset: MD, maryland_candidate_rows: marylandRows,
      eligibility_decisions_changed: changed, non_maryland_relationships_preserved: true,
      maryland_reported_state_comparison: 'canonical-census-state-abbreviation-to-fips; unknown labels unresolved' } };
}

/** Numerical fixtures only; no production context, input verification or publication. */
export async function calculateSyntheticCountyRelationsV2(records, index, states, value = {}) {
  const result = await calculate(records, index, states, options(value));
  return { ...result, evidence_mode: 'synthetic-test', publication_eligible: false };
}

/** Production callers cannot replace policies, records, geometry, paths or transport. */
export async function loadRetainedCountyRelationsV2(value = {}) {
  const signal = options(value), authorization = await loadMdCountyOverlayAuthorization({ signal });
  const policy = mdCountyOverlayBindings(authorization), pins = COUNTY_RELATION_INPUTS;
  if (policy.registry_manifest_sha256 !== pins.registry_sha256 || policy.geography_manifest_sha256 !== pins.geography_sha256) fail();
  await pinned(pins.pa_policy, pins.pa_policy_sha256, signal);
  const registry = await pinned(pins.registry, pins.registry_sha256, signal);
  const input = await verifyRetainedChildcareRegistryExtension(registry, path.dirname(path.join(APP_ROOT, pins.registry)), { signal });
  if (!input || input.records.length !== 12206 || input.records.filter(row => row.source.dataset_id === MD).length !== policy.source_candidate_rows) fail();
  const geography = await pinned(pins.geography, pins.geography_sha256, signal);
  if (!geography.complete_national_release || geography.coverage.county_equivalents !== 3235) fail();
  const root = path.dirname(path.join(APP_ROOT, pins.geography)), features = [], metadata = [], states = [], dependencies = [];
  const artifacts = geography.artifacts.filter(a => ['derived/index/counties.jsonl', 'derived/index/states.jsonl'].includes(a.path)
    || a.geography_type === 'county' && /^source\/counties\/state=\d{2}\.geojson$/.test(a.path));
  if (artifacts.length !== 58) fail();
  for (const artifact of artifacts) {
    signal?.throwIfAborted(); const meter = {}, file = path.join(root, artifact.path);
    if (artifact.path.endsWith('.jsonl')) {
      for await (const row of readLines(file, 2_000_000, signal, meter)) (artifact.path.endsWith('/states.jsonl') ? states : metadata).push(row);
    } else {
      const collection = await readJson(file, 5_000_000, signal, meter);
      if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) fail(); features.push(...collection.features);
    }
    if (meter.sha256 !== artifact.sha256 || meter.bytes !== artifact.bytes) fail();
    dependencies.push({ path: artifact.path, sha256: meter.sha256, bytes: meter.bytes });
  }
  if (features.length !== 3235 || metadata.length !== 3235 || states.length < 51) fail();
  const report = await calculate(input.records, createRetainedCountyIndex(features, metadata), states, signal);
  if (report.successor.maryland_candidate_rows !== 1772 || report.successor.eligibility_decisions_changed !== 1772) fail();
  await pinned(pins.registry, pins.registry_sha256, signal); await pinned(pins.geography, pins.geography_sha256, signal);
  await pinned(pins.pa_policy, pins.pa_policy_sha256, signal); await reverifyMdCountyOverlayAuthorization(authorization, { signal });
  return { ...report, evidence_mode: 'verified-retained-registry-and-census-derivation', internal_derivative_publication_eligible: true,
    inputs: { ...pins }, source_registry_created_at: registry.created_at, source_bindings: input.bindings, county_artifacts: dependencies,
    maryland_overlay_authorization: policy,
    attribution: ['Pennsylvania Department of Human Services / PA Open Data Portal', ...policy.attribution], source_requests_this_build: 0 };
}

export async function inspectRetainedCountyRelationsV2(manifest, value = {}) {
  const signal = options(value);
  if (typeof manifest !== 'string' || manifest !== path.resolve(manifest) || path.basename(manifest) !== 'manifest.json'
    || path.dirname(path.dirname(manifest)) !== outputRoot() || !uuid(path.basename(path.dirname(manifest)))) fail();
  const directory = path.dirname(manifest); await canonical(directory, { signal }); const owner = await lstat(directory, { bigint: true });
  if (!same(await readdir(directory), ['manifest.json'])) fail();
  const meter = {}, saved = await readJson(manifest, CAP, signal, meter);
  validateCountyRelationEnvelope(saved, path.basename(directory));
  if (saved.report.schema_version !== COUNTY_RELATION_V2 || !same(saved.report, await loadRetainedCountyRelationsV2({ signal }))) fail();
  const after = {}, reread = await readJson(manifest, CAP, signal, after);
  await canonical(directory, { signal }); const finalOwner = await lstat(directory, { bigint: true });
  if (!same(saved, reread) || meter.sha256 !== after.sha256 || owner.ino !== finalOwner.ino || owner.dev !== finalOwner.dev
    || !['ino', 'dev', 'size', 'mtimeNs', 'ctimeNs', 'nlink'].every(key => meter.identity[key] === after.identity[key])
    || !same(await readdir(directory), ['manifest.json'])) fail();
  return { manifest, sha256: meter.sha256, run_id: saved.run_id, counts: saved.report.counts, successor: saved.report.successor, source_requests_this_build: 0 };
}
export async function buildRetainedCountyRelationsV2(value = {}) {
  const signal = options(value), report = await loadRetainedCountyRelationsV2({ signal }), runId = randomUUID();
  const root = outputRoot(), directory = path.join(root, runId); await canonical(root, { create: true, output: true, signal });
  await mkdir(directory); const pending = path.join(directory, 'manifest.pending'), manifest = path.join(directory, 'manifest.json');
  const owner = await lstat(directory, { bigint: true }), owned = new Map(); let output, published = false;
  try {
    const saved = { run_id: runId, created_at: new Date().toISOString(), report };
    output = await writer(pending, CAP, signal, owned); await output.write(saved); const descriptor = await output.finish();
    const meter = {}; if (!same(await readJson(pending, CAP, signal, meter), saved) || meter.sha256 !== descriptor.sha256) fail();
    return await countyPublicationSequence({ signal,
      revalidate: async () => {
        if (!same(report, await loadRetainedCountyRelationsV2({ signal }))) fail();
        const staged = {};
        if (!same(await readJson(pending, CAP, signal, staged), saved) || staged.sha256 !== descriptor.sha256) fail();
        await canonical(directory, { signal });
        const current = await lstat(directory, { bigint: true });
        if (current.ino !== owner.ino || current.dev !== owner.dev || !same(await readdir(directory), ['manifest.pending'])) fail();
      },
      publish: async () => { await link(pending, manifest); published = true; },
      inspect: async () => { await unlink(pending); return inspectRetainedCountyRelationsV2(manifest, { signal }); },
      recovery: { manifest, run_id: runId, expected_sha256: descriptor.sha256 },
    });
  } finally {
    await output?.close(); if (signal?.aborted && !published) await discardOwnedCountyStaging(directory, owner, owned);
  }
}
