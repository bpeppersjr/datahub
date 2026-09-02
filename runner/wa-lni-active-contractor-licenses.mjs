import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { finished } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";
import { assertNormalizedUsPostalFieldsDeep } from "./normalized-us-postal-code.mjs";

export const WA_LNI_CONTRACTOR_SCHEMA_VERSION = "1.0.0";
export const WA_LNI_CONTRACTOR_TRANSFORMATION_VERSION = "wa-lni-active-contractor-licenses@1.0.1";
export const WA_LNI_CONTRACTOR_DATASET_ID = "m8qx-ubtq";
export const WA_LNI_CONTRACTOR_METADATA_URL = `https://data.wa.gov/api/views/${WA_LNI_CONTRACTOR_DATASET_ID}`;
export const WA_LNI_CONTRACTOR_API_URL = `https://data.wa.gov/resource/${WA_LNI_CONTRACTOR_DATASET_ID}.json`;
export const WA_LNI_CONTRACTOR_STORY_URL = "https://data.wa.gov/Labor/L-I-Contractor-License-Data-General/m8qx-ubtq";

export const WA_LNI_CONTRACTOR_SCHEMA = Object.freeze([
  ["businessname", "text"],
  ["contractorlicensenumber", "text"],
  ["contractorlicensetypecode", "text"],
  ["contractorlicensetypecodedesc", "text"],
  ["address1", "text"],
  ["address2", "text"],
  ["city", "text"],
  ["state", "text"],
  ["zip", "text"],
  ["licenseeffectivedate", "calendar_date"],
  ["licenseexpirationdate", "calendar_date"],
  ["businesstypecode", "text"],
  ["businesstypecodedesc", "text"],
  ["specialtycode1", "text"],
  ["specialtycode1desc", "text"],
  ["specialtycode2", "text"],
  ["specialtycode2desc", "text"],
  ["ubi", "number"],
  ["statuscode", "text"],
  ["contractorlicensestatus", "text"],
  ["contractorlicensesuspenddate", "calendar_date"],
]);

export const WA_LNI_CONTRACTOR_FIELDS = Object.freeze(WA_LNI_CONTRACTOR_SCHEMA.map(([field]) => field));
export const WA_LNI_CONTRACTOR_SCHEMA_FINGERPRINT = "4cac6e9c4c07bcfcfd0e39f9e3a0baf4976b171978721cd8d9c47c556fa46dca";

const US_STATE_AND_TERRITORY_CODES = new Set([
  "AL", "AK", "AS", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "GU", "HI", "ID", "IL", "IN", "IA", "KS", "KY",
  "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "MP", "OH", "OK",
  "OR", "PA", "PR", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "VI", "WA", "WV", "WI", "WY",
]);

const EXCLUDED_SOURCE_FIELDS = new Set([
  "phonenumber", "primaryprincipalname",
]);

function text(value) {
  const result = String(value ?? "").trim();
  return result || null;
}

function normalizedUbi(value) {
  const raw = text(value);
  return /^\d{8,9}$/.test(raw ?? "") ? raw.padStart(9, "0") : null;
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
  if (!Number.isInteger(unixSeconds) || unixSeconds <= 0) throw new Error("Washington L&I catalog rowsUpdatedAt must be a positive Unix timestamp.");
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
    source_id: "washington-lni-active-contractor-licenses",
    source_release_id: context.sourceReleaseId,
    source_record_id: sourceRecordId,
    ingest_run_id: context.runId,
    transformation_version: WA_LNI_CONTRACTOR_TRANSFORMATION_VERSION,
    policy_id: "wa-lni-active-contractor-licenses",
  };
}

export function schemaFingerprint(columns) {
  const byField = new Map((columns ?? []).map((column) => [column.fieldName, column.dataTypeName]));
  const actual = WA_LNI_CONTRACTOR_SCHEMA.map(([field]) => [field, byField.get(field) ?? null]);
  return sha256(actual.map(([field, type]) => `${field}:${type}`).join("\u0000"));
}

function selectedRecord(row) {
  return Object.fromEntries(WA_LNI_CONTRACTOR_FIELDS.filter((field) => row[field] !== undefined).map((field) => [field, row[field]]));
}

function uniqueValues(records, field) {
  return [...new Set(records.map((record) => text(record[field])).filter(Boolean))].sort((left, right) => left.localeCompare(right, "en", { numeric: true }));
}

function normalizedMailingAddress(record, context) {
  const postal = postalCode(record.zip);
  const state = stateCode(record.state);
  const street = text(record.address1);
  const city = text(record.city);
  const eligible = Boolean(street && city && state && postal.zip_code);
  return {
    street,
    unit_or_additional: text(record.address2),
    city,
    state_source: text(record.state),
    state_code: state,
    postal_code_source: postal.raw,
    zip_code: postal.zip_code,
    postal_code: postal.postal_code,
    zip4: postal.zip4,
    postal_code_status: postal.status,
    country_scope: state ? "reported-us-state-or-territory" : "not-established-as-us-address",
    address_scope: "contractor-reported-mailing-address-not-verified-physical-operating-site",
    eligible_for_us_zip_coverage: eligible,
    geography: geography(eligible ? postal.zip_code : null, context.baselineByZip),
  };
}

function addressKey(address) {
  return JSON.stringify([address.street, address.unit_or_additional, address.city, address.state_source, address.postal_code_source]);
}

