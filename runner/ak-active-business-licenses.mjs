import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { lstat, mkdir, open, readFile, readdir, realpath, rename, rm, statfs, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { setImmediate as yieldTurn, setTimeout as delay } from "node:timers/promises";
import { createGunzip, createGzip } from "node:zlib";
import { parse } from "csv-parse";
import { assertNormalizedUsPostalFieldsDeep } from "./normalized-us-postal-code.mjs";
import { APP_ROOT, assertInsideApp } from "./paths.mjs";

export const AK_BUSINESS_LICENSE_SCHEMA_VERSION = "1.0.0";
export const AK_BUSINESS_LICENSE_TRANSFORMATION_VERSION = "ak-active-business-licenses@1.0.1";
export function validateAkAcquisitionConfiguration(connector, policy) {
  if (sha256(JSON.stringify(connector)) !== "c5930d1fe5c8d40bc0c4f3eb41b8f5634776f0d3c796cde6b53bfe9301ff8043"
    || sha256(JSON.stringify(policy)) !== "e5444e478e878f49c1f71f12dfefdfc1ed873e7af0b48a692108d488f2b50d38") throw new Error("Alaska acquisition configuration drift requires review.");
}
export function assertAkAcquisitionDiskSpace(availableBytes) {
  if (typeof availableBytes !== "bigint" || availableBytes < 500_000_000n) throw new Error("Alaska acquisition requires at least 500 MB available disk space.");
}
export const AK_BUSINESS_LICENSE_URL = "https://www.commerce.alaska.gov/cbp/main/DbDownload/BusinessLicenseDownload";
export const AK_BUSINESS_NAICS_URL = "https://www.commerce.alaska.gov/cbp/main/DbDownload/NaicsDownload";
export const AK_BUSINESS_LICENSE_PAGE_URL = "https://www.commerce.alaska.gov/cbp/main/";
export const AK_BUSINESS_TERMS_URL = "https://www.commerce.alaska.gov/web/TermsofUsePolicy.aspx";

export const AK_BUSINESS_LICENSE_HEADERS = Object.freeze([
  "Owners", "LicenseNumber", "BusinessName", "Status", "IssueDate", "RenewDate", "ExpireDate", "HasTelemedicine",
  "PhysicalCity", "PhysicalCountry", "PhysicalLine1", "PhysicalLine2", "PhysicalState", "PhysicalZip", "PhysicalZipPlus",
  "MailingCity", "MailingCountry", "MailingLine1", "MailingLine2", "MailingState", "MailingZip", "MailingZipPlus",
]);
export const AK_BUSINESS_NAICS_HEADERS = Object.freeze(["Lob", "NaicsCode", "NaicsDescription", "LicenseNumber", "BusinessName"]);
export const AK_BUSINESS_LICENSE_SCHEMA_FINGERPRINT = "b901b47dfacce7ffab7807a9baaaca72b013ec8fd4b347a1716911832995d103";
export const AK_BUSINESS_NAICS_SCHEMA_FINGERPRINT = "7a6aa6eba6c7c774db8c99801ed2c01ba9c1d145cbf05cc59461c48c00eb0dd2";

const SELECTED_LICENSE_FIELDS = Object.freeze([
  "license_number", "business_name", "status", "issue_date", "renew_date", "expire_date", "has_telemedicine",
  "physical_city", "physical_country", "physical_line_1", "physical_unit", "physical_line_2_disposition", "physical_state",
  "physical_zip", "physical_zip_plus",
]);
const SELECTED_NAICS_FIELDS = Object.freeze(["license_number", "line_of_business_source", "naics_code_source", "naics_description_source"]);
const US_STATE_AND_TERRITORY_CODES = new Set([
  "AL", "AK", "AS", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "GU", "HI", "ID", "IL", "IN", "IA", "KS", "KY",
  "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "MP", "OH", "OK",
  "OR", "PA", "PR", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "VI", "WA", "WV", "WI", "WY",
]);
const QUARANTINE_REASONS = new Set([
  "missing-core-identity",
  "invalid-issue-date",
  "invalid-renew-date",
  "invalid-expire-date",
  "missing-expire-date",
  "active-row-expired-before-retrieval",
  "invalid-telemedicine-indicator",
]);
const UNIT_PATTERN = /^(?:(?:APT|APARTMENT|STE|SUITE|UNIT|BLDG|BUILDING|FL|FLOOR|RM|ROOM|HANGAR|LOT|SPACE)\b|#\s*\S)/i;
const PO_BOX_PATTERN = /^P(?:OST(?:AL)?)?\.?\s*O(?:FFICE)?\.?\s+BOX\b/i;
const PHONE_LIKE_PATTERN = /(?:[0-9][^A-Za-z]*){7,}/;

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
    signal?.throwIfAborted();
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

function isoInstant(value, label) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} is not a valid timestamp.`);
  return date.toISOString();
}

export function headerFingerprint(headers) {
  return sha256((headers ?? []).join("\u0000"));
}

function validateHeaders(headers, expected, fingerprint, label) {
  const actual = headerFingerprint(headers);
  if (actual !== fingerprint || headers.length !== expected.length || headers.some((header, index) => header !== expected[index])) {
    throw new Error(`Alaska ${label} schema changed (${actual}).`);
  }
  return actual;
}

function validateSourceFields(record, expected, label) {
  const allowed = new Set(expected);
  for (const field of Object.keys(record ?? {})) if (!allowed.has(field)) throw new Error(`Unexpected Alaska ${label} source field ${field}.`);
}

function dateValue(value, label, { required = false } = {}) {
  const raw = textValue(value);
  if (!raw) {
    if (required) throw new Error(`missing-${label}`);
    return null;
  }
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}):(\d{2})\s+(AM|PM))?$/i);
  if (!match) throw new Error(`invalid-${label}`);
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1900 || year > 2200 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`invalid-${label}`);
  }
  if (match[4] && (Number(match[4]) < 1 || Number(match[4]) > 12 || Number(match[5]) > 59 || Number(match[6]) > 59)) {
    throw new Error(`invalid-${label}`);
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function telemedicineValue(value) {
  const raw = textValue(value)?.toUpperCase() ?? null;
  if (raw === "YES") return true;
  if (raw === "NO") return false;
  if (raw === null) return null;
  throw new Error("invalid-telemedicine-indicator");
}

function physicalUnit(value) {
  const raw = textValue(value);
  if (!raw) return { physical_unit: null, physical_line_2_disposition: "blank" };
  if (raw.length <= 100 && UNIT_PATTERN.test(raw) && !raw.includes("@") && !PHONE_LIKE_PATTERN.test(raw)) {
    return { physical_unit: raw, physical_line_2_disposition: "safe-unit-retained" };
  }
  return { physical_unit: null, physical_line_2_disposition: "excluded-contact-or-unstructured-value" };
}

function selectedLicenseRecord(source) {
  validateSourceFields(source, AK_BUSINESS_LICENSE_HEADERS, "license");
  return {
    license_number: textValue(source.LicenseNumber),
    business_name: textValue(source.BusinessName),
    status: textValue(source.Status),
    issue_date: textValue(source.IssueDate),
    renew_date: textValue(source.RenewDate),
    expire_date: textValue(source.ExpireDate),
    has_telemedicine: textValue(source.HasTelemedicine),
    physical_city: textValue(source.PhysicalCity),
    physical_country: textValue(source.PhysicalCountry),
    physical_line_1: textValue(source.PhysicalLine1),
    ...physicalUnit(source.PhysicalLine2),
    physical_state: textValue(source.PhysicalState),
    physical_zip: textValue(source.PhysicalZip),
    physical_zip_plus: textValue(source.PhysicalZipPlus),
  };
}

function selectedNaicsRecord(source) {
  validateSourceFields(source, AK_BUSINESS_NAICS_HEADERS, "NAICS");
  return {
    license_number: textValue(source.LicenseNumber),
    line_of_business_source: textValue(source.Lob),
    naics_code_source: textValue(source.NaicsCode),
    naics_description_source: textValue(source.NaicsDescription),
  };
}

function postalCode(zipValue, plusValue) {
  const sourceZip = textValue(zipValue);
  const sourcePlus = textValue(plusValue);
  if (!/^[0-9]{5}$/.test(sourceZip ?? "") || sourceZip === "00000") {
    return { source_zip: sourceZip, source_zip_plus: sourcePlus, zip_code: null, zip4: null, postal_code: null, status: "invalid-or-non-us-postal-code" };
  }
  if (sourcePlus !== null && !/^[0-9]{4}$/.test(sourcePlus)) {
    return { source_zip: sourceZip, source_zip_plus: sourcePlus, zip_code: sourceZip, zip4: null, postal_code: sourceZip, status: "valid-zip5-invalid-extension-excluded" };
  }
  return {
    source_zip: sourceZip,
    source_zip_plus: sourcePlus,
    zip_code: sourceZip,
    zip4: sourcePlus,
    postal_code: sourceZip,
    status: sourcePlus ? "valid-zip5-plus4-source-reported" : "valid-zip5-source-reported",
  };
}

function geography(zipCode, baselineByZip) {
  if (!zipCode) return { zip_code: null, zcta_match_status: "not-evaluated-without-valid-us-zip", zcta_geo_id: null, zcta_geoid: null, zcta_geometry_file: null };
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

function normalizeNaicsRows(rows) {
  const byCode = new Map();
  for (const row of rows ?? []) {
    const codeMatch = textValue(row.naics_code_source)?.match(/^([0-9]{6})\s*-\s*(.+)$/);
    const sectorMatch = textValue(row.line_of_business_source)?.match(/^([0-9]{2}(?:-[0-9]{2})?)\s*-\s*(.+)$/);
    if (!codeMatch || !sectorMatch || !textValue(row.naics_description_source)) throw new Error("invalid-naics-source-row");
    const normalized = {
      naics_code: codeMatch[1],
      naics_description: textValue(row.naics_description_source),
      source_naics_label: textValue(row.naics_code_source),
      source_sector_code: sectorMatch[1],
      source_sector_description: sectorMatch[2].trim(),
      source_line_of_business: textValue(row.line_of_business_source),
      semantics: "source-reported-naics-not-independently-validated",
    };
    const existing = byCode.get(normalized.naics_code);
    if (existing && JSON.stringify(existing) !== JSON.stringify(normalized)) throw new Error("conflicting-duplicate-naics-pair");
    byCode.set(normalized.naics_code, normalized);
  }
  return [...byCode.values()].sort((left, right) => left.naics_code.localeCompare(right.naics_code));
}

function siteInference(address) {
  if (address.country_source?.toUpperCase() !== "UNITED STATES") return { eligible: false, reason: "non-us-reported-physical-address" };
  if (!US_STATE_AND_TERRITORY_CODES.has(address.state ?? "")) return { eligible: false, reason: "invalid-or-non-us-state" };
  if (!address.street || !address.city) return { eligible: false, reason: "incomplete-reported-physical-address" };
  if (PO_BOX_PATTERN.test(address.street)) return { eligible: false, reason: "nonphysical-post-office-box" };
  if (!address.zip_code) return { eligible: false, reason: "invalid-or-non-us-postal-code" };
  return { eligible: true, reason: "complete-source-reported-us-physical-address" };
}

function provenance(context, licenseNumber) {
  return {
    source_id: "alaska-dcced-active-business-licenses",
    source_release_id: context.sourceReleaseId,
    source_record_id: licenseNumber,
    ingest_run_id: context.runId,
    transformation_version: AK_BUSINESS_LICENSE_TRANSFORMATION_VERSION,
    policy_id: "ak-active-business-licenses",
  };
}

export function normalizeAkBusinessLicense(source, naicsRows, context) {
  const licenseNumber = textValue(source.license_number);
  const businessName = textValue(source.business_name);
  if (!/^[1-9][0-9]{0,9}$/.test(licenseNumber ?? "") || !businessName) throw new Error("missing-core-identity");
  if (source.status !== "Active") throw new Error("source-filter-drift-non-active-row");
  const issueDate = dateValue(source.issue_date, "issue-date");
  const renewDate = dateValue(source.renew_date, "renew-date");
  const expireDate = dateValue(source.expire_date, "expire-date", { required: true });
  if (expireDate < context.retrievedAt.slice(0, 10)) throw new Error("active-row-expired-before-retrieval");
  const postal = postalCode(source.physical_zip, source.physical_zip_plus);
  const state = textValue(source.physical_state)?.toUpperCase() ?? null;
  const address = {
    street: textValue(source.physical_line_1),
    unit: textValue(source.physical_unit),
    city: textValue(source.physical_city),
    state,
    postal_code: postal.postal_code,
    zip_code: postal.zip_code,
    zip4: postal.zip4,
    country_source: textValue(source.physical_country),
    country: textValue(source.physical_country)?.toUpperCase() === "UNITED STATES" ? "US" : null,
    postal_code_status: postal.status,
    source_scope: "dcced-license-reported-single-physical-address-not-complete-location-inventory",
    independently_verified: false,
  };
  const inference = siteInference(address);
  address.site_inference_eligible = inference.eligible;
  address.site_inference_reason = inference.reason;
  const organizationId = `organization:ak_dcced_business_license_${licenseNumber}`;
  const entityCandidates = { organization_id: organizationId, identity_status: "provisional" };
  if (inference.eligible) {
    entityCandidates.physical_site_id = `site:ak_dcced_business_license_${licenseNumber}`;
    entityCandidates.establishment_id = `establishment:ak_dcced_business_license_${licenseNumber}`;
  }
  const classifications = normalizeNaicsRows(naicsRows);
  return {
    schema_version: AK_BUSINESS_LICENSE_SCHEMA_VERSION,
    normalized_record_id: `ak-active-business-license:${licenseNumber}`,
    entity_candidates: entityCandidates,
    external_identifiers: [{ type: "alaska_business_license_number", value: licenseNumber, source_field: "LicenseNumber" }],
    business_name: businessName,
    physical_address: address,
    geography: geography(address.country === "US" ? postal.zip_code : null, context.baselineByZip),
    license_profile: {
      license_number: licenseNumber,
      issue_date: issueDate,
      renew_date: renewDate,
      expire_date: expireDate,
      has_telemedicine: telemedicineValue(source.has_telemedicine),
      naics_classifications: classifications,
      source_naics_row_count: naicsRows?.length ?? 0,
      distinct_naics_count: classifications.length,
    },
    source_status: {
      value: "active-in-alaska-business-license-download-as-of-retrieval",
      status: "Active (source-defined)",
      semantics: "active-alaska-business-license-required-for-the-privilege-of-engaging-in-business-not-independent-proof-of-continuous-operation-location-or-service-quality",
      valid_from: renewDate ?? issueDate,
      valid_to: expireDate,
      source_observed_from: context.sourceObservedFrom,
      source_observed_through: context.sourceObservedThrough,
    },
    physical_line_2_disposition: source.physical_line_2_disposition,
    privacy: {
      classification: "possible-natural-person-name-or-residential-business-location",
      owner_fields_excluded: true,
      mailing_fields_excluded: true,
      contact_contaminated_physical_line_2_excluded_unless_safe_unit: true,
      record_level_distribution: "local-review-only",
    },
    observed_at: context.retrievedAt,
    provenance: provenance(context, licenseNumber),
    export_policy: "local-review-only",
  };
}

function assertAllowedUrl(urlValue, type) {
  const url = new URL(urlValue);
  const expectedPath = type === "licenses" ? "/cbp/main/DbDownload/BusinessLicenseDownload" : "/cbp/main/DbDownload/NaicsDownload";
  if (url.protocol !== "https:" || url.hostname !== "www.commerce.alaska.gov" || url.pathname !== expectedPath
    || url.username || url.password || url.hash || [...url.searchParams].length) throw new Error(`Alaska ${type} URL is not allowed.`);
  return url;
}

function retryDelay(response, attempt, now) {
  const fallback = Math.min(500 * (2 ** attempt), 8_000);
  const header = response?.headers?.get?.("retry-after")?.trim();
  if (!header) return fallback;
  let milliseconds;
  if (/^\d+$/.test(header)) milliseconds = Number(header) * 1000;
  else {
    // Date.parse alone also accepts strings such as "-1" as dates.
    if (!/[a-z]/i.test(header)) return fallback;
    const timestamp = Date.parse(header);
    if (!Number.isFinite(timestamp)) return fallback;
    const clock = now().getTime();
    if (!Number.isFinite(clock)) throw new Error("Alaska retry clock is invalid.");
    milliseconds = Math.max(0, timestamp - clock);
  }
  // Never shorten a publisher delay or let timer overflow cause an early retry.
  if (!Number.isFinite(milliseconds) || milliseconds > 86_400_000) {
    throw Object.assign(new Error("Alaska publisher requested a retry beyond the one-day wait budget; defer this acquisition."), { code: "AK_RETRY_DEFERRED" });
  }
  return Math.max(fallback, milliseconds);
}

function akTransportRace(work, signal) {
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

export async function requestAkCsv(urlValue, {
  type = "licenses",
  fetchImpl = fetch,
  signal,
  sleep = (milliseconds, options) => delay(milliseconds, undefined, options),
  attempts = 4,
  maximumResponseBytes = 50_000_000,
  requestTimeoutMs = 60_000,
  now = () => new Date(),
} = {}) {
  const url = assertAllowedUrl(urlValue, type);
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 10) throw new Error("Alaska attempts must be an integer from 1 through 10.");
  if (!Number.isSafeInteger(maximumResponseBytes) || maximumResponseBytes < 1) throw new Error("Alaska maximumResponseBytes must be a positive safe integer.");
  if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 1 || requestTimeoutMs > 300_000) throw new Error("Alaska requestTimeoutMs must be from 1 through 300000.");
  const expectedFilename = type === "licenses" ? "BusinessLicenseDownload.csv" : "NaicsDownload.csv";
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    signal?.throwIfAborted?.();
    const controller = new AbortController();
    const deadline = performance.now() + requestTimeoutMs;
    const abort = () => controller.abort(signal.reason);
    signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => controller.abort(Object.assign(new Error("Alaska source request deadline exceeded."), { code: "AK_REQUEST_TIMEOUT" })), requestTimeoutMs);
    const dispose = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); };
    let response;
    try {
      const pending = Promise.resolve().then(() => { controller.signal.throwIfAborted(); return fetchImpl(url, { redirect: "manual", signal: controller.signal, headers: { accept: "text/csv" } }); });
      void pending.then((late) => { if (controller.signal.aborted) void late.body?.cancel().catch(() => {}); }, () => {});
      response = await akTransportRace(() => pending, controller.signal);
      if (performance.now() >= deadline) controller.abort(Object.assign(new Error("Alaska source request deadline exceeded."), { code: "AK_REQUEST_TIMEOUT" }));
      controller.signal.throwIfAborted();
    } catch {
      dispose();
      void response?.body?.cancel().catch(() => {});
      signal?.throwIfAborted?.();
      if (attempt + 1 >= attempts) throw controller.signal.aborted ? controller.signal.reason : new Error("Alaska source transport failed.");
      await akTransportRace(() => sleep(Math.min(500 * (2 ** attempt), 8_000), { signal }), signal).catch(() => { signal?.throwIfAborted(); throw new Error("Alaska retry wait failed."); });
      continue;
    }
    try {
      if (response.status >= 300 && response.status < 400) throw new Error("Alaska source redirect rejected.");
      if (response.status === 429 || response.status >= 500) {
        dispose();
        void response.body?.cancel().catch(() => {});
        signal?.throwIfAborted?.();
        if (attempt + 1 >= attempts) throw new Error(`Alaska source request failed with HTTP ${response.status}.`);
        await akTransportRace(() => sleep(retryDelay(response, attempt, now), { signal }), signal);
        continue;
      }
      if (!response.ok) throw new Error(`Alaska source request failed with HTTP ${response.status}.`);
      if (!String(response.headers.get("content-type") ?? "").toLowerCase().startsWith("text/csv")) throw new Error("Alaska source response is not CSV.");
      const disposition = String(response.headers.get("content-disposition") ?? "");
      if (!disposition.toLowerCase().includes(`filename=${expectedFilename.toLowerCase()}`)) throw new Error(`Alaska source response filename is not ${expectedFilename}.`);
      const declaredBytes = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredBytes) && declaredBytes > maximumResponseBytes) throw new Error("Alaska source response exceeds the configured byte limit.");
      const dateHeader = response.headers.get("date");
      const observedAt = dateHeader ? isoInstant(dateHeader, "Alaska source Date header") : now().toISOString();
      response = boundedCsvResponse(response, controller.signal, maximumResponseBytes, dispose, deadline);
      return { response, observedAt, expectedFilename, maximumResponseBytes };
    } catch (error) {
      dispose();
      void response.body?.cancel().catch(() => {});
      signal?.throwIfAborted();
      if (error.code === "AK_RETRY_DEFERRED") throw Object.assign(new Error("Alaska publisher requested a retry beyond the one-day wait budget; defer this acquisition."), { code: "AK_RETRY_DEFERRED" });
      if (/^Alaska source (redirect rejected\.|response is not CSV\.|response filename is not (BusinessLicenseDownload|NaicsDownload)\.csv\.|response exceeds the configured byte limit\.|response body is missing\.|request failed with HTTP \d{3}\.)$/.test(error.message)) throw error;
      throw new Error("Alaska source response or retry wait failed.");
    }
  }
  throw new Error("Alaska source request exhausted retries.");
}

// Retain the request deadline through body consumption, including a stalled read.
// A partial body is never retried inside this stream: callers must fail the run.
function boundedCsvResponse(response, signal, maximumBytes, dispose, deadline) {
  if (!response.body) throw new Error("Alaska source response body is missing.");
  const reader = response.body.getReader();
  let bytes = 0, settled = false;
  const cleanup = () => { dispose(); signal.removeEventListener("abort", abort); };
  let streamController;
  const fail = (error) => {
    if (settled) return;
    settled = true;
    cleanup();
    streamController.error(error);
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  };
  const abort = () => fail(signal.reason);
  const body = new ReadableStream({
    start(value) {
      streamController = value;
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    },
    async pull(value) {
      try {
        const next = await reader.read();
        if (settled) return;
        signal.throwIfAborted();
        if (performance.now() >= deadline) throw Object.assign(new Error("Alaska source request deadline exceeded."), { code: "AK_REQUEST_TIMEOUT" });
        if (next.done) { settled = true; cleanup(); reader.releaseLock(); value.close(); return; }
        bytes += next.value.byteLength;
        if (bytes > maximumBytes) throw new Error("Alaska source response exceeds the configured byte limit.");
        value.enqueue(next.value);
      } catch (error) {
        fail(signal.aborted ? signal.reason : error.code === "AK_REQUEST_TIMEOUT" ? new Error("Alaska source request deadline exceeded.") : error.message === "Alaska source response exceeds the configured byte limit." ? new Error("Alaska source response exceeds the configured byte limit.") : new Error("Alaska source body transport failed."));
      }
    },
    cancel() {
      if (settled) return;
      settled = true;
      cleanup();
      void reader.cancel().catch(() => {});
      reader.releaseLock();
    },
  });
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
}

async function* csvResponseRows(responseInfo, expectedHeaders, fingerprint, label) {
  let headerSeen = false;
  // The response already enforces bytes/deadlines. Keep the direct adapter so
  // pipeline destruction interrupts pending body reads on parser failure.
  const source = Readable.fromWeb(responseInfo.response.body);
  const parser = parse({
    bom: true,
    columns: (headers) => {
      validateHeaders(headers, expectedHeaders, fingerprint, label);
      headerSeen = true;
      return headers;
    },
    skip_empty_lines: true,
    relax_column_count: false,
    max_record_size: 1_000_000,
  });
  const completion = pipeline(source, parser);
  void completion.catch(() => {});
  try {
    for await (const record of parser) yield record;
    await completion;
    if (!headerSeen) throw new Error(`Alaska ${label} source has no header row.`);
  } finally {
    source.destroy(); parser.destroy();
    await Promise.allSettled([completion]);
  }
}

async function openGzipWriter(stagingDirectory, relativePath, ownedWriters, signal) {
  signal?.throwIfAborted();
  const destination = path.join(stagingDirectory, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp-${randomUUID()}`;
  const output = createWriteStream(temporary, { flags: "wx" });
  const gzip = createGzip({ level: 9 });
  // The build owns one abort listener for all partition writers; avoid one
  // signal listener per partition while still coupling stream failures.
  const completion = pipeline(gzip, output);
  const writer = { relativePath: relativePath.replaceAll("\\", "/"), destination, temporary, output, gzip, records: 0, signal, completion, error: null };
  void completion.catch((error) => { writer.error = error; });
  ownedWriters.push(writer);
  return writer;
}

