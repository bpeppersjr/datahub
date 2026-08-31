import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { finished } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";

export const CO_BUSINESS_REGISTRY_SCHEMA_VERSION = "1.0.0";
export const CO_BUSINESS_REGISTRY_TRANSFORMATION_VERSION = "co-business-registry@1.0.0";
export const CO_BUSINESS_REGISTRY_DATASET_ID = "4ykn-tg5h";
export const CO_BUSINESS_REGISTRY_METADATA_URL = `https://data.colorado.gov/api/views/${CO_BUSINESS_REGISTRY_DATASET_ID}`;
export const CO_BUSINESS_REGISTRY_API_URL = `https://data.colorado.gov/resource/${CO_BUSINESS_REGISTRY_DATASET_ID}.json`;
export const CO_BUSINESS_REGISTRY_STORY_URL = "https://data.colorado.gov/Business/Business-Entities-in-Colorado/4ykn-tg5h";

export const CO_BUSINESS_REGISTRY_SCHEMA = Object.freeze([
  ["entityid", "number"],
  ["entityname", "text"],
  ["principaladdress1", "text"],
  ["principaladdress2", "text"],
  ["principalcity", "text"],
  ["principalstate", "text"],
  ["principalzipcode", "text"],
  ["principalcountry", "text"],
  ["entitystatus", "text"],
  ["jurisdictonofformation", "text"],
  ["entitytype", "text"],
  ["entityformdate", "calendar_date"],
]);

export const CO_BUSINESS_REGISTRY_FIELDS = Object.freeze(CO_BUSINESS_REGISTRY_SCHEMA.map(([field]) => field));
export const CO_BUSINESS_REGISTRY_SCHEMA_FINGERPRINT = "c5bebf19a79dbbde687e19b9bb383111dd8ee96a385ba7551a8eeaf3c4f8c0d2";

const US_STATE_AND_TERRITORY_CODES = new Set([
  "AL", "AK", "AS", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "GU", "HI", "ID", "IL", "IN", "IA", "KS", "KY",
  "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "MP", "OH", "OK",
  "OR", "PA", "PR", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "VI", "WA", "WV", "WI", "WY",
]);

const US_COUNTRY_VALUES = new Set(["UNITED STATES", "UNITED STATES OF AMERICA", "USA", "U.S.A.", "US", "U.S."]);
const EXCLUDED_SOURCE_FIELDS = new Set([
  "mailingaddress1", "mailingaddress2", "mailingcity", "mailingstate", "mailingzipcode", "mailingcountry",
  "agentfirstname", "agentmiddlename", "agentlastname", "agentsuffix", "agentorganizationname",
  "agentprincipaladdress1", "agentprincipaladdress2", "agentprincipalcity", "agentprincipalstate", "agentprincipalzipcode", "agentprincipalcountry",
  "agentmailingaddress1", "agentmailingaddress2", "agentmailingcity", "agentmailingstate", "agentmailingzipcode", "agentmailingcountry",
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
  if (!Number.isInteger(unixSeconds) || unixSeconds <= 0) throw new Error("Colorado catalog rowsUpdatedAt must be a positive Unix timestamp.");
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
  return normalized && US_STATE_AND_TERRITORY_CODES.has(normalized) ? normalized : null;
}

function countryScope(value) {
  const raw = text(value);
  if (!raw) return "country-not-reported";
  return US_COUNTRY_VALUES.has(raw.toUpperCase()) ? "reported-united-states" : "reported-other-country-or-unrecognized-value";
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
    source_id: "colorado-business-entities-good-standing-or-delinquent",
    source_release_id: context.sourceReleaseId,
    source_record_id: sourceRecordId,
    ingest_run_id: context.runId,
    transformation_version: CO_BUSINESS_REGISTRY_TRANSFORMATION_VERSION,
    policy_id: "co-business-registry",
  };
}

export function schemaFingerprint(columns) {
  const byField = new Map((columns ?? []).map((column) => [column.fieldName, column.dataTypeName]));
  const actual = CO_BUSINESS_REGISTRY_SCHEMA.map(([field]) => [field, byField.get(field) ?? null]);
  return sha256(actual.map(([field, type]) => `${field}:${type}`).join("\u0000"));
}

function selectedRecord(row) {
  return Object.fromEntries(CO_BUSINESS_REGISTRY_FIELDS.filter((field) => row[field] !== undefined).map((field) => [field, row[field]]));
}

