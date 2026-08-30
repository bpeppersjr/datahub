import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { Readable, Transform } from "node:stream";
import { finished, pipeline } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";
import { parse } from "csv-parse";
import unzipper from "unzipper";

export const NONEMPLOYER_SCHEMA_VERSION = "1.0.0";
export const NONEMPLOYER_TRANSFORMATION_VERSION = "us-census-nonemployer@1.0.0";
export const NONEMPLOYER_INDEX_URL = "https://www2.census.gov/programs-surveys/nonemployer-statistics/data/";
export const NONEMPLOYER_SOURCE_FIELDS = Object.freeze([
  "GEOTYPE",
  "ST",
  "COUNTY",
  "CSA",
  "MSA",
  "GEO_ID",
  "GEO_LABEL",
  "GEO_ID_F",
  "NAICS2022",
  "NAICS2022_LABEL",
  "NAICS2022_F",
  "LFO",
  "LFO_LABEL",
  "RCPSZES",
  "RCPSZES_LABEL",
  "YEAR",
  "NESTAB",
  "NESTAB_F",
  "NRCPTOT",
  "NRCPTOT_F",
  "NRCPTOT_N",
  "NRCPTOT_N_F",
  "INDLEVEL",
  "SECTOR",
  "SUBSECTOR",
]);

const NONEMPLOYER_HOST = "www2.census.gov";
const MAX_SOURCE_ARCHIVE_BYTES = 100_000_000;
const MAX_UNCOMPRESSED_DATA_BYTES = 1_000_000_000;
const INCLUDED_GEOGRAPHIES = Object.freeze({
  "01": "national",
  "02": "state",
  "03": "county",
});
const OFFICIAL_QUALITY_MINIMUMS = Object.freeze({
  national_rows: 6_000,
  state_rows: 90_000,
  county_rows: 690_000,
  national_totals: 1,
  state_totals: 51,
  county_totals: 3_100,
});

function integerOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  return /^-?\d+$/.test(String(value)) ? Number(value) : null;
}

