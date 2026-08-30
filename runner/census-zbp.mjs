import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { finished, pipeline } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";
import { createInterface } from "node:readline";
import { parse } from "csv-parse";
import { parse as parseSync } from "csv-parse/sync";
import unzipper from "unzipper";

export const ZBP_DATASET_SCHEMA_VERSION = "1.0.0";
export const ZBP_INDEX_URL = "https://www2.census.gov/programs-surveys/cbp/datasets/";

const ZBP_HOST = "www2.census.gov";
const DETAIL_SIZE_COLUMNS = Object.freeze([
  ["n<5", "size_1_4"],
  ["n5_9", "size_5_9"],
  ["n10_19", "size_10_19"],
  ["n20_49", "size_20_49"],
  ["n50_99", "size_50_99"],
  ["n100_249", "size_100_249"],
  ["n250_499", "size_250_499"],
  ["n500_999", "size_500_999"],
  ["n1000", "size_1000_plus"],
]);

function integerOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  return /^-?\d+$/.test(String(value)) ? Number(value) : null;
}

function suppressionCode(value) {
  return integerOrNull(value) === null && value !== null && value !== undefined && value !== ""
    ? String(value)
    : null;
}

function assertZip(value) {
  const zipCode = String(value ?? "").padStart(5, "0");
  if (!/^\d{5}$/.test(zipCode)) throw new Error(`Invalid ZIP code ${value}.`);
  return zipCode;
}

export function normalizeZbpTotal(row, referenceYear) {
  const zipCode = assertZip(row.zip);
  return {
    zip_code: zipCode,
    postal_name: row.name || null,
    preferred_city: row.city || null,
    preferred_state: row.stabbr || null,
    county_name: row.cty_name || null,
    reference_year: referenceYear,
    establishments: integerOrNull(row.est),
    employment: integerOrNull(row.emp),
    employment_suppression_code: row.emp_nf || null,
    first_quarter_payroll_thousands_usd: integerOrNull(row.qp1),
    first_quarter_payroll_suppression_code: row.qp1_nf || null,
    annual_payroll_thousands_usd: integerOrNull(row.ap),
    annual_payroll_suppression_code: row.ap_nf || null,
  };
}

export function normalizeZbpDetail(row) {
  const normalized = {
    zip_code: assertZip(row.zip),
    naics_code: String(row.naics ?? ""),
    establishments: integerOrNull(row.est),
    preferred_city: row.city || null,
    preferred_state: row.stabbr || null,
    county_name: row.cty_name || null,
  };
  for (const [source, target] of DETAIL_SIZE_COLUMNS) {
    normalized[target] = integerOrNull(row[source]);
    normalized[`${target}_suppression_code`] = suppressionCode(row[source]);
  }
  return normalized;
}

