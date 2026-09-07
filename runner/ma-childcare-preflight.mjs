import { createHash, randomUUID } from "node:crypto";
import { mkdir, realpath, open, rename, rm } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { APP_ROOT, assertInsideApp } from "./paths.mjs";
import { boundedJson, publisherRetryDelay } from "./source-http-guards.mjs";

export const MA_CHILDCARE_LAYER = "https://services1.arcgis.com/hGdibHYSPO59RG1h/arcgis/rest/services/Licensed_Child_Care_Programs/FeatureServer/0";
export const MA_CHILDCARE_ITEM = "c8c5aacce28e48339f17894447c73038";
export const MA_CHILDCARE_SCHEMA = Object.freeze([
  ["OBJECTID", "esriFieldTypeOID"], ["PROV_NUM", "esriFieldTypeString", 50],
  ["PROG_NAME", "esriFieldTypeString", 255], ["ADDRESS", "esriFieldTypeString", 255],
  ["CITY", "esriFieldTypeString", 255], ["ZIPCODE", "esriFieldTypeString", 50],
  ["LICENSED_STATUS", "esriFieldTypeString", 50], ["PROG_TYPE", "esriFieldTypeString", 50],
  ["CAPACITY", "esriFieldTypeDouble"], ["PROG_UM", "esriFieldTypeString", 255],
  ["LICENSED_FUNDED", "esriFieldTypeString", 50], ["MAD_ID", "esriFieldTypeString", 50],
].map((field) => Object.freeze(field)));
const digest = (value) => createHash("sha256").update(value).digest("hex");
const hashJson = (value) => digest(JSON.stringify(value));

export function inspectMaChildcareMetadata(value) {
  if (value?.id !== 0 || value.name !== "Licensed Child Care Programs" || value.type !== "Feature Layer"
    || value.serviceItemId !== MA_CHILDCARE_ITEM || value.objectIdField !== "OBJECTID"
    || value.geometryType !== "esriGeometryPoint" || value.extent?.spatialReference?.wkid !== 26986
    || value.spatialReference?.wkid !== 26986) {
    throw new Error("Massachusetts childcare layer identity or coordinate reference changed.");
  }
  if (!String(value.capabilities).split(",").map((item) => item.trim()).includes("Query")
    || value.advancedQueryCapabilities?.supportsPagination !== true
    || value.advancedQueryCapabilities?.supportsOrderBy !== true
    || !Number.isSafeInteger(value.maxRecordCount) || value.maxRecordCount < 1) {
    throw new Error("Massachusetts childcare query capabilities are insufficient.");
  }
  if (!Array.isArray(value.fields)) throw new Error("Massachusetts childcare schema is missing.");
  const fields = new Map();
  for (const field of value.fields) {
    if (typeof field?.name !== "string" || fields.has(field.name)) throw new Error("Massachusetts childcare schema has invalid or duplicate names.");
    fields.set(field.name, field);
  }
  const schema = MA_CHILDCARE_SCHEMA.map(([name, type, length]) => {
    const field = fields.get(name);
    if (field?.type !== type || (length !== undefined && field.length !== length)
      || (name === "OBJECTID" && field.nullable !== false)) {
      throw new Error(`Massachusetts childcare required field changed: ${name}.`);
    }
    return { name, type, length: length ?? null, nullable: field.nullable ?? null, domain: field.domain ?? null };
  });
  const editing = {};
  for (const key of ["lastEditDate", "schemaLastEditDate", "dataLastEditDate"]) {
    const timestamp = value.editingInfo?.[key];
    if (!Number.isSafeInteger(timestamp) || timestamp <= 0 || !Number.isFinite(new Date(timestamp).getTime())) {
      throw new Error("Massachusetts childcare edit metadata is missing or invalid.");
    }
    editing[key] = timestamp;
  }
  return { schema_sha256: hashJson(schema), editing, max_record_count: value.maxRecordCount, native_wkid: 26986 };
}

// No caller-supplied URLs, SQL, credentials or row-query options are accepted.
async function request(kind, { fetchImpl, signal, sleep, timeoutMs, now }) {
  const url = kind === "metadata" ? `${MA_CHILDCARE_LAYER}?f=json`
    : `${MA_CHILDCARE_LAYER}/query?where=1%3D1&returnCountOnly=true&f=json`;
  for (let attempt = 0; attempt < 3; attempt++) {
    signal?.throwIfAborted();
    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(new DOMException("Massachusetts childcare request timed out.", "TimeoutError")), timeoutMs);
    const requestSignal = signal ? AbortSignal.any([signal, deadline.signal]) : deadline.signal;
    let response, wait = 1000 * (attempt + 1);
    try {
      response = await fetchImpl(url, { redirect: "manual", signal: requestSignal });
      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        if (retryable) wait = publisherRetryDelay(response.headers.get("retry-after"), { fallbackMs: wait, now, maximumWaitMs: 60_000 });
        throw Object.assign(new Error(`Massachusetts childcare HTTP ${response.status}.`), { retryable });
      }
      const payload = await boundedJson(response, { signal: requestSignal, maximumBytes: 1_000_000 });
      if (!payload || typeof payload !== "object" || Array.isArray(payload) || payload.error) throw new Error("Massachusetts childcare returned an invalid or error payload.");
      return payload;
    } catch (error) {
      if (response?.body && !response.body.locked) void response.body.cancel().catch(() => {});
      signal?.throwIfAborted();
      if (attempt === 2 || !(error.retryable || error.name === "TypeError" || error.name === "TimeoutError")) {
        // Do not echo publisher response text, fetch URLs or error bodies into receipts/logs.
        if (error.code === "SOURCE_RETRY_DEFERRED") throw error;
        throw new Error(error.name === "TypeError" ? "Massachusetts childcare network request failed."
          : error.name === "TimeoutError" ? "Massachusetts childcare request timed out."
          : "Massachusetts childcare request rejected: HTTP, response format or byte limit check failed.");
      }
    } finally { clearTimeout(timer); }
    await sleep(wait, { signal });
  }
}

