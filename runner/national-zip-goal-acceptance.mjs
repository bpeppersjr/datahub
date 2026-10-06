import path from 'node:path';
import { createHash } from 'node:crypto';
import { open, lstat, realpath } from 'node:fs/promises';
import { isDeepStrictEqual as same } from 'node:util';
import { APP_ROOT } from './paths.mjs';
import { mnSelectionReadJson as readJson, mnSelectionReadLines as readLines } from './mn-construction-retained-selection.mjs';
import { readZipEntityResolutionEvidence, RELEASE as ZIP_ENTITY_RELEASE, RELEASE_SHA256 as ZIP_ENTITY_MANIFEST_SHA } from './zip-entity-resolution-evidence.mjs';
import { readExactZipIndustryEvidenceV29 } from './national-exact-zip-industry-evidence-matrix-v2-9-reader.mjs';
import { readExactZipIndustryEvidenceWithTemporalQualificationV29 } from './exact-zip-industry-temporal-qualification-v2-9.mjs';
import { readExactZipIndustrySummaryV29 } from './exact-zip-industry-summary-v2-9.mjs';
const ZIP_INDUSTRY_VERSION = 'national-exact-zip-industry-evidence-row@2.9.0';
import { readNationalBusinessTemporalClaimRows } from './national-business-temporal-claim-matrix-reader.mjs';
import { verifyNationalBusinessTemporalLifecycleReconciliation } from './national-business-temporal-lifecycle-reconciliation.mjs';
import { verifyNationalBusinessTemporalLifecycleReconciliationV11 } from './national-business-temporal-lifecycle-reconciliation-v1-1.mjs';
import { verifyNationalBusinessSourceStatusPosture } from './national-business-source-status-posture.mjs';
import { verifyNationalBusinessCoRegistrationStatusPosture } from './national-business-co-registration-status-posture.mjs';
import { readNewestNationalGoalCompletionMatrix } from './national-goal-completion-view.mjs';
import { loadBroadOrganizationAuthorizationProgramManagementView } from './broad-organization-authorization-program-view.mjs';
import { readBusinessEntityLifecycleEligibilitySummary } from './business-entity-lifecycle-eligibility.mjs';
import { readReportingOnlySiteQualification, verifyReportingOnlySiteQualification } from './reporting-only-site-qualification.mjs';
import { readBusinessEntitySourcePolicyProvenance } from './business-entity-source-policy-provenance.mjs';

export const NATIONAL_ZIP_GOAL_ACCEPTANCE_VERSION = 'national-zip-goal-acceptance@1.7.0';
const REPORTING_SITES = Object.freeze({ registration_path: 'config/datasets/reporting-only-site-qualification.json',
  registration_sha256: '0eb4e02a94d3618362b2d9fbc0f58c34a826481befbafbc0655a8a0a69b049ba',
  release_id: 'reporting-only-site-qualification-a125bbeb43928016c7d0abf7259572f9e248f85f22f997bf8572b503ff3e4fce',
  manifest_sha256: 'e3e62ff1ad7d05c9fdfaf51e93783effb07d738a1f2236128183229c08b95e83',
  artifact_sha256: 'c4d882b146cdd06f0817744ffa92ce8c9d9bf6b36dd5326aa1c10286953144ab', record_count: 13182 });
const REPORTING_SOURCE_PINS = Object.freeze({
  MA: { source_id: 'ma-licensed-center-based-childcare', release_id: 'ma-childcare-2fd11c60-e9e8-488f-8693-f44bd03582d6',
    source_release_id: 'ma-childcare-c6b4990deeedb98fb2bc384c420b2fe3c0d37892398f1596d11ca077ed2e80b5', manifest_path: 'data/industry-segments/runs/ma-app-acquisition-20260907-02/state-ma-childcare-MA/releases/ma-childcare-2fd11c60-e9e8-488f-8693-f44bd03582d6/manifest.json', manifest_sha256: 'c6d811e5743a03d7126d1e34b3763f4c1acbd495a5b4cf68f82c716c50fba1fc',
    policy_id: 'massgis-eec-childcare-local-review', policy_profile: 'massgis-eec-childcare-local-review@1.0.0', policy_profile_path: 'config/source-policies/massgis-eec-childcare-local-review.json',
    policy_profile_sha256: '8a2812e436c3b2bc9c4c88dd2299d406b8d8610cd88f851a9f5f664fa43a4742', source_manifest_policy_sha256: 'bc5877f6f0b12a875e59464a71814ce7395e2cd8d292abae57e42f93086d8201',
    transformation_version: 'ma-childcare-normalization@1.0.0', observed_at: '2026-09-07T19:10:25.331Z' },
  NJ: { source_id: 'nj-licensed-childcare-centers', release_id: 'nj-childcare-c79b679e-3267-4238-b4c6-6b43dbef9812',
    source_release_id: 'nj-childcare-a9ed3d970922f919cee26a93310677b81a8319ae6ce960d83b34f607fec34f69', manifest_path: 'data/business-sources/nj-licensed-childcare-centers-reprocessed/releases/nj-childcare-c79b679e-3267-4238-b4c6-6b43dbef9812/manifest.json', manifest_sha256: 'b873a912c61e1cc13b53bac9ad6265380625344e3d9bb7795217913b8632049e',
    policy_id: 'njdep-childcare-local-review', policy_profile: 'njdep-childcare-local-review@1.0.0', policy_profile_path: 'config/source-policies/njdep-childcare-local-review.json',
    policy_profile_sha256: '3a935abc814e7f46e6048bdb20ec25c67b3a70aa4cfb81b0d9494a35c9cb26cc', source_manifest_policy_sha256: '79c0957df9fcdc66a856e5a6c242e24ef0296179eb93e4c8b298a32df2f61410',
    transformation_version: 'nj-childcare-normalization@1.0.1', observed_at: '2026-09-07T20:05:27.313Z' },
  TN: { source_id: 'tn-dhs-active-childcare-centers', release_id: 'tn-childcare-recovered-307bc79c-4f4f-4c77-a349-73dfd9fb1801',
    source_release_id: 'tn-childcare-a142397a0b6418ee017226d981d89314c54f17cd2ee03decd3337065260bb2c7', manifest_path: 'data/business-sources/tn-dhs-active-childcare-centers-recovered/releases/tn-childcare-recovered-307bc79c-4f4f-4c77-a349-73dfd9fb1801/manifest.json', manifest_sha256: '98234ee44e52e9fcf8cdecfb1812b49029a2444316832df95f90b18518ffa55d',
    policy_id: 'tn-childcare-local-review', policy_profile: 'tn-childcare-local-review@1.0.0', policy_profile_path: 'config/source-policies/tn-childcare-local-review.json',
    policy_profile_sha256: '06b8b84549c26d2e3bcabdb89244463ef5fbd525c88170aab548b42267e1110e', source_manifest_policy_sha256: '78300cd344afafd62d3a662a30d913871bd3fbd96cb59b03793e11b0b60f3b1b',
    transformation_version: 'tn-childcare-normalization@1.0.1', observed_at: '2026-09-08T00:36:36.628Z' },
  OH: { source_id: 'oh-dcy-publisher-open-childcare-centers', release_id: 'oh-childcare-c253c884-2048-47f9-8d7f-5ed29531acee',
    source_release_id: 'oh-childcare-2c38df58d6d977c7e93a26d6b1e730e7850ec893b6f5a947b76d5060e1cc6e4b', manifest_path: 'data/industry-segments/runs/bd35c825-a6d0-4922-8508-7954ce00f5d5/state-oh-childcare-OH/normalized/releases/oh-childcare-c253c884-2048-47f9-8d7f-5ed29531acee/manifest.json', manifest_sha256: 'e4de0ed529da81c09522c52b9990b41a1edad1adf906f9eea2b95363ff241171',
    policy_id: 'oh-childcare-local-review', policy_profile: 'oh-childcare-local-review@1.0.0', policy_profile_path: 'config/source-policies/oh-childcare-local-review.json',
    policy_profile_sha256: 'f1aa0c95eb96ba2cb6d10e75ded2011890cea61816d7b8b337ef1081dda4b6e2', source_manifest_policy_sha256: '53ead19c9463f270ed5def5eb0f848e46d3288d2a59844c53a8b317cad0b5c98',
    transformation_version: 'oh-childcare-normalization@1.0.0', observed_at: '2026-09-08T08:31:19.971Z' },
});
export const NATIONAL_ZIP_GOAL_CLAIMS = Object.freeze(['report-only', 'complete-selected-census-zcta-denominator', 'source-reported-zip-membership', 'complete-current-usps-area-district-assignment-set', 'every-valid-usps-zip', 'every-active-business-by-valid-zip']);
const fail = message => { throw Error(`National ZIP goal acceptance rejected: ${message}.`); };
const check = (value, message) => { if (!value) fail(message); };
const count = value => Number.isSafeInteger(value) && value >= 0;
const hash = value => createHash('sha256').update(value).digest('hex');
const SHA = /^[a-f0-9]{64}$/;
const GEOGRAPHY_RELATIONSHIP = Object.freeze({
  registration_path: 'config/datasets/business-entity-geography-relationship.json',
  registration_sha256: 'bc81d33b80a92da55f31713d36813807e7224da599ab24aa3898522b338f5829',
  release_id: 'business-entity-geography-relationship-99d70051979cb4d4e116b832994daef87f84ab919d6392f4fa9e98ea3798f8d7',
  manifest_path: 'data/business-entity-geography-relationship/releases/business-entity-geography-relationship-99d70051979cb4d4e116b832994daef87f84ab919d6392f4fa9e98ea3798f8d7/manifest.json',
  manifest_sha256: '07e561938b2d027f0c1586e5db1a2b775f7680d486e75dfb4e99b399cc0bbaa2',
  artifact_inventory_sha256: 'ca92485cf7659fc8f4565fe81de5728c960de9667f9b5c605f66c9e07d24a5f5',
  artifact_count: 100,
  profile_count: 8011835,
});
const GEO_POINT_COUNTS = Object.freeze({ 'assigned-single-county': 372079, unmatched: 21, ambiguous: 7, conflict: 0,
  'missing-geocode': 6976397, 'invalid-coordinate': 0, 'unassignable-legacy-coordinate-crs-unproven': 640383,
  'unassignable-coordinate-not-premise-point': 22948 });
const GEO_POSTAL_COUNTS = Object.freeze({ 'same-code-zcta-candidate': 7963395, 'outside-zcta': 48439, 'explicit-placeholder': 1, missing: 0 });
const memberHash = values => hash([...values].sort().join('\n') + (values.size ? '\n' : ''));
const memberEvidence = values => ({ count: values.size, member_set_sha256: memberHash(values) });
const claims = () => ({ all_business_completion_percent: null, current_operating_business_count: null, public_export_authorized: false,
  zip4_separate: true, zip4_geometric: false, production_execution: false, publication_performed: false, network_requests: 0 });
export function lifecycleActiveEligibilityEstablished(value) {
  const profiles = value?.profile_count;
  return value?.release_manifest_verified === true && count(profiles) && profiles > 0 && value?.registry_profile_count === profiles
    && value?.active_business_eligible_count === profiles
    && value?.current_operation_verified_count === profiles
    && value?.review_status_counts?.stale === 0 && value?.review_status_counts?.unmeasured === 0
    && value?.review_status_counts?.unmapped === 0 && value?.lifecycle_evidence_counts?.unknown === 0
    && value?.lifecycle_evidence_counts?.contradictory === 0;
}
export function activeBusinessResolutionGateEstablished(lifecycle, entityResolution) {
  return lifecycleActiveEligibilityEstablished(lifecycle)
    && entityResolution?.entity_resolution_applied === true && entityResolution?.benchmark_gate_passed === true;
}
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

const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;

