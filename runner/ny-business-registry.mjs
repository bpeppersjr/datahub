import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { finished } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";
import { assertNormalizedUsPostalFieldsDeep } from "./normalized-us-postal-code.mjs";

export const NY_BUSINESS_REGISTRY_SCHEMA_VERSION = "1.0.0";
export const NY_BUSINESS_REGISTRY_TRANSFORMATION_VERSION = "ny-business-registry@1.0.1";
export const NY_BUSINESS_REGISTRY_DATASET_ID = "n9v6-gdp6";
export const NY_BUSINESS_REGISTRY_METADATA_URL = `https://data.ny.gov/api/views/${NY_BUSINESS_REGISTRY_DATASET_ID}`;
export const NY_BUSINESS_REGISTRY_API_URL = `https://data.ny.gov/resource/${NY_BUSINESS_REGISTRY_DATASET_ID}.json`;
export const NY_BUSINESS_REGISTRY_STORY_URL = "https://data.ny.gov/Economic-Development/Active-Corporations-Beginning-1800/n9v6-gdp6";

export const NY_BUSINESS_REGISTRY_SCHEMA = Object.freeze([
  ["dos_id", "text"],
  ["current_entity_name", "text"],
  ["initial_dos_filing_date", "calendar_date"],
  ["county", "text"],
  ["jurisdiction", "text"],
  ["entity_type", "text"],
  ["location_address_1", "text"],
  ["location_address_2", "text"],
  ["location_city", "text"],
  ["location_state", "text"],
  ["location_zip", "text"],
]);

export const NY_BUSINESS_REGISTRY_FIELDS = Object.freeze(NY_BUSINESS_REGISTRY_SCHEMA.map(([field]) => field));
export const NY_BUSINESS_REGISTRY_SCHEMA_FINGERPRINT = "c214ce41a736bac829360fa5a29fea4777cd049616bae0f0624cc214506849df";

const US_STATE_AND_TERRITORY_CODES = new Set([
  "AL", "AK", "AS", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "GU", "HI", "ID", "IL", "IN", "IA", "KS", "KY",
  "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "MP", "OH", "OK",
  "OR", "PA", "PR", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "VI", "WA", "WV", "WI", "WY",
]);

const EXCLUDED_SOURCE_FIELDS = new Set([
  "dos_process_name", "dos_process_address_1", "dos_process_address_2", "dos_process_city", "dos_process_state", "dos_process_zip",
  "chairman_name", "chairman_address_1", "chairman_address_2", "chairman_city", "chairman_state", "chairman_zip",
  "registered_agent_name", "registered_agent_address_1", "registered_agent_address_2", "registered_agent_city", "registered_agent_state", "registered_agent_zip",
  "location_name",
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
  if (!Number.isInteger(unixSeconds) || unixSeconds <= 0) throw new Error("New York catalog rowsUpdatedAt must be a positive Unix timestamp.");
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
    postal_code: match[1],
    zip4: match[2] ?? null,
    status: match[2] ? "normalized-zip-plus-4" : "normalized-zip5",
  };
}

