import { createHash } from "node:crypto";
import unzipper from "unzipper";

export const USDA_INTEGRITY_API_ACKNOWLEDGEMENT = "I-APPROVE-USDA-INTEGRITY-API-SNAPSHOT-REQUEST";
export const USDA_INTEGRITY_API_BASE = "https://organicapi.ams.usda.gov/IntegrityPubDataServices/OIDPublicAPI";
const MAX_ARCHIVE_BYTES = 134_217_728;
const MAX_EXPANDED_BYTES = 1_073_741_824;
const MAX_ENTRIES = 16;

function abort(signal) {
  if (signal?.aborted) throw signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
}

function fail(message) {
  throw new Error(`USDA Organic INTEGRITY API acquisition failed: ${message}`);
}

function validKey(value) {
  return typeof value === "string" && value.length >= 8 && value.length <= 256 && /^[A-Za-z0-9_-]+$/.test(value);
}

async function boundedBody(response, maximumBytes, signal) {
  const reader = response.body?.getReader?.();
  if (!reader) fail("response body is unavailable");
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      abort(signal);
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximumBytes) {
        await reader.cancel("bounded-api-archive-exceeded-limit");
        fail("archive exceeded the configured byte limit");
      }
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    try { await reader.cancel("api-archive-read-failed"); } catch { /* primary error wins */ }
    throw error;
  }
  return Buffer.concat(chunks, bytes);
}

export async function inspectUsdaOrganicIntegrityApiArchive(archive, { signal, maximumExpandedBytes = MAX_EXPANDED_BYTES, maximumEntries = MAX_ENTRIES } = {}) {
  abort(signal);
  if (!Buffer.isBuffer(archive) || archive.length < 22 || archive.length > MAX_ARCHIVE_BYTES) fail("archive bytes are outside the bounded contract");
  if (!Number.isSafeInteger(maximumExpandedBytes) || maximumExpandedBytes < 1 || maximumExpandedBytes > MAX_EXPANDED_BYTES
      || !Number.isSafeInteger(maximumEntries) || maximumEntries < 1 || maximumEntries > MAX_ENTRIES) fail("archive limits are invalid");
  let directory;
  try { directory = await unzipper.Open.buffer(archive); } catch { fail("response is not a valid ZIP archive"); }
  if (!directory.files.length || directory.files.length > maximumEntries) fail("archive entry count is outside the bounded contract");
  let expandedBytes = 0;
  const entries = [];
  for (const entry of directory.files) {
    abort(signal);
    const normalized = String(entry.path ?? "").replaceAll("\\", "/");
    if (entry.type !== "File" || !/^[A-Za-z0-9][A-Za-z0-9._/-]*\.xml$/i.test(normalized)
        || normalized.startsWith("/") || normalized.split("/").some((part) => !part || part === "." || part === "..")) fail("archive contains an unsafe or non-XML entry");
    if (!Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize < 1) fail("archive entry size is invalid");
    expandedBytes += entry.uncompressedSize;
    if (expandedBytes > maximumExpandedBytes) fail("archive expanded bytes exceed the configured limit");
    entries.push({ path: normalized, compressed_bytes: entry.compressedSize, expanded_bytes: entry.uncompressedSize });
  }
  return { entry_count: entries.length, expanded_bytes: expandedBytes, entries };
}

export async function requestUsdaOrganicIntegrityApiArchive({
  apiKey,
  acknowledgement,
  fetchImpl = globalThis.fetch,
  signal,
  maximumArchiveBytes = MAX_ARCHIVE_BYTES,
} = {}) {
  abort(signal);
  if (acknowledgement !== USDA_INTEGRITY_API_ACKNOWLEDGEMENT) fail("exact acknowledgement is required before dispatch");
  if (!validKey(apiKey)) fail("named credential is missing or malformed");
  if (typeof fetchImpl !== "function") fail("transport is unavailable");
  if (!Number.isSafeInteger(maximumArchiveBytes) || maximumArchiveBytes < 1 || maximumArchiveBytes > MAX_ARCHIVE_BYTES) fail("archive byte limit is invalid");
  const url = new URL(`${USDA_INTEGRITY_API_BASE}/GetAllOperationsPublicData`);
  url.searchParams.set("api_key", apiKey);
  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      redirect: "error",
      headers: { Accept: "application/zip, application/octet-stream" },
      signal,
    });
  } catch (error) {
    if (signal?.aborted) abort(signal);
    void error;
    fail("request did not complete");
  }
  if (!response || response.status !== 200) {
    try { await response?.body?.cancel?.("api-status-rejected"); } catch { /* response is untrusted */ }
    fail("publisher returned a non-success status");
  }
  const declared = Number(response.headers.get("content-length"));
  if (response.headers.has("content-length") && (!Number.isSafeInteger(declared) || declared < 1 || declared > maximumArchiveBytes)) {
    try { await response.body?.cancel?.("api-content-length-rejected"); } catch { /* response is untrusted */ }
    fail("declared archive size is outside the configured limit");
  }
  const contentType = String(response.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase();
  if (!["application/zip", "application/x-zip-compressed", "application/octet-stream"].includes(contentType)) {
    try { await response.body?.cancel?.("api-content-type-rejected"); } catch { /* response is untrusted */ }
    fail("publisher returned an unexpected content type");
  }
  const archive = await boundedBody(response, maximumArchiveBytes, signal);
  const inspection = await inspectUsdaOrganicIntegrityApiArchive(archive, { signal });
  return {
    archive,
    receipt: {
      schema_version: "usda-organic-integrity-api-acquisition-receipt@1.0.0",
      endpoint: "GetAllOperationsPublicData",
      method: "GET",
      request_count: 1,
      response_bytes: archive.length,
      response_sha256: createHash("sha256").update(archive).digest("hex"),
      archive: inspection,
      credential_reference: "DATA_GOV_API_KEY",
      credential_value_retained: false,
      redirect_policy: "deny",
      production_admission: false,
      current_pointer_written: false,
    },
  };
}
