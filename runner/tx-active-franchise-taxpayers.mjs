import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const TX_ACTIVE_FRANCHISE_SCHEMA_VERSION = "1.1.0";
export const TX_ACTIVE_FRANCHISE_CONNECTOR_VERSION = "tx-active-franchise-taxpayers@1.1.0";
export const TX_ACTIVE_FRANCHISE_DATASET_ID = "9cir-efmm";
export const TX_ACTIVE_FRANCHISE_METADATA_URL = `https://data.texas.gov/api/views/${TX_ACTIVE_FRANCHISE_DATASET_ID}`;
export const TX_ACTIVE_FRANCHISE_COUNT_URL = `https://data.texas.gov/resource/${TX_ACTIVE_FRANCHISE_DATASET_ID}.json?$select=count(*)`;
export const TX_ACTIVE_FRANCHISE_LARGE_ACQUISITION_ACKNOWLEDGEMENT = "I-APPROVE-TX-FRANCHISE-3.4M-ROW-ACQUISITION";
export const TX_ACTIVE_FRANCHISE_SCHEMA_FINGERPRINT = "69878a85fb44b1c3541fb7477474c837252932a3cc1dfc1dc39e23a1f42117ac";

export const TX_ACTIVE_FRANCHISE_SOURCE_SCHEMA = Object.freeze([
  { position: 2, fieldName: "taxpayer_number", name: "Taxpayer Number", dataTypeName: "text" },
  { position: 3, fieldName: "taxpayer_name", name: "Taxpayer Name", dataTypeName: "text" },
  { position: 4, fieldName: "taxpayer_address", name: "Taxpayer Address", dataTypeName: "text" },
  { position: 5, fieldName: "taxpayer_city", name: "Taxpayer City", dataTypeName: "text" },
  { position: 6, fieldName: "taxpayer_state", name: "Taxpayer State", dataTypeName: "text" },
  { position: 7, fieldName: "taxpayer_zip", name: "Taxpayer Zip", dataTypeName: "text" },
  { position: 8, fieldName: "taxpayer_county_code", name: "Taxpayer County Code", dataTypeName: "number" },
  { position: 9, fieldName: "taxpayer_organizational_type", name: "Taxpayer Organizational Type", dataTypeName: "text" },
  { position: 10, fieldName: "record_type_code", name: "Record Type Code", dataTypeName: "text" },
  { position: 11, fieldName: "responsibility_beginning_date", name: "Responsibility Beginning Date", dataTypeName: "calendar_date" },
  { position: 12, fieldName: "secretary_of_state_sos_or_coa_file_number", name: "  Secretary of State (SOS) or COA File Number", dataTypeName: "text" },
  { position: 13, fieldName: "sos_charter_date", name: "SOS Charter Date", dataTypeName: "calendar_date" },
  { position: 14, fieldName: "sos_status_date", name: "SOS Status Date ", dataTypeName: "calendar_date" },
  { position: 15, fieldName: "sos_status_code", name: "SOS Status Code", dataTypeName: "text" },
  { position: 16, fieldName: "right_to_transact_business_code", name: "Right to Transact Business Code", dataTypeName: "text" },
  { position: 17, fieldName: "current_exempt_reason_code", name: "Current Exempt Reason Code", dataTypeName: "text" },
  { position: 18, fieldName: "exempt_begin_date", name: "Exempt Begin Date", dataTypeName: "calendar_date" },
  { position: 19, fieldName: "_621111", name: "NAICS Code", dataTypeName: "text" },
].map((column) => Object.freeze(column)));

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sourceTimestamp(value) {
  const instant = Number.isSafeInteger(value) && value > 0 ? new Date(value * 1000) : new Date(value);
  if (Number.isNaN(instant.getTime())) throw new Error("Texas Active Franchise Taxpayers rowsUpdatedAt is invalid.");
  return instant.toISOString();
}