function stateCode(value) {
  const raw = text(value);
  const normalized = raw?.toUpperCase() ?? null;
  return normalized && US_STATE_AND_TERRITORY_CODES.has(normalized) ? normalized : null;
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

function provenance(context, sourceRecordId) {
  return {
    source_id: "new-york-active-corporations-monthly-extract",
    source_release_id: context.sourceReleaseId,
    source_record_id: sourceRecordId,
    ingest_run_id: context.runId,
    transformation_version: NY_BUSINESS_REGISTRY_TRANSFORMATION_VERSION,
    policy_id: "ny-business-registry",
  };
}

export function schemaFingerprint(columns) {
  const byField = new Map((columns ?? []).map((column) => [column.fieldName, column.dataTypeName]));
  const actual = NY_BUSINESS_REGISTRY_SCHEMA.map(([field]) => [field, byField.get(field) ?? null]);
  return sha256(actual.map(([field, type]) => `${field}:${type}`).join("\u0000"));
}

function selectedRecord(row) {
  return Object.fromEntries(NY_BUSINESS_REGISTRY_FIELDS.filter((field) => row[field] !== undefined).map((field) => [field, row[field]]));
}

export function normalizeNyBusinessOrganization(source, context) {
  const sourceRecordId = text(source.dos_id);
  const legalName = text(source.current_entity_name);
  if (!sourceRecordId || !/^\d{1,8}$/.test(sourceRecordId) || !legalName) throw new Error("missing-or-invalid-organization-identity");
  const postal = postalCode(source.location_zip);
  const state = stateCode(source.location_state);
  const street = text(source.location_address_1);
  const city = text(source.location_city);
  const addressEligibleForUsZipCoverage = Boolean(street && city && state && postal.zip_code);
  const organizationId = `organization:ny_dos_id_${sourceRecordId}`;
  return {
    schema_version: NY_BUSINESS_REGISTRY_SCHEMA_VERSION,
    normalized_record_id: `ny-business-registry:organization:${sourceRecordId}`,
    entity_candidates: { organization_id: organizationId, identity_status: "provisional" },
    external_identifiers: [
      { type: "ny_dos_id", value: sourceRecordId, source_field: "dos_id" },
    ],
    legal_name: legalName,
    reported_location_address: {
      street,
      unit_or_additional: text(source.location_address_2),
      city,
      state_source: text(source.location_state),
      state_code: state,
      postal_code_source: postal.raw,
      zip_code: postal.zip_code,
      postal_code: postal.postal_code,
      zip4: postal.zip4,
      postal_code_status: postal.status,
      address_scope: "nysdos-reported-location-from-biennial-statement-not-verified-current-physical-operating-site",
      eligible_for_us_zip_coverage: addressEligibleForUsZipCoverage,
    },
    reported_address_coordinate: null,
    geography: geography(addressEligibleForUsZipCoverage ? postal.zip_code : null, context.baselineByZip),
    registration_profile: {
      entity_type: text(source.entity_type),
      jurisdiction: text(source.jurisdiction),
      county_of_incorporation: text(source.county),
      initial_dos_filing_date: date(source.initial_dos_filing_date),
    },
    source_status: {
      value: "included-in-new-york-active-corporations-monthly-extract-as-of-retrieval",
      status_class: "active-only-monthly-extract-membership",
      source_rows_updated_at: context.sourceRowsUpdatedAt,
      semantics: "general-public-knowledge-only-not-proof-of-current-legal-status-operations-or-an-open-storefront",
    },
    observed_at: context.retrievedAt,
    provenance: provenance(context, sourceRecordId),
    export_policy: "public-open-ny-terms",
  };
}

function assertAllowedUrl(urlValue, type) {
  const url = new URL(urlValue);
  if (url.protocol !== "https:" || url.hostname !== "data.ny.gov") throw new Error(`New York ${type} URL is outside the allowlist.`);
  const expectedPath = type === "metadata" ? `/api/views/${NY_BUSINESS_REGISTRY_DATASET_ID}` : `/resource/${NY_BUSINESS_REGISTRY_DATASET_ID}.json`;
  if (url.pathname !== expectedPath) throw new Error(`New York ${type} URL has an unexpected path.`);
  return url;
}

function retryDelay(response, attempt) {
  const retryAfter = Number(response?.headers?.get?.("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter >= 0) return Math.min(10_000, retryAfter * 1000);
  return Math.min(4_000, 250 * (2 ** attempt));
}

export async function requestNyJson(urlValue, {
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
      if (response.status >= 300 && response.status < 400) throw new Error("New York source redirect rejected.");
      if ((response.status === 429 || response.status >= 500) && attempt < attempts - 1) {
        await sleep(retryDelay(response, attempt));
        continue;
      }
      if (!response.ok) throw new Error(`New York source request failed with HTTP ${response.status}.`);
      const declaredBytes = Number(response.headers?.get?.("content-length"));
      if (Number.isFinite(declaredBytes) && declaredBytes > maximumResponseBytes) throw new Error("New York source response exceeds the configured byte limit.");
      const body = await response.text();
      if (Buffer.byteLength(body) > maximumResponseBytes) throw new Error("New York source response exceeds the configured byte limit.");
      return JSON.parse(body);
    } catch (error) {
      lastError = error;
      if (error.name === "AbortError" || /redirect rejected|byte limit|HTTP 4\d\d/.test(error.message) || attempt === attempts - 1) throw error;
      await sleep(250 * (2 ** attempt));
    }
  }
  throw lastError;
}

function validateCatalogMetadata(metadata, expectedFingerprint = NY_BUSINESS_REGISTRY_SCHEMA_FINGERPRINT) {
  if (metadata?.id !== NY_BUSINESS_REGISTRY_DATASET_ID || metadata?.name !== "Active Corporations:  Beginning 1800") throw new Error("Unexpected New York Active Corporations catalog metadata.");
  if (metadata?.license !== null && metadata?.license !== undefined) throw new Error("New York Active Corporations dataset-specific license metadata changed.");
  if (metadata?.attribution !== "New York State Department of State" || metadata?.provenance !== "official" || metadata?.publicationStage !== "published") throw new Error("New York Active Corporations authority metadata changed.");
  if (metadata?.metadata?.custom_fields?.["Dataset Summary"]?.["Posting Frequency"] !== "Monthly") throw new Error("New York Active Corporations posting frequency changed.");
  const fingerprint = schemaFingerprint(metadata.columns);
  if (fingerprint !== expectedFingerprint) throw new Error(`New York Business Entities selected schema changed (${fingerprint}).`);
  return { rowsUpdatedAt: metadata.rowsUpdatedAt, rowsUpdatedAtIso: sourceTimestamp(metadata.rowsUpdatedAt), schemaFingerprint: fingerprint };
}

function soqlUrl(parameters) {
  const url = new URL(NY_BUSINESS_REGISTRY_API_URL);
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
  return url.toString();
}

async function selectedRecordCount(options) {
  const rows = await requestNyJson(soqlUrl({ $select: "count(*) as records" }), options);
  const count = Number(rows?.[0]?.records);
  if (!Number.isInteger(count) || count < 0) throw new Error("New York active-extract record count response is invalid.");
  return count;
}

async function distinctDosIdCount(options) {
  const rows = await requestNyJson(soqlUrl({ $select: "count(distinct dos_id) as records" }), options);
  const count = Number(rows?.[0]?.records);
  if (!Number.isInteger(count) || count < 0) throw new Error("New York distinct DOS-ID count response is invalid.");
  return count;
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
  for (const field of Object.keys(record)) if (!NY_BUSINESS_REGISTRY_FIELDS.includes(field)) throw new Error(`Unapproved New York source field ${field}.`);
  return selectedRecord(record);
}

async function acquireSource({ writer, sourceRecords, expectedCount, fetchImpl, signal, sleep, pageSize, logger }) {
  let count = 0;
  let previousId = null;
  const consume = async (input) => {
    signal?.throwIfAborted?.();
    const record = sourceSafeRecord(input);
    const id = text(record.dos_id);
    if (!/^\d{1,8}$/.test(id ?? "")) throw new Error("New York source acquisition received an invalid DOS ID.");
    if (previousId !== null && id.localeCompare(previousId, "en", { numeric: false }) <= 0) throw new Error(`New York source IDs are not strictly increasing at ${id}.`);
    previousId = id;
    await writeGzipRecord(writer, record);
    count += 1;
  };
  if (sourceRecords) {
    for await (const record of sourceRecords) await consume(record);
  } else {
    let lastId = null;
    while (true) {
      const where = lastId ? `dos_id>'${lastId.replaceAll("'", "''")}'` : null;
      const parameters = {
        $select: NY_BUSINESS_REGISTRY_FIELDS.join(","),
        $order: "dos_id ASC",
        $limit: String(pageSize),
      };
      if (where) parameters.$where = where;
      const rows = await requestNyJson(soqlUrl(parameters), { fetchImpl, signal, sleep, type: "data", maximumResponseBytes: 75_000_000 });
      if (!Array.isArray(rows) || rows.length > pageSize) throw new Error("New York source page is invalid or exceeds the page-size limit.");
      if (rows.length === 0) break;
      for (const record of rows) await consume(record);
      lastId = previousId;
      logger(`Acquired ${count.toLocaleString("en-US")} New York active-extract entity records.`);
      if (rows.length < pageSize) break;
    }
  }
  if (count !== expectedCount) throw new Error(`New York source acquisition returned ${count} active-extract rows; preflight reported ${expectedCount}.`);
  return count;
}

function increment(map, key) {
  const normalized = key ?? "(blank)";
  map.set(normalized, (map.get(normalized) ?? 0) + 1);
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
      ny_business_registry_active_entity_snapshot: {
        status: count ? "published-active-entity-reported-location-addresses" : "no-eligible-reported-location-address-in-current-source-snapshot",
        organization_reported_location_address_count: count,
        source_release_id: context.sourceReleaseId,
        source_rows_updated_at: context.sourceRowsUpdatedAt,
        physical_site_count: null,
        physical_site_inference_permitted: false,
      },
    };
  });
}

