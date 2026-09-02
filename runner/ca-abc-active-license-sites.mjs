import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { finished } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";
import { parse } from "csv-parse";
import unzipper from "unzipper";
import { assertNormalizedUsPostalFieldsDeep } from "./normalized-us-postal-code.mjs";

export const CA_ABC_SCHEMA_VERSION = "1.0.0";
export const CA_ABC_TRANSFORMATION_VERSION = "ca-abc-active-license-sites@1.0.1";
export const CA_ABC_ARCHIVE_URL = "https://www.abc.ca.gov/wp-content/uploads/DailyExport-CSV.zip";
export const CA_ABC_PAGE_URL = "https://www.abc.ca.gov/licensing/licensing-reports/";
export const CA_ABC_LAYOUT_URL = "https://www.abc.ca.gov/licensing/licensing-reports/weekly-data-export-fixed-width-layout-definition/";
export const CA_ABC_GLOSSARY_URL = "https://www.abc.ca.gov/licensing/license-lookup/glossary/";
export const CA_CONDITIONS_URL = "https://www.ca.gov/legal/conditions-of-use/";
export const CA_ABC_ARCHIVE_MEMBER = "ABC-DailyDataExport.csv";
export const CA_ABC_MAX_ARCHIVE_BYTES = 50_000_000;
export const CA_ABC_MAX_UNCOMPRESSED_BYTES = 250_000_000;

export const CA_ABC_RAW_HEADERS = Object.freeze([
  "License Type", "File Number", "Lic or App", "Type Status", "Type Orig Iss Date", "Expir Date", "Fee Codes",
  "Dup Counts", "Master Ind", "Term in # of Months", "Geo Code", "District", "Primary Name", "Prem Addr 1",
  " Prem Addr 2", "Prem City", " Prem State", "Prem Zip", "DBA Name", "Mail Addr 1", "Mail Addr 2",
  "Mail City", "Mail State", "Mail Zip", "Prem County", "Prem Census Tract #",
]);
export const CA_ABC_RAW_SCHEMA_FINGERPRINT = "aa3498730d8751668ee4f28f388ced3e72752c378ef7b658e978795276ddeb4c";
export const CA_ABC_SELECTED_FIELDS = Object.freeze([
  "source_row_ordinal", "license_type", "file_number", "license_or_application", "type_status", "type_original_issue_date",
  "expiration_date", "fee_codes", "duplicate_count", "master_indicator", "term_months", "geo_code", "district",
  "primary_name", "premise_address_1", "premise_address_2", "premise_city", "premise_state", "premise_zip", "dba_name",
  "premise_county", "premise_census_tract",
]);

const MONTHS = new Map([
  ["JAN", "01"], ["FEB", "02"], ["MAR", "03"], ["APR", "04"], ["MAY", "05"], ["JUN", "06"],
  ["JUL", "07"], ["AUG", "08"], ["SEP", "09"], ["OCT", "10"], ["NOV", "11"], ["DEC", "12"],
]);
const US_STATE_AND_TERRITORY_CODES = new Set([
  "AL", "AK", "AS", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "GU", "HI", "ID", "IL", "IN", "IA", "KS", "KY",
  "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "MP", "OH", "OK",
  "OR", "PA", "PR", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "VI", "WA", "WV", "WI", "WY",
]);
const QUARANTINE_REASONS = new Set([
  "missing-or-invalid-file-number", "missing-publishable-business-name", "conflicting-license-file-group", "invalid-license-date",
  "missing-business-premise-address", "po-box-not-physical-premise", "invalid-source-state", "invalid-or-unmapped-us-zip",
  "source-state-conflicts-with-postal-label",
]);
const EXCLUDED_SOURCE_FIELDS = new Set(["mail_addr_1", "mail_addr_2", "mail_city", "mail_state", "mail_zip", "phone", "email", "owner", "officer", "agent"]);

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

function sourceActivityId(record) {
  const selected = Object.fromEntries(CA_ABC_SELECTED_FIELDS.filter((field) => field !== "source_row_ordinal").map((field) => [field, record[field]]));
  return `ca-abc-activity:${sha256(JSON.stringify(selected))}`;
}

export function rawHeaderFingerprint(headers) {
  return sha256(JSON.stringify(headers));
}

function assertSelectedFields(record) {
  const keys = Object.keys(record).sort();
  const expected = [...CA_ABC_SELECTED_FIELDS].sort();
  if (JSON.stringify(keys) !== JSON.stringify(expected)) throw new Error("California ABC selected source fields drifted.");
}

function exactInteger(value, label, { allowBlank = false, minimum = 0 } = {}) {
  const raw = textValue(value);
  if (!raw && allowBlank) return null;
  if (!/^\d+$/.test(raw ?? "")) throw new Error(`invalid-${label}`);
  const result = Number(raw);
  if (!Number.isSafeInteger(result) || result < minimum) throw new Error(`invalid-${label}`);
  return result;
}

function sourceDate(value) {
  const raw = textValue(value);
  const match = raw?.toUpperCase().match(/^(\d{2})-([A-Z]{3})-(\d{4})$/);
  const month = match ? MONTHS.get(match[2]) : null;
  if (!match || !month) throw new Error("invalid-license-date");
  const iso = `${match[3]}-${month}-${match[1]}`;
  if (new Date(`${iso}T00:00:00.000Z`).toISOString().slice(0, 10) !== iso) throw new Error("invalid-license-date");
  return iso;
}

function postalAddress(records, baselineByZip) {
  const street1 = uniqueText(records, "premise_address_1");
  const street2 = uniqueText(records, "premise_address_2");
  const cities = uniqueText(records, "premise_city");
  const states = uniqueText(records, "premise_state").map((value) => value.toUpperCase());
  const postalCodes = uniqueText(records, "premise_zip");
  const counties = uniqueText(records, "premise_county");
  const tracts = uniqueText(records, "premise_census_tract");
  if ([street1, street2, cities, states, postalCodes, counties, tracts].some((values) => values.length > 1)) throw new Error("conflicting-license-file-group");
  if (!street1[0] || !cities[0]) throw new Error("missing-business-premise-address");
  if (/\bP\.?\s*O\.?\s+BOX\b|\bPOST\s+OFFICE\s+BOX\b/i.test(street1[0])) throw new Error("po-box-not-physical-premise");
  const state = states[0];
  if (!US_STATE_AND_TERRITORY_CODES.has(state)) throw new Error("invalid-source-state");
  const match = postalCodes[0]?.match(/^(\d{5})(?:-?(\d{4}))?$/);
  if (!match || match[1] === "00000") throw new Error("invalid-or-unmapped-us-zip");
  const baseline = baselineByZip?.get(match[1]);
  if (baselineByZip && !baseline) throw new Error("invalid-or-unmapped-us-zip");
  const postalState = textValue(baseline?.postal_label?.preferred_state)?.toUpperCase() ?? null;
  if (postalState && postalState !== state) throw new Error("source-state-conflicts-with-postal-label");
  return {
    address_line_1: street1[0],
    address_line_2: street2[0] ?? null,
    city: cities[0],
    state,
    zip_code: match[1],
    zip4: match[2] ?? null,
    postal_code: match[1],
    country: "US",
    source_premise_county: counties[0] ?? null,
    source_premise_census_tract: tracts[0] ?? null,
    validation_status: match[2] ? "normalized-us-premise-zip-plus-4" : "normalized-us-premise-zip5",
  };
}

