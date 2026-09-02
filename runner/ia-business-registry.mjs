import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { finished } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";
import { parse } from "csv-parse";
import unzipper from "unzipper";
import { assertNormalizedUsPostalFieldsDeep } from "./normalized-us-postal-code.mjs";

export const IA_BUSINESS_REGISTRY_SCHEMA_VERSION = "1.0.0";
export const IA_BUSINESS_REGISTRY_TRANSFORMATION_VERSION = "ia-business-registry@1.0.1";
export const IA_BUSINESS_REGISTRY_DATASET_NUMBER = 554;
export const IA_BUSINESS_REGISTRY_CATALOG_URL = "https://data.iowa.gov/catalog/dataset/554";
export const IA_BUSINESS_REGISTRY_METADATA_URL = "https://idh-be.iowa.gov/api/v1/datasets/554/";
export const IA_BUSINESS_REGISTRY_COLUMNS_URL = "https://idh-be.iowa.gov/api/v1/datasets/554/columns.json";
export const IA_BUSINESS_REGISTRY_ARCHIVE_URL = "https://idh-be.iowa.gov/api/v1/datasets/554/rows.csv";

export const IA_BUSINESS_REGISTRY_SELECTED_SCHEMA = Object.freeze([
  ["corp_number", "STRING"],
  ["legal_name", "STRING"],
  ["corporation_type", "STRING"],
  ["effective_date", "DATE"],
  ["ho_address_1", "STRING"],
  ["ho_address_2", "STRING"],
  ["ho_city", "STRING"],
  ["ho_state", "STRING"],
  ["ho_zip", "STRING"],
  ["ho_country", "STRING"],
  ["ho_latitude", "FLOAT"],
  ["ho_longitude", "FLOAT"],
]);

export const IA_BUSINESS_REGISTRY_SELECTED_FIELDS = Object.freeze(IA_BUSINESS_REGISTRY_SELECTED_SCHEMA.map(([field]) => field));
export const IA_BUSINESS_REGISTRY_SCHEMA_FINGERPRINT = "4837441527d8ddcdf8e7e466f063ac037b34c168b484ecd28fad780d16f8b11e";

export const IA_BUSINESS_REGISTRY_SOURCE_HEADERS = Object.freeze([
  "corp_number", "legal_name", "corporation_type", "effective_date",
  "registered_agent", "ra_address_1", "ra_address_2", "ra_city", "ra_state", "ra_zip",
  "ra_latitude", "ra_longitude", "ra_location", "home_office",
  "ho_address_1", "ho_address_2", "ho_city", "ho_state", "ho_zip", "ho_country",
  "ho_latitude", "ho_longitude", "ho_location",
]);

const EXPECTED_TITLE = "Active Iowa Business Entities";
const EXPECTED_TABLE = "active_business_entities";
const EXPECTED_ARCHIVE_ENTRY = "active_iowa_business_entities_554_rows.csv";
const CC_BY_URL = "https://creativecommons.org/licenses/by/4.0/";
const STORAGE_ARCHIVE_PATH = "/iowa-datahub-prod/iowa-datahub-exports/datasets/554/columns.json";
const MAX_METADATA_BYTES = 2_000_000;
const MAX_ARCHIVE_BYTES = 500_000_000;
const US_STATE_AND_TERRITORY_CODES = new Set([
  "AL", "AK", "AS", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "GU", "HI", "ID", "IL", "IN", "IA", "KS", "KY",
  "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "MP", "OH", "OK",
  "OR", "PA", "PR", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "VI", "WA", "WV", "WI", "WY",
]);
const US_POSTAL_COUNTRY_CODES = new Set(["", "USA", "US", "PRI", "VIR", "GUM", "ASM", "MNP"]);
const QUARANTINE_REASONS = new Set(["missing-or-invalid-entity-identity", "invalid-effective-date"]);

function text(value) {
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

function calendarDate(value) {
  const raw = text(value);
  if (!raw) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) && !Number.isNaN(Date.parse(`${raw}T00:00:00Z`)) ? raw : null;
}

function postalCode(value) {
  const raw = text(value);
  if (!raw) return { raw: null, zip_code: null, postal_code: null, zip4: null, status: "missing" };
  const match = raw.match(/^(\d{5})(?:[- ]?(\d{4}))?$/);
  if (!match || match[1] === "00000") return { raw, zip_code: null, postal_code: null, zip4: null, status: "invalid-or-non-us-format" };
  return {
    raw,
    zip_code: match[1],
    postal_code: match[1],
    zip4: match[2] ?? null,
    status: match[2] ? "normalized-zip-plus-4" : "normalized-zip5",
  };
}

function stateCode(value) {
  const normalized = text(value)?.toUpperCase() ?? null;
  return normalized && US_STATE_AND_TERRITORY_CODES.has(normalized) ? normalized : null;
}

function coordinatePair(latitudeValue, longitudeValue) {
  const latitudeSource = text(latitudeValue);
  const longitudeSource = text(longitudeValue);
  if (!latitudeSource && !longitudeSource) return { latitude: null, longitude: null, status: "not-provided" };
  if (!latitudeSource || !longitudeSource) return { latitude: null, longitude: null, status: "incomplete-source-coordinate-pair" };
  const latitude = Number(latitudeSource);
  const longitude = Number(longitudeSource);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return { latitude: null, longitude: null, status: "invalid-source-coordinate-pair" };
  }
  return { latitude, longitude, status: "source-geocoded-coordinate-pair" };
}

function geography(zipCode, baselineByZip) {
  if (!zipCode) return { zip_code: null, zcta_match_status: "not-evaluated-without-eligible-us-address", zcta_geo_id: null, zcta_geoid: null, zcta_geometry_file: null };
  const baseline = baselineByZip?.get(zipCode);
  return {
    zip_code: zipCode,
    zcta_match_status: baseline?.geography?.status ?? "no-2020-zcta-polygon",
    zcta_geo_id: baseline?.geography?.geo_id ?? null,
    zcta_geoid: baseline?.geography?.geoid ?? null,
    zcta_geometry_file: baseline?.geography?.geometry_file ?? null,
  };
}