function zipEvidenceRecord(zipCode, total, zcta, referenceYear, provenance) {
  const hasZbp = Boolean(total);
  const hasZcta = Boolean(zcta);
  const zbpProvenance = provenance.zbp ?? {
    source_id: `census-zbp-${referenceYear}`,
    source_release_id: `census-zbp-${referenceYear}`,
    source_record_id: zipCode,
    ingest_run_id: "unspecified",
    transformation_version: "us-census-zbp@1.0.0",
    policy_id: "us-census-zbp",
  };
  const geographyProvenance = provenance.geography ?? {
    source_id: "us-census-zcta-2020",
    source_release_id: "unspecified",
    source_record_id: zcta?.geoid ?? zipCode,
    ingest_run_id: "unspecified",
    transformation_version: "us-census-geography@1.0.0",
    policy_id: "us-census-geography",
  };
  return {
    schema_version: ZBP_DATASET_SCHEMA_VERSION,
    zip_code: zipCode,
    coverage_status: hasZbp && hasZcta
      ? "zbp-and-zcta"
      : hasZbp
        ? "zbp-without-zcta"
        : "zcta-without-published-zbp",
    current_usps_validity: {
      status: "unverified",
      reason: "Census ZBP and ZCTA observations do not constitute a current authoritative USPS ZIP master list.",
    },
    postal_label: hasZbp
      ? {
          name: total.postal_name,
          preferred_city: total.preferred_city,
          preferred_state: total.preferred_state,
          county_name: total.county_name,
          provenance: { ...zbpProvenance, source_record_id: zipCode },
        }
      : null,
    geography: hasZcta
      ? {
          status: "2020-zcta-polygon-available",
          geo_id: zcta.geo_id,
          geoid: zcta.geoid,
          centroid: zcta.centroid,
          internal_point: zcta.internal_point,
          bbox: zcta.bbox,
          geometry_file: zcta.geometry_file,
          provenance: { ...geographyProvenance, source_record_id: zcta.geoid },
        }
      : {
          status: "no-2020-zcta-polygon",
          geo_id: null,
          geoid: null,
          centroid: null,
          internal_point: null,
          bbox: null,
          geometry_file: null,
          provenance: { ...geographyProvenance, source_record_id: `absence:${zipCode}` },
        },
    employer_baseline: hasZbp
      ? {
          status: "published",
          source_id: `census-zbp-${referenceYear}`,
          reference_year: referenceYear,
          observation_period: { from: `${referenceYear}-01-01`, to: `${referenceYear}-12-31` },
          establishments: total.establishments,
          employment: total.employment,
          employment_suppression_code: total.employment_suppression_code,
          first_quarter_payroll_thousands_usd: total.first_quarter_payroll_thousands_usd,
          first_quarter_payroll_suppression_code: total.first_quarter_payroll_suppression_code,
          annual_payroll_thousands_usd: total.annual_payroll_thousands_usd,
          annual_payroll_suppression_code: total.annual_payroll_suppression_code,
          provenance: { ...zbpProvenance, source_record_id: zipCode },
        }
      : {
          status: "not-published-for-zip",
          source_id: `census-zbp-${referenceYear}`,
          reference_year: referenceYear,
          observation_period: { from: `${referenceYear}-01-01`, to: `${referenceYear}-12-31` },
          establishments: null,
          employment: null,
          employment_suppression_code: null,
          first_quarter_payroll_thousands_usd: null,
          first_quarter_payroll_suppression_code: null,
          annual_payroll_thousands_usd: null,
          annual_payroll_suppression_code: null,
          provenance: { ...zbpProvenance, source_record_id: `absence:${zipCode}` },
        },
    source_evidence: [
      {
        ...zbpProvenance,
        source_record_id: hasZbp ? zipCode : `absence:${zipCode}`,
        evidence_type: hasZbp ? "published-row" : "not-present-in-published-totals",
      },
      {
        ...geographyProvenance,
        source_record_id: hasZcta ? zcta.geoid : `absence:${zipCode}`,
        evidence_type: hasZcta ? "published-zcta" : "not-present-in-complete-zcta-index",
      },
    ],
  };
}

