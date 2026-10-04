import path from 'node:path';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual as same } from 'node:util';
import { APP_ROOT } from './paths.mjs';
import { mnSelectionReadJson as readJson, mnSelectionReadLines as readLines } from './mn-construction-retained-selection.mjs';
import { readZipEntityResolutionEvidence, RELEASE as ZIP_ENTITY_RELEASE, RELEASE_SHA256 as ZIP_ENTITY_MANIFEST_SHA } from './zip-entity-resolution-evidence.mjs';
import { readExactZipIndustryEvidence, VERSION as ZIP_INDUSTRY_VERSION } from './national-exact-zip-industry-evidence-matrix.mjs';
import { readNationalBusinessTemporalClaimRows } from './national-business-temporal-claim-matrix-reader.mjs';
import { readNewestNationalGoalCompletionMatrix } from './national-goal-completion-view.mjs';
import { loadBroadOrganizationAuthorizationProgramManagementView } from './broad-organization-authorization-program-view.mjs';

export const NATIONAL_ZIP_GOAL_ACCEPTANCE_VERSION = 'national-zip-goal-acceptance@1.2.0';
export const NATIONAL_ZIP_GOAL_CLAIMS = Object.freeze(['report-only', 'complete-selected-census-zcta-denominator', 'source-reported-zip-membership', 'complete-current-usps-area-district-assignment-set', 'every-valid-usps-zip', 'every-active-business-by-valid-zip']);
const fail = message => { throw Error(`National ZIP goal acceptance rejected: ${message}.`); };
const check = (value, message) => { if (!value) fail(message); };
const count = value => Number.isSafeInteger(value) && value >= 0;
const hash = value => createHash('sha256').update(value).digest('hex');
const SHA = /^[a-f0-9]{64}$/;
const memberHash = values => hash([...values].sort().join('\n') + (values.size ? '\n' : ''));
const memberEvidence = values => ({ count: values.size, member_set_sha256: memberHash(values) });
const claims = () => ({ all_business_completion_percent: null, current_operating_business_count: null, public_export_authorized: false,
  zip4_separate: true, zip4_geometric: false, production_execution: false, publication_performed: false, network_requests: 0 });
function assignmentArtifactPath(sourceManifestPath, artifactPath) {
  const directory = path.posix.dirname(sourceManifestPath), expected = path.posix.join(directory, 'derived/operational-zip-assignments.jsonl');
  const resolved = path.posix.normalize(path.posix.join(directory, artifactPath));
  check(artifactPath === 'derived/operational-zip-assignments.jsonl' && resolved === expected && resolved.startsWith(`${directory}/`), 'USPS assignment artifact escapes immutable release');
  return resolved;
}
function validateAssignmentRow(row, sourceMonth, exportPolicy) {
  check(row?.schema_version === '1.0.0' && typeof row.zip_code === 'string' && /^\d{5}$/.test(row.zip_code)
    && row.assignment_status === 'listed-in-current-usps-area-district-file'
    && row.evidence_scope === 'operational-area-district-5-digit-zip-assignment'
    && row.deliverability_status === 'not-asserted' && row.zcta_status === 'not-asserted'
    && row.source_month === sourceMonth && row.export_policy === exportPolicy, 'invalid/widened USPS assignment row');
}
export const NATIONAL_ZIP_GOAL_ACCEPTANCE_TEST_HOOKS = Object.freeze({ assignmentArtifactPath, validateAssignmentRow });