export function normalizeCoBusinessOrganization(source, context) {
  const sourceRecordId = text(source.entityid);
  const legalName = text(source.entityname);
  if (!sourceRecordId || !/^\d{11}$/.test(sourceRecordId) || !legalName) throw new Error("missing-or-invalid-organization-identity");
  const status = text(source.entitystatus);
  if (!new Set(["Good Standing", "Delinquent"]).has(status)) throw new Error("source-record-is-outside-selected-registration-statuses");
  const postal = postalCode(source.principalzipcode);
  const state = stateCode(source.principalstate);
  const country = countryScope(source.principalcountry);
  const street = text(source.principaladdress1);
  const city = text(source.principalcity);
  const addressEligibleForUsZipCoverage = Boolean(street && city && state && postal.zip_code && country !== "reported-other-country-or-unrecognized-value");
  const organizationId = `organization:co_sos_record_${sourceRecordId}`;
  return {
    schema_version: CO_BUSINESS_REGISTRY_SCHEMA_VERSION,
    normalized_record_id: `co-business-registry:organization:${sourceRecordId}`,
    entity_candidates: { organization_id: organizationId, identity_status: "provisional" },
    external_identifiers: [
      { type: "co_business_entity_id", value: sourceRecordId, source_field: "entityid" },
    ],
    legal_name: legalName,
    other_names: [],
    reported_business_address: {
      street,
      unit_or_additional: text(source.principaladdress2),
      city,
      state_source: text(source.principalstate),
      state_code: state,
      postal_code_source: postal.raw,
      zip_code: postal.zip_code,
      postal_code: postal.postal_code,
      zip4: postal.zip4,
      postal_code_status: postal.status,
      country_source: text(source.principalcountry),
      country_scope: country,
      address_scope: "secretary-of-state-principal-office-address-not-verified-physical-operating-site",
      eligible_for_us_zip_coverage: addressEligibleForUsZipCoverage,
    },
    reported_address_coordinate: null,
    geography: geography(addressEligibleForUsZipCoverage ? postal.zip_code : null, context.baselineByZip),
    registration_profile: {
      entity_type: text(source.entitytype),
      jurisdiction_of_formation: text(source.jurisdictonofformation),
      formation_date: date(source.entityformdate),
    },
    source_status: {
      value: "listed-good-standing-or-delinquent-in-colorado-business-registry-as-of-retrieval",
      status,
      status_class: status === "Good Standing" ? "required-reports-and-required-information-current-in-registry" : "uncured-registry-delinquency",
      source_rows_updated_at: context.sourceRowsUpdatedAt,
      semantics: "source-registration-status-not-independent-proof-of-current-operations-legality-reputation-or-an-open-storefront",
    },
    observed_at: context.retrievedAt,
    provenance: provenance(context, sourceRecordId),
    export_policy: "public",
  };
}

function assertAllowedUrl(urlValue, type) {
  const url = new URL(urlValue);
  if (url.protocol !== "https:" || url.hostname !== "data.colorado.gov") throw new Error(`Colorado ${type} URL is outside the allowlist.`);
  const expectedPath = type === "metadata" ? `/api/views/${CO_BUSINESS_REGISTRY_DATASET_ID}` : `/resource/${CO_BUSINESS_REGISTRY_DATASET_ID}.json`;
  if (url.pathname !== expectedPath) throw new Error(`Colorado ${type} URL has an unexpected path.`);
  return url;
}

