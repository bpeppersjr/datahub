import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { finished } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";

export const CHICAGO_ACTIVE_BUSINESS_LICENSE_SCHEMA_VERSION = "1.0.0";
export const CHICAGO_ACTIVE_BUSINESS_LICENSE_TRANSFORMATION_VERSION = "chicago-active-business-licenses@1.0.0";
export const CHICAGO_ACTIVE_BUSINESS_LICENSE_DATASET_ID = "uupf-x98q";
export const CHICAGO_ACTIVE_BUSINESS_LICENSE_UNDERLYING_DATASET_ID = "r5kz-chrr";
export const CHICAGO_ACTIVE_BUSINESS_LICENSE_METADATA_URL = `https://data.cityofchicago.org/api/views/${CHICAGO_ACTIVE_BUSINESS_LICENSE_DATASET_ID}`;
export const CHICAGO_ACTIVE_BUSINESS_LICENSE_API_URL = `https://data.cityofchicago.org/resource/${CHICAGO_ACTIVE_BUSINESS_LICENSE_DATASET_ID}.json`;
export const CHICAGO_ACTIVE_BUSINESS_LICENSE_PAGE_URL = `https://data.cityofchicago.org/d/${CHICAGO_ACTIVE_BUSINESS_LICENSE_DATASET_ID}`;
export const CHICAGO_DATA_PORTAL_TERMS_URL = "https://data.cityofchicago.org/terms";

export const CHICAGO_ACTIVE_BUSINESS_LICENSE_SCHEMA = Object.freeze([
  ["id", "text"],
  ["license_id", "number"],
  ["account_number", "number"],
  ["site_number", "number"],
  ["legal_name", "text"],
  ["doing_business_as_name", "text"],
  ["address", "text"],
  ["city", "text"],
  ["state", "text"],
  ["zip_code", "text"],
  ["ward", "number"],
  ["precinct", "number"],
  ["police_district", "number"],
  ["community_area", "number"],
  ["community_area_name", "text"],
  ["neighborhood", "text"],
  ["license_code", "number"],
  ["license_description", "text"],
  ["business_activity_id", "text"],
  ["business_activity", "text"],
  ["license_number", "number"],
  ["application_type", "text"],
  ["license_start_date", "calendar_date"],
  ["expiration_date", "calendar_date"],
  ["date_issued", "calendar_date"],
  ["license_status", "text"],
  ["license_status_change_date", "calendar_date"],
  ["latitude", "number"],
  ["longitude", "number"],
]);
export const CHICAGO_ACTIVE_BUSINESS_LICENSE_FIELDS = Object.freeze(CHICAGO_ACTIVE_BUSINESS_LICENSE_SCHEMA.map(([field]) => field));
export const CHICAGO_ACTIVE_BUSINESS_LICENSE_SOURCE_FIELDS = Object.freeze(["socrata_row_id", ...CHICAGO_ACTIVE_BUSINESS_LICENSE_FIELDS]);
export const CHICAGO_ACTIVE_BUSINESS_LICENSE_SCHEMA_FINGERPRINT = "90d2a99073c777088f01c07d92b72bb30f4e25ba522d78a8536a2681407e72f8";

const US_STATE_AND_TERRITORY_CODES = new Set([
  "AL", "AK", "AS", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "GU", "HI", "ID", "IL", "IN", "IA", "KS", "KY",
  "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "MP", "OH", "OK",
  "OR", "PA", "PR", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "VI", "WA", "WV", "WI", "WY",
]);
const QUARANTINE_REASONS = new Set([
  "publisher-redacted-address",
  "missing-business-location-address",
  "invalid-or-unmapped-us-zip",
  "invalid-source-state",
  "source-state-conflicts-with-postal-label",
  "conflicting-site-addresses",
  "invalid-source-coordinate",
]);
const EXCLUDED_SOURCE_FIELDS = new Set([
  "owner_name", "officer_name", "registered_agent", "agent_name", "contact_email", "email", "phone",
  "payment_date", "application_created_date", "application_requirements_complete", "license_approved_for_issuance",
  "conditional_approval", "ward_precinct", "ssa",
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
  if (!Number.isInteger(unixSeconds) || unixSeconds <= 0) throw new Error("Chicago catalog rowsUpdatedAt must be a positive Unix timestamp.");
  return new Date(unixSeconds * 1000).toISOString();
}

function integerText(value, label) {
  const result = textValue(value);
  if (!/^\d+$/.test(result ?? "") || BigInt(result) <= 0n) throw new Error(`missing-or-invalid-${label}`);
  return result;
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
    postal_code: match[2] ? `${match[1]}-${match[2]}` : match[1],
    zip4: match[2] ?? null,
    status: match[2] ? "normalized-zip-plus-4" : "normalized-zip5",
  };
}

