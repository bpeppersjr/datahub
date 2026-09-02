import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { copyFile, mkdir, open, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { finished, pipeline } from "node:stream/promises";
import { createInterface } from "node:readline";
import { createGunzip, createGzip } from "node:zlib";
import { parse } from "csv-parse";
import unzipper from "unzipper";
import { assertNormalizedUsPostalFieldsDeep } from "./normalized-us-postal-code.mjs";

export const EPA_ECHO_SCHEMA_VERSION = "1.0.0";
export const EPA_ECHO_TRANSFORMATION_VERSION = "epa-echo@1.0.1";
export const EPA_ECHO_DOWNLOADS_URL = "https://echo.epa.gov/tools/data-downloads";
export const EPA_ECHO_EXPORTER_URL = "https://echo.epa.gov/files/echodownloads/echo_exporter.zip";
export const EPA_ECHO_COLUMNS_URL = "https://echo.epa.gov/system/files/echo_exporter_columns_7-16-2025_0.xlsx";

export const EPA_ECHO_HEADERS = [
  "REGISTRY_ID", "FAC_NAME", "FAC_STREET", "FAC_CITY", "FAC_STATE", "FAC_ZIP", "FAC_COUNTY", "FAC_FIPS_CODE", "FAC_EPA_REGION",
  "FAC_INDIAN_CNTRY_FLG", "FAC_FEDERAL_FLG", "FAC_US_MEX_BORDER_FLG", "FAC_CHESAPEAKE_BAY_FLG", "FAC_NAA_FLAG", "FAC_LAT", "FAC_LONG",
  "FAC_MAP_ICON", "FAC_COLLECTION_METHOD", "FAC_REFERENCE_POINT", "FAC_ACCURACY_METERS", "FAC_DERIVED_TRIBES", "FAC_DERIVED_HUC", "FAC_DERIVED_WBD",
  "FAC_DERIVED_STCTY_FIPS", "FAC_DERIVED_ZIP", "FAC_DERIVED_CD113", "FAC_DERIVED_CB2010", "FAC_PERCENT_MINORITY", "FAC_POP_DEN", "FAC_MAJOR_FLAG",
  "FAC_ACTIVE_FLAG", "FAC_MYRTK_UNIVERSE", "FAC_INSPECTION_COUNT", "FAC_DATE_LAST_INSPECTION", "FAC_DAYS_LAST_INSPECTION", "FAC_INFORMAL_COUNT",
  "FAC_DATE_LAST_INFORMAL_ACTION", "FAC_FORMAL_ACTION_COUNT", "FAC_DATE_LAST_FORMAL_ACTION", "FAC_TOTAL_PENALTIES", "FAC_PENALTY_COUNT",
  "FAC_DATE_LAST_PENALTY", "FAC_LAST_PENALTY_AMT", "FAC_QTRS_WITH_NC", "FAC_PROGRAMS_WITH_SNC", "FAC_COMPLIANCE_STATUS", "FAC_SNC_FLG",
  "FAC_3YR_COMPLIANCE_HISTORY", "AIR_FLAG", "NPDES_FLAG", "SDWIS_FLAG", "RCRA_FLAG", "TRI_FLAG", "GHG_FLAG", "AIR_IDS", "CAA_PERMIT_TYPES", "CAA_NAICS",
  "CAA_SICS", "CAA_EVALUATION_COUNT", "CAA_DAYS_LAST_EVALUATION", "CAA_INFORMAL_COUNT", "CAA_FORMAL_ACTION_COUNT", "CAA_DATE_LAST_FORMAL_ACTION",
  "CAA_PENALTIES", "CAA_LAST_PENALTY_DATE", "CAA_LAST_PENALTY_AMT", "CAA_QTRS_WITH_NC", "CAA_COMPLIANCE_STATUS", "CAA_HPV_FLAG",
  "CAA_3YR_COMPL_QTRS_HISTORY", "NPDES_IDS", "CWA_PERMIT_TYPES", "CWA_COMPLIANCE_TRACKING", "CWA_NAICS", "CWA_SICS", "CWA_INSPECTION_COUNT",
  "CWA_DAYS_LAST_INSPECTION", "CWA_INFORMAL_COUNT", "CWA_FORMAL_ACTION_COUNT", "CWA_DATE_LAST_FORMAL_ACTION", "CWA_PENALTIES", "CWA_LAST_PENALTY_DATE",
  "CWA_LAST_PENALTY_AMT", "CWA_QTRS_WITH_NC", "CWA_COMPLIANCE_STATUS", "CWA_SNC_FLAG", "CWA_13QTRS_COMPL_HISTORY", "CWA_13QTRS_EFFLNT_EXCEEDANCES",
  "CWA_3_YR_QNCR_CODES", "RCRA_IDS", "RCRA_PERMIT_TYPES", "RCRA_NAICS", "RCRA_INSPECTION_COUNT", "RCRA_DAYS_LAST_EVALUATION", "RCRA_INFORMAL_COUNT",
  "RCRA_FORMAL_ACTION_COUNT", "RCRA_DATE_LAST_FORMAL_ACTION", "RCRA_PENALTIES", "RCRA_LAST_PENALTY_DATE", "RCRA_LAST_PENALTY_AMT", "RCRA_QTRS_WITH_NC",
  "RCRA_COMPLIANCE_STATUS", "RCRA_SNC_FLAG", "RCRA_3YR_COMPL_QTRS_HISTORY", "SDWA_IDS", "SDWA_SYSTEM_TYPES", "SDWA_INFORMAL_COUNT",
  "SDWA_FORMAL_ACTION_COUNT", "SDWA_COMPLIANCE_STATUS", "SDWA_SNC_FLAG", "TRI_IDS", "TRI_RELEASES_TRANSFERS", "TRI_ON_SITE_RELEASES",
  "TRI_OFF_SITE_TRANSFERS", "TRI_REPORTER_IN_PAST", "FEC_CASE_IDS", "FEC_NUMBER_OF_CASES", "FEC_LAST_CASE_DATE", "FEC_TOTAL_PENALTIES", "GHG_IDS",
  "GHG_CO2_RELEASES", "DFR_URL", "FAC_SIC_CODES", "FAC_NAICS_CODES", "FAC_DATE_LAST_INSPECTION_EPA", "FAC_DATE_LAST_INSPECTION_STATE",
  "FAC_DATE_LAST_FORMAL_ACT_EPA", "FAC_DATE_LAST_FORMAL_ACT_ST", "FAC_DATE_LAST_INFORMAL_ACT_EPA", "FAC_DATE_LAST_INFORMAL_ACT_ST", "FAC_FEDERAL_AGENCY",
  "TRI_REPORTER", "FAC_IMP_WATER_FLG",
];

export const EPA_ECHO_SCHEMA_FINGERPRINT = "c28194daf6cda8a9181e53dbf54cbe22b8a6544ec82b478a1b6129ddff1da492";

const US_STATE_AND_TERRITORY_CODES = new Set([
  "AL", "AK", "AS", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "GU", "HI", "ID", "IL", "IN", "IA", "KS", "KY",
  "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "MP", "OH", "OK",
  "OR", "PA", "PR", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "VI", "WA", "WV", "WI", "WY",
]);

const PROGRAM_FIELDS = [
  ["air", "AIR_FLAG", "AIR_IDS"],
  ["npdes", "NPDES_FLAG", "NPDES_IDS"],
  ["safe_drinking_water", "SDWIS_FLAG", "SDWA_IDS"],
  ["rcra", "RCRA_FLAG", "RCRA_IDS"],
  ["toxics_release_inventory", "TRI_FLAG", "TRI_IDS"],
  ["greenhouse_gas_reporting", "GHG_FLAG", "GHG_IDS"],
];

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

function postalCode(value) {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d{5})(?:-(\d{4}))?$/);
  if (!match || match[1] === "00000") return null;
  return { zip_code: match[1], postal_code: match[1], zip4: match[2] ?? null };
}

