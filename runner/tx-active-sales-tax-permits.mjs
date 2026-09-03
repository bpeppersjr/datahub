import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { finished } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";

import { assertNormalizedUsPostalFieldsDeep } from "./normalized-us-postal-code.mjs";

export const TX_ACTIVE_SALES_TAX_SCHEMA_VERSION = "1.0.0";
export const TX_ACTIVE_SALES_TAX_TRANSFORMATION_VERSION = "tx-active-sales-tax-permits@1.0.1";
export const TX_ACTIVE_SALES_TAX_DATASET_ID = "jrea-zgmq";
export const TX_ACTIVE_SALES_TAX_METADATA_URL = `https://data.texas.gov/api/views/${TX_ACTIVE_SALES_TAX_DATASET_ID}`;
export const TX_ACTIVE_SALES_TAX_API_URL = `https://data.texas.gov/resource/${TX_ACTIVE_SALES_TAX_DATASET_ID}.json`;
export const TX_ACTIVE_SALES_TAX_PAGE_URL = "https://data.texas.gov/d/jrea-zgmq";
export const TX_ACTIVE_SALES_TAX_LICENSE_URL = "https://data.texas.gov/stories/s/Terms-of-Service/9v7t-g6x7";

export const TX_ACTIVE_SALES_TAX_SCHEMA = Object.freeze([
  ["taxpayer_number", "text"],
  ["taxpayer_name", "text"],
  ["taxpayer_organization_type", "text"],
  ["outlet_number", "text"],
  ["outlet_name", "text"],
  ["outlet_address", "text"],
  ["outlet_city", "text"],
  ["outlet_state", "text"],
  ["outlet_zip_code", "text"],
  ["outlet_county_code", "text"],
  ["outlet_naics_code", "number"],
  ["outlet_inside_outside_city_limits_indicator", "text"],
  ["outlet_permit_issue_date", "calendar_date"],
  ["outlet_first_sales_date", "calendar_date"],
]);
export const TX_ACTIVE_SALES_TAX_FIELDS = Object.freeze(TX_ACTIVE_SALES_TAX_SCHEMA.map(([field]) => field));
export const TX_ACTIVE_SALES_TAX_SOURCE_FIELDS = Object.freeze(["socrata_row_id", ...TX_ACTIVE_SALES_TAX_FIELDS]);
export const TX_ACTIVE_SALES_TAX_SCHEMA_FINGERPRINT = "b2039787509c10501ff1dfe2c4f2b72fb51218c61f98b783cd155ace31a30d77";

const US_STATE_AND_TERRITORY_CODES = new Set([
  "AL", "AK", "AS", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "GU", "HI", "ID", "IL", "IN", "IA", "KS", "KY",
  "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "MP", "OH", "OK",
  "OR", "PA", "PR", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "VI", "WA", "WV", "WI", "WY",
]);
const EXCLUDED_SOURCE_FIELDS = new Set([
  "taxpayer_address", "taxpayer_city", "taxpayer_state", "taxpayer_zip_code", "taxpayer_county_code",
]);
const QUARANTINE_REASONS = new Set([
  "missing-core-identity",
  "missing-or-nonphysical-outlet-address",
  "invalid-or-unmapped-us-zip",
  "invalid-outlet-state",
  "invalid-city-limits-indicator",
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

function sourceTimestamp(value) {
  const date = Number.isInteger(value) && value > 0 ? new Date(value * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Texas catalog rowsUpdatedAt is invalid.");
  return date.toISOString();
}

function dateValue(value, label) {
  const raw = textValue(value);
  if (!raw) return null;
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})(?:T00:00:00(?:\.000)?)?$/);
  if (!match || Number.isNaN(Date.parse(`${match[1]}T00:00:00.000Z`))) throw new Error(`invalid-${label}`);
  return match[1];
}

function postalCode(value) {
  const raw = textValue(value);
  if (!/^\d{5}$/.test(raw ?? "") || raw === "00000") throw new Error("invalid-or-unmapped-us-zip");
  return raw;
}

function geography(zipCode, baselineByZip) {
  const baseline = baselineByZip?.get(zipCode);
  return {
    zip_code: zipCode,
    baseline_postal_state: textValue(baseline?.postal_label?.preferred_state)?.toUpperCase() ?? null,
    zcta_match_status: baseline?.geography?.status ?? "no-2020-zcta-polygon",
    zcta_geo_id: baseline?.geography?.geo_id ?? null,
    zcta_geoid: baseline?.geography?.geoid ?? null,
    zcta_geometry_file: baseline?.geography?.geometry_file ?? null,
  };
}