function uniqueText(records, field) {
  return [...new Set(records.map((record) => textValue(record[field])).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function pipeValues(value) {
  return [...new Set(String(value ?? "").split("|").map((part) => part.trim()).filter(Boolean))];
}

function consistentInteger(records, field) {
  const values = uniqueText(records, field);
  if (values.length !== 1 || !/^\d+$/.test(values[0])) return null;
  return Number(values[0]);
}

function normalizedAddressKey(record) {
  return [record.address, record.city, record.state, record.zip_code]
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
  const withinBroadChicagoBounds = coordinate[0] >= -87.95 && coordinate[0] <= -87.50 && coordinate[1] >= 41.60 && coordinate[1] <= 42.05;
  return {
    type: "Point",
    coordinates: coordinate,
    coordinate_scope: "portal-geocoded-reported-license-address-not-independently-verified",
    plausibility: withinBroadChicagoBounds ? "within-broad-chicago-bounds-not-independently-validated" : "outside-broad-chicago-bounds-or-offsite-license",
  };
}

function geography(zipCode, sourceState, records, baselineByZip) {
  const baseline = baselineByZip?.get(zipCode);
  const postalState = textValue(baseline?.postal_label?.preferred_state)?.toUpperCase() ?? null;
  if (!baseline) throw new Error("invalid-or-unmapped-us-zip");
  if (postalState && sourceState !== postalState) throw new Error("source-state-conflicts-with-postal-label");
  const ward = consistentInteger(records, "ward");
  return {
    zip_code: zipCode,
    source_reported_state: sourceState,
    postal_label_state: postalState,
    state_consistency: postalState ? "source-matches-census-zbp-postal-label" : "postal-label-state-not-available",
    zcta_match_status: baseline.geography?.status ?? "no-2020-zcta-polygon",
    zcta_geo_id: baseline.geography?.geo_id ?? null,
    zcta_geoid: baseline.geography?.geoid ?? null,
    zcta_geometry_file: baseline.geography?.geometry_file ?? null,
    chicago_source_geography: {
      assignment_status: ward ? "source-reported-chicago-geography" : "not-reported-or-offsite-license",
      ward,
      precinct: consistentInteger(records, "precinct"),
      police_district: consistentInteger(records, "police_district"),
      community_area: consistentInteger(records, "community_area"),
      community_area_names: uniqueText(records, "community_area_name"),
      neighborhoods: uniqueText(records, "neighborhood"),
      independently_verified: false,
    },
  };
}

function provenance(context, accountNumber, siteNumber, sourceRecordIds) {
  return {
    source_id: "city-of-chicago-bacp-current-active-business-licenses",
    source_release_id: context.sourceReleaseId,
    source_record_id: `account:${accountNumber}:site:${siteNumber}`,
    source_record_ids: sourceRecordIds,
    ingest_run_id: context.runId,
    transformation_version: CHICAGO_ACTIVE_BUSINESS_LICENSE_TRANSFORMATION_VERSION,
    policy_id: "chicago-active-business-licenses",
  };
}

function compareText(left, right) {
  return String(left ?? "").localeCompare(String(right ?? ""), "en", { numeric: true });
}

function compareSourceRows(left, right) {
  return compareText(left.account_number, right.account_number)
    || compareText(left.site_number, right.site_number)
    || compareText(left.license_id, right.license_id)
    || compareText(left.socrata_row_id, right.socrata_row_id);
}

export function schemaFingerprint(columns) {
  const byField = new Map((columns ?? []).map((column) => [column.fieldName, column.dataTypeName]));
  return sha256(CHICAGO_ACTIVE_BUSINESS_LICENSE_SCHEMA.map(([field]) => `${field}:${byField.get(field) ?? null}`).join("\u0000"));
}

function selectedRecord(row) {
  return Object.fromEntries(CHICAGO_ACTIVE_BUSINESS_LICENSE_SOURCE_FIELDS.filter((field) => row[field] !== undefined).map((field) => [field, row[field]]));
}

export function normalizeChicagoLicensedSite(sourceRecords, context) {
  if (!Array.isArray(sourceRecords) || !sourceRecords.length) throw new Error("missing-chicago-site-group");
  const accountNumber = integerText(sourceRecords[0].account_number, "chicago-account-number");
  const siteNumber = integerText(sourceRecords[0].site_number, "chicago-site-number");
  for (const record of sourceRecords) {
    if (integerText(record.account_number, "chicago-account-number") !== accountNumber || integerText(record.site_number, "chicago-site-number") !== siteNumber) {
      throw new Error("conflicting-chicago-site-identity");
    }
  }
  const legalNames = uniqueText(sourceRecords, "legal_name");
  if (!legalNames.length) throw new Error("missing-or-invalid-chicago-site-identity");
  const rawAddress = textValue(sourceRecords[0].address);
  if (sourceRecords.some((record) => /redacted/i.test(textValue(record.address) ?? ""))) throw new Error("publisher-redacted-address");
  if (!rawAddress || !textValue(sourceRecords[0].city)) throw new Error("missing-business-location-address");
  if (new Set(sourceRecords.map(normalizedAddressKey)).size !== 1) throw new Error("conflicting-site-addresses");
  const sourceState = textValue(sourceRecords[0].state)?.toUpperCase() ?? null;
  if (!sourceState || !US_STATE_AND_TERRITORY_CODES.has(sourceState)) throw new Error("invalid-source-state");
  const postal = postalCode(sourceRecords[0].zip_code);
  const geo = geography(postal.zip_code, sourceState, sourceRecords, context.baselineByZip);
  const sourceRecordIds = sourceRecords.map((record) => textValue(record.socrata_row_id)).sort(compareText);
  const activeLicenses = sourceRecords.map((record) => {
    const status = textValue(record.license_status)?.toUpperCase() ?? null;
    const expirationDate = dateValue(record.expiration_date, "license-expiration-date", true);
    if (status !== "AAI" || expirationDate <= context.sourceFilterDate) throw new Error("source-row-not-current-active");
    return {
      source_record_id: textValue(record.socrata_row_id),
      calculated_id: textValue(record.id),
      license_id: integerText(record.license_id, "chicago-license-id"),
      license_number: integerText(record.license_number, "chicago-license-number"),
      license_code: integerText(record.license_code, "chicago-license-code"),
      license_description: textValue(record.license_description),
      business_activity_ids: pipeValues(record.business_activity_id),
      business_activities: pipeValues(record.business_activity),
      application_type: textValue(record.application_type),
      license_start_date: dateValue(record.license_start_date, "license-start-date"),
      expiration_date: expirationDate,
      date_issued: dateValue(record.date_issued, "date-issued"),
      license_status: status,
      license_status_change_date: dateValue(record.license_status_change_date, "license-status-change-date"),
    };
  }).sort((left, right) => compareText(left.license_id, right.license_id) || compareText(left.source_record_id, right.source_record_id));
  const suffix = `${accountNumber}_site_${siteNumber}`;
  return {
    schema_version: CHICAGO_ACTIVE_BUSINESS_LICENSE_SCHEMA_VERSION,
    normalized_record_id: `chicago-active-business:account:${accountNumber}:site:${siteNumber}`,
    entity_candidates: {
      organization_id: `organization:chicago_bacp_account_${accountNumber}`,
      physical_site_id: `site:chicago_bacp_account_${suffix}`,
      establishment_id: `establishment:chicago_bacp_account_${suffix}`,
      identity_status: "provisional",
    },
    external_identifiers: [
      { type: "chicago_bacp_account_number", value: accountNumber, source_field: "account_number" },
      { type: "chicago_bacp_site_number", value: siteNumber, source_field: "site_number", account_number: accountNumber },
    ],
    legal_names: legalNames,
    doing_business_as_names: uniqueText(sourceRecords, "doing_business_as_name"),
    address: {
      street: rawAddress,
      unit_or_additional: null,
      city: textValue(sourceRecords[0].city),
      state: sourceState,
      postal_code_source: postal.source,
      zip_code: postal.zip_code,
      postal_code: postal.postal_code,
      zip4: postal.zip4,
      postal_code_status: postal.status,
      country: "US",
      source_scope: "reported-current-active-license-site-address",
      independently_verified: false,
    },
    location: sourceCoordinate(sourceRecords),
    geography: geo,
    active_licenses: activeLicenses,
    source_status: {
      value: "listed-in-city-of-chicago-current-active-business-license-view-as-of-source-refresh",
      status: "Active license (source-defined)",
      semantics: "source-view-requires-aai-status-and-future-expiration-not-independent-proof-of-continuous-operation-or-complete-business-coverage",
      source_filter_reference_date: context.sourceFilterDate,
      source_rows_updated_at: context.sourceRowsUpdatedAt,
    },
    privacy: {
      classification: "possible-natural-person-name-or-residential-license-address",
      publisher_redaction_honored: true,
      ownership_contact_and_payment_fields_excluded: true,
      record_level_distribution: "local-review-only",
    },
    observed_at: context.retrievedAt,
    provenance: provenance(context, accountNumber, siteNumber, sourceRecordIds),
    export_policy: "local-review-only",
  };
}

function assertAllowedUrl(urlValue, type) {
  const url = new URL(urlValue);
  if (url.protocol !== "https:" || url.hostname !== "data.cityofchicago.org") throw new Error(`Chicago ${type} URL is not allowed.`);
  const expected = type === "metadata" ? `/api/views/${CHICAGO_ACTIVE_BUSINESS_LICENSE_DATASET_ID}` : `/resource/${CHICAGO_ACTIVE_BUSINESS_LICENSE_DATASET_ID}.json`;
  if (url.pathname !== expected) throw new Error(`Chicago ${type} path is not allowed.`);
  return url;
}

function retryDelay(response, attempt) {
  const retryAfter = Number(response?.headers?.get?.("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter >= 0) return Math.min(retryAfter * 1000, 30_000);
  return Math.min(500 * (2 ** attempt), 8_000);
}

export async function requestChicagoJson(urlValue, {
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
    if (response.status >= 300 && response.status < 400) throw new Error(`Chicago ${type} redirect rejected (${response.status}).`);
    if (!response.ok) {
      if ((response.status === 429 || response.status >= 500) && attempt + 1 < attempts) {
        await sleep(retryDelay(response, attempt));
        continue;
      }
      throw new Error(`Chicago ${type} request failed with HTTP ${response.status}.`);
    }
    const declaredBytes = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredBytes) && declaredBytes > maximumResponseBytes) throw new Error(`Chicago ${type} response exceeds the byte limit.`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maximumResponseBytes) throw new Error(`Chicago ${type} response exceeds the byte limit.`);
    try {
      return JSON.parse(buffer.toString("utf8"));
    } catch {
      throw new Error(`Chicago ${type} response was not valid JSON.`);
    }
  }
  throw new Error(`Chicago ${type} request exhausted retries.`);
}

function validateCatalogMetadata(metadata, expectedFingerprint = CHICAGO_ACTIVE_BUSINESS_LICENSE_SCHEMA_FINGERPRINT) {
  if (metadata?.id !== CHICAGO_ACTIVE_BUSINESS_LICENSE_DATASET_ID || metadata?.name !== "Business Licenses - Current Active") throw new Error("Unexpected Chicago active-license catalog identity.");
  if (metadata?.attribution !== "City of Chicago" || metadata?.licenseId !== "SEE_TERMS_OF_USE" || metadata?.provenance !== "official" || metadata?.modifyingViewUid !== CHICAGO_ACTIVE_BUSINESS_LICENSE_UNDERLYING_DATASET_ID) {
    throw new Error("Unexpected Chicago active-license attribution, provenance, underlying source, or license.");
  }
  const query = String(metadata.queryString ?? "");
  const dateMatch = query.match(/`?expiration_date`?\s*>\s*"(\d{4}-\d{2}-\d{2})T00:00:00"/i);
  const statusMatch = /upper\(`?license_status`?\)\s*=\s*"AAI"/i.test(query);
  if (!dateMatch || !statusMatch) throw new Error("Unexpected Chicago current-active view semantics.");
  const fingerprint = schemaFingerprint(metadata.columns);
  if (fingerprint !== expectedFingerprint) throw new Error(`Chicago selected schema changed (${fingerprint}).`);
  return { fingerprint, rowsUpdatedAt: sourceTimestamp(metadata.rowsUpdatedAt), sourceFilterDate: dateMatch[1] };
}

function soqlUrl(parameters) {
  const url = new URL(CHICAGO_ACTIVE_BUSINESS_LICENSE_API_URL);
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, String(value));
  return url.toString();
}

async function sourceCount(options) {
  const rows = await requestChicagoJson(soqlUrl({ "$select": "count(*)" }), { ...options, type: "data" });
  const count = Number(rows?.[0]?.count);
  if (!Number.isInteger(count) || count < 0) throw new Error("Chicago source count query returned an invalid count.");
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
  const extra = Object.keys(record).filter((field) => !CHICAGO_ACTIVE_BUSINESS_LICENSE_SOURCE_FIELDS.includes(field));
  if (extra.length) throw new Error(`Unapproved Chicago source field ${extra[0]}.`);
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
      const select = `:id as socrata_row_id,${CHICAGO_ACTIVE_BUSINESS_LICENSE_FIELDS.join(",")}`;
      const rows = await requestChicagoJson(soqlUrl({ "$select": select, "$order": "account_number,site_number,license_id,:id", "$limit": pageSize, "$offset": offset }), {
        fetchImpl, signal, sleep, type: "data",
      });
      if (!Array.isArray(rows) || !rows.length) throw new Error(`Chicago source page at offset ${offset} was empty before the expected count.`);
      for (const row of rows) {
        await writeGzipRecord(writer, sourceSafeRecord(row));
        count += 1;
      }
      logger(`Acquired ${count.toLocaleString()} of ${expectedCount.toLocaleString()} Chicago active-license rows.`);
    }
  }
  if (count !== expectedCount) throw new Error(`Chicago source count mismatch: acquired ${count}, expected ${expectedCount}.`);
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
      schema_version: CHICAGO_ACTIVE_BUSINESS_LICENSE_SCHEMA_VERSION,
      zip_code: zipCode,
      chicago_active_business_license_snapshot: {
        status: count ? "published-source-defined-current-active-license-sites" : "no-license-site-in-current-source-snapshot",
        licensed_site_count: count,
        source_release_id: context.sourceReleaseId,
        source_rows_updated_at: context.sourceRowsUpdatedAt,
        source_filter_reference_date: context.sourceFilterDate,
        active_semantics: "aai-license-with-future-expiration-not-independent-proof-of-continuous-operation-or-complete-business-coverage",
      },
      current_usps_validity: baseline?.current_usps_validity ?? { status: "unverified", reason: "ZIP appears in the Chicago source but is outside the current ZBP/ZCTA union." },
      postal_label: baseline?.postal_label ?? null,
      geography: baseline?.geography ?? { status: "no-2020-zcta-polygon", geo_id: null, geoid: null, geometry_file: null },
      employer_baseline: baseline?.employer_baseline ?? null,
      baseline_coverage_status: baseline?.coverage_status ?? "outside-zbp-zcta-union",
    };
  });
}