function fipsCode(value) {
  const raw = String(value ?? "").trim();
  return /^\d{5}$/.test(raw) ? raw : null;
}

function yesNo(value) {
  const raw = text(value)?.toUpperCase();
  if (raw === "Y") return true;
  if (raw === "N") return false;
  return null;
}

function identifierList(value) {
  return [...new Set(String(value ?? "").split(/\s+/).map((item) => item.trim()).filter(Boolean))].sort();
}

function codeList(value, minimumLength, maximumLength) {
  const matches = String(value ?? "").match(/\d+/g) ?? [];
  return [...new Set(matches.filter((item) => item.length >= minimumLength && item.length <= maximumLength))].sort();
}

function reportedLocation(source) {
  const latitudeText = text(source.FAC_LAT);
  const longitudeText = text(source.FAC_LONG);
  if (!latitudeText && !longitudeText) return null;
  const latitude = Number(latitudeText);
  const longitude = Number(longitudeText);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error("invalid-reported-coordinate");
  }
  const accuracy = text(source.FAC_ACCURACY_METERS) ? Number(source.FAC_ACCURACY_METERS) : null;
  if (accuracy !== null && (!Number.isFinite(accuracy) || accuracy < 0)) throw new Error("invalid-coordinate-accuracy");
  return {
    geometry: { type: "Point", coordinates: [longitude, latitude] },
    datum: "NAD83",
    collection_method: text(source.FAC_COLLECTION_METHOD),
    reference_point: text(source.FAC_REFERENCE_POINT),
    accuracy_meters: accuracy,
    precision_warning: /centroid/i.test(text(source.FAC_COLLECTION_METHOD) ?? "") ? "source-coordinate-is-a-centroid-not-a-premise-level-location" : null,
  };
}

function geography(zipCode, source, baselineByZip) {
  const baseline = baselineByZip?.get(zipCode);
  return {
    zip_code: zipCode,
    reported_county_name: text(source.FAC_COUNTY),
    reported_county_fips: fipsCode(source.FAC_FIPS_CODE),
    coordinate_derived_county_fips: fipsCode(source.FAC_DERIVED_STCTY_FIPS),
    coordinate_derived_zip: /^\d{5}$/.test(text(source.FAC_DERIVED_ZIP) ?? "") ? text(source.FAC_DERIVED_ZIP) : null,
    zcta_match_status: baseline?.geography?.status ?? "no-2020-zcta-polygon",
    zcta_geo_id: baseline?.geography?.geo_id ?? null,
    zcta_geoid: baseline?.geography?.geoid ?? null,
    zcta_geometry_file: baseline?.geography?.geometry_file ?? null,
  };
}

function provenance(context, sourceRecordId) {
  return {
    source_id: "epa-echo-exporter-active-facility",
    source_release_id: context.sourceReleaseId,
    source_record_id: sourceRecordId,
    ingest_run_id: context.runId,
    transformation_version: EPA_ECHO_TRANSFORMATION_VERSION,
    policy_id: "epa-echo",
  };
}

