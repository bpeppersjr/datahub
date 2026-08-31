import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { finished } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";

export const PA_BUSINESS_REGISTRY_SCHEMA_VERSION = "1.0.0";
export const PA_BUSINESS_REGISTRY_TRANSFORMATION_VERSION = "pa-business-registry@1.0.0";
export const PA_BUSINESS_REGISTRY_DATASET_ID = "3urc-uaba";
export const PA_BUSINESS_REGISTRY_METADATA_URL = `https://data.pa.gov/api/views/${PA_BUSINESS_REGISTRY_DATASET_ID}`;
export const PA_BUSINESS_REGISTRY_API_URL = `https://data.pa.gov/resource/${PA_BUSINESS_REGISTRY_DATASET_ID}.json`;
export const PA_BUSINESS_REGISTRY_STORY_URL = "https://data.pa.gov/stories/s/Story-Registered-Businesses-in-PA-Current-by-Count/y547-53sn/";
export const PA_OPEN_DATA_POLICY_URL = "https://data.pa.gov/data-policy";

export const PA_BUSINESS_REGISTRY_SCHEMA = Object.freeze([
  ["business_name", "text"],
  ["filing_number", "text"],
  ["address_line1", "text"],
  ["address_line2", "text"],
  ["city", "text"],
  ["state", "text"],
  ["zip", "text"],
  ["typeofbusinessregistration", "text"],
  ["shortcountyname", "text"],
  ["county_code", "number"],
  ["georeferenced_latitude__longitude", "point"],
]);
export const PA_BUSINESS_REGISTRY_FIELDS = Object.freeze(PA_BUSINESS_REGISTRY_SCHEMA.map(([field]) => field));
export const PA_BUSINESS_REGISTRY_SOURCE_FIELDS = Object.freeze(["socrata_row_id", ...PA_BUSINESS_REGISTRY_FIELDS]);
export const PA_BUSINESS_REGISTRY_SCHEMA_FINGERPRINT = "ab3aa8620e7c593a7b34dcc38dce83c88730a161989af2adbac6ca07f6b101a2";

const US_STATE_AND_TERRITORY_CODES = new Set([
  "AL", "AK", "AS", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "GU", "HI", "ID", "IL", "IN", "IA", "KS", "KY",
  "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "MP", "OH", "OK",
  "OR", "PA", "PR", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "VI", "WA", "WV", "WI", "WY",
]);
const EXCLUDED_SOURCE_FIELDS = new Set(["party_type", "last_name", "middle_name", "first_name", "governor", "officer", "principal", "agent"]);

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
  if (!Number.isInteger(unixSeconds) || unixSeconds <= 0) throw new Error("Pennsylvania catalog rowsUpdatedAt must be a positive Unix timestamp.");
  return new Date(unixSeconds * 1000).toISOString();
}

function postalCode(value) {
  const raw = textValue(value);
  if (!raw) return { raw: null, zip_code: null, postal_code: null, zip4: null, status: "missing" };
  const exact = raw.match(/^(\d{5})(?:[- ]?(\d{4}))?$/);
  if (exact && exact[1] !== "00000") {
    return {
      raw,
      zip_code: exact[1],
      postal_code: exact[2] ? `${exact[1]}-${exact[2]}` : exact[1],
      zip4: exact[2] ?? null,
      status: exact[2] ? "normalized-zip-plus-4" : "normalized-zip5",
    };
  }
  const malformedExtension = raw.match(/^(\d{5})[- ](\d{1,3})$/);
  if (malformedExtension && malformedExtension[1] !== "00000") {
    return {
      raw,
      zip_code: malformedExtension[1],
      postal_code: malformedExtension[1],
      zip4: null,
      status: "normalized-zip5-with-malformed-extension-excluded",
    };
  }
  return { raw, zip_code: null, postal_code: null, zip4: null, status: "invalid-or-non-us-format" };
}

function stateCode(value) {
  const raw = textValue(value);
  const normalized = raw?.toUpperCase() ?? null;
  return normalized && US_STATE_AND_TERRITORY_CODES.has(normalized) ? normalized : null;
}

function point(value, addressStateCode) {
  if (!value || value.type !== "Point" || !Array.isArray(value.coordinates) || value.coordinates.length < 2) return null;
  const longitude = Number(value.coordinates[0]);
  const latitude = Number(value.coordinates[1]);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) return null;
  const withinPennsylvaniaBounds = longitude >= -80.6 && longitude <= -74.4 && latitude >= 39.6 && latitude <= 42.6;
  return {
    type: "Point",
    coordinates: [longitude, latitude],
    coordinate_scope: "source-geocoded-reported-business-address-not-verified-physical-operating-site",
    plausibility: addressStateCode === "PA" && !withinPennsylvaniaBounds
      ? "reported-pa-address-coordinate-outside-broad-pa-bounds"
      : "not-independently-validated",
  };
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

function provenance(context, filingNumber) {
  return {
    source_id: "pennsylvania-department-of-state-active-business-registrations",
    source_release_id: context.sourceReleaseId,
    source_record_id: filingNumber,
    ingest_run_id: context.runId,
    transformation_version: PA_BUSINESS_REGISTRY_TRANSFORMATION_VERSION,
    policy_id: "pa-business-registry",
  };
}