export function normalizeWaLniActiveContractorOrganization(records, context) {
  if (!Array.isArray(records) || records.length === 0) throw new Error("missing-active-license-group");
  const ubis = [...new Set(records.map((record) => normalizedUbi(record.ubi)).filter(Boolean))].sort();
  const sourceRecordId = ubis[0];
  const businessNames = uniqueValues(records, "businessname");
  if (ubis.length !== 1 || !/^\d{9}$/.test(sourceRecordId ?? "") || businessNames.length === 0) throw new Error("missing-or-invalid-organization-identity");
  if (records.some((record) => text(record.statuscode) !== "A" || text(record.contractorlicensestatus) !== "ACTIVE")) {
    throw new Error("source-record-is-outside-selected-active-license-status");
  }
  const licenseNumbers = uniqueValues(records, "contractorlicensenumber");
  if (licenseNumbers.length !== records.length) throw new Error("duplicate-or-missing-contractor-license-number");
  const organizationId = `organization:wa_ubi_${sourceRecordId}`;
  const mailingAddressMap = new Map();
  for (const record of records) {
    const address = normalizedMailingAddress(record, context);
    mailingAddressMap.set(addressKey(address), address);
  }
  const reportedMailingAddresses = [...mailingAddressMap.values()].sort((left, right) => addressKey(left).localeCompare(addressKey(right)));
  const licenseActivities = [...records].sort((left, right) => text(left.contractorlicensenumber).localeCompare(text(right.contractorlicensenumber), "en", { numeric: true })).map((record) => ({
    contractor_license_number: text(record.contractorlicensenumber),
    contractor_license_type_code: text(record.contractorlicensetypecode),
    contractor_license_type_description: text(record.contractorlicensetypecodedesc),
    license_effective_date: date(record.licenseeffectivedate),
    license_expiration_date: date(record.licenseexpirationdate),
    business_type_code: text(record.businesstypecode),
    business_type_description: text(record.businesstypecodedesc),
    specialty_1: { code: text(record.specialtycode1), description: text(record.specialtycode1desc) },
    specialty_2: { code: text(record.specialtycode2), description: text(record.specialtycode2desc) },
    status_code: text(record.statuscode),
    status: text(record.contractorlicensestatus),
    suspension_date: date(record.contractorlicensesuspenddate),
  }));
  return {
    schema_version: WA_LNI_CONTRACTOR_SCHEMA_VERSION,
    normalized_record_id: `wa-lni-active-contractor-licenses:organization:${sourceRecordId}`,
    entity_candidates: { organization_id: organizationId, identity_status: "provisional" },
    external_identifiers: [
      { type: "wa_unified_business_identifier", value: sourceRecordId, source_field: "ubi" },
      ...licenseNumbers.map((value) => ({ type: "wa_lni_contractor_license_number", value, source_field: "contractorlicensenumber" })),
    ],
    reported_business_names: businessNames,
    deterministic_display_name: businessNames[0],
    reported_mailing_addresses: reportedMailingAddresses,
    reported_address_coordinate: null,
    active_contractor_license_activities: licenseActivities,
    source_status: {
      value: "one-or-more-licenses-listed-active-in-washington-lni-dataset-as-of-source-refresh",
      status: "ACTIVE",
      status_code: "A",
      general_operating_status_inferred: false,
      source_rows_updated_at: context.sourceRowsUpdatedAt,
      semantics: "source-contractor-license-status-not-independent-proof-of-continuous-operations-public-access-current-worksite-or-complete-legal-compliance",
    },
    observed_at: context.retrievedAt,
    provenance: provenance(context, sourceRecordId),
    export_policy: "local-review-only",
  };
}

function assertAllowedUrl(urlValue, type) {
  const url = new URL(urlValue);
  if (url.protocol !== "https:" || url.hostname !== "data.wa.gov") throw new Error(`Washington L&I ${type} URL is outside the allowlist.`);
  const expectedPath = type === "metadata" ? `/api/views/${WA_LNI_CONTRACTOR_DATASET_ID}` : `/resource/${WA_LNI_CONTRACTOR_DATASET_ID}.json`;
  if (url.pathname !== expectedPath) throw new Error(`Washington L&I ${type} URL has an unexpected path.`);
  return url;
}

