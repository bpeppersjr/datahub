import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { normalizeTnChildcareFeature, TN_CHILDCARE_TRANSFORMATION, TN_CHILDCARE_REPROCESS_TRANSFORMATION } from "./tn-childcare-normalization.mjs";
import { TN_CHILDCARE_LAYER, TN_CHILDCARE_WHERE } from "./tn-childcare-preflight.mjs";

export const TN_CHILDCARE_REGISTRY_TRANSFORMATION = "tn-childcare-registry-adapter@1.0.0";
export const TN_CHILDCARE_FRESH_REGISTRY_TRANSFORMATION = "tn-childcare-registry-adapter@1.1.0";
const DATASET = "tn-dhs-active-childcare-centers", POLICY_HASH = "a5f642f28fba1a3ba80cf31b3b080011c96cc7bc201a043c981bea46090cee2f";
const hash = (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const hex = (v) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const uuid = (v) => typeof v === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const utc = (v) => typeof v === "string" && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const exact = (v, keys) => v && typeof v === "object" && !Array.isArray(v) && isDeepStrictEqual(Object.keys(v).sort(), [...keys].sort());
const count = (v) => Number.isSafeInteger(v) && v >= 0;
function requireValue(ok, label) { if (!ok) throw new Error(`Tennessee childcare registry candidate rejected: ${label}.`); }
function validateManifest(manifest, manifestSha256) {
  requireValue(manifest?.schema_version === "1.0.0" && manifest.dataset_id === DATASET && manifest.connector_id === DATASET && manifest.connector_version === "1.0.1"
    && manifest.transformation_version === TN_CHILDCARE_REPROCESS_TRANSFORMATION && manifest.recovery_version === "tn-childcare-failed-acquisition-recovery@1.0.0"
    && uuid(manifest.run_id) && manifest.release_id === `tn-childcare-recovered-${manifest.run_id}` && /^tn-childcare-[a-f0-9]{64}$/.test(manifest.source_release_id)
    && manifest.status === "complete" && manifest.source_url === TN_CHILDCARE_LAYER && manifest.source_filter === TN_CHILDCARE_WHERE && hex(manifestSha256)
    && utc(manifest.observed_at) && utc(manifest.processed_at) && manifest.processed_at >= manifest.observed_at, "manifest context");
  const policy = manifest.policy;
  requireValue(policy?.profile === "tn-childcare-local-review@1.0.0" && policy.configuration_sha256 === POLICY_HASH
    && hash(Object.fromEntries(Object.entries(policy).filter(([key]) => !["profile", "configuration_sha256"].includes(key)))) === POLICY_HASH, "source policy");
  requireValue(isDeepStrictEqual(manifest.claims, { active_business_verified: false, license_dates_verified: false, unique_business_identity_verified: false,
    national_coverage_complete: false, current_usps_validity_verified: false, disappearance_means_closure: false, legal_approval: false, export_authorized: false, zip_inferred_from_geometry: false }), "source claims");
  requireValue(exact(manifest.counts, ["selected", "accepted", "quarantined"]) && Object.values(manifest.counts).every(count)
    && manifest.counts.selected >= 1 && manifest.counts.selected <= 20_000 && manifest.counts.accepted >= 1
    && manifest.counts.accepted + manifest.counts.quarantined === manifest.counts.selected
    && manifest.quarantine_max_fraction === 0.05 && manifest.counts.quarantined / manifest.counts.selected <= 0.05
    && exact(manifest.postal_coverage, ["available", "missing_source_zip", "invalid_source_zip_placeholder"]) && Object.values(manifest.postal_coverage).every(count)
    && Object.values(manifest.postal_coverage).reduce((a, b) => a + b, 0) === manifest.counts.accepted, "counts and postal coverage");
  const recovery = manifest.recovery;
  requireValue(exact(recovery, ["mode", "network_requests", "failed_run_id", "failed_staging_id", "original_pins", "legacy_normalization"])
    && recovery.mode === "offline-failed-acquisition-recovery" && recovery.network_requests === 0
    && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(recovery.failed_run_id) && uuid(recovery.failed_staging_id) && recovery.failed_staging_id !== manifest.run_id, "recovery context");
  const pins = recovery.original_pins, run = `data/industry-segments/runs/${recovery.failed_run_id}`, stage = `${run}/state-tn-childcare-TN/.staging/${recovery.failed_staging_id}`;
  const expectedPaths = { receipt: `${run}/receipt.json`, log: `${run}/logs/state-tn-childcare-TN.log`, selectedFeatures: `${stage}/selected-features.jsonl`, sourceObservation: `${stage}/source-observation.json`, publisherMetadata: `${stage}/publisher-metadata.xml` };
  requireValue(exact(pins, Object.keys(expectedPaths)) && Object.entries(expectedPaths).every(([key, expected]) => exact(pins[key], ["path", "bytes", "sha256"])
    && pins[key].path === expected && Number.isSafeInteger(pins[key].bytes) && pins[key].bytes > 0 && hex(pins[key].sha256)), "recovery pins");
  const legacy = recovery.legacy_normalization;
  requireValue(exact(legacy, ["transformation_version", "accepted", "quarantined", "reasons", "quality_gate_passed", "maximum_quarantine_fraction"])
    && legacy.transformation_version === TN_CHILDCARE_TRANSFORMATION && count(legacy.accepted) && count(legacy.quarantined)
    && legacy.accepted + legacy.quarantined === manifest.counts.selected && (!legacy.accepted || legacy.quarantined / manifest.counts.selected > 0.05)
    && legacy.quality_gate_passed === false && legacy.maximum_quarantine_fraction === 0.05
    && legacy.reasons && typeof legacy.reasons === "object" && !Array.isArray(legacy.reasons)
    && Object.entries(legacy.reasons).every(([key, value]) => /^[a-z][a-z-]{0,63}$/.test(key) && Number.isSafeInteger(value) && value > 0)
    && Object.values(legacy.reasons).reduce((a, b) => a + b, 0) === legacy.quarantined, "legacy failure evidence");
}

/** Pure adapter: caller must verify immutable release/hash and normalized record
 * membership. Shape-valid digests here do not establish publisher authenticity.
 * Produces local-review candidates only; no enrollment, matching or publication. */
export function reconcileTnChildcareCenter(record, { manifest, manifestSha256 } = {}) {
  validateManifest(manifest, manifestSha256);
  return projectCenter(record, manifest, manifestSha256, false);
}

/** Fresh-release candidates are a distinct contract, not fabricated recoveries.
 * Caller must verify the immutable release and record membership independently. */
export function reconcileFreshTnChildcareCenter(record, { manifest, manifestSha256 } = {}) {
  requireValue(exact(manifest, ["schema_version", "dataset_id", "connector_id", "connector_version", "transformation_version", "run_id", "release_id", "source_release_id", "status", "observed_at", "source_url", "source_filter", "policy", "counts", "quarantine_max_fraction", "scope", "claims", "evidence_limit", "accepted_record_quality", "artifacts"])
    && manifest.schema_version === "1.0.0" && manifest.dataset_id === DATASET && manifest.connector_id === DATASET && manifest.connector_version === "1.1.0"
    && manifest.transformation_version === TN_CHILDCARE_REPROCESS_TRANSFORMATION && uuid(manifest.run_id) && manifest.release_id === `tn-childcare-${manifest.run_id}`
    && /^tn-childcare-[a-f0-9]{64}$/.test(manifest.source_release_id) && manifest.status === "complete" && utc(manifest.observed_at)
    && manifest.source_url === TN_CHILDCARE_LAYER && manifest.source_filter === TN_CHILDCARE_WHERE && hex(manifestSha256), "fresh manifest context");
  const policy = manifest.policy;
  requireValue(policy?.profile === "tn-childcare-local-review@1.0.0" && policy.configuration_sha256 === POLICY_HASH
    && hash(Object.fromEntries(Object.entries(policy).filter(([key]) => !["profile", "configuration_sha256"].includes(key)))) === POLICY_HASH, "fresh source policy");
  requireValue(isDeepStrictEqual(manifest.claims, { active_business_verified: false, license_dates_verified: false, unique_business_identity_verified: false,
    national_coverage_complete: false, current_usps_validity_verified: false, disappearance_means_closure: false, legal_approval: false, export_authorized: false }), "fresh source claims");
  const totals = manifest.counts, quality = manifest.accepted_record_quality;
  requireValue(exact(totals, ["selected", "accepted", "quarantined"]) && Object.values(totals).every(count) && totals.selected >= 1 && totals.selected <= 20_000
    && totals.accepted >= 1 && totals.accepted + totals.quarantined === totals.selected && manifest.quarantine_max_fraction === 0.05 && totals.quarantined / totals.selected <= 0.05, "fresh counts");
  requireValue(exact(quality, ["with_source_zip", "without_source_zip", "missing_zip_reasons", "missing_points", "zip_inferred"])
    && [quality.with_source_zip, quality.without_source_zip, quality.missing_points].every(count) && quality.zip_inferred === false
    && quality.with_source_zip + quality.without_source_zip === totals.accepted && quality.missing_points <= totals.accepted
    && exact(quality.missing_zip_reasons, ["missing-source-zip", "invalid-source-zip-placeholder"]) && Object.values(quality.missing_zip_reasons).every(count)
    && Object.values(quality.missing_zip_reasons).reduce((a, b) => a + b, 0) === quality.without_source_zip, "fresh quality conservation");
  return projectCenter(record, manifest, manifestSha256, true);
}

function projectCenter(record, manifest, manifestSha256, fresh) {
  const p = record?.provenance, address = record?.physical_address, identifiers = record?.external_identifiers;
  requireValue(p?.source_release_id === manifest.source_release_id && p.ingest_run_id === manifest.run_id && p.observed_at === manifest.observed_at
    && hex(p.input_feature_sha256) && address && Array.isArray(identifiers), "record provenance or structure");
  const reason = record.quality?.zip_unavailable_reason;
  let sourceZip;
  if (address.zip_code === null) {
    requireValue(["missing-source-zip", "invalid-source-zip-placeholder"].includes(reason), "missing postal reason");
    sourceZip = reason === "missing-source-zip" ? null : "0";
  } else { requireValue(reason === null, "valid postal reason"); sourceZip = address.zip4 === null ? address.zip_code : `${address.zip_code}-${address.zip4}`; }
  const identifier = identifiers.find((entry) => entry?.type === "tennessee_dhs_provider_id");
  const feature = { attributes: { OBJECTID: p.source_object_id, Provider_ID: identifier === undefined ? null : Number(identifier.value),
    Provider_Status: record.source_status?.status_source, Provider_Type: record.industry?.provider_type_source, Child_Care_Type: record.industry?.childcare_type_source,
    Provider_Name: record.business_name, Street_Address: address.street, Street_Address_2: address.street2, City: address.city, State: address.state,
    Zip: sourceZip, County: address.county_source }, geometry: record.geocode?.latitude === null && record.geocode?.longitude === null ? null : { x: record.geocode?.longitude, y: record.geocode?.latitude } };
  let reproduced;
  try { reproduced = normalizeTnChildcareFeature(feature, { runId: manifest.run_id, sourceReleaseId: manifest.source_release_id, observedAt: manifest.observed_at, outputWkid: 4326,
    editingInfo: p.publisher_editing_info, itemModifiedEpochMs: p.publisher_item_modified_epoch_ms, transformationVersion: TN_CHILDCARE_REPROCESS_TRANSFORMATION }); }
  catch { requireValue(false, "normalization contract"); }
  reproduced.provenance.input_feature_sha256 = p.input_feature_sha256;
  requireValue(isDeepStrictEqual(record, reproduced), "normalization contract");
  const suffix = `tn_childcare_${hash([DATASET, manifest.source_release_id, p.source_object_id]).slice(0, 32)}`, siteId = `site:${suffix}`, establishmentId = `establishment:${suffix}`, observedAt = manifest.observed_at;
  const source = { source_id: DATASET, source_release_id: p.source_release_id, source_record_id: record.source_record_id, ingest_run_id: p.ingest_run_id,
    transformation_version: `${p.transformation_version} -> ${fresh ? TN_CHILDCARE_FRESH_REGISTRY_TRANSFORMATION : TN_CHILDCARE_REGISTRY_TRANSFORMATION}`, policy_id: "tn-childcare-local-review" };
  const entity = (id, type) => ({ schema_version: "1.0.0", entity_id: id, entity_type: type, identity_status: "provisional", created_at: observedAt, updated_at: observedAt, superseded_by: null });
  const assertion = (subject, predicate, value, valueType, field) => ({ schema_version: "1.0.0", assertion_id: `assertion:${hash([subject, predicate, value, p.source_release_id, record.source_record_id]).slice(0, 32)}`,
    subject_entity_id: subject, predicate, value: structuredClone(value), value_type: valueType, assertion_status: "active", valid_from: null, valid_to: null,
    observed_at: observedAt, first_seen: observedAt, last_seen: observedAt, confidence: 1, source: { ...source, source_field: field }, export_policy: "local-review-only" });
  const assertions = [assertion(siteId, "site.address", address, "address", "Street_Address|Street_Address_2|City|State|Zip|County"),
    ...(address.zip_code === null ? [] : [assertion(siteId, "site.zip-code", address.zip_code, "string", "Zip")]),
    assertion(siteId, "site.reported-location", record.geocode, "object", "geometry.x|geometry.y"), assertion(siteId, "site.source-geography", record.quality, "object", null),
    assertion(establishmentId, "establishment.name", record.business_name, "string", "Provider_Name"),
    assertion(establishmentId, "establishment.source-status", record.source_status, "object", "Provider_Status"),
    assertion(establishmentId, "establishment.source-classification", record.industry, "object", "Provider_Type|Child_Care_Type"),
    assertion(establishmentId, "establishment.source-affiliation", record.affiliation, "object", null),
    ...identifiers.map((entry) => assertion(establishmentId, "establishment.external-identifier", entry, "identifier", "Provider_ID"))];
  return { zipCode: address.zip_code, entities: [entity(siteId, "physical_site"), entity(establishmentId, "establishment")], assertions,
    relationships: [{ schema_version: "1.0.0", relationship_id: `relationship:${hash(["located_at", establishmentId, siteId, p.source_release_id, record.source_record_id]).slice(0, 32)}`,
      relationship_type: "located_at", subject_entity_id: establishmentId, object_entity_id: siteId, status: "active", valid_from: null, valid_to: null, observed_at: observedAt, confidence: 1, source: { ...source } }],
    matchProfiles: [], exportPolicy: "local-review-only", evidence: { manifest_sha256: manifestSha256, policy_profile: "tn-childcare-local-review@1.0.0", release_id: manifest.release_id,
      input_feature_sha256: p.input_feature_sha256, attribution: p.attribution, transformation_version: p.transformation_version, normalized_provenance: structuredClone(p),
      processed_at: fresh ? null : manifest.processed_at, recovery: fresh ? null : structuredClone(manifest.recovery), zip_unavailable_reason: reason,
      ...(fresh ? { acquisition_kind: "ordinary-verified-local-release", processing_time_status: "not-recorded-by-source-release-contract" } : {}),
      assertion_status_semantics: "current source assertion representation, not operating-business status",
      confidence_semantics: "confidence 1 represents faithful source representation, not verified operation, identity, location accuracy or nationwide completeness",
      temporal_scope: fresh ? "source observation preserved; no recovery or processing timestamp invented" : "source observation preserved; processed_at is recovery time, not a refreshed source observation",
      identity_scope: "source-release-row candidates; no deduplication, ownership verification or matching eligibility",
      publisher_metadata_required: true, publisher_notices_required: true, legal_approval: false, export_authorized: false } };
}
