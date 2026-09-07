import { createHash, randomUUID } from "node:crypto";
import { mkdir, realpath, open, rename, rm, lstat } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { APP_ROOT, assertInsideApp } from "./paths.mjs";
import { boundedJson, publisherRetryDelay } from "./source-http-guards.mjs";

export const NJ_CHILDCARE_LAYER = "https://mapsdep.nj.gov/arcgis/rest/services/Features/Structures/MapServer/4";
export const NJ_CHILDCARE_ITEM = "0bc9fe070d4c49e1a6555c3fdea15b8a";
export const NJ_CHILDCARE_ITEM_URL = `https://njdep.maps.arcgis.com/sharing/rest/content/items/${NJ_CHILDCARE_ITEM}`;
export const NJ_CHILDCARE_SCHEMA = Object.freeze([
  ["OBJECTID", "OID"], ["center_id", "String", 20], ["center_name", "String", 100],
  ["address", "String", 50], ["address2", "String", 50], ["city", "String", 50],
  ["county", "String", 20], ["state", "String", 10], ["zip", "String", 20],
  ["licensed_capacity", "Integer"], ["age_range", "String", 50], ["months_operational", "String", 50],
  ["sessions", "String", 175], ["license_approval_date", "Date", 8], ["license_renewal_date", "Date", 8],
  ["foips", "String", 10], ["location_reference_desc", "String", 40], ["coord_source_type_desc", "String", 20],
  ["coord_sys_desc", "String", 40], ["coord_source_org_desc", "String", 20], ["download_date", "Date", 8],
].map(([name, type, length]) => Object.freeze([name, `esriFieldType${type}`, ...(length === undefined ? [] : [length])])));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const hashJson = (value) => hash(JSON.stringify(value));
const kinds = ["metadata", "item", "count", "dates", "dates", "count", "item", "metadata"];
const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).sort().join("|") === [...keys].sort().join("|");
const timestamp = (value) => Number.isSafeInteger(value) && value > 0 && Number.isFinite(new Date(value).getTime());
function strictOptions(options, allowed) {
  if (!options || typeof options !== "object" || Array.isArray(options) || Object.keys(options).some((key) => !allowed.includes(key))) {
    throw new Error("Unsupported New Jersey childcare options.");
  }
}
function referenceValid(reference) { return reference?.wkid === 102100 && reference.latestWkid === 3857; }

