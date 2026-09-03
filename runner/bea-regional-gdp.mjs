import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseCsv } from "csv-parse/sync";
import unzipper from "unzipper";

export const BEA_GDP_SCHEMA_VERSION = "1.0.0";
export const BEA_GDP_TRANSFORMATION_VERSION = "bea-regional-gdp@1.0.0";
export const BEA_CAGDP1_URL = "https://apps.bea.gov/regional/zip/CAGDP1.zip";
export const BEA_CAGDP1_FIXED_FIELDS = Object.freeze([
  "GeoFIPS",
  "GeoName",
  "Region",
  "TableName",
  "LineCode",
  "IndustryClassification",
  "Description",
  "Unit",
]);

const BEA_HOST = "apps.bea.gov";
const MAX_SOURCE_ARCHIVE_BYTES = 10_000_000;
const MAX_SELECTED_CSV_BYTES = 10_000_000;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 20_000_000;
const OFFICIAL_QUALITY_MINIMUMS = Object.freeze({ state_records: 51, county_records: 3_000 });
const LINE_CONTRACT = Object.freeze({
  "1": {
    description: "Real GDP (thousands of chained 2017 dollars)",
    unit: "Thousands of chained 2017 dollars",
    field: "real_gdp_chained_2017_dollars",
    multiplier: 1_000,
  },
  "2": {
    description: "Chain-type quantity indexes for real GDP",
    unit: "Quantity index",
    field: "quantity_index_2017_100",
    multiplier: 1,
  },
  "3": {
    description: "Current-dollar GDP (thousands of current dollars)",
    unit: "Thousands of dollars",
    field: "gdp_current_dollars",
    multiplier: 1_000,
  },
});
const UNITS = Object.freeze({
  gdp_current_dollars: "current dollars",
  real_gdp_chained_2017_dollars: "chained 2017 dollars",
  quantity_index_2017_100: "index, 2017=100",
});
const FORBIDDEN_OUTPUT_KEYS = new Set([
  "zip",
  "zip5",
  "zip_code",
  "zcta",
  "zcta5",
  "geometry",
  "geometry_file",
  "polygon",
]);

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

function json(value) {
  return `${JSON.stringify(value)}\n`;
}

function jsonLines(records) {
  return records.length ? `${records.map((record) => JSON.stringify(record)).join("\n")}\n` : "";
}

function resolveInside(baseDirectory, requestedPath, label) {
  if (typeof requestedPath !== "string" || !requestedPath) throw new Error(`${label} path is missing.`);
  const absolute = path.resolve(baseDirectory, requestedPath);
  const relative = path.relative(path.resolve(baseDirectory), absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`${label} path escapes its governed root.`);
  return absolute;
}

