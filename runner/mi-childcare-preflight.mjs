import { createHash, randomUUID } from "node:crypto";
import { mkdir, realpath, open, link, unlink, lstat } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { APP_ROOT, assertInsideApp } from "./paths.mjs";
import { boundedJson, publisherRetryDelay } from "./source-http-guards.mjs";

export const MI_CHILDCARE_ITEM = "a79c3b0caedf412599085941e2af91d4";
export const MI_CHILDCARE_ORG = "dxRQUfTDNtfqZ301";
export const MI_CHILDCARE_LAYER = `https://utility.arcgis.com/usrsvcs/servers/${MI_CHILDCARE_ITEM}/rest/services/CSS/CSS_LARA/MapServer/5`;
export const MI_CHILDCARE_ITEM_URL = `https://www.arcgis.com/sharing/rest/content/items/${MI_CHILDCARE_ITEM}`;
export const MI_CHILDCARE_PREFLIGHT_VERSION = "mi-childcare-preflight@1.0.0";
export const MI_CHILDCARE_WHERE = "FacilityTypeCode='DC'";
export const MI_CHILDCARE_TERMS_SHA256 = "9124e857a97635f9871e53ed293bb48d81f4ee980ebc4fb5149fd3e842649df4";
export const MI_CHILDCARE_SOURCE_CRS = Object.freeze({ wkid: 102100, latestWkid: 3857, xyTolerance: 0.001, zTolerance: 0.001, mTolerance: 0.001, falseX: -20037700, falseY: -30241100, xyUnits: 10000, falseZ: -100000, zUnits: 10000, falseM: -100000, mUnits: 10000 });
export const MI_CHILDCARE_EXTENT_WKT = 'PROJCS["NAD_1983_Hotine_Oblique_Mercator_Azimuth_Natural_Origin",GEOGCS["GCS_North_American_1983",DATUM["D_North_American_1983",SPHEROID["GRS_1980",6378137.0,298.257222101]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Hotine_Oblique_Mercator_Azimuth_Natural_Origin"],PARAMETER["False_Easting",2546731.496],PARAMETER["False_Northing",-4354009.816],PARAMETER["Scale_Factor",0.9996],PARAMETER["Azimuth",337.25556],PARAMETER["Longitude_Of_Center",-86.0],PARAMETER["Latitude_Of_Center",45.30916666666666],UNIT["Meter",1.0]]';
export const MI_CHILDCARE_SCHEMA = Object.freeze([
  ["OBJECTID", "OID", 8], ["LicenseNumber", "String", 25], ["FacilityName", "String", 255],
  ["StreetAddress", "String", 255], ["City", "String", 150], ["State", "String", 2],
  ["ZIPCode", "String", 10], ["CountyCode", "String", 50], ["FacilityTypeCode", "String", 15],
  ["FacilityType", "String", 150], ["Capacity", "SmallInteger", null], ["MonthsofOperation", "String", 255],
  ["FullDay", "SmallInteger", null], ["AddressID", "Integer", null], ["stdStreetAddress", "String", 255],
  ["stdCity", "String", 150], ["stdState", "String", 5], ["stdZip", "String", 15],
  ["Latitude", "Double", null], ["Longitude", "Double", null], ["Shape", "Geometry", null],
].map(([name, type, length]) => Object.freeze([name, `esriFieldType${type}`, length])));
export const MI_CHILDCARE_SELECTED_FIELDS = Object.freeze(["OBJECTID", "LicenseNumber", "FacilityName", "StreetAddress", "City", "State", "ZIPCode", "CountyCode", "FacilityTypeCode", "FacilityType", "Capacity", "Latitude", "Longitude"]);
const kinds = ["metadata", "item", "count", "count", "item", "metadata"];
const hash = (value) => createHash("sha256").update(value).digest("hex");
const hashJson = (value) => hash(JSON.stringify(value));
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join("|") === [...keys].sort().join("|");
function requireValue(ok, label) { if (!ok) throw new Error(`Michigan childcare preflight rejected: ${label}.`); }
function optionsOnly(value, keys) { requireValue(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).every((key) => keys.includes(key)), "unsupported options"); }
function inspect(kind, value) {
  requireValue(value && typeof value === "object" && !Array.isArray(value) && !value.error, "invalid metadata payload");
  requireValue(!["features", "objectIds", "records"].some((key) => Object.hasOwn(value, key)), "unexpected row payload");
  if (kind === "count") {
    requireValue(exact(value, ["count"]) && Number.isSafeInteger(value.count) && value.count >= 1 && value.count <= 20_000, "count ceiling or format"); return value;
  }
  if (kind === "metadata") {
    requireValue(value.id === 5 && value.name === "BCHS_Child_Care" && value.type === "Feature Layer" && value.displayField === "FacilityName"
      && value.geometryType === "esriGeometryPoint" && exact(value.sourceSpatialReference, Object.keys(MI_CHILDCARE_SOURCE_CRS))
      && Object.entries(MI_CHILDCARE_SOURCE_CRS).every(([key, expected]) => value.sourceSpatialReference[key] === expected)
      && value.extent?.spatialReference?.wkt === MI_CHILDCARE_EXTENT_WKT
      && !Object.hasOwn(value.extent.spatialReference, "wkid"), "layer identity or CRS drift");
    requireValue(!Object.hasOwn(value, "editingInfo") && !value.timeInfo && (!Object.hasOwn(value, "objectIdField") || value.objectIdField === "OBJECTID"), "source time or OID contract drift");
    requireValue(value.capabilities === "Map,Query,Data" && value.maxRecordCount === 1000 && value.hasAttachments === false && value.hasMetadata === true
      && value.supportsStatistics === true && ["supportsPagination", "supportsOrderBy", "supportsStatistics"].every((key) => value.advancedQueryCapabilities?.[key] === true), "capability drift");
    requireValue(Array.isArray(value.fields) && value.fields.length === MI_CHILDCARE_SCHEMA.length, "schema roster drift");
    const seen = new Set();
    for (const field of value.fields) {
      const pinned = MI_CHILDCARE_SCHEMA.find(([name]) => field.name === name);
      requireValue(pinned && !seen.has(field.name) && field.type === pinned[1] && (field.length ?? null) === pinned[2]
        && !Object.hasOwn(field, "nullable") && field.domain === null, "schema drift"); seen.add(field.name);
    }
    return value;
  }
  requireValue(value.id === MI_CHILDCARE_ITEM && value.owner === "michigan_admin" && value.orgId === MI_CHILDCARE_ORG && value.access === "public"
    && value.title === "Child Care" && value.type === "Feature Service" && value.url === MI_CHILDCARE_LAYER
    && value.sourceUrl === "https://gisagocss.state.mi.us/arcgis/rest/services/CSS/CSS_LARA/MapServer/5", "item identity drift");
  requireValue([value.created, value.modified].every((v) => Number.isSafeInteger(v) && v > 0 && Number.isFinite(new Date(v).getTime())), "item timestamps");
  requireValue(typeof value.licenseInfo === "string" && hash(value.licenseInfo) === MI_CHILDCARE_TERMS_SHA256, "distribution terms drift");
  return Object.fromEntries(["id", "owner", "orgId", "access", "title", "type", "url", "sourceUrl", "created", "modified", "licenseInfo", "snippet", "description", "accessInformation"].map((key) => [key, value[key] ?? null]));
}
function urlFor(kind) {
  if (kind === "metadata") return `${MI_CHILDCARE_LAYER}?f=json`;
  if (kind === "item") return `${MI_CHILDCARE_ITEM_URL}?f=json`;
  return `${MI_CHILDCARE_LAYER}/query?${new URLSearchParams({ f: "json", where: MI_CHILDCARE_WHERE, returnCountOnly: "true", returnGeometry: "false" })}`;
}
async function request(kind, { fetchImpl, signal, sleep, now, timeoutMs }) {
  for (let attempt = 0; attempt < 3; attempt++) {
    signal?.throwIfAborted(); const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new DOMException("Request timed out.", "TimeoutError")), timeoutMs);
    const requestSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    let response, wait = 1000 * (attempt + 1);
    try {
      response = await fetchImpl(urlFor(kind), { redirect: "manual", signal: requestSignal }); requestSignal.throwIfAborted();
      requireValue(!response.redirected && !(response.status >= 300 && response.status < 400), "redirect");
      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        if (retryable) wait = publisherRetryDelay(response.headers.get("retry-after"), { fallbackMs: wait, now, maximumWaitMs: 60_000 });
        throw Object.assign(new Error("HTTP failure."), { retryable });
      }
      const payload = await boundedJson(response, { signal: requestSignal, maximumBytes: 1_000_000 });
      inspect(kind, payload); return payload;
    } catch (error) {
      if (response?.body && !response.body.locked) void response.body.cancel().catch(() => {});
      signal?.throwIfAborted(); if (error.code === "SOURCE_RETRY_DEFERRED") throw error;
      if (attempt === 2 || !(error.retryable || ["TimeoutError", "TypeError"].includes(error.name))) throw new Error(`Michigan childcare ${kind} request rejected (${error.name}).`);
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
    fingerprints.push(hashJson(inspect(observation.kind, observation.payload))); prior = clock;
  }
  requireValue(Number.isFinite(Date.parse(observedAt)) && Date.parse(observedAt) >= prior && new Date(observedAt).toISOString() === observedAt, "end clock");
  requireValue(fingerprints.slice(0, 3).every((value, index) => value === fingerprints[5 - index]), "source changed during preflight");
  const layer = observations[0].payload, item = observations[1].payload;
  return { schema_version: 1, transformation_version: MI_CHILDCARE_PREFLIGHT_VERSION, dataset_id: "mi-licensed-childcare-centers", status: "metadata-preflight-passed", started_at: startedAt, observed_at: observedAt,
    source: { layer_url: MI_CHILDCARE_LAYER, item_id: MI_CHILDCARE_ITEM, organization_id: MI_CHILDCARE_ORG, where: MI_CHILDCARE_WHERE,
      record_count: observations[2].payload.count, selected_fields: [...MI_CHILDCARE_SELECTED_FIELDS], source_spatial_reference: layer.sourceSpatialReference,
      extent_spatial_reference: layer.extent.spatialReference, source_update_timestamp: null, item_modified_epoch_ms: item.modified, item_modified_at: new Date(item.modified).toISOString() },
    observations, acquisition: { row_data_requests: 0, id_roster_requests: 0, row_data_acquired: false, normalized_records_produced: 0, release_pointer_published: false },
    policy: { full_json_metadata_and_terms_retained: true, metadata_xml_retained: false, acquisition_requires_complete_publisher_metadata: true,
      terms_presence_is_legal_approval: false, agreement_acceptance_performed: false, legal_approval: false, export_policy: "local-review-only" },
    readiness: { connector_ready: false, acquisition_authorized: false, scheduled: false, export_authorized: false, next_step: "Review full publisher metadata and policy; implement bounded acquisition, normalization and verified immutable release before app enrollment." },
    caveats: ["Count reflects publisher-listed center rows, not unique sites, verified operation or national completeness.", "No license status, license lifecycle or source update timestamp is supplied; item modified time does not establish freshness.", "Native source and extent spatial references differ; no geometry is requested or interpreted. Source latitude/longitude quality remains unvalidated.", "No IDs or facility records were requested. Stable metadata and counts do not prove a transactionally consistent snapshot.", "Publisher terms include release, defense, indemnity and hold-harmless conditions; retaining them is not legal approval or an agreement acceptance action."],
  };
}
export function validateMiChildcarePreflight(receipt) {
  requireValue(JSON.stringify(receipt) === JSON.stringify(assemble(receipt?.observations, receipt?.started_at, receipt?.observed_at)), "receipt reconstruction"); return receipt;
}
export async function preflightMiChildcare(options = {}) {
  optionsOnly(options, ["fetchImpl", "signal", "sleep", "timeoutMs", "now"]);
  const { fetchImpl = fetch, signal, sleep = (ms, opts) => delay(ms, undefined, opts), timeoutMs = 30_000, now = () => new Date() } = options;
  requireValue([fetchImpl, sleep, now].every((v) => typeof v === "function") && Number.isInteger(timeoutMs) && timeoutMs >= 1 && timeoutMs <= 30_000, "transport options");
  signal?.throwIfAborted(); const startedAt = now().toISOString(), observations = [];
  for (const kind of kinds) {
    if (observations.length) await sleep(1000, { signal }); signal?.throwIfAborted();
    const payload = await request(kind, { fetchImpl, signal, sleep, now, timeoutMs });
    observations.push({ kind, url: urlFor(kind), observed_at: now().toISOString(), payload, payload_sha256: hashJson(payload) });
  }
  signal?.throwIfAborted(); return assemble(observations, startedAt, now().toISOString());
}
export async function writeMiChildcarePreflight(receipt, options = {}) {
  optionsOnly(options, ["outputRoot", "signal"]); validateMiChildcarePreflight(receipt);
  const { signal, outputRoot = path.join(APP_ROOT, "data", "business-sources", "mi-licensed-childcare-centers", "preflights") } = options;
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
    signal?.throwIfAborted(); await link(temporary, destination); published = true; await unlink(temporary);
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
