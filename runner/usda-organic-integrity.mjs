import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, readFile, realpath, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";

import { readUsdaIntegrityWorkbook, USDA_INTEGRITY_WORKBOOK_SHEETS } from "./usda-organic-integrity-xlsx.mjs";
import { APP_ROOT } from "./paths.mjs";

export const USDA_INTEGRITY_CONNECTOR_ID = "usda-organic-integrity";
export const USDA_INTEGRITY_CONNECTOR_VERSION = "1.0.0";
export const USDA_INTEGRITY_SCHEMA_VERSION = "1.0.0";
export const USDA_INTEGRITY_TRANSFORMATION_VERSION = "usda-organic-integrity-certified-operations@1.0.0";
export const USDA_INTEGRITY_HISTORY_URL = "https://organic.ams.usda.gov/integrity/Reports/DataHistory";
export const USDA_INTEGRITY_OFFLINE_ACKNOWLEDGEMENT = "I-APPROVE-USDA-INTEGRITY-OFFLINE-LOCAL-REVIEW-BUILD";
export const USDA_INTEGRITY_LIVE_ACQUISITION_ACKNOWLEDGEMENT = "I-APPROVE-USDA-INTEGRITY-LIVE-WORKBOOK-ACQUISITION";

export const USDA_INTEGRITY_STATUS_VOCABULARY = Object.freeze([
  "Certified", "Surrendered", "Suspended", "Revoked", "Transitional", "Denied Certification", "Withdrew with NONC", "Withdrew from Transitional",
]);
export const USDA_INTEGRITY_SCOPE_VOCABULARY = Object.freeze(["Crops", "Livestock", "Wild Crops", "Handling"]);
export const USDA_INTEGRITY_SERVICE_VOCABULARY = Object.freeze([
  "Broker", "Community Supported Agriculture (CSA)", "Co-Packer", "Dairy", "Distributor", "Grower Group",
  "Marketer/Trader", "Poultry", "Private Labeler", "Restaurant", "Retail Food Establishment", "Slaughterhouse", "Storage",
]);
export const USDA_INTEGRITY_WORKBOOK_SCHEMA_FINGERPRINT = sha256(JSON.stringify(USDA_INTEGRITY_WORKBOOK_SHEETS));
const USDA_INTEGRITY_MAXIMUM_NORMALIZED_ARTIFACT_BYTES = 512 * 1024 * 1024;
const USDA_INTEGRITY_SOURCE_LINKAGE_STATUS = "unverified-operator-supplied-conformance";

const PROHIBITED_KEYS = /(?:^|_)(?:contact|phone|telephone|email|e_mail|client|agent|person|owner|website|url|additional_information|free_text|other_item|varieties)(?:_|$)/i;
const US_STATES_AND_TERRITORIES = new Set([
  "AL", "AK", "AS", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "GU", "HI", "ID", "IL", "IN", "IA", "KS", "KY",
  "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "MP", "OH", "OK",
  "OR", "PA", "PR", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "VI", "WA", "WV", "WI", "WY",
]);

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

function text(value) {
  const result = String(value ?? "").trim();
  return result || null;
}

function checkCancelled(signal) {
  if (signal?.aborted) throw signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
}

function timestamp(instant) {
  return instant.replaceAll(/[-:.]/g, "").replace("T", "-").replace("Z", "Z");
}

function isIsoInstant(value) {
  const parsed = new Date(value);
  return typeof value === "string" && Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function assertContained(root, candidate, label) {
  const relative = path.relative(root, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`${label} escapes the governed datahub directory.`);
}

async function validateBuildPaths(appRoot, sourcePath, outputRoot) {
  const root = await realpath(appRoot);
  const source = await realpath(sourcePath);
  assertContained(root, source, "USDA INTEGRITY source");
  const output = await validateWritableOutput(root, outputRoot, "USDA INTEGRITY output");
  return { root, source, output };
}

async function validateWritableOutput(resolvedRoot, outputRoot, label) {
  const output = path.resolve(outputRoot);
  assertContained(resolvedRoot, output, label);
  let ancestor = output;
  while (true) {
    try {
      const resolved = await realpath(ancestor);
      assertContained(resolvedRoot, resolved, `${label} ancestor`);
      break;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const parent = path.dirname(ancestor);
      if (parent === ancestor) throw new Error("USDA INTEGRITY output has no governed existing ancestor.");
      ancestor = parent;
    }
  }
  return output;
}

function normalizeHeader(value) {
  return String(value ?? "").split(";")[0].trim().toLowerCase();
}

function assertHistoryUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "organic.ams.usda.gov" || url.port || url.username || url.password || url.pathname.replace(/\/$/, "") !== "/integrity/Reports/DataHistory" || url.search || url.hash) {
    throw new Error("USDA INTEGRITY history URL is outside the exact official allowlist.");
  }
  return url;
}

function assertWorkbookUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "organic.ams.usda.gov" || url.port || !/^\/Integrity\/MonthlyReports\/INTEGRITY_Data_\d{6}01\.xlsx$/.test(url.pathname)) {
    throw new Error("USDA INTEGRITY workbook URL is outside the official allowlist.");
  }
  if (url.username || url.password || url.search || url.hash) throw new Error("USDA INTEGRITY workbook URL contains forbidden authority, query, or fragment data.");
  return url;
}

async function readResponseBodyBounded(response, maximumBytes, signal) {
  const reader = response.body?.getReader?.();
  if (!reader) throw new Error("USDA INTEGRITY history response has no readable body.");
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      checkCancelled(signal);
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximumBytes) {
        await reader.cancel("bounded-history-response-exceeded-limit");
        throw new Error("USDA INTEGRITY history response exceeded its bounded size limit.");
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock?.();
  }
  return Buffer.concat(chunks, bytes);
}

