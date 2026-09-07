import { createHash } from "node:crypto";
import { NJ_CHILDCARE_SCHEMA, NJ_CHILDCARE_LAYER } from "./nj-childcare-preflight.mjs";
import { assertNormalizedUsPostalFieldsDeep } from "./normalized-us-postal-code.mjs";

export const NJ_CHILDCARE_TRANSFORMATION = "nj-childcare-normalization@1.0.0";
export const NJ_CHILDCARE_REPROCESS_TRANSFORMATION = "nj-childcare-normalization@1.0.1";
const fields = new Set(NJ_CHILDCARE_SCHEMA.map(([name]) => name));
function reject(reason) {
  throw Object.assign(new Error(`New Jersey childcare record rejected: ${reason}.`), { code: "NJ_CHILDCARE_RECORD_REJECTED", reason });
}
function text(value, maximum, required, allowLineFeed = false) {
  if (value === null && !required) return null;
  const forbidden = allowLineFeed ? /[\u0000-\u0009\u000b-\u001f\u007f]/u : /[\u0000-\u001f\u007f]/u;
  if (typeof value !== "string" || value.length > maximum || forbidden.test(value)) reject("invalid-text");
  const result = value.trim();
  if (!result && required) reject("missing-required-text");
  return result || null;
}
function epoch(value) { return Number.isSafeInteger(value) && Number.isFinite(new Date(value).getTime()); }