function retryDelay(response, attempt) {
  const retryAfter = Number(response?.headers?.get?.("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter >= 0) return Math.min(10_000, retryAfter * 1000);
  return Math.min(4_000, 250 * (2 ** attempt));
}

export async function requestCoJson(urlValue, {
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
      if (response.status >= 300 && response.status < 400) throw new Error("Colorado source redirect rejected.");
      if ((response.status === 429 || response.status >= 500) && attempt < attempts - 1) {
        await sleep(retryDelay(response, attempt));
        continue;
      }
      if (!response.ok) throw new Error(`Colorado source request failed with HTTP ${response.status}.`);
      const declaredBytes = Number(response.headers?.get?.("content-length"));
      if (Number.isFinite(declaredBytes) && declaredBytes > maximumResponseBytes) throw new Error("Colorado source response exceeds the configured byte limit.");
      const body = await response.text();
      if (Buffer.byteLength(body) > maximumResponseBytes) throw new Error("Colorado source response exceeds the configured byte limit.");
      return JSON.parse(body);
    } catch (error) {
      lastError = error;
      if (error.name === "AbortError" || /redirect rejected|byte limit|HTTP 4\d\d/.test(error.message) || attempt === attempts - 1) throw error;
      await sleep(250 * (2 ** attempt));
    }
  }
  throw lastError;
}

function validateCatalogMetadata(metadata, expectedFingerprint = CO_BUSINESS_REGISTRY_SCHEMA_FINGERPRINT) {
  if (metadata?.id !== CO_BUSINESS_REGISTRY_DATASET_ID || metadata?.name !== "Business Entities in Colorado") throw new Error("Unexpected Colorado Business Entities catalog metadata.");
  if (metadata?.license?.name !== "Public Domain") throw new Error("Colorado Business Entities catalog license is no longer Public Domain.");
  if (metadata?.attribution !== "CDOS") throw new Error("Colorado Business Entities attribution changed.");
  const fingerprint = schemaFingerprint(metadata.columns);
  if (fingerprint !== expectedFingerprint) throw new Error(`Colorado Business Entities selected schema changed (${fingerprint}).`);
  return { rowsUpdatedAt: metadata.rowsUpdatedAt, rowsUpdatedAtIso: sourceTimestamp(metadata.rowsUpdatedAt), schemaFingerprint: fingerprint };
}

function soqlUrl(parameters) {
  const url = new URL(CO_BUSINESS_REGISTRY_API_URL);
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
  return url.toString();
}

const SELECTED_STATUS_FILTER = "entitystatus in('Good Standing','Delinquent')";

async function selectedRecordCount(options) {
  const rows = await requestCoJson(soqlUrl({ $select: "count(*) as records", $where: SELECTED_STATUS_FILTER }), options);
  const count = Number(rows?.[0]?.records);
  if (!Number.isInteger(count) || count < 0) throw new Error("Colorado selected-status record count response is invalid.");
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
  for (const field of Object.keys(record)) if (!CO_BUSINESS_REGISTRY_FIELDS.includes(field)) throw new Error(`Unapproved Colorado source field ${field}.`);
  return selectedRecord(record);
}

async function acquireSource({ writer, sourceRecords, expectedCount, fetchImpl, signal, sleep, pageSize, logger }) {
  let count = 0;
  let previousId = null;
  const consume = async (input) => {
    signal?.throwIfAborted?.();
    const record = sourceSafeRecord(input);
    const id = text(record.entityid);
    if (!/^\d{11}$/.test(id ?? "") || !new Set(["Good Standing", "Delinquent"]).has(text(record.entitystatus))) throw new Error("Colorado source acquisition received an invalid or out-of-scope row.");
    if (previousId !== null && id.localeCompare(previousId) <= 0) throw new Error(`Colorado source IDs are not strictly increasing at ${id}.`);
    previousId = id;
    await writeGzipRecord(writer, record);
    count += 1;
  };
  if (sourceRecords) {
    for await (const record of sourceRecords) await consume(record);
  } else {
    let lastId = null;
    while (true) {
      const where = lastId ? `${SELECTED_STATUS_FILTER} AND entityid>${lastId}` : SELECTED_STATUS_FILTER;
      const rows = await requestCoJson(soqlUrl({
        $select: CO_BUSINESS_REGISTRY_FIELDS.join(","),
        $where: where,
        $order: "entityid ASC",
        $limit: String(pageSize),
      }), { fetchImpl, signal, sleep, type: "data" });
      if (!Array.isArray(rows) || rows.length > pageSize) throw new Error("Colorado source page is invalid or exceeds the page-size limit.");
      if (rows.length === 0) break;
      for (const record of rows) await consume(record);
      lastId = previousId;
      logger(`Acquired ${count.toLocaleString("en-US")} Good Standing or Delinquent Colorado entity records.`);
      if (rows.length < pageSize) break;
    }
  }
  if (count !== expectedCount) throw new Error(`Colorado source acquisition returned ${count} selected-status rows; preflight reported ${expectedCount}.`);
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
      co_business_registry_registration_snapshot: {
        status: count ? "published-selected-registration-principal-office-addresses" : "no-eligible-principal-office-address-in-current-source-snapshot",
        organization_reported_business_address_count: count,
        source_release_id: context.sourceReleaseId,
        source_rows_updated_at: context.sourceRowsUpdatedAt,
        physical_site_count: null,
        physical_site_inference_permitted: false,
      },
    };
  });
}

