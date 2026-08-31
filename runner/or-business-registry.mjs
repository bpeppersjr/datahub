import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { finished } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";

export const OR_BUSINESS_REGISTRY_SCHEMA_VERSION = "1.0.0";
export const OR_BUSINESS_REGISTRY_TRANSFORMATION_VERSION = "or-business-registry@1.0.0";
export const OR_BUSINESS_REGISTRY_DATASET_ID = "tckn-sxa6";
export const OR_BUSINESS_REGISTRY_METADATA_URL = `https://data.oregon.gov/api/views/${OR_BUSINESS_REGISTRY_DATASET_ID}`;
export const OR_BUSINESS_REGISTRY_API_URL = `https://data.oregon.gov/resource/${OR_BUSINESS_REGISTRY_DATASET_ID}.json`;
export const OR_BUSINESS_REGISTRY_STORY_URL = "https://data.oregon.gov/Business/Active-Businesses-ALL/tckn-sxa6";
export const OR_OPEN_DATA_PROGRAM_URL = "https://data.oregon.gov/stories/s/Oregon-s-Open-Data-Program/xr2x-d2d7/";

export const OR_BUSINESS_REGISTRY_SCHEMA = Object.freeze([
  [":id", "row_identifier"],
  ["registry_number", "text"],
  ["business_name", "text"],
  ["entity_type", "text"],
  ["registry_date", "calendar_date"],
  ["associated_name_type", "text"],
  ["address", "text"],
  ["address_continued", "text"],
  ["city", "text"],
  ["state", "text"],
  ["zip", "text"],
  ["jurisdiction", "text"],
]);

export const OR_BUSINESS_REGISTRY_FIELDS = Object.freeze(OR_BUSINESS_REGISTRY_SCHEMA.map(([field]) => field));
export const OR_BUSINESS_REGISTRY_SCHEMA_FINGERPRINT = "9e3afd799bb232e3537dd054ae6e80f4bde06d4ebdab349805ae4cf60b5e034e";

const PRINCIPAL_PLACE_FILTER = "associated_name_type='PRINCIPAL PLACE OF BUSINESS'";
const EXPECTED_TITLE = "Active Businesses - ALL";
const EXPECTED_DESCRIPTION = "All Active businesses - Principal Place of Business address, Mailing address, Registered Agent, Authorized Representative.";
const ASSUMED_BUSINESS_NAME = "ASSUMED BUSINESS NAME";
const US_STATE_AND_TERRITORY_CODES = new Set([
  "AL", "AK", "AS", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "GU", "HI", "ID", "IL", "IN", "IA", "KS", "KY",
  "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "MP", "OH", "OK",
  "OR", "PA", "PR", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "VI", "WA", "WV", "WI", "WY",
]);
const STATE_NAME_TO_CODE = new Map([
  ["PUERTO RICO", "PR"],
  ["VIRGIN ISLANDS", "VI"],
  ["U.S. VIRGIN ISLANDS", "VI"],
  ["US VIRGIN ISLANDS", "VI"],
]);
const EXCLUDED_SOURCE_FIELDS = new Set([
  "first_name", "middle_name", "last_name", "suffix", "not_of_record_entity",
  "entity_of_record_reg_number", "entity_of_record_name", "business_details",
  "mailing_address", "registered_agent", "authorized_representative",
]);

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

function sourceTimestamp(unixSeconds) {
  if (!Number.isInteger(unixSeconds) || unixSeconds <= 0) throw new Error("Oregon catalog rowsUpdatedAt must be a positive Unix timestamp.");
  return new Date(unixSeconds * 1000).toISOString();
}

function date(value) {
  const raw = text(value);
  if (!raw) return null;
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})(?:T.*)?$/);
  return match ? match[1] : null;
}

function postalCode(value) {
  const raw = text(value);
  if (!raw) return { raw: null, zip_code: null, postal_code: null, zip4: null, status: "missing" };
  const match = raw.match(/^(\d{5})(?:[- ]?(\d{4}))?$/);
  if (!match || match[1] === "00000") return { raw, zip_code: null, postal_code: null, zip4: null, status: "invalid-or-non-us-format" };
  return {
    raw,
    zip_code: match[1],
    postal_code: match[2] ? `${match[1]}-${match[2]}` : match[1],
    zip4: match[2] ?? null,
    status: match[2] ? "normalized-zip-plus-4" : "normalized-zip5",
  };
}

