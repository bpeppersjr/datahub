import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, link, unlink, lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { APP_ROOT, assertInsideApp } from "./paths.mjs";
import { publisherRetryDelay } from "./source-http-guards.mjs";

export const WI_LAYER = "https://dhsgis.wi.gov/server/rest/services/DHS_DCF/Child_Care/MapServer/0";
export const WI_SERVICE_ITEM = "bdec49075cd84b9d97df3fb50585b632";
export const WI_LAYER_ITEM = "0f8e25b2fe314ed88feb97ebed47bfe8";
export const WI_WHERE = "CategoryType='LICENSED GROUP'";
const portal = "https://dhsgis.wi.gov/arcgis";
const disclaimer = "https://data.dhsgis.wi.gov/pages/gis-data-disclaimer";
export const WI_FIELDS = Object.freeze(["OBJECTID", "ProvderNumber", "LocationNumber", "FacilityNumber", "FacilityName", "LocationLineAddress1", "LocationLineAddress2", "City", "State", "ZipCode", "CategoryType", "Capacity"]);
const strings = { ProvderNumber: 50, LocationNumber: 12, FacilityNumber: 25, FacilityName: 255, LocationContactFullName: 255, LocationPrimaryPhoneNumber: 100, LocationLineAddress1: 100, LocationLineAddress2: 100, City: 100, State: 10, ZipCode: 25, CategoryType: 100, Months: 100, Hours: 100, FullTime: 25, FromAge: 100, ToAge: 100, StarLevel: 25 };
const otherTypes = { OBJECTID: "OID", Latitude: "Double", Longitude: "Double", Capacity: "Integer", Shape: "Geometry" };
const sequence = ["server", "layer", "service-item", "layer-item", "count", "count", "layer-item", "service-item", "layer", "server"];
const hash = (value) => createHash("sha256").update(value).digest("hex");
const fingerprint = (value) => hash(JSON.stringify(value));
const requireValue = (value, reason) => { if (!value) throw new Error(`Wisconsin preflight rejected: ${reason}.`); };
const pick = (value, keys) => Object.fromEntries(keys.filter((key) => Object.hasOwn(value, key)).map((key) => [key, value[key]]));
function urlFor(kind) {
  if (kind === "server") return "https://dhsgis.wi.gov/server/rest/info?f=json";
  if (kind === "layer") return `${WI_LAYER}?f=json`;
  if (kind === "service-item") return `${portal}/sharing/rest/content/items/${WI_SERVICE_ITEM}?f=json`;
  if (kind === "layer-item") return `https://www.arcgis.com/sharing/rest/content/items/${WI_LAYER_ITEM}?f=json`;
  return `${WI_LAYER}/query?${new URLSearchParams({ f: "json", where: WI_WHERE, returnCountOnly: "true", returnGeometry: "false" })}`;
}
// Retain only explicit public contract fields. Never follow or persist private service
// addresses or token-generation routes advertised by otherwise public metadata.
function inspect(kind, value) {
  requireValue(value && typeof value === "object" && !Array.isArray(value) && !value.error && !value.features && !value.objectIds, "response envelope");
  if (kind === "server") {
    requireValue(value.owningSystemUrl === portal, "owning portal");
    return { owningSystemUrl: value.owningSystemUrl };
  }
  if (kind === "count") {
    requireValue(Object.keys(value).length === 1 && Number.isSafeInteger(value.count) && value.count > 0 && value.count <= 50_000, "selected count");
    return { count: value.count };
  }
  if (kind === "layer") {
    requireValue(value.id === 0 && value.name === "Child_Care_Providers" && value.type === "Feature Layer" && value.serviceItemId === WI_SERVICE_ITEM && value.geometryType === "esriGeometryPoint", "layer identity");
    requireValue(value.capabilities?.split(",").map((v) => v.trim()).includes("Query") && value.maxRecordCount === 2000 && value.hasMetadata === true, "query contract");
    const query = value.advancedQueryCapabilities;
    requireValue(query?.supportsPagination === true && query.supportsOrderBy === true && query.supportsStatistics === true, "query capabilities");
    requireValue(value.extent?.spatialReference?.wkid === 102100 && value.extent.spatialReference.latestWkid === 3857, "native CRS");
    requireValue(value.objectIdField === undefined || value.objectIdField === "OBJECTID", "OID identity");
    requireValue(Array.isArray(value.fields) && value.fields.length === 23 && new Set(value.fields.map((f) => f.name)).size === 23, "field roster");
    for (const field of value.fields) {
      requireValue(Object.hasOwn(strings, field.name) ? field.type === "esriFieldTypeString" && field.length === strings[field.name] : Object.hasOwn(otherTypes, field.name) && field.type === `esriFieldType${otherTypes[field.name]}`, "field schema");
      requireValue(field.domain === null, "field domain");
    }
    return pick(value, ["id", "name", "type", "serviceItemId", "geometryType", "capabilities", "maxRecordCount", "hasMetadata", "objectIdField", "fields", "extent", "advancedQueryCapabilities", "description", "copyrightText", "editingInfo"]);
  }
  const service = kind === "service-item";
  requireValue(value.id === (service ? WI_SERVICE_ITEM : WI_LAYER_ITEM) && value.owner === (service ? "dhsgis@ACCOUNTS" : "DHS_GIS") && value.access === "public" && value.type === (service ? "Map Service" : "Feature Service") && value.url === (service ? WI_LAYER.slice(0, -2) : WI_LAYER), "portal item identity");
  requireValue(value.accessInformation === "Wisconsin Department of Health Services" && typeof value.licenseInfo === "string" && value.licenseInfo.length > 0 && value.licenseInfo.length < 32_000, "notice and attribution");
  requireValue(service ? ["AS IS", "completeness or accuracy", "no warranty", "legal, engineering or surveying"].every((part) => value.licenseInfo.includes(part)) : value.licenseInfo.includes(disclaimer), "notice drift");
  requireValue(Number.isSafeInteger(value.modified) && value.modified > 0, "item modification clock");
  return pick(value, ["id", "owner", "orgId", "access", "type", "url", "title", "description", "accessInformation", "licenseInfo", "created", "modified"]);
}
async function readJson(response, signal) {
  const limit = 131_072;
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > limit)) {
    void response.body?.cancel().catch(() => {});
    throw new Error("Wisconsin preflight rejected: response size.");
  }
  requireValue(response.body, "missing response body");
  const reader = response.body.getReader(), chunks = [];
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", abort, { once: true });
  let size = 0;
  try {
    while (true) {
      signal.throwIfAborted(); const next = await reader.read(); signal.throwIfAborted();
      if (next.done) break;
      size += next.value.byteLength; requireValue(size <= limit, "response size"); chunks.push(next.value);
    }
    const bytes = Buffer.concat(chunks);
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } finally { signal.removeEventListener("abort", abort); void reader.cancel().catch(() => {}); reader.releaseLock(); }
}
async function request(kind, { fetchImpl, signal, sleep, now, timeoutMs }) {
  for (let attempt = 0; attempt < 3; attempt++) {
    signal?.throwIfAborted();
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(new DOMException("Request deadline.", "TimeoutError")), timeoutMs);
    const requestSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    let response, wait = 1000 * (attempt + 1);
    try {
      response = await fetchImpl(urlFor(kind), { redirect: "error", signal: requestSignal });
      requestSignal.throwIfAborted();
      requireValue(!response.redirected && !(response.status >= 300 && response.status < 400), "redirect");
      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        if (retryable) wait = publisherRetryDelay(response.headers.get("retry-after"), { fallbackMs: wait, now, maximumWaitMs: 60_000 });
        throw Object.assign(new Error("HTTP failure"), { retryable });
      }
      return inspect(kind, await readJson(response, requestSignal));
    } catch (error) {
      if (response?.body && !response.body.locked) void response.body.cancel().catch(() => {});
      signal?.throwIfAborted();
      if (error.code === "SOURCE_RETRY_DEFERRED") throw error;
      if (attempt === 2 || !(error.retryable || error.name === "TimeoutError" || (error.name === "TypeError" && !response))) throw new Error(`Wisconsin ${kind} request failed (${error.name}).`);
    } finally { clearTimeout(timer); }
    await sleep(wait, { signal });
  }
}
function assemble(observations, startedAt, finishedAt) {
  requireValue(Array.isArray(observations) && observations.length === sequence.length, "observation roster");
  let prior = Date.parse(startedAt);
  requireValue(Number.isFinite(prior) && new Date(prior).toISOString() === startedAt, "start clock");
  const hashes = [];
  for (const [index, entry] of observations.entries()) {
    requireValue(entry.kind === sequence[index] && entry.url === urlFor(entry.kind), "request identity");
    const clock = Date.parse(entry.observed_at);
    requireValue(Number.isFinite(clock) && clock >= prior && new Date(clock).toISOString() === entry.observed_at, "observation clock");
    const payload = inspect(entry.kind, entry.payload);
    requireValue(JSON.stringify(payload) === JSON.stringify(entry.payload) && entry.payload_sha256 === fingerprint(payload) && Object.keys(entry).length === 5, "evidence projection");
    hashes.push(entry.payload_sha256); prior = clock;
  }
  requireValue(Number.isFinite(Date.parse(finishedAt)) && Date.parse(finishedAt) >= prior && new Date(finishedAt).toISOString() === finishedAt, "end clock");
  requireValue(hashes.slice(0, 5).every((value, index) => value === hashes[9 - index]), "source changed during preflight");
  return { schema_version: 1, transformation_version: "1.0.0", dataset_id: "wi-dhs-licensed-group-childcare", status: "contract-preflight-passed", started_at: startedAt, finished_at: finishedAt,
    source: { layer_url: WI_LAYER, where: WI_WHERE, selected_fields: [...WI_FIELDS], source_record_count: observations[4].payload.count, native_wkid: 3857 }, observations,
    acquisition: { row_data_requests: 0, acquisition_authorized: false, connector_ready: false, scheduled: false, export_authorized: false },
    evidence_scope: "Selected public metadata fields and complete item licenseInfo strings, not raw HTTP bodies or complete linked publisher metadata.",
    remaining_gates: ["Retain and review complete linked GIS disclaimer, layer iteminfo and available metadata XML before acquisition.", "Validate WGS84 point reprojection and preserve missing coordinates; never attach polygons to businesses.", "Implement exact ID/page reconciliation, drift checks, postal normalization with separate ZIP5/ZIP4, immutable release verification and app enrollment."],
    caveats: ["Item modification is not source freshness; paired observations do not prove a transactional snapshot.", "Counts represent selected publisher rows, not independently verified active businesses or national completeness.", "Policy and redistribution approval are not implied by public access or notice presence."] };
}
export function validateWiChildcarePreflight(receipt) {
  requireValue(JSON.stringify(receipt) === JSON.stringify(assemble(receipt?.observations, receipt?.started_at, receipt?.finished_at)), "receipt reconstruction");
  return receipt;
}
export async function preflightWiChildcare(options = {}) {
  requireValue(Object.keys(options).every((key) => ["fetchImpl", "signal", "sleep", "now", "timeoutMs"].includes(key)), "options");
  const { fetchImpl = fetch, signal, sleep = (ms, opts) => delay(ms, undefined, opts), now = () => new Date(), timeoutMs = 15_000 } = options;
  requireValue([fetchImpl, sleep, now].every((v) => typeof v === "function") && Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 60_000, "transport options");
  signal?.throwIfAborted(); const startedAt = now().toISOString(), observations = [];
  for (const kind of sequence) {
    if (observations.length) await sleep(1000, { signal }); signal?.throwIfAborted();
    const payload = await request(kind, { fetchImpl, signal, sleep, now, timeoutMs });
    observations.push({ kind, url: urlFor(kind), observed_at: now().toISOString(), payload, payload_sha256: fingerprint(payload) });
  }
  signal?.throwIfAborted(); return assemble(observations, startedAt, now().toISOString());
}
export async function writeWiChildcarePreflight(receipt, options = {}) {
  requireValue(Object.keys(options).every((key) => ["signal", "outputRoot"].includes(key)), "storage options");
  const { signal, outputRoot = path.join(APP_ROOT, "data", "business-sources", "wi-dhs-licensed-group-childcare", "preflights") } = options;
  validateWiChildcarePreflight(receipt); signal?.throwIfAborted();
  const root = assertInsideApp(outputRoot);
  requireValue(root !== APP_ROOT && root === outputRoot, "canonical output root");
  requireValue(await realpath(APP_ROOT) === APP_ROOT, "canonical app root");
  let directory = APP_ROOT;
  for (const segment of path.relative(APP_ROOT, root).split(path.sep)) {
    signal?.throwIfAborted();
    directory = path.join(directory, segment);
    try { await mkdir(directory); } catch (error) { if (error.code !== "EEXIST") throw error; }
    const info = await lstat(directory);
    requireValue(info.isDirectory() && !info.isSymbolicLink() && await realpath(directory) === directory, "redirected storage");
  }
  const id = randomUUID(), temporary = path.join(root, `${id}.tmp`), destination = path.join(root, `${id}.json`);
  const bytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`); let identity;
  try {
    signal?.throwIfAborted();
    const file = await open(temporary, "wx");
    try { identity = await file.stat({ bigint: true }); await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
    signal?.throwIfAborted();
    const current = await lstat(temporary, { bigint: true });
    requireValue(current.isFile() && !current.isSymbolicLink() && current.nlink === 1n && current.ino === identity.ino && current.dev === identity.dev && await realpath(root) === root, "temporary ownership");
    signal?.throwIfAborted();
    await link(temporary, destination);
    await unlink(temporary);
    const published = await lstat(destination, { bigint: true });
    requireValue(published.isFile() && !published.isSymbolicLink() && published.nlink === 1n && published.ino === identity.ino && published.dev === identity.dev && await realpath(root) === root, "published ownership");
  } catch (error) {
    if (identity && await realpath(root).catch(() => null) === root) {
      const current = await lstat(temporary, { bigint: true }).catch(() => null);
      if (current?.isFile() && !current.isSymbolicLink() && current.ino === identity.ino && current.dev === identity.dev) await unlink(temporary);
    }
    throw error;
  }
  return { path: destination, sha256: hash(bytes), bytes: bytes.length };
}