function retryDelay(response, attempt) {
  const retryAfter = Number(response?.headers?.get?.("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter >= 0) return Math.min(retryAfter * 1000, 30_000);
  return Math.min(500 * (2 ** attempt), 8_000);
}

async function readBoundedResponse(response, maximumResponseBytes) {
  if (!response.body?.getReader) {
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length > maximumResponseBytes) throw new Error("Texas franchise response exceeds the byte limit.");
    return body;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      bytes += chunk.length;
      if (bytes > maximumResponseBytes) {
        await reader.cancel("response byte limit exceeded").catch(() => undefined);
        throw new Error("Texas franchise response exceeds the byte limit.");
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, bytes);
}

function schemaValue(schema) {
  return schema.map(({ position, fieldName, name, dataTypeName }) => `${position}:${fieldName}:${name}:${dataTypeName}`).join("\u0000");
}

export function txActiveFranchiseSchemaFingerprint(columns) {
  const selected = (columns ?? []).map(({ position, fieldName, name, dataTypeName }) => ({ position, fieldName, name, dataTypeName }));
  return sha256(schemaValue(selected));
}

function exactColumnSchema(columns) {
  if (!Array.isArray(columns) || columns.length !== TX_ACTIVE_FRANCHISE_SOURCE_SCHEMA.length) {
    throw new Error("Texas Active Franchise Taxpayers schema must contain exactly 18 fields.");
  }
  for (let index = 0; index < TX_ACTIVE_FRANCHISE_SOURCE_SCHEMA.length; index += 1) {
    const expected = TX_ACTIVE_FRANCHISE_SOURCE_SCHEMA[index];
    const actual = columns[index];
    for (const key of ["position", "fieldName", "name", "dataTypeName"]) {
      if (actual?.[key] !== expected[key]) {
        throw new Error(`Texas Active Franchise Taxpayers schema drifted at column ${index + 1} (${key}).`);
      }
    }
  }
  const fingerprint = txActiveFranchiseSchemaFingerprint(columns);
  if (fingerprint !== TX_ACTIVE_FRANCHISE_SCHEMA_FINGERPRINT) {
    throw new Error(`Texas Active Franchise Taxpayers schema fingerprint drifted (${fingerprint}).`);
  }
  return fingerprint;
}

export function validateTxActiveFranchiseMetadata(metadata) {
  if (metadata?.id !== TX_ACTIVE_FRANCHISE_DATASET_ID || metadata?.name !== "Active Franchise Taxpayers") {
    throw new Error("Unexpected Texas Active Franchise Taxpayers catalog identity.");
  }
  if (metadata?.attribution !== "Texas Comptroller of Public Accounts") {
    throw new Error("Unexpected Texas Active Franchise Taxpayers publisher attribution.");
  }
  if ((metadata?.licenseId ?? null) !== null) {
    throw new Error("Texas Active Franchise Taxpayers catalog license status changed; policy review is required.");
  }
  return {
    rowsUpdatedAt: sourceTimestamp(metadata.rowsUpdatedAt),
    schemaFingerprint: exactColumnSchema(metadata.columns),
  };
}

function assertAllowedUrl(urlValue, requestType) {
  let url;
  try {
    url = new URL(urlValue);
  } catch {
    throw new Error(`Texas franchise ${requestType} URL is invalid.`);
  }
  if (url.protocol !== "https:" || url.hostname !== "data.texas.gov" || url.username || url.password || url.port || url.hash) {
    throw new Error(`Texas franchise ${requestType} URL is not allowed.`);
  }
  if (requestType === "metadata") {
    if (url.pathname !== `/api/views/${TX_ACTIVE_FRANCHISE_DATASET_ID}` || url.search) {
      throw new Error("Texas franchise metadata path or query is not allowed.");
    }
    return url;
  }
  if (requestType === "count") {
    const keys = [...url.searchParams.keys()];
    if (url.pathname !== `/resource/${TX_ACTIVE_FRANCHISE_DATASET_ID}.json`
      || keys.length !== 1
      || keys[0] !== "$select"
      || url.searchParams.get("$select") !== "count(*)") {
      throw new Error("Texas franchise count path or query is not allowed; row-returning requests are forbidden.");
    }
    return url;
  }
  throw new Error("Texas franchise requests are limited to metadata and count-only operations.");
}

export async function requestTxActiveFranchiseJson(urlValue, {
  requestType,
  fetchImpl = fetch,
  signal,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  attempts = 4,
  maximumResponseBytes = requestType === "count" ? 16_384 : 2_000_000,
} = {}) {
  const url = assertAllowedUrl(urlValue, requestType);
  if (!Number.isSafeInteger(maximumResponseBytes) || maximumResponseBytes < 1) throw new Error("maximumResponseBytes must be a positive integer.");
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    signal?.throwIfAborted?.();
    let response;
    try {
      response = await fetchImpl(url, {
        redirect: "manual",
        signal,
        headers: {
          accept: "application/json",
          "user-agent": "CoTiveCollector/0.1 (+governed-metadata-count-preflight)",
        },
      });
    } catch (error) {
      lastError = error;
      if (error?.name === "AbortError" || attempt + 1 >= attempts) throw error;
      await sleep(Math.min(500 * (2 ** attempt), 8_000));
      continue;
    }
    if (response.status >= 300 && response.status < 400) {
      throw new Error(`Texas franchise ${requestType} redirect rejected (${response.status}).`);
    }
    if (!response.ok) {
      if ((response.status === 429 || response.status >= 500) && attempt + 1 < attempts) {
        await sleep(retryDelay(response, attempt));
        continue;
      }
      throw new Error(`Texas franchise ${requestType} request failed with HTTP ${response.status}.`);
    }
    const declaredBytes = Number(response.headers?.get?.("content-length"));
    if (Number.isFinite(declaredBytes) && declaredBytes > maximumResponseBytes) {
      throw new Error(`Texas franchise ${requestType} response exceeds the byte limit.`);
    }
    let body;
    try {
      body = await readBoundedResponse(response, maximumResponseBytes);
    } catch (error) {
      if (/response exceeds the byte limit/.test(error.message)) {
        throw new Error(`Texas franchise ${requestType} response exceeds the byte limit.`);
      }
      throw error;
    }
    try {
      return JSON.parse(body.toString("utf8"));
    } catch {
      throw new Error(`Texas franchise ${requestType} response was not valid JSON.`);
    }
  }
  throw lastError ?? new Error(`Texas franchise ${requestType} request exhausted retries.`);
}

function validateCountResponse(response, maximumRecordCount) {
  if (!Array.isArray(response) || response.length !== 1 || !response[0] || Object.keys(response[0]).length !== 1 || !Object.hasOwn(response[0], "count")) {
    throw new Error("Texas Active Franchise Taxpayers count-only response drifted.");
  }
  const countText = String(response[0].count ?? "");
  if (!/^\d+$/.test(countText)) throw new Error("Texas Active Franchise Taxpayers count is invalid.");
  const count = Number(countText);
  if (!Number.isSafeInteger(count) || count < 1 || count > maximumRecordCount) {
    throw new Error(`Texas Active Franchise Taxpayers count ${countText} is outside the preflight guardrail.`);
  }
  return count;
}

export function splitTxActiveFranchisePostcode(value) {
  const sourcePostcode = String(value ?? "").trim() || null;
  const match = sourcePostcode?.match(/^(\d{5})(?:-?(\d{4}))?$/);
  if (!match || match[1] === "00000") {
    return { zip_code: null, postal_code: null, zip4: null, source_postcode: sourcePostcode, status: sourcePostcode ? "unusable-source-postcode" : "source-postcode-unreported" };
  }
  return {
    zip_code: match[1],
    postal_code: match[1],
    zip4: match[2] ?? null,
    source_postcode: sourcePostcode,
    status: match[2] ? "normalized-us-zip-plus-4-separated" : "normalized-us-zip5",
  };
}

export async function preflightTxActiveFranchiseTaxpayers({
  fetchImpl = fetch,
  signal,
  sleep,
  now = () => new Date(),
  maximumMetadataResponseBytes = 2_000_000,
  maximumCountResponseBytes = 16_384,
  maximumRecordCount = 10_000_000,
} = {}) {
  if (!Number.isSafeInteger(maximumRecordCount) || maximumRecordCount < 1) throw new Error("maximumRecordCount must be a positive integer.");
  signal?.throwIfAborted?.();
  const metadata = await requestTxActiveFranchiseJson(TX_ACTIVE_FRANCHISE_METADATA_URL, {
    requestType: "metadata",
    fetchImpl,
    signal,
    sleep,
    maximumResponseBytes: maximumMetadataResponseBytes,
  });
  const catalog = validateTxActiveFranchiseMetadata(metadata);
  signal?.throwIfAborted?.();
  const countResponse = await requestTxActiveFranchiseJson(TX_ACTIVE_FRANCHISE_COUNT_URL, {
    requestType: "count",
    fetchImpl,
    signal,
    sleep,
    maximumResponseBytes: maximumCountResponseBytes,
  });
  const recordCount = validateCountResponse(countResponse, maximumRecordCount);
  const observedAt = now().toISOString();
  const sourceObservationFingerprint = sha256(JSON.stringify({
    dataset_id: TX_ACTIVE_FRANCHISE_DATASET_ID,
    source_rows_updated_at: catalog.rowsUpdatedAt,
    source_record_count: recordCount,
    schema_fingerprint: catalog.schemaFingerprint,
  }));
  return {
    schema_version: TX_ACTIVE_FRANCHISE_SCHEMA_VERSION,
    connector_id: "tx-active-franchise-taxpayers",
    connector_version: TX_ACTIVE_FRANCHISE_CONNECTOR_VERSION,
    status: "metadata-only-not-acquired-large-acquisition-default-denied",
    dataset_id: TX_ACTIVE_FRANCHISE_DATASET_ID,
    dataset_name: "Active Franchise Taxpayers",
    publisher: "Texas Comptroller of Public Accounts",
    metadata_url: TX_ACTIVE_FRANCHISE_METADATA_URL,
    count_url: TX_ACTIVE_FRANCHISE_COUNT_URL,
    observed_at: observedAt,
    source_rows_updated_at: catalog.rowsUpdatedAt,
    source_record_count: recordCount,
    source_schema: TX_ACTIVE_FRANCHISE_SOURCE_SCHEMA.map((column) => ({ ...column })),
    schema_fingerprint: catalog.schemaFingerprint,
    source_observation_fingerprint: sourceObservationFingerprint,
    catalog_license_id: null,
    license_status: "catalog-license-null-or-unreported-record-level-redistribution-not-approved",
    acquisition: {
      metadata_requests: 1,
      count_only_requests: 1,
      row_data_requests: 0,
      row_data_acquired: false,
      normalized_records_produced: 0,
      release_pointer_published: false,
      large_acquisition_status: "default-denied-and-unimplemented",
    },
    semantics: {
      taxpayer_address: "administrative-only-not-physical-site-or-geocode",
      operating_status: "not-asserted-by-franchise-tax-listing",
      automatic_reconciliation: "exact-taxpayer-number-only-after-separately-authorized-acquisition",
      postal_fields: "zip5-and-zip4-must-remain-separate",
      anomalous_naics_field: "bind-source-field-_621111-to-label-NAICS-Code-and-preserve-source-value",
    },
    export_policy: "internal-preflight-receipt-only",
  };
}

function releaseTimestamp(instant) {
  return instant.replaceAll(/[-:.]/g, "").replace("T", "-").replace("Z", "Z");
}

function assertMetadataOnlyPreflight(preflight) {
  if (!preflight || preflight.connector_id !== "tx-active-franchise-taxpayers"
    || preflight.connector_version !== TX_ACTIVE_FRANCHISE_CONNECTOR_VERSION
    || preflight.dataset_id !== TX_ACTIVE_FRANCHISE_DATASET_ID
    || preflight.status !== "metadata-only-not-acquired-large-acquisition-default-denied"
    || preflight.catalog_license_id !== null
    || preflight.schema_fingerprint !== TX_ACTIVE_FRANCHISE_SCHEMA_FINGERPRINT
    || txActiveFranchiseSchemaFingerprint(preflight.source_schema) !== TX_ACTIVE_FRANCHISE_SCHEMA_FINGERPRINT
    || preflight.acquisition?.metadata_requests !== 1
    || preflight.acquisition?.count_only_requests !== 1
    || preflight.acquisition?.row_data_requests !== 0
    || preflight.acquisition?.row_data_acquired !== false
    || preflight.acquisition?.normalized_records_produced !== 0
    || preflight.acquisition?.release_pointer_published !== false
    || !Number.isSafeInteger(preflight.source_record_count)
    || preflight.source_record_count < 1) {
    throw new Error("A validated metadata-only Texas franchise preflight receipt is required.");
  }
  const sourceUpdatedAt = new Date(preflight.source_rows_updated_at);
  const observedAt = new Date(preflight.observed_at);
  if (Number.isNaN(sourceUpdatedAt.getTime()) || sourceUpdatedAt.toISOString() !== preflight.source_rows_updated_at
    || Number.isNaN(observedAt.getTime()) || observedAt.toISOString() !== preflight.observed_at) {
    throw new Error("Texas franchise preflight timestamps are invalid.");
  }
  const fingerprint = sha256(JSON.stringify({
    dataset_id: TX_ACTIVE_FRANCHISE_DATASET_ID,
    source_rows_updated_at: preflight.source_rows_updated_at,
    source_record_count: preflight.source_record_count,
    schema_fingerprint: TX_ACTIVE_FRANCHISE_SCHEMA_FINGERPRINT,
  }));
  if (fingerprint !== preflight.source_observation_fingerprint) throw new Error("Texas franchise preflight observation fingerprint is invalid.");
}

export function validateTxActiveFranchisePreflightReceipt(preflight) {
  assertMetadataOnlyPreflight(preflight);
  return preflight;
}

export async function writeTxActiveFranchisePreflightReceipt({ receipt, outputRoot } = {}) {
  assertMetadataOnlyPreflight(receipt);
  if (!outputRoot) throw new Error("outputRoot is required for the preflight receipt.");
  const resolvedRoot = path.resolve(outputRoot);
  await mkdir(resolvedRoot, { recursive: true });
  const contents = Buffer.from(json(receipt), "utf8");
  const digest = sha256(contents);
  const filename = `tx-active-franchise-taxpayers-preflight-${releaseTimestamp(receipt.observed_at)}-${receipt.source_observation_fingerprint.slice(0, 16)}.json`;
  const destination = path.join(resolvedRoot, filename);
  try {
    await writeFile(destination, contents, { flag: "wx" });
  } catch (error) {
    if (error?.code === "EEXIST") throw new Error("Immutable Texas franchise preflight receipt already exists; refusing to overwrite it.");
    throw error;
  }
  return {
    path: destination,
    filename,
    bytes: contents.length,
    sha256: digest,
    artifact_type: "tx-active-franchise-taxpayers-immutable-preflight-receipt-json",
    export_policy: "internal",
  };
}

function assertPreflightForLargeGate(preflight) {
  try {
    assertMetadataOnlyPreflight(preflight);
  } catch {
    throw new Error("A fresh validated metadata-only Texas franchise preflight is required before large-acquisition approval.");
  }
}

export function authorizeTxActiveFranchiseLargeAcquisition({ acknowledgement, preflight } = {}) {
  if (acknowledgement !== TX_ACTIVE_FRANCHISE_LARGE_ACQUISITION_ACKNOWLEDGEMENT) {
    throw new Error(`Texas Active Franchise Taxpayers large acquisition is default-denied. Exact acknowledgement required: ${TX_ACTIVE_FRANCHISE_LARGE_ACQUISITION_ACKNOWLEDGEMENT}`);
  }
  assertPreflightForLargeGate(preflight);
  return Object.freeze({
    authorized: true,
    acknowledgement,
    source_observation_fingerprint: preflight.source_observation_fingerprint,
    source_record_count: preflight.source_record_count,
    scope: "authorization-gate-only-no-acquisition-implementation",
  });
}

export async function acquireTxActiveFranchiseTaxpayers(options = {}) {
  authorizeTxActiveFranchiseLargeAcquisition(options);
  options.signal?.throwIfAborted?.();
  void options.fetchImpl;
  throw new Error("Texas Active Franchise Taxpayers row acquisition is not implemented; no row request was sent.");
}
