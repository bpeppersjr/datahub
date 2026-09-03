import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { lstat, mkdir, readFile, realpath, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { finished } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";

import { parse } from "csv-parse";

import { assertNormalizedUsPostalFieldsDeep } from "./normalized-us-postal-code.mjs";
import {
  splitTxActiveFranchisePostcode,
  TX_ACTIVE_FRANCHISE_CONNECTOR_VERSION,
  TX_ACTIVE_FRANCHISE_DATASET_ID,
  TX_ACTIVE_FRANCHISE_SCHEMA_FINGERPRINT,
  TX_ACTIVE_FRANCHISE_SCHEMA_VERSION,
  TX_ACTIVE_FRANCHISE_SOURCE_SCHEMA,
  validateTxActiveFranchisePreflightReceipt,
} from "./tx-active-franchise-taxpayers.mjs";
import { verifyTxActiveSalesTaxPermits } from "./tx-active-sales-tax-permits.mjs";

export const TX_ACTIVE_FRANCHISE_OFFLINE_BUILD_ACKNOWLEDGEMENT = "I-APPROVE-TX-FRANCHISE-OFFLINE-LOCAL-REVIEW-BUILD";
export const TX_ACTIVE_FRANCHISE_OFFLINE_TRANSFORMATION_VERSION = "tx-active-franchise-taxpayers-offline@1.1.0";
export const TX_ACTIVE_FRANCHISE_NORMALIZED_DATASET_ID = "tx-active-franchise-taxpayer-organizations";

const SOURCE_FIELDS = Object.freeze(TX_ACTIVE_FRANCHISE_SOURCE_SCHEMA.map(({ fieldName }) => fieldName));
const SOURCE_FIELD_SET = new Set(SOURCE_FIELDS);
const NATURAL_PERSON_RISK_TYPES = new Set(["ES", "IS", "PI", "PZ", "S", "TR"]);
const ORGANIZATION_TYPES = new Set([
  "AB", "AC", "AF", "AP", "AR", "C", "CF", "CI", "CL", "CM", "CN", "CP", "CR", "CS", "CT", "CU", "CW", "CX", "DC", "ES",
  "FA", "FB", "FC", "FD", "FE", "FF", "FG", "FH", "FI", "FJ", "FK", "FL", "FM", "FN", "FO", "FP", "FR", "FS", "FT",
  "GC", "GD", "GF", "GJ", "GL", "GM", "GO", "GP", "GR", "GS", "GT", "GU", "GY", "HF", "HS", "IS", "J", "L", "M", "O", "P",
  "PB", "PF", "PI", "PL", "PO", "PV", "PW", "PX", "PY", "PZ", "S", "SF", "ST", "TF", "TH", "TI", "TR", "UF", "UK",
]);
const RECORD_TYPES = new Set(["U", "V", "X"]);
const SOS_STATUS_CODES = new Set(["A", "B", "C", "D", "E", "F", "G", "I", "J", "K", "L", "M", "N", "P", "R", "T", "W", "Y", "Z"]);
const RIGHT_TO_TRANSACT_CODES = new Set(["A", "D", "N", "I", "U"]);
const US_STATE_AND_TERRITORY_CODES = new Set([
  "AL", "AK", "AS", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "GU", "HI", "ID", "IL", "IN", "IA", "KS", "KY",
  "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "MP", "OH", "OK",
  "OR", "PA", "PR", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "VI", "WA", "WV", "WI", "WY",
]);
const QUARANTINE_REASONS = new Set([
  "invalid-taxpayer-number",
  "missing-taxpayer-name",
  "unsupported-organizational-type",
  "unsupported-record-type-code",
  "invalid-responsibility-beginning-date",
  "invalid-sos-charter-date",
  "invalid-sos-status-date",
  "unsupported-sos-status-code",
  "unsupported-right-to-transact-business-code",
  "unsupported-current-exempt-reason-code",
  "invalid-exempt-begin-date",
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
  return `${JSON.stringify(value, null, 2)}\n`;
}

function releaseTimestamp(instant) {
  return instant.replaceAll(/[-:.]/g, "").replace("T", "-").replace("Z", "Z");
}

function assertContained(parent, child, label) {
  const relative = path.relative(parent, child);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`${label} escapes its governed directory.`);
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
  return {
    path: writer.relativePath.replaceAll("\\", "/"),
    ...(await hashFile(writer.destination)),
    record_count: writer.records,
    artifact_type: artifactType,
    ...metadata,
  };
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

function exactSourceRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error("Texas franchise source row must be an object.");
  const keys = Object.keys(record);
  if (keys.length !== SOURCE_FIELDS.length || keys.some((field) => !SOURCE_FIELD_SET.has(field))) {
    throw new Error("Texas franchise source row does not match the exact 18-field contract.");
  }
  return Object.fromEntries(SOURCE_FIELDS.map((field) => [field, record[field] ?? null]));
}

function csvColumns(headers) {
  if (headers.length !== TX_ACTIVE_FRANCHISE_SOURCE_SCHEMA.length) throw new Error("Texas franchise CSV must have exactly 18 columns.");
  return headers.map((header, index) => {
    const expected = TX_ACTIVE_FRANCHISE_SOURCE_SCHEMA[index];
    if (header !== expected.fieldName && String(header).trim() !== expected.name.trim()) {
      throw new Error(`Texas franchise CSV header drifted at column ${index + 1}.`);
    }
    return expected.fieldName;
  });
}

function sourceFormat(sourcePath) {
  const withoutGzip = sourcePath.toLowerCase().endsWith(".gz") ? sourcePath.slice(0, -3) : sourcePath;
  if (withoutGzip.toLowerCase().endsWith(".csv")) return "csv";
  if (/\.(?:jsonl|ndjson)$/i.test(withoutGzip)) return "jsonl";
  throw new Error("Texas franchise offline source must be .csv, .csv.gz, .jsonl, .jsonl.gz, .ndjson, or .ndjson.gz.");
}

async function* sourceRows(sourcePath) {
  const format = sourceFormat(sourcePath);
  const raw = createReadStream(sourcePath);
  const input = sourcePath.toLowerCase().endsWith(".gz") ? raw.pipe(createGunzip()) : raw;
  if (format === "csv") {
    const records = input.pipe(parse({ bom: true, columns: csvColumns, skip_empty_lines: true }));
    for await (const record of records) yield exactSourceRecord(record);
    return;
  }
  const lines = createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      throw new Error("Texas franchise JSONL contains invalid JSON.");
    }
    yield exactSourceRecord(record);
  }
}

async function* gzipRecords(filename) {
  const input = createReadStream(filename).pipe(createGunzip());
  const lines = createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) if (line.trim()) yield JSON.parse(line);
}