export function normalizeEchoFacility(source, context) {
  if (text(source.FAC_ACTIVE_FLAG)?.toUpperCase() !== "Y") throw new Error("facility-not-echo-active");
  const registryId = text(source.REGISTRY_ID);
  const name = text(source.FAC_NAME);
  if (!registryId || !/^\d+$/.test(registryId) || !name) throw new Error("missing-facility-identity");
  const state = text(source.FAC_STATE)?.toUpperCase() ?? null;
  if (!US_STATE_AND_TERRITORY_CODES.has(state)) throw new Error("invalid-us-state-or-territory");
  const postal = postalCode(source.FAC_ZIP);
  const street = text(source.FAC_STREET);
  const city = text(source.FAC_CITY);
  if (!postal || !street || !city) throw new Error("missing-physical-address");
  const sourceRecordId = `facility:${registryId}`;
  const programs = {};
  const externalIdentifiers = [{ type: "frs_registry_id", value: registryId, source_field: "REGISTRY_ID" }];
  for (const [nameKey, flagField, idField] of PROGRAM_FIELDS) {
    const identifiers = identifierList(source[idField]);
    programs[nameKey] = { associated: yesNo(source[flagField]), identifiers };
    for (const value of identifiers) externalIdentifiers.push({ type: `epa_${nameKey}_program_id`, value, source_field: idField });
  }
  const naicsCodes = [...new Set([
    ...codeList(source.FAC_NAICS_CODES, 2, 6),
    ...codeList(source.CAA_NAICS, 2, 6),
    ...codeList(source.CWA_NAICS, 2, 6),
    ...codeList(source.RCRA_NAICS, 2, 6),
  ])].sort();
  const sicCodes = [...new Set([
    ...codeList(source.FAC_SIC_CODES, 2, 4),
    ...codeList(source.CAA_SICS, 2, 4),
    ...codeList(source.CWA_SICS, 2, 4),
  ])].sort();
  return {
    schema_version: EPA_ECHO_SCHEMA_VERSION,
    normalized_record_id: `epa-echo:${sourceRecordId}`,
    entity_candidates: {
      physical_site_id: `site:epa_frs_${registryId}`,
      establishment_id: `establishment:epa_frs_${registryId}`,
      identity_status: "provisional",
    },
    external_identifiers: externalIdentifiers,
    name,
    address: {
      street,
      unit_or_additional: null,
      city,
      state,
      zip_code: postal.zip_code,
      postal_code: postal.postal_code,
      zip4: postal.zip4,
      county_name: text(source.FAC_COUNTY),
      county_fips: fipsCode(source.FAC_FIPS_CODE),
      country: "US",
    },
    reported_location: reportedLocation(source),
    geography: geography(postal.zip_code, source, context.baselineByZip),
    source_classifications: { naics_codes: naicsCodes, sic_codes: sicCodes },
    program_associations: programs,
    facility_context: {
      epa_region: text(source.FAC_EPA_REGION),
      major_facility: yesNo(source.FAC_MAJOR_FLAG),
      federal_facility: yesNo(source.FAC_FEDERAL_FLG),
      federal_agency: text(source.FAC_FEDERAL_AGENCY),
      reported_in_indian_country: yesNo(source.FAC_INDIAN_CNTRY_FLG),
    },
    detailed_facility_report_url: text(source.DFR_URL),
    source_status: {
      value: "epa-echo-active-program-facility-as-of-source-release",
      scope: "FAC_ACTIVE_FLAG=Y means at least one associated ICIS-Air, ICIS-NPDES, RCRAInfo, or SDWIS permit/facility is active in ECHO; it is not proof of general business operation, public access, ownership, or active status in every associated program",
      source_updated_at: context.sourceUpdatedAt,
    },
    observed_at: context.retrievedAt,
    provenance: provenance(context, sourceRecordId),
    export_policy: "public",
  };
}

function assertAllowedUrl(urlValue) {
  const url = new URL(urlValue);
  if (url.protocol !== "https:" || url.hostname !== "echo.epa.gov" || url.pathname !== "/files/echodownloads/echo_exporter.zip" || url.search || url.hash) {
    throw new Error(`Disallowed EPA ECHO source URL ${url.origin}${url.pathname}.`);
  }
  return url;
}

async function requestSource(urlValue, { fetchImpl, method = "GET" }) {
  const url = assertAllowedUrl(urlValue);
  const response = await fetchImpl(url, {
    method,
    headers: { Accept: "application/zip, application/octet-stream", "User-Agent": "CoTive-Collector/0.1" },
    redirect: "error",
    signal: AbortSignal.timeout(method === "HEAD" ? 60_000 : 30 * 60_000),
  });
  if (!response.ok) throw new Error(`EPA ECHO ${method} failed with HTTP ${response.status} ${response.statusText}.`);
  return response;
}

function responseMetadata(response) {
  const contentLength = Number(response.headers.get("content-length"));
  return {
    content_length: Number.isFinite(contentLength) ? contentLength : null,
    last_modified: text(response.headers.get("last-modified")),
    etag: text(response.headers.get("etag")),
    content_type: text(response.headers.get("content-type")),
  };
}

async function validateZipFile(filename, maximumBytes = 600_000_000) {
  const fileStat = await stat(filename);
  if (!fileStat.isFile() || fileStat.size < 4 || fileStat.size > maximumBytes) throw new Error(`EPA ECHO ZIP size ${fileStat.size} is outside the allowed range.`);
  const handle = await open(filename, "r");
  try {
    const signature = Buffer.alloc(4);
    await handle.read(signature, 0, 4, 0);
    if (signature.readUInt32LE(0) !== 0x04034b50) throw new Error("EPA ECHO source is not a ZIP archive.");
  } finally {
    await handle.close();
  }
  return fileStat.size;
}

async function acquireArchive({ sourceUrl, destination, archivePath, sourceMetadata, fetchImpl }) {
  let metadata = sourceMetadata ?? null;
  if (archivePath) {
    if (!metadata) metadata = responseMetadata(await requestSource(sourceUrl, { fetchImpl, method: "HEAD" }));
    const inputSize = await validateZipFile(archivePath);
    if (metadata.content_length !== null && metadata.content_length !== inputSize) throw new Error("Local EPA ECHO archive size does not match the official source metadata.");
    const temporary = `${destination}.tmp-${randomUUID()}`;
    await copyFile(archivePath, temporary);
    await rename(temporary, destination);
    await validateZipFile(destination);
    return { ...metadata, access_method: "explicit-local-copy-validated-against-official-metadata" };
  }
  const response = await requestSource(sourceUrl, { fetchImpl });
  metadata = responseMetadata(response);
  if (metadata.content_length !== null && metadata.content_length > 600_000_000) throw new Error("EPA ECHO source exceeds the 600 MB compressed acquisition limit.");
  if (!response.body) throw new Error("EPA ECHO response has no body.");
  const temporary = `${destination}.tmp-${randomUUID()}`;
  await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary, { flags: "wx" }));
  const actualSize = await validateZipFile(temporary);
  if (metadata.content_length !== null && metadata.content_length !== actualSize) throw new Error("EPA ECHO download size does not match Content-Length.");
  await rename(temporary, destination);
  return { ...metadata, access_method: "streamed-official-https-download" };
}

