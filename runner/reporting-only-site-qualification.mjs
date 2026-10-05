import path from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { lstat, readFile, mkdir, writeFile, realpath } from 'node:fs/promises';
import { APP_ROOT } from './paths.mjs';
import { loadReportingSiteGeographyContext } from './business-entity-geography-relationship.mjs';
import { normalizeCoordinateGeocode } from './business-location-profile-contract.mjs';
import { assignPointToCounty } from './national-business-coverage-views.mjs';
import { readNationalBusinessTemporalClaimRows } from './national-business-temporal-claim-matrix-reader.mjs';
import { readExactZipIndustryTemporalQualification } from './exact-zip-industry-temporal-qualification.mjs';

export const REPORTING_ONLY_SITE_QUALIFICATION_VERSION = 'reporting-only-site-qualification@1.1.0';
const DATASET = 'reporting-only-site-qualification';
const REGISTRY_RELEASE = 'national-business-registry-20260911-022652067Z-1ec656c3';
const REGISTRY_SHA = 'd8ab131697b1df63ed53fdfa9832d6973fd152ddf23565219ee9bb39b25fbb76';
const AS_OF = '2026-10-02T16:30:00.000Z';
const SOURCE = Object.freeze({
  MA: { id: 'ma-licensed-center-based-childcare', key: 'ma_childcare_centers', dimension: 'childcare_ma_reporting_centers', manifest: 'data/industry-segments/runs/ma-app-acquisition-20260907-02/state-ma-childcare-MA/releases/ma-childcare-2fd11c60-e9e8-488f-8693-f44bd03582d6/manifest.json', manifestSha: 'c6d811e5743a03d7126d1e34b3763f4c1acbd495a5b4cf68f82c716c50fba1fc', policyId: 'massgis-eec-childcare-local-review', policyPath: 'config/source-policies/massgis-eec-childcare-local-review.json', policySha: '8a2812e436c3b2bc9c4c88dd2299d406b8d8610cd88f851a9f5f664fa43a4742', count: 3007, statuses: { Current: 'source-defined-current', 'Renewal in progress': 'non-active-reporting', Expired: 'non-active-reporting', 'Regional Enrollment Freeze': 'unknown' } },
  NJ: { id: 'nj-licensed-childcare-centers', key: 'nj_childcare_centers', dimension: 'childcare_nj_reporting_centers', manifest: 'data/business-sources/nj-licensed-childcare-centers-reprocessed/releases/nj-childcare-c79b679e-3267-4238-b4c6-6b43dbef9812/manifest.json', manifestSha: 'b873a912c61e1cc13b53bac9ad6265380625344e3d9bb7795217913b8632049e', policyId: 'njdep-childcare-local-review', policyPath: 'config/source-policies/njdep-childcare-local-review.json', policySha: '3a935abc814e7f46e6048bdb20ec25c67b3a70aa4cfb81b0d9494a35c9cb26cc', count: 4075, statuses: {} },
  TN: { id: 'tn-dhs-active-childcare-centers', key: 'tn_childcare_centers', dimension: 'childcare_tn_reporting_centers', manifest: 'data/business-sources/tn-dhs-active-childcare-centers-recovered/releases/tn-childcare-recovered-307bc79c-4f4f-4c77-a349-73dfd9fb1801/manifest.json', manifestSha: '98234ee44e52e9fcf8cdecfb1812b49029a2444316832df95f90b18518ffa55d', policyId: 'tn-childcare-local-review', policyPath: 'config/source-policies/tn-childcare-local-review.json', policySha: '06b8b84549c26d2e3bcabdb89244463ef5fbd525c88170aab548b42267e1110e', count: 1863, statuses: { Active: 'source-defined-current' } },
  OH: { id: 'oh-dcy-publisher-open-childcare-centers', key: 'oh_childcare_centers', dimension: 'childcare_oh_reporting_centers', manifest: 'data/industry-segments/runs/bd35c825-a6d0-4922-8508-7954ce00f5d5/state-oh-childcare-OH/normalized/releases/oh-childcare-c253c884-2048-47f9-8d7f-5ed29531acee/manifest.json', manifestSha: 'e4de0ed529da81c09522c52b9990b41a1edad1adf906f9eea2b95363ff241171', policyId: 'oh-childcare-local-review', policyPath: 'config/source-policies/oh-childcare-local-review.json', policySha: 'f1aa0c95eb96ba2cb6d10e75ded2011890cea61816d7b8b337ef1081dda4b6e2', count: 4237, statuses: { Open: 'source-defined-current' } },
});
const ARTIFACT_PATHS = Object.freeze([
  'reporting/location-evidence/zip2=01/records.jsonl.gz', 'reporting/location-evidence/zip2=02/records.jsonl.gz',
  'reporting/location-evidence/zip2=07/records.jsonl.gz', 'reporting/location-evidence/zip2=08/records.jsonl.gz',
  'reporting/location-evidence/zip2=37/records.jsonl.gz', 'reporting/location-evidence/zip2=38/records.jsonl.gz',
  'reporting/location-evidence/zip2=43/records.jsonl.gz', 'reporting/location-evidence/zip2=44/records.jsonl.gz',
  'reporting/location-evidence/zip2=45/records.jsonl.gz', 'reporting/location-evidence/zip2=unassigned/records.jsonl.gz',
]);
const EXPECTED = Object.freeze({ total: 13182, withZip: 13010, withoutZip: 172, bySource: { MA: 3007, NJ: 4075, TN: 1863, OH: 4237 },
  zipGaps: { 'missing-source-zip': 27, 'invalid-source-zip-placeholder': 145 }, pointAssigned: 8942, ohIneligible: 4237, tnMissingPoint: 3 });