function stateCode(value) {
  const raw = text(value);
  const normalized = raw?.toUpperCase() ?? null;
  if (!normalized) return null;
  if (US_STATE_AND_TERRITORY_CODES.has(normalized)) return normalized;
  return STATE_NAME_TO_CODE.get(normalized) ?? null;
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

function provenance(context, registryNumber) {
  return {
    source_id: "oregon-active-business-registrations-principal-place",
    source_release_id: context.sourceReleaseId,
    source_record_id: registryNumber,
    ingest_run_id: context.runId,
    transformation_version: OR_BUSINESS_REGISTRY_TRANSFORMATION_VERSION,
    policy_id: "or-business-registry",
  };
}

export function schemaFingerprint(columns) {
  const byField = new Map((columns ?? []).map((column) => [column.fieldName, column.dataTypeName]));
  const actual = OR_BUSINESS_REGISTRY_SCHEMA.map(([field]) => [field, field === ":id" ? "row_identifier" : byField.get(field) ?? null]);
  return sha256(actual.map(([field, type]) => `${field}:${type}`).join("\u0000"));
}

function selectedRecord(row) {
  return Object.fromEntries(OR_BUSINESS_REGISTRY_FIELDS.filter((field) => row[field] !== undefined).map((field) => [field, row[field]]));
}

function normalizeAddress(source, context) {
  const postal = postalCode(source.zip);
  const state = stateCode(source.state);
  const street = text(source.address);
  const city = text(source.city);
  const eligible = Boolean(street && city && state && postal.zip_code);
  return {
    source_row_id: text(source[":id"]),
    street,
    unit_or_additional: text(source.address_continued),
    city,
    state_source: text(source.state),
    state_code: state,
    postal_code_source: postal.raw,
    zip_code: postal.zip_code,
    postal_code: postal.postal_code,
    zip4: postal.zip4,
    postal_code_status: postal.status,
    address_scope: "secretary-of-state-principal-place-of-business-address-not-verified-current-physical-operating-site",
    eligible_for_us_zip_coverage: eligible,
    geography: geography(eligible ? postal.zip_code : null, context.baselineByZip),
  };
}

export function normalizeOrBusinessRegistration(sourceRows, context) {
  if (!Array.isArray(sourceRows) || sourceRows.length === 0) throw new Error("missing-or-invalid-registration-identity");
  const first = sourceRows[0];
  const registryNumber = text(first.registry_number);
  const businessName = text(first.business_name);
  const entityType = text(first.entity_type);
  if (!/^\d+$/.test(registryNumber ?? "") || !businessName || !entityType) throw new Error("missing-or-invalid-registration-identity");
  const registryDate = date(first.registry_date);
  const jurisdiction = text(first.jurisdiction);
  const sourceRowIds = new Set();
  for (const source of sourceRows) {
    const sourceRowId = text(source[":id"]);
    if (!sourceRowId || sourceRowIds.has(sourceRowId)) throw new Error("inconsistent-registration-group");
    sourceRowIds.add(sourceRowId);
    if (text(source.registry_number) !== registryNumber || text(source.business_name) !== businessName || text(source.entity_type) !== entityType
      || date(source.registry_date) !== registryDate || text(source.jurisdiction) !== jurisdiction
      || text(source.associated_name_type) !== "PRINCIPAL PLACE OF BUSINESS") {
      throw new Error("inconsistent-registration-group");
    }
  }
  const assumedName = entityType === ASSUMED_BUSINESS_NAME;
  return {
    schema_version: OR_BUSINESS_REGISTRY_SCHEMA_VERSION,
    normalized_record_id: `or-business-registry:registration:${registryNumber}`,
    registration_kind: assumedName ? "assumed-business-name-registration" : "legal-entity-registration",
    entity_candidates: {
      organization_id: assumedName ? null : `organization:or_sos_registry_${registryNumber}`,
      brand_id: assumedName ? `brand:or_sos_assumed_name_${registryNumber}` : null,
      physical_site_id: null,
      establishment_id: null,
      identity_status: "provisional",
    },
    external_identifiers: [{ type: "or_business_registry_number", value: registryNumber, source_field: "registry_number" }],
    business_name: businessName,
    entity_type: entityType,
    registry_date: registryDate,
    jurisdiction,
    principal_place_addresses: sourceRows.map((source) => normalizeAddress(source, context)),
    source_status: {
      value: "listed-in-oregon-active-businesses-dataset-as-of-source-refresh",
      status: "Active",
      status_class: "active-registration-in-oregon-secretary-of-state-source-dataset",
      source_rows_updated_at: context.sourceRowsUpdatedAt,
      semantics: "source-active-registration-not-independent-proof-of-current-operations-legality-licensure-public-access-or-an-open-storefront",
    },
    observed_at: context.retrievedAt,
    provenance: provenance(context, registryNumber),
    export_policy: "public",
  };
}

function assertAllowedUrl(urlValue, type) {
  const url = new URL(urlValue);
  if (url.protocol !== "https:" || url.hostname !== "data.oregon.gov") throw new Error(`Oregon ${type} URL is outside the allowlist.`);
  const expectedPath = type === "metadata" ? `/api/views/${OR_BUSINESS_REGISTRY_DATASET_ID}` : `/resource/${OR_BUSINESS_REGISTRY_DATASET_ID}.json`;
  if (url.pathname !== expectedPath) throw new Error(`Oregon ${type} URL has an unexpected path.`);
  return url;
}

function retryDelay(response, attempt) {
  const retryAfter = Number(response?.headers?.get?.("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter >= 0) return Math.min(10_000, retryAfter * 1000);
  return Math.min(4_000, 250 * (2 ** attempt));
}

export async function requestOrJson(urlValue, {
  fetchImpl = globalThis.fetch,
  signal,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  maximumResponseBytes = 50_000_000,
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
      if (response.status >= 300 && response.status < 400) throw new Error("Oregon source redirect rejected.");
      if ((response.status === 429 || response.status >= 500) && attempt < attempts - 1) {
        await sleep(retryDelay(response, attempt));
        continue;
      }
      if (!response.ok) throw new Error(`Oregon source request failed with HTTP ${response.status}.`);
      const declaredBytes = Number(response.headers?.get?.("content-length"));
      if (Number.isFinite(declaredBytes) && declaredBytes > maximumResponseBytes) throw new Error("Oregon source response exceeds the configured byte limit.");
      const body = await response.text();
      if (Buffer.byteLength(body) > maximumResponseBytes) throw new Error("Oregon source response exceeds the configured byte limit.");
      return JSON.parse(body);
    } catch (error) {
      lastError = error;
      if (error.name === "AbortError" || /redirect rejected|byte limit|HTTP 4\d\d/.test(error.message) || attempt === attempts - 1) throw error;
      await sleep(250 * (2 ** attempt));
    }
  }
  throw lastError;
}

function validateCatalogMetadata(metadata, expectedFingerprint = OR_BUSINESS_REGISTRY_SCHEMA_FINGERPRINT) {
  if (metadata?.id !== OR_BUSINESS_REGISTRY_DATASET_ID || metadata?.name !== EXPECTED_TITLE || metadata?.description !== EXPECTED_DESCRIPTION) {
    throw new Error("Unexpected Oregon Active Businesses catalog metadata.");
  }
  if (metadata?.license != null) throw new Error("Oregon Active Businesses catalog license field changed from unspecified.");
  const fingerprint = schemaFingerprint(metadata.columns);
  if (fingerprint !== expectedFingerprint) throw new Error(`Oregon Active Businesses selected schema changed (${fingerprint}).`);
  return { rowsUpdatedAt: metadata.rowsUpdatedAt, rowsUpdatedAtIso: sourceTimestamp(metadata.rowsUpdatedAt), schemaFingerprint: fingerprint };
}

function soqlUrl(parameters) {
  const url = new URL(OR_BUSINESS_REGISTRY_API_URL);
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
  return url.toString();
}

async function selectedCounts(options) {
  const rowResult = await requestOrJson(soqlUrl({ $select: "count(*) as records", $where: PRINCIPAL_PLACE_FILTER }), options);
  const registrationResult = await requestOrJson(soqlUrl({ $select: "count(distinct registry_number) as registrations", $where: PRINCIPAL_PLACE_FILTER }), options);
  const sourceRows = Number(rowResult?.[0]?.records);
  const registrations = Number(registrationResult?.[0]?.registrations);
  if (!Number.isInteger(sourceRows) || sourceRows < 0 || !Number.isInteger(registrations) || registrations < 0 || registrations > sourceRows) {
    throw new Error("Oregon selected source counts are invalid.");
  }
  return { sourceRows, registrations };
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
  for (const field of Object.keys(record)) if (!OR_BUSINESS_REGISTRY_FIELDS.includes(field)) throw new Error(`Unapproved Oregon source field ${field}.`);
  return selectedRecord(record);
}

function compareRegistryKey(leftRegistry, rightRegistry) {
  return leftRegistry < rightRegistry ? -1 : leftRegistry > rightRegistry ? 1 : 0;
}

function soqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function acquireSource({ writer, sourceRecords, expectedCount, fetchImpl, signal, sleep, pageSize, logger }) {
  let count = 0;
  let previousRegistry = null;
  let previousRowId = null;
  const sourceRowIds = new Set();
  const consume = async (input) => {
    signal?.throwIfAborted?.();
    const record = sourceSafeRecord(input);
    const registryNumber = text(record.registry_number);
    const rowId = text(record[":id"]);
    if (!/^\d+$/.test(registryNumber ?? "") || !rowId || text(record.associated_name_type) !== "PRINCIPAL PLACE OF BUSINESS") {
      throw new Error("Oregon source acquisition received an invalid or out-of-scope row.");
    }
    if ((previousRegistry !== null && compareRegistryKey(registryNumber, previousRegistry) < 0) || sourceRowIds.has(rowId)) {
      throw new Error(`Oregon source keys are not strictly increasing at ${registryNumber}/${rowId}.`);
    }
    sourceRowIds.add(rowId);
    previousRegistry = registryNumber;
    previousRowId = rowId;
    await writeGzipRecord(writer, record);
    count += 1;
  };
  if (sourceRecords) {
    for await (const record of sourceRecords) await consume(record);
  } else {
    let lastRegistry = null;
    let lastRowId = null;
    while (true) {
      const keyset = lastRegistry === null ? "" : ` AND (registry_number>${soqlString(lastRegistry)} OR (registry_number=${soqlString(lastRegistry)} AND :id>${soqlString(lastRowId)}))`;
      const rows = await requestOrJson(soqlUrl({
        $select: OR_BUSINESS_REGISTRY_FIELDS.join(","),
        $where: `${PRINCIPAL_PLACE_FILTER}${keyset}`,
        $order: "registry_number ASC,:id ASC",
        $limit: String(pageSize),
      }), { fetchImpl, signal, sleep, type: "data" });
      if (!Array.isArray(rows) || rows.length > pageSize) throw new Error("Oregon source page is invalid or exceeds the page-size limit.");
      if (rows.length === 0) break;
      for (const record of rows) await consume(record);
      lastRegistry = previousRegistry;
      lastRowId = previousRowId;
      logger(`Acquired ${count.toLocaleString("en-US")} Oregon active-registration principal-place rows.`);
      if (rows.length < pageSize) break;
    }
  }
  if (count !== expectedCount) throw new Error(`Oregon source acquisition returned ${count} principal-place rows; preflight reported ${expectedCount}.`);
  return count;
}

function increment(map, key, amount = 1) {
  const normalized = key ?? "(blank)";
  map.set(normalized, (map.get(normalized) ?? 0) + amount);
}

function sortedCounts(map) {
  return Object.fromEntries([...map].sort(([left], [right]) => String(left).localeCompare(String(right))));
}

function emptyZipCounts() {
  return { legal_entity: 0, assumed_business_name: 0 };
}

function buildZipCoverage(baselineRows, countsByZip, context) {
  const baselineByZip = new Map(baselineRows.map((row) => [row.zip_code, row]));
  const zips = new Set([...baselineByZip.keys(), ...countsByZip.keys()]);
  return [...zips].sort().map((zipCode) => {
    const baseline = baselineByZip.get(zipCode);
    const counts = countsByZip.get(zipCode) ?? emptyZipCounts();
    const total = counts.legal_entity + counts.assumed_business_name;
    return {
      zip_code: zipCode,
      current_usps_validity: baseline?.current_usps_validity ?? { status: "unverified" },
      geography: baseline?.geography ?? { status: "no-2020-zcta-polygon", geo_id: null, geoid: null, geometry_file: null },
      census_zbp_coverage_status: baseline?.coverage_status ?? "outside-census-zbp-and-zcta-union",
      or_business_registry_active_registration_snapshot: {
        status: total ? "published-active-registration-principal-place-address-evidence" : "no-eligible-principal-place-address-in-current-source-snapshot",
        registration_principal_place_address_count: total,
        legal_entity_registration_principal_place_address_count: counts.legal_entity,
        assumed_business_name_registration_principal_place_address_count: counts.assumed_business_name,
        source_release_id: context.sourceReleaseId,
        source_rows_updated_at: context.sourceRowsUpdatedAt,
        physical_site_count: null,
        physical_site_inference_permitted: false,
      },
    };
  });
}

function fixtureCounts(metadata, sourceRecords) {
  const sourceRows = Number(metadata.selectedSourceRowCount ?? sourceRecords?.length);
  const registrations = Number(metadata.distinctRegistrationCount ?? new Set((sourceRecords ?? []).map((record) => text(record.registry_number))).size);
  return { sourceRows, registrations };
}

export async function buildOrBusinessRegistry({
  outputRoot,
  zbpPointer,
  catalogMetadata = null,
  sourceRecords = null,
  sourceSnapshotPath = null,
  minimumRegistrations = 500_000,
  pageSize = 25_000,
  schemaFingerprintExpected = OR_BUSINESS_REGISTRY_SCHEMA_FINGERPRINT,
  fetchImpl = globalThis.fetch,
  signal,
  sleep,
  logger = console.log,
  now = () => new Date(),
} = {}) {
  if (!outputRoot || !zbpPointer) throw new Error("outputRoot and zbpPointer are required.");
  if (sourceRecords && sourceSnapshotPath) throw new Error("sourceRecords and sourceSnapshotPath are mutually exclusive.");
  if (sourceSnapshotPath) assertContained(outputRoot, sourceSnapshotPath, "Oregon staged source snapshot");
  if (!Number.isInteger(minimumRegistrations) || minimumRegistrations < 1) throw new Error("minimumRegistrations must be a positive integer.");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50_000) throw new Error("pageSize must be from 1 through 50000.");
  signal?.throwIfAborted?.();
  const retrievedAt = now().toISOString();
  const runId = randomUUID();
  const releaseId = `or-business-registry-${releaseTimestamp(retrievedAt)}-${runId.slice(0, 8)}`;
  const stagingDirectory = path.join(outputRoot, ".staging", runId);
  await mkdir(stagingDirectory, { recursive: true });
  const baseline = await loadZbpBaseline(zbpPointer);
  const requestOptions = { fetchImpl, signal, sleep, type: "metadata" };
  const initialMetadata = catalogMetadata ?? await requestOrJson(OR_BUSINESS_REGISTRY_METADATA_URL, requestOptions);
  const catalog = validateCatalogMetadata(initialMetadata, schemaFingerprintExpected);
  const fixtureInput = sourceRecords !== null;
  const resumedSourceInput = sourceSnapshotPath ? gzipRecords(sourceSnapshotPath) : null;
  const sourceInput = sourceRecords ?? resumedSourceInput;
  const expected = fixtureInput || (sourceSnapshotPath && catalogMetadata)
    ? fixtureCounts(initialMetadata, sourceRecords)
    : await selectedCounts({ fetchImpl, signal, sleep, type: "data" });
  if (!Number.isInteger(expected.sourceRows) || !Number.isInteger(expected.registrations) || expected.registrations < minimumRegistrations || expected.registrations > expected.sourceRows) {
    throw new Error(`Oregon distinct active-registration count ${expected.registrations} is below the ${minimumRegistrations} quality floor or inconsistent with source rows.`);
  }
  const rawWriter = await openGzipWriter(stagingDirectory, "source/active-business-principal-place-rows.jsonl.gz");
  let sourceArtifact;
  try {
    await acquireSource({ writer: rawWriter, sourceRecords: sourceInput, expectedCount: expected.sourceRows, fetchImpl, signal, sleep, pageSize, logger });
    sourceArtifact = await closeGzipWriter(rawWriter, "or-business-registry-source-jsonl-gzip", { export_policy: "internal" });
  } catch (error) {
    abortGzipWriters([rawWriter]);
    throw error;
  }
  if (!catalogMetadata) {
    const finalMetadata = await requestOrJson(OR_BUSINESS_REGISTRY_METADATA_URL, requestOptions);
    const finalCatalog = validateCatalogMetadata(finalMetadata, schemaFingerprintExpected);
    const finalCounts = await selectedCounts({ fetchImpl, signal, sleep, type: "data" });
    if (finalCatalog.rowsUpdatedAt !== catalog.rowsUpdatedAt || finalCounts.sourceRows !== expected.sourceRows || finalCounts.registrations !== expected.registrations) {
      throw new Error("Oregon source changed during acquisition; the run is not publishable.");
    }
  }
  const sourceReleaseDigest = sha256(`${catalog.rowsUpdatedAtIso}\u0000${sourceArtifact.sha256}`);
  const sourceReleaseId = `or-business-registry-${catalog.rowsUpdatedAtIso.slice(0, 10)}-${sourceReleaseDigest.slice(0, 16)}`;
  const context = { runId, retrievedAt, sourceRowsUpdatedAt: catalog.rowsUpdatedAtIso, sourceReleaseId, baselineByZip: baseline.byZip };
  const writers = new Map();
  for (const prefix of "0123456789abcdef") writers.set(prefix, await openGzipWriter(stagingDirectory, `derived/registrations/id-hash-prefix=${prefix}.jsonl.gz`));
  const quarantineWriter = await openGzipWriter(stagingDirectory, "derived/quarantine/invalid-registration-groups.jsonl.gz");
  const ids = new Set();
  const countsByZip = new Map();
  const entityTypes = new Map();
  const addressStates = new Map();
  const jurisdictions = new Map();
  let registrations = 0;
  let legalEntityRegistrations = 0;
  let assumedBusinessNameRegistrations = 0;
  let registrationsWithEligibleAddress = 0;
  let eligibleZipContributions = 0;
  let multiplePrincipalPlaceRows = 0;
  let publishedSourceRows = 0;
  let quarantinedGroups = 0;
  let quarantinedSourceRows = 0;
  const flushGroup = async (group) => {
    if (group.length === 0) return;
    let normalized;
    try {
      normalized = normalizeOrBusinessRegistration(group, context);
    } catch (error) {
      if (!["missing-or-invalid-registration-identity", "inconsistent-registration-group"].includes(error.message)) throw error;
      await writeGzipRecord(quarantineWriter, {
        schema_version: OR_BUSINESS_REGISTRY_SCHEMA_VERSION,
        source_record_id: text(group[0]?.registry_number),
        source_row_ids: group.map((source) => text(source[":id"])),
        source_row_count: group.length,
        reason: error.message,
        source_release_id: context.sourceReleaseId,
        ingest_run_id: context.runId,
        export_policy: "internal",
      });
      quarantinedGroups += 1;
      quarantinedSourceRows += group.length;
      return;
    }
    const id = normalized.external_identifiers[0].value;
    if (ids.has(id)) throw new Error(`Duplicate Oregon registry number ${id}.`);
    ids.add(id);
    await writeGzipRecord(writers.get(sha256(id)[0]), normalized);
    increment(entityTypes, normalized.entity_type);
    increment(jurisdictions, normalized.jurisdiction);
    if (normalized.registration_kind === "legal-entity-registration") legalEntityRegistrations += 1;
    else assumedBusinessNameRegistrations += 1;
    if (normalized.principal_place_addresses.length > 1) multiplePrincipalPlaceRows += 1;
    const eligibleZips = new Set();
    for (const address of normalized.principal_place_addresses) {
      increment(addressStates, address.state_code ?? address.state_source);
      if (address.eligible_for_us_zip_coverage) eligibleZips.add(address.zip_code);
    }
    if (eligibleZips.size) registrationsWithEligibleAddress += 1;
    for (const zipCode of eligibleZips) {
      const zipCounts = countsByZip.get(zipCode) ?? emptyZipCounts();
      if (normalized.registration_kind === "legal-entity-registration") zipCounts.legal_entity += 1;
      else zipCounts.assumed_business_name += 1;
      countsByZip.set(zipCode, zipCounts);
      eligibleZipContributions += 1;
    }
    publishedSourceRows += group.length;
    registrations += 1;
  };
  try {
    let group = [];
    let groupId = null;
    for await (const source of gzipRecords(path.join(stagingDirectory, sourceArtifact.path))) {
      signal?.throwIfAborted?.();
      const currentId = text(source.registry_number);
      if (groupId !== null && currentId !== groupId) {
        await flushGroup(group);
        group = [];
      }
      groupId = currentId;
      group.push(source);
    }
    await flushGroup(group);
  } catch (error) {
    abortGzipWriters([...writers.values(), quarantineWriter]);
    throw error;
  }
  if (registrations + quarantinedGroups !== expected.registrations || publishedSourceRows + quarantinedSourceRows !== expected.sourceRows) {
    throw new Error("Oregon normalized and quarantined counts do not reconcile to the source snapshot.");
  }
  const artifacts = [
    sourceArtifact,
    ...await Promise.all([...writers.values()].map((writer) => closeGzipWriter(writer, "normalized-or-business-registration-jsonl-gzip"))),
    await closeGzipWriter(quarantineWriter, "or-business-registry-quarantine-jsonl-gzip", { export_policy: "internal" }),
  ];
  const coverageRows = buildZipCoverage(baseline.rows, countsByZip, context);
  artifacts.push(await writeArtifact(stagingDirectory, "derived/zip-coverage.jsonl", jsonLines(coverageRows), { artifact_type: "or-business-registry-zip-coverage-jsonl", record_count: coverageRows.length }));
  artifacts.push(await writeArtifact(stagingDirectory, "derived/source-summary.json", json({
    source_principal_place_rows: expected.sourceRows,
    distinct_source_registrations: expected.registrations,
    active_registrations_published: registrations,
    source_rows_in_published_registrations: publishedSourceRows,
    quarantined_registration_groups: quarantinedGroups,
    quarantined_source_rows: quarantinedSourceRows,
    legal_entity_registrations: legalEntityRegistrations,
    assumed_business_name_registrations: assumedBusinessNameRegistrations,
    registrations_with_multiple_principal_place_rows: multiplePrincipalPlaceRows,
    registrations_with_eligible_us_principal_place_address: registrationsWithEligibleAddress,
    registrations_without_eligible_us_zip_address: registrations - registrationsWithEligibleAddress,
    eligible_us_registration_zip_contributions: eligibleZipContributions,
    entity_types: sortedCounts(entityTypes),
    principal_place_address_states: sortedCounts(addressStates),
    jurisdictions: sortedCounts(jurisdictions),
  }), { artifact_type: "or-business-registry-source-summary" }));
  artifacts.push(await writeArtifact(stagingDirectory, "source/release-metadata.json", json({
    dataset_id: OR_BUSINESS_REGISTRY_DATASET_ID,
    dataset_name: initialMetadata.name,
    publisher: "Oregon Secretary of State, Corporation Division",
    catalog_license: initialMetadata.license ?? null,
    program_use_authorization: "Open data can be freely used, modified and shared by anyone for any purpose and is available at no direct cost.",
    source_rows_updated_at: catalog.rowsUpdatedAtIso,
    source_rows_updated_at_unix: catalog.rowsUpdatedAt,
    selected_schema: OR_BUSINESS_REGISTRY_SCHEMA,
    selected_schema_fingerprint: catalog.schemaFingerprint,
    selected_fields: OR_BUSINESS_REGISTRY_FIELDS,
    explicitly_excluded_field_classes: ["associated-person names", "entity-of-record identities", "mailing-address rows", "registered-agent rows", "authorized-representative rows", "business-details URL"],
    query: { filter: PRINCIPAL_PLACE_FILTER, order: "registry_number ASC,:id ASC", compound_keyset_pagination: true, page_size: pageSize },
    expected_selected_source_row_count: expected.sourceRows,
    expected_distinct_registration_count: expected.registrations,
    source_urls: { metadata: OR_BUSINESS_REGISTRY_METADATA_URL, api: OR_BUSINESS_REGISTRY_API_URL, documentation: OR_BUSINESS_REGISTRY_STORY_URL, use_authorization: OR_OPEN_DATA_PROGRAM_URL },
  }), { artifact_type: "or-business-registry-source-release-metadata" }));
  const manifest = {
    schema_version: OR_BUSINESS_REGISTRY_SCHEMA_VERSION,
    dataset_id: "or-business-registry-active-registrations",
    connector: { id: "or-business-registry", version: "1.0.0" },
    release_id: releaseId,
    run_id: runId,
    retrieved_at: retrievedAt,
    source_rows_updated_at: catalog.rowsUpdatedAtIso,
    source_release_id: sourceReleaseId,
    status: "published",
    complete_selected_active_registration_snapshot: true,
    coverage: {
      source_principal_place_rows: expected.sourceRows,
      distinct_source_registrations: expected.registrations,
      active_registrations_published: registrations,
      source_rows_in_published_registrations: publishedSourceRows,
      quarantined_registration_groups: quarantinedGroups,
      quarantined_source_rows: quarantinedSourceRows,
      legal_entity_registrations: legalEntityRegistrations,
      assumed_business_name_registrations: assumedBusinessNameRegistrations,
      registrations_with_multiple_principal_place_rows: multiplePrincipalPlaceRows,
      registrations_with_eligible_us_principal_place_address: registrationsWithEligibleAddress,
      registrations_without_eligible_us_zip_address: registrations - registrationsWithEligibleAddress,
      eligible_us_registration_zip_contributions: eligibleZipContributions,
      source_zip_codes: countsByZip.size,
      zip_union_records: coverageRows.length,
      physical_sites: null,
      establishments: null,
    },
    quality_gates: {
      minimum_registrations: minimumRegistrations,
      source_registration_counts_match: registrations + quarantinedGroups === expected.registrations,
      source_row_counts_match: publishedSourceRows + quarantinedSourceRows === expected.sourceRows,
      selected_schema_fingerprint: catalog.schemaFingerprint,
      duplicate_source_row_ids: 0,
      duplicate_registration_ids: 0,
      source_unchanged_during_acquisition: true,
    },
    dependencies: [
      { dataset_id: baseline.manifest.dataset_id, release_id: baseline.manifest.release_id, manifest_sha256: baseline.manifestSha256 },
      baseline.manifest.geography_dependency,
    ],
    source: {
      publisher: "Oregon Secretary of State, Corporation Division",
      catalog_dataset_id: OR_BUSINESS_REGISTRY_DATASET_ID,
      source_page: OR_BUSINESS_REGISTRY_STORY_URL,
      api_url: OR_BUSINESS_REGISTRY_API_URL,
      access_method: fixtureInput ? "explicit test fixture records" : sourceSnapshotPath ? "validated local staged source snapshot originally acquired from the anonymous public Socrata API" : "anonymous public Socrata API with compound stable keyset pagination",
      catalog_license: null,
      use_authorization: OR_OPEN_DATA_PROGRAM_URL,
      api_key_used: false,
      policy_profile: "config/source-policies/or-business-registry.json",
    },
    privacy: {
      source_columns_available: 19,
      source_columns_acquired: OR_BUSINESS_REGISTRY_FIELDS.length,
      associated_person_name_fields_acquired: 0,
      agent_or_authorized_representative_rows_acquired: 0,
      mailing_address_rows_acquired: 0,
    },
    limitations: [
      "Active is Oregon Secretary-of-State registration evidence and is not independent proof of current operations, legality, solvency, licensure, public access, or an open storefront.",
      "Sole proprietors and general partnerships do not have to register unless they use an assumed business name, so this is not every business operating in Oregon.",
      "An assumed business name is modeled as a provisional brand rather than a legal organization; its owner is not inferred.",
      "Principal-place addresses can be administrative, residential, virtual, incomplete, stale, outside Oregon, or outside the United States; no physical site or establishment is created from them.",
      "Associated-person names, entity-of-record identities, mailing-address rows, registered-agent rows, authorized-representative rows, and business-details URLs are excluded.",
      "Current USPS ZIP validity remains unverified until an authorized operational ZIP denominator is integrated.",
    ],
    artifacts,
  };
  await writeArtifact(stagingDirectory, "manifest.json", json(manifest));
  const publication = await publishOrBusinessRegistryStaging({ outputRoot, stagingRunId: runId, expectedReleaseId: releaseId });
  logger(`Published ${registrations.toLocaleString("en-US")} Oregon active registrations.`);
  return { manifest, releaseDirectory: publication.releaseDirectory, pointerPath: publication.pointerPath };
}

function containsExcludedField(value) {
  if (Array.isArray(value)) return value.some(containsExcludedField);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) => EXCLUDED_SOURCE_FIELDS.has(key.toLowerCase()) || containsExcludedField(child));
}

