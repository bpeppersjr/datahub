import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { finished } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";
import proj4 from "proj4";
import { assertNormalizedUsPostalFieldsDeep } from "./normalized-us-postal-code.mjs";

export const DC_BASIC_BUSINESS_LICENSE_SCHEMA_VERSION = "1.0.0";
export const DC_BASIC_BUSINESS_LICENSE_TRANSFORMATION_VERSION = "dc-basic-business-licenses@1.0.1";
export const DC_BASIC_BUSINESS_LICENSE_LAYER_URL = "https://maps2.dcgis.dc.gov/dcgis/rest/services/FEEDS/DCRA/FeatureServer/0";
export const DC_BASIC_BUSINESS_LICENSE_QUERY_URL = `${DC_BASIC_BUSINESS_LICENSE_LAYER_URL}/query`;
export const DC_BASIC_BUSINESS_LICENSE_PAGE_URL = "https://opendata.dc.gov/datasets/DCGIS::basic-business-licenses";
export const DC_BASIC_BUSINESS_LICENSE_ITEM_ID = "85bf98d3915f412c8a4de706f2d13513";
export const DC_BASIC_BUSINESS_LICENSE_FILTER = "LICENSESTATUS='Active' AND LICENSETYPE='Business License'";
export const DC_BASIC_BUSINESS_LICENSE_SCHEMA = Object.freeze([
  ["CUSTOMERNUMBER", "esriFieldTypeString", 30],
  ["LICENSESTATUS", "esriFieldTypeString", 50],
  ["LICENSETYPE", "esriFieldTypeString", 30],
  ["LICENSESTATUSDATE", "esriFieldTypeDate", 8],
  ["LICENSESTARTDATE", "esriFieldTypeDate", 8],
  ["LICENSEENDDATE", "esriFieldTypeDate", 8],
  ["INITIALISSUEDATE", "esriFieldTypeDate", 8],
  ["BUSINESSACTIVITY", "esriFieldTypeString", 50],
  ["PREMISEADDRESS", "esriFieldTypeString", 200],
  ["PREMISEINDC", "esriFieldTypeString", 5],
  ["ENTITYNAME", "esriFieldTypeString", 200],
  ["ENTITYTRADENAME", "esriFieldTypeString", 300],
  ["ENTITYTYPE", "esriFieldTypeString", 100],
  ["PRIMARYACTIVITYFLAG", "esriFieldTypeString", 50],
  ["CATEGORYSERVICETYPE", "esriFieldTypeString", 50],
  ["DATAREFRESHEDON", "esriFieldTypeDate", 8],
  ["WARD", "esriFieldTypeString", 10],
  ["ANC", "esriFieldTypeString", 20],
  ["SMD", "esriFieldTypeString", 20],
  ["DISTRICT", "esriFieldTypeString", 60],
  ["PSA", "esriFieldTypeString", 10],
  ["NEIGHBORHOODCLUSTER", "esriFieldTypeString", 16],
  ["BUSINESSIMPROVEMENTDISTRICT", "esriFieldTypeString", 100],
  ["MAINSTREET", "esriFieldTypeString", 50],
  ["MAR_ID", "esriFieldTypeDouble", null],
  ["X_COORDINATE", "esriFieldTypeDouble", null],
  ["Y_COORDINATE", "esriFieldTypeDouble", null],
  ["GLOBALID", "esriFieldTypeGlobalID", 38],
  ["OBJECTID", "esriFieldTypeOID", null],
]);
export const DC_BASIC_BUSINESS_LICENSE_FIELDS = Object.freeze(DC_BASIC_BUSINESS_LICENSE_SCHEMA.map(([field]) => field));
export const DC_BASIC_BUSINESS_LICENSE_SCHEMA_FINGERPRINT = "17ea137c871a939a38f1c692aec555e25740b34fd617a87d4b287c9fe7f332c6";

const MARYLAND_STATE_PLANE_NAD83 = "+proj=lcc +lat_0=37.66666666666666 +lon_0=-77 +lat_1=38.3 +lat_2=39.45 +x_0=400000 +y_0=0 +datum=NAD83 +units=m +no_defs";
proj4.defs("EPSG:26985", MARYLAND_STATE_PLANE_NAD83);

const US_STATE_AND_TERRITORY_CODES = new Set([
  "AL", "AK", "AS", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "GU", "HI", "ID", "IL", "IN", "IA", "KS", "KY",
  "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "MP", "OH", "OK",
  "OR", "PA", "PR", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "VI", "WA", "WV", "WI", "WY",
]);
const QUARANTINE_REASONS = new Set([
  "missing-publishable-business-name",
  "missing-or-invalid-dc-customer-number",
  "missing-or-invalid-source-global-id",
  "source-row-not-active-business-license",
  "source-active-license-expired-at-observation",
  "invalid-or-unmapped-us-zip",
  "invalid-source-state",
  "source-state-conflicts-with-postal-label",
  "invalid-or-non-us-premise-address",
  "po-box-not-physical-premise",
  "source-premise-in-dc-conflicts-with-address-state",
  "conflicting-license-account",
  "invalid-source-coordinate",
]);
const EXCLUDED_SOURCE_FIELDS = new Set([
  "BUSINESSOWNERFIRSTNAME", "BUSINESSOWNERLASTNAME", "BUSINESSOWNERMIDDLENAME", "BILLINGADDRESS",
  "AGENTFIRSTNAME", "AGENTLASTNAME", "AGENTMIDDLENAME", "AGENTENTITY", "SSL", "LATITUDE", "LONGITUDE",
]);