export async function buildCoBusinessRegistry({
  outputRoot,
  zbpPointer,
  catalogMetadata = null,
  sourceRecords = null,
  sourceSnapshotPath = null,
  minimumOrganizations = 2_000_000,
  pageSize = 25_000,
  schemaFingerprintExpected = CO_BUSINESS_REGISTRY_SCHEMA_FINGERPRINT,
  fetchImpl = globalThis.fetch,
  signal,
  sleep,
  logger = console.log,
  now = () => new Date(),
} = {}) {
  if (!outputRoot || !zbpPointer) throw new Error("outputRoot and zbpPointer are required.");
  if (sourceRecords && sourceSnapshotPath) throw new Error("sourceRecords and sourceSnapshotPath are mutually exclusive.");
  if (sourceSnapshotPath) assertContained(outputRoot, sourceSnapshotPath, "Colorado staged source snapshot");
  if (!Number.isInteger(minimumOrganizations) || minimumOrganizations < 1) throw new Error("minimumOrganizations must be a positive integer.");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50_000) throw new Error("pageSize must be from 1 through 50000.");
  signal?.throwIfAborted?.();
  const retrievedAt = now().toISOString();
  const runId = randomUUID();
  const releaseId = `co-business-registry-${releaseTimestamp(retrievedAt)}-${runId.slice(0, 8)}`;
  const stagingDirectory = path.join(outputRoot, ".staging", runId);
  await mkdir(stagingDirectory, { recursive: true });
  const baseline = await loadZbpBaseline(zbpPointer);
  const requestOptions = { fetchImpl, signal, sleep, type: "metadata" };
  const initialMetadata = catalogMetadata ?? await requestCoJson(CO_BUSINESS_REGISTRY_METADATA_URL, requestOptions);
  const catalog = validateCatalogMetadata(initialMetadata, schemaFingerprintExpected);
  const fixtureInput = sourceRecords !== null;
  const resumedSourceInput = sourceSnapshotPath ? gzipRecords(sourceSnapshotPath) : null;
  const sourceInput = sourceRecords ?? resumedSourceInput;
  const expectedCount = fixtureInput || (sourceSnapshotPath && catalogMetadata)
    ? Number(initialMetadata.selectedRecordCount ?? sourceRecords?.length)
    : await selectedRecordCount({ fetchImpl, signal, sleep, type: "data" });
  if (!Number.isInteger(expectedCount) || expectedCount < minimumOrganizations) throw new Error(`Colorado selected-status organization count ${expectedCount} is below the ${minimumOrganizations} quality floor.`);
  const rawWriter = await openGzipWriter(stagingDirectory, "source/good-standing-or-delinquent-business-entities.jsonl.gz");
  let sourceArtifact;
  try {
    await acquireSource({ writer: rawWriter, sourceRecords: sourceInput, expectedCount, fetchImpl, signal, sleep, pageSize, logger });
    sourceArtifact = await closeGzipWriter(rawWriter, "co-business-registry-source-jsonl-gzip", { export_policy: "internal" });
  } catch (error) {
    abortGzipWriters([rawWriter]);
    throw error;
  }
  if (!catalogMetadata) {
    const finalMetadata = await requestCoJson(CO_BUSINESS_REGISTRY_METADATA_URL, requestOptions);
    const finalCatalog = validateCatalogMetadata(finalMetadata, schemaFingerprintExpected);
    const finalCount = await selectedRecordCount({ fetchImpl, signal, sleep, type: "data" });
    if (finalCatalog.rowsUpdatedAt !== catalog.rowsUpdatedAt || finalCount !== expectedCount) throw new Error("Colorado source changed during acquisition; the run is not publishable.");
  }
  const sourceReleaseDigest = sha256(`${catalog.rowsUpdatedAtIso}\u0000${sourceArtifact.sha256}`);
  const sourceReleaseId = `co-business-registry-${catalog.rowsUpdatedAtIso.slice(0, 10)}-${sourceReleaseDigest.slice(0, 16)}`;
  const context = { runId, retrievedAt, sourceRowsUpdatedAt: catalog.rowsUpdatedAtIso, sourceReleaseId, baselineByZip: baseline.byZip };
  const writers = new Map();
  for (const prefix of "0123456789abcdef") writers.set(prefix, await openGzipWriter(stagingDirectory, `derived/organizations/id-hash-prefix=${prefix}.jsonl.gz`));
  const quarantineWriter = await openGzipWriter(stagingDirectory, "derived/quarantine/invalid-organizations.jsonl.gz");
  const ids = new Set();
  const countsByZip = new Map();
  const businessTypes = new Map();
  const statusValues = new Map();
  const addressStates = new Map();
  const formationJurisdictions = new Map();
  let organizations = 0;
  let eligibleUsAddresses = 0;
  let goodStandingOrganizations = 0;
  let delinquentOrganizations = 0;
  let quarantinedRecords = 0;
  try {
    for await (const source of gzipRecords(path.join(stagingDirectory, sourceArtifact.path))) {
      signal?.throwIfAborted?.();
      let normalized;
      try {
        normalized = normalizeCoBusinessOrganization(source, context);
      } catch (error) {
        if (error.message !== "missing-or-invalid-organization-identity") throw error;
        await writeGzipRecord(quarantineWriter, {
          schema_version: CO_BUSINESS_REGISTRY_SCHEMA_VERSION,
          source_record_id: text(source.entityid),
          source_status: text(source.entitystatus),
          reason: error.message,
          source_release_id: context.sourceReleaseId,
          ingest_run_id: context.runId,
          export_policy: "internal",
        });
        quarantinedRecords += 1;
        continue;
      }
      const id = normalized.external_identifiers[0].value;
      if (ids.has(id)) throw new Error(`Duplicate Colorado source record ID ${id}.`);
      ids.add(id);
      const partition = sha256(id)[0];
      await writeGzipRecord(writers.get(partition), normalized);
      increment(businessTypes, normalized.registration_profile.entity_type);
      increment(statusValues, normalized.source_status.status);
      increment(addressStates, normalized.reported_business_address.state_code ?? normalized.reported_business_address.state_source);
      increment(formationJurisdictions, normalized.registration_profile.jurisdiction_of_formation);
      if (normalized.source_status.status === "Good Standing") goodStandingOrganizations += 1;
      if (normalized.source_status.status === "Delinquent") delinquentOrganizations += 1;
      if (normalized.reported_business_address.eligible_for_us_zip_coverage) {
        const zipCode = normalized.reported_business_address.zip_code;
        countsByZip.set(zipCode, (countsByZip.get(zipCode) ?? 0) + 1);
        eligibleUsAddresses += 1;
      }
      organizations += 1;
    }
  } catch (error) {
    abortGzipWriters([...writers.values(), quarantineWriter]);
    throw error;
  }
  if (organizations + quarantinedRecords !== expectedCount) throw new Error("Colorado normalized and quarantined record counts do not reconcile to the source snapshot.");
  const artifacts = [
    sourceArtifact,
    ...await Promise.all([...writers.values()].map((writer) => closeGzipWriter(writer, "normalized-co-business-organization-jsonl-gzip"))),
    await closeGzipWriter(quarantineWriter, "co-business-registry-quarantine-jsonl-gzip", { export_policy: "internal" }),
  ];
  const coverageRows = buildZipCoverage(baseline.rows, countsByZip, context);
  artifacts.push(await writeArtifact(stagingDirectory, "derived/zip-coverage.jsonl", jsonLines(coverageRows), { artifact_type: "co-business-registry-zip-coverage-jsonl", record_count: coverageRows.length }));
  artifacts.push(await writeArtifact(stagingDirectory, "derived/source-summary.json", json({
    good_standing_or_delinquent_organizations: organizations,
    good_standing_organizations: goodStandingOrganizations,
    delinquent_organizations: delinquentOrganizations,
    quarantined_source_records: quarantinedRecords,
    eligible_reported_us_business_addresses: eligibleUsAddresses,
    organizations_without_eligible_us_zip_address: organizations - eligibleUsAddresses,
    business_types: sortedCounts(businessTypes),
    status_values: sortedCounts(statusValues),
    reported_address_states: sortedCounts(addressStates),
    formation_jurisdictions: sortedCounts(formationJurisdictions),
  }), { artifact_type: "co-business-registry-source-summary" }));
  artifacts.push(await writeArtifact(stagingDirectory, "source/release-metadata.json", json({
    dataset_id: CO_BUSINESS_REGISTRY_DATASET_ID,
    dataset_name: initialMetadata.name,
    publisher: initialMetadata.attribution,
    license: initialMetadata.license,
    source_rows_updated_at: catalog.rowsUpdatedAtIso,
    source_rows_updated_at_unix: catalog.rowsUpdatedAt,
    selected_schema: CO_BUSINESS_REGISTRY_SCHEMA,
    selected_schema_fingerprint: catalog.schemaFingerprint,
    selected_fields: CO_BUSINESS_REGISTRY_FIELDS,
    explicitly_excluded_field_classes: ["principal-office mailing addresses", "registered-agent names and addresses"],
    query: { filter: SELECTED_STATUS_FILTER, order: "entityid ASC", keyset_pagination: true, page_size: pageSize },
    expected_selected_status_record_count: expectedCount,
    source_urls: { metadata: CO_BUSINESS_REGISTRY_METADATA_URL, api: CO_BUSINESS_REGISTRY_API_URL, documentation: CO_BUSINESS_REGISTRY_STORY_URL },
  }), { artifact_type: "co-business-registry-source-release-metadata" }));
  const manifest = {
    schema_version: CO_BUSINESS_REGISTRY_SCHEMA_VERSION,
    dataset_id: "co-business-registry-good-standing-or-delinquent-organizations",
    connector: { id: "co-business-registry", version: "1.0.0" },
    release_id: releaseId,
    run_id: runId,
    retrieved_at: retrievedAt,
    source_rows_updated_at: catalog.rowsUpdatedAtIso,
    source_release_id: sourceReleaseId,
    status: "published",
    complete_selected_business_entities_snapshot: true,
    coverage: {
      source_good_standing_or_delinquent_records: expectedCount,
      organizations_published: organizations,
      quarantined_source_records: quarantinedRecords,
      good_standing_organizations: goodStandingOrganizations,
      delinquent_organizations: delinquentOrganizations,
      eligible_reported_us_business_addresses: eligibleUsAddresses,
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
      publisher: "Colorado Department of State (CDOS)",
      catalog_dataset_id: CO_BUSINESS_REGISTRY_DATASET_ID,
      source_page: CO_BUSINESS_REGISTRY_STORY_URL,
      api_url: CO_BUSINESS_REGISTRY_API_URL,
      access_method: fixtureInput ? "explicit test fixture records" : sourceSnapshotPath ? "validated local staged source snapshot originally acquired from the anonymous public Socrata API" : "anonymous public Socrata API with stable keyset pagination",
      license: "Public Domain",
      api_key_used: false,
      policy_profile: "config/source-policies/co-business-registry.json",
    },
    limitations: [
      "Good Standing means required periodic reports and information are current in Colorado Secretary-of-State records; it is not independent proof of current operations, legality, reputation, public access, or an open storefront.",
      "Delinquent means a filing, fee, report, registered-agent, or related registry obligation was not cured; domestic legal existence can continue while delinquent, but the status does not prove current operations.",
      "The dataset includes domestic and foreign-registered entities and is not a census of every business operating in Colorado or the United States.",
      "Principal office addresses can be administrative, home, virtual, incomplete, stale, outside Colorado, or outside the United States; no physical site or establishment is created from them.",
      "Principal-office mailing addresses and all registered-agent names and addresses are excluded.",
      "Current USPS ZIP validity remains unverified until an authorized operational ZIP denominator is integrated.",
    ],
    artifacts,
  };
  await writeArtifact(stagingDirectory, "manifest.json", json(manifest));
  const publication = await publishCoBusinessRegistryStaging({ outputRoot, stagingRunId: runId, expectedReleaseId: releaseId });
  logger(`Published ${organizations.toLocaleString("en-US")} Good Standing or Delinquent Colorado registered organizations.`);
  return { manifest, releaseDirectory: publication.releaseDirectory, pointerPath: publication.pointerPath };
}