export function inspectNjChildcareMetadata(value) {
  if (value?.id !== 4 || value.name !== "Child Care Centers" || value.type !== "Feature Layer"
    || value.features !== undefined || value.objectIds !== undefined
    || value.geometryType !== "esriGeometryPoint" || !referenceValid(value.extent?.spatialReference)
    || (value.spatialReference !== undefined && !referenceValid(value.spatialReference))
    || (value.objectIdField !== undefined && value.objectIdField !== "OBJECTID")) {
    throw new Error("New Jersey childcare layer identity or coordinate reference changed.");
  }
  if (!String(value.capabilities).split(",").map((item) => item.trim()).includes("Query")
    || value.advancedQueryCapabilities?.supportsPagination !== true
    || value.advancedQueryCapabilities?.supportsOrderBy !== true
    || value.advancedQueryCapabilities?.supportsStatistics !== true
    || !Number.isSafeInteger(value.maxRecordCount) || value.maxRecordCount < 1 || value.maxRecordCount > 20_000) {
    throw new Error("New Jersey childcare query capabilities are insufficient.");
  }
  if (!Array.isArray(value.fields)) throw new Error("New Jersey childcare schema is missing.");
  const fields = new Map();
  for (const field of value.fields) {
    if (typeof field?.name !== "string" || fields.has(field.name)) throw new Error("New Jersey childcare schema contains invalid or duplicate fields.");
    fields.set(field.name, field);
  }
  if (value.fields.filter((field) => field.type === "esriFieldTypeOID").length !== 1) throw new Error("New Jersey childcare OID catalog changed.");
  const schema = NJ_CHILDCARE_SCHEMA.map(([name, type, length]) => {
    const field = fields.get(name);
    if (field?.type !== type || (length !== undefined && field.length !== length)) throw new Error(`New Jersey childcare required field changed: ${name}.`);
    return { name, type, length: length ?? null, nullable: field.nullable ?? null, domain: field.domain ?? null };
  });
  return { schema_sha256: hashJson(schema), max_record_count: value.maxRecordCount, native_wkid: 102100, native_latest_wkid: 3857 };
}
function inspectItem(value) {
  if (value?.id !== NJ_CHILDCARE_ITEM || value.owner !== "NJDEPBGIS" || value.access !== "public"
    || value.features !== undefined || value.objectIds !== undefined
    || value.type !== "Feature Service" || value.title !== "Child Care Centers of New Jersey"
    || value.url !== NJ_CHILDCARE_LAYER || !timestamp(value.modified) || !timestamp(value.created)
    || typeof value.licenseInfo !== "string" || !value.licenseInfo.trim()) throw new Error("New Jersey childcare item identity, dates or distribution terms changed.");
  return { item_metadata_sha256: hashJson(Object.fromEntries(["id", "owner", "access", "url", "type", "title", "created", "modified", "licenseInfo", "description", "snippet", "accessInformation", "tags"].map((key) => [key, value[key] ?? null]))),
    item_modified_epoch_ms: value.modified, item_modified_at: new Date(value.modified).toISOString(),
    item_created_epoch_ms: value.created, item_created_at: new Date(value.created).toISOString() };
}
function inspectCount(value) {
  if (!exactKeys(value, ["count"]) || !Number.isSafeInteger(value.count) || value.count < 1 || value.count > 20_000) {
    throw new Error("New Jersey childcare count-only response is invalid or exceeds the 20000-row ceiling.");
  }
  return value.count;
}
function inspectDates(value, count) {
  if (!value || !Array.isArray(value.features) || value.features.length !== 1
    || !exactKeys(value.features[0], ["attributes"]) || value.exceededTransferLimit === true
    || Object.keys(value).some((key) => !["features", "fields", "fieldAliases", "displayFieldName", "exceededTransferLimit"].includes(key))) {
    throw new Error("New Jersey childcare aggregate response is invalid.");
  }
  const attrs = value.features[0].attributes;
  const expectedFields = [["download_date_min", "esriFieldTypeDate", 8], ["download_date_max", "esriFieldTypeDate", 8], ["download_date_count", "esriFieldTypeInteger"]];
  if (value.fieldAliases !== undefined && (!exactKeys(value.fieldAliases, expectedFields.map(([name]) => name))
    || expectedFields.some(([name]) => value.fieldAliases[name] !== name))) throw new Error("New Jersey childcare aggregate aliases changed.");
  if (value.fields !== undefined && (!Array.isArray(value.fields) || value.fields.length !== 3
    || expectedFields.some(([name, type, length], index) => value.fields[index]?.name !== name
      || value.fields[index]?.type !== type || (length !== undefined && value.fields[index]?.length !== length)))) {
    throw new Error("New Jersey childcare aggregate schema changed.");
  }
  if (!exactKeys(attrs, ["download_date_min", "download_date_max", "download_date_count"])
    || !timestamp(attrs.download_date_min) || attrs.download_date_min !== attrs.download_date_max
    || attrs.download_date_count !== count) throw new Error("New Jersey childcare download dates are null, mixed or inconsistent with count.");
  return { download_date_epoch_ms: attrs.download_date_min, download_date_at: new Date(attrs.download_date_min).toISOString() };
}
function requestUrl(kind) {
  if (kind === "metadata") return `${NJ_CHILDCARE_LAYER}?f=json`;
  if (kind === "item") return `${NJ_CHILDCARE_ITEM_URL}?f=json`;
  const params = new URLSearchParams({ where: "1=1", f: "json", returnGeometry: "false" });
  if (kind === "count") params.set("returnCountOnly", "true");
  else params.set("outStatistics", JSON.stringify(["min", "max", "count"].map((statisticType) => ({
    statisticType, onStatisticField: "download_date", outStatisticFieldName: `download_date_${statisticType}`,
  }))));
  return `${NJ_CHILDCARE_LAYER}/query?${params}`;
}
async function request(kind, { fetchImpl, signal, sleep, timeoutMs, now }) {
  for (let attempt = 0; attempt < 3; attempt++) {
    signal?.throwIfAborted();
    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(new DOMException("Request timed out.", "TimeoutError")), timeoutMs);
    const requestSignal = signal ? AbortSignal.any([signal, deadline.signal]) : deadline.signal;
    let response, wait = 1000 * (attempt + 1);
    try {
      response = await fetchImpl(requestUrl(kind), { redirect: "manual", signal: requestSignal });
      if (response.redirected) throw new Error("Redirect rejected.");
      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        if (retryable) wait = publisherRetryDelay(response.headers.get("retry-after"), { fallbackMs: wait, now, maximumWaitMs: 60_000 });
        throw Object.assign(new Error("HTTP rejected."), { retryable });
      }
      const payload = await boundedJson(response, { signal: requestSignal, maximumBytes: 1_000_000 });
      if (!payload || typeof payload !== "object" || Array.isArray(payload) || payload.error) throw new Error("Invalid payload.");
      return payload;
    } catch (error) {
      if (response?.body && !response.body.locked) void response.body.cancel().catch(() => {});
      signal?.throwIfAborted();
      if (error.code === "SOURCE_RETRY_DEFERRED") throw error;
      if (attempt === 2 || !(error.retryable || error.name === "TypeError" || error.name === "TimeoutError")) {
        throw new Error(error.name === "TimeoutError" ? "New Jersey childcare request timed out."
          : error.name === "TypeError" ? "New Jersey childcare network request failed."
          : "New Jersey childcare request rejected: HTTP, response format or byte limit check failed.");
      }
    } finally { clearTimeout(timer); }
    await sleep(wait, { signal });
  }
}
function assemble(observations, startedAt, observedAt) {
  if (!Array.isArray(observations) || observations.length !== kinds.length) throw new Error("Invalid New Jersey observations.");
  let prior = Date.parse(startedAt);
  if (!Number.isFinite(prior) || new Date(prior).toISOString() !== startedAt) throw new Error("Invalid observation clock.");
  for (const [index, observation] of observations.entries()) {
    const clock = Date.parse(observation.observed_at);
    if (!exactKeys(observation, ["kind", "observed_at", "payload_sha256", "payload"])
      || observation.kind !== kinds[index] || !Number.isFinite(clock) || clock < prior
      || new Date(clock).toISOString() !== observation.observed_at || observation.payload_sha256 !== hashJson(observation.payload)) throw new Error("Invalid New Jersey observation evidence.");
    prior = clock;
  }
  if (!Number.isFinite(Date.parse(observedAt)) || Date.parse(observedAt) < prior || new Date(observedAt).toISOString() !== observedAt) throw new Error("Invalid observation clock.");
  const values = observations.map((observation) => observation.payload);
  const before = inspectNjChildcareMetadata(values[0]), after = inspectNjChildcareMetadata(values[7]);
  const item = inspectItem(values[1]), itemAfter = inspectItem(values[6]);
  const count = inspectCount(values[2]); inspectCount(values[5]);
  const dates = inspectDates(values[3], count); inspectDates(values[4], count);
  if (hashJson(before) !== hashJson(after) || hashJson(item) !== hashJson(itemAfter)
    || [0, 2, 3].some((index) => hashJson(values[index]) !== hashJson(values[7 - index]))) {
    throw new Error("New Jersey childcare source changed during preflight; do not acquire from this observation.");
  }
  const source = { layer_url: NJ_CHILDCARE_LAYER, item_id: NJ_CHILDCARE_ITEM, item_url: NJ_CHILDCARE_ITEM_URL,
    ...after, ...item, ...dates, record_count: count };
  return { schema_version: 1, dataset_id: "nj-licensed-childcare-centers", status: "metadata-preflight-passed",
    started_at: startedAt, observed_at: observedAt, source, source_observation_sha256: hashJson(source), observations,
    acquisition: { row_data_requests: 0, row_data_acquired: false, normalized_records_produced: 0, release_pointer_published: false },
    policy: { layer_and_item_metadata_retained: true, metadata_xml_retained: false, acquisition_requires_complete_metadata_xml: true,
      metadata_xml_url: `${NJ_CHILDCARE_ITEM_URL}/info/metadata/metadata.xml`, terms_presence_is_legal_approval: false },
    readiness: { connector_ready: false, scheduled: false, export_authorized: false,
      next_step: "Retain complete publisher XML metadata and implement verified acquisition, policy and normalization before app enrollment." },
    caveats: ["Stable metadata, counts and dates are not transactional snapshot isolation or a freshness guarantee.",
      "Publisher download and item timestamps are separate from observation time and do not prove current business operation.",
      "Licensed-center layer membership is not coverage of all childcare, a unique-business count or a national completeness denominator.",
      "Distribution terms and metadata must accompany any authorized derived publication; export approval remains separate."],
  };
}
export async function preflightNjChildcare(options = {}) {
  strictOptions(options, ["fetchImpl", "signal", "sleep", "timeoutMs", "now"]);
  const { fetchImpl = fetch, signal, sleep = (ms, opts) => delay(ms, undefined, opts), timeoutMs = 30_000, now = () => new Date() } = options;
  if (![fetchImpl, sleep, now].every((value) => typeof value === "function")) throw new Error("Preflight transport, sleep and clock must be functions.");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw new Error("Preflight timeout must be 1 through 60000 milliseconds.");
  signal?.throwIfAborted();
  const startedAt = now().toISOString(), observations = [];
  for (const kind of kinds) {
    if (observations.length) await sleep(1000, { signal });
    signal?.throwIfAborted();
    const payload = await request(kind, { fetchImpl, signal, sleep, timeoutMs, now });
    if (kind === "metadata") inspectNjChildcareMetadata(payload);
    if (kind === "item") inspectItem(payload);
    if (kind === "count") inspectCount(payload);
    if (kind === "dates") inspectDates(payload, observations.find((entry) => entry.kind === "count").payload.count);
    observations.push({ kind, observed_at: now().toISOString(), payload_sha256: hashJson(payload), payload });
  }
  signal?.throwIfAborted();
  return assemble(observations, startedAt, now().toISOString());
}