function textValue(value) {
  const result = String(value ?? "").trim();
  return result || null;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
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

function json(value) {
  return `${JSON.stringify(value)}\n`;
}

function jsonLines(records) {
  return records.length ? `${records.map((record) => JSON.stringify(record)).join("\n")}\n` : "";
}

function releaseTimestamp(instant) {
  return instant.replaceAll(/[-:.]/g, "").replace("T", "-").replace("Z", "Z");
}

function compareText(left, right) {
  return String(left ?? "").localeCompare(String(right ?? ""), "en", { numeric: true });
}

function uniqueText(records, field) {
  return [...new Set(records.map((record) => textValue(record[field])).filter(Boolean))].sort(compareText);
}

function exactIntegerText(value, label) {
  const result = textValue(value);
  if (!/^\d+$/.test(result ?? "") || BigInt(result) <= 0n) throw new Error(`missing-or-invalid-${label}`);
  return result;
}

function sourceDate(value, label, required = false) {
  if (value === null || value === undefined || value === "") {
    if (required) throw new Error(`missing-${label}`);
    return null;
  }
  const number = Number(value);
  const date = Number.isFinite(number) ? new Date(number) : new Date(String(value));
  if (Number.isNaN(date.valueOf())) throw new Error(`invalid-${label}`);
  return date.toISOString().slice(0, 10);
}

function sourceInstant(value, label) {
  const number = Number(value);
  const date = Number.isFinite(number) ? new Date(number) : new Date(String(value));
  if (Number.isNaN(date.valueOf())) throw new Error(`invalid-${label}`);
  return date.toISOString();
}

function canonicalGlobalId(value) {
  const result = textValue(value)?.toUpperCase();
  if (!/^\{[0-9A-F]{8}(?:-[0-9A-F]{4}){3}-[0-9A-F]{12}\}$/.test(result ?? "")) throw new Error("missing-or-invalid-source-global-id");
  return result;
}

function parsePremiseAddress(value, premiseInDc, baselineByZip) {
  const raw = textValue(value);
  if (!raw || /\[(?:REDACTED|ADDRESS[^\]]*)\]|ADDRESS\s+(?:NOT|UN)AVAILABLE/i.test(raw)) throw new Error("invalid-or-non-us-premise-address");
  if (/\bP\.?\s*O\.?\s+BOX\b|\bPOST\s+OFFICE\s+BOX\b/i.test(raw)) throw new Error("po-box-not-physical-premise");
  const match = raw.match(/^(.*),\s*([^,]+),\s*([A-Za-z]{2}),\s*(\d{5})(?:-?(\d{4}))?,\s*(?:USA|US|UNITED STATES)\s*$/i);
  if (!match) throw new Error("invalid-or-non-us-premise-address");
  const street = textValue(match[1]);
  const city = textValue(match[2]);
  const state = match[3].toUpperCase();
  const zipCode = match[4];
  const zip4 = match[5] ?? null;
  if (!street || !city) throw new Error("invalid-or-non-us-premise-address");
  if (!US_STATE_AND_TERRITORY_CODES.has(state)) throw new Error("invalid-source-state");
  const baseline = baselineByZip?.get(zipCode);
  if (!baseline) throw new Error("invalid-or-unmapped-us-zip");
  const postalState = textValue(baseline.postal_label?.preferred_state)?.toUpperCase() ?? null;
  if (postalState && postalState !== state) throw new Error("source-state-conflicts-with-postal-label");
  const inDc = textValue(premiseInDc)?.toLowerCase();
  if (!new Set(["yes", "no"]).has(inDc)) throw new Error("source-premise-in-dc-conflicts-with-address-state");
  if ((inDc === "yes") !== (state === "DC")) throw new Error("source-premise-in-dc-conflicts-with-address-state");
  return {
    address_line: street,
    city,
    state,
    zip_code: zipCode,
    zip4,
    postal_code: zipCode,
    country: "US",
    source_value: raw,
    source_premise_in_dc: inDc === "yes",
    validation_status: zip4 ? "normalized-us-premise-zip-plus-4" : "normalized-us-premise-zip5",
  };
}

export function projectDcMarylandStatePlane(x, y) {
  const east = Number(x);
  const north = Number(y);
  if (!Number.isFinite(east) || !Number.isFinite(north) || east < 300000 || east > 500000 || north < 50000 || north > 250000) throw new Error("invalid-source-coordinate");
  const [longitude, latitude] = proj4("EPSG:26985", "EPSG:4326", [east, north]);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || longitude < -78.5 || longitude > -75.5 || latitude < 37.5 || latitude > 40.5) throw new Error("invalid-source-coordinate");
  return [Number(longitude.toFixed(7)), Number(latitude.toFixed(7))];
}

function sourceLocation(records, sourcePremiseInDc) {
  const observations = new Map();
  for (const record of records) {
    const xText = textValue(record.X_COORDINATE);
    const yText = textValue(record.Y_COORDINATE);
    if (!xText && !yText) continue;
    if (!xText || !yText) throw new Error("invalid-source-coordinate");
    const x = Number(xText);
    const y = Number(yText);
    const coordinates = projectDcMarylandStatePlane(x, y);
    observations.set(`${x.toFixed(3)}:${y.toFixed(3)}`, { x, y, coordinates });
  }
  if (!observations.size) return null;
  if (!sourcePremiseInDc) throw new Error("invalid-source-coordinate");
  if (observations.size > 1) {
    return {
      type: "Point",
      coordinates: null,
      coordinate_scope: "conflicting-source-mar-coordinates-suppressed",
      source_crs: "EPSG:26985",
      output_crs: "EPSG:4326",
      transformation: "proj4@2.22.0",
      independently_verified: false,
    };
  }
  const observation = [...observations.values()][0];
  const withinBroadDcBounds = observation.coordinates[0] >= -77.13 && observation.coordinates[0] <= -76.90 && observation.coordinates[1] >= 38.79 && observation.coordinates[1] <= 39.00;
  return {
    type: "Point",
    coordinates: observation.coordinates,
    source_coordinate: { x: observation.x, y: observation.y },
    source_crs: "EPSG:26985",
    output_crs: "EPSG:4326",
    coordinate_scope: "dc-master-address-repository-geocode-not-independently-verified-current-occupancy",
    transformation: "proj4@2.22.0",
    plausibility: withinBroadDcBounds ? "within-broad-dc-bounds" : "outside-broad-dc-bounds",
    independently_verified: false,
  };
}

function sourceGeography(records, address, baseline) {
  return {
    zip_code: address.zip_code,
    source_reported_state: address.state,
    postal_label_state: textValue(baseline.postal_label?.preferred_state)?.toUpperCase() ?? null,
    state_consistency: baseline.postal_label?.preferred_state ? "source-matches-census-zbp-postal-label" : "postal-label-state-not-available",
    zcta_match_status: baseline.geography?.status ?? "no-2020-zcta-polygon",
    zcta_geo_id: baseline.geography?.geo_id ?? null,
    zcta_geoid: baseline.geography?.geoid ?? null,
    zcta_geometry_file: baseline.geography?.geometry_file ?? null,
    dc_source_geography: {
      assignment_status: address.source_premise_in_dc ? "source-reported-dc-geography" : "out-of-district-premise",
      wards: uniqueText(records, "WARD"),
      advisory_neighborhood_commissions: uniqueText(records, "ANC"),
      single_member_districts: uniqueText(records, "SMD"),
      police_districts: uniqueText(records, "DISTRICT"),
      police_service_areas: uniqueText(records, "PSA"),
      neighborhood_clusters: uniqueText(records, "NEIGHBORHOODCLUSTER"),
      business_improvement_districts: uniqueText(records, "BUSINESSIMPROVEMENTDISTRICT"),
      main_streets: uniqueText(records, "MAINSTREET"),
      independently_verified: false,
    },
  };
}

function provenance(context, customerNumber, globalIds) {
  return {
    source_id: "dc-dlcp-active-basic-business-licenses",
    source_release_id: context.sourceReleaseId,
    source_record_id: `customer:${customerNumber}`,
    source_record_ids: globalIds,
    ingest_run_id: context.runId,
    transformation_version: DC_BASIC_BUSINESS_LICENSE_TRANSFORMATION_VERSION,
    policy_id: "dc-basic-business-licenses",
  };
}

