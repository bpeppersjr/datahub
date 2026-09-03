import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { lstat, mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { finished } from "node:stream/promises";

import { parse } from "csv-parse";

import { assertNormalizedUsPostalFieldsDeep } from "./normalized-us-postal-code.mjs";

export const AK_CORPORATIONS_CONNECTOR_ID = "ak-corporations";
export const AK_CORPORATIONS_CONNECTOR_VERSION = "1.0.0";
export const AK_CORPORATIONS_SCHEMA_VERSION = "1.0.0";
export const AK_CORPORATIONS_TRANSFORMATION_VERSION = "ak-corporations@1.0.0";
export const AK_CORPORATIONS_URL = "https://www.commerce.alaska.gov/cbp/main/DbDownload/CorporationsDownload";
export const AK_CORPORATIONS_FILENAME = "CorporationsDownload.csv";
export const AK_CORPORATIONS_OBSERVED_CONTENT_LENGTH = 44_309_498;
export const AK_CORPORATIONS_MAX_SOURCE_BYTES = 60_000_000;
export const AK_CORPORATIONS_MAX_HEADER_BYTES = 81_616;
export const AK_CORPORATIONS_PREFLIGHT_TIMEOUT_MS = 30_000;
export const AK_CORPORATIONS_LARGE_ACQUISITION_ACKNOWLEDGEMENT = "I-APPROVE-AK-CORPORATIONS-FULL-LIVE-ACQUISITION";
export const AK_CORPORATIONS_OFFLINE_BUILD_ACKNOWLEDGEMENT = "I-APPROVE-AK-CORPORATIONS-OFFLINE-LOCAL-REVIEW-BUILD";

export const AK_CORPORATIONS_HEADERS = Object.freeze([
  "CORPTYPE",
  "ENTITYNUMBER",
  "LEGALNAME",
  "ASSUMEDNAME",
  "STATUS",
  "AKFORMEDDATE",
  "DURATIONEXPIRATIONDATE",
  "HOMESTATE",
  "HOMECOUNTRY",
  "NEXTBRDUEDATE",
  "REGISTEREDAGENT",
  "ENTITYMAILINGADDRESS1",
  "ENTITYMAILINGADDRESS2",
  "ENTITYMAILINGCITY",
  "ENTITYMAILINGSTATEPROVINCE",
  "ENTITYMAILINGZIP",
  "ENTITYMAILINGCOUNTRY",
  "ENTITYPHYSADDRESS1",
  "ENTITYPHYSADDRESS2",
  "ENTITYPHYSCITY",
  "ENTITYPHYSSTATEPROVINCE",
  "ENTITYPHYSZIP",
  "ENTITYPHYSCOUNTRY",
  "REGISTEREDMAILADDRESS1",
  "REGISTEREDMAILADDRESS2",
  "REGISTEREDMAILCITY",
  "REGISTEREDMAILSTATEPROVINCE",
  "REGISTEREDMAILZIP",
  "REGISTEREDMAILCOUNTRY",
  "REGISTEREDPHYSADDRESS1",
  "REGISTEREDPHYSADDRESS2",
  "REGISTEREDPHYSCITY",
  "REGISTEREDPHYSSTATEPROVINCE",
  "REGISTEREDPHYSZIP",
  "REGISTEREDPHYSCOUNTRY",
]);
export const AK_CORPORATIONS_SCHEMA_FINGERPRINT = "356d519c62dea68287b028721822cb7f487b7fc0074c55878942f99f803b54d1";

export const AK_CORPORATIONS_LEGAL_ENTITY_TYPES = Object.freeze([
  "Business Corporation",
  "Cooperative Corporation",
  "Limited Liability Company",
  "Limited Liability Partnership",
  "Limited Partnership",
  "Nonprofit Corporation",
  "Professional Corporation",
  "Religious Corporation",
]);

export const AK_CORPORATIONS_EXCLUDED_NAME_REGISTRATION_TYPES = Object.freeze([
  "Business Name Registration",
  "Foreign Corporate Name Registration",
]);

const HEADER_SET = new Set(AK_CORPORATIONS_HEADERS);
const ALLOWED_TYPE_KEYS = new Set(AK_CORPORATIONS_LEGAL_ENTITY_TYPES.map((value) => value.toUpperCase()));
const EXCLUDED_ALIAS_TYPE_KEYS = new Set(AK_CORPORATIONS_EXCLUDED_NAME_REGISTRATION_TYPES.map((value) => value.toUpperCase()));
const SELECTED_SOURCE_FIELDS = Object.freeze([
  "corporation_type",
  "entity_number",
  "legal_name",
  "assumed_name",
  "status",
  "alaska_formed_date",
  "duration_expiration_date",
  "home_state",
  "home_country",
  "next_biennial_report_due_date",
  "entity_mailing_address_1",
  "entity_mailing_address_2",
  "entity_mailing_city",
  "entity_mailing_state_province",
  "entity_mailing_zip",
  "entity_mailing_country",
  "entity_physical_address_1",
  "entity_physical_address_2",
  "entity_physical_city",
  "entity_physical_state_province",
  "entity_physical_zip",
  "entity_physical_country",
]);
const SELECTED_SOURCE_FIELD_SET = new Set(SELECTED_SOURCE_FIELDS);
const FORBIDDEN_SOURCE_FIELD = /^REGISTERED_?(?:AGENT|MAIL|PHYS)/i;
const FORBIDDEN_DERIVED_KEY = new Set([
  "registered_agent", "agent", "owner", "owners", "principal", "officer", "manager", "member",
  "site", "sites", "physical_site", "physical_site_id", "establishment", "establishment_id",
  "geometry", "geocode", "latitude", "longitude", "coordinates", "point", "heatmap",
]);
const DATAHUB_ROOT = path.resolve(import.meta.dirname, "..");

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

function isoInstant(value, label) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} is not a valid timestamp.`);
  return date.toISOString();
}

function assertUuid(value, label = "runId") {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value ?? "")) {
    throw new Error(`${label} must be a UUID.`);
  }
}

function assertContained(parent, child, label) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`${label} escapes its governed directory.`);
}

async function ensurePlainDirectory(parent, directory, label) {
  const realParent = await realpath(parent);
  const target = path.resolve(directory);
  assertContained(realParent, target, label);
  const relative = path.relative(realParent, target);
  let current = realParent;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    let information;
    try {
      information = await lstat(current);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      await mkdir(current);
      information = await lstat(current);
    }
    if (!information.isDirectory() || information.isSymbolicLink()) throw new Error(`${label} must use regular non-link directories.`);
    assertContained(realParent, await realpath(current), label);
  }
  return realpath(target);
}

function requestSignal(signal, timeoutMs) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) {
    throw new Error("requestTimeoutMs must be an integer from 1 through 120000.");
  }
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
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

export function akCorporationsHeaderFingerprint(headers) {
  return sha256((headers ?? []).join("\u0000"));
}

function validateHeaders(headers) {
  const fingerprint = akCorporationsHeaderFingerprint(headers);
  if (headers.length !== AK_CORPORATIONS_HEADERS.length
    || headers.some((header, index) => header !== AK_CORPORATIONS_HEADERS[index])
    || fingerprint !== AK_CORPORATIONS_SCHEMA_FINGERPRINT) {
    throw new Error(`Alaska Corporations schema changed (${fingerprint}).`);
  }
  return fingerprint;
}

function assertExactSourceRow(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error("Alaska Corporations source row must be an object.");
  const keys = Object.keys(record);
  if (keys.length !== AK_CORPORATIONS_HEADERS.length || keys.some((field) => !HEADER_SET.has(field))) {
    throw new Error("Alaska Corporations source row does not match the exact 35-column contract.");
  }
  return record;
}

function assertExactSelectedRow(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error("Alaska Corporations selected row must be an object.");
  const keys = Object.keys(record);
  if (keys.length !== SELECTED_SOURCE_FIELDS.length || keys.some((field) => !SELECTED_SOURCE_FIELD_SET.has(field))) {
    throw new Error("Alaska Corporations selected row fields drifted.");
  }
  return record;
}

function parseCsvHeader(line) {
  const values = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === "," && !quoted) {
      values.push(current);
      current = "";
    } else current += character;
  }
  if (quoted) throw new Error("Alaska Corporations header contains an unterminated quoted field.");
  values.push(current);
  if (values[0]?.charCodeAt(0) === 0xfeff) values[0] = values[0].slice(1);
  return values;
}

function assertAllowedUrl(urlValue) {
  const url = new URL(urlValue);
  if (url.protocol !== "https:"
    || url.hostname !== "www.commerce.alaska.gov"
    || url.pathname !== "/cbp/main/DbDownload/CorporationsDownload"
    || url.username || url.password || url.hash || url.search) {
    throw new Error("Alaska Corporations URL is not allowed.");
  }
  return url;
}

function parseContentLength(response, { minimum = 1, maximum = AK_CORPORATIONS_MAX_SOURCE_BYTES } = {}) {
  const raw = response.headers.get("content-length");
  if (!/^\d+$/.test(raw ?? "")) throw new Error("Alaska Corporations response requires an exact Content-Length.");
  const bytes = Number(raw);
  if (!Number.isSafeInteger(bytes) || bytes < minimum || bytes > maximum) {
    throw new Error("Alaska Corporations response Content-Length is outside the allowed bounds.");
  }
  return bytes;
}

function validateContentHeaders(response, { allowPartial = false } = {}) {
  if (response.status >= 300 && response.status < 400) throw new Error("Alaska Corporations redirects are not permitted.");
  if (allowPartial ? ![200, 206].includes(response.status) : response.status !== 200) {
    throw new Error(`Alaska Corporations request failed with HTTP ${response.status}.`);
  }
  const contentType = String(response.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "text/csv") throw new Error("Alaska Corporations response Content-Type must be text/csv.");
  const disposition = String(response.headers.get("content-disposition") ?? "");
  const filename = disposition.match(/filename\*?=(?:UTF-8''|["']?)([^"';]+)["']?/i)?.[1]?.trim();
  if (filename !== AK_CORPORATIONS_FILENAME) throw new Error(`Alaska Corporations response filename must be ${AK_CORPORATIONS_FILENAME}.`);
}

async function readHeaderAndCancel(response, maximumHeaderBytes, signal) {
  if (!response.body) throw new Error("Alaska Corporations bounded header response has no body.");
  const reader = response.body.getReader?.();
  if (!reader) throw new Error("Alaska Corporations bounded header response is not a readable web stream.");
  const chunks = [];
  let bytesObserved = 0;
  let headerLine = null;
  let cancelled = false;
  try {
    while (headerLine === null) {
      signal?.throwIfAborted?.();
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      bytesObserved += chunk.length;
      if (bytesObserved > maximumHeaderBytes) throw new Error("Alaska Corporations header exceeded the bounded preflight byte limit.");
      chunks.push(chunk);
      const combined = Buffer.concat(chunks);
      const newline = combined.indexOf(0x0a);
      if (newline >= 0) {
        headerLine = combined.subarray(0, newline).toString("utf8").replace(/\r$/, "");
        await reader.cancel("Alaska Corporations bounded-prefix schema preflight complete.");
        cancelled = true;
      }
    }
  } finally {
    if (!cancelled) {
      try {
        await reader.cancel("Alaska Corporations bounded preflight ended.");
        cancelled = true;
      } catch {
        // The original validation or cancellation error remains authoritative.
      }
    }
  }
  if (headerLine === null) throw new Error("Alaska Corporations source ended before the CSV header newline.");
  return { headerLine, bytesObserved, cancelled };
}

function receiptFingerprint(receipt) {
  const unsigned = { ...receipt };
  delete unsigned.receipt_fingerprint;
  return sha256(JSON.stringify(unsigned));
}

export function validateAkCorporationsPreflight(receipt) {
  if (!receipt || receipt.connector_id !== AK_CORPORATIONS_CONNECTOR_ID
    || receipt.connector_version !== AK_CORPORATIONS_CONNECTOR_VERSION
    || receipt.status !== "bounded-prefix-header-validated-no-rows-parsed-or-persisted"
    || receipt.source?.url !== AK_CORPORATIONS_URL
    || receipt.source?.filename !== AK_CORPORATIONS_FILENAME
    || receipt.source?.content_type !== "text/csv"
    || !Number.isSafeInteger(receipt.source?.declared_bytes)
    || receipt.source.declared_bytes < 1
    || receipt.source.declared_bytes > AK_CORPORATIONS_MAX_SOURCE_BYTES
    || receipt.schema?.column_count !== 35
    || receipt.schema?.fingerprint !== AK_CORPORATIONS_SCHEMA_FINGERPRINT
    || JSON.stringify(receipt.schema?.headers) !== JSON.stringify(AK_CORPORATIONS_HEADERS)
    || receipt.acquisition?.head_requests !== 1
    || receipt.acquisition?.bounded_header_get_requests !== 1
    || receipt.acquisition?.bulk_rows_parsed !== 0
    || receipt.acquisition?.bulk_file_saved !== false
    || receipt.acquisition?.normalized_records_produced !== 0
    || receipt.acquisition?.release_pointer_published !== false
    || receipt.acquisition?.body_cancelled_after_header !== true
    || receipt.acquisition?.prefix_may_contain_unparsed_row_bytes !== true
    || !Number.isSafeInteger(receipt.acquisition?.response_body_bytes_observed)
    || receipt.acquisition.response_body_bytes_observed < 1
    || receipt.acquisition.response_body_bytes_observed > AK_CORPORATIONS_MAX_HEADER_BYTES
    || !/^[a-f0-9]{64}$/.test(receipt.receipt_fingerprint ?? "")
    || receiptFingerprint(receipt) !== receipt.receipt_fingerprint) {
    throw new Error("Alaska Corporations preflight receipt is invalid.");
  }
  isoInstant(receipt.observed_at, "Alaska Corporations preflight observed_at");
  return receipt;
}

export async function preflightAkCorporations({
  url = AK_CORPORATIONS_URL,
  fetchImpl = globalThis.fetch,
  signal,
  now = () => new Date(),
  maximumHeaderBytes = AK_CORPORATIONS_MAX_HEADER_BYTES,
  maximumSourceBytes = AK_CORPORATIONS_MAX_SOURCE_BYTES,
  requestTimeoutMs = AK_CORPORATIONS_PREFLIGHT_TIMEOUT_MS,
} = {}) {
  const sourceUrl = assertAllowedUrl(url);
  if (!Number.isSafeInteger(maximumHeaderBytes) || maximumHeaderBytes < 1024 || maximumHeaderBytes > AK_CORPORATIONS_MAX_HEADER_BYTES) {
    throw new Error(`maximumHeaderBytes must be from 1024 through ${AK_CORPORATIONS_MAX_HEADER_BYTES}.`);
  }
  if (!Number.isSafeInteger(maximumSourceBytes) || maximumSourceBytes < 1 || maximumSourceBytes > AK_CORPORATIONS_MAX_SOURCE_BYTES) {
    throw new Error("maximumSourceBytes is outside the connector source-size boundary.");
  }
  signal?.throwIfAborted?.();
  const networkSignal = requestSignal(signal, requestTimeoutMs);
  const head = await fetchImpl(sourceUrl, {
    method: "HEAD",
    redirect: "manual",
    signal: networkSignal,
    headers: { accept: "text/csv" },
  });
  validateContentHeaders(head);
  const declaredBytes = parseContentLength(head, { maximum: maximumSourceBytes });
  signal?.throwIfAborted?.();
  const bounded = await fetchImpl(sourceUrl, {
    method: "GET",
    redirect: "manual",
    signal: networkSignal,
    headers: { accept: "text/csv", range: `bytes=0-${maximumHeaderBytes - 1}` },
  });
  validateContentHeaders(bounded, { allowPartial: true });
  if (bounded.status === 200) {
    const getDeclaredBytes = parseContentLength(bounded, { maximum: maximumSourceBytes });
    if (getDeclaredBytes !== declaredBytes) throw new Error("Alaska Corporations HEAD and GET Content-Length values disagree.");
  } else {
    const contentRange = String(bounded.headers.get("content-range") ?? "");
    const match = contentRange.match(/^bytes\s+0-(\d+)\/(\d+)$/i);
    if (!match || Number(match[2]) !== declaredBytes || Number(match[1]) >= maximumHeaderBytes || Number(match[1]) >= declaredBytes) {
      throw new Error("Alaska Corporations bounded response Content-Range is invalid.");
    }
    const partialBytes = parseContentLength(bounded, { maximum: maximumHeaderBytes });
    if (partialBytes !== Number(match[1]) + 1) throw new Error("Alaska Corporations partial Content-Length and Content-Range disagree.");
  }
  const headerRead = await readHeaderAndCancel(bounded, maximumHeaderBytes, networkSignal);
  const headers = parseCsvHeader(headerRead.headerLine);
  validateHeaders(headers);
  const dateHeader = head.headers.get("date") ?? bounded.headers.get("date");
  const observedAt = dateHeader ? isoInstant(dateHeader, "Alaska Corporations Date header") : isoInstant(now(), "Alaska Corporations preflight time");
  const receipt = {
    connector_id: AK_CORPORATIONS_CONNECTOR_ID,
    connector_version: AK_CORPORATIONS_CONNECTOR_VERSION,
    status: "bounded-prefix-header-validated-no-rows-parsed-or-persisted",
    observed_at: observedAt,
    source: {
      publisher: "State of Alaska Department of Commerce, Community, and Economic Development, Division of Corporations, Business and Professional Licensing",
      url: AK_CORPORATIONS_URL,
      filename: AK_CORPORATIONS_FILENAME,
      content_type: "text/csv",
      declared_bytes: declaredBytes,
      observed_content_length_reference: AK_CORPORATIONS_OBSERVED_CONTENT_LENGTH,
    },
    schema: { column_count: headers.length, headers, fingerprint: AK_CORPORATIONS_SCHEMA_FINGERPRINT },
    acquisition: {
      head_requests: 1,
      bounded_header_get_requests: 1,
      range_requested: `bytes=0-${maximumHeaderBytes - 1}`,
      response_body_bytes_observed: headerRead.bytesObserved,
      body_cancelled_after_header: headerRead.cancelled,
      prefix_may_contain_unparsed_row_bytes: true,
      bulk_rows_parsed: 0,
      bulk_file_saved: false,
      normalized_records_produced: 0,
      release_pointer_published: false,
    },
  };
  receipt.receipt_fingerprint = receiptFingerprint(receipt);
  return validateAkCorporationsPreflight(receipt);
}

export async function acquireAkCorporations({ acknowledgement, preflight } = {}) {
  if (acknowledgement !== AK_CORPORATIONS_LARGE_ACQUISITION_ACKNOWLEDGEMENT) {
    throw new Error(`Alaska Corporations full live acquisition is default-denied. Exact acknowledgement required: ${AK_CORPORATIONS_LARGE_ACQUISITION_ACKNOWLEDGEMENT}`);
  }
  validateAkCorporationsPreflight(preflight);
  throw new Error("Alaska Corporations full live acquisition is intentionally unimplemented; no network request was issued.");
}

function selectedSourceRecord(source) {
  assertExactSourceRow(source);
  return {
    corporation_type: textValue(source.CORPTYPE),
    entity_number: textValue(source.ENTITYNUMBER),
    legal_name: textValue(source.LEGALNAME),
    assumed_name: textValue(source.ASSUMEDNAME),
    status: textValue(source.STATUS),
    alaska_formed_date: textValue(source.AKFORMEDDATE),
    duration_expiration_date: textValue(source.DURATIONEXPIRATIONDATE),
    home_state: textValue(source.HOMESTATE),
    home_country: textValue(source.HOMECOUNTRY),
    next_biennial_report_due_date: textValue(source.NEXTBRDUEDATE),
    entity_mailing_address_1: textValue(source.ENTITYMAILINGADDRESS1),
    entity_mailing_address_2: textValue(source.ENTITYMAILINGADDRESS2),
    entity_mailing_city: textValue(source.ENTITYMAILINGCITY),
    entity_mailing_state_province: textValue(source.ENTITYMAILINGSTATEPROVINCE),
    entity_mailing_zip: textValue(source.ENTITYMAILINGZIP),
    entity_mailing_country: textValue(source.ENTITYMAILINGCOUNTRY),
    entity_physical_address_1: textValue(source.ENTITYPHYSADDRESS1),
    entity_physical_address_2: textValue(source.ENTITYPHYSADDRESS2),
    entity_physical_city: textValue(source.ENTITYPHYSCITY),
    entity_physical_state_province: textValue(source.ENTITYPHYSSTATEPROVINCE),
    entity_physical_zip: textValue(source.ENTITYPHYSZIP),
    entity_physical_country: textValue(source.ENTITYPHYSCOUNTRY),
  };
}

function typeDisposition(value) {
  const type = textValue(value);
  const key = type?.toUpperCase() ?? "";
  if (EXCLUDED_ALIAS_TYPE_KEYS.has(key)) return "excluded-name-registration-alias";
  if (ALLOWED_TYPE_KEYS.has(key)) return "accepted-legal-entity";
  return "excluded-unapproved-corporation-type";
}

function dateEvidence(value) {
  const source = textValue(value);
  if (!source) return { source: null, date: null };
  const match = source.match(/^(?:(\d{1,2})\/(\d{1,2})\/(\d{4})|(\d{4})-(\d{2})-(\d{2}))(?:\s+.*)?$/);
  if (!match) return { source, date: null };
  const year = Number(match[3] ?? match[4]);
  const month = Number(match[1] ?? match[5]);
  const day = Number(match[2] ?? match[6]);
  const date = new Date(Date.UTC(year, month - 1, day));
  const valid = year >= 1800 && year <= 2200 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return { source, date: valid ? `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` : null };
}

function normalizedCountry(value) {
  const source = textValue(value);
  return { source, code: ["US", "USA", "UNITED STATES", "UNITED STATES OF AMERICA"].includes(source?.toUpperCase()) ? "US" : null };
}

export function splitAkCorporationsZip(value) {
  const source = textValue(value);
  const match = source?.match(/^(\d{5})(?:-?(\d{4}))?$/);
  const valid = match && match[1] !== "00000";
  return {
    source_postal_code: source,
    zip_code: valid ? match[1] : null,
    postal_code: valid ? match[1] : null,
    zip4: valid ? (match[2] ?? null) : null,
  };
}

function administrativeAddress(source, kind) {
  const prefix = kind === "mailing" ? "entity_mailing" : "entity_physical";
  const country = normalizedCountry(source[`${prefix}_country`]);
  const postal = country.code === "US" ? splitAkCorporationsZip(source[`${prefix}_zip`]) : {
    source_postal_code: textValue(source[`${prefix}_zip`]), zip_code: null, postal_code: null, zip4: null,
  };
  return {
    address_line_1: textValue(source[`${prefix}_address_1`]),
    address_line_2: textValue(source[`${prefix}_address_2`]),
    city: textValue(source[`${prefix}_city`]),
    state_province: textValue(source[`${prefix}_state_province`]),
    country: country.code,
    country_source: country.source,
    ...postal,
    role: kind === "mailing" ? "entity-mailing-administrative-address" : "entity-physical-administrative-address",
    operating_site_asserted: false,
    geocoded: false,
  };
}

function hasForbiddenDerivedKey(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasForbiddenDerivedKey);
  return Object.entries(value).some(([key, child]) => FORBIDDEN_DERIVED_KEY.has(key.toLowerCase()) || hasForbiddenDerivedKey(child));
}

function normalizedOrganization(source, context) {
  assertExactSelectedRow(source);
  if (typeDisposition(source.corporation_type) !== "accepted-legal-entity") throw new Error("Alaska Corporations record is not an allowlisted legal entity type.");
  const entityNumber = textValue(source.entity_number);
  if (!entityNumber || !/^[A-Za-z0-9-]+$/.test(entityNumber)) throw new Error("Alaska Corporations entity number is missing or invalid.");
  if (!textValue(source.legal_name)) throw new Error("Alaska Corporations legal name is required.");
  if (!textValue(source.status)) throw new Error("Alaska Corporations exact source status is required.");
  const record = {
    schema_version: AK_CORPORATIONS_SCHEMA_VERSION,
    normalized_record_id: `ak-corporation:${entityNumber}`,
    entity_candidate: {
      organization_id: `organization:ak_corporation_${entityNumber}`,
      identity_status: "provisional",
      physical_site_created: false,
      establishment_created: false,
    },
    external_identifiers: [{ type: "alaska_corporation_entity_number", value: entityNumber, source_field: "ENTITYNUMBER" }],
    names: { legal_name: source.legal_name, assumed_name: source.assumed_name },
    registration: {
      corporation_type: source.corporation_type,
      status_exact: source.status,
      alaska_formed_date: dateEvidence(source.alaska_formed_date),
      duration_expiration_date: dateEvidence(source.duration_expiration_date),
      next_biennial_report_due_date: dateEvidence(source.next_biennial_report_due_date),
      home_jurisdiction: { state_source: source.home_state, country_source: source.home_country },
      semantics: "source-registration-status-and-dates-preserved-without-current-operation-or-good-standing-inference",
    },
    administrative_addresses: {
      mailing: administrativeAddress(source, "mailing"),
      physical: administrativeAddress(source, "physical"),
      semantics: "source-reported-entity-addresses-are-administrative-evidence-not-operating-sites-or-establishments",
    },
    observed_at: context.observedAt,
    provenance: {
      source_id: AK_CORPORATIONS_CONNECTOR_ID,
      source_release_id: context.sourceReleaseId,
      source_record_id: entityNumber,
      ingest_run_id: context.runId,
      transformation_version: AK_CORPORATIONS_TRANSFORMATION_VERSION,
      policy_id: "ak-corporations",
    },
    privacy: {
      agent_and_registered_address_fields_excluded_before_persistence: true,
      person_owner_officer_manager_member_fields_absent: true,
      organization_names_or_addresses_may_still_contain_personal_or_residential_information: true,
    },
    export_policy: "local-review-only",
  };
  assertNormalizedUsPostalFieldsDeep(record, "Alaska corporation organization");
  if (hasForbiddenDerivedKey(record)) throw new Error("Alaska Corporations normalization created a forbidden site, person, geometry, or Heatmap field.");
  return record;
}

export function normalizeAkCorporation(source, context) {
  return normalizedOrganization(selectedSourceRecord(source), context);
}

async function* sourceRows(sourcePath) {
  const input = createReadStream(sourcePath);
  const records = input.pipe(parse({
    bom: true,
    columns: (headers) => {
      validateHeaders(headers);
      return headers;
    },
    skip_empty_lines: true,
    relax_column_count: false,
    max_record_size: 1_000_000,
  }));
  try {
    for await (const record of records) yield assertExactSourceRow(record);
  } finally {
    records.destroy();
    input.destroy();
  }
}

async function* jsonLines(filename) {
  const input = createReadStream(filename);
  const lines = createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      if (!line.trim()) continue;
      let record;
      try {
        record = JSON.parse(line);
      } catch {
        throw new Error(`${path.basename(filename)} contains invalid JSONL.`);
      }
      yield record;
    }
  } finally {
    lines.close();
    input.destroy();
  }
}

async function openJsonlWriter(stagingDirectory, relativePath) {
  const destination = path.join(stagingDirectory, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp-${randomUUID()}`;
  const stream = createWriteStream(temporary, { flags: "wx" });
  await once(stream, "open");
  return { relativePath, destination, temporary, stream, records: 0 };
}