async function writeArtifact(releaseDirectory, relativePath, content, metadata = {}) {
  const destination = resolveInside(releaseDirectory, relativePath, "Artifact");
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

function archiveEntryIsUnsafe(entryPath) {
  return path.posix.isAbsolute(entryPath)
    || path.win32.isAbsolute(entryPath)
    || entryPath.split(/[\\/]/).includes("..");
}

export function parseBeaMeasure(rawValue, multiplier = 1) {
  const value = String(rawValue ?? "").trim();
  if (value === "") return { value: null, flag: "missing" };
  if (value === "(NA)" || value === "(NM)") return { value: null, flag: value };
  if (!/^-?\d+(?:\.\d+)?$/.test(value)) throw new Error(`Unexpected BEA measure ${JSON.stringify(value)}.`);
  const numeric = Number(value) * multiplier;
  if (!Number.isFinite(numeric) || !Number.isSafeInteger(numeric) && multiplier !== 1) {
    throw new Error(`BEA measure ${JSON.stringify(value)} cannot be represented safely.`);
  }
  if (numeric < 0) throw new Error(`Unexpected negative BEA GDP measure ${JSON.stringify(value)}.`);
  return { value: numeric, flag: null };
}

function assertContinuousYears(yearFields, expectedStartYear = null, expectedEndYear = null) {
  if (yearFields.length === 0 || yearFields.some((value) => !/^\d{4}$/.test(value))) {
    throw new Error("BEA CAGDP1 schema drift: year columns are missing or malformed.");
  }
  const years = yearFields.map(Number);
  for (let index = 1; index < years.length; index += 1) {
    if (years[index] !== years[index - 1] + 1) throw new Error("BEA CAGDP1 schema drift: year columns are not continuous.");
  }
  if (expectedStartYear !== null && years[0] !== expectedStartYear) throw new Error("BEA CAGDP1 archive filename/header start year mismatch.");
  if (expectedEndYear !== null && years.at(-1) !== expectedEndYear) throw new Error("BEA CAGDP1 archive filename/header end year mismatch.");
  return years;
}

function assertFooter(rows) {
  const values = rows.map((row) => row.length === 1 ? String(row[0]).trim() : null);
  if (values.length !== 4
      || values[0] !== "Note: See the included footnote file."
      || values[1] !== "CAGDP1: County gross domestic product (GDP) summary"
      || !/^Last updated: .+\.$/.test(values[2] ?? "")
      || values[3] !== "U.S. Bureau of Economic Analysis") {
    throw new Error("BEA CAGDP1 schema drift: expected source footer was not found.");
  }
  return values;
}

export function parseBeaCagdp1Csv(text, { expectedStartYear = null, expectedEndYear = null } = {}) {
  const rows = parseCsv(text, { bom: true, trim: true, relax_column_count: true, skip_empty_lines: true });
  if (rows.length < 8) throw new Error("BEA CAGDP1 CSV is unexpectedly short.");
  const headers = rows[0];
  if (JSON.stringify(headers.slice(0, BEA_CAGDP1_FIXED_FIELDS.length)) !== JSON.stringify(BEA_CAGDP1_FIXED_FIELDS)) {
    throw new Error("BEA CAGDP1 schema drift: fixed fields do not match the pinned contract.");
  }
  const years = assertContinuousYears(headers.slice(BEA_CAGDP1_FIXED_FIELDS.length), expectedStartYear, expectedEndYear);
  const referenceYear = years.at(-1);
  const referenceColumn = headers.length - 1;
  const dataRows = [];
  const footerRows = [];
  let inFooter = false;
  for (const row of rows.slice(1)) {
    if (row.length !== headers.length) inFooter = true;
    if (inFooter) {
      if (row.length === headers.length) throw new Error("BEA CAGDP1 schema drift: data row appears after the source footer.");
      footerRows.push(row);
      continue;
    }
    dataRows.push(row);
  }
  const footer = assertFooter(footerRows);
  const areas = new Map();
  for (const row of dataRows) {
    const [geoFips, geoName, region, tableName, lineCode, industryClassification, description, unit] = row;
    if (!/^\d{5}$/.test(geoFips)) throw new Error(`Invalid BEA GeoFIPS ${JSON.stringify(geoFips)}.`);
    if (tableName !== "CAGDP1" || industryClassification !== "...") throw new Error(`BEA CAGDP1 schema drift in ${geoFips}.`);
    const contract = LINE_CONTRACT[lineCode];
    if (!contract || description.trim() !== contract.description || unit.trim() !== contract.unit) {
      throw new Error(`BEA CAGDP1 line contract drift for ${geoFips} line ${lineCode}.`);
    }
    const normalizedName = geoName.trim();
    const normalizedRegion = region.trim() || null;
    const area = areas.get(geoFips) ?? { geo_fips: geoFips, geo_name: normalizedName, region: normalizedRegion, lines: {} };
    if (area.geo_name !== normalizedName || area.region !== normalizedRegion) throw new Error(`Inconsistent BEA area identity for ${geoFips}.`);
    if (area.lines[lineCode]) throw new Error(`Duplicate BEA CAGDP1 ${geoFips} line ${lineCode}.`);
    area.lines[lineCode] = parseBeaMeasure(row[referenceColumn], contract.multiplier);
    areas.set(geoFips, area);
  }
  for (const area of areas.values()) {
    if (JSON.stringify(Object.keys(area.lines).sort()) !== JSON.stringify(["1", "2", "3"])) {
      throw new Error(`BEA area ${area.geo_fips} does not contain exactly lines 1, 2, and 3.`);
    }
  }
  return {
    startYear: years[0],
    referenceYear,
    footer,
    areas: [...areas.values()].sort((left, right) => left.geo_fips.localeCompare(right.geo_fips)),
  };
}

async function parseBeaArchive(zipPath) {
  const directory = await unzipper.Open.file(zipPath);
  const files = directory.files.filter((entry) => entry.type === "File");
  if (files.length === 0 || files.some((entry) => archiveEntryIsUnsafe(entry.path))) {
    throw new Error("BEA CAGDP1 archive is empty or contains an unsafe path.");
  }
  const totalUncompressedBytes = files.reduce((sum, entry) => sum + (Number(entry.uncompressedSize) || 0), 0);
  if (totalUncompressedBytes > MAX_TOTAL_UNCOMPRESSED_BYTES) {
    throw new Error(`BEA CAGDP1 archive exceeds the ${MAX_TOTAL_UNCOMPRESSED_BYTES}-byte uncompressed limit.`);
  }
  const candidates = files.map((entry) => {
    const match = /^CAGDP1__ALL_AREAS_(\d{4})_(\d{4})\.csv$/.exec(entry.path);
    return match ? { entry, startYear: Number(match[1]), endYear: Number(match[2]) } : null;
  }).filter(Boolean);
  if (candidates.length !== 1) throw new Error(`Expected one BEA CAGDP1 all-areas CSV, found ${candidates.length}.`);
  const selected = candidates[0];
  if (!Number.isFinite(selected.entry.uncompressedSize) || selected.entry.uncompressedSize > MAX_SELECTED_CSV_BYTES) {
    throw new Error(`BEA CAGDP1 selected CSV exceeds the ${MAX_SELECTED_CSV_BYTES}-byte limit.`);
  }
  const text = (await selected.entry.buffer()).toString("utf8");
  return {
    selectedEntry: selected.entry.path,
    totalUncompressedBytes,
    ...parseBeaCagdp1Csv(text, { expectedStartYear: selected.startYear, expectedEndYear: selected.endYear }),
  };
}

async function loadJsonLinesArtifact(releaseDirectory, artifact, label) {
  if (!artifact) throw new Error(`The geography release has no ${label} index.`);
  const artifactPath = resolveInside(releaseDirectory, artifact.path, `Geography ${label}`);
  const buffer = await readFile(artifactPath);
  if (buffer.byteLength !== artifact.bytes || sha256(buffer) !== artifact.sha256) {
    throw new Error(`The geography ${label} index failed checksum verification.`);
  }
  const records = buffer.toString("utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  if (records.length !== artifact.record_count) throw new Error(`The geography ${label} index row count does not match its manifest.`);
  return records;
}

async function loadGeographyDependency(geographyPointer) {
  const pointerBuffer = await readFile(geographyPointer);
  const pointer = JSON.parse(pointerBuffer.toString("utf8"));
  if (pointer.dataset_id !== "us-census-geography") throw new Error("The geography pointer is not us-census-geography.");
  const geographyRoot = path.dirname(path.resolve(geographyPointer));
  const manifestPath = resolveInside(geographyRoot, pointer.manifest, "Geography manifest");
  const manifestBuffer = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBuffer.toString("utf8"));
  if (manifest.dataset_id !== "us-census-geography" || manifest.status !== "published" || manifest.complete_national_release !== true) {
    throw new Error("A complete published us-census-geography release is required before building BEA GDP.");
  }
  if (pointer.release_id !== manifest.release_id) throw new Error("The geography pointer and manifest release IDs do not match.");
  const releaseDirectory = path.dirname(manifestPath);
  const stateArtifact = manifest.artifacts?.find((artifact) => artifact.path === "derived/index/states.jsonl");
  const countyArtifact = manifest.artifacts?.find((artifact) => artifact.path === "derived/index/counties.jsonl");
  const allStates = await loadJsonLinesArtifact(releaseDirectory, stateArtifact, "state");
  const states = allStates.filter((record) => record.is_50_states_or_dc === true);
  const stateFips = new Set(states.map((record) => record.geoid));
  const counties = (await loadJsonLinesArtifact(releaseDirectory, countyArtifact, "county"))
    .filter((record) => stateFips.has(record.state_fips));
  if (new Set(states.map((record) => record.geoid)).size !== states.length) throw new Error("The geography state index contains duplicate FIPS codes.");
  if (new Set(counties.map((record) => record.geoid)).size !== counties.length) throw new Error("The geography county index contains duplicate GEOIDs.");
  return {
    states,
    counties,
    releaseId: manifest.release_id,
    schemaVersion: manifest.schema_version,
    manifestSha256: sha256(manifestBuffer),
    stateIndexSha256: stateArtifact.sha256,
    countyIndexSha256: countyArtifact.sha256,
  };
}

async function responseBufferWithLimit(response, maximumBytes) {
  if (!response.body) throw new Error("BEA archive response has no body.");
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      bytes += chunk.byteLength;
      if (bytes > maximumBytes) {
        await reader.cancel("source size limit exceeded");
        throw new Error(`BEA archive exceeded the ${maximumBytes}-byte limit.`);
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, bytes);
}

async function fetchArchive(fetchImpl, retries = 3) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const parsed = new URL(BEA_CAGDP1_URL);
      if (parsed.protocol !== "https:" || parsed.hostname !== BEA_HOST || parsed.pathname !== "/regional/zip/CAGDP1.zip") {
        throw new Error(`Disallowed BEA URL ${BEA_CAGDP1_URL}.`);
      }
      const response = await fetchImpl(BEA_CAGDP1_URL, {
        redirect: "error",
        signal: AbortSignal.timeout(300_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      if (response.redirected) throw new Error("BEA archive response was redirected.");
      const declaredBytes = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredBytes) && declaredBytes > MAX_SOURCE_ARCHIVE_BYTES) {
        throw new Error(`BEA archive declares ${declaredBytes} bytes, above the ${MAX_SOURCE_ARCHIVE_BYTES}-byte limit.`);
      }
      const buffer = await responseBufferWithLimit(response, MAX_SOURCE_ARCHIVE_BYTES);
      return {
        buffer,
        metadata: {
          acquisition_mode: "official-direct-download",
          content_type: response.headers.get("content-type"),
          content_length: declaredBytes || null,
          last_modified: response.headers.get("last-modified"),
          etag: response.headers.get("etag"),
        },
      };
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
      await new Promise((resolve) => setTimeout(resolve, 500 * (2 ** attempt)));
    }
  }
  throw lastError;
}