export async function writeGzipRecord(writer, record) {
  writer.signal?.throwIfAborted();
  const assertWritable = () => {
    if (writer.error || writer.gzip.errored || writer.output?.errored) throw writer.error ?? writer.gzip.errored ?? writer.output.errored;
    if (writer.gzip.destroyed || writer.gzip.writableEnded || writer.output?.destroyed || writer.output?.writableEnded) throw new Error("Alaska artifact writer closed unexpectedly.");
  };
  assertWritable();
  const ready = writer.gzip.write(`${JSON.stringify(record)}\n`);
  assertWritable();
  if (!ready) await once(writer.gzip, "drain", { signal: writer.signal });
  writer.records += 1;
  if (writer.records % 256 === 0) await yieldTurn(undefined, { signal: writer.signal });
}

async function closeGzipWriter(writer, artifactType, metadata = {}) {
  writer.signal?.throwIfAborted();
  writer.gzip.end();
  await writer.completion;
  writer.signal?.throwIfAborted();
  await renameWithRetry(writer.temporary, writer.destination);
  return { path: writer.relativePath, ...(await hashFile(writer.destination, writer.signal)), record_count: writer.records, artifact_type: artifactType, ...metadata };
}

async function abortGzipWriters(writers) {
  for (const writer of writers) {
    writer.gzip.destroy();
    writer.output.destroy();
  }
  await Promise.allSettled(writers.map((writer) => writer.completion));
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

async function writeArtifact(directory, relativePath, content, metadata = {}, signal) {
  signal?.throwIfAborted();
  const destination = path.join(directory, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
  const temporary = `${destination}.tmp-${randomUUID()}`;
  await writeFile(temporary, buffer, { flag: "wx", signal });
  signal?.throwIfAborted();
  await renameWithRetry(temporary, destination);
  return { path: relativePath.replaceAll("\\", "/"), bytes: buffer.length, sha256: sha256(buffer), ...metadata };
}

function assertContained(parent, child, label) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`${label} escapes its release directory.`);
}