function retryDelay(response, attempt) {
  const retryAfter = Number(response?.headers?.get?.("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter >= 0) return Math.min(10_000, retryAfter * 1000);
  return Math.min(4_000, 250 * (2 ** attempt));
}

export async function requestWaLniJson(urlValue, {
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
      if (response.status >= 300 && response.status < 400) throw new Error("Washington L&I source redirect rejected.");
      if ((response.status === 429 || response.status >= 500) && attempt < attempts - 1) {
        await sleep(retryDelay(response, attempt));
        continue;
      }
      if (!response.ok) throw new Error(`Washington L&I source request failed with HTTP ${response.status}.`);
      const declaredBytes = Number(response.headers?.get?.("content-length"));
      if (Number.isFinite(declaredBytes) && declaredBytes > maximumResponseBytes) throw new Error("Washington L&I source response exceeds the configured byte limit.");
      const body = await response.text();
      if (Buffer.byteLength(body) > maximumResponseBytes) throw new Error("Washington L&I source response exceeds the configured byte limit.");
      return JSON.parse(body);
    } catch (error) {
      lastError = error;
      if (error.name === "AbortError" || /redirect rejected|byte limit|HTTP 4\d\d/.test(error.message) || attempt === attempts - 1) throw error;
      await sleep(250 * (2 ** attempt));
    }
  }
  throw lastError;
}

function validateCatalogMetadata(metadata, expectedFingerprint = WA_LNI_CONTRACTOR_SCHEMA_FINGERPRINT) {
  if (metadata?.id !== WA_LNI_CONTRACTOR_DATASET_ID || metadata?.name !== "L&I Contractor License Data - General") throw new Error("Unexpected Washington L&I Contractor License catalog metadata.");
  if (metadata?.licenseId !== "PDDL") throw new Error("Washington L&I Contractor License catalog license is no longer PDDL.");
  if (metadata?.attribution !== "Labor & Industries" || metadata?.provenance !== "official" || metadata?.publicationStage !== "published") {
    throw new Error("Washington L&I Contractor License official publication metadata changed.");
  }
  const fingerprint = schemaFingerprint(metadata.columns);
  if (fingerprint !== expectedFingerprint) throw new Error(`Washington L&I Contractor License selected schema changed (${fingerprint}).`);
  return { rowsUpdatedAt: metadata.rowsUpdatedAt, rowsUpdatedAtIso: sourceTimestamp(metadata.rowsUpdatedAt), schemaFingerprint: fingerprint };
}

function soqlUrl(parameters) {
  const url = new URL(WA_LNI_CONTRACTOR_API_URL);
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
  return url.toString();
}

const SELECTED_STATUS_FILTER = "statuscode='A' AND contractorlicensestatus='ACTIVE'";

async function selectedRecordCount(options) {
  const rows = await requestWaLniJson(soqlUrl({ $select: "count(*) as records", $where: SELECTED_STATUS_FILTER }), options);
  const count = Number(rows?.[0]?.records);
  if (!Number.isInteger(count) || count < 0) throw new Error("Washington L&I selected-status record count response is invalid.");
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
  for (const field of Object.keys(record)) if (!WA_LNI_CONTRACTOR_FIELDS.includes(field)) throw new Error(`Unapproved Washington L&I source field ${field}.`);
  return selectedRecord(record);
}

async function acquireSource({ writer, sourceRecords, expectedCount, fetchImpl, signal, sleep, pageSize, logger }) {
  let count = 0;
  let previousUbi = null;
  let currentUbiLicenseNumbers = new Set();
  const consume = async (input) => {
    signal?.throwIfAborted?.();
    const record = sourceSafeRecord(input);
    const ubi = normalizedUbi(record.ubi);
    const licenseNumber = text(record.contractorlicensenumber);
    if (!/^\d{9}$/.test(ubi ?? "") || !licenseNumber || text(record.statuscode) !== "A" || text(record.contractorlicensestatus) !== "ACTIVE") {
      throw new Error("Washington L&I source acquisition received an invalid or out-of-scope row.");
    }
    if (previousUbi !== null && ubi < previousUbi) {
      throw new Error(`Washington L&I source UBI/license keys are not strictly increasing at ${ubi}/${licenseNumber}.`);
    }
    if (ubi !== previousUbi) currentUbiLicenseNumbers = new Set();
    if (currentUbiLicenseNumbers.has(licenseNumber)) throw new Error(`Washington L&I source UBI/license keys are not strictly increasing at ${ubi}/${licenseNumber}.`);
    currentUbiLicenseNumbers.add(licenseNumber);
    previousUbi = ubi;
    await writeGzipRecord(writer, record);
    count += 1;
  };
  if (sourceRecords) {
    for await (const record of sourceRecords) await consume(record);
  } else {
    let offset = 0;
    while (true) {
      const rows = await requestWaLniJson(soqlUrl({
        $select: WA_LNI_CONTRACTOR_FIELDS.join(","),
        $where: SELECTED_STATUS_FILTER,
        $order: "ubi ASC,contractorlicensenumber ASC",
        $limit: String(pageSize),
        $offset: String(offset),
      }), { fetchImpl, signal, sleep, type: "data" });
      if (!Array.isArray(rows) || rows.length > pageSize) throw new Error("Washington L&I source page is invalid or exceeds the page-size limit.");
      if (rows.length === 0) break;
      for (const record of rows) await consume(record);
      offset += rows.length;
      logger(`Acquired ${count.toLocaleString("en-US")} active Washington L&I contractor-license rows.`);
      if (rows.length < pageSize) break;
    }
  }
  if (count !== expectedCount) throw new Error(`Washington L&I source acquisition returned ${count} selected-status rows; preflight reported ${expectedCount}.`);
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
      wa_lni_active_contractor_license_snapshot: {
        status: count ? "published-active-contractor-reported-mailing-addresses" : "no-eligible-mailing-address-in-current-active-license-snapshot",
        active_contractor_organization_mailing_address_count: count,
        source_release_id: context.sourceReleaseId,
        source_rows_updated_at: context.sourceRowsUpdatedAt,
        physical_site_count: null,
        physical_site_inference_permitted: false,
        record_level_distribution: "local-review-only",
        aggregate_distribution: "public-domain-with-attribution-and-semantic-limitations",
      },
    };
  });
}

async function* groupSourceRowsByUbi(records) {
  let currentUbi = null;
  let group = [];
  for await (const record of records) {
    const ubi = normalizedUbi(record.ubi);
    if (group.length && ubi !== currentUbi) {
      yield group;
      group = [];
    }
    currentUbi = ubi;
    group.push(record);
  }
  if (group.length) yield group;
}