export function normalizeDcBasicBusinessLicenseSite(sourceRecords, context) {
  if (!Array.isArray(sourceRecords) || !sourceRecords.length) throw new Error("conflicting-license-account");
  const customerNumber = exactIntegerText(sourceRecords[0].CUSTOMERNUMBER, "dc-customer-number");
  for (const record of sourceRecords) {
    if (exactIntegerText(record.CUSTOMERNUMBER, "dc-customer-number") !== customerNumber) throw new Error("conflicting-license-account");
    if (textValue(record.LICENSESTATUS) !== "Active" || textValue(record.LICENSETYPE) !== "Business License") throw new Error("source-row-not-active-business-license");
  }
  const globalIds = sourceRecords.map((record) => canonicalGlobalId(record.GLOBALID)).sort(compareText);
  if (new Set(globalIds).size !== globalIds.length) throw new Error("conflicting-license-account");
  const legalNames = uniqueText(sourceRecords, "ENTITYNAME");
  const tradeNames = uniqueText(sourceRecords, "ENTITYTRADENAME");
  if (!legalNames.length && !tradeNames.length) throw new Error("missing-publishable-business-name");
  if (legalNames.length > 1 || tradeNames.length > 1) throw new Error("conflicting-license-account");
  const premises = uniqueText(sourceRecords, "PREMISEADDRESS");
  const premiseFlags = uniqueText(sourceRecords, "PREMISEINDC");
  if (premises.length !== 1 || premiseFlags.length !== 1) throw new Error("conflicting-license-account");
  const address = parsePremiseAddress(premises[0], premiseFlags[0], context.baselineByZip);
  const baseline = context.baselineByZip.get(address.zip_code);
  const licenseEndDates = sourceRecords.map((record) => sourceDate(record.LICENSEENDDATE, "license-end-date", true));
  if (licenseEndDates.some((date) => `${date}T23:59:59.999Z` < context.retrievedAt)) throw new Error("source-active-license-expired-at-observation");
  const location = sourceLocation(sourceRecords, address.source_premise_in_dc);
  const marIds = [...new Set(sourceRecords.map((record) => Number(record.MAR_ID)).filter((value) => Number.isFinite(value) && value > 0))].sort((a, b) => a - b);
  if (marIds.length > 1) throw new Error("conflicting-license-account");
  const activities = sourceRecords.map((record) => ({
    source_global_id: canonicalGlobalId(record.GLOBALID),
    business_activity: textValue(record.BUSINESSACTIVITY),
    category_service_type: textValue(record.CATEGORYSERVICETYPE),
    primary_activity: textValue(record.PRIMARYACTIVITYFLAG)?.toLowerCase() === "yes",
    license_status: "Active",
    license_type: "Business License",
    license_status_date: sourceDate(record.LICENSESTATUSDATE, "license-status-date"),
    license_start_date: sourceDate(record.LICENSESTARTDATE, "license-start-date"),
    license_end_date: sourceDate(record.LICENSEENDDATE, "license-end-date", true),
    initial_issue_date: sourceDate(record.INITIALISSUEDATE, "initial-issue-date"),
  })).sort((left, right) => Number(right.primary_activity) - Number(left.primary_activity) || compareText(left.business_activity, right.business_activity) || compareText(left.source_global_id, right.source_global_id));
  const organizationId = `organization:dc_dlcp_customer_${customerNumber}`;
  const siteId = `site:dc_dlcp_customer_${customerNumber}`;
  const establishmentId = `establishment:dc_dlcp_customer_${customerNumber}`;
  return {
    schema_version: DC_BASIC_BUSINESS_LICENSE_SCHEMA_VERSION,
    normalized_record_id: `dc-basic-business-license:customer:${customerNumber}`,
    entity_candidates: { organization_id: organizationId, physical_site_id: siteId, establishment_id: establishmentId, identity_status: "provisional" },
    external_identifiers: [
      { type: "dc-dlcp-customer-number", value: customerNumber, scope: "source-license-customer-account" },
      ...globalIds.map((value) => ({ type: "dc-dlcp-global-id", value, scope: "source-business-activity-row" })),
      ...(marIds.length ? [{ type: "dc-master-address-repository-id", value: String(marIds[0]), scope: "source-premise-geocode" }] : []),
    ],
    legal_names: legalNames,
    trade_names: tradeNames,
    entity_types: uniqueText(sourceRecords, "ENTITYTYPE"),
    address,
    location,
    geography: sourceGeography(sourceRecords, address, baseline),
    active_license_activities: activities,
    source_status: {
      value: "listed-as-active-business-license-in-official-dc-dlcp-feed-at-source-refresh",
      status: "Active Basic Business License (source-defined)",
      semantics: "municipal-license-evidence-not-independent-proof-of-continuous-operation-public-access-or-complete-business-coverage",
      data_refreshed_on: context.sourceRefreshedAt,
    },
    privacy: {
      contains_possible_natural_person_or_residential_premise: true,
      owner_agent_and_billing_fields: "excluded-at-query-time",
      parcel_and_rounded_coordinate_fields: "excluded-at-query-time",
      record_level_distribution: "local-review-only",
    },
    observed_at: context.retrievedAt,
    provenance: provenance(context, customerNumber, globalIds),
    export_policy: "local-review-only",
  };
}

export function schemaFingerprint(fields) {
  const byName = new Map((fields ?? []).map((field) => [field.name, field]));
  return sha256(DC_BASIC_BUSINESS_LICENSE_SCHEMA.map(([name]) => {
    const field = byName.get(name);
    return `${name}:${field?.type ?? null}:${field?.length ?? ""}`;
  }).join("\0"));
}

function validateLayerMetadata(metadata, expectedFingerprint = DC_BASIC_BUSINESS_LICENSE_SCHEMA_FINGERPRINT) {
  if (metadata?.name !== "Basic Business License" || metadata?.type !== "Table" || metadata?.objectIdField !== "OBJECTID" || metadata?.globalIdField !== "GLOBALID") throw new Error("Unexpected DC Basic Business License layer identity.");
  if (!String(metadata.capabilities ?? "").split(",").includes("Query")) throw new Error("DC Basic Business License layer does not advertise Query capability.");
  if (!Number.isInteger(metadata.maxRecordCount) || metadata.maxRecordCount < 1) throw new Error("DC Basic Business License layer has an invalid record limit.");
  const fingerprint = schemaFingerprint(metadata.fields);
  if (fingerprint !== expectedFingerprint) throw new Error(`DC selected schema changed (${fingerprint}).`);
  return { fingerprint, maxRecordCount: metadata.maxRecordCount };
}

function validateDcUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "maps2.dcgis.dc.gov") throw new Error("DC ArcGIS URL is outside the allowed HTTPS host.");
  const allowed = new Set([
    "/dcgis/rest/services/FEEDS/DCRA/FeatureServer/0",
    "/dcgis/rest/services/FEEDS/DCRA/FeatureServer/0/query",
  ]);
  if (!allowed.has(url.pathname)) throw new Error("DC ArcGIS URL path is not allowed.");
  return url;
}