async function loadZbpBaseline(pointerPath, signal) {
  const absolutePointer = path.resolve(pointerPath);
  const pointerRead = await publicationRead(absolutePointer, 10_000, signal);
  const pointer = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(pointerRead.bytes));
  const base = path.dirname(absolutePointer);
  if (typeof pointer.manifest !== "string" || !/^releases\/[A-Za-z0-9_-]+\/manifest\.json$/.test(pointer.manifest)) throw new Error("Invalid Census ZBP pointer manifest path.");
  const manifestPath = path.resolve(base, pointer.manifest ?? "");
  assertContained(base, manifestPath, "Census ZBP manifest");
  const manifestRead = await publicationRead(manifestPath, 1_000_000, signal), manifestBuffer = manifestRead.bytes;
  const manifest = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(manifestBuffer));
  if (manifest.dataset_id !== "census-zbp-baseline" || !manifest.complete_national_release) throw new Error("A complete Census ZBP baseline release is required.");
  if (pointer.manifest !== `releases/${manifest.release_id}/manifest.json` || pointer.release_id !== undefined && pointer.release_id !== manifest.release_id
    || pointer.dataset_id !== undefined && pointer.dataset_id !== manifest.dataset_id) throw new Error("Census ZBP pointer identity mismatch.");
  const artifacts = manifest.artifacts?.filter((candidate) => candidate.path === "derived/zip-coverage.jsonl");
  const artifact = artifacts?.length === 1 ? artifacts[0] : null;
  if (!artifact) throw new Error("Census ZBP ZIP coverage artifact is missing.");
  const artifactPath = path.resolve(path.dirname(manifestPath), artifact.path);
  assertContained(path.dirname(manifestPath), artifactPath, "Census ZBP coverage artifact");
  const coverageRead = await publicationRead(artifactPath, 100_000_000, signal);
  if (artifact.bytes !== coverageRead.bytes.length || artifact.sha256 !== sha256(coverageRead.bytes)) throw new Error("Census ZBP ZIP coverage artifact failed checksum validation.");
  const rows = [], seen = new Set();
  for (const line of new TextDecoder("utf-8", { fatal: true }).decode(coverageRead.bytes).split(/\r?\n/)) {
    signal?.throwIfAborted(); if (!line) continue;
    if (line.length > 100_000 || rows.length >= 100_000) throw new Error("Census ZBP coverage record limit.");
    const row = JSON.parse(line);
    if (!row || !/^\d{5}$/.test(row.zip_code) || typeof row.zip_code !== "string" || seen.has(row.zip_code)) throw new Error("Census ZBP coverage ZIP identity.");
    seen.add(row.zip_code); rows.push(row);
    if (rows.length % 256 === 0) await yieldTurn(undefined, { signal });
  }
  if (!rows.length) throw new Error("Census ZBP coverage is empty.");
  const latestPointer = await publicationRead(absolutePointer, 10_000, signal), latestManifest = await publicationRead(manifestPath, 1_000_000, signal);
  if (!sameFile(pointerRead.identity, latestPointer.identity) || !pointerRead.bytes.equals(latestPointer.bytes)
    || !sameFile(manifestRead.identity, latestManifest.identity) || !manifestBuffer.equals(latestManifest.bytes)) throw new Error("Census ZBP prerequisite changed during validation.");
  return { rows, byZip: new Map(rows.map((row) => [row.zip_code, row])), manifest, manifestSha256: sha256(manifestBuffer) };
}

async function* gzipRecords(filename, signal) {
  signal?.throwIfAborted();
  const input = createReadStream(filename);
  const gunzip = createGunzip();
  const completion = pipeline(input, gunzip, { signal });
  void completion.catch(() => {});
  let count = 0, decodedBytes = 0, lineBytes = 0, fragments = [];
  try {
    for await (const chunk of gunzip) {
      signal?.throwIfAborted();
      decodedBytes += chunk.length;
      if (decodedBytes > 500_000_000) throw new Error("Alaska decoded artifact exceeds 500 MB limit.");
      let offset = 0;
      while (offset < chunk.length) {
        const end = chunk.indexOf(10, offset), stop = end < 0 ? chunk.length : end;
        const fragment = chunk.subarray(offset, stop);
        lineBytes += fragment.length;
        if (lineBytes > 1_000_000) throw new Error("Alaska decoded record exceeds 1 MB limit.");
        fragments.push(fragment);
        if (end < 0) break;
        if (++count > 2_000_000) throw new Error("Alaska decoded artifact exceeds 2000000 lines.");
        if (count % 256 === 0) await yieldTurn(undefined, { signal });
        const line = Buffer.concat(fragments, lineBytes).toString("utf8").replace(/\r$/, "");
        fragments = []; lineBytes = 0;
        if (line) yield JSON.parse(line);
        offset = end + 1;
      }
    }
    if (lineBytes) {
      if (++count > 2_000_000) throw new Error("Alaska decoded artifact exceeds 2000000 lines.");
      yield JSON.parse(Buffer.concat(fragments, lineBytes).toString("utf8"));
    }
    await completion;
  } finally {
    input.destroy(); gunzip.destroy();
    await Promise.allSettled([completion]);
  }
}

async function readJsonLines(filename, signal) {
  const text = await readFile(filename, { encoding: "utf8", signal });
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    signal?.throwIfAborted();
    if (line) rows.push(JSON.parse(line));
    if (rows.length % 256 === 0) await yieldTurn(undefined, { signal });
  }
  return rows;
}

function increment(map, key, amount = 1) {
  const normalized = key ?? "(blank)";
  map.set(normalized, (map.get(normalized) ?? 0) + amount);
}