function provenance(context, fileNumber, records) {
  return {
    source_id: "california-abc-daily-active-licenses",
    source_release_id: context.sourceReleaseId,
    source_record_ids: records.map(sourceActivityId).sort(compareText),
    ingest_run_id: context.runId,
    transformation_version: CA_ABC_TRANSFORMATION_VERSION,
    policy_id: "ca-abc-active-license-sites",
    observed_at: context.sourceModifiedAt,
    retrieved_at: context.retrievedAt,
  };
}

export function normalizeCaAbcActiveLicenseSite(sourceRecords, context) {
  if (!Array.isArray(sourceRecords) || sourceRecords.length === 0) throw new Error("missing-or-invalid-file-number");
  for (const record of sourceRecords) assertSelectedFields(record);
  const fileNumbers = uniqueText(sourceRecords, "file_number");
  if (fileNumbers.length !== 1 || !/^\d{8}$/.test(fileNumbers[0])) throw new Error("missing-or-invalid-file-number");
  if (sourceRecords.some((record) => record.type_status !== "ACTIVE" || record.license_or_application !== "LIC")) throw new Error("conflicting-license-file-group");
  const fileNumber = fileNumbers[0];
  const primaryNames = uniqueText(sourceRecords, "primary_name");
  if (primaryNames.length !== 1) throw new Error(primaryNames.length ? "conflicting-license-file-group" : "missing-publishable-business-name");
  const address = postalAddress(sourceRecords, context.baselineByZip);
  const dbaNames = uniqueText(sourceRecords, "dba_name");
  const licenseActivities = sourceRecords.map((record) => {
    if (!/^\d{2}$/.test(record.license_type ?? "")) throw new Error("conflicting-license-file-group");
    if (!new Set(["Y", "N"]).has(record.master_indicator)) throw new Error("conflicting-license-file-group");
    return {
      source_activity_id: sourceActivityId(record),
      abc_license_number: `${record.license_type}-${fileNumber}`,
      license_type: record.license_type,
      status: "ACTIVE",
      source_record_class: "LIC",
      original_issue_date: sourceDate(record.type_original_issue_date),
      expiration_date: sourceDate(record.expiration_date),
      fee_codes: textValue(record.fee_codes),
      duplicate_count: exactInteger(record.duplicate_count, "duplicate-count", { allowBlank: true }),
      master_indicator: record.master_indicator === "Y",
      term_months: exactInteger(record.term_months, "term-months", { minimum: 1 }),
      geo_code: textValue(record.geo_code),
      district_code: textValue(record.district),
    };
  }).sort((left, right) => compareText(left.source_activity_id, right.source_activity_id));
  const activityIds = licenseActivities.map((activity) => activity.source_activity_id);
  if (new Set(activityIds).size !== activityIds.length) throw new Error("conflicting-license-file-group");
  const expirationBeforeObservationCount = licenseActivities.filter((activity) => `${activity.expiration_date}T23:59:59.999Z` < context.sourceModifiedAt).length;
  return {
    schema_version: CA_ABC_SCHEMA_VERSION,
    source_record_id: fileNumber,
    source_row_count: sourceRecords.length,
    external_identifiers: [{ type: "ca_abc_file_number", value: fileNumber }],
    names: { primary_name: primaryNames[0], dba_names: dbaNames },
    premise_address: address,
    license_activities: licenseActivities,
    source_status: {
      source_value: "ACTIVE",
      status_class: "active-issued-license-in-ca-abc-daily-export",
      observed_at: context.sourceModifiedAt,
      expiration_before_observation_count: expirationBeforeObservationCount,
      general_operating_status_inferred: false,
    },
    entity_candidates: {
      organization_id: `organization:ca_abc_file_${fileNumber}`,
      physical_site_id: `physical_site:ca_abc_file_${fileNumber}`,
      establishment_id: `establishment:ca_abc_file_${fileNumber}`,
    },
    provenance: provenance(context, fileNumber, sourceRecords),
    export_policy: "local-review-only",
  };
}

function validateArchiveUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "www.abc.ca.gov" || url.pathname !== "/wp-content/uploads/DailyExport-CSV.zip" || url.search || url.hash) throw new Error("Unexpected California ABC archive URL.");
  return url;
}

function retryDelay(response, attempt) {
  const value = Number(response?.headers?.get?.("retry-after"));
  return Number.isFinite(value) && value >= 0 ? Math.min(value * 1000, 30_000) : Math.min(8_000, 500 * (2 ** attempt));
}

export async function requestCaAbcArchive(method = "GET", {
  fetchImpl = fetch, signal, sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)), attempts = 4,
} = {}) {
  const url = validateArchiveUrl(CA_ABC_ARCHIVE_URL);
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    signal?.throwIfAborted?.();
    try {
      const response = await fetchImpl(url, { method, redirect: "manual", signal, headers: { "User-Agent": "CoTiveCollector/0.1 (+governed-public-data-ingest)" } });
      if (response.status >= 300 && response.status < 400) throw new Error("California ABC archive redirects are not permitted.");
      if ([408, 425, 429, 500, 502, 503, 504].includes(response.status)) {
        if (attempt === attempts - 1) throw new Error(`California ABC archive returned HTTP ${response.status}.`);
        await sleep(retryDelay(response, attempt));
        continue;
      }
      if (!response.ok) throw new Error(`California ABC archive returned HTTP ${response.status}.`);
      return response;
    } catch (error) {
      lastError = error;
      if (/redirects are not permitted|Unexpected California ABC/.test(error.message) || error.name === "AbortError" || attempt === attempts - 1) break;
      await sleep(Math.min(8_000, 500 * (2 ** attempt)));
    }
  }
  throw lastError;
}

