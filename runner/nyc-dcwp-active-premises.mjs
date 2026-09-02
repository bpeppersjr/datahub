import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { finished } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";
import { assertNormalizedUsPostalFieldsDeep } from "./normalized-us-postal-code.mjs";

export const NYC_DCWP_ACTIVE_PREMISE_SCHEMA_VERSION = "1.0.0";
export const NYC_DCWP_ACTIVE_PREMISE_TRANSFORMATION_VERSION = "nyc-dcwp-active-premises@1.0.1";
export const NYC_DCWP_ACTIVE_PREMISE_DATASET_ID = "w7w3-xahh";
export const NYC_DCWP_ACTIVE_PREMISE_METADATA_URL = `https://data.cityofnewyork.us/api/views/${NYC_DCWP_ACTIVE_PREMISE_DATASET_ID}`;
export const NYC_DCWP_ACTIVE_PREMISE_API_URL = `https://data.cityofnewyork.us/resource/${NYC_DCWP_ACTIVE_PREMISE_DATASET_ID}.json`;
export const NYC_DCWP_ACTIVE_PREMISE_PAGE_URL = `https://data.cityofnewyork.us/Business/Issued-Licenses/${NYC_DCWP_ACTIVE_PREMISE_DATASET_ID}`;
export const NYC_OPEN_DATA_TERMS_URL = "https://data.cityofnewyork.us/stories/s/Terms-of-Use/k9k7-3cje/";
export const NYC_DCWP_ACTIVE_PREMISE_WHERE = "upper(license_status)='ACTIVE' AND upper(license_type)='PREMISES'";

export const NYC_DCWP_ACTIVE_PREMISE_SCHEMA = Object.freeze([
  ["license_nbr", "text"],
  ["business_name", "text"],
  ["dba_trade_name", "text"],
  ["business_unique_id", "text"],
  ["business_category", "text"],
  ["license_type", "text"],
  ["license_status", "text"],
  ["license_creation_date", "calendar_date"],
  ["lic_expir_dd", "calendar_date"],
  ["address_type", "text"],
  ["address_building", "text"],
  ["address_street_name", "text"],
  ["address_street_name_2", "text"],
  ["street3", "text"],
  ["unit_type", "text"],
  ["apt_suite", "text"],
  ["address_city", "text"],
  ["address_state", "text"],
  ["address_zip", "text"],
  ["address_borough", "text"],
  ["community_board", "text"],
  ["council_district", "text"],
  ["bin", "text"],
  ["bbl", "text"],
  ["nta", "text"],
  ["census_block_2010_", "text"],
  ["census_tract", "text"],
  ["latitude", "number"],
  ["longitude", "number"],
]);
export const NYC_DCWP_ACTIVE_PREMISE_FIELDS = Object.freeze(NYC_DCWP_ACTIVE_PREMISE_SCHEMA.map(([field]) => field));
export const NYC_DCWP_ACTIVE_PREMISE_SOURCE_FIELDS = Object.freeze(["socrata_row_id", ...NYC_DCWP_ACTIVE_PREMISE_FIELDS]);
export const NYC_DCWP_ACTIVE_PREMISE_SCHEMA_FINGERPRINT = "05446d17ba15c9fe17abe40dca4c7e74bbf70f6b3b689117bc831b7f1e0da4da";

const US_STATE_AND_TERRITORY_CODES = new Set([
  "AL", "AK", "AS", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "GU", "HI", "ID", "IL", "IN", "IA", "KS", "KY",
  "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "MP", "OH", "OK",
  "OR", "PA", "PR", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "VI", "WA", "WV", "WI", "WY",
]);
const QUARANTINE_REASONS = new Set([
  "non-complete-address-type",
  "missing-business-location-address",
  "invalid-or-unmapped-us-zip",
  "invalid-source-state",
  "source-state-conflicts-with-postal-label",
  "conflicting-business-addresses",
  "invalid-source-coordinate",
]);
const EXCLUDED_SOURCE_FIELDS = new Set([
  "contact_phone", "detail", "owner_name", "officer_name", "registered_agent", "agent_name", "contact_email", "email", "phone",
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

function sourceTimestamp(unixSeconds) {
  if (!Number.isInteger(unixSeconds) || unixSeconds <= 0) throw new Error("NYC DCWP catalog rowsUpdatedAt must be a positive Unix timestamp.");
  return new Date(unixSeconds * 1000).toISOString();
}

function dateValue(value, label, required = false) {
  const raw = textValue(value);
  if (!raw) {
    if (required) throw new Error(`missing-${label}`);
    return null;
  }
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})(?:T00:00:00(?:\.000)?)?$/);
  if (!match || Number.isNaN(Date.parse(`${match[1]}T00:00:00.000Z`))) throw new Error(`invalid-${label}`);
  return match[1];
}

function postalCode(value) {
  const raw = textValue(value);
  if (!raw) throw new Error("invalid-or-unmapped-us-zip");
  const match = raw.match(/^(\d{5})(?:-?(\d{4}))?$/);
  if (!match || match[1] === "00000") throw new Error("invalid-or-unmapped-us-zip");
  return {
    source: raw,
    zip_code: match[1],
    postal_code: match[1],
    zip4: match[2] ?? null,
    status: match[2] ? "normalized-zip-plus-4" : "normalized-zip5",
  };
}

