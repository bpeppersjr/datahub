import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { lstat, mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { Transform } from "node:stream";
import { finished } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";

export const DC_CORPORATE_REGISTRATION_SCHEMA_VERSION = "1.0.0";
export const DC_CORPORATE_REGISTRATION_CONNECTOR_VERSION = "dc-corporate-registration@1.0.0";
export const DC_CORPORATE_REGISTRATION_DATASET_ID = "dc-corporate-registration-organizations";
export const DC_CORPORATE_REGISTRATION_ITEM_ID = "5238c4fd99c843a1bd7679a243747a8c";
export const DC_CORPORATE_REGISTRATION_LAYER_URL = "https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Business_Licensing_and_Grants_WebMercator/FeatureServer/0";
export const DC_CORPORATE_REGISTRATION_QUERY_URL = `${DC_CORPORATE_REGISTRATION_LAYER_URL}/query`;
export const DC_CORPORATE_REGISTRATION_CATALOG_URL = "https://opendata.dc.gov/datasets/DCGIS::corporate-registration";
export const DC_CORPORATE_REGISTRATION_OFFLINE_BUILD_ACKNOWLEDGEMENT = "I-APPROVE-DC-CORPORATE-REGISTRATION-OFFLINE-LOCAL-REVIEW-BUILD";
export const DC_CORPORATE_REGISTRATION_MAX_DECODED_BYTES = 1_000_000_000;
export const DC_CORPORATE_REGISTRATION_MAX_LINE_BYTES = 1_000_000;
export const DC_CORPORATE_REGISTRATION_MAX_ROWS = 1_000_000;

export const DC_CORPORATE_REGISTRATION_ACTIVE_STATUSES = Object.freeze([
  "Active - In Good Standing",
  "Active - Not in Good Standing",
]);

export const DC_CORPORATE_REGISTRATION_STATUS_VOCABULARY = Object.freeze([
  "Active - In Good Standing",
  "Active - Not in Good Standing",
  "Consolidated",
  "Converted",
  "Dissolved",
  "Domesticated",
  "Inactive - Cancelled",
  "Merged",
  "Revoked",
  "Terminated",
  "Withdrawn",
]);

export const DC_CORPORATE_REGISTRATION_MODEL_TYPES = Object.freeze([
  "Domestic Act of Congress Corporation",
  "Domestic Business Corporation",
  "Domestic General Cooperative Association",
  "Domestic Limited Cooperative Association",
  "Domestic Limited Liability Company",
  "Domestic Limited Liability Partnership",
  "Domestic Limited Partnership",
  "Domestic Nonprofit Corporation",
  "Domestic Statutory Trust",
  "Foreign Act of Congress Corporation",
  "Foreign Business Corporation",
  "Foreign General Cooperative Association",
  "Foreign Limited Cooperative Association",
  "Foreign Limited Liability Company",
  "Foreign Limited Liability Partnership",
  "Foreign Limited Partnership",
  "Foreign Nonprofit Corporation",
  "Foreign Statutory Trust",
]);

// The upstream spelling BUSNIESS is intentional and part of the selected-field contract.
export const DC_CORPORATE_REGISTRATION_SOURCE_SCHEMA = Object.freeze([
  ["FILE_NUMBER", "esriFieldTypeString", 20],
  ["ENTITY_STATUS", "esriFieldTypeString", 50],
  ["LOCALE", "esriFieldTypeString", 30],
  ["MODELTYPE", "esriFieldTypeString", 50],
  ["BUSINESS_NAME", "esriFieldTypeString", 300],
  ["BUSNIESS_ADDRESS_LINE1", "esriFieldTypeString", 200],
  ["BUSNIESS_ADDRESS_LINE2", "esriFieldTypeString", 100],
  ["BUSNIESS_ADDRESS_LINE3", "esriFieldTypeString", 100],
  ["BUSNIESS_ADDRESS_LINE4", "esriFieldTypeString", 100],
  ["BUSINESS_CITY", "esriFieldTypeString", 100],
  ["BUSINESS_STATE", "esriFieldTypeString", 10],
  ["ZIPCODE", "esriFieldTypeString", 20],
  ["BUSINESS_COUNTRY", "esriFieldTypeString", 50],
  ["SUFFIX", "esriFieldTypeString", 100],
  ["EFFECTIVE_DATE", "esriFieldTypeDate", 8],
  ["FOREIGN_DATEOF_ORGANIZATION", "esriFieldTypeDate", 8],
  ["NEXT_REPORTYEAR_DUE", "esriFieldTypeString", 10],
  ["DCS_LAST_MOD_DTTM", "esriFieldTypeDate", 8],
  ["DATE_LAST_REPORT_FILED", "esriFieldTypeDate", 8],
  ["NEXT_REPORTYEAR", "esriFieldTypeString", 1],
  ["LATESTFILED_REPORTDATE", "esriFieldTypeString", 1],
  ["LATESTREPORT_YEARFILED", "esriFieldTypeString", 1],
  ["OBJECTID", "esriFieldTypeOID", null],
  ["GLOBALID", "esriFieldTypeGlobalID", 38],
].map((field) => Object.freeze(field)));

export const DC_CORPORATE_REGISTRATION_FIELDS = Object.freeze(DC_CORPORATE_REGISTRATION_SOURCE_SCHEMA.map(([name]) => name));
const SOURCE_FIELD_SET = new Set(DC_CORPORATE_REGISTRATION_FIELDS);
const ACTIVE_STATUS_SET = new Set(DC_CORPORATE_REGISTRATION_ACTIVE_STATUSES);
const STATUS_SET = new Set(DC_CORPORATE_REGISTRATION_STATUS_VOCABULARY);
const MODEL_TYPE_SET = new Set(DC_CORPORATE_REGISTRATION_MODEL_TYPES);
const FORBIDDEN_SOURCE_KEY = /^(?:EMAIL|RA(?:_|$))/i;
const FORBIDDEN_LOCATION_KEY = /^(?:geometry|geocode|latitude|longitude|location|coordinates?|point|lat|lng|bbox)$/i;
const FORBIDDEN_ROW_CONTAINER_KEY = /^(?:features|records|data|results)$/i;
const DATAHUB_ROOT = path.resolve(import.meta.dirname, "..");
const US_POSTAL_REGIONS = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "AS", "GU", "MP", "PR", "VI",
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function schemaValue(schema) {
  return schema.map(([name, type, length]) => `${name}:${type}:${length ?? ""}`).join("\u0000");
}

export function dcCorporateRegistrationSchemaFingerprint(schema = DC_CORPORATE_REGISTRATION_SOURCE_SCHEMA) {
  return sha256(schemaValue(schema));
}

export const DC_CORPORATE_REGISTRATION_SCHEMA_FINGERPRINT = "e3271616d3b6b8f8590cbd31fada877ebecc2b18b40a5c51a46ba43ee6fc89da";

function textValue(value) {
  const result = String(value ?? "").trim();
  return result || null;
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sortedCounts(map) {
  return Object.fromEntries([...map.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function releaseTimestamp(instant) {
  return instant.replaceAll(/[-:.]/g, "").replace("T", "-").replace("Z", "Z");
}

function assertContained(parent, child, label) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`${label} escapes its governed directory.`);
}

async function ensurePlainDirectory(parent, directory, label) {
  const realParent = await realpath(parent);
  const target = path.resolve(directory);
  assertContained(realParent, target, label);
  const relative = path.relative(realParent, target);
  let current = realParent;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    let information;
    try {
      information = await lstat(current);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      await mkdir(current);
      information = await lstat(current);
    }
    if (!information.isDirectory() || information.isSymbolicLink()) throw new Error(`${label} must use regular non-link directories.`);
    assertContained(realParent, await realpath(current), label);
  }
  return realpath(target);
}

function boundedDecodedStream(input, { maximumDecodedBytes, maximumLineBytes }) {
  let decodedBytes = 0;
  let lineBytes = 0;
  return input.pipe(new Transform({
    transform(chunk, encoding, callback) {
      decodedBytes += chunk.length;
      if (decodedBytes > maximumDecodedBytes) {
        callback(new Error("DC corporate-registration decoded fixture exceeds the byte limit."));
        return;
      }
      for (const byte of chunk) {
        if (byte === 0x0a) lineBytes = 0;
        else {
          lineBytes += 1;
          if (lineBytes > maximumLineBytes) {
            callback(new Error("DC corporate-registration JSONL line exceeds the byte limit."));
            return;
          }
        }
      }
      callback(null, chunk);
    },
  }));
}

async function hashFile(filename) {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(filename)) {
    bytes += chunk.length;
    hash.update(chunk);
  }
  return { bytes, sha256: hash.digest("hex") };
}

async function readBoundedResponse(response, maximumResponseBytes) {
  const declared = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(declared) && declared > maximumResponseBytes) throw new Error("DC corporate-registration response exceeds the byte limit.");
  if (!response.body?.getReader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maximumResponseBytes) throw new Error("DC corporate-registration response exceeds the byte limit.");
    return buffer;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      bytes += chunk.length;
      if (bytes > maximumResponseBytes) {
        await reader.cancel("response byte limit exceeded").catch(() => undefined);
        throw new Error("DC corporate-registration response exceeds the byte limit.");
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, bytes);
}