function responseMetadata(response) {
  const bytes = Number(response.headers.get("content-length"));
  const modified = response.headers.get("last-modified");
  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > CA_ABC_MAX_ARCHIVE_BYTES) throw new Error("California ABC archive length is invalid or exceeds the configured limit.");
  if (contentType !== "application/zip") throw new Error("California ABC archive content type drifted.");
  const modifiedAt = new Date(modified ?? "").toISOString();
  return { url: CA_ABC_ARCHIVE_URL, bytes, modifiedAt, etag: response.headers.get("etag") ?? null, contentType };
}

export async function preflightCaAbcArchive(options = {}) {
  return responseMetadata(await requestCaAbcArchive("HEAD", options));
}

async function removeIfPresent(filename) {
  try { await unlink(filename); } catch (error) { if (error.code !== "ENOENT") throw error; }
}

export async function downloadCaAbcArchive(destination, metadata, options = {}) {
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.partial`;
  await removeIfPresent(temporary);
  const response = await requestCaAbcArchive("GET", options);
  const current = responseMetadata(response);
  if (current.bytes !== metadata.bytes || current.modifiedAt !== metadata.modifiedAt || (metadata.etag && current.etag !== metadata.etag)) throw new Error("California ABC archive changed after preflight.");
  const output = createWriteStream(temporary, { flags: "wx" });
  let bytes = 0;
  try {
    for await (const chunk of response.body) {
      options.signal?.throwIfAborted?.();
      bytes += chunk.length;
      if (bytes > metadata.bytes || bytes > CA_ABC_MAX_ARCHIVE_BYTES) throw new Error("California ABC archive exceeded its preflight byte limit.");
      if (!output.write(chunk)) await once(output, "drain");
    }
    output.end();
    await finished(output);
    if (bytes !== metadata.bytes) throw new Error(`California ABC archive transfer stopped at ${bytes} of ${metadata.bytes} bytes.`);
    await rename(temporary, destination);
    return hashFile(destination);
  } catch (error) {
    output.destroy();
    await removeIfPresent(temporary);
    await removeIfPresent(destination);
    throw error;
  }
}

async function openCaAbcArchive(archivePath) {
  const directory = await unzipper.Open.file(archivePath);
  const files = directory.files.filter((entry) => entry.type === "File");
  if (files.length !== 1 || files[0].path !== CA_ABC_ARCHIVE_MEMBER || files[0].path.includes("..") || path.isAbsolute(files[0].path)) throw new Error("California ABC archive members drifted.");
  const uncompressedBytes = Number(files[0].uncompressedSize ?? files[0].vars?.uncompressedSize ?? 0);
  if (!Number.isSafeInteger(uncompressedBytes) || uncompressedBytes <= 0 || uncompressedBytes > CA_ABC_MAX_UNCOMPRESSED_BYTES) throw new Error("California ABC archive uncompressed size is invalid or exceeds the configured limit.");
  return { entry: files[0], uncompressedBytes };
}

function selectedRecord(raw, sourceRowOrdinal) {
  const value = (header) => textValue(raw[header]);
  return {
    source_row_ordinal: sourceRowOrdinal,
    license_type: value("License Type"), file_number: value("File Number"), license_or_application: value("Lic or App"),
    type_status: value("Type Status"), type_original_issue_date: value("Type Orig Iss Date"), expiration_date: value("Expir Date"),
    fee_codes: value("Fee Codes"), duplicate_count: value("Dup Counts"), master_indicator: value("Master Ind"),
    term_months: value("Term in # of Months"), geo_code: value("Geo Code"), district: value("District"),
    primary_name: value("Primary Name"), premise_address_1: value("Prem Addr 1"), premise_address_2: value(" Prem Addr 2"),
    premise_city: value("Prem City"), premise_state: value(" Prem State"), premise_zip: value("Prem Zip"), dba_name: value("DBA Name"),
    premise_county: value("Prem County"), premise_census_tract: value("Prem Census Tract #"),
  };
}

async function* archiveRows(archivePath, metadataCapture) {
  const { entry, uncompressedBytes } = await openCaAbcArchive(archivePath);
  metadataCapture.uncompressedBytes = uncompressedBytes;
  const parser = entry.stream().pipe(parse({ bom: true, relax_column_count: true, skip_empty_lines: true }));
  let rowNumber = 0;
  let headers;
  for await (const row of parser) {
    rowNumber += 1;
    if (rowNumber === 1) {
      if (row.length !== 1 || !/^Updated [A-Za-z]+ \d{1,2}(?:st|nd|rd|th) of [A-Za-z]+ \d{4} \d{2}:\d{2}:\d{2} [AP]M$/.test(row[0])) throw new Error("California ABC source update label drifted.");
      metadataCapture.sourceUpdatedLabel = row[0];
      continue;
    }
    if (rowNumber === 2) {
      headers = row;
      if (rawHeaderFingerprint(headers) !== CA_ABC_RAW_SCHEMA_FINGERPRINT || JSON.stringify(headers) !== JSON.stringify(CA_ABC_RAW_HEADERS)) throw new Error("California ABC CSV headers drifted.");
      continue;
    }
    if (row.length !== headers.length) throw new Error(`California ABC CSV record length drifted at row ${rowNumber}.`);
    yield Object.fromEntries(headers.map((header, index) => [header, row[index]]));
  }
  if (rowNumber < 3) throw new Error("California ABC CSV contained no data records.");
}

async function openGzipWriter(stagingDirectory, relativePath) {
  const destination = path.join(stagingDirectory, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp-${randomUUID()}`;
  const output = createWriteStream(temporary, { flags: "wx" });
  const gzip = createGzip({ level: 9 });
  gzip.pipe(output);
  return { relativePath: relativePath.replaceAll("\\", "/"), destination, temporary, output, gzip, records: 0 };
}

async function writeGzipRecord(writer, record) {
  if (!writer.gzip.write(json(record))) await once(writer.gzip, "drain");
  writer.records += 1;
}

async function closeGzipWriter(writer, artifactType, metadata = {}) {
  writer.gzip.end();
  await Promise.all([finished(writer.gzip), finished(writer.output)]);
  await rename(writer.temporary, writer.destination);
  return { path: writer.relativePath, ...(await hashFile(writer.destination)), record_count: writer.records, artifact_type: artifactType, ...metadata };
}

function abortGzipWriters(writers) {
  for (const writer of writers) { writer.gzip.destroy(); writer.output.destroy(); }
}

async function renameWithRetry(sourcePath, destinationPath, attempts = 12) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try { await rename(sourcePath, destinationPath); return; } catch (error) {
      if (!new Set(["EPERM", "EACCES", "EBUSY"]).has(error.code) || attempt === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, Math.min(1_000, 25 * (2 ** attempt))));
    }
  }
}

