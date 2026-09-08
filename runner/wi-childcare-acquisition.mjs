import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { WI_LAYER, WI_FIELDS, WI_WHERE, validateWiChildcarePreflight } from "./wi-childcare-preflight.mjs";
import policy from "../config/source-policies/wi-childcare-local-review.json" with { type: "json" };

export const WI_ACQUISITION_VERSION = "wi-childcare-acquisition@1.0.0";
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const rawHash = (value) => createHash("sha256").update(value).digest("hex");
const check = (value, reason) => { if (!value) throw new Error(`Wisconsin acquisition rejected: ${reason}.`); };
const object = (v) => v && typeof v === "object" && !Array.isArray(v);
const keys = (v, allowed) => object(v) && Object.keys(v).every((k) => allowed.includes(k));
const exact = (v, allowed) => keys(v, allowed) && Object.keys(v).length === allowed.length;
const time = (v) => typeof v === "string" && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const crs = (v) => keys(v, ["wkid", "latestWkid"]) && v.wkid === 4326 && (v.latestWkid === undefined || v.latestWkid === 4326);
const query = (args) => `${WI_LAYER}/query?${new URLSearchParams({ f: "json", where: WI_WHERE, ...args })}`;
export const wiInventoryUrl = () => query({ returnIdsOnly: "true", returnGeometry: "false" });
export const wiFeatureUrl = (ids) => query({ objectIds: ids.join(","), outFields: WI_FIELDS.join(","), returnGeometry: "true", outSR: "4326", returnZ: "false", returnM: "false", orderByFields: "OBJECTID ASC" });

export function validateWiSourcePolicy(preflight) {
  validateWiChildcarePreflight(preflight);
  check(preflight.transformation_version === "1.1.0", "complete metadata prerequisite");
  for (const [kind, expected] of Object.entries(policy.terms_fingerprints)) {
    for (const observation of preflight.observations.filter((v) => v.kind === kind)) {
      const value = observation.payload;
      const actual = kind === "xml" ? value.sha256 : kind === "notice-data" ? hash(value.markdown_cards) : rawHash(value.licenseInfo);
      check(actual === expected, "publisher terms changed; renewed review required");
    }
  }
  return { policy_id: policy.policy_id, version: policy.version, policy_sha256: hash(policy), acquisition_authorized: policy.acquisition_authorized, export_authorized: false, legal_approval: false };
}

