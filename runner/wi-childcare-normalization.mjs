import { createHash } from "node:crypto";
import { WI_LAYER, WI_FIELDS, WI_WHERE } from "./wi-childcare-preflight.mjs";
import { replayWiChildcareAcquisition, wiPoint } from "./wi-childcare-acquisition.mjs";
import { assertNormalizedUsPostalFieldsDeep } from "./normalized-us-postal-code.mjs";
import policy from "../config/source-policies/wi-childcare-local-review.json" with { type: "json" };

export const WI_NORMALIZATION_VERSION = "wi-childcare-normalization@1.0.0";
const hash = (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const controls = /[\u0000-\u001f\u007f]/u;
const lengths = { ProvderNumber: 50, LocationNumber: 12, FacilityNumber: 25, FacilityName: 255, LocationLineAddress1: 100, LocationLineAddress2: 100, City: 100, State: 10, ZipCode: 25, CategoryType: 100 };
function reject(reason) { throw Object.assign(new Error(`Wisconsin childcare record rejected: ${reason}.`), { code: "WI_CHILDCARE_RECORD_REJECTED", reason }); }
function text(value, maximum, required = false) {
  if (value === null && !required) return null;
  if (typeof value !== "string" || value.length > maximum || controls.test(value)) reject("invalid-text");
  const result = value.trim();
  if (!result && required) reject("missing-required-text");
  return result || null;
}
function contextText(value, name) {
  if (typeof value !== "string" || !value || value.length > 255 || value.trim() !== value || controls.test(value)) throw new Error(`Wisconsin normalization requires bounded ${name}.`);
  return value;
}
function contextValues(context, expected) {
  if (!object(context) || Object.keys(context).some((k) => !expected.includes(k))) throw new Error("Unsupported Wisconsin normalization context.");
  const runId = contextText(context.runId, "runId"), sourceReleaseId = contextText(context.sourceReleaseId, "sourceReleaseId");
  if (![runId, sourceReleaseId].every((v) => /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(v))) throw new Error("Wisconsin run/release IDs require safe bounded identifiers.");
  return { runId, sourceReleaseId };
}
function postal(value) {
  if (value === null) return { zip_code: null, postal_code: null, zip4: null, reason: "missing-source-zip" };
  if (/^0+$/.test(value) || /^00000(?:-?\d{4})?$/.test(value)) return { zip_code: null, postal_code: null, zip4: null, reason: "invalid-source-zip-placeholder" };
  const match = /^(\d{5})(?:-?(\d{4}))?$/.exec(value);
  if (!match) return { zip_code: null, postal_code: null, zip4: null, reason: "invalid-source-zip-format" };
  return { zip_code: match[1], postal_code: match[1], zip4: match[2] ?? null, reason: null };
}

/** Pure conversion; provenance labels observations, never inferred operating dates. */
export function normalizeWiChildcareFeature(feature, context = {}) {
  const { runId, sourceReleaseId } = contextValues(context, ["runId", "sourceReleaseId", "observedAt", "processedAt", "outputWkid"]);
  const observedAt = contextText(context.observedAt, "observedAt");
  const processedAt = contextText(context.processedAt, "processedAt");
  if (![observedAt, processedAt].every((v) => Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v) || processedAt < observedAt || context.outputWkid !== 4326) throw new Error("Wisconsin normalization requires canonical UTC observation/processing times and explicit WGS84 output.");
  if (!object(feature) || Object.keys(feature).some((k) => !["attributes", "geometry"].includes(k))) reject("invalid-feature");
  const a = feature.attributes;
  if (!object(a) || Object.keys(a).length !== WI_FIELDS.length || WI_FIELDS.some((k) => !Object.hasOwn(a, k))) reject("selected-field-drift");
  if (!Number.isSafeInteger(a.OBJECTID) || a.OBJECTID < 1) reject("invalid-object-id");
  if (a.CategoryType !== "LICENSED GROUP") reject("source-scope-drift");
  const selected = {};
  for (const [name, maximum] of Object.entries(lengths)) selected[name] = text(a[name], maximum, ["FacilityName", "LocationLineAddress1", "City", "State", "CategoryType"].includes(name));
  if (selected.State !== "WI") reject("source-state-drift");
  if (/^(?:P\.?\s*O\.?\s*(?:BOX|B\b)|POST\s+OFFICE\s+BOX|GENERAL\s+DELIVERY)\b/i.test(selected.LocationLineAddress1)) reject("nonphysical-address");
  if (a.Capacity !== null && (!Number.isSafeInteger(a.Capacity) || a.Capacity < 0)) reject("invalid-capacity");
  let point;
  try { point = wiPoint(feature.geometry, { wkid: context.outputWkid }); } catch { reject("invalid-source-coordinate-structure-or-crs"); }
  const zip = postal(selected.ZipCode);
  const identifiers = [["ProvderNumber", "wisconsin_dcf_provider_number"], ["LocationNumber", "wisconsin_dcf_location_number"], ["FacilityNumber", "wisconsin_dcf_facility_number"]];
  return assertNormalizedUsPostalFieldsDeep({
    schema_version: "1.0.0", dataset_id: "wi-dhs-licensed-group-childcare", source_record_id: `${sourceReleaseId}:object:${a.OBJECTID}`,
    business_name: selected.FacilityName,
    external_identifiers: identifiers.filter(([field]) => selected[field] !== null).map(([field, type]) => ({ type, value: selected[field], source_field: field, identity_verified: false })),
    physical_address: { street: selected.LocationLineAddress1, street2: selected.LocationLineAddress2, city: selected.City, county_source: null, state: "WI", country: "US",
      state_country_basis: "publisher-record-and-dataset-scope-not-boundary-verification", zip_code: zip.zip_code, postal_code: zip.postal_code, zip4: zip.zip4 },
    geocode: { latitude: point.latitude, longitude: point.longitude, crs: "EPSG:4326", source: "Wisconsin DHS GIS", status: point.reason },
    industry: { category: "childcare", childcare_type_source: selected.CategoryType, capacity_source: a.Capacity },
    source_status: { status_source: null, status_interpretation: "publisher-described-active-extract-membership-only", active_business_verified: false, valid_from: null, valid_to: null },
    affiliation: { parent_company: null, ownership_verified: false },
    provenance: { source_url: WI_LAYER, source_filter: WI_WHERE, source_object_id: a.OBJECTID, source_release_id: sourceReleaseId, ingest_run_id: runId, observed_at: observedAt,
      processed_at: processedAt, timestamp_interpretation: "selected-page-observation-not-license-or-business-operating-dates", transformation_version: WI_NORMALIZATION_VERSION, input_feature_sha256: hash(feature),
      attribution: "Wisconsin Department of Health Services; Wisconsin Department of Children and Families", policy_id: policy.policy_id, policy_profile: `${policy.policy_id}@${policy.version}`, policy_sha256: hash(policy),
      publisher_metadata_required: true, publisher_notices_required: true,
      field_lineage: { business_name: "attributes.FacilityName", external_identifiers: ["attributes.ProvderNumber", "attributes.LocationNumber", "attributes.FacilityNumber"],
        street: "attributes.LocationLineAddress1", street2: "attributes.LocationLineAddress2", city: "attributes.City", state: "attributes.State", country: "dataset-scope",
        "physical_address.zip_code": "attributes.ZipCode", "physical_address.postal_code": "attributes.ZipCode", "physical_address.zip4": "attributes.ZipCode", longitude: "geometry.x-returned-EPSG4326", latitude: "geometry.y-returned-EPSG4326", capacity_source: "attributes.Capacity", childcare_type_source: "attributes.CategoryType" } },
    quality: { zip_unavailable_reason: zip.reason, point_unavailable_reason: point.latitude === null ? point.reason : null, missing_identifier_fields: identifiers.filter(([field]) => selected[field] === null).map(([field]) => field),
      current_usps_validity: "unverified", unique_business_identity_verified: false, geographic_boundary_verified: false, address_geocoding_accuracy_verified: false },
    export_policy: "local-review-only",
  });
}

/** Revalidate supplied acquisition evidence, then conserve every selected source row. */
export function normalizeWiChildcareAcquisition(evidence, context = {}, { signal } = {}) {
  const { runId, sourceReleaseId } = contextValues(context, ["runId", "sourceReleaseId", "processedAt"]);
  const processedAt = contextText(context.processedAt, "processedAt");
  signal?.throwIfAborted();
  const acquired = replayWiChildcareAcquisition(evidence, { signal }), observations = new Map();
  if (!Number.isFinite(Date.parse(processedAt)) || new Date(processedAt).toISOString() !== processedAt || processedAt < evidence.observed_at) throw new Error("Wisconsin processing time must follow completed acquisition evidence.");
  for (const page of evidence.observations.filter((v) => v.kind === "features")) for (const feature of page.payload.features) observations.set(feature.attributes.OBJECTID, page.observed_at);
  const records = [], quarantine = [];
  for (const feature of acquired.features) {
    signal?.throwIfAborted();
    const sourceObjectId = feature.attributes.OBJECTID, observedAt = observations.get(sourceObjectId);
    try { records.push(normalizeWiChildcareFeature(feature, { runId, sourceReleaseId, observedAt, processedAt, outputWkid: 4326 })); }
    catch (error) {
      if (error.code !== "WI_CHILDCARE_RECORD_REJECTED") throw error;
      quarantine.push({ source_object_id: sourceObjectId, source_record_id: `${sourceReleaseId}:object:${sourceObjectId}`, source_release_id: sourceReleaseId, ingest_run_id: runId, observed_at: observedAt,
        processed_at: processedAt, input_feature_sha256: hash(feature), transformation_version: WI_NORMALIZATION_VERSION, policy_sha256: hash(policy), reason: error.reason, raw_evidence_location: "acquisition-evidence-observation-by-object-id", export_policy: "internal" });
    }
  }
  if (records.length + quarantine.length !== acquired.source.source_record_count) throw new Error("Wisconsin source-row conservation failed.");
  const reasons = (rows, property) => rows.reduce((counts, row) => { const reason = row.quality[property]; if (reason) counts[reason] = (counts[reason] ?? 0) + 1; return counts; }, {});
  return { records, quarantine, summary: { source_records: acquired.source.source_record_count, accepted_records: records.length, quarantined_records: quarantine.length,
    accepted_with_zip5: records.filter((v) => v.physical_address.zip_code !== null).length, accepted_with_zip4: records.filter((v) => v.physical_address.zip4 !== null).length,
    zip_unavailable_reasons: reasons(records, "zip_unavailable_reason"), point_unavailable_reasons: reasons(records, "point_unavailable_reason"),
    transformation_version: WI_NORMALIZATION_VERSION, acquisition_evidence_sha256: hash(evidence), normalized_records_sha256: hash(records), quarantine_sha256: hash(quarantine),
    identity_matching_applied: false, acquisition_authorized: false, export_authorized: false, release_published: false } };
}