async function writeJsonlRecord(writer, record) {
  if (!writer.stream.write(`${JSON.stringify(record)}\n`)) await once(writer.stream, "drain");
  writer.records += 1;
}

async function closeJsonlWriter(writer, artifactType, exportPolicy) {
  const completion = finished(writer.stream);
  writer.stream.end();
  await completion;
  await renameWithRetry(writer.temporary, writer.destination);
  return {
    path: writer.relativePath.replaceAll("\\", "/"),
    ...(await hashFile(writer.destination)),
    record_count: writer.records,
    artifact_type: artifactType,
    export_policy: exportPolicy,
  };
}

async function abortWriters(writers) {
  for (const writer of writers.filter(Boolean)) writer.stream.destroy();
  await Promise.allSettled(writers.filter(Boolean).map((writer) => finished(writer.stream)));
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

function increment(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function sortedCounts(map) {
  return Object.fromEntries([...map.entries()].sort(([left], [right]) => String(left).localeCompare(String(right))));
}

export async function buildAkCorporationsOffline({
  outputRoot,
  sourcePath,
  expectedSourceSha256,
  acknowledgement,
  now = () => new Date(),
  runId = randomUUID(),
  signal,
  logger = () => undefined,
} = {}) {
  if (acknowledgement !== AK_CORPORATIONS_OFFLINE_BUILD_ACKNOWLEDGEMENT) {
    throw new Error(`Alaska Corporations offline build is default-denied. Exact acknowledgement required: ${AK_CORPORATIONS_OFFLINE_BUILD_ACKNOWLEDGEMENT}`);
  }
  if (!outputRoot || !sourcePath) throw new Error("outputRoot and sourcePath are required.");
  if (!/^[a-f0-9]{64}$/.test(expectedSourceSha256 ?? "")) throw new Error("expectedSourceSha256 is required.");
  assertUuid(runId);
  signal?.throwIfAborted?.();
  const governedRoot = DATAHUB_ROOT;
  const resolvedOutputRoot = path.resolve(outputRoot);
  const resolvedSourcePath = path.resolve(sourcePath);
  assertContained(governedRoot, resolvedOutputRoot, "Alaska Corporations output");
  assertContained(governedRoot, resolvedSourcePath, "Alaska Corporations offline source");
  const realGovernedRoot = await realpath(governedRoot);
  const sourceInformation = await lstat(resolvedSourcePath);
  if (!sourceInformation.isFile() || sourceInformation.isSymbolicLink() || sourceInformation.nlink !== 1) throw new Error("Alaska Corporations offline source must be a regular non-link, non-hardlinked CSV file.");
  const realSource = await realpath(resolvedSourcePath);
  assertContained(realGovernedRoot, realSource, "Alaska Corporations offline source");
  if (sourceInformation.size > AK_CORPORATIONS_MAX_SOURCE_BYTES) throw new Error("Alaska Corporations offline source exceeds the connector byte limit.");
  const inputDigest = await hashFile(realSource);
  if (inputDigest.bytes > AK_CORPORATIONS_MAX_SOURCE_BYTES) throw new Error("Alaska Corporations offline source exceeds the connector byte limit.");
  if (inputDigest.sha256 !== expectedSourceSha256) throw new Error("Alaska Corporations offline source SHA-256 does not match the acknowledgement.");
  const createdAt = isoInstant(now(), "Alaska Corporations offline build time");
  const realOutputRoot = await ensurePlainDirectory(realGovernedRoot, resolvedOutputRoot, "Alaska Corporations output");
  assertContained(realGovernedRoot, realOutputRoot, "Alaska Corporations output");
  const stagingDirectory = path.join(realOutputRoot, ".staging", runId);
  assertContained(realOutputRoot, stagingDirectory, "Alaska Corporations staging run");
  const stagingRoot = await ensurePlainDirectory(realOutputRoot, path.dirname(stagingDirectory), "Alaska Corporations staging root");
  assertContained(stagingRoot, stagingDirectory, "Alaska Corporations staging run");
  try {
    await mkdir(stagingDirectory);
  } catch (error) {
    if (error?.code === "EEXIST") throw new Error(`Alaska Corporations staging run ${runId} already exists; refusing to overwrite it.`);
    throw error;
  }
  const sourceReleaseId = `ak-corporations-fixture-${inputDigest.sha256.slice(0, 16)}`;
  const releaseId = `ak-corporations-${releaseTimestamp(createdAt)}-${inputDigest.sha256.slice(0, 12)}-${runId.slice(0, 8)}`;
  const context = { observedAt: createdAt, sourceReleaseId, runId };
  let sourceWriter = null;
  let normalizedWriter = null;
  const seen = new Set();
  const typeCounts = new Map();
  const excludedTypeCounts = new Map();
  const statusCounts = new Map();
  let inputRows = 0;
  let acceptedRows = 0;
  let excludedAliases = 0;
  let excludedUnapproved = 0;
  let writersClosed = false;
  let promotedReleaseDirectory = null;
  try {
    sourceWriter = await openJsonlWriter(stagingDirectory, "source/privacy-selected-records.jsonl");
    normalizedWriter = await openJsonlWriter(stagingDirectory, "normalized/organizations.jsonl");
    for await (const source of sourceRows(realSource)) {
      signal?.throwIfAborted?.();
      inputRows += 1;
      const entityNumber = textValue(source.ENTITYNUMBER);
      if (!entityNumber) throw new Error("Alaska Corporations source row is missing ENTITYNUMBER.");
      if (seen.has(entityNumber)) throw new Error(`Duplicate Alaska Corporations ENTITYNUMBER ${entityNumber}.`);
      seen.add(entityNumber);
      const disposition = typeDisposition(source.CORPTYPE);
      if (disposition !== "accepted-legal-entity") {
        increment(excludedTypeCounts, textValue(source.CORPTYPE) ?? "(blank)");
        if (disposition === "excluded-name-registration-alias") excludedAliases += 1;
        else excludedUnapproved += 1;
        continue;
      }
      const selected = selectedSourceRecord(source);
      const normalized = normalizedOrganization(selected, context);
      await writeJsonlRecord(sourceWriter, selected);
      await writeJsonlRecord(normalizedWriter, normalized);
      acceptedRows += 1;
      increment(typeCounts, selected.corporation_type);
      increment(statusCounts, selected.status);
    }
    if (inputRows < 1) throw new Error("Alaska Corporations offline source contains no data rows.");
    if (acceptedRows < 1) throw new Error("Alaska Corporations offline source contains no allowlisted legal entities.");
    signal?.throwIfAborted?.();
    const sourceArtifact = await closeJsonlWriter(sourceWriter, "ak-corporations-privacy-selected-source-jsonl", "internal");
    const normalizedArtifact = await closeJsonlWriter(normalizedWriter, "normalized-ak-corporation-organization-jsonl", "local-review-only");
    writersClosed = true;
    const endingDigest = await hashFile(realSource);
    if (endingDigest.bytes > AK_CORPORATIONS_MAX_SOURCE_BYTES || endingDigest.sha256 !== inputDigest.sha256 || endingDigest.bytes !== inputDigest.bytes) {
      throw new Error("Alaska Corporations offline source changed while it was being processed.");
    }
    const summary = {
      input_rows: inputRows,
      accepted_legal_entity_rows: acceptedRows,
      excluded_name_registration_alias_rows: excludedAliases,
      excluded_unapproved_corporation_type_rows: excludedUnapproved,
      accepted_corporation_types: sortedCounts(typeCounts),
      excluded_corporation_types: sortedCounts(excludedTypeCounts),
      exact_source_status_values: sortedCounts(statusCounts),
    };
    const summaryArtifact = await writeArtifact(stagingDirectory, "source/summary.json", json(summary), {
      artifact_type: "ak-corporations-source-summary-json",
      export_policy: "internal",
      record_count: 1,
    });
    const artifacts = [sourceArtifact, normalizedArtifact, summaryArtifact];
    const manifest = {
      dataset_id: AK_CORPORATIONS_CONNECTOR_ID,
      schema_version: AK_CORPORATIONS_SCHEMA_VERSION,
      release_id: releaseId,
      source_release_id: sourceReleaseId,
      run_id: runId,
      status: "verified-local-review-only",
      created_at: createdAt,
      observed_at: createdAt,
      built_at: createdAt,
      source_observed_at: null,
      connector: { id: AK_CORPORATIONS_CONNECTOR_ID, version: AK_CORPORATIONS_CONNECTOR_VERSION, transformation_version: AK_CORPORATIONS_TRANSFORMATION_VERSION },
      source: {
        publisher: "State of Alaska Department of Commerce, Community, and Economic Development, Division of Corporations, Business and Professional Licensing",
        url: AK_CORPORATIONS_URL,
        filename: AK_CORPORATIONS_FILENAME,
        acquisition: "operator-supplied-offline-csv-fixture",
        complete_official_snapshot_asserted: false,
        input_bytes: inputDigest.bytes,
        input_sha256: inputDigest.sha256,
        schema_headers: AK_CORPORATIONS_HEADERS,
        schema_fingerprint: AK_CORPORATIONS_SCHEMA_FINGERPRINT,
        publisher_checksum_available: false,
      },
      coverage: {
        input_rows: inputRows,
        legal_entity_organizations: acceptedRows,
        excluded_name_registration_alias_rows: excludedAliases,
        excluded_unapproved_corporation_type_rows: excludedUnapproved,
        physical_sites: 0,
        establishments: 0,
        geometries: 0,
        geocodes: 0,
        operating_status_inferences: 0,
      },
      policy: {
        policy_id: "ak-corporations",
        selected_source_distribution: "internal",
        normalized_record_distribution: "local-review-only",
        agent_and_registered_address_fields_excluded: true,
        raw_or_derived_publication_authorized: false,
      },
      admission: {
        production: false,
        national_business_registry: false,
        national_business_coverage_views: false,
        heatmap_builder: false,
      },
      publication: { checksum_verified_non_overwriting_release: true, filesystem_immutability_asserted: false, current_pointer_written: false },
      limitations: [
        "This build uses an operator-supplied fixture and does not assert a complete official snapshot.",
        "Exact source status is preserved without inferring current operation, good standing, solvency, or public access.",
        "Entity mailing and physical addresses are administrative evidence only; no site, establishment, geometry, or geocode is created.",
        "Registered agent and every registered-agent mailing and physical address field are excluded before persistence.",
        "Business Name Registration and Foreign Corporate Name Registration records are aliases, not legal entities, and are excluded.",
        "No production, registry, coverage, or Heatmap admission is authorized.",
      ],
      artifacts,
    };
    await writeArtifact(stagingDirectory, "manifest.json", json(manifest), { artifact_type: "dataset-manifest-json" });
    signal?.throwIfAborted?.();
    await verifyAkCorporations(path.join(stagingDirectory, "manifest.json"), { signal });
    const releasesDirectory = await ensurePlainDirectory(realOutputRoot, path.join(realOutputRoot, "releases"), "Alaska Corporations releases root");
    const releaseDirectory = path.join(releasesDirectory, releaseId);
    try {
      await stat(releaseDirectory);
      throw new Error(`Alaska Corporations release ${releaseId} already exists; refusing to overwrite it.`);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    await renameWithRetry(stagingDirectory, releaseDirectory);
    promotedReleaseDirectory = releaseDirectory;
    const manifestPath = path.join(releaseDirectory, "manifest.json");
    await verifyAkCorporations(manifestPath, { signal });
    logger(`Created checksum-verified non-overwriting local-review-only Alaska Corporations release ${releaseId} with ${acceptedRows} organizations and no current pointer.`);
    return { manifest, manifestPath, releaseDirectory, pointerPath: null };
  } catch (error) {
    if (!writersClosed) await abortWriters([sourceWriter, normalizedWriter]);
    const cleanupFailures = [];
    try { await rm(stagingDirectory, { recursive: true, force: true }); } catch (cleanupError) { cleanupFailures.push(cleanupError); }
    if (promotedReleaseDirectory) {
      try { await rm(promotedReleaseDirectory, { recursive: true, force: true }); } catch (cleanupError) { cleanupFailures.push(cleanupError); }
    }
    if (cleanupFailures.length) throw new AggregateError([error, ...cleanupFailures], "Alaska Corporations build failed and cleanup was incomplete.");
    throw error;
  }
}

function forbiddenSourceLeak(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(forbiddenSourceLeak);
  return Object.entries(value).some(([key, child]) => FORBIDDEN_SOURCE_FIELD.test(key) || forbiddenSourceLeak(child));
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) throw new Error(`${label} fields drifted.`);
}

export async function verifyAkCorporations(manifestPath, { signal } = {}) {
  signal?.throwIfAborted?.();
  const governedRoot = await realpath(DATAHUB_ROOT);
  const absoluteManifestPath = path.resolve(manifestPath);
  assertContained(governedRoot, absoluteManifestPath, "Alaska Corporations manifest");
  const manifestInformation = await lstat(absoluteManifestPath);
  if (!manifestInformation.isFile() || manifestInformation.isSymbolicLink() || manifestInformation.nlink !== 1) throw new Error("Alaska Corporations manifest must be a regular non-link, non-hardlinked file.");
  const realManifestPath = await realpath(absoluteManifestPath);
  assertContained(governedRoot, realManifestPath, "Alaska Corporations manifest");
  const releaseDirectory = path.dirname(realManifestPath);
  const manifest = JSON.parse(await readFile(realManifestPath, "utf8"));
  const failures = [];
  if (manifest.dataset_id !== AK_CORPORATIONS_CONNECTOR_ID
    || manifest.schema_version !== AK_CORPORATIONS_SCHEMA_VERSION
    || manifest.status !== "verified-local-review-only"
    || manifest.source?.complete_official_snapshot_asserted !== false
    || manifest.source?.schema_fingerprint !== AK_CORPORATIONS_SCHEMA_FINGERPRINT
    || JSON.stringify(manifest.source?.schema_headers) !== JSON.stringify(AK_CORPORATIONS_HEADERS)
    || manifest.policy?.selected_source_distribution !== "internal"
    || manifest.policy?.normalized_record_distribution !== "local-review-only"
    || manifest.policy?.agent_and_registered_address_fields_excluded !== true
    || manifest.policy?.raw_or_derived_publication_authorized !== false
    || manifest.publication?.checksum_verified_non_overwriting_release !== true
    || manifest.publication?.filesystem_immutability_asserted !== false
    || manifest.publication?.current_pointer_written !== false
    || Object.values(manifest.admission ?? {}).some((value) => value !== false)
    || manifest.coverage?.physical_sites !== 0
    || manifest.coverage?.establishments !== 0
    || manifest.coverage?.geometries !== 0
    || manifest.coverage?.geocodes !== 0
    || manifest.coverage?.operating_status_inferences !== 0) {
    failures.push({ path: "manifest.json", reason: "identity, schema, privacy, zero-site, publication, or admission boundary is invalid" });
  }
  try {
    exactKeys(manifest.admission, ["production", "national_business_registry", "national_business_coverage_views", "heatmap_builder"], "manifest admission");
    exactKeys(manifest.publication, ["checksum_verified_non_overwriting_release", "filesystem_immutability_asserted", "current_pointer_written"], "manifest publication");
    if (manifest.built_at !== manifest.created_at || manifest.source_observed_at !== null || manifest.source?.acquisition !== "operator-supplied-offline-csv-fixture" || manifest.source?.publisher_checksum_available !== false) {
      throw new Error("build/source observation metadata is invalid");
    }
  } catch (error) {
    failures.push({ path: "manifest.json", reason: error.message });
  }
  try {
    assertUuid(manifest.run_id, "manifest run_id");
    isoInstant(manifest.created_at, "manifest created_at");
    const expectedSourceRelease = `ak-corporations-fixture-${manifest.source?.input_sha256?.slice(0, 16)}`;
    const expectedRelease = `ak-corporations-${releaseTimestamp(manifest.created_at)}-${manifest.source?.input_sha256?.slice(0, 12)}-${manifest.run_id.slice(0, 8)}`;
    if (!/^[a-f0-9]{64}$/.test(manifest.source?.input_sha256 ?? "")
      || manifest.source_release_id !== expectedSourceRelease
      || manifest.release_id !== expectedRelease) throw new Error("source or release identity is not bound to the acknowledged input hash and run");
  } catch (error) {
    failures.push({ path: "manifest.json", reason: error.message });
  }
  const expectedTypes = new Set([
    "ak-corporations-privacy-selected-source-jsonl",
    "normalized-ak-corporation-organization-jsonl",
    "ak-corporations-source-summary-json",
  ]);
  const artifacts = manifest.artifacts ?? [];
  const byType = new Map();
  const artifactPaths = new Set();
  for (const artifact of artifacts) {
    signal?.throwIfAborted?.();
    try {
      if (!expectedTypes.has(artifact.artifact_type)) throw new Error("unexpected artifact type");
      if (byType.has(artifact.artifact_type)) throw new Error("duplicate artifact type");
      if (artifactPaths.has(artifact.path)) throw new Error("duplicate artifact path");
      artifactPaths.add(artifact.path);
      const filename = path.resolve(releaseDirectory, artifact.path);
      assertContained(releaseDirectory, filename, `Artifact ${artifact.path}`);
      const information = await lstat(filename);
      if (!information.isFile() || information.isSymbolicLink() || information.nlink !== 1) throw new Error("artifact must be a regular non-link, non-hardlinked file");
      const realFilename = await realpath(filename);
      assertContained(releaseDirectory, realFilename, `Artifact ${artifact.path}`);
      const digest = await hashFile(realFilename);
      if (digest.bytes !== artifact.bytes || digest.sha256 !== artifact.sha256) throw new Error("checksum or byte count mismatch");
      byType.set(artifact.artifact_type, { artifact, filename: realFilename });
    } catch (error) {
      failures.push({ path: artifact.path ?? "manifest.json", reason: error.message });
    }
  }
  if (artifacts.length !== expectedTypes.size || byType.size !== expectedTypes.size) failures.push({ path: "manifest.json", reason: "artifact inventory does not match the exact contract" });
  const selectedEntry = byType.get("ak-corporations-privacy-selected-source-jsonl");
  const selectedById = new Map();
  let selectedCount = 0;
  if (selectedEntry) {
    try {
      if (selectedEntry.artifact.export_policy !== "internal") throw new Error("selected source artifact is not internal");
      for await (const record of jsonLines(selectedEntry.filename)) {
        signal?.throwIfAborted?.();
        assertExactSelectedRow(record);
        if (forbiddenSourceLeak(record) || hasForbiddenDerivedKey(record)) throw new Error("agent, registered-address, person, site, geometry, or Heatmap field leaked");
        if (typeDisposition(record.corporation_type) !== "accepted-legal-entity") throw new Error("non-legal entity type was persisted");
        if (!record.entity_number || selectedById.has(record.entity_number)) throw new Error(`duplicate or missing ENTITYNUMBER ${record.entity_number}`);
        selectedById.set(record.entity_number, record);
        selectedCount += 1;
      }
      if (selectedCount !== selectedEntry.artifact.record_count || selectedCount !== manifest.coverage?.legal_entity_organizations) throw new Error("selected source count mismatch");
    } catch (error) {
      failures.push({ path: selectedEntry.artifact.path, reason: error.message });
    }
  }
  const normalizedEntry = byType.get("normalized-ak-corporation-organization-jsonl");
  let normalizedCount = 0;
  const normalizedIds = new Set();
  if (normalizedEntry) {
    try {
      if (normalizedEntry.artifact.export_policy !== "local-review-only") throw new Error("normalized artifact lost local-review-only policy");
      for await (const record of jsonLines(normalizedEntry.filename)) {
        signal?.throwIfAborted?.();
        exactKeys(record, ["schema_version", "normalized_record_id", "entity_candidate", "external_identifiers", "names", "registration", "administrative_addresses", "observed_at", "provenance", "privacy", "export_policy"], "normalized organization");
        if (forbiddenSourceLeak(record) || hasForbiddenDerivedKey(record)) throw new Error("normalized person, site, geometry, or Heatmap field leaked");
        assertNormalizedUsPostalFieldsDeep(record, "Alaska corporation organization");
        const entityNumber = record.external_identifiers?.find(({ type }) => type === "alaska_corporation_entity_number")?.value;
        if (!entityNumber || normalizedIds.has(entityNumber) || !selectedById.has(entityNumber)) throw new Error(`duplicate, missing, or orphan normalized ENTITYNUMBER ${entityNumber}`);
        normalizedIds.add(entityNumber);
        const expected = normalizedOrganization(selectedById.get(entityNumber), {
          observedAt: manifest.observed_at,
          sourceReleaseId: manifest.source_release_id,
          runId: manifest.run_id,
        });
        if (JSON.stringify(record) !== JSON.stringify(expected)) throw new Error(`normalized organization ${entityNumber} does not reproduce from selected source`);
        normalizedCount += 1;
      }
      if (normalizedCount !== normalizedEntry.artifact.record_count || normalizedCount !== selectedCount) throw new Error("normalized count mismatch");
    } catch (error) {
      failures.push({ path: normalizedEntry.artifact.path, reason: error.message });
    }
  }
  const summaryEntry = byType.get("ak-corporations-source-summary-json");
  if (summaryEntry) {
    try {
      if (summaryEntry.artifact.export_policy !== "internal" || summaryEntry.artifact.record_count !== 1) throw new Error("summary artifact policy or count is invalid");
      const summary = JSON.parse(await readFile(summaryEntry.filename, "utf8"));
      if (summary.input_rows !== manifest.coverage?.input_rows
        || summary.accepted_legal_entity_rows !== selectedCount
        || summary.excluded_name_registration_alias_rows !== manifest.coverage?.excluded_name_registration_alias_rows
        || summary.excluded_unapproved_corporation_type_rows !== manifest.coverage?.excluded_unapproved_corporation_type_rows) {
        throw new Error("summary counts do not reconcile");
      }
    } catch (error) {
      failures.push({ path: summaryEntry.artifact.path, reason: error.message });
    }
  }
  if (selectedCount !== normalizedCount || normalizedIds.size !== selectedById.size) failures.push({ path: "manifest.json", reason: "selected and normalized identities do not reconcile" });
  if (failures.length) {
    const error = new Error(`Alaska Corporations release verification failed for ${failures.length} check(s).`);
    error.failures = failures;
    throw error;
  }
  return {
    dataset_id: manifest.dataset_id,
    release_id: manifest.release_id,
    source_release_id: manifest.source_release_id,
    organization_count: normalizedCount,
    artifact_count: artifacts.length,
  };
}