export function buildZipCoverage(totals, zctaRecords, referenceYear, provenance = {}) {
  const totalsByZip = new Map(totals.map((record) => [record.zip_code, record]));
  const zctasByZip = new Map(zctaRecords.map((record) => [record.zcta ?? record.geoid, record]));
  const zipCodes = [...new Set([...totalsByZip.keys(), ...zctasByZip.keys()])].sort();
  const records = zipCodes.map((zipCode) => zipEvidenceRecord(
    zipCode,
    totalsByZip.get(zipCode),
    zctasByZip.get(zipCode),
    referenceYear,
    provenance,
  ));
  const counts = {
    union_zip_codes: records.length,
    zbp_zip_codes: totalsByZip.size,
    zcta_zip_codes: zctasByZip.size,
    zbp_and_zcta: records.filter((record) => record.coverage_status === "zbp-and-zcta").length,
    zbp_without_zcta: records.filter((record) => record.coverage_status === "zbp-without-zcta").length,
    zcta_without_published_zbp: records.filter((record) => record.coverage_status === "zcta-without-published-zbp").length,
    authoritative_current_usps_zip_codes: null,
  };
  return { records, counts };
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
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

async function writeArtifact(releaseDirectory, relativePath, content, metadata = {}) {
  const destination = path.join(releaseDirectory, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
  const temporary = `${destination}.tmp-${randomUUID()}`;
  await writeFile(temporary, buffer);
  await rename(temporary, destination);
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
  return `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
}

async function fetchWithRetry(url, options, { fetchImpl, retries = 3 }) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" || parsed.hostname !== ZBP_HOST) {
        throw new Error(`Disallowed Census ZBP URL ${url}.`);
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

export async function discoverLatestZbp({ fetchImpl = globalThis.fetch, year = null } = {}) {
  const candidateYears = year === null
    ? [...(await (await fetchWithRetry(ZBP_INDEX_URL, {}, { fetchImpl })).text())
        .matchAll(/href=["'](\d{4})\/["']/g)]
        .map((match) => Number(match[1]))
        .filter((candidate) => candidate >= 1994)
        .sort((a, b) => b - a)
    : [Number(year)];
  if (candidateYears.length === 0) throw new Error("No Census ZBP dataset years were discovered.");
  for (const candidate of candidateYears) {
    if (!Number.isInteger(candidate) || candidate < 1994 || candidate > 2100) continue;
    const suffix = String(candidate).slice(-2);
    const base = `${ZBP_INDEX_URL}${candidate}`;
    const totalsUrl = `${base}/zbp${suffix}totals.zip`;
    const detailUrl = `${base}/zbp${suffix}detail.zip`;
    try {
      const [totals, detail] = await Promise.all([
        fetchWithRetry(totalsUrl, { method: "HEAD" }, { fetchImpl, retries: 0 }),
        fetchWithRetry(detailUrl, { method: "HEAD" }, { fetchImpl, retries: 0 }),
      ]);
      return {
        referenceYear: candidate,
        totalsUrl,
        detailUrl,
        metadata: {
          totals: {
            content_length: Number(totals.headers.get("content-length")) || null,
            last_modified: totals.headers.get("last-modified"),
            etag: totals.headers.get("etag"),
          },
          detail: {
            content_length: Number(detail.headers.get("content-length")) || null,
            last_modified: detail.headers.get("last-modified"),
            etag: detail.headers.get("etag"),
          },
        },
      };
    } catch {
      // A year directory can appear before both final ZBP files are published.
    }
  }
  throw new Error("No complete Census ZBP totals/detail release was found.");
}

async function downloadFile(url, destination, options) {
  await mkdir(path.dirname(destination), { recursive: true });
  const response = await fetchWithRetry(url, {}, options);
  if (!response.body) throw new Error(`No response body for ${url}.`);
  const temporary = `${destination}.tmp-${randomUUID()}`;
  const hash = createHash("sha256");
  let bytes = 0;
  const tee = new Transform({
    transform(chunk, encoding, callback) {
      bytes += chunk.length;
      hash.update(chunk);
      callback(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(response.body), tee, createWriteStream(temporary));
  await rename(temporary, destination);
  return {
    bytes,
    sha256: hash.digest("hex"),
    content_type: response.headers.get("content-type"),
    last_modified: response.headers.get("last-modified"),
    etag: response.headers.get("etag"),
  };
}

async function onlyZipEntry(zipPath, expectedPattern) {
  const directory = await unzipper.Open.file(zipPath);
  const files = directory.files.filter((file) => file.type === "File");
  if (files.length !== 1 || !expectedPattern.test(files[0].path)) {
    throw new Error(`Unexpected archive contents in ${path.basename(zipPath)}.`);
  }
  if (files[0].path.includes("..") || path.isAbsolute(files[0].path)) {
    throw new Error(`Unsafe archive entry ${files[0].path}.`);
  }
  return files[0];
}

async function loadTotals(zipPath, referenceYear) {
  const suffix = String(referenceYear).slice(-2);
  const entry = await onlyZipEntry(zipPath, new RegExp(`^zbp${suffix}totals\\.txt$`, "i"));
  const text = (await entry.buffer()).toString("utf8");
  const rows = parseSync(text, { columns: true, skip_empty_lines: true, bom: true });
  const normalized = rows.map((row) => normalizeZbpTotal(row, referenceYear));
  if (new Set(normalized.map((record) => record.zip_code)).size !== normalized.length) {
    throw new Error("Census ZBP totals contains duplicate ZIP rows.");
  }
  return normalized.sort((a, b) => a.zip_code.localeCompare(b.zip_code));
}

async function loadZctaDependency(geographyPointer) {
  const pointer = JSON.parse(await readFile(geographyPointer, "utf8"));
  const manifestPath = path.resolve(path.dirname(geographyPointer), pointer.manifest);
  const manifestBuffer = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBuffer.toString("utf8"));
  if (manifest.dataset_id !== "us-census-geography" || !manifest.complete_national_release) {
    throw new Error("A complete us-census-geography release is required before building ZBP coverage.");
  }
  const artifact = manifest.artifacts.find((candidate) => candidate.path === "derived/index/zctas.jsonl");
  if (!artifact) throw new Error("The geography release has no normalized ZCTA index.");
  const indexPath = path.join(path.dirname(manifestPath), artifact.path);
  const indexBuffer = await readFile(indexPath);
  if (indexBuffer.byteLength !== artifact.bytes || sha256(indexBuffer) !== artifact.sha256) {
    throw new Error("The geography ZCTA index failed checksum verification.");
  }
  const records = indexBuffer.toString("utf8").trim().split("\n").map((line) => JSON.parse(line));
  return {
    records,
    releaseId: manifest.release_id,
    schemaVersion: manifest.schema_version,
    runId: manifest.run_id,
    transformationVersion: `${manifest.connector?.id ?? "us-census-geography"}@${manifest.connector?.version ?? manifest.schema_version}`,
    manifestPath,
    manifestSha256: sha256(manifestBuffer),
  };
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const DETAIL_OUTPUT_COLUMNS = Object.freeze([
  "zip_code",
  "naics_code",
  "establishments",
  ...DETAIL_SIZE_COLUMNS.flatMap(([, target]) => [target, `${target}_suppression_code`]),
  "preferred_city",
  "preferred_state",
  "county_name",
]);

function detailCsvLine(record) {
  return `${DETAIL_OUTPUT_COLUMNS.map((column) => csvCell(record[column])).join(",")}\n`;
}

async function processDetail(zipPath, referenceYear, stagingDirectory, logger) {
  const suffix = String(referenceYear).slice(-2);
  const entry = await onlyZipEntry(zipPath, new RegExp(`^zbp${suffix}detail\\.txt$`, "i"));
  const detailDirectory = path.join(stagingDirectory, "derived", "zip-naics");
  await mkdir(detailDirectory, { recursive: true });
  const writers = new Map();
  for (const prefix of "0123456789") {
    const relativePath = `derived/zip-naics/prefix=${prefix}.csv.gz`;
    const destination = path.join(stagingDirectory, relativePath);
    const temporary = `${destination}.tmp-${randomUUID()}`;
    const output = createWriteStream(temporary, { flags: "wx" });
    const gzip = createGzip();
    gzip.pipe(output);
    gzip.write(`${DETAIL_OUTPUT_COLUMNS.join(",")}\n`);
    writers.set(prefix, { prefix, relativePath, destination, temporary, output, gzip, rows: 0 });
  }

  const naicsCoverage = new Map();
  let rowCount = 0;
  const source = entry.stream();
  const parser = parse({ columns: true, skip_empty_lines: true, bom: true });
  source.pipe(parser);
  for await (const raw of parser) {
    const record = normalizeZbpDetail(raw);
    const writer = writers.get(record.zip_code[0]);
    if (!writer) throw new Error(`No detail partition for ZIP ${record.zip_code}.`);
    if (!writer.gzip.write(detailCsvLine(record))) await once(writer.gzip, "drain");
    writer.rows += 1;
    rowCount += 1;
    const aggregate = naicsCoverage.get(record.naics_code) ?? {
      naics_code: record.naics_code,
      published_zip_rows: 0,
      published_establishments: 0,
    };
    aggregate.published_zip_rows += 1;
    aggregate.published_establishments += record.establishments ?? 0;
    naicsCoverage.set(record.naics_code, aggregate);
    if (rowCount % 250_000 === 0) logger(`Normalized ${rowCount.toLocaleString("en-US")} ZBP industry rows.`);
  }

  const finishPromises = [...writers.values()].map((writer) => finished(writer.output));
  for (const writer of writers.values()) writer.gzip.end();
  await Promise.all(finishPromises);

  const artifacts = [];
  for (const writer of writers.values()) {
    await rename(writer.temporary, writer.destination);
    artifacts.push({
      path: writer.relativePath,
      ...(await hashFile(writer.destination)),
      record_count: writer.rows,
      artifact_type: "normalized-zbp-naics-csv-gzip",
      partition: writer.prefix,
    });
  }
  const coverageRecords = [...naicsCoverage.values()].sort((a, b) => a.naics_code.localeCompare(b.naics_code));
  return { artifacts, rowCount, coverageRecords };
}

function releaseTimestamp(instant) {
  return instant.replaceAll(/[-:.]/g, "").replace("T", "-").replace("Z", "Z");
}

export async function buildCensusZbpBaseline({
  outputRoot,
  geographyPointer,
  year = null,
  fetchImpl = globalThis.fetch,
  logger = console.log,
  now = () => new Date(),
} = {}) {
  if (!outputRoot) throw new Error("outputRoot is required.");
  if (!geographyPointer) throw new Error("geographyPointer is required.");
  const retrievedAt = now().toISOString();
  const runId = randomUUID();
  const stagingDirectory = path.join(outputRoot, ".staging", runId);
  await mkdir(stagingDirectory, { recursive: true });

  const geography = await loadZctaDependency(geographyPointer);
  const discovered = await discoverLatestZbp({ fetchImpl, year });
  const releaseId = `census-zbp-${discovered.referenceYear}-${releaseTimestamp(retrievedAt)}-${runId.slice(0, 8)}`;
  const artifacts = [];
  const totalsRelativePath = `source/zbp${String(discovered.referenceYear).slice(-2)}totals.zip`;
  const detailRelativePath = `source/zbp${String(discovered.referenceYear).slice(-2)}detail.zip`;
  const totalsPath = path.join(stagingDirectory, totalsRelativePath);
  const detailPath = path.join(stagingDirectory, detailRelativePath);

  logger(`Downloading Census ZBP ${discovered.referenceYear} totals.`);
  const totalsDownload = await downloadFile(discovered.totalsUrl, totalsPath, { fetchImpl });
  artifacts.push({
    path: totalsRelativePath,
    ...totalsDownload,
    artifact_type: "source-archive",
    source_url: discovered.totalsUrl,
  });
  logger(`Downloading Census ZBP ${discovered.referenceYear} industry detail.`);
  const detailDownload = await downloadFile(discovered.detailUrl, detailPath, { fetchImpl });
  artifacts.push({
    path: detailRelativePath,
    ...detailDownload,
    artifact_type: "source-archive",
    source_url: discovered.detailUrl,
  });

  const totals = await loadTotals(totalsPath, discovered.referenceYear);
  const coverage = buildZipCoverage(totals, geography.records, discovered.referenceYear, {
    zbp: {
      source_id: `census-zbp-${discovered.referenceYear}`,
      source_release_id: `census-zbp-${discovered.referenceYear}`,
      source_record_id: "set-per-record",
      ingest_run_id: runId,
      transformation_version: "us-census-zbp@1.0.0",
      policy_id: "us-census-zbp",
    },
    geography: {
      source_id: "us-census-zcta-2020",
      source_release_id: geography.releaseId,
      source_record_id: "set-per-record",
      ingest_run_id: geography.runId,
      transformation_version: geography.transformationVersion,
      policy_id: "us-census-geography",
    },
  });
  artifacts.push(await writeArtifact(
    stagingDirectory,
    "derived/zip-coverage.jsonl",
    jsonLines(coverage.records),
    { record_count: coverage.records.length, artifact_type: "zip-coverage-union-jsonl" },
  ));

  const detail = await processDetail(
    detailPath,
    discovered.referenceYear,
    stagingDirectory,
    logger,
  );
  artifacts.push(...detail.artifacts);
  artifacts.push(await writeArtifact(
    stagingDirectory,
    "derived/naics-coverage.jsonl",
    jsonLines(detail.coverageRecords),
    { record_count: detail.coverageRecords.length, artifact_type: "naics-coverage-jsonl" },
  ));

  if (totals.length < 30_000) throw new Error("ZBP totals contains fewer than 30,000 ZIP rows.");
  if (detail.rowCount < 1_000_000) throw new Error("ZBP detail contains fewer than 1,000,000 industry rows.");
  if (coverage.counts.zcta_zip_codes !== geography.records.length) {
    throw new Error("ZCTA coverage count changed while building the ZBP release.");
  }

  const manifest = {
    schema_version: ZBP_DATASET_SCHEMA_VERSION,
    dataset_id: "census-zbp-baseline",
    connector: { id: "us-census-zbp", version: "1.0.0" },
    release_id: releaseId,
    run_id: runId,
    retrieved_at: retrievedAt,
    reference_year: discovered.referenceYear,
    status: "published",
    complete_national_release: true,
    current_usps_validity_denominator_status: "not-yet-authoritative",
    coverage: {
      ...coverage.counts,
      industry_detail_rows: detail.rowCount,
      published_naics_codes: detail.coverageRecords.length,
    },
    geography_dependency: {
      dataset_id: "us-census-geography",
      release_id: geography.releaseId,
      schema_version: geography.schemaVersion,
      manifest_sha256: geography.manifestSha256,
    },
    sources: [
      {
        source_id: `census-zbp-${discovered.referenceYear}`,
        publisher: "United States Census Bureau",
        reference_year: discovered.referenceYear,
        totals_url: discovered.totalsUrl,
        detail_url: discovered.detailUrl,
        discovery_url: ZBP_INDEX_URL,
        policy_profile: "config/source-policies/us-census-zbp.json",
      },
    ],
    limitations: [
      "ZBP is an annual aggregate employer-establishment baseline, not a record-level directory of named businesses.",
      "The reference-year universe covers establishments with paid employees that operated during at least part of the year; it is not a current operating-status assertion.",
      "Nonemployer businesses and most self-employed persons are outside the ZBP employer universe.",
      "Disclosure avoidance, suppression, and publication thresholds mean missing rows or fields must not be interpreted as zero.",
      "A ZBP ZIP observation does not prove that a ZIP is currently active in the USPS master list.",
      "A ZCTA is a Census statistical area, not an exact USPS ZIP delivery-route polygon.",
      "Authoritative current ZIP validity remains incomplete until a licensed USPS source or authorized HUD-USPS quarterly source is ingested; HUD itself omits PO Box-only ZIPs and a small number of ungeocoded ZIPs.",
    ],
    artifacts: artifacts.sort((a, b) => a.path.localeCompare(b.path)),
  };

  await writeArtifact(stagingDirectory, "manifest.json", json(manifest));
  const releasesDirectory = path.join(outputRoot, "releases");
  const releaseDirectory = path.join(releasesDirectory, releaseId);
  await mkdir(releasesDirectory, { recursive: true });
  await rename(stagingDirectory, releaseDirectory);

  const pointer = {
    dataset_id: manifest.dataset_id,
    release_id: releaseId,
    manifest: `releases/${releaseId}/manifest.json`,
    updated_at: retrievedAt,
  };
  const pointerPath = path.join(outputRoot, "current.json");
  const temporaryPointer = `${pointerPath}.tmp-${runId}`;
  await writeFile(temporaryPointer, json(pointer), "utf8");
  await rename(temporaryPointer, pointerPath);
  if (!(await stat(releaseDirectory)).isDirectory()) throw new Error("Published ZBP release is not a directory.");
  return { manifest, releaseDirectory, pointerPath };
}

export async function verifyCensusZbpRelease(manifestPath) {
  const absoluteManifestPath = path.resolve(manifestPath);
  const releaseDirectory = path.dirname(absoluteManifestPath);
  const manifest = JSON.parse(await readFile(absoluteManifestPath, "utf8"));
  if (manifest.dataset_id !== "census-zbp-baseline") throw new Error("Unexpected ZBP dataset manifest.");
  if (manifest.status !== "published") throw new Error(`Release status is ${manifest.status ?? "missing"}.`);
  const failures = [];
  for (const artifact of manifest.artifacts ?? []) {
    const artifactPath = path.resolve(releaseDirectory, artifact.path);
    const relative = path.relative(releaseDirectory, artifactPath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      failures.push({ path: artifact.path, reason: "path escapes release directory" });
      continue;
    }
    try {
      const digest = await hashFile(artifactPath);
      if (digest.bytes !== artifact.bytes) {
        failures.push({ path: artifact.path, reason: `expected ${artifact.bytes} bytes, found ${digest.bytes}` });
      } else if (digest.sha256 !== artifact.sha256) {
        failures.push({ path: artifact.path, reason: "SHA-256 mismatch" });
      }
    } catch (error) {
      failures.push({ path: artifact.path, reason: error.code === "ENOENT" ? "missing" : error.message });
    }
  }

  const zipCoverageArtifact = manifest.artifacts?.find((artifact) => artifact.path === "derived/zip-coverage.jsonl");
  if (!zipCoverageArtifact) {
    failures.push({ path: "derived/zip-coverage.jsonl", reason: "not declared in manifest" });
  } else {
    try {
      const lines = (await readFile(path.join(releaseDirectory, zipCoverageArtifact.path), "utf8"))
        .trim()
        .split(/\r?\n/)
        .filter(Boolean);
      const records = lines.map((line) => JSON.parse(line));
      const uniqueZipCodes = new Set(records.map((record) => record.zip_code));
      const statusCounts = Map.groupBy(records, (record) => record.coverage_status);
      if (records.length !== zipCoverageArtifact.record_count || records.length !== manifest.coverage.union_zip_codes) {
        failures.push({ path: zipCoverageArtifact.path, reason: "record count does not match artifact and coverage metadata" });
      }
      if (uniqueZipCodes.size !== records.length) {
        failures.push({ path: zipCoverageArtifact.path, reason: "duplicate ZIP coverage records" });
      }
      const expectedStatuses = {
        "zbp-and-zcta": manifest.coverage.zbp_and_zcta,
        "zbp-without-zcta": manifest.coverage.zbp_without_zcta,
        "zcta-without-published-zbp": manifest.coverage.zcta_without_published_zbp,
      };
      for (const [status, expected] of Object.entries(expectedStatuses)) {
        if ((statusCounts.get(status)?.length ?? 0) !== expected) {
          failures.push({ path: zipCoverageArtifact.path, reason: `${status} count does not match manifest` });
        }
      }
      if (records.some((record) => record.current_usps_validity?.status !== "unverified")) {
        failures.push({ path: zipCoverageArtifact.path, reason: "release asserts USPS validity without an authoritative denominator" });
      }
    } catch (error) {
      failures.push({ path: zipCoverageArtifact.path, reason: `structural validation failed: ${error.message}` });
    }
  }

  const naicsCoverageArtifact = manifest.artifacts?.find((artifact) => artifact.path === "derived/naics-coverage.jsonl");
  if (!naicsCoverageArtifact) {
    failures.push({ path: "derived/naics-coverage.jsonl", reason: "not declared in manifest" });
  } else {
    try {
      const rows = (await readFile(path.join(releaseDirectory, naicsCoverageArtifact.path), "utf8"))
        .trim()
        .split(/\r?\n/)
        .filter(Boolean).length;
      if (rows !== naicsCoverageArtifact.record_count || rows !== manifest.coverage.published_naics_codes) {
        failures.push({ path: naicsCoverageArtifact.path, reason: "NAICS coverage count does not match manifest" });
      }
    } catch (error) {
      failures.push({ path: naicsCoverageArtifact.path, reason: `structural validation failed: ${error.message}` });
    }
  }

  let detailRows = 0;
  const detailArtifacts = (manifest.artifacts ?? []).filter(
    (artifact) => artifact.artifact_type === "normalized-zbp-naics-csv-gzip",
  );
  if (detailArtifacts.length !== 10) {
    failures.push({ path: "derived/zip-naics", reason: `expected 10 partitions, found ${detailArtifacts.length}` });
  }
  for (const artifact of detailArtifacts) {
    try {
      const lineReader = createInterface({
        input: createReadStream(path.join(releaseDirectory, artifact.path)).pipe(createGunzip()),
        crlfDelay: Infinity,
      });
      let lineCount = 0;
      for await (const line of lineReader) {
        if (lineCount === 0 && line !== DETAIL_OUTPUT_COLUMNS.join(",")) {
          throw new Error("unexpected normalized CSV header");
        }
        lineCount += 1;
      }
      const records = Math.max(0, lineCount - 1);
      detailRows += records;
      if (records !== artifact.record_count) {
        failures.push({ path: artifact.path, reason: `expected ${artifact.record_count} records, found ${records}` });
      }
    } catch (error) {
      failures.push({ path: artifact.path, reason: `gzip/record validation failed: ${error.message}` });
    }
  }
  if (detailRows !== manifest.coverage.industry_detail_rows) {
    failures.push({ path: "derived/zip-naics", reason: `detail partitions total ${detailRows}, expected ${manifest.coverage.industry_detail_rows}` });
  }

  if (failures.length > 0) {
    const error = new Error(`ZBP release verification failed for ${failures.length} artifact(s).`);
    error.failures = failures;
    throw error;
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