function cityLimits(value) {
  const code = textValue(value)?.toUpperCase() ?? null;
  if (code === null) return { source_code: null, inside_city_limits: null, semantics: "not-reported-by-source" };
  if (code === "Y") return { source_code: code, inside_city_limits: true, semantics: "source-reports-outlet-inside-city-limits" };
  if (code === "N") return { source_code: code, inside_city_limits: false, semantics: "source-reports-outlet-outside-city-limits" };
  throw new Error("invalid-city-limits-indicator");
}

function isNonphysicalAddress(value) {
  return /^\s*P(?:OST(?:AL)?)?\.?\s*O(?:FFICE)?\.?\s*BOX\b/i.test(value);
}

function provenance(context, taxpayerNumber, outletNumber) {
  return {
    source_id: "texas-comptroller-active-sales-tax-permits",
    source_release_id: context.sourceReleaseId,
    source_record_id: `${taxpayerNumber}:${outletNumber}`,
    ingest_run_id: context.runId,
    transformation_version: TX_ACTIVE_SALES_TAX_TRANSFORMATION_VERSION,
    policy_id: "tx-active-sales-tax-permits",
  };
}

export function schemaFingerprint(columns) {
  const byField = new Map((columns ?? []).map((column) => [column.fieldName, column.dataTypeName]));
  return sha256(TX_ACTIVE_SALES_TAX_SCHEMA.map(([field]) => `${field}:${byField.get(field) ?? null}`).join("\u0000"));
}

function selectedRecord(row) {
  return Object.fromEntries(TX_ACTIVE_SALES_TAX_SOURCE_FIELDS.filter((field) => row[field] !== undefined).map((field) => [field, row[field]]));
}

export function normalizeTxActiveSalesTaxOutlet(source, context) {
  const taxpayerNumber = textValue(source.taxpayer_number);
  const taxpayerName = textValue(source.taxpayer_name);
  const outletNumber = textValue(source.outlet_number);
  const outletName = textValue(source.outlet_name);
  if (!/^\d{11}$/.test(taxpayerNumber ?? "") || !/^\d+$/.test(outletNumber ?? "") || !taxpayerName || !outletName) throw new Error("missing-core-identity");
  const street = textValue(source.outlet_address);
  const city = textValue(source.outlet_city);
  if (!street || !city || isNonphysicalAddress(street)) throw new Error("missing-or-nonphysical-outlet-address");
  const state = textValue(source.outlet_state)?.toUpperCase() ?? null;
  if (!state || !US_STATE_AND_TERRITORY_CODES.has(state)) throw new Error("invalid-outlet-state");
  const zipCode = postalCode(source.outlet_zip_code);
  const baseline = context.baselineByZip?.get(zipCode);
  if (!baseline) throw new Error("invalid-or-unmapped-us-zip");
  const countyCode = textValue(source.outlet_county_code);
  const naicsRaw = textValue(source.outlet_naics_code);
  const suffix = `${taxpayerNumber}_${outletNumber}`;
  return {
    schema_version: TX_ACTIVE_SALES_TAX_SCHEMA_VERSION,
    normalized_record_id: `tx-active-sales-tax:outlet:${taxpayerNumber}:${outletNumber}`,
    entity_candidates: {
      organization_id: `organization:tx_cpa_taxpayer_${taxpayerNumber}`,
      physical_site_id: `site:tx_cpa_sales_tax_outlet_${suffix}`,
      establishment_id: `establishment:tx_cpa_sales_tax_outlet_${suffix}`,
      identity_status: "provisional",
    },
    external_identifiers: [
      { type: "texas_comptroller_taxpayer_number", value: taxpayerNumber, source_field: "taxpayer_number" },
      { type: "texas_sales_tax_outlet_number", value: outletNumber, source_field: "outlet_number", taxpayer_number: taxpayerNumber },
    ],
    taxpayer_name: taxpayerName,
    outlet_name: outletName,
    physical_address: {
      street,
      city,
      state,
      postal_code: zipCode,
      zip_code: zipCode,
      zip4: null,
      country: "US",
      source_scope: "source-described-physical-outlet-address",
      independently_verified: false,
    },
    geography: {
      ...geography(zipCode, context.baselineByZip),
      source_state: state,
      state_matches_baseline_postal_label: textValue(baseline?.postal_label?.preferred_state)?.toUpperCase() === state,
      source_county_code: countyCode,
      county_code_semantics: "source-code-preserved-not-promoted-to-national-county-fips",
    },
    taxpayer_profile: {
      organization_type_code: textValue(source.taxpayer_organization_type),
      organization_type_semantics: "texas-comptroller-source-code-preserved-without-entity-form-inference",
    },
    permit_profile: {
      outlet_number: outletNumber,
      naics_code_source: naicsRaw,
      naics_code: /^\d{2,6}$/.test(naicsRaw ?? "") ? naicsRaw : null,
      naics_semantics: "source-reported-not-independently-validated",
      ...cityLimits(source.outlet_inside_outside_city_limits_indicator),
      permit_issue_date: dateValue(source.outlet_permit_issue_date, "outlet-permit-issue-date"),
      first_sales_date: dateValue(source.outlet_first_sales_date, "outlet-first-sales-date"),
    },
    source_status: {
      value: "listed-as-active-texas-sales-tax-permit-outlet-as-of-source-refresh",
      status: "Active sales tax permit (source-defined)",
      semantics: "active-sales-tax-permit-under-texas-tax-code-chapter-151-subchapter-f-not-independent-proof-of-continuous-operations-or-public-access",
      source_rows_updated_at: context.sourceRowsUpdatedAt,
    },
    privacy: {
      classification: "possible-natural-person-name-or-residential-business-location",
      taxpayer_mailing_fields_excluded: true,
      record_level_distribution: "local-review-only",
    },
    observed_at: context.retrievedAt,
    provenance: provenance(context, taxpayerNumber, outletNumber),
    export_policy: "local-review-only",
  };
}