function provenance(context, corporationNumber) {
  return {
    source_id: "iowa-active-business-entities",
    source_release_id: context.sourceReleaseId,
    source_record_id: corporationNumber,
    ingest_run_id: context.runId,
    transformation_version: IA_BUSINESS_REGISTRY_TRANSFORMATION_VERSION,
    policy_id: "ia-business-registry",
  };
}

export function schemaFingerprint(columns) {
  const byName = new Map((columns ?? []).map((column) => [column.name, column.type]));
  return sha256(IA_BUSINESS_REGISTRY_SELECTED_SCHEMA.map(([field]) => `${field}:${byName.get(field) ?? ""}`).join("\u0000"));
}

export function selectedSourceRecord(row) {
  return Object.fromEntries(IA_BUSINESS_REGISTRY_SELECTED_FIELDS.map((field) => [field, row?.[field] ?? ""]));
}

export function normalizeIaBusinessEntity(source, context) {
  const corporationNumber = text(source.corp_number);
  const legalName = text(source.legal_name);
  const entityType = text(source.corporation_type);
  if (!/^\d{6}$/.test(corporationNumber ?? "") || !legalName || !entityType) throw new Error("missing-or-invalid-entity-identity");
  const effectiveDateSource = text(source.effective_date);
  const effectiveDate = calendarDate(effectiveDateSource);
  if (effectiveDateSource && !effectiveDate) throw new Error("invalid-effective-date");
  const postal = postalCode(source.ho_zip);
  const state = stateCode(source.ho_state);
  const countrySource = text(source.ho_country)?.toUpperCase() ?? null;
  const street = text(source.ho_address_1);
  const city = text(source.ho_city);
  const coordinates = coordinatePair(source.ho_latitude, source.ho_longitude);
  const eligible = Boolean(street && city && state && postal.zip_code && US_POSTAL_COUNTRY_CODES.has(countrySource ?? ""));
  return {
    schema_version: IA_BUSINESS_REGISTRY_SCHEMA_VERSION,
    normalized_record_id: `ia-business-registry:entity:${corporationNumber}`,
    entity_candidates: {
      organization_id: `organization:ia_sos_corp_${corporationNumber}`,
      brand_id: null,
      physical_site_id: null,
      establishment_id: null,
      identity_status: "provisional",
    },
    external_identifiers: [{ type: "ia_sos_corporation_number", value: corporationNumber, source_field: "corp_number" }],
    legal_name: legalName,
    entity_type: entityType,
    effective_date: effectiveDate,
    home_office_address: {
      street,
      unit_or_additional: text(source.ho_address_2),
      city,
      state_source: text(source.ho_state),
      state_code: state,
      postal_code_source: postal.raw,
      zip_code: postal.zip_code,
      postal_code: postal.postal_code,
      zip4: postal.zip4,
      postal_code_status: postal.status,
      country_source: text(source.ho_country),
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      coordinate_status: coordinates.status,
      coordinate_scope: "iowa-data-hub-geocode-of-full-or-partial-home-office-address-near-iowa",
      address_scope: "secretary-of-state-home-office-or-principal-office-address-not-verified-current-physical-operating-site",
      eligible_for_us_zip_coverage: eligible,
      geography: geography(eligible ? postal.zip_code : null, context.baselineByZip),
    },
    source_status: {
      value: "listed-in-active-iowa-business-entities-dataset-as-of-source-refresh",
      status: "Active",
      status_class: "active-registration-in-iowa-secretary-of-state-source-dataset",
      source_modified_at: context.sourceModifiedAt,
      semantics: "source-active-registration-not-independent-proof-of-current-operations-legality-licensure-public-access-or-an-open-storefront",
    },
    observed_at: context.retrievedAt,
    provenance: provenance(context, corporationNumber),
    export_policy: "public",
  };
}

function assertAllowedUrl(urlValue, type) {
  const url = new URL(urlValue);
  if (url.protocol !== "https:" || url.hostname !== "idh-be.iowa.gov") throw new Error(`Iowa ${type} URL is outside the allowlist.`);
  const expected = type === "metadata"
    ? `/api/v1/datasets/${IA_BUSINESS_REGISTRY_DATASET_NUMBER}/`
    : type === "columns"
      ? `/api/v1/datasets/${IA_BUSINESS_REGISTRY_DATASET_NUMBER}/columns.json`
      : `/api/v1/datasets/${IA_BUSINESS_REGISTRY_DATASET_NUMBER}/rows.csv`;
  if (url.pathname !== expected || url.search || url.hash) throw new Error(`Iowa ${type} URL has an unexpected path.`);
  return url;
}

function assertColumnsRedirect(urlValue) {
  const url = new URL(urlValue);
  if (url.protocol !== "https:" || url.hostname !== "storage.googleapis.com" || url.pathname !== STORAGE_ARCHIVE_PATH || !url.searchParams.has("X-Goog-Signature")) {
    throw new Error("Iowa columns redirect is outside the approved storage object.");
  }
  return url;
}