const ACTIVE_FILTER = "ENTITY_STATUS IN ('Active - In Good Standing','Active - Not in Good Standing')";
const QUERY_PARAMETERS = Object.freeze({
  "total-count": Object.freeze({ where: "1=1", returnCountOnly: "true", returnGeometry: "false", f: "json" }),
  "distinct-file-number-count": Object.freeze({ where: "1=1", outFields: "FILE_NUMBER", returnDistinctValues: "true", returnCountOnly: "true", returnGeometry: "false", f: "json" }),
  "active-distinct-file-number-count": Object.freeze({ where: ACTIVE_FILTER, outFields: "FILE_NUMBER", returnDistinctValues: "true", returnCountOnly: "true", returnGeometry: "false", f: "json" }),
  "status-counts": Object.freeze({
    where: "1=1",
    outStatistics: JSON.stringify([{ statisticType: "count", onStatisticField: "OBJECTID", outStatisticFieldName: "ROW_COUNT" }]),
    groupByFieldsForStatistics: "ENTITY_STATUS",
    orderByFields: "ENTITY_STATUS ASC",
    returnGeometry: "false",
    f: "json",
  }),
  "model-type-counts": Object.freeze({
    where: "1=1",
    outStatistics: JSON.stringify([{ statisticType: "count", onStatisticField: "OBJECTID", outStatisticFieldName: "ROW_COUNT" }]),
    groupByFieldsForStatistics: "MODELTYPE",
    orderByFields: "MODELTYPE ASC",
    returnGeometry: "false",
    f: "json",
  }),
  "last-modified-maximum": Object.freeze({
    where: "1=1",
    outStatistics: JSON.stringify([{ statisticType: "max", onStatisticField: "DCS_LAST_MOD_DTTM", outStatisticFieldName: "MAX_DCS_LAST_MOD_DTTM" }]),
    returnGeometry: "false",
    f: "json",
  }),
});

function assertExactFormBody(body, requestType) {
  const expected = QUERY_PARAMETERS[requestType];
  if (!expected) throw new Error("DC corporate-registration requests are limited to metadata and aggregate/count-only operations.");
  const actual = body instanceof URLSearchParams ? body : new URLSearchParams(body ?? "");
  const actualEntries = [...actual.entries()].sort(([a], [b]) => a.localeCompare(b));
  const expectedEntries = Object.entries(expected).sort(([a], [b]) => a.localeCompare(b));
  if (JSON.stringify(actualEntries) !== JSON.stringify(expectedEntries)) {
    throw new Error(`DC corporate-registration ${requestType} request body is not the approved aggregate/count-only form.`);
  }
}

function assertAllowedUrl(urlValue, requestType, body) {
  let url;
  try {
    url = new URL(urlValue);
  } catch {
    throw new Error(`DC corporate-registration ${requestType} URL is invalid.`);
  }
  if (url.protocol !== "https:" || url.hostname !== "maps2.dcgis.dc.gov" || url.username || url.password || url.port || url.hash) {
    throw new Error(`DC corporate-registration ${requestType} URL is not allowed.`);
  }
  const layerPath = "/dcgis/rest/services/DCGIS_DATA/Business_Licensing_and_Grants_WebMercator/FeatureServer/0";
  if (requestType === "metadata") {
    const keys = [...url.searchParams.keys()];
    if (url.pathname !== layerPath || keys.length !== 1 || keys[0] !== "f" || url.searchParams.get("f") !== "pjson" || body) {
      throw new Error("DC corporate-registration metadata path or query is not allowed.");
    }
    return url;
  }
  if (url.pathname !== `${layerPath}/query` || url.search) throw new Error("DC corporate-registration query path or query string is not allowed.");
  assertExactFormBody(body, requestType);
  return url;
}

export async function requestDcCorporateRegistrationJson(urlValue, {
  requestType,
  body = null,
  fetchImpl = fetch,
  signal,
  maximumResponseBytes = requestType === "metadata" ? 1_000_000 : 128_000,
} = {}) {
  const url = assertAllowedUrl(urlValue, requestType, body);
  if (!Number.isSafeInteger(maximumResponseBytes) || maximumResponseBytes < 1 || maximumResponseBytes > 2_000_000) {
    throw new Error("maximumResponseBytes must be a positive bounded integer no greater than 2000000.");
  }
  signal?.throwIfAborted?.();
  const response = await fetchImpl(url, {
    method: requestType === "metadata" ? "GET" : "POST",
    redirect: "manual",
    signal,
    headers: requestType === "metadata" ? {
      accept: "application/json",
      "user-agent": "CoTiveCollector/0.1 (+governed-dc-metadata-count-preflight)",
    } : {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      "user-agent": "CoTiveCollector/0.1 (+governed-dc-metadata-count-preflight)",
    },
    body: requestType === "metadata" ? undefined : new URLSearchParams(body).toString(),
  });
  if (response.status >= 300 && response.status < 400) throw new Error(`DC corporate-registration ${requestType} redirect rejected (${response.status}).`);
  if (!response.ok) throw new Error(`DC corporate-registration ${requestType} request failed with HTTP ${response.status}.`);
  const contentType = String(response.headers?.get?.("content-type") ?? "").split(";", 1)[0].trim().toLowerCase();
  if (!["application/json", "text/plain"].includes(contentType)) throw new Error(`DC corporate-registration ${requestType} response must use an approved JSON media type.`);
  const buffer = await readBoundedResponse(response, maximumResponseBytes);
  let payload;
  try {
    payload = JSON.parse(buffer.toString("utf8"));
  } catch {
    throw new Error(`DC corporate-registration ${requestType} response was not valid JSON.`);
  }
  if (payload?.error) throw new Error(`DC corporate-registration ${requestType} ArcGIS error ${payload.error.code ?? "unknown"}.`);
  return payload;
}

export function validateDcCorporateRegistrationMetadata(metadata) {
  if (containsForbiddenKey(metadata, FORBIDDEN_ROW_CONTAINER_KEY)) {
    throw new Error("DC Corporate Registration metadata response unexpectedly contains row data.");
  }
  if (metadata?.name !== "Corporate Registration" || metadata?.type !== "Table") throw new Error("Unexpected DC Corporate Registration layer identity or type.");
  if (metadata.geometryType != null) throw new Error("DC Corporate Registration layer unexpectedly gained geometry.");
  if (metadata.objectIdField !== "OBJECTID" || metadata.globalIdField !== "GLOBALID" || metadata.displayField !== "BUSINESS_NAME") {
    throw new Error("DC Corporate Registration identity metadata drifted.");
  }
  if (metadata.dateFieldsTimeReference?.timeZoneIANA !== "America/New_York" || metadata.dateFieldsTimeReference?.respectsDaylightSaving !== true) {
    throw new Error("DC Corporate Registration date-field time reference drifted.");
  }
  const capabilities = new Set(String(metadata.capabilities ?? "").split(",").map((value) => value.trim()).filter(Boolean));
  if (!capabilities.has("Query")) throw new Error("DC Corporate Registration Query capability is unavailable.");
  if (!Array.isArray(metadata.fields)) throw new Error("DC Corporate Registration fields are missing.");
  const selected = metadata.fields.filter(({ name }) => SOURCE_FIELD_SET.has(name)).map(({ name, type, length }) => [name, type, length ?? null]);
  if (selected.length !== DC_CORPORATE_REGISTRATION_SOURCE_SCHEMA.length) throw new Error("DC Corporate Registration selected schema field count drifted.");
  for (let index = 0; index < selected.length; index += 1) {
    if (JSON.stringify(selected[index]) !== JSON.stringify(DC_CORPORATE_REGISTRATION_SOURCE_SCHEMA[index])) {
      throw new Error(`DC Corporate Registration selected schema drifted at field ${index + 1}.`);
    }
  }
  if (dcCorporateRegistrationSchemaFingerprint(selected) !== DC_CORPORATE_REGISTRATION_SCHEMA_FINGERPRINT) {
    throw new Error("DC Corporate Registration selected schema fingerprint drifted.");
  }
  if (DC_CORPORATE_REGISTRATION_FIELDS.some((field) => FORBIDDEN_SOURCE_KEY.test(field))) throw new Error("DC Corporate Registration selected schema includes a prohibited person/contact/agent field.");
  return DC_CORPORATE_REGISTRATION_SCHEMA_FINGERPRINT;
}

function countValue(payload, label, maximumRecordCount) {
  if (!payload || Array.isArray(payload) || Object.keys(payload).length !== 1 || !Object.hasOwn(payload, "count")) throw new Error(`${label} count-only response drifted.`);
  const count = Number(payload.count);
  if (!Number.isSafeInteger(count) || count < 0 || count > maximumRecordCount) throw new Error(`${label} count is outside the preflight guardrail.`);
  return count;
}

function groupedCounts(payload, field, vocabulary, maximumRecordCount) {
  if (!payload || !Array.isArray(payload.features) || Object.keys(payload).some((key) => !["displayFieldName", "fieldAliases", "fields", "features", "exceededTransferLimit"].includes(key))) {
    throw new Error(`DC Corporate Registration ${field} aggregate response drifted.`);
  }
  if (payload.exceededTransferLimit === true) throw new Error(`DC Corporate Registration ${field} aggregate response was truncated.`);
  const counts = new Map();
  for (const feature of payload.features) {
    const attributes = feature?.attributes;
    if (!attributes || Object.keys(attributes).length !== 2 || !Object.hasOwn(attributes, field) || !Object.hasOwn(attributes, "ROW_COUNT")) {
      throw new Error(`DC Corporate Registration ${field} aggregate row drifted.`);
    }
    const value = attributes[field];
    const count = Number(attributes.ROW_COUNT);
    if (typeof value !== "string" || !vocabulary.has(value) || counts.has(value) || !Number.isSafeInteger(count) || count < 0 || count > maximumRecordCount) {
      throw new Error(`DC Corporate Registration ${field} vocabulary or count drifted.`);
    }
    counts.set(value, count);
  }
  if (counts.size !== vocabulary.size || [...vocabulary].some((value) => !counts.has(value))) {
    throw new Error(`DC Corporate Registration ${field} vocabulary drifted.`);
  }
  return sortedCounts(counts);
}

function zonedWallClockEpochToIso(epoch, timeZone) {
  const wallClock = new Date(epoch);
  const wallClockAsUtc = Date.UTC(
    wallClock.getUTCFullYear(),
    wallClock.getUTCMonth(),
    wallClock.getUTCDate(),
    wallClock.getUTCHours(),
    wallClock.getUTCMinutes(),
    wallClock.getUTCSeconds(),
    wallClock.getUTCMilliseconds(),
  );
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  let candidate = wallClockAsUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(candidate)).filter(({ type }) => type !== "literal").map(({ type, value }) => [type, value]));
    const zoneWallAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second), wallClock.getUTCMilliseconds());
    candidate = wallClockAsUtc - (zoneWallAsUtc - candidate);
  }
  return new Date(candidate).toISOString();
}

