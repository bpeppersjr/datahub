import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile, lstat, realpath, rm, open } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { finished } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";
import { assertNormalizedUsPostalFieldsDeep } from "./normalized-us-postal-code.mjs";
import { publisherRetryDelay } from "./source-http-guards.mjs";
import { APP_ROOT, assertInsideApp } from "./paths.mjs";
import { createDeAcquisitionBudget } from "./de-acquisition-budget.mjs";
import { preflightDeResources } from "./de-resource-preflight.mjs";
import { createDeExecutionDeadline } from "./de-execution-deadline.mjs";

export const DE_BUSINESS_LICENSE_SCHEMA_VERSION = "1.0.0";
export const DE_BUSINESS_LICENSE_TRANSFORMATION_VERSION = "de-business-licenses@1.0.1";
export const DE_BUSINESS_LICENSE_DATASET_ID = "5zy2-grhr";
export const DE_BUSINESS_LICENSE_METADATA_URL = `https://data.delaware.gov/api/views/${DE_BUSINESS_LICENSE_DATASET_ID}`;
export const DE_BUSINESS_LICENSE_API_URL = `https://data.delaware.gov/resource/${DE_BUSINESS_LICENSE_DATASET_ID}.json`;
export const DE_BUSINESS_LICENSE_PAGE_URL = `https://data.delaware.gov/d/${DE_BUSINESS_LICENSE_DATASET_ID}`;

export const DE_BUSINESS_LICENSE_SCHEMA = Object.freeze([
  ["business_name", "text"],
  ["trade_name", "text"],
  ["category", "text"],
  ["current_license_valid_from", "calendar_date"],
  ["current_license_valid_to", "calendar_date"],
  ["address_1", "text"],
  ["address_2", "text"],
  ["city", "text"],
  ["state", "text"],
  ["zip", "text"],
  ["country", "text"],
  ["license_number", "number"],
  ["geocoded_location", "location"],
]);
export const DE_BUSINESS_LICENSE_FIELDS = Object.freeze(DE_BUSINESS_LICENSE_SCHEMA.map(([field]) => field));
export const DE_BUSINESS_LICENSE_SOURCE_FIELDS = Object.freeze(["socrata_row_id", ...DE_BUSINESS_LICENSE_FIELDS]);
export const DE_BUSINESS_LICENSE_SCHEMA_FINGERPRINT = "711aa444cd76259bfaec1af54f718c22faa132337d0daf0b71ae47d46e5bb37b";

const US_STATE_AND_TERRITORY_CODES = new Set([
  "AL", "AK", "AS", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "GU", "HI", "ID", "IL", "IN", "IA", "KS", "KY",
  "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "MP", "OH", "OK",
  "OR", "PA", "PR", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "VI", "WA", "WV", "WI", "WY",
]);
const US_COUNTRY_VALUES = new Set(["UNITED STATES", "UNITED STATES OF AMERICA", "USA", "U.S.A.", "US", "U.S."]);
const EXCLUDED_SOURCE_FIELDS = new Set(["owner_name", "phone", "email", "registered_agent", "officer", "principal", "contact"]);
const QUARANTINE_REASONS = new Set([
  "missing-or-invalid-delaware-license-identity",
  "conflicting-license-business-names",
  "conflicting-license-addresses",
  "conflicting-license-validity-periods",
]);

function textValue(value) {
  const result = String(value ?? "").trim();
  return result || null;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function hashFile(filename, signal) {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(filename, { signal })) {
    bytes += chunk.length;
    hash.update(chunk);
  }
  return { bytes, sha256: hash.digest("hex") };
}

async function deYield(signal) {
  signal?.throwIfAborted();
  await new Promise((resolve) => setImmediate(resolve));
  signal?.throwIfAborted();
}

async function deCanonicalDirectory(directory, create = false) {
  const absolute = assertInsideApp(path.resolve(directory));
  if (absolute === path.resolve(APP_ROOT)) throw new Error("Delaware output cannot be the app root.");
  const relative = path.relative(APP_ROOT, absolute);
  let current = APP_ROOT;
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    let info;
    try { info = await lstat(current, { bigint: true }); }
    catch (error) {
      if (error.code !== "ENOENT" || !create) throw error;
      await mkdir(current);
      info = await lstat(current, { bigint: true });
    }
    if (!info.isDirectory() || info.isSymbolicLink() || path.resolve(await realpath(current)).toLowerCase() !== path.resolve(current).toLowerCase()) throw new Error("Delaware directory must be canonical and non-symlink.");
  }
  return absolute;
}

async function deSameDirectory(directory, expected) {
  try {
    await deCanonicalDirectory(directory);
    const actual = await lstat(directory, { bigint: true });
    return actual.dev === expected.dev && actual.ino === expected.ino;
  } catch { return false; }
}

async function dePublicationSnapshot(directory, signal) {
  signal?.throwIfAborted();
  const manifestPath = path.join(directory, "manifest.json");
  const manifestInfo = await lstat(manifestPath, { bigint: true });
  if (!manifestInfo.isFile() || manifestInfo.isSymbolicLink() || manifestInfo.nlink !== 1n || manifestInfo.size > 2_000_000n) throw new Error("Unsafe Delaware manifest.");
  const bytes = await readFile(manifestPath);
  const manifest = JSON.parse(bytes);
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length > 64) throw new Error("Invalid Delaware artifact roster.");
  const snapshot = [{ path: "manifest.json", sha256: sha256(bytes), ino: String(manifestInfo.ino) }];
  const seen = new Set();
  for (const artifact of manifest.artifacts) {
    await deYield(signal);
    if (typeof artifact.path !== "string" || seen.has(artifact.path) || artifact.path.includes("\\") || artifact.path.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("Unsafe Delaware artifact path.");
    seen.add(artifact.path);
    const filename = path.resolve(directory, artifact.path);
    assertContained(directory, filename, "Delaware artifact");
    await deCanonicalDirectory(path.dirname(filename));
    const info = await lstat(filename, { bigint: true });
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1n) throw new Error("Unsafe Delaware artifact file.");
    snapshot.push({ path: artifact.path, ...(await hashFile(filename, signal)), ino: String(info.ino) });
  }
  return JSON.stringify(snapshot);
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
  if (!Number.isInteger(unixSeconds) || unixSeconds <= 0) throw new Error("Delaware catalog rowsUpdatedAt must be a positive Unix timestamp.");
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
      postal_code: exact[1],
      zip4: exact[2] ?? null,
      status: exact[2] ? "normalized-zip-plus-4" : "normalized-zip5",
    };
  }
  return { raw, zip_code: null, postal_code: null, zip4: null, status: "invalid-or-non-us-format" };
}

function dateValue(value) {
  const raw = textValue(value);
  const match = raw?.match(/^(\d{4}-\d{2}-\d{2})(?:T.*)?$/);
  return match?.[1] ?? null;
}

function stateCode(value) {
  const raw = textValue(value);
  const normalized = raw?.toUpperCase() ?? null;
  return normalized && US_STATE_AND_TERRITORY_CODES.has(normalized) ? normalized : null;
}

function countryScope(value) {
  const raw = textValue(value);
  if (!raw) return "country-not-reported";
  return US_COUNTRY_VALUES.has(raw.toUpperCase()) ? "reported-united-states" : "reported-other-country-or-unrecognized-value";
}

