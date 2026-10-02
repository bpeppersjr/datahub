import path from 'node:path';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual as same } from 'node:util';
import { APP_ROOT } from './paths.mjs';
import { mnSelectionReadJson as readJson, mnSelectionReadLines as readLines } from './mn-construction-retained-selection.mjs';

export const NATIONAL_ZIP_GOAL_ACCEPTANCE_VERSION = 'national-zip-goal-acceptance@1.0.0';
export const NATIONAL_ZIP_GOAL_CLAIMS = Object.freeze(['report-only', 'complete-selected-census-zcta-denominator', 'source-reported-zip-membership', 'every-valid-usps-zip', 'every-active-business-by-valid-zip']);
const fail = message => { throw Error(`National ZIP goal acceptance rejected: ${message}.`); };
const check = (value, message) => { if (!value) fail(message); };
const count = value => Number.isSafeInteger(value) && value >= 0;
const hash = value => createHash('sha256').update(value).digest('hex');
const memberHash = values => hash([...values].sort().join('\n') + (values.size ? '\n' : ''));
const claims = () => ({ all_business_completion_percent: null, current_operating_business_count: null, public_export_authorized: false,
  zip4_separate: true, zip4_geometric: false, production_execution: false, publication_performed: false, network_requests: 0 });

async function snapshot(relative, signal) {
  check(typeof relative === 'string' && !path.isAbsolute(relative) && relative.split('/').every(part => part && part !== '.' && part !== '..') && !relative.includes('\\'), 'unsafe evidence path');
  const meter = {}, value = await readJson(path.join(APP_ROOT, relative), 4_000_000, signal, meter);
  return { value, evidence: { path: relative, sha256: meter.sha256, bytes: meter.bytes } };
}
async function current(folder, datasetId, signal) {
  const pointer = await snapshot(`data/${folder}/current.json`, signal);
  check(pointer.value.dataset_id === datasetId && /^releases\/[a-zA-Z0-9-]+\/manifest\.json$/.test(pointer.value.manifest), 'current pointer');
  const manifest = await snapshot(`data/${folder}/${pointer.value.manifest}`, signal);
  check(manifest.value.dataset_id === datasetId && manifest.value.release_id === pointer.value.release_id, 'pointer release agreement');
  return { pointer, manifest };
}
function dependency(manifest, source, repeatedIdentical = false) {
  const values = manifest.dependencies.filter(row => row.dataset_id === source.manifest.value.dataset_id);
  check(values.length > 0 && (values.length === 1 || repeatedIdentical) && values.every(value => same(value, values[0])
    && value.release_id === source.manifest.value.release_id && value.manifest_sha256 === source.manifest.evidence.sha256), 'dependency release/hash mismatch');
}
function descriptor(manifest, filename) {
  const values = manifest.artifacts.filter(row => row.path === filename);
  check(values.length === 1 && count(values[0].record_count) && count(values[0].bytes) && /^[a-f0-9]{64}$/.test(values[0].sha256), 'artifact descriptor');
  return values[0];
}
async function rows(source, artifact, cap, signal, consume) {
  const meter = {};
  for await (const row of readLines(path.join(APP_ROOT, path.posix.dirname(source.manifest.evidence.path), artifact.path), cap, signal, meter)) {
    check(meter.records <= 100000, 'ZIP/index row limit'); consume(row);
  }
  check(meter.sha256 === artifact.sha256 && meter.bytes === artifact.bytes && meter.records === artifact.record_count, 'artifact bytes/hash/count');
  return { path: path.posix.join(path.posix.dirname(source.manifest.evidence.path), artifact.path), sha256: meter.sha256, bytes: meter.bytes, record_count: meter.records };
}