function assertAllowedUrl(urlValue, type) {
  const url = new URL(urlValue);
  if (url.protocol !== "https:" || url.hostname !== "data.texas.gov" || url.username || url.password || url.hash) throw new Error(`Texas ${type} URL is not allowed.`);
  const expected = type === "metadata" ? `/api/views/${TX_ACTIVE_SALES_TAX_DATASET_ID}` : `/resource/${TX_ACTIVE_SALES_TAX_DATASET_ID}.json`;
  if (url.pathname !== expected) throw new Error(`Texas ${type} path is not allowed.`);
  return url;
}

function retryDelay(response, attempt) {
  const retryAfter = Number(response?.headers?.get?.("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter >= 0) return Math.min(retryAfter * 1000, 30_000);
  return Math.min(500 * (2 ** attempt), 8_000);
}

export async function requestTxJson(urlValue, {
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
    if (response.status >= 300 && response.status < 400) throw new Error(`Texas ${type} redirect rejected (${response.status}).`);
    if (!response.ok) {
      if ((response.status === 429 || response.status >= 500) && attempt + 1 < attempts) {
        await sleep(retryDelay(response, attempt));
        continue;
      }
      throw new Error(`Texas ${type} request failed with HTTP ${response.status}.`);
    }
    const declaredBytes = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredBytes) && declaredBytes > maximumResponseBytes) throw new Error(`Texas ${type} response exceeds the byte limit.`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maximumResponseBytes) throw new Error(`Texas ${type} response exceeds the byte limit.`);
    try {
      return JSON.parse(buffer.toString("utf8"));
    } catch {
      throw new Error(`Texas ${type} response was not valid JSON.`);
    }
  }
  throw new Error(`Texas ${type} request exhausted retries.`);
}

function validateCatalogMetadata(metadata, expectedFingerprint = TX_ACTIVE_SALES_TAX_SCHEMA_FINGERPRINT) {
  if (metadata?.id !== TX_ACTIVE_SALES_TAX_DATASET_ID || metadata?.name !== "Active Sales Tax Permit Holders") throw new Error("Unexpected Texas active-sales-tax catalog identity.");
  if (metadata?.attribution !== "Texas Comptroller of Public Accounts" || metadata?.licenseId !== "PUBLIC_DOMAIN") throw new Error("Unexpected Texas active-sales-tax attribution or license.");
  const fingerprint = schemaFingerprint(metadata.columns);
  if (fingerprint !== expectedFingerprint) throw new Error(`Texas selected schema changed (${fingerprint}).`);
  return { fingerprint, rowsUpdatedAt: sourceTimestamp(metadata.rowsUpdatedAt) };
}

function soqlUrl(parameters) {
  const url = new URL(TX_ACTIVE_SALES_TAX_API_URL);
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, String(value));
  return url.toString();
}

