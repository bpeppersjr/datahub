import path from 'node:path';
import { isDeepStrictEqual as same } from 'node:util';
import { APP_ROOT } from './paths.mjs';
import { mnSelectionReadJson as readJson, mnSelectionReadLines as readLines } from './mn-construction-retained-selection.mjs';
import { COUNTY_RELATION_INPUTS, validateCountyRelationEnvelope } from './retained-childcare-county-relations.mjs';
import { loadRetainedCountyRelationsV2, calculateSyntheticCountyRelationsV2 } from './retained-childcare-county-relations-v2.mjs';

export const RETAINED_CHILDCARE_COUNTY_COVERAGE_VERSION = 'retained-childcare-county-coverage@1.0.0';
const pins = Object.freeze({
  enrollment: 'config/retained-childcare-county-enrollment.json',
  enrollment_sha256: 'cf68097002840033d4f21a61659ad09d88d3023ce92906ad7efa1792b77362f7',
  derivative: 'data/retained-childcare-county-relations/b660d059-25c4-44fc-8c4a-b94bc87d855e/manifest.json',
  derivative_sha256: 'be0798c546d0016d7633c563f73e62734358cd0a8dd0025c28e35a0cdc3298ee',
  registry: 'data/business-registry/releases/national-business-registry-20260911-022652067Z-1ec656c3/manifest.json',
  registry_sha256: 'd8ab131697b1df63ed53fdfa9832d6973fd152ddf23565219ee9bb39b25fbb76',
  coverage: 'data/business-coverage-views/releases/national-business-coverage-views-20260911-040908332Z-f01c882a/manifest.json',
  coverage_sha256: 'f15d43dda3acfb2e81fe2cd0360ec8dfba9f3061597c62c2eb8d1953bdc706b6',
  md_policy: 'config/source-policies/md-childcare-county-derivation-internal.json',
  md_policy_sha256: 'cf520ac70cb59965129549842cdaea2916f242ade599e3508b68c388775ebad1',
});
const PA = 'pa-dhs-childcare-centers', MD = 'md-msde-childcare-centers';
const sources = new Set([PA, MD, 'ct-oec-childcare-centers', 'vt-cdd-childcare-centers', 'co-cdec-childcare-centers', 'ut-dlbc-childcare-centers', 'ia-childcare-centers']);
const fail = message => { throw Error(`Retained childcare county coverage rejected: ${message}.`); };
const check = (value, message) => { if (!value) fail(message); };
const contexts = new WeakMap();
const claims = () => ({ row_unit: 'retained-source-candidate', identity_matching_applied: false, physical_site_verified: false,
  current_operations_verified: false, postal_membership_inferred: false, national_reporting_integrated: false,
  successor_enrolled: false, public_export_authorized: false, export_policy: 'internal', national_completeness_percent: null });
function signalOption(options) {
  check(options && Object.getPrototypeOf(options) === Object.prototype && Object.keys(options).every(key => key === 'signal'), 'unsupported options');
  check(options.signal === undefined || options.signal instanceof AbortSignal, 'invalid signal');
  options.signal?.throwIfAborted(); return options.signal;
}
async function pinned(file, expected, signal, cap = 4_000_000) {
  const meter = {}, value = await readJson(path.join(APP_ROOT, file), cap, signal, meter);
  check(meter.sha256 === expected, `stale pin ${file}`); return value;
}
const artifact = manifest => {
  const selected = manifest.artifacts.filter(row => row.artifact_type === 'retained-childcare-source-candidate-jsonl');
  check(selected.length === 1 && selected[0].path === 'reporting/retained-childcare/candidates.jsonl'
    && selected[0].record_count === 12206 && selected[0].export_policy === 'internal', 'candidate artifact contract');
  return selected[0];
};