async function writeArtifact(directory, relativePath, content, metadata = {}) {
  const destination = path.join(directory, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, content, { flag: "wx" });
  return { path: relativePath.replaceAll("\\", "/"), ...(await hashFile(destination)), ...metadata };
}

function assertContained(parent, child, label) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`${label} must be a strict child of ${parent}.`);
}

async function loadZbpBaseline(pointerPath) {
  const absolutePointer = path.resolve(pointerPath);
  const pointer = JSON.parse(await readFile(absolutePointer, "utf8"));
  const root = path.dirname(absolutePointer);
  const manifestPath = path.resolve(root, pointer.manifest);
  assertContained(root, manifestPath, "ZBP manifest");
  const manifestBuffer = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBuffer.toString("utf8"));
  const artifact = manifest.artifacts?.find((item) => new Set(["zip-coverage-jsonl", "zip-coverage-union-jsonl"]).has(item.artifact_type));
  if (!artifact) throw new Error("ZBP release does not publish ZIP coverage.");
  const filename = path.resolve(path.dirname(manifestPath), artifact.path);
  assertContained(path.dirname(manifestPath), filename, "ZBP ZIP artifact");
  const rows = [];
  for await (const line of createInterface({ input: createReadStream(filename), crlfDelay: Infinity })) if (line) rows.push(JSON.parse(line));
  return { rows, byZip: new Map(rows.map((row) => [row.zip_code, row])), dependency: { dataset_id: manifest.dataset_id, release_id: manifest.release_id, manifest_sha256: sha256(manifestBuffer) } };
}

async function* gzipRecords(filename) {
  const lines = createInterface({ input: createReadStream(filename).pipe(createGunzip()), crlfDelay: Infinity });
  for await (const line of lines) if (line) yield JSON.parse(line);
}

function increment(map, key, amount = 1) {
  const normalized = key ?? "(blank)";
  map.set(normalized, (map.get(normalized) ?? 0) + amount);
}

function sortedCounts(map) {
  return Object.fromEntries([...map].sort(([left], [right]) => compareText(left, right)));
}

function buildZipCoverage(baselineRows, countsByZip, context) {
  const baselineByZip = new Map(baselineRows.map((row) => [row.zip_code, row]));
  const zips = new Set([...baselineByZip.keys(), ...countsByZip.keys()]);
  return [...zips].sort().map((zipCode) => {
    const baseline = baselineByZip.get(zipCode);
    const count = countsByZip.get(zipCode) ?? 0;
    return {
      zip_code: zipCode,
      current_usps_validity: baseline?.current_usps_validity ?? { status: "unverified" },
      geography: baseline?.geography ?? { status: "no-2020-zcta-polygon", geo_id: null, geoid: null, geometry_file: null },
      census_zbp_coverage_status: baseline?.coverage_status ?? "outside-census-zbp-and-zcta-union",
      ca_abc_active_issued_license_snapshot: {
        status: count ? "published-source-active-issued-license-premise-evidence" : "no-eligible-premise-in-current-source-snapshot",
        physical_site_count: count,
        source_release_id: context.sourceReleaseId,
        source_modified_at: context.sourceModifiedAt,
        general_operating_status_inferred: false,
      },
    };
  });
}

function validateFixtureMetadata(metadata) {
  const bytes = Number(metadata?.bytes);
  const modifiedAt = new Date(metadata?.modifiedAt ?? "").toISOString();
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || !/^[0-9a-f]{64}$/i.test(metadata?.archiveSha256 ?? "")) throw new Error("Valid California ABC fixture archive metadata is required.");
  return { url: CA_ABC_ARCHIVE_URL, bytes, modifiedAt, etag: metadata.etag ?? null, contentType: "application/zip", archiveSha256: metadata.archiveSha256.toLowerCase(), sourceUpdatedLabel: metadata.sourceUpdatedLabel ?? null, uncompressedBytes: metadata.uncompressedBytes ?? null };
}

async function acquireSelectedSource({ input, writer, signal, logger }) {
  const statusCounts = new Map();
  const recordClassCounts = new Map();
  const selectedIds = new Set();
  let rawRecords = 0;
  let selectedRows = 0;
  for await (const raw of input) {
    signal?.throwIfAborted?.();
    rawRecords += 1;
    const record = Object.prototype.hasOwnProperty.call(raw, "source_row_ordinal") ? { ...raw } : selectedRecord(raw, rawRecords);
    assertSelectedFields(record);
    const status = textValue(record.type_status)?.toUpperCase();
    const recordClass = textValue(record.license_or_application)?.toUpperCase();
    increment(statusCounts, status);
    increment(recordClassCounts, recordClass);
    if (status !== "ACTIVE" || recordClass !== "LIC") continue;
    record.type_status = status;
    record.license_or_application = recordClass;
    const rowId = sourceActivityId(record);
    if (selectedIds.has(rowId)) throw new Error(`Duplicate California ABC selected source row ${rowId}.`);
    selectedIds.add(rowId);
    await writeGzipRecord(writer, record);
    selectedRows += 1;
    if (selectedRows % 25_000 === 0) logger(`Selected ${selectedRows.toLocaleString("en-US")} California ABC active issued-license rows.`);
  }
  return { rawRecords, selectedRows, statusCounts, recordClassCounts };
}

function sourceReleaseId(metadata, selectedSourceSha256) {
  return `ca-abc-active-licenses-${metadata.modifiedAt.slice(0, 10)}-${sha256(`${metadata.modifiedAt}\u0000${metadata.bytes}\u0000${metadata.archiveSha256}\u0000${selectedSourceSha256}`).slice(0, 16)}`;
}

function quarantineRecord(sourceRecordId, reason, context) {
  return { schema_version: CA_ABC_SCHEMA_VERSION, source_record_id: sourceRecordId, reason, source_release_id: context.sourceReleaseId, ingest_run_id: context.runId, export_policy: "internal" };
}