function validateGoalReadinessBindings(value) {
  const entity = value?.bindings?.zip_entity_resolution, industry = value?.bindings?.zip_industry_matrix,
    temporal = value?.bindings?.temporal_claim_matrix, goal = value?.bindings?.goal_completion_matrix,
    broad = value?.bindings?.broad_organization_projection;
  check(entity?.claims?.entity_resolution_applied === false
    && entity.claims.benchmark_gate_passed === false
    && entity.release_id === 'zip-entity-resolution-evidence-576079155175db7c5abbedf9a81c5481c53294cfd74cfd23fa994b2decd67564'
    && entity.registration_sha256 === 'a99311cfc37b523a9a924555cceb21ab184c65d4192ad9dbe30a428e5da34c39'
    && entity.manifest_sha256 === '742ffc2d35cc3f4e5541cc2325879b2da563ae7565a9d86829e9ec20560277ba', 'ZIP entity-resolution evidence pin/semantics');
  check(industry?.version === ZIP_INDUSTRY_VERSION
    && industry.release_id === 'national-exact-zip-industry-evidence-matrix-e43119b66e4b5a8d3ea8cb628c00332ae321019965f2b1f98aebb366f95e2a0b'
    && industry.registration_sha256 === '45f620eed90dfb9b3ae2006354d8bcad656ea711112a5ecc8be2ec583904788b'
    && industry.manifest_sha256 === '41d3ac3b043317bd650ba2d79082ea24729c48d19a2137b627eec1e674db031d'
    && industry?.claims?.current_operation_verified === false
    && industry?.claims?.all_business_completeness === false
    && industry?.claims?.additive_cross_industry_total === false
    && industry?.industry_cells === 1879566, 'ZIP industry matrix semantic boundary');
  check(temporal?.release_id === 'national-business-temporal-claim-matrix-534d123499d07ec1beace832268a741fd2228897f222354905c43c2fb09d2090'
    && temporal.registration_sha256 === '65e7c8e5a3f32ee1a71f816f4aeb449c43925c924926ec6a1d777a727e19d738'
    && temporal.manifest_sha256 === '342691d68f76cc38bc8ce480266fd5d36be3c7f892d258b8bfde5be94417ed05'
    && temporal?.summary?.broad_state_dc_gaps === 40
    && temporal?.summary?.active_business_count === null
    && temporal?.claims?.current_operations_verified === false, 'temporal claim matrix semantic boundary');
  check(goal?.schema_version === 'national-goal-completion-matrix@1.3.0' && /^national-goal-completion-\d{14}-[a-f0-9]{8}$/.test(goal.release_id ?? '')
    && goal?.jurisdiction_count === 51 && goal?.broad_layer_gaps === 40 && goal?.all_business_completion_percent === null
    && SHA.test(goal.manifest_sha256 ?? '') && SHA.test(goal.report_sha256 ?? '') && goal.manifest_path.endsWith(`/${goal.release_id}/manifest.json`),
    'newest goal-completion matrix semantic boundary');
  check(broad?.metadata?.jurisdiction_count === 40
    && broad?.metadata?.gate_item_count === 371
    && broad?.metadata?.gate_readiness?.distinct_keys_classified === 121
    && broad?.metadata?.gate_readiness?.taxonomy_exhaustive === true
    && broad?.metadata?.gate_readiness?.readiness_uplift === false
    && broad?.authority?.acquisition_authorized === false
    && broad?.authority?.network_requests === 0
    && broad?.source_lineage?.source_matrix_release_id === goal.release_id
    && broad.source_lineage.source_matrix_manifest_sha256 === goal.manifest_sha256
    && broad.source_lineage.source_matrix_artifact_sha256 === goal.report_sha256
    && SHA.test(broad.source_lineage.program_manifest_sha256 ?? '') && SHA.test(broad.source_lineage.backlog_manifest_sha256 ?? '')
    && SHA.test(broad.source_lineage.assessment_catalog_sha256 ?? ''), 'broad organization readiness semantics');
  const ledger = value.requirements_ledger, expectedLedger = {
    geography: 'achieved', 'postal-denominator': 'blocked', 'source-authorization-policy-and-provenance': 'partial',
    'broad-state-coverage': 'blocked', 'industry-coverage': 'unmeasured', 'temporal-and-current-operation': 'blocked',
    'reconciliation-and-benchmark': 'blocked', 'all-business-completeness-denominator': 'unmeasured',
  };
  check(Array.isArray(ledger) && ledger.length === Object.keys(expectedLedger).length
    && ledger.every(row => row && expectedLedger[row.requirement] === row.status && typeof row.evidence === 'string' && row.evidence.length > 0)
    && Object.keys(expectedLedger).every(key => ledger.some(row => row.requirement === key)), 'closed objective requirements ledger');
  check(ledger.find(row => row.requirement === 'broad-state-coverage')?.current_gap_count === 40
    && value.acceptance_uplift === false && value.claims?.acceptance === false && value.claims?.report_only === true
    && value.claims?.network_requests === 0 && value.claims?.writes === 0 && value.claims?.pointers_changed === false,
    'objective readiness authority/coverage boundary');
  const blockerCodes = ['entity-resolution-benchmark-gate-not-passed', 'entity-resolution-not-applied',
    'nationwide-industry-universe-unmeasured', 'broad-jurisdiction-source-gaps', 'current-operation-not-independently-verified'];
  check(Array.isArray(value.blockers) && value.blockers.length === blockerCodes.length
    && blockerCodes.every(code => value.blockers.some(item => item.code === code))
    && value.blockers.find(item => item.code === 'broad-jurisdiction-source-gaps')?.count === 40,
    'closed objective blockers/count');
  for (const [id, evidence] of Object.entries(value.bindings ?? {}))
    check(evidence && typeof evidence.release_id === 'string' && SHA.test(evidence.manifest_sha256), `missing/malformed ${id} binding`);
  return true;
}
export const NATIONAL_ZIP_GOAL_ACCEPTANCE_READINESS_TEST_HOOKS = Object.freeze({ validateGoalReadinessBindings });

