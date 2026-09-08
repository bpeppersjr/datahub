import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, link, unlink, lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { APP_ROOT, assertInsideApp } from "./paths.mjs";
import { publisherRetryDelay } from "./source-http-guards.mjs";

export const OH_LAYER = "https://maps.ohio.gov/arcgis/rest/services/Hosted/Ohio_Daycares_view/FeatureServer/0";
export const OH_ITEM = "e7b80e83d8764427b5de7fde6f67f83d";
export const OH_CENTER_WHERE = "program_type='Child Care Center'";
export const OH_WHERE = `${OH_CENTER_WHERE} AND program_status='Open'`;
export const OH_FIELDS = Object.freeze(["objectid", "county", "program_type", "program_number", "program_name", "street_address", "city", "state", "zip_code", "program_status"]);
export const OH_SOURCE_WKT = 'PROJCS["WGS_1984_Web_Mercator_Auxiliary_Sphere",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Mercator_Auxiliary_Sphere"],PARAMETER["False_Easting",0.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",0.0],PARAMETER["Standard_Parallel_1",0.0],PARAMETER["Auxiliary_Sphere_Type",0.0],UNIT["Meter",1.0]]';
const strings = "county program_type program_name street_address city state zip_code mailing_address mailing_address_2 mailing_city mailing_state mailing_zip_code program_status phone_number sutq_rating program_email_address link geocode_status matchaddress addr_type loc_name".split(" ");
const doubles = "program_number geocode__latitude_ geocode__longitude_ geocode_score x y".split(" ");
const sequence = ["layer", "item", "statuses", "centers", "selected", "selected", "centers", "statuses", "item", "layer"];
const hash = (value) => createHash("sha256").update(value).digest("hex");
const fingerprint = (value) => hash(JSON.stringify(value));
const requireValue = (value, reason) => { if (!value) throw new Error(`Ohio preflight rejected: ${reason}.`); };
const pick = (value, keys) => Object.fromEntries(keys.filter((key) => Object.hasOwn(value, key)).map((key) => [key, value[key]]));
const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const boundedCount = (value) => Number.isSafeInteger(value) && value >= 0 && value <= 50_000;
export function ohioPreflightUrl(kind) {
  requireValue(sequence.includes(kind), "request kind");
  if (kind === "layer") return `${OH_LAYER}?f=json`;
  if (kind === "item") return `https://maps.ohio.gov/portal/sharing/rest/content/items/${OH_ITEM}?f=json`;
  const params = { f: "json", where: kind === "selected" ? OH_WHERE : OH_CENTER_WHERE, returnGeometry: "false" };
  if (kind === "statuses") Object.assign(params, { groupByFieldsForStatistics: "program_status", outStatistics: JSON.stringify([{ statisticType: "count", onStatisticField: "objectid", outStatisticFieldName: "source_count" }]), orderByFields: "program_status" });
  else params.returnCountOnly = "true";
  return `${OH_LAYER}/query?${new URLSearchParams(params)}`;
}
function inspect(kind, value) {
  requireValue(value && typeof value === "object" && !Array.isArray(value) && !value.error && !value.objectIds, "response envelope");
  if (kind === "statuses") {
    // ArcGIS aggregates use `features`, but only these two attributes are permitted.
    requireValue(exactKeys(value, ["features", "exceededTransferLimit", "objectIdFieldName", "fields"]) && value.exceededTransferLimit === false && value.objectIdFieldName === "objectid", "aggregate envelope");
    requireValue(Array.isArray(value.features) && value.features.length === 3, "status vocabulary");
    for (const [index, status] of ["Enforcement", "Inactive", "Open"].entries()) {
      const feature = value.features[index];
      requireValue(exactKeys(feature, ["attributes"]) && exactKeys(feature.attributes, ["program_status", "source_count"]) && feature.attributes.program_status === status && boundedCount(feature.attributes.source_count), "status vocabulary/count or unselected aggregate data");
    }
    requireValue(Array.isArray(value.fields) && value.fields.length === 2 && new Set(value.fields.map((f) => f.name)).size === 2, "aggregate schema");
    for (const field of value.fields) {
      requireValue(field.name === "source_count" ? field.type === "esriFieldTypeInteger" && field.length === undefined : field.name === "program_status" && field.type === "esriFieldTypeString" && field.length === 8000, "aggregate field type");
    }
    return { features: value.features.map((f) => ({ attributes: { program_status: f.attributes.program_status, source_count: f.attributes.source_count } })), exceededTransferLimit: false, objectIdFieldName: "objectid", fields: value.fields.map((f) => pick(f, ["name", "type", "length"])) };
  }
  requireValue(!value.features, "unexpected facility data");
  if (kind === "centers" || kind === "selected") {
    requireValue(exactKeys(value, ["count"]) && boundedCount(value.count), "count");
    return { count: value.count };
  }
  if (kind === "item") {
    requireValue(value.id === OH_ITEM && value.owner === "oitogrip" && value.orgId === "0123456789ABCDEF" && value.access === "public" && value.type === "Feature Service" && value.title === "Ohio Daycare Centers" && value.url === OH_LAYER.slice(0, -2), "publisher identity");
    requireValue(Number.isSafeInteger(value.modified) && value.modified > 0 && Number.isSafeInteger(value.created) && value.created > 0 && value.created <= value.modified, "publisher clocks");
    requireValue(typeof value.licenseInfo === "string" && value.licenseInfo.length > 0 && value.licenseInfo.length <= 32_000 && ["public use", "informational purposes only", "warrant", "liability"].every((marker) => value.licenseInfo.includes(marker)), "publisher notice");
    requireValue(typeof value.description === "string" && value.description.length <= 32_000 && value.description.includes("Step Up To Quality"), "publisher scope");
    requireValue(value.accessInformation === null || typeof value.accessInformation === "string" && value.accessInformation.length <= 8000, "attribution");
    return pick(value, ["id", "owner", "orgId", "access", "type", "title", "url", "created", "modified", "description", "licenseInfo", "accessInformation"]);
  }
  requireValue(value.id === 0 && value.name === "Ohio_Daycares" && value.type === "Feature Layer" && value.serviceItemId === OH_ITEM && value.geometryType === "esriGeometryPoint" && value.objectIdField === "objectid", "layer identity");
  requireValue(value.capabilities === "Query" && value.maxRecordCount === 1000 && value.hasMetadata === true, "query contract");
  const query = value.advancedQueryCapabilities;
  requireValue(query?.supportsPagination === true && query.supportsStatistics === true && query.supportsOrderBy === true, "query capabilities");
  requireValue(value.sourceSpatialReference?.wkid === 3857 && value.sourceSpatialReference.wkt === OH_SOURCE_WKT, "source CRS");
  requireValue(value.extent?.spatialReference?.wkid === 102100 && value.extent.spatialReference.latestWkid === 3857, "extent CRS");
  requireValue(Array.isArray(value.fields) && value.fields.length === 28 && new Set(value.fields.map((f) => f.name)).size === 28, "field roster");
  const fields = value.fields.map((field) => {
    requireValue(strings.includes(field.name) ? field.type === "esriFieldTypeString" && field.length === 8000 : doubles.includes(field.name) ? field.type === "esriFieldTypeDouble" && field.length === undefined : field.name === "objectid" && field.type === "esriFieldTypeOID" && field.length === 4, "field schema");
    requireValue(field.domain === null && field.defaultValue === null && field.nullable === (field.name !== "objectid"), "field domain/default/nullability");
    return pick(field, ["name", "type", "length", "domain", "defaultValue", "nullable"]);
  });
  requireValue(typeof value.description === "string" && value.description.length <= 32_000 && typeof value.copyrightText === "string" && value.copyrightText.length <= 32_000, "layer notices");
  requireValue(exactKeys(value.editingInfo, []), "unreviewed refresh metadata");
  return { ...pick(value, ["id", "name", "type", "serviceItemId", "geometryType", "objectIdField", "capabilities", "maxRecordCount", "hasMetadata", "description", "copyrightText", "editingInfo"]), fields,
    sourceSpatialReference: pick(value.sourceSpatialReference, ["wkid", "wkt"]), extent: { spatialReference: pick(value.extent.spatialReference, ["wkid", "latestWkid"]) }, advancedQueryCapabilities: pick(query, ["supportsPagination", "supportsStatistics", "supportsOrderBy"]) };
}
async function readPayload(response, signal) {
  const limit = 131_072, declared = response.headers.get("content-length");
  requireValue(declared === null || /^\d+$/.test(declared) && Number(declared) <= limit, "response size");
  requireValue(response.body, "missing body");
  const reader = response.body.getReader(), chunks = []; let size = 0;
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    while (true) { signal.throwIfAborted(); const next = await reader.read(); signal.throwIfAborted(); if (next.done) break; size += next.value.byteLength; requireValue(size <= limit, "response size"); chunks.push(next.value); }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
  } finally { signal.removeEventListener("abort", abort); void reader.cancel().catch(() => {}); reader.releaseLock(); }
}
async function request(kind, { fetchImpl, signal, sleep, now, timeoutMs }) {
  for (let attempt = 0; attempt < 3; attempt++) {
    signal?.throwIfAborted();
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(new DOMException("Request deadline.", "TimeoutError")), timeoutMs);
    const requestSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    let response, wait = 1000 * (attempt + 1);
    try {
      response = await fetchImpl(ohioPreflightUrl(kind), { redirect: "error", signal: requestSignal }); requestSignal.throwIfAborted();
      requireValue(!response.redirected && !(response.status >= 300 && response.status < 400), "redirect");
      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        if (retryable) wait = publisherRetryDelay(response.headers.get("retry-after"), { fallbackMs: wait, now, maximumWaitMs: 60_000 });
        throw Object.assign(new Error("HTTP failure"), { retryable });
      }
      return inspect(kind, await readPayload(response, requestSignal));
    } catch (error) {
      if (response?.body && !response.body.locked) void response.body.cancel().catch(() => {});
      signal?.throwIfAborted(); if (error.code === "SOURCE_RETRY_DEFERRED") throw error;
      if (attempt === 2 || !(error.retryable || error.name === "TimeoutError" || error.name === "TypeError" && !response)) throw new Error(`Ohio ${kind} request failed; inspect source contract or transport.`);
    } finally { clearTimeout(timer); }
    await sleep(wait, { signal });
  }
}
function assemble(observations, startedAt, finishedAt) {
  requireValue(Array.isArray(observations) && observations.length === sequence.length, "observation roster");
  let prior = Date.parse(startedAt);
  requireValue(Number.isFinite(prior) && new Date(prior).toISOString() === startedAt, "start clock");
  for (const [index, entry] of observations.entries()) {
    requireValue(exactKeys(entry, ["kind", "url", "observed_at", "payload", "payload_sha256"]) && entry.kind === sequence[index] && entry.url === ohioPreflightUrl(entry.kind), "observation identity");
    const clock = Date.parse(entry.observed_at), payload = inspect(entry.kind, entry.payload);
    requireValue(Number.isFinite(clock) && clock >= prior && new Date(clock).toISOString() === entry.observed_at, "observation clock");
    requireValue(JSON.stringify(payload) === JSON.stringify(entry.payload) && fingerprint(payload) === entry.payload_sha256, "evidence projection"); prior = clock;
  }
  requireValue(Number.isFinite(Date.parse(finishedAt)) && Date.parse(finishedAt) >= prior && new Date(finishedAt).toISOString() === finishedAt, "end clock");
  requireValue(observations.slice(0, 5).every((o, i) => o.payload_sha256 === observations[9 - i].payload_sha256), "source drift");
  const counts = Object.fromEntries(observations[2].payload.features.map((f) => [f.attributes.program_status, f.attributes.source_count]));
  requireValue(counts.Open === observations[4].payload.count && Object.values(counts).reduce((a, b) => a + b, 0) === observations[3].payload.count, "status/count conservation");
  return { schema_version: 1, transformation_version: "1.0.0", dataset_id: "oh-dcy-publisher-open-childcare-centers", status: "contract-preflight-passed", started_at: startedAt, finished_at: finishedAt,
    source: { layer_url: OH_LAYER, item_id: OH_ITEM, where: OH_WHERE, selected_fields: [...OH_FIELDS], source_record_count: counts.Open, center_directory_count: observations[3].payload.count, status_counts: counts, excluded_status_counts: { Inactive: counts.Inactive, Enforcement: counts.Enforcement }, native_wkid: 3857, proposed_output_wkid: 4326 }, observations,
    acquisition: { row_data_requests: 0, acquisition_authorized: false, connector_ready: false, scheduled: false, export_authorized: false, national_reporting_integrated: false },
    evidence_scope: "Selected public layer/item metadata, complete item licenseInfo/description strings, status aggregates and counts. Not raw HTTP bodies, complete linked notices or XML.",
    remaining_gates: ["Review complete available linked notices and retain explicit XML availability evidence; bind a source-use policy before acquisition.", "Implement deterministic ID/page reconciliation, validated WGS84 points, separate ZIP5/ZIP4, immutable release replay and app enrollment."],
    caveats: ["Open is publisher status, not independent evidence of operation or license validity; Enforcement is not classified as closed.", "Source row counts are not unique businesses, whole-industry or national completeness.", "Paired observations do not prove a transactional snapshot. Item modification is not source freshness."] };
}
export function validateOhChildcarePreflight(receipt) {
  requireValue(JSON.stringify(receipt) === JSON.stringify(assemble(receipt?.observations, receipt?.started_at, receipt?.finished_at)), "receipt reconstruction"); return receipt;
}
export async function preflightOhChildcare(options = {}) {
  requireValue(Object.keys(options).every((key) => ["fetchImpl", "signal", "sleep", "now", "timeoutMs"].includes(key)), "options");
  const { fetchImpl = fetch, signal, sleep = (ms, opts) => delay(ms, undefined, opts), now = () => new Date(), timeoutMs = 15_000 } = options;
  requireValue([fetchImpl, sleep, now].every((v) => typeof v === "function") && Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 60_000, "transport options");
  signal?.throwIfAborted(); const startedAt = now().toISOString(), observations = [];
  for (const kind of sequence) {
    if (observations.length) await sleep(1000, { signal }); signal?.throwIfAborted();
    const payload = await request(kind, { fetchImpl, signal, sleep, now, timeoutMs });
    observations.push({ kind, url: ohioPreflightUrl(kind), observed_at: now().toISOString(), payload, payload_sha256: fingerprint(payload) });
  }
  signal?.throwIfAborted(); return assemble(observations, startedAt, now().toISOString());
}
export async function writeOhChildcarePreflight(receipt, options = {}) {
  requireValue(Object.keys(options).every((key) => ["signal", "outputRoot"].includes(key)), "storage options");
  const { signal, outputRoot = path.join(APP_ROOT, "data", "business-sources", "oh-dcy-publisher-open-childcare-centers", "preflights") } = options;
  validateOhChildcarePreflight(receipt); signal?.throwIfAborted();
  const root = assertInsideApp(outputRoot);
  requireValue(root !== APP_ROOT && root === outputRoot && await realpath(APP_ROOT) === APP_ROOT, "canonical output root");
  const segments = path.relative(APP_ROOT, root).split(path.sep);
  requireValue(!segments.some((s) => ["releases", ".staging"].includes(s.toLowerCase())), "immutable release output");
  let directory = APP_ROOT;
  for (const segment of segments) {
    signal?.throwIfAborted(); directory = path.join(directory, segment);
    try { await mkdir(directory); } catch (error) { if (error.code !== "EEXIST") throw error; }
    const info = await lstat(directory);
    requireValue(info.isDirectory() && !info.isSymbolicLink() && await realpath(directory) === directory, "redirected storage");
    requireValue(!(await lstat(path.join(directory, "manifest.json")).catch((error) => { if (error.code === "ENOENT") return null; throw error; })), "immutable bundle output");
  }
  const id = randomUUID(), temporary = path.join(root, `${id}.tmp`), destination = path.join(root, `${id}.json`), bytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`); let identity;
  try {
    signal?.throwIfAborted(); const file = await open(temporary, "wx");
    try { identity = await file.stat({ bigint: true }); await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
    signal?.throwIfAborted(); const current = await lstat(temporary, { bigint: true });
    requireValue(current.isFile() && !current.isSymbolicLink() && current.nlink === 1n && current.ino === identity.ino && current.dev === identity.dev && await realpath(root) === root, "temporary ownership");
    signal?.throwIfAborted(); await link(temporary, destination); await unlink(temporary);
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