export function schemaFingerprint(columns) {
  const byField = new Map((columns ?? []).map((column) => [column.fieldName, column.dataTypeName]));
  const actual = PA_BUSINESS_REGISTRY_SCHEMA.map(([field]) => [field, byField.get(field) ?? null]);
  return sha256(actual.map(([field, type]) => `${field}:${type}`).join("\u0000"));
}

function selectedRecord(row) {
  return Object.fromEntries(PA_BUSINESS_REGISTRY_SOURCE_FIELDS.filter((field) => row[field] !== undefined).map((field) => [field, row[field]]));
}

export function normalizePaBusinessOrganization(source, context) {
  const filingNumber = textValue(source.filing_number);
  const legalName = textValue(source.business_name);
  if (!filingNumber || !/^\d{10}$/.test(filingNumber) || !legalName) throw new Error("missing-or-invalid-pennsylvania-business-identity");
  const postal = postalCode(source.zip);
  const state = stateCode(source.state);
  const street = textValue(source.address_line1);
  const city = textValue(source.city);
  const eligible = Boolean(street && city && state && postal.zip_code);
  const coordinate = point(source.georeferenced_latitude__longitude, state);
  return {
    schema_version: PA_BUSINESS_REGISTRY_SCHEMA_VERSION,
    normalized_record_id: `pa-business-registry:organization:${filingNumber}`,
    entity_candidates: { organization_id: `organization:pa_dos_filing_${filingNumber}`, identity_status: "provisional" },
    external_identifiers: [{ type: "pa_department_of_state_filing_number", value: filingNumber, source_field: "filing_number" }],
    legal_name: legalName,
    other_names: [],
    reported_business_address: {
      street,
      unit_or_additional: textValue(source.address_line2),
      city,
      state_source: textValue(source.state),
      state_code: state,
      postal_code_source: postal.raw,
      zip_code: postal.zip_code,
      postal_code: postal.postal_code,
      zip4: postal.zip4,
      postal_code_status: postal.status,
      country_source: null,
      country_scope: "not-reported-by-source",
      address_scope: "department-of-state-reported-business-address-not-verified-physical-operating-site",
      eligible_for_us_zip_coverage: eligible,
    },
    reported_address_coordinate: coordinate,
    geography: geography(eligible ? postal.zip_code : null, context.baselineByZip),
    registration_profile: {
      registration_type: textValue(source.typeofbusinessregistration),
      reported_pennsylvania_county_name: textValue(source.shortcountyname),
      reported_pennsylvania_county_code_source: textValue(source.county_code),
      county_code_semantics: "source-alphabetical-01-through-67-code-not-county-fips",
    },
    source_status: {
      value: "listed-in-pennsylvania-active-business-registration-dataset-as-of-source-refresh",
      status: "Active (dataset inclusion)",
      source_rows_updated_at: context.sourceRowsUpdatedAt,
      semantics: "active-registration-in-department-of-state-dataset-not-independent-proof-of-current-operations-or-good-standing",
      statutory_overcount_warning: "source-publisher-reports-statutory-limitations-removing-businesses-no-longer-in-operation",
    },
    observed_at: context.retrievedAt,
    provenance: provenance(context, filingNumber),
    export_policy: "public",
  };
}

function assertAllowedUrl(urlValue, type) {
  const url = new URL(urlValue);
  if (url.protocol !== "https:" || url.hostname !== "data.pa.gov") throw new Error(`Pennsylvania ${type} URL is outside the allowlist.`);
  const expectedPath = type === "metadata" ? `/api/views/${PA_BUSINESS_REGISTRY_DATASET_ID}` : `/resource/${PA_BUSINESS_REGISTRY_DATASET_ID}.json`;
  if (url.pathname !== expectedPath) throw new Error(`Pennsylvania ${type} URL has an unexpected path.`);
  return url;
}