const check = (value, message = 'Reporting-only site qualification rejected.') => { if (!value) throw new Error(message); };
const sha = value => createHash('sha256').update(value).digest('hex');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
const stable = value => JSON.stringify(canonical(value));

async function boundedJson(file, max = 8_000_000) {
  const stat = await lstat(file); check(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.size <= max);
  const bytes = await readFile(file); check(bytes.length === stat.size);
  return { value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), sha256: sha(bytes), bytes };
}
export async function readContainedPolicyProfile({ root = APP_ROOT, relativePath, sourceState } = {}) {
  const expected = SOURCE[sourceState]; check(expected && relativePath === expected.policyPath, 'unrecognized reporting policy profile path');
  check(typeof relativePath === 'string' && !path.isAbsolute(relativePath)
    && path.normalize(relativePath).replaceAll('\\', '/') === relativePath
    && !relativePath.split('/').some(part => !part || part === '.' || part === '..'), 'reporting policy path traversal');
  const rootPath = path.resolve(root), rootReal = await realpath(rootPath);
  check(rootReal === rootPath, 'reporting policy root must not be a link');
  let cursor = rootPath;
  const parts = relativePath.split('/');
  for (let index = 0; index < parts.length; index++) {
    cursor = path.join(cursor, parts[index]);
    const stat = await lstat(cursor);
    check(!stat.isSymbolicLink() && (index === parts.length - 1 ? stat.isFile() && stat.nlink === 1 && stat.size <= 128_000 : stat.isDirectory()),
      'reporting policy path must be contained, single-link, and bounded');
  }
  const stat = await lstat(cursor), bytes = await readFile(cursor);
  check(bytes.length === stat.size, 'reporting policy changed during read');
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  check(value.policy_id === expected.policyId && value.version === '1.0.0'
    && value.publisher && value.export_policy === 'local-review-only'
    && typeof value.redistribution === 'string' && /not authorized|not-authorized/i.test(value.redistribution)
    && value.contains_personal_data === true && value.contains_secrets === false
    && Array.isArray(value.allowed_use) && value.allowed_use.some(item => /local.review/i.test(item))
    && Array.isArray(value.prohibited_use) && value.prohibited_use.some(item => /operation|ownership|identity|completeness|redistribution/i.test(item))
    && value.field_export_policy && Object.values(value.field_export_policy).includes('local-review-only')
    && (!Object.hasOwn(value, 'acquisition_authorized') || value.acquisition_authorized === false)
    && (!Object.hasOwn(value, 'legal_approval') || value.legal_approval === false)
    && (!Object.hasOwn(value, 'agreement_acceptance_performed') || value.agreement_acceptance_performed === false)
    && (!Object.hasOwn(value, 'export_authorized') || value.export_authorized === false)
    && !value.contains_secrets, `${sourceState} source policy identity or local-review semantics`);
  const digest = sha(bytes); check(digest === expected.policySha, `${sourceState} authoritative policy profile hash`);
  return { value, sha256: digest, bytes };
}
function classifyLifecycle(source, row, semantic, qualification) {
  const value = row.source_status?.status_source ?? null;
  let lifecycle_evidence = 'unknown', source_membership_class = 'unknown-source-status', reason = 'source-status-not-retained';
  if (source.key === 'nj_childcare_centers' && value === null) reason = 'null-status-means-layer-membership-only';
  else if (value !== null) {
    check(Object.hasOwn(source.statuses, value), `Unknown closed source status: ${source.id}/${value}`);
    lifecycle_evidence = source.statuses[value] === 'unknown' ? 'unknown'
      : semantic.classification === 'source-defined-current-membership' ? 'source-defined-current' : 'non-active-reporting';
    source_membership_class = lifecycle_evidence === 'unknown' ? 'unknown-source-status' : lifecycle_evidence === 'source-defined-current' ? 'source-defined-current-membership' : 'non-active-reporting-membership';
    reason = lifecycle_evidence === 'source-defined-current' ? 'publisher-status-is-not-operation-verification'
      : lifecycle_evidence === 'non-active-reporting' ? 'publisher-status-is-not-current-operation' : 'ambiguous-source-label-fails-closed';
  }
  check(semantic.source_key === source.key && semantic.profile_source_id === source.id
    && ['source-defined-current-membership', 'non-active-reporting-membership'].includes(semantic.classification));
  check(qualification.source_key === source.key && qualification.source_release_id === row.source.source_release_id
    && qualification.review_qualification === 'unmeasured' && qualification.current_operations_verified === false);
  return { source_membership_class, lifecycle_evidence, review_status: 'unmeasured', assessment_as_of: AS_OF,
    semantic_source_class: semantic.classification, source_status_term: semantic.source_status_term,
    source_status_value: value, source_status_interpretation: row.source_status?.status_interpretation ?? null,
    current_operation_verified: false, active_business_eligible: false, reason_codes: [reason, 'source-review-window-unmeasured'] };
}
function classifyGeography(row, source, context) {
  const zip = row.zip_code;
  let postalClassification, zipReason = row.evidence?.zip_unavailable_reason ?? null;
  if (zip === null) {
    check(source.key === 'tn_childcare_centers' && ['missing-source-zip', 'invalid-source-zip-placeholder'].includes(zipReason));
    postalClassification = zipReason;
  } else {
    check(/^\d{5}$/.test(zip) && row.address?.zip_code === zip && row.address?.postal_code === zip
      && (row.address?.zip4 === null || /^\d{4}$/.test(row.address.zip4)) && !zipReason
      && context.zipClasses.has(zip), 'reporting source ZIP contract');
    postalClassification = context.zctaCodes.has(zip) ? 'same-code-zcta-candidate' : 'outside-zcta';
  }
  let point;
  if (source.key === 'oh_childcare_centers') {
    check(row.governed_geographic_assignment_eligible === false);
    point = { status: 'assignment-ineligible-by-source-policy', county_geoid: null, state_fips: null };
  } else {
    const geocode = normalizeCoordinateGeocode(row.location ?? null);
    if (!geocode || geocode.latitude === null || geocode.longitude === null) {
      point = { status: 'missing-geocode', county_geoid: null, state_fips: null };
    } else {
      const assignment = assignPointToCounty([geocode.longitude, geocode.latitude], context.countyIndex);
      if (assignment.status === 'assigned-single-county') point = { status: assignment.status, county_geoid: assignment.county.geoid, state_fips: assignment.county.stateFips };
      else point = { status: assignment.status === 'coordinate-not-in-county-polygon' ? 'unmatched' : assignment.status === 'ambiguous-county-boundary' ? 'ambiguous' : 'invalid-coordinate', county_geoid: null, state_fips: null };
    }
  }
  return { postal: { zip_code: zip, zip4: row.address?.zip4 ?? null, classification: postalClassification,
      zip_unavailable_reason: zipReason, usps_operational_assignment: null, usps_deliverability: null },
    source_reported_state: row.address?.state ?? null,
    code_correspondence: { status: postalClassification === 'same-code-zcta-candidate' ? 'same-code-census-zcta-candidate' : 'not-established', zcta_geoid: postalClassification === 'same-code-zcta-candidate' ? zip : null, membership: false },
    point_assignment: point,
    claims: { current_operation_verified: false, postal_validity_verified: false, entity_polygon_present: false, zcta_membership: false, zip_to_state_inferred: false, zip_to_county_inferred: false, governed_geographic_assignment_eligible: source.key !== 'oh_childcare_centers' } };
}