function uniqueText(records, field) {
  return [...new Set(records.map((record) => textValue(record[field])).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function normalizedAddressKey(record) {
  return [record.address_type, record.address_building, record.address_street_name, record.address_street_name_2, record.street3, record.unit_type, record.apt_suite, record.address_city, record.address_state, record.address_zip]
    .map((value) => textValue(value)?.replaceAll(/\s+/g, " ").toUpperCase() ?? "")
    .join("\u0000");
}

function sourceCoordinate(records) {
  const coordinates = [];
  for (const record of records) {
    const latitudeText = textValue(record.latitude);
    const longitudeText = textValue(record.longitude);
    if (!latitudeText && !longitudeText) continue;
    const latitude = Number(latitudeText);
    const longitude = Number(longitudeText);
    if (!latitudeText || !longitudeText || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      throw new Error("invalid-source-coordinate");
    }
    coordinates.push([longitude, latitude]);
  }
  if (!coordinates.length) return null;
  const unique = new Map(coordinates.map((value) => [`${value[0].toFixed(7)}:${value[1].toFixed(7)}`, value]));
  if (unique.size > 1) {
    return {
      type: "Point",
      coordinates: null,
      coordinate_scope: "conflicting-source-geocodes-suppressed",
      plausibility: "not-used-for-spatial-assignment",
    };
  }
  const coordinate = [...unique.values()][0];
  const withinBroadNycBounds = coordinate[0] >= -74.30 && coordinate[0] <= -73.65 && coordinate[1] >= 40.45 && coordinate[1] <= 41.00;
  return {
    type: "Point",
    coordinates: coordinate,
    coordinate_scope: "portal-geocoded-reported-license-address-not-independently-verified",
    plausibility: withinBroadNycBounds ? "within-broad-nyc-bounds-not-independently-validated" : "outside-broad-nyc-bounds-or-offsite-license",
  };
}

function geography(zipCode, sourceState, records, baselineByZip) {
  const baseline = baselineByZip?.get(zipCode);
  const postalState = textValue(baseline?.postal_label?.preferred_state)?.toUpperCase() ?? null;
  if (!baseline) throw new Error("invalid-or-unmapped-us-zip");
  if (postalState && sourceState !== postalState) throw new Error("source-state-conflicts-with-postal-label");
  const boroughs = uniqueText(records, "address_borough");
  return {
    zip_code: zipCode,
    source_reported_state: sourceState,
    postal_label_state: postalState,
    state_consistency: postalState ? "source-matches-census-zbp-postal-label" : "postal-label-state-not-available",
    zcta_match_status: baseline.geography?.status ?? "no-2020-zcta-polygon",
    zcta_geo_id: baseline.geography?.geo_id ?? null,
    zcta_geoid: baseline.geography?.geoid ?? null,
    zcta_geometry_file: baseline.geography?.geometry_file ?? null,
    nyc_dcwp_source_geography: {
      assignment_status: sourceState === "NY" && boroughs.length ? "source-reported-nyc-geography" : "not-reported-or-offsite-license",
      boroughs,
      community_boards: uniqueText(records, "community_board"),
      council_districts: uniqueText(records, "council_district"),
      building_identification_numbers: uniqueText(records, "bin"),
      borough_block_lot_numbers: uniqueText(records, "bbl"),
      neighborhood_tabulation_areas: uniqueText(records, "nta"),
      census_blocks_2010: uniqueText(records, "census_block_2010_"),
      census_tracts_2010: uniqueText(records, "census_tract"),
      independently_verified: false,
    },
  };
}

function provenance(context, businessUniqueId, sourceRecordIds) {
  return {
    source_id: "nyc-dcwp-issued-licenses-active-premises",
    source_release_id: context.sourceReleaseId,
    source_record_id: `business:${businessUniqueId}`,
    source_record_ids: sourceRecordIds,
    ingest_run_id: context.runId,
    transformation_version: NYC_DCWP_ACTIVE_PREMISE_TRANSFORMATION_VERSION,
    policy_id: "nyc-dcwp-active-premises",
  };
}

function compareText(left, right) {
  return String(left ?? "").localeCompare(String(right ?? ""), "en", { numeric: true });
}

function compareSourceRows(left, right) {
  return compareText(left.business_unique_id, right.business_unique_id)
    || compareText(left.license_nbr, right.license_nbr)
    || compareText(left.socrata_row_id, right.socrata_row_id);
}

export function schemaFingerprint(columns) {
  const byField = new Map((columns ?? []).map((column) => [column.fieldName, column.dataTypeName]));
  return sha256(NYC_DCWP_ACTIVE_PREMISE_SCHEMA.map(([field]) => `${field}:${byField.get(field) ?? null}`).join("\u0000"));
}

function selectedRecord(row) {
  return Object.fromEntries(NYC_DCWP_ACTIVE_PREMISE_SOURCE_FIELDS.filter((field) => row[field] !== undefined).map((field) => [field, row[field]]));
}

export function normalizeNycDcwpLicensedSite(sourceRecords, context) {
  if (!Array.isArray(sourceRecords) || !sourceRecords.length) throw new Error("missing-nyc-dcwp-business-group");
  const businessUniqueId = textValue(sourceRecords[0].business_unique_id);
  if (!/^BA-\d+-\d{4}$/.test(businessUniqueId ?? "")) throw new Error("missing-or-invalid-nyc-dcwp-business-unique-id");
  for (const record of sourceRecords) {
    if (textValue(record.business_unique_id) !== businessUniqueId) throw new Error("conflicting-nyc-dcwp-business-identity");
    if (textValue(record.license_status)?.toUpperCase() !== "ACTIVE" || textValue(record.license_type)?.toUpperCase() !== "PREMISES") throw new Error("source-row-not-active-premises");
  }
  const legalNames = uniqueText(sourceRecords, "business_name");
  if (!legalNames.length) throw new Error("missing-or-invalid-nyc-dcwp-business-identity");
  if (sourceRecords.some((record) => textValue(record.address_type)?.toUpperCase() !== "COMPLETE ADDRESS")) throw new Error("non-complete-address-type");
  if (!textValue(sourceRecords[0].address_building) || !textValue(sourceRecords[0].address_street_name) || !textValue(sourceRecords[0].address_city)) throw new Error("missing-business-location-address");
  if (new Set(sourceRecords.map(normalizedAddressKey)).size !== 1) throw new Error("conflicting-business-addresses");
  const sourceState = textValue(sourceRecords[0].address_state)?.toUpperCase() ?? null;
  if (!sourceState || !US_STATE_AND_TERRITORY_CODES.has(sourceState)) throw new Error("invalid-source-state");
  const postal = postalCode(sourceRecords[0].address_zip);
  const geo = geography(postal.zip_code, sourceState, sourceRecords, context.baselineByZip);
  const sourceRecordIds = sourceRecords.map((record) => textValue(record.socrata_row_id)).sort(compareText);
  const activeLicenses = sourceRecords.map((record) => {
    const licenseNumber = textValue(record.license_nbr);
    if (!licenseNumber) throw new Error("missing-or-invalid-nyc-dcwp-license-number");
    return {
      source_record_id: textValue(record.socrata_row_id),
      license_number: licenseNumber,
      business_category: textValue(record.business_category),
      license_type: "PREMISES",
      license_status: "ACTIVE",
      initial_issuance_date: dateValue(record.license_creation_date, "license-creation-date", true),
      expiration_date: dateValue(record.lic_expir_dd, "license-expiration-date", true),
    };
  }).sort((left, right) => compareText(left.license_number, right.license_number) || compareText(left.source_record_id, right.source_record_id));
  const identitySuffix = businessUniqueId.toLowerCase().replaceAll("-", "_");
  const street = `${textValue(sourceRecords[0].address_building)} ${textValue(sourceRecords[0].address_street_name)}`.replaceAll(/\s+/g, " ").trim();
  const unit = [textValue(sourceRecords[0].unit_type), textValue(sourceRecords[0].apt_suite)].filter(Boolean).join(" ") || null;
  return {
    schema_version: NYC_DCWP_ACTIVE_PREMISE_SCHEMA_VERSION,
    normalized_record_id: `nyc-dcwp-active-business:business:${businessUniqueId}`,
    entity_candidates: {
      organization_id: `organization:nyc_dcwp_business_${identitySuffix}`,
      physical_site_id: `site:nyc_dcwp_business_${identitySuffix}`,
      establishment_id: `establishment:nyc_dcwp_business_${identitySuffix}`,
      identity_status: "provisional",
    },
    external_identifiers: [
      { type: "nyc_dcwp_business_unique_id", value: businessUniqueId, source_field: "business_unique_id" },
    ],
    legal_names: legalNames,
    doing_business_as_names: uniqueText(sourceRecords, "dba_trade_name"),
    address: {
      street,
      street_2: textValue(sourceRecords[0].address_street_name_2),
      street_3: textValue(sourceRecords[0].street3),
      unit_or_additional: unit,
      city: textValue(sourceRecords[0].address_city),
      state: sourceState,
      postal_code_source: postal.source,
      zip_code: postal.zip_code,
      postal_code: postal.postal_code,
      zip4: postal.zip4,
      postal_code_status: postal.status,
      country: "US",
      source_scope: "reported-active-dcwp-premise-license-address",
      independently_verified: false,
    },
    location: sourceCoordinate(sourceRecords),
    geography: geo,
    active_licenses: activeLicenses,
    source_status: {
      value: "listed-as-active-nyc-dcwp-premise-license-as-of-source-refresh",
      status: "Active premise license (source-defined)",
      semantics: "source-row-status-active-and-license-type-premises-not-independent-proof-of-continuous-operation-or-complete-business-coverage",
      source_rows_updated_at: context.sourceRowsUpdatedAt,
    },
    privacy: {
      classification: "possible-natural-person-name-or-residential-license-address",
      individual_license_rows_excluded: true,
      contact_phone_and_free_form_detail_excluded: true,
      record_level_distribution: "local-review-only",
    },
    observed_at: context.retrievedAt,
    provenance: provenance(context, businessUniqueId, sourceRecordIds),
    export_policy: "local-review-only",
  };
}

function assertAllowedUrl(urlValue, type) {
  const url = new URL(urlValue);
  if (url.protocol !== "https:" || url.hostname !== "data.cityofnewyork.us") throw new Error(`NYC DCWP ${type} URL is not allowed.`);
  const expected = type === "metadata" ? `/api/views/${NYC_DCWP_ACTIVE_PREMISE_DATASET_ID}` : `/resource/${NYC_DCWP_ACTIVE_PREMISE_DATASET_ID}.json`;
  if (url.pathname !== expected) throw new Error(`NYC DCWP ${type} path is not allowed.`);
  return url;
}

function retryDelay(response, attempt) {
  const retryAfter = Number(response?.headers?.get?.("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter >= 0) return Math.min(retryAfter * 1000, 30_000);
  return Math.min(500 * (2 ** attempt), 8_000);
}

export async function requestNycDcwpJson(urlValue, {
  type = "data",
  fetchImpl = fetch,
  signal,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  attempts = 4,
  maximumResponseBytes = 80_000_000,
} = {}) {
  const url = assertAllowedUrl(urlValue, type);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
    let response;
    try {
      response = await fetchImpl(url, { redirect: "manual", signal, headers: { accept: "application/json" } });
    } catch (error) {
      if (error?.name === "AbortError" || attempt + 1 >= attempts) throw error;
      await sleep(500 * (2 ** attempt));
      continue;
    }
    if (response.status >= 300 && response.status < 400) throw new Error(`NYC DCWP ${type} redirect rejected (${response.status}).`);
    if (!response.ok) {
      if ((response.status === 429 || response.status >= 500) && attempt + 1 < attempts) {
        await sleep(retryDelay(response, attempt));
        continue;
      }
      throw new Error(`NYC DCWP ${type} request failed with HTTP ${response.status}.`);
    }
    const declaredBytes = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredBytes) && declaredBytes > maximumResponseBytes) throw new Error(`NYC DCWP ${type} response exceeds the byte limit.`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maximumResponseBytes) throw new Error(`NYC DCWP ${type} response exceeds the byte limit.`);
    try {
      return JSON.parse(buffer.toString("utf8"));
    } catch {
      throw new Error(`NYC DCWP ${type} response was not valid JSON.`);
    }
  }
  throw new Error(`NYC DCWP ${type} request exhausted retries.`);
}

function validateCatalogMetadata(metadata, expectedFingerprint = NYC_DCWP_ACTIVE_PREMISE_SCHEMA_FINGERPRINT) {
  if (metadata?.id !== NYC_DCWP_ACTIVE_PREMISE_DATASET_ID || metadata?.name !== "Issued Licenses" || metadata?.assetType !== "dataset" || metadata?.viewType !== "tabular") throw new Error("Unexpected NYC DCWP issued-license catalog identity.");
  if (metadata?.attribution !== "Department of Consumer and Worker Protection (DCWP)" || metadata?.provenance !== "official") throw new Error("Unexpected NYC DCWP attribution or provenance.");
  const update = metadata?.metadata?.custom_fields?.Update;
  const agency = metadata?.metadata?.custom_fields?.["Dataset Information"]?.Agency;
  if (update?.Automation !== "Yes" || update?.["Update Frequency"] !== "Weekly" || agency !== "Department of Consumer and Worker Protection (DCWP)") throw new Error("Unexpected NYC DCWP update or agency metadata.");
  const fingerprint = schemaFingerprint(metadata.columns);
  if (fingerprint !== expectedFingerprint) throw new Error(`NYC DCWP selected schema changed (${fingerprint}).`);
  return { fingerprint, rowsUpdatedAt: sourceTimestamp(metadata.rowsUpdatedAt) };
}

function soqlUrl(parameters) {
  const url = new URL(NYC_DCWP_ACTIVE_PREMISE_API_URL);
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, String(value));
  return url.toString();
}

async function sourceCount(options) {
  const rows = await requestNycDcwpJson(soqlUrl({ "$select": "count(*)", "$where": NYC_DCWP_ACTIVE_PREMISE_WHERE }), { ...options, type: "data" });
  const count = Number(rows?.[0]?.count);
  if (!Number.isInteger(count) || count < 0) throw new Error("NYC DCWP source count query returned an invalid count.");
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

async function closeGzipWriter(writer, artifactType, metadata = {}) {
  const completion = finished(writer.output);
  writer.gzip.end();
  await completion;
  await renameWithRetry(writer.temporary, writer.destination);
  return { path: writer.relativePath.replaceAll("\\", "/"), ...(await hashFile(writer.destination)), record_count: writer.records, artifact_type: artifactType, ...metadata };
}

async function abortGzipWriters(writers) {
  const active = writers.filter(Boolean);
  for (const writer of active) {
    if (!writer.gzip.destroyed && !writer.gzip.writableEnded) writer.gzip.end();
  }
  await Promise.allSettled(active.map((writer) => finished(writer.output)));
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

function sourceSafeRecord(record) {
  const extra = Object.keys(record).filter((field) => !NYC_DCWP_ACTIVE_PREMISE_SOURCE_FIELDS.includes(field));
  if (extra.length) throw new Error(`Unapproved NYC DCWP source field ${extra[0]}.`);
  return selectedRecord(record);
}

async function acquireSource({ writer, sourceRecords, expectedCount, fetchImpl, signal, sleep, pageSize, logger }) {
  let count = 0;
  if (sourceRecords) {
    const records = [...sourceRecords].sort(compareSourceRows);
    for (const row of records) {
      if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
      await writeGzipRecord(writer, sourceSafeRecord(row));
      count += 1;
    }
  } else {
    for (let offset = 0; offset < expectedCount; offset += pageSize) {
      if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
      const select = `:id as socrata_row_id,${NYC_DCWP_ACTIVE_PREMISE_FIELDS.join(",")}`;
      const rows = await requestNycDcwpJson(soqlUrl({ "$select": select, "$where": NYC_DCWP_ACTIVE_PREMISE_WHERE, "$order": "business_unique_id,license_nbr,:id", "$limit": pageSize, "$offset": offset }), {
        fetchImpl, signal, sleep, type: "data",
      });
      if (!Array.isArray(rows) || !rows.length) throw new Error(`NYC DCWP source page at offset ${offset} was empty before the expected count.`);
      for (const row of rows) {
        await writeGzipRecord(writer, sourceSafeRecord(row));
        count += 1;
      }
      logger(`Acquired ${count.toLocaleString()} of ${expectedCount.toLocaleString()} NYC DCWP active-premise-license rows.`);
    }
  }
  if (count !== expectedCount) throw new Error(`NYC DCWP source count mismatch: acquired ${count}, expected ${expectedCount}.`);
  return count;
}

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function sortedCounts(map) {
  return Object.fromEntries([...map.entries()].sort(([left], [right]) => String(left).localeCompare(String(right))));
}

function buildZipCoverage(baselineRows, countsByZip, context) {
  const baselineByZip = new Map(baselineRows.map((row) => [row.zip_code, row]));
  const zipCodes = [...new Set([...baselineByZip.keys(), ...countsByZip.keys()])].sort();
  return zipCodes.map((zipCode) => {
    const baseline = baselineByZip.get(zipCode);
    const count = countsByZip.get(zipCode) ?? 0;
    return {
      schema_version: NYC_DCWP_ACTIVE_PREMISE_SCHEMA_VERSION,
      zip_code: zipCode,
      nyc_dcwp_active_premise_license_snapshot: {
        status: count ? "published-source-defined-active-premise-license-sites" : "no-active-premise-license-site-in-current-source-snapshot",
        licensed_site_count: count,
        source_release_id: context.sourceReleaseId,
        source_rows_updated_at: context.sourceRowsUpdatedAt,
        active_semantics: "source-status-active-and-license-type-premises-not-independent-proof-of-continuous-operation-or-complete-business-coverage",
      },
      current_usps_validity: baseline?.current_usps_validity ?? { status: "unverified", reason: "ZIP appears in the NYC DCWP source but is outside the current ZBP/ZCTA union." },
      postal_label: baseline?.postal_label ?? null,
      geography: baseline?.geography ?? { status: "no-2020-zcta-polygon", geo_id: null, geoid: null, geometry_file: null },
      employer_baseline: baseline?.employer_baseline ?? null,
      baseline_coverage_status: baseline?.coverage_status ?? "outside-zbp-zcta-union",
    };
  });
}

export async function buildNycDcwpActivePremises({
  outputRoot,
  zbpPointer,
  catalogMetadata = null,
  sourceRecords = null,
  minimumLicenseRecords = 30_000,
  maximumQuarantineRate = 0.05,
  pageSize = 50_000,
  expectedSchemaFingerprint = NYC_DCWP_ACTIVE_PREMISE_SCHEMA_FINGERPRINT,
  fetchImpl = fetch,
  signal,
  sleep,
  logger = console.log,
  now = () => new Date(),
} = {}) {
  if (!outputRoot || !zbpPointer) throw new Error("outputRoot and zbpPointer are required.");
  if (!Number.isInteger(minimumLicenseRecords) || minimumLicenseRecords < 1) throw new Error("minimumLicenseRecords must be a positive integer.");
  if (!Number.isFinite(maximumQuarantineRate) || maximumQuarantineRate < 0 || maximumQuarantineRate > 1) throw new Error("maximumQuarantineRate must be from 0 through 1.");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50_000) throw new Error("pageSize must be from 1 through 50000.");
  if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
  const retrievedAt = now().toISOString();
  const runId = randomUUID();
  const stagingDirectory = path.join(outputRoot, ".staging", runId);
  await mkdir(stagingDirectory, { recursive: true });
  const baseline = await loadZbpBaseline(zbpPointer);
  const metadata = catalogMetadata ?? await requestNycDcwpJson(NYC_DCWP_ACTIVE_PREMISE_METADATA_URL, { fetchImpl, signal, sleep, type: "metadata" });
  const catalog = validateCatalogMetadata(metadata, expectedSchemaFingerprint);
  const expectedCount = sourceRecords ? Number(metadata.sourceRecordCount) : await sourceCount({ fetchImpl, signal, sleep });
  if (!Number.isInteger(expectedCount) || expectedCount < minimumLicenseRecords) throw new Error(`NYC DCWP source count ${expectedCount} is below the minimum ${minimumLicenseRecords}.`);
  const sourceWriter = await openGzipWriter(stagingDirectory, "source/selected-records.jsonl.gz");
  try {
    await acquireSource({ writer: sourceWriter, sourceRecords, expectedCount, fetchImpl, signal, sleep, pageSize, logger });
  } catch (error) {
    await abortGzipWriters([sourceWriter]);
    throw error;
  }
  const sourceArtifact = await closeGzipWriter(sourceWriter, "nyc-dcwp-active-premise-license-source-jsonl-gzip", { export_policy: "internal" });
  const sourceReleaseId = `nyc-dcwp-active-premises-${catalog.rowsUpdatedAt.slice(0, 10)}-${sourceArtifact.sha256.slice(0, 16)}`;
  const releaseId = `nyc-dcwp-active-premises-${releaseTimestamp(retrievedAt)}-${runId.slice(0, 8)}`;
  const context = { runId, retrievedAt, sourceRowsUpdatedAt: catalog.rowsUpdatedAt, sourceReleaseId, baselineByZip: baseline.byZip };
  const normalizedWriters = new Map();
  for (const prefix of "0123456789abcdef") normalizedWriters.set(prefix, await openGzipWriter(stagingDirectory, `normalized/sites/prefix=${prefix}.jsonl.gz`));
  const quarantineWriter = await openGzipWriter(stagingDirectory, "quality/quarantine.jsonl.gz");
  const zipCounts = new Map();
  const quarantineReasons = new Map();
  const licenseCategoryCounts = new Map();
  const organizations = new Set();
  const sourceRowIds = new Set();
  let normalizedSiteCount = 0;
  let acceptedLicenseRecordCount = 0;
  let quarantinedSourceRecordCount = 0;
  let sourceBusinessGroups = 0;
  let sourceGeocodedSiteCount = 0;
  let sourceCoordinateConflictSiteCount = 0;
  let inNycBoroughSiteCount = 0;
  let outsideOrUnreportedNycBoroughSiteCount = 0;
  let currentGroup = [];
  let currentKey = null;
  const flushGroup = async () => {
    if (!currentGroup.length) return;
    sourceBusinessGroups += 1;
    const businessUniqueId = textValue(currentGroup[0].business_unique_id);
    try {
      const normalized = normalizeNycDcwpLicensedSite(currentGroup, context);
      assertNormalizedUsPostalFieldsDeep(normalized);
      const prefix = sha256(normalized.normalized_record_id)[0];
      await writeGzipRecord(normalizedWriters.get(prefix), normalized);
      normalizedSiteCount += 1;
      acceptedLicenseRecordCount += normalized.active_licenses.length;
      organizations.add(normalized.entity_candidates.organization_id);
      increment(zipCounts, normalized.address.zip_code);
      if (normalized.location?.coordinates) sourceGeocodedSiteCount += 1;
      if (normalized.location?.coordinate_scope === "conflicting-source-geocodes-suppressed") sourceCoordinateConflictSiteCount += 1;
      if (normalized.geography.nyc_dcwp_source_geography.assignment_status === "source-reported-nyc-geography") inNycBoroughSiteCount += 1;
      else outsideOrUnreportedNycBoroughSiteCount += 1;
      for (const licenseRecord of normalized.active_licenses) increment(licenseCategoryCounts, licenseRecord.business_category ?? "<blank>");
    } catch (error) {
      if (!QUARANTINE_REASONS.has(error.message)) throw error;
      increment(quarantineReasons, error.message, currentGroup.length);
      quarantinedSourceRecordCount += currentGroup.length;
      await writeGzipRecord(quarantineWriter, {
        schema_version: NYC_DCWP_ACTIVE_PREMISE_SCHEMA_VERSION,
        source_group_id: `business:${businessUniqueId ?? "<blank>"}`,
        source_record_ids: currentGroup.map((record) => textValue(record.socrata_row_id)).filter(Boolean).sort(compareText),
        source_record_count: currentGroup.length,
        reason: error.message,
        source_release_id: sourceReleaseId,
        export_policy: "internal",
      });
    }
  };
  try {
    for await (const source of gzipRecords(path.join(stagingDirectory, sourceArtifact.path))) {
      if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
      const rowId = textValue(source.socrata_row_id);
      if (!rowId || sourceRowIds.has(rowId)) throw new Error(`Duplicate NYC DCWP Socrata row ${rowId ?? "<blank>"}.`);
      sourceRowIds.add(rowId);
      const key = textValue(source.business_unique_id);
      if (currentKey !== null && key !== currentKey) {
        await flushGroup();
        currentGroup = [];
      }
      currentKey = key;
      currentGroup.push(source);
    }
    await flushGroup();
  } catch (error) {
    await abortGzipWriters([...normalizedWriters.values(), quarantineWriter]);
    throw error;
  }
  const quarantineRate = expectedCount ? quarantinedSourceRecordCount / expectedCount : 0;
  if (quarantineRate > maximumQuarantineRate) {
    await abortGzipWriters([...normalizedWriters.values(), quarantineWriter]);
    throw new Error(`NYC DCWP quarantine rate ${quarantineRate} exceeds the maximum ${maximumQuarantineRate}.`);
  }
  if (acceptedLicenseRecordCount < minimumLicenseRecords - Math.floor(expectedCount * maximumQuarantineRate)) {
    await abortGzipWriters([...normalizedWriters.values(), quarantineWriter]);
    throw new Error("NYC DCWP accepted license-record count is below the governed minimum after quarantine.");
  }
  const normalizedArtifacts = [];
  for (const writer of normalizedWriters.values()) normalizedArtifacts.push(await closeGzipWriter(writer, "normalized-nyc-dcwp-active-license-site-jsonl-gzip", { export_policy: "local-review-only" }));
  const quarantineArtifact = await closeGzipWriter(quarantineWriter, "nyc-dcwp-active-license-quarantine-jsonl-gzip", { export_policy: "internal" });
  if (!sourceRecords) {
    const finalMetadata = await requestNycDcwpJson(NYC_DCWP_ACTIVE_PREMISE_METADATA_URL, { fetchImpl, signal, sleep, type: "metadata" });
    const finalCatalog = validateCatalogMetadata(finalMetadata, expectedSchemaFingerprint);
    const finalCount = await sourceCount({ fetchImpl, signal, sleep });
    if (finalCatalog.rowsUpdatedAt !== catalog.rowsUpdatedAt || finalCount !== expectedCount) {
      throw new Error("NYC DCWP source changed during acquisition; staging was not published.");
    }
  }
  const zipRows = buildZipCoverage(baseline.rows, zipCounts, context);
  const zipArtifact = await writeArtifact(stagingDirectory, "derived/zip-coverage.jsonl", jsonLines(zipRows), {
    record_count: zipRows.length,
    artifact_type: "nyc-dcwp-active-license-zip-coverage-jsonl",
    distribution_policy: "public-aggregate-with-source-limitations",
  });
  const sourceSummary = {
    dataset_id: "nyc-dcwp-active-license-sites",
    source_release_id: sourceReleaseId,
    source_rows_updated_at: catalog.rowsUpdatedAt,
    retrieved_at: retrievedAt,
    source_active_premise_license_records: expectedCount,
    source_business_unique_id_groups: sourceBusinessGroups,
    accepted_active_premise_license_records: acceptedLicenseRecordCount,
    normalized_licensed_sites: normalizedSiteCount,
    unique_business_ids: organizations.size,
    quarantined_source_records: quarantinedSourceRecordCount,
    quarantined_business_groups: quarantineWriter.records,
    quarantine_rate: quarantineRate,
    quarantine_reasons: sortedCounts(quarantineReasons),
    source_geocoded_sites: sourceGeocodedSiteCount,
    source_coordinate_conflict_sites: sourceCoordinateConflictSiteCount,
    in_nyc_borough_sites: inNycBoroughSiteCount,
    outside_or_unreported_nyc_borough_sites: outsideOrUnreportedNycBoroughSiteCount,
    source_zip_codes: zipCounts.size,
    license_category_counts: sortedCounts(licenseCategoryCounts),
    selected_fields: NYC_DCWP_ACTIVE_PREMISE_FIELDS,
    excluded_field_groups: ["individual license rows", "contact phone", "free-form detail"],
    record_level_distribution: "local-review-only",
  };
  const summaryArtifact = await writeArtifact(stagingDirectory, "quality/source-summary.json", json(sourceSummary), { artifact_type: "nyc-dcwp-active-license-source-summary" });
  const sourceMetadataArtifact = await writeArtifact(stagingDirectory, "source/catalog-metadata.json", json(metadata), { artifact_type: "nyc-dcwp-active-license-source-release-metadata", export_policy: "internal" });
  const artifacts = [sourceArtifact, sourceMetadataArtifact, ...normalizedArtifacts, quarantineArtifact, zipArtifact, summaryArtifact];
  const manifest = {
    schema_version: NYC_DCWP_ACTIVE_PREMISE_SCHEMA_VERSION,
    dataset_id: "nyc-dcwp-active-license-sites",
    release_id: releaseId,
    source_release_id: sourceReleaseId,
    status: "complete",
    complete_source_snapshot: true,
    created_at: retrievedAt,
    source: {
      publisher: "New York City Department of Consumer and Worker Protection",
      dataset_id: NYC_DCWP_ACTIVE_PREMISE_DATASET_ID,
      page_url: NYC_DCWP_ACTIVE_PREMISE_PAGE_URL,
      api_url: NYC_DCWP_ACTIVE_PREMISE_API_URL,
      rows_updated_at: catalog.rowsUpdatedAt,
      schema_fingerprint: catalog.fingerprint,
      license: "NYC Open Data Terms of Use",
      license_url: NYC_OPEN_DATA_TERMS_URL,
      selected_where: NYC_DCWP_ACTIVE_PREMISE_WHERE,
      active_definition: "selected source rows require current license status Active and license type Premises",
    },
    coverage: {
      source_active_premise_license_records: expectedCount,
      source_business_unique_id_groups: sourceBusinessGroups,
      accepted_active_premise_license_records: acceptedLicenseRecordCount,
      normalized_licensed_sites: normalizedSiteCount,
      unique_business_ids: organizations.size,
      quarantined_source_records: quarantinedSourceRecordCount,
      quarantined_business_groups: quarantineWriter.records,
      quarantine_rate: quarantineRate,
      source_geocoded_sites: sourceGeocodedSiteCount,
      source_coordinate_conflict_sites: sourceCoordinateConflictSiteCount,
      in_nyc_borough_sites: inNycBoroughSiteCount,
      outside_or_unreported_nyc_borough_sites: outsideOrUnreportedNycBoroughSiteCount,
      source_zip_codes: zipCounts.size,
      zip_union_records: zipRows.length,
      physical_sites: normalizedSiteCount,
      establishments: normalizedSiteCount,
      organizations: organizations.size,
      complete_all_businesses: false,
    },
    dependencies: [
      { dataset_id: baseline.manifest.dataset_id, release_id: baseline.manifest.release_id, manifest_sha256: baseline.manifestSha256 },
      ...(baseline.manifest.geography_dependency ? [baseline.manifest.geography_dependency] : []),
    ],
    policy: {
      policy_id: "nyc-dcwp-active-premises",
      record_level_distribution: "local-review-only",
      aggregate_distribution: "public-with-provenance-and-semantic-limitations",
      privacy_reason: "legal names can identify natural persons and licensed addresses can be residences",
    },
    limitations: [
      "Active/Premises is source-defined municipal license status, not independent proof of continuous operations, public access, solvency, or compliance with every requirement.",
      "Most businesses do not require a DCWP license; this is not a complete New York City, New York, or national business denominator.",
      "Multiple license rows are grouped by the publisher's Business Unique ID so license count is never reported as physical-site or business count.",
      "Only complete U.S. street-address groups are normalized; intersections, landmarks, incomplete addresses, and invalid or conflicting groups are quarantined.",
      "Addresses and coordinates are source-reported or portal-geocoded and are not independently verified.",
      "Individual licenses, contact phone, and free-form detail are excluded from acquisition.",
      "Record-level output remains local-review-only because legal names and licensed locations may identify natural persons or residences.",
      "No parent-company or cross-source identity relationship is inferred.",
    ],
    artifacts,
  };
  await writeFile(path.join(stagingDirectory, "manifest.json"), json(manifest));
  await verifyNycDcwpActivePremises(path.join(stagingDirectory, "manifest.json"));
  return publishNycDcwpActivePremisesStaging({ outputRoot, stagingRunId: runId, expectedReleaseId: releaseId });
}

export async function publishNycDcwpActivePremisesStaging({ outputRoot, stagingRunId, expectedReleaseId = null } = {}) {
  if (!outputRoot || !stagingRunId) throw new Error("outputRoot and stagingRunId are required.");
  const stagingDirectory = path.join(outputRoot, ".staging", stagingRunId);
  const manifestPath = path.join(stagingDirectory, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (expectedReleaseId && manifest.release_id !== expectedReleaseId) throw new Error("NYC DCWP staging release ID mismatch.");
  await verifyNycDcwpActivePremises(manifestPath);
  const releasesDirectory = path.join(outputRoot, "releases");
  const releaseDirectory = path.join(releasesDirectory, manifest.release_id);
  await mkdir(releasesDirectory, { recursive: true });
  try {
    await stat(releaseDirectory);
    throw new Error(`NYC DCWP release ${manifest.release_id} already exists.`);
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

function containsExcludedField(value) {
  const serialized = JSON.stringify(value).toLowerCase();
  return [...EXCLUDED_SOURCE_FIELDS].some((field) => serialized.includes(`\"${field}\"`)) || serialized.includes(":@computed_region_");
}

export async function verifyNycDcwpActivePremises(manifestPath) {
  const absoluteManifestPath = path.resolve(manifestPath);
  const releaseDirectory = path.dirname(absoluteManifestPath);
  const manifest = JSON.parse(await readFile(absoluteManifestPath, "utf8"));
  const failures = [];
  if (manifest.dataset_id !== "nyc-dcwp-active-license-sites" || manifest.schema_version !== NYC_DCWP_ACTIVE_PREMISE_SCHEMA_VERSION || manifest.status !== "complete" || manifest.complete_source_snapshot !== true) {
    failures.push({ path: "manifest.json", reason: "invalid dataset identity, schema, status, or completeness" });
  }
  if (manifest.source?.dataset_id !== NYC_DCWP_ACTIVE_PREMISE_DATASET_ID || manifest.source?.schema_fingerprint !== NYC_DCWP_ACTIVE_PREMISE_SCHEMA_FINGERPRINT || manifest.source?.license !== "NYC Open Data Terms of Use" || manifest.source?.selected_where !== NYC_DCWP_ACTIVE_PREMISE_WHERE) {
    failures.push({ path: "manifest.json", reason: "source identity, schema, filter, or license mismatch" });
  }
  if (manifest.policy?.record_level_distribution !== "local-review-only" || manifest.coverage?.complete_all_businesses !== false) {
    failures.push({ path: "manifest.json", reason: "privacy or completeness policy was overstated" });
  }
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
  const sourceArtifact = artifacts.find((artifact) => artifact.artifact_type === "nyc-dcwp-active-premise-license-source-jsonl-gzip");
  let sourceCount = 0;
  const sourceRowIds = new Set();
  try {
    if (!sourceArtifact || sourceArtifact.export_policy !== "internal") throw new Error("missing or misclassified selected source artifact");
    for await (const record of gzipRecords(path.join(releaseDirectory, sourceArtifact.path))) {
      sourceCount += 1;
      const rowId = textValue(record.socrata_row_id);
      if (!rowId || sourceRowIds.has(rowId)) throw new Error("missing or duplicate source row identity");
      sourceRowIds.add(rowId);
      if (containsExcludedField(record)) throw new Error("excluded source field leaked");
      if (Object.keys(record).some((field) => !NYC_DCWP_ACTIVE_PREMISE_SOURCE_FIELDS.includes(field))) throw new Error("unapproved selected source field");
      if (textValue(record.license_status)?.toUpperCase() !== "ACTIVE" || textValue(record.license_type)?.toUpperCase() !== "PREMISES") throw new Error("source row violates Active/Premises filter");
    }
    if (sourceCount !== sourceArtifact.record_count || sourceCount !== manifest.coverage.source_active_premise_license_records) throw new Error("source record count mismatch");
  } catch (error) {
    failures.push({ path: sourceArtifact?.path ?? "source/selected-records.jsonl.gz", reason: error.message });
  }
  const normalizedArtifacts = artifacts.filter((artifact) => artifact.artifact_type === "normalized-nyc-dcwp-active-license-site-jsonl-gzip");
  if (normalizedArtifacts.length !== 16) failures.push({ path: "normalized/sites", reason: `expected 16 normalized partitions; found ${normalizedArtifacts.length}` });
  let normalizedSiteCount = 0;
  let acceptedLicenseRecordCount = 0;
  let coordinateCount = 0;
  let coordinateConflictCount = 0;
  const normalizedIds = new Set();
  const organizationIds = new Set();
  const accountedSourceRowIds = new Set();
  const zipCounts = new Map();
  for (const artifact of normalizedArtifacts) {
    try {
      if (artifact.export_policy !== "local-review-only") throw new Error("normalized artifact lost local-review-only policy");
      let artifactCount = 0;
      for await (const record of gzipRecords(path.join(releaseDirectory, artifact.path))) {
        artifactCount += 1;
        normalizedSiteCount += 1;
        if (normalizedIds.has(record.normalized_record_id)) throw new Error(`duplicate normalized record ${record.normalized_record_id}`);
        normalizedIds.add(record.normalized_record_id);
        if (!/^nyc-dcwp-active-business:business:BA-\d+-\d{4}$/.test(record.normalized_record_id)
          || !/^organization:nyc_dcwp_business_ba_\d+_\d{4}$/.test(record.entity_candidates?.organization_id ?? "")
          || !/^site:nyc_dcwp_business_ba_\d+_\d{4}$/.test(record.entity_candidates?.physical_site_id ?? "")
          || !/^establishment:nyc_dcwp_business_ba_\d+_\d{4}$/.test(record.entity_candidates?.establishment_id ?? "")) throw new Error("invalid normalized identity");
        organizationIds.add(record.entity_candidates.organization_id);
        if (!/^\d{5}$/.test(record.address?.zip_code ?? "") || !record.address?.street || !record.address?.city || record.address?.country !== "US") throw new Error("invalid normalized address");
        if (record.source_status?.value !== "listed-as-active-nyc-dcwp-premise-license-as-of-source-refresh" || record.export_policy !== "local-review-only") throw new Error("invalid source status or export policy");
        if (record.provenance?.policy_id !== "nyc-dcwp-active-premises" || record.provenance?.source_release_id !== manifest.source_release_id) throw new Error("invalid provenance");
        if (record.privacy?.individual_license_rows_excluded !== true || record.privacy?.contact_phone_and_free_form_detail_excluded !== true || containsExcludedField(record)) throw new Error("privacy-minimized field contract failed");
        if (!Array.isArray(record.active_licenses) || !record.active_licenses.length) throw new Error("normalized site has no active licenses");
        for (const licenseRecord of record.active_licenses) {
          acceptedLicenseRecordCount += 1;
          if (licenseRecord.license_status !== "ACTIVE" || licenseRecord.license_type !== "PREMISES" || !licenseRecord.license_number || !licenseRecord.initial_issuance_date || !licenseRecord.expiration_date) throw new Error("license row violates Active/Premises contract");
          if (!licenseRecord.source_record_id || accountedSourceRowIds.has(licenseRecord.source_record_id) || !sourceRowIds.has(licenseRecord.source_record_id)) throw new Error("accepted source row identity is missing, duplicate, or unknown");
          accountedSourceRowIds.add(licenseRecord.source_record_id);
        }
        if (record.location?.coordinates) coordinateCount += 1;
        if (record.location?.coordinate_scope === "conflicting-source-geocodes-suppressed") coordinateConflictCount += 1;
        increment(zipCounts, record.address.zip_code);
      }
      if (artifactCount !== artifact.record_count) throw new Error("normalized artifact record count mismatch");
    } catch (error) {
      failures.push({ path: artifact.path, reason: error.message });
    }
  }
  if (normalizedSiteCount !== manifest.coverage?.normalized_licensed_sites || normalizedSiteCount !== manifest.coverage?.physical_sites || normalizedSiteCount !== manifest.coverage?.establishments || organizationIds.size !== manifest.coverage?.organizations || organizationIds.size !== manifest.coverage?.unique_business_ids) {
    failures.push({ path: "manifest.json", reason: "normalized entity counts do not reconcile" });
  }
  if (acceptedLicenseRecordCount !== manifest.coverage?.accepted_active_premise_license_records) failures.push({ path: "manifest.json", reason: "accepted license-record count does not reconcile" });
  if (coordinateCount !== manifest.coverage?.source_geocoded_sites || coordinateConflictCount !== manifest.coverage?.source_coordinate_conflict_sites) failures.push({ path: "manifest.json", reason: "source coordinate counts do not reconcile" });
  const quarantineArtifact = artifacts.find((artifact) => artifact.artifact_type === "nyc-dcwp-active-license-quarantine-jsonl-gzip");
  let quarantineGroupCount = 0;
  let quarantinedSourceRecordCount = 0;
  try {
    if (!quarantineArtifact || quarantineArtifact.export_policy !== "internal") throw new Error("missing or misclassified quarantine artifact");
    for await (const record of gzipRecords(path.join(releaseDirectory, quarantineArtifact.path))) {
      quarantineGroupCount += 1;
      if (!QUARANTINE_REASONS.has(record.reason) || record.export_policy !== "internal" || !Number.isInteger(record.source_record_count) || record.source_record_count < 1 || record.source_record_count !== record.source_record_ids?.length) throw new Error("invalid quarantine record");
      quarantinedSourceRecordCount += record.source_record_count;
      for (const rowId of record.source_record_ids) {
        if (!sourceRowIds.has(rowId) || accountedSourceRowIds.has(rowId)) throw new Error("quarantined source row identity is duplicate or unknown");
        accountedSourceRowIds.add(rowId);
      }
    }
    if (quarantineGroupCount !== quarantineArtifact.record_count || quarantineGroupCount !== manifest.coverage.quarantined_business_groups || quarantinedSourceRecordCount !== manifest.coverage.quarantined_source_records) throw new Error("quarantine counts do not reconcile");
  } catch (error) {
    failures.push({ path: quarantineArtifact?.path ?? "quality/quarantine.jsonl.gz", reason: error.message });
  }
  if (sourceCount !== acceptedLicenseRecordCount + quarantinedSourceRecordCount || accountedSourceRowIds.size !== sourceRowIds.size) failures.push({ path: "manifest.json", reason: "source, accepted, and quarantine rows do not reconcile" });
  if (manifest.coverage?.source_business_unique_id_groups !== normalizedSiteCount + quarantineGroupCount) failures.push({ path: "manifest.json", reason: "source Business Unique ID groups do not reconcile" });
  const zipArtifact = artifacts.find((artifact) => artifact.artifact_type === "nyc-dcwp-active-license-zip-coverage-jsonl");
  try {
    if (!zipArtifact || zipArtifact.distribution_policy !== "public-aggregate-with-source-limitations") throw new Error("missing or misclassified ZIP artifact");
    const rows = (await readFile(path.join(releaseDirectory, zipArtifact.path), "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse);
    if (rows.length !== zipArtifact.record_count || rows.length !== manifest.coverage.zip_union_records) throw new Error("ZIP row count mismatch");
    if (new Set(rows.map((row) => row.zip_code)).size !== rows.length) throw new Error("duplicate ZIP coverage row");
    const contributionCount = rows.reduce((sum, row) => sum + (row.nyc_dcwp_active_premise_license_snapshot?.licensed_site_count ?? 0), 0);
    if (contributionCount !== normalizedSiteCount) throw new Error("ZIP contribution counts do not reconcile");
    for (const [zipCode, count] of zipCounts) {
      const row = rows.find((candidate) => candidate.zip_code === zipCode);
      if (row?.nyc_dcwp_active_premise_license_snapshot?.licensed_site_count !== count) throw new Error(`ZIP ${zipCode} contribution mismatch`);
    }
  } catch (error) {
    failures.push({ path: zipArtifact?.path ?? "derived/zip-coverage.jsonl", reason: error.message });
  }
  if (failures.length) {
    const error = new Error(`NYC DCWP active-premise-license verification failed for ${failures.length} check(s).`);
    error.failures = failures;
    throw error;
  }
  return { dataset_id: manifest.dataset_id, release_id: manifest.release_id, source_release_id: manifest.source_release_id, artifact_count: artifacts.length, coverage: manifest.coverage };
}
