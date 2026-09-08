import { createHash } from "node:crypto";
import { setImmediate as yieldLoop } from "node:timers/promises";
import { loadOhChildcareRegistryInput } from "./oh-childcare-registry-input.mjs";
import { verifyOhChildcareAppJob } from "./oh-childcare-app.mjs";

export const OH_CHILDCARE_REGISTRY_TRANSFORMATION = "oh-childcare-registry-adapter@1.0.0";
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");

// Private projection: only records returned by the verified app-input boundary
// reach here. Never reconstruct raw features from lossy normalized ZIP/text data.
function project(record, input) {
  const p = record.provenance, address = record.physical_address, observedAt = p.observed_at;
  const suffix = `oh_childcare_${hash([record.dataset_id, p.source_release_id, p.source_object_id]).slice(0, 32)}`;
  const siteId = `site:${suffix}`, establishmentId = `establishment:${suffix}`;
  const source = { source_id: record.dataset_id, source_release_id: p.source_release_id,
    source_record_id: record.source_record_id, ingest_run_id: p.ingest_run_id,
    transformation_version: `${p.transformation_version} -> ${OH_CHILDCARE_REGISTRY_TRANSFORMATION}`, policy_id: p.policy_id };
  const entity = (id, type) => ({ schema_version: "1.0.0", entity_id: id, entity_type: type,
    identity_status: "provisional", created_at: observedAt, updated_at: observedAt, superseded_by: null });
  const assertion = (subject, predicate, value, valueType, field) => ({ schema_version: "1.0.0",
    assertion_id: `assertion:${hash([subject, predicate, value, p.source_release_id, record.source_record_id]).slice(0, 32)}`,
    subject_entity_id: subject, predicate, value: structuredClone(value), value_type: valueType,
    assertion_status: "active", valid_from: null, valid_to: null, observed_at: observedAt,
    first_seen: observedAt, last_seen: observedAt, confidence: 1,
    source: { ...source, source_field: field }, export_policy: "local-review-only" });
  return {
    zipCode: address.zip_code,
    entities: [entity(siteId, "physical_site"), entity(establishmentId, "establishment")],
    assertions: [
      assertion(siteId, "site.address", address, "address", "street_address|city|state|zip_code|county"),
      ...(address.zip_code === null ? [] : [assertion(siteId, "site.zip-code", address.zip_code, "string", "zip_code")]),
      assertion(siteId, "site.reported-location", record.geocode, "object", "geometry.x|geometry.y"),
      assertion(siteId, "site.source-geography", record.quality, "object", null),
      assertion(establishmentId, "establishment.name", record.business_name, "string", "program_name"),
      assertion(establishmentId, "establishment.source-status", record.source_status, "object", "program_status"),
      assertion(establishmentId, "establishment.source-classification", record.industry, "object", "program_type"),
      ...record.external_identifiers.map(id => assertion(establishmentId, "establishment.external-identifier", id, "identifier", "program_number")),
    ],
    relationships: [{ schema_version: "1.0.0",
      relationship_id: `relationship:${hash(["located_at", establishmentId, siteId, p.source_release_id, record.source_record_id]).slice(0, 32)}`,
      relationship_type: "located_at", subject_entity_id: establishmentId, object_entity_id: siteId,
      status: "active", valid_from: null, valid_to: null, observed_at: observedAt, confidence: 1, source: { ...source } }],
    matchProfiles: [], exportPolicy: "local-review-only", governedGeographicAssignmentEligible: false,
    evidence: { manifest_sha256: input.source.manifestSha256, release_id: input.source.releaseId,
      app_receipt_sha256: input.source.receiptSha256, app_run_id: input.source.appRunId,
      acquisition_manifest_sha256: input.source.acquisitionManifestSha256, execution_mode: input.source.executionMode,
      normalized_artifact_sha256: input.source.normalizedSha256, policy_profile: p.policy_profile,
      input_feature_sha256: p.input_feature_sha256, attribution: p.attribution,
      transformation_version: p.transformation_version, normalized_provenance: structuredClone(p),
      processed_at: p.processed_at, zip_unavailable_reason: record.quality.zip_unavailable_reason,
      source_claims: structuredClone(input.claims), governed_geographic_assignment_eligible: false,
      assertion_status_semantics: "current source assertion representation, not operating-business status",
      confidence_semantics: "confidence 1 represents faithful source representation, not verified operation, identity, location accuracy or nationwide completeness",
      temporal_scope: "page-level source observation retained; processing time is not a refreshed source observation or operating date",
      identity_scope: "source-release-row candidates; no deduplication, ownership verification or matching eligibility",
      publisher_metadata_required: true, publisher_notices_required: true, legal_approval: false, export_authorized: false },
  };
}

/** Network-free reporting candidates from a verified app receipt, never caller-
 * supplied records. Enrollment and production publication are separate steps. */
export async function loadOhChildcareRegistryCandidates(receiptPath, options = {}) {
  const input = await loadOhChildcareRegistryInput(receiptPath, options), { signal } = options;
  const { records, ...context } = input, contributions = [];
  for (const [index, record] of records.entries()) {
    if (index % 100 === 0) { await yieldLoop(); signal?.throwIfAborted(); }
    contributions.push(project(record, input));
  }
  const final = await verifyOhChildcareAppJob(receiptPath, { signal });
  if (final.receipt_sha256 !== input.source.receiptSha256 || final.normalized.sha256 !== input.source.manifestSha256
    || final.acquisition.sha256 !== input.source.acquisitionManifestSha256) throw new Error("Ohio registry candidates rejected: input snapshot changed.");
  signal?.throwIfAborted();
  return { ...context, candidateTransformationVersion: OH_CHILDCARE_REGISTRY_TRANSFORMATION, contributions };
}