async function sourceCount(options) {
  const rows = await requestTxJson(soqlUrl({ "$select": "count(*)" }), { ...options, type: "data" });
  const count = Number(rows?.[0]?.count);
  if (!Number.isInteger(count) || count < 0) throw new Error("Texas source count query returned an invalid count.");
  return count;
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
  const extra = Object.keys(record).filter((field) => !TX_ACTIVE_SALES_TAX_SOURCE_FIELDS.includes(field));
  if (extra.length) throw new Error(`Unapproved Texas source field ${extra[0]}.`);
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
      const select = `:id as socrata_row_id,${TX_ACTIVE_SALES_TAX_FIELDS.join(",")}`;
      const rows = await requestTxJson(soqlUrl({ "$select": select, "$order": "taxpayer_number,outlet_number,:id", "$limit": pageSize, "$offset": offset }), {
        fetchImpl, signal, sleep, type: "data",
      });
      if (!Array.isArray(rows) || !rows.length) throw new Error(`Texas source page at offset ${offset} was empty before the expected count.`);
      for (const row of rows) {
        await writeGzipRecord(writer, sourceSafeRecord(row));
        count += 1;
      }
      logger(`Acquired ${count.toLocaleString()} of ${expectedCount.toLocaleString()} Texas active sales-tax permit rows.`);
    }
  }
  if (count !== expectedCount) throw new Error(`Texas source count mismatch: acquired ${count}, expected ${expectedCount}.`);
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
      schema_version: TX_ACTIVE_SALES_TAX_SCHEMA_VERSION,
      zip_code: zipCode,
      tx_active_sales_tax_snapshot: {
        status: count ? "published-source-defined-active-outlet-permits" : "no-outlet-permit-in-current-source-snapshot",
        permitted_outlet_count: count,
        source_release_id: context.sourceReleaseId,
        source_rows_updated_at: context.sourceRowsUpdatedAt,
        active_semantics: "active-sales-tax-permit-not-independent-proof-of-continuous-operations-or-public-access",
      },
      current_usps_validity: baseline?.current_usps_validity ?? { status: "unverified", reason: "ZIP appears in the Texas source but is outside the current ZBP/ZCTA union." },
      postal_label: baseline?.postal_label ?? null,
      geography: baseline?.geography ?? { status: "no-2020-zcta-polygon", geo_id: null, geoid: null, geometry_file: null },
      employer_baseline: baseline?.employer_baseline ?? null,
      baseline_coverage_status: baseline?.coverage_status ?? "outside-zbp-zcta-union",
    };
  });
}