async function metadata(signal) {
  const enrollment = await pinned(pins.enrollment, pins.enrollment_sha256, signal, 2000);
  check(enrollment.schema_version === 'retained-childcare-county-display@2.0.0'
    && enrollment.run_id === path.basename(path.dirname(pins.derivative)) && enrollment.manifest_sha256 === pins.derivative_sha256, 'county enrollment');
  const saved = await pinned(pins.derivative, pins.derivative_sha256, signal, 20_000_000);
  validateCountyRelationEnvelope(saved, enrollment.run_id);
  check(saved.report.schema_version === 'retained-childcare-county-relations@2.0.0'
    && same(saved.report.inputs, COUNTY_RELATION_INPUTS), 'derivative source pins');
  const original = await pinned(COUNTY_RELATION_INPUTS.registry, COUNTY_RELATION_INPUTS.registry_sha256, signal);
  const registry = await pinned(pins.registry, pins.registry_sha256, signal);
  const coverage = await pinned(pins.coverage, pins.coverage_sha256, signal);
  const geography = await pinned(COUNTY_RELATION_INPUTS.geography, COUNTY_RELATION_INPUTS.geography_sha256, signal);
  await pinned(COUNTY_RELATION_INPUTS.pa_policy, COUNTY_RELATION_INPUTS.pa_policy_sha256, signal);
  await pinned(pins.md_policy, pins.md_policy_sha256, signal, 30000);
  check(saved.report.maryland_overlay_authorization.policy_sha256 === pins.md_policy_sha256
    && saved.report.maryland_overlay_authorization.registry_manifest_sha256 === COUNTY_RELATION_INPUTS.registry_sha256
    && saved.report.maryland_overlay_authorization.geography_manifest_sha256 === COUNTY_RELATION_INPUTS.geography_sha256, 'Maryland policy binding');
  check(registry.publisher.version === '2.15.0' && coverage.publisher.version === '2.11.0'
    && registry.complete_national_business_registry === false && coverage.complete_all_businesses === false, 'unsupported retained release');
  check(same(original.retained_childcare_reporting, registry.retained_childcare_reporting)
    && same(artifact(original), artifact(registry)), 'registry cohort changed');
  for (const [folder, manifest, hash] of [['business-registry', registry, pins.registry_sha256], ['business-coverage-views', coverage, pins.coverage_sha256]]) {
    const pointer = await readJson(path.join(APP_ROOT, `data/${folder}/current.json`), 10000, signal);
    check(pointer.release_id === manifest.release_id && pointer.manifest === `releases/${manifest.release_id}/manifest.json`, 'current release moved');
    if (folder === 'business-registry') {
      const dep = coverage.dependencies.filter(row => row.dataset_id === 'national-business-registry');
      check(dep.length === 1 && dep[0].release_id === manifest.release_id && dep[0].manifest_sha256 === hash, 'coverage registry dependency');
    }
  }
  const geo = coverage.dependencies.filter(row => row.dataset_id === 'us-census-geography');
  check(geo.length === 1 && geo[0].release_id === geography.release_id && geo[0].manifest_sha256 === COUNTY_RELATION_INPUTS.geography_sha256
    && geography.complete_national_release === true && geography.coverage.county_equivalents === 3235, 'coverage geography dependency');
  check(coverage.retained_childcare_reporting.registry_manifest_path === pins.registry
    && same(coverage.retained_childcare_reporting.summary, registry.retained_childcare_reporting.summary), 'coverage cohort declaration');
  const bindings = { ...pins, derivative_registry: COUNTY_RELATION_INPUTS.registry, derivative_registry_sha256: COUNTY_RELATION_INPUTS.registry_sha256,
    derivative_registry_release_id: original.release_id, registry_release_id: registry.release_id, coverage_release_id: coverage.release_id,
    geography: COUNTY_RELATION_INPUTS.geography, geography_sha256: COUNTY_RELATION_INPUTS.geography_sha256, geography_release_id: geography.release_id,
    pa_policy: COUNTY_RELATION_INPUTS.pa_policy, pa_policy_sha256: COUNTY_RELATION_INPUTS.pa_policy_sha256,
    candidate_artifact: artifact(registry), candidate_selection: registry.retained_childcare_reporting.selection,
    candidate_source_bindings: registry.retained_childcare_reporting.bindings,
    candidate_enrollment_pins: registry.retained_childcare_reporting.configuration_pins,
    maryland_overlay_authorization: saved.report.maryland_overlay_authorization };
  return { saved, registry, geography, bindings };
}