export async function requestDcArcGisJson(urlValue, { fetchImpl = fetch, signal, sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)), method = "GET", body = null, attempts = 4 } = {}) {
  const url = validateDcUrl(urlValue);
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
    try {
      const response = await fetchImpl(url, {
        method,
        body: body ? new URLSearchParams(body) : undefined,
        headers: body ? { "content-type": "application/x-www-form-urlencoded" } : undefined,
        redirect: "manual",
        signal,
      });
      if (response.status >= 300 && response.status < 400) throw new Error(`DC ArcGIS redirect rejected (${response.status}).`);
      if (!response.ok) {
        const error = new Error(`DC ArcGIS request failed (${response.status}).`);
        error.retryable = response.status === 429 || response.status >= 500;
        throw error;
      }
      const payload = await response.json();
      if (payload?.error) throw new Error(`DC ArcGIS error: ${payload.error.message ?? "unknown error"}`);
      return payload;
    } catch (error) {
      lastError = error;
      const transient = error.retryable === true || error.name === "TypeError" || ["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN"].includes(error.code);
      if (!transient || attempt + 1 >= attempts) throw error;
      await sleep(Math.min(250 * (2 ** attempt), 2000));
    }
  }
  throw lastError;
}

async function querySourceCount(options) {
  const payload = await requestDcArcGisJson(DC_BASIC_BUSINESS_LICENSE_QUERY_URL, {
    ...options,
    method: "POST",
    body: { where: DC_BASIC_BUSINESS_LICENSE_FILTER, returnCountOnly: "true", f: "json" },
  });
  const count = Number(payload?.count);
  if (!Number.isInteger(count) || count < 0) throw new Error("DC source count query returned an invalid count.");
  return count;
}

async function openGzipWriter(stagingDirectory, relativePath) {
  const destination = path.join(stagingDirectory, relativePath);
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

async function renameWithRetry(sourcePath, destinationPath, attempts = 12) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await rename(sourcePath, destinationPath);
      return;
    } catch (error) {
      if (!["EPERM", "EACCES", "EBUSY"].includes(error?.code) || attempt + 1 >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, Math.min(25 * (2 ** attempt), 1000)));
    }
  }
}

async function closeGzipWriter(writer, artifactType, metadata = {}) {
  const completion = finished(writer.output);
  writer.gzip.end();
  await completion;
  await renameWithRetry(writer.temporary, writer.destination);
  return { path: writer.relativePath.replaceAll("\\", "/"), ...(await hashFile(writer.destination)), record_count: writer.records, artifact_type: artifactType, ...metadata };
}

async function abortGzipWriters(writers) {
  const active = writers.filter(Boolean);
  for (const writer of active) if (!writer.gzip.destroyed && !writer.gzip.writableEnded) writer.gzip.end();
  await Promise.allSettled(active.map((writer) => finished(writer.output)));
}

async function writeArtifact(directory, relativePath, content, metadata = {}) {
  const destination = path.join(directory, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
  const temporary = `${destination}.tmp-${randomUUID()}`;
  await writeFile(temporary, buffer);
  await renameWithRetry(temporary, destination);
  return { path: relativePath.replaceAll("\\", "/"), bytes: buffer.length, sha256: sha256(buffer), ...metadata };
}

function assertContained(parent, child, label) {
  const relative = path.relative(parent, child);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`${label} escapes its release directory.`);
}

async function loadZbpBaseline(pointerPath) {
  const pointer = JSON.parse(await readFile(pointerPath, "utf8"));
  const base = path.dirname(pointerPath);
  const manifestPath = path.resolve(base, pointer.manifest ?? "");
  assertContained(base, manifestPath, "Census ZBP manifest");
  const manifestBuffer = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBuffer.toString("utf8"));
  if (manifest.dataset_id !== "census-zbp-baseline" || !manifest.complete_national_release) throw new Error("A complete Census ZBP baseline release is required.");
  const artifact = manifest.artifacts.find((candidate) => candidate.path === "derived/zip-coverage.jsonl");
  if (!artifact) throw new Error("Census ZBP baseline has no ZIP coverage artifact.");
  const artifactPath = path.resolve(path.dirname(manifestPath), artifact.path);
  assertContained(path.dirname(manifestPath), artifactPath, "Census ZBP coverage artifact");
  const buffer = await readFile(artifactPath);
  if (buffer.length !== artifact.bytes || sha256(buffer) !== artifact.sha256) throw new Error("Census ZBP coverage checksum failed.");
  const rows = buffer.toString("utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
  return { rows, byZip: new Map(rows.map((row) => [row.zip_code, row])), manifest, manifestSha256: sha256(manifestBuffer) };
}

async function* gzipRecords(filename) {
  const input = createReadStream(filename).pipe(createGunzip());
  const lines = createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) if (line.trim()) yield JSON.parse(line);
}

function selectedRecord(record) {
  const extra = Object.keys(record).filter((field) => !DC_BASIC_BUSINESS_LICENSE_FIELDS.includes(field));
  if (extra.length) throw new Error(`Unapproved DC source field ${extra[0]}.`);
  return Object.fromEntries(DC_BASIC_BUSINESS_LICENSE_FIELDS.map((field) => [field, record[field] ?? null]));
}

async function acquireSource({ writer, sourceRecords, expectedCount, fetchImpl, signal, sleep, pageSize, logger }) {
  let count = 0;
  if (sourceRecords) {
    const records = [...sourceRecords].sort((left, right) => Number(left.OBJECTID) - Number(right.OBJECTID) || compareText(left.GLOBALID, right.GLOBALID));
    for (const row of records) {
      if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
      await writeGzipRecord(writer, selectedRecord(row));
      count += 1;
    }
  } else {
    for (let offset = 0; offset < expectedCount; offset += pageSize) {
      if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
      const payload = await requestDcArcGisJson(DC_BASIC_BUSINESS_LICENSE_QUERY_URL, {
        fetchImpl,
        signal,
        sleep,
        method: "POST",
        body: {
          where: DC_BASIC_BUSINESS_LICENSE_FILTER,
          outFields: DC_BASIC_BUSINESS_LICENSE_FIELDS.join(","),
          orderByFields: "OBJECTID ASC",
          resultOffset: String(offset),
          resultRecordCount: String(pageSize),
          returnGeometry: "false",
          f: "json",
        },
      });
      const features = payload?.features;
      if (!Array.isArray(features) || !features.length) throw new Error(`DC source page at offset ${offset} was empty before the expected count.`);
      for (const feature of features) {
        await writeGzipRecord(writer, selectedRecord(feature.attributes ?? {}));
        count += 1;
      }
      logger(`Acquired ${count.toLocaleString()} of ${expectedCount.toLocaleString()} DC active Basic Business License rows.`);
    }
  }
  if (count !== expectedCount) throw new Error(`DC source count mismatch: acquired ${count}, expected ${expectedCount}.`);
  return count;
}

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function sortedCounts(map) {
  return Object.fromEntries([...map.entries()].sort(([left], [right]) => compareText(left, right)));
}

