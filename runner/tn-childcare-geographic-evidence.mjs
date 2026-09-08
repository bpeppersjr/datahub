import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { normalizeTnChildcareFeature, TN_CHILDCARE_REPROCESS_TRANSFORMATION, TN_CHILDCARE_TRANSFORMATION } from "./tn-childcare-normalization.mjs";
import { TN_CHILDCARE_REGISTRY_TRANSFORMATION, TN_CHILDCARE_FRESH_REGISTRY_TRANSFORMATION } from "./tn-childcare-registry-adapter.mjs";

export const TN_CHILDCARE_GEOGRAPHIC_VERSION = "tn-childcare-geographic-evidence@1.0.0";
export const TN_CHILDCARE_FRESH_GEOGRAPHIC_VERSION = "tn-childcare-geographic-evidence@1.1.0";
const DATASET = "tn-dhs-active-childcare-centers";
const sha = (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const exact = (v, keys) => v && typeof v === "object" && !Array.isArray(v) && isDeepStrictEqual(Object.keys(v).sort(), [...keys].sort());
const hex = (v) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const uuid = (v) => typeof v === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const utc = (v) => typeof v === "string" && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
function check(ok, label) { if (!ok) throw new Error(`Invalid Tennessee reporting-only geographic evidence: ${label}.`); }
function contextFor(p) { return { runId: p.ingest_run_id, sourceReleaseId: p.source_release_id, observedAt: p.observed_at, outputWkid: 4326,
  editingInfo: p.publisher_editing_info, itemModifiedEpochMs: p.publisher_item_modified_epoch_ms, transformationVersion: TN_CHILDCARE_REPROCESS_TRANSFORMATION }; }
function normalizeParts(address, name, location, reason, p, providerId = null) {
  let zip;
  if (address?.zip_code === null) {
    check(["missing-source-zip", "invalid-source-zip-placeholder"].includes(reason), "missing ZIP reason"); zip = reason === "missing-source-zip" ? null : "0";
  } else { check(reason === null, "available ZIP reason"); zip = address?.zip4 === null ? address.zip_code : `${address?.zip_code}-${address?.zip4}`; }
  const raw = { attributes: { OBJECTID: p.source_object_id, Provider_ID: providerId, Provider_Status: "Active", Provider_Type: "Child Care", Child_Care_Type: "Child Care Center",
    Provider_Name: name, Street_Address: address?.street, Street_Address_2: address?.street2, City: address?.city, State: address?.state, Zip: zip, County: address?.county_source },
  geometry: location?.latitude === null && location?.longitude === null ? null : { x: location?.longitude, y: location?.latitude } };
  const record = normalizeTnChildcareFeature(raw, contextFor(p)); record.provenance.input_feature_sha256 = p.input_feature_sha256;
  return record;
}
function evidenceValid(e, source, observedAt, fresh) {
  check(exact(e, ["manifest_sha256", "policy_profile", "release_id", "input_feature_sha256", "attribution", "transformation_version", "normalized_provenance",
    "processed_at", "recovery", "zip_unavailable_reason", "assertion_status_semantics", "confidence_semantics", "temporal_scope", "identity_scope",
    "publisher_metadata_required", "publisher_notices_required", "legal_approval", "export_authorized", "assertions_sha256",
    ...(fresh ? ["acquisition_kind", "processing_time_status"] : [])]), "evidence keys");
  const p = e.normalized_provenance;
  check(p && hex(e.manifest_sha256) && hex(e.assertions_sha256) && hex(e.input_feature_sha256) && e.input_feature_sha256 === p.input_feature_sha256
    && e.policy_profile === "tn-childcare-local-review@1.0.0" && e.release_id === `${fresh ? "tn-childcare-" : "tn-childcare-recovered-"}${source.ingest_run_id}`
    && e.transformation_version === TN_CHILDCARE_REPROCESS_TRANSFORMATION && e.attribution === "Tennessee Department of Human Services; State of Tennessee STS GIS"
    && (fresh ? e.processed_at === null : utc(e.processed_at) && e.processed_at >= observedAt) && e.publisher_metadata_required === true && e.publisher_notices_required === true
    && e.legal_approval === false && e.export_authorized === false, "evidence policy or provenance");
  check(e.assertion_status_semantics === "current source assertion representation, not operating-business status"
    && e.confidence_semantics === "confidence 1 represents faithful source representation, not verified operation, identity, location accuracy or nationwide completeness"
    && e.temporal_scope === (fresh ? "source observation preserved; no recovery or processing timestamp invented" : "source observation preserved; processed_at is recovery time, not a refreshed source observation")
    && e.identity_scope === "source-release-row candidates; no deduplication, ownership verification or matching eligibility", "claim semantics");
  check(p.source_release_id === source.source_release_id && p.ingest_run_id === source.ingest_run_id && p.observed_at === observedAt
    && Number.isSafeInteger(p.source_object_id) && p.source_object_id > 0 && source.source_record_id === `${source.source_release_id}:object:${p.source_object_id}`, "source context binding");
  const recovery = e.recovery;
  if (fresh) {
    check(recovery === null && e.acquisition_kind === "ordinary-verified-local-release" && e.processing_time_status === "not-recorded-by-source-release-contract", "fresh origin");
    return;
  }
  check(exact(recovery, ["mode", "network_requests", "failed_run_id", "failed_staging_id", "original_pins", "legacy_normalization"])
    && recovery.mode === "offline-failed-acquisition-recovery" && recovery.network_requests === 0
    && typeof recovery.failed_run_id === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(recovery.failed_run_id)
    && uuid(recovery.failed_staging_id) && recovery.failed_staging_id !== source.ingest_run_id, "recovery identity");
  const root = `data/industry-segments/runs/${recovery.failed_run_id}`, stage = `${root}/state-tn-childcare-TN/.staging/${recovery.failed_staging_id}`;
  const paths = { receipt: [`${root}/receipt.json`, 1_000_000], log: [`${root}/logs/state-tn-childcare-TN.log`, 8_000_000],
    selectedFeatures: [`${stage}/selected-features.jsonl`, 100_000_000], sourceObservation: [`${stage}/source-observation.json`, 150_000_000], publisherMetadata: [`${stage}/publisher-metadata.xml`, 1_000_000] };
  check(exact(recovery.original_pins, Object.keys(paths)), "recovery pin roster");
  for (const [key, [path, maximum]] of Object.entries(paths)) {
    const pin = recovery.original_pins[key]; check(exact(pin, ["path", "bytes", "sha256"]) && pin.path === path && Number.isSafeInteger(pin.bytes)
      && pin.bytes >= 1 && pin.bytes <= maximum && hex(pin.sha256), "recovery pin");
  }
  const legacy = recovery.legacy_normalization;
  const reasons = ["invalid-text", "missing-required-text", "invalid-feature", "selected-field-drift", "invalid-object-id", "invalid-provider-id", "source-scope-drift", "source-state-drift", "nonphysical-address", "invalid-postal-code", "invalid-source-coordinate"];
  check(exact(legacy, ["transformation_version", "accepted", "quarantined", "reasons", "quality_gate_passed", "maximum_quarantine_fraction"])
    && legacy.transformation_version === TN_CHILDCARE_TRANSFORMATION && Number.isSafeInteger(legacy.accepted) && legacy.accepted >= 0
    && Number.isSafeInteger(legacy.quarantined) && legacy.quarantined > 0 && legacy.accepted + legacy.quarantined <= 20_000
    && (!legacy.accepted || legacy.quarantined / (legacy.accepted + legacy.quarantined) > 0.05)
    && legacy.quality_gate_passed === false && legacy.maximum_quarantine_fraction === 0.05
    && legacy.reasons && typeof legacy.reasons === "object" && !Array.isArray(legacy.reasons)
    && Object.entries(legacy.reasons).every(([key, count]) => reasons.includes(key) && Number.isSafeInteger(count) && count > 0)
    && Object.values(legacy.reasons).reduce((a, b) => a + b, 0) === legacy.quarantined, "legacy failure contract");
}

/** Validates source-specific shape and cross-field semantics, not manifest membership
 * or publisher authenticity. The recorded assertion digest needs upstream binding. */
export function validateTnChildcareGeographicEvidence(row) {
  return validateRow(row, false);
}
export function validateFreshTnChildcareGeographicEvidence(row) {
  return validateRow(row, true);
}
function validateRow(row, fresh) {
  check(exact(row, ["schema_version", "site_entity_id", "establishment_entity_id", "zip_code", "address", "location", "source", "observed_at", "identity_matching_eligible",
    "export_policy", "category", "evidence", "names", "source_status"]), "row keys");
  check(row.schema_version === (fresh ? "1.1.0" : "1.0.0") && row.category === "childcare" && row.identity_matching_eligible === false && row.export_policy === "local-review-only"
    && utc(row.observed_at) && exact(row.location, ["latitude", "longitude"]) && Array.isArray(row.names) && row.names.length === 1 && exact(row.names[0], ["raw"]), "row scope");
  const source = row.source;
  check(exact(source, ["source_id", "source_release_id", "source_record_id", "ingest_run_id", "transformation_version", "policy_id"])
    && source.source_id === DATASET && typeof source.source_release_id === "string" && /^tn-childcare-[a-f0-9]{64}$/.test(source.source_release_id)
    && uuid(source.ingest_run_id) && source.policy_id === "tn-childcare-local-review"
    && source.transformation_version === `${TN_CHILDCARE_REPROCESS_TRANSFORMATION} -> ${fresh ? TN_CHILDCARE_FRESH_REGISTRY_TRANSFORMATION : TN_CHILDCARE_REGISTRY_TRANSFORMATION}`, "source contract");
  evidenceValid(row.evidence, source, row.observed_at, fresh);
  const p = row.evidence.normalized_provenance, expected = normalizeParts(row.address, row.names[0].raw, row.location, row.evidence.zip_unavailable_reason, p);
  check(isDeepStrictEqual(row.address, expected.physical_address) && isDeepStrictEqual(row.source_status, expected.source_status)
    && isDeepStrictEqual(p, expected.provenance) && row.names[0].raw === expected.business_name && row.zip_code === expected.physical_address.zip_code, "normalized value or provenance binding");
  const suffix = `tn_childcare_${sha([DATASET, source.source_release_id, p.source_object_id]).slice(0, 32)}`;
  check(row.site_entity_id === `site:${suffix}` && row.establishment_entity_id === `establishment:${suffix}`, "source-row entity identity");
  return row;
}

export function createTnChildcareGeographicEvidence(contribution) {
  return createRow(contribution, false);
}
export function createFreshTnChildcareGeographicEvidence(contribution) {
  return createRow(contribution, true);
}
function createRow(contribution, fresh) {
  check(exact(contribution, ["zipCode", "entities", "assertions", "relationships", "matchProfiles", "exportPolicy", "evidence"])
    && Array.isArray(contribution.assertions) && contribution.assertions.length >= 7 && contribution.assertions.length <= 9
    && Array.isArray(contribution.matchProfiles) && contribution.matchProfiles.length === 0 && contribution.exportPolicy === "local-review-only", "contribution envelope");
  const by = new Map();
  for (const assertion of contribution.assertions) { check(assertion && typeof assertion.predicate === "string" && !by.has(assertion.predicate), "duplicate assertion predicate"); by.set(assertion.predicate, assertion); }
  const address = by.get("site.address"), name = by.get("establishment.name"), point = by.get("site.reported-location"), status = by.get("establishment.source-status");
  check(address && name && point && status, "required assertions");
  const source = { ...address.source }; delete source.source_field;
  const evidence = { ...structuredClone(contribution.evidence), assertions_sha256: sha([...contribution.assertions].sort((a, b) => a.assertion_id.localeCompare(b.assertion_id))) };
  check(!Object.hasOwn(contribution.evidence, "assertions_sha256"), "unexpected precomputed assertion digest");
  const row = validateRow({ schema_version: fresh ? "1.1.0" : "1.0.0", site_entity_id: address.subject_entity_id, establishment_entity_id: name.subject_entity_id,
    zip_code: contribution.zipCode, address: structuredClone(address.value), location: { latitude: point.value?.latitude, longitude: point.value?.longitude }, source,
    observed_at: address.observed_at, identity_matching_eligible: false, export_policy: "local-review-only", category: "childcare", names: [{ raw: name.value }], source_status: structuredClone(status.value), evidence }, fresh);
  const identifier = by.get("establishment.external-identifier")?.value;
  const record = normalizeParts(row.address, row.names[0].raw, row.location, evidence.zip_unavailable_reason, evidence.normalized_provenance,
    identifier === undefined ? null : Number(identifier.value));
  const definitions = [
    ["site.address", record.physical_address, "address", "Street_Address|Street_Address_2|City|State|Zip|County"],
    ...(row.zip_code === null ? [] : [["site.zip-code", row.zip_code, "string", "Zip"]]),
    ["site.reported-location", record.geocode, "object", "geometry.x|geometry.y"], ["site.source-geography", record.quality, "object", null],
    ["establishment.name", record.business_name, "string", "Provider_Name"], ["establishment.source-status", record.source_status, "object", "Provider_Status"],
    ["establishment.source-classification", record.industry, "object", "Provider_Type|Child_Care_Type"], ["establishment.source-affiliation", record.affiliation, "object", null],
    ...record.external_identifiers.map((entry) => ["establishment.external-identifier", entry, "identifier", "Provider_ID"]),
  ];
  check(definitions.length === contribution.assertions.length, "assertion roster");
  for (const [predicate, value, valueType, sourceField] of definitions) {
    const subject = predicate.startsWith("site.") ? row.site_entity_id : row.establishment_entity_id;
    const expected = { schema_version: "1.0.0", assertion_id: `assertion:${sha([subject, predicate, value, source.source_release_id, source.source_record_id]).slice(0, 32)}`,
      subject_entity_id: subject, predicate, value, value_type: valueType, assertion_status: "active", valid_from: null, valid_to: null,
      observed_at: row.observed_at, first_seen: row.observed_at, last_seen: row.observed_at, confidence: 1, source: { ...source, source_field: sourceField }, export_policy: "local-review-only" };
    check(isDeepStrictEqual(by.get(predicate), expected), "assertion source, subject, policy or value contract");
  }
  const expectedEntities = [[row.site_entity_id, "physical_site"], [row.establishment_entity_id, "establishment"]].map(([entity_id, entity_type]) => ({ schema_version: "1.0.0", entity_id, entity_type,
    identity_status: "provisional", created_at: row.observed_at, updated_at: row.observed_at, superseded_by: null }));
  check(isDeepStrictEqual(contribution.entities, expectedEntities), "entity roster");
  check(isDeepStrictEqual(contribution.relationships, [{ schema_version: "1.0.0",
    relationship_id: `relationship:${sha(["located_at", row.establishment_entity_id, row.site_entity_id, source.source_release_id, source.source_record_id]).slice(0, 32)}`,
    relationship_type: "located_at", subject_entity_id: row.establishment_entity_id, object_entity_id: row.site_entity_id, status: "active", valid_from: null, valid_to: null,
    observed_at: row.observed_at, confidence: 1, source: { ...source } }]), "relationship contract");
  return row;
}