async function loadInputs(root, signal) {
  const registryMeta = await boundedJson(path.join(root, 'config/datasets/national-business-registry.json'), 300_000);
  const r = registryMeta.value.current_release;
  check(registryMeta.value.dataset_id === 'national-business-registry' && r?.release_id === REGISTRY_RELEASE && r.manifest_sha256 === REGISTRY_SHA);
  const registry = await boundedJson(path.join(root, r.manifest), 8_000_000);
  check(registry.sha256 === REGISTRY_SHA && registry.value.release_id === REGISTRY_RELEASE && registry.value.coverage.reporting_location_evidence === EXPECTED.total
    && registry.value.coverage.resolution_location_profiles === 8011835 && registry.value.coverage.physical_sites === 8025017);
  const selectedArtifacts = registry.value.artifacts.filter(a => a.artifact_type === 'business-reporting-location-evidence-jsonl-gzip');
  check(selectedArtifacts.length === 10 && stable(selectedArtifacts.map(a => a.path).sort()) === stable([...ARTIFACT_PATHS].sort())
    && selectedArtifacts.reduce((n, a) => n + a.record_count, 0) === EXPECTED.total);
  const dependencies = new Map((registry.value.dependencies ?? []).map(x => [x.dataset_id, x]));
  const sources = {};
  for (const [state, expected] of Object.entries(SOURCE)) {
    signal?.throwIfAborted(); const dep = dependencies.get(expected.id);
    check(dep && dep.manifest_sha256 === expected.manifestSha, `${state} source dependency`);
    const sourceRead = await boundedJson(path.join(root, expected.manifest), 8_000_000), manifest = sourceRead.value;
    check(sourceRead.sha256 === expected.manifestSha && manifest.dataset_id === expected.id && manifest.release_id === dep.release_id
      && manifest.status && manifest.policy && typeof manifest.transformation_version === 'string' && manifest.observed_at);
    const policyRead = await readContainedPolicyProfile({ root, relativePath: expected.policyPath, sourceState: state });
    const policy = policyRead.value, sourceManifestPolicySha = sha(stable(manifest.policy));
    check(policyRead.sha256 === expected.policySha && policy.policy_id === expected.policyId
      && `${policy.policy_id}@${policy.version}` === manifest.policy.profile
      && (manifest.policy.export ?? manifest.policy.export_policy) === policy.export_policy && manifest.policy.redistribution
      && /not.authorized|not-authorized/i.test(manifest.policy.redistribution)
      && (manifest.policy.owner ?? manifest.policy.publisher) === policy.publisher,
    `${state} source policy file and embedded manifest policy binding`);
    sources[state] = { ...expected, release_id: manifest.release_id, source_release_id: manifest.source_release_id, manifest_sha256: sourceRead.sha256,
      policy_id: policy.policy_id, policy_profile: `${policy.policy_id}@${policy.version}`, policy_profile_path: expected.policyPath,
      policy_profile_sha256: policyRead.sha256, source_manifest_policy_sha256: sourceManifestPolicySha,
      transformation_version: manifest.transformation_version,
      observed_at: manifest.observed_at, source_status_counts: state === 'MA' ? { Current: 2561, 'Renewal in progress': 431, Expired: 13, 'Regional Enrollment Freeze': 2 }
        : state === 'NJ' ? { null: 4075 } : state === 'TN' ? { Active: 1863 } : { Open: 4237 } };
    check(manifest.counts?.accepted === expected.count, `${state} source manifest count`);
  }
  const temporal = await readNationalBusinessTemporalClaimRows({ root, signal });
  const temporalRegistration = await boundedJson(path.join(root, 'config/datasets/national-business-temporal-claim-matrix.json'), 300_000);
  const temporalSelected = temporalRegistration.value.retained_releases.filter(x => x.selected === true);
  check(temporalSelected.length === 1 && temporalSelected[0].release_id === temporal.provenance.release_id
    && temporalSelected[0].manifest_sha256 === temporal.provenance.manifest_sha256 && temporal.provenance.registry_release_id === REGISTRY_RELEASE
    && temporal.provenance.registry_manifest_sha256 === REGISTRY_SHA);
  const temporalRows = new Map(temporal.rows.map(row => [row.source_key, row]));
  const zipTemporal = await readExactZipIndustryTemporalQualification({ root, zip5: '00501', signal });
  const qualRows = new Map(zipTemporal.rows.map(row => [row.dimension_id, row]));
  const semanticByState = {};
  for (const [state, source] of Object.entries(sources)) {
    const semantic = temporalRows.get(source.key), qualification = qualRows.get(source.dimension);
    check(semantic?.profile_source_id === source.id && semantic.source_release_id === source.source_release_id
      && ['source-defined-current-membership', 'non-active-reporting-membership'].includes(semantic.classification)
      && semantic.policy_path === source.policy_profile_path && semantic.policy_sha256 === source.policy_profile_sha256
      && qualification?.source_key === source.key && qualification.source_release_id === source.source_release_id
      && qualification.review_qualification === 'unmeasured' && qualification.current_operations_verified === false);
    semanticByState[state] = semantic;
  }
  const geographyContext = await loadReportingSiteGeographyContext({ root, signal });
  check(geographyContext.pins.registry.release_id === REGISTRY_RELEASE && geographyContext.pins.registry.manifest_sha256 === REGISTRY_SHA);
  return { registry: registry.value, registryManifestSha: registry.sha256, registryRegistrationSha: registryMeta.sha256, selectedArtifacts, sources, semanticByState, qualRows, temporal, temporalRegistrationSha: temporalRegistration.sha256, zipTemporal, geographyContext };
}