async function openExporter(archivePath) {
  const archive = await unzipper.Open.file(archivePath);
  const files = archive.files.filter((entry) => entry.type === "File");
  if (files.length !== 1 || files[0].path !== "ECHO_EXPORTER.csv") throw new Error("EPA ECHO archive must contain only ECHO_EXPORTER.csv.");
  const entry = files[0];
  if (!Number.isFinite(entry.uncompressedSize) || entry.uncompressedSize < 1 || entry.uncompressedSize > 3_000_000_000) {
    throw new Error("EPA ECHO CSV uncompressed size is outside the 3 GB safety limit.");
  }
  return entry;
}

async function forEachExporterRow(entry, expectedFingerprint, consume) {
  let schemaFingerprint = null;
  const parser = parse({
    bom: true,
    columns: (headers) => {
      schemaFingerprint = sha256(headers.join("\u0000"));
      if (headers.length !== EPA_ECHO_HEADERS.length || headers.some((header, index) => header !== EPA_ECHO_HEADERS[index])) {
        throw new Error(`EPA ECHO schema changed (${schemaFingerprint}).`);
      }
      if (schemaFingerprint !== expectedFingerprint) throw new Error(`EPA ECHO schema fingerprint is not pinned (${schemaFingerprint}).`);
      return headers;
    },
    skip_empty_lines: true,
    max_record_size: 1_000_000,
  });
  const source = entry.stream();
  source.on("error", (error) => parser.destroy(error));
  source.pipe(parser);
  let records = 0;
  for await (const row of parser) {
    await consume(row);
    records += 1;
  }
  if (!schemaFingerprint) throw new Error("EPA ECHO source has no header row.");
  return { records, schemaFingerprint };
}