export async function buildCaAbcActiveLicenseSites({
  outputRoot, zbpPointer, sourceRows = null, sourceArchivePath = null, sourceMetadata = null,
  minimumSites = 50_000, maximumQuarantineRatio = 0.02, signal,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)), logger = console.log, now = () => new Date(),
} = {}) {
  if (!outputRoot || !zbpPointer) throw new Error("outputRoot and zbpPointer are required.");
  if (sourceRows && sourceArchivePath) throw new Error("sourceRows and sourceArchivePath are mutually exclusive.");
  if (!Number.isInteger(minimumSites) || minimumSites < 1 || maximumQuarantineRatio < 0 || maximumQuarantineRatio > 1) throw new Error("Invalid California ABC quality thresholds.");
  signal?.throwIfAborted?.();
  const retrievedAt = now().toISOString();
  const runId = randomUUID();
  const releaseId = `ca-abc-active-licenses-${releaseTimestamp(retrievedAt)}-${runId.slice(0, 8)}`;
  const stagingDirectory = path.join(outputRoot, ".staging", runId);
  await mkdir(stagingDirectory, { recursive: true });
  const baseline = await loadZbpBaseline(zbpPointer);
  let metadata = sourceMetadata ? validateFixtureMetadata(sourceMetadata) : null;
  let archivePath = sourceArchivePath;
  let downloadedArchive = null;
  const archiveCapture = {};
  const sourceWriter = await openGzipWriter(stagingDirectory, "source/selected-active-issued-license-records.jsonl.gz");
  let sourceArtifact;
  let acquired;
  try {
    if (!sourceRows && !archivePath) {
      metadata = await preflightCaAbcArchive({ signal, sleep });
      downloadedArchive = path.join(stagingDirectory, "source", "unminimized-daily-export.zip");
      const downloaded = await downloadCaAbcArchive(downloadedArchive, metadata, { signal, sleep });
      metadata.archiveSha256 = downloaded.sha256;
      archivePath = downloadedArchive;
    } else if (archivePath) {
      const archive = await hashFile(archivePath);
      const archiveStat = await stat(archivePath);
      metadata = validateFixtureMetadata({ bytes: archive.bytes, modifiedAt: sourceMetadata?.modifiedAt ?? archiveStat.mtime.toISOString(), archiveSha256: archive.sha256, etag: sourceMetadata?.etag });
    }
    const input = sourceRows ?? archiveRows(archivePath, archiveCapture);
    acquired = await acquireSelectedSource({ input, writer: sourceWriter, signal, logger });
    sourceArtifact = await closeGzipWriter(sourceWriter, "ca-abc-selected-active-issued-license-source-jsonl-gzip", { export_policy: "internal" });
  } catch (error) {
    abortGzipWriters([sourceWriter]);
    throw error;
  } finally {
    if (downloadedArchive) await removeIfPresent(downloadedArchive);
  }
  metadata.sourceUpdatedLabel = archiveCapture.sourceUpdatedLabel ?? metadata.sourceUpdatedLabel ?? null;
  metadata.uncompressedBytes = archiveCapture.uncompressedBytes ?? metadata.uncompressedBytes ?? null;
  if (acquired.selectedRows < minimumSites) throw new Error(`California ABC selected row count ${acquired.selectedRows} is below minimum ${minimumSites}.`);
  const selectedSourceReleaseId = sourceReleaseId(metadata, sourceArtifact.sha256);
  const context = { runId, retrievedAt, sourceModifiedAt: metadata.modifiedAt, sourceReleaseId: selectedSourceReleaseId, baselineByZip: baseline.byZip };
  const artifacts = [
    await writeArtifact(stagingDirectory, "source/preflight.json", json({
      url: CA_ABC_ARCHIVE_URL, source_page_url: CA_ABC_PAGE_URL, source_layout_url: CA_ABC_LAYOUT_URL,
      source_modified_at: metadata.modifiedAt, source_archive_bytes: metadata.bytes, source_archive_sha256: metadata.archiveSha256,
      source_etag: metadata.etag, source_updated_label: metadata.sourceUpdatedLabel, archive_member: CA_ABC_ARCHIVE_MEMBER,
      archive_uncompressed_bytes: metadata.uncompressedBytes, raw_headers: CA_ABC_RAW_HEADERS,
      raw_schema_fingerprint: CA_ABC_RAW_SCHEMA_FINGERPRINT, selected_fields: CA_ABC_SELECTED_FIELDS, raw_archive_retained: false,
    }), { artifact_type: "ca-abc-source-preflight", export_policy: "internal" }),
    sourceArtifact,
    await writeArtifact(stagingDirectory, "source/zip-validation-reference.jsonl", jsonLines(baseline.rows.map((row) => ({
      zip_code: row.zip_code,
      preferred_state: textValue(row.postal_label?.preferred_state)?.toUpperCase() ?? null,
    }))), { artifact_type: "ca-abc-zip-validation-reference-jsonl", record_count: baseline.rows.length, export_policy: "internal" }),
  ];
  const groups = new Map();
  for await (const record of gzipRecords(path.join(stagingDirectory, sourceArtifact.path))) {
    const key = textValue(record.file_number) ?? `source-row:${record.source_row_ordinal}`;
    const values = groups.get(key) ?? [];
    values.push(record);
    groups.set(key, values);
  }
  const partitions = new Map();
  for (const prefix of "0123456789abcdef") partitions.set(prefix, await openGzipWriter(stagingDirectory, `derived/sites/id-hash-prefix=${prefix}.jsonl.gz`));
  const quarantineWriter = await openGzipWriter(stagingDirectory, "derived/quarantine.jsonl.gz");
  const countsByZip = new Map();
  const licenseTypeCounts = new Map();
  const premiseStateCounts = new Map();
  let sites = 0;
  let licenseActivities = 0;
  let quarantinedGroups = 0;
  let quarantinedRows = 0;
  let sourceActiveWithPastExpirationRows = 0;
  try {
    for (const [key, records] of [...groups].sort(([left], [right]) => compareText(left, right))) {
      signal?.throwIfAborted?.();
      try {
        const normalized = normalizeCaAbcActiveLicenseSite(records, context);
        assertNormalizedUsPostalFieldsDeep(normalized);
        await writeGzipRecord(partitions.get(sha256(normalized.source_record_id)[0]), normalized);
        sites += 1;
        licenseActivities += normalized.license_activities.length;
        sourceActiveWithPastExpirationRows += normalized.source_status.expiration_before_observation_count;
        increment(countsByZip, normalized.premise_address.zip_code);
        increment(premiseStateCounts, normalized.premise_address.state);
        for (const activity of normalized.license_activities) increment(licenseTypeCounts, activity.license_type);
      } catch (error) {
        if (!QUARANTINE_REASONS.has(error.message)) throw error;
        await writeGzipRecord(quarantineWriter, quarantineRecord(key, error.message, context));
        quarantinedGroups += 1;
        quarantinedRows += records.length;
      }
    }
  } catch (error) {
    abortGzipWriters([...partitions.values(), quarantineWriter]);
    throw error;
  }
  if (sites < minimumSites) throw new Error(`California ABC normalized site count ${sites} is below minimum ${minimumSites}.`);
  if (quarantinedRows / acquired.selectedRows > maximumQuarantineRatio) throw new Error("California ABC quarantine ratio exceeds the configured threshold.");
  for (const writer of partitions.values()) artifacts.push(await closeGzipWriter(writer, "normalized-ca-abc-active-license-site-jsonl-gzip", { export_policy: "local-review-only" }));
  artifacts.push(await closeGzipWriter(quarantineWriter, "ca-abc-active-license-quarantine-jsonl-gzip", { export_policy: "internal" }));
  const zipCoverage = buildZipCoverage(baseline.rows, countsByZip, context);
  artifacts.push(await writeArtifact(stagingDirectory, "derived/zip-coverage.jsonl", jsonLines(zipCoverage), { artifact_type: "ca-abc-active-license-zip-coverage-jsonl", record_count: zipCoverage.length, export_policy: "public-aggregate-with-attribution-and-limitations" }));
  const summary = {
    source_records: acquired.rawRecords,
    selected_active_issued_license_rows: acquired.selectedRows,
    excluded_source_rows: acquired.rawRecords - acquired.selectedRows,
    normalized_sites: sites,
    organizations: sites,
    establishments: sites,
    license_activities: licenseActivities,
    quarantined_source_rows: quarantinedRows,
    quarantined_file_groups: quarantinedGroups,
    source_active_rows_with_expiration_before_observation: sourceActiveWithPastExpirationRows,
    source_status_counts: sortedCounts(acquired.statusCounts),
    source_record_class_counts: sortedCounts(acquired.recordClassCounts),
    license_type_counts: sortedCounts(licenseTypeCounts),
    premise_state_counts: sortedCounts(premiseStateCounts),
    eligible_zip_contributions: sites,
    source_zip_count: countsByZip.size,
    zip_union_records: zipCoverage.length,
  };
  artifacts.push(await writeArtifact(stagingDirectory, "derived/source-summary.json", json(summary), { artifact_type: "ca-abc-active-license-source-summary", export_policy: "public-aggregate-with-attribution-and-limitations" }));
  const manifest = {
    schema_version: "1.0.0", dataset_id: "ca-abc-active-license-sites", release_id: releaseId, run_id: runId,
    retrieved_at: retrievedAt, source_modified_at: metadata.modifiedAt, source_release_id: selectedSourceReleaseId,
    source_archive_sha256: metadata.archiveSha256, source_archive_bytes: metadata.bytes, source_updated_label: metadata.sourceUpdatedLabel,
    status: "published", complete_selected_active_issued_license_snapshot: true, raw_archive_retained: false,
    selection: { type_status: "ACTIVE", license_or_application: "LIC" },
    publisher: { id: "ca-abc-active-license-sites", version: "1.0.1" },
    dependencies: [baseline.dependency],
    source: {
      publisher: "California Department of Alcoholic Beverage Control", archive_url: CA_ABC_ARCHIVE_URL, page_url: CA_ABC_PAGE_URL,
      layout_url: CA_ABC_LAYOUT_URL, glossary_url: CA_ABC_GLOSSARY_URL, conditions_url: CA_CONDITIONS_URL,
      license: "California state-created website information is generally public domain unless otherwise indicated",
    },
    contracts: { dataset: "config/datasets/ca-abc-active-license-sites.json", connector: "config/connectors/ca-abc-active-license-sites.json", schema: "config/schemas/ca-abc-active-license-site.schema.json", source_policy: "config/source-policies/ca-abc-active-license-sites.json" },
    export_policy: { record_level: "local-review-only", aggregate: "public-aggregate-with-attribution-and-limitations" },
    coverage: summary,
    limitations: [
      "This is a complete selected snapshot of source rows marked ACTIVE and LIC, not a complete inventory of California businesses or alcohol-related activity.",
      "ABC ACTIVE is license standing at the source refresh; it does not independently prove continuous operation, public access, current hours, solvency, or compliance.",
      "Rows marked as applications or any status other than ACTIVE are excluded before normalization.",
      "The source can retain ACTIVE rows whose reported expiration predates the refresh; both observations remain explicit and no status is silently overridden.",
      "The ABC glossary defines the premise business address as the physical address of the licensed business, but some premises or licensee names may identify homes or natural persons.",
      "Mailing addresses are excluded before staging; no owner, parent company, network affiliation, phone, email, or cross-source identity is inferred.",
      "ZIP values are source-reported and are not promoted to authoritative current USPS assignments.",
    ],
    artifacts,
  };
  await writeFile(path.join(stagingDirectory, "manifest.json"), json(manifest), { flag: "wx" });
  await verifyCaAbcActiveLicenseSites(path.join(stagingDirectory, "manifest.json"));
  const published = await publishCaAbcActiveLicenseSitesStaging({ outputRoot, stagingRunId: runId, expectedReleaseId: releaseId });
  return { ...published, coverage: summary };
}

