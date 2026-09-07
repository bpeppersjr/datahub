import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { normalizeMaChildcareFeature, MA_CHILDCARE_TRANSFORMATION } from "./ma-childcare-normalization.mjs";
import { MA_CHILDCARE_LAYER } from "./ma-childcare-preflight.mjs";

export const MA_CHILDCARE_REGISTRY_TRANSFORMATION = "ma-childcare-registry-adapter@1.0.0";
const DATASET = "ma-licensed-center-based-childcare";
const POLICY = { profile: "massgis-eec-childcare-local-review@1.0.0", export: "local-review-only",
  owner: "Commonwealth of Massachusetts MassGIS/EEC", terms_url: "https://www.mass.gov/info-details/about-massgis",
  allowed_use: "local governed business-source review", redistribution: "not-authorized-by-this-release",
  retention: "immutable local source evidence; operator-governed deletion", private_fields: "PHONE excluded",
  attribution: "MassGIS (Bureau of Geographic Information), Commonwealth of Massachusetts EOTSS; Massachusetts Department of Early Education and Care (EEC)" };
const hex = /^[a-f0-9]{64}$/;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function requireValue(ok, label) {
  if (!ok) throw new Error(`Massachusetts childcare registry candidate rejected: ${label}.`);
}

/** Pure candidate adapter. Caller must verify the release, manifest digest and record membership.
 * A syntactically valid digest here is not proof of authenticity or artifact membership.
 * No enrollment, publication, identity resolution or operating-business claim is performed.
 */
export function reconcileMaChildcareProgram(record, { manifest, manifestSha256 } = {}) {
  requireValue(manifest?.dataset_id === DATASET && manifest.connector_id === DATASET
    && manifest.schema_version === "1.0.0" && ["1.0.0", "1.0.1"].includes(manifest.connector_version)
    && manifest.transformation_version === MA_CHILDCARE_TRANSFORMATION && manifest.status === "complete"
    && uuid.test(manifest.run_id) && manifest.release_id === `ma-childcare-${manifest.run_id}`
    && /^ma-childcare-[a-f0-9]{64}$/.test(manifest.source_release_id)
    && manifest.source_url === MA_CHILDCARE_LAYER && hex.test(manifestSha256), "manifest context");
  requireValue(isDeepStrictEqual(manifest.policy, POLICY), "source policy");
  requireValue(isDeepStrictEqual(manifest.claims, { active_business_verified: false, unique_business_identity_verified: false,
    national_coverage_complete: false, current_usps_validity_verified: false, disappearance_means_closure: false }), "source claims");
  const p = record?.provenance;
  requireValue(p?.source_release_id === manifest.source_release_id && p.ingest_run_id === manifest.run_id
    && p.observed_at === manifest.observed_at && hex.test(p.input_feature_sha256), "record provenance");
  // Reproduce the complete normalization contract, not a permissive subset. This reconstruction
  // validates normalized values only; the original selected-feature digest is verified upstream.
  const address = record.physical_address, identifiers = record.external_identifiers;
  requireValue(address && Array.isArray(identifiers), "record structure");
  const feature = { attributes: { OBJECTID: p.source_object_id,
    PROV_NUM: identifiers.find((i) => i?.type === "massachusetts_eec_provider_number")?.value,
    PROG_NAME: record.business_name, ADDRESS: address.street, CITY: address.city,
    ZIPCODE: address.zip4 === null ? address.zip_code : `${address.zip_code}-${address.zip4}`,
    LICENSED_STATUS: record.license?.status_source, PROG_TYPE: record.industry?.program_type,
    CAPACITY: record.license?.licensed_capacity, PROG_UM: record.affiliation?.program_umbrella_source,
    LICENSED_FUNDED: record.industry?.licensed_funded,
    MAD_ID: identifiers.find((i) => i?.type === "massgis_master_address_id")?.value ?? null },
  geometry: record.geocode?.latitude === null && record.geocode?.longitude === null ? null
    : { x: record.geocode?.longitude, y: record.geocode?.latitude } };
  let reproduced;
  try { reproduced = normalizeMaChildcareFeature(feature, { runId: manifest.run_id,
    sourceReleaseId: manifest.source_release_id, observedAt: manifest.observed_at, outputWkid: 4326 }); }
  catch { requireValue(false, "normalization contract"); }
  reproduced.provenance.input_feature_sha256 = p.input_feature_sha256;
  requireValue(isDeepStrictEqual(record, reproduced), "normalization contract");
  const observedAt = manifest.observed_at;
  // Release-scoped row candidates: provider and master-address identifiers are not identity keys.
  const suffix = `ma_childcare_${hash([DATASET, manifest.source_release_id, p.source_object_id]).slice(0, 32)}`;
  const siteId = `site:${suffix}`, establishmentId = `establishment:${suffix}`;
  const source = { source_id: DATASET, source_release_id: p.source_release_id,
    source_record_id: record.source_record_id, ingest_run_id: p.ingest_run_id,
    transformation_version: `${p.transformation_version} -> ${MA_CHILDCARE_REGISTRY_TRANSFORMATION}`, policy_id: "massgis-eec-childcare-local-review" };
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
    assertion(siteId, "site.address", address, "address", "ADDRESS|CITY|ZIPCODE"),
    assertion(siteId, "site.zip-code", address.zip_code, "string", "ZIPCODE"),
    assertion(siteId, "site.reported-location", record.geocode, "object", "geometry.x|geometry.y"),
    assertion(siteId, "site.source-geography", record.quality, "object", null),
    assertion(establishmentId, "establishment.name", record.business_name, "string", "PROG_NAME"),
    assertion(establishmentId, "establishment.source-status", record.license, "object", "LICENSED_STATUS|CAPACITY"),
    assertion(establishmentId, "establishment.source-classification", record.industry, "object", "PROG_TYPE|LICENSED_FUNDED"),
    assertion(establishmentId, "establishment.source-affiliation", record.affiliation, "object", "PROG_UM"),
    ...identifiers.map((identifier) => assertion(identifier.type === "massgis_master_address_id" ? siteId : establishmentId,
      identifier.type === "massgis_master_address_id" ? "site.external-identifier" : "establishment.external-identifier",
      identifier, "identifier", identifier.type === "massgis_master_address_id" ? "MAD_ID" : "PROV_NUM")),
  ];
  return { zipCode: address.zip_code, entities: [entity(siteId, "physical_site"), entity(establishmentId, "establishment")], assertions,
    relationships: [{ schema_version: "1.0.0", relationship_id: `relationship:${hash(["located_at", establishmentId, siteId, p.source_release_id, record.source_record_id]).slice(0, 32)}`,
      relationship_type: "located_at", subject_entity_id: establishmentId, object_entity_id: siteId,
      status: "active", valid_from: null, valid_to: null, observed_at: observedAt, confidence: 1, source: { ...source } }],
    matchProfiles: [], exportPolicy: "local-review-only", evidence: { manifest_sha256: manifestSha256, policy_profile: POLICY.profile,
      release_id: manifest.release_id, input_feature_sha256: p.input_feature_sha256, attribution: POLICY.attribution,
      assertion_status_semantics: "current source assertion representation, not operating-business status",
      temporal_scope: "single source observation; first_seen/last_seen are not cross-release lifecycle dates",
      identity_scope: "source-release-row candidates; not deduplicated businesses or verified ownership" } };
}
