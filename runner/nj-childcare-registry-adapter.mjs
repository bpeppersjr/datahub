import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { normalizeNjChildcareFeature, NJ_CHILDCARE_TRANSFORMATION, NJ_CHILDCARE_REPROCESS_TRANSFORMATION } from "./nj-childcare-normalization.mjs";
import { NJ_CHILDCARE_LAYER, NJ_CHILDCARE_ITEM_URL } from "./nj-childcare-preflight.mjs";

export const NJ_CHILDCARE_REGISTRY_TRANSFORMATION = "nj-childcare-registry-adapter@1.0.0";
const DATASET = "nj-licensed-childcare-centers";
const POLICY = { profile: "njdep-childcare-local-review@1.0.0", export: "local-review-only",
  owner: "New Jersey Department of Environmental Protection / Department of Children and Families",
  terms_url: NJ_CHILDCARE_ITEM_URL, allowed_use: "local governed business-source review",
  redistribution: "not-authorized-by-this-release", retention: "immutable local evidence; operator-governed deletion",
  private_fields: "owner, director, center_phone and center_email excluded",
  attribution: "New Jersey Department of Environmental Protection; New Jersey Department of Children and Families",
  publisher_notices: "Complete distribution terms are retained in source-observation.json item payloads and publisher-metadata.xml; authorized publication must carry prescribed publisher credit/disclaimers and accompanying metadata.",
  legal_approval: false };
const utc = (value) => typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const hex = /^[a-f0-9]{64}$/;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function requireValue(ok, label) {
  if (!ok) throw new Error(`New Jersey childcare registry candidate rejected: ${label}.`);
}

/** Pure candidate adapter. Caller must verify the release, manifest digest and record membership.
 * A syntactically valid digest here is not proof of authenticity or artifact membership.
 * No enrollment, publication, identity resolution or operating-business claim is performed.
 */