export async function buildNyBusinessRegistry({
  outputRoot,
  zbpPointer,
  catalogMetadata = null,
  sourceRecords = null,
  sourceSnapshotPath = null,
  minimumOrganizations = 4_000_000,
  pageSize = 25_000,
  schemaFingerprintExpected = NY_BUSINESS_REGISTRY_SCHEMA_FINGERPRINT,
  fetchImpl = globalThis.fetch,
  signal,
  sleep,
  logger = console.log,
  now = () => new Date(),
} = {}) {
  if (!outputRoot || !zbpPointer) throw new Error("outputRoot and zbpPointer are required.");
  if (sourceRecords && sourceSnapshotPath) throw new Error("sourceRecords and sourceSnapshotPath are mutually exclusive.");
  if (sourceSnapshotPath) assertContained(outputRoot, sourceSnapshotPath, "New York staged source snapshot");
  if (!Number.isInteger(minimumOrganizations) || minimumOrganizations < 1) throw new Error("minimumOrganizations must be a positive integer.");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50_000) throw new Error("pageSize must be from 1 through 50000.");
  signal?.throwIfAborted?.();
  const retrievedAt = now().toISOString();
  const runId = randomUUID();
  const releaseId = `ny-business-registry-${releaseTimestamp(retrievedAt)}-${runId.slice(0, 8)}`;
  const stagingDirectory = path.join(outputRoot, ".staging", runId);
  await mkdir(stagingDirectory, { recursive: true });
  const baseline = await loadZbpBaseline(zbpPointer);
  const requestOptions = { fetchImpl, signal, sleep, type: "metadata" };
  const initialMetadata = catalogMetadata ?? await requestNyJson(NY_BUSINESS_REGISTRY_METADATA_URL, requestOptions);
  const catalog = validateCatalogMetadata(initialMetadata, schemaFingerprintExpected);
  const fixtureInput = sourceRecords !== null;
  const resumedSourceInput = sourceSnapshotPath ? gzipRecords(sourceSnapshotPath) : null;
  const sourceInput = sourceRecords ?? resumedSourceInput;
  const expectedCount = fixtureInput || (sourceSnapshotPath && catalogMetadata)
    ? Number(initialMetadata.selectedRecordCount ?? sourceRecords?.length)
    : await selectedRecordCount({ fetchImpl, signal, sleep, type: "data" });
  const expectedDistinctDosIds = fixtureInput || (sourceSnapshotPath && catalogMetadata)
    ? Number(initialMetadata.distinctDosIdCount ?? expectedCount)
    : await distinctDosIdCount({ fetchImpl, signal, sleep, type: "data" });
  if (expectedDistinctDosIds !== expectedCount) throw new Error(`New York distinct DOS-ID count ${expectedDistinctDosIds} does not match the ${expectedCount} source rows.`);
  if (!Number.isInteger(expectedCount) || expectedCount < minimumOrganizations) throw new Error(`New York active-extract organization count ${expectedCount} is below the ${minimumOrganizations} quality floor.`);
  const preflightArtifact = await writeArtifact(stagingDirectory, "source/preflight.json", json({
    dataset_id: NY_BUSINESS_REGISTRY_DATASET_ID,
    source_rows_updated_at: catalog.rowsUpdatedAtIso,
    selected_schema_fingerprint: catalog.schemaFingerprint,
    expected_source_rows: expectedCount,
    expected_distinct_dos_ids: expectedDistinctDosIds,
    selected_fields: NY_BUSINESS_REGISTRY_FIELDS,
  }), { artifact_type: "ny-business-registry-preflight", export_policy: "internal" });
  const rawWriter = await openGzipWriter(stagingDirectory, "source/active-corporations-selected-fields.jsonl.gz");
  let sourceArtifact;
  try {
    await acquireSource({ writer: rawWriter, sourceRecords: sourceInput, expectedCount, fetchImpl, signal, sleep, pageSize, logger });
    sourceArtifact = await closeGzipWriter(rawWriter, "ny-business-registry-source-jsonl-gzip", { export_policy: "internal" });
  } catch (error) {
    abortGzipWriters([rawWriter]);
    throw error;
  }
  if (!catalogMetadata) {
    const finalMetadata = await requestNyJson(NY_BUSINESS_REGISTRY_METADATA_URL, requestOptions);
    const finalCatalog = validateCatalogMetadata(finalMetadata, schemaFingerprintExpected);
    const finalCount = await selectedRecordCount({ fetchImpl, signal, sleep, type: "data" });
    const finalDistinctDosIds = await distinctDosIdCount({ fetchImpl, signal, sleep, type: "data" });
    if (finalCatalog.rowsUpdatedAt !== catalog.rowsUpdatedAt || finalCount !== expectedCount || finalDistinctDosIds !== expectedDistinctDosIds) throw new Error("New York source changed during acquisition; the run is not publishable.");
  }
  const sourceReleaseDigest = sha256(`${catalog.rowsUpdatedAtIso}\u0000${sourceArtifact.sha256}`);
  const sourceReleaseId = `ny-business-registry-${catalog.rowsUpdatedAtIso.slice(0, 10)}-${sourceReleaseDigest.slice(0, 16)}`;
  const context = { runId, retrievedAt, sourceRowsUpdatedAt: catalog.rowsUpdatedAtIso, sourceReleaseId, baselineByZip: baseline.byZip };
  const writers = new Map();
  for (const prefix of "0123456789abcdef") writers.set(prefix, await openGzipWriter(stagingDirectory, `derived/organizations/id-hash-prefix=${prefix}.jsonl.gz`));
  const quarantineWriter = await openGzipWriter(stagingDirectory, "derived/quarantine/invalid-organizations.jsonl.gz");
  const ids = new Set();
  const countsByZip = new Map();
  const businessTypes = new Map();
  const addressStates = new Map();
  const jurisdictions = new Map();
  const incorporationCounties = new Map();
  let organizations = 0;
  let eligibleUsAddresses = 0;
  let quarantinedRecords = 0;
  try {
    for await (const source of gzipRecords(path.join(stagingDirectory, sourceArtifact.path))) {
      signal?.throwIfAborted?.();
      let normalized;
      try {
        normalized = normalizeNyBusinessOrganization(source, context);
        assertNormalizedUsPostalFieldsDeep(normalized);
      } catch (error) {
        if (error.message !== "missing-or-invalid-organization-identity") throw error;
        await writeGzipRecord(quarantineWriter, {
          schema_version: NY_BUSINESS_REGISTRY_SCHEMA_VERSION,
          source_record_id: text(source.dos_id),
          reason: error.message,
          source_release_id: context.sourceReleaseId,
          ingest_run_id: context.runId,
          export_policy: "internal",
        });
        quarantinedRecords += 1;
        continue;
      }
      const id = normalized.external_identifiers[0].value;
      if (ids.has(id)) throw new Error(`Duplicate New York source record ID ${id}.`);
      ids.add(id);
      const partition = sha256(id)[0];
      await writeGzipRecord(writers.get(partition), normalized);
      increment(businessTypes, normalized.registration_profile.entity_type);
      increment(addressStates, normalized.reported_location_address.state_code ?? normalized.reported_location_address.state_source);
      increment(jurisdictions, normalized.registration_profile.jurisdiction);
      increment(incorporationCounties, normalized.registration_profile.county_of_incorporation);
      if (normalized.reported_location_address.eligible_for_us_zip_coverage) {
        const zipCode = normalized.reported_location_address.zip_code;
        countsByZip.set(zipCode, (countsByZip.get(zipCode) ?? 0) + 1);
        eligibleUsAddresses += 1;
      }
      organizations += 1;
    }
  } catch (error) {
    abortGzipWriters([...writers.values(), quarantineWriter]);
    throw error;
  }
  if (organizations + quarantinedRecords !== expectedCount) throw new Error("New York normalized and quarantined record counts do not reconcile to the source snapshot.");
  const artifacts = [
    preflightArtifact,
    sourceArtifact,
    ...await Promise.all([...writers.values()].map((writer) => closeGzipWriter(writer, "normalized-ny-business-organization-jsonl-gzip"))),
    await closeGzipWriter(quarantineWriter, "ny-business-registry-quarantine-jsonl-gzip", { export_policy: "internal" }),
  ];
  const coverageRows = buildZipCoverage(baseline.rows, countsByZip, context);
  artifacts.push(await writeArtifact(stagingDirectory, "derived/zip-coverage.jsonl", jsonLines(coverageRows), { artifact_type: "ny-business-registry-zip-coverage-jsonl", record_count: coverageRows.length }));
  artifacts.push(await writeArtifact(stagingDirectory, "derived/source-summary.json", json({
    active_extract_organizations: organizations,
    quarantined_source_records: quarantinedRecords,
    eligible_reported_us_location_addresses: eligibleUsAddresses,
    organizations_without_eligible_us_zip_address: organizations - eligibleUsAddresses,
    business_types: sortedCounts(businessTypes),
    reported_address_states: sortedCounts(addressStates),
    jurisdictions: sortedCounts(jurisdictions),
    incorporation_counties: sortedCounts(incorporationCounties),
  }), { artifact_type: "ny-business-registry-source-summary" }));
  artifacts.push(await writeArtifact(stagingDirectory, "source/release-metadata.json", json({
    dataset_id: NY_BUSINESS_REGISTRY_DATASET_ID,
    dataset_name: initialMetadata.name,
    publisher: initialMetadata.attribution,
    license: initialMetadata.license,
    source_rows_updated_at: catalog.rowsUpdatedAtIso,
    source_rows_updated_at_unix: catalog.rowsUpdatedAt,
    selected_schema: NY_BUSINESS_REGISTRY_SCHEMA,
    selected_schema_fingerprint: catalog.schemaFingerprint,
    selected_fields: NY_BUSINESS_REGISTRY_FIELDS,
    explicitly_excluded_field_classes: ["DOS process and service-of-process names and addresses", "CEO or chairman names and addresses", "registered-agent names and addresses", "location name line"],
    query: { filter: null, order: "dos_id ASC", keyset_pagination: true, page_size: pageSize },
    expected_active_extract_record_count: expectedCount,
    expected_distinct_dos_id_count: expectedDistinctDosIds,
    source_urls: { metadata: NY_BUSINESS_REGISTRY_METADATA_URL, api: NY_BUSINESS_REGISTRY_API_URL, documentation: NY_BUSINESS_REGISTRY_STORY_URL },
  }), { artifact_type: "ny-business-registry-source-release-metadata" }));
  const manifest = {
    schema_version: NY_BUSINESS_REGISTRY_SCHEMA_VERSION,
    dataset_id: "ny-business-registry-active-entities",
    connector: { id: "ny-business-registry", version: "1.0.1" },
    release_id: releaseId,
    run_id: runId,
    retrieved_at: retrievedAt,
    source_rows_updated_at: catalog.rowsUpdatedAtIso,
    source_release_id: sourceReleaseId,
    status: "published",
    complete_selected_business_entities_snapshot: true,
    coverage: {
      source_active_extract_records: expectedCount,
      organizations_published: organizations,
      quarantined_source_records: quarantinedRecords,
      eligible_reported_us_location_addresses: eligibleUsAddresses,
      organizations_without_eligible_us_zip_address: organizations - eligibleUsAddresses,
      source_zip_codes: countsByZip.size,
      zip_union_records: coverageRows.length,
      physical_sites: null,
      establishments: null,
    },
    quality_gates: {
      minimum_organizations: minimumOrganizations,
      source_published_and_quarantined_counts_match: organizations + quarantinedRecords === expectedCount,
      selected_schema_fingerprint: catalog.schemaFingerprint,
      duplicate_source_record_ids: 0,
      source_unchanged_during_acquisition: true,
    },
    dependencies: [
      { dataset_id: baseline.manifest.dataset_id, release_id: baseline.manifest.release_id, manifest_sha256: baseline.manifestSha256 },
      baseline.manifest.geography_dependency,
    ],
    source: {
      publisher: "New York State Department of State, Division of Corporations",
      catalog_dataset_id: NY_BUSINESS_REGISTRY_DATASET_ID,
      source_page: NY_BUSINESS_REGISTRY_STORY_URL,
      api_url: NY_BUSINESS_REGISTRY_API_URL,
      access_method: fixtureInput ? "explicit test fixture records" : sourceSnapshotPath ? "validated local staged source snapshot originally acquired from the anonymous public Socrata API" : "anonymous public Socrata API with stable keyset pagination",
      license: "OPEN-NY Terms of Use; no dataset-specific catalog license",
      api_key_used: false,
      policy_profile: "config/source-policies/ny-business-registry.json",
    },
    limitations: [
      "The dataset is an active-only monthly extract intended for general public knowledge; inclusion is not proof of current legal status, current operations, legality, solvency, public access, licensure, or an open storefront.",
      "The dataset excludes inactive and temporarily suspended entities plus assumed names and is not a census of every business operating in New York or the United States.",
      "Reported location addresses are collected through biennial statements, may be missing for newer entities, and may not reflect an actual or current operating location; no physical site or establishment is created from them.",
      "DOS process/service-of-process, CEO/chairman, registered-agent, and location-name fields are excluded before acquisition.",
      "The dataset cannot be used as legal documentation for bank loans, court cases, incorporation, or another legal purpose.",
      "Current USPS ZIP validity remains unverified until an authorized operational ZIP denominator is integrated.",
    ],
    artifacts,
  };
  await writeArtifact(stagingDirectory, "manifest.json", json(manifest));
  const publication = await publishNyBusinessRegistryStaging({ outputRoot, stagingRunId: runId, expectedReleaseId: releaseId });
  logger(`Published ${organizations.toLocaleString("en-US")} New York active-extract organizations.`);
  return { manifest, releaseDirectory: publication.releaseDirectory, pointerPath: publication.pointerPath };
}