async function boundedHistoryGet(url, { fetchImpl, signal, maximumBytes = 64 * 1024 }) {
  checkCancelled(signal);
  const timeoutSignal = AbortSignal.timeout(30_000);
  const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
  const response = await fetchImpl(url, { method: "GET", redirect: "error", signal: requestSignal, headers: { accept: "text/html" } });
  if (!response.ok) throw new Error(`USDA INTEGRITY metadata request failed with HTTP ${response.status}.`);
  const finalUrl = new URL(response.url || url);
  if (finalUrl.href !== url.href) throw new Error("USDA INTEGRITY metadata request changed URL unexpectedly.");
  const contentLength = Number(response.headers.get("content-length"));
  if (!Number.isInteger(contentLength) || contentLength <= 0 || contentLength > maximumBytes) throw new Error("USDA INTEGRITY history metadata has a missing or out-of-policy content length.");
  const body = await readResponseBodyBounded(response, maximumBytes, requestSignal);
  if (body.length === 0 || body.length > maximumBytes) throw new Error("USDA INTEGRITY history response exceeded its bounded size.");
  const bodyText = body.toString("utf8");
  if (!/Organic Integrity Database/i.test(bodyText)) throw new Error("USDA INTEGRITY history page identity drifted.");
  const candidates = [];
  for (const match of bodyText.matchAll(/href\s*=\s*["']([^"']*\/Integrity\/MonthlyReports\/INTEGRITY_Data_(\d{6})01\.xlsx)["']/gi)) {
    const workbookUrl = assertWorkbookUrl(new URL(match[1], url).href);
    const year = Number(match[2].slice(0, 4));
    const month = Number(match[2].slice(4, 6));
    if (year < 2015 || month < 1 || month > 12) throw new Error("USDA INTEGRITY history page contains an invalid monthly workbook date.");
    candidates.push({ url: workbookUrl.href, report_month: `${match[2].slice(0, 4)}-${match[2].slice(4, 6)}-01` });
  }
  if (!candidates.length) throw new Error("USDA INTEGRITY bounded history HTML does not expose an exact monthly workbook link; no workbook request was made.");
  candidates.sort((left, right) => right.report_month.localeCompare(left.report_month));
  return { metadata: {
    url: url.href,
    method: "GET",
    status: response.status,
    content_type: normalizeHeader(response.headers.get("content-type")),
    content_length: contentLength,
    response_body_bytes: body.length,
    response_body_sha256: sha256(body),
  }, candidates };
}

export async function preflightUsdaOrganicIntegrity({
  workbookUrl,
  historyUrl = USDA_INTEGRITY_HISTORY_URL,
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
  signal,
} = {}) {
  if (typeof fetchImpl !== "function") throw new Error("A fetch implementation is required.");
  const validatedHistoryUrl = assertHistoryUrl(historyUrl);
  const expectedWorkbookUrl = workbookUrl ? assertWorkbookUrl(workbookUrl) : null;
  const historyResult = await boundedHistoryGet(validatedHistoryUrl, { fetchImpl, signal });
  const history = historyResult.metadata;
  if (history.content_type !== "text/html") throw new Error("USDA INTEGRITY history endpoint content type drifted.");
  const discovered = expectedWorkbookUrl
    ? historyResult.candidates.find(({ url }) => url === expectedWorkbookUrl.href)
    : historyResult.candidates[0];
  if (!discovered) throw new Error("Expected USDA INTEGRITY workbook URL was not present in the bounded official history HTML; no workbook request was made.");
  const workbook = {
    url: discovered.url,
    report_month: discovered.report_month,
    discovery: "exact-link-in-bounded-official-history-html",
    network_request_made: false,
    content_length: null,
    content_hash: null,
    workbook_schema_status: "unverified-awaiting-authorized-source-inspection",
  };
  const observedAt = now().toISOString();
  const receipt = {
    receipt_type: "usda-organic-integrity-metadata-only-preflight",
    connector_id: USDA_INTEGRITY_CONNECTOR_ID,
    connector_version: USDA_INTEGRITY_CONNECTOR_VERSION,
    status: "metadata-only-no-workbook-body-acquired",
    observed_at: observedAt,
    official_history: history,
    candidate_monthly_workbook: workbook,
    pinned_intake_contract: {
      fixture_workbook_schema_fingerprint: USDA_INTEGRITY_WORKBOOK_SCHEMA_FINGERPRINT,
      official_workbook_schema_status: "unverified-awaiting-authorized-source-inspection",
      contract_scope: "synthetic-conformance-fixture-not-asserted-as-official-workbook-layout",
      sheet_names: Object.keys(USDA_INTEGRITY_WORKBOOK_SHEETS),
      sheet_headers: USDA_INTEGRITY_WORKBOOK_SHEETS,
      status_vocabulary: USDA_INTEGRITY_STATUS_VOCABULARY,
      source_snapshot_program_scope: "USDA NOP",
      selected_country_code: "USA",
      selected_country_source_name: "UNITED STATES OF AMERICA (THE)",
      selected_status: "Certified",
    },
    acquisition: {
      request_count: 1,
      request_methods: ["GET"],
      workbook_network_requests: 0,
      full_workbook_body_requests: 0,
      workbook_response_bytes: 0,
      source_records_acquired: 0,
      current_pointer_written: false,
    },
  };
  return { ...receipt, receipt_fingerprint: sha256(JSON.stringify(receipt)) };
}

export function validateUsdaIntegrityPreflight(receipt, { now = () => new Date(), maximumAgeMs = 72 * 60 * 60 * 1000 } = {}) {
  if (receipt?.connector_id !== USDA_INTEGRITY_CONNECTOR_ID || receipt?.connector_version !== USDA_INTEGRITY_CONNECTOR_VERSION) throw new Error("USDA INTEGRITY preflight connector identity is invalid.");
  if (receipt?.status !== "metadata-only-no-workbook-body-acquired") throw new Error("USDA INTEGRITY preflight status is invalid.");
  const fingerprint = receipt.receipt_fingerprint;
  const unsigned = { ...receipt };
  delete unsigned.receipt_fingerprint;
  if (!/^[a-f0-9]{64}$/.test(fingerprint ?? "") || sha256(JSON.stringify(unsigned)) !== fingerprint) throw new Error("USDA INTEGRITY preflight fingerprint is invalid.");
  if (receipt.acquisition?.request_count !== 1 || receipt.acquisition?.workbook_network_requests !== 0 || receipt.acquisition?.full_workbook_body_requests !== 0 || receipt.acquisition?.workbook_response_bytes !== 0 || receipt.acquisition?.source_records_acquired !== 0 || receipt.acquisition?.current_pointer_written !== false) {
    throw new Error("USDA INTEGRITY preflight exceeds its metadata-only boundary.");
  }
  if (receipt.official_history?.method !== "GET" || receipt.official_history?.status !== 200 || receipt.official_history?.content_type !== "text/html" || !Number.isInteger(receipt.official_history?.response_body_bytes) || receipt.official_history.response_body_bytes <= 0 || receipt.official_history.response_body_bytes > 64 * 1024) throw new Error("USDA INTEGRITY history preflight evidence is invalid.");
  const candidate = receipt.candidate_monthly_workbook;
  if (candidate?.discovery !== "exact-link-in-bounded-official-history-html" || candidate?.network_request_made !== false || candidate?.content_length !== null || candidate?.content_hash !== null || candidate?.workbook_schema_status !== "unverified-awaiting-authorized-source-inspection" || !/^\d{4}-(?:0[1-9]|1[0-2])-01$/.test(candidate?.report_month ?? "")) throw new Error("USDA INTEGRITY workbook discovery evidence is invalid.");
  const intake = receipt.pinned_intake_contract;
  if (intake?.fixture_workbook_schema_fingerprint !== USDA_INTEGRITY_WORKBOOK_SCHEMA_FINGERPRINT || intake?.official_workbook_schema_status !== "unverified-awaiting-authorized-source-inspection" || intake?.contract_scope !== "synthetic-conformance-fixture-not-asserted-as-official-workbook-layout" || intake?.source_snapshot_program_scope !== "USDA NOP" || intake?.selected_country_code !== "USA" || intake?.selected_country_source_name !== "UNITED STATES OF AMERICA (THE)" || intake?.selected_status !== "Certified" || JSON.stringify(intake?.status_vocabulary) !== JSON.stringify(USDA_INTEGRITY_STATUS_VOCABULARY)) throw new Error("USDA INTEGRITY preflight intake contract drifted.");
  assertHistoryUrl(receipt.official_history?.url);
  assertWorkbookUrl(receipt.candidate_monthly_workbook?.url);
  const observed = Date.parse(receipt.observed_at);
  if (!Number.isFinite(observed) || now().getTime() - observed < 0 || now().getTime() - observed > maximumAgeMs) throw new Error("USDA INTEGRITY preflight is outside the permitted freshness window.");
  return receipt;
}