/** Bounded metadata check only; explicitly not source or polygon replay. */
export async function inspectRetainedChildcareCountyCoverageCompatibility(options = {}) {
  const signal = signalOption(options), value = await metadata(signal);
  return { schema_version: RETAINED_CHILDCARE_COUNTY_COVERAGE_VERSION, bindings: value.bindings,
    metadata_compatible: true, source_replay_verified: false, ...claims() };
}

function project(records, relation, counties) {
  check(Array.isArray(records) && records.length <= 25000 && Array.isArray(relation.rows) && relation.rows.length === records.length, 'candidate cardinality');
  check(Array.isArray(counties) && counties.length <= 10000, 'county bounds');
  const countySet = new Set(), supported = new Set(), seen = new Set();
  for (const county of counties) {
    check(/^\d{5}$/.test(county.geoid) && county.state_fips === county.geoid.slice(0, 2) && !countySet.has(county.geoid), 'county roster');
    countySet.add(county.geoid); if (['24', '42'].includes(county.state_fips)) supported.add(county.geoid);
  }
  const rows = [], byCounty = new Map(), bySource = new Map(), statuses = {};
  for (let n = 0; n < records.length; n++) {
    const candidate = records[n], row = relation.rows[n], source = candidate.source?.dataset_id;
    check(sources.has(source) && /^candidate:childcare:[a-f0-9]{64}$/.test(candidate.candidate_id) && !seen.has(candidate.candidate_id), 'unsupported or duplicate candidate');
    seen.add(candidate.candidate_id);
    check(row.candidate_id === candidate.candidate_id && row.dataset_id === source
      && row.reported_state === candidate.reported_address.state && row.reported_zip5 === candidate.reported_address.zip_code
      && row.reported_zip4 === candidate.reported_address.zip4, 'candidate membership or reported postal evidence changed');
    check(candidate.reported_address.zip_code === null || /^\d{5}$/.test(candidate.reported_address.zip_code), 'ZIP5');
    check(candidate.reported_address.zip4 === null || /^\d{4}$/.test(candidate.reported_address.zip4), 'ZIP4');
    statuses[row.status] = (statuses[row.status] ?? 0) + 1;
    if (!bySource.has(source)) bySource.set(source, { dataset_id: source, candidate_rows: 0, assigned_rows: 0 });
    const cohort = bySource.get(source); cohort.candidate_rows++;
    if (row.status === 'assigned-single-county') {
      check([PA, MD].includes(source) && countySet.has(row.county_geoid) && row.derived_state_fips === row.county_geoid.slice(0, 2), 'unsupported county assignment');
      cohort.assigned_rows++; byCounty.set(row.county_geoid, (byCounty.get(row.county_geoid) ?? 0) + 1);
    } else check(row.county_geoid === null && row.derived_state_fips === null, 'unassigned candidate has county');
    rows.push({ candidate_id: candidate.candidate_id, source_record_sha256: candidate.source_record_sha256,
      source: structuredClone(candidate.source), source_provenance: structuredClone(candidate.source_record?.provenance ?? null),
      source_status: structuredClone(candidate.source_record?.source_status ?? null),
      source_license_dates: structuredClone(candidate.source_record?.license_dates_source ?? null),
      reported_address: structuredClone(candidate.reported_address), source_geocode: structuredClone(candidate.geocode),
      county_relationship: structuredClone(row) });
  }
  check(Object.entries(relation.counts.by_status).every(([status, count]) => (statuses[status] ?? 0) === count)
    && Object.keys(statuses).every(status => Object.hasOwn(relation.counts.by_status, status))
    && relation.counts.candidate_rows === records.length, 'disposition conservation');
  const by_county = [...byCounty].sort(([a], [b]) => a.localeCompare(b)).map(([county_geoid, candidate_rows]) => ({ county_geoid, candidate_rows }));
  check(same(by_county, relation.counts.by_county), 'county membership counts');
  return { schema_version: RETAINED_CHILDCARE_COUNTY_COVERAGE_VERSION, rows, counts: structuredClone(relation.counts),
    source_cohorts: [...bySource.values()].sort((a, b) => a.dataset_id.localeCompare(b.dataset_id)),
    county_geoids: [...countySet].sort(), supported_county_geoids: [...supported].sort(), supported_state_fips: ['24', '42'],
    observation_basis: 'Original source provenance and license dates retained; county derivative creation is not source observation or freshness.',
    reported_geography_preserved: true, zip4_not_aggregated: true, ...claims() };
}