export async function publishOrBusinessRegistryStaging({ outputRoot, stagingRunId, expectedReleaseId = null } = {}) {
  if (!outputRoot || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stagingRunId ?? "")) {
    throw new Error("outputRoot and a valid stagingRunId are required.");
  }
  const stagingRoot = path.join(outputRoot, ".staging");
  const stagingDirectory = path.resolve(stagingRoot, stagingRunId);
  assertContained(stagingRoot, stagingDirectory, "Oregon staging run");
  const manifestPath = path.join(stagingDirectory, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.run_id !== stagingRunId || manifest.dataset_id !== "or-business-registry-active-registrations" || manifest.status !== "published") {
    throw new Error("Oregon staging manifest does not match the requested complete run.");
  }
  if (expectedReleaseId && manifest.release_id !== expectedReleaseId) throw new Error("Oregon staging release ID does not match the build result.");
  await verifyOrBusinessRegistry(manifestPath);
  const releasesDirectory = path.join(outputRoot, "releases");
  await mkdir(releasesDirectory, { recursive: true });
  const releaseDirectory = path.join(releasesDirectory, manifest.release_id);
  try {
    await stat(releaseDirectory);
    throw new Error(`Oregon release destination already exists: ${manifest.release_id}.`);
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
  if (!(await stat(releaseDirectory)).isDirectory()) throw new Error("Published Oregon Business Registry release is not a directory.");
  return { manifest, releaseDirectory, pointerPath };
}