function containsExcludedField(value) {
  if (Array.isArray(value)) return value.some(containsExcludedField);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) => EXCLUDED_SOURCE_FIELDS.has(key.toLowerCase()) || containsExcludedField(child));
}

export async function publishCoBusinessRegistryStaging({ outputRoot, stagingRunId, expectedReleaseId = null } = {}) {
  if (!outputRoot || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stagingRunId ?? "")) {
    throw new Error("outputRoot and a valid stagingRunId are required.");
  }
  const stagingRoot = path.join(outputRoot, ".staging");
  const stagingDirectory = path.resolve(stagingRoot, stagingRunId);
  assertContained(stagingRoot, stagingDirectory, "Colorado staging run");
  const manifestPath = path.join(stagingDirectory, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.run_id !== stagingRunId || manifest.dataset_id !== "co-business-registry-good-standing-or-delinquent-organizations" || manifest.status !== "published") {
    throw new Error("Colorado staging manifest does not match the requested complete run.");
  }
  if (expectedReleaseId && manifest.release_id !== expectedReleaseId) throw new Error("Colorado staging release ID does not match the build result.");
  await verifyCoBusinessRegistry(manifestPath);
  const releasesDirectory = path.join(outputRoot, "releases");
  await mkdir(releasesDirectory, { recursive: true });
  const releaseDirectory = path.join(releasesDirectory, manifest.release_id);
  try {
    await stat(releaseDirectory);
    throw new Error(`Colorado release destination already exists: ${manifest.release_id}.`);
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
  if (!(await stat(releaseDirectory)).isDirectory()) throw new Error("Published Colorado Business Registry release is not a directory.");
  return { manifest, releaseDirectory, pointerPath };
}