function containsExcludedField(value) {
  if (Array.isArray(value)) return value.some(containsExcludedField);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) => EXCLUDED_SOURCE_FIELDS.has(key.toLowerCase()) || containsExcludedField(child));
}

function replayComparisonRecord(record) {
  const comparison = { ...record };
  delete comparison.geography;
  return comparison;
}

export async function publishNyBusinessRegistryStaging({ outputRoot, stagingRunId, expectedReleaseId = null } = {}) {
  if (!outputRoot || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stagingRunId ?? "")) {
    throw new Error("outputRoot and a valid stagingRunId are required.");
  }
  const stagingRoot = path.join(outputRoot, ".staging");
  const stagingDirectory = path.resolve(stagingRoot, stagingRunId);
  assertContained(stagingRoot, stagingDirectory, "New York staging run");
  const manifestPath = path.join(stagingDirectory, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.run_id !== stagingRunId || manifest.dataset_id !== "ny-business-registry-active-entities" || manifest.status !== "published") {
    throw new Error("New York staging manifest does not match the requested complete run.");
  }
  if (expectedReleaseId && manifest.release_id !== expectedReleaseId) throw new Error("New York staging release ID does not match the build result.");
  await verifyNyBusinessRegistry(manifestPath);
  const releasesDirectory = path.join(outputRoot, "releases");
  await mkdir(releasesDirectory, { recursive: true });
  const releaseDirectory = path.join(releasesDirectory, manifest.release_id);
  try {
    await stat(releaseDirectory);
    throw new Error(`New York release destination already exists: ${manifest.release_id}.`);
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
  if (!(await stat(releaseDirectory)).isDirectory()) throw new Error("Published New York Business Registry release is not a directory.");
  return { manifest, releaseDirectory, pointerPath };
}

