import path from 'node:path';
import { readdir } from 'node:fs/promises';
import { isDeepStrictEqual as same } from 'node:util';
import { APP_ROOT } from './paths.mjs';
import { mnSelectionReadJson as readJson, mnSelectionReadLines as readLines } from './mn-construction-retained-selection.mjs';

export const RETAINED_COUNTY_ENHANCER = 'retained_childcare_county_points';
const binding = Object.freeze({ schema_version: 'retained-childcare-county-display@1.0.0',
  run_id: '35c6318f-aa0b-4d21-acd4-9581dd660db4', manifest_sha256: '68dfec10cde09b9e2be0fff07a7e4395ea12dc30f5207096af83755e7972887c' });
const geographyHash = '5426cae150c0fba64f8ff43a48ca39c4e78b5b4ba8a8007fbd211615540d1c8b';
const fail = () => { throw Error('Retained county display evidence could not be verified.'); };

// Integrity of an explicitly enrolled, previously source-replayed derivative.
// No source replay, acquisition, publication or process is started by this read.
export async function loadRetainedCountyDisplay({ root = APP_ROOT, signal } = {}) {
  signal?.throwIfAborted();
  const config = path.join(root, 'config/retained-childcare-county-enrollment.json'), cm = {};
  let selected;
  try { selected = await readJson(config, 2000, signal, cm); }
  catch (error) { if (error.code === 'ENOENT') return { status: 'not-enrolled' }; throw error; }
  if (!same(selected, binding)) fail();
  const directory = path.join(root, 'data/retained-childcare-county-relations', binding.run_id), meter = {};
  let saved;
  try { saved = await readJson(path.join(directory, 'manifest.json'), 20_000_000, signal, meter); }
  catch (error) { if (error.code === 'ENOENT') return { status: 'unavailable', reason: 'enrolled-derivative-not-installed' }; throw error; }
  if (meter.sha256 !== binding.manifest_sha256 || !same(await readdir(directory), ['manifest.json']) || saved.run_id !== binding.run_id) fail();
  const report = saved.report;
  if (report.schema_version !== 'retained-childcare-county-relations@1.0.0' || report.inputs.geography_sha256 !== geographyHash
    || report.public_export_authorized !== false || report.national_reporting_integrated !== false) fail();
  const artifact = report.county_artifacts.find(a => a.path === 'derived/index/counties.jsonl'), gm = {}, countyIds = [];
  const geoRoot = path.dirname(path.join(root, report.inputs.geography));
  for await (const county of readLines(path.join(geoRoot, artifact.path), 2_000_000, signal, gm)) {
    if (county.state_fips === '42') countyIds.push(county.geoid);
  }
  if (gm.sha256 !== artifact.sha256 || gm.bytes !== artifact.bytes || countyIds.length !== 67 || new Set(countyIds).size !== 67) fail();
  const final = {}; await readJson(config, 2000, signal, final); if (final.sha256 !== cm.sha256) fail();
  const after = {}; await readJson(path.join(directory, 'manifest.json'), 20_000_000, signal, after);
  if (after.sha256 !== meter.sha256 || !same(await readdir(directory), ['manifest.json'])) fail();
  return { status: 'available', run_id: saved.run_id, derivative_created_at: saved.created_at,
    manifest_sha256: meter.sha256, geography_manifest_sha256: geographyHash,
    geography_release_id: path.basename(geoRoot), pa_county_geoids: countyIds.sort(),
    counts: report.counts, pa_selected_source_rows: report.rows.filter(row => row.dataset_id === 'pa-dhs-childcare-centers').length,
    source_observation_basis: 'Original observations remain in the retained source receipts; derivative creation is not source freshness.',
    integrity_verified_this_read: true, source_replay_performed_this_read: false,
    new_operation_submitted: false, public_export_authorized: false, national_reporting_integrated: false };
}

export function retainedCountyMetric(data, { level, geoid, categoryId = 'all', geographyManifestSha256 } = {}) {
  if (data?.status !== 'available') return { value: null, status: 'unavailable' };
  if (geographyManifestSha256 !== data.geography_manifest_sha256) return { value: null, status: 'geography-mismatch' };
  if (!['all', 'childcare'].includes(categoryId)) return { value: null, status: 'category-not-applicable' };
  if (level === 'state' && geoid === '42') return { value: data.counts.by_status['assigned-single-county'], status: 'available-source-points' };
  if (level === 'county' && data.pa_county_geoids.includes(geoid)) return {
    value: data.counts.by_county.find(row => row.county_geoid === geoid)?.candidate_rows ?? 0, status: 'available-source-points' };
  return { value: null, status: level === 'zip' ? 'zip-assignment-not-performed' : 'source-scope-not-enabled' };
}