function retryDelay(response, attempt) {
  const retryAfter = Number(response?.headers?.get?.("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter >= 0) return Math.min(10_000, retryAfter * 1000);
  return Math.min(4_000, 250 * (2 ** attempt));
}

async function responseBuffer(response, maximumBytes) {
  const contentLength = response.headers.get("content-length");
  const declared = contentLength === null ? Number.NaN : Number(contentLength);
  if (Number.isFinite(declared) && declared > maximumBytes) throw new Error("Iowa response exceeds the configured size limit.");
  const chunks = [];
  let bytes = 0;
  for await (const chunk of response.body ?? []) {
    bytes += chunk.length;
    if (bytes > maximumBytes) throw new Error("Iowa response exceeds the configured size limit.");
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function requestWithRetry(url, { fetchImpl, signal, sleep, accept, attempts = 5, redirect = "manual" }) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    signal?.throwIfAborted?.();
    try {
      const response = await fetchImpl(url, {
        method: "GET",
        headers: { Accept: accept, "Accept-Encoding": "identity", "User-Agent": "CoTive-Collector/0.1" },
        redirect,
        signal,
      });
      if ([429, 500, 502, 503, 504].includes(response.status)) {
        await response.body?.cancel?.();
        if (attempt === attempts - 1) throw new Error(`Iowa source returned HTTP ${response.status}.`);
        await sleep(retryDelay(response, attempt));
        continue;
      }
      return response;
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      lastError = error;
      if (attempt === attempts - 1) break;
      await sleep(retryDelay(null, attempt));
    }
  }
  throw lastError;
}

export async function requestIaMetadata({
  fetchImpl = globalThis.fetch,
  signal,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
} = {}) {
  const url = assertAllowedUrl(IA_BUSINESS_REGISTRY_METADATA_URL, "metadata");
  const response = await requestWithRetry(url, { fetchImpl, signal, sleep, accept: "application/json" });
  if (response.status >= 300 && response.status < 400) throw new Error("Iowa metadata redirect rejected.");
  if (!response.ok || !String(response.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) throw new Error(`Iowa metadata returned HTTP ${response.status} or an unexpected content type.`);
  return JSON.parse((await responseBuffer(response, MAX_METADATA_BYTES)).toString("utf8"));
}

export async function requestIaColumns({
  fetchImpl = globalThis.fetch,
  signal,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
} = {}) {
  const url = assertAllowedUrl(IA_BUSINESS_REGISTRY_COLUMNS_URL, "columns");
  let response = await requestWithRetry(url, { fetchImpl, signal, sleep, accept: "application/json" });
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = response.headers.get("location");
    await response.body?.cancel?.();
    if (!location) throw new Error("Iowa columns redirect omitted its destination.");
    response = await requestWithRetry(assertColumnsRedirect(location), { fetchImpl, signal, sleep, accept: "application/json" });
  }
  if (response.status >= 300 && response.status < 400) throw new Error("Iowa columns redirect chain rejected.");
  if (!response.ok || !String(response.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) throw new Error(`Iowa columns returned HTTP ${response.status} or an unexpected content type.`);
  return JSON.parse((await responseBuffer(response, MAX_METADATA_BYTES)).toString("utf8"));
}

function validateSourceMetadata(metadataResponse, columns, expectedFingerprint = IA_BUSINESS_REGISTRY_SCHEMA_FINGERPRINT) {
  const data = metadataResponse?.data;
  if (!data || data.id !== IA_BUSINESS_REGISTRY_DATASET_NUMBER || data.title !== EXPECTED_TITLE || data.tableBaseName !== EXPECTED_TABLE) throw new Error("Iowa source identity changed.");
  if (data.status !== "Published" || data.audience !== "Public") throw new Error("Iowa source is not a published public dataset.");
  if (data.columnUniqueIdentifier !== "corp_number" || data.updateFrequency !== "Monthly") throw new Error("Iowa source identifier or refresh contract changed.");
  if (!String(data.metadata?.metadatafield15 ?? "").includes(CC_BY_URL)) throw new Error("Iowa source no longer declares CC BY 4.0 in metadata.");
  if (!Number.isInteger(data.numRows) || data.numRows < 1) throw new Error("Iowa source row count is invalid.");
  const sourceModifiedAt = new Date(data.modifiedAt).toISOString();
  const selectedSchemaFingerprint = schemaFingerprint(columns);
  if (selectedSchemaFingerprint !== expectedFingerprint) throw new Error(`Iowa selected schema changed: expected ${expectedFingerprint}, received ${selectedSchemaFingerprint}.`);
  return {
    datasetId: data.id,
    title: data.title,
    tableBaseName: data.tableBaseName,
    sourceModifiedAt,
    expectedRows: data.numRows,
    selectedSchemaFingerprint,
    updateFrequency: data.updateFrequency,
    audience: data.audience,
    status: data.status,
  };
}

async function renameWithRetry(sourcePath, destinationPath, attempts = 12) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await rename(sourcePath, destinationPath);
      return;
    } catch (error) {
      lastError = error;
      if (!["EACCES", "EBUSY", "EPERM"].includes(error.code) || attempt === attempts - 1) break;
      await new Promise((resolve) => setTimeout(resolve, Math.min(4_000, 50 * (2 ** attempt))));
    }
  }
  throw lastError;
}

async function writeArtifact(directory, relativePath, content, metadata = {}) {
  const destination = path.join(directory, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
  const temporary = `${destination}.tmp-${randomUUID()}`;
  await writeFile(temporary, buffer, { flag: "wx" });
  await renameWithRetry(temporary, destination);
  return { path: relativePath.replaceAll("\\", "/"), bytes: buffer.length, sha256: sha256(buffer), ...metadata };
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
  if (!writer.gzip.write(`${JSON.stringify(record)}\n`)) await once(writer.gzip, "drain");
  writer.records += 1;
}

async function closeGzipWriter(writer, artifactType, metadata = {}) {
  writer.gzip.end();
  await finished(writer.output);
  await renameWithRetry(writer.temporary, writer.destination);
  return { path: writer.relativePath, ...(await hashFile(writer.destination)), record_count: writer.records, artifact_type: artifactType, ...metadata };
}

function abortGzipWriters(writers) {
  for (const writer of writers) {
    writer.gzip.on("error", () => {});
    writer.output.on("error", () => {});
    writer.gzip.destroy();
    writer.output.destroy();
  }
}

function assertContained(parent, child, label) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`${label} escapes its release directory.`);
}

async function loadZbpBaseline(pointerPath) {
  const absolutePointer = path.resolve(pointerPath);
  const pointer = JSON.parse(await readFile(absolutePointer, "utf8"));
  const base = path.dirname(absolutePointer);
  const manifestPath = path.resolve(base, pointer.manifest ?? "");
  assertContained(base, manifestPath, "Census ZBP manifest");
  const manifestBuffer = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBuffer.toString("utf8"));
  if (manifest.dataset_id !== "census-zbp-baseline" || !manifest.complete_national_release) throw new Error("A complete Census ZBP baseline release is required.");
  const artifact = manifest.artifacts.find((candidate) => candidate.path === "derived/zip-coverage.jsonl");
  if (!artifact) throw new Error("Census ZBP ZIP coverage artifact is missing.");
  const artifactPath = path.resolve(path.dirname(manifestPath), artifact.path);
  assertContained(path.dirname(manifestPath), artifactPath, "Census ZBP coverage artifact");
  const rows = (await readFile(artifactPath, "utf8")).split(/\r?\n/).filter(Boolean).map(JSON.parse);
  return { rows, byZip: new Map(rows.map((row) => [row.zip_code, row])), manifest, manifestSha256: sha256(manifestBuffer) };
}