function buildZipCoverage(baselineRows, countsByZip, context) {
  const baselineByZip = new Map(baselineRows.map((row) => [row.zip_code, row]));
  const zipCodes = [...new Set([...baselineByZip.keys(), ...countsByZip.keys()])].sort();
  return zipCodes.map((zipCode) => {
    const baseline = baselineByZip.get(zipCode);
    const count = countsByZip.get(zipCode) ?? 0;
    return {
      schema_version: DC_BASIC_BUSINESS_LICENSE_SCHEMA_VERSION,
      zip_code: zipCode,
      dc_basic_business_license_snapshot: {
        status: count ? "published-source-defined-active-basic-business-license-sites" : "no-license-site-in-current-source-snapshot",
        licensed_site_count: count,
        source_release_id: context.sourceReleaseId,
        source_refreshed_at: context.sourceRefreshedAt,
        active_semantics: "source-status-active-business-license-not-independent-proof-of-continuous-operation-or-complete-business-coverage",
      },
      current_usps_validity: baseline?.current_usps_validity ?? { status: "unverified", reason: "ZIP appears in the DC source but is outside the current ZBP/ZCTA union." },
      postal_label: baseline?.postal_label ?? null,
      geography: baseline?.geography ?? { status: "no-2020-zcta-polygon", geo_id: null, geoid: null, geometry_file: null },
      employer_baseline: baseline?.employer_baseline ?? null,
      baseline_coverage_status: baseline?.coverage_status ?? "outside-zbp-zcta-union",
    };
  });
}