export async function buildTxActiveSalesTaxPermits({
  outputRoot,
  zbpPointer,
  catalogMetadata = null,
  sourceRecords = null,
  minimumOutlets = 800_000,
  maximumQuarantineRate = 0.005,
  pageSize = 50_000,
  expectedSchemaFingerprint = TX_ACTIVE_SALES_TAX_SCHEMA_FINGERPRINT,
  fetchImpl = fetch,
  signal,
  sleep,
  logger = console.log,
  now = () => new Date(),
} = {}) {
  if (!outputRoot || !zbpPointer) throw new Error("outputRoot and zbpPointer are required.");
  if (!Number.isInteger(minimumOutlets) || minimumOutlets < 1) throw new Error("minimumOutlets must be a positive integer.");
  if (!Number.isFinite(maximumQuarantineRate) || maximumQuarantineRate < 0 || maximumQuarantineRate > 1) throw new Error("maximumQuarantineRate must be from 0 through 1.");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50_000) throw new Error("pageSize must be from 1 through 50000.");
  if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
  const retrievedAt = now().toISOString();
  const runId = randomUUID();
  const stagingDirectory = path.join(outputRoot, ".staging", runId);
  await mkdir(stagingDirectory, { recursive: true });
  const baseline = await loadZbpBaseline(zbpPointer);
  const metadata = catalogMetadata ?? await requestTxJson(TX_ACTIVE_SALES_TAX_METADATA_URL, { fetchImpl, signal, sleep, type: "metadata" });
  const catalog = validateCatalogMetadata(metadata, expectedSchemaFingerprint);
  const expectedCount = sourceRecords ? Number(metadata.sourceRecordCount) : await sourceCount({ fetchImpl, signal, sleep });
  if (!Number.isInteger(expectedCount) || expectedCount < minimumOutlets) throw new Error(`Texas source count ${expectedCount} is below the minimum ${minimumOutlets}.`);
  const sourceWriter = await openGzipWriter(stagingDirectory, "source/selected-records.jsonl.gz");
  try {
    await acquireSource({ writer: sourceWriter, sourceRecords, expectedCount, fetchImpl, signal, sleep, pageSize, logger });
  } catch (error) {
    await abortGzipWriters([sourceWriter]);
    throw error;
  }
  const sourceArtifact = await closeGzipWriter(sourceWriter, "tx-active-sales-tax-permit-source-jsonl-gzip", { export_policy: "internal" });
  const sourceReleaseId = `tx-active-sales-tax-${catalog.rowsUpdatedAt.slice(0, 10)}-${sourceArtifact.sha256.slice(0, 16)}`;
  const releaseId = `tx-active-sales-tax-${releaseTimestamp(retrievedAt)}-${runId.slice(0, 8)}`;
  const context = { runId, retrievedAt, sourceRowsUpdatedAt: catalog.rowsUpdatedAt, sourceReleaseId, baselineByZip: baseline.byZip };
  const normalizedWriters = new Map();
  for (const prefix of "0123456789abcdef") normalizedWriters.set(prefix, await openGzipWriter(stagingDirectory, `normalized/outlets/prefix=${prefix}.jsonl.gz`));
  const quarantineWriter = await openGzipWriter(stagingDirectory, "quality/quarantine.jsonl.gz");
  const zipCounts = new Map();
  const quarantineReasons = new Map();
  const outletIdentities = new Set();
  const taxpayers = new Set();
  let normalizedCount = 0;
  let insideCityCount = 0;
  let outsideCityCount = 0;
  let unreportedCityCount = 0;
  try {
    for await (const source of gzipRecords(path.join(stagingDirectory, sourceArtifact.path))) {
      if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
      const identity = `${textValue(source.taxpayer_number) ?? "<blank>"}:${textValue(source.outlet_number) ?? "<blank>"}`;
      if (outletIdentities.has(identity)) throw new Error(`Duplicate Texas taxpayer/outlet identity ${identity}.`);
      outletIdentities.add(identity);
      try {
        const normalized = normalizeTxActiveSalesTaxOutlet(source, context);
        assertNormalizedUsPostalFieldsDeep(normalized, "Texas active sales-tax outlet");
        const prefix = sha256(identity)[0];
        await writeGzipRecord(normalizedWriters.get(prefix), normalized);
        normalizedCount += 1;
        taxpayers.add(normalized.external_identifiers[0].value);
        increment(zipCounts, normalized.physical_address.zip_code);
        if (normalized.permit_profile.inside_city_limits === true) insideCityCount += 1;
        else if (normalized.permit_profile.inside_city_limits === false) outsideCityCount += 1;
        else unreportedCityCount += 1;
      } catch (error) {
        const reason = error.message;
        if (!QUARANTINE_REASONS.has(reason)) throw error;
        increment(quarantineReasons, reason);
        await writeGzipRecord(quarantineWriter, {
          schema_version: TX_ACTIVE_SALES_TAX_SCHEMA_VERSION,
          source_record_id: identity,
          reason,
          source_release_id: sourceReleaseId,
          export_policy: "internal",
        });
      }
    }
  } catch (error) {
    await abortGzipWriters([...normalizedWriters.values(), quarantineWriter]);
    throw error;
  }
  const quarantineRate = expectedCount ? quarantineWriter.records / expectedCount : 0;
  if (quarantineRate > maximumQuarantineRate) {
    await abortGzipWriters([...normalizedWriters.values(), quarantineWriter]);
    throw new Error(`Texas quarantine rate ${quarantineRate} exceeds the maximum ${maximumQuarantineRate}.`);
  }
  if (normalizedCount < minimumOutlets - Math.floor(expectedCount * maximumQuarantineRate)) {
    await abortGzipWriters([...normalizedWriters.values(), quarantineWriter]);
    throw new Error("Texas normalized outlet count is below the governed minimum after quarantine.");
  }
  const normalizedArtifacts = [];
  for (const writer of normalizedWriters.values()) normalizedArtifacts.push(await closeGzipWriter(writer, "normalized-tx-active-sales-tax-outlet-jsonl-gzip", { export_policy: "local-review-only" }));
  const quarantineArtifact = await closeGzipWriter(quarantineWriter, "tx-active-sales-tax-permit-quarantine-jsonl-gzip", { export_policy: "internal" });
  if (!sourceRecords) {
    const finalMetadata = await requestTxJson(TX_ACTIVE_SALES_TAX_METADATA_URL, { fetchImpl, signal, sleep, type: "metadata" });
    const finalCatalog = validateCatalogMetadata(finalMetadata, expectedSchemaFingerprint);
    const finalCount = await sourceCount({ fetchImpl, signal, sleep });
    if (finalCatalog.rowsUpdatedAt !== catalog.rowsUpdatedAt || finalCount !== expectedCount) throw new Error("Texas source changed during acquisition; staging was not published.");
  }
  const zipRows = buildZipCoverage(baseline.rows, zipCounts, context);
  const zipArtifact = await writeArtifact(stagingDirectory, "derived/zip-coverage.jsonl", jsonLines(zipRows), {
    record_count: zipRows.length,
    artifact_type: "tx-active-sales-tax-permit-zip-coverage-jsonl",
    distribution_policy: "public-aggregate-with-source-limitations",
  });
  const sourceSummary = {
    dataset_id: "tx-active-sales-tax-outlets",
    source_release_id: sourceReleaseId,
    source_rows_updated_at: catalog.rowsUpdatedAt,
    retrieved_at: retrievedAt,
    source_outlet_permits: expectedCount,
    normalized_outlet_permits: normalizedCount,
    unique_taxpayers: taxpayers.size,
    quarantined_source_records: quarantineWriter.records,
    quarantine_rate: quarantineRate,
    quarantine_reasons: sortedCounts(quarantineReasons),
    inside_city_limits_outlets: insideCityCount,
    outside_city_limits_outlets: outsideCityCount,
    city_limits_unreported_outlets: unreportedCityCount,
    source_zip_codes: zipCounts.size,
    selected_fields: TX_ACTIVE_SALES_TAX_FIELDS,
    excluded_field_groups: ["taxpayer mailing address, city, state, ZIP, and county"],
    record_level_distribution: "local-review-only",
  };
  const summaryArtifact = await writeArtifact(stagingDirectory, "quality/source-summary.json", json(sourceSummary), { artifact_type: "tx-active-sales-tax-permit-source-summary" });
  const sourceMetadataArtifact = await writeArtifact(stagingDirectory, "source/catalog-metadata.json", json(metadata), { artifact_type: "tx-active-sales-tax-permit-source-release-metadata", export_policy: "internal" });
  const artifacts = [sourceArtifact, sourceMetadataArtifact, ...normalizedArtifacts, quarantineArtifact, zipArtifact, summaryArtifact];
  const manifest = {
    schema_version: TX_ACTIVE_SALES_TAX_SCHEMA_VERSION,
    dataset_id: "tx-active-sales-tax-outlets",
    connector: { id: "tx-active-sales-tax-permits", version: "1.0.1" },
    release_id: releaseId,
    source_release_id: sourceReleaseId,
    status: "complete",
    complete_source_snapshot: true,
    created_at: retrievedAt,
    source: {
      publisher: "Texas Comptroller of Public Accounts",
      dataset_id: TX_ACTIVE_SALES_TAX_DATASET_ID,
      page_url: TX_ACTIVE_SALES_TAX_PAGE_URL,
      api_url: TX_ACTIVE_SALES_TAX_API_URL,
      rows_updated_at: catalog.rowsUpdatedAt,
      schema_fingerprint: catalog.fingerprint,
      license: "Public Domain",
      license_url: TX_ACTIVE_SALES_TAX_LICENSE_URL,
      active_definition: "taxpayer outlet holding an active sales tax permit under Texas Tax Code Chapter 151, Subchapter F",
    },
    coverage: {
      source_outlet_permits: expectedCount,
      normalized_outlet_permits: normalizedCount,
      unique_taxpayers: taxpayers.size,
      quarantined_source_records: quarantineWriter.records,
      quarantine_rate: quarantineRate,
      inside_city_limits_outlets: insideCityCount,
      outside_city_limits_outlets: outsideCityCount,
      city_limits_unreported_outlets: unreportedCityCount,
      source_zip_codes: zipCounts.size,
      zip_union_records: zipRows.length,
      physical_sites: normalizedCount,
      establishments: normalizedCount,
      organizations: taxpayers.size,
      complete_all_businesses: false,
    },
    dependencies: [
      { dataset_id: baseline.manifest.dataset_id, release_id: baseline.manifest.release_id, manifest_sha256: baseline.manifestSha256 },
      ...(baseline.manifest.geography_dependency ? [baseline.manifest.geography_dependency] : []),
    ],
    policy: {
      policy_id: "tx-active-sales-tax-permits",
      record_level_distribution: "local-review-only",
      aggregate_distribution: "public-with-provenance-and-semantic-limitations",
      privacy_reason: "taxpayer names can identify natural persons and reported outlet locations can be residences",
    },
    limitations: [
      "Active describes the source permit status; it is not independent proof of continuous operations, solvency, licensure beyond sales tax, or public access.",
      "Outlet addresses, NAICS values, dates, and city-limit indicators are source-reported and not independently verified.",
      "This register covers active Texas sales tax permit holders and is not complete for all Texas or United States businesses.",
      "Taxpayer mailing address, city, state, ZIP, and county fields are excluded at acquisition.",
      "Record-level output remains local-review-only because taxpayer names and outlet locations may identify natural persons or residences.",
      "No parent-company, network affiliation, or cross-source identity relationship is inferred.",
    ],
    artifacts,
  };
  await writeFile(path.join(stagingDirectory, "manifest.json"), json(manifest));
  await verifyTxActiveSalesTaxPermits(path.join(stagingDirectory, "manifest.json"));
  return publishTxActiveSalesTaxPermitsStaging({ outputRoot, stagingRunId: runId, expectedReleaseId: releaseId });
}

