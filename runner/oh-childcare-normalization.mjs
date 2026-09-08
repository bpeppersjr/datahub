import { createHash } from "node:crypto";
import { OH_LAYER, OH_FIELDS, OH_WHERE } from "./oh-childcare-preflight.mjs";
import { replayOhChildcareAcquisition, ohPoint } from "./oh-childcare-acquisition.mjs";
import { assertNormalizedUsPostalFieldsDeep } from "./normalized-us-postal-code.mjs";
import policy from "../config/source-policies/oh-childcare-local-review.json" with { type: "json" };

export const OH_NORMALIZATION_VERSION = "oh-childcare-normalization@1.0.0";
const hash = (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const controls = /[\u0000-\u001f\u007f]/u;
const lengths = { county: 8000, program_name: 8000, street_address: 8000, city: 8000, state: 8000, zip_code: 8000, program_type: 8000, program_status: 8000 };
function reject(reason) { throw Object.assign(new Error(`Ohio childcare record rejected: ${reason}.`), { code: "OH_CHILDCARE_RECORD_REJECTED", reason }); }
function text(value, maximum, required = false) {
  if (value === null && !required) return null;
  if (typeof value !== "string" || value.length > maximum || controls.test(value)) reject("invalid-text");
  const result = value.trim();
  if (!result && required) reject("missing-required-text");
  return result || null;
}
function contextText(value, name) {
  if (typeof value !== "string" || !value || value.length > 255 || value.trim() !== value || controls.test(value)) throw new Error(`Ohio normalization requires bounded ${name}.`);
  return value;
}
function contextValues(context, expected) {
  if (!object(context) || Object.keys(context).some((k) => !expected.includes(k))) throw new Error("Unsupported Ohio normalization context.");
  const runId = contextText(context.runId, "runId"), sourceReleaseId = contextText(context.sourceReleaseId, "sourceReleaseId");
  if (![runId, sourceReleaseId].every((v) => /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(v))) throw new Error("Ohio run/release IDs require safe bounded identifiers.");
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
export function normalizeOhChildcareFeature(feature, context = {}) {
  const { runId, sourceReleaseId } = contextValues(context, ["runId", "sourceReleaseId", "observedAt", "processedAt", "outputWkid"]);
  const observedAt = contextText(context.observedAt, "observedAt");
  const processedAt = contextText(context.processedAt, "processedAt");
  if (![observedAt, processedAt].every((v) => Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v) || processedAt < observedAt || context.outputWkid !== 4326) throw new Error("Ohio normalization requires canonical UTC observation/processing times and explicit WGS84 output.");
  if (!object(feature) || Object.keys(feature).some((k) => !["attributes", "geometry"].includes(k))) reject("invalid-feature");
  const a = feature.attributes;
  if (!object(a) || Object.keys(a).length !== OH_FIELDS.length || OH_FIELDS.some((k) => !Object.hasOwn(a, k))) reject("selected-field-drift");
  if (!Number.isSafeInteger(a.objectid) || a.objectid < 1) reject("invalid-object-id");
  if (a.program_type !== "Child Care Center" || a.program_status !== "Open") reject("source-scope-drift");
  const selected = {};
  for (const [name, maximum] of Object.entries(lengths)) selected[name] = text(a[name], maximum, ["program_name", "street_address", "city", "state", "program_type", "program_status"].includes(name));
  if (selected.state !== "OH") reject("source-state-drift");
  if (/^(?:P\.?\s*O\.?\s*(?:BOX|B\b)|POST\s+OFFICE\s+BOX|GENERAL\s+DELIVERY)\b/i.test(selected.street_address)) reject("nonphysical-address");
  if (a.program_number !== null && (!Number.isSafeInteger(a.program_number) || a.program_number < 1)) reject("invalid-program-number");
  let point;
  try { point = ohPoint(feature.geometry, { wkid: context.outputWkid }); } catch { reject("invalid-source-coordinate-structure-or-crs"); }
  const zip = postal(selected.zip_code);
  const programNumber = a.program_number === null ? null : String(a.program_number);
  return assertNormalizedUsPostalFieldsDeep({
    schema_version: "1.0.0", dataset_id: "oh-dcy-publisher-open-childcare-centers", source_record_id: `${sourceReleaseId}:object:${a.objectid}`,
    business_name: selected.program_name,
    external_identifiers: programNumber === null ? [] : [{ type: "ohio_dcy_program_number", value: programNumber, source_field: "program_number", identity_verified: false }],
    physical_address: { street: selected.street_address, street2: null, city: selected.city, county_source: selected.county, state: "OH", country: "US",
      state_country_basis: "publisher-record-and-dataset-scope-not-boundary-verification", zip_code: zip.zip_code, postal_code: zip.postal_code, zip4: zip.zip4 },
    geocode: { latitude: point.latitude, longitude: point.longitude, crs: "EPSG:4326", source: "Ohio State GIS", status: point.reason },
    industry: { category: "childcare", childcare_type_source: selected.program_type },
    source_status: { status_source: selected.program_status, status_interpretation: "publisher-open-center-directory-membership-not-verified-operation", active_business_verified: false, valid_from: null, valid_to: null },
    affiliation: { parent_company: null, ownership_verified: false },
    provenance: { source_url: OH_LAYER, source_filter: OH_WHERE, source_object_id: a.objectid, source_release_id: sourceReleaseId, ingest_run_id: runId, observed_at: observedAt,
      processed_at: processedAt, timestamp_interpretation: "selected-page-observation-not-license-or-business-operating-dates", transformation_version: OH_NORMALIZATION_VERSION, input_feature_sha256: hash(feature),
      attribution: "Ohio Department of Children and Youth; State of Ohio GIS", policy_id: policy.policy_id, policy_profile: `${policy.policy_id}@${policy.version}`, policy_sha256: hash(policy),
      publisher_metadata_required: true, publisher_notices_required: true,
      field_lineage: { business_name: "attributes.program_name", external_identifiers: ["attributes.program_number"],
        street: "attributes.street_address", street2: "not-provided", county_source: "attributes.county", city: "attributes.city", state: "attributes.state", country: "dataset-scope",
        "physical_address.zip_code": "attributes.zip_code", "physical_address.postal_code": "attributes.zip_code", "physical_address.zip4": "attributes.zip_code", longitude: "geometry.x-returned-EPSG4326", latitude: "geometry.y-returned-EPSG4326", childcare_type_source: "attributes.program_type", status_source: "attributes.program_status" } },
    quality: { zip_unavailable_reason: zip.reason, point_unavailable_reason: point.latitude === null ? point.reason : null, missing_identifier_fields: programNumber === null ? ["program_number"] : [],
      current_usps_validity: "unverified", unique_business_identity_verified: false, geographic_boundary_verified: false, address_geocoding_accuracy_verified: false },
    export_policy: "local-review-only",
  });
}

/** Revalidate supplied acquisition evidence, then conserve every selected source row. */
export function normalizeOhChildcareAcquisition(evidence, context = {}, { signal } = {}) {
  const { runId, sourceReleaseId } = contextValues(context, ["runId", "sourceReleaseId", "processedAt"]);
  const processedAt = contextText(context.processedAt, "processedAt");
  signal?.throwIfAborted();
  const acquired = replayOhChildcareAcquisition(evidence, { signal }), observations = new Map();
  if (!Number.isFinite(Date.parse(processedAt)) || new Date(processedAt).toISOString() !== processedAt || processedAt < evidence.observed_at) throw new Error("Ohio processing time must follow completed acquisition evidence.");
  for (const page of evidence.observations.filter((v) => v.kind === "features")) for (const feature of page.payload.features) observations.set(feature.attributes.objectid, page.observed_at);
  const records = [], quarantine = [];
  for (const feature of acquired.features) {
    signal?.throwIfAborted();
    const sourceObjectId = feature.attributes.objectid, observedAt = observations.get(sourceObjectId);
    try { records.push(normalizeOhChildcareFeature(feature, { runId, sourceReleaseId, observedAt, processedAt, outputWkid: 4326 })); }
    catch (error) {
      if (error.code !== "OH_CHILDCARE_RECORD_REJECTED") throw error;
      quarantine.push({ source_object_id: sourceObjectId, source_record_id: `${sourceReleaseId}:object:${sourceObjectId}`, source_release_id: sourceReleaseId, ingest_run_id: runId, observed_at: observedAt,
        processed_at: processedAt, input_feature_sha256: hash(feature), transformation_version: OH_NORMALIZATION_VERSION, policy_sha256: hash(policy), reason: error.reason, raw_evidence_location: "acquisition-evidence-observation-by-object-id", export_policy: "internal" });
    }
  }
  if (records.length + quarantine.length !== acquired.source.source_record_count) throw new Error("Ohio source-row conservation failed.");
  const reasons = (rows, property) => rows.reduce((counts, row) => { const reason = row.quality[property]; if (reason) counts[reason] = (counts[reason] ?? 0) + 1; return counts; }, {});
  return { records, quarantine, summary: { source_records: acquired.source.source_record_count, accepted_records: records.length, quarantined_records: quarantine.length,
    accepted_with_zip5: records.filter((v) => v.physical_address.zip_code !== null).length, accepted_with_zip4: records.filter((v) => v.physical_address.zip4 !== null).length,
    zip_unavailable_reasons: reasons(records, "zip_unavailable_reason"), point_unavailable_reasons: reasons(records, "point_unavailable_reason"),
    transformation_version: OH_NORMALIZATION_VERSION, acquisition_evidence_sha256: hash(evidence), normalized_records_sha256: hash(records), quarantine_sha256: hash(quarantine),
    identity_matching_applied: false, acquisition_authorized: false, export_authorized: false, release_published: false } };
}
