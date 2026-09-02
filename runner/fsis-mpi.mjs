import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { finished } from "node:stream/promises";
import { createInterface } from "node:readline";
import { createGunzip, createGzip } from "node:zlib";
import { parse } from "csv-parse/sync";
import { assertNormalizedUsPostalFieldsDeep } from "./normalized-us-postal-code.mjs";

export const FSIS_MPI_SCHEMA_VERSION = "1.0.0";
export const FSIS_MPI_TRANSFORMATION_VERSION = "fsis-mpi@1.0.1";
export const FSIS_MPI_PAGE_URL = "https://www.fsis.usda.gov/inspection/establishments/meat-poultry-and-egg-product-inspection-directory";
export const FSIS_MPI_DIRECTORY_URL = "https://www.fsis.usda.gov/sites/default/files/media_file/documents/MPI_Directory_by_Establishment_Name.csv";
export const FSIS_MPI_DEMOGRAPHIC_URL = "https://www.fsis.usda.gov/sites/default/files/media_file/documents/Dataset_Establishment_Demographic_Data.csv";

export const FSIS_MPI_HEADERS = [
  "establishment_id", "establishment_number", "establishment_name", "duns_number", "street", "city", "state", "zip", "phone",
  "grant_date", "activities", "dbas", "district", "circuit", "size", "latitude", "longitude", "county", "fips_code",
];

export const FSIS_DEMOGRAPHIC_REQUIRED_HEADERS = [
  "establishment_number", "establishment_id", "establishment_name",
  "active_meat_grant", "last_meat_grant_edit_date", "active_voluntary_grant", "last_voluntary_grant_edit_date",
  "active_poultry_grant", "last_poultry_grant_edit_date", "active_egg_grant", "last_egg_grant_edit_date",
  "slaughter", "processing", "meat_slaughter", "poultry_slaughter", "meat_processing", "poultry_processing", "egg_processing",
  "listeria_alternative", "processing_volume_category", "slaughter_volume_category", "category_start_date", "category_end_date",
];

export const FSIS_SCHEMA_FINGERPRINTS = {
  directory: "06a85c4912dde59afb2f17fae0713e2ccdb032859a16d18f26f4a05bde110239",
  demographic: "b7676d35529f3e89ad37a225970aa7cfc5cbc9bc5ad887bbc2da25f8fe619d49",
};

const US_STATE_AND_TERRITORY_CODES = new Set([
  "AL", "AK", "AS", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "GU", "HI", "ID", "IL", "IN", "IA", "KS", "KY",
  "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "MP", "OH", "OK",
  "OR", "PA", "PR", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "VI", "WA", "WV", "WI", "WY",
]);

const GRANT_FIELDS = [
  ["meat", "active_meat_grant", "last_meat_grant_edit_date"],
  ["voluntary", "active_voluntary_grant", "last_voluntary_grant_edit_date"],
  ["poultry", "active_poultry_grant", "last_poultry_grant_edit_date"],
  ["egg", "active_egg_grant", "last_egg_grant_edit_date"],
];

const DEMOGRAPHIC_CATEGORY_FIELDS = new Set([
  "slaughter_or_processing_only", "slaughter_only_class", "slaughter_only_species", "meat_slaughter_only_species", "poultry_slaughter_only_species",
  "processing_only_category", "processing_only_class", "processing_only_species", "meat_processing_only_species", "poultry_processing_only_species",
  "listeria_alternative", "processing_volume_category", "slaughter_volume_category", "category_start_date", "category_end_date",
  "young_chicken_carcasses_category", "young_turkey_carcasses_category", "comminuted_chicken_category", "comminuted_turkey_category", "chicken_parts_category",
]);

const DEMOGRAPHIC_IDENTITY_FIELDS = new Set([
  "establishment_number", "establishment_id", "establishment_name",
  ...GRANT_FIELDS.flatMap(([, active, edited]) => [active, edited]),
]);

function text(value) {
  const result = String(value ?? "").trim();
  return result || null;
}