function evaluate({ registry, coverage, geography, candidate, zctaMembers, zipMembers, contributionMembers, bindings }, requestedClaim, mode) {
  check(NATIONAL_ZIP_GOAL_CLAIMS.includes(requestedClaim), 'unknown completion claim');
  check([zctaMembers, zipMembers, contributionMembers].every(values => values instanceof Set && values.size <= 100000
    && [...values].every(zip => typeof zip === 'string' && /^\d{5}$/.test(zip)))
    && [...contributionMembers].every(zip => zipMembers.has(zip)), 'invalid membership sets');
  const spatial = coverage.spatial_zip_polygon_denominator, g = geography.coverage, c = coverage.coverage, r = registry.coverage;
  check(geography.complete_national_release === true && count(g.zctas) && g.zctas > 0 && g.source_available_counts.zctas === g.zctas, 'incomplete selected Census release');
  check(spatial.geography_type === 'census-zcta5' && spatial.zip4_polygon_applicability === 'not-applicable'
    && spatial.count === g.zctas && zctaMembers.size === g.zctas && c.spatial_zip_polygon_denominator_count === g.zctas
    && c.zip_views_with_zcta_polygon === g.zctas && spatial.zcta_member_set_sha256 === memberHash(zctaMembers), 'Census spatial denominator mismatch');
  check(registry.complete_national_business_registry === false && coverage.complete_all_businesses === false, 'unsupported all-business completion assertion');
  check(candidate.dataset_id === 'usps-city-state-operational-denominator-candidate' && typeof candidate.production_admission === 'boolean', 'USPS candidate contract');
  check(Object.hasOwn(r, 'authoritative_current_usps_zip_denominator') && Object.hasOwn(coverage, 'authoritative_current_usps_zip_denominator')
    && same(r.authoritative_current_usps_zip_denominator, coverage.authoritative_current_usps_zip_denominator), 'USPS denominator declaration mismatch');
  check(zipMembers.size === r.zip_union_records && zipMembers.size === c.zip_views
    && contributionMembers.size === r.zips_with_record_level_contributions && contributionMembers.size === c.zip_views_with_record_level_source_contribution
    && zipMembers.size - contributionMembers.size === c.zip_views_without_record_level_source_contribution
    && [...zctaMembers].every(zip => zipMembers.has(zip))
    && zipMembers.size - zctaMembers.size === c.zip_views_without_zcta_polygon, 'ZIP membership/count reconciliation');
  const denominator = r.authoritative_current_usps_zip_denominator;
  // A future non-null denominator or admission flag alone is still insufficient:
  // this version does not verify authoritative operational member-set coverage.
  const blockers = [
    ...(denominator === null ? ['authoritative-current-usps-denominator-unavailable'] : []),
    ...(!candidate.production_admission ? ['usps-candidate-not-production-admitted'] : []),
    'authoritative-operational-member-set-coverage-not-verified',
  ];
  const universal = ['every-valid-usps-zip', 'every-active-business-by-valid-zip'].includes(requestedClaim);
  return {
    schema_version: NATIONAL_ZIP_GOAL_ACCEPTANCE_VERSION, evidence_mode: mode, bindings,
    requested_claim: requestedClaim, acceptance: { accepted: !universal, blockers: universal ? [...blockers,
      ...(requestedClaim === 'every-active-business-by-valid-zip' ? ['all-business-universe-unmeasured', 'current-operations-not-independently-verified'] : [])] : [] },
    census_zcta_spatial_denominator: { count: zctaMembers.size, source_available_count: g.source_available_counts.zctas,
      complete_selected_index_membership: true, manifest_declares_complete_polygon_release: true,
      member_set_sha256: memberHash(zctaMembers), source_vintage: spatial.source_vintage,
      scope: 'selected Census ZCTA5 polygon release only; not operational USPS ZIPs', polygon_geometry_bytes_replayed: false },
    source_reported_zip_membership: { zip_union_count: zipMembers.size, zip_union_member_set_sha256: memberHash(zipMembers),
      with_record_level_source_contribution: contributionMembers.size, contribution_member_set_sha256: memberHash(contributionMembers),
      denominator_only_count: zipMembers.size - contributionMembers.size, outside_selected_zcta_count: zipMembers.size - zctaMembers.size,
      includes_explicit_00000_placeholder: zipMembers.has('00000'), operational_zip_validity_verified: false,
      scope: 'retained five-digit source/denominator union; source contribution is not USPS validity or active-business proof' },
    authoritative_current_operational_usps_zip_denominator: { denominator, candidate_production_admission: candidate.production_admission,
      admission_status: candidate.production_admission ? 'declared-admitted-but-operational-membership-not-verified-by-this-contract' : 'not-admitted',
      every_valid_zip_completion_accepted: false, blockers },
    verification_boundary: 'Exact current manifests, dependency hashes, Census ZCTA index and registry ZIP membership replay; coverage ZIP rows, polygon geometry and raw business sources are not replayed.',
    ...claims(),
  };
}

