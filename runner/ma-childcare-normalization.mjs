import { createHash } from "node:crypto";
import { MA_CHILDCARE_SCHEMA, MA_CHILDCARE_LAYER } from "./ma-childcare-preflight.mjs";
import { assertNormalizedUsPostalFieldsDeep } from "./normalized-us-postal-code.mjs";

export const MA_CHILDCARE_TRANSFORMATION = "ma-childcare-normalization@1.0.0";
const fields = new Set(MA_CHILDCARE_SCHEMA.map(([name]) => name));
const knownStatuses = new Set(["Current", "Expired", "Regional Enrollment Freeze", "Renewal in progress"]);
function reject(reason) {
  throw Object.assign(new Error(`Massachusetts childcare record rejected: ${reason}.`), { code: "MA_CHILDCARE_RECORD_REJECTED", reason });
}
function sourceText(value, maximum, required = false) {
  if (value === null && !required) return null;
  if (typeof value !== "string" || value.length > maximum || /[\u0000-\u001f\u007f]/u.test(value)) reject("invalid-text");
  const result = value.trim();
  if (!result && required) reject("missing-required-text");
  return result || null;
}
function requiredContext(value, label) {
  if (typeof value !== "string" || !value.trim() || value.length > 255 || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error(`Massachusetts childcare ${label} is required.`);
  }
  return value;
}

/** Pure normalization: no downloads, geocoding calls, cross-source merging or publication. */
export function normalizeMaChildcareFeature(feature, context = {}) {
  const runId = requiredContext(context.runId, "runId");
  const sourceReleaseId = requiredContext(context.sourceReleaseId, "sourceReleaseId");
  const observedAt = requiredContext(context.observedAt, "observedAt");
  const canonicalObservedAt = observedAt.includes(".") ? observedAt : observedAt.replace(/Z$/, ".000Z");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(observedAt) || !Number.isFinite(Date.parse(observedAt))
    || new Date(observedAt).toISOString() !== canonicalObservedAt) throw new Error("Massachusetts childcare observedAt must be a UTC timestamp.");
  if (context.outputWkid !== 4326) throw new Error("Massachusetts childcare normalization requires WGS84 output.");
  if (!feature || typeof feature !== "object" || Array.isArray(feature)
    || Object.keys(feature).some((key) => !["attributes", "geometry"].includes(key))) reject("invalid-feature");
  const attributes = feature.attributes;
  if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)
    || Object.keys(attributes).some((key) => !fields.has(key))
    || [...fields].some((key) => !Object.hasOwn(attributes, key))) reject("selected-field-drift");
  if (!Number.isSafeInteger(attributes.OBJECTID) || attributes.OBJECTID < 1) reject("invalid-object-id");
  const selected = { OBJECTID: attributes.OBJECTID };
  for (const [name, type, length] of MA_CHILDCARE_SCHEMA) {
    if (type === "esriFieldTypeString") selected[name] = sourceText(attributes[name], length,
      ["PROV_NUM", "PROG_NAME", "ADDRESS", "CITY", "ZIPCODE", "PROG_TYPE", "LICENSED_FUNDED"].includes(name));
  }
  if (selected.PROG_TYPE !== "Center-based Care" || selected.LICENSED_FUNDED !== "Licensed") reject("source-scope-drift");
  if (/^(?:P\.?\s*O\.?\s*(?:BOX|B\b)|POST\s+OFFICE\s+BOX|GENERAL\s+DELIVERY)\b/i.test(selected.ADDRESS)) reject("nonphysical-address");
  const postal = /^(\d{5})(?:-(\d{4}))?$/.exec(selected.ZIPCODE);
  if (!postal || postal[1] === "00000") reject("invalid-postal-code");
  const capacity = attributes.CAPACITY;
  if (capacity !== null && (!Number.isSafeInteger(capacity) || capacity < 0)) reject("invalid-capacity");
  let latitude = null, longitude = null;
  if (feature.geometry !== null && feature.geometry !== undefined) {
    const geometry = feature.geometry;
    if (typeof geometry !== "object" || Array.isArray(geometry)
      || Object.keys(geometry).some((key) => !["x", "y", "spatialReference"].includes(key))
      || (geometry.spatialReference !== undefined && (geometry.spatialReference?.wkid !== 4326
        || (geometry.spatialReference.latestWkid !== undefined && geometry.spatialReference.latestWkid !== 4326)))
      || typeof geometry.x !== "number" || typeof geometry.y !== "number"
      || !Number.isFinite(geometry.x) || !Number.isFinite(geometry.y)
      // Broad plausibility envelope, not proof of membership in MA boundaries.
      || geometry.x < -74 || geometry.x > -69 || geometry.y < 41 || geometry.y > 43) reject("invalid-source-coordinate");
    longitude = geometry.x; latitude = geometry.y;
  }
  const record = {
    schema_version: "1.0.0", dataset_id: "ma-licensed-center-based-childcare",
    source_record_id: `${sourceReleaseId}:object:${attributes.OBJECTID}`,
    business_name: selected.PROG_NAME,
    external_identifiers: [
      { type: "massachusetts_eec_provider_number", value: selected.PROV_NUM },
      ...(selected.MAD_ID ? [{ type: "massgis_master_address_id", value: selected.MAD_ID }] : []),
    ],
    physical_address: { street: selected.ADDRESS, city: selected.CITY, state: "MA", country: "US",
      state_country_basis: "publisher-dataset-scope-not-boundary-verification",
      zip_code: postal[1], postal_code: postal[1], zip4: postal[2] ?? null },
    geocode: { latitude, longitude, crs: "EPSG:4326", source: "MassGIS/EEC",
      status: latitude === null ? "missing-source-point" : "publisher-geocoded-not-independently-verified" },
    industry: { category: "childcare", program_type: selected.PROG_TYPE, licensed_funded: selected.LICENSED_FUNDED },
    license: { status_source: selected.LICENSED_STATUS,
      status_interpretation: selected.LICENSED_STATUS === null ? "missing-source-status"
        : knownStatuses.has(selected.LICENSED_STATUS) ? "source-status-preserved" : "unmapped-source-status",
      active_business_verified: false, licensed_capacity: capacity },
    affiliation: { program_umbrella_source: selected.PROG_UM, parent_company: null, ownership_verified: false },
    provenance: { source_url: MA_CHILDCARE_LAYER, source_object_id: attributes.OBJECTID,
      source_release_id: sourceReleaseId, ingest_run_id: runId, observed_at: observedAt,
      transformation_version: MA_CHILDCARE_TRANSFORMATION,
      input_feature_sha256: createHash("sha256").update(JSON.stringify(feature)).digest("hex"),
      attribution: "MassGIS (Bureau of Geographic Information), Commonwealth of Massachusetts EOTSS; Massachusetts Department of Early Education and Care (EEC)" },
    quality: { unique_business_identity_verified: false, current_usps_validity: "unverified", geographic_boundary_verified: false },
    export_policy: "local-review-only",
  };
  return assertNormalizedUsPostalFieldsDeep(record);
}