async function acquireArchive(sourcePath, fetchImpl) {
  if (sourcePath) {
    const buffer = await readFile(sourcePath);
    if (buffer.byteLength > MAX_SOURCE_ARCHIVE_BYTES) throw new Error(`BEA archive exceeded the ${MAX_SOURCE_ARCHIVE_BYTES}-byte limit.`);
    return {
      buffer,
      metadata: {
        acquisition_mode: "operator-supplied-local-copy",
        content_type: "application/zip",
        content_length: buffer.byteLength,
        last_modified: null,
        etag: null,
      },
    };
  }
  return fetchArchive(fetchImpl);
}

function measureFields(area) {
  return {
    gdp_current_dollars: area.lines["3"].value,
    gdp_current_dollars_flag: area.lines["3"].flag,
    real_gdp_chained_2017_dollars: area.lines["1"].value,
    real_gdp_chained_2017_dollars_flag: area.lines["1"].flag,
    quantity_index_2017_100: area.lines["2"].value,
    quantity_index_2017_100_flag: area.lines["2"].flag,
  };
}

export function normalizeBeaGdpRecord(area, geography, referenceYear, provenance) {
  const geographyType = geography.geo_type;
  if (geographyType !== "state" && geographyType !== "county") throw new Error(`Unsupported GDP geography type ${geographyType}.`);
  if (geographyType === "state" && area.geo_fips !== `${geography.geoid}000`) throw new Error("BEA state GeoFIPS does not exactly match the governed state FIPS.");
  if (geographyType === "county" && area.geo_fips !== geography.geoid) throw new Error("BEA county GeoFIPS does not exactly match the governed county GEOID.");
  return {
    schema_version: BEA_GDP_SCHEMA_VERSION,
    geography_type: geographyType,
    geoid: geography.geoid,
    geography_name: geography.name,
    state_fips: geography.state_fips,
    county_fips: geographyType === "county" ? geography.county_fips : null,
    source_geo_fips: area.geo_fips,
    source_geo_name: area.geo_name,
    geography_release_id: provenance.geography_release_id,
    reference_year: referenceYear,
    observation_period: { from: `${referenceYear}-01-01`, to: `${referenceYear}-12-31` },
    status: "published-annual-aggregate",
    ...measureFields(area),
    units: { ...UNITS },
    provenance: {
      source_id: `bea-cagdp1-${referenceYear}`,
      source_release_id: provenance.source_release_id,
      source_record_id: `${area.geo_fips}:CAGDP1:lines-1-3:${referenceYear}`,
      ingest_run_id: provenance.ingest_run_id,
      transformation_version: BEA_GDP_TRANSFORMATION_VERSION,
      policy_id: "bea-regional-gdp",
    },
  };
}