export async function buildWaLniActiveContractors({
  outputRoot,
  zbpPointer,
  catalogMetadata = null,
  sourceRecords = null,
  sourceSnapshotPath = null,
  minimumOrganizations = 50_000,
  pageSize = 25_000,
  schemaFingerprintExpected = WA_LNI_CONTRACTOR_SCHEMA_FINGERPRINT,
  fetchImpl = globalThis.fetch,
  signal,
  sleep,
  logger = console.log,
  now = () => new Date(),
} = {}) {
  if (!outputRoot || !zbpPointer) throw new Error("outputRoot and zbpPointer are required.");
  if (sourceRecords && sourceSnapshotPath) throw new Error("sourceRecords and sourceSnapshotPath are mutually exclusive.");
  if (sourceSnapshotPath) assertContained(outputRoot, sourceSnapshotPath, "Washington L&I staged source snapshot");
  if (!Number.isInteger(minimumOrganizations) || minimumOrganizations < 1) throw new Error("minimumOrganizations must be a positive integer.");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50_000) throw new Error("pageSize must be from 1 through 50000.");
  signal?.throwIfAborted?.();
  const retrievedAt = now().toISOString();
  const runId = randomUUID();
  const releaseId = `wa-lni-active-contractor-licenses-${releaseTimestamp(retrievedAt)}-${runId.slice(0, 8)}`;
  const stagingDirectory = path.join(outputRoot, ".staging", runId);
  await mkdir(stagingDirectory, { recursive: true });
  const baseline = await loadZbpBaseline(zbpPointer);
  const requestOptions = { fetchImpl, signal, sleep, type: "metadata" };
  const initialMetadata = catalogMetadata ?? await requestWaLniJson(WA_LNI_CONTRACTOR_METADATA_URL, requestOptions);
  const catalog = validateCatalogMetadata(initialMetadata, schemaFingerprintExpected);
  const fixtureInput = sourceRecords !== null;
  const resumedSourceInput = sourceSnapshotPath ? gzipRecords(sourceSnapshotPath) : null;
  const sourceInput = sourceRecords ?? resumedSourceInput;
  const expectedCount = fixtureInput || (sourceSnapshotPath && catalogMetadata)
    ? Number(initialMetadata.selectedRecordCount ?? sourceRecords?.length)
    : await selectedRecordCount({ fetchImpl, signal, sleep, type: "data" });
  if (!Number.isInteger(expectedCount) || expectedCount < minimumOrganizations) throw new Error(`Washington L&I active contractor-license row count ${expectedCount} is below the ${minimumOrganizations} quality floor.`);
  const rawWriter = await openGzipWriter(stagingDirectory, "source/active-contractor-license-rows.jsonl.gz");
  let sourceArtifact;
  try {
    await acquireSource({ writer: rawWriter, sourceRecords: sourceInput, expectedCount, fetchImpl, signal, sleep, pageSize, logger });
    sourceArtifact = await closeGzipWriter(rawWriter, "wa-lni-active-contractor-licenses-source-jsonl-gzip", { export_policy: "internal" });
  } catch (error) {
    abortGzipWriters([rawWriter]);
    throw error;
  }
  if (!catalogMetadata) {
    const finalMetadata = await requestWaLniJson(WA_LNI_CONTRACTOR_METADATA_URL, requestOptions);
    const finalCatalog = validateCatalogMetadata(finalMetadata, schemaFingerprintExpected);
    const finalCount = await selectedRecordCount({ fetchImpl, signal, sleep, type: "data" });
    if (finalCatalog.rowsUpdatedAt !== catalog.rowsUpdatedAt || finalCount !== expectedCount) throw new Error("Washington L&I source changed during acquisition; the run is not publishable.");
  }
  const sourceReleaseDigest = sha256(`${catalog.rowsUpdatedAtIso}\u0000${sourceArtifact.sha256}`);
  const sourceReleaseId = `wa-lni-active-contractor-licenses-${catalog.rowsUpdatedAtIso.slice(0, 10)}-${sourceReleaseDigest.slice(0, 16)}`;
  const context = { runId, retrievedAt, sourceRowsUpdatedAt: catalog.rowsUpdatedAtIso, sourceReleaseId, baselineByZip: baseline.byZip };
  const writers = new Map();
  for (const prefix of "0123456789abcdef") writers.set(prefix, await openGzipWriter(stagingDirectory, `derived/organizations/id-hash-prefix=${prefix}.jsonl.gz`));
  const quarantineWriter = await openGzipWriter(stagingDirectory, "derived/quarantine/invalid-organizations.jsonl.gz");
  const ids = new Set();
  const countsByZip = new Map();
  const licenseTypes = new Map();
  const businessTypes = new Map();
  const specialties = new Map();
  const addressStates = new Map();
  let organizations = 0;
  let activeLicenseActivities = 0;
  let groupedMultiLicenseOrganizations = 0;
  let reportedBusinessNames = 0;
  let reportedMailingAddresses = 0;
  let eligibleUsMailingAddresses = 0;
  let organizationsWithoutEligibleAddress = 0;
  let licenseActivitiesExpiredBeforeObservation = 0;
  let quarantinedGroups = 0;
  let quarantinedSourceRows = 0;
  try {
    for await (const sourceGroup of groupSourceRowsByUbi(gzipRecords(path.join(stagingDirectory, sourceArtifact.path)))) {
      signal?.throwIfAborted?.();
      let normalized;
      try {
        normalized = normalizeWaLniActiveContractorOrganization(sourceGroup, context);
        assertNormalizedUsPostalFieldsDeep(normalized);
      } catch (error) {
        if (!new Set(["missing-or-invalid-organization-identity", "duplicate-or-missing-contractor-license-number"]).has(error.message)) throw error;
        await writeGzipRecord(quarantineWriter, {
          schema_version: WA_LNI_CONTRACTOR_SCHEMA_VERSION,
          source_ubi: normalizedUbi(sourceGroup[0]?.ubi),
          source_row_count: sourceGroup.length,
          source_contractor_license_numbers: uniqueValues(sourceGroup, "contractorlicensenumber"),
          reason: error.message,
          source_release_id: context.sourceReleaseId,
          ingest_run_id: context.runId,
          export_policy: "internal",
        });
        quarantinedGroups += 1;
        quarantinedSourceRows += sourceGroup.length;
        continue;
      }
      const ubi = normalized.external_identifiers.find((identifier) => identifier.type === "wa_unified_business_identifier")?.value;
      if (!ubi || ids.has(ubi)) throw new Error(`Duplicate Washington L&I UBI ${ubi}.`);
      ids.add(ubi);
      const partition = sha256(ubi)[0];
      await writeGzipRecord(writers.get(partition), normalized);
      reportedBusinessNames += normalized.reported_business_names.length;
      activeLicenseActivities += normalized.active_contractor_license_activities.length;
      if (normalized.active_contractor_license_activities.length > 1) groupedMultiLicenseOrganizations += 1;
      for (const activity of normalized.active_contractor_license_activities) {
        increment(licenseTypes, activity.contractor_license_type_description ?? activity.contractor_license_type_code);
        increment(businessTypes, activity.business_type_description ?? activity.business_type_code);
        for (const specialty of [activity.specialty_1, activity.specialty_2]) if (specialty.code || specialty.description) increment(specialties, specialty.description ?? specialty.code);
        if (activity.license_expiration_date && activity.license_expiration_date < retrievedAt.slice(0, 10)) licenseActivitiesExpiredBeforeObservation += 1;
      }
      let eligibleAddressesForOrganization = 0;
      for (const address of normalized.reported_mailing_addresses) {
        reportedMailingAddresses += 1;
        increment(addressStates, address.state_code ?? address.state_source);
        if (address.eligible_for_us_zip_coverage) {
          countsByZip.set(address.zip_code, (countsByZip.get(address.zip_code) ?? 0) + 1);
          eligibleUsMailingAddresses += 1;
          eligibleAddressesForOrganization += 1;
        }
      }
      if (eligibleAddressesForOrganization === 0) organizationsWithoutEligibleAddress += 1;
      organizations += 1;
    }
  } catch (error) {
    abortGzipWriters([...writers.values(), quarantineWriter]);
    throw error;
  }
  if (activeLicenseActivities + quarantinedSourceRows !== expectedCount) throw new Error("Washington L&I normalized license activities and quarantined source rows do not reconcile to the source snapshot.");
  if (organizations < minimumOrganizations) throw new Error(`Washington L&I normalized organization count ${organizations} is below the ${minimumOrganizations} quality floor.`);
  const artifacts = [
    sourceArtifact,
    ...await Promise.all([...writers.values()].map((writer) => closeGzipWriter(writer, "normalized-wa-lni-active-contractor-organization-jsonl-gzip", { export_policy: "local-review-only" }))),
    await closeGzipWriter(quarantineWriter, "wa-lni-active-contractor-quarantine-jsonl-gzip", { export_policy: "internal" }),
  ];
  const coverageRows = buildZipCoverage(baseline.rows, countsByZip, context);
  artifacts.push(await writeArtifact(stagingDirectory, "derived/zip-coverage.jsonl", jsonLines(coverageRows), { artifact_type: "wa-lni-active-contractor-licenses-zip-coverage-jsonl", record_count: coverageRows.length }));
  artifacts.push(await writeArtifact(stagingDirectory, "derived/source-summary.json", json({
    active_contractor_license_source_rows: expectedCount,
    active_contractor_organizations: organizations,
    active_contractor_license_activities: activeLicenseActivities,
    grouped_multi_license_organizations: groupedMultiLicenseOrganizations,
    reported_business_names: reportedBusinessNames,
    reported_mailing_addresses: reportedMailingAddresses,
    eligible_reported_us_mailing_addresses: eligibleUsMailingAddresses,
    organizations_without_eligible_us_zip_address: organizationsWithoutEligibleAddress,
    active_license_activities_expired_before_observation: licenseActivitiesExpiredBeforeObservation,
    quarantined_organization_groups: quarantinedGroups,
    quarantined_source_rows: quarantinedSourceRows,
    license_types: sortedCounts(licenseTypes),
    business_types: sortedCounts(businessTypes),
    specialties: sortedCounts(specialties),
    reported_mailing_address_states: sortedCounts(addressStates),
  }), { artifact_type: "wa-lni-active-contractor-licenses-source-summary" }));
  artifacts.push(await writeArtifact(stagingDirectory, "source/release-metadata.json", json({
    dataset_id: WA_LNI_CONTRACTOR_DATASET_ID,
    dataset_name: initialMetadata.name,
    publisher: initialMetadata.attribution,
    license: initialMetadata.license,
    license_id: initialMetadata.licenseId,
    source_rows_updated_at: catalog.rowsUpdatedAtIso,
    source_rows_updated_at_unix: catalog.rowsUpdatedAt,
    selected_schema: WA_LNI_CONTRACTOR_SCHEMA,
    selected_schema_fingerprint: catalog.schemaFingerprint,
    selected_fields: WA_LNI_CONTRACTOR_FIELDS,
    explicitly_excluded_fields: [...EXCLUDED_SOURCE_FIELDS].sort(),
    exclusion_reason: "Phone numbers and named principals are not required for organization-level contractor-license coverage and are excluded before staging.",
    query: { filter: SELECTED_STATUS_FILTER, order: "ubi ASC,contractorlicensenumber ASC", offset_pagination: true, page_size: pageSize },
    expected_selected_active_license_record_count: expectedCount,
    source_urls: { metadata: WA_LNI_CONTRACTOR_METADATA_URL, api: WA_LNI_CONTRACTOR_API_URL, documentation: WA_LNI_CONTRACTOR_STORY_URL },
  }), { artifact_type: "wa-lni-active-contractor-licenses-source-release-metadata" }));
  const manifest = {
    schema_version: WA_LNI_CONTRACTOR_SCHEMA_VERSION,
    dataset_id: "wa-lni-active-contractor-organizations",
    connector: { id: "wa-lni-active-contractor-licenses", version: "1.0.1" },
    release_id: releaseId,
    run_id: runId,
    retrieved_at: retrievedAt,
    source_rows_updated_at: catalog.rowsUpdatedAtIso,
    source_release_id: sourceReleaseId,
    status: "published",
    complete_selected_active_contractor_license_snapshot: true,
    raw_unselected_fields_retained: false,
    coverage: {
      source_active_contractor_license_rows: expectedCount,
      organizations_published: organizations,
      active_contractor_license_activities: activeLicenseActivities,
      grouped_multi_license_organizations: groupedMultiLicenseOrganizations,
      reported_business_names: reportedBusinessNames,
      reported_mailing_addresses: reportedMailingAddresses,
      eligible_reported_us_mailing_addresses: eligibleUsMailingAddresses,
      organizations_without_eligible_us_zip_address: organizationsWithoutEligibleAddress,
      quarantined_organization_groups: quarantinedGroups,
      quarantined_source_rows: quarantinedSourceRows,
      source_zip_codes: countsByZip.size,
      zip_union_records: coverageRows.length,
      physical_sites: null,
      establishments: null,
    },
    quality_gates: {
      minimum_organizations: minimumOrganizations,
      license_activity_and_quarantined_source_row_counts_match: activeLicenseActivities + quarantinedSourceRows === expectedCount,
      selected_schema_fingerprint: catalog.schemaFingerprint,
      duplicate_ubi_organization_ids: 0,
      source_unchanged_during_acquisition: true,
    },
    dependencies: [
      { dataset_id: baseline.manifest.dataset_id, release_id: baseline.manifest.release_id, manifest_sha256: baseline.manifestSha256 },
      baseline.manifest.geography_dependency,
    ],
    source: {
      publisher: "Washington State Department of Labor & Industries",
      catalog_dataset_id: WA_LNI_CONTRACTOR_DATASET_ID,
      source_page: WA_LNI_CONTRACTOR_STORY_URL,
      api_url: WA_LNI_CONTRACTOR_API_URL,
      access_method: fixtureInput ? "explicit test fixture records" : sourceSnapshotPath ? "validated local selected-field source snapshot originally acquired from the anonymous public Socrata API" : "anonymous public Socrata API with ordered offset pagination and before/after refresh validation",
      license: "Public Domain Dedication and License (PDDL)",
      license_id: "PDDL",
      api_key_used: false,
      policy_profile: "config/source-policies/wa-lni-active-contractor-licenses.json",
    },
    limitations: [
      "ACTIVE is the source-reported contractor-license status as of the source refresh; it is not independent proof of continuous operations, current compliance, public access, or an open storefront.",
      "A UBI can have multiple active contractor licenses, names, and mailing addresses; these are retained as source-reported evidence without asserting legal-name, ownership, parent-company, or network relationships.",
      "The source describes its addresses as mailing addresses. They can be administrative, home, virtual, incomplete, stale, or outside Washington; no physical site or establishment is created from them.",
      "Phone numbers and named principals are excluded before staging and are not present in source or normalized artifacts.",
      "This contractor-license dataset is not a census of every business operating in Washington or the United States.",
      "Current USPS ZIP validity remains unverified until an authorized operational ZIP denominator is integrated.",
    ],
    artifacts,
  };
  await writeArtifact(stagingDirectory, "manifest.json", json(manifest));
  const publication = await publishWaLniActiveContractorStaging({ outputRoot, stagingRunId: runId, expectedReleaseId: releaseId });
  logger(`Published ${organizations.toLocaleString("en-US")} Washington L&I active-contractor organizations from ${activeLicenseActivities.toLocaleString("en-US")} license activities.`);
  return { manifest, releaseDirectory: publication.releaseDirectory, pointerPath: publication.pointerPath };
}