function validateGeographyRelationshipBinding(value) {
  const artifacts = value?.artifacts;
  check(value?.registration_path === GEOGRAPHY_RELATIONSHIP.registration_path
    && value.registration_sha256 === GEOGRAPHY_RELATIONSHIP.registration_sha256
    && value.release_id === GEOGRAPHY_RELATIONSHIP.release_id
    && value.manifest_path === GEOGRAPHY_RELATIONSHIP.manifest_path
    && value.manifest_sha256 === GEOGRAPHY_RELATIONSHIP.manifest_sha256
    && value.artifact_inventory_sha256 === GEOGRAPHY_RELATIONSHIP.artifact_inventory_sha256
    && value.artifact_count === GEOGRAPHY_RELATIONSHIP.artifact_count
    && value.profile_count === GEOGRAPHY_RELATIONSHIP.profile_count
    && value.registry_profile_count === GEOGRAPHY_RELATIONSHIP.profile_count
    && Array.isArray(artifacts) && artifacts.length === GEOGRAPHY_RELATIONSHIP.artifact_count
    && hash(JSON.stringify(canonical(artifacts))) === GEOGRAPHY_RELATIONSHIP.artifact_inventory_sha256,
  'business entity geography registration/release/inventory binding');
  let records = 0;
  for (let index = 0; index < artifacts.length; index++) {
    const artifact = artifacts[index], zip2 = String(index).padStart(2, '0');
    check(artifact && same(Object.keys(artifact).sort(), ['artifact_type', 'bytes', 'path', 'record_count', 'sha256', 'uncompressed_bytes', 'uncompressed_sha256'])
      && artifact.artifact_type === 'business-entity-geography-relationship-jsonl-gzip'
      && artifact.path === `relationships/zip2=${zip2}.jsonl.gz`
      && count(artifact.bytes) && artifact.bytes > 0 && count(artifact.uncompressed_bytes) && artifact.uncompressed_bytes > 0
      && count(artifact.record_count) && SHA.test(artifact.sha256) && SHA.test(artifact.uncompressed_sha256),
    'business entity geography shard descriptor');
    records += artifact.record_count;
  }
  check(records === GEOGRAPHY_RELATIONSHIP.profile_count
    && same(value.postal_counts, GEO_POSTAL_COUNTS) && same(value.point_assignment_counts, GEO_POINT_COUNTS)
    && value.reported_state_conflict_count === 11
    && value.claims?.current_operation_verified === false && value.claims?.postal_validity_verified === false
    && value.claims?.entity_polygon_present === false && value.claims?.zcta_point_assignment_performed === false
    && value.claims?.network_requests === 0 && value.claims?.source_acquisition_performed === false
    && value.claims?.source_bytes_modified === false && value.claims?.current_pointer_written === false
    && value.claims?.production_enrollment === false && value.claims?.production_execution === false
    && value.semantics?.usps_operational_assignment_verified === false && value.semantics?.usps_deliverability_verified === false
    && value.semantics?.same_code_zcta_is_membership === false && value.semantics?.zcta_point_assignment_performed === false
    && value.semantics?.entity_polygons_present === false,
  'business entity geography summary/claims semantics');
  check(value.upstream?.registry_release_id === 'national-business-registry-20260911-022652067Z-1ec656c3'
    && value.upstream.registry_manifest_sha256 === 'd8ab131697b1df63ed53fdfa9832d6973fd152ddf23565219ee9bb39b25fbb76'
    && value.upstream.geography_release_id === 'us-census-geography-20260830-132803990Z-3629abc0'
    && value.upstream.geography_manifest_sha256 === '5426cae150c0fba64f8ff43a48ca39c4e78b5b4ba8a8007fbd211615540d1c8b'
    && value.upstream.crosswalk_release_id === 'us-census-zcta-jurisdiction-crosswalk-20260830-222631137Z-4b9227f8'
    && value.upstream.crosswalk_manifest_sha256 === '02e19bd98ad587426628cd50013942acc0cc3e9c9a48ac653eaf96cf534b8fe2'
    && value.upstream.zip_audit_release_id === 'zip-denominator-gap-cohort-20261003072243230-9f1be37aa2eb'
    && value.upstream.zip_audit_manifest_sha256 === '792361841d937a508d0243b22cf3c7b3fe67e32d2749adadca299ad59c21f8ea'
    && value.upstream.zip_quality_release_id === 'registry-zip-quality-index-4b454f2383f5932e9cb89734e2c120ed7ec85276cc43f5e8fa65409583d4e430'
    && value.upstream.zip_quality_manifest_sha256 === '1ecbc4cb23d59e584d4528a4f65c23ed9fe4f658e134864416731fc48130941c'
    && value.upstream.point_assignment_release_id === 'national-business-coverage-views-20260911-040908332Z-f01c882a'
    && value.upstream.point_assignment_manifest_sha256 === 'f15d43dda3acfb2e81fe2cd0360ec8dfba9f3061597c62c2eb8d1953bdc706b6'
    && value.upstream.point_assignment_summary_sha256 === 'c9d9a8d3dd60cdcf6c734c3d2e327997c8c945260165a976e7cb2b0bfa284f0d',
  'business entity geography upstream lineage');
  return true;
}

function validateReportingOnlySiteBinding(value) {
  check(value?.registration_path === REPORTING_SITES.registration_path
    && value.registration_sha256 === REPORTING_SITES.registration_sha256
    && value.release_id === REPORTING_SITES.release_id && value.manifest_sha256 === REPORTING_SITES.manifest_sha256
    && value.artifact_sha256 === REPORTING_SITES.artifact_sha256 && value.record_count === REPORTING_SITES.record_count
    && value.matching_profile_count === 0 && value.cohort_kind === 'reporting-only'
    && value.registry_release_id === 'national-business-registry-20260911-022652067Z-1ec656c3'
    && value.registry_manifest_sha256 === 'd8ab131697b1df63ed53fdfa9832d6973fd152ddf23565219ee9bb39b25fbb76'
    && value.reporting_artifact_inventory_sha256 === 'e060dd4979babd4ce4824edbf7e3469cd6447e2513c368615111da16259cf1c5'
    && value.temporal_release_id === 'national-business-temporal-claim-matrix-534d123499d07ec1beace832268a741fd2228897f222354905c43c2fb09d2090'
    && value.temporal_manifest_sha256 === '342691d68f76cc38bc8ce480266fd5d36be3c7f892d258b8bfde5be94417ed05'
    && value.temporal_artifact_sha256 === 'd7ceedd8651500f2affce2df1dc93dea5c8d9a5b69e19720c67b76ecc76231b0'
    && value.temporal_registration_sha256 === '65e7c8e5a3f32ee1a71f816f4aeb449c43925c924926ec6a1d777a727e19d738'
    && value.zip_temporal_qualification_release_id === 'exact-zip-industry-temporal-qualification-53f10242b04721edbe71f6214e0930be1ab95c205f4ec95828eb66e6871d0503'
    && value.zip_temporal_qualification_manifest_sha256 === '771a0f27951569bc7f1a96d02b8b9f114b65b2a37fdb1db3fb98217c6ad50e3e'
    && value.zip_temporal_qualification_artifact_sha256 === '958cb73f61dc27bf8bbbcb3f3e666917f8c885a59bf1470129ccadb5e2a862ed'
    && value.assessment_as_of === '2026-10-02T16:30:00.000Z'
    && value.geography_release_id === 'us-census-geography-20260830-132803990Z-3629abc0'
    && value.geography_manifest_sha256 === '5426cae150c0fba64f8ff43a48ca39c4e78b5b4ba8a8007fbd211615540d1c8b'
    && value.zcta_index_sha256 === '41cbef263f88514d6c6e139e54527350c23f9e05a96a9576a6d7b2478f28ffc6'
    && value.county_geometry_inventory_sha256 === '993e450f60492f7c651020e7135caf6d92b5f30a5a54d2adee8ad2fe9d9c38ae'
    && value.point_assignment_release_id === 'national-business-coverage-views-20260911-040908332Z-f01c882a'
    && value.point_assignment_manifest_sha256 === 'f15d43dda3acfb2e81fe2cd0360ec8dfba9f3061597c62c2eb8d1953bdc706b6'
    && value.summary?.site_count === 13182 && value.summary.matching_profile_count === 0
    && same(value.summary.by_source, { MA: 3007, NJ: 4075, TN: 1863, OH: 4237 })
    && same(value.summary.zip, { present: 13010, absent: 172, 'missing-source-zip': 27, 'invalid-source-zip-placeholder': 145 })
    && value.summary.point_assignment?.['assigned-single-county'] === 8942
    && value.summary.point_assignment?.['assignment-ineligible-by-source-policy'] === 4237
    && value.summary.point_assignment?.['missing-geocode'] === 3
    && value.summary.temporal_review_unmeasured === 13182
    && value.summary.physical_site_denominator?.matching_profiles === 8011835
    && value.summary.physical_site_denominator?.reporting_only_sites === 13182
    && value.summary.physical_site_denominator?.combined_retained_site_evidence === 8025017
    && value.active_business_eligible_count === 0 && value.active_business_verified_count === 0
    && value.current_operation_verified_count === 0 && value.identity_matching_eligible_count === 0
    && value.usps_unverified_count === 13182 && value.usps_operational_assignment_verified === false
    && value.usps_deliverability_verified === false && value.zcta_correspondence_is_membership === false
    && value.entity_polygons_present === false && value.export_policy === 'local-review-only'
    && Array.isArray(value.source_artifacts) && value.source_artifacts.length === 10
    && value.source_artifacts.every(item => SHA.test(item.sha256) && count(item.record_count) && item.export_policy === 'local-review-only')
    && same(value.source_manifest_hashes, { MA: 'c6d811e5743a03d7126d1e34b3763f4c1acbd495a5b4cf68f82c716c50fba1fc',
      NJ: 'b873a912c61e1cc13b53bac9ad6265380625344e3d9bb7795217913b8632049e',
      TN: '98234ee44e52e9fcf8cdecfb1812b49029a2444316832df95f90b18518ffa55d',
      OH: 'e4de0ed529da81c09522c52b9990b41a1edad1adf906f9eea2b95363ff241171' })
    && same(value.source_manifest_policy_hashes, { MA: 'bc5877f6f0b12a875e59464a71814ce7395e2cd8d292abae57e42f93086d8201',
      NJ: '79c0957df9fcdc66a856e5a6c242e24ef0296179eb93e4c8b298a32df2f61410',
      TN: '78300cd344afafd62d3a662a30d913871bd3fbd96cb59b03793e11b0b60f3b1b',
      OH: '53ead19c9463f270ed5def5eb0f848e46d3288d2a59844c53a8b317cad0b5c98' })
    && same(value.policy_profile_hashes, { MA: '8a2812e436c3b2bc9c4c88dd2299d406b8d8610cd88f851a9f5f664fa43a4742',
      NJ: '3a935abc814e7f46e6048bdb20ec25c67b3a70aa4cfb81b0d9494a35c9cb26cc',
      TN: '06b8b84549c26d2e3bcabdb89244463ef5fbd525c88170aab548b42267e1110e',
      OH: 'f1aa0c95eb96ba2cb6d10e75ded2011890cea61816d7b8b337ef1081dda4b6e2' })
    && same(value.source_bindings, REPORTING_SOURCE_PINS),
  'reporting-only site qualification registration/release/summary binding');
}

function entityGeographyRequirementComplete(value) {
  const point = value?.point_assignment_counts, postal = value?.postal_counts;
  return value?.profile_count > 0 && value.profile_count === value.registry_profile_count
    && postal?.['explicit-placeholder'] === 0 && postal?.missing === 0
    && value.usps_unverified_profile_count === 0
    && value.claims?.postal_validity_verified === true && value.semantics?.usps_deliverability_verified === true
    && value.semantics?.same_code_zcta_is_membership === false && value.reported_state_conflict_count === 0
    && point?.['assigned-single-county'] === value.profile_count
    && Object.entries(point).every(([status, valueCount]) => status === 'assigned-single-county' || valueCount === 0);
}