/** Pure source normalization: no geocoding requests, business matching or publication. */
export function normalizeNjChildcareFeature(feature, context = {}) {
  const transformationVersion = context.transformationVersion ?? NJ_CHILDCARE_TRANSFORMATION;
  if (![NJ_CHILDCARE_TRANSFORMATION, NJ_CHILDCARE_REPROCESS_TRANSFORMATION].includes(transformationVersion)) {
    throw new Error("Unsupported New Jersey childcare transformation version.");
  }
  for (const key of ["runId", "sourceReleaseId", "observedAt"]) {
    if (typeof context[key] !== "string" || !context[key].trim() || context[key].length > 255
      || /[\u0000-\u001f\u007f]/u.test(context[key])) throw new Error(`New Jersey childcare ${key} is required.`);
  }
  const { runId, sourceReleaseId, observedAt, outputWkid, downloadDateEpochMs } = context;
  if (!Number.isFinite(Date.parse(observedAt)) || new Date(observedAt).toISOString() !== observedAt
    || outputWkid !== 4326 || !epoch(downloadDateEpochMs) || downloadDateEpochMs <= 0) throw new Error("New Jersey childcare requires canonical UTC observation, WGS84 output and publisher download date.");
  if (!feature || typeof feature !== "object" || Array.isArray(feature)
    || Object.keys(feature).some((key) => !["attributes", "geometry"].includes(key))) reject("invalid-feature");
  const attrs = feature.attributes;
  if (!attrs || typeof attrs !== "object" || Array.isArray(attrs)
    || Object.keys(attrs).some((key) => !fields.has(key)) || [...fields].some((key) => !Object.hasOwn(attrs, key))) reject("selected-field-drift");
  if (!Number.isSafeInteger(attrs.OBJECTID) || attrs.OBJECTID < 1) reject("invalid-object-id");
  const selected = {};
  for (const [name, type, maximum] of NJ_CHILDCARE_SCHEMA) {
    if (type === "esriFieldTypeString") selected[name] = text(attrs[name], maximum,
      ["center_id", "center_name", "address", "city", "state", "zip"].includes(name),
      name === "sessions" && transformationVersion === NJ_CHILDCARE_REPROCESS_TRANSFORMATION);
  }
  if (selected.state !== "NJ") reject("source-scope-drift");
  if (/^(?:P\.?\s*O\.?\s*(?:BOX|B\b)|POST\s+OFFICE\s+BOX|GENERAL\s+DELIVERY)\b/i.test(selected.address)) reject("nonphysical-address");
  const postal = /^(\d{5})(?:-(\d{4}))?$/.exec(selected.zip);
  if (!postal || postal[1] === "00000") reject("invalid-postal-code");
  if (attrs.licensed_capacity !== null && (!Number.isSafeInteger(attrs.licensed_capacity) || attrs.licensed_capacity < 0)) reject("invalid-capacity");
  for (const name of ["license_approval_date", "license_renewal_date"]) {
    if (attrs[name] !== null && !epoch(attrs[name])) reject("invalid-license-date");
  }
  if (attrs.download_date !== downloadDateEpochMs) reject("download-date-drift");
  let latitude = null, longitude = null;
  if (feature.geometry !== null && feature.geometry !== undefined) {
    const g = feature.geometry;
    if (typeof g !== "object" || Array.isArray(g) || Object.keys(g).some((key) => !["x", "y", "spatialReference"].includes(key))
      || (g.spatialReference !== undefined && (g.spatialReference?.wkid !== 4326
        || (g.spatialReference.latestWkid !== undefined && g.spatialReference.latestWkid !== 4326)
        || Object.keys(g.spatialReference).some((key) => !["wkid", "latestWkid"].includes(key))))
      || !Number.isFinite(g.x) || !Number.isFinite(g.y)
      // Broad plausibility only, not state/county polygon membership verification.
      || g.x < -76 || g.x > -73 || g.y < 38 || g.y > 42) reject("invalid-source-coordinate");
    longitude = g.x; latitude = g.y;
  }
  const record = {
    schema_version: "1.0.0", dataset_id: "nj-licensed-childcare-centers",
    source_record_id: `${sourceReleaseId}:object:${attrs.OBJECTID}`, business_name: selected.center_name,
    external_identifiers: [{ type: "new_jersey_dcf_center_id", value: selected.center_id }],
    physical_address: { street: selected.address, street2: selected.address2, city: selected.city, county_source: selected.county,
      state: "NJ", country: "US", state_country_basis: "publisher-record-and-dataset-scope-not-boundary-verification",
      zip_code: postal[1], postal_code: postal[1], zip4: postal[2] ?? null },
    geocode: { latitude, longitude, crs: "EPSG:4326", source: "NJDEP/DCF",
      status: latitude === null ? "missing-source-point" : "publisher-geocoded-not-independently-verified",
      location_reference_source: selected.location_reference_desc, coordinate_source_type: selected.coord_source_type_desc,
      original_coordinate_system_source: selected.coord_sys_desc, coordinate_source_organization: selected.coord_source_org_desc },
    industry: { category: "childcare", public_school_facility_source: selected.foips,
      public_school_interpretation: "publisher-value-preserved-not-boolean-inferred",
      age_range_source: selected.age_range, months_operational_source: selected.months_operational, sessions_source: selected.sessions },
    license: { status_source: null, status_interpretation: "active-licensed-center-layer-membership-only",
      active_business_verified: false, licensed_capacity: attrs.licensed_capacity,
      approval_date_epoch_ms: attrs.license_approval_date, renewal_date_epoch_ms: attrs.license_renewal_date },
    affiliation: { parent_company: null, ownership_verified: false },
    provenance: { source_url: NJ_CHILDCARE_LAYER, source_object_id: attrs.OBJECTID, source_release_id: sourceReleaseId,
      ingest_run_id: runId, observed_at: observedAt, publisher_download_date_epoch_ms: downloadDateEpochMs,
      publisher_download_date_at: new Date(downloadDateEpochMs).toISOString(), transformation_version: transformationVersion,
      input_feature_sha256: createHash("sha256").update(JSON.stringify(feature)).digest("hex"),
      attribution: "NJ Department of Environmental Protection (NJDEP), DCF-derived licensed childcare centers",
      publisher_metadata_required: true, derived_publication_notice_required: true },
    quality: { unique_business_identity_verified: false, current_usps_validity: "unverified", geographic_boundary_verified: false },
    export_policy: "local-review-only",
  };
  return assertNormalizedUsPostalFieldsDeep(record);
}