function containsExcludedField(value) {
  if (Array.isArray(value)) return value.some(containsExcludedField);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) => EXCLUDED_SOURCE_FIELDS.has(key.toLowerCase()) || containsExcludedField(child));
}

export async function publishWaLniActiveContractorStaging({ outputRoot, stagingRunId, expectedReleaseId = null } = {}) {
  if (!outputRoot || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stagingRunId ?? "")) {
    throw new Error("outputRoot and a valid stagingRunId are required.");
  }
  const stagingRoot = path.join(outputRoot, ".staging");
  const stagingDirectory = path.resolve(stagingRoot, stagingRunId);
  assertContained(stagingRoot, stagingDirectory, "Washington L&I staging run");
  const manifestPath = path.join(stagingDirectory, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.run_id !== stagingRunId || manifest.dataset_id !== "wa-lni-active-contractor-organizations" || manifest.status !== "published") {
    throw new Error("Washington L&I staging manifest does not match the requested complete run.");
  }
  if (expectedReleaseId && manifest.release_id !== expectedReleaseId) throw new Error("Washington L&I staging release ID does not match the build result.");
  await verifyWaLniActiveContractors(manifestPath);
  const releasesDirectory = path.join(outputRoot, "releases");
  await mkdir(releasesDirectory, { recursive: true });
  const releaseDirectory = path.join(releasesDirectory, manifest.release_id);
  try {
    await stat(releaseDirectory);
    throw new Error(`Washington L&I release destination already exists: ${manifest.release_id}.`);
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
  if (!(await stat(releaseDirectory)).isDirectory()) throw new Error("Published Washington L&I Business Registry release is not a directory.");
  return { manifest, releaseDirectory, pointerPath };
}