export function wiInventory(payload, count) {
  check(keys(payload, ["objectIdFieldName", "objectIds", "exceededTransferLimit"]) && payload.objectIdFieldName === "OBJECTID" && (payload.exceededTransferLimit === undefined || payload.exceededTransferLimit === false)
    && Number.isSafeInteger(count) && count > 0 && count <= 50_000 && Array.isArray(payload.objectIds) && payload.objectIds.length === count && new Set(payload.objectIds).size === count && payload.objectIds.every((v) => Number.isSafeInteger(v) && v > 0), "ID inventory");
  return [...payload.objectIds].sort((a, b) => a - b);
}
export function wiBatches(ids) {
  check(Array.isArray(ids) && ids.length > 0 && ids.length <= 50_000 && ids.every((id, i) => Number.isSafeInteger(id) && id > 0 && (!i || id > ids[i - 1])), "sorted unique IDs");
  const batches = []; let offset = 0;
  while (offset < ids.length) {
    const batch = [];
    while (offset + batch.length < ids.length && batch.length < 100 && Buffer.byteLength(wiFeatureUrl([...batch, ids[offset + batch.length]])) <= 2000) batch.push(ids[offset + batch.length]);
    check(batch.length > 0, "URL ceiling"); batches.push(batch); offset += batch.length;
  }
  return batches;
}
/** Quality evidence, not geocoding or address/boundary verification. */
export function wiPoint(geometry, spatialReference) {
  check(crs(spatialReference), "response WGS84 CRS");
  if (geometry === null || geometry === undefined) return { latitude: null, longitude: null, reason: "source-geometry-missing" };
  check(keys(geometry, ["x", "y", "spatialReference"]) && Object.hasOwn(geometry, "x") && (geometry.spatialReference === undefined || crs(geometry.spatialReference)), "point geometry or CRS");
  if (geometry.x === null && (geometry.y === null || geometry.y === undefined)) return { latitude: null, longitude: null, reason: "source-point-empty" };
  check(typeof geometry.x === "number" && typeof geometry.y === "number" && Number.isFinite(geometry.x) && Number.isFinite(geometry.y), "partial or nonnumeric point");
  if (Math.abs(geometry.x) > 180 || Math.abs(geometry.y) > 90) return { latitude: null, longitude: null, reason: "source-point-out-of-geographic-range" };
  if (geometry.x === 0 && geometry.y === 0) return { latitude: null, longitude: null, reason: "source-point-zero-location-anomaly" };
  // Deliberately padded plausibility envelope, not the governed Wisconsin boundary.
  if (geometry.x < -94 || geometry.x > -86 || geometry.y < 42 || geometry.y > 48) return { latitude: null, longitude: null, reason: "source-point-outside-wisconsin-plausibility-envelope" };
  return { latitude: geometry.y, longitude: geometry.x, reason: "publisher-returned-epsg4326-not-address-verified" };
}
export function wiFeatures(payload, ids, preflight) {
  validateWiChildcarePreflight(preflight);
  const schema = preflight.observations.find((v) => v.kind === "layer").payload.fields;
  check(keys(payload, ["objectIdFieldName", "displayFieldName", "fieldAliases", "fields", "features", "geometryType", "spatialReference", "exceededTransferLimit"])
    && payload.geometryType === "esriGeometryPoint" && crs(payload.spatialReference)
    && (payload.exceededTransferLimit === undefined || payload.exceededTransferLimit === false)
    && (payload.objectIdFieldName === undefined || payload.objectIdFieldName === "OBJECTID")
    && (payload.displayFieldName === undefined || ["", "FacilityName"].includes(payload.displayFieldName))
    && Array.isArray(payload.features) && payload.features.length === ids.length, "batch envelope, CRS or truncation");
  if (payload.fieldAliases !== undefined) check(exact(payload.fieldAliases, WI_FIELDS) && Object.values(payload.fieldAliases).every((v) => typeof v === "string" && v.length <= 100), "aliases");
  if (payload.fields !== undefined) {
    check(Array.isArray(payload.fields) && payload.fields.length === WI_FIELDS.length && new Set(payload.fields.map((f) => f.name)).size === WI_FIELDS.length, "returned schema roster");
    for (const field of payload.fields) {
      const expected = schema.find((f) => f.name === field.name);
      check(expected && WI_FIELDS.includes(field.name) && field.type === expected.type && (expected.length === undefined || field.length === expected.length)
        && (field.domain === undefined || field.domain === null) && (field.defaultValue === undefined || field.defaultValue === null)
        && (field.nullable === undefined || typeof field.nullable === "boolean") && (field.alias === undefined || typeof field.alias === "string" && field.alias.length <= 255)
        && keys(field, ["name", "type", "alias", "length", "domain", "nullable", "defaultValue"]) && Object.values(field).every((v) => v === null || ["string", "number", "boolean"].includes(typeof v)), "returned schema");
    }
  }
  const rows = new Map();
  for (const feature of payload.features) {
    check((exact(feature, ["attributes", "geometry"]) || exact(feature, ["attributes"])) && exact(feature.attributes, WI_FIELDS), "unselected or missing fields");
    const a = feature.attributes;
    check(ids.includes(a.OBJECTID) && !rows.has(a.OBJECTID), "row membership or duplicate ID");
    check(a.CategoryType === "LICENSED GROUP" && typeof a.State === "string" && a.State.trim() === "WI", "selected scope");
    for (const name of WI_FIELDS) {
      const expected = schema.find((f) => f.name === name), v = a[name];
      check(expected.type === "esriFieldTypeString" ? v === null || typeof v === "string" && v.length <= expected.length : v === null || Number.isSafeInteger(v), "attribute type or length");
    }
    wiPoint(feature.geometry, payload.spatialReference);
    rows.set(a.OBJECTID, structuredClone(feature));
  }
  return ids.map((id) => rows.get(id));
}