export async function publishTxActiveSalesTaxPermitsStaging({ outputRoot, stagingRunId, expectedReleaseId = null } = {}) {
  if (!outputRoot || !stagingRunId) throw new Error("outputRoot and stagingRunId are required.");
  const stagingDirectory = path.join(outputRoot, ".staging", stagingRunId);
  const manifestPath = path.join(stagingDirectory, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (expectedReleaseId && manifest.release_id !== expectedReleaseId) throw new Error("Texas staging release ID mismatch.");
  await verifyTxActiveSalesTaxPermits(manifestPath);
  const releasesDirectory = path.join(outputRoot, "releases");
  const releaseDirectory = path.join(releasesDirectory, manifest.release_id);
  await mkdir(releasesDirectory, { recursive: true });
  try {
    await stat(releaseDirectory);
    throw new Error(`Texas release ${manifest.release_id} already exists.`);
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
  return [...EXCLUDED_SOURCE_FIELDS].some((field) => serialized.includes(`"${field}"`));
}

export async function verifyTxActiveSalesTaxPermits(manifestPath) {
  const absoluteManifestPath = path.resolve(manifestPath);
  const releaseDirectory = path.dirname(absoluteManifestPath);
  const manifest = JSON.parse(await readFile(absoluteManifestPath, "utf8"));
  const failures = [];
  if (manifest.dataset_id !== "tx-active-sales-tax-outlets" || manifest.schema_version !== TX_ACTIVE_SALES_TAX_SCHEMA_VERSION || manifest.status !== "complete" || manifest.complete_source_snapshot !== true) {
    failures.push({ path: "manifest.json", reason: "invalid dataset identity, schema, status, or completeness" });
  }
  if (manifest.source?.dataset_id !== TX_ACTIVE_SALES_TAX_DATASET_ID || manifest.source?.schema_fingerprint !== TX_ACTIVE_SALES_TAX_SCHEMA_FINGERPRINT || manifest.source?.license !== "Public Domain") {
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
  const sourceArtifact = artifacts.find((artifact) => artifact.artifact_type === "tx-active-sales-tax-permit-source-jsonl-gzip");
  let sourceCount = 0;
  try {
    if (!sourceArtifact || sourceArtifact.export_policy !== "internal") throw new Error("missing or misclassified selected source artifact");
    for await (const record of gzipRecords(path.join(releaseDirectory, sourceArtifact.path))) {
      sourceCount += 1;
      if (containsExcludedField(record)) throw new Error("excluded source field leaked");
      if (Object.keys(record).some((field) => !TX_ACTIVE_SALES_TAX_SOURCE_FIELDS.includes(field))) throw new Error("unapproved selected source field");
    }
    if (sourceCount !== sourceArtifact.record_count || sourceCount !== manifest.coverage.source_outlet_permits) throw new Error("source record count mismatch");
  } catch (error) {
    failures.push({ path: sourceArtifact?.path ?? "source/selected-records.jsonl.gz", reason: error.message });
  }
  const normalizedArtifacts = artifacts.filter((artifact) => artifact.artifact_type === "normalized-tx-active-sales-tax-outlet-jsonl-gzip");
  let normalizedCount = 0;
  const taxpayers = new Set();
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
        if (!/^tx-active-sales-tax:outlet:\d{11}:\d+$/.test(record.normalized_record_id)
          || !/^organization:tx_cpa_taxpayer_\d{11}$/.test(record.entity_candidates?.organization_id ?? "")
          || !/^site:tx_cpa_sales_tax_outlet_\d{11}_\d+$/.test(record.entity_candidates?.physical_site_id ?? "")
          || !/^establishment:tx_cpa_sales_tax_outlet_\d{11}_\d+$/.test(record.entity_candidates?.establishment_id ?? "")) throw new Error("invalid normalized identity");
        if (!/^\d{5}$/.test(record.physical_address?.zip_code ?? "") || !record.physical_address?.street || !record.physical_address?.city || record.physical_address?.country !== "US") throw new Error("invalid normalized address");
        if (record.source_status?.value !== "listed-as-active-texas-sales-tax-permit-outlet-as-of-source-refresh" || record.export_policy !== "local-review-only") throw new Error("invalid source status or export policy");
        if (record.provenance?.policy_id !== "tx-active-sales-tax-permits" || record.provenance?.source_release_id !== manifest.source_release_id) throw new Error("invalid provenance");
        if (record.privacy?.taxpayer_mailing_fields_excluded !== true || containsExcludedField(record)) throw new Error("privacy-minimized field contract failed");
        taxpayers.add(record.external_identifiers?.[0]?.value);
        increment(zipCounts, record.physical_address.zip_code);
      }
      if (artifactCount !== artifact.record_count) throw new Error("normalized artifact record count mismatch");
    } catch (error) {
      failures.push({ path: artifact.path, reason: error.message });
    }
  }
  if (normalizedCount !== manifest.coverage?.normalized_outlet_permits || normalizedCount !== manifest.coverage?.physical_sites || normalizedCount !== manifest.coverage?.establishments || taxpayers.size !== manifest.coverage?.organizations || taxpayers.size !== manifest.coverage?.unique_taxpayers) {
    failures.push({ path: "manifest.json", reason: "normalized entity counts do not reconcile" });
  }
  const quarantineArtifact = artifacts.find((artifact) => artifact.artifact_type === "tx-active-sales-tax-permit-quarantine-jsonl-gzip");
  let quarantineCount = 0;
  try {
    if (!quarantineArtifact || quarantineArtifact.export_policy !== "internal") throw new Error("missing or misclassified quarantine artifact");
    for await (const record of gzipRecords(path.join(releaseDirectory, quarantineArtifact.path))) {
      quarantineCount += 1;
      if (!QUARANTINE_REASONS.has(record.reason) || record.export_policy !== "internal") throw new Error("invalid quarantine record");
    }
    if (quarantineCount !== quarantineArtifact.record_count || quarantineCount !== manifest.coverage.quarantined_source_records) throw new Error("quarantine count mismatch");
  } catch (error) {
    failures.push({ path: quarantineArtifact?.path ?? "quality/quarantine.jsonl.gz", reason: error.message });
  }
  if (sourceCount !== normalizedCount + quarantineCount) failures.push({ path: "manifest.json", reason: "source, normalized, and quarantine counts do not reconcile" });
  const zipArtifact = artifacts.find((artifact) => artifact.artifact_type === "tx-active-sales-tax-permit-zip-coverage-jsonl");
  try {
    if (!zipArtifact || zipArtifact.distribution_policy !== "public-aggregate-with-source-limitations") throw new Error("missing or misclassified ZIP artifact");
    const rows = (await readFile(path.join(releaseDirectory, zipArtifact.path), "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse);
    if (rows.length !== zipArtifact.record_count || rows.length !== manifest.coverage.zip_union_records) throw new Error("ZIP row count mismatch");
    if (new Set(rows.map((row) => row.zip_code)).size !== rows.length) throw new Error("duplicate ZIP coverage row");
    const contributionCount = rows.reduce((sum, row) => sum + (row.tx_active_sales_tax_snapshot?.permitted_outlet_count ?? 0), 0);
    if (contributionCount !== normalizedCount) throw new Error("ZIP contribution counts do not reconcile");
    for (const [zipCode, count] of zipCounts) {
      const row = rows.find((candidate) => candidate.zip_code === zipCode);
      if (row?.tx_active_sales_tax_snapshot?.permitted_outlet_count !== count) throw new Error(`ZIP ${zipCode} contribution mismatch`);
    }
  } catch (error) {
    failures.push({ path: zipArtifact?.path ?? "derived/zip-coverage.jsonl", reason: error.message });
  }
  if (failures.length) {
    const error = new Error(`Texas active-sales-tax verification failed for ${failures.length} check(s).`);
    error.failures = failures;
    throw error;
  }
  return { dataset_id: manifest.dataset_id, release_id: manifest.release_id, source_release_id: manifest.source_release_id, artifact_count: artifacts.length, coverage: manifest.coverage };
}