async function rowsFromInputs(input, root, signal) {
  const out = []; const counts = { source: { MA: 0, NJ: 0, TN: 0, OH: 0 }, zip: { present: 0, absent: 0, 'missing-source-zip': 0, 'invalid-source-zip-placeholder': 0 }, point: { 'assigned-single-county': 0, unmatched: 0, ambiguous: 0, 'missing-geocode': 0, 'invalid-coordinate': 0, 'assignment-ineligible-by-source-policy': 0 }, status: { MA: {}, NJ: {}, TN: {}, OH: {} } };
  const ids = { site: new Set(), establishment: new Set(), record: new Set() };
  const registryDir = path.dirname(path.join(root, 'data/business-registry/releases', REGISTRY_RELEASE, 'manifest.json'));
  for (const artifact of input.selectedArtifacts) {
    signal?.throwIfAborted(); const file = path.join(registryDir, artifact.path), stat = await lstat(file);
    check(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.size === artifact.bytes && artifact.bytes <= 2_000_000);
    const raw = await readFile(file); check(sha(raw) === artifact.sha256);
    const decoded = gunzipSync(raw, { maxOutputLength: 32_000_000 }).toString('utf8');
    const parsed = decoded.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)); check(parsed.length === artifact.record_count);
    for (const row of parsed) {
      const state = Object.keys(SOURCE).find(key => SOURCE[key].id === row.source?.source_id), source = input.sources[state]; check(state && source);
      const idsFor = [['site', row.site_entity_id], ['establishment', row.establishment_entity_id], ['record', row.source.source_record_id]];
      for (const [kind, id] of idsFor) { check(typeof id === 'string' && id.length > 0 && !ids[kind].has(id), `duplicate/invalid reporting ${kind} ID`); ids[kind].add(id); }
      check(row.identity_matching_eligible === false && row.export_policy === 'local-review-only' && row.evidence?.manifest_sha256 === source.manifest_sha256
        && row.evidence.release_id === source.release_id && row.source.source_release_id === source.source_release_id
        && row.source.policy_id === source.policy_id && row.source.transformation_version.includes(source.transformation_version.split('@')[0])
        && (row.observed_at === source.observed_at || state === 'OH' && row.evidence?.normalized_provenance?.observed_at === row.observed_at)
        && row.address?.state === state,
      `${state} row lineage/identity scope ${JSON.stringify({ row_release: row.evidence?.release_id, expected_release: source.release_id, row_manifest: row.evidence?.manifest_sha256, expected_manifest: source.manifest_sha256, source_release: row.source.source_release_id, expected_source_release: source.source_release_id, policy_id: row.source.policy_id, expected_policy: source.policy_id, transformation: row.source.transformation_version, expected_transform: source.transformation_version, observed_at: row.observed_at, expected_observed: source.observed_at, state: row.address?.state })}`);
      const status = row.source_status?.status_source ?? null;
      if (state === 'NJ') check(status === null && row.source_status?.status_interpretation === 'active-licensed-center-layer-membership-only');
      else check(status in source.statuses, `${state} closed status`);
      counts.status[state][status ?? 'null'] = (counts.status[state][status ?? 'null'] ?? 0) + 1;
      const lifecycle = classifyLifecycle(source, row, input.semanticByState[state], input.qualRows.get(source.dimension));
      const geography = classifyGeography(row, source, input.geographyContext);
      counts.source[state]++; if (row.zip_code === null) { counts.zip.absent++; counts.zip[geography.postal.zip_unavailable_reason]++; }
      else counts.zip.present++;
      counts.point[geography.point_assignment.status]++;
      out.push({ schema_version: 'reporting-only-site-qualification-row@1.1.0', cohort_kind: 'reporting-only',
        site_entity_id: row.site_entity_id, establishment_entity_id: row.establishment_entity_id,
        source: { source_id: source.id, source_release_id: source.source_release_id, source_record_id: row.source.source_record_id,
          registry_release_id: REGISTRY_RELEASE, registry_manifest_sha256: REGISTRY_SHA, source_manifest_sha256: source.manifest_sha256,
          source_observed_at: row.observed_at, transformation_version: row.source.transformation_version, policy_id: source.policy_id,
          policy_profile: source.policy_profile, policy_profile_path: source.policyPath, policy_profile_sha256: source.policy_profile_sha256,
          source_manifest_policy_sha256: source.source_manifest_policy_sha256, source_manifest_observed_at: source.observed_at,
          row_observed_at: row.observed_at, export_policy: 'local-review-only' },
        source_status: row.source_status, source_evidence_lineage: { release_id: row.evidence.release_id, manifest_sha256: row.evidence.manifest_sha256,
          input_feature_sha256: row.evidence.input_feature_sha256 ?? row.evidence.normalized_provenance?.input_feature_sha256 ?? null,
          assertions_sha256: row.evidence.assertions_sha256 ?? null, policy_profile: row.evidence.policy_profile ?? null },
        lifecycle, geography, identity_matching_eligible: false, current_operation_verified: false, active_business_verified: false,
        active_business_eligible: false, reviewed_at: AS_OF,
      });
    }
  }
  check(out.length === EXPECTED.total && stable(counts.source) === stable(EXPECTED.bySource)
    && counts.zip.present === EXPECTED.withZip && counts.zip.absent === EXPECTED.withoutZip
    && counts.zip['missing-source-zip'] === EXPECTED.zipGaps['missing-source-zip']
    && counts.zip['invalid-source-zip-placeholder'] === EXPECTED.zipGaps['invalid-source-zip-placeholder']
    && counts.point['assigned-single-county'] === EXPECTED.pointAssigned
    && counts.point['assignment-ineligible-by-source-policy'] === EXPECTED.ohIneligible
    && counts.point['missing-geocode'] === EXPECTED.tnMissingPoint,
    `reporting-site conservation ${JSON.stringify(counts)}`);
  return { rows: out, counts };
}