/** No production inputs can be replaced through this fixture-only calculation. */
export async function calculateSyntheticRetainedChildcareCountyCoverage(records, index, states, counties, options = {}) {
  const signal = signalOption(options), relation = await calculateSyntheticCountyRelationsV2(records, index, states, { signal });
  return { ...project(records, relation, counties), evidence_mode: 'synthetic-test', source_replay_verified: false };
}

export async function verifySyntheticRetainedChildcareCountyCoverage(report, records, index, states, counties, options = {}) {
  check(same(report, await calculateSyntheticRetainedChildcareCountyCoverage(records, index, states, counties, options)), 'synthetic source replay differs');
  return true;
}

/** Full read-only source/polygon replay; never publishes, enrolls or changes views. */
export async function loadRetainedChildcareCountyCoverage(options = {}) {
  const signal = signalOption(options), before = await metadata(signal);
  const replay = await loadRetainedCountyRelationsV2({ signal });
  check(same(replay, before.saved.report), 'county derivative does not replay');
  const descriptor = artifact(before.registry), meter = {}, records = [];
  for await (const row of readLines(path.join(APP_ROOT, path.dirname(pins.registry), descriptor.path), 200_000_000, signal, meter)) {
    check(records.length < 12206, 'candidate limit'); records.push(row);
  }
  check(meter.sha256 === descriptor.sha256 && meter.bytes === descriptor.bytes && meter.records === descriptor.record_count, 'retained candidate bytes');
  const countyArtifacts = before.geography.artifacts.filter(row => row.path === 'derived/index/counties.jsonl');
  check(countyArtifacts.length === 1, 'county index descriptor');
  const countyArtifact = countyArtifacts[0], countyMeter = {}, counties = [];
  for await (const row of readLines(path.join(APP_ROOT, path.dirname(COUNTY_RELATION_INPUTS.geography), countyArtifact.path), 2_000_000, signal, countyMeter)) {
    check(counties.length < 3235, 'county limit'); counties.push(row);
  }
  check(countyMeter.sha256 === countyArtifact.sha256 && countyMeter.bytes === countyArtifact.bytes && counties.length === 3235, 'county index bytes');
  const report = project(records, replay, counties);
  check(report.counts.candidate_rows === 12206 && report.counts.by_status['assigned-single-county'] === 6702
    && report.counts.by_status['missing-source-point'] === 4028 && report.counts.by_status['unknown-coordinate-system'] === 1476
    && report.source_cohorts.find(row => row.dataset_id === PA)?.assigned_rows === 4930
    && report.source_cohorts.find(row => row.dataset_id === MD)?.assigned_rows === 1772, 'retained cohort conservation');
  const after = await metadata(signal); check(same(before.bindings, after.bindings), 'bindings changed during replay');
  signal?.throwIfAborted();
  const result = { ...report, bindings: before.bindings, derivative_created_at: before.saved.created_at,
    evidence_mode: 'verified-retained-source-and-county-replay', source_replay_verified: true };
  contexts.set(result, structuredClone(result)); return result;
}

export async function verifyRetainedChildcareCountyCoverage(report, options = {}) {
  const signal = signalOption(options), expectedMetadata = await metadata(signal);
  check(same(report?.bindings, expectedMetadata.bindings), 'adapter rows or binding changed');
  const expected = await loadRetainedChildcareCountyCoverage(options);
  check(same(report, expected), 'adapter rows or binding changed');
  return { schema_version: RETAINED_CHILDCARE_COUNTY_COVERAGE_VERSION, source_replay_verified: true,
    candidate_rows: expected.counts.candidate_rows, ...claims() };
}