function sortedCounts(map) {
  return Object.fromEntries([...map].sort(([left], [right]) => String(left).localeCompare(String(right))));
}

function buildZipCoverage(baselineRows, organizationCounts, siteCounts, context) {
  const baselineByZip = new Map(baselineRows.map((row) => [row.zip_code, row]));
  const zips = new Set([...baselineByZip.keys(), ...organizationCounts.keys(), ...siteCounts.keys()]);
  return [...zips].sort().map((zipCode) => {
    const baseline = baselineByZip.get(zipCode);
    const organizationCount = organizationCounts.get(zipCode) ?? 0;
    const siteCount = siteCounts.get(zipCode) ?? 0;
    return {
      zip_code: zipCode,
      current_usps_validity: baseline?.current_usps_validity ?? { status: "unverified" },
      geography: baseline?.geography ?? { status: "no-2020-zcta-polygon", geo_id: null, geoid: null, geometry_file: null },
      census_zbp_coverage_status: baseline?.coverage_status ?? "outside-census-zbp-and-zcta-union",
      ak_active_business_license_snapshot: {
        status: organizationCount ? "published-active-license-reported-address-evidence" : "no-active-license-address-contribution-in-source-snapshot",
        active_license_organization_reported_address_count: organizationCount,
        provisional_physical_site_count: siteCount,
        source_release_id: context.sourceReleaseId,
        source_observed_from: context.sourceObservedFrom,
        source_observed_through: context.sourceObservedThrough,
        complete_all_businesses: false,
      },
    };
  });
}

async function fixtureRows(rows, headers, expectedHeaders, fingerprint, label) {
  validateHeaders(headers, expectedHeaders, fingerprint, label);
  return rows ?? [];
}

function observationWindow(licenseObservedAt, naicsObservedAt) {
  const license = isoInstant(licenseObservedAt, "Alaska license observation time");
  const naics = isoInstant(naicsObservedAt, "Alaska NAICS observation time");
  const difference = Math.abs(Date.parse(license) - Date.parse(naics));
  if (difference > 5 * 60 * 1000) throw new Error("Alaska source downloads exceeded the five-minute coherent observation window.");
  return { from: license < naics ? license : naics, through: license > naics ? license : naics, license, naics };
}

