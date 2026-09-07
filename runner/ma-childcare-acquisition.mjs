import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { MA_CHILDCARE_LAYER, MA_CHILDCARE_ITEM, MA_CHILDCARE_SCHEMA, inspectMaChildcareMetadata } from "./ma-childcare-preflight.mjs";
import { boundedJson, publisherRetryDelay } from "./source-http-guards.mjs";

const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const FIELDS = MA_CHILDCARE_SCHEMA.map(([name]) => name);
const MAX_RECORDS = 20_000;
export const MA_CHILDCARE_BATCH_SIZE = 100;
export const MA_CHILDCARE_MAX_URL_BYTES = 2000;

// Fixed publisher/layer/query scope. Runtime injection is limited to transport and clock.
export async function acquireMaChildcare(options = {}) {
  const allowed = new Set(["fetchImpl", "signal", "sleep", "timeoutMs", "now"]);
  if (!options || typeof options !== "object" || Array.isArray(options)
    || Object.keys(options).some((key) => !allowed.has(key))) throw new Error("Unsupported Massachusetts childcare acquisition option.");
  const { fetchImpl = fetch, signal, sleep = (ms, opts) => delay(ms, undefined, opts), timeoutMs = 30_000, now = () => new Date() } = options;
  if (typeof fetchImpl !== "function" || typeof sleep !== "function" || typeof now !== "function"
    || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw new Error("Invalid Massachusetts childcare acquisition options.");
  signal?.throwIfAborted();
  const startedAt = now().toISOString(), observations = [];
  async function observe(kind, parameters) {
    if (observations.length) await sleep(1000, { signal });
    const url = new URL(parameters ? `${MA_CHILDCARE_LAYER}/query` : MA_CHILDCARE_LAYER);
    url.search = new URLSearchParams({ f: "json", ...parameters }).toString();
    if (Buffer.byteLength(url.href) > MA_CHILDCARE_MAX_URL_BYTES) throw new Error(`Massachusetts childcare ${kind} request exceeds URL byte limit.`);
    for (let attempt = 0; attempt < 3; attempt++) {
      signal?.throwIfAborted();
      const deadline = new AbortController();
      const timer = setTimeout(() => deadline.abort(new DOMException("Source request deadline exceeded.", "TimeoutError")), timeoutMs);
      const requestSignal = signal ? AbortSignal.any([signal, deadline.signal]) : deadline.signal;
      let response, wait = 1000 * (attempt + 1);
      try {
        response = await fetchImpl(url.href, { redirect: "manual", signal: requestSignal });
        if (!response.ok) {
          const retryable = response.status === 429 || response.status >= 500;
          if (retryable) wait = publisherRetryDelay(response.headers.get("retry-after"), { fallbackMs: wait, now, maximumWaitMs: 60_000 });
          throw Object.assign(new Error("Source HTTP failure."), { retryable });
        }
        const payload = await boundedJson(response, { signal: requestSignal, maximumBytes: 8_000_000 });
        if (!payload || typeof payload !== "object" || Array.isArray(payload) || payload.error) throw new Error("Invalid source payload.");
        observations.push({ kind, observed_at: now().toISOString(), payload_sha256: hash(payload) });
        return payload;
      } catch (error) {
        if (response?.body && !response.body.locked) void response.body.cancel().catch(() => {});
        signal?.throwIfAborted();
        if (error.code === "SOURCE_RETRY_DEFERRED") throw error;
        if (attempt === 2 || !(error.retryable || error.name === "TypeError" || error.name === "TimeoutError")) {
          throw new Error(`Massachusetts childcare acquisition request failed during ${kind} (HTTP ${response?.status ?? "unavailable"}): deadline, network, format or byte limit may apply.`);
        }
      } finally { clearTimeout(timer); }
      await sleep(wait, { signal });
    }
  }
  async function count() {
    const payload = await observe("count", { where: "1=1", returnCountOnly: "true" });
    if (!Number.isSafeInteger(payload.count) || payload.count < 1 || payload.count > MAX_RECORDS
      || payload.features !== undefined || payload.objectIds !== undefined || payload.exceededTransferLimit === true) throw new Error("Massachusetts childcare count is invalid or exceeds resource ceiling.");
    return payload.count;
  }
  async function inventory(expected) {
    const payload = await observe("inventory", { where: "1=1", returnIdsOnly: "true" });
    const ids = payload.objectIds;
    if (payload.objectIdFieldName !== "OBJECTID" || !Array.isArray(ids) || ids.length !== expected
      || ids.some((id) => !Number.isSafeInteger(id) || id < 1) || new Set(ids).size !== ids.length
      || payload.features !== undefined || payload.exceededTransferLimit === true) throw new Error("Massachusetts childcare ID inventory is inconsistent.");
    return ids.sort((a, b) => a - b);
  }
  const before = inspectMaChildcareMetadata(await observe("metadata"));
  const countBefore = await count(), ids = await inventory(countBefore), features = [];
  const batchSize = Math.min(MA_CHILDCARE_BATCH_SIZE, before.max_record_count);
  for (let offset = 0; offset < ids.length; offset += batchSize) {
    const batch = ids.slice(offset, offset + batchSize);
    const payload = await observe("features", { where: "1=1", objectIds: batch.join(","), outFields: FIELDS.join(","),
      returnGeometry: "true", outSR: "4326", orderByFields: "OBJECTID ASC" });
    if (payload.spatialReference?.wkid !== 4326 || (payload.spatialReference.latestWkid !== undefined && payload.spatialReference.latestWkid !== 4326)
      || payload.exceededTransferLimit === true || !Array.isArray(payload.features) || payload.features.length !== batch.length) throw new Error("Massachusetts childcare feature batch is truncated or has invalid CRS.");
    const selected = new Map();
    for (const feature of payload.features) {
      const attrs = feature?.attributes, id = attrs?.OBJECTID;
      if (!batch.includes(id) || selected.has(id) || !attrs || FIELDS.some((name) => !Object.hasOwn(attrs, name))
        || Object.keys(attrs).some((name) => !FIELDS.includes(name))) throw new Error("Massachusetts childcare feature IDs or selected fields are inconsistent.");
      if (feature.geometry?.spatialReference && (feature.geometry.spatialReference.wkid !== 4326
        || (feature.geometry.spatialReference.latestWkid !== undefined && feature.geometry.spatialReference.latestWkid !== 4326))) throw new Error("Massachusetts childcare feature CRS changed.");
      // Keep source-null geometry; normalization determines valid location coordinates.
      selected.set(id, { attributes: Object.fromEntries(FIELDS.map((name) => [name, attrs[name]])), geometry: feature.geometry ?? null });
    }
    for (const id of batch) features.push(selected.get(id));
  }
  const idsAfter = await inventory(countBefore), countAfter = await count();
  const after = inspectMaChildcareMetadata(await observe("metadata"));
  if (hash(before) !== hash(after) || countBefore !== countAfter || hash(ids) !== hash(idsAfter)) throw new Error("Massachusetts childcare source changed during acquisition.");
  signal?.throwIfAborted();
  return { features, source: { layer_url: MA_CHILDCARE_LAYER, item_id: MA_CHILDCARE_ITEM, ...after,
    output_wkid: 4326, record_count: countAfter, object_ids_sha256: hash(ids), selected_fields: FIELDS.slice(),
    started_at: startedAt, observed_at: now().toISOString(), observations,
    consistency: "metadata-count-id-inventory-stable-not-transactional-snapshot" } };
}