function validateGoalReadinessBindings(value) {
  const entity = value?.bindings?.zip_entity_resolution, industry = value?.bindings?.zip_industry_matrix,
    temporal = value?.bindings?.temporal_claim_matrix, temporalReconciliation=value?.bindings?.temporal_lifecycle_reconciliation, publisherMembership=value?.bindings?.publisher_membership_reconciliation, sourceStatusPosture=value?.bindings?.source_status_posture, coRegistrationStatusPosture=value?.bindings?.organization_assertion_status_posture, goal = value?.bindings?.goal_completion_matrix,
    broad = value?.bindings?.broad_organization_projection, lifecycle = value?.bindings?.lifecycle_eligibility,
    geographyRelationship = value?.bindings?.business_entity_geography_relationship,
    sourcePolicy = value?.bindings?.business_entity_source_policy_provenance;
  check(entity?.claims?.entity_resolution_applied === false
    && entity.claims.benchmark_gate_passed === false
    && entity.release_id === 'zip-entity-resolution-evidence-576079155175db7c5abbedf9a81c5481c53294cfd74cfd23fa994b2decd67564'
    && entity.registration_sha256 === 'a99311cfc37b523a9a924555cceb21ab184c65d4192ad9dbe30a428e5da34c39'
    && entity.manifest_sha256 === '742ffc2d35cc3f4e5541cc2325879b2da563ae7565a9d86829e9ec20560277ba', 'ZIP entity-resolution evidence pin/semantics');
  check(industry?.version === ZIP_INDUSTRY_VERSION
    && industry.release_id === 'national-exact-zip-industry-evidence-matrix-3533736fa5e0a27f0b4c5e4cb8e7d2af4aa04c2f0c97c4da7eff620df31f7ff7'
    && industry.registration_sha256 === '694d650ef277bb7b27c7df05c78e938afa1e99d1495a67910180ecc08609dfba'
    && industry.manifest_sha256 === '9c6fa25f318d3b89f7f24efa15340d56b38a72691e40e5c4ebde22b45281c975'
    && industry?.claims?.current_operations_verified === false
    && industry?.claims?.publisher_membership === 'City of Chicago source-defined current active business-license view'
    && industry?.claims?.lifecycle_status === 'source-defined-current-membership'
    && industry?.claims?.municipal_scope === 'City of Chicago'
    && industry?.claims?.reported_address_jurisdiction_may_differ === true
    && industry?.claims?.address_jurisdiction_inferred === false
    && industry?.claims?.continuous_operation_verified === false
    && industry?.claims?.site_occupancy_verified === false
    && industry?.claims?.public_access_verified === false
    && industry?.claims?.complete_all_businesses === false
    && industry?.claims?.unique_business_count === null
    && industry?.claims?.complete_selected_official_view_snapshot === true
    && industry?.claims?.source_coordinates_available === true
    && industry?.claims?.nonadditive_with_chicago_license_location_profiles === true
    && industry?.claims?.record_export_policy === 'local-review-only'
    && industry?.claims?.aggregate_export_policy === 'public-with-provenance-and-semantic-limitations'
    && industry?.claims?.usps_validity === null&&industry?.claims?.zcta_is_zip_geometry===false
    && industry?.claims?.production_enrollment === false
    && industry?.zip5_rows===48194&&industry?.dimension_count===50&&industry?.industry_cells === 2409700&&industry?.recursive_lineage_verified===true
    &&industry.temporal_qualification?.registration_sha256==='81bae1e6987ee9273648b3d3e31a55359d34cd5e3d9f49799043bd6b22a6d9bd'
    &&industry.temporal_qualification.dimension_count===50&&industry.temporal_qualification.qualification_cell_total===2409700&&industry.temporal_qualification.current_operations_verified===false
    &&industry.national_summary?.registration_sha256==='07c2220e6e445548869695374907fffeeb70d90279a32b0d6988110f8f020e3e'
    &&industry.national_summary.dimension_count===50&&industry.national_summary.industry_cells===2409700
    &&industry.national_summary.raw_status_cell_total===2409700&&industry.national_summary.derived_evidence_cell_total===2409700
    &&industry.national_summary.raw_status_preserved_separately===true
    &&industry.national_summary.current_operations_verified===false, 'ZIP industry matrix semantic boundary');
  check(temporal?.release_id === 'national-business-temporal-claim-matrix-534d123499d07ec1beace832268a741fd2228897f222354905c43c2fb09d2090'
    && temporal.registration_sha256 === '65e7c8e5a3f32ee1a71f816f4aeb449c43925c924926ec6a1d777a727e19d738'
    && temporal.manifest_sha256 === '342691d68f76cc38bc8ce480266fd5d36be3c7f892d258b8bfde5be94417ed05'
    && temporal?.summary?.broad_state_dc_gaps === 40
    && temporal?.summary?.active_business_count === null
    && temporal?.claims?.current_operations_verified === false, 'temporal claim matrix semantic boundary');
  check(temporalReconciliation?.registration_path==='config/datasets/national-business-temporal-lifecycle-reconciliation.json'
    &&temporalReconciliation.registration_sha256==='5e252823ead165ab672c94bce0f38f84ad9629c6461ded829fa67ced0a7371ad'
    &&temporalReconciliation.schema_version==='national-business-temporal-lifecycle-reconciliation@1.0.0'
    &&temporalReconciliation.status==='one-bounded-profile-classification-conflict'
    &&temporalReconciliation.temporal_release_id===temporal.release_id&&temporalReconciliation.temporal_manifest_sha256===temporal.manifest_sha256
    &&same(temporalReconciliation.effective_classification_counts,{'source-defined-current-membership':21,'non-active-reporting-membership':7,'annual-aggregate':1,'unknown-source-status':1})
    &&temporalReconciliation.classification_mismatches===1&&temporalReconciliation.mismatch_profiles===633232
    &&temporalReconciliation.los_angeles_effective_classification==='unknown-source-status'&&temporalReconciliation.current_operations_verified===false
    &&temporalReconciliation.active_business_count===null&&temporalReconciliation.completeness_percentage===null,'temporal lifecycle reconciliation binding');
  check(publisherMembership?.schema_version==='national-business-temporal-lifecycle-reconciliation@1.1.0'&&publisherMembership.publisher_cohort_assertion==='active-list-membership-without-row-status'&&publisherMembership.profile_count===633232&&publisherMembership.lifecycle_evidence==='unknown'&&publisherMembership.active_business_eligible_count===0&&publisherMembership.current_operations_verified===false&&publisherMembership.active_business_count===null&&publisherMembership.completeness_percentage===null,'publisher membership reconciliation binding');
  check(sourceStatusPosture?.profile_count===1958089&&sourceStatusPosture.non_primary_reporting_count===130691&&sourceStatusPosture.business_activity_status==='unmeasured'&&sourceStatusPosture.current_operations_verified===false&&sourceStatusPosture.active_business_eligible===false&&sourceStatusPosture.active_business_count===null&&sourceStatusPosture.completeness_percentage===null,'source status posture binding');
  check(coRegistrationStatusPosture?.scope==='separate-organization-assertion-cohort'&&coRegistrationStatusPosture.good_standing_count===1019372&&coRegistrationStatusPosture.delinquent_count===1145439&&coRegistrationStatusPosture.location_profile_cohort_affected===false&&coRegistrationStatusPosture.current_operations_verified===false&&coRegistrationStatusPosture.active_business_eligible===false&&coRegistrationStatusPosture.active_business_count===null&&coRegistrationStatusPosture.completeness_percentage===null,'organization assertion status posture binding');
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
  check(lifecycle?.release_id === 'business-entity-lifecycle-eligibility-f37556f8722c5a48c114a763ce1786cbe2e6d11b985b875602a97afb45671057'
    && lifecycle.registration_path === 'config/datasets/business-entity-lifecycle-eligibility.json'
    && lifecycle.manifest_path === `data/business-entity-lifecycle-eligibility/releases/${lifecycle.release_id}/manifest.json`
    && lifecycle.taxonomy_path === 'config/datasets/business-entity-lifecycle-eligibility-taxonomy.json'
    && lifecycle.registration_sha256 === 'f7531c0a06b4259ae46f6887c69eb9d8d5f0135ae52f30237556c84e89a66035'
    && lifecycle.manifest_sha256 === 'fe97a5b260a7c9c38c8884d668ba6f99b237ca4ec0f6885af587efd349f428ae'
    && lifecycle.taxonomy_sha256 === '7c7dcc49afdae859d20de95e785c2efe3e40b43e395091de934ee76a1f99f6cc'
    && lifecycle.artifact_inventory_sha256 === 'ef3c2a697f8504656d884b1dde88317d4ed6a04597d99d957e28795f2a417907'
    && lifecycle.artifact_count === 100 && lifecycle.artifact_record_count === 8011835
    && lifecycle.registry_release_id === 'national-business-registry-20260911-022652067Z-1ec656c3'
    && lifecycle.registry_manifest_sha256 === 'd8ab131697b1df63ed53fdfa9832d6973fd152ddf23565219ee9bb39b25fbb76'
    && lifecycle.temporal_release_id === temporal.release_id && lifecycle.temporal_manifest_sha256 === temporal.manifest_sha256
    && lifecycle.temporal_artifact_sha256 === 'd7ceedd8651500f2affce2df1dc93dea5c8d9a5b69e19720c67b76ecc76231b0'
    && lifecycle.qualification_release_id === 'exact-zip-industry-temporal-qualification-d4c84e6c4665b66c9629d942764ab26904f8571e17c2c5a6cca56b89bfdaf4ee'
    && lifecycle.qualification_manifest_sha256 === 'c9fce9805fb4cad870e90ea074ef74a31a5f1001e2d601192671129ca1513409'
    && lifecycle.qualification_artifact_sha256 === '8cb2668ecf2f428e2f350742072ae589c9bc1342c6432e78e7e87e476a52848a'
    && lifecycle.profile_count === 8011835 && lifecycle.source_count === 15 && lifecycle.source_status_value_count === 17
    && lifecycle.registry_profile_count === lifecycle.profile_count && lifecycle.release_manifest_verified === true
    && lifecycle.review_status_counts?.['within-review-window'] === 7987605 && lifecycle.review_status_counts?.stale === 24230
    && lifecycle.review_status_counts?.unmeasured === 0 && lifecycle.review_status_counts?.unmapped === 0
    && lifecycle.lifecycle_evidence_counts?.['source-defined-current'] === 5240481
    && lifecycle.lifecycle_evidence_counts?.['non-active-reporting'] === 2135455
    && lifecycle.lifecycle_evidence_counts?.unknown === 633232 && lifecycle.lifecycle_evidence_counts?.contradictory === 2667
    && lifecycle.exception_counts?.la_null_source_status === 633232
    && lifecycle.exception_counts?.ca_expiration_before_observation_profiles === 2667
    && lifecycle.exception_counts?.ny_retail_food_stale_non_active === 24230
    && lifecycle.current_operation_verified_count === 0 && lifecycle.active_business_eligible_count === 0
    && lifecycle.assessment_as_of === '2026-10-02T16:30:00.000Z', 'business-entity lifecycle registration/release/summary binding');
  check(sourcePolicy?.release_id === 'business-entity-source-policy-provenance-86c0f274be2e5c350c36aabdd301cde101826aebc705dd1cd995f0c8b42c5649'
    && sourcePolicy.registration_path === 'config/datasets/business-entity-source-policy-provenance.json'
    && sourcePolicy.registration_sha256 === '6c98e38b8c8605f5b3974c84cc5ce7dbc6c26886af184ccf8a7890ea6732fcb1'
    && sourcePolicy.manifest_sha256 === '8da166fa132f61213d8544ac50387b01f3bd94242198b50469c53ec236e733ca'
    && sourcePolicy.artifact_sha256 === '51113c1bc69589ebfbccd328d87f434216909bb719ae06cfae167aab74b8de25'
    && sourcePolicy.source_count === 15 && sourcePolicy.profile_count === 8011835
    && sourcePolicy.registry_release_id === lifecycle.registry_release_id
    && sourcePolicy.registry_manifest_sha256 === lifecycle.registry_manifest_sha256
    && sourcePolicy.lifecycle_release_id === lifecycle.release_id && sourcePolicy.lifecycle_manifest_sha256 === lifecycle.manifest_sha256
    && sourcePolicy.taxonomy_sha256 === lifecycle.taxonomy_sha256 && sourcePolicy.temporal_release_id === temporal.release_id
    && sourcePolicy.temporal_manifest_sha256 === temporal.manifest_sha256 && sourcePolicy.policy_files_verified === 15
    && sourcePolicy.profile_policy_rows_verified === 8011835 && sourcePolicy.authorization_granted === false
    && sourcePolicy.acquisition_authorized === false && sourcePolicy.export_authorized === false
    && sourcePolicy.profile_export_policy_counts?.['local-review-only'] === 1850619
    && sourcePolicy.profile_export_policy_counts?.public === 6161216
    && SHA.test(sourcePolicy.source_profile_counts_sha256 ?? ''),
  'business-entity source-policy provenance registration/release/summary binding');
  validateGeographyRelationshipBinding(geographyRelationship);
  validateReportingOnlySiteBinding(value.bindings?.reporting_only_site_qualification);
  const ledger = value.requirements_ledger, expectedLedger = {
    geography: 'achieved', 'entity-geography-relationship': entityGeographyRequirementComplete(geographyRelationship) ? 'achieved' : 'partial', 'postal-denominator': 'blocked', 'source-authorization-policy-and-provenance': 'partial',
    'broad-state-coverage': 'blocked', 'industry-coverage': 'unmeasured', 'temporal-and-current-operation': 'blocked',
    'lifecycle-eligibility': 'blocked',
    'reconciliation-and-benchmark': 'blocked', 'all-business-completeness-denominator': 'unmeasured', 'reporting-only-site-qualification': 'partial',
    'business-entity-source-policy-provenance': 'achieved',
  };
  check(Array.isArray(ledger) && ledger.length === Object.keys(expectedLedger).length
    && ledger.every(row => row && expectedLedger[row.requirement] === row.status && typeof row.evidence === 'string' && row.evidence.length > 0)
    && Object.keys(expectedLedger).every(key => ledger.some(row => row.requirement === key)), 'closed objective requirements ledger');
  check(ledger.find(row => row.requirement === 'broad-state-coverage')?.current_gap_count === 40
    && ledger.find(row => row.requirement === 'entity-geography-relationship')?.profile_count === 8011835
    && ledger.find(row => row.requirement === 'entity-geography-relationship')?.registry_profile_count === 8011835
    && ledger.find(row => row.requirement === 'entity-geography-relationship')?.point_assignment_counts?.['assigned-single-county'] === 372079
    && ledger.find(row => row.requirement === 'entity-geography-relationship')?.postal_counts?.['explicit-placeholder'] === 1
    && ledger.find(row => row.requirement === 'entity-geography-relationship')?.usps_unverified_profile_count === 8011835
    && ledger.find(row => row.requirement === 'reporting-only-site-qualification')?.site_count === 13182
    && ledger.find(row => row.requirement === 'reporting-only-site-qualification')?.matching_profile_count === 0
    && ledger.find(row => row.requirement === 'reporting-only-site-qualification')?.matching_profile_denominator === 8011835
    && ledger.find(row => row.requirement === 'reporting-only-site-qualification')?.combined_retained_site_evidence_count === 8025017
    && ledger.find(row => row.requirement === 'reporting-only-site-qualification')?.zip_absent_count === 172
    && ledger.find(row => row.requirement === 'reporting-only-site-qualification')?.active_business_eligible_count === 0
    && ledger.find(row => row.requirement === 'business-entity-source-policy-provenance')?.source_count === 15
    && ledger.find(row => row.requirement === 'business-entity-source-policy-provenance')?.profile_count === 8011835
    && ledger.find(row => row.requirement === 'business-entity-source-policy-provenance')?.policy_files_verified === 15
    && ledger.find(row => row.requirement === 'business-entity-source-policy-provenance')?.profile_policy_rows_verified === 8011835
    && ledger.find(row => row.requirement === 'business-entity-source-policy-provenance')?.authorization_granted === false
    && value.acceptance_uplift === false && value.claims?.acceptance === false && value.claims?.report_only === true
    && value.claims?.network_requests === 0 && value.claims?.writes === 0 && value.claims?.pointers_changed === false,
    'objective readiness authority/coverage boundary');
  const blockerCodes = ['entity-resolution-benchmark-gate-not-passed', 'entity-resolution-not-applied',
    'nationwide-industry-universe-unmeasured', 'broad-jurisdiction-source-gaps', 'current-operation-not-independently-verified',
    'reporting-only-sites-not-eligible-or-verified',
    ...(!entityGeographyRequirementComplete(geographyRelationship) ? ['entity-geography-relationship-not-complete'] : []),
    'lifecycle-active-eligibility-not-established', 'lifecycle-stale-records-present', 'lifecycle-unknown-or-contradictory'];
  check(Array.isArray(value.blockers) && value.blockers.length === blockerCodes.length
    && blockerCodes.every(code => value.blockers.some(item => item.code === code))
    && value.blockers.find(item => item.code === 'broad-jurisdiction-source-gaps')?.count === 40
    && value.blockers.find(item => item.code === 'lifecycle-active-eligibility-not-established')?.profile_count === 8011835
    && value.blockers.find(item => item.code === 'lifecycle-active-eligibility-not-established')?.eligible_count === 0
    && value.blockers.find(item => item.code === 'lifecycle-stale-records-present')?.count === 24230
    && value.blockers.find(item => item.code === 'lifecycle-unknown-or-contradictory')?.count === 635899,
    'closed objective blockers/count');
  check(value.blockers.find(item => item.code === 'reporting-only-sites-not-eligible-or-verified')?.count === 13182,
    'closed objective blockers/count');
  for (const [id, evidence] of Object.entries(value.bindings ?? {}))
    check(evidence && typeof evidence.release_id === 'string' && SHA.test(evidence.manifest_sha256), `missing/malformed ${id} binding`);
  check(value.bindings.business_entity_source_policy_provenance.release_id === 'business-entity-source-policy-provenance-86c0f274be2e5c350c36aabdd301cde101826aebc705dd1cd995f0c8b42c5649',
    'source-policy inventory binding absent');
  return true;
}
export const NATIONAL_ZIP_GOAL_ACCEPTANCE_READINESS_TEST_HOOKS = Object.freeze({ validateGoalReadinessBindings, validateGeographyRelationshipBinding, entityGeographyRequirementComplete, readVerifiedBusinessEntityGeographyBinding });

