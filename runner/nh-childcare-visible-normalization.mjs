import { randomUUID } from 'node:crypto';
import { mkdir, lstat, readdir, link, unlink } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual as same } from 'node:util';
import { APP_ROOT } from './paths.mjs';
import { profileNhVisibleResults } from './nh-childcare-visible-results.mjs';
import { mnSelectionCanonical as canonical, mnSelectionReadJson as readJson, mnSelectionWriter as writer } from './mn-construction-retained-selection.mjs';

export const NH_NORMALIZATION_VERSION = 'nh-visible-results@1.1.0';
export const NH_RETAINED_VISIBLE = Object.freeze({
  run_id: '07c41c61-02f7-4bbc-9312-f0540890a82d',
  manifest: 'data/business-sources/nh-childcare/visible-result-probes/07c41c61-02f7-4bbc-9312-f0540890a82d/manifest.json',
  sha256: '370c09ff1082f2961742c249e9327831d051d684a12818d7234c63dc76a6dcae',
});
const CAP = 262144;
const fail = () => { throw Error('New Hampshire retained normalization requires inspection.'); };
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const instant = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const stable = (before, after) => ['ino', 'dev', 'size', 'mtimeNs', 'ctimeNs', 'nlink'].every(key => before[key] === after[key]);

// v1.0.0 remains unchanged for replay of the acquired artifact. Recognize only
// the newly observed literal full state label in a complete city/state/ZIP line.
export function normalizeNhVisibleResults(selected) {
  const baseline = profileNhVisibleResults(selected), input = structuredClone(baseline.selected);
  for (const row of input.rows) if (row.address_lines.length === 2) {
    row.address_lines[1] = row.address_lines[1].replace(/^([^,]+),\s*New Hampshire\s+(\d{5}(?:-\d{4})?)$/, '$1, NH $2');
  }
  const normalized = profileNhVisibleResults(input);
  normalized.schema_version = NH_NORMALIZATION_VERSION;
  normalized.selected = baseline.selected;
  for (let i = 0; i < normalized.candidates.length; i++) {
    normalized.candidates[i].address.source_lines = [...baseline.candidates[i].address.source_lines];
  }
  return normalized;
}

export async function readNhRetainedVisible({ signal } = {}) {
  signal?.throwIfAborted();
  const meter = {}, receipt = await readJson(path.join(APP_ROOT, NH_RETAINED_VISIBLE.manifest), CAP, signal, meter);
  if (meter.sha256 !== NH_RETAINED_VISIBLE.sha256 || receipt.run_id !== NH_RETAINED_VISIBLE.run_id
    || receipt.status !== 'visible-results-observed-not-collection-ready' || receipt.selected_contract_verified !== true
    || receipt.browser_cleanup_verified !== true || receipt.retained_browser_scratch !== false
    || receipt.pending_network_handlers !== 0 || receipt.network_scope_denied !== false
    || !instant(receipt.observed_at) || !same(profileNhVisibleResults(receipt.observation.selected), receipt.observation)) fail();
  return receipt;
}

function bundle(source, runId, createdAt) {
  if (!uuid(runId) || !instant(createdAt) || createdAt < source.observed_at || createdAt > new Date().toISOString()) fail();
  const observation = normalizeNhVisibleResults(source.observation.selected);
  return { schema_version: 'nh-visible-normalization-bundle@1.0.0', run_id: runId, created_at: createdAt,
    execution_mode: 'offline-retained-source-reprocessing', source: { ...NH_RETAINED_VISIBLE,
      observed_at: source.observed_at, policy: source.policy, acquired_schema_version: source.observation.schema_version },
    normalization_version: NH_NORMALIZATION_VERSION, observation,
    counts: { source_rows: observation.source_rows, parsed_addresses: observation.candidates.filter(row => row.address.parsed).length,
      zip4_available: observation.candidates.filter(row => row.address.zip4 !== null).length,
      source_points: observation.candidates.filter(row => row.latitude !== null && row.longitude !== null).length },
    source_requests_this_build: 0, public_export_authorized: false, national_reporting_integrated: false,
    current_operations_verified: false, physical_sites_verified: false };
}

function outputRoot() { return path.join(APP_ROOT, 'data/business-sources/nh-childcare/visible-normalizations'); }
export async function inspectNhVisibleNormalization(manifestPath, { signal, expectedSha256 } = {}) {
  signal?.throwIfAborted();
  if (typeof manifestPath !== 'string' || manifestPath !== path.resolve(manifestPath) || path.basename(manifestPath) !== 'manifest.json'
    || path.dirname(path.dirname(manifestPath)) !== outputRoot() || !uuid(path.basename(path.dirname(manifestPath)))
    || expectedSha256 !== undefined && !/^[a-f0-9]{64}$/.test(expectedSha256)) fail();
  const directory = path.dirname(manifestPath); await canonical(directory, { signal });
  const owner = await lstat(directory, { bigint: true });
  if (!same(await readdir(directory), ['manifest.json'])) fail();
  const meter = {}, saved = await readJson(manifestPath, CAP, signal, meter);
  const source = await readNhRetainedVisible({ signal });
  if (expectedSha256 !== undefined && meter.sha256 !== expectedSha256
    || saved.run_id !== path.basename(directory) || !same(saved, bundle(source, saved.run_id, saved.created_at))) fail();
  const after = {}, reread = await readJson(manifestPath, CAP, signal, after);
  await canonical(directory, { signal }); const finalOwner = await lstat(directory, { bigint: true });
  if (owner.ino !== finalOwner.ino || owner.dev !== finalOwner.dev || !same(await readdir(directory), ['manifest.json'])
    || meter.sha256 !== after.sha256 || !stable(meter.identity, after.identity) || !same(saved, reread)) fail();
  await readNhRetainedVisible({ signal });
  return { manifest: manifestPath, sha256: meter.sha256, run_id: saved.run_id, source_observed_at: saved.source.observed_at,
    normalization_version: saved.normalization_version, counts: saved.counts, source_requests_this_build: 0 };
}

export async function buildNhVisibleNormalization({ signal } = {}) {
  signal?.throwIfAborted(); const source = await readNhRetainedVisible({ signal });
  const runId = randomUUID(), root = outputRoot(), directory = path.join(root, runId);
  const saved = bundle(source, runId, new Date().toISOString());
  await canonical(root, { create: true, output: true, signal }); signal?.throwIfAborted(); await mkdir(directory);
  const temporary = path.join(directory, 'manifest.pending'), manifest = path.join(directory, 'manifest.json');
  let out;
  try {
    out = await writer(temporary, CAP, signal, new Map()); await out.write(saved); const descriptor = await out.finish();
    const meter = {}, reread = await readJson(temporary, CAP, signal, meter);
    if (meter.sha256 !== descriptor.sha256 || !same(reread, saved)
      || !same(saved, bundle(await readNhRetainedVisible({ signal }), runId, saved.created_at))) fail();
    signal?.throwIfAborted(); await link(temporary, manifest); await unlink(temporary);
    return await inspectNhVisibleNormalization(manifest, { signal, expectedSha256: descriptor.sha256 });
  } finally { await out?.close(); }
}
