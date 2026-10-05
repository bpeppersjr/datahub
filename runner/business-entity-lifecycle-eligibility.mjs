import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { createGunzip, createGzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { mkdir, lstat, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { finished } from 'node:stream/promises';
import { once } from 'node:events';
import { APP_ROOT } from './paths.mjs';
import { mnSelectionReadJson as readJson } from './mn-construction-retained-selection.mjs';
import { readNationalBusinessTemporalClaimRows } from './national-business-temporal-claim-matrix-reader.mjs';
import { readExactZipIndustryTemporalQualification } from './exact-zip-industry-temporal-qualification.mjs';

export const BUSINESS_ENTITY_LIFECYCLE_VERSION = 'business-entity-lifecycle-eligibility@1.0.0';
const DATASET = 'business-entity-lifecycle-eligibility';
const AS_OF = '2026-10-02T16:30:00.000Z';
const SELECTED_RELEASE_ID = 'business-entity-lifecycle-eligibility-f37556f8722c5a48c114a763ce1786cbe2e6d11b985b875602a97afb45671057';
const SELECTED_MANIFEST_SHA256 = 'fe97a5b260a7c9c38c8884d668ba6f99b237ca4ec0f6885af587efd349f428ae';
const SELECTED_TAXONOMY_SHA256 = '7c7dcc49afdae859d20de95e785c2efe3e40b43e395091de934ee76a1f99f6cc';
const SELECTED_REGISTRATION_SHA256 = 'f7531c0a06b4259ae46f6887c69eb9d8d5f0135ae52f30237556c84e89a66035';
const SHA = /^[a-f0-9]{64}$/;
const check = (value, message = 'Business entity lifecycle eligibility contract rejected.') => { if (!value) throw new Error(message); };
const sha = value => createHash('sha256').update(value).digest('hex');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const stable = value => JSON.stringify(canonical(value));
const sourceCounts = Object.freeze({
  'alaska-dcced-active-business-licenses': 94550,
  'california-abc-daily-active-licenses': 84497,
  'city-of-chicago-bacp-current-active-business-licenses': 42940,
  'cms-nppes-monthly-v2': 2088780,
  'dc-dlcp-active-basic-business-licenses': 54910,
  'epa-echo-exporter-active-facility': 1517826,
  'fdic-bankfind-current-structure': 77285,
  'fmcsa-company-census-active-us-principal-office': 2195563,
  'los-angeles-office-of-finance-active-businesses': 633232,
  'ncua-final-quarterly-call-report': 22445,
  'new-york-agriculture-markets-retail-food-stores': 24230,
  'nyc-dcwp-issued-licenses-active-premises': 31163,
  'texas-comptroller-active-sales-tax-permits': 885097,
  'usda-fsis-active-mpi-directory': 7237,
  'usda-snap-current-retailers': 252080,
});

function safeRelative(value) {
  return typeof value === 'string' && value.length > 0 && !path.isAbsolute(value) && !value.includes('\\')
    && value.split('/').every(part => part && part !== '.' && part !== '..');
}

export function classifyBusinessEntityLifecycle({ profile, taxonomy, semantic, qualification, assessmentAsOf = AS_OF }) {
  check(profile && taxonomy && semantic && qualification && assessmentAsOf === AS_OF);
  const status = profile.source_status;
  const value = status === null ? null : status?.value;
  let source_membership_class = taxonomy.membership_class;
  let lifecycle_evidence = taxonomy.lifecycle_evidence;
  const reason_codes = [];
  if (status === null) {
    source_membership_class = 'unknown-source-status'; lifecycle_evidence = 'unknown'; reason_codes.push('source-status-not-retained');
  } else if (!status || typeof status !== 'object' || Array.isArray(status) || typeof value !== 'string' || !taxonomy.source_status_values.includes(value)) {
    source_membership_class = 'unknown-source-status'; lifecycle_evidence = 'unknown'; reason_codes.push('source-status-value-not-in-closed-taxonomy');
  }
  if (taxonomy.contradiction_counter && status && Number.isSafeInteger(status[taxonomy.contradiction_counter]) && status[taxonomy.contradiction_counter] > 0) {
    source_membership_class = 'contradictory-source-dates'; lifecycle_evidence = 'contradictory'; reason_codes.push('source-reports-expiration-before-observation');
  } else if (taxonomy.contradiction_counter && status && (!Number.isSafeInteger(status[taxonomy.contradiction_counter]) || status[taxonomy.contradiction_counter] < 0)) {
    source_membership_class = 'unknown-source-status'; lifecycle_evidence = 'unknown'; reason_codes.push('source-date-contradiction-counter-unavailable');
  }
  const review_status = qualification.review_qualification;
  check(['within-review-window', 'stale', 'unmeasured', 'unmapped'].includes(review_status));
  if (review_status === 'stale') reason_codes.push('source-review-window-stale');
  if (review_status === 'unmeasured') reason_codes.push('source-review-window-unmeasured');
  if (review_status === 'unmapped') reason_codes.push('source-review-mapping-unavailable');
  if (lifecycle_evidence === 'source-defined-current') reason_codes.push('source-membership-is-not-operation-verification');
  if (lifecycle_evidence === 'non-active-reporting') reason_codes.push('reporting-membership-is-not-operation-verification');
  return {
    schema_version: 'business-entity-lifecycle-eligibility-row@1.0.0',
    profile_id: profile.profile_id,
    zip5: profile.zip_code,
    source_id: profile.source.source_id,
    source_release_id: profile.source.source_release_id,
    source_record_lineage_sha256: sha(stable(profile.source.source_record_ids ?? [profile.source.source_record_id])),
    policy_id: profile.source.policy_id,
    policy_sha256: taxonomy.policy_sha256,
    taxonomy_source_key: taxonomy.source_key,
    source_status_value: value,
    source_status_sha256: sha(stable(status)),
    profile_observed_at: profile.observed_at,
    source_reference_at: qualification.source_reference_at ?? null,
    assessment_as_of: assessmentAsOf,
    source_membership_class,
    review_status,
    lifecycle_evidence,
    current_operation_verified: false,
    active_business_eligible: false,
    reason_codes,
  };
}

async function readBindings(root, signal) {
  const taxonomyMeter = {}, registryMeter = {};
  const [taxonomyBytes, registryCatalog] = await Promise.all([
    readJson(path.join(root, 'config/datasets/business-entity-lifecycle-eligibility-taxonomy.json'), 64000, signal, taxonomyMeter),
    readJson(path.join(root, 'config/datasets/national-business-registry.json'), 300000, signal),
  ]);
  check(taxonomyBytes.schema_version === 'business-entity-lifecycle-taxonomy@1.0.0' && taxonomyBytes.status === 'closed-local-review-taxonomy'
    && taxonomyBytes.assessment_as_of === AS_OF && taxonomyBytes.profile_source_count === 15 && taxonomyBytes.source_status_value_count === 17
    && taxonomyBytes.sources.length === 15 && taxonomyBytes.sources.flatMap(row => row.source_status_values).length === 16
    && stable(taxonomyBytes.expected_profile_counts) === stable(sourceCounts)
    && taxonomyBytes.expected_null_status_profiles === sourceCounts['los-angeles-office-of-finance-active-businesses']
    && taxonomyBytes.sources.filter(row => row.null_status_allowed === true).length === 1
    && taxonomyBytes.claims?.current_operation_verified === false && taxonomyBytes.claims?.active_business_eligible === false);
  const taxonomySha256 = taxonomyMeter.sha256;
  const registryMeta = registryCatalog.current_release;
  check(registryCatalog.dataset_id === 'national-business-registry' && registryMeta?.release_id === 'national-business-registry-20260911-022652067Z-1ec656c3'
    && SHA.test(registryMeta.manifest_sha256) && safeRelative(registryMeta.manifest));
  const registryManifest = await readJson(path.join(root, registryMeta.manifest), 4_000_000, signal, registryMeter);
  check(registryManifest.dataset_id === registryCatalog.dataset_id && registryManifest.release_id === registryMeta.release_id
    && registryMeter.sha256 === registryMeta.manifest_sha256 && registryManifest.status === 'published-partial'
    && registryManifest.coverage?.resolution_location_profiles === 8011835);
  const profileArtifacts = registryManifest.artifacts.filter(item => item.artifact_type === 'entity-resolution-location-profile-jsonl-gzip');
  check(profileArtifacts.length === 100 && profileArtifacts.reduce((n, item) => n + item.record_count, 0) === 8011835);
  const temporal = await readNationalBusinessTemporalClaimRows({ root, signal });
  const qualification = await readExactZipIndustryTemporalQualification({ root, zip5: '10001', signal });
  check(temporal.rows.length === 30 && temporal.provenance.registry_release_id === registryMeta.release_id
    && temporal.provenance.registry_manifest_sha256 === registryMeta.manifest_sha256 && qualification.assessment_as_of === AS_OF
    && qualification.provenance?.release_id && qualification.provenance?.manifest_sha256 && qualification.provenance?.artifact_sha256);
  const temporalByProfile = new Map(temporal.rows.filter(row => row.profile_source_id).map(row => [row.profile_source_id, row]));
  const qualificationBySource = new Map(qualification.rows.filter(row => row.source_key).map(row => [row.source_key, row]));
  const sourceById = new Map();
  for (const item of taxonomyBytes.sources) {
    check(item && typeof item.source_id === 'string' && typeof item.source_key === 'string' && SHA.test(item.policy_sha256)
      && Array.isArray(item.source_status_values) && item.source_release_id && !sourceById.has(item.source_id));
    const semantic = temporalByProfile.get(item.source_id), temporalQualification = qualificationBySource.get(item.source_key);
    check(semantic && semantic.source_key === item.source_key && semantic.source_release_id === item.source_release_id
      && semantic.policy_sha256 === item.policy_sha256 && temporalQualification && temporalQualification.source_release_id === item.source_release_id
      && temporalQualification.semantic_class === (semantic.classification === 'source-defined-current-membership' ? 'source-defined-current' : 'non-active-reporting')
      && temporalQualification.source_status_term === semantic.source_status_term
      && semantic.classification === (item.lifecycle_evidence === 'source-defined-current' ? 'source-defined-current-membership'
        : item.lifecycle_evidence === 'non-active-reporting' ? 'non-active-reporting-membership' : semantic.classification));
    sourceById.set(item.source_id, { taxonomy: item, semantic, qualification: temporalQualification });
  }
  check(sourceById.size === 15 && Object.keys(sourceCounts).length === 15 && Object.values(sourceCounts).reduce((a, b) => a + b, 0) === 8011835);
  return {
    taxonomy: taxonomyBytes, taxonomy_sha256: taxonomySha256,
    registry: { release_id: registryMeta.release_id, manifest_sha256: registryMeta.manifest_sha256, manifest: registryMeta.manifest, manifest_object: registryManifest, profile_artifacts: profileArtifacts },
    temporal: { release_id: temporal.provenance.release_id, manifest_sha256: temporal.provenance.manifest_sha256, artifact_sha256: temporal.provenance.artifact_sha256 },
    qualification: { release_id: qualification.provenance.release_id, manifest_sha256: qualification.provenance.manifest_sha256, artifact_sha256: qualification.provenance.artifact_sha256, assessment_as_of: qualification.assessment_as_of },
    source_by_id: sourceById,
  };
}

async function* integrityJsonlGzip(file, artifact, signal) {
  signal?.throwIfAborted();
  const input = createReadStream(file), hash = createHash('sha256'); let bytes = 0, records = 0;
  input.on('data', chunk => { bytes += chunk.length; hash.update(chunk); });
  const gunzip = createGunzip(); input.on('error', error => gunzip.destroy(error));
  const lines = createInterface({ input: input.pipe(gunzip), crlfDelay: Infinity });
  try { for await (const line of lines) { signal?.throwIfAborted(); if (!line) continue; records++; yield JSON.parse(line); } }
  finally { lines.close(); input.destroy(); gunzip.destroy(); }
  check(bytes === artifact.bytes && hash.digest('hex') === artifact.sha256 && records === artifact.record_count, `Lifecycle input or output artifact integrity mismatch: ${artifact.path}`);
}

export async function readBusinessEntityLifecycleEligibilityPartition({ root = APP_ROOT, zip2, signal } = {}) {
  check(/^\d{2}$/.test(zip2 ?? '')); root = path.resolve(root); signal?.throwIfAborted();
  const registration = await readJson(path.join(root, `config/datasets/${DATASET}.json`), 1_000_000, signal);
  check(registration.schema_version === `${DATASET}-registration@1.0.0` && registration.dataset_id === DATASET
    && registration.status === 'registered-pointer-free-local-review-only' && registration.runtime_pointer === null
    && registration.production_enrollment === false && registration.current_pointer_written === false && Array.isArray(registration.retained_releases));
  const selected = registration.retained_releases.filter(item => item.selected === true); check(selected.length === 1);
  const selectedRelease = selected[0];
  check(selectedRelease.release_id === registration.selected_release_id && selectedRelease.release_id === SELECTED_RELEASE_ID
    && selectedRelease.manifest_sha256 === SELECTED_MANIFEST_SHA256 && safeRelative(selectedRelease.manifest)
    && selectedRelease.manifest === `data/${DATASET}/releases/${selectedRelease.release_id}/manifest.json` && SHA.test(selectedRelease.manifest_sha256));
  const manifest = await readJson(path.join(root, selectedRelease.manifest), 1_000_000, signal);
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  check(sha(manifestBytes) === selectedRelease.manifest_sha256 && manifest.schema_version === `${DATASET}-release@1.0.0`
    && manifest.dataset_id === DATASET && manifest.release_id === selectedRelease.release_id && manifest.publication_mode === 'pointer-free'
    && manifest.status === 'immutable-pointer-free-local-review-only' && manifest.assessment_as_of === AS_OF
    && manifest.bindings?.registry?.release_id && manifest.bindings?.taxonomy?.sha256);
  const actual = await readBindings(root, signal);
  check(actual.taxonomy_sha256 === SELECTED_TAXONOMY_SHA256 && manifest.bindings.taxonomy.sha256 === actual.taxonomy_sha256
    && manifest.bindings.registry.release_id === actual.registry.release_id && manifest.bindings.registry.manifest_sha256 === actual.registry.manifest_sha256
    && manifest.bindings.temporal.release_id === actual.temporal.release_id && manifest.bindings.temporal.manifest_sha256 === actual.temporal.manifest_sha256
    && manifest.bindings.qualification.release_id === actual.qualification.release_id && manifest.bindings.qualification.manifest_sha256 === actual.qualification.manifest_sha256
    && stable(manifest.bindings.temporal) === stable({ release_id: actual.temporal.release_id, manifest_sha256: actual.temporal.manifest_sha256, artifact_sha256: actual.temporal.artifact_sha256 })
    && stable(manifest.bindings.qualification) === stable(actual.qualification));
  const artifact = manifest.artifacts.find(item => item.path === `decisions/zip2=${zip2}.jsonl.gz`);
  check(artifact && artifact.artifact_type === 'business-entity-lifecycle-decision-jsonl-gzip' && artifact.record_count > 0
    && Number.isSafeInteger(artifact.bytes) && artifact.bytes > 0 && SHA.test(artifact.sha256));
  const file = path.join(root, path.posix.dirname(selectedRelease.manifest), artifact.path);
  const iterator = integrityJsonlGzip(file, artifact, signal)[Symbol.asyncIterator](); let count = 0, closed = false;
  return {
    provenance: { release_id: manifest.release_id, manifest_sha256: selectedRelease.manifest_sha256, taxonomy_sha256: actual.taxonomy_sha256 },
    async nextFor(profile) {
      check(!closed, 'Lifecycle partition reader is closed.'); signal?.throwIfAborted();
      const next = await iterator.next(); check(!next.done, 'Lifecycle decision partition ended before its profile input.'); count++;
      const row = next.value;
      check(row.schema_version === 'business-entity-lifecycle-eligibility-row@1.0.0' && row.profile_id === profile.profile_id
        && row.zip5 === profile.zip_code && row.source_id === profile.source.source_id && row.source_release_id === profile.source.source_release_id
        && row.current_operation_verified === false && row.active_business_eligible === false && row.assessment_as_of === AS_OF
        && SHA.test(row.source_status_sha256) && SHA.test(row.source_record_lineage_sha256) && SHA.test(row.policy_sha256));
      const tax = actual.source_by_id.get(row.source_id);
      check(tax && row.taxonomy_source_key === tax.taxonomy.source_key && row.policy_sha256 === tax.taxonomy.policy_sha256
        && row.source_release_id === tax.taxonomy.source_release_id && row.source_status_sha256 === sha(stable(profile.source_status))
        && row.source_status_value === (profile.source_status?.value ?? null));
      if (profile.source_status === null) check(tax.taxonomy.null_status_allowed === true);
      else check(tax.taxonomy.source_status_values.includes(profile.source_status?.value));
      const expected = classifyBusinessEntityLifecycle({ profile, taxonomy: tax.taxonomy, semantic: tax.semantic, qualification: tax.qualification });
      check(stable(row) === stable(expected), 'Lifecycle decision differs from the exact source status and temporal taxonomy.');
      return { ...row, release: { release_id: manifest.release_id, manifest_sha256: selectedRelease.manifest_sha256 } };
    },
    async finish() {
      if (closed) return; signal?.throwIfAborted(); const extra = await iterator.next(); check(extra.done, 'Lifecycle partition contains decisions without profiles.');
      check(count === artifact.record_count, 'Lifecycle partition count differs from its registration.'); closed = true;
    },
    async close() { closed = true; await iterator.return?.(); },
  };
}

export async function businessEntityLifecycleInputs({ root = APP_ROOT, signal } = {}) { return readBindings(path.resolve(root), signal); }

/**
 * Validate the exact selected release summary without expanding its 8M decision rows.
 * The selected registration and manifest hashes bind the complete shard inventory;
 * independent full replay remains available through verifyBusinessEntityLifecycleRelease.
 */
export async function readBusinessEntityLifecycleEligibilitySummary({ root = APP_ROOT, signal } = {}) {
  root = path.resolve(root); signal?.throwIfAborted();
  const registrationMeter = {}, registration = await readJson(path.join(root, `config/datasets/${DATASET}.json`), 1_000_000, signal, registrationMeter);
  check(registrationMeter.sha256 === SELECTED_REGISTRATION_SHA256
    && registration.schema_version === `${DATASET}-registration@1.0.0` && registration.dataset_id === DATASET
    && registration.status === 'registered-pointer-free-local-review-only' && registration.runtime_pointer === null
    && registration.production_enrollment === false && registration.current_pointer_written === false
    && registration.selected_release_id === SELECTED_RELEASE_ID && registration.retained_releases.length === 1
    && registration.retained_releases[0].selected === true && registration.retained_releases[0].release_id === SELECTED_RELEASE_ID
    && registration.retained_releases[0].manifest === `data/${DATASET}/releases/${SELECTED_RELEASE_ID}/manifest.json`
    && registration.retained_releases[0].manifest_sha256 === SELECTED_MANIFEST_SHA256
    && registration.retained_releases[0].profile_count === 8011835, 'Lifecycle selected registration is unavailable or incompatible.');
  const manifestPath = registration.retained_releases[0].manifest, manifestMeter = {};
  const manifest = await readJson(path.join(root, manifestPath), 1_000_000, signal, manifestMeter);
  check(manifestMeter.sha256 === SELECTED_MANIFEST_SHA256 && manifest.schema_version === `${DATASET}-release@1.0.0`
    && manifest.dataset_id === DATASET && manifest.release_id === SELECTED_RELEASE_ID && manifest.status === 'immutable-pointer-free-local-review-only'
    && manifest.publication_mode === 'pointer-free' && manifest.assessment_as_of === AS_OF
    && stable(manifest.claims) === stable({ current_operation_verified: false, active_business_eligible: false, identity_resolution_applied: false,
      registry_bytes_modified: false, source_acquisition_performed: false, current_pointer_written: false, production_enrollment: false }),
  'Lifecycle selected manifest is unavailable or incompatible.');
  const input = await readBindings(root, signal), expectedBindings = bindingObject(input);
  check(stable(manifest.bindings) === stable(expectedBindings) && input.taxonomy_sha256 === SELECTED_TAXONOMY_SHA256,
    'Lifecycle selected upstream lineage is incompatible.');
  const artifacts = manifest.artifacts;
  check(Array.isArray(artifacts) && artifacts.length === 100 && artifacts.every((item, index) => {
    const zip2 = String(index).padStart(2, '0');
    return item?.artifact_type === 'business-entity-lifecycle-decision-jsonl-gzip' && item.path === `decisions/zip2=${zip2}.jsonl.gz`
      && Number.isSafeInteger(item.record_count) && item.record_count > 0 && Number.isSafeInteger(item.bytes) && item.bytes > 0 && SHA.test(item.sha256);
  }) && artifacts.reduce((sum, item) => sum + item.record_count, 0) === 8011835
    && artifacts.reduce((sum, item) => sum + item.bytes, 0) > 0, 'Lifecycle artifact inventory is incompatible.');
  const summary = manifest.summary;
  check(summary?.profile_count === 8011835 && summary.source_count === 15 && summary.source_status_value_count === 17
    && summary.assessment_as_of === AS_OF && stable(summary.source_counts) === stable(sourceCounts)
    && stable(summary.status_value_counts) === stable(expectedStatusCounts(input.taxonomy))
    && stable(summary.review_status_counts) === stable({ 'within-review-window': 7987605, stale: 24230, unmeasured: 0, unmapped: 0 })
    && stable(summary.lifecycle_evidence_counts) === stable({ 'source-defined-current': 5240481, 'non-active-reporting': 2135455, unknown: 633232, contradictory: 2667 })
    && stable(summary.exception_counts) === stable({ la_null_source_status: 633232, ca_expiration_before_observation_profiles: 2667, ny_retail_food_stale_non_active: 24230 })
    && stable(summary.bindings) === stable({ registry_release_id: input.registry.release_id, temporal_release_id: input.temporal.release_id, qualification_release_id: input.qualification.release_id }),
  'Lifecycle selected summary conservation differs from the audited cohort.');
  return {
    schema_version: BUSINESS_ENTITY_LIFECYCLE_VERSION,
    registration_path: `config/datasets/${DATASET}.json`, registration_sha256: registrationMeter.sha256,
    release_id: manifest.release_id, manifest_path: manifestPath, manifest_sha256: manifestMeter.sha256,
    taxonomy_path: 'config/datasets/business-entity-lifecycle-eligibility-taxonomy.json', taxonomy_sha256: input.taxonomy_sha256,
    artifact_count: artifacts.length, artifact_inventory_sha256: sha(JSON.stringify(artifacts)), artifact_record_count: artifacts.reduce((sum, item) => sum + item.record_count, 0),
    registry_release_id: input.registry.release_id, registry_manifest_sha256: input.registry.manifest_sha256,
    temporal_release_id: input.temporal.release_id, temporal_manifest_sha256: input.temporal.manifest_sha256, temporal_artifact_sha256: input.temporal.artifact_sha256,
    qualification_release_id: input.qualification.release_id, qualification_manifest_sha256: input.qualification.manifest_sha256,
    qualification_artifact_sha256: input.qualification.artifact_sha256, assessment_as_of: AS_OF,
    registry_profile_count: input.registry.manifest_object.coverage.resolution_location_profiles,
    summary,
    verified_claims: manifest.claims,
  };
}

function emptySummary(bindings) {
  return {
    profile_count: 0, source_count: 15, source_status_value_count: 17, assessment_as_of: AS_OF,
    source_counts: Object.fromEntries(Object.keys(sourceCounts).sort().map(key => [key, 0])),
    status_value_counts: {}, review_status_counts: { 'within-review-window': 0, stale: 0, unmeasured: 0, unmapped: 0 },
    lifecycle_evidence_counts: { 'source-defined-current': 0, 'non-active-reporting': 0, unknown: 0, contradictory: 0 },
    exception_counts: { la_null_source_status: 0, ca_expiration_before_observation_profiles: 0, ny_retail_food_stale_non_active: 0 },
    bindings: { registry_release_id: bindings.registry.release_id, temporal_release_id: bindings.temporal.release_id, qualification_release_id: bindings.qualification.release_id },
  };
}

function expectedStatusCounts(taxonomy) {
  const result = {};
  for (const source of taxonomy.sources) {
    if (source.source_status_values.length === 0) continue;
    const values = source.source_status_counts ?? Object.fromEntries(source.source_status_values.map(value => [value, sourceCounts[source.source_id]]));
    check(Object.keys(values).length === source.source_status_values.length && source.source_status_values.every(value => Number.isSafeInteger(values[value]) && values[value] > 0));
    for (const value of source.source_status_values) { check(!Object.hasOwn(result, value)); result[value] = values[value]; }
    check(Object.values(values).reduce((a, b) => a + b, 0) === sourceCounts[source.source_id]);
  }
  return result;
}

function addSummary(summary, decision) {
  summary.profile_count++; summary.source_counts[decision.source_id]++;
  summary.review_status_counts[decision.review_status]++;
  summary.lifecycle_evidence_counts[decision.lifecycle_evidence]++;
  if (decision.source_status_value !== null) summary.status_value_counts[decision.source_status_value] = (summary.status_value_counts[decision.source_status_value] ?? 0) + 1;
  if (decision.source_id === 'los-angeles-office-of-finance-active-businesses' && decision.source_status_value === null) summary.exception_counts.la_null_source_status++;
  if (decision.source_id === 'california-abc-daily-active-licenses' && decision.lifecycle_evidence === 'contradictory') summary.exception_counts.ca_expiration_before_observation_profiles++;
  if (decision.source_id === 'new-york-agriculture-markets-retail-food-stores' && decision.review_status === 'stale' && decision.lifecycle_evidence === 'non-active-reporting') summary.exception_counts.ny_retail_food_stale_non_active++;
}

async function ensureNoLinkPath(root, file, allowMissingLeaf = false) {
  const base = path.resolve(root), target = path.resolve(file), relative = path.relative(base, target);
  check(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
  let cursor = base;
  for (const part of relative.split(path.sep)) {
    cursor = path.join(cursor, part);
    try { const info = await lstat(cursor); check(!info.isSymbolicLink()); }
    catch (error) { if (allowMissingLeaf && error.code === 'ENOENT' && cursor === target) return; throw error; }
  }
}

async function openJsonlGzipWriter(file, signal) {
  signal?.throwIfAborted(); const stream = createWriteStream(file, { flags: 'wx' }); await once(stream, 'open');
  const gzip = createGzip({ level: 6, mtime: 0 }); gzip.pipe(stream); let count = 0, closed = false;
  return {
    async append(value) { check(!closed); signal?.throwIfAborted(); const bytes = Buffer.from(`${JSON.stringify(value)}\n`); if (!gzip.write(bytes)) await once(gzip, 'drain'); count++; },
    async close() { if (closed) throw new Error('Lifecycle shard writer is already closed.'); closed = true; gzip.end(); await finished(stream); const stat = await lstat(file); check(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1); return { record_count: count, bytes: stat.size, sha256: await hashFile(file, signal) }; },
    async abort() { if (closed) return; closed = true; gzip.destroy(); stream.destroy(); await finished(stream).catch(() => {}); },
  };
}

async function hashFile(file, signal) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(file)) { signal?.throwIfAborted(); digest.update(chunk); }
  return digest.digest('hex');
}

function decisionFor(profile, input, counts) {
  const item = input.source_by_id.get(profile.source?.source_id);
  check(item && profile.source.source_release_id === item.taxonomy.source_release_id && profile.zip_code?.slice(0, 2));
  if (profile.source_status === null) check(item.taxonomy.null_status_allowed === true && item.taxonomy.source_status_values.length === 0);
  else {
    check(profile.source_status && !Array.isArray(profile.source_status) && typeof profile.source_status.value === 'string');
    check(item.taxonomy.source_status_values.includes(profile.source_status.value), `Unknown source status for ${item.taxonomy.source_id}: fail closed.`);
    counts.status_values[profile.source_status.value] = (counts.status_values[profile.source_status.value] ?? 0) + 1;
  }
  const count = (counts.sources[profile.source.source_id] ?? 0) + 1; counts.sources[profile.source.source_id] = count;
  check(count <= sourceCounts[profile.source.source_id], 'Source profile count exceeds its closed denominator.');
  return classifyBusinessEntityLifecycle({ profile, taxonomy: item.taxonomy, semantic: item.semantic, qualification: item.qualification });
}

async function consumeProfileShard(root, input, sourceArtifact, outputFile, signal, counts, compareFile = null) {
  const sourceFile = path.join(root, path.posix.dirname(input.registry.manifest), sourceArtifact.path);
  await ensureNoLinkPath(root, sourceFile);
  const sourceRows = integrityJsonlGzip(sourceFile, sourceArtifact, signal)[Symbol.asyncIterator]();
  let outputWriter = null, outputRows = null;
  if (outputFile) outputWriter = await openJsonlGzipWriter(outputFile, signal);
  if (compareFile) {
    const stat = await lstat(compareFile.file); check(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1);
    outputRows = integrityJsonlGzip(compareFile.file, compareFile.artifact, signal)[Symbol.asyncIterator]();
  }
  let rows = 0;
  try {
    for (;;) {
      signal?.throwIfAborted(); const next = await sourceRows.next(); if (next.done) break;
      const normalized = next.value;
      check(['business-location-match-profile@1.0.0', 'business-location-match-profile@1.1.0'].includes(normalized?.profile_version)
        && /^location-profile:[a-f0-9]{32}$/.test(normalized.profile_id ?? '') && /^\d{5}$/.test(normalized.zip_code ?? '')
        && normalized.address?.zip_code === normalized.zip_code && typeof normalized.observed_at === 'string' && Number.isFinite(Date.parse(normalized.observed_at))
        && typeof normalized.source?.source_id === 'string' && typeof normalized.source?.source_release_id === 'string'
        && typeof normalized.source?.source_record_id === 'string' && typeof normalized.source?.policy_id === 'string');
      const zip2 = /zip2=(\d{2})\.jsonl\.gz$/.exec(sourceArtifact.path)?.[1];
      check(normalized.source.source_id in sourceCounts && zip2 && normalized.zip_code.slice(0, 2) === zip2);
      const decision = decisionFor(normalized, input, counts); rows++; addSummary(counts.summary, decision);
      if (outputWriter) await outputWriter.append(decision);
      if (outputRows) { const actual = await outputRows.next(); check(!actual.done && stable(actual.value) === stable(decision), 'Lifecycle replay differs from its independently derived profile decision.'); }
    }
    check(rows === sourceArtifact.record_count);
    const written = outputWriter ? await outputWriter.close() : null;
    if (outputRows) check((await outputRows.next()).done, 'Lifecycle shard contains orphan decision rows.');
    return written;
  } finally { await sourceRows.return?.(); await outputRows?.return?.(); await outputWriter?.abort(); }
}

function bindingObject(input) {
  return {
    registry: { release_id: input.registry.release_id, manifest_sha256: input.registry.manifest_sha256, profile_artifact_inventory_sha256: sha(JSON.stringify(input.registry.profile_artifacts)) },
    temporal: input.temporal,
    qualification: input.qualification,
    taxonomy: { path: 'config/datasets/business-entity-lifecycle-eligibility-taxonomy.json', sha256: input.taxonomy_sha256, source_count: 15, exact_source_status_value_count: 17 },
  };
}

export async function buildBusinessEntityLifecycleEligibility({ root = APP_ROOT, signal } = {}) {
  root = path.resolve(root); signal?.throwIfAborted(); const input = await readBindings(root, signal);
  const dataRoot = path.join(root, 'data', DATASET, 'releases'); await mkdir(dataRoot, { recursive: true }); await ensureNoLinkPath(root, dataRoot);
  const stage = path.join(dataRoot, `.stage-${randomUUID()}`); await mkdir(stage, { recursive: false }); const owner = await lstat(stage);
  const counts = { sources: {}, status_values: {}, summary: emptySummary(input) }, artifacts = [];
  let published = false;
  try {
    await mkdir(path.join(stage, 'decisions'));
    for (const sourceArtifact of input.registry.profile_artifacts) {
      signal?.throwIfAborted();
      const match = /zip2=(\d{2})\.jsonl\.gz$/.exec(sourceArtifact.path); check(match);
      const zip2 = match[1], rel = `decisions/zip2=${zip2}.jsonl.gz`, target = path.join(stage, rel);
      const written = await consumeProfileShard(root, input, sourceArtifact, target, signal, counts);
      artifacts.push({ artifact_type: 'business-entity-lifecycle-decision-jsonl-gzip', path: rel, record_count: written.record_count, bytes: written.bytes, sha256: written.sha256 });
    }
    check(counts.summary.profile_count === 8011835 && stable(counts.sources) === stable(sourceCounts)
      && Object.keys(counts.status_values).length === 16 && counts.summary.exception_counts.la_null_source_status === 633232
      && counts.summary.exception_counts.ca_expiration_before_observation_profiles === 2667
      && counts.summary.exception_counts.ny_retail_food_stale_non_active === 24230, 'Lifecycle source conservation or audited exception counts differ.');
    check(stable(counts.status_values) === stable(expectedStatusCounts(input.taxonomy)), 'Lifecycle source-status value distribution differs from the closed taxonomy.');
    check(counts.summary.lifecycle_evidence_counts.unknown === 633232 && counts.summary.lifecycle_evidence_counts.contradictory === 2667);
    counts.summary.status_value_counts = Object.fromEntries(Object.entries(counts.status_values).sort(([a], [b]) => a.localeCompare(b)));
    const bindings = bindingObject(input), summary = counts.summary;
    const releaseKey = { schema_version: BUSINESS_ENTITY_LIFECYCLE_VERSION, assessment_as_of: AS_OF, bindings, summary, artifacts };
    const release_id = `${DATASET}-${sha(stable(releaseKey))}`;
    const manifest = { schema_version: `${DATASET}-release@1.0.0`, dataset_id: DATASET, release_id,
      status: 'immutable-pointer-free-local-review-only', publication_mode: 'pointer-free', assessment_as_of: AS_OF,
      bindings, summary, claims: { current_operation_verified: false, active_business_eligible: false, identity_resolution_applied: false,
        registry_bytes_modified: false, source_acquisition_performed: false, current_pointer_written: false, production_enrollment: false }, artifacts };
    const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`); await writeFile(path.join(stage, 'manifest.json'), manifestBytes, { flag: 'wx' });
    const manifestSha = sha(manifestBytes), final = path.join(dataRoot, release_id);
    const existing = await lstat(final).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
    if (existing) {
      check(existing.isDirectory() && !existing.isSymbolicLink()); await rm(stage, { recursive: true, force: false });
    } else { check(owner.isDirectory() && !owner.isSymbolicLink()); await rename(stage, final); }
    published = true;
    const verified = await verifyBusinessEntityLifecycleReleaseInternal({ root, release_id, expectedManifestSha256: manifestSha, signal });
    const configPath = path.join(root, `config/datasets/${DATASET}.json`);
    const old = await readJson(configPath, 1_000_000, signal).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
    const retained = (old?.retained_releases ?? []).filter(item => item.release_id !== release_id).map(item => ({ ...item, selected: false }));
    retained.push({ release_id, manifest: `data/${DATASET}/releases/${release_id}/manifest.json`, manifest_sha256: manifestSha, profile_count: summary.profile_count, selected: true });
    const registration = { schema_version: `${DATASET}-registration@1.0.0`, dataset_id: DATASET, status: 'registered-pointer-free-local-review-only', runtime_pointer: null,
      production_enrollment: false, current_pointer_written: false, selected_release_id: release_id, retained_releases: retained };
    const tmp = `${configPath}.tmp-${randomUUID()}`; await writeFile(tmp, `${JSON.stringify(registration, null, 2)}\n`, { flag: 'wx' }); await rename(tmp, configPath);
    return { release_id, manifest_sha256: manifestSha, summary: verified.summary };
  } catch (error) {
    if (!published) { const current = await lstat(stage).catch(() => null); if (current?.isDirectory() && !current.isSymbolicLink() && current.dev === owner.dev && current.ino === owner.ino) await rm(stage, { recursive: true, force: true }).catch(() => {}); }
    throw error;
  }
}

async function verifyBusinessEntityLifecycleReleaseInternal({ root, release_id, expectedManifestSha256, signal }) {
  root = path.resolve(root); const input = await readBindings(root, signal); const manifestPath = path.join(root, 'data', DATASET, 'releases', release_id, 'manifest.json');
  await ensureNoLinkPath(root, manifestPath); const bytes = await readFile(manifestPath); check(bytes.length <= 1_000_000 && sha(bytes) === expectedManifestSha256);
  const manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  check(manifest.dataset_id === DATASET && manifest.release_id === release_id && manifest.schema_version === `${DATASET}-release@1.0.0`
    && manifest.status === 'immutable-pointer-free-local-review-only' && manifest.publication_mode === 'pointer-free'
    && manifest.assessment_as_of === AS_OF && stable(manifest.bindings) === stable(bindingObject(input))
    && manifest.claims?.current_operation_verified === false && manifest.claims?.active_business_eligible === false
    && manifest.claims?.identity_resolution_applied === false && manifest.claims?.registry_bytes_modified === false
    && manifest.claims?.source_acquisition_performed === false && manifest.claims?.current_pointer_written === false && manifest.claims?.production_enrollment === false);
  check(manifest.artifacts.length === 100 && manifest.summary.profile_count === 8011835);
  const byPath = new Map(manifest.artifacts.map(item => [item.path, item])); check(byPath.size === 100);
  const counts = { sources: {}, status_values: {}, summary: emptySummary(input) };
  for (const sourceArtifact of input.registry.profile_artifacts) {
    signal?.throwIfAborted(); const m = /zip2=(\d{2})\.jsonl\.gz$/.exec(sourceArtifact.path); check(m);
    const rel = `decisions/zip2=${m[1]}.jsonl.gz`, output = byPath.get(rel); check(output && output.artifact_type === 'business-entity-lifecycle-decision-jsonl-gzip');
    const outputFile = path.join(path.dirname(manifestPath), rel); await ensureNoLinkPath(root, outputFile);
    await consumeProfileShard(root, input, sourceArtifact, null, signal, counts, { file: outputFile, artifact: output });
  }
  check(counts.summary.profile_count === 8011835 && stable(counts.sources) === stable(sourceCounts)
    && Object.keys(counts.status_values).length === 16 && counts.summary.exception_counts.la_null_source_status === 633232
    && counts.summary.exception_counts.ca_expiration_before_observation_profiles === 2667
    && counts.summary.exception_counts.ny_retail_food_stale_non_active === 24230);
  check(stable(counts.status_values) === stable(expectedStatusCounts(input.taxonomy)), 'Lifecycle replay status distribution differs from the closed taxonomy.');
  counts.summary.status_value_counts = Object.fromEntries(Object.entries(counts.status_values).sort(([a], [b]) => a.localeCompare(b)));
  check(stable(counts.summary) === stable(manifest.summary));
  return { status: 'verified', release_id, manifest_sha256: expectedManifestSha256, summary: manifest.summary };
}

export async function verifyBusinessEntityLifecycleRelease({ root = APP_ROOT, release_id, expectedManifestSha256, signal } = {}) {
  check(typeof release_id === 'string' && release_id.startsWith(`${DATASET}-`) && SHA.test(expectedManifestSha256 ?? ''));
  return verifyBusinessEntityLifecycleReleaseInternal({ root, release_id, expectedManifestSha256, signal });
}