export async function writeUsdaIntegrityPreflightReceipt({ receipt, outputRoot, appRoot = APP_ROOT, now = () => new Date() }) {
  validateUsdaIntegrityPreflight(receipt, { now });
  const root = await realpath(appRoot);
  const governedOutput = await validateWritableOutput(root, outputRoot, "USDA INTEGRITY preflight output");
  await mkdir(governedOutput, { recursive: true });
  const resolvedOutput = await realpath(governedOutput);
  assertContained(root, resolvedOutput, "USDA INTEGRITY preflight output");
  const filename = path.join(resolvedOutput, `preflight-${timestamp(receipt.observed_at)}-${receipt.receipt_fingerprint.slice(0, 12)}.json`);
  const body = Buffer.from(json(receipt));
  await writeFile(filename, body, { flag: "wx" });
  return { path: filename, bytes: body.length, sha256: sha256(body) };
}

export async function acquireUsdaOrganicIntegrity({ acknowledgement, preflight, fetchImpl = globalThis.fetch, now = () => new Date() } = {}) {
  if (acknowledgement !== USDA_INTEGRITY_LIVE_ACQUISITION_ACKNOWLEDGEMENT) throw new Error("USDA INTEGRITY live workbook acquisition is default-denied.");
  validateUsdaIntegrityPreflight(preflight, { now });
  void fetchImpl;
  throw new Error("USDA INTEGRITY live workbook acquisition is not implemented; no workbook request was made.");
}

function splitPostalCode(value) {
  const raw = text(value);
  if (!raw) return { zip_code: null, postal_code: null, zip4: null, source_postcode: null };
  const match = raw.match(/^(\d{5})(?:[- ]?(\d{4}))?$/);
  if (!match) throw new Error("invalid-us-postal-code");
  return { zip_code: match[1], postal_code: match[1], zip4: match[2] ?? null, source_postcode: raw };
}

function dateValue(value) {
  const raw = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw ?? "")) throw new Error("invalid-certification-effective-date");
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) throw new Error("invalid-certification-effective-date");
  return raw;
}

function addressFrom(row, prefix) {
  const state = text(row[`${prefix} State`])?.toUpperCase() ?? null;
  const address1 = text(row[`${prefix} Address 1`]);
  const address2 = text(row[`${prefix} Address 2`]);
  const city = text(row[`${prefix} City`]);
  const postal = splitPostalCode(row[`${prefix} Postal Code`]);
  const any = Boolean(address1 || address2 || city || state || postal.source_postcode);
  if (!any) return null;
  if (!address1 || !city || !state || !US_STATES_AND_TERRITORIES.has(state) || !postal.zip_code) throw new Error(`incomplete-${prefix.toLowerCase()}-address`);
  if (address1.length > 256 || (address2?.length ?? 0) > 256 || city.length > 64) throw new Error(`invalid-${prefix.toLowerCase()}-address-length`);
  return {
    address_line_1: address1,
    address_line_2: address2,
    city,
    state,
    ...postal,
    source_designation: prefix === "Physical" ? "source-designated-physical-address" : "source-designated-mailing-address",
    physical_site_asserted: false,
    geocoded: false,
    latitude: null,
    longitude: null,
  };
}

function operationId(value) {
  const result = text(value);
  if (!/^\d{10}$/.test(result ?? "")) throw new Error("invalid-operation-id");
  return result;
}

function selectedOperation(row) {
  if (text(row["Country Code"]) !== "USA" || text(row.Country) !== "UNITED STATES OF AMERICA (THE)") return { selected: false, reason: "not-united-states-of-america" };
  if (text(row.Status) !== "Certified") return { selected: false, reason: "not-certified" };
  return { selected: true, reason: null };
}

function validateTaxonomy(products) {
  const categoryNames = new Map();
  const itemNames = new Map();
  for (const row of products) {
    const categoryId = text(row["NOP Category ID"]);
    const itemId = text(row["NOP Item ID"]);
    const categoryName = text(row["NOP Category"]);
    const itemName = text(row["NOP Item Name"]);
    if (!/^\d+$/.test(categoryId ?? "") || !/^\d+$/.test(itemId ?? "") || !categoryName || !itemName) throw new Error("invalid-product-taxonomy");
    if (categoryName.length > 128 || itemName.length > 128) throw new Error("invalid-product-taxonomy");
    if (categoryNames.has(categoryId) && categoryNames.get(categoryId) !== categoryName) throw new Error("conflicting-category-taxonomy");
    if (itemNames.has(itemId) && itemNames.get(itemId) !== itemName) throw new Error("conflicting-item-taxonomy");
    categoryNames.set(categoryId, categoryName);
    itemNames.set(itemId, itemName);
  }
}