export async function buildDcBasicBusinessLicenses({
  outputRoot,
  zbpPointer,
  layerMetadata = null,
  sourceRecords = null,
  sourceCount = null,
  minimumActiveLicenseRecords = 50_000,
  maximumQuarantineRate = 0.25,
  pageSize = 2000,
  expectedSchemaFingerprint = DC_BASIC_BUSINESS_LICENSE_SCHEMA_FINGERPRINT,
  fetchImpl = fetch,
  signal,
  sleep,
  logger = console.log,
  now = () => new Date(),
} = {}) {
  if (!outputRoot || !zbpPointer) throw new Error("outputRoot and zbpPointer are required.");
  if (!Number.isInteger(minimumActiveLicenseRecords) || minimumActiveLicenseRecords < 1) throw new Error("minimumActiveLicenseRecords must be a positive integer.");
  if (!Number.isFinite(maximumQuarantineRate) || maximumQuarantineRate < 0 || maximumQuarantineRate > 1) throw new Error("maximumQuarantineRate must be from 0 through 1.");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 2000) throw new Error("pageSize must be from 1 through 2000.");
  if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
  const retrievedAt = now().toISOString();
  const runId = randomUUID();
  const stagingDirectory = path.join(outputRoot, ".staging", runId);
  await mkdir(stagingDirectory, { recursive: true });
  const baseline = await loadZbpBaseline(zbpPointer);
  const metadata = layerMetadata ?? await requestDcArcGisJson(`${DC_BASIC_BUSINESS_LICENSE_LAYER_URL}?f=pjson`, { fetchImpl, signal, sleep });
  const catalog = validateLayerMetadata(metadata, expectedSchemaFingerprint);
  const expectedCount = sourceRecords ? Number(sourceCount ?? sourceRecords.length) : await querySourceCount({ fetchImpl, signal, sleep });
  if (!Number.isInteger(expectedCount) || expectedCount < minimumActiveLicenseRecords) throw new Error(`DC source count ${expectedCount} is below the minimum ${minimumActiveLicenseRecords}.`);
  const sourceWriter = await openGzipWriter(stagingDirectory, "source/selected-active-business-license-rows.jsonl.gz");
  try {
    await acquireSource({ writer: sourceWriter, sourceRecords, expectedCount, fetchImpl, signal, sleep, pageSize, logger });
  } catch (error) {
    await abortGzipWriters([sourceWriter]);
    throw error;
  }
  const sourceArtifact = await closeGzipWriter(sourceWriter, "dc-basic-business-license-selected-source-jsonl-gzip", { export_policy: "internal" });
  const groups = new Map();
  const globalIds = new Set();
  const refreshValues = new Set();
  for await (const row of gzipRecords(path.join(stagingDirectory, sourceArtifact.path))) {
    if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
    const globalId = canonicalGlobalId(row.GLOBALID);
    if (globalIds.has(globalId)) throw new Error(`Duplicate DC GlobalID ${globalId}.`);
    globalIds.add(globalId);
    refreshValues.add(sourceInstant(row.DATAREFRESHEDON, "data-refreshed-on"));
    const customer = textValue(row.CUSTOMERNUMBER) ?? "<blank>";
    if (!groups.has(customer)) groups.set(customer, []);
    groups.get(customer).push(row);
  }
  if (refreshValues.size !== 1) throw new Error("DC source DATAREFRESHEDON values are missing or inconsistent.");
  const sourceRefreshedAt = [...refreshValues][0];
  if (sourceRefreshedAt > new Date(Date.parse(retrievedAt) + 48 * 60 * 60 * 1000).toISOString()) throw new Error("DC source DATAREFRESHEDON is implausibly ahead of acquisition time.");
  const sourceReleaseId = `dc-basic-business-licenses-${sourceRefreshedAt.slice(0, 10)}-${sourceArtifact.sha256.slice(0, 16)}`;
  const releaseId = `dc-basic-business-licenses-${releaseTimestamp(retrievedAt)}-${runId.slice(0, 8)}`;
  const context = { runId, retrievedAt, sourceRefreshedAt, sourceReleaseId, baselineByZip: baseline.byZip };
  const normalizedWriters = new Map();
  for (const prefix of "0123456789abcdef") normalizedWriters.set(prefix, await openGzipWriter(stagingDirectory, `normalized/sites/prefix=${prefix}.jsonl.gz`));
  const quarantineWriter = await openGzipWriter(stagingDirectory, "quality/quarantine.jsonl.gz");
  const zipCounts = new Map();
  const quarantineReasons = new Map();
  const activityCounts = new Map();
  let normalizedSiteCount = 0;
  let acceptedLicenseRowCount = 0;
  let quarantinedSourceRecordCount = 0;
  let sourceGeocodedSiteCount = 0;
  let sourceCoordinateConflictSiteCount = 0;
  let inDcPremiseSiteCount = 0;
  let outsideDcPremiseSiteCount = 0;
  try {
    for (const [customer, records] of [...groups.entries()].sort(([left], [right]) => compareText(left, right))) {
      try {
        const normalized = normalizeDcBasicBusinessLicenseSite(records, context);
        assertNormalizedUsPostalFieldsDeep(normalized);
        await writeGzipRecord(normalizedWriters.get(sha256(normalized.normalized_record_id)[0]), normalized);
        normalizedSiteCount += 1;
        acceptedLicenseRowCount += normalized.active_license_activities.length;
        increment(zipCounts, normalized.address.zip_code);
        if (normalized.location?.coordinates) sourceGeocodedSiteCount += 1;
        if (normalized.location?.coordinate_scope === "conflicting-source-mar-coordinates-suppressed") sourceCoordinateConflictSiteCount += 1;
        if (normalized.address.source_premise_in_dc) inDcPremiseSiteCount += 1;
        else outsideDcPremiseSiteCount += 1;
        for (const activity of normalized.active_license_activities) increment(activityCounts, activity.business_activity ?? "<unreported>");
      } catch (error) {
        if (!QUARANTINE_REASONS.has(error.message)) throw error;
        quarantinedSourceRecordCount += records.length;
        increment(quarantineReasons, error.message, records.length);
        await writeGzipRecord(quarantineWriter, {
          schema_version: DC_BASIC_BUSINESS_LICENSE_SCHEMA_VERSION,
          source_group_id: `customer:${customer}`,
          source_record_ids: records.map((record) => textValue(record.GLOBALID)).filter(Boolean).sort(compareText),
          source_record_count: records.length,
          reason: error.message,
          source_release_id: sourceReleaseId,
          export_policy: "internal",
        });
      }
    }
  } catch (error) {
    await abortGzipWriters([...normalizedWriters.values(), quarantineWriter]);
    throw error;
  }
  const quarantineRate = expectedCount ? quarantinedSourceRecordCount / expectedCount : 0;
  if (quarantineRate > maximumQuarantineRate) {
    await abortGzipWriters([...normalizedWriters.values(), quarantineWriter]);
    throw new Error(`DC quarantine rate ${quarantineRate} exceeds the maximum ${maximumQuarantineRate}.`);
  }
  if (acceptedLicenseRowCount + quarantinedSourceRecordCount !== expectedCount) {
    await abortGzipWriters([...normalizedWriters.values(), quarantineWriter]);
    throw new Error("DC accepted and quarantined row counts do not reconcile to the source query.");
  }
  const normalizedArtifacts = [];
  for (const writer of normalizedWriters.values()) normalizedArtifacts.push(await closeGzipWriter(writer, "normalized-dc-basic-business-license-site-jsonl-gzip", { export_policy: "local-review-only" }));
  const quarantineArtifact = await closeGzipWriter(quarantineWriter, "dc-basic-business-license-quarantine-jsonl-gzip", { export_policy: "internal" });
  if (!sourceRecords) {
    const finalMetadata = await requestDcArcGisJson(`${DC_BASIC_BUSINESS_LICENSE_LAYER_URL}?f=pjson`, { fetchImpl, signal, sleep });
    const finalCatalog = validateLayerMetadata(finalMetadata, expectedSchemaFingerprint);
    const finalCount = await querySourceCount({ fetchImpl, signal, sleep });
    if (finalCatalog.fingerprint !== catalog.fingerprint || finalCount !== expectedCount) throw new Error("DC source changed during acquisition; staging was not published.");
  }
  const zipRows = buildZipCoverage(baseline.rows, zipCounts, context);
  const zipArtifact = await writeArtifact(stagingDirectory, "derived/zip-coverage.jsonl", jsonLines(zipRows), {
    record_count: zipRows.length,
    artifact_type: "dc-basic-business-license-zip-coverage-jsonl",
    distribution_policy: "public-aggregate-with-cc-by-4.0-attribution-and-source-limitations",
  });
  const sourceSummary = {
    dataset_id: "dc-basic-business-license-sites",
    source_release_id: sourceReleaseId,
    source_refreshed_at: sourceRefreshedAt,
    retrieved_at: retrievedAt,
    source_filter: DC_BASIC_BUSINESS_LICENSE_FILTER,
    source_active_business_license_rows: expectedCount,
    source_customer_groups: groups.size,
    accepted_active_business_license_rows: acceptedLicenseRowCount,
    normalized_licensed_sites: normalizedSiteCount,
    quarantined_source_records: quarantinedSourceRecordCount,
    quarantined_customer_groups: quarantineWriter.records,
    quarantine_rate: quarantineRate,
    quarantine_reasons: sortedCounts(quarantineReasons),
    source_geocoded_sites: sourceGeocodedSiteCount,
    source_coordinate_conflict_sites: sourceCoordinateConflictSiteCount,
    in_dc_premise_sites: inDcPremiseSiteCount,
    outside_dc_premise_sites: outsideDcPremiseSiteCount,
    source_zip_codes: zipCounts.size,
    business_activity_counts: sortedCounts(activityCounts),
    selected_fields: DC_BASIC_BUSINESS_LICENSE_FIELDS,
    excluded_field_groups: ["owner, agent, and billing", "parcel and lot", "unusably rounded latitude and longitude"],
    record_level_distribution: "local-review-only",
    aggregate_distribution: "public-with-cc-by-4.0-attribution-and-semantic-limitations",
  };
  const summaryArtifact = await writeArtifact(stagingDirectory, "quality/source-summary.json", json(sourceSummary), { artifact_type: "dc-basic-business-license-source-summary" });
  const metadataArtifact = await writeArtifact(stagingDirectory, "source/layer-metadata.json", json(metadata), { artifact_type: "dc-basic-business-license-source-release-metadata", export_policy: "internal" });
  const artifacts = [sourceArtifact, metadataArtifact, ...normalizedArtifacts, quarantineArtifact, zipArtifact, summaryArtifact];
  const manifest = {
    schema_version: DC_BASIC_BUSINESS_LICENSE_SCHEMA_VERSION,
    dataset_id: "dc-basic-business-license-sites",
    connector: { id: "dc-basic-business-licenses", version: "1.0.1" },
    release_id: releaseId,
    source_release_id: sourceReleaseId,
    status: "complete",
    complete_source_selected_view: true,
    created_at: retrievedAt,
    source: {
      publisher: "District of Columbia Department of Licensing and Consumer Protection",
      catalog_item_id: DC_BASIC_BUSINESS_LICENSE_ITEM_ID,
      page_url: DC_BASIC_BUSINESS_LICENSE_PAGE_URL,
      layer_url: DC_BASIC_BUSINESS_LICENSE_LAYER_URL,
      active_filter: DC_BASIC_BUSINESS_LICENSE_FILTER,
      data_refreshed_on: sourceRefreshedAt,
      schema_fingerprint: catalog.fingerprint,
      license: "CC BY 4.0",
      license_url: "https://creativecommons.org/licenses/by/4.0/",
      active_definition: "exact source status Active and license type Business License at DATAREFRESHEDON",
    },
    transformation: {
      id: DC_BASIC_BUSINESS_LICENSE_TRANSFORMATION_VERSION,
      coordinate_source_crs: "EPSG:26985",
      coordinate_output_crs: "EPSG:4326",
      coordinate_library: "proj4@2.22.0",
      coordinate_definition: MARYLAND_STATE_PLANE_NAD83,
    },
    coverage: {
      source_active_business_license_rows: expectedCount,
      source_customer_groups: groups.size,
      accepted_active_business_license_rows: acceptedLicenseRowCount,
      normalized_licensed_sites: normalizedSiteCount,
      organizations: normalizedSiteCount,
      physical_sites: normalizedSiteCount,
      establishments: normalizedSiteCount,
      quarantined_source_records: quarantinedSourceRecordCount,
      quarantined_customer_groups: quarantineWriter.records,
      quarantine_rate: quarantineRate,
      source_geocoded_sites: sourceGeocodedSiteCount,
      source_coordinate_conflict_sites: sourceCoordinateConflictSiteCount,
      in_dc_premise_sites: inDcPremiseSiteCount,
      outside_dc_premise_sites: outsideDcPremiseSiteCount,
      source_zip_codes: zipCounts.size,
      zip_union_records: zipRows.length,
      complete_all_businesses: false,
    },
    dependencies: [
      { dataset_id: baseline.manifest.dataset_id, release_id: baseline.manifest.release_id, manifest_sha256: baseline.manifestSha256 },
      ...(baseline.manifest.geography_dependency ? [baseline.manifest.geography_dependency] : []),
    ],
    policy: {
      policy_id: "dc-basic-business-licenses",
      source_license: "CC BY 4.0",
      record_level_distribution: "local-review-only",
      aggregate_distribution: "public-with-cc-by-4.0-attribution-and-semantic-limitations",
      privacy_reason: "entity names can identify sole proprietors and licensed premises can be residences",
    },
    limitations: [
      "Source status Active is municipal-license evidence, not independent proof of continuous operation, public access, solvency, or compliance with every requirement.",
      "License-exempt businesses and activities governed through other licensing regimes may be absent; this is not a complete DC or national business denominator.",
      "Multiple activity rows are grouped to one Customer Number premise and never counted as separate physical sites or organizations.",
      "Premise addresses and MAR coordinates are source observations and are not independently verified as current occupancy.",
      "Owner, agent, billing, parcel-lot, and unusably rounded latitude/longitude fields are excluded at query time.",
      "Record-level output remains local-review-only because entity names and licensed premises may identify natural persons or residences.",
      "No ownership, parent-company, or cross-source identity relationship is inferred.",
    ],
    artifacts,
  };
  await writeFile(path.join(stagingDirectory, "manifest.json"), json(manifest));
  await verifyDcBasicBusinessLicenses(path.join(stagingDirectory, "manifest.json"));
  return publishDcBasicBusinessLicensesStaging({ outputRoot, stagingRunId: runId, expectedReleaseId: releaseId });
}

