import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { finished } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";

export const LA_ACTIVE_BUSINESS_SCHEMA_VERSION = "1.0.0";
export const LA_ACTIVE_BUSINESS_TRANSFORMATION_VERSION = "la-active-businesses@1.0.0";
export const LA_ACTIVE_BUSINESS_DATASET_ID = "6rrh-rzua";
export const LA_ACTIVE_BUSINESS_METADATA_URL = `https://data.lacity.org/api/views/${LA_ACTIVE_BUSINESS_DATASET_ID}`;
export const LA_ACTIVE_BUSINESS_API_URL = `https://data.lacity.org/resource/${LA_ACTIVE_BUSINESS_DATASET_ID}.json`;
export const LA_ACTIVE_BUSINESS_PAGE_URL = "https://data.lacity.org/Administration-Finance/Listing-of-Active-Businesses/6rrh-rzua";
export const LA_ACTIVE_BUSINESS_LICENSE_URL = "https://creativecommons.org/publicdomain/zero/1.0/legalcode";

export const LA_ACTIVE_BUSINESS_SCHEMA = Object.freeze([
  ["location_account", "text"],
  ["business_name", "text"],
  ["dba_name", "text"],
  ["street_address", "text"],
  ["city", "text"],
  ["zip_code", "text"],
  ["naics", "text"],
  ["primary_naics_description", "text"],
  ["council_district", "number"],
  ["location_start_date", "calendar_date"],
  ["location_end_date", "text"],
  ["location_1", "location"],
]);
export const LA_ACTIVE_BUSINESS_FIELDS = Object.freeze(LA_ACTIVE_BUSINESS_SCHEMA.map(([field]) => field));
export const LA_ACTIVE_BUSINESS_SOURCE_FIELDS = Object.freeze(["socrata_row_id", ...LA_ACTIVE_BUSINESS_FIELDS]);
export const LA_ACTIVE_BUSINESS_SCHEMA_FINGERPRINT = "d0634adadf1c3a81e18b2c87c3b84b1234ec9039d5ad7d94430426c434036918";

const US_STATE_AND_TERRITORY_CODES = new Set([
  "AL", "AK", "AS", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "GU", "HI", "ID", "IL", "IN", "IA", "KS", "KY",
  "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "MP", "OH", "OK",
  "OR", "PA", "PR", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "VI", "WA", "WV", "WI", "WY",
]);
const EXCLUDED_SOURCE_FIELDS = new Set([
  "mailing_address", "mailing_city", "mailing_zip_code", "location_description",
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
  if (!Number.isInteger(unixSeconds) || unixSeconds <= 0) throw new Error("Los Angeles catalog rowsUpdatedAt must be a positive Unix timestamp.");
  return new Date(unixSeconds * 1000).toISOString();
}

function postalCode(value) {
  const raw = textValue(value);
  if (!raw) throw new Error("invalid-or-unmapped-us-zip");
  const exact = raw.match(/^(\d{5})(?:-(\d{4}))?$/);
  if (exact && exact[1] !== "00000") {
    return {
      source: raw,
      zip_code: exact[1],
      postal_code: exact[2] ? `${exact[1]}-${exact[2]}` : exact[1],
      zip4: exact[2] ?? null,
      status: exact[2] ? "normalized-zip-plus-4" : "normalized-zip5",
    };
  }
  const blankExtension = raw.match(/^(\d{5})-$/);
  if (blankExtension && blankExtension[1] !== "00000") {
    return {
      source: raw,
      zip_code: blankExtension[1],
      postal_code: blankExtension[1],
      zip4: null,
      status: "normalized-zip5-with-blank-extension",
    };
  }
  throw new Error("invalid-or-unmapped-us-zip");
}

function dateValue(value, label) {
  const raw = textValue(value);
  if (!raw) return null;
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})(?:T00:00:00(?:\.000)?)?$/);
  if (!match || Number.isNaN(Date.parse(`${match[1]}T00:00:00.000Z`))) throw new Error(`invalid-${label}`);
  return match[1];
}

function dbaNames(value) {
  return [...new Set(String(value ?? "").split("|").map((name) => name.trim()).filter(Boolean))];
}