/** Replays supplied evidence only. No network or approval assertion is performed. */
export function replayWiChildcareAcquisition(evidence, { signal } = {}) {
  signal?.throwIfAborted();
  check(exact(evidence, ["schema_version", "transformation_version", "started_at", "observed_at", "preflight_before", "preflight_after", "observations"])
    && evidence.schema_version === 1 && evidence.transformation_version === WI_ACQUISITION_VERSION && time(evidence.started_at) && time(evidence.observed_at), "evidence envelope");
  const before = validateWiChildcarePreflight(evidence.preflight_before), after = validateWiChildcarePreflight(evidence.preflight_after);
  check(before.transformation_version === "1.1.0" && after.transformation_version === "1.1.0", "complete metadata");
  check(hash(before.observations.slice(0, 9).map((v) => [v.kind, v.payload])) === hash(after.observations.slice(0, 9).map((v) => [v.kind, v.payload])), "metadata/count drift");
  check(evidence.started_at <= before.started_at && before.finished_at <= after.started_at && after.finished_at <= evidence.observed_at && Array.isArray(evidence.observations), "chronology");
  const observations = evidence.observations;
  check(observations.length >= 3 && observations.length <= 50_002, "observation roster");
  let prior = before.finished_at, bytes = 0, selectedBytes = 0;
  for (const o of observations) {
    signal?.throwIfAborted();
    check(exact(o, ["kind", "url", "observed_at", "payload", "payload_sha256", "response_bytes"]) && time(o.observed_at) && o.observed_at >= prior && o.observed_at <= after.started_at
      && o.payload_sha256 === hash(o.payload) && Number.isSafeInteger(o.response_bytes) && o.response_bytes > 0 && o.response_bytes <= 8_000_000 && Buffer.byteLength(JSON.stringify(o.payload)) <= 8_000_000, "observation evidence");
    prior = o.observed_at; bytes += o.response_bytes; selectedBytes += Buffer.byteLength(JSON.stringify(o.payload));
    check(bytes <= 100_000_000 && selectedBytes <= 100_000_000, "cumulative bytes");
  }
  const ids = wiInventory(observations[0].payload, before.source.source_record_count), batches = wiBatches(ids);
  check(observations.length === batches.length + 2 && observations[0].kind === "inventory" && observations.at(-1).kind === "inventory"
    && observations[0].url === wiInventoryUrl() && observations.at(-1).url === wiInventoryUrl()
    && isDeepStrictEqual(ids, wiInventory(observations.at(-1).payload, ids.length)), "stable ID inventory");
  const features = [];
  for (const [i, batch] of batches.entries()) {
    signal?.throwIfAborted(); const o = observations[i + 1];
    check(o.kind === "features" && o.url === wiFeatureUrl(batch), "fixed selected query");
    features.push(...wiFeatures(o.payload, batch, before));
  }
  return { features, points: features.map((v) => wiPoint(v.geometry, { wkid: 4326 })), source: { source_record_count: ids.length, object_ids_sha256: hash(ids), output_wkid: 4326, selected_fields: [...WI_FIELDS], reported_successful_response_bytes: bytes, transport_bytes_verified: false, serialized_payload_bytes: selectedBytes,
    consistency: "paired-metadata-count-ID-inventory-not-transactional-snapshot", acquisition_authorized: false, export_authorized: false, legal_approval: false }, evidence: structuredClone(evidence) };
}