async function writeArtifact(directory, relativePath, content, metadata = {}) {
  const destination = path.join(directory, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
  const temporary = `${destination}.tmp-${randomUUID()}`;
  await writeFile(temporary, buffer);
  await rename(temporary, destination);
  return { path: relativePath.replaceAll("\\", "/"), bytes: buffer.length, sha256: sha256(buffer), ...metadata };
}

async function openGzipWriter(stagingDirectory, relativePath) {
  const destination = path.join(stagingDirectory, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp-${randomUUID()}`;
  const output = createWriteStream(temporary, { flags: "wx" });
  const gzip = createGzip();
  gzip.pipe(output);
  return { relativePath, destination, temporary, output, gzip, records: 0 };
}

async function writeGzipRecord(writer, record) {
  if (!writer.gzip.write(`${JSON.stringify(record)}\n`)) await once(writer.gzip, "drain");
  writer.records += 1;
}

async function closeGzipWriters(writers, artifactType) {
  const completion = writers.map((writer) => finished(writer.output));
  for (const writer of writers) writer.gzip.end();
  await Promise.all(completion);
  const artifacts = [];
  for (const writer of writers) {
    await rename(writer.temporary, writer.destination);
    artifacts.push({ path: writer.relativePath, ...(await hashFile(writer.destination)), record_count: writer.records, artifact_type: artifactType });
  }
  return artifacts;
}

function abortGzipWriters(writers) {
  for (const writer of writers) {
    writer.gzip.on("error", () => {});
    writer.output.on("error", () => {});
    writer.gzip.destroy();
    writer.output.destroy();
  }
}

function assertContained(parent, child, label) {
  const relative = path.relative(parent, child);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`${label} escapes its release directory.`);
}

async function loadZbpBaseline(pointerPath) {
  const pointer = JSON.parse(await readFile(pointerPath, "utf8"));
  const base = path.dirname(pointerPath);
  const manifestPath = path.resolve(base, pointer.manifest ?? "");
  assertContained(base, manifestPath, "Census ZBP manifest");
  const manifestBuffer = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBuffer.toString("utf8"));
  if (manifest.dataset_id !== "census-zbp-baseline" || !manifest.complete_national_release) throw new Error("A complete Census ZBP baseline release is required.");
  const artifact = manifest.artifacts.find((candidate) => candidate.path === "derived/zip-coverage.jsonl");
  if (!artifact) throw new Error("Census ZBP baseline has no ZIP coverage artifact.");
  const artifactPath = path.resolve(path.dirname(manifestPath), artifact.path);
  assertContained(path.dirname(manifestPath), artifactPath, "Census ZBP coverage artifact");
  const buffer = await readFile(artifactPath);
  if (buffer.length !== artifact.bytes || sha256(buffer) !== artifact.sha256) throw new Error("Census ZBP coverage checksum failed.");
  const rows = buffer.toString("utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
  return { rows, byZip: new Map(rows.map((row) => [row.zip_code, row])), manifest, manifestSha256: sha256(manifestBuffer) };
}

function buildZipCoverage(baselineRows, countsByZip, context) {
  const baselineByZip = new Map(baselineRows.map((row) => [row.zip_code, row]));
  const zipCodes = [...new Set([...baselineByZip.keys(), ...countsByZip.keys()])].sort();
  return zipCodes.map((zipCode) => {
    const baseline = baselineByZip.get(zipCode);
    const count = countsByZip.get(zipCode) ?? 0;
    return {
      schema_version: EPA_ECHO_SCHEMA_VERSION,
      zip_code: zipCode,
      epa_echo_active_facility_snapshot: {
        status: count ? "published-echo-active-program-facilities" : "no-active-facility-in-source-snapshot",
        facility_count: count,
        source_release_id: context.sourceReleaseId,
        source_updated_at: context.sourceUpdatedAt,
      },
      current_usps_validity: baseline?.current_usps_validity ?? { status: "unverified", reason: "ZIP appears in an EPA ECHO facility but is outside the current ZBP/ZCTA union." },
      geography: baseline?.geography ?? { status: "no-2020-zcta-polygon", geo_id: null, geoid: null, geometry_file: null },
      employer_baseline: baseline?.employer_baseline ?? null,
      baseline_coverage_status: baseline?.coverage_status ?? "outside-zbp-zcta-union",
    };
  });
}

function json(value) {
  return `${JSON.stringify(value)}\n`;
}

function jsonLines(records) {
  return `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
}

function releaseTimestamp(instant) {
  return instant.replaceAll(/[-:.]/g, "").replace("T", "-").replace("Z", "Z");
}

function sourceUpdatedAt(metadata) {
  const parsed = new Date(metadata.last_modified ?? "");
  if (!Number.isFinite(parsed.getTime())) throw new Error("EPA ECHO source metadata has no valid Last-Modified timestamp.");
  return parsed.toISOString();
}

export async function buildEpaEcho({
  outputRoot,
  zbpPointer,
  archivePath = null,
  sourceUrl = EPA_ECHO_EXPORTER_URL,
  sourceMetadata = null,
  minimumActiveFacilities = 1_000_000,
  maximumQuarantineRate = 0.10,
  schemaFingerprint = EPA_ECHO_SCHEMA_FINGERPRINT,
  fetchImpl = globalThis.fetch,
  logger = console.log,
  now = () => new Date(),
} = {}) {
  if (!outputRoot || !zbpPointer) throw new Error("outputRoot and zbpPointer are required.");
  if (!Number.isInteger(minimumActiveFacilities) || minimumActiveFacilities < 1) throw new Error("minimumActiveFacilities must be a positive integer.");
  if (!Number.isFinite(maximumQuarantineRate) || maximumQuarantineRate < 0 || maximumQuarantineRate > 1) throw new Error("maximumQuarantineRate must be from 0 through 1.");
  assertAllowedUrl(sourceUrl);
  const retrievedAt = now().toISOString();
  const runId = randomUUID();
  const releaseId = `epa-echo-${releaseTimestamp(retrievedAt)}-${runId.slice(0, 8)}`;
  const stagingDirectory = path.join(outputRoot, ".staging", runId);
  await mkdir(path.join(stagingDirectory, "source"), { recursive: true });
  const baseline = await loadZbpBaseline(zbpPointer);
  const retainedArchivePath = path.join(stagingDirectory, "source", "echo_exporter.zip");
  const acquisition = await acquireArchive({ sourceUrl, destination: retainedArchivePath, archivePath, sourceMetadata, fetchImpl });
  const archiveHash = await hashFile(retainedArchivePath);
  const sourceUpdated = sourceUpdatedAt(acquisition);
  if (sourceUpdated > retrievedAt) throw new Error("EPA ECHO source Last-Modified timestamp is after retrieval time.");
  const sourceReleaseId = `epa-echo-${sourceUpdated.slice(0, 10)}-${archiveHash.sha256.slice(0, 16)}`;
  const context = { runId, retrievedAt, sourceUpdatedAt: sourceUpdated, sourceReleaseId, baselineByZip: baseline.byZip };
  const writers = new Map();
  for (const prefix of "0123456789") writers.set(prefix, await openGzipWriter(stagingDirectory, `derived/facilities/zip-prefix=${prefix}.jsonl.gz`));
  const quarantineWriter = await openGzipWriter(stagingDirectory, "quarantine/records.jsonl.gz");
  const countsByZip = new Map();
  const stateCounts = new Map();
  const programCounts = new Map();
  const quarantineReasonCounts = new Map();
  const registryIds = new Set();
  const statusCounts = { active_y: 0, inactive_n: 0, unknown_blank: 0, unexpected: 0 };
  let missingRegistryIds = 0;
  let duplicateRegistryIds = 0;
  let accepted = 0;
  let quarantined = 0;
  const entry = await openExporter(retainedArchivePath);
  let sourceTable;
  try {
    sourceTable = await forEachExporterRow(entry, schemaFingerprint, async (source) => {
    const registryId = text(source.REGISTRY_ID);
    const active = text(source.FAC_ACTIVE_FLAG)?.toUpperCase() ?? "";
    const missingRegistryId = !registryId;
    const duplicateRegistryId = Boolean(registryId && registryIds.has(registryId));
    if (missingRegistryId) missingRegistryIds += 1;
    else if (duplicateRegistryId) duplicateRegistryIds += 1;
    else registryIds.add(registryId);
    if (active === "N") {
      statusCounts.inactive_n += 1;
      return;
    }
    if (!active) {
      statusCounts.unknown_blank += 1;
      return;
    }
    if (active !== "Y") {
      statusCounts.unexpected += 1;
      const reason = `unexpected-active-flag:${active}`;
      quarantineReasonCounts.set(reason, (quarantineReasonCounts.get(reason) ?? 0) + 1);
      await writeGzipRecord(quarantineWriter, { source_type: "facility", source_id: registryId, reason });
      quarantined += 1;
      return;
    }
    statusCounts.active_y += 1;
    try {
      if (missingRegistryId) throw new Error("missing-registry-id");
      if (duplicateRegistryId) throw new Error("duplicate-registry-id");
      const normalized = normalizeEchoFacility(source, context);
      assertNormalizedUsPostalFieldsDeep(normalized);
      const zipCode = normalized.address.zip_code;
      await writeGzipRecord(writers.get(zipCode[0]), normalized);
      countsByZip.set(zipCode, (countsByZip.get(zipCode) ?? 0) + 1);
      stateCounts.set(normalized.address.state, (stateCounts.get(normalized.address.state) ?? 0) + 1);
      for (const [program, value] of Object.entries(normalized.program_associations)) {
        if (value.associated) programCounts.set(program, (programCounts.get(program) ?? 0) + 1);
      }
      accepted += 1;
    } catch (error) {
      quarantineReasonCounts.set(error.message, (quarantineReasonCounts.get(error.message) ?? 0) + 1);
      await writeGzipRecord(quarantineWriter, { source_type: "facility", source_id: registryId, reason: error.message });
      quarantined += 1;
    }
    });
    if (registryIds.size + missingRegistryIds + duplicateRegistryIds !== sourceTable.records) throw new Error("EPA ECHO REGISTRY_ID quality counts do not reconcile to source rows.");
    if (statusCounts.active_y + statusCounts.inactive_n + statusCounts.unknown_blank + statusCounts.unexpected !== sourceTable.records) {
      throw new Error("EPA ECHO active-status categories do not reconcile to source rows.");
    }
    if (accepted + quarantined !== statusCounts.active_y + statusCounts.unexpected) throw new Error("EPA ECHO active and unexpected rows are not fully accounted.");
    if (accepted < minimumActiveFacilities) throw new Error(`EPA ECHO accepted active facility count ${accepted} is below the ${minimumActiveFacilities} quality floor.`);
    if (quarantined / Math.max(1, statusCounts.active_y + statusCounts.unexpected) > maximumQuarantineRate) {
      throw new Error(`EPA ECHO active-row quarantine rate ${(100 * quarantined / Math.max(1, statusCounts.active_y + statusCounts.unexpected)).toFixed(4)}% exceeds ${maximumQuarantineRate * 100}%; reasons=${JSON.stringify(Object.fromEntries([...quarantineReasonCounts].sort((left, right) => right[1] - left[1])))}`);
    }
  } catch (error) {
    abortGzipWriters([...writers.values(), quarantineWriter]);
    throw error;
  }
  const artifacts = [{
    path: "source/echo_exporter.zip",
    ...archiveHash,
    record_count: sourceTable.records,
    artifact_type: "epa-echo-source-exporter-zip",
    export_policy: "internal",
  }];
  artifacts.push(...await closeGzipWriters([...writers.values()], "normalized-epa-echo-facility-jsonl-gzip"));
  artifacts.push(...await closeGzipWriters([quarantineWriter], "quarantine-jsonl-gzip"));
  const coverageRows = buildZipCoverage(baseline.rows, countsByZip, context);
  artifacts.push(await writeArtifact(stagingDirectory, "derived/zip-coverage.jsonl", jsonLines(coverageRows), { artifact_type: "epa-echo-zip-coverage-jsonl", record_count: coverageRows.length }));
  artifacts.push(await writeArtifact(stagingDirectory, "derived/source-summary.json", json({
    active_status_counts: statusCounts,
    registry_id_quality: { unique_nonblank: registryIds.size, missing: missingRegistryIds, duplicate: duplicateRegistryIds },
    quarantine_reasons: Object.fromEntries([...quarantineReasonCounts].sort((left, right) => right[1] - left[1])),
    accepted_active_facilities: accepted,
    quarantined_active_or_unexpected_records: quarantined,
    states_and_territories: Object.fromEntries([...stateCounts].sort(([left], [right]) => left.localeCompare(right))),
    associated_program_flags: Object.fromEntries([...programCounts].sort(([left], [right]) => left.localeCompare(right))),
  }), { artifact_type: "epa-echo-source-summary" }));
  artifacts.push(await writeArtifact(stagingDirectory, "source/release-metadata.json", json({
    source_page: EPA_ECHO_DOWNLOADS_URL,
    source_url: sourceUrl,
    column_dictionary_url: EPA_ECHO_COLUMNS_URL,
    source_updated_at: sourceUpdated,
    retrieved_at: retrievedAt,
    access_method: acquisition.access_method,
    content_length: acquisition.content_length,
    content_type: acquisition.content_type,
    etag: acquisition.etag,
    last_modified: acquisition.last_modified,
    archive_sha256: archiveHash.sha256,
    archive_bytes: archiveHash.bytes,
    csv_entry: { path: entry.path, uncompressed_bytes: entry.uncompressedSize },
    schema_fingerprint: sourceTable.schemaFingerprint,
    source_records: sourceTable.records,
  }), { artifact_type: "epa-echo-source-release-metadata" }));
  const manifest = {
    schema_version: EPA_ECHO_SCHEMA_VERSION,
    dataset_id: "epa-echo-active-facilities",
    connector: { id: "epa-echo", version: "1.0.1" },
    release_id: releaseId,
    run_id: runId,
    retrieved_at: retrievedAt,
    source_updated_at: sourceUpdated,
    source_release_id: sourceReleaseId,
    status: "published",
    complete_echo_exporter_snapshot: true,
    active_filter: "FAC_ACTIVE_FLAG=Y",
    quality_gates: {
      minimum_active_facilities: minimumActiveFacilities,
      maximum_active_or_unexpected_quarantine_rate: maximumQuarantineRate,
      actual_active_or_unexpected_quarantine_rate: quarantined / Math.max(1, statusCounts.active_y + statusCounts.unexpected),
      quarantine_reasons: Object.fromEntries([...quarantineReasonCounts].sort((left, right) => right[1] - left[1])),
    },
    coverage: {
      source_records: sourceTable.records,
      source_active_y_records: statusCounts.active_y,
      source_inactive_n_records_excluded: statusCounts.inactive_n,
      source_unknown_blank_active_flag_records_excluded: statusCounts.unknown_blank,
      source_unexpected_active_flag_records_quarantined: statusCounts.unexpected,
      source_unique_nonblank_registry_id_records: registryIds.size,
      source_missing_registry_id_records: missingRegistryIds,
      source_duplicate_registry_id_records: duplicateRegistryIds,
      accepted_active_facilities: accepted,
      quarantined_active_or_unexpected_records: quarantined,
      source_zip_codes: countsByZip.size,
      zip_union_records: coverageRows.length,
      states_and_territories: stateCounts.size,
    },
    dependencies: [
      { dataset_id: baseline.manifest.dataset_id, release_id: baseline.manifest.release_id, manifest_sha256: baseline.manifestSha256 },
      baseline.manifest.geography_dependency,
    ],
    source: {
      publisher: "United States Environmental Protection Agency",
      source_page: EPA_ECHO_DOWNLOADS_URL,
      source_url: sourceUrl,
      column_dictionary_url: EPA_ECHO_COLUMNS_URL,
      access_method: acquisition.access_method,
      api_key_used: false,
      policy_profile: "config/source-policies/epa-echo.json",
    },
    limitations: [
      "ECHO covers environmentally regulated facilities and program records, not every U.S. business; facilities may be businesses, public agencies, utilities, institutions, or other regulated sites.",
      "FAC_ACTIVE_FLAG=Y means at least one associated ICIS-Air, ICIS-NPDES, RCRAInfo, or SDWIS permit/facility is active; it is not proof of general business operation or active status in every associated program.",
      "RCRA active/inactive designations are data-management and public-information indicators and do not themselves carry legal or regulatory significance.",
      "One provisional site and establishment are created per FRS REGISTRY_ID; no legal organization, owner, parent company, or cross-source merge is inferred.",
      "Program flags and IDs record associations, not a claim that each listed program interest is active.",
      "Source coordinates can be ZIP or county centroids; collection method, reference point, accuracy, and a centroid warning are retained so they are not presented as premise-level geocodes.",
      "Only records with FAC_ACTIVE_FLAG=Y and a valid reported U.S. physical address/ZIP are published; inactive and unknown-status rows are counted as exclusions and invalid active rows are quarantined.",
      "Current USPS ZIP validity remains unverified until an authoritative current ZIP denominator is integrated.",
    ],
    artifacts: artifacts.sort((left, right) => left.path.localeCompare(right.path)),
  };
  await writeArtifact(stagingDirectory, "manifest.json", json(manifest));
  const releaseDirectory = path.join(outputRoot, "releases", releaseId);
  await mkdir(path.dirname(releaseDirectory), { recursive: true });
  await rename(stagingDirectory, releaseDirectory);
  const pointerPath = path.join(outputRoot, "current.json");
  const temporaryPointer = `${pointerPath}.tmp-${runId}`;
  await mkdir(outputRoot, { recursive: true });
  await writeFile(temporaryPointer, json({ dataset_id: manifest.dataset_id, release_id: releaseId, manifest: `releases/${releaseId}/manifest.json`, updated_at: retrievedAt }));
  await rename(temporaryPointer, pointerPath);
  if (!(await stat(releaseDirectory)).isDirectory()) throw new Error("Published EPA ECHO release is not a directory.");
  logger(`Published ${accepted.toLocaleString("en-US")} EPA ECHO active regulated facilities.`);
  return { manifest, releaseDirectory, pointerPath };
}

async function forEachGzipRecord(filename, consume) {
  const lines = createInterface({ input: createReadStream(filename).pipe(createGunzip()), crlfDelay: Infinity });
  let count = 0;
  for await (const line of lines) {
    if (!line) continue;
    await consume(JSON.parse(line));
    count += 1;
  }
  return count;
}

export async function verifyEpaEcho(manifestPath) {
  const absoluteManifestPath = path.resolve(manifestPath);
  const releaseDirectory = path.dirname(absoluteManifestPath);
  const manifest = JSON.parse(await readFile(absoluteManifestPath, "utf8"));
  const failures = [];
  if (manifest.dataset_id !== "epa-echo-active-facilities" || manifest.status !== "published" || !manifest.complete_echo_exporter_snapshot || manifest.active_filter !== "FAC_ACTIVE_FLAG=Y") {
    failures.push({ path: "manifest.json", reason: "unexpected or incomplete manifest" });
  }
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
  const sourceArtifacts = manifest.artifacts?.filter((item) => item.artifact_type === "epa-echo-source-exporter-zip") ?? [];
  const metadataArtifacts = manifest.artifacts?.filter((item) => item.artifact_type === "epa-echo-source-release-metadata") ?? [];
  const normalizedArtifacts = manifest.artifacts?.filter((item) => item.artifact_type === "normalized-epa-echo-facility-jsonl-gzip") ?? [];
  const quarantineArtifacts = manifest.artifacts?.filter((item) => item.artifact_type === "quarantine-jsonl-gzip") ?? [];
  if (sourceArtifacts.length !== 1 || metadataArtifacts.length !== 1) failures.push({ path: "manifest.json", reason: "incomplete retained EPA ECHO source set" });
  if (normalizedArtifacts.length !== 10) failures.push({ path: "manifest.json", reason: "expected 10 normalized EPA ECHO ZIP partitions" });
  if (quarantineArtifacts.length !== 1) failures.push({ path: "manifest.json", reason: "expected one quarantine artifact" });
  if (sourceArtifacts.length === 1) {
    const expected = `epa-echo-${manifest.source_updated_at.slice(0, 10)}-${sourceArtifacts[0].sha256.slice(0, 16)}`;
    if (manifest.source_release_id !== expected) failures.push({ path: "manifest.json", reason: "source release ID is not bound to source timestamp and archive checksum" });
    if (sourceArtifacts[0].record_count !== manifest.coverage?.source_records || sourceArtifacts[0].export_policy !== "internal") {
      failures.push({ path: sourceArtifacts[0].path, reason: "source artifact count or policy does not reconcile" });
    }
  }
  const statusTotal = (manifest.coverage?.source_active_y_records ?? 0)
    + (manifest.coverage?.source_inactive_n_records_excluded ?? 0)
    + (manifest.coverage?.source_unknown_blank_active_flag_records_excluded ?? 0)
    + (manifest.coverage?.source_unexpected_active_flag_records_quarantined ?? 0);
  if (statusTotal !== manifest.coverage?.source_records) failures.push({ path: "manifest.json", reason: "active-status counts do not reconcile to source records" });
  if ((manifest.coverage?.source_records ?? 0) !== (manifest.coverage?.source_unique_nonblank_registry_id_records ?? 0)
    + (manifest.coverage?.source_missing_registry_id_records ?? 0)
    + (manifest.coverage?.source_duplicate_registry_id_records ?? 0)) {
    failures.push({ path: "manifest.json", reason: "REGISTRY_ID quality counts do not reconcile" });
  }
  if ((manifest.coverage?.accepted_active_facilities ?? 0) + (manifest.coverage?.quarantined_active_or_unexpected_records ?? 0)
    !== (manifest.coverage?.source_active_y_records ?? 0) + (manifest.coverage?.source_unexpected_active_flag_records_quarantined ?? 0)) {
    failures.push({ path: "manifest.json", reason: "active and unexpected records are not fully accounted" });
  }
  const quarantineReasonTotal = Object.values(manifest.quality_gates?.quarantine_reasons ?? {}).reduce((sum, count) => sum + count, 0);
  if (quarantineReasonTotal !== manifest.coverage?.quarantined_active_or_unexpected_records) failures.push({ path: "manifest.json", reason: "quarantine reasons do not reconcile" });
  if ((manifest.quality_gates?.actual_active_or_unexpected_quarantine_rate ?? 1) > (manifest.quality_gates?.maximum_active_or_unexpected_quarantine_rate ?? 0)) {
    failures.push({ path: "manifest.json", reason: "published release exceeds its quarantine-rate quality gate" });
  }
  const ids = new Set();
  const countsByZip = new Map();
  let accepted = 0;
  for (const artifact of normalizedArtifacts) {
    try {
      const partition = artifact.path.match(/zip-prefix=(\d)/)?.[1];
      const count = await forEachGzipRecord(path.join(releaseDirectory, artifact.path), (record) => {
        const id = record.external_identifiers?.find((item) => item.type === "frs_registry_id")?.value;
        if (!id || ids.has(id)) throw new Error(`duplicate or missing FRS REGISTRY_ID ${id}`);
        if (record.address?.zip_code?.[0] !== partition || !/^\d{5}$/.test(record.address.zip_code)) throw new Error(`invalid ZIP partition for ${id}`);
        if (record.source_status?.value !== "epa-echo-active-program-facility-as-of-source-release" || record.source_status.source_updated_at !== manifest.source_updated_at) {
          throw new Error(`invalid source status for ${id}`);
        }
        if (record.provenance?.source_release_id !== manifest.source_release_id || record.provenance?.policy_id !== "epa-echo" || record.export_policy !== "public") {
          throw new Error(`invalid provenance for ${id}`);
        }
        if (record.entity_candidates?.organization_id) throw new Error(`organization inferred for ${id}`);
        ids.add(id);
        countsByZip.set(record.address.zip_code, (countsByZip.get(record.address.zip_code) ?? 0) + 1);
      });
      if (count !== artifact.record_count) failures.push({ path: artifact.path, reason: "actual normalized line count mismatch" });
      accepted += count;
    } catch (error) {
      failures.push({ path: artifact.path, reason: `normalized validation failed: ${error.message}` });
    }
  }
  if (accepted !== manifest.coverage?.accepted_active_facilities) failures.push({ path: "manifest.json", reason: "accepted active facility count does not reconcile" });
  if (quarantineArtifacts.length === 1) {
    try {
      const count = await forEachGzipRecord(path.join(releaseDirectory, quarantineArtifacts[0].path), () => {});
      if (count !== quarantineArtifacts[0].record_count || count !== manifest.coverage?.quarantined_active_or_unexpected_records) throw new Error("quarantine count mismatch");
    } catch (error) {
      failures.push({ path: quarantineArtifacts[0].path, reason: `quarantine validation failed: ${error.message}` });
    }
  }
  const zipArtifact = manifest.artifacts?.find((item) => item.artifact_type === "epa-echo-zip-coverage-jsonl");
  if (!zipArtifact) failures.push({ path: "manifest.json", reason: "missing ZIP coverage artifact" });
  else {
    try {
      const rows = (await readFile(path.join(releaseDirectory, zipArtifact.path), "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse);
      if (rows.length !== zipArtifact.record_count || rows.length !== manifest.coverage?.zip_union_records) throw new Error("ZIP row count mismatch");
      if (rows.reduce((sum, row) => sum + row.epa_echo_active_facility_snapshot.facility_count, 0) !== accepted) throw new Error("ZIP facility counts do not reconcile");
      for (const row of rows) {
        if ((countsByZip.get(row.zip_code) ?? 0) !== row.epa_echo_active_facility_snapshot.facility_count) throw new Error(`ZIP ${row.zip_code} does not reconcile`);
        if (row.current_usps_validity?.status !== "unverified") throw new Error(`ZIP ${row.zip_code} has unsupported USPS validity`);
      }
    } catch (error) {
      failures.push({ path: zipArtifact.path, reason: `ZIP validation failed: ${error.message}` });
    }
  }
  if (failures.length) {
    const error = new Error(`EPA ECHO release verification failed for ${failures.length} check(s).`);
    error.failures = failures;
    throw error;
  }
  return { dataset_id: manifest.dataset_id, release_id: manifest.release_id, source_release_id: manifest.source_release_id, artifact_count: manifest.artifacts.length, coverage: manifest.coverage };
}