export async function writeNjChildcarePreflight(receipt, options = {}) {
  strictOptions(options, ["signal", "outputRoot"]);
  const { signal, outputRoot = path.join(APP_ROOT, "data", "business-sources", "nj-licensed-childcare-centers", "preflights") } = options;
  try {
    if (JSON.stringify(receipt) !== JSON.stringify(assemble(receipt.observations, receipt.started_at, receipt.observed_at))) throw new Error();
  } catch { throw new Error("A valid New Jersey childcare preflight receipt is required."); }
  signal?.throwIfAborted();
  const destinationRoot = assertInsideApp(outputRoot);
  if (destinationRoot === APP_ROOT || path.resolve(outputRoot) !== outputRoot) throw new Error("Preflight receipt storage must be a canonical subdirectory.");
  let root = APP_ROOT;
  if (await realpath(root) !== root) throw new Error("Preflight application root is redirected.");
  for (const segment of path.relative(root, destinationRoot).split(path.sep)) {
    signal?.throwIfAborted();
    root = path.join(root, segment);
    try { await mkdir(root); } catch (error) { if (error.code !== "EEXIST") throw error; }
    if (await realpath(root) !== root || (await lstat(root)).isSymbolicLink()) throw new Error("Preflight receipt storage is redirected.");
  }
  const id = randomUUID(), temporary = path.join(root, `${id}.tmp`), destination = path.join(root, `${id}.json`);
  const bytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`);
  let identity;
  try {
    const handle = await open(temporary, "wx");
    try { identity = await handle.stat(); await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
    signal?.throwIfAborted();
    if (await realpath(root) !== root) throw new Error("Preflight receipt storage is redirected.");
    const current = await lstat(temporary);
    if (current.isSymbolicLink() || current.dev !== identity.dev || current.ino !== identity.ino) throw new Error("Preflight temporary ownership changed; inspection required.");
    try { await lstat(destination); throw new Error("Preflight destination already exists."); } catch (error) { if (error.code !== "ENOENT") throw error; }
    await rename(temporary, destination);
  } catch (error) {
    if (identity && await realpath(root) === root) {
      const current = await lstat(temporary).catch(() => null);
      if (current && !current.isSymbolicLink() && current.dev === identity.dev && current.ino === identity.ino) await rm(temporary);
    }
    throw error;
  }
  return { path: destination, sha256: hash(bytes), bytes: bytes.length };
}