export async function verifyCoBusinessRegistry(manifestPath) {
  const absoluteManifestPath = path.resolve(manifestPath);
  const releaseDirectory = path.dirname(absoluteManifestPath);
  const manifest = JSON.parse(await readFile(absoluteManifestPath, "utf8"));
  const failures = [];
  if (manifest.dataset_id !== "co-business-registry-good-standing-or-delinquent-organizations" || manifest.status !== "published" || !manifest.complete_selected_business_entities_snapshot) failures.push({ path: "manifest.json", reason: "unexpected or incomplete manifest" });
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
  const sourceArtifacts = manifest.artifacts?.filter((artifact) => artifact.artifact_type === "co-business-registry-source-jsonl-gzip") ?? [];
  const normalizedArtifacts = manifest.artifacts?.filter((artifact) => artifact.artifact_type === "normalized-co-business-organization-jsonl-gzip") ?? [];
  const quarantineArtifacts = manifest.artifacts?.filter((artifact) => artifact.artifact_type === "co-business-registry-quarantine-jsonl-gzip") ?? [];
  if (sourceArtifacts.length !== 1 || sourceArtifacts[0]?.export_policy !== "internal") failures.push({ path: "manifest.json", reason: "expected one internal selected-field source artifact" });
  if (normalizedArtifacts.length !== 16) failures.push({ path: "manifest.json", reason: "expected 16 normalized organization partitions" });
  if (quarantineArtifacts.length !== 1 || quarantineArtifacts[0]?.export_policy !== "internal") failures.push({ path: "manifest.json", reason: "expected one internal quarantine artifact" });
  if (sourceArtifacts.length === 1) {
    const digest = sha256(`${manifest.source_rows_updated_at}\u0000${sourceArtifacts[0].sha256}`);
    if (manifest.source_release_id !== `co-business-registry-${manifest.source_rows_updated_at.slice(0, 10)}-${digest.slice(0, 16)}`) failures.push({ path: "manifest.json", reason: "source release ID is not bound to refresh timestamp and selected source checksum" });
    try {
      let sourceCount = 0;
      let previousId = null;
      for await (const record of gzipRecords(path.join(releaseDirectory, sourceArtifacts[0].path))) {
        for (const field of Object.keys(record)) if (!CO_BUSINESS_REGISTRY_FIELDS.includes(field)) throw new Error(`unapproved source field ${field}`);
        const id = text(record.entityid);
        if (!/^\d{11}$/.test(id ?? "") || !new Set(["Good Standing", "Delinquent"]).has(text(record.entitystatus)) || (previousId && id.localeCompare(previousId) <= 0)) throw new Error(`invalid source ordering or status at ${id}`);
        previousId = id;
        sourceCount += 1;
      }
      if (sourceCount !== sourceArtifacts[0].record_count || sourceCount !== manifest.coverage?.source_good_standing_or_delinquent_records) throw new Error("source record count mismatch");
    } catch (error) {
      failures.push({ path: sourceArtifacts[0].path, reason: `source validation failed: ${error.message}` });
    }
  }
  const ids = new Set();
  const countsByZip = new Map();
  const quarantineIds = new Set();
  let organizations = 0;
  let eligibleAddresses = 0;
  let goodStandingOrganizations = 0;
  let delinquentOrganizations = 0;
  for (const artifact of normalizedArtifacts) {
    try {
      const prefix = artifact.path.match(/id-hash-prefix=([0-9a-f])/)?.[1];
      let partitionCount = 0;
      for await (const record of gzipRecords(path.join(releaseDirectory, artifact.path))) {
        const id = record.external_identifiers?.find((item) => item.type === "co_business_entity_id")?.value;
        if (!id || ids.has(id) || sha256(id)[0] !== prefix) throw new Error(`duplicate, missing, or incorrectly partitioned source ID ${id}`);
        ids.add(id);
        if (record.entity_candidates?.organization_id !== `organization:co_sos_record_${id}` || record.entity_candidates?.physical_site_id || record.entity_candidates?.establishment_id) throw new Error(`invalid organization-only identity for ${id}`);
        if (!new Set(["Good Standing", "Delinquent"]).has(record.source_status?.status) || record.source_status?.value !== "listed-good-standing-or-delinquent-in-colorado-business-registry-as-of-retrieval") throw new Error(`invalid source status for ${id}`);
        if (record.source_status.status === "Good Standing") goodStandingOrganizations += 1;
        if (record.source_status.status === "Delinquent") delinquentOrganizations += 1;
        if (record.provenance?.source_release_id !== manifest.source_release_id || record.provenance?.policy_id !== "co-business-registry" || record.export_policy !== "public") throw new Error(`invalid provenance for ${id}`);
        if (containsExcludedField(record)) throw new Error(`excluded field leaked for ${id}`);
        if (record.reported_business_address?.address_scope !== "secretary-of-state-principal-office-address-not-verified-physical-operating-site") throw new Error(`invalid address scope for ${id}`);
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
  let quarantinedRecords = 0;
  if (quarantineArtifacts.length === 1) {
    try {
      for await (const record of gzipRecords(path.join(releaseDirectory, quarantineArtifacts[0].path))) {
        if (!/^\d{11}$/.test(record.source_record_id ?? "") || record.reason !== "missing-or-invalid-organization-identity" || record.export_policy !== "internal" || record.source_release_id !== manifest.source_release_id || quarantineIds.has(record.source_record_id) || ids.has(record.source_record_id)) {
          throw new Error(`invalid quarantine record ${record.source_record_id}`);
        }
        quarantineIds.add(record.source_record_id);
        quarantinedRecords += 1;
      }
      if (quarantinedRecords !== quarantineArtifacts[0].record_count) throw new Error("quarantine record count mismatch");
    } catch (error) {
      failures.push({ path: quarantineArtifacts[0].path, reason: `quarantine validation failed: ${error.message}` });
    }
  }
  if (organizations !== manifest.coverage?.organizations_published) failures.push({ path: "manifest.json", reason: "published organization count does not reconcile" });
  if (organizations + quarantinedRecords !== manifest.coverage?.source_good_standing_or_delinquent_records || quarantinedRecords !== manifest.coverage?.quarantined_source_records) failures.push({ path: "manifest.json", reason: "published and quarantined counts do not reconcile" });
  if (goodStandingOrganizations !== manifest.coverage?.good_standing_organizations || delinquentOrganizations !== manifest.coverage?.delinquent_organizations) failures.push({ path: "manifest.json", reason: "source status counts do not reconcile" });
  if (eligibleAddresses !== manifest.coverage?.eligible_reported_us_business_addresses) failures.push({ path: "manifest.json", reason: "eligible address count does not reconcile" });
  const zipArtifact = manifest.artifacts?.find((artifact) => artifact.artifact_type === "co-business-registry-zip-coverage-jsonl");
  if (!zipArtifact) failures.push({ path: "manifest.json", reason: "missing ZIP coverage artifact" });
  else {
    try {
      const rows = (await readFile(path.join(releaseDirectory, zipArtifact.path), "utf8")).split(/\r?\n/).filter(Boolean).map(JSON.parse);
      if (rows.length !== zipArtifact.record_count || rows.length !== manifest.coverage?.zip_union_records) throw new Error("ZIP row count mismatch");
      const total = rows.reduce((sum, row) => sum + row.co_business_registry_registration_snapshot.organization_reported_business_address_count, 0);
      if (total !== eligibleAddresses) throw new Error("ZIP organization address counts do not reconcile");
      for (const row of rows) {
        if ((countsByZip.get(row.zip_code) ?? 0) !== row.co_business_registry_registration_snapshot.organization_reported_business_address_count) throw new Error(`ZIP ${row.zip_code} does not reconcile`);
        if (row.current_usps_validity?.status !== "unverified") throw new Error(`ZIP ${row.zip_code} has unsupported USPS validity`);
        if (row.co_business_registry_registration_snapshot.physical_site_count !== null || row.co_business_registry_registration_snapshot.physical_site_inference_permitted !== false) throw new Error(`ZIP ${row.zip_code} implies a physical site`);
      }
    } catch (error) {
      failures.push({ path: zipArtifact.path, reason: `ZIP validation failed: ${error.message}` });
    }
  }
  if (failures.length) {
    const error = new Error(`Colorado Business Registry release verification failed for ${failures.length} check(s).`);
    error.failures = failures;
    throw error;
  }
  return { dataset_id: manifest.dataset_id, release_id: manifest.release_id, source_release_id: manifest.source_release_id, artifact_count: manifest.artifacts.length, coverage: manifest.coverage };
}