export async function verifyOrBusinessRegistry(manifestPath) {
  const absoluteManifestPath = path.resolve(manifestPath);
  const releaseDirectory = path.dirname(absoluteManifestPath);
  const manifest = JSON.parse(await readFile(absoluteManifestPath, "utf8"));
  const failures = [];
  if (manifest.dataset_id !== "or-business-registry-active-registrations" || manifest.status !== "published" || !manifest.complete_selected_active_registration_snapshot) {
    failures.push({ path: "manifest.json", reason: "unexpected or incomplete manifest" });
  }
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
  const sourceArtifacts = manifest.artifacts?.filter((artifact) => artifact.artifact_type === "or-business-registry-source-jsonl-gzip") ?? [];
  const normalizedArtifacts = manifest.artifacts?.filter((artifact) => artifact.artifact_type === "normalized-or-business-registration-jsonl-gzip") ?? [];
  const quarantineArtifacts = manifest.artifacts?.filter((artifact) => artifact.artifact_type === "or-business-registry-quarantine-jsonl-gzip") ?? [];
  if (sourceArtifacts.length !== 1 || sourceArtifacts[0]?.export_policy !== "internal") failures.push({ path: "manifest.json", reason: "expected one internal selected-field source artifact" });
  if (normalizedArtifacts.length !== 16) failures.push({ path: "manifest.json", reason: "expected 16 normalized registration partitions" });
  if (quarantineArtifacts.length !== 1 || quarantineArtifacts[0]?.export_policy !== "internal") failures.push({ path: "manifest.json", reason: "expected one internal quarantine artifact" });
  const sourceRowsByRegistration = new Map();
  const allSourceRowIds = new Set();
  if (sourceArtifacts.length === 1) {
    const digest = sha256(`${manifest.source_rows_updated_at}\u0000${sourceArtifacts[0].sha256}`);
    if (manifest.source_release_id !== `or-business-registry-${manifest.source_rows_updated_at.slice(0, 10)}-${digest.slice(0, 16)}`) {
      failures.push({ path: "manifest.json", reason: "source release ID is not bound to refresh timestamp and selected source checksum" });
    }
    try {
      let sourceCount = 0;
      let previousRegistry = null;
      for await (const record of gzipRecords(path.join(releaseDirectory, sourceArtifacts[0].path))) {
        for (const field of Object.keys(record)) if (!OR_BUSINESS_REGISTRY_FIELDS.includes(field)) throw new Error(`unapproved source field ${field}`);
        const registryNumber = text(record.registry_number);
        const rowId = text(record[":id"]);
        if (!/^\d+$/.test(registryNumber ?? "") || !rowId || text(record.associated_name_type) !== "PRINCIPAL PLACE OF BUSINESS"
          || (previousRegistry !== null && compareRegistryKey(registryNumber, previousRegistry) < 0)) {
          throw new Error(`invalid source ordering or row at ${registryNumber}/${rowId}`);
        }
        if (allSourceRowIds.has(rowId)) throw new Error(`duplicate source row ID ${rowId}`);
        allSourceRowIds.add(rowId);
        if (!sourceRowsByRegistration.has(registryNumber)) sourceRowsByRegistration.set(registryNumber, new Set());
        sourceRowsByRegistration.get(registryNumber).add(rowId);
        previousRegistry = registryNumber;
        sourceCount += 1;
      }
      if (sourceCount !== sourceArtifacts[0].record_count || sourceCount !== manifest.coverage?.source_principal_place_rows) throw new Error("source row count mismatch");
      if (sourceRowsByRegistration.size !== manifest.coverage?.distinct_source_registrations) throw new Error("distinct source registration count mismatch");
    } catch (error) {
      failures.push({ path: sourceArtifacts[0].path, reason: `source validation failed: ${error.message}` });
    }
  }
  const ids = new Set();
  const accountedSourceRowIds = new Set();
  const countsByZip = new Map();
  let registrations = 0;
  let legalEntityRegistrations = 0;
  let assumedBusinessNameRegistrations = 0;
  let registrationsWithEligibleAddress = 0;
  let eligibleZipContributions = 0;
  let multiplePrincipalPlaceRows = 0;
  let publishedSourceRows = 0;
  for (const artifact of normalizedArtifacts) {
    try {
      const prefix = artifact.path.match(/id-hash-prefix=([0-9a-f])/)?.[1];
      let partitionCount = 0;
      for await (const record of gzipRecords(path.join(releaseDirectory, artifact.path))) {
        const id = record.external_identifiers?.find((item) => item.type === "or_business_registry_number")?.value;
        if (!id || ids.has(id) || sha256(id)[0] !== prefix || !sourceRowsByRegistration.has(id)) throw new Error(`duplicate, missing, or incorrectly partitioned registry number ${id}`);
        ids.add(id);
        const assumedName = record.registration_kind === "assumed-business-name-registration";
        if (assumedName) {
          if (record.entity_type !== ASSUMED_BUSINESS_NAME || record.entity_candidates?.organization_id !== null || record.entity_candidates?.brand_id !== `brand:or_sos_assumed_name_${id}`) throw new Error(`invalid assumed-name identity for ${id}`);
          assumedBusinessNameRegistrations += 1;
        } else {
          if (record.registration_kind !== "legal-entity-registration" || record.entity_type === ASSUMED_BUSINESS_NAME || record.entity_candidates?.organization_id !== `organization:or_sos_registry_${id}` || record.entity_candidates?.brand_id !== null) throw new Error(`invalid legal-entity identity for ${id}`);
          legalEntityRegistrations += 1;
        }
        if (record.entity_candidates?.physical_site_id !== null || record.entity_candidates?.establishment_id !== null) throw new Error(`registration ${id} implies a site or establishment`);
        if (record.source_status?.status !== "Active" || record.source_status?.value !== "listed-in-oregon-active-businesses-dataset-as-of-source-refresh") throw new Error(`invalid source status for ${id}`);
        if (record.provenance?.source_release_id !== manifest.source_release_id || record.provenance?.policy_id !== "or-business-registry" || record.export_policy !== "public") throw new Error(`invalid provenance for ${id}`);
        if (containsExcludedField(record)) throw new Error(`excluded field leaked for ${id}`);
        const expectedRows = sourceRowsByRegistration.get(id);
        if (!Array.isArray(record.principal_place_addresses) || record.principal_place_addresses.length !== expectedRows.size) throw new Error(`principal-place row count mismatch for ${id}`);
        if (record.principal_place_addresses.length > 1) multiplePrincipalPlaceRows += 1;
        const eligibleZips = new Set();
        for (const address of record.principal_place_addresses) {
          if (!expectedRows.has(address.source_row_id) || accountedSourceRowIds.has(address.source_row_id)) throw new Error(`unknown or duplicate normalized source row ${address.source_row_id}`);
          accountedSourceRowIds.add(address.source_row_id);
          if (address.address_scope !== "secretary-of-state-principal-place-of-business-address-not-verified-current-physical-operating-site") throw new Error(`invalid address scope for ${id}`);
          if (address.eligible_for_us_zip_coverage) {
            if (!/^\d{5}$/.test(address.zip_code ?? "")) throw new Error(`invalid eligible ZIP for ${id}`);
            eligibleZips.add(address.zip_code);
          }
        }
        if (eligibleZips.size) registrationsWithEligibleAddress += 1;
        for (const zipCode of eligibleZips) {
          const counts = countsByZip.get(zipCode) ?? emptyZipCounts();
          if (assumedName) counts.assumed_business_name += 1;
          else counts.legal_entity += 1;
          countsByZip.set(zipCode, counts);
          eligibleZipContributions += 1;
        }
        publishedSourceRows += record.principal_place_addresses.length;
        partitionCount += 1;
      }
      if (partitionCount !== artifact.record_count) throw new Error("partition record count mismatch");
      registrations += partitionCount;
    } catch (error) {
      failures.push({ path: artifact.path, reason: `normalized validation failed: ${error.message}` });
    }
  }
  const quarantineIds = new Set();
  let quarantinedGroups = 0;
  let quarantinedSourceRows = 0;
  if (quarantineArtifacts.length === 1) {
    try {
      for await (const record of gzipRecords(path.join(releaseDirectory, quarantineArtifacts[0].path))) {
        if (!/^\d+$/.test(record.source_record_id ?? "") || !["missing-or-invalid-registration-identity", "inconsistent-registration-group"].includes(record.reason)
          || record.export_policy !== "internal" || record.source_release_id !== manifest.source_release_id || quarantineIds.has(record.source_record_id) || ids.has(record.source_record_id)
          || !Array.isArray(record.source_row_ids) || record.source_row_ids.length !== record.source_row_count) {
          throw new Error(`invalid quarantine record ${record.source_record_id}`);
        }
        const expectedRows = sourceRowsByRegistration.get(record.source_record_id);
        if (!expectedRows || expectedRows.size !== record.source_row_ids.length) throw new Error(`quarantine source-row count mismatch for ${record.source_record_id}`);
        for (const rowId of record.source_row_ids) {
          if (!expectedRows.has(rowId) || accountedSourceRowIds.has(rowId)) throw new Error(`unknown or duplicate quarantined source row ${rowId}`);
          accountedSourceRowIds.add(rowId);
        }
        quarantineIds.add(record.source_record_id);
        quarantinedGroups += 1;
        quarantinedSourceRows += record.source_row_count;
      }
      if (quarantinedGroups !== quarantineArtifacts[0].record_count) throw new Error("quarantine record count mismatch");
    } catch (error) {
      failures.push({ path: quarantineArtifacts[0].path, reason: `quarantine validation failed: ${error.message}` });
    }
  }
  const coverage = manifest.coverage ?? {};
  if (registrations !== coverage.active_registrations_published || legalEntityRegistrations !== coverage.legal_entity_registrations || assumedBusinessNameRegistrations !== coverage.assumed_business_name_registrations) failures.push({ path: "manifest.json", reason: "published registration counts do not reconcile" });
  if (registrations + quarantinedGroups !== coverage.distinct_source_registrations || quarantinedGroups !== coverage.quarantined_registration_groups) failures.push({ path: "manifest.json", reason: "registration and quarantine group counts do not reconcile" });
  if (publishedSourceRows + quarantinedSourceRows !== coverage.source_principal_place_rows || publishedSourceRows !== coverage.source_rows_in_published_registrations || quarantinedSourceRows !== coverage.quarantined_source_rows) failures.push({ path: "manifest.json", reason: "source row counts do not reconcile" });
  if (accountedSourceRowIds.size !== allSourceRowIds.size) failures.push({ path: "manifest.json", reason: "not every source row is represented by a normalized or quarantine record" });
  if (registrationsWithEligibleAddress !== coverage.registrations_with_eligible_us_principal_place_address || registrations - registrationsWithEligibleAddress !== coverage.registrations_without_eligible_us_zip_address) failures.push({ path: "manifest.json", reason: "eligible-address registration counts do not reconcile" });
  if (eligibleZipContributions !== coverage.eligible_us_registration_zip_contributions || multiplePrincipalPlaceRows !== coverage.registrations_with_multiple_principal_place_rows) failures.push({ path: "manifest.json", reason: "ZIP contribution or multiple-address counts do not reconcile" });
  const zipArtifact = manifest.artifacts?.find((artifact) => artifact.artifact_type === "or-business-registry-zip-coverage-jsonl");
  if (!zipArtifact) failures.push({ path: "manifest.json", reason: "missing ZIP coverage artifact" });
  else {
    try {
      const rows = (await readFile(path.join(releaseDirectory, zipArtifact.path), "utf8")).split(/\r?\n/).filter(Boolean).map(JSON.parse);
      if (rows.length !== zipArtifact.record_count || rows.length !== coverage.zip_union_records) throw new Error("ZIP row count mismatch");
      let total = 0;
      for (const row of rows) {
        const expectedCounts = countsByZip.get(row.zip_code) ?? emptyZipCounts();
        const snapshot = row.or_business_registry_active_registration_snapshot;
        const expectedTotal = expectedCounts.legal_entity + expectedCounts.assumed_business_name;
        if (snapshot.registration_principal_place_address_count !== expectedTotal
          || snapshot.legal_entity_registration_principal_place_address_count !== expectedCounts.legal_entity
          || snapshot.assumed_business_name_registration_principal_place_address_count !== expectedCounts.assumed_business_name) throw new Error(`ZIP ${row.zip_code} does not reconcile`);
        if (row.current_usps_validity?.status !== "unverified") throw new Error(`ZIP ${row.zip_code} has unsupported USPS validity`);
        if (snapshot.physical_site_count !== null || snapshot.physical_site_inference_permitted !== false) throw new Error(`ZIP ${row.zip_code} implies a physical site`);
        total += expectedTotal;
      }
      if (total !== eligibleZipContributions) throw new Error("ZIP registration address counts do not reconcile");
    } catch (error) {
      failures.push({ path: zipArtifact.path, reason: `ZIP validation failed: ${error.message}` });
    }
  }
  if (failures.length) {
    const error = new Error(`Oregon Business Registry release verification failed for ${failures.length} check(s).`);
    error.failures = failures;
    throw error;
  }
  return { dataset_id: manifest.dataset_id, release_id: manifest.release_id, source_release_id: manifest.source_release_id, artifact_count: manifest.artifacts.length, coverage: manifest.coverage };
}