function cleanSourceHeader(value) {
  return String(value ?? "").replace(/^\uFEFF/, "").replace(/^#/, "");
}

function assertSourceHeaders(headers) {
  const cleaned = headers.map(cleanSourceHeader);
  if (JSON.stringify(cleaned) !== JSON.stringify(NONEMPLOYER_SOURCE_FIELDS)) {
    throw new Error(`Census Nonemployer schema drift: expected ${NONEMPLOYER_SOURCE_FIELDS.length} fields, received ${cleaned.length}.`);
  }
  return cleaned;
}

function geographyIdentity(row) {
  const geographyType = INCLUDED_GEOGRAPHIES[row.GEOTYPE];
  if (!geographyType) throw new Error(`Unsupported normalized Census Nonemployer geography type ${row.GEOTYPE}.`);
  if (geographyType === "national") {
    if (row.ST !== "00" || row.COUNTY !== "000") throw new Error("National Nonemployer row has unexpected state/county codes.");
    return { geography_type: geographyType, geoid: "US", state_fips: null, county_fips: null };
  }
  if (!/^\d{2}$/.test(row.ST) || row.ST === "00") throw new Error(`Invalid Nonemployer state FIPS ${row.ST}.`);
  if (geographyType === "state") {
    if (row.COUNTY !== "000") throw new Error(`State Nonemployer row ${row.ST} has county ${row.COUNTY}.`);
    return { geography_type: geographyType, geoid: row.ST, state_fips: row.ST, county_fips: null };
  }
  if (!/^\d{3}$/.test(row.COUNTY) || row.COUNTY === "000") throw new Error(`Invalid Nonemployer county FIPS ${row.COUNTY}.`);
  return { geography_type: geographyType, geoid: `${row.ST}${row.COUNTY}`, state_fips: row.ST, county_fips: row.COUNTY };
}

function sourceRecordId(identity, row) {
  return [identity.geography_type, identity.geoid, row.NAICS2022, row.LFO, row.RCPSZES].join(":");
}

export function normalizeNonemployerRecord(row, referenceYear, provenance = {}) {
  const identity = geographyIdentity(row);
  if (String(row.YEAR) !== String(referenceYear)) throw new Error(`Unexpected Nonemployer reference year ${row.YEAR}.`);
  if (!row.NAICS2022 || !row.LFO || !row.RCPSZES) throw new Error("Nonemployer row is missing its industry, legal-form, or receipt-size key.");
  const recordId = sourceRecordId(identity, row);
  return {
    schema_version: NONEMPLOYER_SCHEMA_VERSION,
    record_id: recordId,
    ...identity,
    source_geo_id: row.GEO_ID || null,
    geography_name: row.GEO_LABEL || null,
    geography_footnote: row.GEO_ID_F || null,
    reference_year: referenceYear,
    naics: {
      code: row.NAICS2022,
      label: row.NAICS2022_LABEL || null,
      footnote: row.NAICS2022_F || null,
      industry_level: integerOrNull(row.INDLEVEL),
      sector: row.SECTOR || null,
      subsector: row.SUBSECTOR || null,
    },
    legal_form: { code: row.LFO, label: row.LFO_LABEL || null },
    receipt_size: { code: row.RCPSZES, label: row.RCPSZES_LABEL || null },
    measures: {
      nonemployer_establishments: integerOrNull(row.NESTAB),
      nonemployer_establishments_flag: row.NESTAB_F || null,
      receipts_thousands_usd: integerOrNull(row.NRCPTOT),
      receipts_flag: row.NRCPTOT_F || null,
      receipts_noise_range_thousands_usd: integerOrNull(row.NRCPTOT_N),
      receipts_noise_range_flag: row.NRCPTOT_N_F || null,
      flags_preserved_without_reinterpretation: true,
    },
    provenance: {
      source_id: `census-nonemployer-${referenceYear}`,
      source_release_id: provenance.source_release_id ?? `census-nonemployer-${referenceYear}`,
      source_record_id: recordId,
      ingest_run_id: provenance.ingest_run_id ?? "unspecified",
      transformation_version: NONEMPLOYER_TRANSFORMATION_VERSION,
      policy_id: "us-census-nonemployer",
    },
  };
}

function isGeographyTotal(record) {
  return record.naics.code === "00" && record.legal_form.code === "001" && record.receipt_size.code === "001";
}

export function nonemployerGeographyTotal(record) {
  if (!isGeographyTotal(record)) throw new Error(`${record.record_id} is not an all-sector/all-establishment geography total.`);
  return {
    schema_version: NONEMPLOYER_SCHEMA_VERSION,
    geography_type: record.geography_type,
    geoid: record.geoid,
    state_fips: record.state_fips,
    county_fips: record.county_fips,
    source_geo_id: record.source_geo_id,
    geography_name: record.geography_name,
    reference_year: record.reference_year,
    observation_period: { from: `${record.reference_year}-01-01`, to: `${record.reference_year}-12-31` },
    status: "published-annual-aggregate",
    universe: "businesses-with-no-paid-employees-subject-to-federal-income-tax-and-meeting-source-receipts-threshold",
    nonemployer_establishments: record.measures.nonemployer_establishments,
    nonemployer_establishments_flag: record.measures.nonemployer_establishments_flag,
    receipts_thousands_usd: record.measures.receipts_thousands_usd,
    receipts_flag: record.measures.receipts_flag,
    receipts_noise_range_thousands_usd: record.measures.receipts_noise_range_thousands_usd,
    receipts_noise_range_flag: record.measures.receipts_noise_range_flag,
    provenance: record.provenance,
  };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function hashFile(filePath) {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(filePath)) {
    bytes += chunk.length;
    hash.update(chunk);
  }
  return { bytes, sha256: hash.digest("hex") };
}

async function renameWithRetry(sourcePath, destinationPath, attempts = 7) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await rename(sourcePath, destinationPath);
      return;
    } catch (error) {
      lastError = error;
      if (!["EACCES", "EBUSY", "EPERM"].includes(error.code) || attempt === attempts - 1) break;
      await new Promise((resolve) => setTimeout(resolve, 50 * (2 ** attempt)));
    }
  }
  throw lastError;
}