function coordinate(value, councilDistrict) {
  if (!value) return null;
  const latitude = Number(value.latitude ?? value.coordinates?.[1]);
  const longitude = Number(value.longitude ?? value.coordinates?.[0]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new Error("invalid-source-coordinate");
  }
  const withinBroadLosAngelesBounds = longitude >= -118.75 && longitude <= -118.10 && latitude >= 33.65 && latitude <= 34.40;
  return {
    type: "Point",
    coordinates: [longitude, latitude],
    coordinate_scope: "source-geocoded-reported-business-location-not-independently-verified",
    plausibility: councilDistrict > 0 && !withinBroadLosAngelesBounds
      ? "in-city-council-district-coordinate-outside-broad-los-angeles-bounds"
      : "not-independently-validated",
  };
}

function geography(zipCode, baselineByZip) {
  const baseline = baselineByZip?.get(zipCode);
  const state = textValue(baseline?.postal_label?.preferred_state)?.toUpperCase() ?? null;
  return {
    zip_code: zipCode,
    inferred_postal_state: state && US_STATE_AND_TERRITORY_CODES.has(state) ? state : null,
    state_semantics: state ? "derived-from-census-zbp-postal-label-not-present-in-la-source" : "not-available-from-selected-source-or-baseline",
    zcta_match_status: baseline?.geography?.status ?? "no-2020-zcta-polygon",
    zcta_geo_id: baseline?.geography?.geo_id ?? null,
    zcta_geoid: baseline?.geography?.geoid ?? null,
    zcta_geometry_file: baseline?.geography?.geometry_file ?? null,
  };
}

function provenance(context, locationAccount) {
  return {
    source_id: "los-angeles-office-of-finance-active-businesses",
    source_release_id: context.sourceReleaseId,
    source_record_id: locationAccount,
    ingest_run_id: context.runId,
    transformation_version: LA_ACTIVE_BUSINESS_TRANSFORMATION_VERSION,
    policy_id: "la-active-businesses",
  };
}

export function schemaFingerprint(columns) {
  const byField = new Map((columns ?? []).map((column) => [column.fieldName, column.dataTypeName]));
  return sha256(LA_ACTIVE_BUSINESS_SCHEMA.map(([field]) => `${field}:${byField.get(field) ?? null}`).join("\u0000"));
}

function selectedRecord(row) {
  return Object.fromEntries(LA_ACTIVE_BUSINESS_SOURCE_FIELDS.filter((field) => row[field] !== undefined).map((field) => [field, row[field]]));
}

export function normalizeLaActiveBusinessLocation(source, context) {
  const locationAccount = textValue(source.location_account);
  const businessName = textValue(source.business_name);
  if (!/^\d{10}-\d{4}-\d$/.test(locationAccount ?? "") || !businessName) throw new Error("missing-or-invalid-los-angeles-location-identity");
  const street = textValue(source.street_address);
  const city = textValue(source.city);
  if (!street || !city) throw new Error("missing-business-location-address");
  const postal = postalCode(source.zip_code);
  const baseline = context.baselineByZip?.get(postal.zip_code);
  if (!baseline) throw new Error("invalid-or-unmapped-us-zip");
  const geo = geography(postal.zip_code, context.baselineByZip);
  const councilDistrict = Number(source.council_district);
  if (!Number.isInteger(councilDistrict) || councilDistrict < 0 || councilDistrict > 15) throw new Error("invalid-la-council-district");
  const startDate = dateValue(source.location_start_date, "location-start-date");
  const endDate = dateValue(source.location_end_date, "location-end-date");
  if (endDate) throw new Error("active-source-row-has-location-end-date");
  const candidateSuffix = locationAccount.replaceAll("-", "_");
  const naicsRaw = textValue(source.naics);
  return {
    schema_version: LA_ACTIVE_BUSINESS_SCHEMA_VERSION,
    normalized_record_id: `la-active-business:location-account:${locationAccount}`,
    entity_candidates: {
      physical_site_id: `site:la_finance_location_${candidateSuffix}`,
      establishment_id: `establishment:la_finance_location_${candidateSuffix}`,
      identity_status: "provisional",
    },
    external_identifiers: [{ type: "la_office_of_finance_location_account", value: locationAccount, source_field: "location_account" }],
    name: businessName,
    other_names: dbaNames(source.dba_name),
    address: {
      street,
      unit_or_additional: null,
      city,
      state: geo.inferred_postal_state,
      state_semantics: geo.state_semantics,
      postal_code_source: postal.source,
      zip_code: postal.zip_code,
      postal_code: postal.postal_code,
      zip4: postal.zip4,
      postal_code_status: postal.status,
      country: "US",
      source_scope: "reported-business-location-address",
      independently_verified: false,
    },
    location: coordinate(source.location_1, councilDistrict),
    geography: geo,
    industry_profile: {
      naics_code_source: naicsRaw,
      naics_code: /^\d{2,6}$/.test(naicsRaw ?? "") ? naicsRaw : null,
      primary_naics_description: textValue(source.primary_naics_description),
      classification_semantics: "self-reported-source-value-using-source-described-2007-naics-context",
    },
    registration_profile: {
      council_district: councilDistrict,
      council_district_semantics: councilDistrict === 0 ? "source-identifies-location-as-outside-city" : "source-current-council-district-assignment",
      first_registered_activity_start_date: startDate,
      location_end_date: endDate,
    },
    source_status: {
      value: "listed-in-la-office-of-finance-active-business-dataset-as-of-source-refresh",
      status: "Active (source-defined)",
      semantics: "owner-has-not-notified-office-of-finance-of-cease-of-business-operations-not-independent-proof-of-current-operations-or-public-access",
      source_rows_updated_at: context.sourceRowsUpdatedAt,
    },
    privacy: {
      classification: "possible-natural-person-name-or-residential-business-location",
      mailing_fields_excluded: true,
      record_level_distribution: "local-review-only",
    },
    observed_at: context.retrievedAt,
    provenance: provenance(context, locationAccount),
    export_policy: "local-review-only",
  };
}