function maximumModified(payload, timeZone) {
  if (!payload || !Array.isArray(payload.features) || payload.features.length !== 1) throw new Error("DC Corporate Registration last-modified aggregate response drifted.");
  const attributes = payload.features[0]?.attributes;
  if (!attributes || Object.keys(attributes).length !== 1 || !Object.hasOwn(attributes, "MAX_DCS_LAST_MOD_DTTM")) throw new Error("DC Corporate Registration last-modified aggregate row drifted.");
  const epoch = Number(attributes.MAX_DCS_LAST_MOD_DTTM);
  if (!Number.isSafeInteger(epoch) || epoch < 1) throw new Error("DC Corporate Registration last-modified value is invalid.");
  const instant = zonedWallClockEpochToIso(epoch, timeZone);
  if (Number.isNaN(new Date(instant).getTime())) throw new Error("DC Corporate Registration last-modified value is invalid.");
  return instant;
}

function queryBody(requestType) {
  return new URLSearchParams(QUERY_PARAMETERS[requestType]);
}

export async function preflightDcCorporateRegistration({
  fetchImpl = fetch,
  signal,
  now = () => new Date(),
  maximumRecordCount = 1_000_000,
  maximumMetadataResponseBytes = 1_000_000,
  maximumAggregateResponseBytes = 128_000,
} = {}) {
  if (!Number.isSafeInteger(maximumRecordCount) || maximumRecordCount < 503_371 || maximumRecordCount > 10_000_000) throw new Error("maximumRecordCount must be an integer from 503371 through 10000000.");
  signal?.throwIfAborted?.();
  const metadata = await requestDcCorporateRegistrationJson(`${DC_CORPORATE_REGISTRATION_LAYER_URL}?f=pjson`, {
    requestType: "metadata", fetchImpl, signal, maximumResponseBytes: maximumMetadataResponseBytes,
  });
  const schemaFingerprint = validateDcCorporateRegistrationMetadata(metadata);
  const requestAggregate = async (requestType) => requestDcCorporateRegistrationJson(DC_CORPORATE_REGISTRATION_QUERY_URL, {
    requestType, body: queryBody(requestType), fetchImpl, signal, maximumResponseBytes: maximumAggregateResponseBytes,
  });
  const [totalPayload, distinctPayload, activeDistinctPayload, statusesPayload, modelTypesPayload, modifiedPayload] = await Promise.all([
    requestAggregate("total-count"),
    requestAggregate("distinct-file-number-count"),
    requestAggregate("active-distinct-file-number-count"),
    requestAggregate("status-counts"),
    requestAggregate("model-type-counts"),
    requestAggregate("last-modified-maximum"),
  ]);
  const totalRecords = countValue(totalPayload, "DC Corporate Registration total", maximumRecordCount);
  const distinctFileNumbers = countValue(distinctPayload, "DC Corporate Registration distinct FILE_NUMBER", maximumRecordCount);
  const activeDistinctFileNumbers = countValue(activeDistinctPayload, "DC Corporate Registration active distinct FILE_NUMBER", maximumRecordCount);
  const statusCounts = groupedCounts(statusesPayload, "ENTITY_STATUS", STATUS_SET, maximumRecordCount);
  const modelTypeCounts = groupedCounts(modelTypesPayload, "MODELTYPE", MODEL_TYPE_SET, maximumRecordCount);
  const statusTotal = Object.values(statusCounts).reduce((sum, count) => sum + count, 0);
  const modelTypeTotal = Object.values(modelTypeCounts).reduce((sum, count) => sum + count, 0);
  const activeRecords = DC_CORPORATE_REGISTRATION_ACTIVE_STATUSES.reduce((sum, status) => sum + statusCounts[status], 0);
  if (totalRecords < 1 || statusTotal !== totalRecords || modelTypeTotal !== totalRecords) throw new Error("DC Corporate Registration aggregate counts do not reconcile to total rows.");
  if (distinctFileNumbers > totalRecords || activeDistinctFileNumbers !== activeRecords) throw new Error("DC Corporate Registration FILE_NUMBER distinctness controls failed.");
  const maxLastModified = maximumModified(modifiedPayload, metadata.dateFieldsTimeReference.timeZoneIANA);
  const observedAt = now().toISOString();
  if (Number.isNaN(new Date(observedAt).getTime())) throw new Error("DC Corporate Registration observation time is invalid.");
  const controls = {
    total_records: totalRecords,
    distinct_file_numbers: distinctFileNumbers,
    duplicate_or_missing_file_number_excess: totalRecords - distinctFileNumbers,
    active_records: activeRecords,
    active_distinct_file_numbers: activeDistinctFileNumbers,
    active_file_numbers_unique_and_nonmissing: activeDistinctFileNumbers === activeRecords,
    status_counts: statusCounts,
    model_type_counts: modelTypeCounts,
    max_dcs_last_mod_dttm: maxLastModified,
  };
  const sourceObservationFingerprint = sha256(JSON.stringify({
    item_id: DC_CORPORATE_REGISTRATION_ITEM_ID,
    schema_fingerprint: schemaFingerprint,
    controls,
  }));
  return {
    schema_version: DC_CORPORATE_REGISTRATION_SCHEMA_VERSION,
    connector_id: "dc-corporate-registration",
    connector_version: DC_CORPORATE_REGISTRATION_CONNECTOR_VERSION,
    status: "verified-metadata-and-aggregate-counts-only-live-acquisition-default-denied",
    dataset_id: DC_CORPORATE_REGISTRATION_DATASET_ID,
    item_id: DC_CORPORATE_REGISTRATION_ITEM_ID,
    dataset_name: "Corporate Registration",
    publisher: "District of Columbia Department of Licensing and Consumer Protection",
    layer_url: DC_CORPORATE_REGISTRATION_LAYER_URL,
    catalog_url: DC_CORPORATE_REGISTRATION_CATALOG_URL,
    observed_at: observedAt,
    source_schema: DC_CORPORATE_REGISTRATION_SOURCE_SCHEMA.map((field) => [...field]),
    selected_fields: [...DC_CORPORATE_REGISTRATION_FIELDS],
    schema_fingerprint: schemaFingerprint,
    controls,
    source_observation_fingerprint: sourceObservationFingerprint,
    acquisition: {
      metadata_requests: 1,
      aggregate_count_only_requests: 6,
      row_data_requests: 0,
      row_data_acquired: false,
      normalized_records_produced: 0,
      live_bulk_acquisition: "default-denied-and-unimplemented",
      production_pointer_published: false,
    },
    semantics: {
      population: "all corporate-registration rows counted; offline build is restricted to the two exact source-defined active statuses",
      address: "organization administrative registration evidence only",
      physical_site_or_establishment: "not asserted",
      operating_status: "not inferred",
      geometry_or_geocode: "not acquired-or-produced",
      identity: "FILE_NUMBER is a candidate key; the current active subset must be unique and nonmissing",
    },
    export_policy: "internal-preflight-receipt-only",
  };
}

export function validateDcCorporateRegistrationPreflightReceipt(receipt) {
  if (containsForbiddenKey(receipt, FORBIDDEN_SOURCE_KEY) || containsForbiddenKey(receipt, FORBIDDEN_ROW_CONTAINER_KEY)) {
    throw new Error("DC corporate-registration preflight receipt contains prohibited person/contact/agent fields or row data.");
  }
  try {
    exactKeys(receipt, ["schema_version", "connector_id", "connector_version", "status", "dataset_id", "item_id", "dataset_name", "publisher", "layer_url", "catalog_url", "observed_at", "source_schema", "selected_fields", "schema_fingerprint", "controls", "source_observation_fingerprint", "acquisition", "semantics", "export_policy"], "preflight receipt");
    exactKeys(receipt.controls, ["total_records", "distinct_file_numbers", "duplicate_or_missing_file_number_excess", "active_records", "active_distinct_file_numbers", "active_file_numbers_unique_and_nonmissing", "status_counts", "model_type_counts", "max_dcs_last_mod_dttm"], "preflight controls");
    exactKeys(receipt.acquisition, ["metadata_requests", "aggregate_count_only_requests", "row_data_requests", "row_data_acquired", "normalized_records_produced", "live_bulk_acquisition", "production_pointer_published"], "preflight acquisition");
    exactKeys(receipt.semantics, ["population", "address", "physical_site_or_establishment", "operating_status", "geometry_or_geocode", "identity"], "preflight semantics");
  } catch (error) {
    throw new Error(`DC corporate-registration preflight receipt schema is invalid: ${error.message}`);
  }
  const expectedSemantics = {
    population: "all corporate-registration rows counted; offline build is restricted to the two exact source-defined active statuses",
    address: "organization administrative registration evidence only",
    physical_site_or_establishment: "not asserted",
    operating_status: "not inferred",
    geometry_or_geocode: "not acquired-or-produced",
    identity: "FILE_NUMBER is a candidate key; the current active subset must be unique and nonmissing",
  };
  if (!receipt || receipt.schema_version !== DC_CORPORATE_REGISTRATION_SCHEMA_VERSION
    || receipt.connector_id !== "dc-corporate-registration"
    || receipt.connector_version !== DC_CORPORATE_REGISTRATION_CONNECTOR_VERSION
    || receipt.dataset_id !== DC_CORPORATE_REGISTRATION_DATASET_ID
    || receipt.item_id !== DC_CORPORATE_REGISTRATION_ITEM_ID
    || receipt.dataset_name !== "Corporate Registration"
    || receipt.publisher !== "District of Columbia Department of Licensing and Consumer Protection"
    || receipt.layer_url !== DC_CORPORATE_REGISTRATION_LAYER_URL
    || receipt.catalog_url !== DC_CORPORATE_REGISTRATION_CATALOG_URL
    || receipt.status !== "verified-metadata-and-aggregate-counts-only-live-acquisition-default-denied"
    || receipt.schema_fingerprint !== DC_CORPORATE_REGISTRATION_SCHEMA_FINGERPRINT
    || dcCorporateRegistrationSchemaFingerprint(receipt.source_schema) !== DC_CORPORATE_REGISTRATION_SCHEMA_FINGERPRINT
    || JSON.stringify(receipt.selected_fields) !== JSON.stringify(DC_CORPORATE_REGISTRATION_FIELDS)
    || receipt.acquisition?.metadata_requests !== 1
    || receipt.acquisition?.aggregate_count_only_requests !== 6
    || receipt.acquisition?.row_data_requests !== 0
    || receipt.acquisition?.row_data_acquired !== false
    || receipt.acquisition?.normalized_records_produced !== 0
    || receipt.acquisition?.live_bulk_acquisition !== "default-denied-and-unimplemented"
    || receipt.acquisition?.production_pointer_published !== false
    || JSON.stringify(receipt.semantics) !== JSON.stringify(expectedSemantics)
    || receipt.export_policy !== "internal-preflight-receipt-only") {
    throw new Error("A validated DC corporate-registration metadata/count-only preflight receipt is required.");
  }
  const controls = receipt.controls;
  if (!controls || !Number.isSafeInteger(controls.total_records) || controls.total_records < 1
    || !Number.isSafeInteger(controls.distinct_file_numbers) || controls.distinct_file_numbers < 1
    || controls.duplicate_or_missing_file_number_excess !== controls.total_records - controls.distinct_file_numbers
    || !Number.isSafeInteger(controls.active_records) || controls.active_records < 1
    || controls.active_distinct_file_numbers !== controls.active_records
    || controls.active_file_numbers_unique_and_nonmissing !== true
    || Object.keys(controls.status_counts ?? {}).sort().join("\u0000") !== [...STATUS_SET].sort().join("\u0000")
    || Object.keys(controls.model_type_counts ?? {}).sort().join("\u0000") !== [...MODEL_TYPE_SET].sort().join("\u0000")
    || Object.values(controls.status_counts).some((count) => !Number.isSafeInteger(count) || count < 0)
    || Object.values(controls.model_type_counts).some((count) => !Number.isSafeInteger(count) || count < 0)
    || Object.values(controls.status_counts).reduce((sum, count) => sum + count, 0) !== controls.total_records
    || Object.values(controls.model_type_counts).reduce((sum, count) => sum + count, 0) !== controls.total_records
    || DC_CORPORATE_REGISTRATION_ACTIVE_STATUSES.reduce((sum, status) => sum + controls.status_counts[status], 0) !== controls.active_records) {
    throw new Error("DC corporate-registration preflight control values are invalid.");
  }
  for (const field of [receipt.observed_at, controls.max_dcs_last_mod_dttm]) {
    const instant = new Date(field);
    if (Number.isNaN(instant.getTime()) || instant.toISOString() !== field) throw new Error("DC corporate-registration preflight timestamp is invalid.");
  }
  const fingerprint = sha256(JSON.stringify({
    item_id: DC_CORPORATE_REGISTRATION_ITEM_ID,
    schema_fingerprint: DC_CORPORATE_REGISTRATION_SCHEMA_FINGERPRINT,
    controls,
  }));
  if (fingerprint !== receipt.source_observation_fingerprint) throw new Error("DC corporate-registration preflight observation fingerprint is invalid.");
  return receipt;
}