export async function publishDcBasicBusinessLicensesStaging({ outputRoot, stagingRunId, expectedReleaseId = null } = {}) {
  if (!outputRoot || !stagingRunId) throw new Error("outputRoot and stagingRunId are required.");
  const stagingDirectory = path.join(outputRoot, ".staging", stagingRunId);
  const manifestPath = path.join(stagingDirectory, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (expectedReleaseId && manifest.release_id !== expectedReleaseId) throw new Error("DC staging release ID mismatch.");
  await verifyDcBasicBusinessLicenses(manifestPath);
  const releasesDirectory = path.join(outputRoot, "releases");
  const releaseDirectory = path.join(releasesDirectory, manifest.release_id);
  await mkdir(releasesDirectory, { recursive: true });
  try {
    await stat(releaseDirectory);
    throw new Error(`DC release ${manifest.release_id} already exists.`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await renameWithRetry(stagingDirectory, releaseDirectory);
  const pointerPath = path.join(outputRoot, "current.json");
  const pointer = {
    dataset_id: manifest.dataset_id,
    release_id: manifest.release_id,
    source_release_id: manifest.source_release_id,
    manifest: `releases/${manifest.release_id}/manifest.json`,
    updated_at: manifest.created_at,
  };
  await mkdir(outputRoot, { recursive: true });
  const temporaryPointer = `${pointerPath}.tmp-${randomUUID()}`;
  await writeFile(temporaryPointer, json(pointer));
  await renameWithRetry(temporaryPointer, pointerPath);
  return { manifest, releaseDirectory, pointerPath };
}

function containsExcludedKey(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsExcludedKey);
  for (const [key, child] of Object.entries(value)) {
    if (EXCLUDED_SOURCE_FIELDS.has(key.toUpperCase())) return true;
    if (containsExcludedKey(child)) return true;
  }
  return false;
}

export async function verifyDcBasicBusinessLicenses(manifestPath) {
  const absoluteManifestPath = path.resolve(manifestPath);
  const releaseDirectory = path.dirname(absoluteManifestPath);
  const manifest = JSON.parse(await readFile(absoluteManifestPath, "utf8"));
  const failures = [];
  if (manifest.dataset_id !== "dc-basic-business-license-sites" || manifest.schema_version !== DC_BASIC_BUSINESS_LICENSE_SCHEMA_VERSION || manifest.status !== "complete" || manifest.complete_source_selected_view !== true) failures.push({ path: "manifest.json", reason: "invalid dataset identity, schema, status, or selected-view completeness" });
  if (manifest.source?.catalog_item_id !== DC_BASIC_BUSINESS_LICENSE_ITEM_ID || manifest.source?.active_filter !== DC_BASIC_BUSINESS_LICENSE_FILTER || manifest.source?.schema_fingerprint !== DC_BASIC_BUSINESS_LICENSE_SCHEMA_FINGERPRINT || manifest.source?.license !== "CC BY 4.0") failures.push({ path: "manifest.json", reason: "source identity, filter, schema, or license mismatch" });
  if (manifest.transformation?.coordinate_source_crs !== "EPSG:26985" || manifest.transformation?.coordinate_output_crs !== "EPSG:4326" || manifest.transformation?.coordinate_library !== "proj4@2.22.0") failures.push({ path: "manifest.json", reason: "coordinate transformation contract mismatch" });
  if (manifest.policy?.record_level_distribution !== "local-review-only" || manifest.coverage?.complete_all_businesses !== false) failures.push({ path: "manifest.json", reason: "privacy or completeness policy was overstated" });
  const artifacts = manifest.artifacts ?? [];
  for (const artifact of artifacts) {
    try {
      const filename = path.resolve(releaseDirectory, artifact.path);
      assertContained(releaseDirectory, filename, `Artifact ${artifact.path}`);
      const digest = await hashFile(filename);
      if (digest.bytes !== artifact.bytes || digest.sha256 !== artifact.sha256) throw new Error("checksum or byte count mismatch");
    } catch (error) {
      failures.push({ path: artifact.path, reason: error.message });
    }
  }
  const sourceArtifact = artifacts.find((artifact) => artifact.artifact_type === "dc-basic-business-license-selected-source-jsonl-gzip");
  const normalizedArtifacts = artifacts.filter((artifact) => artifact.artifact_type === "normalized-dc-basic-business-license-site-jsonl-gzip");
  const quarantineArtifact = artifacts.find((artifact) => artifact.artifact_type === "dc-basic-business-license-quarantine-jsonl-gzip");
  const zipArtifact = artifacts.find((artifact) => artifact.artifact_type === "dc-basic-business-license-zip-coverage-jsonl");
  let sourceRows = 0;
  const sourceGlobalIds = new Set();
  const refreshes = new Set();
  try {
    if (!sourceArtifact || sourceArtifact.export_policy !== "internal") throw new Error("missing or misclassified selected source artifact");
    for await (const record of gzipRecords(path.join(releaseDirectory, sourceArtifact.path))) {
      sourceRows += 1;
      if (containsExcludedKey(record)) throw new Error("excluded source field leaked");
      if (Object.keys(record).length !== DC_BASIC_BUSINESS_LICENSE_FIELDS.length || Object.keys(record).some((field) => !DC_BASIC_BUSINESS_LICENSE_FIELDS.includes(field))) throw new Error("unapproved or missing selected source field");
      if (record.LICENSESTATUS !== "Active" || record.LICENSETYPE !== "Business License") throw new Error("source filter drift");
      const globalId = canonicalGlobalId(record.GLOBALID);
      if (sourceGlobalIds.has(globalId)) throw new Error("duplicate GlobalID");
      sourceGlobalIds.add(globalId);
      refreshes.add(sourceInstant(record.DATAREFRESHEDON, "data-refreshed-on"));
    }
    if (sourceRows !== sourceArtifact.record_count || sourceRows !== manifest.coverage.source_active_business_license_rows) throw new Error("source record count mismatch");
    if (refreshes.size !== 1 || !refreshes.has(manifest.source.data_refreshed_on)) throw new Error("source refresh mismatch");
  } catch (error) {
    failures.push({ path: sourceArtifact?.path ?? "source/selected-active-business-license-rows.jsonl.gz", reason: error.message });
  }
  let normalizedSites = 0;
  let acceptedRows = 0;
  let geocodedSites = 0;
  let coordinateConflicts = 0;
  let inDcSites = 0;
  const normalizedIds = new Set();
  const organizationIds = new Set();
  const zipCounts = new Map();
  for (const artifact of normalizedArtifacts) {
    try {
      if (artifact.export_policy !== "local-review-only") throw new Error("normalized artifact is not local-review-only");
      let artifactRows = 0;
      for await (const record of gzipRecords(path.join(releaseDirectory, artifact.path))) {
        artifactRows += 1;
        normalizedSites += 1;
        if (containsExcludedKey(record)) throw new Error("excluded source field leaked into normalized record");
        if (record.schema_version !== DC_BASIC_BUSINESS_LICENSE_SCHEMA_VERSION || record.export_policy !== "local-review-only" || record.source_status?.status !== "Active Basic Business License (source-defined)") throw new Error("normalized schema, policy, or status mismatch");
        if (!/^dc-basic-business-license:customer:\d+$/.test(record.normalized_record_id ?? "") || normalizedIds.has(record.normalized_record_id)) throw new Error("missing or duplicate normalized identity");
        normalizedIds.add(record.normalized_record_id);
        const organizationId = record.entity_candidates?.organization_id;
        if (!organizationId || organizationIds.has(organizationId)) throw new Error("missing or duplicate provisional organization");
        organizationIds.add(organizationId);
        if (!record.entity_candidates?.physical_site_id || !record.entity_candidates?.establishment_id || record.entity_candidates?.identity_status !== "provisional") throw new Error("invalid entity candidates");
        if (!(record.legal_names?.length || record.trade_names?.length)) throw new Error("missing publishable business name");
        if (!Array.isArray(record.active_license_activities) || !record.active_license_activities.length) throw new Error("missing activity rows");
        acceptedRows += record.active_license_activities.length;
        const zipCode = record.address?.zip_code;
        if (!/^\d{5}$/.test(zipCode ?? "")) throw new Error("invalid ZIP");
        increment(zipCounts, zipCode);
        if (record.address.source_premise_in_dc) inDcSites += 1;
        if (record.location?.coordinates) {
          if (!Array.isArray(record.location.coordinates) || record.location.coordinates.length !== 2 || !record.location.coordinates.every(Number.isFinite)) throw new Error("invalid WGS84 coordinate");
          geocodedSites += 1;
        }
        if (record.location?.coordinate_scope === "conflicting-source-mar-coordinates-suppressed") coordinateConflicts += 1;
        if (record.provenance?.policy_id !== "dc-basic-business-licenses" || record.provenance?.source_release_id !== manifest.source_release_id) throw new Error("provenance mismatch");
      }
      if (artifactRows !== artifact.record_count) throw new Error("normalized artifact record count mismatch");
    } catch (error) {
      failures.push({ path: artifact.path, reason: error.message });
    }
  }
  if (normalizedArtifacts.length !== 16) failures.push({ path: "manifest.json", reason: "expected exactly 16 normalized hash partitions" });
  let quarantinedRows = 0;
  let quarantinedGroups = 0;
  try {
    if (!quarantineArtifact || quarantineArtifact.export_policy !== "internal") throw new Error("missing or misclassified quarantine artifact");
    for await (const record of gzipRecords(path.join(releaseDirectory, quarantineArtifact.path))) {
      quarantinedGroups += 1;
      if (!QUARANTINE_REASONS.has(record.reason) || !Number.isInteger(record.source_record_count) || record.source_record_count < 1 || record.export_policy !== "internal") throw new Error("invalid quarantine record");
      quarantinedRows += record.source_record_count;
    }
    if (quarantinedGroups !== quarantineArtifact.record_count) throw new Error("quarantine group count mismatch");
  } catch (error) {
    failures.push({ path: quarantineArtifact?.path ?? "quality/quarantine.jsonl.gz", reason: error.message });
  }
  try {
    if (!zipArtifact) throw new Error("missing ZIP coverage artifact");
    const buffer = await readFile(path.join(releaseDirectory, zipArtifact.path), "utf8");
    const rows = buffer.trim().split("\n").filter(Boolean).map(JSON.parse);
    if (rows.length !== zipArtifact.record_count || rows.length !== manifest.coverage.zip_union_records) throw new Error("ZIP coverage row count mismatch");
    let siteCount = 0;
    const seen = new Set();
    for (const row of rows) {
      if (!/^\d{5}$/.test(row.zip_code ?? "") || seen.has(row.zip_code)) throw new Error("invalid or duplicate ZIP coverage identity");
      seen.add(row.zip_code);
      const count = row.dc_basic_business_license_snapshot?.licensed_site_count;
      if (!Number.isInteger(count) || count < 0 || count !== (zipCounts.get(row.zip_code) ?? 0)) throw new Error("ZIP contribution mismatch");
      siteCount += count;
    }
    if (siteCount !== normalizedSites) throw new Error("ZIP contribution total mismatch");
  } catch (error) {
    failures.push({ path: zipArtifact?.path ?? "derived/zip-coverage.jsonl", reason: error.message });
  }
  if (sourceRows !== acceptedRows + quarantinedRows) failures.push({ path: "manifest.json", reason: "source, accepted, and quarantined rows do not reconcile" });
  const expected = manifest.coverage ?? {};
  const actual = {
    normalized_licensed_sites: normalizedSites,
    organizations: organizationIds.size,
    accepted_active_business_license_rows: acceptedRows,
    quarantined_source_records: quarantinedRows,
    quarantined_customer_groups: quarantinedGroups,
    source_geocoded_sites: geocodedSites,
    source_coordinate_conflict_sites: coordinateConflicts,
    in_dc_premise_sites: inDcSites,
    outside_dc_premise_sites: normalizedSites - inDcSites,
  };
  for (const [field, value] of Object.entries(actual)) if (expected[field] !== value) failures.push({ path: "manifest.json", reason: `${field} mismatch` });
  if (failures.length) {
    const error = new Error("DC Basic Business License verification failed.");
    error.failures = failures;
    throw error;
  }
  return { dataset_id: manifest.dataset_id, release_id: manifest.release_id, artifact_count: artifacts.length, verified_bytes: artifacts.reduce((sum, artifact) => sum + artifact.bytes, 0), coverage: manifest.coverage };
}
