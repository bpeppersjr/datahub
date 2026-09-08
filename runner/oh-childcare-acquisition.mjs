import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { OH_FIELDS, OH_LAYER, OH_WHERE, validateOhChildcarePreflight } from "./oh-childcare-preflight.mjs";

export const OH_ACQUISITION_VERSION = "oh-childcare-acquisition@1.0.0";
const hash = (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const check = (v, reason) => { if (!v) throw new Error(`Ohio acquisition rejected: ${reason}.`); };
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const keys = (v, names) => object(v) && Object.keys(v).every((k) => names.includes(k));
const exact = (v, names) => keys(v, names) && Object.keys(v).length === names.length;
const time = (v) => typeof v === "string" && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const crs = (v) => keys(v, ["wkid", "latestWkid"]) && v.wkid === 4326 && (v.latestWkid === undefined || v.latestWkid === 4326);
const query = (args) => `${OH_LAYER}/query?${new URLSearchParams({ f: "json", where: OH_WHERE, ...args })}`;
export const ohInventoryUrl = () => query({ returnIdsOnly: "true", returnGeometry: "false" });
export const ohFeatureUrl = (ids) => query({ objectIds: ids.join(","), outFields: OH_FIELDS.join(","), returnGeometry: "true", outSR: "4326", returnZ: "false", returnM: "false", orderByFields: "objectid ASC" });
const sortedIds = (ids) => Array.isArray(ids) && ids.length > 0 && ids.length <= 50_000 && ids.every((id, i) => Number.isSafeInteger(id) && id > 0 && (!i || id > ids[i - 1]));

export function ohInventory(payload, count) {
  check(keys(payload, ["objectIdFieldName", "objectIds", "exceededTransferLimit"]) && payload.objectIdFieldName === "objectid"
    && (payload.exceededTransferLimit === undefined || payload.exceededTransferLimit === false)
    && Number.isSafeInteger(count) && count > 0 && count <= 50_000 && Array.isArray(payload.objectIds) && payload.objectIds.length === count
    && new Set(payload.objectIds).size === count && payload.objectIds.every((id) => Number.isSafeInteger(id) && id > 0), "ID inventory");
  return [...payload.objectIds].sort((a, b) => a - b);
}
export function ohBatches(ids) {
  check(sortedIds(ids), "sorted unique IDs");
  const batches = []; let offset = 0;
  while (offset < ids.length) {
    const batch = [];
    while (offset + batch.length < ids.length && batch.length < 100 && Buffer.byteLength(ohFeatureUrl([...batch, ids[offset + batch.length]])) <= 2000) batch.push(ids[offset + batch.length]);
    check(batch.length > 0, "URL ceiling"); batches.push(batch); offset += batch.length;
  }
  return batches;
}
/** Plausibility only, not address geocoding or Census boundary assignment. */
export function ohPoint(geometry, spatialReference) {
  check(crs(spatialReference), "response WGS84 CRS");
  const missing = (reason) => ({ latitude: null, longitude: null, reason });
  if (geometry === null || geometry === undefined) return missing("source-geometry-missing");
  check(keys(geometry, ["x", "y", "spatialReference"]) && Object.hasOwn(geometry, "x") && (geometry.spatialReference === undefined || crs(geometry.spatialReference)), "point geometry or CRS");
  if (geometry.x === null && (geometry.y === null || geometry.y === undefined)) return missing("source-point-empty");
  check(typeof geometry.x === "number" && typeof geometry.y === "number" && Number.isFinite(geometry.x) && Number.isFinite(geometry.y), "partial or nonnumeric point");
  if (Math.abs(geometry.x) > 180 || Math.abs(geometry.y) > 90) return missing("source-point-out-of-geographic-range");
  if (geometry.x === 0 && geometry.y === 0) return missing("source-point-zero-location-anomaly");
  // Padded Ohio plausibility envelope; never a substitute for governed polygons.
  if (geometry.x < -85 || geometry.x > -80 || geometry.y < 38 || geometry.y > 43) return missing("source-point-outside-ohio-plausibility-envelope");
  return { latitude: geometry.y, longitude: geometry.x, reason: "publisher-returned-epsg4326-not-address-verified" };
}
function features(payload, ids, schema) {
  // Fixed diagnostics survive app receipts without retaining rejected provider data.
  // ArcGIS may explicitly report absent Z/M dimensions. Only false is compatible
  // with our fixed two-dimensional query; unknown fields and actual Z/M still fail.
  check(keys(payload, ["objectIdFieldName", "displayFieldName", "fieldAliases", "fields", "features", "geometryType", "spatialReference", "exceededTransferLimit", "hasZ", "hasM"]), "batch envelope fields");
  check(payload.geometryType === "esriGeometryPoint", "batch geometry type");
  check(crs(payload.spatialReference), "batch WGS84 CRS");
  check((payload.hasZ === undefined || payload.hasZ === false) && (payload.hasM === undefined || payload.hasM === false), "batch extra dimensions");
  check(payload.exceededTransferLimit === undefined || payload.exceededTransferLimit === false, "batch transfer limit");
  check(payload.objectIdFieldName === undefined || payload.objectIdFieldName === "objectid", "batch object ID field");
  check(payload.displayFieldName === undefined || ["", "program_name"].includes(payload.displayFieldName), "batch display field");
  check(Array.isArray(payload.features), "batch feature array");
  check(payload.features.length === ids.length, "batch feature count");
  if (payload.fieldAliases !== undefined) check(exact(payload.fieldAliases, OH_FIELDS) && Object.values(payload.fieldAliases).every((v) => typeof v === "string" && v.length <= 255), "aliases");
  if (payload.fields !== undefined) {
    check(Array.isArray(payload.fields) && payload.fields.length === OH_FIELDS.length && payload.fields.every(object) && new Set(payload.fields.map((f) => f.name)).size === OH_FIELDS.length, "returned schema roster");
    for (const field of payload.fields) {
      const expected = schema.get(field.name);
      check(expected && field.type === expected.type && field.length === expected.length
        && keys(field, ["name", "type", "length", "alias", "nullable", "domain", "defaultValue"])
        && (field.domain === undefined || field.domain === null) && (field.defaultValue === undefined || field.defaultValue === null)
        && (field.nullable === undefined || field.nullable === expected.nullable)
        && (field.alias === undefined || typeof field.alias === "string" && field.alias.length <= 255), "returned schema");
    }
  }
  const membership = new Set(ids), rows = new Map();
  for (const feature of payload.features) {
    check((exact(feature, ["attributes", "geometry"]) || exact(feature, ["attributes"])) && exact(feature.attributes, OH_FIELDS), "unselected or missing fields");
    const a = feature.attributes;
    check(membership.has(a.objectid) && !rows.has(a.objectid), "row membership or duplicate ID");
    check(a.program_type === "Child Care Center" && a.program_status === "Open" && typeof a.state === "string" && a.state.trim() === "OH", "selected scope");
    for (const name of OH_FIELDS) {
      const expected = schema.get(name), value = a[name];
      check(value === null ? expected.nullable : expected.type === "esriFieldTypeString" ? typeof value === "string" && value.length <= expected.length : typeof value === "number" && Number.isFinite(value), "attribute type or length");
    }
    // Preserve nullable source Double program numbers here. Identifier validity belongs to normalization.
    ohPoint(feature.geometry, payload.spatialReference); rows.set(a.objectid, structuredClone(feature));
  }
  return ids.map((id) => rows.get(id));
}
export function ohFeatures(payload, ids, preflight) {
  check(sortedIds(ids) && ids.length <= 100 && Buffer.byteLength(ohFeatureUrl(ids)) <= 2000, "bounded batch IDs");
  validateOhChildcarePreflight(preflight);
  return features(payload, ids, new Map(preflight.observations[0].payload.fields.filter((f) => OH_FIELDS.includes(f.name)).map((f) => [f.name, f])));
}

/** Offline replay only: no network, durable publication, authorization or transport authenticity claim. */
export function replayOhChildcareAcquisition(evidence, { signal } = {}) {
  signal?.throwIfAborted();
  check(exact(evidence, ["schema_version", "transformation_version", "started_at", "observed_at", "preflight_before", "preflight_after", "observations"])
    && evidence.schema_version === 1 && evidence.transformation_version === OH_ACQUISITION_VERSION && time(evidence.started_at) && time(evidence.observed_at), "evidence envelope");
  const before = validateOhChildcarePreflight(evidence.preflight_before), after = validateOhChildcarePreflight(evidence.preflight_after);
  check(hash(before.observations.slice(0, 5).map((o) => [o.kind, o.payload])) === hash(after.observations.slice(0, 5).map((o) => [o.kind, o.payload])), "metadata/count drift");
  check(evidence.started_at <= before.started_at && before.finished_at <= after.started_at && after.finished_at <= evidence.observed_at, "chronology");
  const observations = evidence.observations;
  check(Array.isArray(observations) && observations.length >= 3 && observations.length <= 50_002, "observation roster");
  let prior = before.finished_at, bytes = 0, serializedBytes = 0;
  for (const o of observations) {
    signal?.throwIfAborted();
    check(exact(o, ["kind", "url", "observed_at", "payload", "payload_sha256", "response_bytes"]) && time(o.observed_at) && o.observed_at >= prior && o.observed_at <= after.started_at
      && o.payload_sha256 === hash(o.payload) && Number.isSafeInteger(o.response_bytes) && o.response_bytes > 0 && o.response_bytes <= 8_000_000, "observation evidence");
    const length = Buffer.byteLength(JSON.stringify(o.payload));
    check(length <= 8_000_000, "payload ceiling"); prior = o.observed_at; bytes += o.response_bytes; serializedBytes += length;
    check(bytes <= 100_000_000 && serializedBytes <= 100_000_000, "cumulative bytes");
  }
  const ids = ohInventory(observations[0].payload, before.source.source_record_count), batches = ohBatches(ids);
  check(observations.length === batches.length + 2 && observations[0].kind === "inventory" && observations.at(-1).kind === "inventory"
    && observations[0].url === ohInventoryUrl() && observations.at(-1).url === ohInventoryUrl()
    && isDeepStrictEqual(ids, ohInventory(observations.at(-1).payload, ids.length)), "stable ID inventory");
  const schema = new Map(before.observations[0].payload.fields.filter((f) => OH_FIELDS.includes(f.name)).map((f) => [f.name, f])), rows = [];
  for (const [i, batch] of batches.entries()) {
    signal?.throwIfAborted(); const o = observations[i + 1];
    check(o.kind === "features" && o.url === ohFeatureUrl(batch), "fixed selected query");
    rows.push(...features(o.payload, batch, schema));
  }
  signal?.throwIfAborted();
  return { features: rows, points: rows.map((f) => ohPoint(f.geometry, { wkid: 4326 })), source: {
    source_record_count: ids.length, object_ids_sha256: hash(ids), selected_fields: [...OH_FIELDS], output_wkid: 4326,
    reported_successful_response_bytes: bytes, transport_bytes_verified: false, serialized_payload_bytes: serializedBytes,
    consistency: "paired-metadata-count-ID-inventory-not-transactional-snapshot", acquisition_authorized: false, export_authorized: false, legal_approval: false,
  }, evidence: structuredClone(evidence) };
}