function retryDelay(response, attempt) {
  const retryAfter = Number(response?.headers?.get?.("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter >= 0) return Math.min(10_000, retryAfter * 1000);
  return Math.min(4_000, 250 * (2 ** attempt));
}

export async function requestPaJson(urlValue, {
  fetchImpl = globalThis.fetch,
  signal,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  maximumResponseBytes = 80_000_000,
  type = "data",
  attempts = 5,
} = {}) {
  const url = assertAllowedUrl(urlValue, type);
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    signal?.throwIfAborted?.();
    try {
      const response = await fetchImpl(url, {
        method: "GET",
        redirect: "manual",
        signal,
        headers: { accept: "application/json", "user-agent": "Co*Tive-Collector/0.1 governed-public-data-connector" },
      });
      if (response.status >= 300 && response.status < 400) throw new Error("Pennsylvania source redirect rejected.");
      if ((response.status === 429 || response.status >= 500) && attempt < attempts - 1) {
        await sleep(retryDelay(response, attempt));
        continue;
      }
      if (!response.ok) throw new Error(`Pennsylvania source request failed with HTTP ${response.status}.`);
      const declaredBytes = Number(response.headers?.get?.("content-length"));
      if (Number.isFinite(declaredBytes) && declaredBytes > maximumResponseBytes) throw new Error("Pennsylvania source response exceeds the configured byte limit.");
      const body = await response.text();
      if (Buffer.byteLength(body) > maximumResponseBytes) throw new Error("Pennsylvania source response exceeds the configured byte limit.");
      return JSON.parse(body);
    } catch (error) {
      lastError = error;
      if (error.name === "AbortError" || /redirect rejected|byte limit|HTTP 4\d\d/.test(error.message) || attempt === attempts - 1) throw error;
      await sleep(250 * (2 ** attempt));
    }
  }
  throw lastError;
}

function validateCatalogMetadata(metadata, expectedFingerprint = PA_BUSINESS_REGISTRY_SCHEMA_FINGERPRINT) {
  const expectedName = "Filtered View - Distinct Registered Businesses in PA Listing Current by County Department of State";
  if (metadata?.id !== PA_BUSINESS_REGISTRY_DATASET_ID || metadata?.name !== expectedName) throw new Error("Unexpected Pennsylvania active-business catalog metadata.");
  if (metadata?.license?.name !== "Public Domain U.S. Government") throw new Error("Pennsylvania catalog license changed.");
  if (metadata?.attribution !== "Department of State") throw new Error("Pennsylvania catalog attribution changed.");
  const fingerprint = schemaFingerprint(metadata.columns);
  if (fingerprint !== expectedFingerprint) throw new Error(`Pennsylvania selected schema changed (${fingerprint}).`);
  return { rowsUpdatedAt: metadata.rowsUpdatedAt, rowsUpdatedAtIso: sourceTimestamp(metadata.rowsUpdatedAt), schemaFingerprint: fingerprint };
}

function soqlUrl(parameters) {
  const url = new URL(PA_BUSINESS_REGISTRY_API_URL);
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
  return url.toString();
}

async function sourceCounts(options) {
  const rows = await requestPaJson(soqlUrl({ $select: "count(*) as records,count(distinct filing_number) as distinct_filings" }), options);
  const records = Number(rows?.[0]?.records);
  const distinctFilings = Number(rows?.[0]?.distinct_filings);
  if (!Number.isInteger(records) || !Number.isInteger(distinctFilings) || records < 0 || distinctFilings < 0 || distinctFilings > records) {
    throw new Error("Pennsylvania source count response is invalid.");
  }
  return { records, distinctFilings };
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
    writer.gzip.destroy();
    writer.output.destroy();
  }
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

function sourceSafeRecord(record) {
  for (const field of Object.keys(record)) if (!PA_BUSINESS_REGISTRY_SOURCE_FIELDS.includes(field)) throw new Error(`Unapproved Pennsylvania source field ${field}.`);
  return selectedRecord(record);
}

function compareText(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

async function acquireSource({ writer, sourceRecords, expectedCount, fetchImpl, signal, sleep, pageSize, logger }) {
  let count = 0;
  let previousFiling = null;
  let previousSocrataId = null;
  const consume = async (input) => {
    signal?.throwIfAborted?.();
    const record = sourceSafeRecord(input);
    const filing = textValue(record.filing_number);
    const rowId = textValue(record.socrata_row_id);
    if (!/^\d{10}$/.test(filing ?? "") || !rowId || !textValue(record.business_name)) throw new Error("Pennsylvania source acquisition received an invalid row.");
    if (previousFiling !== null && compareText(filing, previousFiling) < 0) throw new Error(`Pennsylvania source filing numbers are not nondecreasing at ${filing}.`);
    if (filing === previousFiling && rowId === previousSocrataId) throw new Error(`Duplicate Pennsylvania Socrata row ID ${rowId}.`);
    previousFiling = filing;
    previousSocrataId = rowId;
    await writeGzipRecord(writer, record);
    count += 1;
  };
  if (sourceRecords) {
    for (const record of sourceRecords) await consume(record);
  } else {
    for (let offset = 0; offset < expectedCount; offset += pageSize) {
      const rows = await requestPaJson(soqlUrl({
        $select: `:id as socrata_row_id,${PA_BUSINESS_REGISTRY_FIELDS.join(",")}`,
        $order: "filing_number ASC,:id ASC",
        $limit: String(pageSize),
        $offset: String(offset),
      }), { fetchImpl, signal, sleep, type: "data" });
      if (!Array.isArray(rows) || rows.length > pageSize) throw new Error("Pennsylvania source page is invalid or exceeds the page-size limit.");
      if (rows.length === 0) break;
      for (const record of rows) await consume(record);
      logger(`Acquired ${count.toLocaleString("en-US")} Pennsylvania active-registration rows.`);
      if (rows.length < pageSize) break;
    }
  }
  if (count !== expectedCount) throw new Error(`Pennsylvania source acquisition returned ${count} rows; preflight reported ${expectedCount}.`);
  return count;
}

function increment(map, key) {
  const normalized = key ?? "(blank)";
  map.set(normalized, (map.get(normalized) ?? 0) + 1);
}

function sortedCounts(map) {
  return Object.fromEntries([...map].sort(([left], [right]) => String(left).localeCompare(String(right))));
}

function rowScore(row) {
  return (row.georeferenced_latitude__longitude ? 100 : 0)
    + PA_BUSINESS_REGISTRY_FIELDS.reduce((score, field) => score + (textValue(row[field]) ? 1 : 0), 0);
}

function preferredDuplicateRow(rows) {
  return [...rows].sort((left, right) => rowScore(right) - rowScore(left)
    || compareText(textValue(left.socrata_row_id), textValue(right.socrata_row_id)))[0];
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
      pa_business_registry_active_snapshot: {
        status: count ? "published-active-registration-reported-business-addresses" : "no-eligible-reported-business-address-in-current-source-snapshot",
        organization_reported_business_address_count: count,
        source_release_id: context.sourceReleaseId,
        source_rows_updated_at: context.sourceRowsUpdatedAt,
        physical_site_count: null,
        physical_site_inference_permitted: false,
      },
    };
  });
}

