import { createHash, randomUUID } from "node:crypto";
import { mkdir, realpath, open, link, unlink, lstat } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { APP_ROOT, assertInsideApp } from "./paths.mjs";
import { boundedJson, publisherRetryDelay } from "./source-http-guards.mjs";

export const TN_CHILDCARE_LAYER = "https://services1.arcgis.com/YuVBSS7Y1of2Qud1/ArcGIS/rest/services/Active_ChildCare_Locations/FeatureServer/0";
export const TN_CHILDCARE_ITEM = "bfe29552601b4d8793b1fba580c2e3fd";
export const TN_CHILDCARE_ORG = "YuVBSS7Y1of2Qud1";
export const TN_CHILDCARE_PREFLIGHT_VERSION = "tn-childcare-preflight@1.0.0";
export const TN_CHILDCARE_ITEM_URL = `https://www.arcgis.com/sharing/rest/content/items/${TN_CHILDCARE_ITEM}`;
export const TN_CHILDCARE_XML_URL = `${TN_CHILDCARE_ITEM_URL}/info/metadata/metadata.xml`;
export const TN_CHILDCARE_WHERE = "Provider_Status = 'Active' AND Provider_Type = 'Child Care' AND Child_Care_Type = 'Child Care Center'";
export const TN_CHILDCARE_SCHEMA = Object.freeze([
  ["OBJECTID", "esriFieldTypeOID", null, false], ["Provider_ID", "esriFieldTypeInteger", null, true],
  ...["Provider_Status", "Provider_Type", "Child_Care_Type", "Provider_Name", "Street_Address", "Street_Address_2", "City", "State", "Zip", "County"].map((name) => [name, "esriFieldTypeString", 8000, true]),
].map(Object.freeze));
export const TN_CHILDCARE_TERMS_TEXT = 'The State of Tennessee makes no representation or warranty as to the accuracy of this data and the information contained within nor to its fitness for a particular purpose or use. The user accepts this data on an "AS IS" basis and assumes all responsibilities for the use thereof. The user will assume the entire risk and agrees to hold the State of Tennessee and its staff harmless of any liability resulting from any direct, indirect, incidental, special, consequential, or other damages, including loss of profit, arising out of the use of this data. The user is responsible for independent verification of all information contained in this data.';
const kinds = ["metadata", "item", "organization", "xml", "count", "count", "xml", "organization", "item", "metadata"];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const hashJson = (value) => hash(JSON.stringify(value));
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join("|") === [...keys].sort().join("|");
const epoch = (value) => Number.isSafeInteger(value) && value > 0 && Number.isFinite(new Date(value).getTime());
function requireValue(ok, label) { if (!ok) throw new Error(`Tennessee childcare preflight rejected: ${label}.`); }
function optionsOnly(options, keys) { requireValue(options && typeof options === "object" && !Array.isArray(options) && Object.keys(options).every((key) => keys.includes(key)), "unsupported options"); }
function noRows(value) { requireValue(!["features", "objectIds", "records"].some((key) => Object.hasOwn(value, key)), "unexpected row payload"); }
function inspect(kind, value) {
  requireValue(value && typeof value === "object" && !Array.isArray(value) && !value.error, "invalid metadata payload");
  noRows(value);
  if (kind === "count") { requireValue(exact(value, ["count"]) && Number.isSafeInteger(value.count) && value.count >= 1 && value.count <= 20_000, "count ceiling or format"); return value; }
  if (kind === "metadata") {
    const sr = (v) => exact(v, ["wkid", "latestWkid"]) && v.wkid === 4326 && v.latestWkid === 4326;
    requireValue(value.id === 0 && value.name === "Active_ChildCare_Master" && value.type === "Feature Layer" && value.serviceItemId === TN_CHILDCARE_ITEM
      && value.objectIdField === "OBJECTID" && value.displayField === "Provider_Name" && value.geometryType === "esriGeometryPoint"
      && sr(value.spatialReference) && sr(value.extent?.spatialReference), "layer identity or CRS drift");
    requireValue(value.capabilities === "Query,Extract" && value.maxRecordCount === 2000 && value.hasMetadata === true && value.hasAttachments === false
      && ["supportsPagination", "supportsOrderBy", "supportsStatistics"].every((key) => value.advancedQueryCapabilities?.[key] === true), "capability drift");
    requireValue(exact(value.editingInfo, ["lastEditDate", "schemaLastEditDate", "dataLastEditDate"]) && Object.values(value.editingInfo).every(epoch), "editing timestamps");
    requireValue(Array.isArray(value.fields) && value.fields.length === TN_CHILDCARE_SCHEMA.length, "selected schema roster drift");
    const names = new Set();
    for (const field of value.fields) {
      const pinned = TN_CHILDCARE_SCHEMA.find(([name]) => name === field.name);
      requireValue(pinned && !names.has(field.name) && field.type === pinned[1] && (pinned[2] === null || field.length === pinned[2])
        && field.nullable === pinned[3] && field.domain === null, "selected schema drift"); names.add(field.name);
    }
    return value;
  }
  if (kind === "organization") {
    requireValue(value.id === TN_CHILDCARE_ORG && value.name === "State of Tennessee STS GIS" && value.urlKey === "tnmap", "organization identity drift");
    return { id: value.id, name: value.name, urlKey: value.urlKey, description: value.description ?? null };
  }
  requireValue(value.id === TN_CHILDCARE_ITEM && value.owner === "kwinchester_sts" && value.orgId === TN_CHILDCARE_ORG && value.access === "public"
    && value.type === "Feature Service" && value.title === "Active Statewide Childcare Locations"
    && [TN_CHILDCARE_LAYER.slice(0, -2), TN_CHILDCARE_LAYER.slice(0, -2).replace("/ArcGIS/", "/arcgis/")].includes(value.url)
    && value.accessInformation === "TN Department of Human Services" && epoch(value.created) && epoch(value.modified), "item identity or timestamp drift");
  requireValue(typeof value.licenseInfo === "string" && value.licenseInfo.length <= 50_000, "missing distribution terms");
  const terms = value.licenseInfo.replace(/<[^>]*>/g, "").replace(/\\u201[cd]|[“”]/g, '"').replace(/\s+/g, " ").trim();
  requireValue(terms === TN_CHILDCARE_TERMS_TEXT, "distribution terms drift");
  return Object.fromEntries(["id", "owner", "orgId", "access", "type", "title", "url", "created", "modified", "licenseInfo", "snippet", "description", "accessInformation"].map((key) => [key, value[key] ?? null]));
}
function validateXml(payload) {
  if (exact(payload, ["status"]) && [404, 410].includes(payload.status)) return payload;
  requireValue(exact(payload, ["status", "base64", "sha256", "bytes", "content_type"]) && payload.status === 200
    && ["application/xml", "text/xml"].includes(payload.content_type) && typeof payload.base64 === "string" && payload.base64.length <= 1_333_336, "XML evidence shape");
  const raw = Buffer.from(payload.base64, "base64");
  requireValue(raw.length <= 1_000_000 && raw.length === payload.bytes && raw.toString("base64") === payload.base64 && hash(raw) === payload.sha256, "XML byte evidence");
  let text; try { text = new TextDecoder("utf-8", { fatal: true }).decode(raw); } catch { throw new Error("Invalid Tennessee XML UTF-8."); }
  requireValue(!/<!\s*(DOCTYPE|ENTITY)\b|<\s*\/?\s*html\b/i.test(text) && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(text)
    && !/&(?!(?:amp|lt|gt|apos|quot);|#(?:[0-9]+|x[0-9a-fA-F]+);)/u.test(text), "unsafe XML envelope");
  const envelope = text.trim().replace(/^<\?xml\s+[^?]*\?>\s*/u, "");
  requireValue(/^<metadata(?:\s[^<>]*|)>/u.test(envelope) && /<\/metadata>\s*$/u.test(envelope)
    && /Active_ChildCare|Active Statewide Childcare/i.test(text), "XML envelope or dataset marker drift");
  return payload;
}
async function xmlBytes(response, signal) {
  const media = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  requireValue(["application/xml", "text/xml"].includes(media) && !(Number(response.headers.get("content-length")) > 1_000_000) && response.body, "XML content type or byte limit");
  const reader = response.body.getReader(), chunks = []; let bytes = 0;
  const abort = () => { void reader.cancel().catch(() => {}); }; signal.addEventListener("abort", abort, { once: true });
  try {
    for (;;) { signal.throwIfAborted(); const next = await reader.read(); signal.throwIfAborted(); if (next.done) break;
      bytes += next.value.byteLength; requireValue(bytes <= 1_000_000, "XML byte limit"); chunks.push(next.value); }
    const raw = Buffer.concat(chunks, bytes);
    return validateXml({ status: 200, base64: raw.toString("base64"), sha256: hash(raw), bytes, content_type: media });
  } finally { signal.removeEventListener("abort", abort); void reader.cancel().catch(() => {}); reader.releaseLock(); }
}
function urlFor(kind) {
  if (kind === "metadata") return `${TN_CHILDCARE_LAYER}?f=json`;
  if (kind === "item") return `${TN_CHILDCARE_ITEM_URL}?f=json`;
  if (kind === "organization") return `https://www.arcgis.com/sharing/rest/portals/${TN_CHILDCARE_ORG}?f=json`;
  if (kind === "xml") return TN_CHILDCARE_XML_URL;
  return `${TN_CHILDCARE_LAYER}/query?${new URLSearchParams({ f: "json", where: TN_CHILDCARE_WHERE, returnCountOnly: "true", returnGeometry: "false" })}`;
}
async function request(kind, { fetchImpl, signal, sleep, now, timeoutMs }) {
  for (let attempt = 0; attempt < 3; attempt++) {
    signal?.throwIfAborted(); const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(new DOMException("Request timed out.", "TimeoutError")), timeoutMs);
    const requestSignal = signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal;
    let response, wait = 1000 * (attempt + 1);
    try {
      response = await fetchImpl(urlFor(kind), { redirect: "manual", signal: requestSignal }); requestSignal.throwIfAborted();
      requireValue(!response.redirected && !(response.status >= 300 && response.status < 400), "redirect");
      if (kind === "xml" && [404, 410].includes(response.status)) { void response.body?.cancel().catch(() => {}); return { status: response.status }; }
      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        if (retryable) wait = publisherRetryDelay(response.headers.get("retry-after"), { fallbackMs: wait, now, maximumWaitMs: 60_000 });
        throw Object.assign(new Error("HTTP failure."), { retryable });
      }
      const payload = kind === "xml" ? await xmlBytes(response, requestSignal) : await boundedJson(response, { signal: requestSignal, maximumBytes: 1_000_000 });
      if (kind !== "xml") inspect(kind, payload); return payload;
    } catch (error) {
      if (response?.body && !response.body.locked) void response.body.cancel().catch(() => {});
      signal?.throwIfAborted(); if (error.code === "SOURCE_RETRY_DEFERRED") throw error;
      if (attempt === 2 || !(error.retryable || ["TimeoutError", "TypeError"].includes(error.name))) throw new Error(`Tennessee childcare ${kind} request rejected (${error.name}).`);
    } finally { clearTimeout(timer); }
    await sleep(wait, { signal });
  }
}
function assemble(observations, startedAt, observedAt) {
  requireValue(Array.isArray(observations) && observations.length === kinds.length, "observation roster");
  let prior = Date.parse(startedAt); requireValue(Number.isFinite(prior) && new Date(prior).toISOString() === startedAt, "start clock");
  const fingerprints = [];
  for (const [index, observation] of observations.entries()) {
    const clock = Date.parse(observation.observed_at);
    requireValue(exact(observation, ["kind", "url", "observed_at", "payload", "payload_sha256"]) && observation.kind === kinds[index]
      && observation.url === urlFor(observation.kind) && Number.isFinite(clock) && clock >= prior && new Date(clock).toISOString() === observation.observed_at
      && observation.payload_sha256 === hashJson(observation.payload), "observation evidence");
    fingerprints.push(hashJson(observation.kind === "xml" ? validateXml(observation.payload) : inspect(observation.kind, observation.payload))); prior = clock;
  }
  requireValue(Number.isFinite(Date.parse(observedAt)) && Date.parse(observedAt) >= prior && new Date(observedAt).toISOString() === observedAt, "end clock");
  requireValue(fingerprints.slice(0, 5).every((value, index) => value === fingerprints[9 - index]), "source changed during preflight");
  const layer = observations[0].payload, item = observations[1].payload, xml = observations[3].payload;
  return { schema_version: 1, transformation_version: TN_CHILDCARE_PREFLIGHT_VERSION, dataset_id: "tn-dhs-active-childcare-centers", status: "metadata-preflight-passed", started_at: startedAt, observed_at: observedAt,
    source: { layer_url: TN_CHILDCARE_LAYER, item_id: TN_CHILDCARE_ITEM, organization_id: TN_CHILDCARE_ORG, where: TN_CHILDCARE_WHERE,
      record_count: observations[4].payload.count, editing_info: layer.editingInfo, item_modified_epoch_ms: item.modified, item_modified_at: new Date(item.modified).toISOString(), native_wkid: 4326 },
    observations, acquisition: { row_data_requests: 0, row_data_acquired: false, normalized_records_produced: 0, release_pointer_published: false },
    policy: { full_json_metadata_and_terms_retained: true, metadata_xml_retained: xml.status === 200, metadata_xml_url: TN_CHILDCARE_XML_URL,
      metadata_xml_unavailable_http_status: xml.status === 200 ? null : xml.status, xml_validation: "utf8-envelope-content-and-marker-only-not-parser-wellformedness-or-schema-validation",
      acquisition_requires_complete_publisher_metadata: true, terms_presence_is_legal_approval: false, export_policy: "local-review-only" },
    readiness: { connector_ready: false, scheduled: false, export_authorized: false, next_step: "Validate complete publisher metadata and policy; implement bounded acquisition, normalization and verified immutable release before app enrollment." },
    caveats: ["Active means publisher extract status, not independently verified business operation or licensure dates.", "Centers only: family/group homes, drop-in, authorized providers and TDOE facilities excluded.", "Counts are source records, not unique businesses or a nationwide completeness denominator.", "Item/edit timestamps are separate from observation and do not establish source freshness or transactional isolation."],
  };
}
export async function preflightTnChildcare(options = {}) {
  optionsOnly(options, ["fetchImpl", "signal", "sleep", "timeoutMs", "now"]);
  const { fetchImpl = fetch, signal, sleep = (ms, opts) => delay(ms, undefined, opts), timeoutMs = 30_000, now = () => new Date() } = options;
  requireValue([fetchImpl, sleep, now].every((value) => typeof value === "function") && Number.isInteger(timeoutMs) && timeoutMs >= 1 && timeoutMs <= 60_000, "transport options");
  signal?.throwIfAborted(); const startedAt = now().toISOString(), observations = [];
  for (const kind of kinds) {
    if (observations.length) await sleep(1000, { signal }); signal?.throwIfAborted();
    const payload = await request(kind, { fetchImpl, signal, sleep, timeoutMs, now });
    observations.push({ kind, url: urlFor(kind), observed_at: now().toISOString(), payload, payload_sha256: hashJson(payload) });
  }
  signal?.throwIfAborted(); return assemble(observations, startedAt, now().toISOString());
}
export async function writeTnChildcarePreflight(receipt, options = {}) {
  optionsOnly(options, ["outputRoot", "signal"]);
  const { signal, outputRoot = path.join(APP_ROOT, "data", "business-sources", "tn-dhs-active-childcare-centers", "preflights") } = options;
  requireValue(JSON.stringify(receipt) === JSON.stringify(assemble(receipt?.observations, receipt?.started_at, receipt?.observed_at)), "receipt reconstruction");
  signal?.throwIfAborted(); const destinationRoot = assertInsideApp(outputRoot);
  requireValue(destinationRoot !== APP_ROOT && path.resolve(outputRoot) === outputRoot && await realpath(APP_ROOT) === APP_ROOT, "canonical storage root");
  let root = APP_ROOT;
  for (const segment of path.relative(APP_ROOT, destinationRoot).split(path.sep)) {
    signal?.throwIfAborted(); root = path.join(root, segment);
    try { await mkdir(root); } catch (error) { if (error.code !== "EEXIST") throw error; }
    const info = await lstat(root, { bigint: true }); requireValue(info.isDirectory() && !info.isSymbolicLink() && await realpath(root) === root, "redirected storage");
  }
  const id = randomUUID(), temporary = path.join(root, `${id}.tmp`), destination = path.join(root, `${id}.json`);
  const bytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`); let identity, published = false;
  try {
    const handle = await open(temporary, "wx");
    try { identity = await handle.stat({ bigint: true }); requireValue(identity.nlink === 1n && identity.isFile(), "temporary alias"); await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
    signal?.throwIfAborted(); requireValue(await realpath(root) === root, "redirected storage");
    const current = await lstat(temporary, { bigint: true });
    requireValue(current.isFile() && !current.isSymbolicLink() && current.nlink === 1n && current.dev === identity.dev && current.ino === identity.ino, "temporary ownership");
    // An exclusive hard-link publication exposes only fsynced complete bytes and cannot
    // overwrite an existing destination; remove our temporary name immediately after.
    signal?.throwIfAborted();
    await link(temporary, destination); published = true;
    await unlink(temporary);
    const result = await lstat(destination, { bigint: true });
    requireValue(result.nlink === 1n && result.dev === identity.dev && result.ino === identity.ino && await realpath(root) === root, "published ownership");
  } catch (error) {
    if (identity && await realpath(root).catch(() => null) === root) {
      const current = await lstat(temporary, { bigint: true }).catch(() => null);
      if (current?.isFile() && !current.isSymbolicLink() && current.dev === identity.dev && current.ino === identity.ino && current.nlink === (published ? 2n : 1n)) await unlink(temporary);
    }
    throw error;
  }
  return { path: destination, sha256: hash(bytes), bytes: bytes.length };
}
