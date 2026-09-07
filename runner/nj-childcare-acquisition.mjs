import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { NJ_CHILDCARE_LAYER, NJ_CHILDCARE_ITEM, NJ_CHILDCARE_ITEM_URL, NJ_CHILDCARE_SCHEMA,
  inspectNjChildcareMetadata, inspectNjChildcareItem, inspectNjChildcareCount, inspectNjChildcareDates } from "./nj-childcare-preflight.mjs";
import { fetchNjChildcareMetadata } from "./nj-childcare-metadata.mjs";
import { boundedJson, publisherRetryDelay } from "./source-http-guards.mjs";

export const NJ_CHILDCARE_BATCH_SIZE = 100;
export const NJ_CHILDCARE_MAX_URL_BYTES = 2000;
const MAX_SELECTED_BYTES = 100_000_000;
const FIELDS = NJ_CHILDCARE_SCHEMA.map(([name]) => name);
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const sorted = (value) => [...value].sort();
const keysEqual = (value, names) => value && typeof value === "object" && !Array.isArray(value)
  && JSON.stringify(sorted(Object.keys(value))) === JSON.stringify(sorted(names));
const crsValid = (value) => value?.wkid === 4326 && (value.latestWkid === undefined || value.latestWkid === 4326)
  && Object.keys(value).every((key) => ["wkid", "latestWkid"].includes(key));
function featureUrl(ids) {
  return `${NJ_CHILDCARE_LAYER}/query?${new URLSearchParams({ f: "json", where: "1=1", objectIds: ids.join(","),
    outFields: FIELDS.join(","), returnGeometry: "true", outSR: "4326", orderByFields: "OBJECTID ASC" })}`;
}
function inventory(payload, count) {
  if (!payload || Object.keys(payload).some((key) => !["objectIdFieldName", "objectIds", "exceededTransferLimit"].includes(key))
    || payload.objectIdFieldName !== "OBJECTID" || payload.exceededTransferLimit === true
    || !Array.isArray(payload.objectIds) || payload.objectIds.length !== count
    || payload.objectIds.some((id) => !Number.isSafeInteger(id) || id < 1)
    || new Set(payload.objectIds).size !== count) throw new Error("New Jersey childcare ID inventory is inconsistent.");
  return [...payload.objectIds].sort((a, b) => a - b);
}
function validateBatch(payload, ids, downloadDate) {
  if (!payload || Object.keys(payload).some((key) => !["displayFieldName", "fieldAliases", "geometryType", "spatialReference", "fields", "features", "exceededTransferLimit", "objectIdFieldName"].includes(key))
    || !crsValid(payload.spatialReference) || payload.exceededTransferLimit === true
    || (payload.geometryType !== undefined && payload.geometryType !== "esriGeometryPoint")
    || (payload.objectIdFieldName !== undefined && payload.objectIdFieldName !== "OBJECTID")
    || !Array.isArray(payload.features) || payload.features.length !== ids.length) throw new Error("New Jersey childcare feature batch is truncated or has invalid CRS.");
  if (payload.fieldAliases !== undefined && !keysEqual(payload.fieldAliases, FIELDS)) throw new Error("New Jersey childcare selected field aliases changed.");
  if (payload.fields !== undefined && (!Array.isArray(payload.fields) || payload.fields.length !== FIELDS.length
    || new Set(payload.fields.map((field) => field.name)).size !== FIELDS.length
    || NJ_CHILDCARE_SCHEMA.some(([name, type, length]) => {
      const field = payload.fields.find((entry) => entry.name === name);
      return field?.type !== type || (length !== undefined && field.length !== length);
    }))) throw new Error("New Jersey childcare selected response schema changed.");
  const selected = new Map(), requested = new Set(ids);
  for (const feature of payload.features) {
    const attrs = feature?.attributes, id = attrs?.OBJECTID;
    if (!feature || typeof feature !== "object" || Array.isArray(feature)
      || Object.keys(feature).some((key) => !["attributes", "geometry"].includes(key))
      || !keysEqual(attrs, FIELDS) || Object.values(attrs).some((value) => value !== null && typeof value === "object")
      || !requested.has(id) || selected.has(id)) throw new Error("New Jersey childcare feature IDs or private/selected fields are inconsistent.");
    if (attrs.download_date !== downloadDate) throw new Error("New Jersey childcare feature download date differs from aggregate evidence.");
    const geometry = feature.geometry;
    if (geometry !== undefined && geometry !== null && (typeof geometry !== "object" || Array.isArray(geometry)
      || Object.keys(geometry).some((key) => !["x", "y", "spatialReference"].includes(key))
      || (geometry.spatialReference !== undefined && !crsValid(geometry.spatialReference)))) {
      throw new Error("New Jersey childcare feature geometry fields or CRS changed.");
    }
    // Preserve missing/null point values for source-specific normalization/quarantine.
    selected.set(id, { attributes: Object.fromEntries(FIELDS.map((name) => [name, attrs[name]])), geometry: geometry ?? null });
  }
  return ids.map((id) => selected.get(id));
}