export async function buildPaBusinessRegistry({
  outputRoot,
  zbpPointer,
  catalogMetadata = null,
  sourceRecords = null,
  minimumOrganizations = 2_000_000,
  pageSize = 50_000,
  schemaFingerprintExpected = PA_BUSINESS_REGISTRY_SCHEMA_FINGERPRINT,
  fetchImpl = globalThis.fetch,
  signal,
  sleep,
  logger = console.log,
  now = () => new Date(),
} = {}) {
  if (!outputRoot || !zbpPointer) throw new Error("outputRoot and zbpPointer are required.");
  if (!Number.isInteger(minimumOrganizations) || minimumOrganizations < 1) throw new Error("minimumOrganizations must be a positive integer.");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50_000) throw new Error("pageSize must be from 1 through 50000.");
  signal?.throwIfAborted?.();
  const retrievedAt = now().toISOString();
  const runId = randomUUID();
  const releaseId = `pa-business-registry-${releaseTimestamp(retrievedAt)}-${runId.slice(0, 8)}`;
  const stagingDirectory = path.join(outputRoot, ".staging", runId);
  await mkdir(stagingDirectory, { recursive: true });
  const baseline = await loadZbpBaseline(zbpPointer);
  const requestOptions = { fetchImpl, signal, sleep, type: "metadata" };
  const initialMetadata = catalogMetadata ?? await requestPaJson(PA_BUSINESS_REGISTRY_METADATA_URL, requestOptions);
  const catalog = validateCatalogMetadata(initialMetadata, schemaFingerprintExpected);
  const counts = sourceRecords
    ? {
        records: Number(initialMetadata.sourceRecordCount ?? sourceRecords.length),
        distinctFilings: Number(initialMetadata.distinctFilingCount ?? new Set(sourceRecords.map((row) => row.filing_number)).size),
      }
    : await sourceCounts({ fetchImpl, signal, sleep, type: "data" });
  if (!Number.isInteger(counts.records) || !Number.isInteger(counts.distinctFilings) || counts.distinctFilings < minimumOrganizations || counts.distinctFilings > counts.records) {
    throw new Error(`Pennsylvania distinct organization count ${counts.distinctFilings} is below the ${minimumOrganizations} quality floor or is inconsistent.`);
  }
  const rawWriter = await openGzipWriter(stagingDirectory, "source/active-business-registrations-distinct-view.jsonl.gz");
  let sourceArtifact;
  try {
    await acquireSource({ writer: rawWriter, sourceRecords, expectedCount: counts.records, fetchImpl, signal, sleep, pageSize, logger });
    sourceArtifact = await closeGzipWriter(rawWriter, "pa-business-registry-source-jsonl-gzip", { export_policy: "internal" });
  } catch (error) {
    abortGzipWriters([rawWriter]);
    throw error;
  }
  if (!sourceRecords) {
    const finalMetadata = await requestPaJson(PA_BUSINESS_REGISTRY_METADATA_URL, requestOptions);
    const finalCatalog = validateCatalogMetadata(finalMetadata, schemaFingerprintExpected);
    const finalCounts = await sourceCounts({ fetchImpl, signal, sleep, type: "data" });
    if (finalCatalog.rowsUpdatedAt !== catalog.rowsUpdatedAt || finalCounts.records !== counts.records || finalCounts.distinctFilings !== counts.distinctFilings) {
      throw new Error("Pennsylvania source changed during acquisition; the run is not publishable.");
    }
  }
  const sourceReleaseDigest = sha256(`${catalog.rowsUpdatedAtIso}\u0000${sourceArtifact.sha256}`);
  const sourceReleaseId = `pa-business-registry-${catalog.rowsUpdatedAtIso.slice(0, 10)}-${sourceReleaseDigest.slice(0, 16)}`;
  const context = { runId, retrievedAt, sourceRowsUpdatedAt: catalog.rowsUpdatedAtIso, sourceReleaseId, baselineByZip: baseline.byZip };
  const writers = new Map();
  for (const prefix of "0123456789abcdef") writers.set(prefix, await openGzipWriter(stagingDirectory, `derived/organizations/id-hash-prefix=${prefix}.jsonl.gz`));
  const filingIds = new Set();
  const countsByZip = new Map();
  const registrationTypes = new Map();
  const addressStates = new Map();
  const countyNames = new Map();
  const postalStatuses = new Map();
  let organizations = 0;
  let eligibleUsAddresses = 0;
  let geocodedAddresses = 0;
  let suspiciousPaGeocodes = 0;
  let duplicateGroups = 0;
  let duplicateRowsCollapsed = 0;
  let group = [];
  const emitGroup = async () => {
    if (!group.length) return;
    if (group.length > 1) {
      duplicateGroups += 1;
      duplicateRowsCollapsed += group.length - 1;
    }
    const source = preferredDuplicateRow(group);
    const normalized = normalizePaBusinessOrganization(source, context);
    const filing = normalized.external_identifiers[0].value;
    if (filingIds.has(filing)) throw new Error(`Duplicate Pennsylvania filing number ${filing}.`);
    filingIds.add(filing);
    await writeGzipRecord(writers.get(sha256(filing)[0]), normalized);
    increment(registrationTypes, normalized.registration_profile.registration_type);
    increment(addressStates, normalized.reported_business_address.state_code ?? normalized.reported_business_address.state_source);
    increment(countyNames, normalized.registration_profile.reported_pennsylvania_county_name);
    increment(postalStatuses, normalized.reported_business_address.postal_code_status);
    if (normalized.reported_address_coordinate) {
      geocodedAddresses += 1;
      if (normalized.reported_address_coordinate.plausibility === "reported-pa-address-coordinate-outside-broad-pa-bounds") suspiciousPaGeocodes += 1;
    }
    if (normalized.reported_business_address.eligible_for_us_zip_coverage) {
      const zipCode = normalized.reported_business_address.zip_code;
      countsByZip.set(zipCode, (countsByZip.get(zipCode) ?? 0) + 1);
      eligibleUsAddresses += 1;
    }
    organizations += 1;
    group = [];
  };
  try {
    for await (const source of gzipRecords(path.join(stagingDirectory, sourceArtifact.path))) {
      signal?.throwIfAborted?.();
      if (group.length && source.filing_number !== group[0].filing_number) await emitGroup();
      group.push(source);
    }
    await emitGroup();
  } catch (error) {
    abortGzipWriters([...writers.values()]);
    throw error;
  }
  if (organizations !== counts.distinctFilings || organizations + duplicateRowsCollapsed !== counts.records) {
    throw new Error("Pennsylvania normalized organization and deduplication counts do not reconcile to the source snapshot.");
  }
  const artifacts = [sourceArtifact, ...await Promise.all([...writers.values()].map((writer) => closeGzipWriter(writer, "normalized-pa-business-organization-jsonl-gzip")))];
  const coverageRows = buildZipCoverage(baseline.rows, countsByZip, context);
  artifacts.push(await writeArtifact(stagingDirectory, "derived/zip-coverage.jsonl", jsonLines(coverageRows), { artifact_type: "pa-business-registry-zip-coverage-jsonl", record_count: coverageRows.length }));
  artifacts.push(await writeArtifact(stagingDirectory, "derived/source-summary.json", json({
    source_active_registration_rows: counts.records,
    distinct_active_registration_organizations: organizations,
    duplicate_filing_number_groups: duplicateGroups,
    duplicate_rows_collapsed: duplicateRowsCollapsed,
    eligible_reported_us_business_addresses: eligibleUsAddresses,
    organizations_without_eligible_us_zip_address: organizations - eligibleUsAddresses,
    source_geocoded_reported_business_addresses: geocodedAddresses,
    reported_pa_address_geocodes_outside_broad_pa_bounds: suspiciousPaGeocodes,
    registration_types: sortedCounts(registrationTypes),
    reported_address_states: sortedCounts(addressStates),
    reported_pennsylvania_county_names: sortedCounts(countyNames),
    postal_code_statuses: sortedCounts(postalStatuses),
  }), { artifact_type: "pa-business-registry-source-summary" }));
  artifacts.push(await writeArtifact(stagingDirectory, "source/release-metadata.json", json({
    dataset_id: PA_BUSINESS_REGISTRY_DATASET_ID,
    dataset_name: initialMetadata.name,
    publisher: initialMetadata.attribution,
    license: initialMetadata.license,
    source_rows_updated_at: catalog.rowsUpdatedAtIso,
    source_rows_updated_at_unix: catalog.rowsUpdatedAt,
    selected_schema: PA_BUSINESS_REGISTRY_SCHEMA,
    selected_schema_fingerprint: catalog.schemaFingerprint,
    selected_fields: PA_BUSINESS_REGISTRY_SOURCE_FIELDS,
    explicitly_excluded_field_classes: ["governor and principal-officer roles", "officer first, middle, and last names", "registered agents and other people"],
    query: { filter: "dataset inclusion defines active registration", order: "filing_number ASC, :id ASC", pagination: "stable offset against refresh-pinned snapshot", page_size: pageSize },
    expected_source_record_count: counts.records,
    expected_distinct_filing_count: counts.distinctFilings,
    source_urls: { metadata: PA_BUSINESS_REGISTRY_METADATA_URL, api: PA_BUSINESS_REGISTRY_API_URL, documentation: PA_BUSINESS_REGISTRY_STORY_URL, open_data_policy: PA_OPEN_DATA_POLICY_URL },
  }), { artifact_type: "pa-business-registry-source-release-metadata" }));
  const manifest = {
    schema_version: PA_BUSINESS_REGISTRY_SCHEMA_VERSION,
    dataset_id: "pa-business-registry-active-registrations",
    connector: { id: "pa-business-registry", version: "1.0.0" },
    release_id: releaseId,
    run_id: runId,
    retrieved_at: retrievedAt,
    source_rows_updated_at: catalog.rowsUpdatedAtIso,
    source_release_id: sourceReleaseId,
    status: "published",
    complete_active_registration_snapshot: true,
    coverage: {
      source_active_registration_rows: counts.records,
      distinct_active_registration_organizations_published: organizations,
      duplicate_filing_number_groups: duplicateGroups,
      duplicate_rows_collapsed: duplicateRowsCollapsed,
      eligible_reported_us_business_addresses: eligibleUsAddresses,
      organizations_without_eligible_us_zip_address: organizations - eligibleUsAddresses,
      source_geocoded_reported_business_addresses: geocodedAddresses,
      reported_pa_address_geocodes_outside_broad_pa_bounds: suspiciousPaGeocodes,
      source_zip_codes: countsByZip.size,
      zip_union_records: coverageRows.length,
      physical_sites: null,
      establishments: null,
    },
    quality_gates: {
      minimum_organizations: minimumOrganizations,
      source_distinct_and_normalized_counts_match: organizations === counts.distinctFilings,
      source_rows_reconcile_after_deduplication: organizations + duplicateRowsCollapsed === counts.records,
      selected_schema_fingerprint: catalog.schemaFingerprint,
      duplicate_normalized_filing_numbers: 0,
      source_unchanged_during_acquisition: true,
    },
    dependencies: [
      { dataset_id: baseline.manifest.dataset_id, release_id: baseline.manifest.release_id, manifest_sha256: baseline.manifestSha256 },
      baseline.manifest.geography_dependency,
    ],
    source: {
      publisher: "Pennsylvania Department of State",
      catalog_dataset_id: PA_BUSINESS_REGISTRY_DATASET_ID,
      source_page: PA_BUSINESS_REGISTRY_STORY_URL,
      api_url: PA_BUSINESS_REGISTRY_API_URL,
      access_method: sourceRecords ? "explicit test fixture records" : "anonymous public Socrata API with selected-field ordered pagination",
      license: "Public Domain U.S. Government; Pennsylvania open-data policy says data are free and without restriction",
      api_key_used: false,
      policy_profile: "config/source-policies/pa-business-registry.json",
    },
    limitations: [
      "Active means inclusion in the Pennsylvania Department of State active-registration dataset at the source refresh; it is not independent proof of current operations, good standing, licensure, solvency, public access, or an open storefront.",
      "The publisher warns that statutory limitations on removing businesses no longer in operation make the dataset larger than the currently operating business population.",
      "The dataset includes registered entity types and is not a census of every business operating in Pennsylvania or the United States.",
      "Reported addresses can be administrative, home, virtual, mailing-like, incomplete, stale, outside Pennsylvania, or otherwise unsuitable as a physical-site assertion; no physical site or establishment is created from them.",
      "Source geocodes are portal-generated mapping aids and are not independently validated; even apparently implausible coordinates are retained with an explicit plausibility flag.",
      "Malformed ZIP extensions are excluded while an otherwise valid leading ZIP5 is retained and flagged; current USPS validity remains unverified until an authorized operational ZIP denominator is integrated.",
      "The source county code is an alphabetical Pennsylvania 01-through-67 code, not a county FIPS code.",
      "Governor/principal-officer roles and officer names from the underlying repeated-row dataset are excluded at query time.",
      "One source filing number can have multiple distinct-view rows; records are deterministically collapsed by preferring a source geocode and then field completeness, with counts reported in the manifest.",
    ],
    artifacts,
  };
  await writeArtifact(stagingDirectory, "manifest.json", json(manifest));
  const publication = await publishPaBusinessRegistryStaging({ outputRoot, stagingRunId: runId, expectedReleaseId: releaseId });
  logger(`Published ${organizations.toLocaleString("en-US")} Pennsylvania active registered organizations.`);
  return { manifest, releaseDirectory: publication.releaseDirectory, pointerPath: publication.pointerPath };
}