export async function verifyWaLniActiveContractors(manifestPath) {
  const absoluteManifestPath = path.resolve(manifestPath);
  const releaseDirectory = path.dirname(absoluteManifestPath);
  const manifest = JSON.parse(await readFile(absoluteManifestPath, "utf8"));
  const failures = [];
  if (manifest.dataset_id !== "wa-lni-active-contractor-organizations" || manifest.status !== "published" || !manifest.complete_selected_active_contractor_license_snapshot || manifest.raw_unselected_fields_retained !== false) failures.push({ path: "manifest.json", reason: "unexpected, incomplete, or over-retained manifest" });
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
  const sourceArtifacts = manifest.artifacts?.filter((artifact) => artifact.artifact_type === "wa-lni-active-contractor-licenses-source-jsonl-gzip") ?? [];
  const normalizedArtifacts = manifest.artifacts?.filter((artifact) => artifact.artifact_type === "normalized-wa-lni-active-contractor-organization-jsonl-gzip") ?? [];
  const quarantineArtifacts = manifest.artifacts?.filter((artifact) => artifact.artifact_type === "wa-lni-active-contractor-quarantine-jsonl-gzip") ?? [];
  const summaryArtifacts = manifest.artifacts?.filter((artifact) => artifact.artifact_type === "wa-lni-active-contractor-licenses-source-summary") ?? [];
  const metadataArtifacts = manifest.artifacts?.filter((artifact) => artifact.artifact_type === "wa-lni-active-contractor-licenses-source-release-metadata") ?? [];
  if (sourceArtifacts.length !== 1 || sourceArtifacts[0]?.export_policy !== "internal") failures.push({ path: "manifest.json", reason: "expected one internal selected-field source artifact" });
  if (normalizedArtifacts.length !== 16 || normalizedArtifacts.some((artifact) => artifact.export_policy !== "local-review-only")) failures.push({ path: "manifest.json", reason: "expected 16 local-review-only normalized organization partitions" });
  if (quarantineArtifacts.length !== 1 || quarantineArtifacts[0]?.export_policy !== "internal") failures.push({ path: "manifest.json", reason: "expected one internal quarantine artifact" });
  if (summaryArtifacts.length !== 1 || metadataArtifacts.length !== 1) failures.push({ path: "manifest.json", reason: "expected one source summary and one release-metadata artifact" });
  let sourceRows = 0;
  if (sourceArtifacts.length === 1) {
    const digest = sha256(`${manifest.source_rows_updated_at}\u0000${sourceArtifacts[0].sha256}`);
    if (manifest.source_release_id !== `wa-lni-active-contractor-licenses-${manifest.source_rows_updated_at.slice(0, 10)}-${digest.slice(0, 16)}`) failures.push({ path: "manifest.json", reason: "source release ID is not bound to refresh timestamp and selected source checksum" });
    try {
      let previousUbi = null;
      let currentUbiLicenseNumbers = new Set();
      for await (const record of gzipRecords(path.join(releaseDirectory, sourceArtifacts[0].path))) {
        for (const field of Object.keys(record)) if (!WA_LNI_CONTRACTOR_FIELDS.includes(field)) throw new Error(`unapproved source field ${field}`);
        if (containsExcludedField(record)) throw new Error("excluded source field leaked");
        const ubi = normalizedUbi(record.ubi);
        const licenseNumber = text(record.contractorlicensenumber);
        if (!/^\d{9}$/.test(ubi ?? "") || !licenseNumber || text(record.statuscode) !== "A" || text(record.contractorlicensestatus) !== "ACTIVE" || (previousUbi && ubi < previousUbi)) throw new Error(`invalid source ordering or status at ${ubi}/${licenseNumber}`);
        if (ubi !== previousUbi) currentUbiLicenseNumbers = new Set();
        if (currentUbiLicenseNumbers.has(licenseNumber)) throw new Error(`duplicate source UBI/license key at ${ubi}/${licenseNumber}`);
        currentUbiLicenseNumbers.add(licenseNumber);
        previousUbi = ubi;
        sourceRows += 1;
      }
      if (sourceRows !== sourceArtifacts[0].record_count || sourceRows !== manifest.coverage?.source_active_contractor_license_rows) throw new Error("source record count mismatch");
    } catch (error) {
      failures.push({ path: sourceArtifacts[0].path, reason: `source validation failed: ${error.message}` });
    }
  }
  const ids = new Set();
  const countsByZip = new Map();
  const quarantineUbis = new Set();
  let organizations = 0;
  let licenseActivities = 0;
  let multiLicenseOrganizations = 0;
  let reportedNames = 0;
  let reportedMailingAddresses = 0;
  let eligibleMailingAddresses = 0;
  let organizationsWithoutEligibleAddress = 0;
  for (const artifact of normalizedArtifacts) {
    try {
      const prefix = artifact.path.match(/id-hash-prefix=([0-9a-f])/)?.[1];
      let partitionCount = 0;
      for await (const record of gzipRecords(path.join(releaseDirectory, artifact.path))) {
        const ubi = record.external_identifiers?.find((item) => item.type === "wa_unified_business_identifier")?.value;
        if (!/^\d{9}$/.test(ubi ?? "") || ids.has(ubi) || sha256(ubi)[0] !== prefix) throw new Error(`duplicate, missing, or incorrectly partitioned UBI ${ubi}`);
        ids.add(ubi);
        if (record.normalized_record_id !== `wa-lni-active-contractor-licenses:organization:${ubi}` || record.entity_candidates?.organization_id !== `organization:wa_ubi_${ubi}` || record.entity_candidates?.physical_site_id || record.entity_candidates?.establishment_id) throw new Error(`invalid organization-only identity for ${ubi}`);
        if (record.source_status?.status !== "ACTIVE" || record.source_status?.status_code !== "A" || record.source_status?.value !== "one-or-more-licenses-listed-active-in-washington-lni-dataset-as-of-source-refresh" || record.source_status?.general_operating_status_inferred !== false) throw new Error(`invalid source status for ${ubi}`);
        if (record.provenance?.source_release_id !== manifest.source_release_id || record.provenance?.policy_id !== "wa-lni-active-contractor-licenses" || record.export_policy !== "local-review-only") throw new Error(`invalid provenance for ${ubi}`);
        if (containsExcludedField(record)) throw new Error(`excluded field leaked for ${ubi}`);
        if (!Array.isArray(record.reported_business_names) || record.reported_business_names.length === 0 || record.deterministic_display_name !== record.reported_business_names[0]) throw new Error(`invalid reported business names for ${ubi}`);
        reportedNames += record.reported_business_names.length;
        const activities = record.active_contractor_license_activities;
        if (!Array.isArray(activities) || activities.length === 0) throw new Error(`missing license activities for ${ubi}`);
        const activityNumbers = new Set();
        for (const activity of activities) {
          if (!activity.contractor_license_number || activityNumbers.has(activity.contractor_license_number) || activity.status !== "ACTIVE" || activity.status_code !== "A") throw new Error(`invalid or duplicate active license activity for ${ubi}`);
          activityNumbers.add(activity.contractor_license_number);
          if (!record.external_identifiers.some((identifier) => identifier.type === "wa_lni_contractor_license_number" && identifier.value === activity.contractor_license_number)) throw new Error(`license activity lacks external identifier for ${ubi}`);
        }
        licenseActivities += activities.length;
        if (activities.length > 1) multiLicenseOrganizations += 1;
        let eligibleForOrganization = 0;
        const addressKeys = new Set();
        if (!Array.isArray(record.reported_mailing_addresses) || record.reported_mailing_addresses.length === 0) throw new Error(`missing reported mailing address array for ${ubi}`);
        for (const address of record.reported_mailing_addresses) {
          if (address.address_scope !== "contractor-reported-mailing-address-not-verified-physical-operating-site") throw new Error(`invalid mailing-address scope for ${ubi}`);
          const key = addressKey(address);
          if (addressKeys.has(key)) throw new Error(`duplicate mailing address for ${ubi}`);
          addressKeys.add(key);
          reportedMailingAddresses += 1;
          if (address.eligible_for_us_zip_coverage) {
            if (!/^\d{5}$/.test(address.zip_code ?? "")) throw new Error(`invalid eligible ZIP for ${ubi}`);
            countsByZip.set(address.zip_code, (countsByZip.get(address.zip_code) ?? 0) + 1);
            eligibleMailingAddresses += 1;
            eligibleForOrganization += 1;
          }
        }
        if (eligibleForOrganization === 0) organizationsWithoutEligibleAddress += 1;
        partitionCount += 1;
      }
      if (partitionCount !== artifact.record_count) throw new Error("partition record count mismatch");
      organizations += partitionCount;
    } catch (error) {
      failures.push({ path: artifact.path, reason: `normalized validation failed: ${error.message}` });
    }
  }
  let quarantinedGroups = 0;
  let quarantinedSourceRows = 0;
  if (quarantineArtifacts.length === 1) {
    try {
      for await (const record of gzipRecords(path.join(releaseDirectory, quarantineArtifacts[0].path))) {
        if (!/^\d{9}$/.test(record.source_ubi ?? "") || !new Set(["missing-or-invalid-organization-identity", "duplicate-or-missing-contractor-license-number"]).has(record.reason) || record.export_policy !== "internal" || record.source_release_id !== manifest.source_release_id || quarantineUbis.has(record.source_ubi) || ids.has(record.source_ubi) || !Number.isInteger(record.source_row_count) || record.source_row_count < 1) {
          throw new Error(`invalid quarantine group ${record.source_ubi}`);
        }
        quarantineUbis.add(record.source_ubi);
        quarantinedGroups += 1;
        quarantinedSourceRows += record.source_row_count;
      }
      if (quarantinedGroups !== quarantineArtifacts[0].record_count) throw new Error("quarantine group count mismatch");
    } catch (error) {
      failures.push({ path: quarantineArtifacts[0].path, reason: `quarantine validation failed: ${error.message}` });
    }
  }
  if (organizations !== manifest.coverage?.organizations_published) failures.push({ path: "manifest.json", reason: "published organization count does not reconcile" });
  if (licenseActivities + quarantinedSourceRows !== sourceRows || licenseActivities !== manifest.coverage?.active_contractor_license_activities || quarantinedGroups !== manifest.coverage?.quarantined_organization_groups || quarantinedSourceRows !== manifest.coverage?.quarantined_source_rows) failures.push({ path: "manifest.json", reason: "license activity and quarantine counts do not reconcile" });
  if (multiLicenseOrganizations !== manifest.coverage?.grouped_multi_license_organizations || reportedNames !== manifest.coverage?.reported_business_names || reportedMailingAddresses !== manifest.coverage?.reported_mailing_addresses) failures.push({ path: "manifest.json", reason: "normalized evidence counts do not reconcile" });
  if (eligibleMailingAddresses !== manifest.coverage?.eligible_reported_us_mailing_addresses || organizationsWithoutEligibleAddress !== manifest.coverage?.organizations_without_eligible_us_zip_address) failures.push({ path: "manifest.json", reason: "eligible mailing-address counts do not reconcile" });
  const zipArtifact = manifest.artifacts?.find((artifact) => artifact.artifact_type === "wa-lni-active-contractor-licenses-zip-coverage-jsonl");
  if (!zipArtifact) failures.push({ path: "manifest.json", reason: "missing ZIP coverage artifact" });
  else {
    try {
      const rows = (await readFile(path.join(releaseDirectory, zipArtifact.path), "utf8")).split(/\r?\n/).filter(Boolean).map(JSON.parse);
      if (rows.length !== zipArtifact.record_count || rows.length !== manifest.coverage?.zip_union_records) throw new Error("ZIP row count mismatch");
      const total = rows.reduce((sum, row) => sum + row.wa_lni_active_contractor_license_snapshot.active_contractor_organization_mailing_address_count, 0);
      if (total !== eligibleMailingAddresses) throw new Error("ZIP organization mailing-address counts do not reconcile");
      for (const row of rows) {
        if ((countsByZip.get(row.zip_code) ?? 0) !== row.wa_lni_active_contractor_license_snapshot.active_contractor_organization_mailing_address_count) throw new Error(`ZIP ${row.zip_code} does not reconcile`);
        if (row.current_usps_validity?.status !== "unverified") throw new Error(`ZIP ${row.zip_code} has unsupported USPS validity`);
        if (row.wa_lni_active_contractor_license_snapshot.physical_site_count !== null || row.wa_lni_active_contractor_license_snapshot.physical_site_inference_permitted !== false) throw new Error(`ZIP ${row.zip_code} implies a physical site`);
      }
    } catch (error) {
      failures.push({ path: zipArtifact.path, reason: `ZIP validation failed: ${error.message}` });
    }
  }
  if (metadataArtifacts.length === 1) {
    try {
      const metadata = JSON.parse(await readFile(path.join(releaseDirectory, metadataArtifacts[0].path), "utf8"));
      if (metadata.dataset_id !== WA_LNI_CONTRACTOR_DATASET_ID || metadata.license_id !== "PDDL" || metadata.selected_schema_fingerprint !== WA_LNI_CONTRACTOR_SCHEMA_FINGERPRINT || JSON.stringify(metadata.selected_fields) !== JSON.stringify(WA_LNI_CONTRACTOR_FIELDS) || metadata.explicitly_excluded_fields?.sort().join(",") !== [...EXCLUDED_SOURCE_FIELDS].sort().join(",")) throw new Error("source governance metadata changed or is incomplete");
    } catch (error) {
      failures.push({ path: metadataArtifacts[0].path, reason: `release metadata validation failed: ${error.message}` });
    }
  }
  if (failures.length) {
    const error = new Error(`Washington L&I active-contractor release verification failed for ${failures.length} check(s).`);
    error.failures = failures;
    throw error;
  }
  return { dataset_id: manifest.dataset_id, release_id: manifest.release_id, source_release_id: manifest.source_release_id, artifact_count: manifest.artifacts.length, coverage: manifest.coverage };
}