function buildRecord(row, children, context) {
  const id = operationId(row["Operation ID"]);
  const name = text(row["Operation Name"]);
  const certifier = text(row.Certifier);
  if (!name || name.length > 128) throw new Error("missing-or-invalid-operation-name");
  if (!certifier || certifier.length > 256) throw new Error("missing-or-invalid-certifier-name");
  const scopes = children.scopes.map((child) => text(child["NOP Scope"]));
  if (scopes.some((scope) => !USDA_INTEGRITY_SCOPE_VOCABULARY.includes(scope))) throw new Error("unsupported-nop-scope");
  if (scopes.length === 0) throw new Error("missing-certified-scope");
  const services = children.services.map((child) => text(child.Service));
  if (services.some((service) => !USDA_INTEGRITY_SERVICE_VOCABULARY.includes(service))) throw new Error("unsupported-operation-service");
  const products = children.products.map((child) => {
    const scope = text(child["NOP Scope"]);
    if (!USDA_INTEGRITY_SCOPE_VOCABULARY.includes(scope)) throw new Error("unsupported-product-scope");
    if (!scopes.includes(scope)) throw new Error("product-scope-not-certified-for-operation");
    return {
      nop_scope: scope,
      nop_category_id: text(child["NOP Category ID"]),
      nop_category: text(child["NOP Category"]),
      nop_item_id: text(child["NOP Item ID"]),
      nop_item_name: text(child["NOP Item Name"]),
    };
  });
  const physicalAddress = addressFrom(row, "Physical");
  const mailingAddress = addressFrom(row, "Mailing");
  if (!physicalAddress && !mailingAddress) throw new Error("missing-source-designated-address");
  const effectiveDate = dateValue(row["Effective Date of Operation Status"]);
  return {
    schema_version: USDA_INTEGRITY_SCHEMA_VERSION,
    normalized_record_id: `usda-organic-integrity:${id}`,
    entity_candidate: { organization_id: `organization:usda_organic_integrity_${id}`, identity_status: "provisional" },
    external_identifiers: [{ type: "usda_nop_operation_id", value: id, source_field: "Operation ID", format: "10-digit" }],
    name,
    certification: {
      program: "USDA NOP",
      country: {
        code: "USA",
        source_name: "UNITED STATES OF AMERICA (THE)",
        normalized_name: "United States of America",
      },
      status: "Certified",
      effective_date: effectiveDate,
      certifier_name: certifier,
      meaning: "Certification evidence only; not independent proof of current sales, establishment activity, or general business operation.",
    },
    addresses: {
      physical: physicalAddress,
      mailing: mailingAddress,
      meaning: "Source address designations are preserved; neither address is promoted to a verified operating establishment or geocode.",
    },
    certified_scopes: [...new Set(scopes)].sort(),
    certified_services: [...new Set(services)].sort(),
    product_taxonomy: products.sort((a, b) => `${a.nop_scope}:${a.nop_category_id}:${a.nop_item_id}`.localeCompare(`${b.nop_scope}:${b.nop_category_id}:${b.nop_item_id}`)),
    temporal_status: {
      source_snapshot_observed_at: context.observedAt,
      source_snapshot_reference_date: context.sourceSnapshotReferenceDate,
      source_workbook_linkage_status: USDA_INTEGRITY_SOURCE_LINKAGE_STATUS,
      first_seen: context.observedAt,
      last_seen: context.observedAt,
      valid_from: effectiveDate,
      valid_to: null,
      certification_effective_date: effectiveDate,
      current_sales_or_operation_asserted: false,
    },
    provenance: {
      source_id: USDA_INTEGRITY_CONNECTOR_ID,
      source_release_id: context.sourceReleaseId,
      source_record_id: id,
      source_workbook_sha256: context.sourceSha256,
      ingest_run_id: context.runId,
      transformation_version: USDA_INTEGRITY_TRANSFORMATION_VERSION,
      policy_id: "usda-organic-integrity",
      preflight_receipt_fingerprint: context.preflight.receipt_fingerprint,
    },
    export_policy: "local-review-only",
  };
}

function exactShape(value, expectedKeys, label, failures) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    failures.push(`${label}-shape`);
    return false;
  }
  const keys = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) failures.push(`${label}-shape`);
  return true;
}

function prohibitedKeysDeep(value, path_ = "$", failures = []) {
  if (!value || typeof value !== "object") return failures;
  if (Array.isArray(value)) {
    value.forEach((item, index) => prohibitedKeysDeep(item, `${path_}[${index}]`, failures));
    return failures;
  }
  for (const [key, child] of Object.entries(value)) {
    if (PROHIBITED_KEYS.test(key)) failures.push(`prohibited-field:${path_}.${key}`);
    prohibitedKeysDeep(child, `${path_}.${key}`, failures);
  }
  return failures;
}

