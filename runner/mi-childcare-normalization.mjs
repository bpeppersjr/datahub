import { createHash } from "node:crypto";
import { MI_CHILDCARE_LAYER, MI_CHILDCARE_SCHEMA, MI_CHILDCARE_SELECTED_FIELDS, MI_CHILDCARE_WHERE } from "./mi-childcare-preflight.mjs";
import { assertNormalizedUsPostalFieldsDeep } from "./normalized-us-postal-code.mjs";

export const MI_CHILDCARE_TRANSFORMATION = "mi-childcare-normalization@1.0.0";
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const controls = /[\u0000-\u001f\u007f]/u;
function reject(reason) { throw Object.assign(new Error(`Michigan childcare record rejected: ${reason}.`), { code: "MI_CHILDCARE_RECORD_REJECTED", reason }); }
function text(value, maximum, required) {
  if (value === null && !required) return null;
  if (typeof value !== "string" || value.length > maximum || controls.test(value)) reject("invalid-text");
  const trimmed = value.trim(); if (!trimmed && required) reject("missing-required-text"); return trimmed || null;
}
const epoch = value => Number.isSafeInteger(value) && value > 0 && Number.isFinite(new Date(value).getTime());
function contextText(value) {
  if (typeof value !== "string" || !value || value.trim() !== value || value.length > 255 || controls.test(value)) throw new Error("Michigan normalization requires bounded context identifiers and observation time.");
  return value;
}

/** Pure proposed local-review transformation. No acquisition, CRS inference or publication. */
export function normalizeMiChildcareFeature(feature, context = {}) {
  if (!object(context) || Object.keys(context).some(key => !["runId", "sourceReleaseId", "observedAt", "itemModifiedEpochMs"].includes(key))) throw new Error("Unsupported Michigan normalization context.");
  const runId = contextText(context.runId), sourceReleaseId = contextText(context.sourceReleaseId), observedAt = contextText(context.observedAt);
  if (!Number.isFinite(Date.parse(observedAt)) || new Date(observedAt).toISOString() !== observedAt) throw new Error("Michigan observation must be canonical UTC.");
  const modified = context.itemModifiedEpochMs === undefined ? null : context.itemModifiedEpochMs;
  if (modified !== null && !epoch(modified)) throw new Error("Invalid Michigan item modification timestamp.");
  if (!object(feature) || Object.keys(feature).length !== 1 || !Object.hasOwn(feature, "attributes")) reject("invalid-feature-no-geometry-allowed");
  const a = feature.attributes;
  if (!object(a) || Object.keys(a).length !== MI_CHILDCARE_SELECTED_FIELDS.length || !MI_CHILDCARE_SELECTED_FIELDS.every(key => Object.hasOwn(a, key))) reject("selected-field-drift");
  if (!Number.isSafeInteger(a.OBJECTID) || a.OBJECTID < 1) reject("invalid-object-id");
  if (a.FacilityTypeCode !== "DC" || a.FacilityType !== "Center") reject("source-scope-drift");
  if (a.State !== "MI") reject("source-state-drift");
  const selected = {};
  for (const [name, type, maximum] of MI_CHILDCARE_SCHEMA) if (MI_CHILDCARE_SELECTED_FIELDS.includes(name) && type === "esriFieldTypeString") {
    selected[name] = text(a[name], maximum, !["ZIPCode", "CountyCode", "LicenseNumber"].includes(name));
  }
  if (/^(?:P\.?\s*O\.?\s*(?:BOX|B\b)|POST\s+OFFICE\s+BOX|GENERAL\s+DELIVERY)\b/i.test(selected.StreetAddress)) reject("nonphysical-address");
  if (a.Capacity !== null && (!Number.isInteger(a.Capacity) || a.Capacity < 0 || a.Capacity > 32767)) reject("invalid-source-capacity");
  const zipReason = selected.ZIPCode === null ? "missing-source-zip" : null;
  const postal = selected.ZIPCode === null ? null : /^(\d{5})(?:-(\d{4}))?$/.exec(selected.ZIPCode);
  if (!zipReason && (!postal || postal[1] === "00000")) reject("invalid-postal-code");
  const latitude = a.Latitude, longitude = a.Longitude;
  if (!(latitude === null && longitude === null) && (!Number.isFinite(latitude) || !Number.isFinite(longitude)
    || latitude < 41 || latitude > 49 || longitude < -91 || longitude > -82)) reject("invalid-source-coordinate");
  return assertNormalizedUsPostalFieldsDeep({
    schema_version: "1.0.0", dataset_id: "mi-licensed-childcare-centers", source_record_id: `${sourceReleaseId}:object:${a.OBJECTID}`,
    business_name: selected.FacilityName,
    external_identifiers: selected.LicenseNumber === null ? [] : [{ type: "michigan_mileap_childcare_license_number", value: selected.LicenseNumber }],
    physical_address: { street: selected.StreetAddress, street2: null, city: selected.City, county_code_source: selected.CountyCode,
      state: "MI", country: "US", state_country_basis: "publisher-record-and-dataset-scope-not-boundary-verification", zip_code: postal?.[1] ?? null, postal_code: postal?.[1] ?? null, zip4: postal?.[2] ?? null },
    geocode: { latitude, longitude, crs: null, source: "Michigan GIS source Latitude/Longitude attributes",
      status: latitude === null ? "missing-source-point" : "publisher-coordinate-attributes-reference-unverified",
      coordinate_reference_unverified: true, governed_geographic_assignment_eligible: false },
    industry: { category: "childcare", facility_type_code_source: "DC", facility_type_source: "Center" },
    source_status: { status_source: null, status_interpretation: "publisher-listed-center-membership-only", active_business_verified: false,
      license_status: null, license_issued_at: null, license_expires_at: null, capacity_source: a.Capacity },
    affiliation: { parent_company: null, ownership_verified: false },
    provenance: { source_url: MI_CHILDCARE_LAYER, source_filter: MI_CHILDCARE_WHERE, source_object_id: a.OBJECTID,
      source_release_id: sourceReleaseId, ingest_run_id: runId, observed_at: observedAt, publisher_item_modified_epoch_ms: modified,
      publisher_source_updated_at: null, publisher_timestamp_interpretation: "item-modification-not-source-freshness-or-license-lifecycle",
      transformation_version: MI_CHILDCARE_TRANSFORMATION, input_feature_sha256: createHash("sha256").update(JSON.stringify(feature)).digest("hex"),
      attribution: "Michigan Department of Lifelong Education, Advancement, and Potential; State of Michigan GIS",
      policy_id: "mi-childcare-local-review", policy_profile: "mi-childcare-local-review@1.0.0", policy_status: "proposed-not-approved",
      publisher_metadata_required: true, publisher_notices_required: true, legal_approval: false, export_authorized: false },
    quality: { zip_unavailable_reason: zipReason, license_identifier_missing: selected.LicenseNumber === null,
      unique_business_identity_verified: false, current_usps_validity: "unverified", geographic_boundary_verified: false,
      coordinate_reference_unverified: true, governed_geographic_assignment_eligible: false, source_freshness_verified: false },
    export_policy: "local-review-only",
  });
}