function bindings(input) {
  return { registry: { release_id: REGISTRY_RELEASE, manifest_sha256: REGISTRY_SHA, registration_sha256: input.registryRegistrationSha,
      reporting_artifact_inventory_sha256: sha(stable(input.selectedArtifacts)), reporting_artifact_count: input.selectedArtifacts.length,
      reporting_artifacts: input.selectedArtifacts.map(({ path, bytes, sha256, record_count, artifact_type, export_policy }) => ({ path, bytes, sha256, record_count, artifact_type, export_policy })) },
    sources: Object.fromEntries(Object.entries(input.sources).map(([state, source]) => [state, { source_id: source.id, release_id: source.release_id,
      source_release_id: source.source_release_id, manifest_path: source.manifest, manifest_sha256: source.manifest_sha256,
      policy_id: source.policy_id, policy_profile: source.policy_profile, policy_profile_path: source.policyPath,
      policy_profile_sha256: source.policy_profile_sha256, source_manifest_policy_sha256: source.source_manifest_policy_sha256,
      transformation_version: source.transformation_version,
      observed_at: source.observed_at }])),
    temporal: { release_id: input.temporal.provenance.release_id, manifest_sha256: input.temporal.provenance.manifest_sha256,
      artifact_sha256: input.temporal.provenance.artifact_sha256, registration_sha256: input.temporalRegistrationSha },
    zip_temporal_qualification: { release_id: input.zipTemporal.provenance.release_id, manifest_sha256: input.zipTemporal.provenance.manifest_sha256,
      artifact_sha256: input.zipTemporal.provenance.artifact_sha256, assessment_as_of: input.zipTemporal.assessment_as_of },
    geography: { release_id: input.geographyContext.pins.geography.release_id, manifest_sha256: input.geographyContext.pins.geography.manifest_sha256,
      zcta_index_sha256: input.geographyContext.pins.geography.zcta_index_sha256, county_geometry_inventory_sha256: input.geographyContext.pins.geography.county_geometry_inventory_sha256,
      point_assignment_release_id: input.geographyContext.pins.point_assignment.release_id, point_assignment_manifest_sha256: input.geographyContext.pins.point_assignment.manifest_sha256 } };
}