function point(value, addressStateCode) {
  const longitude = Number(value?.longitude);
  const latitude = Number(value?.latitude);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) return null;
  const withinDelawareBounds = longitude >= -75.9 && longitude <= -74.9 && latitude >= 38.3 && latitude <= 39.9;
  return {
    type: "Point",
    coordinates: [longitude, latitude],
    coordinate_scope: "source-geocoded-reported-business-address-not-verified-physical-operating-site",
    plausibility: addressStateCode !== "DE"
      ? "not-independently-validated"
      : withinDelawareBounds
        ? "within-broad-delaware-bounds"
        : "reported-de-address-coordinate-outside-broad-delaware-bounds",
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

function provenance(context, licenseNumber) {
  return {
    source_id: "delaware-division-of-revenue-current-business-licenses",
    source_release_id: context.sourceReleaseId,
    source_record_id: licenseNumber,
    ingest_run_id: context.runId,
    transformation_version: DE_BUSINESS_LICENSE_TRANSFORMATION_VERSION,
    policy_id: "de-business-licenses",
  };
}

export function schemaFingerprint(columns) {
  const byField = new Map((columns ?? []).map((column) => [column.fieldName, column.dataTypeName]));
  const actual = DE_BUSINESS_LICENSE_SCHEMA.map(([field]) => [field, byField.get(field) ?? null]);
  return sha256(actual.map(([field, type]) => `${field}:${type}`).join("\u0000"));
}

function selectedRecord(row) {
  return Object.fromEntries(DE_BUSINESS_LICENSE_SOURCE_FIELDS.filter((field) => row[field] !== undefined).map((field) => [field, row[field]]));
}

function uniqueText(rows, field) {
  return [...new Set(rows.map((row) => textValue(row[field])).filter(Boolean))].sort(compareText);
}

function normalizedAddressKey(row) {
  return ["address_1", "address_2", "city", "state", "zip", "country"]
    .map((field) => textValue(row[field])?.toUpperCase() ?? "")
    .join("\u0000");
}

export function normalizeDeBusinessLicense(sourceRecords, context) {
  if (!Array.isArray(sourceRecords) || !sourceRecords.length) throw new Error("missing-or-invalid-delaware-license-identity");
  const licenseNumbers = uniqueText(sourceRecords, "license_number");
  const legalNames = uniqueText(sourceRecords, "business_name");
  if (licenseNumbers.length !== 1 || !/^\d{10}$/.test(licenseNumbers[0] ?? "") || legalNames.length !== 1) {
    throw new Error(legalNames.length > 1 ? "conflicting-license-business-names" : "missing-or-invalid-delaware-license-identity");
  }
  if (new Set(sourceRecords.map(normalizedAddressKey)).size !== 1) throw new Error("conflicting-license-addresses");
  const validFromValues = uniqueText(sourceRecords, "current_license_valid_from");
  const validToValues = uniqueText(sourceRecords, "current_license_valid_to");
  if (validFromValues.length !== 1 || validToValues.length !== 1 || !dateValue(validFromValues[0]) || !dateValue(validToValues[0])) {
    throw new Error("conflicting-license-validity-periods");
  }
  const licenseNumber = licenseNumbers[0];
  const legalName = legalNames[0];
  const source = sourceRecords[0];
  const postal = postalCode(source.zip);
  const state = stateCode(source.state);
  const country = countryScope(source.country);
  const street = textValue(source.address_1);
  const city = textValue(source.city);
  const eligible = Boolean(street && city && state && postal.zip_code && country === "reported-united-states");
  const coordinateSource = sourceRecords.find((row) => point(row.geocoded_location, state))?.geocoded_location ?? null;
  const coordinate = point(coordinateSource, state);
  const tradeNames = uniqueText(sourceRecords, "trade_name").filter((name) => name.toUpperCase() !== legalName.toUpperCase());
  return {
    schema_version: DE_BUSINESS_LICENSE_SCHEMA_VERSION,
    normalized_record_id: `de-business-licenses:license:${licenseNumber}`,
    entity_candidates: { organization_id: `organization:de_dor_license_${licenseNumber}`, identity_status: "provisional" },
    external_identifiers: [{ type: "de_division_of_revenue_business_license_number", value: licenseNumber, source_field: "license_number" }],
    legal_name: legalName,
    other_names: tradeNames.map((name) => ({ name, name_type: "source-trade-name" })),
    reported_business_address: {
      street,
      unit_or_additional: textValue(source.address_2),
      city,
      state_source: textValue(source.state),
      state_code: state,
      postal_code_source: postal.raw,
      zip_code: postal.zip_code,
      postal_code: postal.postal_code,
      zip4: postal.zip4,
      postal_code_status: postal.status,
      country_source: textValue(source.country),
      country_scope: country,
      address_scope: "division-of-revenue-reported-business-address-not-verified-physical-operating-site",
      eligible_for_us_zip_coverage: eligible,
    },
    reported_address_coordinate: coordinate,
    geography: geography(eligible ? postal.zip_code : null, context.baselineByZip),
    license_profile: {
      license_number: licenseNumber,
      current_license_valid_from: dateValue(validFromValues[0]),
      current_license_valid_to: dateValue(validToValues[0]),
      business_activities: uniqueText(sourceRecords, "category"),
      source_row_count: sourceRecords.length,
      source_record_ids: uniqueText(sourceRecords, "socrata_row_id"),
    },
    source_status: {
      value: "listed-in-delaware-current-business-licenses-dataset-as-of-source-refresh",
      status: "Currently licensed (dataset inclusion)",
      source_rows_updated_at: context.sourceRowsUpdatedAt,
      semantics: "current-license-in-division-of-revenue-dataset-not-independent-proof-of-current-operations-good-standing-or-an-open-storefront",
    },
    privacy: {
      classification: "possible-natural-person-name-or-residential-business-address",
      source_contains_owner_contact_or_agent_fields: false,
      record_level_distribution: "local-review-only",
    },
    observed_at: context.retrievedAt,
    provenance: provenance(context, licenseNumber),
    export_policy: "local-review-only",
  };
}

function assertAllowedUrl(urlValue, type) {
  const url = new URL(urlValue);
  if (url.protocol !== "https:" || url.hostname !== "data.delaware.gov") throw new Error(`Delaware ${type} URL is outside the allowlist.`);
  const expectedPath = type === "metadata" ? `/api/views/${DE_BUSINESS_LICENSE_DATASET_ID}` : `/resource/${DE_BUSINESS_LICENSE_DATASET_ID}.json`;
  if (url.pathname !== expectedPath) throw new Error(`Delaware ${type} URL has an unexpected path.`);
  return url;
}

function deAbortable(work, signal) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener("abort", abort);
    const abort = () => { cleanup(); reject(signal.reason); };
    signal?.addEventListener("abort", abort, { once: true });
    Promise.resolve().then(() => { signal?.throwIfAborted(); return work(); }).then(
      (value) => { cleanup(); resolve(value); },
      (error) => { cleanup(); reject(error); },
    );
  });
}

async function deWait(milliseconds, signal, sleep) {
  if (sleep) return deAbortable(() => sleep(milliseconds, signal), signal);
  let timer;
  try { await deAbortable(() => new Promise((resolve) => { timer = setTimeout(resolve, milliseconds); }), signal); }
  finally { clearTimeout(timer); }
}