/** Closed API projection. All readiness semantics originate in the retained acceptance report above. */
export function projectNationalZipObjectiveReadiness(report) {
  check(report?.schema_version === NATIONAL_ZIP_GOAL_ACCEPTANCE_VERSION
    && report.requested_claim === 'every-active-business-by-valid-zip' && report.acceptance?.accepted === false,
    'active-business acceptance report');
  const readiness = report.objective_readiness;
  validateGoalReadinessBindings(readiness);
  const binding = readiness.bindings;
  const expectedBlockers = ['entity-resolution-benchmark-gate-not-passed', 'entity-resolution-not-applied',
    'nationwide-industry-universe-unmeasured', 'broad-jurisdiction-source-gaps', 'current-operation-not-independently-verified',
    'reporting-only-sites-not-eligible-or-verified',
    ...(!entityGeographyRequirementComplete(binding.business_entity_geography_relationship) ? ['entity-geography-relationship-not-complete'] : []),
    'lifecycle-active-eligibility-not-established', 'lifecycle-stale-records-present', 'lifecycle-unknown-or-contradictory'];
  const acceptanceBlockers = ['authoritative-current-usps-denominator-unavailable', 'complete-current-delivery-zip-registry-not-established',
    'all-business-universe-unmeasured', 'current-business-operations-not-independently-verified', ...expectedBlockers];
  check(same(report.acceptance.blockers, acceptanceBlockers)
    && same(readiness.blockers.map(item => item.code), expectedBlockers)
    && readiness.blockers.every(item => same(Object.keys(item).sort(), item.code === 'broad-jurisdiction-source-gaps' || item.code === 'lifecycle-stale-records-present'
      || item.code === 'lifecycle-unknown-or-contradictory' || item.code === 'reporting-only-sites-not-eligible-or-verified' ? ['code', 'count']
      : item.code === 'lifecycle-active-eligibility-not-established' ? ['code', 'eligible_count', 'profile_count', 'verified_current_operation_count'] : ['code']))
    && readiness.blockers.find(item => item.code === 'broad-jurisdiction-source-gaps')?.count === 40
    && readiness.blockers.find(item => item.code === 'lifecycle-active-eligibility-not-established')?.profile_count === 8011835
    && readiness.blockers.find(item => item.code === 'lifecycle-active-eligibility-not-established')?.eligible_count === 0
    && readiness.blockers.find(item => item.code === 'lifecycle-active-eligibility-not-established')?.verified_current_operation_count === 0
    && readiness.blockers.find(item => item.code === 'lifecycle-stale-records-present')?.count === 24230
    && readiness.blockers.find(item => item.code === 'lifecycle-unknown-or-contradictory')?.count === 635899,
    'closed objective acceptance blockers');
  check(report.all_business_completion_percent === null && report.current_operating_business_count === null
    && report.public_export_authorized === false && report.production_execution === false
    && report.publication_performed === false && report.network_requests === 0, 'acceptance claims widened');
  const requirements_ledger = readiness.requirements_ledger.map(row => ({
    requirement: row.requirement,
    status: row.status,
    ...(row.profile_count === undefined ? {} : { profile_count: row.profile_count }),
    ...(row.registry_profile_count === undefined ? {} : { registry_profile_count: row.registry_profile_count }),
    ...(row.active_business_eligible_count === undefined ? {} : { active_business_eligible_count: row.active_business_eligible_count }),
    ...(row.stale_count === undefined ? {} : { stale_count: row.stale_count }),
    ...(row.unknown_or_contradictory_count === undefined ? {} : { unknown_or_contradictory_count: row.unknown_or_contradictory_count }),
    ...(row.verified_current_operation_count === undefined ? {} : { verified_current_operation_count: row.verified_current_operation_count }),
    ...(row.current_gap_count === undefined ? {} : { current_gap_count: row.current_gap_count }),
    ...(row.jurisdiction_count === undefined ? {} : { jurisdiction_count: row.jurisdiction_count }),
    ...(row.postal_counts === undefined ? {} : { postal_counts: row.postal_counts }),
    ...(row.point_assignment_counts === undefined ? {} : { point_assignment_counts: row.point_assignment_counts }),
    ...(row.reported_state_conflict_count === undefined ? {} : { reported_state_conflict_count: row.reported_state_conflict_count }),
    ...(row.usps_unverified_profile_count === undefined ? {} : { usps_unverified_profile_count: row.usps_unverified_profile_count }),
    ...(row.usps_operational_assignment_verified === undefined ? {} : { usps_operational_assignment_verified: row.usps_operational_assignment_verified }),
    ...(row.usps_deliverability_verified === undefined ? {} : { usps_deliverability_verified: row.usps_deliverability_verified }),
    ...(row.same_code_zcta_is_membership === undefined ? {} : { same_code_zcta_is_membership: row.same_code_zcta_is_membership }),
    ...(row.entity_polygons_present === undefined ? {} : { entity_polygons_present: row.entity_polygons_present }),
    ...(row.site_count === undefined ? {} : { site_count: row.site_count }),
    ...(row.matching_profile_count === undefined ? {} : { matching_profile_count: row.matching_profile_count }),
    ...(row.current_operation_verified_count === undefined ? {} : { current_operation_verified_count: row.current_operation_verified_count }),
    ...(row.zip_present_count === undefined ? {} : { zip_present_count: row.zip_present_count }),
    ...(row.zip_absent_count === undefined ? {} : { zip_absent_count: row.zip_absent_count }),
    ...(row.usps_unverified_count === undefined ? {} : { usps_unverified_count: row.usps_unverified_count }),
    ...(row.point_assigned_count === undefined ? {} : { point_assigned_count: row.point_assigned_count }),
    ...(row.point_assignment_ineligible_count === undefined ? {} : { point_assignment_ineligible_count: row.point_assignment_ineligible_count }),
    ...(row.matching_profile_denominator === undefined ? {} : { matching_profile_denominator: row.matching_profile_denominator }),
    ...(row.combined_retained_site_evidence_count === undefined ? {} : { combined_retained_site_evidence_count: row.combined_retained_site_evidence_count }),
    ...(row.source_count === undefined ? {} : { source_count: row.source_count }),
    ...(row.policy_files_verified === undefined ? {} : { policy_files_verified: row.policy_files_verified }),
    ...(row.profile_policy_rows_verified === undefined ? {} : { profile_policy_rows_verified: row.profile_policy_rows_verified }),
    ...(row.authorization_granted === undefined ? {} : { authorization_granted: row.authorization_granted }),
    ...(row.acquisition_authorized === undefined ? {} : { acquisition_authorized: row.acquisition_authorized }),
    ...(row.export_authorized === undefined ? {} : { export_authorized: row.export_authorized }),
    ...(row.effective_source_defined_current_membership_sources === undefined ? {} : { effective_source_defined_current_membership_sources: row.effective_source_defined_current_membership_sources }),
    ...(row.effective_non_active_reporting_sources === undefined ? {} : { effective_non_active_reporting_sources: row.effective_non_active_reporting_sources }),
    ...(row.effective_annual_aggregate_sources === undefined ? {} : { effective_annual_aggregate_sources: row.effective_annual_aggregate_sources }),
    ...(row.effective_unknown_status_sources === undefined ? {} : { effective_unknown_status_sources: row.effective_unknown_status_sources }),
    ...(row.source_cohort_current_membership_sources === undefined ? {} : { source_cohort_current_membership_sources: row.source_cohort_current_membership_sources }),
    ...(row.mismatch_profiles === undefined ? {} : { mismatch_profiles: row.mismatch_profiles }),
    ...(row.verified_current_complete_jurisdictions === undefined ? {} : { verified_current_complete_jurisdictions: row.verified_current_complete_jurisdictions }),
    evidence: row.evidence,
  }));
  const expectedRequirements = [
    ['geography', 'achieved'], ['entity-geography-relationship', entityGeographyRequirementComplete(binding.business_entity_geography_relationship) ? 'achieved' : 'partial'], ['postal-denominator', 'blocked'], ['source-authorization-policy-and-provenance', 'partial'],
    ['broad-state-coverage', 'blocked'], ['industry-coverage', 'unmeasured'], ['temporal-and-current-operation', 'blocked'], ['lifecycle-eligibility', 'blocked'],
    ['reconciliation-and-benchmark', 'blocked'], ['all-business-completeness-denominator', 'unmeasured'], ['reporting-only-site-qualification', 'partial'],
    ['business-entity-source-policy-provenance', 'achieved'],
  ];
  check(same(requirements_ledger.map(row => [row.requirement, row.status]), expectedRequirements)
    && requirements_ledger.every(row => typeof row.evidence === 'string' && row.evidence.length > 0
      && same(Object.keys(row).sort(), row.requirement === 'broad-state-coverage'
        ? ['current_gap_count', 'evidence', 'jurisdiction_count', 'requirement', 'status']
        : row.requirement === 'entity-geography-relationship' ? ['entity_polygons_present', 'evidence', 'point_assignment_counts', 'postal_counts', 'profile_count', 'registry_profile_count', 'reported_state_conflict_count', 'requirement', 'same_code_zcta_is_membership', 'status', 'usps_deliverability_verified', 'usps_operational_assignment_verified', 'usps_unverified_profile_count']
        : row.requirement === 'lifecycle-eligibility' ? ['active_business_eligible_count', 'evidence', 'profile_count', 'registry_profile_count', 'requirement', 'stale_count', 'status', 'unknown_or_contradictory_count', 'verified_current_operation_count']
        : row.requirement === 'reporting-only-site-qualification' ? ['active_business_eligible_count', 'combined_retained_site_evidence_count', 'current_operation_verified_count', 'evidence', 'matching_profile_count', 'matching_profile_denominator', 'point_assigned_count', 'point_assignment_ineligible_count', 'requirement', 'site_count', 'status', 'usps_unverified_count', 'zip_absent_count', 'zip_present_count']
        : row.requirement === 'business-entity-source-policy-provenance' ? ['acquisition_authorized', 'authorization_granted', 'evidence', 'export_authorized', 'policy_files_verified', 'profile_count', 'profile_policy_rows_verified', 'requirement', 'source_count', 'status']
        : row.requirement === 'temporal-and-current-operation' ? ['effective_annual_aggregate_sources','effective_non_active_reporting_sources','effective_source_defined_current_membership_sources','effective_unknown_status_sources','evidence','mismatch_profiles','requirement','source_cohort_current_membership_sources','status','verified_current_complete_jurisdictions']
        : ['evidence', 'requirement', 'status']))
    && requirements_ledger.find(row => row.requirement === 'broad-state-coverage')?.current_gap_count === 40
    && requirements_ledger.find(row => row.requirement === 'broad-state-coverage')?.jurisdiction_count === 51
    && requirements_ledger.find(row => row.requirement === 'lifecycle-eligibility')?.profile_count === 8011835
    && requirements_ledger.find(row => row.requirement === 'lifecycle-eligibility')?.registry_profile_count === 8011835
    && requirements_ledger.find(row => row.requirement === 'lifecycle-eligibility')?.active_business_eligible_count === 0
    && requirements_ledger.find(row => row.requirement === 'lifecycle-eligibility')?.stale_count === 24230
    && requirements_ledger.find(row => row.requirement === 'lifecycle-eligibility')?.unknown_or_contradictory_count === 635899
    && requirements_ledger.find(row => row.requirement === 'lifecycle-eligibility')?.verified_current_operation_count === 0
    && requirements_ledger.find(row => row.requirement === 'temporal-and-current-operation')?.effective_source_defined_current_membership_sources === 21
    && requirements_ledger.find(row => row.requirement === 'temporal-and-current-operation')?.effective_non_active_reporting_sources === 7
    && requirements_ledger.find(row => row.requirement === 'temporal-and-current-operation')?.effective_annual_aggregate_sources === 1
    && requirements_ledger.find(row => row.requirement === 'temporal-and-current-operation')?.effective_unknown_status_sources === 1
    && requirements_ledger.find(row => row.requirement === 'temporal-and-current-operation')?.source_cohort_current_membership_sources === 22
    && requirements_ledger.find(row => row.requirement === 'temporal-and-current-operation')?.mismatch_profiles === 633232
    && requirements_ledger.find(row => row.requirement === 'entity-geography-relationship')?.profile_count === 8011835
    && requirements_ledger.find(row => row.requirement === 'entity-geography-relationship')?.registry_profile_count === 8011835
    && same(requirements_ledger.find(row => row.requirement === 'entity-geography-relationship')?.postal_counts, GEO_POSTAL_COUNTS)
    && same(requirements_ledger.find(row => row.requirement === 'entity-geography-relationship')?.point_assignment_counts, GEO_POINT_COUNTS)
    && requirements_ledger.find(row => row.requirement === 'entity-geography-relationship')?.reported_state_conflict_count === 11
    && requirements_ledger.find(row => row.requirement === 'entity-geography-relationship')?.usps_unverified_profile_count === 8011835
    && requirements_ledger.find(row => row.requirement === 'entity-geography-relationship')?.usps_operational_assignment_verified === false
    && requirements_ledger.find(row => row.requirement === 'entity-geography-relationship')?.usps_deliverability_verified === false
    && requirements_ledger.find(row => row.requirement === 'entity-geography-relationship')?.same_code_zcta_is_membership === false
    && requirements_ledger.find(row => row.requirement === 'entity-geography-relationship')?.entity_polygons_present === false,
    'closed twelve-row objective readiness ledger');
  check(requirements_ledger.find(row => row.requirement === 'reporting-only-site-qualification')?.site_count === 13182
    && requirements_ledger.find(row => row.requirement === 'reporting-only-site-qualification')?.matching_profile_count === 0
    && requirements_ledger.find(row => row.requirement === 'reporting-only-site-qualification')?.matching_profile_denominator === 8011835
    && requirements_ledger.find(row => row.requirement === 'reporting-only-site-qualification')?.combined_retained_site_evidence_count === 8025017
    && requirements_ledger.find(row => row.requirement === 'reporting-only-site-qualification')?.active_business_eligible_count === 0
    && requirements_ledger.find(row => row.requirement === 'reporting-only-site-qualification')?.current_operation_verified_count === 0
    && requirements_ledger.find(row => row.requirement === 'reporting-only-site-qualification')?.zip_present_count === 13010
    && requirements_ledger.find(row => row.requirement === 'reporting-only-site-qualification')?.zip_absent_count === 172
    && requirements_ledger.find(row => row.requirement === 'reporting-only-site-qualification')?.usps_unverified_count === 13182,
    'reporting-only site readiness counts');
  check(requirements_ledger.find(row => row.requirement === 'business-entity-source-policy-provenance')?.source_count === 15
    && requirements_ledger.find(row => row.requirement === 'business-entity-source-policy-provenance')?.profile_count === 8011835
    && requirements_ledger.find(row => row.requirement === 'business-entity-source-policy-provenance')?.policy_files_verified === 15
    && requirements_ledger.find(row => row.requirement === 'business-entity-source-policy-provenance')?.profile_policy_rows_verified === 8011835
    && requirements_ledger.find(row => row.requirement === 'business-entity-source-policy-provenance')?.authorization_granted === false
    && requirements_ledger.find(row => row.requirement === 'business-entity-source-policy-provenance')?.acquisition_authorized === false
    && requirements_ledger.find(row => row.requirement === 'business-entity-source-policy-provenance')?.export_authorized === false,
  'source-policy provenance integrity-only requirement');
  return {
    schema_version: 'national-zip-objective-readiness-api@1.6.0',
    available: true,
    status: 'not-accepted',
    assessment_as_of: readiness.assessment_as_of,
    acceptance: { accepted: false, blockers: [...report.acceptance.blockers], blocker_details: readiness.blockers.map(item => ({ ...item })) },
    requirements_ledger,
    broad_jurisdiction_gap_count: 40,
    claims: { all_business_completion_percent: null, active_business_count: null, current_operating_business_count: null,
      current_operations_verified: false, all_business_completeness: false, active_business_eligible_count: 0, public_export_authorized: false,
      production_execution: false, publication_performed: false, network_requests: 0 },
    lineage: {
      zip_entity_resolution: { release_id: binding.zip_entity_resolution.release_id, manifest_sha256: binding.zip_entity_resolution.manifest_sha256,
        registration_sha256: binding.zip_entity_resolution.registration_sha256 },
      zip_industry_matrix: { release_id: binding.zip_industry_matrix.release_id, manifest_sha256: binding.zip_industry_matrix.manifest_sha256,
        registration_sha256: binding.zip_industry_matrix.registration_sha256,temporal_qualification_registration_sha256:binding.zip_industry_matrix.temporal_qualification.registration_sha256,
        national_summary_registration_sha256:binding.zip_industry_matrix.national_summary.registration_sha256,dimension_count:binding.zip_industry_matrix.dimension_count,industry_cells:binding.zip_industry_matrix.industry_cells },
      temporal_claim_matrix: { release_id: binding.temporal_claim_matrix.release_id, manifest_sha256: binding.temporal_claim_matrix.manifest_sha256,
        registration_sha256: binding.temporal_claim_matrix.registration_sha256 },
      temporal_lifecycle_reconciliation: {release_id:'national-business-temporal-lifecycle-reconciliation@1.0.0',manifest_sha256:binding.temporal_lifecycle_reconciliation.lifecycle_manifest_sha256,
        registration_sha256:binding.temporal_lifecycle_reconciliation.registration_sha256,temporal_manifest_sha256:binding.temporal_lifecycle_reconciliation.temporal_manifest_sha256,
        taxonomy_sha256:binding.temporal_lifecycle_reconciliation.taxonomy_sha256},
      publisher_membership_reconciliation: {release_id:binding.publisher_membership_reconciliation.release_id,manifest_sha256:binding.publisher_membership_reconciliation.manifest_sha256,registration_sha256:binding.publisher_membership_reconciliation.registration_sha256,profile_count:binding.publisher_membership_reconciliation.profile_count,publisher_cohort_assertion:binding.publisher_membership_reconciliation.publisher_cohort_assertion},
      source_status_posture:{release_id:binding.source_status_posture.release_id,manifest_sha256:binding.source_status_posture.manifest_sha256,profile_count:binding.source_status_posture.profile_count,business_activity_status:binding.source_status_posture.business_activity_status},
      organization_assertion_status_posture:{release_id:binding.organization_assertion_status_posture.release_id,manifest_sha256:binding.organization_assertion_status_posture.manifest_sha256,scope:binding.organization_assertion_status_posture.scope,good_standing_count:binding.organization_assertion_status_posture.good_standing_count,delinquent_count:binding.organization_assertion_status_posture.delinquent_count},
      goal_completion_matrix: { release_id: binding.goal_completion_matrix.release_id, manifest_sha256: binding.goal_completion_matrix.manifest_sha256,
        report_sha256: binding.goal_completion_matrix.report_sha256 },
      broad_organization_projection: {
        release_id: binding.broad_organization_projection.release_id,
        program_manifest_sha256: binding.broad_organization_projection.source_lineage.program_manifest_sha256,
        backlog_release_id: binding.broad_organization_projection.source_lineage.backlog_release_id,
        backlog_manifest_sha256: binding.broad_organization_projection.source_lineage.backlog_manifest_sha256,
        assessment_catalog_id: binding.broad_organization_projection.source_lineage.assessment_catalog_id,
        assessment_catalog_sha256: binding.broad_organization_projection.source_lineage.assessment_catalog_sha256,
        source_matrix_release_id: binding.broad_organization_projection.source_lineage.source_matrix_release_id,
        source_matrix_manifest_sha256: binding.broad_organization_projection.source_lineage.source_matrix_manifest_sha256,
      },
      lifecycle_eligibility: binding.lifecycle_eligibility,
      business_entity_geography_relationship: {
        release_id: binding.business_entity_geography_relationship.release_id,
        registration_sha256: binding.business_entity_geography_relationship.registration_sha256,
        manifest_sha256: binding.business_entity_geography_relationship.manifest_sha256,
        artifact_inventory_sha256: binding.business_entity_geography_relationship.artifact_inventory_sha256,
        artifact_count: binding.business_entity_geography_relationship.artifact_count,
        profile_count: binding.business_entity_geography_relationship.profile_count,
        registry_profile_count: binding.business_entity_geography_relationship.registry_profile_count,
        upstream: binding.business_entity_geography_relationship.upstream,
        postal_counts: binding.business_entity_geography_relationship.postal_counts,
        point_assignment_counts: binding.business_entity_geography_relationship.point_assignment_counts,
        reported_state_conflict_count: binding.business_entity_geography_relationship.reported_state_conflict_count,
        usps_unverified_profile_count: binding.business_entity_geography_relationship.profile_count,
        claims: binding.business_entity_geography_relationship.claims,
        semantics: binding.business_entity_geography_relationship.semantics,
      },
      reporting_only_site_qualification: {
        release_id: binding.reporting_only_site_qualification.release_id,
        registration_sha256: binding.reporting_only_site_qualification.registration_sha256,
        manifest_sha256: binding.reporting_only_site_qualification.manifest_sha256,
        artifact_sha256: binding.reporting_only_site_qualification.artifact_sha256,
        record_count: binding.reporting_only_site_qualification.record_count,
        registry_release_id: binding.reporting_only_site_qualification.registry_release_id,
        registry_manifest_sha256: binding.reporting_only_site_qualification.registry_manifest_sha256,
        reporting_artifact_inventory_sha256: binding.reporting_only_site_qualification.reporting_artifact_inventory_sha256,
        source_manifest_hashes: binding.reporting_only_site_qualification.source_manifest_hashes,
        source_manifest_policy_hashes: binding.reporting_only_site_qualification.source_manifest_policy_hashes,
        policy_profile_hashes: binding.reporting_only_site_qualification.policy_profile_hashes,
        source_bindings: binding.reporting_only_site_qualification.source_bindings,
        temporal_release_id: binding.reporting_only_site_qualification.temporal_release_id,
        temporal_manifest_sha256: binding.reporting_only_site_qualification.temporal_manifest_sha256,
        temporal_artifact_sha256: binding.reporting_only_site_qualification.temporal_artifact_sha256,
        temporal_registration_sha256: binding.reporting_only_site_qualification.temporal_registration_sha256,
        zip_temporal_qualification_release_id: binding.reporting_only_site_qualification.zip_temporal_qualification_release_id,
        zip_temporal_qualification_manifest_sha256: binding.reporting_only_site_qualification.zip_temporal_qualification_manifest_sha256,
        zip_temporal_qualification_artifact_sha256: binding.reporting_only_site_qualification.zip_temporal_qualification_artifact_sha256,
        assessment_as_of: binding.reporting_only_site_qualification.assessment_as_of,
        geography_release_id: binding.reporting_only_site_qualification.geography_release_id,
        geography_manifest_sha256: binding.reporting_only_site_qualification.geography_manifest_sha256,
        zcta_index_sha256: binding.reporting_only_site_qualification.zcta_index_sha256,
        county_geometry_inventory_sha256: binding.reporting_only_site_qualification.county_geometry_inventory_sha256,
        point_assignment_release_id: binding.reporting_only_site_qualification.point_assignment_release_id,
        point_assignment_manifest_sha256: binding.reporting_only_site_qualification.point_assignment_manifest_sha256,
        summary: binding.reporting_only_site_qualification.summary,
        active_business_eligible_count: binding.reporting_only_site_qualification.active_business_eligible_count,
        current_operation_verified_count: binding.reporting_only_site_qualification.current_operation_verified_count,
        usps_unverified_count: binding.reporting_only_site_qualification.usps_unverified_count,
        export_policy: binding.reporting_only_site_qualification.export_policy,
      },
      business_entity_source_policy_provenance: {
        release_id: binding.business_entity_source_policy_provenance.release_id,
        registration_sha256: binding.business_entity_source_policy_provenance.registration_sha256,
        manifest_sha256: binding.business_entity_source_policy_provenance.manifest_sha256,
        artifact_sha256: binding.business_entity_source_policy_provenance.artifact_sha256,
        source_count: binding.business_entity_source_policy_provenance.source_count,
        profile_count: binding.business_entity_source_policy_provenance.profile_count,
        registry_release_id: binding.business_entity_source_policy_provenance.registry_release_id,
        registry_manifest_sha256: binding.business_entity_source_policy_provenance.registry_manifest_sha256,
        lifecycle_release_id: binding.business_entity_source_policy_provenance.lifecycle_release_id,
        lifecycle_manifest_sha256: binding.business_entity_source_policy_provenance.lifecycle_manifest_sha256,
        taxonomy_sha256: binding.business_entity_source_policy_provenance.taxonomy_sha256,
        temporal_release_id: binding.business_entity_source_policy_provenance.temporal_release_id,
        temporal_manifest_sha256: binding.business_entity_source_policy_provenance.temporal_manifest_sha256,
        source_profile_counts_sha256: binding.business_entity_source_policy_provenance.source_profile_counts_sha256,
        policy_files_verified: binding.business_entity_source_policy_provenance.policy_files_verified,
        profile_policy_rows_verified: binding.business_entity_source_policy_provenance.profile_policy_rows_verified,
        profile_export_policy_counts: binding.business_entity_source_policy_provenance.profile_export_policy_counts,
        authorization_granted: false, acquisition_authorized: false, export_authorized: false,
      },
      business_entity_source_policy_provenance: {
        release_id: binding.business_entity_source_policy_provenance.release_id,
        registration_sha256: binding.business_entity_source_policy_provenance.registration_sha256,
        manifest_sha256: binding.business_entity_source_policy_provenance.manifest_sha256,
        artifact_sha256: binding.business_entity_source_policy_provenance.artifact_sha256,
        source_count: binding.business_entity_source_policy_provenance.source_count,
        profile_count: binding.business_entity_source_policy_provenance.profile_count,
        registry_release_id: binding.business_entity_source_policy_provenance.registry_release_id,
        registry_manifest_sha256: binding.business_entity_source_policy_provenance.registry_manifest_sha256,
        lifecycle_release_id: binding.business_entity_source_policy_provenance.lifecycle_release_id,
        lifecycle_manifest_sha256: binding.business_entity_source_policy_provenance.lifecycle_manifest_sha256,
        taxonomy_sha256: binding.business_entity_source_policy_provenance.taxonomy_sha256,
        temporal_release_id: binding.business_entity_source_policy_provenance.temporal_release_id,
        temporal_manifest_sha256: binding.business_entity_source_policy_provenance.temporal_manifest_sha256,
        source_profile_counts_sha256: binding.business_entity_source_policy_provenance.source_profile_counts_sha256,
        policy_files_verified: binding.business_entity_source_policy_provenance.policy_files_verified,
        profile_policy_rows_verified: binding.business_entity_source_policy_provenance.profile_policy_rows_verified,
        profile_export_policy_counts: binding.business_entity_source_policy_provenance.profile_export_policy_counts,
        authorization_granted: false, acquisition_authorized: false, export_authorized: false,
      },
    },
  };
}