function sourceGapReason(geoFips) {
  if (geoFips === "00000") return "national-aggregate-not-published-as-a-state-or-county-record";
  if (/^9\d000$/.test(geoFips)) return "bea-region-aggregate-not-a-governed-state";
  if (geoFips === "15901" || /^519\d{2}$/.test(geoFips)) return "bea-combined-area-not-allocated-to-constituent-counties";
  return "source-area-has-no-direct-current-governed-geography-match";
}

function reconcileAreas(parsed, geography, provenance) {
  const stateBySourceFips = new Map(geography.states.map((record) => [`${record.geoid}000`, record]));
  const countyByGeoid = new Map(geography.counties.map((record) => [record.geoid, record]));
  const sourceAreaIds = new Set(parsed.areas.map((area) => area.geo_fips));
  const stateRecords = [];
  const countyRecords = [];
  const gaps = [];
  for (const area of parsed.areas) {
    const state = stateBySourceFips.get(area.geo_fips);
    if (state) {
      stateRecords.push(normalizeBeaGdpRecord(area, state, parsed.referenceYear, provenance));
      continue;
    }
    const county = countyByGeoid.get(area.geo_fips);
    if (county) {
      countyRecords.push(normalizeBeaGdpRecord(area, county, parsed.referenceYear, provenance));
      continue;
    }
    gaps.push({
      schema_version: BEA_GDP_SCHEMA_VERSION,
      gap_id: `source:${area.geo_fips}`,
      gap_type: "source-area-without-direct-governed-match",
      geography_type: "source-area",
      geoid: null,
      geography_name: null,
      source_geo_fips: area.geo_fips,
      source_geo_name: area.geo_name,
      reference_year: parsed.referenceYear,
      reason: sourceGapReason(area.geo_fips),
      allocation_status: "not-allocated",
      ...measureFields(area),
      provenance: {
        source_id: `bea-cagdp1-${parsed.referenceYear}`,
        source_release_id: provenance.source_release_id,
        source_record_id: `${area.geo_fips}:CAGDP1:lines-1-3:${parsed.referenceYear}`,
        ingest_run_id: provenance.ingest_run_id,
        transformation_version: BEA_GDP_TRANSFORMATION_VERSION,
        policy_id: "bea-regional-gdp",
      },
    });
  }
  for (const county of geography.counties) {
    if (sourceAreaIds.has(county.geoid)) continue;
    gaps.push({
      schema_version: BEA_GDP_SCHEMA_VERSION,
      gap_id: `governed-county:${county.geoid}`,
      gap_type: "governed-county-without-direct-bea-match",
      geography_type: "county",
      geoid: county.geoid,
      geography_name: county.name,
      source_geo_fips: null,
      source_geo_name: null,
      reference_year: parsed.referenceYear,
      reason: "governed-current-county-has-no-direct-bea-source-row",
      allocation_status: "not-allocated",
      gdp_current_dollars: null,
      gdp_current_dollars_flag: "missing",
      real_gdp_chained_2017_dollars: null,
      real_gdp_chained_2017_dollars_flag: "missing",
      quantity_index_2017_100: null,
      quantity_index_2017_100_flag: "missing",
      provenance: {
        source_id: "us-census-geography",
        source_release_id: geography.releaseId,
        source_record_id: county.geoid,
        ingest_run_id: provenance.ingest_run_id,
        transformation_version: BEA_GDP_TRANSFORMATION_VERSION,
        policy_id: "bea-regional-gdp",
      },
    });
  }
  stateRecords.sort((left, right) => left.geoid.localeCompare(right.geoid));
  countyRecords.sort((left, right) => left.geoid.localeCompare(right.geoid));
  gaps.sort((left, right) => left.gap_id.localeCompare(right.gap_id));
  return { stateRecords, countyRecords, gaps };
}