export async function buildAkActiveBusinessLicenses({
  outputRoot,
  zbpPointer,
  licenseRows = null,
  naicsRows = null,
  sourceMetadata = null,
  minimumLicenseRows = 80_000,
  maximumQuarantineRate = 0.01,
  minimumNaicsCoverageRate = 0.99,
  maximumResponseBytes = 50_000_000,
  requestTimeoutMs = 60_000,
  fetchImpl = globalThis.fetch,
  signal,
  sleep,
  logger = console.log,
  now = () => new Date(),
} = {}) {
  if (!outputRoot || !zbpPointer) throw new Error("outputRoot and zbpPointer are required.");
  if (!Number.isSafeInteger(maximumResponseBytes) || maximumResponseBytes < 1 || maximumResponseBytes > 50_000_000) throw new Error("Alaska maximumResponseBytes must be from 1 through 50000000.");
  if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 1 || requestTimeoutMs > 300_000) throw new Error("Alaska requestTimeoutMs must be from 1 through 300000.");
  if (!Number.isInteger(minimumLicenseRows) || minimumLicenseRows < 1) throw new Error("minimumLicenseRows must be a positive integer.");
  if (!Number.isFinite(maximumQuarantineRate) || maximumQuarantineRate < 0 || maximumQuarantineRate > 1) throw new Error("maximumQuarantineRate must be between 0 and 1.");
  if (!Number.isFinite(minimumNaicsCoverageRate) || minimumNaicsCoverageRate < 0 || minimumNaicsCoverageRate > 1) throw new Error("minimumNaicsCoverageRate must be between 0 and 1.");
  if ((licenseRows === null) !== (naicsRows === null)) throw new Error("licenseRows and naicsRows fixtures must be supplied together.");
  signal?.throwIfAborted?.();
  outputRoot = await validateAkOutputRoot(outputRoot, signal);
  const configuration = [];
  for (const filename of ["config/connectors/ak-active-business-licenses.json", "config/source-policies/ak-active-business-licenses.json"]) {
    configuration.push(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode((await publicationRead(path.join(APP_ROOT, filename), 100_000, signal)).bytes)));
  }
  validateAkAcquisitionConfiguration(...configuration);
  const baseline = await loadZbpBaseline(zbpPointer, signal);
  let diskDirectory = outputRoot;
  for (;;) {
    try { if (!(await lstat(diskDirectory)).isDirectory()) throw new Error("Alaska acquisition disk ancestor must be a directory."); break; }
    catch (error) { if (error.code !== "ENOENT" || diskDirectory === APP_ROOT) throw error; diskDirectory = path.dirname(diskDirectory); }
  }
  if (diskDirectory === APP_ROOT) publicationCheck(await realpath(APP_ROOT) === APP_ROOT, "application disk root alias");
  else await publicationPath(diskDirectory, signal);
  const disk = await statfs(diskDirectory, { bigint: true });
  assertAkAcquisitionDiskSpace(disk.bavail * disk.bsize);
  signal?.throwIfAborted();
  const retrievedAt = now().toISOString();
  const runId = randomUUID();
  const releaseId = `ak-active-business-licenses-${releaseTimestamp(retrievedAt)}-${runId.slice(0, 8)}`;
  const stagingRoot = path.resolve(outputRoot, ".staging");
  await mkdir(stagingRoot, { recursive: true });
  const stagingDirectory = path.join(stagingRoot, runId);
  if (await realpath(stagingRoot) !== stagingRoot) throw new Error("Alaska staging root must not be a filesystem alias.");
  await mkdir(stagingDirectory);
  const ownedIdentity = await lstat(stagingDirectory, { bigint: true });
  const ownedWriters = [];
  const abortOwnedWriters = () => {
    for (const writer of ownedWriters) {
      writer.gzip.destroy(signal.reason);
      writer.output.destroy(signal.reason);
    }
  };
  signal?.addEventListener("abort", abortOwnedWriters, { once: true });
  try {
  const selectedLicenseWriter = await openGzipWriter(stagingDirectory, "source/selected-active-business-licenses.jsonl.gz", ownedWriters, signal);
  const licenseIds = new Set();
  const licenseNames = new Map();
  const line2Dispositions = new Map();
  let licenseObservedAt;
  try {
    const rows = licenseRows === null
      ? null
      : await fixtureRows(licenseRows, sourceMetadata?.licenseHeaders, AK_BUSINESS_LICENSE_HEADERS, AK_BUSINESS_LICENSE_SCHEMA_FINGERPRINT, "license");
    let sourceIterable;
    if (rows) {
      licenseObservedAt = isoInstant(sourceMetadata?.licenseObservedAt, "Alaska fixture license observation time");
      sourceIterable = rows;
    } else {
      const responseInfo = await requestAkCsv(AK_BUSINESS_LICENSE_URL, { type: "licenses", fetchImpl, signal, sleep, maximumResponseBytes, requestTimeoutMs, now });
      licenseObservedAt = responseInfo.observedAt;
      sourceIterable = csvResponseRows(responseInfo, AK_BUSINESS_LICENSE_HEADERS, AK_BUSINESS_LICENSE_SCHEMA_FINGERPRINT, "license");
    }
    let count = 0;
    for await (const source of sourceIterable) {
      signal?.throwIfAborted?.();
      const selected = selectedLicenseRecord(source);
      const licenseNumber = selected.license_number;
      if (!/^[1-9][0-9]{0,9}$/.test(licenseNumber ?? "")) {
        await writeGzipRecord(selectedLicenseWriter, selected);
        count += 1;
        continue;
      }
      if (licenseIds.has(licenseNumber)) throw new Error(`Duplicate Alaska business license number ${licenseNumber}.`);
      if (selected.status !== "Active") throw new Error(`Alaska source-filter drift returned status ${selected.status ?? "blank"}.`);
      licenseIds.add(licenseNumber);
      licenseNames.set(licenseNumber, selected.business_name);
      increment(line2Dispositions, selected.physical_line_2_disposition);
      await writeGzipRecord(selectedLicenseWriter, selected);
      count += 1;
      if (count % 25_000 === 0) logger(`Acquired ${count.toLocaleString("en-US")} Alaska active business licenses.`);
    }
    if (count < minimumLicenseRows) throw new Error(`Alaska active-license row count ${count} is below the ${minimumLicenseRows} quality floor.`);
  } catch (error) {
    await abortGzipWriters([selectedLicenseWriter]);
    throw error;
  }
  const selectedLicenseArtifact = await closeGzipWriter(selectedLicenseWriter, "ak-active-business-license-selected-source-jsonl-gzip", { export_policy: "internal" });

  const selectedNaicsWriter = await openGzipWriter(stagingDirectory, "source/selected-license-naics.jsonl.gz", ownedWriters, signal);
  const classificationsByLicense = new Map();
  let naicsObservedAt;
  let duplicateNaicsRows = 0;
  let distinctNaicsPairs = 0;
  try {
    const rows = naicsRows === null
      ? null
      : await fixtureRows(naicsRows, sourceMetadata?.naicsHeaders, AK_BUSINESS_NAICS_HEADERS, AK_BUSINESS_NAICS_SCHEMA_FINGERPRINT, "NAICS");
    let sourceIterable;
    if (rows) {
      naicsObservedAt = isoInstant(sourceMetadata?.naicsObservedAt, "Alaska fixture NAICS observation time");
      sourceIterable = rows;
    } else {
      const responseInfo = await requestAkCsv(AK_BUSINESS_NAICS_URL, { type: "naics", fetchImpl, signal, sleep, maximumResponseBytes, requestTimeoutMs, now });
      naicsObservedAt = responseInfo.observedAt;
      sourceIterable = csvResponseRows(responseInfo, AK_BUSINESS_NAICS_HEADERS, AK_BUSINESS_NAICS_SCHEMA_FINGERPRINT, "NAICS");
    }
    const pairs = new Map();
    let count = 0;
    for await (const source of sourceIterable) {
      signal?.throwIfAborted?.();
      const selected = selectedNaicsRecord(source);
      const licenseNumber = selected.license_number;
      if (!licenseIds.has(licenseNumber)) throw new Error(`Alaska NAICS row references missing license ${licenseNumber ?? "blank"}.`);
      const sourceName = textValue(source.BusinessName);
      if (sourceName && licenseNames.get(licenseNumber) && sourceName.toLocaleUpperCase("en-US") !== licenseNames.get(licenseNumber).toLocaleUpperCase("en-US")) {
        throw new Error(`Alaska NAICS business name does not match license ${licenseNumber}.`);
      }
      const normalized = normalizeNaicsRows([selected])[0];
      const pairKey = `${licenseNumber}\u0000${normalized.naics_code}`;
      const previous = pairs.get(pairKey);
      if (previous) {
        if (JSON.stringify(previous) !== JSON.stringify(selected)) throw new Error(`Alaska duplicate NAICS pair conflicts for license ${licenseNumber}.`);
        duplicateNaicsRows += 1;
      } else {
        pairs.set(pairKey, selected);
        distinctNaicsPairs += 1;
      }
      if (!classificationsByLicense.has(licenseNumber)) classificationsByLicense.set(licenseNumber, []);
      classificationsByLicense.get(licenseNumber).push(selected);
      await writeGzipRecord(selectedNaicsWriter, selected);
      count += 1;
      if (count % 50_000 === 0) logger(`Acquired ${count.toLocaleString("en-US")} Alaska license NAICS rows.`);
    }
  } catch (error) {
    await abortGzipWriters([selectedNaicsWriter]);
    throw error;
  }
  const selectedNaicsArtifact = await closeGzipWriter(selectedNaicsWriter, "ak-active-business-license-naics-selected-source-jsonl-gzip", { export_policy: "internal" });
  logger("Acquired Alaska license and NAICS source artifacts.");
  signal?.throwIfAborted();
  const window = observationWindow(licenseObservedAt, naicsObservedAt);
  const naicsCoverageRate = licenseIds.size ? classificationsByLicense.size / licenseIds.size : 0;
  if (naicsCoverageRate < minimumNaicsCoverageRate) throw new Error(`Alaska NAICS coverage rate ${naicsCoverageRate} is below ${minimumNaicsCoverageRate}.`);
  const sourceReleaseDigest = sha256(`${window.from}\u0000${window.through}\u0000${selectedLicenseArtifact.sha256}\u0000${selectedNaicsArtifact.sha256}`);
  const sourceReleaseId = `ak-active-business-licenses-${window.through.slice(0, 10)}-${sourceReleaseDigest.slice(0, 16)}`;
  const context = {
    runId,
    retrievedAt,
    sourceObservedFrom: window.from,
    sourceObservedThrough: window.through,
    sourceReleaseId,
    baselineByZip: baseline.byZip,
  };
  const writers = new Map();
  for (const prefix of "0123456789abcdef") writers.set(prefix, await openGzipWriter(stagingDirectory, `derived/licenses/id-hash-prefix=${prefix}.jsonl.gz`, ownedWriters, signal));
  const quarantineWriter = await openGzipWriter(stagingDirectory, "quality/quarantined-license-records.jsonl.gz", ownedWriters, signal);
  const organizationAddressCounts = new Map();
  const siteCounts = new Map();
  const siteIneligibilityReasons = new Map();
  const reportedStates = new Map();
  const reportedCountries = new Map();
  const naicsCodes = new Map();
  let organizations = 0;
  let physicalSites = 0;
  let organizationAddressContributions = 0;
  let acceptedNaicsPairs = 0;
  try {
    logger("Normalizing Alaska license address evidence.");
    signal?.throwIfAborted();
    for await (const source of gzipRecords(path.join(stagingDirectory, selectedLicenseArtifact.path), signal)) {
      signal?.throwIfAborted?.();
      try {
        const normalized = normalizeAkBusinessLicense(source, classificationsByLicense.get(source.license_number) ?? [], context);
        assertNormalizedUsPostalFieldsDeep(normalized);
        await writeGzipRecord(writers.get(sha256(normalized.license_profile.license_number)[0]), normalized);
        organizations += 1;
        acceptedNaicsPairs += normalized.license_profile.distinct_naics_count;
        increment(reportedStates, normalized.physical_address.state);
        increment(reportedCountries, normalized.physical_address.country_source);
        for (const classification of normalized.license_profile.naics_classifications) increment(naicsCodes, classification.naics_code);
        const addressZip = normalized.physical_address.country === "US" && US_STATE_AND_TERRITORY_CODES.has(normalized.physical_address.state ?? "")
          && normalized.physical_address.street && normalized.physical_address.city ? normalized.physical_address.zip_code : null;
        if (addressZip) {
          increment(organizationAddressCounts, addressZip);
          organizationAddressContributions += 1;
        }
        if (normalized.entity_candidates.physical_site_id) {
          increment(siteCounts, normalized.physical_address.zip_code);
          physicalSites += 1;
        } else increment(siteIneligibilityReasons, normalized.physical_address.site_inference_reason);
      } catch (error) {
        if (!QUARANTINE_REASONS.has(error.message)) throw error;
        await writeGzipRecord(quarantineWriter, {
          schema_version: AK_BUSINESS_LICENSE_SCHEMA_VERSION,
          license_number_source: textValue(source.license_number),
          reason: error.message,
          source_release_id: sourceReleaseId,
          export_policy: "internal",
        });
      }
    }
  } catch (error) {
    await abortGzipWriters([...writers.values(), quarantineWriter]);
    throw error;
  }
  const quarantineRate = selectedLicenseArtifact.record_count ? quarantineWriter.records / selectedLicenseArtifact.record_count : 0;
  if (quarantineRate > maximumQuarantineRate) {
    await abortGzipWriters([...writers.values(), quarantineWriter]);
    throw new Error(`Alaska quarantine rate ${quarantineRate} exceeds the maximum ${maximumQuarantineRate}.`);
  }
  if (organizations + quarantineWriter.records !== selectedLicenseArtifact.record_count) throw new Error("Alaska normalized and quarantined licenses do not reconcile to source rows.");
  // Bound simultaneous hashing/read signal listeners while completing partitions.
  const normalizedArtifacts = [];
  for (const writer of writers.values()) normalizedArtifacts.push(await closeGzipWriter(writer, "normalized-ak-active-business-license-jsonl-gzip", { export_policy: "local-review-only" }));
  const artifacts = [
    selectedLicenseArtifact,
    selectedNaicsArtifact,
    ...normalizedArtifacts,
    await closeGzipWriter(quarantineWriter, "ak-active-business-license-quarantine-jsonl-gzip", { export_policy: "internal" }),
  ];
  const zipRows = buildZipCoverage(baseline.rows, organizationAddressCounts, siteCounts, context);
  artifacts.push(await writeArtifact(stagingDirectory, "derived/zip-coverage.jsonl", jsonLines(zipRows), {
    artifact_type: "ak-active-business-license-zip-coverage-jsonl",
    record_count: zipRows.length,
    distribution_policy: "local-aggregate-review-required",
  }, signal));
  artifacts.push(await writeArtifact(stagingDirectory, "derived/source-summary.json", json({
    source_active_license_rows: selectedLicenseArtifact.record_count,
    active_license_organizations: organizations,
    provisional_physical_sites: physicalSites,
    organizations_without_eligible_physical_site: organizations - physicalSites,
    reported_us_address_zip_contributions: organizationAddressContributions,
    quarantined_source_records: quarantineWriter.records,
    quarantine_rate: quarantineRate,
    source_naics_rows: selectedNaicsArtifact.record_count,
    distinct_license_naics_pairs: distinctNaicsPairs,
    duplicate_license_naics_rows_collapsed: duplicateNaicsRows,
    licenses_with_naics: classificationsByLicense.size,
    licenses_without_naics: licenseIds.size - classificationsByLicense.size,
    source_zip_codes: organizationAddressCounts.size,
    site_ineligibility_reasons: sortedCounts(siteIneligibilityReasons),
    physical_line_2_dispositions: sortedCounts(line2Dispositions),
    reported_address_states: sortedCounts(reportedStates),
    reported_address_countries: sortedCounts(reportedCountries),
    naics_codes: sortedCounts(naicsCodes),
  }), { artifact_type: "ak-active-business-license-source-summary" }, signal));
  artifacts.push(await writeArtifact(stagingDirectory, "source/release-metadata.json", json({
    publisher: "State of Alaska Department of Commerce, Community, and Economic Development, Division of Corporations, Business and Professional Licensing",
    license_download_url: AK_BUSINESS_LICENSE_URL,
    naics_download_url: AK_BUSINESS_NAICS_URL,
    source_page_url: AK_BUSINESS_LICENSE_PAGE_URL,
    terms_url: AK_BUSINESS_TERMS_URL,
    source_native_updated_at: null,
    source_observation_window: { from: window.from, through: window.through, license_download_observed_at: window.license, naics_download_observed_at: window.naics },
    license_headers: AK_BUSINESS_LICENSE_HEADERS,
    license_schema_fingerprint: AK_BUSINESS_LICENSE_SCHEMA_FINGERPRINT,
    naics_headers: AK_BUSINESS_NAICS_HEADERS,
    naics_schema_fingerprint: AK_BUSINESS_NAICS_SCHEMA_FINGERPRINT,
    persisted_license_fields: SELECTED_LICENSE_FIELDS,
    persisted_naics_fields: SELECTED_NAICS_FIELDS,
    excluded_before_persistence: ["Owners", "all Mailing* fields", "raw PhysicalLine2 except a conservative non-contact unit value", "duplicate BusinessName from NAICS download"],
  }), { artifact_type: "ak-active-business-license-source-release-metadata" }, signal));
  const manifest = {
    schema_version: AK_BUSINESS_LICENSE_SCHEMA_VERSION,
    dataset_id: "ak-active-business-licenses",
    connector: { id: "ak-active-business-licenses", version: "1.0.1" },
    release_id: releaseId,
    run_id: runId,
    retrieved_at: retrievedAt,
    source_release_id: sourceReleaseId,
    source_observation_window: { from: window.from, through: window.through, license_download_observed_at: window.license, naics_download_observed_at: window.naics },
    status: "published",
    complete_active_license_snapshot: true,
    coverage: {
      source_active_license_rows: selectedLicenseArtifact.record_count,
      active_license_organizations: organizations,
      provisional_physical_sites: physicalSites,
      provisional_establishments: physicalSites,
      organizations_without_eligible_physical_site: organizations - physicalSites,
      reported_us_address_zip_contributions: organizationAddressContributions,
      quarantined_source_records: quarantineWriter.records,
      quarantine_rate: quarantineRate,
      source_naics_rows: selectedNaicsArtifact.record_count,
      distinct_license_naics_pairs: distinctNaicsPairs,
      accepted_license_naics_pairs: acceptedNaicsPairs,
      duplicate_license_naics_rows_collapsed: duplicateNaicsRows,
      licenses_with_naics: classificationsByLicense.size,
      licenses_without_naics: licenseIds.size - classificationsByLicense.size,
      source_zip_codes: organizationAddressCounts.size,
      zip_union_records: zipRows.length,
      complete_all_businesses: false,
    },
    quality_gates: {
      minimum_license_rows: minimumLicenseRows,
      maximum_quarantine_rate: maximumQuarantineRate,
      observed_quarantine_rate: quarantineRate,
      minimum_naics_coverage_rate: minimumNaicsCoverageRate,
      observed_naics_coverage_rate: naicsCoverageRate,
      source_observation_window_maximum_seconds: 300,
      duplicate_license_numbers: 0,
      orphan_naics_rows: 0,
      source_status_values: ["Active"],
    },
    dependencies: [
      { dataset_id: baseline.manifest.dataset_id, release_id: baseline.manifest.release_id, manifest_sha256: baseline.manifestSha256 },
      ...(baseline.manifest.geography_dependency ? [baseline.manifest.geography_dependency] : []),
    ],
    source: {
      publisher: "State of Alaska Department of Commerce, Community, and Economic Development, Division of Corporations, Business and Professional Licensing",
      source_page: AK_BUSINESS_LICENSE_PAGE_URL,
      license_download_url: AK_BUSINESS_LICENSE_URL,
      naics_download_url: AK_BUSINESS_NAICS_URL,
      terms_url: AK_BUSINESS_TERMS_URL,
      access_method: licenseRows === null ? "anonymous public full CSV downloads" : "explicit test fixture records",
      license: "State of Alaska DCCED site terms; no separate redistribution license stated",
      attribution: "SOA DCCED CBPL",
      active_definition: "row included with Status exactly Active in the official full Business License Download",
      business_license_scope: "AS 43.70.020(a) requires an Alaska business license for the privilege of engaging in business in the state",
    },
    policy: {
      policy_id: "ak-active-business-licenses",
      record_level_distribution: "local-review-only",
      aggregate_distribution: "local-aggregate-review-required",
      privacy_reason: "business names can identify sole proprietors, reported physical addresses can be residences, and the excluded source fields contain owner, mailing, and contact-like data",
    },
    limitations: [
      "Active means inclusion with source Status Active in the Alaska DCCED Business License Download during the recorded observation window; it is not independent proof of continuous operations, public access, solvency, service quality, or compliance with every required occupational or local permit.",
      "DCCED states that submitted information is not verified and provides the download as-is without a warranty of accuracy or reliability.",
      "The source records one reported physical address per business license even when a business has multiple locations, so this is not a complete establishment or storefront inventory.",
      "A provisional site and establishment are created only for a complete source-reported U.S. physical street address with a valid state and ZIP; foreign, incomplete, invalid, and P.O. Box addresses remain organization evidence only.",
      "Owners and all mailing fields are excluded before persistence. Raw PhysicalLine2 is also excluded because live profiling found contact-like values; only a conservative non-contact unit value may be retained.",
      "Record-level output and linkage remain local-review-only; aggregate redistribution requires a separate terms review.",
      "Current USPS validity remains unverified until an authorized operational ZIP denominator is integrated.",
      "No owner, parent-company, network-affiliation, or cross-source identity relationship is inferred.",
    ],
    artifacts,
  };
  await writeFile(path.join(stagingDirectory, "manifest.json"), json(manifest), { signal });
  const publication = await publishAkActiveBusinessLicensesStaging({ outputRoot, stagingRunId: runId, expectedReleaseId: releaseId, signal, logger });
  try { await logger(`Published ${organizations.toLocaleString("en-US")} Alaska active-license organizations and ${physicalSites.toLocaleString("en-US")} provisional physical sites.`); }
  catch { throw akPublicationIncomplete("post-publication", releaseId); }
  return { manifest, releaseDirectory: publication.releaseDirectory, pointerPath: publication.pointerPath };
  } catch (error) {
    await abortGzipWriters(ownedWriters);
    if (signal?.aborted && error.code !== "AK_PUBLICATION_INCOMPLETE") {
      try {
        assertContained(stagingRoot, stagingDirectory, "Cancelled Alaska staging");
        const current = await lstat(stagingDirectory, { bigint: true });
        if (path.dirname(stagingDirectory) !== stagingRoot || path.basename(stagingDirectory) !== runId
          || current.isSymbolicLink() || !current.isDirectory() || current.dev !== ownedIdentity.dev || current.ino !== ownedIdentity.ino
          || await realpath(stagingDirectory) !== stagingDirectory || await realpath(stagingRoot) !== stagingRoot) {
          throw new Error("Cancelled Alaska staging ownership changed; inspection required.");
        }
        await rm(stagingDirectory, { recursive: true });
      } catch (cleanupError) {
        if (cleanupError.code !== "ENOENT") throw new AggregateError([error, cleanupError], "Alaska cancellation cleanup requires inspection.");
      }
    }
    throw error;
  } finally {
    signal?.removeEventListener("abort", abortOwnedWriters);
  }
}