function dateValue(value, reason) {
  const raw = textValue(value);
  if (!raw) return null;
  let dateText;
  const compact = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) dateText = `${compact[1]}-${compact[2]}-${compact[3]}`;
  else dateText = raw.match(/^(\d{4}-\d{2}-\d{2})(?:T00:00:00(?:\.000)?Z?)?$/)?.[1];
  if (!dateText) throw new Error(reason);
  const date = new Date(`${dateText}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateText) throw new Error(reason);
  return dateText;
}

function codeValue(value, allowed, reason, { required = false } = {}) {
  const code = textValue(value)?.toUpperCase() ?? null;
  if (!code && !required) return null;
  if (!code || !allowed.has(code)) throw new Error(reason);
  return code;
}

function exemptReason(value) {
  const raw = textValue(value);
  if (!raw) return null;
  if (!/^\d{1,3}$/.test(raw)) throw new Error("unsupported-current-exempt-reason-code");
  const numeric = Number(raw);
  const supported = (numeric >= 0 && numeric <= 80) || (numeric >= 88 && numeric <= 102);
  if (!supported) throw new Error("unsupported-current-exempt-reason-code");
  return numeric < 100 ? String(numeric).padStart(2, "0") : String(numeric);
}

function countyCode(value) {
  const raw = textValue(value);
  if (!raw || !/^\d{1,3}$/.test(raw)) return null;
  const numeric = Number(raw);
  return Number.isInteger(numeric) && numeric >= 1 && numeric <= 999 ? String(numeric).padStart(3, "0") : null;
}

function normalizedAddress(source, organizationalType) {
  const sensitive = NATURAL_PERSON_RISK_TYPES.has(organizationalType);
  const rawState = textValue(source.taxpayer_state)?.toUpperCase() ?? null;
  const state = US_STATE_AND_TERRITORY_CODES.has(rawState) ? rawState : null;
  const split = state ? splitTxActiveFranchisePostcode(source.taxpayer_zip) : {
    zip_code: null,
    postal_code: null,
    zip4: null,
    source_postcode: textValue(source.taxpayer_zip),
  };
  return {
    address_line: sensitive ? null : textValue(source.taxpayer_address),
    city: sensitive ? null : textValue(source.taxpayer_city),
    state: sensitive ? null : state,
    zip_code: sensitive ? null : split.zip_code,
    postal_code: sensitive ? null : split.postal_code,
    zip4: sensitive ? null : split.zip4,
    source_postcode: sensitive ? null : split.source_postcode,
    source_county_code: sensitive ? null : countyCode(source.taxpayer_county_code),
    scope: "taxpayer-administrative-address-not-physical-site",
    physical_site_asserted: false,
    geocoded: false,
  };
}

function normalizeRecord(source, context) {
  const taxpayerNumber = textValue(source.taxpayer_number);
  if (!/^\d{11}$/.test(taxpayerNumber ?? "")) throw new Error("invalid-taxpayer-number");
  const taxpayerName = textValue(source.taxpayer_name);
  if (!taxpayerName) throw new Error("missing-taxpayer-name");
  const organizationalType = codeValue(source.taxpayer_organizational_type, ORGANIZATION_TYPES, "unsupported-organizational-type", { required: true });
  const recordTypeCode = codeValue(source.record_type_code, RECORD_TYPES, "unsupported-record-type-code", { required: true });
  const sosStatusCode = codeValue(source.sos_status_code, SOS_STATUS_CODES, "unsupported-sos-status-code");
  const rightToTransactCode = codeValue(source.right_to_transact_business_code, RIGHT_TO_TRANSACT_CODES, "unsupported-right-to-transact-business-code");
  const address = normalizedAddress(source, organizationalType);
  const sosNumber = textValue(source.secretary_of_state_sos_or_coa_file_number);
  const record = {
    schema_version: TX_ACTIVE_FRANCHISE_SCHEMA_VERSION,
    normalized_record_id: `tx-active-franchise-taxpayer:${taxpayerNumber}`,
    entity_candidate: {
      organization_id: `organization:tx_cpa_taxpayer_${taxpayerNumber}`,
      identity_status: "provisional",
      physical_site_created: false,
      establishment_created: false,
    },
    external_identifiers: [
      { type: "texas_comptroller_taxpayer_number", value: taxpayerNumber, source_field: "taxpayer_number" },
      ...(sosNumber ? [{ type: "texas_sos_or_coa_file_number", value: sosNumber, source_field: "secretary_of_state_sos_or_coa_file_number" }] : []),
    ],
    taxpayer_name: taxpayerName,
    administrative_address: address,
    tax_profile: {
      organizational_type: organizationalType,
      record_type_code: recordTypeCode,
      responsibility_beginning_date: dateValue(source.responsibility_beginning_date, "invalid-responsibility-beginning-date"),
      sos_charter_date: dateValue(source.sos_charter_date, "invalid-sos-charter-date"),
      sos_status_date: dateValue(source.sos_status_date, "invalid-sos-status-date"),
      sos_status_code: sosStatusCode,
      right_to_transact_business_code: rightToTransactCode,
      current_exempt_reason_code: exemptReason(source.current_exempt_reason_code),
      exempt_begin_date: dateValue(source.exempt_begin_date, "invalid-exempt-begin-date"),
      naics_source: {
        source_field: "_621111",
        source_label: "NAICS Code",
        source_value: textValue(source._621111),
        semantics: "source-value-preserved-field-name-is-not-an-inferred-value",
      },
    },
    source_status: {
      listed_in_source: true,
      current_operation_asserted: false,
      semantics: "franchise-tax-and-administrative-status-evidence-not-independent-proof-of-current-operation",
    },
    identity_resolution: {
      automatic_match_key: "texas_comptroller_taxpayer_number",
      automatic_match_requires_exact_value: true,
      fuzzy_match_authoritative: false,
    },
    observed_at: context.observedAt,
    provenance: {
      source_id: "texas-comptroller-active-franchise-taxpayers",
      source_release_id: context.sourceReleaseId,
      source_record_id: taxpayerNumber,
      ingest_run_id: context.runId,
      transformation_version: TX_ACTIVE_FRANCHISE_OFFLINE_TRANSFORMATION_VERSION,
      policy_id: "tx-active-franchise-taxpayers",
    },
    privacy: {
      may_identify_natural_person_or_residence: true,
      natural_person_risk_organizational_type: NATURAL_PERSON_RISK_TYPES.has(organizationalType),
      administrative_address_withheld_for_natural_person_risk: NATURAL_PERSON_RISK_TYPES.has(organizationalType),
      taxpayer_number_public_display_permitted: false,
    },
    export_policy: "local-review-only",
  };
  assertNormalizedUsPostalFieldsDeep(record, "Texas active franchise taxpayer");
  return record;
}

function increment(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function sortedCounts(map) {
  return Object.fromEntries([...map.entries()].sort(([left], [right]) => String(left).localeCompare(String(right))));
}

function compareVersion(left, right) {
  const leftParts = String(left ?? "").split(".").map(Number);
  const rightParts = String(right).split(".").map(Number);
  if (leftParts.length !== 3 || rightParts.length !== 3 || [...leftParts, ...rightParts].some((part) => !Number.isSafeInteger(part) || part < 0)) return -1;
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] > rightParts[index] ? 1 : -1;
  }
  return 0;
}

async function loadSalesTaxTaxpayers(pointerPath, signal) {
  if (!pointerPath) return { taxpayerNumbers: new Set(), dependency: null, status: "not-requested" };
  signal?.throwIfAborted?.();
  let pointer;
  try {
    pointer = JSON.parse(await readFile(pointerPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return { taxpayerNumbers: new Set(), dependency: null, status: "no-compatible-current-release" };
    throw error;
  }
  if (pointer.dataset_id !== "tx-active-sales-tax-outlets" || !pointer.manifest) throw new Error("Texas sales-tax pointer is incompatible.");
  const root = path.dirname(pointerPath);
  const manifestPath = path.resolve(root, pointer.manifest);
  assertContained(root, manifestPath, "Texas sales-tax manifest");
  await verifyTxActiveSalesTaxPermits(manifestPath);
  const manifestBuffer = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBuffer.toString("utf8"));
  if (compareVersion(manifest.connector?.version, "1.0.1") < 0) throw new Error("Texas sales-tax dependency must use connector version 1.0.1 or newer with normalized postal aliases.");
  const releaseDirectory = path.dirname(manifestPath);
  const taxpayerNumbers = new Set();
  const artifacts = (manifest.artifacts ?? []).filter(({ artifact_type: type }) => type === "normalized-tx-active-sales-tax-outlet-jsonl-gzip");
  for (const artifact of artifacts) {
    const artifactPath = path.resolve(releaseDirectory, artifact.path);
    assertContained(releaseDirectory, artifactPath, "Texas sales-tax normalized artifact");
    for await (const record of gzipRecords(artifactPath)) {
      signal?.throwIfAborted?.();
      const taxpayerNumber = record.external_identifiers?.find(({ type }) => type === "texas_comptroller_taxpayer_number")?.value;
      if (/^\d{11}$/.test(taxpayerNumber ?? "")) taxpayerNumbers.add(taxpayerNumber);
    }
  }
  return {
    taxpayerNumbers,
    dependency: { dataset_id: manifest.dataset_id, release_id: manifest.release_id, connector_version: manifest.connector.version, manifest_sha256: sha256(manifestBuffer) },
    status: "exact-taxpayer-number-index-loaded",
  };
}

function hasForbiddenBusinessGeometryKey(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasForbiddenBusinessGeometryKey);
  return Object.entries(value).some(([key, child]) => ["geometry", "geocode", "latitude", "longitude", "location", "coordinates", "coordinate", "point", "lat", "lng", "bbox"].includes(key.toLowerCase()) || hasForbiddenBusinessGeometryKey(child));
}

function assertExactObjectKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) throw new Error(`${label} fields drifted`);
}

export async function buildTxActiveFranchiseTaxpayersOffline({
  outputRoot,
  sourcePath,
  preflight,
  acknowledgement,
  salesTaxPointerPath = null,
  maximumQuarantineRate = 0.005,
  maximumPreflightAgeMs = 48 * 60 * 60 * 1000,
  now = () => new Date(),
  runId = randomUUID(),
  signal,
  logger = () => undefined,
} = {}) {
  if (acknowledgement !== TX_ACTIVE_FRANCHISE_OFFLINE_BUILD_ACKNOWLEDGEMENT) {
    throw new Error(`Texas franchise offline build is default-denied. Exact acknowledgement required: ${TX_ACTIVE_FRANCHISE_OFFLINE_BUILD_ACKNOWLEDGEMENT}`);
  }
  validateTxActiveFranchisePreflightReceipt(preflight);
  if (!outputRoot || !sourcePath) throw new Error("outputRoot and sourcePath are required.");
  if (!Number.isFinite(maximumQuarantineRate) || maximumQuarantineRate < 0 || maximumQuarantineRate > 1) {
    throw new Error("maximumQuarantineRate must be from 0 through 1.");
  }
  if (!Number.isSafeInteger(maximumPreflightAgeMs) || maximumPreflightAgeMs < 1 || maximumPreflightAgeMs > 7 * 24 * 60 * 60 * 1000) {
    throw new Error("maximumPreflightAgeMs must be a positive integer no greater than seven days.");
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(runId)) {
    throw new Error("runId must be a UUID.");
  }
  signal?.throwIfAborted?.();
  const sourceInformation = await stat(sourcePath);
  if (!sourceInformation.isFile()) throw new Error("Texas franchise offline source must be a regular file.");
  const inputDigest = await hashFile(sourcePath);
  const createdDate = now();
  if (!(createdDate instanceof Date) || Number.isNaN(createdDate.getTime())) throw new Error("Offline build timestamp is invalid.");
  const createdAt = createdDate.toISOString();
  const preflightAgeMs = createdDate.getTime() - Date.parse(preflight.observed_at);
  if (preflightAgeMs < 0 || preflightAgeMs > maximumPreflightAgeMs) throw new Error("Texas franchise preflight receipt is outside the permitted freshness window.");
  const salesTax = await loadSalesTaxTaxpayers(salesTaxPointerPath, signal);
  const resolvedOutputRoot = path.resolve(outputRoot);
  const stagingDirectory = path.join(resolvedOutputRoot, ".staging", runId);
  assertContained(resolvedOutputRoot, stagingDirectory, "Texas franchise staging directory");
  await mkdir(path.dirname(stagingDirectory), { recursive: true });
  try {
    await mkdir(stagingDirectory);
  } catch (error) {
    if (error?.code === "EEXIST") throw new Error(`Texas franchise staging run ${runId} already exists; refusing to overwrite it.`);
    throw error;
  }
  const sourceReleaseId = `tx-active-franchise-${preflight.source_rows_updated_at.slice(0, 10)}-${inputDigest.sha256.slice(0, 16)}`;
  const releaseId = `tx-active-franchise-${releaseTimestamp(createdAt)}-${runId.slice(0, 8)}`;
  const context = { runId, sourceReleaseId, observedAt: preflight.observed_at };
  const sourceWriter = await openGzipWriter(stagingDirectory, "source/selected-records.jsonl.gz");
  const normalizedWriters = new Map();
  for (const prefix of "0123456789abcdef") normalizedWriters.set(prefix, await openGzipWriter(stagingDirectory, `normalized/organizations/prefix=${prefix}.jsonl.gz`));
  const quarantineWriter = await openGzipWriter(stagingDirectory, "quality/quarantine.jsonl.gz");
  const linkWriter = await openGzipWriter(stagingDirectory, "derived/exact-taxpayer-number-links.jsonl.gz");
  const taxpayerNumbers = new Set();
  const zipCounts = new Map();
  const quarantineReasons = new Map();
  const organizationTypeCounts = new Map();
  const recordTypeCounts = new Map();
  const sosStatusCounts = new Map();
  const rightToTransactCounts = new Map();
  let sourceCount = 0;
  let normalizedCount = 0;
  let naturalPersonRiskCount = 0;
  try {
    for await (const source of sourceRows(sourcePath)) {
      signal?.throwIfAborted?.();
      sourceCount += 1;
      await writeGzipRecord(sourceWriter, source);
      const taxpayerNumber = textValue(source.taxpayer_number);
      if (/^\d{11}$/.test(taxpayerNumber ?? "")) {
        if (taxpayerNumbers.has(taxpayerNumber)) throw new Error(`Duplicate Texas franchise taxpayer number ${taxpayerNumber}.`);
        taxpayerNumbers.add(taxpayerNumber);
      }
      try {
        const normalized = normalizeRecord(source, context);
        const acceptedNumber = normalized.external_identifiers[0].value;
        const prefix = sha256(acceptedNumber)[0];
        await writeGzipRecord(normalizedWriters.get(prefix), normalized);
        if (salesTax.taxpayerNumbers.has(acceptedNumber)) {
          await writeGzipRecord(linkWriter, {
            schema_version: TX_ACTIVE_FRANCHISE_SCHEMA_VERSION,
            link_id: `tx-franchise-to-sales-tax:${acceptedNumber}`,
            match_type: "exact-texas-comptroller-taxpayer-number",
            match_value: acceptedNumber,
            franchise_organization_id: `organization:tx_cpa_taxpayer_${acceptedNumber}`,
            sales_tax_organization_id: `organization:tx_cpa_taxpayer_${acceptedNumber}`,
            authoritative_automatic_match: true,
            fuzzy_match_used: false,
            source_release_id: sourceReleaseId,
            export_policy: "local-review-only",
          });
        }
        normalizedCount += 1;
        if (normalized.privacy.natural_person_risk_organizational_type) naturalPersonRiskCount += 1;
        if (normalized.administrative_address.zip_code) increment(zipCounts, normalized.administrative_address.zip_code);
        increment(organizationTypeCounts, normalized.tax_profile.organizational_type);
        increment(recordTypeCounts, normalized.tax_profile.record_type_code);
        increment(sosStatusCounts, normalized.tax_profile.sos_status_code ?? "blank");
        increment(rightToTransactCounts, normalized.tax_profile.right_to_transact_business_code ?? "blank");
      } catch (error) {
        if (!QUARANTINE_REASONS.has(error.message)) throw error;
        increment(quarantineReasons, error.message);
        await writeGzipRecord(quarantineWriter, {
          schema_version: TX_ACTIVE_FRANCHISE_SCHEMA_VERSION,
          source_row_number: sourceCount,
          source_record_id: /^\d{11}$/.test(taxpayerNumber ?? "") ? taxpayerNumber : null,
          reason: error.message,
          source_release_id: sourceReleaseId,
          export_policy: "internal",
        });
      }
      if (sourceCount % 100_000 === 0) logger(`Processed ${sourceCount.toLocaleString()} Texas franchise rows.`);
    }
  } catch (error) {
    await abortGzipWriters([sourceWriter, ...normalizedWriters.values(), quarantineWriter, linkWriter]);
    throw error;
  }
  if (sourceCount !== preflight.source_record_count) {
    await abortGzipWriters([sourceWriter, ...normalizedWriters.values(), quarantineWriter, linkWriter]);
    throw new Error(`Texas franchise source count mismatch: read ${sourceCount}, preflight expected ${preflight.source_record_count}.`);
  }
  const quarantineRate = sourceCount ? quarantineWriter.records / sourceCount : 0;
  if (quarantineRate > maximumQuarantineRate) {
    await abortGzipWriters([sourceWriter, ...normalizedWriters.values(), quarantineWriter, linkWriter]);
    throw new Error(`Texas franchise quarantine rate ${quarantineRate} exceeds the maximum ${maximumQuarantineRate}.`);
  }
  const sourceArtifact = await closeGzipWriter(sourceWriter, "tx-active-franchise-taxpayer-selected-source-jsonl-gzip", { export_policy: "internal" });
  const normalizedArtifacts = [];
  for (const writer of normalizedWriters.values()) normalizedArtifacts.push(await closeGzipWriter(writer, "normalized-tx-active-franchise-taxpayer-organization-jsonl-gzip", { export_policy: "local-review-only" }));
  const quarantineArtifact = await closeGzipWriter(quarantineWriter, "tx-active-franchise-taxpayer-quarantine-jsonl-gzip", { export_policy: "internal" });
  const linkArtifact = await closeGzipWriter(linkWriter, "tx-franchise-sales-tax-exact-taxpayer-link-jsonl-gzip", { export_policy: "local-review-only" });
  const zipRows = [...zipCounts.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([zipCode, count]) => ({
    schema_version: TX_ACTIVE_FRANCHISE_SCHEMA_VERSION,
    zip_code: zipCode,
    postal_code: zipCode,
    zip4: null,
    organization_administrative_address_count: count,
    physical_site_count: null,
    physical_site_inference_permitted: false,
    source_release_id: sourceReleaseId,
    source_rows_updated_at: preflight.source_rows_updated_at,
    status: "local-review-only-administrative-address-evidence",
    export_policy: "local-review-only",
  }));
  const zipArtifact = await writeArtifact(stagingDirectory, "derived/administrative-zip-counts.jsonl", zipRows.map((row) => JSON.stringify(row)).join("\n") + (zipRows.length ? "\n" : ""), {
    artifact_type: "tx-active-franchise-taxpayer-administrative-zip-count-jsonl",
    record_count: zipRows.length,
    export_policy: "local-review-only",
  });
  const receiptArtifact = await writeArtifact(stagingDirectory, "source/preflight-receipt.json", json(preflight), {
    artifact_type: "tx-active-franchise-taxpayers-validated-preflight-receipt-json",
    export_policy: "internal",
  });
  const summary = {
    dataset_id: TX_ACTIVE_FRANCHISE_NORMALIZED_DATASET_ID,
    source_release_id: sourceReleaseId,
    source_rows_updated_at: preflight.source_rows_updated_at,
    source_records: sourceCount,
    normalized_provisional_organizations: normalizedCount,
    quarantined_source_records: quarantineWriter.records,
    quarantine_rate: quarantineRate,
    natural_person_risk_organizations_with_address_withheld: naturalPersonRiskCount,
    administrative_zip_codes: zipRows.length,
    eligible_organization_administrative_address_evidence: [...zipCounts.values()].reduce((total, count) => total + count, 0),
    exact_sales_tax_taxpayer_links: linkWriter.records,
    reconciliation_status: salesTax.status,
    quarantine_reasons: sortedCounts(quarantineReasons),
    organization_type_counts: sortedCounts(organizationTypeCounts),
    record_type_counts: sortedCounts(recordTypeCounts),
    sos_status_counts: sortedCounts(sosStatusCounts),
    right_to_transact_counts: sortedCounts(rightToTransactCounts),
    current_operation_asserted: false,
    physical_sites_created: 0,
    establishments_created: 0,
    business_geocodes_created: 0,
    gdp_contribution_created: false,
    record_level_distribution: "local-review-only",
  };
  const summaryArtifact = await writeArtifact(stagingDirectory, "quality/source-summary.json", json(summary), {
    artifact_type: "tx-active-franchise-taxpayer-source-summary-json",
    export_policy: "internal",
  });
  const artifacts = [sourceArtifact, receiptArtifact, ...normalizedArtifacts, quarantineArtifact, linkArtifact, zipArtifact, summaryArtifact];
  const manifest = {
    schema_version: TX_ACTIVE_FRANCHISE_SCHEMA_VERSION,
    dataset_id: TX_ACTIVE_FRANCHISE_NORMALIZED_DATASET_ID,
    connector: { id: "tx-active-franchise-taxpayers", version: TX_ACTIVE_FRANCHISE_CONNECTOR_VERSION.replace(/^.*@/, "") },
    release_id: releaseId,
    source_release_id: sourceReleaseId,
    status: "verified-staging-local-review-only",
    complete_source_snapshot_asserted: false,
    operator_file_row_count_matches_preflight: true,
    production_pointer_published: false,
    created_at: createdAt,
    source: {
      publisher: "Texas Comptroller of Public Accounts",
      dataset_id: TX_ACTIVE_FRANCHISE_DATASET_ID,
      source_rows_updated_at: preflight.source_rows_updated_at,
      preflight_observed_at: preflight.observed_at,
      preflight_age_ms: preflightAgeMs,
      maximum_preflight_age_ms: maximumPreflightAgeMs,
      source_observation_fingerprint: preflight.source_observation_fingerprint,
      schema_fingerprint: TX_ACTIVE_FRANCHISE_SCHEMA_FINGERPRINT,
      operator_supplied_file: { filename: path.basename(sourcePath), format: sourceFormat(sourcePath), ...inputDigest },
      dataset_specific_license: null,
      rights_status: "portal-and-agency-open-data-evidence-retained-dataset-license-unreported-public-redistribution-not-yet-approved",
    },
    coverage: {
      source_records: sourceCount,
      normalized_provisional_organizations: normalizedCount,
      quarantined_source_records: quarantineWriter.records,
      quarantine_rate: quarantineRate,
      administrative_zip_codes: zipRows.length,
      organization_administrative_address_evidence: [...zipCounts.values()].reduce((total, count) => total + count, 0),
      exact_sales_tax_taxpayer_links: linkWriter.records,
      physical_sites: 0,
      establishments: 0,
      business_geocodes: 0,
      physical_site_inference_permitted: false,
      establishment_inference_permitted: false,
      business_geocode_inference_permitted: false,
      operating_status_inference_permitted: false,
      gdp_contribution_permitted: false,
      complete_all_businesses: false,
    },
    quality: {
      maximum_quarantine_rate: maximumQuarantineRate,
      observed_quarantine_rate: quarantineRate,
      quarantine_gate_passed: true,
    },
    dependencies: [...(salesTax.dependency ? [salesTax.dependency] : [])],
    reconciliation: {
      status: salesTax.status,
      match_key: "texas_comptroller_taxpayer_number",
      match_type: "exact-only",
      exact_links: linkWriter.records,
      fuzzy_matching_authoritative: false,
    },
    policy: {
      policy_id: "tx-active-franchise-taxpayers",
      record_level_distribution: "local-review-only",
      aggregate_distribution: "rights-review-required-before-publication",
      natural_person_risk_types_with_address_withheld: [...NATURAL_PERSON_RISK_TYPES].sort(),
    },
    heatmap: {
      status: "excluded-staging-local-review-only",
      allowed_future_measure: "organization-administrative-address-evidence-only-after-governance-admission",
      business_unit_contribution_permitted: false,
      physical_site_contribution_permitted: false,
      geocode_contribution_permitted: false,
      gdp_contribution_permitted: false,
    },
    limitations: [
      "The source lists active franchise-tax accounts; it is not independent proof of a currently operating business or physical site.",
      "Taxpayer addresses are administrative or mailing evidence and are not geocoded or converted into physical sites or establishments.",
      "Natural-person-risk organization types retain their source rows internally but have administrative address fields withheld from normalized output.",
      "The anomalous source field _621111 is bound to the NAICS Code label; the field name is never used as an inferred NAICS value.",
      "This verified release remains in staging and is excluded from production registry, coverage, Heatmap Builder, and completeness counts.",
      "Dataset-specific license metadata is absent; public redistribution requires an explicit governance decision.",
      "The operator-supplied file matches the preflight row count and pinned schema, but no publisher checksum binds it cryptographically to the observed official source snapshot.",
    ],
    artifacts,
  };
  const manifestArtifact = await writeArtifact(stagingDirectory, "manifest.json", json(manifest), { artifact_type: "dataset-manifest-json" });
  signal?.throwIfAborted?.();
  await verifyTxActiveFranchiseTaxpayersOffline(manifestArtifact.path ? path.join(stagingDirectory, manifestArtifact.path) : path.join(stagingDirectory, "manifest.json"), { signal });
  return { manifest, manifestPath: path.join(stagingDirectory, "manifest.json"), stagingDirectory };
}

export async function verifyTxActiveFranchiseTaxpayersOffline(manifestPath, { signal } = {}) {
  signal?.throwIfAborted?.();
  const absoluteManifestPath = path.resolve(manifestPath);
  const releaseDirectory = path.dirname(absoluteManifestPath);
  const manifest = JSON.parse(await readFile(absoluteManifestPath, "utf8"));
  const failures = [];
  if (manifest.dataset_id !== TX_ACTIVE_FRANCHISE_NORMALIZED_DATASET_ID
    || manifest.schema_version !== TX_ACTIVE_FRANCHISE_SCHEMA_VERSION
    || manifest.status !== "verified-staging-local-review-only"
    || manifest.complete_source_snapshot_asserted !== false
    || manifest.operator_file_row_count_matches_preflight !== true
    || manifest.production_pointer_published !== false) {
    failures.push({ path: "manifest.json", reason: "invalid staging identity, schema, status, completeness, or publication state" });
  }
  if (manifest.source?.dataset_id !== TX_ACTIVE_FRANCHISE_DATASET_ID
    || manifest.source?.schema_fingerprint !== TX_ACTIVE_FRANCHISE_SCHEMA_FINGERPRINT
    || manifest.source?.dataset_specific_license !== null
    || manifest.policy?.record_level_distribution !== "local-review-only"
    || manifest.coverage?.complete_all_businesses !== false
    || manifest.coverage?.physical_sites !== 0
    || manifest.coverage?.establishments !== 0
    || manifest.coverage?.business_geocodes !== 0
    || manifest.coverage?.physical_site_inference_permitted !== false
    || manifest.coverage?.establishment_inference_permitted !== false
    || manifest.coverage?.business_geocode_inference_permitted !== false
    || manifest.coverage?.operating_status_inference_permitted !== false
    || manifest.coverage?.gdp_contribution_permitted !== false
    || !Number.isFinite(manifest.quality?.maximum_quarantine_rate)
    || manifest.quality.maximum_quarantine_rate < 0
    || manifest.quality.maximum_quarantine_rate > 1
    || manifest.quality?.observed_quarantine_rate !== manifest.coverage?.quarantine_rate
    || manifest.quality.observed_quarantine_rate > manifest.quality.maximum_quarantine_rate
    || manifest.quality?.quarantine_gate_passed !== true
    || manifest.heatmap?.status !== "excluded-staging-local-review-only"
    || manifest.heatmap?.allowed_future_measure !== "organization-administrative-address-evidence-only-after-governance-admission"
    || manifest.heatmap?.business_unit_contribution_permitted !== false
    || manifest.heatmap?.physical_site_contribution_permitted !== false
    || manifest.heatmap?.geocode_contribution_permitted !== false
    || manifest.heatmap?.gdp_contribution_permitted !== false) {
    failures.push({ path: "manifest.json", reason: "source, policy, privacy, or zero-site boundary is invalid" });
  }
  const artifacts = manifest.artifacts ?? [];
  const expectedArtifactTypes = new Set([
    "tx-active-franchise-taxpayer-selected-source-jsonl-gzip",
    "tx-active-franchise-taxpayers-validated-preflight-receipt-json",
    "normalized-tx-active-franchise-taxpayer-organization-jsonl-gzip",
    "tx-active-franchise-taxpayer-quarantine-jsonl-gzip",
    "tx-franchise-sales-tax-exact-taxpayer-link-jsonl-gzip",
    "tx-active-franchise-taxpayer-administrative-zip-count-jsonl",
    "tx-active-franchise-taxpayer-source-summary-json",
  ]);
  const artifactPaths = new Set();
  const validatedArtifactFilenames = new Map();
  function artifactFilename(artifact, label, { requireValidated = true } = {}) {
    if (!artifact || typeof artifact.path !== "string" || !artifact.path) throw new Error(`missing ${label}`);
    const filename = path.resolve(releaseDirectory, artifact.path);
    assertContained(releaseDirectory, filename, label);
    if (requireValidated) {
      const validated = validatedArtifactFilenames.get(artifact.path);
      if (!validated) throw new Error(`${label} did not pass artifact path validation`);
      return validated;
    }
    return filename;
  }
  if (!Array.isArray(artifacts) || artifacts.length !== 22) {
    failures.push({ path: "manifest.json", reason: "expected the exact 22-artifact offline staging contract" });
  }
  for (const artifact of artifacts) {
    signal?.throwIfAborted?.();
    try {
      if (!expectedArtifactTypes.has(artifact?.artifact_type)) throw new Error("unknown artifact type");
      if (artifactPaths.has(artifact.path)) throw new Error("duplicate artifact path");
      artifactPaths.add(artifact.path);
      const filename = artifactFilename(artifact, `Artifact ${artifact?.path ?? "unknown"}`, { requireValidated: false });
      const information = await lstat(filename);
      if (!information.isFile() || information.isSymbolicLink()) throw new Error("artifact must be a regular non-link file");
      const resolvedFilename = await realpath(filename);
      assertContained(releaseDirectory, resolvedFilename, `Artifact ${artifact.path}`);
      validatedArtifactFilenames.set(artifact.path, resolvedFilename);
      const digest = await hashFile(resolvedFilename);
      if (digest.bytes !== artifact.bytes || digest.sha256 !== artifact.sha256) throw new Error("checksum or byte count mismatch");
    } catch (error) {
      failures.push({ path: artifact.path, reason: error.message });
    }
  }
  const receiptArtifact = artifacts.find(({ artifact_type: type }) => type === "tx-active-franchise-taxpayers-validated-preflight-receipt-json");
  try {
    if (!receiptArtifact || receiptArtifact.export_policy !== "internal") throw new Error("missing internal validated preflight receipt");
    const receipt = JSON.parse(await readFile(artifactFilename(receiptArtifact, "validated preflight receipt"), "utf8"));
    validateTxActiveFranchisePreflightReceipt(receipt);
    if (receipt.source_observation_fingerprint !== manifest.source.source_observation_fingerprint
      || receipt.source_record_count !== manifest.coverage.source_records
      || receipt.observed_at !== manifest.source.preflight_observed_at
      || !Number.isSafeInteger(manifest.source.maximum_preflight_age_ms)
      || manifest.source.maximum_preflight_age_ms < 1
      || manifest.source.maximum_preflight_age_ms > 7 * 24 * 60 * 60 * 1000
      || manifest.source.preflight_age_ms !== Date.parse(manifest.created_at) - Date.parse(receipt.observed_at)
      || manifest.source.preflight_age_ms < 0
      || manifest.source.preflight_age_ms > manifest.source.maximum_preflight_age_ms) throw new Error("preflight receipt does not match manifest source identity or freshness window");
  } catch (error) {
    failures.push({ path: receiptArtifact?.path ?? "source/preflight-receipt.json", reason: error.message });
  }
  const sourceArtifact = artifacts.find(({ artifact_type: type }) => type === "tx-active-franchise-taxpayer-selected-source-jsonl-gzip");
  let sourceCount = 0;
  try {
    if (!sourceArtifact || sourceArtifact.export_policy !== "internal") throw new Error("missing internal selected source artifact");
    for await (const record of gzipRecords(artifactFilename(sourceArtifact, "selected source artifact"))) {
      signal?.throwIfAborted?.();
      exactSourceRecord(record);
      sourceCount += 1;
    }
    if (sourceCount !== sourceArtifact.record_count || sourceCount !== manifest.coverage.source_records) throw new Error("source record count mismatch");
  } catch (error) {
    failures.push({ path: sourceArtifact?.path ?? "source/selected-records.jsonl.gz", reason: error.message });
  }
  const normalizedArtifacts = artifacts.filter(({ artifact_type: type }) => type === "normalized-tx-active-franchise-taxpayer-organization-jsonl-gzip");
  const expectedNormalizedPaths = new Set([..."0123456789abcdef"].map((prefix) => `normalized/organizations/prefix=${prefix}.jsonl.gz`));
  if (normalizedArtifacts.length !== expectedNormalizedPaths.size
    || normalizedArtifacts.some(({ path: artifactPath }) => !expectedNormalizedPaths.delete(artifactPath))
    || expectedNormalizedPaths.size) {
    failures.push({ path: "manifest.json", reason: "normalized organization partitions do not match the exact 16-prefix contract" });
  }
  const normalizedIds = new Set();
  const normalizedTaxpayers = new Set();
  const zipCounts = new Map();
  let normalizedCount = 0;
  for (const artifact of normalizedArtifacts) {
    try {
      if (artifact.export_policy !== "local-review-only") throw new Error("normalized artifact lost local-review-only policy");
      let artifactCount = 0;
      for await (const record of gzipRecords(artifactFilename(artifact, `Normalized artifact ${artifact.path}`))) {
        signal?.throwIfAborted?.();
        artifactCount += 1;
        normalizedCount += 1;
        assertExactObjectKeys(record, ["schema_version", "normalized_record_id", "entity_candidate", "external_identifiers", "taxpayer_name", "administrative_address", "tax_profile", "source_status", "identity_resolution", "observed_at", "provenance", "privacy", "export_policy"], "normalized record");
        assertExactObjectKeys(record.entity_candidate, ["organization_id", "identity_status", "physical_site_created", "establishment_created"], "entity candidate");
        assertExactObjectKeys(record.administrative_address, ["address_line", "city", "state", "zip_code", "postal_code", "zip4", "source_postcode", "source_county_code", "scope", "physical_site_asserted", "geocoded"], "administrative address");
        assertExactObjectKeys(record.tax_profile, ["organizational_type", "record_type_code", "responsibility_beginning_date", "sos_charter_date", "sos_status_date", "sos_status_code", "right_to_transact_business_code", "current_exempt_reason_code", "exempt_begin_date", "naics_source"], "tax profile");
        assertExactObjectKeys(record.tax_profile.naics_source, ["source_field", "source_label", "source_value", "semantics"], "NAICS source");
        assertExactObjectKeys(record.source_status, ["listed_in_source", "current_operation_asserted", "semantics"], "source status");
        assertExactObjectKeys(record.identity_resolution, ["automatic_match_key", "automatic_match_requires_exact_value", "fuzzy_match_authoritative"], "identity resolution");
        assertExactObjectKeys(record.provenance, ["source_id", "source_release_id", "source_record_id", "ingest_run_id", "transformation_version", "policy_id"], "provenance");
        assertExactObjectKeys(record.privacy, ["may_identify_natural_person_or_residence", "natural_person_risk_organizational_type", "administrative_address_withheld_for_natural_person_risk", "taxpayer_number_public_display_permitted"], "privacy");
        const naturalPersonRisk = NATURAL_PERSON_RISK_TYPES.has(record.tax_profile.organizational_type);
        if (record.schema_version !== TX_ACTIVE_FRANCHISE_SCHEMA_VERSION
          || record.entity_candidate.identity_status !== "provisional"
          || record.administrative_address.scope !== "taxpayer-administrative-address-not-physical-site"
          || record.administrative_address.physical_site_asserted !== false
          || record.administrative_address.geocoded !== false
          || record.privacy.may_identify_natural_person_or_residence !== true
          || record.privacy.natural_person_risk_organizational_type !== naturalPersonRisk
          || record.privacy.administrative_address_withheld_for_natural_person_risk !== naturalPersonRisk
          || record.privacy.taxpayer_number_public_display_permitted !== false) throw new Error("normalized organization schema, privacy, or administrative-address boundary is invalid");
        for (const identifier of record.external_identifiers ?? []) assertExactObjectKeys(identifier, ["type", "value", "source_field"], "external identifier");
        if (normalizedIds.has(record.normalized_record_id)) throw new Error(`duplicate normalized identity ${record.normalized_record_id}`);
        normalizedIds.add(record.normalized_record_id);
        const taxpayerNumber = record.external_identifiers?.find(({ type }) => type === "texas_comptroller_taxpayer_number")?.value;
        if (!/^tx-active-franchise-taxpayer:\d{11}$/.test(record.normalized_record_id ?? "")
          || !/^\d{11}$/.test(taxpayerNumber ?? "")
          || record.entity_candidate?.organization_id !== `organization:tx_cpa_taxpayer_${taxpayerNumber}`
          || record.entity_candidate?.physical_site_created !== false
          || record.entity_candidate?.establishment_created !== false) throw new Error("invalid provisional organization identity or entity boundary");
        if (normalizedTaxpayers.has(taxpayerNumber)) throw new Error(`duplicate taxpayer number ${taxpayerNumber}`);
        normalizedTaxpayers.add(taxpayerNumber);
        assertNormalizedUsPostalFieldsDeep(record, "Texas active franchise taxpayer");
        if (record.tax_profile?.naics_source?.source_field !== "_621111" || record.tax_profile?.naics_source?.source_label !== "NAICS Code") throw new Error("NAICS source binding drifted");
        if (record.source_status?.current_operation_asserted !== false || record.export_policy !== "local-review-only") throw new Error("operating-status or export policy was overstated");
        if (record.provenance?.policy_id !== "tx-active-franchise-taxpayers" || record.provenance?.source_release_id !== manifest.source_release_id) throw new Error("provenance is invalid");
        if (hasForbiddenBusinessGeometryKey(record)) throw new Error("business geometry or geocode leaked into normalized organization output");
        if (record.privacy?.natural_person_risk_organizational_type) {
          const address = record.administrative_address;
          if ([address.address_line, address.city, address.state, address.zip_code, address.postal_code, address.zip4, address.source_postcode, address.source_county_code].some((value) => value !== null)) {
            throw new Error("natural-person-risk administrative address was not withheld");
          }
        }
        if (record.administrative_address.zip_code) increment(zipCounts, record.administrative_address.zip_code);
      }
      if (artifactCount !== artifact.record_count) throw new Error("normalized artifact record count mismatch");
    } catch (error) {
      failures.push({ path: artifact.path, reason: error.message });
    }
  }
  if (normalizedCount !== manifest.coverage?.normalized_provisional_organizations) failures.push({ path: "manifest.json", reason: "normalized organization count mismatch" });
  const quarantineArtifact = artifacts.find(({ artifact_type: type }) => type === "tx-active-franchise-taxpayer-quarantine-jsonl-gzip");
  let quarantineCount = 0;
  try {
    if (!quarantineArtifact || quarantineArtifact.export_policy !== "internal") throw new Error("missing internal quarantine artifact");
    for await (const record of gzipRecords(artifactFilename(quarantineArtifact, "quarantine artifact"))) {
      signal?.throwIfAborted?.();
      quarantineCount += 1;
      if (!QUARANTINE_REASONS.has(record.reason) || record.export_policy !== "internal") throw new Error("invalid quarantine record");
    }
    if (quarantineCount !== quarantineArtifact.record_count || quarantineCount !== manifest.coverage.quarantined_source_records) throw new Error("quarantine count mismatch");
  } catch (error) {
    failures.push({ path: quarantineArtifact?.path ?? "quality/quarantine.jsonl.gz", reason: error.message });
  }
  if (sourceCount !== normalizedCount + quarantineCount) failures.push({ path: "manifest.json", reason: "source, normalized, and quarantine counts do not reconcile" });
  const zipArtifact = artifacts.find(({ artifact_type: type }) => type === "tx-active-franchise-taxpayer-administrative-zip-count-jsonl");
  try {
    if (!zipArtifact || zipArtifact.export_policy !== "local-review-only") throw new Error("missing local-review-only administrative ZIP artifact");
    const contents = await readFile(artifactFilename(zipArtifact, "administrative ZIP artifact"), "utf8");
    const rows = contents.trim() ? contents.trim().split("\n").map(JSON.parse) : [];
    if (rows.length !== zipArtifact.record_count || rows.length !== manifest.coverage.administrative_zip_codes) throw new Error("administrative ZIP row count mismatch");
    const seen = new Set();
    for (const row of rows) {
      assertExactObjectKeys(row, ["schema_version", "zip_code", "postal_code", "zip4", "organization_administrative_address_count", "physical_site_count", "physical_site_inference_permitted", "source_release_id", "source_rows_updated_at", "status", "export_policy"], "administrative ZIP summary");
      assertNormalizedUsPostalFieldsDeep(row, "Texas franchise administrative ZIP summary");
      if (seen.has(row.zip_code) || row.schema_version !== TX_ACTIVE_FRANCHISE_SCHEMA_VERSION || row.postal_code !== row.zip_code || row.zip4 !== null
        || row.physical_site_count !== null || row.physical_site_inference_permitted !== false
        || !Number.isSafeInteger(row.organization_administrative_address_count) || row.organization_administrative_address_count < 1
        || row.organization_administrative_address_count !== zipCounts.get(row.zip_code)
        || row.source_release_id !== manifest.source_release_id || row.source_rows_updated_at !== manifest.source.source_rows_updated_at
        || row.status !== "local-review-only-administrative-address-evidence" || row.export_policy !== "local-review-only") throw new Error("invalid administrative ZIP summary");
      seen.add(row.zip_code);
    }
    if (seen.size !== zipCounts.size) throw new Error("administrative ZIP summaries do not reconcile");
    const eligibleEvidence = [...zipCounts.values()].reduce((total, count) => total + count, 0);
    if (manifest.coverage.organization_administrative_address_evidence !== eligibleEvidence) throw new Error("administrative-address evidence count does not reconcile");
  } catch (error) {
    failures.push({ path: zipArtifact?.path ?? "derived/administrative-zip-counts.jsonl", reason: error.message });
  }
  const linkArtifact = artifacts.find(({ artifact_type: type }) => type === "tx-franchise-sales-tax-exact-taxpayer-link-jsonl-gzip");
  let linkCount = 0;
  try {
    if (!linkArtifact || linkArtifact.export_policy !== "local-review-only") throw new Error("missing local-review-only exact-link artifact");
    const linked = new Set();
    for await (const record of gzipRecords(artifactFilename(linkArtifact, "exact-link artifact"))) {
      signal?.throwIfAborted?.();
      linkCount += 1;
      if (record.match_type !== "exact-texas-comptroller-taxpayer-number" || record.authoritative_automatic_match !== true || record.fuzzy_match_used !== false
        || !normalizedTaxpayers.has(record.match_value) || linked.has(record.match_value)
        || record.franchise_organization_id !== `organization:tx_cpa_taxpayer_${record.match_value}`
        || record.sales_tax_organization_id !== record.franchise_organization_id
        || record.export_policy !== "local-review-only") throw new Error("invalid exact taxpayer-number reconciliation link");
      linked.add(record.match_value);
    }
    if (linkCount !== linkArtifact.record_count || linkCount !== manifest.coverage.exact_sales_tax_taxpayer_links || linkCount !== manifest.reconciliation.exact_links) throw new Error("exact-link count mismatch");
  } catch (error) {
    failures.push({ path: linkArtifact?.path ?? "derived/exact-taxpayer-number-links.jsonl.gz", reason: error.message });
  }
  const summaryArtifact = artifacts.find(({ artifact_type: type }) => type === "tx-active-franchise-taxpayer-source-summary-json");
  try {
    if (!summaryArtifact || summaryArtifact.export_policy !== "internal") throw new Error("missing internal source summary");
    const summary = JSON.parse(await readFile(artifactFilename(summaryArtifact, "source summary"), "utf8"));
    if (summary.source_records !== sourceCount
      || summary.normalized_provisional_organizations !== normalizedCount
      || summary.quarantined_source_records !== quarantineCount
      || summary.administrative_zip_codes !== zipCounts.size
      || summary.eligible_organization_administrative_address_evidence !== manifest.coverage.organization_administrative_address_evidence
      || summary.exact_sales_tax_taxpayer_links !== linkCount
      || summary.current_operation_asserted !== false
      || summary.physical_sites_created !== 0
      || summary.establishments_created !== 0
      || summary.business_geocodes_created !== 0
      || summary.gdp_contribution_created !== false
      || summary.record_level_distribution !== "local-review-only") throw new Error("source summary does not reconcile or overstates business evidence");
  } catch (error) {
    failures.push({ path: summaryArtifact?.path ?? "quality/source-summary.json", reason: error.message });
  }
  if (failures.length) {
    const error = new Error("Texas Active Franchise Taxpayers offline staging verification failed.");
    error.failures = failures;
    throw error;
  }
  return {
    dataset_id: manifest.dataset_id,
    release_id: manifest.release_id,
    source_release_id: manifest.source_release_id,
    status: manifest.status,
    production_pointer_published: false,
    artifact_count: artifacts.length,
    coverage: manifest.coverage,
  };
}