function sameStatIdentity(left, right) {
  return left && right && left.isFile() && right.isFile() && !left.isSymbolicLink() && !right.isSymbolicLink()
    && left.dev === right.dev && left.ino === right.ino && left.nlink === 1n && right.nlink === 1n && left.size === right.size;
}

async function hashGeographyShard(artifact, signal, root = APP_ROOT) {
  const file = path.join(root, 'data/business-entity-geography-relationship/releases', GEOGRAPHY_RELATIONSHIP.release_id, artifact.path);
  const parent = path.dirname(file), actualParent = await realpath(parent);
  check(path.resolve(actualParent).toLowerCase() === path.resolve(parent).toLowerCase(), 'geography shard parent path');
  const before = await lstat(file, { bigint: true });
  check(before.isFile() && !before.isSymbolicLink() && before.nlink === 1n && before.size === BigInt(artifact.bytes), 'geography shard file identity/size');
  const handle = await open(file, 'r'), opened = await handle.stat({ bigint: true });
  const digest = createHash('sha256'); let consumed = 0;
  try {
    check(sameStatIdentity(before, opened), 'geography shard read identity');
    for (;;) {
      signal?.throwIfAborted();
      const buffer = Buffer.alloc(1024 * 1024), result = await handle.read(buffer, 0, buffer.length, null);
      if (!result.bytesRead) break;
      consumed += result.bytesRead; check(consumed <= artifact.bytes, 'geography shard byte ceiling');
      digest.update(buffer.subarray(0, result.bytesRead));
    }
    const after = await handle.stat({ bigint: true }), namedAfter = await lstat(file, { bigint: true });
    check(sameStatIdentity(before, after) && sameStatIdentity(before, namedAfter) && consumed === artifact.bytes
      && digest.digest('hex') === artifact.sha256, 'geography shard bytes/hash');
  } finally { await handle.close(); }
}