// Fixed NJDEP source and selected scope. This stage returns evidence in memory;
// the release builder owns durable artifacts, cancellation cleanup and publication.
export async function acquireNjChildcare(options = {}) {
  const allowed = ["fetchImpl", "signal", "sleep", "timeoutMs", "now"];
  if (!options || typeof options !== "object" || Array.isArray(options) || Object.keys(options).some((key) => !allowed.includes(key))) throw new Error("Unsupported New Jersey childcare acquisition options.");
  const { fetchImpl = fetch, signal, sleep = (ms, opts) => delay(ms, undefined, opts), timeoutMs = 30_000, now = () => new Date() } = options;
  if (![fetchImpl, sleep, now].every((value) => typeof value === "function")
    || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw new Error("Invalid New Jersey childcare acquisition options.");
  signal?.throwIfAborted();
  const startedAt = now().toISOString(), observations = [];
  let selectedBytes = 0;
  async function pace() {
    if (observations.length) await sleep(1000, { signal });
    signal?.throwIfAborted();
  }
  async function observe(kind, url) {
    await pace();
    if (Buffer.byteLength(url) > NJ_CHILDCARE_MAX_URL_BYTES) throw new Error("New Jersey childcare request exceeds URL byte ceiling.");
    for (let attempt = 0; attempt < 3; attempt++) {
      signal?.throwIfAborted();
      const deadline = new AbortController(), timer = setTimeout(() => deadline.abort(new DOMException("Source request deadline exceeded.", "TimeoutError")), timeoutMs);
      const requestSignal = signal ? AbortSignal.any([signal, deadline.signal]) : deadline.signal;
      let response, wait = 1000 * (attempt + 1);
      try {
        response = await fetchImpl(url, { redirect: "manual", signal: requestSignal });
        if (response.redirected) throw new Error("Redirect rejected.");
        if (!response.ok) {
          const retryable = response.status === 429 || response.status >= 500;
          if (retryable) wait = publisherRetryDelay(response.headers.get("retry-after"), { fallbackMs: wait, now, maximumWaitMs: 60_000 });
          throw Object.assign(new Error("Source HTTP failure."), { retryable });
        }
        const payload = await boundedJson(response, { signal: requestSignal, maximumBytes: 8_000_000 });
        if (!payload || typeof payload !== "object" || Array.isArray(payload) || payload.error) throw new Error("Invalid source payload.");
        const serialized = JSON.stringify(payload);
        if (kind === "features") {
          selectedBytes += Buffer.byteLength(serialized);
          if (selectedBytes > MAX_SELECTED_BYTES) throw new Error("Selected response cumulative byte ceiling exceeded.");
        }
        observations.push({ kind, observed_at: now().toISOString(), payload_sha256: createHash("sha256").update(serialized).digest("hex"), payload });
        return payload;
      } catch (error) {
        if (response?.body && !response.body.locked) void response.body.cancel().catch(() => {});
        signal?.throwIfAborted();
        if (error.code === "SOURCE_RETRY_DEFERRED") throw error;
        if (attempt === 2 || !(error.retryable || error.name === "TypeError" || error.name === "TimeoutError")) throw new Error(`New Jersey childcare acquisition request failed during ${kind}: HTTP, network, deadline, format or byte ceiling check failed.`);
      } finally { clearTimeout(timer); }
      await sleep(wait, { signal });
    }
  }
  async function observeXml() {
    await pace();
    const result = await fetchNjChildcareMetadata({ fetchImpl, signal, sleep, timeoutMs, now });
    const descriptor = { ...result }; delete descriptor.raw;
    observations.push({ kind: "xml", observed_at: result.observed_at, payload_sha256: result.sha256, payload: descriptor });
    return result;
  }
  const query = (parameters) => `${NJ_CHILDCARE_LAYER}/query?${new URLSearchParams({ f: "json", where: "1=1", returnGeometry: "false", ...parameters })}`;
  const metadata = async () => inspectNjChildcareMetadata(await observe("metadata", `${NJ_CHILDCARE_LAYER}?f=json`));
  const item = async () => inspectNjChildcareItem(await observe("item", `${NJ_CHILDCARE_ITEM_URL}?f=json`));
  const count = async () => inspectNjChildcareCount(await observe("count", query({ returnCountOnly: "true" })));
  const dates = async (expected) => inspectNjChildcareDates(await observe("dates", query({ outStatistics: JSON.stringify(["min", "max", "count"].map((statisticType) => ({
    statisticType, onStatisticField: "download_date", outStatisticFieldName: `download_date_${statisticType}`,
  }))) })), expected);
  const idsFor = async (expected) => inventory(await observe("inventory", query({ returnIdsOnly: "true" })), expected);
  const before = await metadata(), itemBefore = await item(), xmlBefore = await observeXml();
  const countBefore = await count(), datesBefore = await dates(countBefore), ids = await idsFor(countBefore), features = [];
  for (let offset = 0; offset < ids.length;) {
    signal?.throwIfAborted();
    const batch = [];
    while (offset + batch.length < ids.length && batch.length < Math.min(NJ_CHILDCARE_BATCH_SIZE, before.max_record_count)) {
      const next = ids[offset + batch.length];
      if (Buffer.byteLength(featureUrl([...batch, next])) > NJ_CHILDCARE_MAX_URL_BYTES) break;
      batch.push(next);
    }
    if (!batch.length) throw new Error("New Jersey childcare single ID request exceeds URL byte ceiling.");
    const payload = await observe("features", featureUrl(batch));
    features.push(...validateBatch(payload, batch, datesBefore.download_date_epoch_ms));
    offset += batch.length;
  }
  const idsAfter = await idsFor(countBefore), datesAfter = await dates(countBefore), countAfter = await count();
  const xmlAfter = await observeXml(), itemAfter = await item(), after = await metadata();
  if (hash(before) !== hash(after) || hash(itemBefore) !== hash(itemAfter) || hash(datesBefore) !== hash(datesAfter)
    || hash(ids) !== hash(idsAfter) || countBefore !== countAfter || xmlBefore.sha256 !== xmlAfter.sha256
    || hash(observations[0].payload) !== hash(observations.at(-1).payload)) throw new Error("New Jersey childcare source changed during acquisition.");
  signal?.throwIfAborted();
  const observedAt = now().toISOString();
  let previous = startedAt;
  for (const observation of observations) {
    if (observation.observed_at < previous || observation.observed_at > observedAt) throw new Error("New Jersey childcare observation clock changed.");
    previous = observation.observed_at;
  }
  return { features, source: { layer_url: NJ_CHILDCARE_LAYER, item_id: NJ_CHILDCARE_ITEM, item_url: NJ_CHILDCARE_ITEM_URL,
    ...after, ...itemAfter, ...datesAfter, output_wkid: 4326, record_count: countAfter,
    object_ids_sha256: hash(ids), selected_fields: [...FIELDS], started_at: startedAt, observed_at: observedAt,
    selected_json_bytes: selectedBytes, observations, consistency: "metadata-xml-count-date-id-inventory-stable-not-transactional-snapshot" },
  publisher_metadata: { before: xmlBefore, after: xmlAfter } };
}