function releaseTimestamp(instant) {
  return instant.replaceAll(/[-:.]/g, "").replace("T", "-").replace("Z", "Z");
}

function assertQuality(reconciled, geography, qualityMinimums) {
  if (reconciled.stateRecords.length !== geography.states.length) {
    throw new Error(`BEA direct state matches ${reconciled.stateRecords.length} do not cover all ${geography.states.length} governed states.`);
  }
  if (reconciled.stateRecords.length < qualityMinimums.state_records) {
    throw new Error(`BEA direct state matches ${reconciled.stateRecords.length} are below the ${qualityMinimums.state_records} quality floor.`);
  }
  if (reconciled.countyRecords.length < qualityMinimums.county_records) {
    throw new Error(`BEA direct county matches ${reconciled.countyRecords.length} are below the ${qualityMinimums.county_records} quality floor.`);
  }
  if (reconciled.stateRecords.some((record) => record.gdp_current_dollars === null)) {
    throw new Error("A directly matched BEA state has no current-dollar GDP value.");
  }
}

export async function buildBeaRegionalGdp({
  outputRoot,
  geographyPointer,
  sourcePath = null,
  fetchImpl = globalThis.fetch,
  logger = console.log,
  now = () => new Date(),
  qualityMinimums = OFFICIAL_QUALITY_MINIMUMS,
} = {}) {
  if (!outputRoot) throw new Error("outputRoot is required.");
  if (!geographyPointer) throw new Error("geographyPointer is required.");
  const retrievedAt = now().toISOString();
  const runId = randomUUID();
  const stagingDirectory = path.join(outputRoot, ".staging", runId);
  await mkdir(stagingDirectory, { recursive: true });
  const geography = await loadGeographyDependency(geographyPointer);
  logger(sourcePath ? "Validating operator-supplied BEA CAGDP1 archive." : "Downloading the official BEA CAGDP1 archive.");
  const acquired = await acquireArchive(sourcePath, fetchImpl);
  const sourceArtifact = await writeArtifact(stagingDirectory, "source/CAGDP1.zip", acquired.buffer, {
    artifact_type: "source-archive",
    source_url: BEA_CAGDP1_URL,
    ...acquired.metadata,
  });
  const parsed = await parseBeaArchive(path.join(stagingDirectory, sourceArtifact.path));
  const sourceReleaseId = `bea-cagdp1-${parsed.referenceYear}-${sourceArtifact.sha256.slice(0, 12)}`;
  const releaseId = `bea-regional-gdp-${parsed.referenceYear}-${releaseTimestamp(retrievedAt)}-${runId.slice(0, 8)}`;
  const reconciled = reconcileAreas(parsed, geography, {
    source_release_id: sourceReleaseId,
    ingest_run_id: runId,
    geography_release_id: geography.releaseId,
  });
  assertQuality(reconciled, geography, qualityMinimums);
  const artifacts = [sourceArtifact];
  artifacts.push(await writeArtifact(stagingDirectory, "derived/state-gdp.jsonl", jsonLines(reconciled.stateRecords), {
    artifact_type: "bea-state-gdp-jsonl",
    record_count: reconciled.stateRecords.length,
  }));
  artifacts.push(await writeArtifact(stagingDirectory, "derived/county-gdp.jsonl", jsonLines(reconciled.countyRecords), {
    artifact_type: "bea-county-gdp-jsonl",
    record_count: reconciled.countyRecords.length,
  }));
  artifacts.push(await writeArtifact(stagingDirectory, "derived/coverage-gaps.jsonl", jsonLines(reconciled.gaps), {
    artifact_type: "bea-geography-coverage-gaps-jsonl",
    record_count: reconciled.gaps.length,
  }));
  const sourceAreaGaps = reconciled.gaps.filter((gap) => gap.gap_type === "source-area-without-direct-governed-match").length;
  const governedCountyGaps = reconciled.gaps.filter((gap) => gap.gap_type === "governed-county-without-direct-bea-match").length;
  const completeDirectCountyCoverage = governedCountyGaps === 0;
  const qualityProfile = qualityMinimums === OFFICIAL_QUALITY_MINIMUMS ? "official" : "fixture";
  const manifest = {
    schema_version: BEA_GDP_SCHEMA_VERSION,
    dataset_id: "bea-regional-gdp",
    connector: { id: "bea-regional-gdp", version: "1.0.0" },
    release_id: releaseId,
    run_id: runId,
    retrieved_at: retrievedAt,
    reference_year: parsed.referenceYear,
    status: "published",
    complete_source_release: true,
    complete_direct_state_coverage: true,
    complete_direct_county_coverage: completeDirectCountyCoverage,
    geography_scope: "50-states-and-district-of-columbia",
    coverage: {
      source_area_records: parsed.areas.length,
      governed_states_in_scope: geography.states.length,
      governed_counties_in_scope: geography.counties.length,
      direct_state_matches: reconciled.stateRecords.length,
      direct_county_matches: reconciled.countyRecords.length,
      governed_county_gaps: governedCountyGaps,
      source_area_gaps: sourceAreaGaps,
    },
    quality: {
      profile: qualityProfile,
      minimums: { ...qualityMinimums },
    },
    geography_dependency: {
      dataset_id: "us-census-geography",
      release_id: geography.releaseId,
      schema_version: geography.schemaVersion,
      manifest_sha256: geography.manifestSha256,
      state_index_sha256: geography.stateIndexSha256,
      county_index_sha256: geography.countyIndexSha256,
    },
    sources: [{
      source_id: `bea-cagdp1-${parsed.referenceYear}`,
      source_release_id: sourceReleaseId,
      publisher: "United States Bureau of Economic Analysis",
      table: "CAGDP1 County GDP Summary",
      reference_year: parsed.referenceYear,
      archive_url: BEA_CAGDP1_URL,
      selected_archive_entry: parsed.selectedEntry,
      archive_sha256: sourceArtifact.sha256,
      total_uncompressed_archive_bytes: parsed.totalUncompressedBytes,
      source_footer: parsed.footer,
      policy_profile: "config/source-policies/bea-regional-gdp.json",
      source_metadata: acquired.metadata,
    }],
    measure_semantics: {
      gdp_current_dollars: "BEA CAGDP1 line 3, converted from thousands of current dollars to current dollars",
      real_gdp_chained_2017_dollars: "BEA CAGDP1 line 1, converted from thousands of chained 2017 dollars to chained 2017 dollars",
      quantity_index_2017_100: "BEA CAGDP1 line 2 chain-type quantity index, 2017=100",
      geography: "Exact state FIPS and current governed county GEOID matches only; no allocation or geometry is published",
    },
    limitations: [
      "GDP is an annual economic aggregate and is not a business count, named-business directory, or data-collection completeness measure.",
      "The county output includes only exact matches to the pinned current Census county-equivalent index.",
      "BEA combined areas, historical county definitions, regions, and the national total remain explicit source-area gaps and are never copied to constituent polygons.",
      "Current governed counties without a direct BEA row remain explicit coverage gaps.",
      "BEA publishes no official CAGDP1 ZIP-level GDP; no state, county, combined-area, regional, or national value is allocated to ZIP or ZCTA.",
      "BEA (NA), (NM), and missing measures are preserved as null values with source flags and never converted to zero.",
    ],
    artifacts: artifacts.sort((left, right) => left.path.localeCompare(right.path)),
  };
  await writeArtifact(stagingDirectory, "manifest.json", json(manifest));
  const releaseDirectory = path.join(outputRoot, "releases", releaseId);
  await mkdir(path.dirname(releaseDirectory), { recursive: true });
  await rename(stagingDirectory, releaseDirectory);
  const pointerPath = path.join(outputRoot, "current.json");
  const temporaryPointer = `${pointerPath}.tmp-${runId}`;
  await writeFile(temporaryPointer, json({
    dataset_id: manifest.dataset_id,
    release_id: releaseId,
    manifest: `releases/${releaseId}/manifest.json`,
    updated_at: retrievedAt,
  }));
  await rename(temporaryPointer, pointerPath);
  if (!(await stat(releaseDirectory)).isDirectory()) throw new Error("Published BEA GDP release is not a directory.");
  return { manifest, releaseDirectory, pointerPath };
}

