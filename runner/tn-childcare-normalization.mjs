import { createHash } from "node:crypto";
import { TN_CHILDCARE_LAYER, TN_CHILDCARE_SCHEMA, TN_CHILDCARE_WHERE } from "./tn-childcare-preflight.mjs";
import { assertNormalizedUsPostalFieldsDeep } from "./normalized-us-postal-code.mjs";

export const TN_CHILDCARE_TRANSFORMATION = "tn-childcare-normalization@1.0.0";
const fields = new Set(TN_CHILDCARE_SCHEMA.map(([name]) => name));
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const controls = /[\u0000-\u001f\u007f]/u;
function reject(reason) { throw Object.assign(new Error(`Tennessee childcare record rejected: ${reason}.`), { code: "TN_CHILDCARE_RECORD_REJECTED", reason }); }
function text(value, maximum, required) {
  if (value === null && !required) return null;
  if (typeof value !== "string" || value.length > maximum || controls.test(value)) reject("invalid-text");
  const result = value.trim();
  if (!result && required) reject("missing-required-text");
  return result || null;
}
function epoch(value) { return Number.isSafeInteger(value) && value > 0 && Number.isFinite(new Date(value).getTime()); }
function contextValue(value, name) {
  if (typeof value !== "string" || !value.trim() || value.trim() !== value || value.length > 255 || controls.test(value)) throw new Error(`Tennessee childcare ${name} is required and must be bounded text.`);
  return value;
}

