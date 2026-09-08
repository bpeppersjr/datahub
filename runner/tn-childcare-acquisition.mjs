import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { isDeepStrictEqual } from "node:util";
import { preflightTnChildcare, validateTnChildcarePreflight, TN_CHILDCARE_LAYER, TN_CHILDCARE_ITEM,
  TN_CHILDCARE_SCHEMA, TN_CHILDCARE_WHERE, TN_CHILDCARE_XML_URL } from "./tn-childcare-preflight.mjs";
import { boundedJson, publisherRetryDelay } from "./source-http-guards.mjs";

export const TN_CHILDCARE_ACQUISITION_VERSION = "tn-childcare-acquisition@1.0.0";
const FIELDS = TN_CHILDCARE_SCHEMA.map(([name]) => name);
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const exact = (v, keys) => v && typeof v === "object" && !Array.isArray(v) && isDeepStrictEqual(Object.keys(v).sort(), [...keys].sort());
function requireValue(ok, label) { if (!ok) throw new Error(`Tennessee childcare acquisition rejected: ${label}.`); }
const crs = (v) => v && v.wkid === 4326 && (v.latestWkid === undefined || v.latestWkid === 4326) && Object.keys(v).every((key) => ["wkid", "latestWkid"].includes(key));
const canonicalTime = (v) => typeof v === "string" && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
function query(args) { return `${TN_CHILDCARE_LAYER}/query?${new URLSearchParams({ f: "json", where: TN_CHILDCARE_WHERE, ...args })}`; }
const inventoryUrl = () => query({ returnIdsOnly: "true", returnGeometry: "false" });
const featureUrl = (ids) => query({ objectIds: ids.join(","), outFields: FIELDS.join(","), returnGeometry: "true", outSR: "4326", orderByFields: "OBJECTID ASC" });
function inventory(payload, count) {
  requireValue(payload && Object.keys(payload).every((key) => ["objectIdFieldName", "objectIds", "exceededTransferLimit", "uniqueIdField", "globalIdFieldName"].includes(key))
    && payload.objectIdFieldName === "OBJECTID" && payload.exceededTransferLimit !== true
    && (payload.globalIdFieldName === undefined || payload.globalIdFieldName === "")
    && (payload.uniqueIdField === undefined || isDeepStrictEqual(payload.uniqueIdField, { name: "OBJECTID", isSystemMaintained: true }))
    && Array.isArray(payload.objectIds) && payload.objectIds.length === count && new Set(payload.objectIds).size === count
    && payload.objectIds.every((id) => Number.isSafeInteger(id) && id >= 1), "ID inventory");
  return [...payload.objectIds].sort((a, b) => a - b);
}
function packs(ids) {
  const batches = []; let offset = 0;
  while (offset < ids.length) {
    const batch = [];
    while (offset + batch.length < ids.length && batch.length < 100 && Buffer.byteLength(featureUrl([...batch, ids[offset + batch.length]])) <= 2000) batch.push(ids[offset + batch.length]);
    requireValue(batch.length > 0, "URL ceiling"); batches.push(batch); offset += batch.length;
  }
  return batches;
}
function batchFeatures(payload, ids) {
  requireValue(payload && Object.keys(payload).every((key) => ["objectIdFieldName", "uniqueIdField", "globalIdFieldName", "geometryType", "spatialReference", "fields", "features", "exceededTransferLimit", "fieldAliases", "displayFieldName"].includes(key))
    && crs(payload.spatialReference) && payload.exceededTransferLimit !== true && (payload.objectIdFieldName === undefined || payload.objectIdFieldName === "OBJECTID")
    && (payload.geometryType === undefined || payload.geometryType === "esriGeometryPoint")
    && (payload.globalIdFieldName === undefined || payload.globalIdFieldName === "")
    && (payload.uniqueIdField === undefined || isDeepStrictEqual(payload.uniqueIdField, { name: "OBJECTID", isSystemMaintained: true }))
    && (payload.displayFieldName === undefined || ["", "Provider_Name"].includes(payload.displayFieldName))
    && Array.isArray(payload.features) && payload.features.length === ids.length, "batch shape, membership, truncation or CRS");
  if (payload.fieldAliases !== undefined) requireValue(exact(payload.fieldAliases, FIELDS) && Object.values(payload.fieldAliases).every((v) => typeof v === "string" && v.length <= 100), "field aliases");
  if (payload.fields !== undefined) {
    requireValue(Array.isArray(payload.fields) && payload.fields.length === FIELDS.length && new Set(payload.fields.map((f) => f.name)).size === FIELDS.length, "response schema roster");
    for (const field of payload.fields) {
      const pin = TN_CHILDCARE_SCHEMA.find(([name]) => name === field.name);
      requireValue(pin && field.type === pin[1] && (pin[2] === null || field.length === pin[2])
        && Object.keys(field).every((key) => ["name", "type", "alias", "sqlType", "domain", "defaultValue", "length", "nullable", "editable"].includes(key))
        && Object.values(field).every((v) => v === null || ["string", "number", "boolean"].includes(typeof v)), "response schema");
    }
  }
  const rows = new Map();
  for (const feature of payload.features) {
    const attrs = feature?.attributes;
    requireValue((exact(feature, ["attributes", "geometry"]) || exact(feature, ["attributes"])) && exact(attrs, FIELDS) && Object.values(attrs).every((v) => v === null || ["string", "number", "boolean"].includes(typeof v))
      && ids.includes(attrs.OBJECTID) && !rows.has(attrs.OBJECTID), "private fields or row membership");
    requireValue(attrs.Provider_Status === "Active" && attrs.Provider_Type === "Child Care" && attrs.Child_Care_Type === "Child Care Center"
      && attrs.State === "TN", "center-only scope");
    for (const [name, type, length] of TN_CHILDCARE_SCHEMA) if (type === "esriFieldTypeString") requireValue(attrs[name] === null || (typeof attrs[name] === "string" && attrs[name].length <= length), "selected string type or size");
    requireValue(attrs.Provider_ID === null || Number.isSafeInteger(attrs.Provider_ID), "provider identifier type");
    const g = feature.geometry;
    requireValue(g === null || g === undefined || (exact(g, g.spatialReference === undefined ? ["x", "y"] : ["x", "y", "spatialReference"])
      && [g.x, g.y].every((v) => v === null || (typeof v === "number" && Number.isFinite(v))) && (g.spatialReference === undefined || crs(g.spatialReference))), "private geometry or CRS");
    rows.set(attrs.OBJECTID, structuredClone(feature));
  }
  return ids.map((id) => rows.get(id));
}
function preflightComplete(receipt) {
  validateTnChildcarePreflight(receipt);
  requireValue(receipt.policy.metadata_xml_retained === true && receipt.observations.filter((o) => o.kind === "xml").every((o) => o.payload.status === 200), "complete publisher XML required before rows");
  return receipt;
}
function metadataFingerprint(receipt) {
  return hash(receipt.observations.slice(0, 5).map(({ kind, payload }) => {
    if (kind === "item") return { kind, payload: Object.fromEntries(Object.entries(payload).filter(([key]) => !["numViews", "lastViewed"].includes(key))) };
    if (kind === "organization") return { kind, payload: { id: payload.id, name: payload.name, urlKey: payload.urlKey, description: payload.description ?? null } };
    return { kind, payload };
  }));
}
export function replayTnChildcareAcquisition(evidence, { signal } = {}) {
  signal?.throwIfAborted();
  requireValue(exact(evidence, ["schema_version", "transformation_version", "started_at", "observed_at", "preflight_before", "preflight_after", "observations"])
    && evidence.schema_version === 1 && evidence.transformation_version === TN_CHILDCARE_ACQUISITION_VERSION
    && canonicalTime(evidence.started_at) && canonicalTime(evidence.observed_at), "evidence envelope");
  const before = preflightComplete(evidence.preflight_before), after = preflightComplete(evidence.preflight_after), observations = evidence.observations;
  requireValue(metadataFingerprint(before) === metadataFingerprint(after) && before.source.record_count === after.source.record_count, "metadata or count drift");
  requireValue(evidence.started_at <= before.started_at && before.observed_at <= after.started_at && after.observed_at <= evidence.observed_at
    && Array.isArray(observations) && observations.length >= 3 && observations.length <= 20_002, "chronology or observations");
  let prior = before.observed_at, transferredBytes = 0;
  for (const observation of observations) {
    signal?.throwIfAborted();
    requireValue(exact(observation, ["kind", "url", "observed_at", "payload", "payload_sha256", "response_bytes"]) && canonicalTime(observation.observed_at)
      && observation.observed_at >= prior && observation.observed_at <= after.started_at && observation.payload_sha256 === hash(observation.payload)
      && Number.isSafeInteger(observation.response_bytes) && observation.response_bytes >= 1 && observation.response_bytes <= 8_000_000
      && Buffer.byteLength(JSON.stringify(observation.payload)) <= 8_000_000, "observation evidence or byte limit"); prior = observation.observed_at;
    transferredBytes += observation.response_bytes; requireValue(transferredBytes <= 100_000_000, "recorded transfer byte ceiling");
  }
  const ids = inventory(observations[0].payload, before.source.record_count), batches = packs(ids), features = [];
  requireValue(observations.length === batches.length + 2 && observations[0].kind === "inventory" && observations.at(-1).kind === "inventory"
    && observations[0].url === inventoryUrl() && observations.at(-1).url === inventoryUrl()
    && isDeepStrictEqual(ids, inventory(observations.at(-1).payload, ids.length)), "stable ID inventory");
  let selectedBytes = 0;
  for (const [index, batch] of batches.entries()) {
    signal?.throwIfAborted(); const observation = observations[index + 1];
    requireValue(observation.kind === "features" && observation.url === featureUrl(batch), "fixed selected request");
    selectedBytes += Buffer.byteLength(JSON.stringify(observation.payload)); requireValue(selectedBytes <= 100_000_000, "cumulative selected JSON ceiling");
    features.push(...batchFeatures(observation.payload, batch));
  }
  const metadata = (receipt) => { const observation = receipt.observations.find((o) => o.kind === "xml"), p = observation.payload;
    return { raw: Buffer.from(p.base64, "base64"), sha256: p.sha256, bytes: p.bytes, url: TN_CHILDCARE_XML_URL, observed_at: observation.observed_at }; };
  return { evidence: structuredClone(evidence), features,
    source: { ...after.source, output_wkid: 4326, selected_fields: [...FIELDS], object_ids_sha256: hash(ids), selected_json_bytes: selectedBytes, successful_query_response_bytes: transferredBytes,
      started_at: evidence.started_at, observed_at: evidence.observed_at, item_id: TN_CHILDCARE_ITEM,
      consistency: "metadata-xml-count-id-inventory-stable-not-transactional-snapshot", xml_validation: before.policy.xml_validation,
      legal_approval: false, export_authorized: false }, publisher_metadata: { before: metadata(before), after: metadata(after) } };
}
export async function acquireTnChildcare(options = {}) {
  requireValue(options && typeof options === "object" && !Array.isArray(options) && Object.keys(options).every((key) => ["fetchImpl", "signal", "sleep", "timeoutMs", "now"].includes(key)), "options");
  const { fetchImpl = fetch, signal, sleep = (ms, opts) => delay(ms, undefined, opts), timeoutMs = 30_000, now = () => new Date() } = options;
  requireValue([fetchImpl, sleep, now].every((v) => typeof v === "function") && Number.isInteger(timeoutMs) && timeoutMs >= 1 && timeoutMs <= 60_000, "transport options");
  signal?.throwIfAborted(); const startedAt = now().toISOString();
  const before = preflightComplete(await preflightTnChildcare({ fetchImpl, signal, sleep, timeoutMs, now })), observations = [];
  let transferredBytes = 0;
  async function observe(kind, url) {
    requireValue(Buffer.byteLength(url) <= 2000, "URL ceiling"); await sleep(1000, { signal });
    for (let attempt = 0; attempt < 3; attempt++) {
      signal?.throwIfAborted(); const timeout = new AbortController(), timer = setTimeout(() => timeout.abort(new DOMException("Request timed out.", "TimeoutError")), timeoutMs);
      const requestSignal = signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal; let response, wait = (attempt + 1) * 1000;
      try {
        response = await fetchImpl(url, { redirect: "manual", signal: requestSignal }); requestSignal.throwIfAborted();
        requireValue(!response.redirected && !(response.status >= 300 && response.status < 400), "redirect");
        if (!response.ok) { const retryable = response.status === 429 || response.status >= 500;
          if (retryable) wait = publisherRetryDelay(response.headers.get("retry-after"), { fallbackMs: wait, maximumWaitMs: 60_000, now });
          throw Object.assign(new Error("HTTP failure"), { retryable }); }
        let responseBytes = 0;
        requireValue(response.body && !(Number(response.headers.get("content-length")) > 8_000_000), "response body or declared byte ceiling");
        const counting = new TransformStream({ transform(chunk, controller) {
          responseBytes += chunk.byteLength; transferredBytes += chunk.byteLength;
          requireValue(transferredBytes <= 100_000_000, "cumulative query transfer byte ceiling"); controller.enqueue(chunk);
        } });
        const payload = await boundedJson(new Response(response.body.pipeThrough(counting), { headers: response.headers }), { signal: requestSignal, maximumBytes: 8_000_000 });
        requireValue(payload && typeof payload === "object" && !Array.isArray(payload) && !payload.error, "response payload");
        return { kind, url, observed_at: now().toISOString(), payload, payload_sha256: hash(payload), response_bytes: responseBytes };
      } catch (error) {
        if (response?.body && !response.body.locked) void response.body.cancel().catch(() => {});
        signal?.throwIfAborted(); if (error.code === "SOURCE_RETRY_DEFERRED") throw error;
        if (attempt === 2 || !(error.retryable || ["TimeoutError", "TypeError"].includes(error.name))) throw new Error(`Tennessee childcare ${kind} request rejected (${error.name}).`);
      } finally { clearTimeout(timer); }
      await sleep(wait, { signal });
    }
  }
  const initial = await observe("inventory", inventoryUrl()), ids = inventory(initial.payload, before.source.record_count); observations.push(initial);
  let selectedBytes = 0;
  for (const batch of packs(ids)) {
    const observation = await observe("features", featureUrl(batch)); batchFeatures(observation.payload, batch);
    selectedBytes += Buffer.byteLength(JSON.stringify(observation.payload)); requireValue(selectedBytes <= 100_000_000, "cumulative selected JSON ceiling");
    observations.push(observation);
  }
  const final = await observe("inventory", inventoryUrl()); requireValue(isDeepStrictEqual(ids, inventory(final.payload, ids.length)), "ID roster changed"); observations.push(final);
  await sleep(1000, { signal }); signal?.throwIfAborted();
  const after = preflightComplete(await preflightTnChildcare({ fetchImpl, signal, sleep, timeoutMs, now }));
  return replayTnChildcareAcquisition({ schema_version: 1, transformation_version: TN_CHILDCARE_ACQUISITION_VERSION,
    started_at: startedAt, observed_at: now().toISOString(), preflight_before: before, preflight_after: after, observations }, { signal });
}