function assertAllowedUrl(urlValue, type) {
  const url = new URL(urlValue);
  if (url.protocol !== "https:" || url.hostname !== "data.lacity.org") throw new Error(`Los Angeles ${type} URL is not allowed.`);
  const expected = type === "metadata" ? `/api/views/${LA_ACTIVE_BUSINESS_DATASET_ID}` : `/resource/${LA_ACTIVE_BUSINESS_DATASET_ID}.json`;
  if (url.pathname !== expected) throw new Error(`Los Angeles ${type} path is not allowed.`);
  return url;
}

function retryDelay(response, attempt) {
  const retryAfter = Number(response?.headers?.get?.("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter >= 0) return Math.min(retryAfter * 1000, 30_000);
  return Math.min(500 * (2 ** attempt), 8_000);
}

export async function requestLaJson(urlValue, {
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
    if (response.status >= 300 && response.status < 400) throw new Error(`Los Angeles ${type} redirect rejected (${response.status}).`);
    if (!response.ok) {
      if ((response.status === 429 || response.status >= 500) && attempt + 1 < attempts) {
        await sleep(retryDelay(response, attempt));
        continue;
      }
      throw new Error(`Los Angeles ${type} request failed with HTTP ${response.status}.`);
    }
    const declaredBytes = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredBytes) && declaredBytes > maximumResponseBytes) throw new Error(`Los Angeles ${type} response exceeds the byte limit.`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maximumResponseBytes) throw new Error(`Los Angeles ${type} response exceeds the byte limit.`);
    try {
      return JSON.parse(buffer.toString("utf8"));
    } catch {
      throw new Error(`Los Angeles ${type} response was not valid JSON.`);
    }
  }
  throw new Error(`Los Angeles ${type} request exhausted retries.`);
}

function validateCatalogMetadata(metadata, expectedFingerprint = LA_ACTIVE_BUSINESS_SCHEMA_FINGERPRINT) {
  if (metadata?.id !== LA_ACTIVE_BUSINESS_DATASET_ID || metadata?.name !== "Listing of Active Businesses") throw new Error("Unexpected Los Angeles active-business catalog identity.");
  if (metadata?.attribution !== "Office of Finance" || metadata?.licenseId !== "CC0_10") throw new Error("Unexpected Los Angeles active-business attribution or license.");
  const fingerprint = schemaFingerprint(metadata.columns);
  if (fingerprint !== expectedFingerprint) throw new Error(`Los Angeles selected schema changed (${fingerprint}).`);
  return { fingerprint, rowsUpdatedAt: sourceTimestamp(metadata.rowsUpdatedAt) };
}

function soqlUrl(parameters) {
  const url = new URL(LA_ACTIVE_BUSINESS_API_URL);
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, String(value));
  return url.toString();
}