export async function publishCaAbcActiveLicenseSitesStaging({ outputRoot, stagingRunId, expectedReleaseId = null } = {}) {
  if (!outputRoot || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stagingRunId ?? "")) throw new Error("outputRoot and a valid stagingRunId are required.");
  const stagingRoot = path.join(outputRoot, ".staging");
  const stagingDirectory = path.resolve(stagingRoot, stagingRunId);
  assertContained(stagingRoot, stagingDirectory, "California ABC staging run");
  const manifestPath = path.join(stagingDirectory, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.run_id !== stagingRunId || manifest.dataset_id !== "ca-abc-active-license-sites" || manifest.status !== "published" || !manifest.complete_selected_active_issued_license_snapshot || manifest.raw_archive_retained !== false) throw new Error("California ABC staging manifest does not match a complete privacy-minimized run.");
  if (expectedReleaseId && manifest.release_id !== expectedReleaseId) throw new Error("California ABC staging release ID does not match the build result.");
  await verifyCaAbcActiveLicenseSites(manifestPath);
  const releasesDirectory = path.join(outputRoot, "releases");
  await mkdir(releasesDirectory, { recursive: true });
  const releaseDirectory = path.join(releasesDirectory, manifest.release_id);
  try { await stat(releaseDirectory); throw new Error(`California ABC release destination already exists: ${manifest.release_id}.`); } catch (error) { if (error.code !== "ENOENT") throw error; }
  await renameWithRetry(stagingDirectory, releaseDirectory);
  const pointerPath = path.join(outputRoot, "current.json");
  const temporaryPointer = `${pointerPath}.tmp-${randomUUID()}`;
  await writeFile(temporaryPointer, json({ dataset_id: manifest.dataset_id, release_id: manifest.release_id, manifest: `releases/${manifest.release_id}/manifest.json`, updated_at: manifest.retrieved_at, status: manifest.status }), { flag: "wx" });
  await renameWithRetry(temporaryPointer, pointerPath);
  return { manifest, releaseDirectory, pointerPath };
}