async function readVerifiedBusinessEntityGeographyBinding({ root = APP_ROOT, signal } = {}) {
  root = path.resolve(root);
  signal?.throwIfAborted();
  const registration = await snapshot(GEOGRAPHY_RELATIONSHIP.registration_path, signal, root);
  check(registration.evidence.sha256 === GEOGRAPHY_RELATIONSHIP.registration_sha256
    && registration.value.schema_version === 'business-entity-geography-relationship-registration@1.0.0'
    && registration.value.dataset_id === 'business-entity-geography-relationship'
    && registration.value.status === 'registered-pointer-free-local-review-only'
    && registration.value.runtime_pointer === null && registration.value.current_pointer_written === false
    && registration.value.production_enrollment === false
    && registration.value.selected_release_id === GEOGRAPHY_RELATIONSHIP.release_id,
  'registered business entity geography selection');
  const selected = registration.value.retained_releases?.filter(row => row.selected === true) ?? [];
  check(selected.length === 1 && selected[0].release_id === GEOGRAPHY_RELATIONSHIP.release_id
    && selected[0].manifest === GEOGRAPHY_RELATIONSHIP.manifest_path
    && selected[0].manifest_sha256 === GEOGRAPHY_RELATIONSHIP.manifest_sha256
    && selected[0].profile_count === GEOGRAPHY_RELATIONSHIP.profile_count,
  'selected business entity geography registration row');
  const manifestRead = await snapshot(GEOGRAPHY_RELATIONSHIP.manifest_path, signal, root), manifest = manifestRead.value;
  check(manifestRead.evidence.sha256 === GEOGRAPHY_RELATIONSHIP.manifest_sha256
    && manifest.schema_version === 'business-entity-geography-relationship-release@1.0.0'
    && manifest.dataset_id === 'business-entity-geography-relationship'
    && manifest.release_id === GEOGRAPHY_RELATIONSHIP.release_id
    && manifest.status === 'immutable-pointer-free-local-review-only' && manifest.publication_mode === 'pointer-free',
  'selected business entity geography manifest');
  const expectedUpstream = {
    registry: { dataset_id: 'national-business-registry', release_id: 'national-business-registry-20260911-022652067Z-1ec656c3', manifest_sha256: 'd8ab131697b1df63ed53fdfa9832d6973fd152ddf23565219ee9bb39b25fbb76', profile_artifact_inventory_sha256: 'da61ea20bac546e9368d95923c54d0a6a0960f206d806782bf9760091ab5aa80' },
    geography: { release_id: 'us-census-geography-20260830-132803990Z-3629abc0', manifest_sha256: '5426cae150c0fba64f8ff43a48ca39c4e78b5b4ba8a8007fbd211615540d1c8b', zcta_index_sha256: '41cbef263f88514d6c6e139e54527350c23f9e05a96a9576a6d7b2478f28ffc6', state_index_sha256: '1be852f9ad38113b0be04e6936b1de402bf3718837c452b8496f926d1edde806', county_index_sha256: 'ced563e654fb427f0e49bc3402270d13f97a17f91961fb26601b3a301deed997', county_geometry_inventory_sha256: '993e450f60492f7c651020e7135caf6d92b5f30a5a54d2adee8ad2fe9d9c38ae' },
    crosswalk: { release_id: 'us-census-zcta-jurisdiction-crosswalk-20260830-222631137Z-4b9227f8', manifest_sha256: '02e19bd98ad587426628cd50013942acc0cc3e9c9a48ac653eaf96cf534b8fe2', artifact_inventory_sha256: 'd9c4eb9abd61b2fcb07250c204574db75d41b6d7a399aa1d8e0910a333d3ce68' },
    zip_quality: { release_id: 'registry-zip-quality-index-4b454f2383f5932e9cb89734e2c120ed7ec85276cc43f5e8fa65409583d4e430', manifest_sha256: '1ecbc4cb23d59e584d4528a4f65c23ed9fe4f658e134864416731fc48130941c', artifact_inventory_sha256: '7c25adad40bc907e9fd5007b43d6186b4dff882a4ae9807babcbf583b0fa26d8' },
    zip_audit: { release_id: 'zip-denominator-gap-cohort-20261003072243230-9f1be37aa2eb', manifest_sha256: '792361841d937a508d0243b22cf3c7b3fe67e32d2749adadca299ad59c21f8ea', cohort_sha256: 'c33c344ddf23c1ac3cc13bfa21365f80b6f489ae318e0d68e94cbb4f381fa3d9' },
    point_assignment: { release_id: 'national-business-coverage-views-20260911-040908332Z-f01c882a', manifest_sha256: 'f15d43dda3acfb2e81fe2cd0360ec8dfba9f3061597c62c2eb8d1953bdc706b6', summary_sha256: 'c9d9a8d3dd60cdcf6c734c3d2e327997c8c945260165a976e7cb2b0bfa284f0d', summary_artifact_sha256: 'c9d9a8d3dd60cdcf6c734c3d2e327997c8c945260165a976e7cb2b0bfa284f0d' },
    assignment_algorithms: { 'runner/business-location-profile-contract.mjs': '3bd48cbcca6da9df262f2776605295fdd267f5d150ea61860e0bdefa9a851d81', 'runner/national-business-coverage-views.mjs': 'b78c7a0098116f6a8a90fcf8199ac2a6045dc303c4f6e3b77a984ce73c68ad6f', 'runner/dc-basic-business-licenses.mjs': '8c637589cfd128ece36ed1aa49c5a609d76e5a5d0dd66d3e9e50d363ae7cad57' },
  };
  check(same(manifest.bindings, expectedUpstream), 'business entity geography upstream release pins');
  check(same(manifest.claims, { current_operation_verified: false, postal_validity_verified: false, entity_polygon_present: false,
    zcta_point_assignment_performed: false, network_requests: 0, source_acquisition_performed: false, source_bytes_modified: false,
    current_pointer_written: false, production_enrollment: false, production_execution: false }), 'business entity geography closed claims');
  check(manifest.summary?.profiles === GEOGRAPHY_RELATIONSHIP.profile_count
    && same(manifest.summary.postal, GEO_POSTAL_COUNTS) && same(manifest.summary.point, GEO_POINT_COUNTS)
    && manifest.summary.reported_state_conflict === 11, 'business entity geography exact summary');
  const artifacts = manifest.artifacts;
  check(Array.isArray(artifacts) && artifacts.length === GEOGRAPHY_RELATIONSHIP.artifact_count
    && hash(JSON.stringify(canonical(artifacts))) === GEOGRAPHY_RELATIONSHIP.artifact_inventory_sha256,
  'business entity geography exact shard inventory');
  let records = 0;
  for (let index = 0; index < artifacts.length; index++) {
    signal?.throwIfAborted();
    const artifact = artifacts[index], zip2 = String(index).padStart(2, '0');
    check(artifact.path === `relationships/zip2=${zip2}.jsonl.gz` && artifact.artifact_type === 'business-entity-geography-relationship-jsonl-gzip'
      && count(artifact.bytes) && count(artifact.record_count) && SHA.test(artifact.sha256), 'business entity geography shard roster');
    records += artifact.record_count;
    await hashGeographyShard(artifact, signal, root);
  }
  check(records === GEOGRAPHY_RELATIONSHIP.profile_count, 'business entity geography shard conservation');
  const claims = manifest.claims;
  const binding = {
    registration_path: GEOGRAPHY_RELATIONSHIP.registration_path, registration_sha256: registration.evidence.sha256,
    release_id: manifest.release_id, manifest_path: GEOGRAPHY_RELATIONSHIP.manifest_path, manifest_sha256: manifestRead.evidence.sha256,
    artifact_inventory_sha256: hash(JSON.stringify(canonical(artifacts))), artifact_count: artifacts.length,
    profile_count: manifest.summary.profiles, registry_profile_count: GEOGRAPHY_RELATIONSHIP.profile_count,
    artifacts, postal_counts: manifest.summary.postal, point_assignment_counts: manifest.summary.point,
    reported_state_conflict_count: manifest.summary.reported_state_conflict,
    claims,
    semantics: { usps_operational_assignment_verified: false, usps_deliverability_verified: false,
      same_code_zcta_is_membership: false, zcta_point_assignment_performed: false, entity_polygons_present: false },
    upstream: {
      registry_release_id: expectedUpstream.registry.release_id, registry_manifest_sha256: expectedUpstream.registry.manifest_sha256,
      geography_release_id: expectedUpstream.geography.release_id, geography_manifest_sha256: expectedUpstream.geography.manifest_sha256,
      crosswalk_release_id: expectedUpstream.crosswalk.release_id, crosswalk_manifest_sha256: expectedUpstream.crosswalk.manifest_sha256,
      zip_audit_release_id: expectedUpstream.zip_audit.release_id, zip_audit_manifest_sha256: expectedUpstream.zip_audit.manifest_sha256,
      zip_quality_release_id: expectedUpstream.zip_quality.release_id, zip_quality_manifest_sha256: expectedUpstream.zip_quality.manifest_sha256,
      point_assignment_release_id: expectedUpstream.point_assignment.release_id, point_assignment_manifest_sha256: expectedUpstream.point_assignment.manifest_sha256,
      point_assignment_summary_sha256: expectedUpstream.point_assignment.summary_sha256,
    },
  };
  return binding;
}