async function sourceCount(options) {
  const rows = await requestLaJson(soqlUrl({ "$select": "count(*)" }), { ...options, type: "data" });
  const count = Number(rows?.[0]?.count);
  if (!Number.isInteger(count) || count < 0) throw new Error("Los Angeles source count query returned an invalid count.");
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

function abortGzipWriters(writers) {
  for (const writer of writers) {
    if (!writer) continue;
    writer.gzip.destroy();
    writer.output.destroy();
  }
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
  const extra = Object.keys(record).filter((field) => !LA_ACTIVE_BUSINESS_SOURCE_FIELDS.includes(field));
  if (extra.length) throw new Error(`Unapproved Los Angeles source field ${extra[0]}.`);
  return selectedRecord(record);
}

async function acquireSource({ writer, sourceRecords, expectedCount, fetchImpl, signal, sleep, pageSize, logger }) {
  let count = 0;
  if (sourceRecords) {
    for (const row of sourceRecords) {
      if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
      await writeGzipRecord(writer, sourceSafeRecord(row));
      count += 1;
    }
  } else {
    for (let offset = 0; offset < expectedCount; offset += pageSize) {
      if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
      const select = `:id as socrata_row_id,${LA_ACTIVE_BUSINESS_FIELDS.join(",")}`;
      const rows = await requestLaJson(soqlUrl({ "$select": select, "$order": "location_account,:id", "$limit": pageSize, "$offset": offset }), {
        fetchImpl, signal, sleep, type: "data",
      });
      if (!Array.isArray(rows) || !rows.length) throw new Error(`Los Angeles source page at offset ${offset} was empty before the expected count.`);
      for (const row of rows) {
        await writeGzipRecord(writer, sourceSafeRecord(row));
        count += 1;
      }
      logger(`Acquired ${count.toLocaleString()} of ${expectedCount.toLocaleString()} Los Angeles active-business rows.`);
    }
  }
  if (count !== expectedCount) throw new Error(`Los Angeles source count mismatch: acquired ${count}, expected ${expectedCount}.`);
  return count;
}

function increment(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
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
      schema_version: LA_ACTIVE_BUSINESS_SCHEMA_VERSION,
      zip_code: zipCode,
      la_active_business_snapshot: {
        status: count ? "published-source-defined-active-location-accounts" : "no-location-account-in-current-source-snapshot",
        registered_business_location_count: count,
        source_release_id: context.sourceReleaseId,
        source_rows_updated_at: context.sourceRowsUpdatedAt,
        active_semantics: "owner-has-not-notified-office-of-finance-of-cease-not-independent-proof-of-current-operations",
      },
      current_usps_validity: baseline?.current_usps_validity ?? { status: "unverified", reason: "ZIP appears in the Los Angeles source but is outside the current ZBP/ZCTA union." },
      postal_label: baseline?.postal_label ?? null,
      geography: baseline?.geography ?? { status: "no-2020-zcta-polygon", geo_id: null, geoid: null, geometry_file: null },
      employer_baseline: baseline?.employer_baseline ?? null,
      baseline_coverage_status: baseline?.coverage_status ?? "outside-zbp-zcta-union",
    };
  });
}