function recordFailures(record) {
  const failures = [];
  exactShape(record, ["schema_version", "normalized_record_id", "entity_candidate", "external_identifiers", "name", "certification", "addresses", "certified_scopes", "certified_services", "product_taxonomy", "temporal_status", "provenance", "export_policy"], "record", failures);
  exactShape(record?.entity_candidate, ["organization_id", "identity_status"], "entity-candidate", failures);
  exactShape(record?.certification, ["program", "country", "status", "effective_date", "certifier_name", "meaning"], "certification", failures);
  exactShape(record?.certification?.country, ["code", "source_name", "normalized_name"], "country", failures);
  exactShape(record?.addresses, ["physical", "mailing", "meaning"], "addresses", failures);
  exactShape(record?.temporal_status, ["source_snapshot_observed_at", "source_snapshot_reference_date", "source_workbook_linkage_status", "first_seen", "last_seen", "valid_from", "valid_to", "certification_effective_date", "current_sales_or_operation_asserted"], "temporal-status", failures);
  exactShape(record?.provenance, ["source_id", "source_release_id", "source_record_id", "source_workbook_sha256", "ingest_run_id", "transformation_version", "policy_id", "preflight_receipt_fingerprint"], "provenance", failures);
  if (record?.schema_version !== USDA_INTEGRITY_SCHEMA_VERSION) failures.push("schema-version");
  if (!/^usda-organic-integrity:\d{10}$/.test(record?.normalized_record_id ?? "")) failures.push("normalized-record-id");
  const operationId_ = record?.external_identifiers?.[0]?.value;
  if (!Array.isArray(record?.external_identifiers) || record.external_identifiers.length !== 1) failures.push("external-identifiers-shape");
  else exactShape(record.external_identifiers[0], ["type", "value", "source_field", "format"], "external-identifier", failures);
  if (!/^\d{10}$/.test(operationId_ ?? "") || record.normalized_record_id !== `usda-organic-integrity:${operationId_}`) failures.push("operation-id");
  if (record?.entity_candidate?.organization_id !== `organization:usda_organic_integrity_${operationId_}` || record?.entity_candidate?.identity_status !== "provisional") failures.push("entity-candidate");
  if (record?.external_identifiers?.[0]?.type !== "usda_nop_operation_id" || record?.external_identifiers?.[0]?.source_field !== "Operation ID" || record?.external_identifiers?.[0]?.format !== "10-digit") failures.push("external-identifier");
  if (typeof record?.name !== "string" || !record.name.trim() || record.name.length > 128) failures.push("name");
  if (record?.certification?.program !== "USDA NOP" || record?.certification?.country?.code !== "USA" || record?.certification?.country?.source_name !== "UNITED STATES OF AMERICA (THE)" || record?.certification?.country?.normalized_name !== "United States of America" || record?.certification?.status !== "Certified") failures.push("selection-boundary");
  try { dateValue(record?.certification?.effective_date); } catch { failures.push("certification-fields"); }
  if (typeof record?.certification?.certifier_name !== "string" || !record.certification.certifier_name.trim() || record.certification.certifier_name.length > 256) failures.push("certification-fields");
  if (record?.certification?.meaning !== "Certification evidence only; not independent proof of current sales, establishment activity, or general business operation.") failures.push("certification-semantics");
  if (record?.addresses?.meaning !== "Source address designations are preserved; neither address is promoted to a verified operating establishment or geocode.") failures.push("address-semantics");
  if (record?.temporal_status?.current_sales_or_operation_asserted !== false) failures.push("operation-status-claim");
  if (record?.export_policy !== "local-review-only") failures.push("export-policy");
  if (!record?.addresses?.physical && !record?.addresses?.mailing) failures.push("missing-address-evidence");
  for (const [role, address] of [["physical", record?.addresses?.physical], ["mailing", record?.addresses?.mailing]]) {
    if (!address) continue;
    exactShape(address, ["address_line_1", "address_line_2", "city", "state", "zip_code", "postal_code", "zip4", "source_postcode", "source_designation", "physical_site_asserted", "geocoded", "latitude", "longitude"], "address", failures);
    if (address.zip_code !== address.postal_code || !/^\d{5}$/.test(address.zip_code ?? "") || (address.zip4 !== null && !/^\d{4}$/.test(address.zip4))) failures.push("postal-separation");
    if (String(address.source_postcode ?? "").replace(" ", "-") !== `${address.zip_code}${address.zip4 ? `-${address.zip4}` : ""}` || address.source_designation !== `source-designated-${role}-address` || !US_STATES_AND_TERRITORIES.has(address.state) || !text(address.address_line_1) || address.address_line_1.length > 256 || (address.address_line_2?.length ?? 0) > 256 || !text(address.city) || address.city.length > 64) failures.push("address-semantics");
    if (address.physical_site_asserted !== false || address.geocoded !== false || address.latitude !== null || address.longitude !== null) failures.push("invented-site-or-geocode");
  }
  if (!Array.isArray(record?.certified_scopes) || record.certified_scopes.length === 0 || record.certified_scopes.some((value) => !USDA_INTEGRITY_SCOPE_VOCABULARY.includes(value))) failures.push("scope-vocabulary");
  else if (new Set(record.certified_scopes).size !== record.certified_scopes.length) failures.push("duplicate-scope");
  if (!Array.isArray(record?.certified_services) || record.certified_services.some((value) => !USDA_INTEGRITY_SERVICE_VOCABULARY.includes(value))) failures.push("service-vocabulary");
  else if (new Set(record.certified_services).size !== record.certified_services.length) failures.push("duplicate-service");
  if (!Array.isArray(record?.product_taxonomy) || record.product_taxonomy.some((item) => !/^\d+$/.test(item.nop_category_id ?? "") || !/^\d+$/.test(item.nop_item_id ?? "") || !USDA_INTEGRITY_SCOPE_VOCABULARY.includes(item.nop_scope))) failures.push("product-taxonomy");
  else for (const item of record.product_taxonomy) exactShape(item, ["nop_scope", "nop_category_id", "nop_category", "nop_item_id", "nop_item_name"], "product-taxonomy-item", failures);
  if (Array.isArray(record?.product_taxonomy)) {
    const keys = record.product_taxonomy.map((item) => `${item.nop_scope}|${item.nop_category_id}|${item.nop_item_id}`);
    if (new Set(keys).size !== keys.length || record.product_taxonomy.some((item) => !record.certified_scopes?.includes(item.nop_scope))) failures.push("product-relationship");
  }
  const observedAt = record?.temporal_status?.source_snapshot_observed_at;
  if (record?.temporal_status?.certification_effective_date !== record?.certification?.effective_date
    || record?.temporal_status?.valid_from !== record?.certification?.effective_date
    || record?.temporal_status?.valid_to !== null
    || record?.temporal_status?.first_seen !== observedAt
    || record?.temporal_status?.last_seen !== observedAt
    || record?.temporal_status?.source_workbook_linkage_status !== USDA_INTEGRITY_SOURCE_LINKAGE_STATUS
    || !/^\d{4}-(?:0[1-9]|1[0-2])-01$/.test(record?.temporal_status?.source_snapshot_reference_date ?? "")
    || !isIsoInstant(observedAt)) failures.push("temporal-fields");
  if (record?.provenance?.source_id !== USDA_INTEGRITY_CONNECTOR_ID || record?.provenance?.source_record_id !== operationId_ || record?.provenance?.transformation_version !== USDA_INTEGRITY_TRANSFORMATION_VERSION || record?.provenance?.policy_id !== "usda-organic-integrity" || !/^[a-f0-9]{64}$/.test(record?.provenance?.source_workbook_sha256 ?? "") || !/^[a-f0-9]{64}$/.test(record?.provenance?.preflight_receipt_fingerprint ?? "") || !text(record?.provenance?.source_release_id) || !text(record?.provenance?.ingest_run_id)) failures.push("provenance-fields");
  const serialized = JSON.stringify(record);
  if (serialized.includes("geometry") || /"(?:latitude|longitude)":(?!null)/.test(serialized)) failures.push("geometry-or-geocode");
  prohibitedKeysDeep(record, "$", failures);
  if (/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/.test(serialized)) failures.push("email-content");
  return [...new Set(failures)];
}