function containsExcludedField(value) {
  if (Array.isArray(value)) return value.some(containsExcludedField);
  if (!value || typeof value !== "object") return false;
  const forbiddenKeys = new Set([
    "Owners", "PhysicalLine2", "owner", "owner_name", "phone", "telephone", "email", "contact",
    "mailing_address", "mailing_city", "mailing_state", "mailing_zip", "mailing_zip_plus",
  ]);
  return Object.entries(value).some(([key, child]) => forbiddenKeys.has(key) || /^Mailing/.test(key) || containsExcludedField(child));
}

function publicationCheck(ok, reason) {
  if (!ok) throw new Error(`Alaska publication rejected: ${reason}.`);
}
function akPublicationIncomplete(phase, releaseId) {
  return Object.assign(new Error("Alaska publication did not finalize cleanly; preserve and inspect retained publication evidence before any retry."), { code: "AK_PUBLICATION_INCOMPLETE", phase, releaseId });
}
async function validateAkOutputRoot(outputRoot, signal) {
  const root = await publicationPath(path.resolve(outputRoot), signal);
  publicationCheck(!path.relative(APP_ROOT, root).split(path.sep).some((part) => /^(releases|\.staging)$/i.test(part)), "output root cannot be inside immutable history or staging");
  for (let current = root; current !== APP_ROOT; current = path.dirname(current)) {
    let exists = false;
    try { await lstat(path.join(current, "manifest.json")); exists = true; } catch (error) { if (error.code !== "ENOENT") throw error; }
    publicationCheck(!exists, "output root cannot be inside a manifest-bearing dataset");
  }
  return root;
}
async function publicationPath(target, signal) {
  publicationCheck(typeof target === "string" && target.length <= 1024 && path.resolve(target) === target, "absolute canonical path required");
  const absolute = assertInsideApp(target);
  publicationCheck(absolute !== APP_ROOT && await realpath(APP_ROOT) === APP_ROOT, "application root or alias");
  let current = APP_ROOT;
  for (const part of path.relative(APP_ROOT, absolute).split(path.sep)) {
    signal?.throwIfAborted(); current = path.join(current, part);
    let info; try { info = await lstat(current, { bigint: true }); } catch (error) { if (error.code === "ENOENT") continue; throw error; }
    publicationCheck(!info.isSymbolicLink() && await realpath(current) === current, "path alias");
    if (current !== absolute) publicationCheck(info.isDirectory(), "path ancestor");
    if (info.isFile()) publicationCheck(info.nlink === 1n, "hard-linked file");
  }
  return absolute;
}
const sameIdentity = (a, b) => a.ino === b.ino && a.dev === b.dev && a.nlink === b.nlink;
const sameFile = (a, b) => sameIdentity(a, b) && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
async function publicationRead(filename, maximum, signal) {
  await publicationPath(filename, signal);
  const initial = await lstat(filename, { bigint: true });
  publicationCheck(initial.isFile() && initial.size <= BigInt(maximum), "metadata byte ceiling or file type");
  const handle = await open(filename, "r");
  try {
    const before = await handle.stat({ bigint: true });
    publicationCheck(sameFile(initial, before), "metadata read ownership");
    const chunks = []; let count = 0;
    for (;;) {
      signal?.throwIfAborted();
      const buffer = Buffer.alloc(Math.min(65536, maximum + 1 - count));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null); if (!bytesRead) break;
      count += bytesRead; publicationCheck(count <= maximum, "metadata byte ceiling"); chunks.push(buffer.subarray(0, bytesRead));
    }
    publicationCheck(sameFile(before, await handle.stat({ bigint: true })) && sameFile(before, await lstat(filename, { bigint: true })), "metadata changed during read");
    return { bytes: Buffer.concat(chunks, count), identity: before };
  } finally { await handle.close(); }
}
async function publicationSnapshot(directory, manifest, signal) {
  publicationCheck(Array.isArray(manifest.artifacts) && manifest.artifacts.length <= 64, "bounded artifact roster");
  const expected = new Set(["manifest.json"]), allowedDirectories = new Set([""]);
  for (const artifact of manifest.artifacts) {
    publicationCheck(typeof artifact.path === "string" && artifact.path.length <= 300 && artifact.path.split("/").every((part) => part && part !== "." && part !== "..")
      && !artifact.path.includes("\\") && !path.isAbsolute(artifact.path) && !expected.has(artifact.path), "artifact path or duplicate");
    expected.add(artifact.path);
    for (let parent = path.posix.dirname(artifact.path); parent !== "."; parent = path.posix.dirname(parent)) allowedDirectories.add(parent);
  }
  const snapshot = new Map(); let total = 0;
  async function visit(current, relative) {
    await publicationPath(current, signal); const identity = await lstat(current, { bigint: true });
    publicationCheck(identity.isDirectory() && allowedDirectories.has(relative), "unexpected directory");
    snapshot.set(relative, { identity, directory: true });
    for (const entry of await readdir(current, { withFileTypes: true })) {
      signal?.throwIfAborted();
      const name = relative ? relative + "/" + entry.name : entry.name, filename = path.join(current, entry.name);
      if (entry.isDirectory()) { await visit(filename, name); continue; }
      publicationCheck(entry.isFile() && expected.has(name), "unexpected artifact or alias");
      await publicationPath(filename, signal); const before = await lstat(filename, { bigint: true });
      publicationCheck(before.size <= 100_000_000n, "artifact byte ceiling");
      const hash = createHash("sha256"); let count = 0;
      for await (const chunk of createReadStream(filename, { signal })) {
        count += chunk.length; total += chunk.length;
        publicationCheck(count <= 100_000_000 && total <= 250_000_000, "artifact or cumulative byte ceiling"); hash.update(chunk);
      }
      const digest = hash.digest("hex"), after = await lstat(filename, { bigint: true });
      publicationCheck(sameFile(before, after) && BigInt(count) === after.size, "artifact changed during snapshot");
      if (name !== "manifest.json") {
        const artifact = manifest.artifacts.find((item) => item.path === name);
        publicationCheck(artifact.bytes === count && artifact.sha256 === digest, "artifact checksum mismatch");
      }
      snapshot.set(name, { identity: after, directory: false, sha256: digest });
    }
  }
  await visit(directory, "");
  publicationCheck([...snapshot.values()].filter((value) => !value.directory).length === expected.size, "missing artifact");
  return snapshot;
}
function sameSnapshot(before, after) {
  return before.size === after.size && [...before].every(([name, value]) => {
    const next = after.get(name);
    return next && next.directory === value.directory && (value.directory ? sameIdentity(value.identity, next.identity) : sameFile(value.identity, next.identity) && value.sha256 === next.sha256);
  });
}