export async function buildReportingOnlySiteQualification({ root = APP_ROOT, signal } = {}) {
  root = path.resolve(root); const input = await loadInputs(root, signal), produced = await rowsFromInputs(input, root, signal), pin = bindings(input);
  const artifactBytes = gzipSync(Buffer.from(produced.rows.map(row => JSON.stringify(row)).join('\n') + '\n'), { level: 6 });
  const artifact = { path: 'sites.jsonl.gz', artifact_type: 'reporting-only-site-qualification-jsonl-gzip', bytes: artifactBytes.length,
    sha256: sha(artifactBytes), record_count: produced.rows.length };
  const summary = { site_count: produced.rows.length, matching_profile_count: 0, by_source: produced.counts.source,
    zip: produced.counts.zip, point_assignment: produced.counts.point,
    current_operation_verified: 0, active_business_verified: 0, active_business_eligible: 0, identity_matching_eligible: 0,
    temporal_review_unmeasured: produced.rows.length, source_status_counts: produced.counts.status,
    physical_site_denominator: { matching_profiles: 8011835, reporting_only_sites: 13182, combined_retained_site_evidence: 8025017 } };
  const claims = { current_operation_verified: false, active_business_verified: false, active_business_eligible: false, identity_matching_eligible: false,
    usps_operational_assignment_verified: false, usps_deliverability_verified: false, zcta_membership_inferred: false, entity_polygons_present: false,
    network_requests: 0, source_acquisition_performed: false, current_pointer_written: false, production_enrollment: false, production_execution: false, export_policy: 'local-review-only' };
  const body = { schema_version: `${DATASET}-release@1.1.0`, contract_version: REPORTING_ONLY_SITE_QUALIFICATION_VERSION,
    assessment_as_of: AS_OF, cohort_kind: 'reporting-only', bindings: pin, summary, claims, artifact };
  const release_id = `${DATASET}-${sha(JSON.stringify(body))}`;
  const manifest = { dataset_id: DATASET, release_id, status: 'immutable-pointer-free-local-review-only', publication_mode: 'pointer-free', ...body };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`), manifest_sha256 = sha(manifestBytes);
  const relative = `data/${DATASET}/releases/${release_id}`, releaseDir = path.join(root, relative);
  await mkdir(releaseDir, { recursive: true });
  await writeFile(path.join(releaseDir, artifact.path), artifactBytes, { flag: 'wx' }).catch(async error => { if (error.code !== 'EEXIST') throw error; check(sha(await readFile(path.join(releaseDir, artifact.path))) === artifact.sha256, 'existing immutable site shard mismatch'); });
  await writeFile(path.join(releaseDir, 'manifest.json'), manifestBytes, { flag: 'wx' }).catch(async error => { if (error.code !== 'EEXIST') throw error; check(sha(await readFile(path.join(releaseDir, 'manifest.json'))) === manifest_sha256, 'existing immutable reporting manifest mismatch'); });
  const configPath = path.join(root, 'config/datasets', `${DATASET}.json`);
  const old = await readFile(configPath, 'utf8').then(JSON.parse).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
  const prior = old?.retained_releases ?? (old?.selected_release ? [{ ...old.selected_release, selected: true }] : []);
  const retained_releases = prior.map(row => ({ ...row, selected: false }));
  retained_releases.push({ release_id, manifest: `${relative}/manifest.json`, manifest_sha256, artifact_sha256: artifact.sha256,
    record_count: produced.rows.length, bindings: pin, summary, selected: true });
  const registration = { schema_version: `${DATASET}-registration@1.1.0`, dataset_id: DATASET, status: 'registered-pointer-free-local-review-only',
    runtime_pointer: null, production_enrollment: false, current_pointer_written: false, selected_release_id: release_id, retained_releases };
  await writeFile(configPath, `${JSON.stringify(registration, null, 2)}\n`);
  return { release_id, manifest_sha256, artifact_sha256: artifact.sha256, summary };
}

export async function readReportingOnlySiteQualification({ root = APP_ROOT, signal } = {}) {
  root = path.resolve(root); signal?.throwIfAborted();
  const reg = await boundedJson(path.join(root, `config/datasets/${DATASET}.json`), 2_000_000);
  check(reg.value.schema_version === `${DATASET}-registration@1.1.0` && reg.value.status === 'registered-pointer-free-local-review-only'
    && reg.value.runtime_pointer === null && reg.value.current_pointer_written === false && reg.value.production_enrollment === false
    && Array.isArray(reg.value.retained_releases));
  const selectedRows = reg.value.retained_releases.filter(row => row.selected === true); check(selectedRows.length === 1);
  const selected = selectedRows[0]; check(reg.value.selected_release_id === selected.release_id && selected?.release_id && selected.record_count === EXPECTED.total);
  const manifestPath = path.join(root, selected.manifest), manifestRead = await boundedJson(manifestPath, 3_000_000), manifest = manifestRead.value;
  check(manifestRead.sha256 === selected.manifest_sha256 && manifest.dataset_id === DATASET && manifest.release_id === selected.release_id
    && manifest.status === 'immutable-pointer-free-local-review-only' && manifest.publication_mode === 'pointer-free'
    && manifest.schema_version === `${DATASET}-release@1.1.0` && manifest.contract_version === REPORTING_ONLY_SITE_QUALIFICATION_VERSION && manifest.summary.site_count === EXPECTED.total
    && stable(manifest.bindings) === stable(selected.bindings) && stable(manifest.summary) === stable(selected.summary)
    && stable(manifest.claims) === stable({ current_operation_verified: false, active_business_verified: false, active_business_eligible: false, identity_matching_eligible: false,
      usps_operational_assignment_verified: false, usps_deliverability_verified: false, zcta_membership_inferred: false, entity_polygons_present: false,
      network_requests: 0, source_acquisition_performed: false, current_pointer_written: false, production_enrollment: false, production_execution: false, export_policy: 'local-review-only' })
    && manifest.artifact.record_count === EXPECTED.total && manifest.artifact.path === 'sites.jsonl.gz'
    && manifest.artifact.sha256 === selected.artifact_sha256);
  const artifactPath = path.join(path.dirname(manifestPath), manifest.artifact.path), stat = await lstat(artifactPath);
  check(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.size === manifest.artifact.bytes);
  const compressed = await readFile(artifactPath); check(sha(compressed) === manifest.artifact.sha256);
  const lines = gunzipSync(compressed, { maxOutputLength: 128_000_000 }).toString('utf8').split(/\r?\n/).filter(Boolean);
  check(lines.length === EXPECTED.total); const rows = lines.map(line => JSON.parse(line)), byRecord = new Map();
  for (const row of rows) {
    signal?.throwIfAborted(); check(row.schema_version === 'reporting-only-site-qualification-row@1.1.0' && row.cohort_kind === 'reporting-only'
      && row.identity_matching_eligible === false && row.current_operation_verified === false && row.active_business_verified === false && row.active_business_eligible === false
      && row.lifecycle?.current_operation_verified === false && row.lifecycle?.active_business_eligible === false
      && row.geography?.postal?.usps_operational_assignment === null && row.geography?.postal?.usps_deliverability === null
      && row.geography?.code_correspondence?.membership === false && row.geography?.claims?.entity_polygon_present === false
      && row.source?.export_policy === 'local-review-only' && !byRecord.has(row.source?.source_record_id));
    byRecord.set(row.source.source_record_id, row);
  }
  return { rows, byRecord, summary: manifest.summary, provenance: { dataset_id: DATASET, release_id: manifest.release_id, manifest_sha256: manifestRead.sha256,
    registration_sha256: reg.sha256, artifact_sha256: manifest.artifact.sha256, artifact_bytes: manifest.artifact.bytes, record_count: rows.length, bindings: manifest.bindings,
    claims: manifest.claims } };
}

export async function verifyReportingOnlySiteQualification({ root = APP_ROOT, signal } = {}) {
  const selected = await readReportingOnlySiteQualification({ root, signal });
  const input = await loadInputs(path.resolve(root), signal), expected = await rowsFromInputs(input, path.resolve(root), signal);
  check(stable(expected.rows) === stable(selected.rows), 'reporting-only decision rows differ from retained source replay');
  check(stable(expected.counts.source) === stable(selected.summary.by_source) && stable(expected.counts.zip) === stable(selected.summary.zip)
    && stable(expected.counts.point) === stable(selected.summary.point_assignment), 'reporting-only independent conservation replay');
  return { status: 'verified', release_id: selected.provenance.release_id, manifest_sha256: selected.provenance.manifest_sha256,
    artifact_sha256: selected.provenance.artifact_sha256, summary: selected.summary };
}