export async function buildLaActiveBusinesses({
  outputRoot,
  zbpPointer,
  catalogMetadata = null,
  sourceRecords = null,
  minimumLocationAccounts = 600_000,
  maximumQuarantineRate = 0.01,
  pageSize = 50_000,
  expectedSchemaFingerprint = LA_ACTIVE_BUSINESS_SCHEMA_FINGERPRINT,
  fetchImpl = fetch,
  signal,
  sleep,
  logger = console.log,
  now = () => new Date(),
} = {}) {
  if (!outputRoot || !zbpPointer) throw new Error("outputRoot and zbpPointer are required.");
  if (!Number.isInteger(minimumLocationAccounts) || minimumLocationAccounts < 1) throw new Error("minimumLocationAccounts must be a positive integer.");
  if (!Number.isFinite(maximumQuarantineRate) || maximumQuarantineRate < 0 || maximumQuarantineRate > 1) throw new Error("maximumQuarantineRate must be from 0 through 1.");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50_000) throw new Error("pageSize must be from 1 through 50000.");
  if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
  const retrievedAt = now().toISOString();
  const runId = randomUUID();
  const stagingDirectory = path.join(outputRoot, ".staging", runId);
  await mkdir(stagingDirectory, { recursive: true });
  const baseline = await loadZbpBaseline(zbpPointer);
  const metadata = catalogMetadata ?? await requestLaJson(LA_ACTIVE_BUSINESS_METADATA_URL, { fetchImpl, signal, sleep, type: "metadata" });
  const catalog = validateCatalogMetadata(metadata, expectedSchemaFingerprint);
  const expectedCount = sourceRecords ? Number(metadata.sourceRecordCount) : await sourceCount({ fetchImpl, signal, sleep });
  if (!Number.isInteger(expectedCount) || expectedCount < minimumLocationAccounts) throw new Error(`Los Angeles source count ${expectedCount} is below the minimum ${minimumLocationAccounts}.`);
  const sourceWriter = await openGzipWriter(stagingDirectory, "source/selected-records.jsonl.gz");
  try {
    await acquireSource({ writer: sourceWriter, sourceRecords, expectedCount, fetchImpl, signal, sleep, pageSize, logger });
  } catch (error) {
    abortGzipWriters([sourceWriter]);
    throw error;
  }
  const sourceArtifact = await closeGzipWriter(sourceWriter, "la-active-business-source-jsonl-gzip", { export_policy: "internal" });
  const sourceReleaseId = `la-active-businesses-${catalog.rowsUpdatedAt.slice(0, 10)}-${sourceArtifact.sha256.slice(0, 16)}`;
  const releaseId = `la-active-businesses-${releaseTimestamp(retrievedAt)}-${runId.slice(0, 8)}`;
  const context = { runId, retrievedAt, sourceRowsUpdatedAt: catalog.rowsUpdatedAt, sourceReleaseId, baselineByZip: baseline.byZip };
  const normalizedWriters = new Map();
  for (const prefix of "0123456789abcdef") normalizedWriters.set(prefix, await openGzipWriter(stagingDirectory, `normalized/locations/prefix=${prefix}.jsonl.gz`));
  const quarantineWriter = await openGzipWriter(stagingDirectory, "quality/quarantine.jsonl.gz");
  const zipCounts = new Map();
  const quarantineReasons = new Map();
  const locationAccounts = new Set();
  let normalizedCount = 0;
  let sourceGeocodedCount = 0;
  let inCityCouncilDistrictCount = 0;
  let outOfCityCount = 0;
  let suspectCoordinateCount = 0;
  try {
    for await (const source of gzipRecords(path.join(stagingDirectory, sourceArtifact.path))) {
      if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
      const account = textValue(source.location_account);
      if (!account || locationAccounts.has(account)) throw new Error(`Duplicate Los Angeles location account ${account ?? "<blank>"}.`);
      locationAccounts.add(account);
      try {
        const normalized = normalizeLaActiveBusinessLocation(source, context);
        const prefix = sha256(account)[0];
        await writeGzipRecord(normalizedWriters.get(prefix), normalized);
        normalizedCount += 1;
        increment(zipCounts, normalized.address.zip_code);
        if (normalized.location) sourceGeocodedCount += 1;
        if (normalized.location?.plausibility === "in-city-council-district-coordinate-outside-broad-los-angeles-bounds") suspectCoordinateCount += 1;
        if (normalized.registration_profile.council_district > 0) inCityCouncilDistrictCount += 1;
        else outOfCityCount += 1;
      } catch (error) {
        const reason = error.message;
        if (!["invalid-or-unmapped-us-zip", "missing-business-location-address"].includes(reason)) throw error;
        increment(quarantineReasons, reason);
        await writeGzipRecord(quarantineWriter, {
          schema_version: LA_ACTIVE_BUSINESS_SCHEMA_VERSION,
          source_record_id: account,
          reason,
          source_release_id: sourceReleaseId,
          export_policy: "internal",
        });
      }
    }
  } catch (error) {
    abortGzipWriters([...normalizedWriters.values(), quarantineWriter]);
    throw error;
  }
  const quarantineRate = expectedCount ? quarantineWriter.records / expectedCount : 0;
  if (quarantineRate > maximumQuarantineRate) {
    abortGzipWriters([...normalizedWriters.values(), quarantineWriter]);
    throw new Error(`Los Angeles quarantine rate ${quarantineRate} exceeds the maximum ${maximumQuarantineRate}.`);
  }
  if (normalizedCount < minimumLocationAccounts - Math.floor(expectedCount * maximumQuarantineRate)) {
    abortGzipWriters([...normalizedWriters.values(), quarantineWriter]);
    throw new Error("Los Angeles normalized location count is below the governed minimum after quarantine.");
  }
  const normalizedArtifacts = [];
  for (const writer of normalizedWriters.values()) normalizedArtifacts.push(await closeGzipWriter(writer, "normalized-la-active-business-location-jsonl-gzip", { export_policy: "local-review-only" }));
  const quarantineArtifact = await closeGzipWriter(quarantineWriter, "la-active-business-quarantine-jsonl-gzip", { export_policy: "internal" });
  if (!sourceRecords) {
    const finalMetadata = await requestLaJson(LA_ACTIVE_BUSINESS_METADATA_URL, { fetchImpl, signal, sleep, type: "metadata" });
    const finalCatalog = validateCatalogMetadata(finalMetadata, expectedSchemaFingerprint);
    const finalCount = await sourceCount({ fetchImpl, signal, sleep });
    if (finalCatalog.rowsUpdatedAt !== catalog.rowsUpdatedAt || finalCount !== expectedCount) throw new Error("Los Angeles source changed during acquisition; staging was not published.");
  }
  const zipRows = buildZipCoverage(baseline.rows, zipCounts, context);
  const zipArtifact = await writeArtifact(stagingDirectory, "derived/zip-coverage.jsonl", jsonLines(zipRows), {
    record_count: zipRows.length,
    artifact_type: "la-active-business-zip-coverage-jsonl",
    distribution_policy: "public-aggregate-with-source-limitations",
  });
  const sourceSummary = {
    dataset_id: "la-active-business-location-accounts",
    source_release_id: sourceReleaseId,
    source_rows_updated_at: catalog.rowsUpdatedAt,
    retrieved_at: retrievedAt,
    source_location_accounts: expectedCount,
    normalized_us_location_accounts: normalizedCount,
    quarantined_source_records: quarantineWriter.records,
    quarantine_rate: quarantineRate,
    quarantine_reasons: sortedCounts(quarantineReasons),
    source_geocoded_locations: sourceGeocodedCount,
    in_city_council_district_locations: inCityCouncilDistrictCount,
    out_of_city_locations: outOfCityCount,
    suspect_in_city_coordinates: suspectCoordinateCount,
    source_zip_codes: zipCounts.size,
    selected_fields: LA_ACTIVE_BUSINESS_FIELDS,
    excluded_field_groups: ["mailing address", "redundant location description", "portal-computed regions"],
    record_level_distribution: "local-review-only",
  };
  const summaryArtifact = await writeArtifact(stagingDirectory, "quality/source-summary.json", json(sourceSummary), { artifact_type: "la-active-business-source-summary" });
  const sourceMetadataArtifact = await writeArtifact(stagingDirectory, "source/catalog-metadata.json", json(metadata), { artifact_type: "la-active-business-source-release-metadata", export_policy: "internal" });
  const artifacts = [sourceArtifact, sourceMetadataArtifact, ...normalizedArtifacts, quarantineArtifact, zipArtifact, summaryArtifact];
  const manifest = {
    schema_version: LA_ACTIVE_BUSINESS_SCHEMA_VERSION,
    dataset_id: "la-active-business-location-accounts",
    release_id: releaseId,
    source_release_id: sourceReleaseId,
    status: "complete",
    complete_source_snapshot: true,
    created_at: retrievedAt,
    source: {
      publisher: "City of Los Angeles Office of Finance",
      dataset_id: LA_ACTIVE_BUSINESS_DATASET_ID,
      page_url: LA_ACTIVE_BUSINESS_PAGE_URL,
      api_url: LA_ACTIVE_BUSINESS_API_URL,
      rows_updated_at: catalog.rowsUpdatedAt,
      schema_fingerprint: catalog.fingerprint,
      license: "CC0-1.0",
      license_url: LA_ACTIVE_BUSINESS_LICENSE_URL,
      active_definition: "registered business whose owner has not notified the Office of Finance of a cease of business operations",
    },
    coverage: {
      source_location_accounts: expectedCount,
      normalized_us_location_accounts: normalizedCount,
      quarantined_source_records: quarantineWriter.records,
      quarantine_rate: quarantineRate,
      source_geocoded_locations: sourceGeocodedCount,
      in_city_council_district_locations: inCityCouncilDistrictCount,
      out_of_city_locations: outOfCityCount,
      suspect_in_city_coordinates: suspectCoordinateCount,
      source_zip_codes: zipCounts.size,
      zip_union_records: zipRows.length,
      physical_sites: normalizedCount,
      establishments: normalizedCount,
      organizations: null,
      complete_all_businesses: false,
    },
    dependencies: [
      { dataset_id: baseline.manifest.dataset_id, release_id: baseline.manifest.release_id, manifest_sha256: baseline.manifestSha256 },
      ...(baseline.manifest.geography_dependency ? [baseline.manifest.geography_dependency] : []),
    ],
    policy: {
      policy_id: "la-active-businesses",
      record_level_distribution: "local-review-only",
      aggregate_distribution: "public-with-provenance-and-semantic-limitations",
      privacy_reason: "business names can identify natural persons and reported business locations can be residences",
    },
    limitations: [
      "Active means the owner has not notified the Office of Finance of cessation; it is not independent proof of current operations, solvency, public access, or licensure for every activity.",
      "Location addresses and coordinates are source-reported or portal-geocoded and are not independently verified.",
      "Council district zero denotes an out-of-city location in the source; this municipal register is not complete for Los Angeles, California, or the United States.",
      "Mailing fields, redundant location descriptions, and portal-computed region identifiers are excluded at acquisition.",
      "Record-level output remains local-review-only because business names and locations may identify natural persons or residences.",
      "No owner, parent-company, or cross-source identity relationship is inferred.",
    ],
    artifacts,
  };
  await writeFile(path.join(stagingDirectory, "manifest.json"), json(manifest));
  await verifyLaActiveBusinesses(path.join(stagingDirectory, "manifest.json"));
  return publishLaActiveBusinessesStaging({ outputRoot, stagingRunId: runId, expectedReleaseId: releaseId });
}