async function writeArtifact(directory, relativePath, buffer, metadata = {}) {
  const destination = path.join(directory, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp-${randomUUID()}`;
  await writeFile(temporary, buffer, { flag: "wx" });
  await rename(temporary, destination);
  return { path: relativePath.replaceAll("\\", "/"), bytes: buffer.length, sha256: sha256(buffer), ...metadata };
}

function ensureUnique(rows, key, label) {
  const seen = new Set();
  for (const row of rows) {
    const value = key(row);
    if (seen.has(value)) throw new Error(`Duplicate USDA INTEGRITY ${label}.`);
    seen.add(value);
  }
}

function groupChildren(rows, operationIds, label) {
  const result = new Map();
  for (const row of rows) {
    const id = operationId(row["Operation ID"]);
    if (!operationIds.has(id)) throw new Error(`USDA INTEGRITY ${label} has an orphan Operation ID.`);
    const values = result.get(id) ?? [];
    values.push(row);
    result.set(id, values);
  }
  return result;
}

export async function buildUsdaOrganicIntegrityOffline({
  sourcePath,
  outputRoot,
  preflight,
  acknowledgement,
  expectedSourceSha256,
  runId = randomUUID(),
  now = () => new Date(),
  signal,
  maximumWorkbookBytes = 128 * 1024 * 1024,
  appRoot = APP_ROOT,
} = {}) {
  if (acknowledgement !== USDA_INTEGRITY_OFFLINE_ACKNOWLEDGEMENT) throw new Error("USDA INTEGRITY offline build is default-denied without the exact acknowledgement.");
  if (!/^[a-f0-9]{64}$/.test(expectedSourceSha256 ?? "")) throw new Error("USDA INTEGRITY offline build requires an exact lowercase SHA-256 source pin.");
  validateUsdaIntegrityPreflight(preflight, { now });
  checkCancelled(signal);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(runId)) throw new Error("USDA INTEGRITY run ID must be a version-4 UUID.");
  const lexicalSourceStats = await lstat(path.resolve(sourcePath));
  if (lexicalSourceStats.isSymbolicLink()) throw new Error("USDA INTEGRITY source must not be a symbolic link.");
  const governedPaths = await validateBuildPaths(appRoot, sourcePath, outputRoot);
  const sourceStats = await lstat(governedPaths.source);
  if (!sourceStats.isFile() || sourceStats.isSymbolicLink()) throw new Error("USDA INTEGRITY source must be a regular non-symlink file.");
  const sourceIdentity = await hashFile(governedPaths.source);
  if (sourceIdentity.sha256 !== expectedSourceSha256) throw new Error("USDA INTEGRITY source workbook SHA-256 does not match the operator pin.");
  const workbook = await readUsdaIntegrityWorkbook(governedPaths.source, { maximumArchiveBytes: maximumWorkbookBytes, signal });
  const operations = workbook.sheets.Operations;
  const operationIds = new Set();
  for (const row of operations) {
    const id = operationId(row["Operation ID"]);
    if (operationIds.has(id)) throw new Error("Duplicate USDA INTEGRITY Operation ID.");
    operationIds.add(id);
    if (!USDA_INTEGRITY_STATUS_VOCABULARY.includes(text(row.Status))) throw new Error("USDA INTEGRITY status vocabulary drifted.");
  }
  ensureUnique(workbook.sheets.Scopes, (row) => `${row["Operation ID"]}|${row["NOP Scope"]}`, "scope key");
  ensureUnique(workbook.sheets.Services, (row) => `${row["Operation ID"]}|${row.Service}`, "service key");
  ensureUnique(workbook.sheets.Products, (row) => Object.values(row).join("|"), "product taxonomy key");
  for (const row of workbook.sheets.Scopes) if (!USDA_INTEGRITY_SCOPE_VOCABULARY.includes(text(row["NOP Scope"]))) throw new Error("USDA INTEGRITY scope vocabulary drifted.");
  for (const row of workbook.sheets.Services) if (!USDA_INTEGRITY_SERVICE_VOCABULARY.includes(text(row.Service))) throw new Error("USDA INTEGRITY service vocabulary drifted.");
  for (const row of workbook.sheets.Products) if (!USDA_INTEGRITY_SCOPE_VOCABULARY.includes(text(row["NOP Scope"]))) throw new Error("USDA INTEGRITY product scope vocabulary drifted.");
  validateTaxonomy(workbook.sheets.Products);
  const scopes = groupChildren(workbook.sheets.Scopes, operationIds, "Scopes sheet");
  const services = groupChildren(workbook.sheets.Services, operationIds, "Services sheet");
  const products = groupChildren(workbook.sheets.Products, operationIds, "Products sheet");
  for (const [id, rows] of products) {
    const declaredScopes = new Set((scopes.get(id) ?? []).map((row) => text(row["NOP Scope"])));
    if (rows.some((row) => !declaredScopes.has(text(row["NOP Scope"])))) throw new Error("USDA INTEGRITY product scope has no matching operation scope.");
  }
  checkCancelled(signal);

  const observedAt = now().toISOString();
  const releaseId = `usda-organic-integrity-${timestamp(observedAt)}-${sourceIdentity.sha256.slice(0, 12)}`;
  const sourceReleaseId = `operator-supplied-usda-organic-integrity-conformance-${sourceIdentity.sha256.slice(0, 16)}`;
  const records = [];
  const filteredCounts = { "not-united-states-of-america": 0, "not-certified": 0 };
  for (const row of operations) {
    checkCancelled(signal);
    const selection = selectedOperation(row);
    if (!selection.selected) {
      filteredCounts[selection.reason] += 1;
      continue;
    }
    const id = operationId(row["Operation ID"]);
    const record = buildRecord(row, { scopes: scopes.get(id) ?? [], services: services.get(id) ?? [], products: products.get(id) ?? [] }, {
      observedAt,
      sourceSnapshotReferenceDate: preflight.candidate_monthly_workbook.report_month,
      sourceReleaseId,
      sourceSha256: sourceIdentity.sha256,
      runId,
      preflight,
    });
    const failures = recordFailures(record);
    if (failures.length) throw new Error(`USDA INTEGRITY normalized record failed: ${failures.join(", ")}.`);
    records.push(record);
  }
  const resolvedRoot = governedPaths.output;
  await mkdir(resolvedRoot, { recursive: true });
  const realOutputRoot = await realpath(resolvedRoot);
  assertContained(governedPaths.root, realOutputRoot, "USDA INTEGRITY output");
  const stagingRoot = path.join(realOutputRoot, ".staging");
  await mkdir(stagingRoot, { recursive: true });
  const realStagingRoot = await realpath(stagingRoot);
  assertContained(governedPaths.root, realStagingRoot, "USDA INTEGRITY staging root");
  const stagingDirectory = path.join(realStagingRoot, runId);
  assertContained(governedPaths.root, stagingDirectory, "USDA INTEGRITY staging directory");
  await mkdir(stagingDirectory, { recursive: false });
  const realStagingDirectory = await realpath(stagingDirectory);
  assertContained(governedPaths.root, realStagingDirectory, "USDA INTEGRITY staging directory");
  const recordsBody = Buffer.from(records.map((record) => JSON.stringify(record)).join("\n") + (records.length ? "\n" : ""));
  const recordsCompressed = gzipSync(recordsBody, { level: 9 });
  const recordsArtifact = await writeArtifact(realStagingDirectory, "normalized/operations.jsonl.gz", recordsCompressed, {
    artifact_type: "normalized-usda-organic-integrity-certified-operation-jsonl-gzip",
    record_count: records.length,
    export_policy: "local-review-only",
  });
  const manifest = {
    manifest_version: "1.0.0",
    dataset_id: USDA_INTEGRITY_CONNECTOR_ID,
    release_id: releaseId,
    run_id: runId,
    status: "verified-staging-local-review-only",
    connector_version: USDA_INTEGRITY_CONNECTOR_VERSION,
    transformation_version: USDA_INTEGRITY_TRANSFORMATION_VERSION,
    schema_version: USDA_INTEGRITY_SCHEMA_VERSION,
    observed_at: observedAt,
    source: {
      publisher: "USDA Agricultural Marketing Service, National Organic Program",
      history_url: USDA_INTEGRITY_HISTORY_URL,
      candidate_monthly_workbook_url: preflight.candidate_monthly_workbook.url,
      candidate_report_month: preflight.candidate_monthly_workbook.report_month,
      source_release_id: sourceReleaseId,
      source_workbook_linkage_status: USDA_INTEGRITY_SOURCE_LINKAGE_STATUS,
      operator_supplied_workbook_sha256: sourceIdentity.sha256,
      operator_supplied_workbook_bytes: sourceIdentity.bytes,
      publisher_checksum_available: false,
      preflight_receipt_fingerprint: preflight.receipt_fingerprint,
      fixture_workbook_schema_fingerprint: USDA_INTEGRITY_WORKBOOK_SCHEMA_FINGERPRINT,
      official_workbook_schema_status: "unverified-awaiting-authorized-source-inspection",
    },
    intake_contract: {
      scope: "synthetic-conformance-fixture-not-asserted-as-official-workbook-layout",
      sheet_names: Object.keys(USDA_INTEGRITY_WORKBOOK_SHEETS),
      sheet_headers: USDA_INTEGRITY_WORKBOOK_SHEETS,
    },
    selection: { source_snapshot_program_scope: "USDA NOP", country_code: "USA", source_country_name: "UNITED STATES OF AMERICA (THE)", normalized_country_name: "United States of America", status: "Certified" },
    vocabularies: {
      source_statuses: USDA_INTEGRITY_STATUS_VOCABULARY,
      nop_scopes: USDA_INTEGRITY_SCOPE_VOCABULARY,
      services: USDA_INTEGRITY_SERVICE_VOCABULARY,
    },
    coverage: {
      source_operations: operations.length,
      selected_certified_usda_nop_us_operations: records.length,
      filtered_not_united_states_of_america: filteredCounts["not-united-states-of-america"],
      filtered_not_certified: filteredCounts["not-certified"],
      source_scope_rows: workbook.sheets.Scopes.length,
      source_service_rows: workbook.sheets.Services.length,
      source_product_rows: workbook.sheets.Products.length,
      physical_sites: 0,
      establishments: 0,
      business_geocodes: 0,
      complete_all_active_businesses: false,
    },
    semantics: {
      certification_is_current_sales_or_operation_proof: false,
      physical_address_is_verified_operating_site: false,
      coordinates_invented_or_geocoded: false,
      zip5_and_zip4_joined: false,
      contacts_or_person_fields_exported: false,
      product_free_text_exported: false,
    },
    publication: {
      export_policy: "local-review-only",
      production_pointer_published: false,
      current_json_written: false,
      registry_admission: false,
      heatmap_admission: false,
    },
    artifacts: [recordsArtifact],
  };
  const manifestPath = path.join(realStagingDirectory, "manifest.json");
  await writeFile(manifestPath, json(manifest), { flag: "wx" });
  await verifyUsdaOrganicIntegrityOffline(manifestPath);
  return { manifest, manifestPath, stagingDirectory: realStagingDirectory };
}

export async function verifyUsdaOrganicIntegrityOffline(manifestPath) {
  const failures = [];
  let manifest;
  let resolvedManifestPath;
  try {
    const manifestStats = await lstat(path.resolve(manifestPath));
    if (!manifestStats.isFile() || manifestStats.isSymbolicLink()) throw new Error("manifest-not-regular-file");
    resolvedManifestPath = await realpath(manifestPath);
    manifest = JSON.parse(await readFile(resolvedManifestPath, "utf8"));
  } catch {
    throw new Error("USDA INTEGRITY offline staging manifest is unreadable.");
  }
  const releaseDirectory = path.dirname(resolvedManifestPath);
  const rootStats = await stat(releaseDirectory);
  if (!rootStats.isDirectory()) failures.push({ reason: "release-directory" });
  if (manifest.dataset_id !== USDA_INTEGRITY_CONNECTOR_ID || manifest.connector_version !== USDA_INTEGRITY_CONNECTOR_VERSION || manifest.schema_version !== USDA_INTEGRITY_SCHEMA_VERSION) failures.push({ reason: "manifest-identity" });
  if (manifest.status !== "verified-staging-local-review-only") failures.push({ reason: "manifest-status" });
  if (!isIsoInstant(manifest.observed_at)
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(manifest.run_id ?? "")
    || manifest.release_id !== `usda-organic-integrity-${timestamp(manifest.observed_at ?? "")}-${manifest.source?.operator_supplied_workbook_sha256?.slice(0, 12)}`) failures.push({ reason: "manifest-release-identity" });
  if (manifest.source?.fixture_workbook_schema_fingerprint !== USDA_INTEGRITY_WORKBOOK_SCHEMA_FINGERPRINT || manifest.source?.official_workbook_schema_status !== "unverified-awaiting-authorized-source-inspection") failures.push({ reason: "workbook-schema-fingerprint" });
  if (manifest.intake_contract?.scope !== "synthetic-conformance-fixture-not-asserted-as-official-workbook-layout" || JSON.stringify(manifest.intake_contract?.sheet_names) !== JSON.stringify(Object.keys(USDA_INTEGRITY_WORKBOOK_SHEETS)) || JSON.stringify(manifest.intake_contract?.sheet_headers) !== JSON.stringify(USDA_INTEGRITY_WORKBOOK_SHEETS)) failures.push({ reason: "manifest-intake-contract" });
  if (!/^[a-f0-9]{64}$/.test(manifest.source?.operator_supplied_workbook_sha256 ?? "")
    || !/^[a-f0-9]{64}$/.test(manifest.source?.preflight_receipt_fingerprint ?? "")
    || manifest.source?.source_release_id !== `operator-supplied-usda-organic-integrity-conformance-${manifest.source?.operator_supplied_workbook_sha256?.slice(0, 16)}`
    || manifest.source?.source_workbook_linkage_status !== USDA_INTEGRITY_SOURCE_LINKAGE_STATUS
    || !/^\d{4}-(?:0[1-9]|1[0-2])-01$/.test(manifest.source?.candidate_report_month ?? "")) failures.push({ reason: "manifest-source-provenance" });
  try {
    if (manifest.source?.publisher !== "USDA Agricultural Marketing Service, National Organic Program"
      || assertHistoryUrl(manifest.source?.history_url).href !== USDA_INTEGRITY_HISTORY_URL) throw new Error("source-identity");
    const workbookUrl = assertWorkbookUrl(manifest.source?.candidate_monthly_workbook_url);
    const workbookMonth = workbookUrl.pathname.match(/INTEGRITY_Data_(\d{4})(\d{2})01\.xlsx$/);
    if (!workbookMonth || manifest.source?.candidate_report_month !== `${workbookMonth[1]}-${workbookMonth[2]}-01`) throw new Error("source-month");
  } catch {
    failures.push({ reason: "manifest-source-identity" });
  }
  if (manifest.selection?.source_snapshot_program_scope !== "USDA NOP" || manifest.selection?.country_code !== "USA" || manifest.selection?.source_country_name !== "UNITED STATES OF AMERICA (THE)" || manifest.selection?.normalized_country_name !== "United States of America" || manifest.selection?.status !== "Certified") failures.push({ reason: "manifest-selection" });
  if (JSON.stringify(manifest.vocabularies?.source_statuses) !== JSON.stringify(USDA_INTEGRITY_STATUS_VOCABULARY) || JSON.stringify(manifest.vocabularies?.nop_scopes) !== JSON.stringify(USDA_INTEGRITY_SCOPE_VOCABULARY) || JSON.stringify(manifest.vocabularies?.services) !== JSON.stringify(USDA_INTEGRITY_SERVICE_VOCABULARY)) failures.push({ reason: "manifest-vocabularies" });
  if (manifest.publication?.export_policy !== "local-review-only" || manifest.publication?.production_pointer_published !== false || manifest.publication?.current_json_written !== false || manifest.publication?.registry_admission !== false || manifest.publication?.heatmap_admission !== false) failures.push({ reason: "publication-boundary" });
  if (manifest.semantics?.certification_is_current_sales_or_operation_proof !== false || manifest.semantics?.physical_address_is_verified_operating_site !== false || manifest.semantics?.coordinates_invented_or_geocoded !== false || manifest.semantics?.zip5_and_zip4_joined !== false || manifest.semantics?.contacts_or_person_fields_exported !== false || manifest.semantics?.product_free_text_exported !== false) failures.push({ reason: "semantic-boundary" });
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length !== 1) failures.push({ reason: "artifact-contract" });
  const records = [];
  for (const artifact of manifest.artifacts ?? []) {
    const candidate = path.resolve(releaseDirectory, artifact.path ?? "");
    const relative = path.relative(releaseDirectory, candidate);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      failures.push({ reason: "artifact-path-escape" });
      continue;
    }
    try {
      const lexicalStats = await lstat(candidate);
      if (!lexicalStats.isFile() || lexicalStats.isSymbolicLink()) {
        failures.push({ path: artifact.path, reason: "artifact-not-regular-file" });
        continue;
      }
      const resolvedCandidate = await realpath(candidate);
      assertContained(releaseDirectory, resolvedCandidate, "USDA INTEGRITY artifact");
      const body = await readFile(resolvedCandidate);
      if (body.length !== artifact.bytes || sha256(body) !== artifact.sha256) {
        failures.push({ path: artifact.path, reason: "artifact-checksum" });
        continue;
      }
      if (artifact.artifact_type !== "normalized-usda-organic-integrity-certified-operation-jsonl-gzip" || artifact.export_policy !== "local-review-only") failures.push({ path: artifact.path, reason: "artifact-policy" });
      const lines = gunzipSync(body, { maxOutputLength: USDA_INTEGRITY_MAXIMUM_NORMALIZED_ARTIFACT_BYTES }).toString("utf8").split("\n").filter(Boolean);
      if (lines.length !== artifact.record_count) failures.push({ path: artifact.path, reason: "artifact-record-count" });
      for (const line of lines) {
        const record = JSON.parse(line);
        const semanticFailures = recordFailures(record);
        for (const reason of semanticFailures) failures.push({ path: artifact.path, record_id: record.normalized_record_id, reason });
        if (record.provenance?.source_release_id !== manifest.source?.source_release_id
          || record.provenance?.source_workbook_sha256 !== manifest.source?.operator_supplied_workbook_sha256
          || record.provenance?.ingest_run_id !== manifest.run_id
          || record.provenance?.preflight_receipt_fingerprint !== manifest.source?.preflight_receipt_fingerprint
          || record.temporal_status?.source_snapshot_reference_date !== manifest.source?.candidate_report_month
          || record.temporal_status?.source_workbook_linkage_status !== manifest.source?.source_workbook_linkage_status) failures.push({ path: artifact.path, record_id: record.normalized_record_id, reason: "manifest-record-provenance-link" });
        records.push(record);
      }
    } catch (error) {
      failures.push({ path: artifact.path, reason: `artifact-unreadable:${error.message}` });
    }
  }
  const ids = new Set(records.map((record) => record.normalized_record_id));
  if (ids.size !== records.length) failures.push({ reason: "duplicate-normalized-record-id" });
  if (manifest.coverage?.selected_certified_usda_nop_us_operations !== records.length) failures.push({ reason: "coverage-record-count" });
  const sourceCount = Number(manifest.coverage?.source_operations);
  const partitions = Number(manifest.coverage?.selected_certified_usda_nop_us_operations)
    + Number(manifest.coverage?.filtered_not_united_states_of_america)
    + Number(manifest.coverage?.filtered_not_certified);
  if (!Number.isInteger(sourceCount) || sourceCount !== partitions) failures.push({ reason: "selection-reconciliation" });
  if (failures.length) {
    const error = new Error("USDA INTEGRITY offline staging verification failed.");
    error.failures = failures;
    throw error;
  }
  return {
    status: "verified-staging-local-review-only",
    dataset_id: manifest.dataset_id,
    release_id: manifest.release_id,
    records: records.length,
    production_pointer_published: false,
  };
}