async function* gzipRecords(filename) {
  const lines = createInterface({ input: createReadStream(filename).pipe(createGunzip()), crlfDelay: Infinity });
  for await (const line of lines) if (line) yield JSON.parse(line);
}

function validateHeaders(headers) {
  if (!Array.isArray(headers) || headers.length !== IA_BUSINESS_REGISTRY_SOURCE_HEADERS.length || headers.some((header, index) => header !== IA_BUSINESS_REGISTRY_SOURCE_HEADERS[index])) {
    throw new Error("Iowa source CSV headers changed.");
  }
  return headers;
}

async function openIaArchive(archivePath) {
  const directory = await unzipper.Open.file(archivePath);
  const files = directory.files.filter((entry) => entry.type === "File");
  if (files.length !== 1 || files[0].path !== EXPECTED_ARCHIVE_ENTRY || files[0].path.includes("..") || path.isAbsolute(files[0].path)) {
    throw new Error("Iowa archive does not contain exactly the expected CSV entry.");
  }
  if (Number(files[0].uncompressedSize) > MAX_ARCHIVE_BYTES) throw new Error("Iowa source CSV exceeds the configured size limit.");
  return files[0];
}

async function* archiveRecords(archivePath) {
  const entry = await openIaArchive(archivePath);
  const parser = entry.stream().pipe(parse({
    bom: true,
    columns: (headers) => validateHeaders(headers),
    relax_column_count: false,
    skip_empty_lines: true,
  }));
  for await (const row of parser) yield row;
}