export async function publishLaActiveBusinessesStaging({ outputRoot, stagingRunId, expectedReleaseId = null } = {}) {
  if (!outputRoot || !stagingRunId) throw new Error("outputRoot and stagingRunId are required.");
  const stagingDirectory = path.join(outputRoot, ".staging", stagingRunId);
  const manifestPath = path.join(stagingDirectory, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (expectedReleaseId && manifest.release_id !== expectedReleaseId) throw new Error("Los Angeles staging release ID mismatch.");
  await verifyLaActiveBusinesses(manifestPath);
  const releasesDirectory = path.join(outputRoot, "releases");
  const releaseDirectory = path.join(releasesDirectory, manifest.release_id);
  await mkdir(releasesDirectory, { recursive: true });
  try {
    await stat(releaseDirectory);
    throw new Error(`Los Angeles release ${manifest.release_id} already exists.`);
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

export async function verifyLaActiveBusinesses(manifestPath) {
  const absoluteManifestPath = path.resolve(manifestPath);
  const releaseDirectory = path.dirname(absoluteManifestPath);
  const manifest = JSON.parse(await readFile(absoluteManifestPath, "utf8"));
  const failures = [];
  if (manifest.dataset_id !== "la-active-business-location-accounts" || manifest.schema_version !== LA_ACTIVE_BUSINESS_SCHEMA_VERSION || manifest.status !== "complete" || manifest.complete_source_snapshot !== true) {
    failures.push({ path: "manifest.json", reason: "invalid dataset identity, schema, status, or completeness" });
  }
  if (manifest.source?.dataset_id !== LA_ACTIVE_BUSINESS_DATASET_ID || manifest.source?.schema_fingerprint !== LA_ACTIVE_BUSINESS_SCHEMA_FINGERPRINT || manifest.source?.license !== "CC0-1.0") {
    failures.push({ path: "manifest.json", reason: "source identity, schema, or license mismatch" });
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
  const sourceArtifact = artifacts.find((artifact) => artifact.artifact_type === "la-active-business-source-jsonl-gzip");
  let sourceCount = 0;
  try {
    if (!sourceArtifact || sourceArtifact.export_policy !== "internal") throw new Error("missing or misclassified selected source artifact");
    for await (const record of gzipRecords(path.join(releaseDirectory, sourceArtifact.path))) {
      sourceCount += 1;
      if (containsExcludedField(record)) throw new Error("excluded source field leaked");
      if (Object.keys(record).some((field) => !LA_ACTIVE_BUSINESS_SOURCE_FIELDS.includes(field))) throw new Error("unapproved selected source field");
    }
    if (sourceCount !== sourceArtifact.record_count || sourceCount !== manifest.coverage.source_location_accounts) throw new Error("source record count mismatch");
  } catch (error) {
    failures.push({ path: sourceArtifact?.path ?? "source/selected-records.jsonl.gz", reason: error.message });
  }
  const normalizedArtifacts = artifacts.filter((artifact) => artifact.artifact_type === "normalized-la-active-business-location-jsonl-gzip");
  let normalizedCount = 0;
  let coordinateCount = 0;
  const normalizedIds = new Set();
  const zipCounts = new Map();
  for (const artifact of normalizedArtifacts) {
    try {
      if (artifact.export_policy !== "local-review-only") throw new Error("normalized artifact lost local-review-only policy");
      let artifactCount = 0;
      for await (const record of gzipRecords(path.join(releaseDirectory, artifact.path))) {
        artifactCount += 1;
        normalizedCount += 1;
        if (normalizedIds.has(record.normalized_record_id)) throw new Error(`duplicate normalized record ${record.normalized_record_id}`);
        normalizedIds.add(record.normalized_record_id);
        if (!/^la-active-business:location-account:\d{10}-\d{4}-\d$/.test(record.normalized_record_id)
          || !/^site:la_finance_location_\d{10}_\d{4}_\d$/.test(record.entity_candidates?.physical_site_id ?? "")
          || !/^establishment:la_finance_location_\d{10}_\d{4}_\d$/.test(record.entity_candidates?.establishment_id ?? "")) throw new Error("invalid normalized identity");
        if (!/^\d{5}$/.test(record.address?.zip_code ?? "") || !record.address?.street || !record.address?.city || record.address?.country !== "US") throw new Error("invalid normalized address");
        if (record.source_status?.value !== "listed-in-la-office-of-finance-active-business-dataset-as-of-source-refresh" || record.export_policy !== "local-review-only") throw new Error("invalid source status or export policy");
        if (record.provenance?.policy_id !== "la-active-businesses" || record.provenance?.source_release_id !== manifest.source_release_id) throw new Error("invalid provenance");
        if (record.privacy?.mailing_fields_excluded !== true || containsExcludedField(record)) throw new Error("privacy-minimized field contract failed");
        if (record.location) coordinateCount += 1;
        increment(zipCounts, record.address.zip_code);
      }
      if (artifactCount !== artifact.record_count) throw new Error("normalized artifact record count mismatch");
    } catch (error) {
      failures.push({ path: artifact.path, reason: error.message });
    }
  }
  if (normalizedCount !== manifest.coverage?.normalized_us_location_accounts || normalizedCount !== manifest.coverage?.physical_sites || normalizedCount !== manifest.coverage?.establishments) {
    failures.push({ path: "manifest.json", reason: "normalized entity counts do not reconcile" });
  }
  if (coordinateCount !== manifest.coverage?.source_geocoded_locations) failures.push({ path: "manifest.json", reason: "source coordinate count does not reconcile" });
  const quarantineArtifact = artifacts.find((artifact) => artifact.artifact_type === "la-active-business-quarantine-jsonl-gzip");
  let quarantineCount = 0;
  try {
    if (!quarantineArtifact || quarantineArtifact.export_policy !== "internal") throw new Error("missing or misclassified quarantine artifact");
    for await (const record of gzipRecords(path.join(releaseDirectory, quarantineArtifact.path))) {
      quarantineCount += 1;
      if (!["invalid-or-unmapped-us-zip", "missing-business-location-address"].includes(record.reason) || record.export_policy !== "internal") throw new Error("invalid quarantine record");
    }
    if (quarantineCount !== quarantineArtifact.record_count || quarantineCount !== manifest.coverage.quarantined_source_records) throw new Error("quarantine count mismatch");
  } catch (error) {
    failures.push({ path: quarantineArtifact?.path ?? "quality/quarantine.jsonl.gz", reason: error.message });
  }
  if (sourceCount !== normalizedCount + quarantineCount) failures.push({ path: "manifest.json", reason: "source, normalized, and quarantine counts do not reconcile" });
  const zipArtifact = artifacts.find((artifact) => artifact.artifact_type === "la-active-business-zip-coverage-jsonl");
  try {
    if (!zipArtifact || zipArtifact.distribution_policy !== "public-aggregate-with-source-limitations") throw new Error("missing or misclassified ZIP artifact");
    const rows = (await readFile(path.join(releaseDirectory, zipArtifact.path), "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse);
    if (rows.length !== zipArtifact.record_count || rows.length !== manifest.coverage.zip_union_records) throw new Error("ZIP row count mismatch");
    if (new Set(rows.map((row) => row.zip_code)).size !== rows.length) throw new Error("duplicate ZIP coverage row");
    const contributionCount = rows.reduce((sum, row) => sum + (row.la_active_business_snapshot?.registered_business_location_count ?? 0), 0);
    if (contributionCount !== normalizedCount) throw new Error("ZIP contribution counts do not reconcile");
    for (const [zipCode, count] of zipCounts) {
      const row = rows.find((candidate) => candidate.zip_code === zipCode);
      if (row?.la_active_business_snapshot?.registered_business_location_count !== count) throw new Error(`ZIP ${zipCode} contribution mismatch`);
    }
  } catch (error) {
    failures.push({ path: zipArtifact?.path ?? "derived/zip-coverage.jsonl", reason: error.message });
  }
  if (failures.length) {
    const error = new Error(`Los Angeles active-business verification failed for ${failures.length} check(s).`);
    error.failures = failures;
    throw error;
  }
  return { dataset_id: manifest.dataset_id, release_id: manifest.release_id, source_release_id: manifest.source_release_id, artifact_count: artifacts.length, coverage: manifest.coverage };
}