function containsExcludedField(value) {
  if (Array.isArray(value)) return value.some(containsExcludedField);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) => EXCLUDED_SOURCE_FIELDS.has(key.toLowerCase()) || containsExcludedField(child));
}

export async function publishPaBusinessRegistryStaging({ outputRoot, stagingRunId, expectedReleaseId = null } = {}) {
  if (!outputRoot || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stagingRunId ?? "")) {
    throw new Error("outputRoot and a valid stagingRunId are required.");
  }
  const stagingRoot = path.join(outputRoot, ".staging");
  const stagingDirectory = path.resolve(stagingRoot, stagingRunId);
  assertContained(stagingRoot, stagingDirectory, "Pennsylvania staging run");
  const manifestPath = path.join(stagingDirectory, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.run_id !== stagingRunId || manifest.dataset_id !== "pa-business-registry-active-registrations" || manifest.status !== "published") {
    throw new Error("Pennsylvania staging manifest does not match the requested complete run.");
  }
  if (expectedReleaseId && manifest.release_id !== expectedReleaseId) throw new Error("Pennsylvania staging release ID does not match the build result.");
  await verifyPaBusinessRegistry(manifestPath);
  const releasesDirectory = path.join(outputRoot, "releases");
  await mkdir(releasesDirectory, { recursive: true });
  const releaseDirectory = path.join(releasesDirectory, manifest.release_id);
  try {
    await stat(releaseDirectory);
    throw new Error(`Pennsylvania release destination already exists: ${manifest.release_id}.`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
  await renameWithRetry(stagingDirectory, releaseDirectory);
  const pointerPath = path.join(outputRoot, "current.json");
  const temporaryPointer = `${pointerPath}.tmp-${randomUUID()}`;
  await writeFile(temporaryPointer, json({
    dataset_id: manifest.dataset_id,
    release_id: manifest.release_id,
    manifest: `releases/${manifest.release_id}/manifest.json`,
    updated_at: manifest.retrieved_at,
  }), { flag: "wx" });
  await renameWithRetry(temporaryPointer, pointerPath);
  if (!(await stat(releaseDirectory)).isDirectory()) throw new Error("Published Pennsylvania Business Registry release is not a directory.");
  return { manifest, releaseDirectory, pointerPath };
}

export async function verifyPaBusinessRegistry(manifestPath) {
  const absoluteManifestPath = path.resolve(manifestPath);
  const releaseDirectory = path.dirname(absoluteManifestPath);
  const manifest = JSON.parse(await readFile(absoluteManifestPath, "utf8"));
  const failures = [];
  if (manifest.dataset_id !== "pa-business-registry-active-registrations" || manifest.status !== "published" || !manifest.complete_active_registration_snapshot) failures.push({ path: "manifest.json", reason: "unexpected or incomplete manifest" });
  for (const artifact of manifest.artifacts ?? []) {
    try {
      const filename = path.resolve(releaseDirectory, artifact.path);
      assertContained(releaseDirectory, filename, `Artifact ${artifact.path}`);
      const actual = await hashFile(filename);
      if (actual.bytes !== artifact.bytes || actual.sha256 !== artifact.sha256) failures.push({ path: artifact.path, reason: "size or SHA-256 mismatch" });
    } catch (error) {
      failures.push({ path: artifact.path, reason: error.code === "ENOENT" ? "missing" : error.message });
    }
  }
  const sourceArtifacts = manifest.artifacts?.filter((artifact) => artifact.artifact_type === "pa-business-registry-source-jsonl-gzip") ?? [];
  const normalizedArtifacts = manifest.artifacts?.filter((artifact) => artifact.artifact_type === "normalized-pa-business-organization-jsonl-gzip") ?? [];
  if (sourceArtifacts.length !== 1 || sourceArtifacts[0]?.export_policy !== "internal") failures.push({ path: "manifest.json", reason: "expected one internal selected-field source artifact" });
  if (normalizedArtifacts.length !== 16) failures.push({ path: "manifest.json", reason: "expected 16 normalized organization partitions" });
  if (sourceArtifacts.length === 1) {
    const digest = sha256(`${manifest.source_rows_updated_at}\u0000${sourceArtifacts[0].sha256}`);
    if (manifest.source_release_id !== `pa-business-registry-${manifest.source_rows_updated_at.slice(0, 10)}-${digest.slice(0, 16)}`) failures.push({ path: "manifest.json", reason: "source release ID is not bound to refresh timestamp and selected source checksum" });
    try {
      let sourceCount = 0;
      let distinctFilings = 0;
      let previousFiling = null;
      let previousRowId = null;
      for await (const record of gzipRecords(path.join(releaseDirectory, sourceArtifacts[0].path))) {
        for (const field of Object.keys(record)) if (!PA_BUSINESS_REGISTRY_SOURCE_FIELDS.includes(field)) throw new Error(`unapproved source field ${field}`);
        const filing = textValue(record.filing_number);
        const rowId = textValue(record.socrata_row_id);
        if (!/^\d{10}$/.test(filing ?? "") || !rowId || !textValue(record.business_name) || (previousFiling && compareText(filing, previousFiling) < 0)) throw new Error(`invalid source identity or ordering at ${filing}`);
        if (filing === previousFiling && rowId === previousRowId) throw new Error(`duplicate Socrata row ID ${rowId}`);
        if (filing !== previousFiling) distinctFilings += 1;
        previousFiling = filing;
        previousRowId = rowId;
        sourceCount += 1;
      }
      if (sourceCount !== sourceArtifacts[0].record_count || sourceCount !== manifest.coverage?.source_active_registration_rows) throw new Error("source record count mismatch");
      if (distinctFilings !== manifest.coverage?.distinct_active_registration_organizations_published) throw new Error("source distinct filing count mismatch");
      if (sourceCount - distinctFilings !== manifest.coverage?.duplicate_rows_collapsed) throw new Error("source deduplication count mismatch");
    } catch (error) {
      failures.push({ path: sourceArtifacts[0].path, reason: `source validation failed: ${error.message}` });
    }
  }
  const ids = new Set();
  const countsByZip = new Map();
  let organizations = 0;
  let eligibleAddresses = 0;
  let geocodedAddresses = 0;
  let suspiciousGeocodes = 0;
  for (const artifact of normalizedArtifacts) {
    try {
      const prefix = artifact.path.match(/id-hash-prefix=([0-9a-f])/)?.[1];
      let partitionCount = 0;
      for await (const record of gzipRecords(path.join(releaseDirectory, artifact.path))) {
        const id = record.external_identifiers?.find((item) => item.type === "pa_department_of_state_filing_number")?.value;
        if (!id || ids.has(id) || sha256(id)[0] !== prefix) throw new Error(`duplicate, missing, or incorrectly partitioned filing number ${id}`);
        ids.add(id);
        if (record.entity_candidates?.organization_id !== `organization:pa_dos_filing_${id}` || record.entity_candidates?.physical_site_id || record.entity_candidates?.establishment_id) throw new Error(`invalid organization-only identity for ${id}`);
        if (record.source_status?.status !== "Active (dataset inclusion)" || record.source_status?.value !== "listed-in-pennsylvania-active-business-registration-dataset-as-of-source-refresh") throw new Error(`invalid source status for ${id}`);
        if (record.provenance?.source_release_id !== manifest.source_release_id || record.provenance?.policy_id !== "pa-business-registry" || record.export_policy !== "public") throw new Error(`invalid provenance for ${id}`);
        if (containsExcludedField(record)) throw new Error(`excluded field leaked for ${id}`);
        if (record.reported_business_address?.address_scope !== "department-of-state-reported-business-address-not-verified-physical-operating-site") throw new Error(`invalid address scope for ${id}`);
        if (record.registration_profile?.county_code_semantics !== "source-alphabetical-01-through-67-code-not-county-fips") throw new Error(`invalid county-code semantics for ${id}`);
        if (record.reported_address_coordinate) {
          geocodedAddresses += 1;
          if (record.reported_address_coordinate.plausibility === "reported-pa-address-coordinate-outside-broad-pa-bounds") suspiciousGeocodes += 1;
        }
        if (record.reported_business_address?.eligible_for_us_zip_coverage) {
          const zipCode = record.reported_business_address.zip_code;
          if (!/^\d{5}$/.test(zipCode ?? "")) throw new Error(`invalid eligible ZIP for ${id}`);
          countsByZip.set(zipCode, (countsByZip.get(zipCode) ?? 0) + 1);
          eligibleAddresses += 1;
        }
        partitionCount += 1;
      }
      if (partitionCount !== artifact.record_count) throw new Error("partition record count mismatch");
      organizations += partitionCount;
    } catch (error) {
      failures.push({ path: artifact.path, reason: `normalized validation failed: ${error.message}` });
    }
  }
  if (organizations !== manifest.coverage?.distinct_active_registration_organizations_published) failures.push({ path: "manifest.json", reason: "organization counts do not reconcile" });
  if (eligibleAddresses !== manifest.coverage?.eligible_reported_us_business_addresses) failures.push({ path: "manifest.json", reason: "eligible address count does not reconcile" });
  if (geocodedAddresses !== manifest.coverage?.source_geocoded_reported_business_addresses || suspiciousGeocodes !== manifest.coverage?.reported_pa_address_geocodes_outside_broad_pa_bounds) failures.push({ path: "manifest.json", reason: "geocode counts do not reconcile" });
  const zipArtifact = manifest.artifacts?.find((artifact) => artifact.artifact_type === "pa-business-registry-zip-coverage-jsonl");
  if (!zipArtifact) failures.push({ path: "manifest.json", reason: "missing ZIP coverage artifact" });
  else {
    try {
      const rows = (await readFile(path.join(releaseDirectory, zipArtifact.path), "utf8")).split(/\r?\n/).filter(Boolean).map(JSON.parse);
      if (rows.length !== zipArtifact.record_count || rows.length !== manifest.coverage?.zip_union_records) throw new Error("ZIP row count mismatch");
      const total = rows.reduce((sum, row) => sum + row.pa_business_registry_active_snapshot.organization_reported_business_address_count, 0);
      if (total !== eligibleAddresses) throw new Error("ZIP organization address counts do not reconcile");
      for (const row of rows) {
        if ((countsByZip.get(row.zip_code) ?? 0) !== row.pa_business_registry_active_snapshot.organization_reported_business_address_count) throw new Error(`ZIP ${row.zip_code} does not reconcile`);
        if (row.current_usps_validity?.status !== "unverified") throw new Error(`ZIP ${row.zip_code} has unsupported USPS validity`);
        if (row.pa_business_registry_active_snapshot.physical_site_count !== null || row.pa_business_registry_active_snapshot.physical_site_inference_permitted !== false) throw new Error(`ZIP ${row.zip_code} implies a physical site`);
      }
    } catch (error) {
      failures.push({ path: zipArtifact.path, reason: `ZIP validation failed: ${error.message}` });
    }
  }
  if (failures.length) {
    const error = new Error(`Pennsylvania Business Registry release verification failed for ${failures.length} check(s).`);
    error.failures = failures;
    throw error;
  }
  return { dataset_id: manifest.dataset_id, release_id: manifest.release_id, source_release_id: manifest.source_release_id, artifact_count: manifest.artifacts.length, coverage: manifest.coverage };
}