export async function downloadIaArchive(destination, {
  fetchImpl,
  signal,
  sleep,
  logger,
}) {
  const url = assertAllowedUrl(IA_BUSINESS_REGISTRY_ARCHIVE_URL, "archive");
  const response = await requestWithRetry(url, { fetchImpl, signal, sleep, accept: "application/zip, application/octet-stream" });
  if (response.status >= 300 && response.status < 400) throw new Error("Iowa archive redirect rejected.");
  const contentType = String(response.headers.get("content-type") ?? "").toLowerCase();
  const disposition = String(response.headers.get("content-disposition") ?? "").toLowerCase();
  if (!response.ok || !contentType.includes("application/zip") || !disposition.includes("active_iowa_business_entities_554_rows.zip")) {
    throw new Error(`Iowa archive returned HTTP ${response.status} or an unexpected response contract.`);
  }
  const contentLength = response.headers.get("content-length");
  const declared = contentLength === null ? Number.NaN : Number(contentLength);
  if (Number.isFinite(declared) && declared > MAX_ARCHIVE_BYTES) throw new Error("Iowa archive exceeds the configured size limit.");
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp-${randomUUID()}`;
  const output = createWriteStream(temporary, { flags: "wx" });
  let bytes = 0;
  try {
    for await (const chunk of response.body ?? []) {
      signal?.throwIfAborted?.();
      bytes += chunk.length;
      if (bytes > MAX_ARCHIVE_BYTES) throw new Error("Iowa archive exceeds the configured size limit.");
      if (!output.write(chunk)) await once(output, "drain");
    }
    output.end();
    await finished(output);
    if (Number.isFinite(declared) && bytes !== declared) throw new Error(`Iowa archive download was incomplete: expected ${declared} bytes, received ${bytes}.`);
    await renameWithRetry(temporary, destination);
  } catch (error) {
    output.destroy();
    throw error;
  }
  logger(`Downloaded ${bytes.toLocaleString("en-US")} Iowa archive bytes.`);
}

async function acquireSelectedSource({ archivePath, sourceRecords, writer, expectedRows, signal, logger }) {
  const ids = new Set();
  let rows = 0;
  const input = sourceRecords ?? archiveRecords(archivePath);
  for await (const source of input) {
    signal?.throwIfAborted?.();
    const selected = selectedSourceRecord(source);
    const id = text(selected.corp_number);
    if (!/^\d{6}$/.test(id ?? "")) throw new Error("Iowa source acquisition received an invalid corporation number.");
    if (ids.has(id)) throw new Error(`Duplicate Iowa corporation number ${id}.`);
    ids.add(id);
    await writeGzipRecord(writer, selected);
    rows += 1;
    if (rows % 100_000 === 0) logger(`Acquired ${rows.toLocaleString("en-US")} Iowa active entities.`);
  }
  if (rows !== expectedRows) throw new Error(`Iowa source acquisition returned ${rows} rows; metadata reported ${expectedRows}.`);
  return rows;
}

function increment(map, key, amount = 1) {
  const normalized = key ?? "(blank)";
  map.set(normalized, (map.get(normalized) ?? 0) + amount);
}

function sortedCounts(map) {
  return Object.fromEntries([...map].sort(([left], [right]) => String(left).localeCompare(String(right))));
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
      ia_business_registry_active_entity_snapshot: {
        status: count ? "published-active-entity-home-office-address-evidence" : "no-eligible-home-office-address-in-current-source-snapshot",
        active_entity_home_office_address_count: count,
        source_release_id: context.sourceReleaseId,
        source_modified_at: context.sourceModifiedAt,
        physical_site_count: null,
        physical_site_inference_permitted: false,
      },
    };
  });
}

export async function buildIaBusinessRegistry({
  outputRoot,
  zbpPointer,
  metadataResponse = null,
  columns = null,
  sourceRecords = null,
  sourceArchivePath = null,
  minimumEntities = 300_000,
  schemaFingerprintExpected = IA_BUSINESS_REGISTRY_SCHEMA_FINGERPRINT,
  fetchImpl = globalThis.fetch,
  signal,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  logger = console.log,
  now = () => new Date(),
} = {}) {
  if (!outputRoot || !zbpPointer) throw new Error("outputRoot and zbpPointer are required.");
  if (sourceRecords && sourceArchivePath) throw new Error("sourceRecords and sourceArchivePath are mutually exclusive.");
  if (!Number.isInteger(minimumEntities) || minimumEntities < 1) throw new Error("minimumEntities must be a positive integer.");
  if (sourceArchivePath) assertContained(outputRoot, sourceArchivePath, "Iowa staged source archive");
  signal?.throwIfAborted?.();
  const retrievedAt = now().toISOString();
  const runId = randomUUID();
  const releaseId = `ia-business-registry-${releaseTimestamp(retrievedAt)}-${runId.slice(0, 8)}`;
  const stagingDirectory = path.join(outputRoot, ".staging", runId);
  await mkdir(stagingDirectory, { recursive: true });
  const baseline = await loadZbpBaseline(zbpPointer);
  const initialMetadata = metadataResponse ?? await requestIaMetadata({ fetchImpl, signal, sleep });
  const initialColumns = columns ?? await requestIaColumns({ fetchImpl, signal, sleep });
  const catalog = validateSourceMetadata(initialMetadata, initialColumns, schemaFingerprintExpected);
  if (catalog.expectedRows < minimumEntities) throw new Error(`Iowa active-entity count ${catalog.expectedRows} is below the ${minimumEntities} quality floor.`);
  const preflightArtifact = await writeArtifact(stagingDirectory, "source/preflight.json", json({
    dataset_number: IA_BUSINESS_REGISTRY_DATASET_NUMBER,
    dataset_title: catalog.title,
    table_name: catalog.tableBaseName,
    status: catalog.status,
    audience: catalog.audience,
    update_frequency: catalog.updateFrequency,
    unique_identifier: "corp_number",
    source_modified_at: catalog.sourceModifiedAt,
    expected_source_rows: catalog.expectedRows,
    selected_schema: IA_BUSINESS_REGISTRY_SELECTED_SCHEMA,
    selected_schema_fingerprint: catalog.selectedSchemaFingerprint,
    license: "CC-BY-4.0",
    license_url: CC_BY_URL,
  }), { artifact_type: "ia-business-registry-preflight-json", record_count: 1 });
  const archivePath = path.join(stagingDirectory, "source", "active_iowa_business_entities_554_rows.zip");
  let archiveArtifact = null;
  if (!sourceRecords) {
    if (sourceArchivePath) {
      await mkdir(path.dirname(archivePath), { recursive: true });
      await copyFile(sourceArchivePath, archivePath);
    } else {
      await downloadIaArchive(archivePath, { fetchImpl, signal, sleep, logger });
    }
    await openIaArchive(archivePath);
    archiveArtifact = { path: "source/active_iowa_business_entities_554_rows.zip", ...(await hashFile(archivePath)), artifact_type: "ia-business-registry-source-archive-zip", record_count: catalog.expectedRows, export_policy: "internal-personal-data-minimized" };
  }
  const sourceWriter = await openGzipWriter(stagingDirectory, "source/selected-active-entities.jsonl.gz");
  let sourceArtifact;
  try {
    await acquireSelectedSource({ archivePath, sourceRecords, writer: sourceWriter, expectedRows: catalog.expectedRows, signal, logger });
    sourceArtifact = await closeGzipWriter(sourceWriter, "ia-business-registry-source-selected-jsonl-gzip", { export_policy: "public-cc-by-4.0" });
  } catch (error) {
    abortGzipWriters([sourceWriter]);
    throw error;
  }
  if (!metadataResponse) {
    const finalMetadata = await requestIaMetadata({ fetchImpl, signal, sleep });
    const finalColumns = await requestIaColumns({ fetchImpl, signal, sleep });
    const finalCatalog = validateSourceMetadata(finalMetadata, finalColumns, schemaFingerprintExpected);
    if (finalCatalog.sourceModifiedAt !== catalog.sourceModifiedAt || finalCatalog.expectedRows !== catalog.expectedRows || finalCatalog.selectedSchemaFingerprint !== catalog.selectedSchemaFingerprint) {
      throw new Error("Iowa source changed during acquisition; the run is not publishable.");
    }
  }
  const sourceReleaseDigest = sha256(`${catalog.sourceModifiedAt}\u0000${archiveArtifact?.sha256 ?? sourceArtifact.sha256}`);
  const sourceReleaseId = `ia-business-registry-${catalog.sourceModifiedAt.slice(0, 10)}-${sourceReleaseDigest.slice(0, 16)}`;
  const context = { runId, retrievedAt, sourceModifiedAt: catalog.sourceModifiedAt, sourceReleaseId, baselineByZip: baseline.byZip };
  const writers = new Map();
  for (const prefix of "0123456789abcdef") writers.set(prefix, await openGzipWriter(stagingDirectory, `derived/entities/id-hash-prefix=${prefix}.jsonl.gz`));
  const quarantineWriter = await openGzipWriter(stagingDirectory, "derived/quarantine/invalid-entities.jsonl.gz");
  const ids = new Set();
  const countsByZip = new Map();
  const entityTypes = new Map();
  const addressStates = new Map();
  const countries = new Map();
  let published = 0;
  let quarantined = 0;
  let withEligibleAddress = 0;
  let eligibleZipContributions = 0;
  let withSourceCoordinates = 0;
  let rejectedSourceCoordinates = 0;
  try {
    for await (const source of gzipRecords(path.join(stagingDirectory, sourceArtifact.path))) {
      signal?.throwIfAborted?.();
      let normalized;
      try {
        normalized = normalizeIaBusinessEntity(source, context);
        assertNormalizedUsPostalFieldsDeep(normalized);
      } catch (error) {
        if (!QUARANTINE_REASONS.has(error.message)) throw error;
        await writeGzipRecord(quarantineWriter, {
          schema_version: IA_BUSINESS_REGISTRY_SCHEMA_VERSION,
          source_record_id: text(source.corp_number),
          reason: error.message,
          source_release_id: context.sourceReleaseId,
          ingest_run_id: context.runId,
          export_policy: "internal",
        });
        quarantined += 1;
        continue;
      }
      const id = normalized.external_identifiers[0].value;
      if (ids.has(id)) throw new Error(`Duplicate normalized Iowa corporation number ${id}.`);
      ids.add(id);
      await writeGzipRecord(writers.get(sha256(id)[0]), normalized);
      increment(entityTypes, normalized.entity_type);
      increment(addressStates, normalized.home_office_address.state_code ?? normalized.home_office_address.state_source);
      increment(countries, normalized.home_office_address.country_source);
      if (normalized.home_office_address.coordinate_status === "source-geocoded-coordinate-pair") withSourceCoordinates += 1;
      if (["incomplete-source-coordinate-pair", "invalid-source-coordinate-pair"].includes(normalized.home_office_address.coordinate_status)) rejectedSourceCoordinates += 1;
      if (normalized.home_office_address.eligible_for_us_zip_coverage) {
        const zipCode = normalized.home_office_address.zip_code;
        countsByZip.set(zipCode, (countsByZip.get(zipCode) ?? 0) + 1);
        withEligibleAddress += 1;
        eligibleZipContributions += 1;
      }
      published += 1;
    }
  } catch (error) {
    abortGzipWriters([...writers.values(), quarantineWriter]);
    throw error;
  }
  const artifacts = [sourceArtifact, preflightArtifact];
  if (archiveArtifact) artifacts.push(archiveArtifact);
  for (const [prefix, writer] of writers) artifacts.push(await closeGzipWriter(writer, "normalized-ia-business-entity-jsonl-gzip", { id_hash_prefix: prefix, export_policy: "public-cc-by-4.0" }));
  artifacts.push(await closeGzipWriter(quarantineWriter, "ia-business-registry-quarantine-jsonl-gzip", { export_policy: "internal" }));
  const coverageRows = buildZipCoverage(baseline.rows, countsByZip, context);
  artifacts.push(await writeArtifact(stagingDirectory, "derived/zip-coverage.jsonl", jsonLines(coverageRows), { artifact_type: "ia-business-registry-zip-coverage-jsonl", record_count: coverageRows.length }));
  artifacts.push(await writeArtifact(stagingDirectory, "derived/source-summary.json", json({
    source_rows: catalog.expectedRows,
    active_entities_published: published,
    quarantined_entities: quarantined,
    entities_with_eligible_us_home_office_address: withEligibleAddress,
    eligible_us_entity_zip_contributions: eligibleZipContributions,
    entities_with_source_geocoded_coordinates: withSourceCoordinates,
    rejected_or_incomplete_source_coordinate_pairs: rejectedSourceCoordinates,
    distinct_source_zip_codes: countsByZip.size,
    entity_types: sortedCounts(entityTypes),
    home_office_states: sortedCounts(addressStates),
    home_office_countries: sortedCounts(countries),
  }), { artifact_type: "ia-business-registry-source-summary-json", record_count: 1 }));
  artifacts.push(await writeArtifact(stagingDirectory, "source/release-metadata.json", json({
    dataset_number: IA_BUSINESS_REGISTRY_DATASET_NUMBER,
    dataset_title: catalog.title,
    table_name: catalog.tableBaseName,
    source_modified_at: catalog.sourceModifiedAt,
    expected_source_rows: catalog.expectedRows,
    selected_schema_fingerprint: catalog.selectedSchemaFingerprint,
    selected_fields: IA_BUSINESS_REGISTRY_SELECTED_FIELDS,
    excluded_registered_agent_fields: IA_BUSINESS_REGISTRY_SOURCE_HEADERS.filter((field) => field === "registered_agent" || field.startsWith("ra_")),
    additionally_excluded_fields: ["home_office", "ho_location"],
    license: "CC-BY-4.0",
    license_url: CC_BY_URL,
  }), { artifact_type: "ia-business-registry-release-metadata-json", record_count: 1 }));
  if (published + quarantined !== catalog.expectedRows) throw new Error("Iowa source accounting did not reconcile.");
  const manifest = {
    schema_version: IA_BUSINESS_REGISTRY_SCHEMA_VERSION,
    dataset_id: "ia-business-registry-active-entities",
    release_id: releaseId,
    source_release_id: sourceReleaseId,
    source_modified_at: catalog.sourceModifiedAt,
    retrieved_at: retrievedAt,
    run_id: runId,
    transformation_version: IA_BUSINESS_REGISTRY_TRANSFORMATION_VERSION,
    source: {
      publisher: "Iowa Secretary of State",
      catalog_url: IA_BUSINESS_REGISTRY_CATALOG_URL,
      metadata_url: IA_BUSINESS_REGISTRY_METADATA_URL,
      columns_url: IA_BUSINESS_REGISTRY_COLUMNS_URL,
      archive_url: IA_BUSINESS_REGISTRY_ARCHIVE_URL,
      dataset_number: IA_BUSINESS_REGISTRY_DATASET_NUMBER,
      selected_schema_fingerprint: catalog.selectedSchemaFingerprint,
    },
    license: {
      identifier: "CC-BY-4.0",
      url: CC_BY_URL,
      attribution: "Office of the Secretary of State, State of Iowa; Iowa Data Hub",
      redistribution: "permitted-with-attribution",
    },
    geography_dependency: {
      dataset_id: baseline.manifest.dataset_id,
      release_id: baseline.manifest.release_id,
      manifest_sha256: baseline.manifestSha256,
    },
    coverage: {
      source_rows: catalog.expectedRows,
      active_entities_published: published,
      quarantined_entities: quarantined,
      entities_with_eligible_us_home_office_address: withEligibleAddress,
      eligible_us_entity_zip_contributions: eligibleZipContributions,
      entities_with_source_geocoded_coordinates: withSourceCoordinates,
      rejected_or_incomplete_source_coordinate_pairs: rejectedSourceCoordinates,
      distinct_source_zip_codes: countsByZip.size,
      zip_union_records: coverageRows.length,
      physical_sites: null,
      establishments: null,
    },
    source_field_policy: {
      selected_fields: IA_BUSINESS_REGISTRY_SELECTED_FIELDS,
      excluded_registered_agent_fields: IA_BUSINESS_REGISTRY_SOURCE_HEADERS.filter((field) => field === "registered_agent" || field.startsWith("ra_")),
      additionally_excluded_fields: ["home_office", "ho_location"],
      rationale: "minimize individual registered-agent data and retain only business identity plus source-defined home-office evidence",
    },
    limitations: [
      "The source covers entities listed as active by the Iowa Secretary of State at the monthly refresh, not every active business or establishment in Iowa.",
      "Sole proprietorships, partnerships, and other structures not required to register may be absent.",
      "Home-office information may be unavailable for newly filed entities and is not proof of a current physical operating site or public storefront.",
      "Source coordinates are Iowa Data Hub geocodes of full or partial addresses near Iowa; they are preserved as source evidence and do not create sites or establishments.",
      "Registered-agent names and all registered-agent address and coordinate fields are excluded from normalized and national outputs.",
      "Active is source registration status, not independent proof of operations, legality, solvency, licensure, or public access.",
    ],
    publication_policy: "public-cc-by-4.0-business-fields-only",
    complete_source_snapshot: true,
    artifacts,
  };
  await writeFile(path.join(stagingDirectory, "manifest.json"), json(manifest), { flag: "wx" });
  return publishIaBusinessRegistryStaging({ outputRoot, stagingRunId: runId });
}

export async function publishIaBusinessRegistryStaging({ outputRoot, stagingRunId } = {}) {
  if (!outputRoot || !/^[0-9a-f-]{36}$/i.test(stagingRunId ?? "")) throw new Error("outputRoot and a UUID stagingRunId are required.");
  const stagingDirectory = path.join(outputRoot, ".staging", stagingRunId);
  assertContained(outputRoot, stagingDirectory, "Iowa staging directory");
  const manifestPath = path.join(stagingDirectory, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.run_id !== stagingRunId || manifest.dataset_id !== "ia-business-registry-active-entities") throw new Error("Iowa staged manifest identity does not match the requested run.");
  await verifyIaBusinessRegistry(manifestPath);
  const releaseDirectory = path.join(outputRoot, "releases", manifest.release_id);
  await mkdir(path.dirname(releaseDirectory), { recursive: true });
  await renameWithRetry(stagingDirectory, releaseDirectory);
  const pointerPath = path.join(outputRoot, "current.json");
  const pointerTemporary = `${pointerPath}.tmp-${randomUUID()}`;
  await mkdir(outputRoot, { recursive: true });
  await writeFile(pointerTemporary, json({
    dataset_id: manifest.dataset_id,
    release_id: manifest.release_id,
    source_release_id: manifest.source_release_id,
    source_modified_at: manifest.source_modified_at,
    manifest: `releases/${manifest.release_id}/manifest.json`,
    published_at: new Date().toISOString(),
  }), { flag: "wx" });
  await renameWithRetry(pointerTemporary, pointerPath);
  return { manifest, releaseDirectory, pointerPath };
}

async function compareArchiveAndSelected(archivePath, selectedPath) {
  const archiveIterator = archiveRecords(archivePath)[Symbol.asyncIterator]();
  const selectedIterator = gzipRecords(selectedPath)[Symbol.asyncIterator]();
  let count = 0;
  while (true) {
    const [archiveNext, selectedNext] = await Promise.all([archiveIterator.next(), selectedIterator.next()]);
    if (archiveNext.done || selectedNext.done) {
      if (archiveNext.done !== selectedNext.done) throw new Error("Iowa archive and selected-source row counts differ.");
      break;
    }
    const expected = selectedSourceRecord(archiveNext.value);
    if (JSON.stringify(expected) !== JSON.stringify(selectedNext.value)) throw new Error(`Iowa selected source does not match archive row ${count + 1}.`);
    count += 1;
  }
  return count;
}

export async function verifyIaBusinessRegistry(manifestPath) {
  const absoluteManifestPath = path.resolve(manifestPath);
  const releaseDirectory = path.dirname(absoluteManifestPath);
  const manifestBuffer = await readFile(absoluteManifestPath);
  const manifest = JSON.parse(manifestBuffer.toString("utf8"));
  if (manifest.dataset_id !== "ia-business-registry-active-entities" || manifest.schema_version !== IA_BUSINESS_REGISTRY_SCHEMA_VERSION || manifest.transformation_version !== IA_BUSINESS_REGISTRY_TRANSFORMATION_VERSION) {
    throw new Error("Iowa manifest identity or version is invalid.");
  }
  if (manifest.source?.selected_schema_fingerprint !== IA_BUSINESS_REGISTRY_SCHEMA_FINGERPRINT || manifest.license?.identifier !== "CC-BY-4.0") throw new Error("Iowa manifest schema or license is invalid.");
  const artifactPaths = new Set();
  for (const artifact of manifest.artifacts ?? []) {
    if (artifactPaths.has(artifact.path)) throw new Error(`Duplicate Iowa artifact path ${artifact.path}.`);
    artifactPaths.add(artifact.path);
    const artifactPath = path.resolve(releaseDirectory, artifact.path);
    assertContained(releaseDirectory, artifactPath, "Iowa artifact");
    const actual = await hashFile(artifactPath);
    if (actual.bytes !== artifact.bytes || actual.sha256 !== artifact.sha256) throw new Error(`Iowa artifact hash or size mismatch for ${artifact.path}.`);
  }
  const sourceArtifact = manifest.artifacts.find((artifact) => artifact.artifact_type === "ia-business-registry-source-selected-jsonl-gzip");
  const archiveArtifact = manifest.artifacts.find((artifact) => artifact.artifact_type === "ia-business-registry-source-archive-zip");
  const normalizedArtifacts = manifest.artifacts.filter((artifact) => artifact.artifact_type === "normalized-ia-business-entity-jsonl-gzip");
  const quarantineArtifact = manifest.artifacts.find((artifact) => artifact.artifact_type === "ia-business-registry-quarantine-jsonl-gzip");
  if (!sourceArtifact || normalizedArtifacts.length !== 16 || !quarantineArtifact) throw new Error("Iowa release artifact set is incomplete.");
  if (archiveArtifact) {
    const compared = await compareArchiveAndSelected(path.join(releaseDirectory, archiveArtifact.path), path.join(releaseDirectory, sourceArtifact.path));
    if (compared !== sourceArtifact.record_count) throw new Error("Iowa archive verification count differs from the selected source artifact.");
  }
  const sourceIds = new Set();
  for await (const source of gzipRecords(path.join(releaseDirectory, sourceArtifact.path))) {
    const keys = Object.keys(source);
    if (keys.length !== IA_BUSINESS_REGISTRY_SELECTED_FIELDS.length || keys.some((field) => !IA_BUSINESS_REGISTRY_SELECTED_FIELDS.includes(field))) throw new Error("Iowa selected source contains an unapproved field.");
    const id = text(source.corp_number);
    if (!/^\d{6}$/.test(id ?? "") || sourceIds.has(id)) throw new Error(`Invalid or duplicate Iowa selected-source corporation number ${id}.`);
    sourceIds.add(id);
  }
  const normalizedIds = new Set();
  const countsByZip = new Map();
  let published = 0;
  let eligible = 0;
  let sourceCoordinates = 0;
  let rejectedCoordinates = 0;
  for (const artifact of normalizedArtifacts) {
    let partitionCount = 0;
    for await (const record of gzipRecords(path.join(releaseDirectory, artifact.path))) {
      const id = record.external_identifiers?.find((identifier) => identifier.type === "ia_sos_corporation_number")?.value;
      if (!sourceIds.has(id) || normalizedIds.has(id) || sha256(id)[0] !== artifact.id_hash_prefix) throw new Error(`Invalid Iowa normalized identity ${id}.`);
      normalizedIds.add(id);
      if (record.entity_candidates?.organization_id !== `organization:ia_sos_corp_${id}` || record.entity_candidates?.physical_site_id !== null || record.entity_candidates?.establishment_id !== null) throw new Error(`Iowa entity semantics are invalid for ${id}.`);
      if (record.provenance?.source_record_id !== id || record.provenance?.source_release_id !== manifest.source_release_id || record.provenance?.policy_id !== "ia-business-registry") throw new Error(`Iowa provenance is invalid for ${id}.`);
      const serialized = JSON.stringify(record);
      for (const excluded of manifest.source_field_policy.excluded_registered_agent_fields) if (serialized.includes(`\"${excluded}\"`)) throw new Error(`Iowa normalized output exposes excluded field ${excluded}.`);
      const address = record.home_office_address;
      if (address.address_scope !== "secretary-of-state-home-office-or-principal-office-address-not-verified-current-physical-operating-site") throw new Error(`Iowa address scope is invalid for ${id}.`);
      if (address.coordinate_status === "source-geocoded-coordinate-pair") {
        if (!Number.isFinite(address.latitude) || !Number.isFinite(address.longitude)) throw new Error(`Iowa source coordinates are invalid for ${id}.`);
        sourceCoordinates += 1;
      }
      if (["incomplete-source-coordinate-pair", "invalid-source-coordinate-pair"].includes(address.coordinate_status)) rejectedCoordinates += 1;
      if (address.eligible_for_us_zip_coverage) {
        if (!/^\d{5}$/.test(address.zip_code ?? "") || !address.state_code) throw new Error(`Iowa eligible ZIP evidence is invalid for ${id}.`);
        countsByZip.set(address.zip_code, (countsByZip.get(address.zip_code) ?? 0) + 1);
        eligible += 1;
      }
      published += 1;
      partitionCount += 1;
    }
    if (partitionCount !== artifact.record_count) throw new Error(`Iowa normalized partition count mismatch for ${artifact.path}.`);
  }
  let quarantined = 0;
  for await (const record of gzipRecords(path.join(releaseDirectory, quarantineArtifact.path))) {
    if (!QUARANTINE_REASONS.has(record.reason) || !sourceIds.has(record.source_record_id)) throw new Error("Iowa quarantine record is invalid.");
    quarantined += 1;
  }
  const coverage = manifest.coverage;
  if (sourceIds.size !== coverage.source_rows || published !== coverage.active_entities_published || quarantined !== coverage.quarantined_entities || published + quarantined !== sourceIds.size) throw new Error("Iowa entity accounting does not reconcile.");
  if (eligible !== coverage.entities_with_eligible_us_home_office_address || eligible !== coverage.eligible_us_entity_zip_contributions || countsByZip.size !== coverage.distinct_source_zip_codes) throw new Error("Iowa eligible ZIP accounting does not reconcile.");
  if (sourceCoordinates !== coverage.entities_with_source_geocoded_coordinates || rejectedCoordinates !== coverage.rejected_or_incomplete_source_coordinate_pairs) throw new Error("Iowa source coordinate accounting does not reconcile.");
  const zipArtifact = manifest.artifacts.find((artifact) => artifact.artifact_type === "ia-business-registry-zip-coverage-jsonl");
  if (!zipArtifact) throw new Error("Iowa ZIP coverage artifact is missing.");
  const zipRows = (await readFile(path.join(releaseDirectory, zipArtifact.path), "utf8")).split(/\r?\n/).filter(Boolean).map(JSON.parse);
  let priorZip = null;
  for (const row of zipRows) {
    if (!/^\d{5}$/.test(row.zip_code) || (priorZip && row.zip_code <= priorZip)) throw new Error(`Iowa ZIP coverage is invalid at ${row.zip_code}.`);
    priorZip = row.zip_code;
    const snapshot = row.ia_business_registry_active_entity_snapshot;
    if (snapshot.active_entity_home_office_address_count !== (countsByZip.get(row.zip_code) ?? 0) || snapshot.physical_site_inference_permitted !== false || snapshot.physical_site_count !== null) throw new Error(`Iowa ZIP coverage count or semantics are invalid for ${row.zip_code}.`);
    if (row.current_usps_validity?.status !== "unverified") throw new Error(`Iowa ZIP ${row.zip_code} has unsupported USPS validity.`);
  }
  if (zipRows.length !== coverage.zip_union_records || zipRows.length !== zipArtifact.record_count) throw new Error("Iowa ZIP union count does not reconcile.");
  return { dataset_id: manifest.dataset_id, release_id: manifest.release_id, source_release_id: manifest.source_release_id, artifact_count: manifest.artifacts.length, coverage: manifest.coverage };
}