export async function requestDeJson(urlValue, {
  fetchImpl = globalThis.fetch,
  signal,
  sleep,
  maximumResponseBytes = 80_000_000,
  timeoutMs = 60_000,
  type = "data",
  attempts = 5,
  acquisitionBudget,
} = {}) {
  const url = assertAllowedUrl(urlValue, type);
  if (!Number.isInteger(maximumResponseBytes) || maximumResponseBytes < 1 || maximumResponseBytes > 80_000_000 || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000 || !Number.isInteger(attempts) || attempts < 1 || attempts > 5) throw new Error("Invalid Delaware transport limits.");
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    signal?.throwIfAborted?.();
    acquisitionBudget?.beforeRequest();
    const controller = new AbortController();
    const deadline = performance.now() + timeoutMs;
    const abort = () => controller.abort(signal.reason);
    signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => controller.abort(Object.assign(new Error("Delaware source request deadline exceeded."), { code: "DE_TIMEOUT" })), timeoutMs);
    let response, reader, complete = false, retryMs = null;
    try {
      const pending = Promise.resolve().then(() => { controller.signal.throwIfAborted(); return fetchImpl(url, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { accept: "application/json", "user-agent": "Co*Tive-Collector/0.1 governed-public-data-connector" },
      }); });
      void pending.then((late) => { if (controller.signal.aborted) void late.body?.cancel().catch(() => {}); }, () => {});
      response = await deAbortable(() => pending, controller.signal);
      if (response.status >= 300 && response.status < 400) throw new Error("Delaware source redirect rejected.");
      if ((response.status === 429 || response.status >= 500) && attempt < attempts - 1) {
        retryMs = publisherRetryDelay(response.headers.get("retry-after"), { fallbackMs: 250 * (2 ** attempt) });
      } else {
        if (!response.ok) throw new Error(`Delaware source request failed with HTTP ${response.status}.`);
        const declaredBytes = Number(response.headers?.get?.("content-length"));
        if (Number.isFinite(declaredBytes) && declaredBytes > maximumResponseBytes) throw new Error("Delaware source response exceeds the configured byte limit.");
        if (!response.body) throw new Error("Delaware source response body is missing.");
        reader = response.body.getReader();
        const chunks = []; let bytes = 0;
        while (true) {
          const { done, value } = await deAbortable(() => reader.read(), controller.signal);
          if (done) break;
          acquisitionBudget?.consumeBytes(value.byteLength);
          bytes += value.byteLength;
          if (bytes > maximumResponseBytes) throw new Error("Delaware source response exceeds the configured byte limit.");
          chunks.push(value);
        }
        let payload;
        try { payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, bytes))); }
        catch { throw Object.assign(new Error("Delaware source JSON encoding or syntax is invalid."), { code: "DE_INVALID_JSON" }); }
        if (performance.now() >= deadline) controller.abort(Object.assign(new Error("Delaware source request deadline exceeded."), { code: "DE_TIMEOUT" }));
        controller.signal.throwIfAborted();
        complete = true;
        return payload;
      }
    } catch (error) {
      signal?.throwIfAborted();
      lastError = controller.signal.aborted ? controller.signal.reason : error;
      if (error.code === "DE_ACQUISITION_BUDGET") throw Object.assign(new Error("Delaware acquisition budget exceeded."), { code: "DE_ACQUISITION_BUDGET" });
      if (error.code === "SOURCE_RETRY_DEFERRED") throw new Error("Delaware publisher retry delay exceeds the local wait budget; defer this acquisition.");
      if (error.code === "DE_INVALID_JSON") throw new Error("Delaware source JSON encoding or syntax is invalid.");
      if (/redirect rejected/.test(error.message)) throw new Error("Delaware source redirect rejected.");
      if (/byte limit/.test(error.message)) throw new Error("Delaware source response exceeds the configured byte limit.");
      if (/HTTP 4\d\d|body is missing/.test(error.message)) throw new Error("Delaware source response rejected.");
      if (attempt === attempts - 1) throw new Error(lastError.code === "DE_TIMEOUT" ? "Delaware source request deadline exceeded." : "Delaware source transport failed.");
      retryMs = 250 * (2 ** attempt);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (!complete) {
        if (reader) void reader.cancel().catch(() => {});
        else if (response?.body) void response.body.cancel().catch(() => {});
      }
      reader?.releaseLock();
    }
    await deWait(retryMs, signal, sleep);
  }
  throw lastError;
}

function validateCatalogMetadata(metadata, expectedFingerprint = DE_BUSINESS_LICENSE_SCHEMA_FINGERPRINT) {
  if (metadata?.id !== DE_BUSINESS_LICENSE_DATASET_ID || metadata?.name !== "Delaware Business Licenses") throw new Error("Unexpected Delaware business-license catalog metadata.");
  if (metadata?.license?.name !== "Public Domain") throw new Error("Delaware catalog license changed.");
  if (metadata?.attribution !== "Department of Finance, Division of Revenue") throw new Error("Delaware catalog attribution changed.");
  if (metadata?.description !== "Information for businesses currently licensed in Delaware.") throw new Error("Delaware current-license description changed.");
  const fingerprint = schemaFingerprint(metadata.columns);
  if (fingerprint !== expectedFingerprint) throw new Error(`Delaware selected schema changed (${fingerprint}).`);
  return { rowsUpdatedAt: metadata.rowsUpdatedAt, rowsUpdatedAtIso: sourceTimestamp(metadata.rowsUpdatedAt), schemaFingerprint: fingerprint };
}

function soqlUrl(parameters) {
  const url = new URL(DE_BUSINESS_LICENSE_API_URL);
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
  return url.toString();
}

async function sourceCounts(options) {
  const rows = await requestDeJson(soqlUrl({ $select: "count(*) as records,count(distinct license_number) as distinct_licenses" }), options);
  const records = Number(rows?.[0]?.records);
  const distinctLicenses = Number(rows?.[0]?.distinct_licenses);
  if (!Number.isInteger(records) || !Number.isInteger(distinctLicenses) || records < 0 || distinctLicenses < 0 || distinctLicenses > records) {
    throw new Error("Delaware source count response is invalid.");
  }
  return { records, distinctLicenses };
}