async function readObjectiveReadiness({ signal }) {
  signal?.throwIfAborted();
  const sampleZip = '00501';
  const [entity, industry, temporal, loadedGoal, broad] = await Promise.all([
    readZipEntityResolutionEvidence({ zip5: sampleZip, signal }),
    readExactZipIndustryEvidence({ zip5: sampleZip }),
    readNationalBusinessTemporalClaimRows({ signal }),
    readNewestNationalGoalCompletionMatrix(),
    loadBroadOrganizationAuthorizationProgramManagementView(),
  ]);
  const industryRegistration = await snapshot('config/datasets/national-exact-zip-industry-evidence-matrix.json', signal);
  const industryPin = industryRegistration.value.retained_release;
  check(industryRegistration.value.dataset_id === 'national-exact-zip-industry-evidence-matrix' && industryRegistration.value.runtime_pointer === null
    && industryRegistration.value.production_enrollment === false && industryPin?.release_id === industry.release_id
    && industryPin?.manifest_sha256 === industry.manifest_sha256 && industryPin?.zip5_rows === 48194
    && industryPin?.industry_cells === 1879566, 'registered industry-matrix release binding');
  check(entity.available && entity.registration_sha256 && entity.manifest_sha256 === '742ffc2d35cc3f4e5541cc2325879b2da563ae7565a9d86829e9ec20560277ba'
    && entity.evidence?.entity_resolution_applied === false && entity.evidence?.benchmark_gate_passed === false, 'registered ZIP entity-resolution evidence');
  check(industry.status === 'present' && industry.release_id === 'national-exact-zip-industry-evidence-matrix-e43119b66e4b5a8d3ea8cb628c00332ae321019965f2b1f98aebb366f95e2a0b'
    && industry.manifest_sha256 === '41d3ac3b043317bd650ba2d79082ea24729c48d19a2137b627eec1e674db031d'
    && industry.claims?.network_requests === 0 && industry.claims?.production_enrollment === false, 'registered ZIP industry matrix');
  check(temporal.rows.length === 30 && temporal.provenance?.release_id === 'national-business-temporal-claim-matrix-534d123499d07ec1beace832268a741fd2228897f222354905c43c2fb09d2090'
    && temporal.provenance?.manifest_sha256 === '342691d68f76cc38bc8ce480266fd5d36be3c7f892d258b8bfde5be94417ed05', 'selected temporal claim release');
  check(loadedGoal?.report?.schema_version === 'national-goal-completion-matrix@1.3.0'
    && loadedGoal.report.jurisdictions?.length === 51 && loadedGoal.report.all_business_completion_percent === null,
    'newest verified national goal-completion matrix');
  const broadLayerGaps = loadedGoal.report.jurisdictions.filter(state =>
    state.categories.find(category => category.category_id === 'general-business')?.datasets?.[0]?.availability_status !== 'available').length;
  const goalManifestRel = path.relative(APP_ROOT, loadedGoal.manifestPath).replaceAll('\\', '/');
  const goalManifest = await snapshot(goalManifestRel, signal);
  check(goalManifest.value.release_id === loadedGoal.report.release_id && goalManifest.value.network_requests === 0
    && goalManifest.value.production_pointers_changed === false, 'goal matrix manifest/report agreement');
  check(broad?.available === true && broad.source_lineage && broad.metadata?.gate_readiness?.taxonomy_exhaustive === true,
    'verified broad-organization gate readiness projection');
  const broadStateGapCount = broadLayerGaps;
  const temporalRegistration = await snapshot('config/datasets/national-business-temporal-claim-matrix.json', signal);
  const selected = temporalRegistration.value.retained_releases?.filter(row => row.selected === true) ?? [];
  check(selected.length === 1 && selected[0].release_id === temporal.provenance.release_id
    && selected[0].manifest_sha256 === temporal.provenance.manifest_sha256, 'temporal selected registration binding');
  const temporalClassCounts = temporal.rows.reduce((counts, row) => {
    check(['source-defined-current-membership', 'non-active-reporting-membership', 'annual-aggregate'].includes(row.classification), 'unknown temporal semantic classification');
    counts[row.classification] = (counts[row.classification] ?? 0) + 1; return counts;
  }, {});
  check(temporalClassCounts['source-defined-current-membership'] === 22
    && temporalClassCounts['non-active-reporting-membership'] === 7 && temporalClassCounts['annual-aggregate'] === 1,
    'temporal classification roster widened');
  const bindings = {
    zip_entity_resolution: { registration_path: 'config/datasets/zip-entity-resolution-evidence.json', registration_sha256: entity.registration_sha256,
      release_id: 'zip-entity-resolution-evidence-576079155175db7c5abbedf9a81c5481c53294cfd74cfd23fa994b2decd67564',
      manifest_path: 'data/zip-entity-resolution-evidence/releases/zip-entity-resolution-evidence-576079155175db7c5abbedf9a81c5481c53294cfd74cfd23fa994b2decd67564/manifest.json',
      manifest_sha256: entity.manifest_sha256, source_release_id: ZIP_ENTITY_RELEASE, source_manifest_sha256: ZIP_ENTITY_MANIFEST_SHA,
      claims: { entity_resolution_applied: entity.evidence.entity_resolution_applied, benchmark_gate_passed: entity.evidence.benchmark_gate_passed } },
    zip_industry_matrix: { registration_path: 'config/datasets/national-exact-zip-industry-evidence-matrix.json', registration_sha256: industryRegistration.evidence.sha256,
      release_id: industry.release_id, manifest_path: industryPin.manifest, manifest_sha256: industry.manifest_sha256, version: industry.schema_version,
      zip5_rows: industryPin.zip5_rows, industry_cells: industryPin.industry_cells, claims: industry.claims },
    temporal_claim_matrix: { registration_path: 'config/datasets/national-business-temporal-claim-matrix.json', registration_sha256: temporalRegistration.evidence.sha256,
      release_id: temporal.provenance.release_id, manifest_path: selected[0].manifest_path, manifest_sha256: temporal.provenance.manifest_sha256, rows: temporal.rows.length,
      classification_counts: temporalClassCounts, summary: temporal.summary, claims: temporal.claims,
      semantic_rows_sha256: hash(JSON.stringify(temporal.rows)) },
    goal_completion_matrix: { release_id: loadedGoal.report.release_id, manifest_path: goalManifestRel, manifest_sha256: goalManifest.evidence.sha256,
      report_sha256: goalManifest.value.artifacts?.[0]?.sha256, schema_version: loadedGoal.report.schema_version,
      jurisdiction_count: loadedGoal.report.jurisdictions.length, broad_layer_gaps: broadStateGapCount,
      all_business_completion_percent: loadedGoal.report.all_business_completion_percent },
    broad_organization_projection: { release_id: broad.metadata.release_id, manifest_sha256: broad.source_lineage.program_manifest_sha256,
      source_lineage: broad.source_lineage, metadata: broad.metadata, authority: broad.authority },
  };
  const readiness = { schema_version: 'national-zip-objective-readiness@1.0.0', assessment_as_of: '2026-10-02',
    acceptance_uplift: false, bindings, requirements_ledger: [
      { requirement: 'geography', status: 'achieved', evidence: 'Selected Census ZCTA index membership is verified; this is not an operational USPS ZIP denominator.' },
      { requirement: 'postal-denominator', status: 'blocked', evidence: 'No complete current USPS delivery-ZIP registry is established.' },
      { requirement: 'source-authorization-policy-and-provenance', status: 'partial', evidence: 'Selected retained releases and policy bindings are verified; operational/source use authority and complete source authorization remain unestablished.' },
      { requirement: 'broad-state-coverage', status: 'blocked', current_gap_count: broadStateGapCount, jurisdiction_count: 51, evidence: 'The newest verified goal matrix has unresolved broad-layer jurisdictions.' },
      { requirement: 'industry-coverage', status: 'unmeasured', zip5_rows: industryPin.zip5_rows, industry_cells: industryPin.industry_cells, evidence: 'ZIP industry dimensions exist, but the nationwide industry universe/denominator is not measured.' },
      { requirement: 'temporal-and-current-operation', status: 'blocked', source_defined_current_membership_sources: 22, non_active_reporting_sources: 7, annual_aggregate_sources: 1, verified_current_complete_jurisdictions: 0, evidence: 'Source classifications and reference clocks do not independently verify current operation.' },
      { requirement: 'reconciliation-and-benchmark', status: 'blocked', benchmark_gate_passed: false, entity_resolution_applied: false, evidence: 'ZIP linkage evidence is aggregate and unapplied; benchmark gate is not passed.' },
      { requirement: 'all-business-completeness-denominator', status: 'unmeasured', all_business_completion_percent: null, active_business_count: null, evidence: 'No verified national all-business denominator exists.' },
    ],
    blockers: [
      { code: 'entity-resolution-benchmark-gate-not-passed' },
      { code: 'entity-resolution-not-applied' },
      { code: 'nationwide-industry-universe-unmeasured' },
      { code: 'broad-jurisdiction-source-gaps', count: broadStateGapCount },
      { code: 'current-operation-not-independently-verified' },
    ],
    claims: { acceptance: false, report_only: true, network_requests: 0, writes: 0, releases_created: false, pointers_changed: false,
      current_operations_verified: false, all_business_completion_percent: null, public_export_authorized: false } };
  validateGoalReadinessBindings(readiness);
  return readiness;
}

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
function typedDescriptor(manifest, type, { records = false } = {}) {
  const values = manifest.artifacts.filter(row => row.artifact_type === type);
  check(values.length === 1 && count(values[0].bytes) && /^[a-f0-9]{64}$/.test(values[0].sha256)
    && (!records || count(values[0].record_count)), 'artifact descriptor');
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

async function verifyUspsProof(registry, denominator, registryRows, zctaMembers, contributionMembers, signal) {
  const dependencyRows = registry.manifest.value.dependencies?.filter(row => row.dataset_id === 'usps-operational-zip-assignments') ?? [];
  if (denominator === null) {
    check(dependencyRows.length === 0 && !(registry.manifest.value.artifacts ?? []).some(row => row.artifact_type === 'registry-zip5-evidence-reconciliation-json')
      && registryRows.every(row => row.current_usps_validity?.status === 'unverified'), 'unexpected USPS operational evidence without denominator');
    return { proof: null, evidence: {} };
  }
  check(dependencyRows.length === 1, 'USPS dependency cardinality');
  const dependencyRow = dependencyRows[0];
  check(denominator.dataset_id === dependencyRow.dataset_id && denominator.release_id === dependencyRow.release_id
    && count(denominator.count) && denominator.count > 0 && denominator.evidence_scope === 'current-usps-area-district-5-digit-zip-assignments'
    && denominator.address_level_deliverability_asserted === false
    && ['local-restricted', 'permission-governed'].includes(denominator.distribution_policy)
    && /^\d{4}-(?:0[1-9]|1[0-2])$/.test(denominator.source_month ?? '')
    && /^[a-f0-9]{64}$/.test(denominator.member_set_sha256 ?? '')
    && /^[a-f0-9]{64}$/.test(denominator.assignment_artifact_sha256 ?? ''), 'USPS denominator declaration');
  check(typeof dependencyRow.manifest_path_from_registry_release === 'string' && dependencyRow.manifest_path_from_registry_release, 'USPS dependency manifest path');
  const registryDirectory = path.posix.dirname(registry.manifest.evidence.path);
  const sourceManifestPath = path.posix.normalize(path.posix.join(registryDirectory, dependencyRow.manifest_path_from_registry_release));
  check(!sourceManifestPath.startsWith('../') && !path.posix.isAbsolute(sourceManifestPath), 'unsafe USPS dependency manifest path');
  const source = await snapshot(sourceManifestPath, signal);
  check(source.evidence.sha256 === dependencyRow.manifest_sha256 && source.value.dataset_id === dependencyRow.dataset_id
    && source.value.release_id === dependencyRow.release_id && source.value.source_month === denominator.source_month
    && source.value.schema_version === '1.0.0' && source.value.status === 'published-local-restricted'
    && source.value.complete_source_release === true && source.value.complete_current_area_district_assignment_file === true
    && source.value.complete_current_delivery_zip_registry === false
    && source.value.coverage?.current_area_district_zip_assignment_denominator === denominator.count
    && source.value.coverage_semantics?.included === 'ZIP appears in the current USPS-published AREADIST_ZIP5 Area/District assignment file.'
    && Array.isArray(source.value.coverage_semantics?.not_asserted)
    && source.value.coverage_semantics.not_asserted.includes('address-level deliverability')
    && source.value.coverage_semantics.not_asserted.includes('Census ZCTA polygon'), 'USPS dependency identity/hash/month/scope');
  const assignment = typedDescriptor(source.value, 'usps-operational-zip-assignment-jsonl', { records: true });
  check(assignment.path === 'derived/operational-zip-assignments.jsonl' && assignment.sha256 === denominator.assignment_artifact_sha256, 'USPS assignment artifact declaration');
  assignmentArtifactPath(sourceManifestPath, assignment.path);
  const expectedExportPolicy = source.value.use_authorization?.redistribution_authorized === true ? 'permission-governed' : 'local-restricted';
  check(expectedExportPolicy === denominator.distribution_policy, 'USPS assignment distribution policy');
  const sourceMembers = new Set();
  const assignmentEvidence = await rows({ manifest: source }, assignment, 200_000_000, signal, row => {
    validateAssignmentRow(row, denominator.source_month, expectedExportPolicy);
    check(!sourceMembers.has(row.zip_code), 'invalid/duplicate USPS assignment ZIP5');
    sourceMembers.add(row.zip_code);
  });
  check(sourceMembers.size === denominator.count && memberHash(sourceMembers) === denominator.member_set_sha256, 'USPS assignment member set');
  const listedMembers = new Set();
  for (const row of registryRows) {
    const validity = row.current_usps_validity;
    check(['listed-in-current-usps-area-district-file', 'not-listed-in-current-usps-area-district-file'].includes(validity?.status)
      && validity.deliverability_status === 'not-asserted' && validity.source_month === denominator.source_month
      && validity.export_policy === denominator.distribution_policy, 'registry USPS status semantics');
    if (validity.status === 'listed-in-current-usps-area-district-file') listedMembers.add(row.zip_code);
  }
  check(listedMembers.size === denominator.count && memberHash(listedMembers) === denominator.member_set_sha256, 'registry USPS listed member set');
  const reconciliationDescriptor = typedDescriptor(registry.manifest.value, 'registry-zip5-evidence-reconciliation-json');
  check(reconciliationDescriptor.path === 'derived/zip5-evidence-reconciliation.json'
    && reconciliationDescriptor.distribution_policy === 'local-restricted-aggregate-digests-only', 'USPS reconciliation declaration');
  const reconciliationPath = path.posix.join(registryDirectory, reconciliationDescriptor.path);
  const reconciliation = await snapshot(reconciliationPath, signal);
  check(reconciliation.evidence.sha256 === reconciliationDescriptor.sha256 && reconciliation.evidence.bytes === reconciliationDescriptor.bytes, 'USPS reconciliation bytes/hash');
  const zcta = zctaMembers;
  const set = values => new Set(values);
  const expected = {
    schema_version: 'zip5-evidence-reconciliation@1.0.0',
    semantics: { usps_assignment_is_address_deliverability: false, zcta_is_usps_delivery_geometry: false, zip4_is_geometric: false, business_coverage_is_complete: false },
    source: { dataset_id: denominator.dataset_id, release_id: denominator.release_id, manifest_sha256: dependencyRow.manifest_sha256,
      source_month: denominator.source_month, assignment_artifact_sha256: denominator.assignment_artifact_sha256, assignment_members: memberEvidence(sourceMembers) },
    registry_listed_members: memberEvidence(listedMembers), exact_usps_member_set_match: true,
    classes: {
      usps_and_zcta: memberEvidence(set([...listedMembers].filter(zip => zcta.has(zip)))),
      usps_without_zcta: memberEvidence(set([...listedMembers].filter(zip => !zcta.has(zip)))),
      zcta_without_usps: memberEvidence(set([...zcta].filter(zip => !listedMembers.has(zip)))),
      usps_with_record_level_contribution: memberEvidence(set([...listedMembers].filter(zip => contributionMembers.has(zip)))),
      usps_denominator_only: memberEvidence(set([...listedMembers].filter(zip => !contributionMembers.has(zip)))),
      source_reported_not_listed_usps: memberEvidence(set([...contributionMembers].filter(zip => !listedMembers.has(zip)))),
    },
    postal_contract: { zip5_rows: registryRows.length, postal_code_mismatches: 0, non_null_zip4_rows: 0 },
  };
  check(same(reconciliation.value, expected), 'USPS reconciliation content');
  return { proof: { verified: true, member_count: sourceMembers.size, member_set_sha256: memberHash(sourceMembers), source_month: denominator.source_month,
    source_dataset_id: denominator.dataset_id, source_release_id: denominator.release_id }, evidence: { usps_dependency_manifest: source.evidence,
      usps_assignment_membership: assignmentEvidence, usps_registry_reconciliation: reconciliation.evidence } };
}

function evaluate({ registry, coverage, geography, candidate, zctaMembers, zipMembers, contributionMembers, uspsProof = null, bindings, objectiveReadiness = null }, requestedClaim, mode) {
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
  check((denominator === null && uspsProof === null) || (denominator !== null && uspsProof?.verified === true
    && uspsProof.member_count === denominator.count && uspsProof.member_set_sha256 === denominator.member_set_sha256), 'USPS operational proof mismatch');
  const assignmentSetVerified = denominator !== null;
  const blockers = [
    ...(denominator === null ? ['authoritative-current-usps-denominator-unavailable'] : []),
  ];
  const universal = ['every-valid-usps-zip', 'every-active-business-by-valid-zip'].includes(requestedClaim);
  const assignmentClaim = requestedClaim === 'complete-current-usps-area-district-assignment-set';
  const activeBusiness = requestedClaim === 'every-active-business-by-valid-zip';
  const activeBlockers = activeBusiness ? [
    'complete-current-delivery-zip-registry-not-established',
    'all-business-universe-unmeasured',
    'current-business-operations-not-independently-verified',
    ...(objectiveReadiness?.blockers ?? []).map(item => item.code),
  ] : [];
  return {
    schema_version: NATIONAL_ZIP_GOAL_ACCEPTANCE_VERSION, evidence_mode: mode, bindings,
    ...(objectiveReadiness ? { objective_readiness: objectiveReadiness } : {}),
    requested_claim: requestedClaim, acceptance: { accepted: assignmentClaim ? assignmentSetVerified : !universal, blockers: assignmentClaim
      ? (assignmentSetVerified ? [] : blockers) : universal ? [...blockers, 'complete-current-delivery-zip-registry-not-established',
        ...(activeBusiness ? activeBlockers.slice(1) : [])] : [],
      blocker_details: activeBusiness ? [...(denominator === null ? [{ code: 'authoritative-current-usps-denominator-unavailable' }] : []),
        ...(objectiveReadiness?.blockers ?? [])] : [] },
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
      admission_status: assignmentSetVerified ? 'governed-area-district-assignment-set-exactly-reconciled' : 'not-admitted',
      member_set_verification: uspsProof, complete_current_area_district_assignment_set_accepted: assignmentSetVerified,
      every_valid_zip_completion_accepted: false, complete_current_delivery_zip_registry: false,
      scope: 'current USPS Area/District assignment-file membership only; not the complete delivery ZIP registry or address-level deliverability', blockers },
    verification_boundary: 'Exact current manifests, dependency hashes, Census ZCTA index, registry ZIP membership, and any governed USPS assignment dependency/reconciliation are replayed; coverage ZIP rows, polygon geometry and raw business sources are not replayed.',
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
  const objectiveReadiness = claim === 'every-active-business-by-valid-zip' ? await readObjectiveReadiness({ signal }) : null;
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
  const zctaMembers = new Set(), zipMembers = new Set(), contributionMembers = new Set(), registryRows = [];
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
    registryRows.push(row);
  });
  const denominator = registry.manifest.value.coverage?.authoritative_current_usps_zip_denominator ?? null;
  const usps = await verifyUspsProof(registry, denominator, registryRows, zctaMembers, contributionMembers, signal);
  const bindings = { registry_pointer: registry.pointer.evidence, registry_manifest: registry.manifest.evidence,
    coverage_pointer: coverage.pointer.evidence, coverage_manifest: coverage.manifest.evidence,
    geography_pointer: geography.pointer.evidence, geography_manifest: geography.manifest.evidence,
    usps_candidate_catalog: candidate.evidence, zcta_index: zctaEvidence, registry_zip_membership: zipEvidence, ...usps.evidence };
  // Reject pointer/catalog/manifest changes over the membership scan.
  for (const item of [registry.pointer, registry.manifest, coverage.pointer, coverage.manifest, geography.pointer, geography.manifest, candidate]) {
    const after = await snapshot(item.evidence.path, signal); check(same(after.evidence, item.evidence), 'evidence changed during acceptance check');
  }
  signal?.throwIfAborted();
  return evaluate({ registry: registry.manifest.value, coverage: coverage.manifest.value, geography: geography.manifest.value,
    candidate: candidate.value, zctaMembers, zipMembers, contributionMembers, uspsProof: usps.proof, bindings, objectiveReadiness }, claim, 'retained-current-source-membership');
}