export async function acquireDcCorporateRegistrationLive({ signal, fetchImpl } = {}) {
  signal?.throwIfAborted?.();
  void fetchImpl;
  throw new Error("DC Corporate Registration live bulk acquisition is default-denied and unimplemented; no row request was sent.");
}

function exactSourceRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error("DC corporate-registration source row must be an object.");
  const keys = Object.keys(record);
  if (containsForbiddenKey(record, FORBIDDEN_SOURCE_KEY)) throw new Error("DC corporate-registration source row contains a prohibited person/contact/agent field.");
  if (keys.length !== DC_CORPORATE_REGISTRATION_FIELDS.length || keys.some((key) => !SOURCE_FIELD_SET.has(key))) {
    throw new Error("DC corporate-registration source row does not match the exact 24-field privacy-selected contract.");
  }
  if (DC_CORPORATE_REGISTRATION_FIELDS.some((field) => {
    const value = record[field];
    return value != null && !["string", "number"].includes(typeof value);
  })) throw new Error("DC corporate-registration source values must be scalar strings, numbers, or null.");
  if (DC_CORPORATE_REGISTRATION_FIELDS.some((field) => typeof record[field] === "number" && !Number.isFinite(record[field]))) {
    throw new Error("DC corporate-registration source numeric values must be finite.");
  }
  return Object.fromEntries(DC_CORPORATE_REGISTRATION_FIELDS.map((field) => [field, record[field] ?? null]));
}

function sourceFormat(filename) {
  const uncompressed = filename.toLowerCase().endsWith(".gz") ? filename.slice(0, -3) : filename;
  if (!/\.(?:jsonl|ndjson)$/i.test(uncompressed)) throw new Error("DC corporate-registration offline fixture must be .jsonl, .jsonl.gz, .ndjson, or .ndjson.gz.");
}

async function* sourceRows(filename, {
  maximumDecodedBytes = DC_CORPORATE_REGISTRATION_MAX_DECODED_BYTES,
  maximumLineBytes = DC_CORPORATE_REGISTRATION_MAX_LINE_BYTES,
  maximumRows = DC_CORPORATE_REGISTRATION_MAX_ROWS,
} = {}) {
  sourceFormat(filename);
  const raw = createReadStream(filename);
  const decoded = filename.toLowerCase().endsWith(".gz") ? raw.pipe(createGunzip()) : raw;
  const input = boundedDecodedStream(decoded, { maximumDecodedBytes, maximumLineBytes });
  const lines = createInterface({ input, crlfDelay: Infinity });
  let rows = 0;
  for await (const line of lines) {
    if (!line.trim()) continue;
    rows += 1;
    if (rows > maximumRows) throw new Error("DC corporate-registration fixture exceeds the row limit.");
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      throw new Error("DC corporate-registration JSONL fixture contains invalid JSON.");
    }
    yield exactSourceRecord(record);
  }
}

async function* gzipRows(filename) {
  const decoded = createReadStream(filename).pipe(createGunzip());
  const input = boundedDecodedStream(decoded, {
    maximumDecodedBytes: DC_CORPORATE_REGISTRATION_MAX_DECODED_BYTES,
    maximumLineBytes: DC_CORPORATE_REGISTRATION_MAX_LINE_BYTES,
  });
  const lines = createInterface({ input, crlfDelay: Infinity });
  let rows = 0;
  for await (const line of lines) if (line.trim()) {
    rows += 1;
    if (rows > DC_CORPORATE_REGISTRATION_MAX_ROWS) throw new Error("DC corporate-registration artifact exceeds the row limit.");
    yield JSON.parse(line);
  }
}

function canonicalFileNumber(value) {
  const fileNumber = textValue(value);
  if (!fileNumber || fileNumber.length > 20 || /[\u0000-\u001f\u007f]/.test(fileNumber)) throw new Error("invalid-file-number");
  return { source: fileNumber, identity: fileNumber.toUpperCase() };
}