export async function preflightMaChildcare({ fetchImpl = fetch, signal,
  sleep = (milliseconds, options) => delay(milliseconds, undefined, options),
  timeoutMs = 30_000, now = () => new Date() } = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw new Error("Preflight timeout must be 1 through 60000 milliseconds.");
  signal?.throwIfAborted();
  const startedAt = now().toISOString();
  const options = { fetchImpl, signal, sleep, timeoutMs, now };
  const observations = [];
  async function observe(kind) {
    if (observations.length) await sleep(1000, { signal });
    const payload = await request(kind, options);
    observations.push({ kind, observed_at: now().toISOString(), payload_sha256: hashJson(payload) });
    if (kind === "metadata") return inspectMaChildcareMetadata(payload);
    if (!Number.isSafeInteger(payload.count) || payload.count < 1 || payload.features !== undefined || payload.objectIds !== undefined) {
      throw new Error("Massachusetts childcare count-only response is invalid or empty.");
    }
    return payload.count;
  }
  const before = await observe("metadata");
  const countBefore = await observe("count");
  const countAfter = await observe("count");
  const after = await observe("metadata");
  if (hashJson(before) !== hashJson(after) || countBefore !== countAfter) throw new Error("Massachusetts childcare source changed during preflight; do not acquire from this observation.");
  signal?.throwIfAborted();
  const source = { layer_url: MA_CHILDCARE_LAYER, item_id: MA_CHILDCARE_ITEM, ...after, record_count: countAfter };
  return {
    schema_version: 1, dataset_id: "ma-licensed-center-based-childcare", status: "metadata-preflight-passed",
    started_at: startedAt, observed_at: now().toISOString(), source,
    source_observation_sha256: hashJson(source), observations,
    acquisition: { row_data_requests: 0, row_data_acquired: false, normalized_records_produced: 0, release_pointer_published: false },
    readiness: { connector_ready: false, scheduled: false, export_authorized: false,
      next_step: "Implement and verify bounded source acquisition, policy and normalization before app enrollment." },
    caveats: ["Metadata stability is not transactional snapshot isolation or a freshness guarantee.",
      "Publisher edit timestamps are not business observation dates or proof of current operation.",
      "Source row count is not a count of unique active businesses or a completeness denominator."],
  };
}

// CLI uses fixed receipt storage; alternate internal/test paths must stay in datahub.
export async function writeMaChildcarePreflight(receipt, { signal,
  outputRoot = path.join(APP_ROOT, "data", "business-sources", "ma-licensed-center-based-childcare", "preflights") } = {}) {
  if (receipt?.status !== "metadata-preflight-passed" || receipt.dataset_id !== "ma-licensed-center-based-childcare"
    || receipt.source_observation_sha256 !== hashJson(receipt.source)
    || receipt.schema_version !== 1 || receipt.source?.layer_url !== MA_CHILDCARE_LAYER || receipt.source?.item_id !== MA_CHILDCARE_ITEM
    || receipt.acquisition?.row_data_requests !== 0 || receipt.acquisition?.row_data_acquired !== false
    || receipt.acquisition?.normalized_records_produced !== 0 || receipt.acquisition?.release_pointer_published !== false
    || receipt.readiness?.connector_ready !== false || receipt.readiness?.scheduled !== false || receipt.readiness?.export_authorized !== false) {
    throw new Error("A valid Massachusetts childcare preflight receipt is required.");
  }
  signal?.throwIfAborted();
  let root = assertInsideApp(APP_ROOT);
  const destinationRoot = assertInsideApp(outputRoot);
  if (await realpath(root) !== root) throw new Error("Preflight application root is redirected.");
  for (const segment of path.relative(root, destinationRoot).split(path.sep).filter(Boolean)) {
    root = path.join(root, segment);
    try { await mkdir(root); } catch (error) { if (error.code !== "EEXIST") throw error; }
    if (await realpath(root) !== root) throw new Error("Preflight receipt storage is redirected.");
  }
  const id = randomUUID();
  const temporary = path.join(root, `${id}.tmp`), destination = path.join(root, `${id}.json`);
  const bytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`);
  let owned = false;
  try {
    const handle = await open(temporary, "wx");
    owned = true;
    try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
    signal?.throwIfAborted();
    await rename(temporary, destination);
  } catch (error) { if (owned) await rm(temporary, { force: true }); throw error; }
  return { path: destination, sha256: digest(bytes), bytes: bytes.length };
}
