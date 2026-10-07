import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import unzipper from "unzipper";

import { APP_ROOT } from "./paths.mjs";

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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function exists(value) {
  try { await lstat(value); return true; } catch (error) { if (error?.code === "ENOENT") return false; throw error; }
}

function assertContained(root, candidate, label) {
  const relative = path.relative(root, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) fail(`${label} escapes the governed datahub directory`);
}

async function governedOutput(appRoot, outputRoot) {
  const root = await realpath(appRoot);
  const output = path.resolve(outputRoot);
  assertContained(root, output, "snapshot output");
  let ancestor = output;
  while (true) {
    try {
      const resolved = await realpath(ancestor);
      assertContained(root, resolved, "snapshot output ancestor");
      break;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const parent = path.dirname(ancestor);
      if (parent === ancestor) fail("snapshot output has no governed existing ancestor");
      ancestor = parent;
    }
  }
  await mkdir(output, { recursive: true });
  const resolved = await realpath(output);
  assertContained(root, resolved, "snapshot output");
  return resolved;
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
      response_sha256: sha256(archive),
      archive: inspection,
      credential_reference: "DATA_GOV_API_KEY",
      credential_value_retained: false,
      redirect_policy: "deny",
      production_admission: false,
      current_pointer_written: false,
    },
  };
}

export async function writeUsdaOrganicIntegrityApiSnapshot({
  archive,
  receipt,
  outputRoot = path.join(APP_ROOT, "data", "business-sources", "usda-organic-integrity", "api-snapshots"),
  appRoot = APP_ROOT,
  now = () => new Date(),
  runId = randomUUID(),
  signal,
} = {}) {
  abort(signal);
  const inspection = await inspectUsdaOrganicIntegrityApiArchive(archive, { signal });
  const archiveSha256 = sha256(archive);
  if (!receipt || receipt.schema_version !== "usda-organic-integrity-api-acquisition-receipt@1.0.0"
      || receipt.endpoint !== "GetAllOperationsPublicData" || receipt.method !== "GET" || receipt.request_count !== 1
      || receipt.response_bytes !== archive.length || receipt.response_sha256 !== archiveSha256
      || receipt.credential_reference !== "DATA_GOV_API_KEY" || receipt.credential_value_retained !== false
      || receipt.redirect_policy !== "deny" || receipt.production_admission !== false || receipt.current_pointer_written !== false
      || JSON.stringify(receipt.archive) !== JSON.stringify(inspection)) fail("receipt does not bind exactly to the inspected archive");
  if (!/^[0-9a-f-]{36}$/i.test(runId)) fail("snapshot run ID is invalid");
  const createdAt = now().toISOString();
  if (new Date(createdAt).toISOString() !== createdAt) fail("snapshot timestamp is invalid");
  const root = await governedOutput(appRoot, outputRoot);
  const finalDirectory = path.join(root, `usda-organic-integrity-api-${runId}`);
  const stagingDirectory = `${finalDirectory}.staging`;
  if (await exists(finalDirectory) || await exists(stagingDirectory)) fail("snapshot run ID already exists and is immutable");
  await mkdir(stagingDirectory, { recursive: false });
  try {
    abort(signal);
    const receiptBytes = Buffer.from(json({ ...receipt, retained_at: createdAt }));
    const manifest = {
      schema_version: "usda-organic-integrity-api-snapshot-manifest@1.0.0",
      connector_id: "usda-organic-integrity",
      run_id: runId,
      created_at: createdAt,
      status: "immutable-raw-api-snapshot-awaiting-schema-validation",
      artifacts: [
        { path: "archive.zip", bytes: archive.length, sha256: archiveSha256 },
        { path: "receipt.json", bytes: receiptBytes.length, sha256: sha256(receiptBytes) },
      ],
      archive: inspection,
      claims: { xml_schema_validated: false, normalized_records: 0, production_admission: false, current_pointer_written: false },
    };
    await writeFile(path.join(stagingDirectory, "archive.zip"), archive, { flag: "wx" });
    await writeFile(path.join(stagingDirectory, "receipt.json"), receiptBytes, { flag: "wx" });
    await writeFile(path.join(stagingDirectory, "manifest.json"), json(manifest), { flag: "wx" });
    abort(signal);
    await rename(stagingDirectory, finalDirectory);
    return { directory: finalDirectory, manifest };
  } catch (error) {
    // A failed staging directory is intentionally left visible for explicit forensic cleanup.
    throw error;
  }
}

export async function verifyUsdaOrganicIntegrityApiSnapshot({ manifestPath, appRoot = APP_ROOT, signal } = {}) {
  abort(signal);
  const root = await realpath(appRoot);
  const resolvedManifest = await realpath(manifestPath);
  assertContained(root, resolvedManifest, "snapshot manifest");
  if (path.basename(resolvedManifest) !== "manifest.json") fail("snapshot manifest filename is invalid");
  const directory = path.dirname(resolvedManifest);
  const manifest = JSON.parse(await readFile(resolvedManifest, "utf8"));
  if (manifest.schema_version !== "usda-organic-integrity-api-snapshot-manifest@1.0.0"
      || manifest.connector_id !== "usda-organic-integrity"
      || !/^[0-9a-f-]{36}$/i.test(manifest.run_id)
      || manifest.status !== "immutable-raw-api-snapshot-awaiting-schema-validation"
      || new Date(manifest.created_at).toISOString() !== manifest.created_at
      || JSON.stringify(manifest.claims) !== JSON.stringify({ xml_schema_validated: false, normalized_records: 0, production_admission: false, current_pointer_written: false })
      || !Array.isArray(manifest.artifacts) || manifest.artifacts.length !== 2
      || manifest.artifacts.map((item) => item.path).join("|") !== "archive.zip|receipt.json") fail("snapshot manifest contract is invalid");
  const values = {};
  for (const artifact of manifest.artifacts) {
    if (!Number.isSafeInteger(artifact.bytes) || artifact.bytes < 1 || !/^[a-f0-9]{64}$/.test(artifact.sha256)) fail("snapshot artifact contract is invalid");
    const resolved = await realpath(path.join(directory, artifact.path));
    assertContained(directory, resolved, "snapshot artifact");
    const bytes = await readFile(resolved);
    if (bytes.length !== artifact.bytes || sha256(bytes) !== artifact.sha256) fail("snapshot artifact integrity check failed");
    values[artifact.path] = bytes;
  }
  abort(signal);
  const inspection = await inspectUsdaOrganicIntegrityApiArchive(values["archive.zip"], { signal });
  if (JSON.stringify(inspection) !== JSON.stringify(manifest.archive)) fail("snapshot archive inspection drifted");
  const receipt = JSON.parse(values["receipt.json"].toString("utf8"));
  if (receipt.schema_version !== "usda-organic-integrity-api-acquisition-receipt@1.0.0"
      || receipt.endpoint !== "GetAllOperationsPublicData" || receipt.method !== "GET" || receipt.request_count !== 1
      || receipt.response_bytes !== values["archive.zip"].length || receipt.response_sha256 !== sha256(values["archive.zip"])
      || receipt.credential_reference !== "DATA_GOV_API_KEY" || receipt.credential_value_retained !== false
      || receipt.production_admission !== false || receipt.current_pointer_written !== false
      || receipt.retained_at !== manifest.created_at || JSON.stringify(receipt.archive) !== JSON.stringify(inspection)) fail("snapshot receipt contract is invalid");
  return { verified: true, directory, manifest };
}