function digits(value) {
  return String(value ?? "").replace(/\D/g, "");
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

function sourceDate(value) {
  const raw = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  return `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
}

function postalCode(value) {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d{3,5})(?:-(\d{4}))?$/);
  if (!match) return null;
  const zipCode = match[1].padStart(5, "0");
  return { zip_code: zipCode, postal_code: zipCode, zip4: match[2] ?? null };
}

function fipsCode(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  return /^\d{4,5}$/.test(raw) ? raw.padStart(5, "0") : null;
}

function semicolonList(value) {
  return [...new Set(String(value ?? "").split(";").map((item) => item.trim()).filter(Boolean))];
}

function geography(zipCode, baselineByZip) {
  const baseline = baselineByZip?.get(zipCode);
  return {
    zcta_match_status: baseline?.geography?.status ?? "no-2020-zcta-polygon",
    zcta_geo_id: baseline?.geography?.geo_id ?? null,
    zcta_geoid: baseline?.geography?.geoid ?? null,
    zcta_geometry_file: baseline?.geography?.geometry_file ?? null,
  };
}

function provenance(context, sourceRecordId) {
  return {
    source_id: "usda-fsis-active-mpi-directory",
    source_release_id: context.sourceReleaseId,
    source_record_id: sourceRecordId,
    ingest_run_id: context.runId,
    transformation_version: FSIS_MPI_TRANSFORMATION_VERSION,
    policy_id: "fsis-mpi",
  };
}

function demographicAssertions(source) {
  const activeFlags = [];
  const categoricalValues = {};
  for (const [field, raw] of Object.entries(source)) {
    if (DEMOGRAPHIC_IDENTITY_FIELDS.has(field)) continue;
    const value = text(raw);
    if (!value) continue;
    if (value.toLowerCase() === "yes") activeFlags.push(field);
    else if (DEMOGRAPHIC_CATEGORY_FIELDS.has(field)) categoricalValues[field] = field.endsWith("_date") ? sourceDate(value) ?? value : value;
    else throw new Error(`unexpected-demographic-value:${field}`);
  }
  activeFlags.sort();
  return { active_flags: activeFlags, categorical_values: categoricalValues };
}

export function normalizeFsisEstablishment(directory, demographic, context) {
  const establishmentId = digits(directory.establishment_id);
  const establishmentNumber = text(directory.establishment_number);
  const establishmentName = text(directory.establishment_name);
  if (!establishmentId || !establishmentNumber || !establishmentName) throw new Error("missing-establishment-identity");
  if (establishmentId !== digits(demographic.establishment_id)
    || establishmentNumber !== text(demographic.establishment_number)
    || establishmentName !== text(demographic.establishment_name)) throw new Error("demographic-join-mismatch");
  const state = text(directory.state)?.toUpperCase() ?? null;
  if (!US_STATE_AND_TERRITORY_CODES.has(state)) throw new Error("invalid-us-state-or-territory");
  const postal = postalCode(directory.zip);
  const street = text(directory.street);
  const city = text(directory.city);
  if (!postal || !street || !city) throw new Error("missing-physical-address");
  const latitude = Number(directory.latitude);
  const longitude = Number(directory.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error("invalid-coordinate");
  }
  const countyFips = fipsCode(directory.fips_code);
  if (text(directory.fips_code) && !countyFips) throw new Error("invalid-county-fips");
  const grants = { active: [], last_edit_dates: {} };
  for (const [name, activeField, dateField] of GRANT_FIELDS) {
    const activeValue = text(demographic[activeField]);
    if (activeValue && activeValue.toLowerCase() !== "yes") throw new Error(`unexpected-grant-value:${activeField}`);
    if (activeValue) grants.active.push(name);
    const edited = text(demographic[dateField]);
    if (edited) {
      const date = sourceDate(edited);
      if (!date) throw new Error(`invalid-grant-date:${dateField}`);
      grants.last_edit_dates[name] = date;
    }
  }
  const grantDate = sourceDate(directory.grant_date);
  if (text(directory.grant_date) && !grantDate) throw new Error("invalid-grant-date");
  const sourceRecordId = `establishment:${establishmentId}`;
  return {
    schema_version: FSIS_MPI_SCHEMA_VERSION,
    normalized_record_id: `fsis-mpi:${sourceRecordId}`,
    entity_candidates: {
      physical_site_id: `site:fsis_establishment_${establishmentId}`,
      establishment_id: `establishment:fsis_establishment_${establishmentId}`,
      identity_status: "provisional",
    },
    external_identifiers: [
      { type: "fsis_establishment_id", value: establishmentId, source_field: "establishment_id" },
      { type: "fsis_establishment_number", value: establishmentNumber, source_field: "establishment_number" },
    ],
    name: establishmentName,
    other_names: semicolonList(directory.dbas),
    address: {
      street,
      unit_or_additional: null,
      city,
      state,
      zip_code: postal.zip_code,
      postal_code: postal.postal_code,
      zip4: postal.zip4,
      county_name: text(directory.county),
      county_fips: countyFips,
      country: "US",
    },
    location: { type: "Point", coordinates: [longitude, latitude] },
    geography: geography(postal.zip_code, context.baselineByZip),
    telephone: digits(directory.phone) || null,
    grant_date: grantDate,
    activities: semicolonList(directory.activities),
    inspection_context: {
      district: text(directory.district),
      circuit: text(directory.circuit),
      haccp_size: text(directory.size),
    },
    active_grants: grants,
    reported_demographics: demographicAssertions(demographic),
    source_status: {
      value: "listed-in-fsis-active-mpi-directory-as-of-release",
      scope: "Listed in the FSIS active Meat, Poultry and Egg Product Inspection Directory current edition; not independent proof of general business operating status, public access, hours, ownership, or every product made",
      source_date: context.sourceDate,
    },
    observed_at: context.retrievedAt,
    provenance: provenance(context, sourceRecordId),
    export_policy: "public",
  };
}

function parseCsvTable(buffer, requiredHeaders, expectedFingerprint, label) {
  const rows = parse(buffer, { bom: true, skip_empty_lines: true, relax_quotes: true });
  const headers = rows.shift();
  if (!Array.isArray(headers)) throw new Error(`${label} has no header row.`);
  const missing = requiredHeaders.filter((header) => !headers.includes(header));
  if (missing.length) throw new Error(`${label} is missing required columns: ${missing.join(", ")}.`);
  const actualFingerprint = sha256(headers.join("\u0000"));
  if (actualFingerprint !== expectedFingerprint) throw new Error(`${label} schema changed (${actualFingerprint}).`);
  return {
    headers,
    fingerprint: actualFingerprint,
    rows: rows.map((values, index) => {
      if (values.length !== headers.length) throw new Error(`${label} row ${index + 2} has ${values.length} fields; expected ${headers.length}.`);
      return Object.fromEntries(headers.map((header, column) => [header, values[column]]));
    }),
  };
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
      schema_version: FSIS_MPI_SCHEMA_VERSION,
      zip_code: zipCode,
      fsis_active_mpi_snapshot: {
        status: count ? "published-active-fsis-establishments" : "no-establishment-in-current-source-snapshot",
        establishment_count: count,
        source_release_id: context.sourceReleaseId,
        source_date: context.sourceDate,
      },
      current_usps_validity: baseline?.current_usps_validity ?? { status: "unverified", reason: "ZIP appears in FSIS establishments but is outside the current ZBP/ZCTA union." },
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

export async function buildFsisMpi({
  outputRoot,
  zbpPointer,
  directoryPath,
  demographicPath,
  sourceDate: sourceDateValue,
  minimumEstablishments = 6_000,
  maximumQuarantineRate = 0.005,
  schemaFingerprints = FSIS_SCHEMA_FINGERPRINTS,
  logger = console.log,
  now = () => new Date(),
} = {}) {
  if (!outputRoot || !zbpPointer || !directoryPath || !demographicPath || !sourceDateValue) {
    throw new Error("outputRoot, zbpPointer, directoryPath, demographicPath, and sourceDate are required.");
  }
  const sourceDateNormalized = sourceDate(sourceDateValue);
  if (!sourceDateNormalized) throw new Error("sourceDate must be YYYY-MM-DD.");
  if (!Number.isInteger(minimumEstablishments) || minimumEstablishments < 1) throw new Error("minimumEstablishments must be a positive integer.");
  if (!Number.isFinite(maximumQuarantineRate) || maximumQuarantineRate < 0 || maximumQuarantineRate > 1) throw new Error("maximumQuarantineRate must be from 0 through 1.");
  const retrievedAt = now().toISOString();
  if (sourceDateNormalized > retrievedAt.slice(0, 10)) throw new Error("sourceDate cannot be after retrieval date.");
  const runId = randomUUID();
  const releaseId = `fsis-mpi-${releaseTimestamp(retrievedAt)}-${runId.slice(0, 8)}`;
  const stagingDirectory = path.join(outputRoot, ".staging", runId);
  await mkdir(path.join(stagingDirectory, "source"), { recursive: true });
  const baseline = await loadZbpBaseline(zbpPointer);
  const directoryBuffer = await readFile(directoryPath);
  const demographicBuffer = await readFile(demographicPath);
  if (directoryBuffer.length > 50_000_000 || demographicBuffer.length > 50_000_000) throw new Error("An FSIS source CSV exceeds the 50 MB input limit.");
  const directory = parseCsvTable(directoryBuffer, FSIS_MPI_HEADERS, schemaFingerprints.directory, "FSIS MPI directory");
  const demographic = parseCsvTable(demographicBuffer, FSIS_DEMOGRAPHIC_REQUIRED_HEADERS, schemaFingerprints.demographic, "FSIS demographic data");
  if (directory.rows.length !== demographic.rows.length) throw new Error("FSIS directory and demographic row counts differ.");
  const demographicById = new Map();
  for (const row of demographic.rows) {
    const id = digits(row.establishment_id);
    if (!id || demographicById.has(id)) throw new Error(`Duplicate or invalid FSIS demographic establishment ID ${row.establishment_id ?? "<blank>"}.`);
    demographicById.set(id, row);
  }
  const directoryIds = new Set();
  for (const row of directory.rows) {
    const id = digits(row.establishment_id);
    if (!id) throw new Error("FSIS directory contains a blank or invalid establishment ID.");
    if (directoryIds.has(id)) throw new Error(`Duplicate FSIS directory establishment ID ${id}.`);
    directoryIds.add(id);
    const demographicRow = demographicById.get(id);
    if (!demographicRow) throw new Error(`FSIS directory establishment ${id} has no demographic row.`);
    if (text(row.establishment_number) !== text(demographicRow.establishment_number)
      || text(row.establishment_name) !== text(demographicRow.establishment_name)) {
      throw new Error(`FSIS directory and demographic identity mismatch for establishment ${id}.`);
    }
  }
  if (directoryIds.size !== demographicById.size) throw new Error("FSIS demographic data contains an establishment absent from the active directory.");
  const sourceDigest = sha256(`${sourceDateNormalized}\u0000${sha256(directoryBuffer)}\u0000${sha256(demographicBuffer)}`);
  const sourceReleaseId = `fsis-mpi-${sourceDateNormalized}-${sourceDigest.slice(0, 16)}`;
  const context = { runId, retrievedAt, sourceDate: sourceDateNormalized, sourceReleaseId, baselineByZip: baseline.byZip };
  const writers = new Map();
  for (const prefix of "0123456789") writers.set(prefix, await openGzipWriter(stagingDirectory, `derived/establishments/zip-prefix=${prefix}.jsonl.gz`));
  const quarantineWriter = await openGzipWriter(stagingDirectory, "quarantine/records.jsonl.gz");
  const ids = new Set();
  const countsByZip = new Map();
  const stateCounts = new Map();
  const activityCounts = new Map();
  let accepted = 0;
  let quarantined = 0;
  for (const source of directory.rows) {
    const id = digits(source.establishment_id);
    try {
      if (!id || ids.has(id)) throw new Error("duplicate-or-invalid-establishment-id");
      const demographicRow = demographicById.get(id);
      if (!demographicRow) throw new Error("missing-demographic-row");
      const normalized = normalizeFsisEstablishment(source, demographicRow, context);
      assertNormalizedUsPostalFieldsDeep(normalized);
      ids.add(id);
      const zipCode = normalized.address.zip_code;
      await writeGzipRecord(writers.get(zipCode[0]), normalized);
      countsByZip.set(zipCode, (countsByZip.get(zipCode) ?? 0) + 1);
      stateCounts.set(normalized.address.state, (stateCounts.get(normalized.address.state) ?? 0) + 1);
      for (const activity of normalized.activities) activityCounts.set(activity, (activityCounts.get(activity) ?? 0) + 1);
      accepted += 1;
    } catch (error) {
      await writeGzipRecord(quarantineWriter, { source_type: "establishment", source_id: id || null, reason: error.message });
      quarantined += 1;
    }
  }
  if (ids.size + quarantined !== directory.rows.length) throw new Error("FSIS source records are not fully accounted.");
  if (accepted < minimumEstablishments) throw new Error(`FSIS accepted establishment count ${accepted} is below the ${minimumEstablishments} quality floor.`);
  if (quarantined / Math.max(1, directory.rows.length) > maximumQuarantineRate) throw new Error(`FSIS quarantine rate exceeds ${maximumQuarantineRate * 100}%.`);
  const artifacts = [];
  artifacts.push(await writeArtifact(stagingDirectory, "source/MPI_Directory_by_Establishment_Name.csv", directoryBuffer, { artifact_type: "fsis-source-active-directory-csv", record_count: directory.rows.length, export_policy: "internal" }));
  artifacts.push(await writeArtifact(stagingDirectory, "source/Dataset_Establishment_Demographic_Data.csv", demographicBuffer, { artifact_type: "fsis-source-demographic-csv", record_count: demographic.rows.length, export_policy: "internal" }));
  artifacts.push(...await closeGzipWriters([...writers.values()], "normalized-fsis-establishment-jsonl-gzip"));
  artifacts.push(...await closeGzipWriters([quarantineWriter], "quarantine-jsonl-gzip"));
  const coverageRows = buildZipCoverage(baseline.rows, countsByZip, context);
  artifacts.push(await writeArtifact(stagingDirectory, "derived/zip-coverage.jsonl", jsonLines(coverageRows), { artifact_type: "fsis-zip-coverage-jsonl", record_count: coverageRows.length }));
  artifacts.push(await writeArtifact(stagingDirectory, "derived/source-summary.json", json({
    states_and_territories: Object.fromEntries([...stateCounts].sort(([left], [right]) => left.localeCompare(right))),
    activities: Object.fromEntries([...activityCounts].sort(([left], [right]) => left.localeCompare(right))),
  }), { artifact_type: "fsis-source-summary" }));
  artifacts.push(await writeArtifact(stagingDirectory, "source/release-metadata.json", json({
    source_page: FSIS_MPI_PAGE_URL,
    directory_url: FSIS_MPI_DIRECTORY_URL,
    demographic_url: FSIS_MPI_DEMOGRAPHIC_URL,
    source_date: sourceDateNormalized,
    access_method: "explicit local file input from the official browser-download links",
    source_table_counts: { directory: directory.rows.length, demographic: demographic.rows.length },
    schema_fingerprints: { directory: directory.fingerprint, demographic: demographic.fingerprint },
    file_sha256: { directory: sha256(directoryBuffer), demographic: sha256(demographicBuffer) },
  }), { artifact_type: "fsis-source-release-metadata" }));
  const manifest = {
    schema_version: FSIS_MPI_SCHEMA_VERSION,
    dataset_id: "fsis-active-mpi-establishments",
    connector: { id: "fsis-mpi", version: "1.0.1" },
    release_id: releaseId,
    run_id: runId,
    retrieved_at: retrievedAt,
    source_date: sourceDateNormalized,
    source_release_id: sourceReleaseId,
    status: "published",
    complete_current_active_directory_snapshot: true,
    coverage: {
      source_directory_records: directory.rows.length,
      source_demographic_records: demographic.rows.length,
      accepted_active_establishments: accepted,
      quarantined_records: quarantined,
      source_zip_codes: countsByZip.size,
      zip_union_records: coverageRows.length,
      states_and_territories: stateCounts.size,
      activity_types: activityCounts.size,
    },
    dependencies: [
      { dataset_id: baseline.manifest.dataset_id, release_id: baseline.manifest.release_id, manifest_sha256: baseline.manifestSha256 },
      baseline.manifest.geography_dependency,
    ],
    source: {
      publisher: "United States Department of Agriculture, Food Safety and Inspection Service",
      source_page: FSIS_MPI_PAGE_URL,
      directory_url: FSIS_MPI_DIRECTORY_URL,
      demographic_url: FSIS_MPI_DEMOGRAPHIC_URL,
      access_method: "public browser-download files supplied explicitly to the connector",
      api_key_used: false,
      policy_profile: "config/source-policies/fsis-mpi.json",
    },
    limitations: [
      "The active MPI directory covers FSIS-regulated meat, poultry, and egg-product establishments, not every food business or every U.S. business.",
      "Directory membership is source-specific regulatory evidence and does not independently prove general business operating status, public access, current hours, ownership, or every product made.",
      "One provisional site and establishment are created per FSIS establishment ID; no legal organization, parent company, or cross-source merge is inferred.",
      "The source DUNS field is retained only in the internal raw CSV and excluded from normalized/public records pending field-specific redistribution review.",
      "Source ZIP values with omitted leading zeroes are deterministically left-padded to ZIP5; current USPS validity remains unverified until an authoritative denominator is integrated.",
      "FSIS currently blocks unattended HTTP and fresh headless-browser clients in this environment, so official files must be downloaded in a normal browser and passed explicitly to the connector.",
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
  if (!(await stat(releaseDirectory)).isDirectory()) throw new Error("Published FSIS MPI release is not a directory.");
  logger(`Published ${accepted.toLocaleString("en-US")} FSIS active establishments.`);
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

export async function verifyFsisMpi(manifestPath) {
  const absoluteManifestPath = path.resolve(manifestPath);
  const releaseDirectory = path.dirname(absoluteManifestPath);
  const manifest = JSON.parse(await readFile(absoluteManifestPath, "utf8"));
  const failures = [];
  if (manifest.dataset_id !== "fsis-active-mpi-establishments" || manifest.status !== "published" || !manifest.complete_current_active_directory_snapshot) {
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
  const directoryArtifacts = manifest.artifacts?.filter((item) => item.artifact_type === "fsis-source-active-directory-csv") ?? [];
  const demographicArtifacts = manifest.artifacts?.filter((item) => item.artifact_type === "fsis-source-demographic-csv") ?? [];
  const metadataArtifacts = manifest.artifacts?.filter((item) => item.artifact_type === "fsis-source-release-metadata") ?? [];
  const normalizedArtifacts = manifest.artifacts?.filter((item) => item.artifact_type === "normalized-fsis-establishment-jsonl-gzip") ?? [];
  const quarantineArtifacts = manifest.artifacts?.filter((item) => item.artifact_type === "quarantine-jsonl-gzip") ?? [];
  if (directoryArtifacts.length !== 1 || demographicArtifacts.length !== 1 || metadataArtifacts.length !== 1) failures.push({ path: "manifest.json", reason: "incomplete retained FSIS source set" });
  if (normalizedArtifacts.length !== 10) failures.push({ path: "manifest.json", reason: "expected 10 normalized FSIS ZIP partitions" });
  if (quarantineArtifacts.length !== 1) failures.push({ path: "manifest.json", reason: "expected one quarantine artifact" });
  if (directoryArtifacts.length === 1 && demographicArtifacts.length === 1) {
    const expectedDigest = sha256(`${manifest.source_date}\u0000${directoryArtifacts[0].sha256}\u0000${demographicArtifacts[0].sha256}`);
    if (manifest.source_release_id !== `fsis-mpi-${manifest.source_date}-${expectedDigest.slice(0, 16)}`) failures.push({ path: "manifest.json", reason: "source release ID is not bound to date and both source checksums" });
  }
  if ((manifest.coverage?.accepted_active_establishments ?? 0) + (manifest.coverage?.quarantined_records ?? 0) !== manifest.coverage?.source_directory_records) {
    failures.push({ path: "manifest.json", reason: "source directory rows are not fully accounted" });
  }
  const ids = new Set();
  const countsByZip = new Map();
  let accepted = 0;
  for (const artifact of normalizedArtifacts) {
    try {
      const partition = artifact.path.match(/zip-prefix=(\d)/)?.[1];
      const count = await forEachGzipRecord(path.join(releaseDirectory, artifact.path), (record) => {
        const id = record.external_identifiers?.find((item) => item.type === "fsis_establishment_id")?.value;
        if (!id || ids.has(id)) throw new Error(`duplicate or missing establishment ID ${id}`);
        if (record.address?.zip_code?.[0] !== partition || !/^\d{5}$/.test(record.address.zip_code)) throw new Error(`invalid ZIP partition for ${id}`);
        if (record.source_status?.value !== "listed-in-fsis-active-mpi-directory-as-of-release" || record.source_status.source_date !== manifest.source_date) throw new Error(`invalid source status for ${id}`);
        if (record.provenance?.source_release_id !== manifest.source_release_id || record.provenance?.policy_id !== "fsis-mpi" || record.export_policy !== "public") throw new Error(`invalid provenance for ${id}`);
        if (Object.hasOwn(record, "duns_number") || record.external_identifiers?.some((item) => item.type?.toLowerCase().includes("duns"))) {
          throw new Error(`DUNS leaked into normalized record ${id}`);
        }
        ids.add(id);
        countsByZip.set(record.address.zip_code, (countsByZip.get(record.address.zip_code) ?? 0) + 1);
      });
      if (count !== artifact.record_count) failures.push({ path: artifact.path, reason: "actual normalized line count mismatch" });
      accepted += count;
    } catch (error) {
      failures.push({ path: artifact.path, reason: `normalized validation failed: ${error.message}` });
    }
  }
  if (accepted !== manifest.coverage?.accepted_active_establishments) failures.push({ path: "manifest.json", reason: "accepted establishment count does not reconcile" });
  if (quarantineArtifacts.length === 1) {
    try {
      const count = await forEachGzipRecord(path.join(releaseDirectory, quarantineArtifacts[0].path), () => {});
      if (count !== quarantineArtifacts[0].record_count || count !== manifest.coverage?.quarantined_records) throw new Error("quarantine count mismatch");
    } catch (error) {
      failures.push({ path: quarantineArtifacts[0].path, reason: `quarantine validation failed: ${error.message}` });
    }
  }
  const zipArtifact = manifest.artifacts?.find((item) => item.artifact_type === "fsis-zip-coverage-jsonl");
  if (!zipArtifact) failures.push({ path: "manifest.json", reason: "missing ZIP coverage artifact" });
  else {
    try {
      const rows = (await readFile(path.join(releaseDirectory, zipArtifact.path), "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse);
      if (rows.length !== zipArtifact.record_count || rows.length !== manifest.coverage?.zip_union_records) throw new Error("ZIP row count mismatch");
      if (rows.reduce((sum, row) => sum + row.fsis_active_mpi_snapshot.establishment_count, 0) !== accepted) throw new Error("ZIP establishment counts do not reconcile");
      for (const row of rows) {
        if ((countsByZip.get(row.zip_code) ?? 0) !== row.fsis_active_mpi_snapshot.establishment_count) throw new Error(`ZIP ${row.zip_code} does not reconcile`);
        if (row.current_usps_validity?.status !== "unverified") throw new Error(`ZIP ${row.zip_code} has unsupported USPS validity`);
      }
    } catch (error) {
      failures.push({ path: zipArtifact.path, reason: `ZIP validation failed: ${error.message}` });
    }
  }
  if (failures.length) {
    const error = new Error(`FSIS MPI release verification failed for ${failures.length} check(s).`);
    error.failures = failures;
    throw error;
  }
  return { dataset_id: manifest.dataset_id, release_id: manifest.release_id, source_release_id: manifest.source_release_id, artifact_count: manifest.artifacts.length, coverage: manifest.coverage };
}