export async function buildChicagoActiveBusinessLicenses({
  outputRoot,
  zbpPointer,
  catalogMetadata = null,
  sourceRecords = null,
  minimumLicenseRecords = 40_000,
  maximumQuarantineRate = 0.05,
  pageSize = 50_000,
  expectedSchemaFingerprint = CHICAGO_ACTIVE_BUSINESS_LICENSE_SCHEMA_FINGERPRINT,
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
  const metadata = catalogMetadata ?? await requestChicagoJson(CHICAGO_ACTIVE_BUSINESS_LICENSE_METADATA_URL, { fetchImpl, signal, sleep, type: "metadata" });
  const catalog = validateCatalogMetadata(metadata, expectedSchemaFingerprint);
  const expectedCount = sourceRecords ? Number(metadata.sourceRecordCount) : await sourceCount({ fetchImpl, signal, sleep });
  if (!Number.isInteger(expectedCount) || expectedCount < minimumLicenseRecords) throw new Error(`Chicago source count ${expectedCount} is below the minimum ${minimumLicenseRecords}.`);
  const sourceWriter = await openGzipWriter(stagingDirectory, "source/selected-records.jsonl.gz");
  try {
    await acquireSource({ writer: sourceWriter, sourceRecords, expectedCount, fetchImpl, signal, sleep, pageSize, logger });
  } catch (error) {
    await abortGzipWriters([sourceWriter]);
    throw error;
  }
  const sourceArtifact = await closeGzipWriter(sourceWriter, "chicago-active-business-license-source-jsonl-gzip", { export_policy: "internal" });
  const sourceReleaseId = `chicago-active-business-licenses-${catalog.rowsUpdatedAt.slice(0, 10)}-${sourceArtifact.sha256.slice(0, 16)}`;
  const releaseId = `chicago-active-business-licenses-${releaseTimestamp(retrievedAt)}-${runId.slice(0, 8)}`;
  const context = { runId, retrievedAt, sourceRowsUpdatedAt: catalog.rowsUpdatedAt, sourceFilterDate: catalog.sourceFilterDate, sourceReleaseId, baselineByZip: baseline.byZip };
  const normalizedWriters = new Map();
  for (const prefix of "0123456789abcdef") normalizedWriters.set(prefix, await openGzipWriter(stagingDirectory, `normalized/sites/prefix=${prefix}.jsonl.gz`));
  const quarantineWriter = await openGzipWriter(stagingDirectory, "quality/quarantine.jsonl.gz");
  const zipCounts = new Map();
  const quarantineReasons = new Map();
  const licenseTypeCounts = new Map();
  const organizations = new Set();
  const sourceRowIds = new Set();
  let normalizedSiteCount = 0;
  let acceptedLicenseRecordCount = 0;
  let quarantinedSourceRecordCount = 0;
  let sourceSiteGroups = 0;
  let sourceGeocodedSiteCount = 0;
  let sourceCoordinateConflictSiteCount = 0;
  let inChicagoWardSiteCount = 0;
  let outsideOrUnreportedWardSiteCount = 0;
  let currentGroup = [];
  let currentKey = null;
  const flushGroup = async () => {
    if (!currentGroup.length) return;
    sourceSiteGroups += 1;
    const account = textValue(currentGroup[0].account_number);
    const site = textValue(currentGroup[0].site_number);
    try {
      const normalized = normalizeChicagoLicensedSite(currentGroup, context);
      const prefix = sha256(normalized.normalized_record_id)[0];
      await writeGzipRecord(normalizedWriters.get(prefix), normalized);
      normalizedSiteCount += 1;
      acceptedLicenseRecordCount += normalized.active_licenses.length;
      organizations.add(normalized.entity_candidates.organization_id);
      increment(zipCounts, normalized.address.zip_code);
      if (normalized.location?.coordinates) sourceGeocodedSiteCount += 1;
      if (normalized.location?.coordinate_scope === "conflicting-source-geocodes-suppressed") sourceCoordinateConflictSiteCount += 1;
      if (normalized.geography.chicago_source_geography.ward) inChicagoWardSiteCount += 1;
      else outsideOrUnreportedWardSiteCount += 1;
      for (const licenseRecord of normalized.active_licenses) increment(licenseTypeCounts, `${licenseRecord.license_code}:${licenseRecord.license_description ?? ""}`);
    } catch (error) {
      if (!QUARANTINE_REASONS.has(error.message)) throw error;
      increment(quarantineReasons, error.message, currentGroup.length);
      quarantinedSourceRecordCount += currentGroup.length;
      await writeGzipRecord(quarantineWriter, {
        schema_version: CHICAGO_ACTIVE_BUSINESS_LICENSE_SCHEMA_VERSION,
        source_group_id: `account:${account ?? "<blank>"}:site:${site ?? "<blank>"}`,
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
      if (!rowId || sourceRowIds.has(rowId)) throw new Error(`Duplicate Chicago Socrata row ${rowId ?? "<blank>"}.`);
      sourceRowIds.add(rowId);
      const key = `${textValue(source.account_number)}:${textValue(source.site_number)}`;
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
    throw new Error(`Chicago quarantine rate ${quarantineRate} exceeds the maximum ${maximumQuarantineRate}.`);
  }
  if (acceptedLicenseRecordCount < minimumLicenseRecords - Math.floor(expectedCount * maximumQuarantineRate)) {
    await abortGzipWriters([...normalizedWriters.values(), quarantineWriter]);
    throw new Error("Chicago accepted license-record count is below the governed minimum after quarantine.");
  }
  const normalizedArtifacts = [];
  for (const writer of normalizedWriters.values()) normalizedArtifacts.push(await closeGzipWriter(writer, "normalized-chicago-active-business-license-site-jsonl-gzip", { export_policy: "local-review-only" }));
  const quarantineArtifact = await closeGzipWriter(quarantineWriter, "chicago-active-business-license-quarantine-jsonl-gzip", { export_policy: "internal" });
  if (!sourceRecords) {
    const finalMetadata = await requestChicagoJson(CHICAGO_ACTIVE_BUSINESS_LICENSE_METADATA_URL, { fetchImpl, signal, sleep, type: "metadata" });
    const finalCatalog = validateCatalogMetadata(finalMetadata, expectedSchemaFingerprint);
    const finalCount = await sourceCount({ fetchImpl, signal, sleep });
    if (finalCatalog.rowsUpdatedAt !== catalog.rowsUpdatedAt || finalCatalog.sourceFilterDate !== catalog.sourceFilterDate || finalCount !== expectedCount) {
      throw new Error("Chicago source changed during acquisition; staging was not published.");
    }
  }
  const zipRows = buildZipCoverage(baseline.rows, zipCounts, context);
  const zipArtifact = await writeArtifact(stagingDirectory, "derived/zip-coverage.jsonl", jsonLines(zipRows), {
    record_count: zipRows.length,
    artifact_type: "chicago-active-business-license-zip-coverage-jsonl",
    distribution_policy: "public-aggregate-with-source-limitations",
  });
  const sourceSummary = {
    dataset_id: "chicago-active-business-license-sites",
    source_release_id: sourceReleaseId,
    source_rows_updated_at: catalog.rowsUpdatedAt,
    source_filter_reference_date: catalog.sourceFilterDate,
    retrieved_at: retrievedAt,
    source_active_license_records: expectedCount,
    source_account_site_groups: sourceSiteGroups,
    accepted_active_license_records: acceptedLicenseRecordCount,
    normalized_licensed_sites: normalizedSiteCount,
    unique_license_accounts: organizations.size,
    quarantined_source_records: quarantinedSourceRecordCount,
    quarantined_site_groups: quarantineWriter.records,
    quarantine_rate: quarantineRate,
    quarantine_reasons: sortedCounts(quarantineReasons),
    source_geocoded_sites: sourceGeocodedSiteCount,
    source_coordinate_conflict_sites: sourceCoordinateConflictSiteCount,
    in_chicago_ward_sites: inChicagoWardSiteCount,
    outside_or_unreported_ward_sites: outsideOrUnreportedWardSiteCount,
    source_zip_codes: zipCounts.size,
    license_type_counts: sortedCounts(licenseTypeCounts),
    selected_fields: CHICAGO_ACTIVE_BUSINESS_LICENSE_FIELDS,
    excluded_field_groups: ["ownership, officer, agent, and contact", "payment and application workflow", "publisher-redundant point and computed geography"],
    record_level_distribution: "local-review-only",
  };
  const summaryArtifact = await writeArtifact(stagingDirectory, "quality/source-summary.json", json(sourceSummary), { artifact_type: "chicago-active-business-license-source-summary" });
  const sourceMetadataArtifact = await writeArtifact(stagingDirectory, "source/catalog-metadata.json", json(metadata), { artifact_type: "chicago-active-business-license-source-release-metadata", export_policy: "internal" });
  const artifacts = [sourceArtifact, sourceMetadataArtifact, ...normalizedArtifacts, quarantineArtifact, zipArtifact, summaryArtifact];
  const manifest = {
    schema_version: CHICAGO_ACTIVE_BUSINESS_LICENSE_SCHEMA_VERSION,
    dataset_id: "chicago-active-business-license-sites",
    release_id: releaseId,
    source_release_id: sourceReleaseId,
    status: "complete",
    complete_source_snapshot: true,
    created_at: retrievedAt,
    source: {
      publisher: "City of Chicago Department of Business Affairs and Consumer Protection",
      dataset_id: CHICAGO_ACTIVE_BUSINESS_LICENSE_DATASET_ID,
      underlying_dataset_id: CHICAGO_ACTIVE_BUSINESS_LICENSE_UNDERLYING_DATASET_ID,
      page_url: CHICAGO_ACTIVE_BUSINESS_LICENSE_PAGE_URL,
      api_url: CHICAGO_ACTIVE_BUSINESS_LICENSE_API_URL,
      rows_updated_at: catalog.rowsUpdatedAt,
      active_filter_reference_date: catalog.sourceFilterDate,
      schema_fingerprint: catalog.fingerprint,
      license: "See Terms of Use",
      license_url: CHICAGO_DATA_PORTAL_TERMS_URL,
      active_definition: "official filtered view requires AAI license status and an expiration date later than the view cutoff date",
    },
    coverage: {
      source_active_license_records: expectedCount,
      source_account_site_groups: sourceSiteGroups,
      accepted_active_license_records: acceptedLicenseRecordCount,
      normalized_licensed_sites: normalizedSiteCount,
      unique_license_accounts: organizations.size,
      quarantined_source_records: quarantinedSourceRecordCount,
      quarantined_site_groups: quarantineWriter.records,
      quarantine_rate: quarantineRate,
      source_geocoded_sites: sourceGeocodedSiteCount,
      source_coordinate_conflict_sites: sourceCoordinateConflictSiteCount,
      in_chicago_ward_sites: inChicagoWardSiteCount,
      outside_or_unreported_ward_sites: outsideOrUnreportedWardSiteCount,
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
      policy_id: "chicago-active-business-licenses",
      record_level_distribution: "local-review-only",
      aggregate_distribution: "public-with-provenance-and-semantic-limitations",
      privacy_reason: "legal names can identify natural persons and licensed addresses can be residences",
    },
    limitations: [
      "AAI plus future expiration is source-defined municipal license status, not independent proof of continuous operations, public access, solvency, or compliance with every requirement.",
      "Businesses and activities exempt from a City license are absent; this is not a complete Chicago, Illinois, or national business denominator.",
      "Multiple license rows are grouped to one source account/site so license count is never reported as physical-site or business count.",
      "Addresses and coordinates are source-reported or portal-geocoded and are not independently verified; publisher-redacted addresses are quarantined and never reconstructed.",
      "Ownership, officer, agent, contact, payment, and application-workflow fields are excluded from acquisition.",
      "Record-level output remains local-review-only because legal names and licensed locations may identify natural persons or residences.",
      "No parent-company or cross-source identity relationship is inferred.",
    ],
    artifacts,
  };
  await writeFile(path.join(stagingDirectory, "manifest.json"), json(manifest));
  await verifyChicagoActiveBusinessLicenses(path.join(stagingDirectory, "manifest.json"));
  return publishChicagoActiveBusinessLicensesStaging({ outputRoot, stagingRunId: runId, expectedReleaseId: releaseId });
}

export async function publishChicagoActiveBusinessLicensesStaging({ outputRoot, stagingRunId, expectedReleaseId = null } = {}) {
  if (!outputRoot || !stagingRunId) throw new Error("outputRoot and stagingRunId are required.");
  const stagingDirectory = path.join(outputRoot, ".staging", stagingRunId);
  const manifestPath = path.join(stagingDirectory, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (expectedReleaseId && manifest.release_id !== expectedReleaseId) throw new Error("Chicago staging release ID mismatch.");
  await verifyChicagoActiveBusinessLicenses(manifestPath);
  const releasesDirectory = path.join(outputRoot, "releases");
  const releaseDirectory = path.join(releasesDirectory, manifest.release_id);
  await mkdir(releasesDirectory, { recursive: true });
  try {
    await stat(releaseDirectory);
    throw new Error(`Chicago release ${manifest.release_id} already exists.`);
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

export async function verifyChicagoActiveBusinessLicenses(manifestPath) {
  const absoluteManifestPath = path.resolve(manifestPath);
  const releaseDirectory = path.dirname(absoluteManifestPath);
  const manifest = JSON.parse(await readFile(absoluteManifestPath, "utf8"));
  const failures = [];
  if (manifest.dataset_id !== "chicago-active-business-license-sites" || manifest.schema_version !== CHICAGO_ACTIVE_BUSINESS_LICENSE_SCHEMA_VERSION || manifest.status !== "complete" || manifest.complete_source_snapshot !== true) {
    failures.push({ path: "manifest.json", reason: "invalid dataset identity, schema, status, or completeness" });
  }
  if (manifest.source?.dataset_id !== CHICAGO_ACTIVE_BUSINESS_LICENSE_DATASET_ID || manifest.source?.underlying_dataset_id !== CHICAGO_ACTIVE_BUSINESS_LICENSE_UNDERLYING_DATASET_ID || manifest.source?.schema_fingerprint !== CHICAGO_ACTIVE_BUSINESS_LICENSE_SCHEMA_FINGERPRINT || manifest.source?.license !== "See Terms of Use" || !/^\d{4}-\d{2}-\d{2}$/.test(manifest.source?.active_filter_reference_date ?? "")) {
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
  const sourceArtifact = artifacts.find((artifact) => artifact.artifact_type === "chicago-active-business-license-source-jsonl-gzip");
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
      if (Object.keys(record).some((field) => !CHICAGO_ACTIVE_BUSINESS_LICENSE_SOURCE_FIELDS.includes(field))) throw new Error("unapproved selected source field");
    }
    if (sourceCount !== sourceArtifact.record_count || sourceCount !== manifest.coverage.source_active_license_records) throw new Error("source record count mismatch");
  } catch (error) {
    failures.push({ path: sourceArtifact?.path ?? "source/selected-records.jsonl.gz", reason: error.message });
  }
  const normalizedArtifacts = artifacts.filter((artifact) => artifact.artifact_type === "normalized-chicago-active-business-license-site-jsonl-gzip");
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
        if (!/^chicago-active-business:account:\d+:site:\d+$/.test(record.normalized_record_id)
          || !/^organization:chicago_bacp_account_\d+$/.test(record.entity_candidates?.organization_id ?? "")
          || !/^site:chicago_bacp_account_\d+_site_\d+$/.test(record.entity_candidates?.physical_site_id ?? "")
          || !/^establishment:chicago_bacp_account_\d+_site_\d+$/.test(record.entity_candidates?.establishment_id ?? "")) throw new Error("invalid normalized identity");
        organizationIds.add(record.entity_candidates.organization_id);
        if (!/^\d{5}$/.test(record.address?.zip_code ?? "") || !record.address?.street || !record.address?.city || record.address?.country !== "US") throw new Error("invalid normalized address");
        if (record.source_status?.value !== "listed-in-city-of-chicago-current-active-business-license-view-as-of-source-refresh" || record.export_policy !== "local-review-only") throw new Error("invalid source status or export policy");
        if (record.provenance?.policy_id !== "chicago-active-business-licenses" || record.provenance?.source_release_id !== manifest.source_release_id) throw new Error("invalid provenance");
        if (record.privacy?.publisher_redaction_honored !== true || record.privacy?.ownership_contact_and_payment_fields_excluded !== true || containsExcludedField(record)) throw new Error("privacy-minimized field contract failed");
        if (!Array.isArray(record.active_licenses) || !record.active_licenses.length) throw new Error("normalized site has no active licenses");
        for (const licenseRecord of record.active_licenses) {
          acceptedLicenseRecordCount += 1;
          if (licenseRecord.license_status !== "AAI" || licenseRecord.expiration_date <= manifest.source.active_filter_reference_date) throw new Error("license row violates current-active filter");
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
  if (normalizedSiteCount !== manifest.coverage?.normalized_licensed_sites || normalizedSiteCount !== manifest.coverage?.physical_sites || normalizedSiteCount !== manifest.coverage?.establishments || organizationIds.size !== manifest.coverage?.organizations || organizationIds.size !== manifest.coverage?.unique_license_accounts) {
    failures.push({ path: "manifest.json", reason: "normalized entity counts do not reconcile" });
  }
  if (acceptedLicenseRecordCount !== manifest.coverage?.accepted_active_license_records) failures.push({ path: "manifest.json", reason: "accepted license-record count does not reconcile" });
  if (coordinateCount !== manifest.coverage?.source_geocoded_sites || coordinateConflictCount !== manifest.coverage?.source_coordinate_conflict_sites) failures.push({ path: "manifest.json", reason: "source coordinate counts do not reconcile" });
  const quarantineArtifact = artifacts.find((artifact) => artifact.artifact_type === "chicago-active-business-license-quarantine-jsonl-gzip");
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
    if (quarantineGroupCount !== quarantineArtifact.record_count || quarantineGroupCount !== manifest.coverage.quarantined_site_groups || quarantinedSourceRecordCount !== manifest.coverage.quarantined_source_records) throw new Error("quarantine counts do not reconcile");
  } catch (error) {
    failures.push({ path: quarantineArtifact?.path ?? "quality/quarantine.jsonl.gz", reason: error.message });
  }
  if (sourceCount !== acceptedLicenseRecordCount + quarantinedSourceRecordCount || accountedSourceRowIds.size !== sourceRowIds.size) failures.push({ path: "manifest.json", reason: "source, accepted, and quarantine rows do not reconcile" });
  if (manifest.coverage?.source_account_site_groups !== normalizedSiteCount + quarantineGroupCount) failures.push({ path: "manifest.json", reason: "source account/site groups do not reconcile" });
  const zipArtifact = artifacts.find((artifact) => artifact.artifact_type === "chicago-active-business-license-zip-coverage-jsonl");
  try {
    if (!zipArtifact || zipArtifact.distribution_policy !== "public-aggregate-with-source-limitations") throw new Error("missing or misclassified ZIP artifact");
    const rows = (await readFile(path.join(releaseDirectory, zipArtifact.path), "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse);
    if (rows.length !== zipArtifact.record_count || rows.length !== manifest.coverage.zip_union_records) throw new Error("ZIP row count mismatch");
    if (new Set(rows.map((row) => row.zip_code)).size !== rows.length) throw new Error("duplicate ZIP coverage row");
    const contributionCount = rows.reduce((sum, row) => sum + (row.chicago_active_business_license_snapshot?.licensed_site_count ?? 0), 0);
    if (contributionCount !== normalizedSiteCount) throw new Error("ZIP contribution counts do not reconcile");
    for (const [zipCode, count] of zipCounts) {
      const row = rows.find((candidate) => candidate.zip_code === zipCode);
      if (row?.chicago_active_business_license_snapshot?.licensed_site_count !== count) throw new Error(`ZIP ${zipCode} contribution mismatch`);
    }
  } catch (error) {
    failures.push({ path: zipArtifact?.path ?? "derived/zip-coverage.jsonl", reason: error.message });
  }
  if (failures.length) {
    const error = new Error(`Chicago active-business-license verification failed for ${failures.length} check(s).`);
    error.failures = failures;
    throw error;
  }
  return { dataset_id: manifest.dataset_id, release_id: manifest.release_id, source_release_id: manifest.source_release_id, artifact_count: artifacts.length, coverage: manifest.coverage };
}
