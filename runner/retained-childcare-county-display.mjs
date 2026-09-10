import path from 'node:path';
import { readdir } from 'node:fs/promises';
import { isDeepStrictEqual as same } from 'node:util';
import { APP_ROOT } from './paths.mjs';
import { mnSelectionReadJson as readJson, mnSelectionReadLines as readLines } from './mn-construction-retained-selection.mjs';

export const RETAINED_COUNTY_ENHANCER = 'retained_childcare_county_points';
const binding = Object.freeze({ schema_version: 'retained-childcare-county-display@2.0.0',
  run_id: 'b660d059-25c4-44fc-8c4a-b94bc87d855e', manifest_sha256: 'be0798c546d0016d7633c563f73e62734358cd0a8dd0025c28e35a0cdc3298ee' });
const geographyHash = '5426cae150c0fba64f8ff43a48ca39c4e78b5b4ba8a8007fbd211615540d1c8b';
const fail = () => { throw Error('Retained county display evidence could not be verified.'); };

export function aggregateCountySourceCohorts(rows) {
  return [['pa-dhs-childcare-centers', 'Pennsylvania'], ['md-msde-childcare-centers', 'Maryland']].map(([dataset_id, source_label]) => {
    const selected = rows.filter(row => row.dataset_id === dataset_id), counties = new Map(), by_status = {};
    for (const row of selected) {
      by_status[row.status] = (by_status[row.status] ?? 0) + 1;
      if (row.status !== 'assigned-single-county') continue;
      if (!/^\d{5}$/.test(row.county_geoid) || row.derived_state_fips !== row.county_geoid.slice(0, 2)) fail();
      counties.set(row.county_geoid, (counties.get(row.county_geoid) ?? 0) + 1);
    }
    return { dataset_id, source_label, selected_source_rows: selected.length,
      assigned_source_rows: by_status['assigned-single-county'] ?? 0, by_status,
      by_county: [...counties].sort(([a], [b]) => a.localeCompare(b)).map(([county_geoid, candidate_rows]) => ({ county_geoid, candidate_rows })) };
  });
}

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
  if (report.schema_version !== 'retained-childcare-county-relations@2.0.0' || report.inputs.geography_sha256 !== geographyHash
    || report.public_export_authorized !== false || report.national_reporting_integrated !== false) fail();
  const artifact = report.county_artifacts.find(a => a.path === 'derived/index/counties.jsonl'), gm = {}, countyIds = [];
  const geoRoot = path.dirname(path.join(root, report.inputs.geography));
  for await (const county of readLines(path.join(geoRoot, artifact.path), 2_000_000, signal, gm)) {
    if (['42', '24'].includes(county.state_fips)) countyIds.push(county.geoid);
  }
  if (gm.sha256 !== artifact.sha256 || gm.bytes !== artifact.bytes || countyIds.length !== 91 || new Set(countyIds).size !== 91
    || countyIds.filter(id => id.startsWith('42')).length !== 67 || countyIds.filter(id => id.startsWith('24')).length !== 24) fail();
  const final = {}; await readJson(config, 2000, signal, final); if (final.sha256 !== cm.sha256) fail();
  const after = {}; await readJson(path.join(directory, 'manifest.json'), 20_000_000, signal, after);
  if (after.sha256 !== meter.sha256 || !same(await readdir(directory), ['manifest.json'])) fail();
  return { status: 'available', run_id: saved.run_id, derivative_created_at: saved.created_at,
    manifest_sha256: meter.sha256, geography_manifest_sha256: geographyHash,
    schema_version: binding.schema_version, geography_release_id: path.basename(geoRoot), county_geoids: countyIds.sort(), supported_state_fips: ['24', '42'],
    counts: report.counts, source_cohorts: aggregateCountySourceCohorts(report.rows),
    source_observation_basis: 'Original observations remain in the retained source receipts; derivative creation is not source freshness.',
    integrity_verified_this_read: true, source_replay_performed_this_read: false,
    new_operation_submitted: false, public_export_authorized: false, national_reporting_integrated: false };
}

export function retainedCountyMetric(data, { level, geoid, categoryId = 'all', geographyManifestSha256 } = {}) {
  if (data?.status !== 'available') return { value: null, status: 'unavailable' };
  if (geographyManifestSha256 !== data.geography_manifest_sha256) return { value: null, status: 'geography-mismatch' };
  if (!['all', 'childcare'].includes(categoryId)) return { value: null, status: 'category-not-applicable' };
  if (level === 'state' && data.supported_state_fips.includes(geoid) || level === 'county' && data.county_geoids.includes(geoid)) return {
    value: data.source_cohorts.reduce((total, source) => total + source.by_county.reduce((sum, county) => sum
      + ((level === 'state' ? county.county_geoid.startsWith(geoid) : county.county_geoid === geoid) ? county.candidate_rows : 0), 0), 0),
    status: 'available-source-points' };
  return { value: null, status: level === 'zip' ? 'zip-assignment-not-performed' : 'source-scope-not-enabled' };
}