function forbiddenKey(record) {
  if (!record || typeof record !== "object") return null;
  for (const [key, value] of Object.entries(record)) {
    if (FORBIDDEN_OUTPUT_KEYS.has(key)) return key;
    const nested = forbiddenKey(value);
    if (nested) return nested;
  }
  return null;
}

function readJsonLines(text) {
  return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function assertNormalizedRecord(record, geographyType, manifest, sourceAreas) {
  if (record.schema_version !== BEA_GDP_SCHEMA_VERSION || record.geography_type !== geographyType) {
    throw new Error(`Incompatible ${geographyType} GDP record ${record.geoid ?? "missing"}.`);
  }
  if (geographyType === "state") {
    if (!/^\d{2}$/.test(record.geoid) || record.source_geo_fips !== `${record.geoid}000` || record.county_fips !== null) {
      throw new Error(`Invalid state GDP identity ${record.geoid ?? "missing"}.`);
    }
  } else if (!/^\d{5}$/.test(record.geoid) || record.source_geo_fips !== record.geoid || record.state_fips !== record.geoid.slice(0, 2)) {
    throw new Error(`Invalid county GDP identity ${record.geoid ?? "missing"}.`);
  }
  if (record.reference_year !== manifest.reference_year || record.geography_release_id !== manifest.geography_dependency.release_id) {
    throw new Error(`${record.geoid} has incompatible year or geography provenance.`);
  }
  if (record.provenance?.source_release_id !== manifest.sources[0].source_release_id
      || record.provenance?.ingest_run_id !== manifest.run_id
      || record.provenance?.transformation_version !== BEA_GDP_TRANSFORMATION_VERSION
      || record.provenance?.policy_id !== "bea-regional-gdp") {
    throw new Error(`${record.geoid} is missing BEA source provenance.`);
  }
  if (JSON.stringify(record.units) !== JSON.stringify(UNITS)) throw new Error(`${record.geoid} has incompatible units.`);
  const source = sourceAreas.get(record.source_geo_fips);
  if (!source) throw new Error(`${record.geoid} has no source-area row.`);
  const expected = measureFields(source);
  for (const [key, value] of Object.entries(expected)) {
    if (!Object.is(record[key], value)) throw new Error(`${record.geoid} ${key} does not match the source archive.`);
  }
  const forbidden = forbiddenKey(record);
  if (forbidden) throw new Error(`${record.geoid} contains forbidden ${forbidden} output.`);
}

export async function verifyBeaRegionalGdpRelease(manifestPath) {
  const absoluteManifestPath = path.resolve(manifestPath);
  const releaseDirectory = path.dirname(absoluteManifestPath);
  const manifest = JSON.parse(await readFile(absoluteManifestPath, "utf8"));
  if (manifest.dataset_id !== "bea-regional-gdp" || manifest.status !== "published" || manifest.complete_source_release !== true) {
    throw new Error("Unexpected or incomplete BEA regional GDP manifest.");
  }
  if (manifest.geography_dependency?.dataset_id !== "us-census-geography" || !manifest.geography_dependency.release_id) {
    throw new Error("BEA regional GDP manifest has no pinned geography dependency.");
  }
  if (manifest.sources?.length !== 1
      || manifest.sources[0].archive_url !== BEA_CAGDP1_URL
      || manifest.sources[0].policy_profile !== "config/source-policies/bea-regional-gdp.json") {
    throw new Error("BEA regional GDP source contract is missing or incompatible.");
  }
  const failures = [];
  const artifactsByPath = new Map();
  for (const artifact of manifest.artifacts ?? []) {
    if (artifactsByPath.has(artifact.path)) {
      failures.push({ path: artifact.path, reason: "duplicate artifact declaration" });
      continue;
    }
    artifactsByPath.set(artifact.path, artifact);
    let artifactPath;
    try {
      artifactPath = resolveInside(releaseDirectory, artifact.path, "Release artifact");
      const digest = await hashFile(artifactPath);
      if (digest.bytes !== artifact.bytes) failures.push({ path: artifact.path, reason: `expected ${artifact.bytes} bytes, found ${digest.bytes}` });
      else if (digest.sha256 !== artifact.sha256) failures.push({ path: artifact.path, reason: "SHA-256 mismatch" });
    } catch (error) {
      failures.push({ path: artifact.path, reason: error.code === "ENOENT" ? "missing" : error.message });
    }
  }
  const requiredPaths = ["source/CAGDP1.zip", "derived/state-gdp.jsonl", "derived/county-gdp.jsonl", "derived/coverage-gaps.jsonl"];
  for (const requiredPath of requiredPaths) {
    if (!artifactsByPath.has(requiredPath)) failures.push({ path: requiredPath, reason: "not declared in manifest" });
  }
  if (failures.length) {
    const error = new Error(`BEA regional GDP release verification failed for ${failures.length} artifact(s).`);
    error.failures = failures;
    throw error;
  }

  const parsed = await parseBeaArchive(path.join(releaseDirectory, "source", "CAGDP1.zip"));
  const sourceArtifact = artifactsByPath.get("source/CAGDP1.zip");
  const expectedSourceRelease = `bea-cagdp1-${parsed.referenceYear}-${sourceArtifact.sha256.slice(0, 12)}`;
  if (parsed.referenceYear !== manifest.reference_year
      || parsed.areas.length !== manifest.coverage.source_area_records
      || manifest.sources[0].archive_sha256 !== sourceArtifact.sha256
      || manifest.sources[0].source_release_id !== expectedSourceRelease) {
    throw new Error("BEA source archive metadata does not reconcile to the manifest.");
  }
  const sourceAreas = new Map(parsed.areas.map((area) => [area.geo_fips, area]));
  const stateArtifact = artifactsByPath.get("derived/state-gdp.jsonl");
  const countyArtifact = artifactsByPath.get("derived/county-gdp.jsonl");
  const gapArtifact = artifactsByPath.get("derived/coverage-gaps.jsonl");
  const states = readJsonLines(await readFile(path.join(releaseDirectory, stateArtifact.path), "utf8"));
  const counties = readJsonLines(await readFile(path.join(releaseDirectory, countyArtifact.path), "utf8"));
  const gaps = readJsonLines(await readFile(path.join(releaseDirectory, gapArtifact.path), "utf8"));
  if (states.length !== stateArtifact.record_count || states.length !== manifest.coverage.direct_state_matches) throw new Error("BEA state record count does not reconcile.");
  if (counties.length !== countyArtifact.record_count || counties.length !== manifest.coverage.direct_county_matches) throw new Error("BEA county record count does not reconcile.");
  if (gaps.length !== gapArtifact.record_count) throw new Error("BEA coverage-gap record count does not reconcile.");
  if (new Set(states.map((record) => record.geoid)).size !== states.length) throw new Error("BEA state records contain duplicate FIPS codes.");
  if (new Set(counties.map((record) => record.geoid)).size !== counties.length) throw new Error("BEA county records contain duplicate GEOIDs.");
  if (new Set(gaps.map((record) => record.gap_id)).size !== gaps.length) throw new Error("BEA coverage gaps contain duplicate IDs.");
  for (const record of states) assertNormalizedRecord(record, "state", manifest, sourceAreas);
  for (const record of counties) assertNormalizedRecord(record, "county", manifest, sourceAreas);
  const sourceGaps = gaps.filter((gap) => gap.gap_type === "source-area-without-direct-governed-match");
  const governedGaps = gaps.filter((gap) => gap.gap_type === "governed-county-without-direct-bea-match");
  if (sourceGaps.length !== manifest.coverage.source_area_gaps || governedGaps.length !== manifest.coverage.governed_county_gaps) {
    throw new Error("BEA gap types do not reconcile to the manifest.");
  }
  if (states.length + counties.length + sourceGaps.length !== manifest.coverage.source_area_records) {
    throw new Error("BEA source areas do not reconcile to direct matches and source gaps.");
  }
  if (counties.length + governedGaps.length !== manifest.coverage.governed_counties_in_scope) {
    throw new Error("BEA governed counties do not reconcile to direct matches and gaps.");
  }
  if (states.length !== manifest.coverage.governed_states_in_scope || manifest.complete_direct_state_coverage !== true) {
    throw new Error("BEA state coverage is not complete for the governed scope.");
  }
  const expectedCountyComplete = governedGaps.length === 0;
  if (manifest.complete_direct_county_coverage !== expectedCountyComplete) throw new Error("BEA county completeness flag is inconsistent.");
  const minimums = manifest.quality?.minimums ?? {};
  if (states.length < minimums.state_records || counties.length < minimums.county_records) throw new Error("BEA records are below the manifest quality minimums.");
  for (const gap of gaps) {
    if (gap.allocation_status !== "not-allocated" || forbiddenKey(gap)) throw new Error(`${gap.gap_id} violates the no-allocation output contract.`);
    if (gap.gap_type === "source-area-without-direct-governed-match" && !sourceAreas.has(gap.source_geo_fips)) {
      throw new Error(`${gap.gap_id} has no corresponding BEA source area.`);
    }
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