async function readObjectiveReadiness({ signal }) {
  signal?.throwIfAborted();
  const sampleZip = '00501';
  const [entity, industry, industryTemporal, industrySummary, temporal, temporalReconciliation, publisherMembership, sourceStatusPosture, coRegistrationStatusPosture, loadedGoal, broad, lifecycle] = await Promise.all([
    readZipEntityResolutionEvidence({ zip5: sampleZip, signal }),
    readExactZipIndustryEvidenceV29({ zip5: sampleZip, signal }),
    readExactZipIndustryEvidenceWithTemporalQualificationV29({zip5:sampleZip,signal}),
    readExactZipIndustrySummaryV29({signal}),
    readNationalBusinessTemporalClaimRows({ signal }),
    verifyNationalBusinessTemporalLifecycleReconciliation({ signal }),
    verifyNationalBusinessTemporalLifecycleReconciliationV11({ signal }),
    verifyNationalBusinessSourceStatusPosture({ signal }),
    verifyNationalBusinessCoRegistrationStatusPosture({ signal }),
    readNewestNationalGoalCompletionMatrix(),
    loadBroadOrganizationAuthorizationProgramManagementView(),
    readBusinessEntityLifecycleEligibilitySummary({ signal }).catch(error => {
      if (signal?.aborted || error?.name === 'AbortError') throw error;
      const failure = new Error('Selected lifecycle release is unavailable or invalid.'); failure.code = 'LIFECYCLE_RELEASE_INVALID'; throw failure;
    }),
  ]);
  const geographyRelationship = await readVerifiedBusinessEntityGeographyBinding({ signal });
  const reportingVerified = await verifyReportingOnlySiteQualification({ signal }).catch(error => {
    if (signal?.aborted || error?.name === 'AbortError') throw error;
    const failure = new Error('Selected reporting-only site qualification is unavailable or invalid.'); failure.code = 'REPORTING_SITE_RELEASE_INVALID'; throw failure;
  });
  const reportingSites = await readReportingOnlySiteQualification({ signal });
  const sourcePolicyProvenance = await readBusinessEntitySourcePolicyProvenance({ signal }).catch(error => {
    if (signal?.aborted || error?.name === 'AbortError') throw error;
    const failure = new Error('Selected source-policy provenance is unavailable or invalid.'); failure.code = 'SOURCE_POLICY_PROVENANCE_INVALID'; throw failure;
  });
  check(reportingVerified.release_id === REPORTING_SITES.release_id && reportingVerified.manifest_sha256 === REPORTING_SITES.manifest_sha256
    && reportingVerified.artifact_sha256 === REPORTING_SITES.artifact_sha256 && reportingVerified.summary.site_count === REPORTING_SITES.record_count,
    'verified reporting-only site qualification release');
  const [industryRegistration,industryTemporalRegistration,industrySummaryRegistration]=await Promise.all([
    snapshot('config/datasets/national-exact-zip-industry-evidence-matrix-v2-9.json',signal),snapshot('config/datasets/exact-zip-industry-temporal-qualification-v2-9.json',signal),snapshot('config/datasets/national-exact-zip-industry-summary-v2-9.json',signal)]);
  const industryPin = industryRegistration.value.retained_release;
  check(industryRegistration.value.dataset_id === 'national-exact-zip-industry-evidence-matrix' && industryRegistration.value.runtime_pointer === null
    && industryRegistration.value.production_enrollment === false && industryPin?.release_id === industry.release_id
    && industryPin?.manifest_sha256 === industry.manifest_sha256 && industryPin?.zip5_rows === 48194&&industryPin?.dimension_count===50
    && industryPin?.industry_cells === 2409700&&industryRegistration.evidence.sha256==='694d650ef277bb7b27c7df05c78e938afa1e99d1495a67910180ecc08609dfba', 'registered industry-matrix release binding');
  check(industryTemporalRegistration.evidence.sha256==='81bae1e6987ee9273648b3d3e31a55359d34cd5e3d9f49799043bd6b22a6d9bd'
    &&industryTemporalRegistration.value.matrix_release_id===industry.release_id&&industryTemporalRegistration.value.matrix_manifest_sha256===industry.manifest_sha256
    &&industryTemporal.temporal_qualification.rows.length===50&&industryTemporal.temporal_qualification.rows.length*industryPin.zip5_rows===2409700
    &&industryTemporal.temporal_qualification.claims.current_operations_verified===false&&industryTemporal.temporal_qualification.claims.active_business_count===null
    &&industryTemporal.temporal_qualification.claims.all_business_completion_percent===null,'v2.9 temporal qualification binding');
  check(industrySummaryRegistration.evidence.sha256==='07c2220e6e445548869695374907fffeeb70d90279a32b0d6988110f8f020e3e'
    &&industrySummaryRegistration.value.matrix_release_id===industry.release_id&&industrySummaryRegistration.value.matrix_manifest_sha256===industry.manifest_sha256
    &&industrySummary.schema_version==='national-exact-zip-industry-summary-view@2.9.0'&&industrySummary.release_id===industry.release_id
    &&industrySummary.source_dimensions===50&&industrySummary.industry_cells===2409700
    &&Object.values(industrySummary.raw_status_counts).reduce((sum,count)=>sum+count,0)===2409700
    &&Object.values(industrySummary.evidence_state_counts).reduce((sum,count)=>sum+count,0)===2409700
    &&industrySummary.zbp_dispositions.every(row=>row.raw_status!==row.evidence_state)&&industrySummary.claims.current_operation_verified===false
    &&industrySummary.claims.all_business_completeness===false
    &&industry.recursive_lineage_verified===true
    &&industrySummary.temporal_qualification.semantic_dimension_counts['publisher-active-snapshot']===3
    &&industrySummary.temporal_qualification.semantic_dimension_counts['unknown-source-status']===1
    &&['ca_abc_active_issued_license_physical_sites','dc_active_basic_business_license_physical_sites','tx_active_sales_tax_permitted_outlet_physical_sites']
      .every(id=>industryTemporal.temporal_qualification.rows.some(row=>row.dimension_id===id&&row.semantic_class==='publisher-active-snapshot'&&row.current_operations_verified===false&&row.continuous_operation_verified===false))
    &&industryTemporal.temporal_qualification.rows.some(row=>row.dimension_id==='la_publisher_active_listing_location_account_sites'&&row.semantic_class==='unknown-source-status'&&row.municipal_scope==='City of Los Angeles'&&row.current_operations_verified===false&&row.continuous_operation_verified===false)
    &&industryTemporal.temporal_qualification.rows.some(row=>row.dimension_id==='ak_active_business_license_conditional_physical_sites'&&row.semantic_class==='source-defined-current'&&row.publisher_jurisdiction==='Alaska'&&row.reported_address_jurisdiction_may_differ===true&&row.current_operations_verified===false&&row.continuous_operation_verified===false&&row.site_occupancy_verified===false&&row.public_access_verified===false&&row.coordinates_available===false&&row.evidence_disposition?.additive===false)
    &&industryTemporal.temporal_qualification.rows.some(row=>row.dimension_id==='chicago_current_active_business_license_physical_sites'&&row.semantic_class==='source-defined-current'&&row.publisher_jurisdiction==='City of Chicago'&&row.reported_address_jurisdiction_may_differ===true&&row.address_jurisdiction_inferred===false&&row.current_operations_verified===false&&row.continuous_operation_verified===false&&row.site_occupancy_verified===false&&row.public_access_verified===false&&row.unique_business_count===null&&row.record_export_policy==='local-review-only'&&row.evidence_disposition?.additive===false),
  'v2.9 national summary binding');
  check(entity.available && entity.registration_sha256 && entity.manifest_sha256 === '742ffc2d35cc3f4e5541cc2325879b2da563ae7565a9d86829e9ec20560277ba'
    && entity.evidence?.entity_resolution_applied === false && entity.evidence?.benchmark_gate_passed === false, 'registered ZIP entity-resolution evidence');
  check(industry.status === 'present' && industry.release_id === 'national-exact-zip-industry-evidence-matrix-3533736fa5e0a27f0b4c5e4cb8e7d2af4aa04c2f0c97c4da7eff620df31f7ff7'
    && industry.manifest_sha256 === '9c6fa25f318d3b89f7f24efa15340d56b38a72691e40e5c4ebde22b45281c975'
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
  check(temporalReconciliation.verified===true&&temporalReconciliation.registration.sha256==='5e252823ead165ab672c94bce0f38f84ad9629c6461ded829fa67ced0a7371ad'
    &&temporalReconciliation.provenance.temporal.release_id===temporal.provenance.release_id&&temporalReconciliation.provenance.temporal.manifest_sha256===temporal.provenance.manifest_sha256
    &&same(temporalReconciliation.summary.effective_classification_counts,{'source-defined-current-membership':21,'non-active-reporting-membership':7,'annual-aggregate':1,'unknown-source-status':1})
    &&temporalReconciliation.summary.classification_mismatches===1&&temporalReconciliation.summary.mismatch_profiles===633232
    &&temporalReconciliation.mismatch.source_key==='la_active_business_location_accounts'&&temporalReconciliation.mismatch.effective_profile_classification==='unknown-source-status'
    &&temporalReconciliation.mismatch.current_operations_verified===false,'temporal lifecycle reconciliation authority');
  const temporalReconciliationBinding={release_id:'national-business-temporal-lifecycle-reconciliation@1.0.0',manifest_sha256:temporalReconciliation.provenance.lifecycle.manifest_sha256,registration_path:temporalReconciliation.registration.path,registration_sha256:temporalReconciliation.registration.sha256,
    schema_version:temporalReconciliation.schema_version,status:temporalReconciliation.status,temporal_release_id:temporalReconciliation.provenance.temporal.release_id,
    temporal_manifest_sha256:temporalReconciliation.provenance.temporal.manifest_sha256,temporal_artifact_sha256:temporalReconciliation.provenance.temporal.artifact_sha256,
    lifecycle_release_id:temporalReconciliation.provenance.lifecycle.release_id,lifecycle_manifest_sha256:temporalReconciliation.provenance.lifecycle.manifest_sha256,
    taxonomy_sha256:temporalReconciliation.provenance.taxonomy.sha256,effective_classification_counts:temporalReconciliation.summary.effective_classification_counts,
    classification_mismatches:1,mismatch_profiles:633232,los_angeles_effective_classification:'unknown-source-status',current_operations_verified:false,
    active_business_count:null,completeness_percentage:null};
  const publisherMembershipBinding={release_id:'national-business-temporal-lifecycle-reconciliation@1.1.0',manifest_sha256:publisherMembership.provenance.la_manifest_sha256,registration_path:publisherMembership.registration.path,registration_sha256:publisherMembership.registration.sha256,schema_version:publisherMembership.schema_version,publisher_cohort_assertion:publisherMembership.publisher_membership.assertion,profile_count:publisherMembership.publisher_membership.profile_count,lifecycle_evidence:publisherMembership.publisher_membership.lifecycle_evidence,active_business_eligible_count:0,current_operations_verified:false,active_business_count:null,completeness_percentage:null};
  const lifecycleBinding = {
    registration_path: lifecycle.registration_path, registration_sha256: lifecycle.registration_sha256,
    release_id: lifecycle.release_id, manifest_path: lifecycle.manifest_path, manifest_sha256: lifecycle.manifest_sha256,
    taxonomy_path: lifecycle.taxonomy_path, taxonomy_sha256: lifecycle.taxonomy_sha256,
    artifact_count: lifecycle.artifact_count, artifact_inventory_sha256: lifecycle.artifact_inventory_sha256,
    artifact_record_count: lifecycle.artifact_record_count,
    registry_release_id: lifecycle.registry_release_id, registry_manifest_sha256: lifecycle.registry_manifest_sha256,
    temporal_release_id: lifecycle.temporal_release_id, temporal_manifest_sha256: lifecycle.temporal_manifest_sha256,
    temporal_artifact_sha256: lifecycle.temporal_artifact_sha256,
    qualification_release_id: lifecycle.qualification_release_id, qualification_manifest_sha256: lifecycle.qualification_manifest_sha256,
    qualification_artifact_sha256: lifecycle.qualification_artifact_sha256,
    assessment_as_of: lifecycle.assessment_as_of, profile_count: lifecycle.summary.profile_count,
    registry_profile_count: lifecycle.registry_profile_count, release_manifest_verified: true,
    source_count: lifecycle.summary.source_count, source_status_value_count: lifecycle.summary.source_status_value_count,
    review_status_counts: lifecycle.summary.review_status_counts, lifecycle_evidence_counts: lifecycle.summary.lifecycle_evidence_counts,
    exception_counts: lifecycle.summary.exception_counts, current_operation_verified_count: 0, active_business_eligible_count: 0,
  };
  const sourcePolicyBinding = {
    registration_path: 'config/datasets/business-entity-source-policy-provenance.json',
    registration_sha256: sourcePolicyProvenance.registration_sha256,
    release_id: sourcePolicyProvenance.release_id,
    manifest_path: `data/business-entity-source-policy-provenance/releases/${sourcePolicyProvenance.release_id}/manifest.json`,
    manifest_sha256: sourcePolicyProvenance.manifest_sha256, artifact_path: 'source-policies.json',
    artifact_sha256: sourcePolicyProvenance.artifact_sha256, source_count: sourcePolicyProvenance.summary.source_count,
    profile_count: sourcePolicyProvenance.summary.profile_count, registry_release_id: sourcePolicyProvenance.registry_release_id,
    registry_manifest_sha256: sourcePolicyProvenance.registry_manifest_sha256,
    lifecycle_release_id: sourcePolicyProvenance.lifecycle_release_id, lifecycle_manifest_sha256: sourcePolicyProvenance.lifecycle_manifest_sha256,
    taxonomy_sha256: sourcePolicyProvenance.taxonomy_sha256, temporal_release_id: sourcePolicyProvenance.temporal_release_id,
    temporal_manifest_sha256: sourcePolicyProvenance.temporal_manifest_sha256,
    profile_export_policy_counts: sourcePolicyProvenance.summary.profile_export_policy_counts,
    source_profile_counts_sha256: hash(JSON.stringify(sourcePolicyProvenance.summary.source_profile_counts)),
    policy_files_verified: sourcePolicyProvenance.rows.filter(row => /^[a-f0-9]{64}$/.test(row.policy_profile_sha256 ?? '')).length,
    profile_policy_rows_verified: sourcePolicyProvenance.summary.profile_count,
    authorization_granted: false, acquisition_authorized: false, export_authorized: false,
  };
  const geographyRelationshipBinding = geographyRelationship;
  const reportingSources = reportingSites.provenance.bindings.sources;
  const reportingBinding = {
    registration_path: REPORTING_SITES.registration_path, registration_sha256: reportingSites.provenance.registration_sha256,
    release_id: reportingSites.provenance.release_id, manifest_sha256: reportingSites.provenance.manifest_sha256,
    artifact_sha256: reportingSites.provenance.artifact_sha256, record_count: reportingSites.provenance.record_count,
    cohort_kind: 'reporting-only', matching_profile_count: reportingSites.summary.matching_profile_count,
    registry_release_id: reportingSites.provenance.bindings.registry.release_id,
    registry_manifest_sha256: reportingSites.provenance.bindings.registry.manifest_sha256,
    reporting_artifact_inventory_sha256: reportingSites.provenance.bindings.registry.reporting_artifact_inventory_sha256,
    source_artifacts: reportingSites.provenance.bindings.registry.reporting_artifacts,
    source_manifest_hashes: Object.fromEntries(Object.entries(reportingSources).map(([state, source]) => [state, source.manifest_sha256])),
    source_manifest_policy_hashes: Object.fromEntries(Object.entries(reportingSources).map(([state, source]) => [state, source.source_manifest_policy_sha256])),
    policy_profile_hashes: Object.fromEntries(Object.entries(reportingSources).map(([state, source]) => [state, source.policy_profile_sha256])),
    source_bindings: reportingSources,
    temporal_release_id: reportingSites.provenance.bindings.temporal.release_id,
    temporal_manifest_sha256: reportingSites.provenance.bindings.temporal.manifest_sha256,
    temporal_artifact_sha256: reportingSites.provenance.bindings.temporal.artifact_sha256,
    temporal_registration_sha256: reportingSites.provenance.bindings.temporal.registration_sha256,
    zip_temporal_qualification_release_id: reportingSites.provenance.bindings.zip_temporal_qualification.release_id,
    zip_temporal_qualification_manifest_sha256: reportingSites.provenance.bindings.zip_temporal_qualification.manifest_sha256,
    zip_temporal_qualification_artifact_sha256: reportingSites.provenance.bindings.zip_temporal_qualification.artifact_sha256,
    assessment_as_of: reportingSites.provenance.bindings.zip_temporal_qualification.assessment_as_of,
    geography_release_id: reportingSites.provenance.bindings.geography.release_id,
    geography_manifest_sha256: reportingSites.provenance.bindings.geography.manifest_sha256,
    zcta_index_sha256: reportingSites.provenance.bindings.geography.zcta_index_sha256,
    county_geometry_inventory_sha256: reportingSites.provenance.bindings.geography.county_geometry_inventory_sha256,
    point_assignment_release_id: reportingSites.provenance.bindings.geography.point_assignment_release_id,
    point_assignment_manifest_sha256: reportingSites.provenance.bindings.geography.point_assignment_manifest_sha256,
    summary: reportingSites.summary, active_business_eligible_count: 0, active_business_verified_count: 0,
    current_operation_verified_count: 0, identity_matching_eligible_count: 0, usps_unverified_count: 13182,
    usps_operational_assignment_verified: false, usps_deliverability_verified: false,
    zcta_correspondence_is_membership: false, entity_polygons_present: false, export_policy: 'local-review-only',
  };
  check(reportingSites.provenance.registration_sha256 === REPORTING_SITES.registration_sha256, 'reporting-only registration hash');
  validateReportingOnlySiteBinding(reportingBinding);
  const bindings = {
    zip_entity_resolution: { registration_path: 'config/datasets/zip-entity-resolution-evidence.json', registration_sha256: entity.registration_sha256,
      release_id: 'zip-entity-resolution-evidence-576079155175db7c5abbedf9a81c5481c53294cfd74cfd23fa994b2decd67564',
      manifest_path: 'data/zip-entity-resolution-evidence/releases/zip-entity-resolution-evidence-576079155175db7c5abbedf9a81c5481c53294cfd74cfd23fa994b2decd67564/manifest.json',
      manifest_sha256: entity.manifest_sha256, source_release_id: ZIP_ENTITY_RELEASE, source_manifest_sha256: ZIP_ENTITY_MANIFEST_SHA,
      claims: { entity_resolution_applied: entity.evidence.entity_resolution_applied, benchmark_gate_passed: entity.evidence.benchmark_gate_passed } },
    zip_industry_matrix: { registration_path: 'config/datasets/national-exact-zip-industry-evidence-matrix-v2-9.json', registration_sha256: industryRegistration.evidence.sha256,
      release_id: industry.release_id, manifest_path: industryPin.manifest, manifest_sha256: industry.manifest_sha256, version: industry.schema_version,
      zip5_rows: industryPin.zip5_rows,dimension_count:industryPin.dimension_count, industry_cells: industryPin.industry_cells, recursive_lineage_verified:industry.recursive_lineage_verified, claims: industry.claims,
      temporal_qualification:{registration_path:'config/datasets/exact-zip-industry-temporal-qualification-v2-9.json',registration_sha256:industryTemporalRegistration.evidence.sha256,schema_version:industryTemporal.temporal_qualification.schema_version,dimension_count:industryTemporal.temporal_qualification.rows.length,qualification_cell_total:industryTemporal.temporal_qualification.rows.length*industryPin.zip5_rows,current_operations_verified:false,active_business_count:null,all_business_completion_percent:null},
      national_summary:{registration_path:'config/datasets/national-exact-zip-industry-summary-v2-9.json',registration_sha256:industrySummaryRegistration.evidence.sha256,schema_version:industrySummary.schema_version,dimension_count:industrySummary.source_dimensions,industry_cells:industrySummary.industry_cells,raw_status_cell_total:Object.values(industrySummary.raw_status_counts).reduce((sum,count)=>sum+count,0),derived_evidence_cell_total:Object.values(industrySummary.evidence_state_counts).reduce((sum,count)=>sum+count,0),raw_status_preserved_separately:true,current_operations_verified:false,all_business_completeness:false} },
    temporal_claim_matrix: { registration_path: 'config/datasets/national-business-temporal-claim-matrix.json', registration_sha256: temporalRegistration.evidence.sha256,
      release_id: temporal.provenance.release_id, manifest_path: selected[0].manifest_path, manifest_sha256: temporal.provenance.manifest_sha256, rows: temporal.rows.length,
      classification_counts: temporalClassCounts, summary: temporal.summary, claims: temporal.claims,
      semantic_rows_sha256: hash(JSON.stringify(temporal.rows)) },
    temporal_lifecycle_reconciliation: temporalReconciliationBinding,
    publisher_membership_reconciliation: publisherMembershipBinding,
    source_status_posture:{release_id:sourceStatusPosture.provenance.release_id,manifest_sha256:sourceStatusPosture.provenance.manifest_sha256,registration_sha256:sourceStatusPosture.provenance.taxonomy_sha256,profile_count:sourceStatusPosture.posture.profile_count,non_primary_reporting_count:sourceStatusPosture.posture.non_primary_reporting_count,business_activity_status:'unmeasured',current_operations_verified:false,active_business_eligible:false,active_business_count:null,completeness_percentage:null},
    organization_assertion_status_posture:{release_id:coRegistrationStatusPosture.provenance.release_id,manifest_sha256:coRegistrationStatusPosture.provenance.manifest_sha256,registration_sha256:coRegistrationStatusPosture.provenance.taxonomy_sha256,scope:coRegistrationStatusPosture.scope,good_standing_count:coRegistrationStatusPosture.posture.good_standing.organization_count,delinquent_count:coRegistrationStatusPosture.posture.delinquent.organization_count,location_profile_cohort_affected:false,current_operations_verified:false,active_business_eligible:false,active_business_count:null,completeness_percentage:null},
    goal_completion_matrix: { release_id: loadedGoal.report.release_id, manifest_path: goalManifestRel, manifest_sha256: goalManifest.evidence.sha256,
      report_sha256: goalManifest.value.artifacts?.[0]?.sha256, schema_version: loadedGoal.report.schema_version,
      jurisdiction_count: loadedGoal.report.jurisdictions.length, broad_layer_gaps: broadStateGapCount,
      all_business_completion_percent: loadedGoal.report.all_business_completion_percent },
    broad_organization_projection: { release_id: broad.metadata.release_id, manifest_sha256: broad.source_lineage.program_manifest_sha256,
      source_lineage: broad.source_lineage, metadata: broad.metadata, authority: broad.authority },
    lifecycle_eligibility: lifecycleBinding,
    business_entity_source_policy_provenance: sourcePolicyBinding,
    business_entity_geography_relationship: geographyRelationshipBinding,
    reporting_only_site_qualification: reportingBinding,
  };
  const readiness = { schema_version: 'national-zip-objective-readiness@1.6.0', assessment_as_of: '2026-10-02',
    acceptance_uplift: false, bindings, requirements_ledger: [
      { requirement: 'geography', status: 'achieved', evidence: 'Selected Census ZCTA index membership is verified; this is not an operational USPS ZIP denominator.' },
      { requirement: 'entity-geography-relationship', status: 'partial', profile_count: geographyRelationshipBinding.profile_count,
        registry_profile_count: geographyRelationshipBinding.registry_profile_count, postal_counts: geographyRelationshipBinding.postal_counts,
        point_assignment_counts: geographyRelationshipBinding.point_assignment_counts,
        reported_state_conflict_count: geographyRelationshipBinding.reported_state_conflict_count,
        usps_unverified_profile_count: geographyRelationshipBinding.profile_count,
        usps_operational_assignment_verified: false, usps_deliverability_verified: false,
        same_code_zcta_is_membership: false, entity_polygons_present: false,
        evidence: 'Retained profile geography relationships are checksum-verified but partial: most profiles lack a proven point assignment, postal validity/deliverability is unverified, and same-code ZCTA correspondence is not membership.' },
      { requirement: 'postal-denominator', status: 'blocked', evidence: 'No complete current USPS delivery-ZIP registry is established.' },
      { requirement: 'source-authorization-policy-and-provenance', status: 'partial', evidence: 'Selected retained releases and policy bindings are verified; operational/source use authority and complete source authorization remain unestablished.' },
      { requirement: 'broad-state-coverage', status: 'blocked', current_gap_count: broadStateGapCount, jurisdiction_count: 51, evidence: 'The newest verified goal matrix has unresolved broad-layer jurisdictions.' },
      { requirement: 'industry-coverage', status: 'unmeasured', zip5_rows: industryPin.zip5_rows, industry_cells: industryPin.industry_cells, evidence: 'ZIP industry dimensions exist, but the nationwide industry universe/denominator is not measured.' },
      { requirement: 'temporal-and-current-operation', status: 'blocked', effective_source_defined_current_membership_sources: 21, effective_non_active_reporting_sources: 7, effective_annual_aggregate_sources: 1, effective_unknown_status_sources: 1, source_cohort_current_membership_sources: 22, mismatch_profiles: 633232, verified_current_complete_jurisdictions: 0, evidence: 'Lifecycle reconciliation is authoritative for effective status; the retained source cohort labels and reference clocks do not independently verify current operation.' },
      { requirement: 'lifecycle-eligibility', status: lifecycleActiveEligibilityEstablished(lifecycleBinding) ? 'achieved' : 'blocked', profile_count: lifecycleBinding.profile_count,
        registry_profile_count: lifecycleBinding.registry_profile_count,
        active_business_eligible_count: lifecycleBinding.active_business_eligible_count,
        stale_count: lifecycleBinding.review_status_counts.stale,
        unknown_or_contradictory_count: lifecycleBinding.lifecycle_evidence_counts.unknown + lifecycleBinding.lifecycle_evidence_counts.contradictory,
        verified_current_operation_count: lifecycleBinding.current_operation_verified_count,
        evidence: 'Retained lifecycle evidence is conservative: stale, unknown, and contradictory profiles remain ineligible; no row independently verifies current operation.' },
      { requirement: 'reconciliation-and-benchmark', status: 'blocked', benchmark_gate_passed: false, entity_resolution_applied: false, evidence: 'ZIP linkage evidence is aggregate and unapplied; benchmark gate is not passed.' },
      { requirement: 'all-business-completeness-denominator', status: 'unmeasured', all_business_completion_percent: null, active_business_count: null, evidence: 'No verified national all-business denominator exists.' },
      { requirement: 'reporting-only-site-qualification', status: 'partial', site_count: 13182, matching_profile_count: 0,
        matching_profile_denominator: 8011835, combined_retained_site_evidence_count: 8025017,
        active_business_eligible_count: 0, current_operation_verified_count: 0, zip_present_count: 13010, zip_absent_count: 172,
        usps_unverified_count: 13182, point_assigned_count: 8942, point_assignment_ineligible_count: 4237,
        evidence: 'A separately retained reporting-only cohort is verified, but its sites are not matching profiles, active-eligible businesses, or USPS-verified ZIP assignments.' },
      { requirement: 'business-entity-source-policy-provenance', status: 'achieved', source_count: sourcePolicyBinding.source_count,
        profile_count: sourcePolicyBinding.profile_count, policy_files_verified: sourcePolicyBinding.policy_files_verified,
        profile_policy_rows_verified: sourcePolicyBinding.profile_policy_rows_verified, authorization_granted: false,
        acquisition_authorized: false, export_authorized: false,
        evidence: 'All 15 source policy profiles and lifecycle taxonomy pins are hash-verified for 8,011,835 retained profiles. This is provenance integrity only; it grants no acquisition, use, or export authority.' },
    ],
    blockers: [
      { code: 'entity-resolution-benchmark-gate-not-passed' },
      { code: 'entity-resolution-not-applied' },
      { code: 'nationwide-industry-universe-unmeasured' },
      { code: 'broad-jurisdiction-source-gaps', count: broadStateGapCount },
      { code: 'current-operation-not-independently-verified' },
      { code: 'reporting-only-sites-not-eligible-or-verified', count: 13182 },
      ...(!entityGeographyRequirementComplete(geographyRelationshipBinding) ? [{ code: 'entity-geography-relationship-not-complete' }] : []),
      ...(!lifecycleActiveEligibilityEstablished(lifecycleBinding) ? [{ code: 'lifecycle-active-eligibility-not-established', profile_count: lifecycleBinding.profile_count,
        eligible_count: lifecycleBinding.active_business_eligible_count, verified_current_operation_count: lifecycleBinding.current_operation_verified_count }] : []),
      ...(lifecycleBinding.review_status_counts.stale > 0 ? [{ code: 'lifecycle-stale-records-present', count: lifecycleBinding.review_status_counts.stale }] : []),
      ...((lifecycleBinding.lifecycle_evidence_counts.unknown + lifecycleBinding.lifecycle_evidence_counts.contradictory) > 0
        ? [{ code: 'lifecycle-unknown-or-contradictory', count: lifecycleBinding.lifecycle_evidence_counts.unknown + lifecycleBinding.lifecycle_evidence_counts.contradictory }] : []),
    ],
    claims: { acceptance: false, report_only: true, network_requests: 0, writes: 0, releases_created: false, pointers_changed: false,
      current_operations_verified: false, all_business_completion_percent: null, public_export_authorized: false } };
  validateGoalReadinessBindings(readiness);
  return readiness;
}

async function snapshot(relative, signal, root = APP_ROOT) {
  check(typeof relative === 'string' && !path.isAbsolute(relative) && relative.split('/').every(part => part && part !== '.' && part !== '..') && !relative.includes('\\'), 'unsafe evidence path');
  const meter = {}, value = await readJson(path.join(root, relative), 4_000_000, signal, meter);
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
      source_contributed_outside_selected_zcta_count: [...contributionMembers].filter(zip => zip !== '00000' && !zctaMembers.has(zip)).length,
      denominator_only_outside_selected_zcta_count: [...zipMembers].filter(zip => !contributionMembers.has(zip) && !zctaMembers.has(zip)).length,
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