function metric(report, level, geoid) {
  const supported = level === 'county' ? report.supported_county_geoids.includes(geoid) : level === 'state' && report.supported_state_fips.includes(geoid);
  return { schema_version: RETAINED_CHILDCARE_COUNTY_COVERAGE_VERSION,
    candidate_rows: supported ? report.counts.by_county.reduce((sum, row) => sum + ((level === 'county' ? row.county_geoid === geoid : row.county_geoid.startsWith(geoid)) ? row.candidate_rows : 0), 0) : null,
    status: supported ? 'measured-selected-source-point-relationships' : 'unsupported-geography',
    denominator: 'selected retained source candidates, not all childcare businesses', derived_geography: true, ...claims() };
}
export function syntheticRetainedChildcareCountyMetric(report, level, geoid) {
  check(report.evidence_mode === 'synthetic-test', 'synthetic metric only'); return metric(report, level, geoid);
}

/** Compatibility checks alone do not grant a verified adapter context. */
export function validateRetainedChildcareCountyTargetViews(views, bindings) {
  const expected = {
    coverage_manifest: { path: bindings.coverage, release_id: bindings.coverage_release_id, sha256: bindings.coverage_sha256 },
    registry_manifest: { path: bindings.registry, release_id: bindings.registry_release_id, sha256: bindings.registry_sha256 },
    geography_manifest: { path: bindings.geography, release_id: bindings.geography_release_id, sha256: bindings.geography_sha256 },
  };
  check(same(views?.lineage, expected), 'target view-set lineage mismatch');
  const scopes = new Set(['registry-union', 'all-census-us-areas', '50-states-and-dc']);
  for (const [key, type, limit] of [['national', 'national', 3], ['states', 'state', 60], ['counties', 'county', 10000], ['zips', 'zip', 100000]]) {
    check(Array.isArray(views[key]) && views[key].length <= limit, 'target view bounds');
    const seen = new Set();
    for (const row of views[key]) {
      check(row?.schema_version === '1.0.0' && row.view_type === type
        && row.lineage?.registry_release_id === bindings.registry_release_id
        && row.lineage?.geography_release_id === bindings.geography_release_id
        && row.lineage?.transformation_version === 'national-business-coverage-views@2.11.0'
        && row.complete_all_businesses === false, 'target row lineage or contract mismatch');
      const id = type === 'national' ? row.scope : type === 'state' ? row.state_fips : type === 'county' ? row.county_geoid : row.zip_code;
      check(typeof id === 'string' && !seen.has(id), 'duplicate target scope'); seen.add(id);
      if (type === 'national') check(scopes.has(id), 'unsupported national scope');
      else check((type === 'state' ? /^\d{2}$/ : /^\d{5}$/).test(id), 'target geography identity');
      check(row.view_id === `${type}:${id}`, 'target view identity');
      if (type === 'county') check(row.state_fips === id.slice(0, 2), 'target county state mismatch');
    }
  }
  return true;
}

/** Copy-on-apply preparation only. Existing reported-state/ZIP fields are untouched. */
export function prepareRetainedChildcareCountyCoverageViews(context, views) {
  const verified = contexts.get(context); check(verified && same(verified, context), 'unverified or changed adapter context');
  validateRetainedChildcareCountyTargetViews(views, verified.bindings);
  const result = structuredClone(views);
  for (const [key, level] of [['counties', 'county'], ['states', 'state']]) {
    check(Array.isArray(result[key]) && result[key].length <= 10000, 'view bounds');
    const seen = new Set();
    for (const row of result[key]) {
      const geoid = level === 'county' ? row.county_geoid : row.state_fips;
      check(typeof geoid === 'string' && !seen.has(geoid), 'duplicate view geography'); seen.add(geoid);
      row.retained_childcare_derived_county_reporting = metric(verified, level, geoid);
    }
  }
  check(Array.isArray(result.national) && result.national.length <= 10, 'national view bounds');
  for (const row of result.national) row.retained_childcare_derived_county_reporting = {
    schema_version: RETAINED_CHILDCARE_COUNTY_COVERAGE_VERSION, counts: structuredClone(verified.counts),
    source_cohorts: structuredClone(verified.source_cohorts), derived_geography: true, ...claims() };
  return result;
}