function canonicalGlobalId(value) {
  const raw = textValue(value);
  const match = raw?.match(/^\{?([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\}?$/i);
  if (!match) throw new Error("invalid-globalid");
  return `{${match[1].toUpperCase()}}`;
}

function objectId(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error("invalid-objectid");
  return number;
}

function sourceInstant(value, label, { required = false, arcGisLocalTime = false } = {}) {
  if (value == null || value === "") {
    if (required) throw new Error(`missing-${label}`);
    return null;
  }
  const raw = typeof value === "number" ? value : String(value).trim();
  const numericArcGisValue = /^\d{10,13}$/.test(String(raw)) ? Number(raw) : null;
  if (arcGisLocalTime && numericArcGisValue != null) return zonedWallClockEpochToIso(numericArcGisValue, "America/New_York");
  const instant = new Date(numericArcGisValue ?? raw);
  if (Number.isNaN(instant.getTime())) throw new Error(`invalid-${label}`);
  return instant.toISOString();
}

function sourceDate(value, label) {
  const instant = sourceInstant(value, label);
  return instant?.slice(0, 10) ?? null;
}

export function splitDcCorporateRegistrationPostcode(value, countryValue, stateValue = null) {
  const sourcePostcode = textValue(value);
  const country = textValue(countryValue)?.toUpperCase() ?? null;
  const state = textValue(stateValue)?.toUpperCase() ?? null;
  const isUs = ["US", "USA", "UNITED STATES", "UNITED STATES OF AMERICA"].includes(country)
    || (!country && US_POSTAL_REGIONS.has(state));
  if (!isUs) return { zip_code: null, postal_code: null, zip4: null, source_postcode: sourcePostcode };
  if (!sourcePostcode) return { zip_code: null, postal_code: null, zip4: null, source_postcode: null };
  const match = sourcePostcode.match(/^(\d{5})(?:-?(\d{4}))?$/);
  if (!match || match[1] === "00000") throw new Error("invalid-us-business-postcode");
  return { zip_code: match[1], postal_code: match[1], zip4: match[2] ?? null, source_postcode: sourcePostcode };
}

function normalizedRecord(source, context) {
  const fileNumber = canonicalFileNumber(source.FILE_NUMBER);
  const status = textValue(source.ENTITY_STATUS);
  if (!ACTIVE_STATUS_SET.has(status)) throw new Error("source-row-is-not-an-approved-active-status");
  const modelType = textValue(source.MODELTYPE);
  if (!MODEL_TYPE_SET.has(modelType)) throw new Error("unsupported-modeltype");
  const businessName = textValue(source.BUSINESS_NAME);
  if (!businessName) throw new Error("missing-business-name");
  const address = splitDcCorporateRegistrationPostcode(source.ZIPCODE, source.BUSINESS_COUNTRY, source.BUSINESS_STATE);
  const globalId = canonicalGlobalId(source.GLOBALID);
  const oid = objectId(source.OBJECTID);
  const registrationLastModified = sourceInstant(source.DCS_LAST_MOD_DTTM, "dcs-last-modified", { required: true, arcGisLocalTime: true });
  return {
    schema_version: DC_CORPORATE_REGISTRATION_SCHEMA_VERSION,
    normalized_record_id: `dc-corporate-registration:${sha256(fileNumber.identity).slice(0, 32)}`,
    entity_candidate: {
      organization_id: `organization:dc_dlcp_corporate_file_${sha256(fileNumber.identity).slice(0, 32)}`,
      identity_status: "provisional",
      physical_site_created: false,
      establishment_created: false,
    },
    external_identifiers: [
      { type: "dc_dlcp_corporate_file_number", value: fileNumber.source, source_field: "FILE_NUMBER", candidate_key: true },
      { type: "dcgis_globalid", value: globalId, source_field: "GLOBALID", candidate_key: false },
    ],
    organization_name: {
      business_name: businessName,
      suffix: textValue(source.SUFFIX),
    },
    registration: {
      entity_status: status,
      active_source_defined: true,
      good_standing_source_defined: status === "Active - In Good Standing",
      locale: textValue(source.LOCALE),
      model_type: modelType,
      effective_date: sourceDate(source.EFFECTIVE_DATE, "effective-date"),
      foreign_date_of_organization: sourceDate(source.FOREIGN_DATEOF_ORGANIZATION, "foreign-date-of-organization"),
      next_report_year_due: textValue(source.NEXT_REPORTYEAR_DUE),
      date_last_report_filed: sourceDate(source.DATE_LAST_REPORT_FILED, "date-last-report-filed"),
      next_report_year_source_value: textValue(source.NEXT_REPORTYEAR),
      latest_filed_report_date_source_value: textValue(source.LATESTFILED_REPORTDATE),
      latest_report_year_filed_source_value: textValue(source.LATESTREPORT_YEARFILED),
      dcs_last_modified_at: registrationLastModified,
    },
    administrative_address: {
      address_lines: [source.BUSNIESS_ADDRESS_LINE1, source.BUSNIESS_ADDRESS_LINE2, source.BUSNIESS_ADDRESS_LINE3, source.BUSNIESS_ADDRESS_LINE4].map(textValue).filter(Boolean),
      city: textValue(source.BUSINESS_CITY),
      state: textValue(source.BUSINESS_STATE),
      country: textValue(source.BUSINESS_COUNTRY),
      ...address,
      scope: "corporate-registration-business-address-administrative-evidence-only",
      physical_site_asserted: false,
      establishment_asserted: false,
    },
    source_status: {
      exact_value: status,
      source_defined_active: true,
      current_operation_asserted: false,
      semantics: "corporate-registration-status-not-independent-proof-of-current-operation-or-location",
    },
    identity_resolution: {
      candidate_key: "FILE_NUMBER",
      automatic_match_requires_exact_case_insensitive_value: true,
      fuzzy_match_authoritative: false,
      ownership_inference_permitted: false,
    },
    observed_at: context.observedAt,
    provenance: {
      source_id: "dc-open-data-corporate-registration",
      source_release_id: context.sourceReleaseId,
      source_record_id: `FILE_NUMBER:${fileNumber.source}`,
      source_objectid: oid,
      source_globalid: globalId,
      source_last_modified_at: registrationLastModified,
      ingest_run_id: context.runId,
      transformation_version: DC_CORPORATE_REGISTRATION_CONNECTOR_VERSION,
      policy_id: "dc-corporate-registration",
    },
    privacy: {
      person_contact_agent_fields_selected: false,
      business_address_may_be_residential: true,
      record_level_export_requires_separate_privacy_review: true,
    },
    export_policy: "local-review-only",
  };
}

async function renameWithRetry(source, destination, attempts = 12) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await rename(source, destination);
      return;
    } catch (error) {
      if (!["EPERM", "EACCES", "EBUSY"].includes(error?.code) || attempt + 1 >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, Math.min(25 * (2 ** attempt), 1000)));
    }
  }
}