export async function publishAkActiveBusinessLicensesStaging({ outputRoot, stagingRunId, expectedReleaseId = null, signal, logger = () => {} } = {}) {
  signal?.throwIfAborted();
  if (!outputRoot || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stagingRunId ?? "")) {
    throw new Error("outputRoot and a valid stagingRunId are required.");
  }
  publicationCheck(typeof logger === "function", "logger must be a function");
  const root = await validateAkOutputRoot(outputRoot, signal);
  publicationCheck(!path.relative(APP_ROOT, root).split(path.sep).some((part) => ["releases", ".staging"].includes(part.toLowerCase())), "output cannot nest in immutable storage");
  const stagingDirectory = await publicationPath(path.join(root, ".staging", stagingRunId), signal);
  const lockPath = await publicationPath(path.join(root, ".publish.lock"), signal);
  const lock = await open(lockPath, "wx"), lockIdentity = await lock.stat({ bigint: true });
  const lockBytes = Buffer.from(json({ run_id: stagingRunId, pid: process.pid }));
  const pointerPath = path.join(root, "current.json"), temporaryPointer = path.join(root, ".current-" + randomUUID() + ".tmp");
  let temporaryIdentity, failure, commitReleaseId = null, commitPhase = null;
  async function owned(filename, expected) {
    if (!expected) return false;
    try { await publicationPath(filename); const actual = await lstat(filename, { bigint: true }); return sameIdentity(actual, expected); } catch { return false; }
  }
  async function ownLock() {
    if (!await owned(lockPath, lockIdentity)) return false;
    try { return (await publicationRead(lockPath, 1000)).bytes.equals(lockBytes); } catch { return false; }
  }
  async function absent(filename) { try { await lstat(filename); return false; } catch (error) { if (error.code === "ENOENT") return true; throw error; } }
  try {
    publicationCheck(lockIdentity.nlink === 1n, "lock ownership"); await lock.writeFile(lockBytes); await lock.sync();
    const manifestPath = path.join(stagingDirectory, "manifest.json"), original = await publicationRead(manifestPath, 1_000_000, signal);
    const manifest = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(original.bytes));
    publicationCheck(manifest.run_id === stagingRunId && manifest.dataset_id === "ak-active-business-licenses" && manifest.status === "published"
      && typeof manifest.release_id === "string" && /^ak-active-business-licenses-[0-9TZ-]+-[a-f0-9]{8}$/.test(manifest.release_id), "staging manifest identity");
    if (expectedReleaseId && manifest.release_id !== expectedReleaseId) throw new Error("Alaska staging release ID does not match the build result.");
    const initial = await publicationSnapshot(stagingDirectory, manifest, signal);
    const releasesDirectory = await publicationPath(path.join(root, "releases"), signal);
    await mkdir(releasesDirectory, { recursive: true }); await publicationPath(releasesDirectory, signal);
    const releasesIdentity = await lstat(releasesDirectory, { bigint: true });
    const releaseDirectory = path.join(releasesDirectory, manifest.release_id);
    publicationCheck(await absent(releaseDirectory), "release destination already exists");
    await publicationPath(pointerPath, signal);
    let prior = null, priorManifest = null;
    if (!await absent(pointerPath)) {
      prior = await publicationRead(pointerPath, 10000, signal);
      const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(prior.bytes));
      publicationCheck(JSON.stringify(Object.keys(value).sort()) === JSON.stringify(["dataset_id", "manifest", "release_id", "updated_at"])
        && value.dataset_id === "ak-active-business-licenses" && typeof value.release_id === "string"
        && /^ak-active-business-licenses-[0-9TZ-]+-[a-f0-9]{8}$/.test(value.release_id)
        && value.manifest === "releases/" + value.release_id + "/manifest.json", "foreign or malformed prior pointer");
      priorManifest = { filename: path.join(root, value.manifest), ...(await publicationRead(path.join(root, value.manifest), 1_000_000, signal)) };
      const previous = JSON.parse(priorManifest.bytes.toString("utf8"));
      publicationCheck(previous.dataset_id === value.dataset_id && previous.release_id === value.release_id && previous.status === "published" && value.updated_at === previous.retrieved_at, "prior pointer linkage");
    }
    async function priorUnchanged() {
      if (!prior) return absent(pointerPath);
      const current = await publicationRead(pointerPath, 10000), previous = await publicationRead(priorManifest.filename, 1_000_000);
      return sameFile(prior.identity, current.identity) && current.bytes.equals(prior.bytes) && sameFile(priorManifest.identity, previous.identity) && previous.bytes.equals(priorManifest.bytes);
    }
    await logger("Verifying Alaska staged release."); signal?.throwIfAborted();
    await verifyAkActiveBusinessLicenses(manifestPath, { signal });
    await delay(250, undefined, { signal });
    await logger("Publishing Alaska verified release."); signal?.throwIfAborted();
    // Caller hooks cannot open a gap between semantic verification and commit.
    await verifyAkActiveBusinessLicenses(manifestPath, { signal });
    const final = await publicationSnapshot(stagingDirectory, manifest, signal);
    publicationCheck(sameSnapshot(initial, final) && (await publicationRead(manifestPath, 1_000_000, signal)).bytes.equals(original.bytes), "verified staging changed before publication");
    publicationCheck(await ownLock() && await owned(releasesDirectory, releasesIdentity) && await priorUnchanged() && await absent(releaseDirectory), "publication ownership or prior pointer changed");
    signal?.throwIfAborted();
    // Commit boundary: complete release and pointer finalization without cancellation.
    commitReleaseId = manifest.release_id; commitPhase = "release-rename";
    await renameWithRetry(stagingDirectory, releaseDirectory);
    commitPhase = "pointer-write";
    const pointerBytes = Buffer.from(json({ dataset_id: manifest.dataset_id, release_id: manifest.release_id, manifest: "releases/" + manifest.release_id + "/manifest.json", updated_at: manifest.retrieved_at }));
    const pointer = await open(temporaryPointer, "wx");
    try {
      temporaryIdentity = await pointer.stat({ bigint: true }); publicationCheck(temporaryIdentity.nlink === 1n, "temporary pointer ownership");
      await pointer.writeFile(pointerBytes);
      await pointer.sync();
    } finally { await pointer.close(); }
    publicationCheck(await ownLock() && await owned(temporaryPointer, temporaryIdentity) && await priorUnchanged(), "pointer commit ownership changed; retained release requires inspection");
    publicationCheck((await publicationRead(temporaryPointer, 10_000)).bytes.equals(pointerBytes), "temporary pointer contents changed; retained release requires inspection");
    commitPhase = "pointer-rename";
    await renameWithRetry(temporaryPointer, pointerPath);
    commitPhase = "post-publication";
    return { manifest, releaseDirectory, pointerPath };
  } catch (error) { failure = commitReleaseId ? akPublicationIncomplete(commitPhase, commitReleaseId) : error; throw failure; }
  finally {
    let cleanupFailure;
    try { await lock.close(); } catch (error) { cleanupFailure = error; }
    try {
      const lockOwned = await ownLock();
      if (lockOwned) await unlink(lockPath);
      else throw new Error("Alaska publication lock ownership changed; inspect retained evidence.");
    } catch (error) { cleanupFailure ??= error; }
    try { if (await owned(temporaryPointer, temporaryIdentity)) await unlink(temporaryPointer); } catch (error) { cleanupFailure ??= error; }
    if (cleanupFailure && !failure) throw commitReleaseId ? akPublicationIncomplete("post-publication", commitReleaseId) : cleanupFailure;
  }
}
export async function verifyAkActiveBusinessLicenses(manifestPath, { signal } = {}) {
  signal?.throwIfAborted();
  const absoluteManifestPath = path.resolve(manifestPath);
  const releaseDirectory = path.dirname(absoluteManifestPath);
  const manifest = JSON.parse(await readFile(absoluteManifestPath, { encoding: "utf8", signal }));
  const failures = [];
  if (manifest.dataset_id !== "ak-active-business-licenses" || manifest.status !== "published" || !manifest.complete_active_license_snapshot) failures.push({ path: "manifest.json", reason: "unexpected or incomplete manifest" });
  if (manifest.coverage?.complete_all_businesses !== false || manifest.policy?.record_level_distribution !== "local-review-only"
    || manifest.policy?.aggregate_distribution !== "local-aggregate-review-required") failures.push({ path: "manifest.json", reason: "completeness or distribution policy was overstated" });
  const artifactByType = new Map();
  for (const artifact of manifest.artifacts ?? []) {
    if (!artifactByType.has(artifact.artifact_type)) artifactByType.set(artifact.artifact_type, []);
    artifactByType.get(artifact.artifact_type).push(artifact);
    try {
      const filename = path.resolve(releaseDirectory, artifact.path);
      assertContained(releaseDirectory, filename, `Artifact ${artifact.path}`);
      const actual = await hashFile(filename, signal);
      if (actual.bytes !== artifact.bytes || actual.sha256 !== artifact.sha256) failures.push({ path: artifact.path, reason: "size or SHA-256 mismatch" });
    } catch (error) {
      signal?.throwIfAborted();
      failures.push({ path: artifact.path, reason: error.code === "ENOENT" ? "missing" : error.message });
    }
  }
  const sourceLicenseArtifact = artifactByType.get("ak-active-business-license-selected-source-jsonl-gzip")?.[0];
  const sourceNaicsArtifact = artifactByType.get("ak-active-business-license-naics-selected-source-jsonl-gzip")?.[0];
  const normalizedArtifacts = artifactByType.get("normalized-ak-active-business-license-jsonl-gzip") ?? [];
  const quarantineArtifact = artifactByType.get("ak-active-business-license-quarantine-jsonl-gzip")?.[0];
  const zipArtifact = artifactByType.get("ak-active-business-license-zip-coverage-jsonl")?.[0];
  if (!sourceLicenseArtifact || sourceLicenseArtifact.export_policy !== "internal") failures.push({ path: "manifest.json", reason: "selected license source artifact is missing or misclassified" });
  if (!sourceNaicsArtifact || sourceNaicsArtifact.export_policy !== "internal") failures.push({ path: "manifest.json", reason: "selected NAICS source artifact is missing or misclassified" });
  if (normalizedArtifacts.length !== 16 || normalizedArtifacts.some((artifact) => artifact.export_policy !== "local-review-only")) failures.push({ path: "manifest.json", reason: "expected 16 local-review-only normalized partitions" });
  if (!quarantineArtifact || quarantineArtifact.export_policy !== "internal") failures.push({ path: "manifest.json", reason: "quarantine artifact is missing or misclassified" });
  if (!zipArtifact || zipArtifact.distribution_policy !== "local-aggregate-review-required") failures.push({ path: "manifest.json", reason: "ZIP artifact is missing or misclassified" });
  if (sourceLicenseArtifact && sourceNaicsArtifact) {
    const expectedDigest = sha256(`${manifest.source_observation_window?.from}\u0000${manifest.source_observation_window?.through}\u0000${sourceLicenseArtifact.sha256}\u0000${sourceNaicsArtifact.sha256}`);
    const expectedRelease = `ak-active-business-licenses-${manifest.source_observation_window?.through?.slice(0, 10)}-${expectedDigest.slice(0, 16)}`;
    if (manifest.source_release_id !== expectedRelease) failures.push({ path: "manifest.json", reason: "source release ID is not bound to observation window and selected source checksums" });
  }
  const licenseIds = new Set();
  let sourceLicenseRows = 0;
  if (sourceLicenseArtifact) {
    try {
      for await (const record of gzipRecords(path.join(releaseDirectory, sourceLicenseArtifact.path), signal)) {
        if (Object.keys(record).some((field) => !SELECTED_LICENSE_FIELDS.includes(field))) throw new Error("unapproved selected license field");
        if (containsExcludedField(record)) throw new Error("owner, mailing, contact, or raw PhysicalLine2 field leaked");
        const id = textValue(record.license_number);
        if (id && licenseIds.has(id)) throw new Error(`duplicate license ${id}`);
        if (id) licenseIds.add(id);
        if (record.status !== "Active") throw new Error(`non-active source row ${id}`);
        sourceLicenseRows += 1;
      }
      if (sourceLicenseRows !== sourceLicenseArtifact.record_count || sourceLicenseRows !== manifest.coverage?.source_active_license_rows) throw new Error("source license count mismatch");
    } catch (error) {
      signal?.throwIfAborted();
      failures.push({ path: sourceLicenseArtifact.path, reason: `source license validation failed: ${error.message}` });
    }
  }
  let sourceNaicsRows = 0;
  let duplicateNaicsRows = 0;
  const distinctPairs = new Map();
  const sourceClassificationsByLicense = new Map();
  if (sourceNaicsArtifact) {
    try {
      for await (const record of gzipRecords(path.join(releaseDirectory, sourceNaicsArtifact.path), signal)) {
        if (Object.keys(record).some((field) => !SELECTED_NAICS_FIELDS.includes(field)) || containsExcludedField(record)) throw new Error("unapproved selected NAICS field");
        const id = textValue(record.license_number);
        if (!licenseIds.has(id)) throw new Error(`orphan NAICS license ${id}`);
        const normalized = normalizeNaicsRows([record])[0];
        const key = `${id}\u0000${normalized.naics_code}`;
        const previous = distinctPairs.get(key);
        if (previous) {
          if (JSON.stringify(previous) !== JSON.stringify(record)) throw new Error(`conflicting duplicate NAICS pair ${key}`);
          duplicateNaicsRows += 1;
        } else distinctPairs.set(key, record);
        sourceClassificationsByLicense.set(id, (sourceClassificationsByLicense.get(id) ?? 0) + 1);
        sourceNaicsRows += 1;
      }
      if (sourceNaicsRows !== sourceNaicsArtifact.record_count || sourceNaicsRows !== manifest.coverage?.source_naics_rows) throw new Error("source NAICS count mismatch");
      if (distinctPairs.size !== manifest.coverage?.distinct_license_naics_pairs || duplicateNaicsRows !== manifest.coverage?.duplicate_license_naics_rows_collapsed) throw new Error("source NAICS pair counts mismatch");
      if (sourceClassificationsByLicense.size !== manifest.coverage?.licenses_with_naics || licenseIds.size - sourceClassificationsByLicense.size !== manifest.coverage?.licenses_without_naics) throw new Error("source NAICS license coverage mismatch");
    } catch (error) {
      signal?.throwIfAborted();
      failures.push({ path: sourceNaicsArtifact.path, reason: `source NAICS validation failed: ${error.message}` });
    }
  }
  const normalizedIds = new Set();
  const organizationAddressCounts = new Map();
  const siteCounts = new Map();
  let organizations = 0;
  let physicalSites = 0;
  let acceptedNaicsPairs = 0;
  for (const artifact of normalizedArtifacts) {
    try {
      const prefix = artifact.path.match(/id-hash-prefix=([0-9a-f])/)?.[1];
      let partitionCount = 0;
      for await (const record of gzipRecords(path.join(releaseDirectory, artifact.path), signal)) {
        const id = record.external_identifiers?.find((item) => item.type === "alaska_business_license_number")?.value;
        if (!id || normalizedIds.has(id) || sha256(id)[0] !== prefix || !licenseIds.has(id)) throw new Error(`duplicate, missing, or incorrectly partitioned license ${id}`);
        normalizedIds.add(id);
        if (record.entity_candidates?.organization_id !== `organization:ak_dcced_business_license_${id}` || record.export_policy !== "local-review-only"
          || record.provenance?.source_release_id !== manifest.source_release_id || record.provenance?.policy_id !== "ak-active-business-licenses") throw new Error(`invalid identity or provenance for ${id}`);
        if (containsExcludedField(record) || record.privacy?.owner_fields_excluded !== true || record.privacy?.mailing_fields_excluded !== true) throw new Error(`privacy exclusion failed for ${id}`);
        if (record.source_status?.value !== "active-in-alaska-business-license-download-as-of-retrieval") throw new Error(`invalid active status for ${id}`);
        const hasSite = Boolean(record.entity_candidates?.physical_site_id);
        if (hasSite !== Boolean(record.entity_candidates?.establishment_id) || hasSite !== Boolean(record.physical_address?.site_inference_eligible)) throw new Error(`inconsistent site inference for ${id}`);
        if (hasSite && (record.entity_candidates.physical_site_id !== `site:ak_dcced_business_license_${id}` || record.entity_candidates.establishment_id !== `establishment:ak_dcced_business_license_${id}`)) throw new Error(`invalid site identity for ${id}`);
        const normalizedClassifications = normalizeNaicsRows((record.license_profile?.naics_classifications ?? []).map((classification) => ({
          license_number: id,
          line_of_business_source: classification.source_line_of_business,
          naics_code_source: classification.source_naics_label,
          naics_description_source: classification.naics_description,
        })));
        if (normalizedClassifications.length !== record.license_profile?.distinct_naics_count) throw new Error(`invalid NAICS classifications for ${id}`);
        acceptedNaicsPairs += normalizedClassifications.length;
        const addressZip = record.physical_address?.country === "US" && US_STATE_AND_TERRITORY_CODES.has(record.physical_address?.state ?? "")
          && record.physical_address?.street && record.physical_address?.city ? record.physical_address?.zip_code : null;
        if (addressZip) increment(organizationAddressCounts, addressZip);
        if (hasSite) {
          increment(siteCounts, record.physical_address.zip_code);
          physicalSites += 1;
        }
        organizations += 1;
        partitionCount += 1;
      }
      if (partitionCount !== artifact.record_count) throw new Error("partition count mismatch");
    } catch (error) {
      signal?.throwIfAborted();
      failures.push({ path: artifact.path, reason: `normalized validation failed: ${error.message}` });
    }
  }
  let quarantineRows = 0;
  if (quarantineArtifact) {
    try {
      for await (const record of gzipRecords(path.join(releaseDirectory, quarantineArtifact.path), signal)) {
        if (!QUARANTINE_REASONS.has(record.reason) || record.export_policy !== "internal" || containsExcludedField(record)) throw new Error("invalid quarantine record");
        quarantineRows += 1;
      }
      if (quarantineRows !== quarantineArtifact.record_count || quarantineRows !== manifest.coverage?.quarantined_source_records) throw new Error("quarantine count mismatch");
    } catch (error) {
      signal?.throwIfAborted();
      failures.push({ path: quarantineArtifact.path, reason: `quarantine validation failed: ${error.message}` });
    }
  }
  if (organizations !== manifest.coverage?.active_license_organizations || physicalSites !== manifest.coverage?.provisional_physical_sites
    || physicalSites !== manifest.coverage?.provisional_establishments || organizations - physicalSites !== manifest.coverage?.organizations_without_eligible_physical_site
    || organizations + quarantineRows !== sourceLicenseRows || acceptedNaicsPairs !== manifest.coverage?.accepted_license_naics_pairs) {
    failures.push({ path: "manifest.json", reason: "normalized coverage counts do not reconcile" });
  }
  if ([...organizationAddressCounts.values()].reduce((sum, value) => sum + value, 0) !== manifest.coverage?.reported_us_address_zip_contributions) failures.push({ path: "manifest.json", reason: "reported U.S. address ZIP counts do not reconcile" });
  if (zipArtifact) {
    try {
      const rows = await readJsonLines(path.join(releaseDirectory, zipArtifact.path), signal);
      if (rows.length !== zipArtifact.record_count || rows.length !== manifest.coverage?.zip_union_records) throw new Error("ZIP row count mismatch");
      let organizationTotal = 0;
      let siteTotal = 0;
      let count = 0;
      for (const row of rows) {
        signal?.throwIfAborted();
        if (++count % 256 === 0) await yieldTurn(undefined, { signal });
        const snapshot = row.ak_active_business_license_snapshot;
        if ((organizationAddressCounts.get(row.zip_code) ?? 0) !== snapshot?.active_license_organization_reported_address_count
          || (siteCounts.get(row.zip_code) ?? 0) !== snapshot?.provisional_physical_site_count) throw new Error(`ZIP ${row.zip_code} does not reconcile`);
        if (row.current_usps_validity?.status !== "unverified" || snapshot?.complete_all_businesses !== false) throw new Error(`ZIP ${row.zip_code} overstates validity or completeness`);
        organizationTotal += snapshot.active_license_organization_reported_address_count;
        siteTotal += snapshot.provisional_physical_site_count;
      }
      if (organizationTotal !== manifest.coverage?.reported_us_address_zip_contributions || siteTotal !== manifest.coverage?.provisional_physical_sites) throw new Error("ZIP totals do not reconcile");
    } catch (error) {
      signal?.throwIfAborted();
      failures.push({ path: zipArtifact.path, reason: `ZIP validation failed: ${error.message}` });
    }
  }
  signal?.throwIfAborted();
  if (failures.length) {
    const error = new Error(`Alaska active business-license release verification failed for ${failures.length} check(s).`);
    error.failures = failures;
    throw error;
  }
  return { dataset_id: manifest.dataset_id, release_id: manifest.release_id, source_release_id: manifest.source_release_id, artifact_count: manifest.artifacts.length, coverage: manifest.coverage };
}