function containsExcludedKey(value) {
  if (Array.isArray(value)) return value.some(containsExcludedKey);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) => EXCLUDED_SOURCE_FIELDS.has(key.toLowerCase()) || containsExcludedKey(child));
}

function replayComparable(record) {
  return record;
}

export async function verifyCaAbcActiveLicenseSites(manifestPath) {
  const absoluteManifestPath = path.resolve(manifestPath);
  const releaseDirectory = path.dirname(absoluteManifestPath);
  const manifest = JSON.parse(await readFile(absoluteManifestPath, "utf8"));
  const failures = [];
  if (manifest.dataset_id !== "ca-abc-active-license-sites" || manifest.status !== "published" || !manifest.complete_selected_active_issued_license_snapshot || manifest.raw_archive_retained !== false) failures.push({ path: "manifest.json", reason: "unexpected, incomplete, or non-minimized manifest" });
  if (manifest.selection?.type_status !== "ACTIVE" || manifest.selection?.license_or_application !== "LIC") failures.push({ path: "manifest.json", reason: "selection semantics drifted" });
  if (manifest.export_policy?.record_level !== "local-review-only" || manifest.export_policy?.aggregate !== "public-aggregate-with-attribution-and-limitations") failures.push({ path: "manifest.json", reason: "export policy drifted" });
  if (manifest.artifacts?.some((artifact) => /unminimized|DailyExport-CSV\.zip/i.test(artifact.path))) failures.push({ path: "manifest.json", reason: "raw archive was retained" });
  for (const artifact of manifest.artifacts ?? []) {
    try {
      const filename = path.resolve(releaseDirectory, artifact.path);
      assertContained(releaseDirectory, filename, `Artifact ${artifact.path}`);
      const actual = await hashFile(filename);
      if (actual.bytes !== artifact.bytes || actual.sha256 !== artifact.sha256) failures.push({ path: artifact.path, reason: "size or SHA-256 mismatch" });
    } catch (error) { failures.push({ path: artifact.path, reason: error.code === "ENOENT" ? "missing" : error.message }); }
  }
  const sourceArtifacts = manifest.artifacts?.filter((artifact) => artifact.artifact_type === "ca-abc-selected-active-issued-license-source-jsonl-gzip") ?? [];
  const siteArtifacts = manifest.artifacts?.filter((artifact) => artifact.artifact_type === "normalized-ca-abc-active-license-site-jsonl-gzip") ?? [];
  const quarantineArtifacts = manifest.artifacts?.filter((artifact) => artifact.artifact_type === "ca-abc-active-license-quarantine-jsonl-gzip") ?? [];
  const zipArtifacts = manifest.artifacts?.filter((artifact) => artifact.artifact_type === "ca-abc-active-license-zip-coverage-jsonl") ?? [];
  const zipValidationArtifacts = manifest.artifacts?.filter((artifact) => artifact.artifact_type === "ca-abc-zip-validation-reference-jsonl") ?? [];
  if (sourceArtifacts.length !== 1 || sourceArtifacts[0]?.export_policy !== "internal") failures.push({ path: "manifest.json", reason: "expected one internal selected-source artifact" });
  if (siteArtifacts.length !== 16 || siteArtifacts.some((artifact) => artifact.export_policy !== "local-review-only")) failures.push({ path: "manifest.json", reason: "expected 16 local-review-only site partitions" });
  if (quarantineArtifacts.length !== 1 || quarantineArtifacts[0]?.export_policy !== "internal") failures.push({ path: "manifest.json", reason: "expected one internal quarantine artifact" });
  if (zipArtifacts.length !== 1 || zipArtifacts[0]?.export_policy !== "public-aggregate-with-attribution-and-limitations") failures.push({ path: "manifest.json", reason: "expected one governed aggregate ZIP artifact" });
  if (zipValidationArtifacts.length !== 1 || zipValidationArtifacts[0]?.export_policy !== "internal") failures.push({ path: "manifest.json", reason: "expected one internal ZIP validation reference" });
  const expectedHashes = new Map([..."0123456789abcdef"].map((prefix) => [prefix, createHash("sha256")]));
  const actualHashes = new Map([..."0123456789abcdef"].map((prefix) => [prefix, createHash("sha256")]));
  const expectedQuarantineHash = createHash("sha256");
  const actualQuarantineHash = createHash("sha256");
  const groups = new Map();
  let selectedRows = 0;
  if (sourceArtifacts.length === 1) {
    try {
      const rowIds = new Set();
      for await (const record of gzipRecords(path.join(releaseDirectory, sourceArtifacts[0].path))) {
        assertSelectedFields(record);
        if (record.type_status !== "ACTIVE" || record.license_or_application !== "LIC") throw new Error("unselected source row retained");
        const rowId = sourceActivityId(record);
        if (rowIds.has(rowId)) throw new Error(`duplicate source row ${rowId}`);
        rowIds.add(rowId);
        const key = textValue(record.file_number) ?? `source-row:${record.source_row_ordinal}`;
        const values = groups.get(key) ?? [];
        values.push(record);
        groups.set(key, values);
        selectedRows += 1;
      }
      if (selectedRows !== sourceArtifacts[0].record_count || selectedRows !== manifest.coverage?.selected_active_issued_license_rows) throw new Error("selected source count mismatch");
      if (manifest.source_release_id !== sourceReleaseId({ modifiedAt: manifest.source_modified_at, bytes: manifest.source_archive_bytes, archiveSha256: manifest.source_archive_sha256 }, sourceArtifacts[0].sha256)) throw new Error("source release ID is not bound to archive metadata and selected source checksum");
    } catch (error) { failures.push({ path: sourceArtifacts[0].path, reason: `source validation failed: ${error.message}` }); }
  }
  const replayBaselineByZip = new Map();
  if (zipValidationArtifacts.length === 1) {
    try {
      for await (const line of createInterface({ input: createReadStream(path.join(releaseDirectory, zipValidationArtifacts[0].path)), crlfDelay: Infinity })) {
        if (!line) continue;
        const record = JSON.parse(line);
        if (!/^\d{5}$/.test(record.zip_code ?? "") || replayBaselineByZip.has(record.zip_code) || (record.preferred_state !== null && !US_STATE_AND_TERRITORY_CODES.has(record.preferred_state))) throw new Error("invalid or duplicate ZIP validation row");
        replayBaselineByZip.set(record.zip_code, { postal_label: record.preferred_state ? { preferred_state: record.preferred_state } : null });
      }
      if (replayBaselineByZip.size !== zipValidationArtifacts[0].record_count) throw new Error("ZIP validation reference count mismatch");
    } catch (error) { failures.push({ path: zipValidationArtifacts[0].path, reason: error.message }); }
  }
  const replayContext = { runId: manifest.run_id, retrievedAt: manifest.retrieved_at, sourceModifiedAt: manifest.source_modified_at, sourceReleaseId: manifest.source_release_id, baselineByZip: replayBaselineByZip };
  let expectedSites = 0;
  let expectedQuarantinedGroups = 0;
  let expectedQuarantinedRows = 0;
  for (const [key, records] of [...groups].sort(([left], [right]) => compareText(left, right))) {
    try {
      const expected = normalizeCaAbcActiveLicenseSite(records, replayContext);
      expectedHashes.get(sha256(expected.source_record_id)[0]).update(json(replayComparable(expected)));
      expectedSites += 1;
    } catch (error) {
      if (!QUARANTINE_REASONS.has(error.message)) { failures.push({ path: sourceArtifacts[0]?.path ?? "manifest.json", reason: `replay failed: ${error.message}` }); continue; }
      expectedQuarantineHash.update(json(quarantineRecord(key, error.message, replayContext)));
      expectedQuarantinedGroups += 1;
      expectedQuarantinedRows += records.length;
    }
  }
  const ids = new Set();
  const countsByZip = new Map();
  let actualSites = 0;
  let actualActivities = 0;
  let actualPastExpirationRows = 0;
  for (const artifact of siteArtifacts) {
    try {
      const prefix = artifact.path.match(/id-hash-prefix=([0-9a-f])/)?.[1];
      let partitionCount = 0;
      for await (const record of gzipRecords(path.join(releaseDirectory, artifact.path))) {
        const id = record.external_identifiers?.find((item) => item.type === "ca_abc_file_number")?.value;
        if (!/^\d{8}$/.test(id ?? "") || ids.has(id) || sha256(id)[0] !== prefix) throw new Error(`duplicate, missing, or incorrectly partitioned file number ${id}`);
        ids.add(id);
        if (record.entity_candidates?.organization_id !== `organization:ca_abc_file_${id}` || record.entity_candidates?.physical_site_id !== `physical_site:ca_abc_file_${id}` || record.entity_candidates?.establishment_id !== `establishment:ca_abc_file_${id}`) throw new Error(`invalid entity identities for ${id}`);
        if (record.source_status?.status_class !== "active-issued-license-in-ca-abc-daily-export" || record.export_policy !== "local-review-only" || record.provenance?.policy_id !== "ca-abc-active-license-sites") throw new Error(`invalid status, policy, or provenance for ${id}`);
        if (containsExcludedKey(record)) throw new Error(`excluded source field leaked for ${id}`);
        if (!/^\d{5}$/.test(record.premise_address?.zip_code ?? "")) throw new Error(`invalid ZIP for ${id}`);
        increment(countsByZip, record.premise_address.zip_code);
        actualActivities += record.license_activities?.length ?? 0;
        actualPastExpirationRows += record.source_status.expiration_before_observation_count ?? 0;
        actualHashes.get(prefix).update(json(replayComparable(record)));
        partitionCount += 1;
      }
      if (partitionCount !== artifact.record_count) throw new Error("partition record count mismatch");
      actualSites += partitionCount;
    } catch (error) { failures.push({ path: artifact.path, reason: error.message }); }
  }
  for (const artifact of quarantineArtifacts) {
    try {
      let count = 0;
      for await (const record of gzipRecords(path.join(releaseDirectory, artifact.path))) {
        if (!QUARANTINE_REASONS.has(record.reason) || record.export_policy !== "internal") throw new Error("invalid quarantine record");
        actualQuarantineHash.update(json(record));
        count += 1;
      }
      if (count !== artifact.record_count) throw new Error("quarantine count mismatch");
    } catch (error) { failures.push({ path: artifact.path, reason: error.message }); }
  }
  for (const prefix of "0123456789abcdef") if (expectedHashes.get(prefix).digest("hex") !== actualHashes.get(prefix).digest("hex")) failures.push({ path: `derived/sites/id-hash-prefix=${prefix}.jsonl.gz`, reason: "normalized replay mismatch" });
  if (expectedQuarantineHash.digest("hex") !== actualQuarantineHash.digest("hex")) failures.push({ path: "derived/quarantine.jsonl.gz", reason: "quarantine replay mismatch" });
  const coverage = manifest.coverage ?? {};
  if (actualSites !== expectedSites || actualSites !== coverage.normalized_sites || coverage.organizations !== actualSites || coverage.establishments !== actualSites) failures.push({ path: "manifest.json", reason: "site or entity counts do not reconcile" });
  if (coverage.license_activities !== actualActivities || coverage.quarantined_file_groups !== expectedQuarantinedGroups || coverage.quarantined_source_rows !== expectedQuarantinedRows || coverage.source_active_rows_with_expiration_before_observation !== actualPastExpirationRows) failures.push({ path: "manifest.json", reason: "activity, quarantine, or expiration counts do not reconcile" });
  if (coverage.source_records !== coverage.selected_active_issued_license_rows + coverage.excluded_source_rows) failures.push({ path: "manifest.json", reason: "source selection counts do not reconcile" });
  for (const artifact of zipArtifacts) {
    try {
      const seen = new Set();
      let contribution = 0;
      for await (const line of createInterface({ input: createReadStream(path.join(releaseDirectory, artifact.path)), crlfDelay: Infinity })) {
        if (!line) continue;
        const record = JSON.parse(line);
        if (!/^\d{5}$/.test(record.zip_code ?? "") || seen.has(record.zip_code)) throw new Error("invalid or duplicate ZIP row");
        seen.add(record.zip_code);
        const count = record.ca_abc_active_issued_license_snapshot?.physical_site_count;
        if (count !== (countsByZip.get(record.zip_code) ?? 0)) throw new Error(`ZIP contribution mismatch for ${record.zip_code}`);
        contribution += count;
      }
      if (seen.size !== artifact.record_count || seen.size !== coverage.zip_union_records || contribution !== actualSites) throw new Error("ZIP coverage counts do not reconcile");
    } catch (error) { failures.push({ path: artifact.path, reason: error.message }); }
  }
  if (failures.length) throw new Error(`California ABC verification failed:\n${failures.map((failure) => `- ${failure.path}: ${failure.reason}`).join("\n")}`);
  return { dataset_id: manifest.dataset_id, release_id: manifest.release_id, status: manifest.status, artifact_count: manifest.artifacts.length, coverage };
}