export function reconcileNjChildcareCenter(record, { manifest, manifestSha256 } = {}) {
  requireValue(manifest?.dataset_id === DATASET && manifest.connector_id === DATASET
    && manifest.schema_version === "1.0.0" && ["1.0.0", "1.0.1"].includes(manifest.connector_version)
    && manifest.transformation_version === (manifest.connector_version === "1.0.0" ? NJ_CHILDCARE_TRANSFORMATION : NJ_CHILDCARE_REPROCESS_TRANSFORMATION) && manifest.status === "complete"
    && uuid.test(manifest.run_id) && manifest.release_id === `nj-childcare-${manifest.run_id}`
    && /^nj-childcare-[a-f0-9]{64}$/.test(manifest.source_release_id)
    && manifest.source_url === NJ_CHILDCARE_LAYER && utc(manifest.observed_at) && hex.test(manifestSha256), "manifest context");
  requireValue(isDeepStrictEqual(manifest.policy, POLICY), "source policy");
  requireValue(isDeepStrictEqual(manifest.claims, { active_business_verified: false, unique_business_identity_verified: false,
    national_coverage_complete: false, current_usps_validity_verified: false, disappearance_means_closure: false }), "source claims");
  if (manifest.connector_version === "1.0.0") {
    requireValue(!Object.hasOwn(manifest, "processed_at") && !Object.hasOwn(manifest, "reprocessing"), "legacy processing context");
  } else {
    const lineage = manifest.reprocessing;
    requireValue(utc(manifest.processed_at) && manifest.processed_at >= manifest.observed_at
      && lineage && /^nj-childcare-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(lineage.parent_release_id)
      && lineage.parent_release_id !== manifest.release_id && hex.test(lineage.parent_manifest_sha256)
      && isDeepStrictEqual(lineage, { mode: "local-retained-evidence", network_requests: 0,
        parent_release_id: lineage.parent_release_id, parent_source_release_id: manifest.source_release_id,
        parent_manifest_sha256: lineage.parent_manifest_sha256, parent_manifest_artifact: "reprocessing-parent-manifest.json",
        parent_transformation_version: NJ_CHILDCARE_TRANSFORMATION }), "reprocessing lineage");
  }
  const p = record?.provenance;
  requireValue(p?.source_release_id === manifest.source_release_id && p.ingest_run_id === manifest.run_id
    && p.observed_at === manifest.observed_at && hex.test(p.input_feature_sha256), "record provenance");
  // Reproduce the complete normalization contract, not a permissive subset. This reconstruction
  // validates normalized values only; the original selected-feature digest is verified upstream.
  const address = record.physical_address, identifiers = record.external_identifiers;
  requireValue(address && Array.isArray(identifiers), "record structure");
  const feature = { attributes: { OBJECTID: p.source_object_id,
    center_id: identifiers.find((identifier) => identifier?.type === "new_jersey_dcf_center_id")?.value,
    center_name: record.business_name, address: address.street, address2: address.street2, city: address.city,
    county: address.county_source, state: address.state,
    zip: address.zip4 === null ? address.zip_code : `${address.zip_code}-${address.zip4}`,
    licensed_capacity: record.license?.licensed_capacity, age_range: record.industry?.age_range_source,
    months_operational: record.industry?.months_operational_source, sessions: record.industry?.sessions_source,
    license_approval_date: record.license?.approval_date_epoch_ms, license_renewal_date: record.license?.renewal_date_epoch_ms,
    foips: record.industry?.public_school_facility_source, location_reference_desc: record.geocode?.location_reference_source,
    coord_source_type_desc: record.geocode?.coordinate_source_type, coord_sys_desc: record.geocode?.original_coordinate_system_source,
    coord_source_org_desc: record.geocode?.coordinate_source_organization, download_date: p.publisher_download_date_epoch_ms },
  geometry: record.geocode?.latitude === null && record.geocode?.longitude === null ? null
    : { x: record.geocode?.longitude, y: record.geocode?.latitude } };
  let reproduced;
  try { reproduced = normalizeNjChildcareFeature(feature, { runId: manifest.run_id,
    sourceReleaseId: manifest.source_release_id, observedAt: manifest.observed_at, outputWkid: 4326,
    downloadDateEpochMs: p.publisher_download_date_epoch_ms, transformationVersion: manifest.transformation_version }); }
  catch { requireValue(false, "normalization contract"); }
  reproduced.provenance.input_feature_sha256 = p.input_feature_sha256;
  requireValue(isDeepStrictEqual(record, reproduced), "normalization contract");
  const observedAt = manifest.observed_at;
  // Release-scoped row candidates: center identifiers are not identity keys.
  const suffix = `nj_childcare_${hash([DATASET, manifest.source_release_id, p.source_object_id]).slice(0, 32)}`;
  const siteId = `site:${suffix}`, establishmentId = `establishment:${suffix}`;
  const source = { source_id: DATASET, source_release_id: p.source_release_id,
    source_record_id: record.source_record_id, ingest_run_id: p.ingest_run_id,
    transformation_version: `${p.transformation_version} -> ${NJ_CHILDCARE_REGISTRY_TRANSFORMATION}`, policy_id: "njdep-childcare-local-review" };
  const entity = (id, type) => ({ schema_version: "1.0.0", entity_id: id, entity_type: type,
    identity_status: "provisional", created_at: observedAt, updated_at: observedAt, superseded_by: null });
  const assertion = (subject, predicate, value, valueType, sourceField) => ({ schema_version: "1.0.0",
    assertion_id: `assertion:${hash([subject, predicate, value, p.source_release_id, record.source_record_id]).slice(0, 32)}`,
    subject_entity_id: subject, predicate, value: structuredClone(value), value_type: valueType,
    // 'active' describes this assertion's representation, never the program's operating status.
    assertion_status: "active", valid_from: null, valid_to: null, observed_at: observedAt,
    first_seen: observedAt, last_seen: observedAt, confidence: 1, source: { ...source, source_field: sourceField },
    export_policy: "local-review-only" });
  const assertions = [
    assertion(siteId, "site.address", address, "address", "address|address2|city|county|state|zip"),
    assertion(siteId, "site.zip-code", address.zip_code, "string", "zip"),
    assertion(siteId, "site.reported-location", record.geocode, "object", "geometry.x|geometry.y|location_reference_desc|coord_source_type_desc|coord_sys_desc|coord_source_org_desc"),
    assertion(siteId, "site.source-geography", record.quality, "object", null),
    assertion(establishmentId, "establishment.name", record.business_name, "string", "center_name"),
    assertion(establishmentId, "establishment.source-status", record.license, "object", "licensed_capacity|license_approval_date|license_renewal_date"),
    assertion(establishmentId, "establishment.source-classification", record.industry, "object", "foips|age_range|months_operational|sessions"),
    assertion(establishmentId, "establishment.source-affiliation", record.affiliation, "object", null),
    ...identifiers.map((identifier) => assertion(establishmentId, "establishment.external-identifier", identifier, "identifier", "center_id")),
  ];
  return { zipCode: address.zip_code, entities: [entity(siteId, "physical_site"), entity(establishmentId, "establishment")], assertions,
    relationships: [{ schema_version: "1.0.0", relationship_id: `relationship:${hash(["located_at", establishmentId, siteId, p.source_release_id, record.source_record_id]).slice(0, 32)}`,
      relationship_type: "located_at", subject_entity_id: establishmentId, object_entity_id: siteId,
      status: "active", valid_from: null, valid_to: null, observed_at: observedAt, confidence: 1, source: { ...source } }],
    matchProfiles: [], exportPolicy: "local-review-only", evidence: { manifest_sha256: manifestSha256, policy_profile: POLICY.profile,
      release_id: manifest.release_id, input_feature_sha256: p.input_feature_sha256, attribution: POLICY.attribution,
      assertion_status_semantics: "current source assertion representation, not operating-business status",
      confidence_semantics: "confidence 1 represents faithful source representation, not verified operation, identity, location accuracy or nationwide completeness",
      temporal_scope: "single source observation; first_seen/last_seen are not cross-release lifecycle dates",
      identity_scope: "source-release-row candidates; not deduplicated businesses or verified ownership",
      transformation_version: manifest.transformation_version, publisher_download_date_epoch_ms: p.publisher_download_date_epoch_ms,
      normalized_provenance: structuredClone(p),
      publisher_metadata_required: true, derived_publication_notice_required: true,
      ...(manifest.connector_version === "1.0.1" ? { processed_at: manifest.processed_at, reprocessing: structuredClone(manifest.reprocessing) } : {}) } };
}