/** Pure source transformation; no acquisition, geocoding, matching or publication. */
export function normalizeTnChildcareFeature(feature, context = {}) {
  if (!object(context) || Object.keys(context).some((key) => !["runId", "sourceReleaseId", "observedAt", "outputWkid", "editingInfo", "itemModifiedEpochMs"].includes(key))) throw new Error("Unsupported Tennessee childcare normalization context.");
  const runId = contextValue(context.runId, "runId"), sourceReleaseId = contextValue(context.sourceReleaseId, "sourceReleaseId"), observedAt = contextValue(context.observedAt, "observedAt");
  if (!Number.isFinite(Date.parse(observedAt)) || new Date(observedAt).toISOString() !== observedAt) throw new Error("Tennessee childcare observedAt must be a canonical UTC timestamp.");
  if (context.outputWkid !== 4326) throw new Error("Tennessee childcare normalization requires WGS84 output.");
  const editingInfo = context.editingInfo ?? null, modified = context.itemModifiedEpochMs ?? null;
  if (editingInfo !== null && (!object(editingInfo) || Object.keys(editingInfo).sort().join("|") !== "dataLastEditDate|lastEditDate|schemaLastEditDate" || !Object.values(editingInfo).every(epoch))) throw new Error("Invalid Tennessee childcare publisher editing timestamps.");
  if (modified !== null && !epoch(modified)) throw new Error("Invalid Tennessee childcare item modification timestamp.");
  if (!object(feature) || Object.keys(feature).some((key) => !["attributes", "geometry"].includes(key))) reject("invalid-feature");
  const attributes = feature.attributes;
  if (!object(attributes) || Object.keys(attributes).some((key) => !fields.has(key)) || [...fields].some((key) => !Object.hasOwn(attributes, key))) reject("selected-field-drift");
  if (!Number.isSafeInteger(attributes.OBJECTID) || attributes.OBJECTID < 1) reject("invalid-object-id");
  if (attributes.Provider_ID !== null && (!Number.isSafeInteger(attributes.Provider_ID) || attributes.Provider_ID < 1)) reject("invalid-provider-id");
  // Compare raw scope values: whitespace/case variants do not expand the fixed filter.
  if (attributes.Provider_Status !== "Active" || attributes.Provider_Type !== "Child Care" || attributes.Child_Care_Type !== "Child Care Center") reject("source-scope-drift");
  const selected = {};
  for (const [name, type, maximum] of TN_CHILDCARE_SCHEMA) if (type === "esriFieldTypeString") selected[name] = text(attributes[name], maximum, !["Street_Address_2", "County"].includes(name));
  if (selected.State !== "TN") reject("source-state-drift");
  if (/^(?:P\.?\s*O\.?\s*(?:BOX|B\b)|POST\s+OFFICE\s+BOX|GENERAL\s+DELIVERY)\b/i.test(selected.Street_Address)) reject("nonphysical-address");
  const postal = /^(\d{5})(?:-(\d{4}))?$/.exec(selected.Zip);
  if (!postal || postal[1] === "00000") reject("invalid-postal-code");
  let latitude = null, longitude = null;
  if (feature.geometry !== null && feature.geometry !== undefined) {
    const geometry = feature.geometry, sr = geometry?.spatialReference;
    if (!object(geometry) || Object.keys(geometry).some((key) => !["x", "y", "spatialReference"].includes(key))
      || (sr !== undefined && (!object(sr) || Object.keys(sr).some((key) => !["wkid", "latestWkid"].includes(key)) || sr.wkid !== 4326 || (sr.latestWkid !== undefined && sr.latestWkid !== 4326)))
      || !Number.isFinite(geometry.x) || !Number.isFinite(geometry.y)
      // Broad plausibility only; no state/county polygon membership is established.
      || geometry.x < -91 || geometry.x > -81 || geometry.y < 34 || geometry.y > 37) reject("invalid-source-coordinate");
    longitude = geometry.x; latitude = geometry.y;
  }
  return assertNormalizedUsPostalFieldsDeep({
    schema_version: "1.0.0", dataset_id: "tn-dhs-active-childcare-centers", source_record_id: `${sourceReleaseId}:object:${attributes.OBJECTID}`,
    business_name: selected.Provider_Name,
    external_identifiers: attributes.Provider_ID === null ? [] : [{ type: "tennessee_dhs_provider_id", value: String(attributes.Provider_ID) }],
    physical_address: { street: selected.Street_Address, street2: selected.Street_Address_2, city: selected.City, county_source: selected.County,
      state: "TN", country: "US", state_country_basis: "publisher-record-and-dataset-scope-not-boundary-verification", zip_code: postal[1], postal_code: postal[1], zip4: postal[2] ?? null },
    geocode: { latitude, longitude, crs: "EPSG:4326", source: "Tennessee STS GIS / DHS", status: latitude === null ? "missing-source-point" : "publisher-geocoded-not-independently-verified" },
    industry: { category: "childcare", provider_type_source: selected.Provider_Type, childcare_type_source: selected.Child_Care_Type },
    source_status: { status_source: selected.Provider_Status, status_interpretation: "publisher-active-center-extract-membership-only", active_business_verified: false },
    affiliation: { parent_company: null, ownership_verified: false },
    provenance: { source_url: TN_CHILDCARE_LAYER, source_filter: TN_CHILDCARE_WHERE, source_object_id: attributes.OBJECTID, source_release_id: sourceReleaseId,
      ingest_run_id: runId, observed_at: observedAt, publisher_editing_info: editingInfo === null ? null : structuredClone(editingInfo), publisher_item_modified_epoch_ms: modified,
      publisher_timestamp_interpretation: "service-and-item-change-observations-not-license-or-business-operating-dates", transformation_version: TN_CHILDCARE_TRANSFORMATION,
      input_feature_sha256: createHash("sha256").update(JSON.stringify(feature)).digest("hex"), attribution: "Tennessee Department of Human Services; State of Tennessee STS GIS",
      policy_id: "tn-childcare-local-review", policy_profile: "tn-childcare-local-review@1.0.0",
      publisher_metadata_required: true, publisher_notices_required: true },
    quality: { unique_business_identity_verified: false, current_usps_validity: "unverified", geographic_boundary_verified: false, provider_identifier_missing: attributes.Provider_ID === null },
    export_policy: "local-review-only",
  });
}