export async function verifyNyBusinessRegistry(manifestPath) {
  const absoluteManifestPath = path.resolve(manifestPath);
  const releaseDirectory = path.dirname(absoluteManifestPath);
  const manifest = JSON.parse(await readFile(absoluteManifestPath, "utf8"));
  const failures = [];
  if (manifest.dataset_id !== "ny-business-registry-active-entities" || manifest.status !== "published" || !manifest.complete_selected_business_entities_snapshot) failures.push({ path: "manifest.json", reason: "unexpected or incomplete manifest" });
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
  const sourceArtifacts = manifest.artifacts?.filter((artifact) => artifact.artifact_type === "ny-business-registry-source-jsonl-gzip") ?? [];
  const normalizedArtifacts = manifest.artifacts?.filter((artifact) => artifact.artifact_type === "normalized-ny-business-organization-jsonl-gzip") ?? [];
  const quarantineArtifacts = manifest.artifacts?.filter((artifact) => artifact.artifact_type === "ny-business-registry-quarantine-jsonl-gzip") ?? [];
  const expectedReplayHashes = new Map([..."0123456789abcdef"].map((prefix) => [prefix, createHash("sha256")]));
  const actualReplayHashes = new Map([..."0123456789abcdef"].map((prefix) => [prefix, createHash("sha256")]));
  const expectedQuarantineHash = createHash("sha256");
  const actualQuarantineHash = createHash("sha256");
  const replayContext = {
    runId: manifest.run_id,
    retrievedAt: manifest.retrieved_at,
    sourceRowsUpdatedAt: manifest.source_rows_updated_at,
    sourceReleaseId: manifest.source_release_id,
    baselineByZip: new Map(),
  };
  if (sourceArtifacts.length !== 1 || sourceArtifacts[0]?.export_policy !== "internal") failures.push({ path: "manifest.json", reason: "expected one internal selected-field source artifact" });
  if (normalizedArtifacts.length !== 16) failures.push({ path: "manifest.json", reason: "expected 16 normalized organization partitions" });
  if (quarantineArtifacts.length !== 1 || quarantineArtifacts[0]?.export_policy !== "internal") failures.push({ path: "manifest.json", reason: "expected one internal quarantine artifact" });
  if (sourceArtifacts.length === 1) {
    const digest = sha256(`${manifest.source_rows_updated_at}\u0000${sourceArtifacts[0].sha256}`);
    if (manifest.source_release_id !== `ny-business-registry-${manifest.source_rows_updated_at.slice(0, 10)}-${digest.slice(0, 16)}`) failures.push({ path: "manifest.json", reason: "source release ID is not bound to refresh timestamp and selected source checksum" });
    try {
      let sourceCount = 0;
      let previousId = null;
      for await (const record of gzipRecords(path.join(releaseDirectory, sourceArtifacts[0].path))) {
        for (const field of Object.keys(record)) if (!NY_BUSINESS_REGISTRY_FIELDS.includes(field)) throw new Error(`unapproved source field ${field}`);
        const id = text(record.dos_id);
        if (!/^\d{1,8}$/.test(id ?? "") || (previousId && id.localeCompare(previousId, "en", { numeric: false }) <= 0)) throw new Error(`invalid source ordering or DOS ID at ${id}`);
        previousId = id;
        try {
          const expected = normalizeNyBusinessOrganization(record, replayContext);
          expectedReplayHashes.get(sha256(id)[0]).update(json(replayComparisonRecord(expected)));
        } catch (error) {
          if (error.message !== "missing-or-invalid-organization-identity") throw error;
          expectedQuarantineHash.update(json({
            schema_version: NY_BUSINESS_REGISTRY_SCHEMA_VERSION,
            source_record_id: id,
            reason: error.message,
            source_release_id: manifest.source_release_id,
            ingest_run_id: manifest.run_id,
            export_policy: "internal",
          }));
        }
        sourceCount += 1;
      }
      if (sourceCount !== sourceArtifacts[0].record_count || sourceCount !== manifest.coverage?.source_active_extract_records) throw new Error("source record count mismatch");
    } catch (error) {
      failures.push({ path: sourceArtifacts[0].path, reason: `source validation failed: ${error.message}` });
    }
  }
  const ids = new Set();
  const countsByZip = new Map();
  const quarantineIds = new Set();
  let organizations = 0;
  let eligibleAddresses = 0;
  for (const artifact of normalizedArtifacts) {
    try {
      const prefix = artifact.path.match(/id-hash-prefix=([0-9a-f])/)?.[1];
      let partitionCount = 0;
      for await (const record of gzipRecords(path.join(releaseDirectory, artifact.path))) {
        const id = record.external_identifiers?.find((item) => item.type === "ny_dos_id")?.value;
        if (!id || ids.has(id) || sha256(id)[0] !== prefix) throw new Error(`duplicate, missing, or incorrectly partitioned source ID ${id}`);
        ids.add(id);
        if (record.entity_candidates?.organization_id !== `organization:ny_dos_id_${id}` || record.entity_candidates?.physical_site_id || record.entity_candidates?.establishment_id) throw new Error(`invalid organization-only identity for ${id}`);
        if (record.source_status?.status_class !== "active-only-monthly-extract-membership" || record.source_status?.value !== "included-in-new-york-active-corporations-monthly-extract-as-of-retrieval") throw new Error(`invalid source status for ${id}`);
        if (record.provenance?.source_release_id !== manifest.source_release_id || record.provenance?.policy_id !== "ny-business-registry" || record.export_policy !== "public-open-ny-terms") throw new Error(`invalid provenance for ${id}`);
        if (containsExcludedField(record)) throw new Error(`excluded field leaked for ${id}`);
        if (record.reported_location_address?.address_scope !== "nysdos-reported-location-from-biennial-statement-not-verified-current-physical-operating-site") throw new Error(`invalid address scope for ${id}`);
        if (record.reported_location_address?.eligible_for_us_zip_coverage) {
          const zipCode = record.reported_location_address.zip_code;
          if (!/^\d{5}$/.test(zipCode ?? "")) throw new Error(`invalid eligible ZIP for ${id}`);
          countsByZip.set(zipCode, (countsByZip.get(zipCode) ?? 0) + 1);
          eligibleAddresses += 1;
        }
        actualReplayHashes.get(prefix).update(json(replayComparisonRecord(record)));
        partitionCount += 1;
      }
      if (partitionCount !== artifact.record_count) throw new Error("partition record count mismatch");
      organizations += partitionCount;
    } catch (error) {
      failures.push({ path: artifact.path, reason: `normalized validation failed: ${error.message}` });
    }
  }
  let quarantinedRecords = 0;
  if (quarantineArtifacts.length === 1) {
    try {
      for await (const record of gzipRecords(path.join(releaseDirectory, quarantineArtifacts[0].path))) {
        if (!/^\d{1,8}$/.test(record.source_record_id ?? "") || record.reason !== "missing-or-invalid-organization-identity" || record.export_policy !== "internal" || record.source_release_id !== manifest.source_release_id || quarantineIds.has(record.source_record_id) || ids.has(record.source_record_id)) {
          throw new Error(`invalid quarantine record ${record.source_record_id}`);
        }
        quarantineIds.add(record.source_record_id);
        actualQuarantineHash.update(json(record));
        quarantinedRecords += 1;
      }
      if (quarantinedRecords !== quarantineArtifacts[0].record_count) throw new Error("quarantine record count mismatch");
    } catch (error) {
      failures.push({ path: quarantineArtifacts[0].path, reason: `quarantine validation failed: ${error.message}` });
    }
  }
  if (organizations !== manifest.coverage?.organizations_published) failures.push({ path: "manifest.json", reason: "published organization count does not reconcile" });
  if (organizations + quarantinedRecords !== manifest.coverage?.source_active_extract_records || quarantinedRecords !== manifest.coverage?.quarantined_source_records) failures.push({ path: "manifest.json", reason: "published and quarantined counts do not reconcile" });
  if (eligibleAddresses !== manifest.coverage?.eligible_reported_us_location_addresses) failures.push({ path: "manifest.json", reason: "eligible address count does not reconcile" });
  for (const prefix of "0123456789abcdef") {
    if (expectedReplayHashes.get(prefix).digest("hex") !== actualReplayHashes.get(prefix).digest("hex")) failures.push({ path: `derived/organizations/id-hash-prefix=${prefix}.jsonl.gz`, reason: "source replay does not match normalized records" });
  }
  if (expectedQuarantineHash.digest("hex") !== actualQuarantineHash.digest("hex")) failures.push({ path: quarantineArtifacts[0]?.path ?? "manifest.json", reason: "source replay does not match quarantine records" });
  const zipArtifact = manifest.artifacts?.find((artifact) => artifact.artifact_type === "ny-business-registry-zip-coverage-jsonl");
  if (!zipArtifact) failures.push({ path: "manifest.json", reason: "missing ZIP coverage artifact" });
  else {
    try {
      const rows = (await readFile(path.join(releaseDirectory, zipArtifact.path), "utf8")).split(/\r?\n/).filter(Boolean).map(JSON.parse);
      if (rows.length !== zipArtifact.record_count || rows.length !== manifest.coverage?.zip_union_records) throw new Error("ZIP row count mismatch");
      const total = rows.reduce((sum, row) => sum + row.ny_business_registry_active_entity_snapshot.organization_reported_location_address_count, 0);
      if (total !== eligibleAddresses) throw new Error("ZIP organization address counts do not reconcile");
      for (const row of rows) {
        if ((countsByZip.get(row.zip_code) ?? 0) !== row.ny_business_registry_active_entity_snapshot.organization_reported_location_address_count) throw new Error(`ZIP ${row.zip_code} does not reconcile`);
        if (row.current_usps_validity?.status !== "unverified") throw new Error(`ZIP ${row.zip_code} has unsupported USPS validity`);
        if (row.ny_business_registry_active_entity_snapshot.physical_site_count !== null || row.ny_business_registry_active_entity_snapshot.physical_site_inference_permitted !== false) throw new Error(`ZIP ${row.zip_code} implies a physical site`);
      }
    } catch (error) {
      failures.push({ path: zipArtifact.path, reason: `ZIP validation failed: ${error.message}` });
    }
  }
  if (failures.length) {
    const error = new Error(`New York Business Registry release verification failed for ${failures.length} check(s).`);
    error.failures = failures;
    throw error;
  }
  return { dataset_id: manifest.dataset_id, release_id: manifest.release_id, source_release_id: manifest.source_release_id, artifact_count: manifest.artifacts.length, coverage: manifest.coverage };
}
