import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { copyFile, mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { finished } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";
import ssh2 from "ssh2";
import unzipper from "unzipper";

const { Client } = ssh2;

export const FL_BUSINESS_REGISTRY_SCHEMA_VERSION = "1.0.0";
export const FL_BUSINESS_REGISTRY_TRANSFORMATION_VERSION = "fl-business-registry@1.0.0";
export const FL_BUSINESS_REGISTRY_HOST = "sftp.floridados.gov";
export const FL_BUSINESS_REGISTRY_USERNAME = "Public";
export const FL_BUSINESS_REGISTRY_REMOTE_PATH = "/Public/doc/quarterly/cor/cordata.zip";
export const FL_BUSINESS_REGISTRY_HOST_KEY = "SHA256:xTpc6X81is5Nyh2QXR6hIRhS7ayx5/BMr162zB73xyQ";
export const FL_BUSINESS_REGISTRY_MAX_ARCHIVE_BYTES = 3_000_000_000;
export const FL_BUSINESS_REGISTRY_MAX_UNCOMPRESSED_BYTES = 25_000_000_000;
export const FL_BUSINESS_REGISTRY_RECORD_BYTES = 1440;

export const FL_BUSINESS_REGISTRY_LAYOUT = Object.freeze([
  ["corporation_number", 1, 12],
  ["corporation_name", 13, 192],
  ["status", 205, 1],
  ["filing_type", 206, 15],
  ["principal_address_1", 221, 42],
  ["principal_address_2", 263, 42],
  ["principal_city", 305, 28],
  ["principal_state", 333, 2],
  ["principal_zip", 335, 10],
  ["principal_country", 345, 2],
  ["file_date", 473, 8],
  ["last_transaction_date", 496, 8],
  ["jurisdiction", 504, 2],
  ["report_year_1", 506, 4],
  ["report_date_1", 511, 8],
  ["report_year_2", 519, 4],
  ["report_date_2", 524, 8],
  ["report_year_3", 532, 4],
  ["report_date_3", 537, 8],
]);

export const FL_BUSINESS_REGISTRY_LAYOUT_FINGERPRINT = "852fc6684dc074f2129d5b1596c59dc1fd6cf739d40186aec88976eb327b2413";
export const FL_BUSINESS_REGISTRY_FIELDS = Object.freeze(FL_BUSINESS_REGISTRY_LAYOUT.map(([field]) => field));

const US_STATE_AND_TERRITORY_CODES = new Set([
  "AL", "AK", "AS", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "GU", "HI", "ID", "IL", "IN", "IA", "KS", "KY",
  "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "MP", "OH", "OK",
  "OR", "PA", "PR", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "VI", "WA", "WV", "WI", "WY",
]);

const FILING_TYPE_DESCRIPTIONS = new Map([
  ["DOMP", "domestic-profit-corporation"],
  ["DOMNP", "domestic-nonprofit-corporation"],
  ["FORP", "foreign-profit-corporation"],
  ["FORNP", "foreign-nonprofit-corporation"],
  ["DOMLP", "domestic-limited-partnership"],
  ["FORLP", "foreign-limited-partnership"],
  ["FLAL", "florida-limited-liability-company"],
  ["FORL", "foreign-limited-liability-company"],
  ["NPREG", "nonprofit-registration"],
  ["TRUST", "declaration-of-trust"],
  ["AGENT", "designation-of-registered-agent"],
]);

const EXCLUDED_FIELDS = new Set([
  "fei_number", "mail_address_1", "mail_address_2", "mail_city", "mail_state", "mail_zip", "mail_country",
  "registered_agent_name", "registered_agent_type", "registered_agent_address", "registered_agent_city", "registered_agent_state", "registered_agent_zip",
  ...Array.from({ length: 6 }, (_, index) => index + 1).flatMap((number) => [
    `officer_${number}_title`, `officer_${number}_type`, `officer_${number}_name`, `officer_${number}_address`, `officer_${number}_city`, `officer_${number}_state`, `officer_${number}_zip`,
  ]),
]);

const decoder = new TextDecoder("windows-1252");

function text(value) {
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

function sourceDate(value) {
  const raw = text(value);
  if (!raw) return null;
  const match = raw.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (!match) throw new Error(`invalid-source-date:${raw}`);
  const result = `${match[3]}-${match[1]}-${match[2]}`;
  const parsed = new Date(`${result}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== result) throw new Error(`invalid-source-date:${raw}`);
  return result;
}

function postalCode(value) {
  const raw = text(value);
  if (!raw) return { raw: null, zip_code: null, postal_code: null, zip4: null, status: "missing" };
  const match = raw.match(/^(\d{5})(?:[- ]?(\d{4}))?$/);
  if (!match || match[1] === "00000") return { raw, zip_code: null, postal_code: null, zip4: null, status: "invalid-or-non-us-format" };
  return {
    raw,
    zip_code: match[1],
    postal_code: match[2] ? `${match[1]}-${match[2]}` : match[1],
    zip4: match[2] ?? null,
    status: match[2] ? "normalized-zip-plus-4" : "normalized-zip5",
  };
}

function stateCode(value) {
  const normalized = text(value)?.toUpperCase() ?? null;
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
    source_id: "florida-sunbiz-quarterly-corporate-data",
    source_release_id: context.sourceReleaseId,
    source_record_id: sourceRecordId,
    ingest_run_id: context.runId,
    transformation_version: FL_BUSINESS_REGISTRY_TRANSFORMATION_VERSION,
    policy_id: "fl-business-registry",
  };
}

function selectedSourceRecord(record) {
  for (const field of Object.keys(record)) if (!FL_BUSINESS_REGISTRY_FIELDS.includes(field)) throw new Error(`Unapproved Florida source field ${field}.`);
  return Object.fromEntries(FL_BUSINESS_REGISTRY_FIELDS.map((field) => [field, text(record[field])]));
}

export function parseFlCorporateLine(line) {
  const bytes = Buffer.isBuffer(line) ? line : Buffer.from(String(line), "latin1");
  if (bytes.length !== FL_BUSINESS_REGISTRY_RECORD_BYTES) {
    throw new Error(`Florida corporate row must be exactly ${FL_BUSINESS_REGISTRY_RECORD_BYTES} characters; received ${bytes.length}.`);
  }
  return Object.fromEntries(FL_BUSINESS_REGISTRY_LAYOUT.map(([field, start, length]) => [field, text(decoder.decode(bytes.subarray(start - 1, start - 1 + length)))]));
}

export function normalizeFlBusinessOrganization(source, context) {
  const sourceRecordId = text(source.corporation_number)?.toUpperCase() ?? null;
  const legalName = text(source.corporation_name);
  if (!sourceRecordId || !/^[A-Z0-9]{6,12}$/.test(sourceRecordId) || !legalName) throw new Error("missing-or-invalid-organization-identity");
  if (text(source.status)?.toUpperCase() !== "A") throw new Error("source-record-is-not-active");
  const filingType = text(source.filing_type)?.toUpperCase() ?? null;
  if (!filingType || !FILING_TYPE_DESCRIPTIONS.has(filingType)) throw new Error("unknown-filing-type");
  const postal = postalCode(source.principal_zip);
  const state = stateCode(source.principal_state);
  const country = text(source.principal_country)?.toUpperCase() ?? null;
  const street = text(source.principal_address_1);
  const city = text(source.principal_city);
  const eligibleForUsZipCoverage = Boolean(street && city && postal.zip_code && (!country || country === "US"));
  const annualReports = [];
  for (const number of [1, 2, 3]) {
    const year = text(source[`report_year_${number}`]);
    const filedDateRaw = text(source[`report_date_${number}`]);
    if (!year && !filedDateRaw) continue;
    if (year && !/^\d{4}$/.test(year)) throw new Error(`invalid-report-year:${year}`);
    annualReports.push({ report_year: year ? Number(year) : null, filed_date: sourceDate(filedDateRaw) });
  }
  return {
    schema_version: FL_BUSINESS_REGISTRY_SCHEMA_VERSION,
    normalized_record_id: `fl-business-registry:organization:${sourceRecordId}`,
    entity_candidates: { organization_id: `organization:fl_document_${sourceRecordId.toLowerCase()}`, identity_status: "provisional" },
    external_identifiers: [
      { type: "fl_corporation_document_number", value: sourceRecordId, source_field: "corporation_number" },
    ],
    legal_name: legalName,
    reported_principal_address: {
      street,
      unit_or_additional: text(source.principal_address_2),
      city,
      state_source: text(source.principal_state),
      state_code: state,
      postal_code_source: postal.raw,
      zip_code: postal.zip_code,
      postal_code: postal.postal_code,
      zip4: postal.zip4,
      postal_code_status: postal.status,
      country_source: text(source.principal_country),
      address_scope: "fldos-reported-principal-address-not-verified-current-physical-operating-site",
      eligible_for_us_zip_coverage: eligibleForUsZipCoverage,
    },
    reported_address_coordinate: null,
    geography: geography(eligibleForUsZipCoverage ? postal.zip_code : null, context.baselineByZip),
    registration_profile: {
      filing_type: filingType,
      filing_type_description: FILING_TYPE_DESCRIPTIONS.get(filingType),
      jurisdiction_code: text(source.jurisdiction)?.toUpperCase() ?? null,
      file_date: sourceDate(source.file_date),
      last_transaction_date: sourceDate(source.last_transaction_date),
      annual_reports: annualReports,
    },
    source_status: {
      value: "included-as-active-in-florida-quarterly-corporate-archive",
      source_code: "A",
      status_class: "active-in-florida-division-of-corporations-quarterly-source",
      source_modified_at: context.sourceModifiedAt,
      semantics: "source-active-registration-not-independent-proof-of-current-operations-legality-licensure-public-access-or-an-open-storefront",
    },
    observed_at: context.retrievedAt,
    provenance: provenance(context, sourceRecordId),
    export_policy: "public-factual-fields-with-source-limitations",
  };
}

function hostKeyFingerprint(key) {
  return `SHA256:${createHash("sha256").update(key).digest("base64").replace(/=+$/, "")}`;
}

function validateRemoteMetadata(metadata) {
  if (metadata?.remotePath !== FL_BUSINESS_REGISTRY_REMOTE_PATH) throw new Error("Florida source remote path changed.");
  if (!Number.isInteger(metadata.bytes) || metadata.bytes <= 0 || metadata.bytes > FL_BUSINESS_REGISTRY_MAX_ARCHIVE_BYTES) throw new Error("Florida source archive size is invalid or exceeds the configured limit.");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(metadata.modifiedAt ?? "")) throw new Error("Florida source modified time is invalid.");
  if (metadata.archiveSha256 !== undefined && !/^[0-9a-f]{64}$/.test(metadata.archiveSha256)) throw new Error("Florida source archive checksum is invalid.");
  return metadata;
}

function sftpStat(sftp, remotePath) {
  return new Promise((resolve, reject) => sftp.stat(remotePath, (error, attributes) => error ? reject(error) : resolve(attributes)));
}

async function openSftp({ password, signal }) {
  if (!password) throw new Error("FL_SUNBIZ_PUBLIC_PASSWORD is required for the official Florida public SFTP account.");
  signal?.throwIfAborted?.();
  const client = new Client();
  const sftp = await new Promise((resolve, reject) => {
    const onAbort = () => {
      client.end();
      reject(signal.reason ?? new DOMException("The operation was aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    client.once("error", reject);
    client.once("ready", () => client.sftp((error, session) => {
      signal?.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve(session);
    }));
    client.connect({
      host: FL_BUSINESS_REGISTRY_HOST,
      port: 22,
      username: FL_BUSINESS_REGISTRY_USERNAME,
      password,
      readyTimeout: 30_000,
      keepaliveInterval: 15_000,
      keepaliveCountMax: 3,
      hostVerifier: (key) => hostKeyFingerprint(key) === FL_BUSINESS_REGISTRY_HOST_KEY,
    });
  });
  return { client, sftp };
}

export async function preflightFlArchive({ password = process.env.FL_SUNBIZ_PUBLIC_PASSWORD, signal } = {}) {
  const connection = await openSftp({ password, signal });
  try {
    const attributes = await sftpStat(connection.sftp, FL_BUSINESS_REGISTRY_REMOTE_PATH);
    return validateRemoteMetadata({
      remotePath: FL_BUSINESS_REGISTRY_REMOTE_PATH,
      bytes: Number(attributes.size),
      modifiedAt: new Date(Number(attributes.mtime) * 1000).toISOString(),
    });
  } finally {
    connection.client.end();
  }
}

async function fileSize(filename) {
  try {
    return (await stat(filename)).size;
  } catch (error) {
    if (error.code === "ENOENT") return 0;
    throw error;
  }
}

async function removeIfPresent(filename) {
  try {
    await unlink(filename);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function streamRemoteRange(sftp, remotePath, destination, start, expectedBytes, signal, logger) {
  const input = sftp.createReadStream(remotePath, { start, highWaterMark: 1_048_576 });
  const output = createWriteStream(destination, { flags: start ? "a" : "wx" });
  let bytes = start;
  let nextProgress = start + 100_000_000;
  try {
    for await (const chunk of input) {
      signal?.throwIfAborted?.();
      bytes += chunk.length;
      if (bytes > expectedBytes || bytes > FL_BUSINESS_REGISTRY_MAX_ARCHIVE_BYTES) throw new Error("Florida archive exceeded the preflight byte limit.");
      if (!output.write(chunk)) await once(output, "drain");
      if (bytes >= nextProgress) {
        logger(`Downloaded ${bytes.toLocaleString("en-US")} of ${expectedBytes.toLocaleString("en-US")} Florida archive bytes.`);
        nextProgress += 100_000_000;
      }
    }
    output.end();
    await finished(output);
    if (bytes !== expectedBytes) throw new Error(`Florida archive transfer stopped at ${bytes} of ${expectedBytes} bytes.`);
  } catch (error) {
    input.destroy();
    output.destroy();
    throw error;
  }
}

function fastGetRemote(sftp, remotePath, destination, expectedBytes, logger) {
  let nextProgress = 100_000_000;
  return new Promise((resolve, reject) => {
    sftp.fastGet(remotePath, destination, {
      concurrency: 32,
      chunkSize: 131_072,
      step: (totalTransferred) => {
        if (totalTransferred >= nextProgress) {
          logger(`Downloaded ${totalTransferred.toLocaleString("en-US")} of ${expectedBytes.toLocaleString("en-US")} Florida archive bytes.`);
          nextProgress += 100_000_000;
        }
      },
    }, (error) => error ? reject(error) : resolve());
  });
}

export async function downloadFlArchive(destination, metadata, {
  password = process.env.FL_SUNBIZ_PUBLIC_PASSWORD,
  signal,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  logger = console.log,
  attempts = 4,
} = {}) {
  validateRemoteMetadata(metadata);
  await mkdir(path.dirname(destination), { recursive: true });
  const partial = `${destination}.partial`;
  await removeIfPresent(destination);
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    signal?.throwIfAborted?.();
    let connection;
    try {
      const start = await fileSize(partial);
      if (start > metadata.bytes) await removeIfPresent(partial);
      const resumeAt = start <= metadata.bytes ? start : 0;
      if (resumeAt === metadata.bytes) {
        await rename(partial, destination);
        return hashFile(destination);
      }
      connection = await openSftp({ password, signal });
      const current = await sftpStat(connection.sftp, FL_BUSINESS_REGISTRY_REMOTE_PATH);
      const currentMetadata = validateRemoteMetadata({
        remotePath: FL_BUSINESS_REGISTRY_REMOTE_PATH,
        bytes: Number(current.size),
        modifiedAt: new Date(Number(current.mtime) * 1000).toISOString(),
      });
      if (currentMetadata.bytes !== metadata.bytes || currentMetadata.modifiedAt !== metadata.modifiedAt) throw new Error("Florida source archive changed after preflight.");
      if (resumeAt === 0) {
        try {
          await fastGetRemote(connection.sftp, FL_BUSINESS_REGISTRY_REMOTE_PATH, partial, metadata.bytes, logger);
        } catch (error) {
          await removeIfPresent(partial);
          throw error;
        }
        const downloadedBytes = await fileSize(partial);
        if (downloadedBytes !== metadata.bytes) {
          await removeIfPresent(partial);
          throw new Error(`Florida archive transfer stopped at ${downloadedBytes} of ${metadata.bytes} bytes.`);
        }
      } else {
        await streamRemoteRange(connection.sftp, FL_BUSINESS_REGISTRY_REMOTE_PATH, partial, resumeAt, metadata.bytes, signal, logger);
      }
      connection.client.end();
      connection = null;
      await rename(partial, destination);
      return hashFile(destination);
    } catch (error) {
      connection?.client.end();
      lastError = error;
      if (error.name === "AbortError" || /host key|authentication|changed after preflight|byte limit/i.test(error.message) || attempt === attempts - 1) break;
      await sleep(Math.min(8_000, 500 * (2 ** attempt)));
    }
  }
  await removeIfPresent(partial);
  await removeIfPresent(destination);
  throw lastError;
}

async function* fixedWidthLines(stream) {
  let pending = Buffer.alloc(0);
  for await (const chunk of stream) {
    pending = pending.length ? Buffer.concat([pending, chunk]) : Buffer.from(chunk);
    let delimiter;
    while ((delimiter = pending.indexOf(0x0a)) >= 0) {
      let line = pending.subarray(0, delimiter);
      pending = pending.subarray(delimiter + 1);
      if (line.at(-1) === 0x0d) line = line.subarray(0, -1);
      if (line.length) yield line;
    }
  }
  if (pending.length) {
    if (pending.at(-1) === 0x0d) pending = pending.subarray(0, -1);
    if (pending.length) yield pending;
  }
}

async function openFlArchive(archivePath) {
  const directory = await unzipper.Open.file(archivePath);
  const files = directory.files.filter((entry) => entry.type === "File");
  const byDigit = new Map();
  let uncompressedBytes = 0;
  for (const entry of files) {
    if (entry.path.includes("..") || path.isAbsolute(entry.path) || entry.path.includes("/") || entry.path.includes("\\")) throw new Error(`Unsafe Florida archive entry ${entry.path}.`);
    const match = entry.path.match(/^cordata([0-9])(?:\.txt)?$/i);
    if (!match || byDigit.has(match[1])) throw new Error("Florida archive does not contain the expected ten corporate filing members.");
    byDigit.set(match[1], entry);
    uncompressedBytes += Number(entry.uncompressedSize ?? entry.vars?.uncompressedSize ?? 0);
  }
  if (files.length !== 10 || byDigit.size !== 10 || [..."0123456789"].some((digit) => !byDigit.has(digit))) throw new Error("Florida archive does not contain the expected ten corporate filing members.");
  if (!Number.isSafeInteger(uncompressedBytes) || uncompressedBytes <= 0 || uncompressedBytes > FL_BUSINESS_REGISTRY_MAX_UNCOMPRESSED_BYTES) throw new Error("Florida archive uncompressed size is invalid or exceeds the configured limit.");
  return { entries: [..."0123456789"].map((digit) => byDigit.get(digit)), uncompressedBytes };
}

async function* archiveLines(archivePath) {
  const archive = await openFlArchive(archivePath);
  for (const entry of archive.entries) {
    for await (const line of fixedWidthLines(entry.stream())) yield line;
  }
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
  if (!writer.gzip.write(json(record))) await once(writer.gzip, "drain");
  writer.records += 1;
}

async function closeGzipWriter(writer, artifactType, metadata = {}) {
  writer.gzip.end();
  await finished(writer.output);
  await renameWithRetry(writer.temporary, writer.destination);
  return { path: writer.relativePath, ...(await hashFile(writer.destination)), record_count: writer.records, artifact_type: artifactType, ...metadata };
}

async function abortGzipWriters(writers) {
  for (const writer of writers) {
    writer.gzip.on("error", () => {});
    writer.output.on("error", () => {});
    writer.gzip.destroy();
    writer.output.destroy();
  }
  await new Promise((resolve) => setTimeout(resolve, 25));
  await Promise.all(writers.map((writer) => removeIfPresent(writer.temporary)));
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

async function acquireSelectedSource({ input, writer, signal, logger }) {
  const ids = new Set();
  let records = 0;
  for await (const line of input) {
    signal?.throwIfAborted?.();
    const selected = selectedSourceRecord(typeof line === "string" || Buffer.isBuffer(line) ? parseFlCorporateLine(line) : line);
    const id = text(selected.corporation_number)?.toUpperCase() ?? null;
    const validId = /^[A-Z0-9]{6,12}$/.test(id ?? "");
    if (validId && ids.has(id)) throw new Error(`duplicate Florida document number ${id}.`);
    const status = text(selected.status)?.toUpperCase();
    if (!new Set(["A", "I"]).has(status)) throw new Error(`Florida quarterly archive contains an unknown status code for ${id}.`);
    if (validId) ids.add(id);
    await writeGzipRecord(writer, selected);
    records += 1;
    if (records % 250_000 === 0) logger(`Selected ${records.toLocaleString("en-US")} Florida corporate rows.`);
  }
  return records;
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
      fl_business_registry_quarterly_active_entity_snapshot: {
        status: count ? "published-active-entity-reported-principal-address-evidence" : "no-eligible-reported-principal-address-in-current-source-snapshot",
        organization_reported_principal_address_count: count,
        source_release_id: context.sourceReleaseId,
        source_modified_at: context.sourceModifiedAt,
        physical_site_count: null,
        physical_site_inference_permitted: false,
      },
    };
  });
}

function sourceReleaseId(metadata, selectedSourceSha256) {
  const digest = sha256(`${metadata.modifiedAt}\u0000${metadata.bytes}\u0000${metadata.archiveSha256}\u0000${selectedSourceSha256}`);
  return `fl-business-registry-${metadata.modifiedAt.slice(0, 10)}-${digest.slice(0, 16)}`;
}

export async function buildFlBusinessRegistry({
  outputRoot,
  zbpPointer,
  sourceLines = null,
  sourceArchivePath = null,
  sourceSnapshotPath = null,
  sourceMetadata = null,
  password = process.env.FL_SUNBIZ_PUBLIC_PASSWORD,
  minimumOrganizations = 2_000_000,
  signal,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  logger = console.log,
  now = () => new Date(),
} = {}) {
  if (!outputRoot || !zbpPointer) throw new Error("outputRoot and zbpPointer are required.");
  if ([sourceLines, sourceArchivePath, sourceSnapshotPath].filter(Boolean).length > 1) throw new Error("sourceLines, sourceArchivePath, and sourceSnapshotPath are mutually exclusive.");
  if (!Number.isInteger(minimumOrganizations) || minimumOrganizations < 1) throw new Error("minimumOrganizations must be a positive integer.");
  signal?.throwIfAborted?.();
  const retrievedAt = now().toISOString();
  const runId = randomUUID();
  const releaseId = `fl-business-registry-${releaseTimestamp(retrievedAt)}-${runId.slice(0, 8)}`;
  const stagingDirectory = path.join(outputRoot, ".staging", runId);
  await mkdir(stagingDirectory, { recursive: true });
  const baseline = await loadZbpBaseline(zbpPointer);
  let metadata = sourceMetadata ? validateRemoteMetadata({ ...sourceMetadata }) : null;
  let downloadedArchive = null;
  let archivePath = sourceArchivePath;
  let sourceArtifact;
  let sourceRecords;
  const artifacts = [];
  try {
    if (sourceSnapshotPath) {
      if (!metadata?.archiveSha256) throw new Error("sourceMetadata with an archive checksum is required when replaying a Florida selected-field snapshot.");
      const selectedPath = path.join(stagingDirectory, "source", "selected-corporate-records.jsonl.gz");
      await mkdir(path.dirname(selectedPath), { recursive: true });
      await copyFile(sourceSnapshotPath, selectedPath);
      sourceArtifact = { path: "source/selected-corporate-records.jsonl.gz", ...(await hashFile(selectedPath)), artifact_type: "fl-business-registry-selected-source-jsonl-gzip", export_policy: "internal" };
      sourceRecords = 0;
      for await (const record of gzipRecords(selectedPath)) {
        void record;
        sourceRecords += 1;
      }
      sourceArtifact.record_count = sourceRecords;
    } else {
      if (!sourceLines && !archivePath) {
        metadata = await preflightFlArchive({ password, signal });
        downloadedArchive = path.join(stagingDirectory, "source", "unminimized-cordata.zip");
        const downloaded = await downloadFlArchive(downloadedArchive, metadata, { password, signal, sleep, logger });
        metadata.archiveSha256 = downloaded.sha256;
        archivePath = downloadedArchive;
      } else if (archivePath) {
        const archive = await hashFile(archivePath);
        const archiveStat = await stat(archivePath);
        metadata = validateRemoteMetadata({
          remotePath: FL_BUSINESS_REGISTRY_REMOTE_PATH,
          bytes: archive.bytes,
          modifiedAt: metadata?.modifiedAt ?? archiveStat.mtime.toISOString(),
          archiveSha256: archive.sha256,
        });
      } else if (!metadata?.archiveSha256) {
        throw new Error("sourceMetadata with an archive checksum is required for explicit Florida fixture lines.");
      }
      if (archivePath) {
        const inspectedArchive = await openFlArchive(archivePath);
        metadata.members = inspectedArchive.entries.map((entry) => entry.path);
        metadata.uncompressedBytes = inspectedArchive.uncompressedBytes;
      }
      const sourceWriter = await openGzipWriter(stagingDirectory, "source/selected-corporate-records.jsonl.gz");
      try {
        sourceRecords = await acquireSelectedSource({ input: sourceLines ?? archiveLines(archivePath), writer: sourceWriter, signal, logger });
        sourceArtifact = await closeGzipWriter(sourceWriter, "fl-business-registry-selected-source-jsonl-gzip", { export_policy: "internal" });
      } catch (error) {
        await abortGzipWriters([sourceWriter]);
        throw error;
      }
    }
    if (downloadedArchive) {
      await removeIfPresent(downloadedArchive);
      downloadedArchive = null;
    }
    const selectedSourceReleaseId = sourceReleaseId(metadata, sourceArtifact.sha256);
    const context = {
      runId,
      retrievedAt,
      sourceModifiedAt: metadata.modifiedAt,
      sourceReleaseId: selectedSourceReleaseId,
      baselineByZip: baseline.byZip,
    };
    artifacts.push(await writeArtifact(stagingDirectory, "source/preflight.json", json({
      host: FL_BUSINESS_REGISTRY_HOST,
      remote_path: metadata.remotePath,
      remote_bytes: metadata.bytes,
      remote_modified_at: metadata.modifiedAt,
      archive_sha256: metadata.archiveSha256,
      sftp_host_key: FL_BUSINESS_REGISTRY_HOST_KEY,
      record_bytes: FL_BUSINESS_REGISTRY_RECORD_BYTES,
      selected_layout: FL_BUSINESS_REGISTRY_LAYOUT,
      selected_layout_fingerprint: FL_BUSINESS_REGISTRY_LAYOUT_FINGERPRINT,
      selected_source_records: sourceRecords,
      archive_members: metadata.members ?? null,
      archive_uncompressed_bytes: metadata.uncompressedBytes ?? null,
      raw_archive_retained: false,
    }), { artifact_type: "fl-business-registry-preflight", export_policy: "internal" }));
    artifacts.push(sourceArtifact);
    const partitions = new Map();
    for (const prefix of "0123456789abcdef") partitions.set(prefix, await openGzipWriter(stagingDirectory, `derived/organizations/id-hash-prefix=${prefix}.jsonl.gz`));
    const excludedInactiveWriter = await openGzipWriter(stagingDirectory, "derived/excluded-inactive.jsonl.gz");
    const quarantineWriter = await openGzipWriter(stagingDirectory, "derived/quarantine.jsonl.gz");
    const countsByZip = new Map();
    const filingTypes = new Map();
    const jurisdictions = new Map();
    const addressStates = new Map();
    const addressCountries = new Map();
    let organizations = 0;
    let activeSourceRecords = 0;
    let inactiveSourceRecords = 0;
    let quarantinedRecords = 0;
    let eligibleAddresses = 0;
    let sourceOrdinal = 0;
    try {
      for await (const source of gzipRecords(path.join(stagingDirectory, sourceArtifact.path))) {
        signal?.throwIfAborted?.();
        sourceOrdinal += 1;
        const sourceStatus = text(source.status)?.toUpperCase();
        if (sourceStatus === "I") {
          await writeGzipRecord(excludedInactiveWriter, {
            schema_version: FL_BUSINESS_REGISTRY_SCHEMA_VERSION,
            source_record_id: /^[A-Z0-9]{6,12}$/.test(text(source.corporation_number)?.toUpperCase() ?? "") ? text(source.corporation_number)?.toUpperCase() : `source-row:${sourceOrdinal}`,
            reason: "source-record-is-inactive",
            source_release_id: selectedSourceReleaseId,
            ingest_run_id: runId,
            export_policy: "internal",
          });
          inactiveSourceRecords += 1;
          continue;
        }
        activeSourceRecords += 1;
        try {
          const normalized = normalizeFlBusinessOrganization(source, context);
          const id = normalized.external_identifiers[0].value;
          await writeGzipRecord(partitions.get(sha256(id)[0]), normalized);
          organizations += 1;
          increment(filingTypes, normalized.registration_profile.filing_type);
          increment(jurisdictions, normalized.registration_profile.jurisdiction_code);
          increment(addressStates, normalized.reported_principal_address.state_code);
          increment(addressCountries, normalized.reported_principal_address.country_source);
          if (normalized.reported_principal_address.eligible_for_us_zip_coverage) {
            const zipCode = normalized.reported_principal_address.zip_code;
            countsByZip.set(zipCode, (countsByZip.get(zipCode) ?? 0) + 1);
            eligibleAddresses += 1;
          }
        } catch (error) {
          if (!["missing-or-invalid-organization-identity", "unknown-filing-type"].includes(error.message) && !error.message.startsWith("invalid-source-date:") && !error.message.startsWith("invalid-report-year:")) throw error;
          await writeGzipRecord(quarantineWriter, {
            schema_version: FL_BUSINESS_REGISTRY_SCHEMA_VERSION,
            source_record_id: /^[A-Z0-9]{6,12}$/.test(text(source.corporation_number)?.toUpperCase() ?? "") ? text(source.corporation_number)?.toUpperCase() : `source-row:${sourceOrdinal}`,
            reason: error.message,
            source_release_id: selectedSourceReleaseId,
            ingest_run_id: runId,
            export_policy: "internal",
          });
          quarantinedRecords += 1;
        }
      }
    } catch (error) {
      await abortGzipWriters([...partitions.values(), excludedInactiveWriter, quarantineWriter]);
      throw error;
    }
    if (organizations < minimumOrganizations) {
      await abortGzipWriters([...partitions.values(), excludedInactiveWriter, quarantineWriter]);
      throw new Error(`Florida active organizations ${organizations} are below the ${minimumOrganizations} quality floor.`);
    }
    for (const prefix of "0123456789abcdef") artifacts.push(await closeGzipWriter(partitions.get(prefix), "normalized-fl-business-organization-jsonl-gzip", { partition: { id_hash_prefix: prefix }, export_policy: "public-factual-fields-with-source-limitations" }));
    artifacts.push(await closeGzipWriter(excludedInactiveWriter, "fl-business-registry-excluded-inactive-jsonl-gzip", { export_policy: "internal" }));
    artifacts.push(await closeGzipWriter(quarantineWriter, "fl-business-registry-quarantine-jsonl-gzip", { export_policy: "internal" }));
    const coverageRows = buildZipCoverage(baseline.rows, countsByZip, context);
    artifacts.push(await writeArtifact(stagingDirectory, "derived/zip-coverage.jsonl", jsonLines(coverageRows), { artifact_type: "fl-business-registry-zip-coverage-jsonl", record_count: coverageRows.length }));
    artifacts.push(await writeArtifact(stagingDirectory, "derived/source-summary.json", json({
      source_records: sourceRecords,
      rows_coded_active: activeSourceRecords,
      inactive_source_records_excluded: inactiveSourceRecords,
      organizations_published: organizations,
      quarantined_source_records: quarantinedRecords,
      eligible_reported_us_principal_addresses: eligibleAddresses,
      organizations_without_eligible_us_zip_address: organizations - eligibleAddresses,
      filing_types: sortedCounts(filingTypes),
      jurisdictions: sortedCounts(jurisdictions),
      reported_address_states: sortedCounts(addressStates),
      reported_address_countries: sortedCounts(addressCountries),
    }), { artifact_type: "fl-business-registry-source-summary" }));
    artifacts.push(await writeArtifact(stagingDirectory, "source/release-metadata.json", json({
      publisher: "Florida Department of State, Division of Corporations",
      source_archive: metadata.remotePath,
      source_archive_bytes: metadata.bytes,
      source_archive_modified_at: metadata.modifiedAt,
      source_archive_sha256: metadata.archiveSha256,
      source_archive_members: metadata.members ?? null,
      source_archive_uncompressed_bytes: metadata.uncompressedBytes ?? null,
      record_bytes: FL_BUSINESS_REGISTRY_RECORD_BYTES,
      selected_layout: FL_BUSINESS_REGISTRY_LAYOUT,
      selected_layout_fingerprint: FL_BUSINESS_REGISTRY_LAYOUT_FINGERPRINT,
      selected_fields: FL_BUSINESS_REGISTRY_FIELDS,
      explicitly_excluded_field_classes: ["FEIN", "mailing address", "registered-agent identity and address", "officer identities, titles, types, and addresses"],
      raw_archive_retained: false,
      source_urls: {
        downloads: "https://dos.fl.gov/sunbiz/other-services/data-downloads/",
        quarterly_data: "https://dos.fl.gov/sunbiz/other-services/data-downloads/quarterly-data/",
        data_usage_guide: "https://dos.fl.gov/sunbiz/other-services/data-downloads/data-usage-guide/",
        corporate_file_definitions: "https://dos.sunbiz.org/data-definitions/cor.html",
      },
    }), { artifact_type: "fl-business-registry-source-release-metadata" }));
    const manifest = {
      schema_version: FL_BUSINESS_REGISTRY_SCHEMA_VERSION,
      dataset_id: "fl-business-registry-quarterly-active-entities",
      connector: { id: "fl-business-registry", version: "1.0.0" },
      release_id: releaseId,
      run_id: runId,
      retrieved_at: retrievedAt,
      source_modified_at: metadata.modifiedAt,
      source_archive_bytes: metadata.bytes,
      source_archive_sha256: metadata.archiveSha256,
      source_release_id: selectedSourceReleaseId,
      status: "published",
      complete_selected_quarterly_active_entity_snapshot: true,
      raw_archive_retained: false,
      coverage: {
        source_records: sourceRecords,
        active_source_records: activeSourceRecords,
        inactive_source_records_excluded: inactiveSourceRecords,
        organizations_published: organizations,
        quarantined_source_records: quarantinedRecords,
        eligible_reported_us_principal_addresses: eligibleAddresses,
        organizations_without_eligible_us_zip_address: organizations - eligibleAddresses,
        source_zip_codes: countsByZip.size,
        zip_union_records: coverageRows.length,
        physical_sites: null,
        establishments: null,
      },
      quality_gates: {
        minimum_organizations: minimumOrganizations,
        source_status_counts_match: activeSourceRecords + inactiveSourceRecords === sourceRecords,
        active_published_and_quarantined_counts_match: organizations + quarantinedRecords === activeSourceRecords,
        selected_layout_fingerprint: FL_BUSINESS_REGISTRY_LAYOUT_FINGERPRINT,
        fixed_width_record_bytes: FL_BUSINESS_REGISTRY_RECORD_BYTES,
        duplicate_source_record_ids: 0,
        inactive_source_rows_excluded: inactiveSourceRecords,
        raw_archive_retained: false,
      },
      dependencies: [
        { dataset_id: baseline.manifest.dataset_id, release_id: baseline.manifest.release_id, manifest_sha256: baseline.manifestSha256 },
        baseline.manifest.geography_dependency,
      ],
      source: {
        publisher: "Florida Department of State, Division of Corporations",
        source_page: "https://dos.fl.gov/sunbiz/other-services/data-downloads/quarterly-data/",
        remote_path: metadata.remotePath,
        access_method: sourceLines ? "explicit test fixture rows" : sourceSnapshotPath ? "validated privacy-minimized selected-field source snapshot" : sourceArchivePath ? "explicit local official archive" : "official public SFTP account with runtime-only credential",
        public_username: FL_BUSINESS_REGISTRY_USERNAME,
        credential_reference: "FL_SUNBIZ_PUBLIC_PASSWORD",
        credential_persisted: false,
        policy_profile: "config/source-policies/fl-business-registry.json",
      },
      limitations: [
        "Active is the source status code in a quarterly registration archive and is not independent proof of current operations, legality, solvency, licensure, public access, or an open storefront.",
        "The corporate archive covers corporations, limited liability companies, and limited partnerships, not trademarks or every business operating in Florida or the United States.",
        "Reported principal addresses may be residential, administrative, virtual, stale, incomplete, or outside the United States; no physical site or establishment is created from them.",
        "FEIN, mailing-address, registered-agent, and officer fields are excluded during fixed-width extraction; the unminimized archive is not retained in the release.",
        "The publisher provides downloads as-is and can change, replace, or delete them at any time.",
        "Current USPS ZIP validity remains unverified until an authorized operational ZIP denominator is integrated.",
      ],
      artifacts,
    };
    await writeArtifact(stagingDirectory, "manifest.json", json(manifest));
    const publication = await publishFlBusinessRegistryStaging({ outputRoot, stagingRunId: runId, expectedReleaseId: releaseId });
    logger(`Published ${organizations.toLocaleString("en-US")} Florida quarterly active-source organizations.`);
    return { manifest, releaseDirectory: publication.releaseDirectory, pointerPath: publication.pointerPath };
  } finally {
    if (downloadedArchive) await removeIfPresent(downloadedArchive);
  }
}

function containsExcludedField(value) {
  if (Array.isArray(value)) return value.some(containsExcludedField);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) => EXCLUDED_FIELDS.has(key.toLowerCase()) || containsExcludedField(child));
}

function replayComparisonRecord(record) {
  const comparison = { ...record };
  delete comparison.geography;
  return comparison;
}

export async function publishFlBusinessRegistryStaging({ outputRoot, stagingRunId, expectedReleaseId = null } = {}) {
  if (!outputRoot || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stagingRunId ?? "")) throw new Error("outputRoot and a valid stagingRunId are required.");
  const stagingRoot = path.join(outputRoot, ".staging");
  const stagingDirectory = path.resolve(stagingRoot, stagingRunId);
  assertContained(stagingRoot, stagingDirectory, "Florida staging run");
  const manifestPath = path.join(stagingDirectory, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.run_id !== stagingRunId || manifest.dataset_id !== "fl-business-registry-quarterly-active-entities" || manifest.status !== "published" || manifest.raw_archive_retained !== false) throw new Error("Florida staging manifest does not match the requested complete privacy-minimized run.");
  if (expectedReleaseId && manifest.release_id !== expectedReleaseId) throw new Error("Florida staging release ID does not match the build result.");
  await verifyFlBusinessRegistry(manifestPath);
  const releasesDirectory = path.join(outputRoot, "releases");
  await mkdir(releasesDirectory, { recursive: true });
  const releaseDirectory = path.join(releasesDirectory, manifest.release_id);
  try {
    await stat(releaseDirectory);
    throw new Error(`Florida release destination already exists: ${manifest.release_id}.`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await renameWithRetry(stagingDirectory, releaseDirectory);
  const pointerPath = path.join(outputRoot, "current.json");
  const temporaryPointer = `${pointerPath}.tmp-${randomUUID()}`;
  await writeFile(temporaryPointer, json({ dataset_id: manifest.dataset_id, release_id: manifest.release_id, manifest: `releases/${manifest.release_id}/manifest.json`, updated_at: manifest.retrieved_at }), { flag: "wx" });
  await renameWithRetry(temporaryPointer, pointerPath);
  return { manifest, releaseDirectory, pointerPath };
}

export async function verifyFlBusinessRegistry(manifestPath) {
  const absoluteManifestPath = path.resolve(manifestPath);
  const releaseDirectory = path.dirname(absoluteManifestPath);
  const manifest = JSON.parse(await readFile(absoluteManifestPath, "utf8"));
  const failures = [];
  if (manifest.dataset_id !== "fl-business-registry-quarterly-active-entities" || manifest.status !== "published" || !manifest.complete_selected_quarterly_active_entity_snapshot || manifest.raw_archive_retained !== false) failures.push({ path: "manifest.json", reason: "unexpected, incomplete, or non-minimized manifest" });
  if (manifest.artifacts?.some((artifact) => /cordata\.zip|unminimized/i.test(artifact.path))) failures.push({ path: "manifest.json", reason: "raw Florida archive was retained as a release artifact" });
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
  const sourceArtifacts = manifest.artifacts?.filter((artifact) => artifact.artifact_type === "fl-business-registry-selected-source-jsonl-gzip") ?? [];
  const normalizedArtifacts = manifest.artifacts?.filter((artifact) => artifact.artifact_type === "normalized-fl-business-organization-jsonl-gzip") ?? [];
  const excludedInactiveArtifacts = manifest.artifacts?.filter((artifact) => artifact.artifact_type === "fl-business-registry-excluded-inactive-jsonl-gzip") ?? [];
  const quarantineArtifacts = manifest.artifacts?.filter((artifact) => artifact.artifact_type === "fl-business-registry-quarantine-jsonl-gzip") ?? [];
  if (sourceArtifacts.length !== 1 || sourceArtifacts[0]?.export_policy !== "internal") failures.push({ path: "manifest.json", reason: "expected one internal privacy-minimized source artifact" });
  if (normalizedArtifacts.length !== 16) failures.push({ path: "manifest.json", reason: "expected 16 normalized organization partitions" });
  if (excludedInactiveArtifacts.length !== 1 || excludedInactiveArtifacts[0]?.export_policy !== "internal") failures.push({ path: "manifest.json", reason: "expected one internal inactive-source exclusion artifact" });
  if (quarantineArtifacts.length !== 1 || quarantineArtifacts[0]?.export_policy !== "internal") failures.push({ path: "manifest.json", reason: "expected one internal quarantine artifact" });
  const expectedReplayHashes = new Map([..."0123456789abcdef"].map((prefix) => [prefix, createHash("sha256")]));
  const actualReplayHashes = new Map([..."0123456789abcdef"].map((prefix) => [prefix, createHash("sha256")]));
  const expectedQuarantineHash = createHash("sha256");
  const actualQuarantineHash = createHash("sha256");
  const expectedExcludedInactiveHash = createHash("sha256");
  const actualExcludedInactiveHash = createHash("sha256");
  const replayContext = {
    runId: manifest.run_id,
    retrievedAt: manifest.retrieved_at,
    sourceModifiedAt: manifest.source_modified_at,
    sourceReleaseId: manifest.source_release_id,
    baselineByZip: new Map(),
  };
  if (sourceArtifacts.length === 1) {
    if (manifest.source_release_id !== sourceReleaseId({ modifiedAt: manifest.source_modified_at, bytes: manifest.source_archive_bytes, archiveSha256: manifest.source_archive_sha256 }, sourceArtifacts[0].sha256)) failures.push({ path: "manifest.json", reason: "source release ID is not bound to archive metadata and selected source checksum" });
    try {
      const ids = new Set();
      let sourceCount = 0;
      let activeSourceCount = 0;
      let inactiveSourceCount = 0;
      for await (const record of gzipRecords(path.join(releaseDirectory, sourceArtifacts[0].path))) {
        for (const field of Object.keys(record)) if (!FL_BUSINESS_REGISTRY_FIELDS.includes(field)) throw new Error(`unapproved source field ${field}`);
        const id = text(record.corporation_number)?.toUpperCase() ?? null;
        const validId = /^[A-Z0-9]{6,12}$/.test(id ?? "");
        if (validId && ids.has(id)) throw new Error(`duplicate document number ${id}`);
        const status = text(record.status)?.toUpperCase();
        if (!new Set(["A", "I"]).has(status)) throw new Error(`unknown source status for ${id}`);
        if (validId) ids.add(id);
        if (status === "I") {
          expectedExcludedInactiveHash.update(json({ schema_version: FL_BUSINESS_REGISTRY_SCHEMA_VERSION, source_record_id: validId ? id : `source-row:${sourceCount + 1}`, reason: "source-record-is-inactive", source_release_id: manifest.source_release_id, ingest_run_id: manifest.run_id, export_policy: "internal" }));
          inactiveSourceCount += 1;
          sourceCount += 1;
          continue;
        }
        activeSourceCount += 1;
        try {
          const expected = normalizeFlBusinessOrganization(record, replayContext);
          expectedReplayHashes.get(sha256(id)[0]).update(json(replayComparisonRecord(expected)));
        } catch (error) {
          if (!["missing-or-invalid-organization-identity", "unknown-filing-type"].includes(error.message) && !error.message.startsWith("invalid-source-date:") && !error.message.startsWith("invalid-report-year:")) throw error;
          expectedQuarantineHash.update(json({ schema_version: FL_BUSINESS_REGISTRY_SCHEMA_VERSION, source_record_id: validId ? id : `source-row:${sourceCount + 1}`, reason: error.message, source_release_id: manifest.source_release_id, ingest_run_id: manifest.run_id, export_policy: "internal" }));
        }
        sourceCount += 1;
      }
      if (sourceCount !== sourceArtifacts[0].record_count || sourceCount !== manifest.coverage?.source_records) throw new Error("source record count mismatch");
      if (activeSourceCount !== manifest.coverage?.active_source_records || inactiveSourceCount !== manifest.coverage?.inactive_source_records_excluded) throw new Error("source status counts do not reconcile");
    } catch (error) {
      failures.push({ path: sourceArtifacts[0].path, reason: `source validation failed: ${error.message}` });
    }
  }
  const ids = new Set();
  const countsByZip = new Map();
  let organizations = 0;
  let eligibleAddresses = 0;
  for (const artifact of normalizedArtifacts) {
    try {
      const prefix = artifact.path.match(/id-hash-prefix=([0-9a-f])/)?.[1];
      let partitionCount = 0;
      for await (const record of gzipRecords(path.join(releaseDirectory, artifact.path))) {
        const id = record.external_identifiers?.find((item) => item.type === "fl_corporation_document_number")?.value;
        if (!id || ids.has(id) || sha256(id)[0] !== prefix) throw new Error(`duplicate, missing, or incorrectly partitioned document number ${id}`);
        ids.add(id);
        if (record.entity_candidates?.organization_id !== `organization:fl_document_${id.toLowerCase()}` || record.entity_candidates?.physical_site_id || record.entity_candidates?.establishment_id) throw new Error(`invalid organization-only identity for ${id}`);
        if (record.source_status?.source_code !== "A" || record.source_status?.status_class !== "active-in-florida-division-of-corporations-quarterly-source") throw new Error(`invalid source status for ${id}`);
        if (record.provenance?.source_release_id !== manifest.source_release_id || record.provenance?.policy_id !== "fl-business-registry" || record.export_policy !== "public-factual-fields-with-source-limitations") throw new Error(`invalid provenance for ${id}`);
        if (containsExcludedField(record)) throw new Error(`excluded field leaked for ${id}`);
        if (record.reported_principal_address?.address_scope !== "fldos-reported-principal-address-not-verified-current-physical-operating-site") throw new Error(`invalid address scope for ${id}`);
        if (record.reported_principal_address?.eligible_for_us_zip_coverage) {
          const zipCode = record.reported_principal_address.zip_code;
          if (!/^\d{5}$/.test(zipCode ?? "")) throw new Error(`invalid eligible ZIP for ${id}`);
          countsByZip.set(zipCode, (countsByZip.get(zipCode) ?? 0) + 1);
          eligibleAddresses += 1;
        }
        actualReplayHashes.get(prefix).update(json(replayComparisonRecord(record)));
        partitionCount += 1;
      }
      if (partitionCount !== artifact.record_count) throw new Error("partition record count mismatch");
      organizations += partitionCount;
    } catch (error) {
      failures.push({ path: artifact.path, reason: `normalized validation failed: ${error.message}` });
    }
  }
  const excludedIds = new Set();
  let inactiveSourceRecords = 0;
  if (excludedInactiveArtifacts.length === 1) {
    try {
      for await (const record of gzipRecords(path.join(releaseDirectory, excludedInactiveArtifacts[0].path))) {
        if (!(/^[A-Z0-9]{6,12}$/.test(record.source_record_id ?? "") || /^source-row:\d+$/.test(record.source_record_id ?? "")) || record.reason !== "source-record-is-inactive" || record.export_policy !== "internal" || record.source_release_id !== manifest.source_release_id || excludedIds.has(record.source_record_id) || ids.has(record.source_record_id)) throw new Error(`invalid inactive-source exclusion ${record.source_record_id}`);
        excludedIds.add(record.source_record_id);
        actualExcludedInactiveHash.update(json(record));
        inactiveSourceRecords += 1;
      }
      if (inactiveSourceRecords !== excludedInactiveArtifacts[0].record_count) throw new Error("inactive-source exclusion record count mismatch");
    } catch (error) {
      failures.push({ path: excludedInactiveArtifacts[0].path, reason: `inactive-source exclusion validation failed: ${error.message}` });
    }
  }
  let quarantinedRecords = 0;
  const quarantineIds = new Set();
  if (quarantineArtifacts.length === 1) {
    try {
      for await (const record of gzipRecords(path.join(releaseDirectory, quarantineArtifacts[0].path))) {
        if (!(/^[A-Z0-9]{6,12}$/.test(record.source_record_id ?? "") || /^source-row:\d+$/.test(record.source_record_id ?? "")) || record.export_policy !== "internal" || record.source_release_id !== manifest.source_release_id || ids.has(record.source_record_id) || excludedIds.has(record.source_record_id) || quarantineIds.has(record.source_record_id)) throw new Error(`invalid quarantine record ${record.source_record_id}`);
        quarantineIds.add(record.source_record_id);
        actualQuarantineHash.update(json(record));
        quarantinedRecords += 1;
      }
      if (quarantinedRecords !== quarantineArtifacts[0].record_count) throw new Error("quarantine record count mismatch");
    } catch (error) {
      failures.push({ path: quarantineArtifacts[0].path, reason: `quarantine validation failed: ${error.message}` });
    }
  }
  if (organizations !== manifest.coverage?.organizations_published) failures.push({ path: "manifest.json", reason: "published organization count does not reconcile" });
  if (organizations + quarantinedRecords !== manifest.coverage?.active_source_records || quarantinedRecords !== manifest.coverage?.quarantined_source_records) failures.push({ path: "manifest.json", reason: "active published and quarantined counts do not reconcile" });
  if (organizations + quarantinedRecords + inactiveSourceRecords !== manifest.coverage?.source_records || inactiveSourceRecords !== manifest.coverage?.inactive_source_records_excluded) failures.push({ path: "manifest.json", reason: "all source status counts do not reconcile" });
  if (eligibleAddresses !== manifest.coverage?.eligible_reported_us_principal_addresses) failures.push({ path: "manifest.json", reason: "eligible address count does not reconcile" });
  for (const prefix of "0123456789abcdef") if (expectedReplayHashes.get(prefix).digest("hex") !== actualReplayHashes.get(prefix).digest("hex")) failures.push({ path: `derived/organizations/id-hash-prefix=${prefix}.jsonl.gz`, reason: "source replay does not match normalized records" });
  if (expectedQuarantineHash.digest("hex") !== actualQuarantineHash.digest("hex")) failures.push({ path: quarantineArtifacts[0]?.path ?? "manifest.json", reason: "source replay does not match quarantine records" });
  if (expectedExcludedInactiveHash.digest("hex") !== actualExcludedInactiveHash.digest("hex")) failures.push({ path: excludedInactiveArtifacts[0]?.path ?? "manifest.json", reason: "source replay does not match inactive-source exclusions" });
  const zipArtifact = manifest.artifacts?.find((artifact) => artifact.artifact_type === "fl-business-registry-zip-coverage-jsonl");
  if (!zipArtifact) failures.push({ path: "manifest.json", reason: "missing ZIP coverage artifact" });
  else {
    try {
      const rows = (await readFile(path.join(releaseDirectory, zipArtifact.path), "utf8")).split(/\r?\n/).filter(Boolean).map(JSON.parse);
      if (rows.length !== zipArtifact.record_count || rows.length !== manifest.coverage?.zip_union_records) throw new Error("ZIP row count mismatch");
      const total = rows.reduce((sum, row) => sum + row.fl_business_registry_quarterly_active_entity_snapshot.organization_reported_principal_address_count, 0);
      if (total !== eligibleAddresses) throw new Error("ZIP organization address counts do not reconcile");
      for (const row of rows) {
        const source = row.fl_business_registry_quarterly_active_entity_snapshot;
        if ((countsByZip.get(row.zip_code) ?? 0) !== source.organization_reported_principal_address_count) throw new Error(`ZIP ${row.zip_code} does not reconcile`);
        if (row.current_usps_validity?.status !== "unverified") throw new Error(`ZIP ${row.zip_code} has unsupported USPS validity`);
        if (source.physical_site_count !== null || source.physical_site_inference_permitted !== false) throw new Error(`ZIP ${row.zip_code} implies a physical site`);
      }
    } catch (error) {
      failures.push({ path: zipArtifact.path, reason: `ZIP validation failed: ${error.message}` });
    }
  }
  if (failures.length) {
    const error = new Error(`Florida Business Registry release verification failed for ${failures.length} check(s).`);
    error.failures = failures;
    throw error;
  }
  return { dataset_id: manifest.dataset_id, release_id: manifest.release_id, source_release_id: manifest.source_release_id, artifact_count: manifest.artifacts.length, coverage: manifest.coverage };
}