async function openGzipWriter(stagingDirectory, relativePath, registry = [], signal) {
  signal?.throwIfAborted();
  const destination = path.join(stagingDirectory, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp-${randomUUID()}`;
  const output = createWriteStream(temporary, { flags: "wx" });
  const gzip = createGzip({ level: 9 });
  const completion = Promise.allSettled([finished(output), finished(gzip)]).then((results) => {
    const failed = results.find((result) => result.status === "rejected");
    if (failed) throw failed.reason;
  });
  void completion.catch(() => {});
  gzip.on("error", (error) => output.destroy(error));
  output.on("error", (error) => gzip.destroy(error));
  gzip.pipe(output);
  const writer = { relativePath: relativePath.replaceAll("\\", "/"), destination, temporary, output, gzip, completion, signal, records: 0 };
  registry.push(writer);
  if (signal?.aborted) abortGzipWriters([writer], new Error("Delaware build cancelled."));
  return writer;
}

async function writeGzipRecord(writer, record) {
  writer.signal?.throwIfAborted();
  if (!writer.gzip.write(`${JSON.stringify(record)}\n`)) await once(writer.gzip, "drain");
  writer.records += 1;
}

async function closeGzipWriter(writer, artifactType, metadata = {}) {
  writer.signal?.throwIfAborted();
  writer.gzip.end();
  await writer.completion;
  await renameWithRetry(writer.temporary, writer.destination, 12, writer.signal);
  return { path: writer.relativePath, ...(await hashFile(writer.destination, writer.signal)), record_count: writer.records, artifact_type: artifactType, ...metadata };
}

function abortGzipWriters(writers, error) {
  for (const writer of writers) {
    writer.gzip.destroy(error);
    writer.output.destroy(error);
  }
}

async function renameWithRetry(sourcePath, destinationPath, attempts = 12, signal) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    signal?.throwIfAborted();
    try {
      await rename(sourcePath, destinationPath);
      return;
    } catch (error) {
      lastError = error;
      if (!["EACCES", "EBUSY", "EPERM"].includes(error.code) || attempt === attempts - 1) break;
      await deWait(Math.min(4_000, 50 * (2 ** attempt)), signal);
    }
  }
  throw lastError;
}

async function writeArtifact(directory, relativePath, content, metadata = {}, signal) {
  signal?.throwIfAborted();
  const destination = path.join(directory, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
  const temporary = `${destination}.tmp-${randomUUID()}`;
  await writeFile(temporary, buffer, { flag: "wx", signal });
  await renameWithRetry(temporary, destination, 12, signal);
  return { path: relativePath.replaceAll("\\", "/"), bytes: buffer.length, sha256: sha256(buffer), ...metadata };
}

function assertContained(parent, child, label) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`${label} escapes its release directory.`);
}

async function loadZbpBaseline(pointerPath, signal) {
  const absolutePointer = path.resolve(pointerPath);
  const pointer = JSON.parse(await readFile(absolutePointer, { encoding: "utf8", signal }));
  const base = path.dirname(absolutePointer);
  const manifestPath = path.resolve(base, pointer.manifest ?? "");
  assertContained(base, manifestPath, "Census ZBP manifest");
  const manifestBuffer = await readFile(manifestPath, { signal });
  const manifest = JSON.parse(manifestBuffer.toString("utf8"));
  if (manifest.dataset_id !== "census-zbp-baseline" || !manifest.complete_national_release) throw new Error("A complete Census ZBP baseline release is required.");
  const artifact = manifest.artifacts.find((candidate) => candidate.path === "derived/zip-coverage.jsonl");
  if (!artifact) throw new Error("Census ZBP ZIP coverage artifact is missing.");
  const artifactPath = path.resolve(path.dirname(manifestPath), artifact.path);
  assertContained(path.dirname(manifestPath), artifactPath, "Census ZBP coverage artifact");
  const rows = [];
  for (const line of (await readFile(artifactPath, { encoding: "utf8", signal })).split(/\r?\n/)) {
    if (rows.length % 128 === 0) await deYield(signal);
    if (line) rows.push(JSON.parse(line));
  }
  return { rows, byZip: new Map(rows.map((row) => [row.zip_code, row])), manifest, manifestSha256: sha256(manifestBuffer) };
}

async function* gzipRecords(filename, signal) {
  const input = createReadStream(filename, { signal });
  const gzip = createGunzip();
  const completion = Promise.allSettled([finished(input), finished(gzip)]);
  input.on("error", (error) => gzip.destroy(error));
  gzip.on("error", (error) => input.destroy(error));
  const lines = createInterface({ input: input.pipe(gzip), crlfDelay: Infinity });
  let count = 0;
  try {
    for await (const line of lines) {
      signal?.throwIfAborted();
      if (++count % 128 === 0) await deYield(signal);
      if (line) yield JSON.parse(line);
    }
  } finally {
    lines.close(); input.destroy(); gzip.destroy(); await completion;
  }
}

function sourceSafeRecord(record) {
  for (const field of Object.keys(record)) if (!DE_BUSINESS_LICENSE_SOURCE_FIELDS.includes(field)) throw new Error(`Unapproved Delaware source field ${field}.`);
  return selectedRecord(record);
}

function compareText(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

async function acquireSource({ writer, sourceRecords, expectedCount, fetchImpl, signal, sleep, pageSize, logger, acquisitionBudget }) {
  let count = 0;
  let previousLicense = null;
  let previousSocrataId = null;
  const consume = async (input) => {
    signal?.throwIfAborted?.();
    acquisitionBudget.assertRows(count + 1);
    if (count >= expectedCount) throw new Error("Delaware source rows exceed the preflight count.");
    const record = sourceSafeRecord(input);
    const licenseNumber = textValue(record.license_number);
    const rowId = textValue(record.socrata_row_id);
    if (!/^\d{10}$/.test(licenseNumber ?? "") || !rowId || !textValue(record.business_name)) throw new Error("Delaware source acquisition received an invalid row.");
    if (previousLicense !== null && compareText(licenseNumber, previousLicense) < 0) throw new Error(`Delaware source license numbers are not nondecreasing at ${licenseNumber}.`);
    if (licenseNumber === previousLicense && rowId === previousSocrataId) throw new Error(`Duplicate Delaware Socrata row ID ${rowId}.`);
    previousLicense = licenseNumber;
    previousSocrataId = rowId;
    await writeGzipRecord(writer, record);
    count += 1;
    if (count % 128 === 0) await deYield(signal);
  };
  if (sourceRecords) {
    for (const record of sourceRecords) await consume(record);
  } else {
    for (let offset = 0; offset < expectedCount; offset += pageSize) {
      const rows = await requestDeJson(soqlUrl({
        $select: `:id as socrata_row_id,${DE_BUSINESS_LICENSE_FIELDS.join(",")}`,
        $order: "license_number ASC,:id ASC",
        $limit: String(pageSize),
        $offset: String(offset),
      }), { fetchImpl, signal, sleep, type: "data", acquisitionBudget });
      if (!Array.isArray(rows) || rows.length > pageSize) throw new Error("Delaware source page is invalid or exceeds the page-size limit.");
      if (rows.length === 0) break;
      for (const record of rows) await consume(record);
      logger(`Acquired ${count.toLocaleString("en-US")} Delaware current-license rows.`);
      if (rows.length < pageSize) break;
    }
  }
  if (count !== expectedCount) throw new Error(`Delaware source acquisition returned ${count} rows; preflight reported ${expectedCount}.`);
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
      de_business_license_snapshot: {
        status: count ? "published-current-license-reported-business-addresses" : "no-eligible-reported-business-address-in-current-source-snapshot",
        organization_reported_business_address_count: count,
        source_release_id: context.sourceReleaseId,
        source_rows_updated_at: context.sourceRowsUpdatedAt,
        physical_site_count: null,
        physical_site_inference_permitted: false,
      },
    };
  });
}

export async function buildDeBusinessLicenses(options = {}) {
  const deadline = createDeExecutionDeadline({ signal: options.signal, timeoutMs: options.executionTimeoutMs });
  try { return await buildDeBusinessLicensesInternal({ ...options, signal: deadline.signal, checkExecutionDeadline: deadline.check }); }
  finally { deadline.dispose(); }
}

async function buildDeBusinessLicensesInternal({
  outputRoot,
  zbpPointer,
  catalogMetadata = null,
  sourceRecords = null,
  minimumLicenseRows = 60_000,
  maximumQuarantineRate = 0.05,
  pageSize = 50_000,
  schemaFingerprintExpected = DE_BUSINESS_LICENSE_SCHEMA_FINGERPRINT,
  fetchImpl = globalThis.fetch,
  signal,
  sleep,
  logger = console.log,
  now = () => new Date(),
  onBeforeCommit,
  onAfterCommit,
  acquisitionLimits,
  resourceProbe,
  checkExecutionDeadline,
} = {}) {
  if (!outputRoot || !zbpPointer) throw new Error("outputRoot and zbpPointer are required.");
  if (!Number.isInteger(minimumLicenseRows) || minimumLicenseRows < 1) throw new Error("minimumLicenseRows must be a positive integer.");
  if (!Number.isFinite(maximumQuarantineRate) || maximumQuarantineRate < 0 || maximumQuarantineRate > 1) throw new Error("maximumQuarantineRate must be between 0 and 1.");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50_000) throw new Error("pageSize must be from 1 through 50000.");
  const acquisitionBudget = createDeAcquisitionBudget(acquisitionLimits);
  signal?.throwIfAborted?.();
  const retrievedAt = now().toISOString();
  const runId = randomUUID();
  const releaseId = `de-business-licenses-${releaseTimestamp(retrievedAt)}-${runId.slice(0, 8)}`;
  const stagingDirectory = path.join(outputRoot, ".staging", runId);
  await deCanonicalDirectory(outputRoot, true);
  const resourcePreflight = await preflightDeResources({ outputRoot, signal, probe: resourceProbe });
  checkExecutionDeadline();
  await deCanonicalDirectory(path.dirname(stagingDirectory), true);
  await mkdir(stagingDirectory);
  const stageIdentity = await lstat(stagingDirectory, { bigint: true });
  const allWriters = [];
  const abortWriters = () => abortGzipWriters(allWriters, new Error("Delaware build cancelled."));
  signal?.addEventListener("abort", abortWriters, { once: true });
  try {
  signal?.throwIfAborted();
  const baseline = await loadZbpBaseline(zbpPointer, signal);
  const requestOptions = { fetchImpl, signal, sleep, type: "metadata", acquisitionBudget };
  const initialMetadata = catalogMetadata ?? await requestDeJson(DE_BUSINESS_LICENSE_METADATA_URL, requestOptions);
  const catalog = validateCatalogMetadata(initialMetadata, schemaFingerprintExpected);
  const counts = sourceRecords
    ? {
        records: Number(initialMetadata.sourceRecordCount ?? sourceRecords.length),
        distinctLicenses: Number(initialMetadata.distinctLicenseCount ?? new Set(sourceRecords.map((row) => row.license_number)).size),
      }
    : await sourceCounts({ fetchImpl, signal, sleep, type: "data", acquisitionBudget });
  acquisitionBudget.assertRows(counts.records);
  if (!Number.isInteger(counts.records) || !Number.isInteger(counts.distinctLicenses) || counts.records < minimumLicenseRows || counts.distinctLicenses < 1 || counts.distinctLicenses > counts.records) {
    throw new Error(`Delaware current-license row count ${counts.records} is below the ${minimumLicenseRows} quality floor or is inconsistent.`);
  }
  const rawWriter = await openGzipWriter(stagingDirectory, "source/current-business-licenses.jsonl.gz", allWriters, signal);
  let sourceArtifact;
  try {
    await acquireSource({ writer: rawWriter, sourceRecords, expectedCount: counts.records, fetchImpl, signal, sleep, pageSize, logger, acquisitionBudget });
    sourceArtifact = await closeGzipWriter(rawWriter, "de-business-licenses-source-jsonl-gzip", { export_policy: "internal" });
  } catch (error) {
    abortGzipWriters([rawWriter]);
    throw error;
  }
  if (!sourceRecords) {
    const finalMetadata = await requestDeJson(DE_BUSINESS_LICENSE_METADATA_URL, requestOptions);
    const finalCatalog = validateCatalogMetadata(finalMetadata, schemaFingerprintExpected);
    const finalCounts = await sourceCounts({ fetchImpl, signal, sleep, type: "data", acquisitionBudget });
    acquisitionBudget.assertRows(finalCounts.records);
    if (finalCatalog.rowsUpdatedAt !== catalog.rowsUpdatedAt || finalCounts.records !== counts.records || finalCounts.distinctLicenses !== counts.distinctLicenses) {
      throw new Error("Delaware source changed during acquisition; the run is not publishable.");
    }
  }
  const sourceReleaseDigest = sha256(`${catalog.rowsUpdatedAtIso}\u0000${sourceArtifact.sha256}`);
  const sourceReleaseId = `de-business-licenses-${catalog.rowsUpdatedAtIso.slice(0, 10)}-${sourceReleaseDigest.slice(0, 16)}`;
  const context = { runId, retrievedAt, sourceRowsUpdatedAt: catalog.rowsUpdatedAtIso, sourceReleaseId, baselineByZip: baseline.byZip };
  const writers = new Map();
  for (const prefix of "0123456789abcdef") writers.set(prefix, await openGzipWriter(stagingDirectory, `derived/organizations/id-hash-prefix=${prefix}.jsonl.gz`, allWriters, signal));
  const quarantineWriter = await openGzipWriter(stagingDirectory, "quality/quarantined-license-groups.jsonl.gz", allWriters, signal);
  const licenseIds = new Set();
  const countsByZip = new Map();
  const businessActivities = new Map();
  const addressStates = new Map();
  const countries = new Map();
  const postalStatuses = new Map();
  let organizations = 0;
  let acceptedLicenseRows = 0;
  let quarantinedSourceRecords = 0;
  let quarantinedLicenseGroups = 0;
  let eligibleUsAddresses = 0;
  let geocodedAddresses = 0;
  let suspiciousDeGeocodes = 0;
  let repeatedLicenseGroups = 0;
  let group = [];
  const emitGroup = async () => {
    if (!group.length) return;
    if (group.length > 1) repeatedLicenseGroups += 1;
    try {
      const normalized = normalizeDeBusinessLicense(group, context);
      assertNormalizedUsPostalFieldsDeep(normalized);
      const licenseNumber = normalized.external_identifiers[0].value;
      if (licenseIds.has(licenseNumber)) throw new Error(`Duplicate Delaware license number ${licenseNumber}.`);
      licenseIds.add(licenseNumber);
      await writeGzipRecord(writers.get(sha256(licenseNumber)[0]), normalized);
      for (const activity of normalized.license_profile.business_activities) increment(businessActivities, activity);
      increment(addressStates, normalized.reported_business_address.state_code ?? normalized.reported_business_address.state_source);
      increment(countries, normalized.reported_business_address.country_source);
      increment(postalStatuses, normalized.reported_business_address.postal_code_status);
      if (normalized.reported_address_coordinate) {
        geocodedAddresses += 1;
        if (normalized.reported_address_coordinate.plausibility === "reported-de-address-coordinate-outside-broad-delaware-bounds") suspiciousDeGeocodes += 1;
      }
      if (normalized.reported_business_address.eligible_for_us_zip_coverage) {
        const zipCode = normalized.reported_business_address.zip_code;
        countsByZip.set(zipCode, (countsByZip.get(zipCode) ?? 0) + 1);
        eligibleUsAddresses += 1;
      }
      acceptedLicenseRows += group.length;
      organizations += 1;
    } catch (error) {
      if (!QUARANTINE_REASONS.has(error.message)) throw error;
      await writeGzipRecord(quarantineWriter, {
        reason: error.message,
        license_number_source: textValue(group[0]?.license_number),
        source_record_count: group.length,
        source_record_ids: uniqueText(group, "socrata_row_id"),
        source_release_id: context.sourceReleaseId,
        export_policy: "internal",
      });
      quarantinedSourceRecords += group.length;
      quarantinedLicenseGroups += 1;
    }
    group = [];
  };
  try {
    for await (const source of gzipRecords(path.join(stagingDirectory, sourceArtifact.path), signal)) {
      signal?.throwIfAborted?.();
      if (group.length && source.license_number !== group[0].license_number) await emitGroup();
      group.push(source);
    }
    await emitGroup();
  } catch (error) {
    abortGzipWriters([...writers.values(), quarantineWriter]);
    throw error;
  }
  if (acceptedLicenseRows + quarantinedSourceRecords !== counts.records || organizations + quarantinedLicenseGroups !== counts.distinctLicenses) {
    throw new Error("Delaware accepted and quarantined license groups do not reconcile to the source snapshot.");
  }
  if (quarantinedSourceRecords / counts.records > maximumQuarantineRate) {
    abortGzipWriters([...writers.values(), quarantineWriter]);
    throw new Error("Delaware quarantine rate exceeds the governed maximum.");
  }
  const artifacts = [
    sourceArtifact,
    ...await Promise.all([...writers.values()].map((writer) => closeGzipWriter(writer, "normalized-de-business-license-jsonl-gzip", { export_policy: "local-review-only" }))),
    await closeGzipWriter(quarantineWriter, "de-business-license-quarantine-jsonl-gzip", { export_policy: "internal" }),
  ];
  const coverageRows = buildZipCoverage(baseline.rows, countsByZip, context);
  artifacts.push(await writeArtifact(stagingDirectory, "derived/zip-coverage.jsonl", jsonLines(coverageRows), { artifact_type: "de-business-licenses-zip-coverage-jsonl", record_count: coverageRows.length }, signal));
  artifacts.push(await writeArtifact(stagingDirectory, "derived/source-summary.json", json({
    source_current_license_rows: counts.records,
    accepted_current_license_rows: acceptedLicenseRows,
    distinct_source_license_numbers: counts.distinctLicenses,
    distinct_licenses_published: organizations,
    repeated_license_groups: repeatedLicenseGroups,
    quarantined_source_records: quarantinedSourceRecords,
    quarantined_license_groups: quarantinedLicenseGroups,
    eligible_reported_us_business_addresses: eligibleUsAddresses,
    organizations_without_eligible_us_zip_address: organizations - eligibleUsAddresses,
    source_geocoded_reported_business_addresses: geocodedAddresses,
    reported_de_address_geocodes_outside_broad_de_bounds: suspiciousDeGeocodes,
    business_activities: sortedCounts(businessActivities),
    reported_address_states: sortedCounts(addressStates),
    reported_address_countries: sortedCounts(countries),
    postal_code_statuses: sortedCounts(postalStatuses),
  }), { artifact_type: "de-business-licenses-source-summary" }, signal));
  artifacts.push(await writeArtifact(stagingDirectory, "source/release-metadata.json", json({
    dataset_id: DE_BUSINESS_LICENSE_DATASET_ID,
    dataset_name: initialMetadata.name,
    publisher: initialMetadata.attribution,
    license: initialMetadata.license,
    source_rows_updated_at: catalog.rowsUpdatedAtIso,
    source_rows_updated_at_unix: catalog.rowsUpdatedAt,
    selected_schema: DE_BUSINESS_LICENSE_SCHEMA,
    selected_schema_fingerprint: catalog.schemaFingerprint,
    selected_fields: DE_BUSINESS_LICENSE_SOURCE_FIELDS,
    explicitly_excluded_field_classes: ["owner, officer, principal, and registered-agent identities", "phone, email, and contact fields"],
    query: { filter: "dataset inclusion defines currently licensed", order: "license_number ASC, :id ASC", pagination: "stable offset against refresh-pinned snapshot", page_size: pageSize },
    expected_source_record_count: counts.records,
    expected_distinct_license_count: counts.distinctLicenses,
    source_urls: { metadata: DE_BUSINESS_LICENSE_METADATA_URL, api: DE_BUSINESS_LICENSE_API_URL, dataset_page: DE_BUSINESS_LICENSE_PAGE_URL },
  }), { artifact_type: "de-business-licenses-source-release-metadata" }, signal));
  const manifest = {
    schema_version: DE_BUSINESS_LICENSE_SCHEMA_VERSION,
    dataset_id: "de-business-licenses-current",
    connector: { id: "de-business-licenses", version: "1.0.1" },
    release_id: releaseId,
    run_id: runId,
    retrieved_at: retrievedAt,
    source_rows_updated_at: catalog.rowsUpdatedAtIso,
    source_release_id: sourceReleaseId,
    status: "published",
    complete_current_license_snapshot: true,
    coverage: {
      source_current_license_rows: counts.records,
      accepted_current_license_rows: acceptedLicenseRows,
      distinct_source_license_numbers: counts.distinctLicenses,
      distinct_licenses_published: organizations,
      repeated_license_groups: repeatedLicenseGroups,
      quarantined_source_records: quarantinedSourceRecords,
      quarantined_license_groups: quarantinedLicenseGroups,
      eligible_reported_us_business_addresses: eligibleUsAddresses,
      organizations_without_eligible_us_zip_address: organizations - eligibleUsAddresses,
      source_geocoded_reported_business_addresses: geocodedAddresses,
      reported_de_address_geocodes_outside_broad_de_bounds: suspiciousDeGeocodes,
      source_zip_codes: countsByZip.size,
      zip_union_records: coverageRows.length,
      physical_sites: null,
      establishments: null,
    },
    quality_gates: {
      minimum_license_rows: minimumLicenseRows,
      maximum_quarantine_rate: maximumQuarantineRate,
      observed_quarantine_rate: counts.records ? quarantinedSourceRecords / counts.records : 0,
      source_groups_reconcile: organizations + quarantinedLicenseGroups === counts.distinctLicenses,
      source_rows_reconcile: acceptedLicenseRows + quarantinedSourceRecords === counts.records,
      selected_schema_fingerprint: catalog.schemaFingerprint,
      duplicate_normalized_license_numbers: 0,
      source_unchanged_during_acquisition: true,
    },
    dependencies: [
      { dataset_id: baseline.manifest.dataset_id, release_id: baseline.manifest.release_id, manifest_sha256: baseline.manifestSha256 },
      baseline.manifest.geography_dependency,
    ],
    source: {
      publisher: "Delaware Department of Finance, Division of Revenue",
      catalog_dataset_id: DE_BUSINESS_LICENSE_DATASET_ID,
      source_page: DE_BUSINESS_LICENSE_PAGE_URL,
      api_url: DE_BUSINESS_LICENSE_API_URL,
      access_method: sourceRecords ? "explicit test fixture records" : "anonymous public Socrata API with selected-field ordered pagination",
      license: "Public Domain (catalog metadata)",
      api_key_used: false,
      policy_profile: "config/source-policies/de-business-licenses.json",
    },
    policy: {
      record_level_distribution: "local-review-only",
      aggregate_distribution: "public-with-provenance-and-semantic-limitations",
      privacy_reason: "business names can identify sole proprietors and reported business addresses can be residences",
    },
    limitations: [
      "Currently licensed means inclusion in the Delaware Division of Revenue dataset at the source refresh; it is not independent proof of continuous operations, good standing, solvency, public access, or an open storefront.",
      "The source is a tax and business-license layer, not a census of every business operating in Delaware or the United States.",
      "Reported addresses can be administrative, home, virtual, mailing-like, incomplete, stale, outside Delaware, or otherwise unsuitable as a physical-site assertion; no physical site or establishment is created from them.",
      "Source geocodes are portal-generated mapping aids and are not independently validated; even apparently implausible coordinates are retained with an explicit plausibility flag.",
      "Current USPS validity remains unverified until an authorized operational ZIP denominator is integrated.",
      "One license number can have multiple rows, commonly for multiple trade names; consistent groups become one organization candidate and conflicting groups are quarantined.",
      "Record-level output remains local-review-only because business names can identify sole proprietors and reported business addresses can be residences.",
    ],
    artifacts,
  };
  await writeArtifact(stagingDirectory, "manifest.json", json(manifest), {}, signal);
  const publication = await publishDeBusinessLicensesStaging({ outputRoot, stagingRunId: runId, expectedReleaseId: releaseId, signal, onBeforeCommit: async () => { await onBeforeCommit?.(); checkExecutionDeadline(); }, onAfterCommit });
  try { logger(`Published ${organizations.toLocaleString("en-US")} Delaware current-license organization candidates.`); }
  catch { throw Object.assign(new Error("Delaware post-publication reporting failed; inspect retained publication evidence."), { code: "DE_PUBLICATION_INCOMPLETE", phase: "post-publication", releaseId }); }
  return { manifest, releaseDirectory: publication.releaseDirectory, pointerPath: publication.pointerPath, resourcePreflight };
  } catch (error) {
    abortGzipWriters(allWriters);
    await Promise.allSettled(allWriters.map((writer) => writer.completion));
    if (error.code !== "DE_PUBLICATION_INCOMPLETE" && signal?.aborted && await deSameDirectory(stagingDirectory, stageIdentity)) await rm(stagingDirectory, { recursive: true });
    if (error.code !== "DE_PUBLICATION_INCOMPLETE") signal?.throwIfAborted();
    throw error;
  } finally {
    signal?.removeEventListener("abort", abortWriters);
  }
}

function containsExcludedField(value) {
  if (Array.isArray(value)) return value.some(containsExcludedField);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) => EXCLUDED_SOURCE_FIELDS.has(key.toLowerCase()) || containsExcludedField(child));
}

export async function publishDeBusinessLicensesStaging({ outputRoot, stagingRunId, expectedReleaseId = null, signal, onBeforeCommit, onAfterCommit } = {}) {
  if (!outputRoot || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stagingRunId ?? "")) {
    throw new Error("outputRoot and a valid stagingRunId are required.");
  }
  const stagingRoot = path.join(outputRoot, ".staging");
  const stagingDirectory = path.resolve(stagingRoot, stagingRunId);
  assertContained(stagingRoot, stagingDirectory, "Delaware staging run");
  signal?.throwIfAborted();
  await deCanonicalDirectory(outputRoot);
  await deCanonicalDirectory(stagingDirectory);
  const stageIdentity = await lstat(stagingDirectory, { bigint: true });
  const lockPath = path.join(outputRoot, ".publish.lock");
  const lock = await open(lockPath, "wx");
  const lockIdentity = await lock.stat({ bigint: true });
  let committedReleaseId = null, primaryError = null;
  try {
  const manifestPath = path.join(stagingDirectory, "manifest.json");
  const beforeSnapshot = await dePublicationSnapshot(stagingDirectory, signal);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.run_id !== stagingRunId || manifest.dataset_id !== "de-business-licenses-current" || manifest.status !== "published") {
    throw new Error("Delaware staging manifest does not match the requested complete run.");
  }
  if (expectedReleaseId && manifest.release_id !== expectedReleaseId) throw new Error("Delaware staging release ID does not match the build result.");
  if (!/^de-business-licenses-[0-9TZ-]+-[0-9a-f]{8}$/.test(manifest.release_id)) throw new Error("Invalid Delaware release identity.");
  await verifyDeBusinessLicenses(manifestPath, { signal });
  const releasesDirectory = path.join(outputRoot, "releases");
  await deCanonicalDirectory(releasesDirectory, true);
  const releaseDirectory = path.join(releasesDirectory, manifest.release_id);
  try {
    await stat(releaseDirectory);
    throw new Error(`Delaware release destination already exists: ${manifest.release_id}.`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const pointerPath = path.join(outputRoot, "current.json");
  let prior = null;
  try {
    const info = await lstat(pointerPath, { bigint: true });
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1n) throw new Error("Unsafe Delaware pointer.");
    prior = await readFile(pointerPath);
    const value = JSON.parse(prior);
    if (value.dataset_id !== manifest.dataset_id || !/^de-business-licenses-[0-9TZ-]+-[0-9a-f]{8}$/.test(value.release_id) || value.manifest !== `releases/${value.release_id}/manifest.json`) throw new Error("Foreign Delaware pointer.");
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  await onBeforeCommit?.();
  await verifyDeBusinessLicenses(manifestPath, { signal });
  if (!await deSameDirectory(stagingDirectory, stageIdentity)) throw new Error("Delaware staging ownership changed.");
  if (beforeSnapshot !== await dePublicationSnapshot(stagingDirectory, signal)) throw new Error("Delaware publication artifacts changed.");
  let current = null;
  const pointerInfo = await lstat(pointerPath, { bigint: true }).catch((error) => { if (error.code === "ENOENT") return null; throw error; });
  if (pointerInfo && (!pointerInfo.isFile() || pointerInfo.isSymbolicLink() || pointerInfo.nlink !== 1n)) throw new Error("Unsafe Delaware pointer.");
  try { current = await readFile(pointerPath); } catch (error) { if (error.code !== "ENOENT") throw error; }
  if ((prior === null) !== (current === null) || (prior && !prior.equals(current))) throw new Error("Delaware prior pointer changed.");
  await deYield(signal);
  // Commit boundary: finish bounded local publication without observing cancellation.
  let phase = "release-rename";
  committedReleaseId = manifest.release_id;
  try {
  await renameWithRetry(stagingDirectory, releaseDirectory);
  phase = "pointer-write";
  const temporaryPointer = `${pointerPath}.tmp-${randomUUID()}`;
  await writeFile(temporaryPointer, json({
    dataset_id: manifest.dataset_id,
    release_id: manifest.release_id,
    manifest: `releases/${manifest.release_id}/manifest.json`,
    updated_at: manifest.retrieved_at,
  }), { flag: "wx" });
  phase = "pointer-rename";
  await renameWithRetry(temporaryPointer, pointerPath);
  phase = "post-publication";
  await onAfterCommit?.();
  if (!(await stat(releaseDirectory)).isDirectory()) throw new Error("Published Delaware business-license release is not a directory.");
  return { manifest, releaseDirectory, pointerPath };
  } catch {
    throw Object.assign(new Error("Delaware publication commit requires inspection; retained evidence must not be retried or removed automatically."), { code: "DE_PUBLICATION_INCOMPLETE", phase, releaseId: manifest.release_id });
  }
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    try {
      await lock.close();
      const actual = await lstat(lockPath, { bigint: true }).catch(() => null);
      if (actual?.dev === lockIdentity.dev && actual?.ino === lockIdentity.ino) await rm(lockPath);
    } catch (error) {
      if (!primaryError) {
        if (committedReleaseId) throw Object.assign(new Error("Delaware post-publication cleanup failed; inspect retained publication evidence."), { code: "DE_PUBLICATION_INCOMPLETE", phase: "post-publication", releaseId: committedReleaseId });
        throw error;
      }
    }
  }
}

export async function verifyDeBusinessLicenses(manifestPath, { signal } = {}) {
  await deYield(signal);
  const absoluteManifestPath = path.resolve(manifestPath);
  const releaseDirectory = path.dirname(absoluteManifestPath);
  const manifest = JSON.parse(await readFile(absoluteManifestPath, "utf8"));
  const failures = [];
  if (manifest.dataset_id !== "de-business-licenses-current" || manifest.status !== "published" || !manifest.complete_current_license_snapshot) failures.push({ path: "manifest.json", reason: "unexpected or incomplete manifest" });
  if (manifest.policy?.record_level_distribution !== "local-review-only" || manifest.coverage?.physical_sites !== null || manifest.coverage?.establishments !== null) failures.push({ path: "manifest.json", reason: "privacy or non-site policy was overstated" });
  for (const artifact of manifest.artifacts ?? []) {
    await deYield(signal);
    try {
      const filename = path.resolve(releaseDirectory, artifact.path);
      assertContained(releaseDirectory, filename, `Artifact ${artifact.path}`);
      const actual = await hashFile(filename, signal);
      if (actual.bytes !== artifact.bytes || actual.sha256 !== artifact.sha256) failures.push({ path: artifact.path, reason: "size or SHA-256 mismatch" });
    } catch (error) {
      failures.push({ path: artifact.path, reason: error.code === "ENOENT" ? "missing" : error.message });
    }
  }
  const sourceArtifacts = manifest.artifacts?.filter((artifact) => artifact.artifact_type === "de-business-licenses-source-jsonl-gzip") ?? [];
  const normalizedArtifacts = manifest.artifacts?.filter((artifact) => artifact.artifact_type === "normalized-de-business-license-jsonl-gzip") ?? [];
  const quarantineArtifact = manifest.artifacts?.find((artifact) => artifact.artifact_type === "de-business-license-quarantine-jsonl-gzip");
  if (sourceArtifacts.length !== 1 || sourceArtifacts[0]?.export_policy !== "internal") failures.push({ path: "manifest.json", reason: "expected one internal selected-field source artifact" });
  if (normalizedArtifacts.length !== 16) failures.push({ path: "manifest.json", reason: "expected 16 normalized organization partitions" });
  if (!quarantineArtifact || quarantineArtifact.export_policy !== "internal") failures.push({ path: "manifest.json", reason: "expected one internal quarantine artifact" });
  if (sourceArtifacts.length === 1) {
    const digest = sha256(`${manifest.source_rows_updated_at}\u0000${sourceArtifacts[0].sha256}`);
    if (manifest.source_release_id !== `de-business-licenses-${manifest.source_rows_updated_at.slice(0, 10)}-${digest.slice(0, 16)}`) failures.push({ path: "manifest.json", reason: "source release ID is not bound to refresh timestamp and selected source checksum" });
    try {
      let sourceCount = 0;
      let distinctLicenses = 0;
      let previousLicense = null;
      let previousRowId = null;
      for await (const record of gzipRecords(path.join(releaseDirectory, sourceArtifacts[0].path), signal)) {
        for (const field of Object.keys(record)) if (!DE_BUSINESS_LICENSE_SOURCE_FIELDS.includes(field)) throw new Error(`unapproved source field ${field}`);
        const licenseNumber = textValue(record.license_number);
        const rowId = textValue(record.socrata_row_id);
        if (!/^\d{10}$/.test(licenseNumber ?? "") || !rowId || !textValue(record.business_name) || (previousLicense && compareText(licenseNumber, previousLicense) < 0)) throw new Error(`invalid source identity or ordering at ${licenseNumber}`);
        if (licenseNumber === previousLicense && rowId === previousRowId) throw new Error(`duplicate Socrata row ID ${rowId}`);
        if (licenseNumber !== previousLicense) distinctLicenses += 1;
        previousLicense = licenseNumber;
        previousRowId = rowId;
        sourceCount += 1;
      }
      if (sourceCount !== sourceArtifacts[0].record_count || sourceCount !== manifest.coverage?.source_current_license_rows) throw new Error("source record count mismatch");
      if (distinctLicenses !== manifest.coverage?.distinct_source_license_numbers) throw new Error("source distinct license count mismatch");
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
  let acceptedLicenseRows = 0;
  for (const artifact of normalizedArtifacts) {
    await deYield(signal);
    try {
      const prefix = artifact.path.match(/id-hash-prefix=([0-9a-f])/)?.[1];
      let partitionCount = 0;
      for await (const record of gzipRecords(path.join(releaseDirectory, artifact.path), signal)) {
        const id = record.external_identifiers?.find((item) => item.type === "de_division_of_revenue_business_license_number")?.value;
        if (!id || ids.has(id) || sha256(id)[0] !== prefix) throw new Error(`duplicate, missing, or incorrectly partitioned license number ${id}`);
        ids.add(id);
        if (record.entity_candidates?.organization_id !== `organization:de_dor_license_${id}` || record.entity_candidates?.physical_site_id || record.entity_candidates?.establishment_id) throw new Error(`invalid organization-only identity for ${id}`);
        if (record.source_status?.status !== "Currently licensed (dataset inclusion)" || record.source_status?.value !== "listed-in-delaware-current-business-licenses-dataset-as-of-source-refresh") throw new Error(`invalid source status for ${id}`);
        if (record.provenance?.source_release_id !== manifest.source_release_id || record.provenance?.policy_id !== "de-business-licenses" || record.export_policy !== "local-review-only") throw new Error(`invalid provenance or export policy for ${id}`);
        if (containsExcludedField(record)) throw new Error(`excluded field leaked for ${id}`);
        if (record.reported_business_address?.address_scope !== "division-of-revenue-reported-business-address-not-verified-physical-operating-site") throw new Error(`invalid address scope for ${id}`);
        if (record.privacy?.record_level_distribution !== "local-review-only" || !Number.isInteger(record.license_profile?.source_row_count) || record.license_profile.source_row_count < 1) throw new Error(`invalid privacy or license profile for ${id}`);
        acceptedLicenseRows += record.license_profile.source_row_count;
        if (record.reported_address_coordinate) {
          geocodedAddresses += 1;
          if (record.reported_address_coordinate.plausibility === "reported-de-address-coordinate-outside-broad-delaware-bounds") suspiciousGeocodes += 1;
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
  if (organizations !== manifest.coverage?.distinct_licenses_published) failures.push({ path: "manifest.json", reason: "organization counts do not reconcile" });
  if (acceptedLicenseRows !== manifest.coverage?.accepted_current_license_rows) failures.push({ path: "manifest.json", reason: "accepted source-row counts do not reconcile" });
  if (eligibleAddresses !== manifest.coverage?.eligible_reported_us_business_addresses) failures.push({ path: "manifest.json", reason: "eligible address count does not reconcile" });
  if (geocodedAddresses !== manifest.coverage?.source_geocoded_reported_business_addresses || suspiciousGeocodes !== manifest.coverage?.reported_de_address_geocodes_outside_broad_de_bounds) failures.push({ path: "manifest.json", reason: "geocode counts do not reconcile" });
  if (quarantineArtifact) {
    try {
      let quarantinedRows = 0;
      let quarantinedGroups = 0;
      for await (const record of gzipRecords(path.join(releaseDirectory, quarantineArtifact.path), signal)) {
        if (!QUARANTINE_REASONS.has(record.reason) || record.export_policy !== "internal" || !Number.isInteger(record.source_record_count) || record.source_record_count < 1 || record.source_record_ids?.length !== record.source_record_count) throw new Error("invalid quarantine record");
        quarantinedRows += record.source_record_count;
        quarantinedGroups += 1;
      }
      if (quarantinedRows !== manifest.coverage?.quarantined_source_records || quarantinedGroups !== manifest.coverage?.quarantined_license_groups || quarantinedGroups !== quarantineArtifact.record_count) throw new Error("quarantine counts do not reconcile");
      if (acceptedLicenseRows + quarantinedRows !== manifest.coverage?.source_current_license_rows || organizations + quarantinedGroups !== manifest.coverage?.distinct_source_license_numbers) throw new Error("accepted and quarantined totals do not reconcile");
    } catch (error) {
      failures.push({ path: quarantineArtifact.path, reason: `quarantine validation failed: ${error.message}` });
    }
  }
  const zipArtifact = manifest.artifacts?.find((artifact) => artifact.artifact_type === "de-business-licenses-zip-coverage-jsonl");
  if (!zipArtifact) failures.push({ path: "manifest.json", reason: "missing ZIP coverage artifact" });
  else {
    try {
      const rows = (await readFile(path.join(releaseDirectory, zipArtifact.path), "utf8")).split(/\r?\n/).filter(Boolean).map(JSON.parse);
      if (rows.length !== zipArtifact.record_count || rows.length !== manifest.coverage?.zip_union_records) throw new Error("ZIP row count mismatch");
      const total = rows.reduce((sum, row) => sum + row.de_business_license_snapshot.organization_reported_business_address_count, 0);
      if (total !== eligibleAddresses) throw new Error("ZIP organization address counts do not reconcile");
      for (const row of rows) {
        await deYield(signal);
        if ((countsByZip.get(row.zip_code) ?? 0) !== row.de_business_license_snapshot.organization_reported_business_address_count) throw new Error(`ZIP ${row.zip_code} does not reconcile`);
        if (row.current_usps_validity?.status !== "unverified") throw new Error(`ZIP ${row.zip_code} has unsupported USPS validity`);
        if (row.de_business_license_snapshot.physical_site_count !== null || row.de_business_license_snapshot.physical_site_inference_permitted !== false) throw new Error(`ZIP ${row.zip_code} implies a physical site`);
      }
    } catch (error) {
      failures.push({ path: zipArtifact.path, reason: `ZIP validation failed: ${error.message}` });
    }
  }
  signal?.throwIfAborted();
  if (failures.length) {
    const error = new Error(`Delaware business-license release verification failed for ${failures.length} check(s).`);
    error.failures = failures;
    throw error;
  }
  return { dataset_id: manifest.dataset_id, release_id: manifest.release_id, source_release_id: manifest.source_release_id, artifact_count: manifest.artifacts.length, coverage: manifest.coverage };
}