async function openGzipWriter(directory, relativePath) {
  const destination = path.join(directory, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp-${randomUUID()}`;
  const output = createWriteStream(temporary, { flags: "wx" });
  const gzip = createGzip();
  gzip.pipe(output);
  return { relativePath, destination, temporary, output, gzip, records: 0 };
}

async function writeGzipRecord(writer, record) {
  if (!writer.gzip.write(`${JSON.stringify(record)}\n`)) await once(writer.gzip, "drain");
  writer.records += 1;
}

async function closeGzipWriter(writer, artifactType, exportPolicy) {
  const completion = finished(writer.output);
  writer.gzip.end();
  await completion;
  await renameWithRetry(writer.temporary, writer.destination);
  return {
    path: writer.relativePath.replaceAll("\\", "/"),
    ...(await hashFile(writer.destination)),
    record_count: writer.records,
    artifact_type: artifactType,
    export_policy: exportPolicy,
  };
}

async function abortWriters(writers) {
  for (const writer of writers.filter(Boolean)) {
    if (!writer.gzip.destroyed && !writer.gzip.writableEnded) writer.gzip.destroy();
    if (!writer.output.destroyed) writer.output.destroy();
  }
  await Promise.allSettled(writers.filter(Boolean).map((writer) => finished(writer.output)));
}

async function writeArtifact(directory, relativePath, content, artifactType, exportPolicy) {
  const destination = path.join(directory, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
  await writeFile(destination, buffer, { flag: "wx" });
  return {
    path: relativePath.replaceAll("\\", "/"),
    bytes: buffer.length,
    sha256: sha256(buffer),
    artifact_type: artifactType,
    export_policy: exportPolicy,
  };
}

export async function buildDcCorporateRegistrationOffline({
  outputRoot,
  sourcePath,
  preflight,
  acknowledgement,
  maximumSourceBytes = 500_000_000,
  maximumDecodedSourceBytes = DC_CORPORATE_REGISTRATION_MAX_DECODED_BYTES,
  maximumLineBytes = DC_CORPORATE_REGISTRATION_MAX_LINE_BYTES,
  maximumRows = DC_CORPORATE_REGISTRATION_MAX_ROWS,
  maximumPreflightAgeMs = 48 * 60 * 60 * 1000,
  now = () => new Date(),
  runId = randomUUID(),
  signal,
  logger = () => undefined,
} = {}) {
  if (acknowledgement !== DC_CORPORATE_REGISTRATION_OFFLINE_BUILD_ACKNOWLEDGEMENT) {
    throw new Error(`DC Corporate Registration offline build is default-denied. Exact acknowledgement required: ${DC_CORPORATE_REGISTRATION_OFFLINE_BUILD_ACKNOWLEDGEMENT}`);
  }
  validateDcCorporateRegistrationPreflightReceipt(preflight);
  signal?.throwIfAborted?.();
  if (!outputRoot || !sourcePath) throw new Error("outputRoot and sourcePath are required.");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(runId)) throw new Error("runId must be a UUID.");
  if (!Number.isSafeInteger(maximumSourceBytes) || maximumSourceBytes < 1 || maximumSourceBytes > 2_000_000_000) throw new Error("maximumSourceBytes is invalid.");
  if (!Number.isSafeInteger(maximumDecodedSourceBytes) || maximumDecodedSourceBytes < 1 || maximumDecodedSourceBytes > DC_CORPORATE_REGISTRATION_MAX_DECODED_BYTES) throw new Error("maximumDecodedSourceBytes is invalid.");
  if (!Number.isSafeInteger(maximumLineBytes) || maximumLineBytes < 1 || maximumLineBytes > DC_CORPORATE_REGISTRATION_MAX_LINE_BYTES) throw new Error("maximumLineBytes is invalid.");
  if (!Number.isSafeInteger(maximumRows) || maximumRows < 1 || maximumRows > DC_CORPORATE_REGISTRATION_MAX_ROWS) throw new Error("maximumRows is invalid.");
  if (!Number.isSafeInteger(maximumPreflightAgeMs) || maximumPreflightAgeMs < 1 || maximumPreflightAgeMs > 7 * 24 * 60 * 60 * 1000) throw new Error("maximumPreflightAgeMs is invalid.");
  const buildInstant = now();
  if (!(buildInstant instanceof Date) || Number.isNaN(buildInstant.getTime())) throw new Error("Build time is invalid.");
  const age = buildInstant.getTime() - new Date(preflight.observed_at).getTime();
  if (age < 0 || age > maximumPreflightAgeMs) throw new Error("DC corporate-registration preflight is outside the permitted freshness window.");
  const governedRoot = await realpath(DATAHUB_ROOT);
  const resolvedSourcePath = path.resolve(sourcePath);
  const resolvedOutputRoot = path.resolve(outputRoot);
  assertContained(governedRoot, resolvedSourcePath, "DC corporate-registration offline fixture");
  assertContained(governedRoot, resolvedOutputRoot, "DC corporate-registration output");
  const sourceInfo = await lstat(resolvedSourcePath);
  if (!sourceInfo.isFile() || sourceInfo.isSymbolicLink() || sourceInfo.nlink !== 1) throw new Error("DC corporate-registration offline fixture must be a regular non-symlink, non-hardlinked file.");
  if (sourceInfo.size < 1 || sourceInfo.size > maximumSourceBytes) throw new Error("DC corporate-registration offline fixture is empty or exceeds the byte limit.");
  sourceFormat(resolvedSourcePath);
  const sourceRealPath = await realpath(resolvedSourcePath);
  assertContained(governedRoot, sourceRealPath, "DC corporate-registration offline fixture");
  const inputDigest = await hashFile(sourceRealPath);
  if (inputDigest.bytes > maximumSourceBytes) throw new Error("DC corporate-registration offline fixture exceeds the byte limit.");
  const sourceReleaseId = `dc-corporate-registration-${releaseTimestamp(preflight.controls.max_dcs_last_mod_dttm)}-${inputDigest.sha256.slice(0, 16)}`;
  const releaseId = `${sourceReleaseId}-${runId.slice(0, 8)}`;
  const root = await ensurePlainDirectory(governedRoot, resolvedOutputRoot, "DC corporate-registration output");
  const stagingRoot = path.join(root, ".staging");
  const stagingDirectory = path.join(stagingRoot, runId);
  assertContained(root, stagingDirectory, "DC corporate-registration staging directory");
  const realStagingRoot = await ensurePlainDirectory(root, stagingRoot, "DC corporate-registration staging root");
  assertContained(realStagingRoot, stagingDirectory, "DC corporate-registration staging directory");
  try {
    await mkdir(stagingDirectory);
  } catch (error) {
    if (error?.code === "EEXIST") throw new Error("DC corporate-registration staging run already exists; refusing to overwrite it.");
    throw error;
  }
  let promotedReleaseDirectory = null;
  try {
  const sourceWriter = await openGzipWriter(stagingDirectory, "source/selected-active-corporate-registration.jsonl.gz");
  const normalizedWriter = await openGzipWriter(stagingDirectory, "normalized/organizations.jsonl.gz");
  const seenFileNumbers = new Set();
  const statusCounts = new Map();
  const modelTypeCounts = new Map();
  let addresses = 0;
  let zip5 = 0;
  let zip4 = 0;
  try {
    for await (const source of sourceRows(sourceRealPath, { maximumDecodedBytes: maximumDecodedSourceBytes, maximumLineBytes, maximumRows })) {
      signal?.throwIfAborted?.();
      const file = canonicalFileNumber(source.FILE_NUMBER);
      if (seenFileNumbers.has(file.identity)) throw new Error(`Duplicate DC corporate-registration FILE_NUMBER: ${file.source}`);
      seenFileNumbers.add(file.identity);
      const normalized = normalizedRecord(source, { observedAt: preflight.observed_at, sourceReleaseId, runId });
      statusCounts.set(normalized.registration.entity_status, (statusCounts.get(normalized.registration.entity_status) ?? 0) + 1);
      modelTypeCounts.set(normalized.registration.model_type, (modelTypeCounts.get(normalized.registration.model_type) ?? 0) + 1);
      if (normalized.administrative_address.address_lines.length || normalized.administrative_address.city || normalized.administrative_address.state || normalized.administrative_address.source_postcode) addresses += 1;
      if (normalized.administrative_address.zip_code) zip5 += 1;
      if (normalized.administrative_address.zip4) zip4 += 1;
      await writeGzipRecord(sourceWriter, source);
      await writeGzipRecord(normalizedWriter, normalized);
    }
    const finalInputDigest = await hashFile(sourceRealPath);
    if (finalInputDigest.bytes > maximumSourceBytes || finalInputDigest.bytes !== inputDigest.bytes || finalInputDigest.sha256 !== inputDigest.sha256) {
      throw new Error("DC corporate-registration offline fixture changed while it was being read.");
    }
  } catch (error) {
    await abortWriters([sourceWriter, normalizedWriter]);
    throw error;
  }
  if (sourceWriter.records !== preflight.controls.active_records) {
    await abortWriters([sourceWriter, normalizedWriter]);
    throw new Error(`DC corporate-registration offline active source count mismatch: expected ${preflight.controls.active_records}, received ${sourceWriter.records}.`);
  }
  const sourceArtifact = await closeGzipWriter(sourceWriter, "dc-corporate-registration-selected-active-source-jsonl-gzip", "internal");
  const normalizedArtifact = await closeGzipWriter(normalizedWriter, "normalized-dc-corporate-registration-organization-jsonl-gzip", "local-review-only");
  const preflightArtifact = await writeArtifact(stagingDirectory, "control/preflight-receipt.json", json(preflight), "dc-corporate-registration-preflight-receipt-json", "internal");
  const summary = {
    source_active_records: sourceWriter.records,
    normalized_provisional_organizations: normalizedWriter.records,
    administrative_address_evidence_records: addresses,
    zip5_records: zip5,
    zip4_records: zip4,
    status_counts: sortedCounts(statusCounts),
    model_type_counts: sortedCounts(modelTypeCounts),
    duplicate_file_numbers_rejected: true,
    person_contact_agent_fields_selected: false,
    physical_sites: 0,
    establishments: 0,
    business_geometries: 0,
    business_geocodes: 0,
  };
  const summaryArtifact = await writeArtifact(stagingDirectory, "quality/summary.json", json(summary), "dc-corporate-registration-source-summary-json", "internal");
  const manifest = {
    schema_version: DC_CORPORATE_REGISTRATION_SCHEMA_VERSION,
    dataset_id: DC_CORPORATE_REGISTRATION_DATASET_ID,
    release_id: releaseId,
    source_release_id: sourceReleaseId,
    status: "verified-local-review-only",
    connector: { id: "dc-corporate-registration", version: DC_CORPORATE_REGISTRATION_CONNECTOR_VERSION },
    run_id: runId,
    created_at: buildInstant.toISOString(),
    source: {
      item_id: DC_CORPORATE_REGISTRATION_ITEM_ID,
      catalog_url: DC_CORPORATE_REGISTRATION_CATALOG_URL,
      layer_url: DC_CORPORATE_REGISTRATION_LAYER_URL,
      publisher: "District of Columbia Department of Licensing and Consumer Protection",
      selected_schema_fingerprint: DC_CORPORATE_REGISTRATION_SCHEMA_FINGERPRINT,
      selected_fields: [...DC_CORPORATE_REGISTRATION_FIELDS],
      active_statuses: [...DC_CORPORATE_REGISTRATION_ACTIVE_STATUSES],
      max_dcs_last_mod_dttm: preflight.controls.max_dcs_last_mod_dttm,
      input_filename: path.basename(sourceRealPath),
      input_bytes: inputDigest.bytes,
      input_sha256: inputDigest.sha256,
    },
    preflight_observation_fingerprint: preflight.source_observation_fingerprint,
    policy_id: "dc-corporate-registration",
    rights: {
      district_data_terms: "CC0 1.0 Universal unless otherwise noted",
      district_data_terms_url: "https://dc.gov/page/terms-and-conditions-use-district-data",
      conservative_catalog_license_notice: "CC BY 4.0",
      attribution_required_by_connector: true,
      version_note_required_by_connector: true,
    },
    artifacts: [preflightArtifact, sourceArtifact, normalizedArtifact, summaryArtifact],
    coverage: summary,
    semantics: {
      organization_records_only: true,
      administrative_address_evidence_only: true,
      physical_site_inference_permitted: false,
      establishment_inference_permitted: false,
      geometry_or_geocode_permitted: false,
      operating_status_inference_permitted: false,
      ownership_inference_permitted: false,
    },
    privacy: {
      email_selected: false,
      registered_agent_fields_selected: false,
      normalized_record_level_export: "local-review-only",
    },
    production_pointer_published: false,
    registry_integration_enabled: false,
    coverage_integration_enabled: false,
    heatmap_enabled: false,
    complete_source_snapshot_asserted: false,
    publication: {
      checksum_verified_non_overwriting_release: true,
      filesystem_immutability_asserted: false,
      current_pointer_written: false,
    },
  };
  const manifestPath = path.join(stagingDirectory, "manifest.json");
  await writeFile(manifestPath, json(manifest), { flag: "wx" });
  await verifyDcCorporateRegistrationOffline(manifestPath, { signal });
  const releasesRoot = await ensurePlainDirectory(root, path.join(root, "releases"), "DC corporate-registration releases root");
  const releaseDirectory = path.join(releasesRoot, releaseId);
  try {
    await stat(releaseDirectory);
    throw new Error(`DC corporate-registration release ${releaseId} already exists; refusing to overwrite it.`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await renameWithRetry(stagingDirectory, releaseDirectory);
  promotedReleaseDirectory = releaseDirectory;
  const releaseManifestPath = path.join(releaseDirectory, "manifest.json");
  const verification = await verifyDcCorporateRegistrationOffline(releaseManifestPath, { signal });
  logger({ event: "dc-corporate-registration-offline-build-verified", runId, sourceReleaseId, records: sourceWriter.records });
  return { stagingDirectory: releaseDirectory, releaseDirectory, manifestPath: releaseManifestPath, manifest, verification, pointerPath: null };
  } catch (error) {
    if (promotedReleaseDirectory) {
      try {
        await rm(promotedReleaseDirectory, { recursive: true, force: true });
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "DC Corporate Registration build failed and release cleanup was incomplete.");
      }
    }
    throw error;
  } finally {
    await rm(stagingDirectory, { recursive: true, force: true });
  }
}

function containsForbiddenKey(value, pattern) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((child) => containsForbiddenKey(child, pattern));
  return Object.entries(value).some(([key, child]) => pattern.test(key) || containsForbiddenKey(child, pattern));
}

function firstMatchingKeyPath(value, pattern, prefix = "$") {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const nested = firstMatchingKeyPath(value[index], pattern, `${prefix}[${index}]`);
      if (nested) return nested;
    }
    return null;
  }
  for (const [key, child] of Object.entries(value)) {
    if (pattern.test(key)) return `${prefix}.${key}`;
    const nested = firstMatchingKeyPath(child, pattern, `${prefix}.${key}`);
    if (nested) return nested;
  }
  return null;
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new Error(`${label} fields drifted`);
}

function verifyNormalizedRecord(record, source, manifest) {
  exactKeys(record, ["schema_version", "normalized_record_id", "entity_candidate", "external_identifiers", "organization_name", "registration", "administrative_address", "source_status", "identity_resolution", "observed_at", "provenance", "privacy", "export_policy"], "normalized record");
  if (containsForbiddenKey(record, FORBIDDEN_SOURCE_KEY)) throw new Error("prohibited person/contact/agent field leaked into normalized record");
  if (containsForbiddenKey(record, FORBIDDEN_LOCATION_KEY)) throw new Error("geometry, geocode, or location field leaked into normalized record");
  const file = canonicalFileNumber(source.FILE_NUMBER);
  const expectedHash = sha256(file.identity).slice(0, 32);
  if (record.schema_version !== DC_CORPORATE_REGISTRATION_SCHEMA_VERSION || record.normalized_record_id !== `dc-corporate-registration:${expectedHash}` || record.export_policy !== "local-review-only") throw new Error("normalized identity or export policy mismatch");
  if (record.entity_candidate?.organization_id !== `organization:dc_dlcp_corporate_file_${expectedHash}` || record.entity_candidate?.identity_status !== "provisional" || record.entity_candidate?.physical_site_created !== false || record.entity_candidate?.establishment_created !== false) throw new Error("organization-only entity boundary mismatch");
  const fileIdentifier = record.external_identifiers?.find(({ type }) => type === "dc_dlcp_corporate_file_number");
  if (fileIdentifier?.value !== file.source || fileIdentifier?.source_field !== "FILE_NUMBER" || fileIdentifier?.candidate_key !== true) throw new Error("FILE_NUMBER provenance mismatch");
  if (record.organization_name?.business_name !== textValue(source.BUSINESS_NAME) || record.organization_name?.suffix !== textValue(source.SUFFIX)) throw new Error("organization name mismatch");
  if (record.registration?.entity_status !== source.ENTITY_STATUS || record.registration?.active_source_defined !== true || !ACTIVE_STATUS_SET.has(record.registration.entity_status) || record.registration?.model_type !== source.MODELTYPE) throw new Error("registration status or model mismatch");
  const sourcePostcode = textValue(source.ZIPCODE);
  const expectedPostcode = splitDcCorporateRegistrationPostcode(source.ZIPCODE, source.BUSINESS_COUNTRY, source.BUSINESS_STATE);
  const address = record.administrative_address;
  if (address?.scope !== "corporate-registration-business-address-administrative-evidence-only" || address?.physical_site_asserted !== false || address?.establishment_asserted !== false) throw new Error("administrative-address semantic boundary mismatch");
  if (address?.zip_code != null && !/^\d{5}$/.test(address.zip_code)) throw new Error("joined or invalid ZIP5 in normalized record");
  if (address?.postal_code != null && !/^\d{5}$/.test(address.postal_code)) throw new Error("joined or invalid postal_code in normalized record");
  if (address?.zip4 != null && !/^\d{4}$/.test(address.zip4)) throw new Error("joined or invalid ZIP+4 extension in normalized record");
  if ((address?.zip_code ?? null) !== expectedPostcode.zip_code || (address?.postal_code ?? null) !== expectedPostcode.postal_code || (address?.zip4 ?? null) !== expectedPostcode.zip4 || (address?.source_postcode ?? null) !== sourcePostcode) throw new Error("normalized ZIP5/ZIP+4 separation mismatch");
  if (record.source_status?.current_operation_asserted !== false || record.identity_resolution?.ownership_inference_permitted !== false) throw new Error("operation or ownership inference boundary mismatch");
  if (record.provenance?.source_release_id !== manifest.source_release_id || record.provenance?.source_record_id !== `FILE_NUMBER:${file.source}` || record.provenance?.source_objectid !== Number(source.OBJECTID) || record.provenance?.source_globalid !== canonicalGlobalId(source.GLOBALID) || record.provenance?.policy_id !== "dc-corporate-registration") throw new Error("normalized provenance mismatch");
  if (record.privacy?.person_contact_agent_fields_selected !== false || record.privacy?.record_level_export_requires_separate_privacy_review !== true) throw new Error("privacy boundary mismatch");
}

export async function verifyDcCorporateRegistrationOffline(manifestPath, { signal } = {}) {
  signal?.throwIfAborted?.();
  const governedRoot = await realpath(DATAHUB_ROOT);
  const absoluteManifestPath = path.resolve(manifestPath);
  assertContained(governedRoot, absoluteManifestPath, "DC corporate-registration manifest");
  const manifestInfo = await lstat(absoluteManifestPath);
  if (!manifestInfo.isFile() || manifestInfo.isSymbolicLink() || manifestInfo.nlink !== 1) throw new Error("DC Corporate Registration manifest must be a regular non-link, non-hardlinked file.");
  const realManifestPath = await realpath(absoluteManifestPath);
  assertContained(governedRoot, realManifestPath, "DC corporate-registration manifest");
  const releaseDirectory = path.dirname(realManifestPath);
  let manifest;
  try {
    manifest = JSON.parse(await readFile(realManifestPath, "utf8"));
  } catch (error) {
    throw new Error(`DC Corporate Registration offline staging verification failed: ${error.message}`);
  }
  const failures = [];
  try {
    const manifestOutsideDeclaredPrivacy = { ...manifest };
    delete manifestOutsideDeclaredPrivacy.privacy;
    const prohibitedPath = firstMatchingKeyPath(manifestOutsideDeclaredPrivacy, FORBIDDEN_SOURCE_KEY)
      ?? firstMatchingKeyPath(manifestOutsideDeclaredPrivacy, FORBIDDEN_ROW_CONTAINER_KEY);
    if (prohibitedPath) throw new Error(`manifest contains a prohibited row container at ${prohibitedPath}`);
    exactKeys(manifest, ["schema_version", "dataset_id", "release_id", "source_release_id", "status", "connector", "run_id", "created_at", "source", "preflight_observation_fingerprint", "policy_id", "rights", "artifacts", "coverage", "semantics", "privacy", "production_pointer_published", "registry_integration_enabled", "coverage_integration_enabled", "heatmap_enabled", "complete_source_snapshot_asserted", "publication"], "manifest");
    exactKeys(manifest.connector, ["id", "version"], "manifest connector");
    exactKeys(manifest.source, ["item_id", "catalog_url", "layer_url", "publisher", "selected_schema_fingerprint", "selected_fields", "active_statuses", "max_dcs_last_mod_dttm", "input_filename", "input_bytes", "input_sha256"], "manifest source");
    exactKeys(manifest.rights, ["district_data_terms", "district_data_terms_url", "conservative_catalog_license_notice", "attribution_required_by_connector", "version_note_required_by_connector"], "manifest rights");
    exactKeys(manifest.coverage, ["source_active_records", "normalized_provisional_organizations", "administrative_address_evidence_records", "zip5_records", "zip4_records", "status_counts", "model_type_counts", "duplicate_file_numbers_rejected", "person_contact_agent_fields_selected", "physical_sites", "establishments", "business_geometries", "business_geocodes"], "manifest coverage");
    exactKeys(manifest.semantics, ["organization_records_only", "administrative_address_evidence_only", "physical_site_inference_permitted", "establishment_inference_permitted", "geometry_or_geocode_permitted", "operating_status_inference_permitted", "ownership_inference_permitted"], "manifest semantics");
    exactKeys(manifest.privacy, ["email_selected", "registered_agent_fields_selected", "normalized_record_level_export"], "manifest privacy");
    exactKeys(manifest.publication, ["checksum_verified_non_overwriting_release", "filesystem_immutability_asserted", "current_pointer_written"], "manifest publication");
  } catch (error) {
    failures.push({ path: "manifest.json", reason: error.message });
  }
  if (manifest.dataset_id !== DC_CORPORATE_REGISTRATION_DATASET_ID || manifest.status !== "verified-local-review-only" || manifest.connector?.id !== "dc-corporate-registration" || manifest.connector?.version !== DC_CORPORATE_REGISTRATION_CONNECTOR_VERSION || manifest.policy_id !== "dc-corporate-registration") failures.push({ path: "manifest.json", reason: "dataset, connector, status, or policy mismatch" });
  if (manifest.source?.item_id !== DC_CORPORATE_REGISTRATION_ITEM_ID || manifest.source?.catalog_url !== DC_CORPORATE_REGISTRATION_CATALOG_URL || manifest.source?.layer_url !== DC_CORPORATE_REGISTRATION_LAYER_URL || manifest.source?.publisher !== "District of Columbia Department of Licensing and Consumer Protection" || manifest.source?.selected_schema_fingerprint !== DC_CORPORATE_REGISTRATION_SCHEMA_FINGERPRINT || JSON.stringify(manifest.source?.selected_fields) !== JSON.stringify(DC_CORPORATE_REGISTRATION_FIELDS) || JSON.stringify(manifest.source?.active_statuses) !== JSON.stringify(DC_CORPORATE_REGISTRATION_ACTIVE_STATUSES)) failures.push({ path: "manifest.json", reason: "source identity, schema, or active-status contract mismatch" });
  if (manifest.production_pointer_published !== false || manifest.registry_integration_enabled !== false || manifest.coverage_integration_enabled !== false || manifest.heatmap_enabled !== false || manifest.complete_source_snapshot_asserted !== false) failures.push({ path: "manifest.json", reason: "local-review-only publication boundary was overstated" });
  if (manifest.semantics?.organization_records_only !== true || manifest.semantics?.administrative_address_evidence_only !== true || manifest.semantics?.physical_site_inference_permitted !== false || manifest.semantics?.establishment_inference_permitted !== false || manifest.semantics?.geometry_or_geocode_permitted !== false || manifest.semantics?.operating_status_inference_permitted !== false || manifest.semantics?.ownership_inference_permitted !== false) failures.push({ path: "manifest.json", reason: "organization/address semantic boundary mismatch" });
  if (manifest.privacy?.email_selected !== false || manifest.privacy?.registered_agent_fields_selected !== false || manifest.privacy?.normalized_record_level_export !== "local-review-only") failures.push({ path: "manifest.json", reason: "privacy boundary mismatch" });
  if (manifest.rights?.district_data_terms !== "CC0 1.0 Universal unless otherwise noted" || manifest.rights?.district_data_terms_url !== "https://dc.gov/page/terms-and-conditions-use-district-data" || manifest.rights?.conservative_catalog_license_notice !== "CC BY 4.0" || manifest.rights?.attribution_required_by_connector !== true || manifest.rights?.version_note_required_by_connector !== true) failures.push({ path: "manifest.json", reason: "terms, attribution, or version-note contract mismatch" });
  try {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(manifest.run_id ?? "")) throw new Error("run identity is invalid");
    const createdAt = new Date(manifest.created_at);
    if (Number.isNaN(createdAt.getTime()) || createdAt.toISOString() !== manifest.created_at) throw new Error("created_at is invalid");
    if (!/^[a-f0-9]{64}$/.test(manifest.source?.input_sha256 ?? "") || !Number.isSafeInteger(manifest.source?.input_bytes) || manifest.source.input_bytes < 1) throw new Error("input digest metadata is invalid");
    if (typeof manifest.source.input_filename !== "string" || !manifest.source.input_filename || path.basename(manifest.source.input_filename) !== manifest.source.input_filename) throw new Error("input filename metadata is invalid");
    const expectedSourceReleaseId = `dc-corporate-registration-${releaseTimestamp(manifest.source.max_dcs_last_mod_dttm)}-${manifest.source.input_sha256.slice(0, 16)}`;
    const expectedReleaseId = `${expectedSourceReleaseId}-${manifest.run_id.slice(0, 8)}`;
    if (manifest.source_release_id !== expectedSourceReleaseId || manifest.release_id !== expectedReleaseId) throw new Error("release identity is not bound to source time, checksum, and run");
    if (manifest.publication?.checksum_verified_non_overwriting_release !== true || manifest.publication?.filesystem_immutability_asserted !== false || manifest.publication?.current_pointer_written !== false) throw new Error("publication boundary mismatch");
  } catch (error) {
    failures.push({ path: "manifest.json", reason: error.message });
  }
  const artifacts = manifest.artifacts ?? [];
  const expectedArtifactTypes = new Set([
    "dc-corporate-registration-preflight-receipt-json",
    "dc-corporate-registration-selected-active-source-jsonl-gzip",
    "normalized-dc-corporate-registration-organization-jsonl-gzip",
    "dc-corporate-registration-source-summary-json",
  ]);
  const artifactTypes = new Set();
  const artifactPaths = new Set();
  const artifactFiles = new Map();
  if (!Array.isArray(artifacts) || artifacts.length !== expectedArtifactTypes.size) failures.push({ path: "manifest.json", reason: "expected exactly four governed artifacts" });
  for (const artifact of artifacts) {
    signal?.throwIfAborted?.();
    try {
      if (!artifact || typeof artifact.path !== "string" || !expectedArtifactTypes.has(artifact.artifact_type)) throw new Error("unexpected artifact contract");
      const expectedArtifactKeys = artifact.artifact_type.includes("jsonl-gzip")
        ? ["path", "bytes", "sha256", "record_count", "artifact_type", "export_policy"]
        : ["path", "bytes", "sha256", "artifact_type", "export_policy"];
      exactKeys(artifact, expectedArtifactKeys, `artifact ${artifact.artifact_type}`);
      if (artifactTypes.has(artifact.artifact_type) || artifactPaths.has(artifact.path)) throw new Error("duplicate artifact type or path");
      artifactTypes.add(artifact.artifact_type);
      artifactPaths.add(artifact.path);
      const filename = path.resolve(releaseDirectory, artifact.path);
      assertContained(releaseDirectory, filename, `Artifact ${artifact.path}`);
      const information = await lstat(filename);
      if (!information.isFile() || information.isSymbolicLink() || information.nlink !== 1) throw new Error("artifact must be a regular non-link, non-hardlinked file");
      const realFilename = await realpath(filename);
      assertContained(releaseDirectory, realFilename, `Artifact ${artifact.path}`);
      const digest = await hashFile(realFilename);
      if (digest.bytes !== artifact.bytes || digest.sha256 !== artifact.sha256) throw new Error("checksum or byte count mismatch");
      artifactFiles.set(artifact.path, realFilename);
    } catch (error) {
      failures.push({ path: artifact.path, reason: error.message });
    }
  }
  if (artifactTypes.size !== expectedArtifactTypes.size) failures.push({ path: "manifest.json", reason: "artifact inventory does not match the exact contract" });
  const sourceArtifact = artifacts.find(({ artifact_type: type }) => type === "dc-corporate-registration-selected-active-source-jsonl-gzip");
  const normalizedArtifact = artifacts.find(({ artifact_type: type }) => type === "normalized-dc-corporate-registration-organization-jsonl-gzip");
  const receiptArtifact = artifacts.find(({ artifact_type: type }) => type === "dc-corporate-registration-preflight-receipt-json");
  const summaryArtifact = artifacts.find(({ artifact_type: type }) => type === "dc-corporate-registration-source-summary-json");
  let receipt;
  try {
    if (!receiptArtifact) throw new Error("missing preflight receipt artifact");
    receipt = JSON.parse(await readFile(artifactFiles.get(receiptArtifact.path), "utf8"));
    validateDcCorporateRegistrationPreflightReceipt(receipt);
    if (receipt.source_observation_fingerprint !== manifest.preflight_observation_fingerprint || receipt.controls.max_dcs_last_mod_dttm !== manifest.source.max_dcs_last_mod_dttm) throw new Error("preflight linkage mismatch");
  } catch (error) {
    failures.push({ path: receiptArtifact?.path ?? "control/preflight-receipt.json", reason: error.message });
  }
  const sources = new Map();
  const statusCounts = new Map();
  const modelTypeCounts = new Map();
  let sourceRowsRead = 0;
  try {
    if (!sourceArtifact || sourceArtifact.export_policy !== "internal") throw new Error("missing or misclassified selected source artifact");
    for await (const raw of gzipRows(artifactFiles.get(sourceArtifact.path))) {
      signal?.throwIfAborted?.();
      const source = exactSourceRecord(raw);
      const file = canonicalFileNumber(source.FILE_NUMBER);
      if (sources.has(file.identity)) throw new Error("duplicate FILE_NUMBER in source artifact");
      if (!ACTIVE_STATUS_SET.has(source.ENTITY_STATUS)) throw new Error("historical status leaked into active source artifact");
      canonicalGlobalId(source.GLOBALID);
      objectId(source.OBJECTID);
      sources.set(file.identity, source);
      sourceRowsRead += 1;
      statusCounts.set(source.ENTITY_STATUS, (statusCounts.get(source.ENTITY_STATUS) ?? 0) + 1);
      modelTypeCounts.set(source.MODELTYPE, (modelTypeCounts.get(source.MODELTYPE) ?? 0) + 1);
    }
    if (sourceRowsRead !== sourceArtifact.record_count || sourceRowsRead !== receipt?.controls?.active_records) throw new Error("selected active source count mismatch");
  } catch (error) {
    failures.push({ path: sourceArtifact?.path ?? "source/selected-active-corporate-registration.jsonl.gz", reason: error.message });
  }
  let normalizedRows = 0;
  const normalizedIds = new Set();
  let verifiedAddresses = 0;
  let verifiedZip5 = 0;
  let verifiedZip4 = 0;
  try {
    if (!normalizedArtifact || normalizedArtifact.export_policy !== "local-review-only") throw new Error("missing or misclassified normalized artifact");
    for await (const record of gzipRows(artifactFiles.get(normalizedArtifact.path))) {
      signal?.throwIfAborted?.();
      const fileValue = record.external_identifiers?.find(({ type }) => type === "dc_dlcp_corporate_file_number")?.value;
      const file = canonicalFileNumber(fileValue);
      const source = sources.get(file.identity);
      if (!source) throw new Error("normalized record has no selected source row");
      if (normalizedIds.has(record.normalized_record_id)) throw new Error("duplicate normalized identity");
      normalizedIds.add(record.normalized_record_id);
      verifyNormalizedRecord(record, source, manifest);
      const expected = normalizedRecord(source, { observedAt: receipt.observed_at, sourceReleaseId: manifest.source_release_id, runId: manifest.run_id });
      if (JSON.stringify(record) !== JSON.stringify(expected)) throw new Error("normalized record does not reproduce exactly from selected source");
      if (record.administrative_address.address_lines.length || record.administrative_address.city || record.administrative_address.state || record.administrative_address.source_postcode) verifiedAddresses += 1;
      if (record.administrative_address.zip_code) verifiedZip5 += 1;
      if (record.administrative_address.zip4) verifiedZip4 += 1;
      normalizedRows += 1;
    }
    if (normalizedRows !== normalizedArtifact.record_count || normalizedRows !== sourceRowsRead || normalizedIds.size !== sources.size) throw new Error("normalized/source record count mismatch");
  } catch (error) {
    failures.push({ path: normalizedArtifact?.path ?? "normalized/organizations.jsonl.gz", reason: error.message });
  }
  try {
    if (!summaryArtifact || summaryArtifact.export_policy !== "internal") throw new Error("missing or misclassified summary artifact");
    const summary = JSON.parse(await readFile(artifactFiles.get(summaryArtifact.path), "utf8"));
    if (containsForbiddenKey(summary, FORBIDDEN_SOURCE_KEY) || containsForbiddenKey(summary, FORBIDDEN_ROW_CONTAINER_KEY)) throw new Error("summary contains prohibited person/contact/agent fields or row data");
    exactKeys(summary, ["source_active_records", "normalized_provisional_organizations", "administrative_address_evidence_records", "zip5_records", "zip4_records", "status_counts", "model_type_counts", "duplicate_file_numbers_rejected", "person_contact_agent_fields_selected", "physical_sites", "establishments", "business_geometries", "business_geocodes"], "summary");
    if (JSON.stringify(summary) !== JSON.stringify(manifest.coverage)) throw new Error("summary and manifest coverage differ");
    if (summary.source_active_records !== sourceRowsRead || summary.normalized_provisional_organizations !== normalizedRows || summary.administrative_address_evidence_records !== verifiedAddresses || summary.zip5_records !== verifiedZip5 || summary.zip4_records !== verifiedZip4 || summary.duplicate_file_numbers_rejected !== true || summary.physical_sites !== 0 || summary.establishments !== 0 || summary.business_geometries !== 0 || summary.business_geocodes !== 0 || summary.person_contact_agent_fields_selected !== false || JSON.stringify(summary.status_counts) !== JSON.stringify(sortedCounts(statusCounts)) || JSON.stringify(summary.model_type_counts) !== JSON.stringify(sortedCounts(modelTypeCounts))) throw new Error("summary controls do not match verified artifacts");
  } catch (error) {
    failures.push({ path: summaryArtifact?.path ?? "quality/summary.json", reason: error.message });
  }
  if (failures.length) {
    const error = new Error("DC Corporate Registration offline staging verification failed.");
    error.failures = failures;
    throw error;
  }
  return {
    dataset_id: manifest.dataset_id,
    release_id: manifest.release_id,
    artifact_count: artifacts.length,
    verified_bytes: artifacts.reduce((sum, artifact) => sum + artifact.bytes, 0),
    coverage: manifest.coverage,
  };
}