/** Synthetic evidence seam; cannot read files or establish a production proof. */
export function evaluateNationalZipGoalAcceptanceFixture(input, requestedClaim = 'report-only') {
  return evaluate(input, requestedClaim, 'synthetic-fixture-only');
}

/** Fixed read-only evidence selection: no publisher, enrollment or fallback acquisition. */
export async function readNationalZipGoalAcceptance({ signal, claim = 'report-only' } = {}) {
  signal?.throwIfAborted(); check(NATIONAL_ZIP_GOAL_CLAIMS.includes(claim), 'unknown completion claim');
  const registry = await current('business-registry', 'national-business-registry', signal);
  const coverage = await current('business-coverage-views', 'national-business-coverage-views', signal);
  const geography = await current('geography', 'us-census-geography', signal);
  const candidate = await snapshot('config/datasets/usps-city-state-operational-denominator-candidate.json', signal);
  dependency(coverage.manifest.value, registry); dependency(coverage.manifest.value, geography);
  // The current source-preserving registry repeats identical geography dependencies.
  dependency(registry.manifest.value, geography, true);
  const spatial = coverage.manifest.value.spatial_zip_polygon_denominator;
  check(spatial.release_id === geography.manifest.value.release_id && spatial.geography_manifest_sha256 === geography.manifest.evidence.sha256, 'spatial geography pin');
  const zctaArtifact = descriptor(geography.manifest.value, 'derived/index/zctas.jsonl');
  check(spatial.zcta_index_artifact_path === zctaArtifact.path && spatial.zcta_index_artifact_sha256 === zctaArtifact.sha256, 'spatial index pin');
  const zctaMembers = new Set(), zipMembers = new Set(), contributionMembers = new Set();
  const zctaEvidence = await rows(geography, zctaArtifact, 50_000_000, signal, row => {
    check(typeof row.geoid === 'string' && /^\d{5}$/.test(row.geoid) && !zctaMembers.has(row.geoid), 'duplicate/invalid Census ZCTA');
    zctaMembers.add(row.geoid);
  });
  const zipEvidence = await rows(registry, descriptor(registry.manifest.value, 'derived/zip-coverage.jsonl'), 1_000_000_000, signal, row => {
    check(typeof row.zip_code === 'string' && /^\d{5}$/.test(row.zip_code) && !zipMembers.has(row.zip_code)
      && row.postal_code === row.zip_code && row.zip4 === null && row.registry_coverage?.complete_all_businesses === false, 'duplicate/invalid or joined ZIP row');
    check(['record-level-source-contribution', 'denominator-only-no-record-level-contribution'].includes(row.registry_coverage.status), 'unknown ZIP evidence status');
    zipMembers.add(row.zip_code);
    if (row.registry_coverage.status === 'record-level-source-contribution') contributionMembers.add(row.zip_code);
  });
  const bindings = { registry_pointer: registry.pointer.evidence, registry_manifest: registry.manifest.evidence,
    coverage_pointer: coverage.pointer.evidence, coverage_manifest: coverage.manifest.evidence,
    geography_pointer: geography.pointer.evidence, geography_manifest: geography.manifest.evidence,
    usps_candidate_catalog: candidate.evidence, zcta_index: zctaEvidence, registry_zip_membership: zipEvidence };
  // Reject pointer/catalog/manifest changes over the membership scan.
  for (const item of [registry.pointer, registry.manifest, coverage.pointer, coverage.manifest, geography.pointer, geography.manifest, candidate]) {
    const after = await snapshot(item.evidence.path, signal); check(same(after.evidence, item.evidence), 'evidence changed during acceptance check');
  }
  signal?.throwIfAborted();
  return evaluate({ registry: registry.manifest.value, coverage: coverage.manifest.value, geography: geography.manifest.value,
    candidate: candidate.value, zctaMembers, zipMembers, contributionMembers, bindings }, claim, 'retained-current-source-membership');
}