async function writeArtifact(releaseDirectory, relativePath, content, metadata = {}) {
  const destination = path.join(releaseDirectory, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
  const temporary = `${destination}.tmp-${randomUUID()}`;
  await writeFile(temporary, buffer);
  await renameWithRetry(temporary, destination);
  return {
    path: relativePath.replaceAll("\\", "/"),
    bytes: buffer.byteLength,
    sha256: sha256(buffer),
    ...metadata,
  };
}

function json(value) {
  return `${JSON.stringify(value)}\n`;
}

function jsonLines(records) {
  return records.length ? `${records.map((record) => JSON.stringify(record)).join("\n")}\n` : "";
}

async function fetchWithRetry(url, options, { fetchImpl, retries = 3 }) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" || parsed.hostname !== NONEMPLOYER_HOST) {
        throw new Error(`Disallowed Census Nonemployer URL ${url}.`);
      }
      const response = await fetchImpl(url, {
        redirect: "error",
        signal: AbortSignal.timeout(300_000),
        ...options,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
      await new Promise((resolve) => setTimeout(resolve, 500 * (2 ** attempt)));
    }
  }
  throw lastError;
}

export async function discoverLatestNonemployer({ fetchImpl = globalThis.fetch, year = null } = {}) {
  const candidateYears = year === null
    ? [...(await (await fetchWithRetry(NONEMPLOYER_INDEX_URL, {}, { fetchImpl })).text())
        .matchAll(/href=["'](\d{4})\/["']/g)]
        .map((match) => Number(match[1]))
        .filter((candidate) => candidate >= 1997)
        .sort((left, right) => right - left)
    : [Number(year)];
  if (candidateYears.length === 0) throw new Error("No Census Nonemployer dataset years were discovered.");
  for (const candidate of candidateYears) {
    if (!Number.isInteger(candidate) || candidate < 1997 || candidate > 2100) continue;
    const suffix = String(candidate).slice(-2);
    const archiveUrl = `${NONEMPLOYER_INDEX_URL}${candidate}/NS${suffix}00NONEMP.zip`;
    try {
      const response = await fetchWithRetry(archiveUrl, { method: "HEAD" }, { fetchImpl, retries: 0 });
      return {
        referenceYear: candidate,
        archiveUrl,
        metadata: {
          content_length: Number(response.headers.get("content-length")) || null,
          content_type: response.headers.get("content-type"),
          last_modified: response.headers.get("last-modified"),
          etag: response.headers.get("etag"),
        },
      };
    } catch {
      // A year directory can appear before the final combined archive is published.
    }
  }
  throw new Error("No complete Census Nonemployer release was found.");
}

async function downloadFile(url, destination, options) {
  await mkdir(path.dirname(destination), { recursive: true });
  const response = await fetchWithRetry(url, {}, options);
  if (!response.body) throw new Error(`No response body for ${url}.`);
  const declaredBytes = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredBytes) && declaredBytes > MAX_SOURCE_ARCHIVE_BYTES) {
    throw new Error(`Census Nonemployer archive declares ${declaredBytes} bytes, above the ${MAX_SOURCE_ARCHIVE_BYTES}-byte limit.`);
  }
  const temporary = `${destination}.tmp-${randomUUID()}`;
  const hash = createHash("sha256");
  let bytes = 0;
  const tee = new Transform({
    transform(chunk, encoding, callback) {
      bytes += chunk.length;
      if (bytes > MAX_SOURCE_ARCHIVE_BYTES) {
        callback(new Error(`Census Nonemployer archive exceeded the ${MAX_SOURCE_ARCHIVE_BYTES}-byte limit.`));
        return;
      }
      hash.update(chunk);
      callback(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(response.body), tee, createWriteStream(temporary));
  await renameWithRetry(temporary, destination);
  return {
    bytes,
    sha256: hash.digest("hex"),
    content_type: response.headers.get("content-type"),
    last_modified: response.headers.get("last-modified"),
    etag: response.headers.get("etag"),
  };
}

async function validateArchive(zipPath, referenceYear) {
  const suffix = String(referenceYear).slice(-2);
  const expectedNames = [
    `NS${suffix}00NONEMP.dat`,
    `NS${suffix}00NONEMP_FIELDS.txt`,
    `NS${suffix}00NONEMP_README.txt`,
  ];
  const directory = await unzipper.Open.file(zipPath);
  const files = directory.files.filter((file) => file.type === "File");
  const names = files.map((file) => file.path).sort();
  if (files.some((file) => file.path.includes("..") || path.isAbsolute(file.path))) {
    throw new Error("Census Nonemployer archive contains an unsafe path.");
  }
  if (JSON.stringify(names) !== JSON.stringify([...expectedNames].sort())) {
    throw new Error(`Unexpected Census Nonemployer archive contents: ${names.join(", ")}.`);
  }
  const dataEntry = files.find((file) => file.path.endsWith("NONEMP.dat"));
  if (!Number.isFinite(dataEntry.uncompressedSize) || dataEntry.uncompressedSize > MAX_UNCOMPRESSED_DATA_BYTES) {
    throw new Error(`Census Nonemployer data entry exceeds the ${MAX_UNCOMPRESSED_DATA_BYTES}-byte uncompressed limit.`);
  }
  const fieldsEntry = files.find((file) => file.path.endsWith("_FIELDS.txt"));
  const fieldLines = (await fieldsEntry.buffer()).toString("utf8").split(/\r?\n/).filter(Boolean);
  const declaredFields = fieldLines.slice(1).map((line) => line.split("|")[0]);
  if (JSON.stringify(declaredFields) !== JSON.stringify(NONEMPLOYER_SOURCE_FIELDS)) {
    throw new Error("Census Nonemployer companion field list does not match the pinned schema.");
  }
  return {
    dataEntry,
    fieldsEntry,
    readmeEntry: files.find((file) => file.path.endsWith("_README.txt")),
  };
}

function releaseTimestamp(instant) {
  return instant.replaceAll(/[-:.]/g, "").replace("T", "-").replace("Z", "Z");
}

async function createGzipWriter(stagingDirectory, geographyType) {
  const relativePath = `derived/industry/${geographyType}.jsonl.gz`;
  const destination = path.join(stagingDirectory, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp-${randomUUID()}`;
  const output = createWriteStream(temporary, { flags: "wx" });
  const gzip = createGzip();
  gzip.pipe(output);
  return { geographyType, relativePath, destination, temporary, output, gzip, rows: 0 };
}

async function processArchive(zipPath, referenceYear, stagingDirectory, provenance, logger) {
  const archive = await validateArchive(zipPath, referenceYear);
  const writers = new Map();
  for (const geographyType of Object.values(INCLUDED_GEOGRAPHIES)) {
    writers.set(geographyType, await createGzipWriter(stagingDirectory, geographyType));
  }
  const sourceCountsByGeotype = {};
  const normalizedCountsByGeography = { national: 0, state: 0, county: 0 };
  const totals = [];
  const totalIds = new Set();
  const recordIds = new Set();
  const parser = parse({
    columns: assertSourceHeaders,
    delimiter: "|",
    skip_empty_lines: true,
  });
  archive.dataEntry.stream().pipe(parser);
  let sourceRows = 0;
  for await (const row of parser) {
    sourceRows += 1;
    sourceCountsByGeotype[row.GEOTYPE] = (sourceCountsByGeotype[row.GEOTYPE] ?? 0) + 1;
    const geographyType = INCLUDED_GEOGRAPHIES[row.GEOTYPE];
    if (!geographyType) continue;
    const record = normalizeNonemployerRecord(row, referenceYear, provenance);
    if (recordIds.has(record.record_id)) throw new Error(`Duplicate Census Nonemployer record ${record.record_id}.`);
    recordIds.add(record.record_id);
    const writer = writers.get(geographyType);
    if (!writer.gzip.write(json(record))) await once(writer.gzip, "drain");
    writer.rows += 1;
    normalizedCountsByGeography[geographyType] += 1;
    if (isGeographyTotal(record)) {
      const total = nonemployerGeographyTotal(record);
      const totalId = `${total.geography_type}:${total.geoid}`;
      if (totalIds.has(totalId)) throw new Error(`Duplicate Census Nonemployer total ${totalId}.`);
      totalIds.add(totalId);
      totals.push(total);
    }
    if (sourceRows % 250_000 === 0) logger(`Validated ${sourceRows.toLocaleString("en-US")} Census Nonemployer rows.`);
  }
  const finishPromises = [...writers.values()].map((writer) => finished(writer.output));
  for (const writer of writers.values()) writer.gzip.end();
  await Promise.all(finishPromises);
  const artifacts = [];
  for (const writer of writers.values()) {
    await renameWithRetry(writer.temporary, writer.destination);
    artifacts.push({
      path: writer.relativePath,
      ...(await hashFile(writer.destination)),
      record_count: writer.rows,
      artifact_type: "normalized-nonemployer-industry-jsonl-gzip",
      geography_type: writer.geographyType,
    });
  }
  totals.sort((left, right) => left.geography_type.localeCompare(right.geography_type) || left.geoid.localeCompare(right.geoid));
  return { artifacts, sourceRows, sourceCountsByGeotype, normalizedCountsByGeography, totals };
}

function assertQuality(processed, minimums) {
  const actual = {
    national_rows: processed.normalizedCountsByGeography.national,
    state_rows: processed.normalizedCountsByGeography.state,
    county_rows: processed.normalizedCountsByGeography.county,
    national_totals: processed.totals.filter((row) => row.geography_type === "national").length,
    state_totals: processed.totals.filter((row) => row.geography_type === "state").length,
    county_totals: processed.totals.filter((row) => row.geography_type === "county").length,
  };
  for (const [key, minimum] of Object.entries(minimums)) {
    if (actual[key] < minimum) throw new Error(`Census Nonemployer ${key} ${actual[key]} is below the quality floor ${minimum}.`);
  }
  return actual;
}

export async function buildCensusNonemployerBaseline({
  outputRoot,
  year = null,
  fetchImpl = globalThis.fetch,
  logger = console.log,
  now = () => new Date(),
  qualityMinimums = OFFICIAL_QUALITY_MINIMUMS,
} = {}) {
  if (!outputRoot) throw new Error("outputRoot is required.");
  const retrievedAt = now().toISOString();
  const runId = randomUUID();
  const discovered = await discoverLatestNonemployer({ fetchImpl, year });
  const releaseId = `census-nonemployer-${discovered.referenceYear}-${releaseTimestamp(retrievedAt)}-${runId.slice(0, 8)}`;
  const stagingDirectory = path.join(outputRoot, ".staging", runId);
  await mkdir(stagingDirectory, { recursive: true });
  const archiveName = `NS${String(discovered.referenceYear).slice(-2)}00NONEMP.zip`;
  const sourceRelativePath = `source/${archiveName}`;
  const archivePath = path.join(stagingDirectory, sourceRelativePath);
  logger(`Downloading Census ${discovered.referenceYear} Nonemployer Statistics.`);
  const download = await downloadFile(discovered.archiveUrl, archivePath, { fetchImpl });
  const artifacts = [{
    path: sourceRelativePath,
    ...download,
    artifact_type: "source-archive",
    source_url: discovered.archiveUrl,
  }];
  const processed = await processArchive(
    archivePath,
    discovered.referenceYear,
    stagingDirectory,
    { source_release_id: releaseId, ingest_run_id: runId },
    logger,
  );
  artifacts.push(...processed.artifacts);
  const quality = assertQuality(processed, qualityMinimums);
  artifacts.push(await writeArtifact(
    stagingDirectory,
    "derived/geography-totals.jsonl",
    jsonLines(processed.totals),
    { artifact_type: "nonemployer-geography-totals-jsonl", record_count: processed.totals.length },
  ));
  const nationalTotal = processed.totals.find((row) => row.geography_type === "national");
  const stateTotals = processed.totals.filter((row) => row.geography_type === "state");
  const countyTotals = processed.totals.filter((row) => row.geography_type === "county");
  const stateEstablishments = stateTotals.reduce((sum, row) => sum + (row.nonemployer_establishments ?? 0), 0);
  const countyEstablishments = countyTotals.reduce((sum, row) => sum + (row.nonemployer_establishments ?? 0), 0);
  if (!nationalTotal || nationalTotal.nonemployer_establishments === null) throw new Error("Census Nonemployer national total is missing.");
  if (stateEstablishments !== nationalTotal.nonemployer_establishments) {
    throw new Error(`State totals ${stateEstablishments} do not reconcile to national ${nationalTotal.nonemployer_establishments}.`);
  }
  if (countyEstablishments > nationalTotal.nonemployer_establishments) {
    throw new Error("County Nonemployer establishments exceed the national total.");
  }
  const manifest = {
    schema_version: NONEMPLOYER_SCHEMA_VERSION,
    dataset_id: "census-nonemployer-baseline",
    connector: { id: "us-census-nonemployer", version: "1.0.0" },
    release_id: releaseId,
    run_id: runId,
    retrieved_at: retrievedAt,
    reference_year: discovered.referenceYear,
    status: "published-annual-aggregate",
    complete_source_release: true,
    geography_scope: "50-states-and-district-of-columbia",
    coverage: {
      source_rows_all_geographies: processed.sourceRows,
      source_rows_by_geotype: Object.fromEntries(Object.entries(processed.sourceCountsByGeotype).sort()),
      normalized_national_industry_rows: quality.national_rows,
      normalized_state_industry_rows: quality.state_rows,
      normalized_county_industry_rows: quality.county_rows,
      national_totals: quality.national_totals,
      state_totals: quality.state_totals,
      county_totals: quality.county_totals,
      national_nonemployer_establishments: nationalTotal.nonemployer_establishments,
      state_nonemployer_establishments: stateEstablishments,
      county_nonemployer_establishments: countyEstablishments,
      nonemployer_establishments_not_allocated_to_county: nationalTotal.nonemployer_establishments - countyEstablishments,
    },
    sources: [{
      source_id: `census-nonemployer-${discovered.referenceYear}`,
      publisher: "United States Census Bureau",
      reference_year: discovered.referenceYear,
      archive_url: discovered.archiveUrl,
      discovery_url: NONEMPLOYER_INDEX_URL,
      policy_profile: "config/source-policies/us-census-nonemployer.json",
      source_metadata: discovered.metadata,
    }],
    count_semantics: {
      nonemployer_establishments: "annual aggregate count of businesses with no paid employees meeting the Census source universe and receipts thresholds",
      temporal_status: "operated during at least part of the reference year; not a current named-business operating-status assertion",
      receipts: "reported in thousands of U.S. dollars with Census flags and noise ranges preserved",
      geography: "published national, state, and county aggregate rows; no ZIP allocation is available",
    },
    limitations: [
      "Nonemployer Statistics is an annual aggregate dataset, not a record-level directory of named businesses.",
      "The source universe covers businesses with no paid employees that are subject to federal income tax and meet Census receipts thresholds.",
      "Reference-year activity does not prove that a business is operating now.",
      "The national/state/county archive covers the 50 states and District of Columbia; Census state-equivalent territories remain explicit coverage gaps.",
      "The source publishes no ZIP-level Nonemployer Statistics, so totals must not be distributed to ZIPs or ZCTAs.",
      "Suppression, footnote, and noise-range flags are preserved; flagged or absent measures must not be converted into unsupported values.",
      "Aggregate totals cannot be linked to, merged with, or used to infer the identity of an individual business.",
    ],
    artifacts: artifacts.sort((left, right) => left.path.localeCompare(right.path)),
  };
  await writeArtifact(stagingDirectory, "manifest.json", json(manifest));
  const releaseDirectory = path.join(outputRoot, "releases", releaseId);
  await mkdir(path.dirname(releaseDirectory), { recursive: true });
  await renameWithRetry(stagingDirectory, releaseDirectory);
  const pointerPath = path.join(outputRoot, "current.json");
  const temporaryPointer = `${pointerPath}.tmp-${runId}`;
  await writeFile(temporaryPointer, json({
    dataset_id: manifest.dataset_id,
    release_id: releaseId,
    manifest: `releases/${releaseId}/manifest.json`,
    updated_at: retrievedAt,
  }));
  await renameWithRetry(temporaryPointer, pointerPath);
  if (!(await stat(releaseDirectory)).isDirectory()) throw new Error("Published Nonemployer release is not a directory.");
  return { manifest, releaseDirectory, pointerPath };
}

async function countGzipJsonLines(filePath, visitor = null) {
  const input = createReadStream(filePath).pipe(createGunzip());
  const lines = createInterface({ input, crlfDelay: Infinity });
  let count = 0;
  for await (const line of lines) {
    if (!line) continue;
    const row = JSON.parse(line);
    count += 1;
    if (visitor) visitor(row);
  }
  return count;
}

export async function verifyCensusNonemployerRelease(manifestPath) {
  const absoluteManifestPath = path.resolve(manifestPath);
  const releaseDirectory = path.dirname(absoluteManifestPath);
  const manifest = JSON.parse(await readFile(absoluteManifestPath, "utf8"));
  if (manifest.dataset_id !== "census-nonemployer-baseline") throw new Error(`Unexpected dataset_id ${manifest.dataset_id ?? "missing"}.`);
  if (manifest.status !== "published-annual-aggregate" || manifest.complete_source_release !== true) {
    throw new Error("Census Nonemployer release is not a complete published aggregate source release.");
  }
  const failures = [];
  for (const artifact of manifest.artifacts ?? []) {
    const absolutePath = path.resolve(releaseDirectory, artifact.path);
    const relative = path.relative(releaseDirectory, absolutePath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      failures.push({ path: artifact.path, reason: "path escapes release directory" });
      continue;
    }
    try {
      const digest = await hashFile(absolutePath);
      if (digest.bytes !== artifact.bytes) failures.push({ path: artifact.path, reason: `expected ${artifact.bytes} bytes, found ${digest.bytes}` });
      else if (digest.sha256 !== artifact.sha256) failures.push({ path: artifact.path, reason: "SHA-256 mismatch" });
    } catch (error) {
      failures.push({ path: artifact.path, reason: error.code === "ENOENT" ? "missing" : error.message });
    }
  }
  if (failures.length) {
    const error = new Error(`Census Nonemployer release verification failed for ${failures.length} artifact(s).`);
    error.failures = failures;
    throw error;
  }
  const industryArtifacts = (manifest.artifacts ?? []).filter((artifact) => artifact.artifact_type === "normalized-nonemployer-industry-jsonl-gzip");
  if (industryArtifacts.length !== 3) throw new Error(`Expected three normalized Nonemployer industry artifacts, found ${industryArtifacts.length}.`);
  const expectedRows = {
    national: manifest.coverage.normalized_national_industry_rows,
    state: manifest.coverage.normalized_state_industry_rows,
    county: manifest.coverage.normalized_county_industry_rows,
  };
  for (const artifact of industryArtifacts) {
    const seen = new Set();
    const rows = await countGzipJsonLines(path.join(releaseDirectory, artifact.path), (row) => {
      if (row.schema_version !== NONEMPLOYER_SCHEMA_VERSION || row.geography_type !== artifact.geography_type) {
        throw new Error(`${artifact.path} contains a row with incompatible schema/geography.`);
      }
      if (seen.has(row.record_id)) throw new Error(`${artifact.path} contains duplicate ${row.record_id}.`);
      seen.add(row.record_id);
      if (row.provenance?.policy_id !== "us-census-nonemployer") throw new Error(`${row.record_id} is missing source policy provenance.`);
    });
    if (rows !== artifact.record_count || rows !== expectedRows[artifact.geography_type]) {
      throw new Error(`${artifact.path} row count ${rows} does not reconcile to its artifact and manifest.`);
    }
  }
  const totalsArtifact = (manifest.artifacts ?? []).find((artifact) => artifact.artifact_type === "nonemployer-geography-totals-jsonl");
  if (!totalsArtifact) throw new Error("Nonemployer geography totals artifact is missing.");
  const totals = (await readFile(path.join(releaseDirectory, totalsArtifact.path), "utf8"))
    .split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  if (totals.length !== totalsArtifact.record_count
      || totals.length !== manifest.coverage.national_totals + manifest.coverage.state_totals + manifest.coverage.county_totals) {
    throw new Error("Nonemployer geography totals count does not reconcile.");
  }
  const uniqueTotals = new Set(totals.map((row) => `${row.geography_type}:${row.geoid}`));
  if (uniqueTotals.size !== totals.length) throw new Error("Nonemployer geography totals contain duplicate geographies.");
  const national = totals.find((row) => row.geography_type === "national");
  const stateSum = totals.filter((row) => row.geography_type === "state").reduce((sum, row) => sum + (row.nonemployer_establishments ?? 0), 0);
  const countySum = totals.filter((row) => row.geography_type === "county").reduce((sum, row) => sum + (row.nonemployer_establishments ?? 0), 0);
  if (!national || national.nonemployer_establishments !== manifest.coverage.national_nonemployer_establishments) throw new Error("National Nonemployer total does not match the manifest.");
  if (stateSum !== manifest.coverage.state_nonemployer_establishments || stateSum !== national.nonemployer_establishments) throw new Error("State Nonemployer totals do not reconcile to national.");
  if (countySum !== manifest.coverage.county_nonemployer_establishments) throw new Error("County Nonemployer totals do not match the manifest.");
  if (national.nonemployer_establishments - countySum !== manifest.coverage.nonemployer_establishments_not_allocated_to_county) {
    throw new Error("Nonemployer county allocation difference does not match the manifest.");
  }
  return {
    dataset_id: manifest.dataset_id,
    release_id: manifest.release_id,
    reference_year: manifest.reference_year,
    artifact_count: manifest.artifacts.length,
    verified_bytes: manifest.artifacts.reduce((sum, artifact) => sum + artifact.bytes, 0),
    coverage: manifest.coverage,
  };
}
