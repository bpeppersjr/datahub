import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { finished } from "node:stream/promises";
import { createInterface } from "node:readline";
import { createGunzip, createGzip } from "node:zlib";

import { assertNormalizedUsPostalFieldsDeep } from "./normalized-us-postal-code.mjs";

export const FDIC_SCHEMA_VERSION = "1.0.0";
export const FDIC_TRANSFORMATION_VERSION = "fdic-bankfind@1.0.1";
export const FDIC_API_ROOT = "https://api.fdic.gov/banks";

const INSTITUTION_FIELDS = [
  "CERT", "UNINUM", "NAME", "ACTIVE", "INACTIVE", "ADDRESS", "ADDRESS2", "CITY", "STALP", "STNAME", "ZIP", "COUNTY", "STCNTY",
  "LATITUDE", "LONGITUDE", "DATEUPDT", "RUNDATE", "ESTYMD", "INSDATE", "ENDEFYMD", "WEBADDR", "LEI", "FED_RSSD", "BKCLASS",
  "CHRTAGNT", "REGAGNT", "OFFICES", "MDI_STATUS_CODE", "MDI_STATUS_DESC",
];
const LOCATION_FIELDS = [
  "CERT", "FI_UNINUM", "UNINUM", "NAME", "OFFNAME", "OFFNUM", "MAINOFF", "ADDRESS", "ADDRESS2", "CITY", "STALP", "STNAME", "ZIP",
  "COUNTY", "STCNTY", "LATITUDE", "LONGITUDE", "ESTYMD", "RUNDATE", "SERVTYPE", "SERVTYPE_DESC", "BKCLASS",
];

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

function isoDate(value) {
  const raw = String(value ?? "").trim();
  let match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) return `${match[3]}-${match[1]}-${match[2]}`;
  match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function zip5(value) {
  const source = digits(value);
  if (!source || source.length > 5) return null;
  const result = source.padStart(5, "0");
  return /^\d{5}$/.test(result) ? result : null;
}

function point(latitudeValue, longitudeValue) {
  if (latitudeValue === null || latitudeValue === undefined || String(latitudeValue).trim() === ""
    || longitudeValue === null || longitudeValue === undefined || String(longitudeValue).trim() === "") return null;
  const latitude = Number(latitudeValue);
  const longitude = Number(longitudeValue);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { type: "Point", coordinates: [longitude, latitude], coordinate_reference_system: "EPSG:4326" };
}

function address(source) {
  const zipCode = zip5(source.ZIP);
  const street = text(source.ADDRESS);
  const city = text(source.CITY);
  const state = text(source.STALP)?.toUpperCase() ?? null;
  const stateCountyFips = digits(source.STCNTY);
  if (!zipCode || !street || !city || !/^[A-Z]{2}$/.test(state ?? "")) return null;
  return {
    street,
    unit_or_additional: text(source.ADDRESS2),
    city,
    state,
    zip_code: zipCode,
    postal_code: zipCode,
    zip4: null,
    county_name: text(source.COUNTY),
    state_county_fips: stateCountyFips ? stateCountyFips.padStart(5, "0") : null,
    country: "US",
  };
}

function geography(zipCode, baselineByZip) {
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
    source_id: "fdic-bankfind-current-structure",
    source_release_id: context.sourceReleaseId,
    source_record_id: sourceRecordId,
    ingest_run_id: context.runId,
    transformation_version: FDIC_TRANSFORMATION_VERSION,
    policy_id: "fdic-bankfind",
  };
}

export function normalizeFdicInstitution(source, context) {
  const certificate = digits(source.CERT);
  const uniqueNumber = digits(source.UNINUM);
  if (!certificate || !uniqueNumber || !text(source.NAME)) throw new Error("missing-institution-identity");
  if (Number(source.ACTIVE) !== 1 || Number(source.INACTIVE) !== 0) throw new Error("institution-not-active");
  const headquartersAddress = address(source);
  const sourceRecordId = `institution:${certificate}`;
  const identifiers = [
    { type: "fdic_certificate", value: certificate, source_field: "CERT" },
    { type: "fdic_unique_number", value: uniqueNumber, source_field: "UNINUM" },
    text(source.LEI) ? { type: "legal_entity_identifier", value: text(source.LEI), source_field: "LEI" } : null,
    digits(source.FED_RSSD) ? { type: "federal_reserve_rssd", value: digits(source.FED_RSSD), source_field: "FED_RSSD" } : null,
  ].filter(Boolean);
  return {
    schema_version: FDIC_SCHEMA_VERSION,
    normalized_record_id: `fdic-bankfind:${sourceRecordId}`,
    entity_candidates: { organization_id: `organization:fdic_cert_${certificate}`, identity_status: "provisional" },
    external_identifiers: identifiers,
    legal_name: text(source.NAME),
    headquarters: headquartersAddress ? {
      address: headquartersAddress,
      location: point(source.LATITUDE, source.LONGITUDE),
      geography: geography(headquartersAddress.zip_code, context.baselineByZip),
    } : null,
    website: text(source.WEBADDR),
    institution_class: { code: text(source.BKCLASS), chartering_agency: text(source.CHRTAGNT), primary_regulator: text(source.REGAGNT) },
    minority_depository_status: { code: text(source.MDI_STATUS_CODE), description: text(source.MDI_STATUS_DESC) },
    reported_office_count: Number.isFinite(Number(source.OFFICES)) ? Number(source.OFFICES) : null,
    operating_dates: {
      established_date: isoDate(source.ESTYMD),
      insured_from: isoDate(source.INSDATE),
      insured_through: String(source.ENDEFYMD ?? "").includes("9999") ? null : isoDate(source.ENDEFYMD),
      last_updated: isoDate(source.DATEUPDT),
      source_run_date: isoDate(source.RUNDATE),
    },
    source_status: {
      value: "fdic-active-insured-institution-as-of-index",
      scope: "ACTIVE=1 and INACTIVE=0 in the pinned FDIC institutions index; not a general statement about every service, office, or public-access condition",
      observed_at: context.sourceUpdatedAt,
    },
    observed_at: context.retrievedAt,
    provenance: provenance(context, sourceRecordId),
    export_policy: "public",
  };
}

export function normalizeFdicLocation(source, context) {
  const certificate = digits(source.CERT);
  const uniqueNumber = digits(source.UNINUM);
  const institutionUniqueNumber = digits(source.FI_UNINUM);
  if (!text(source.STALP) && ["", "0", "00"].includes(String(source.STCNTY ?? "").trim())) throw new Error("location-outside-us");
  const locationAddress = address(source);
  if (!certificate || !uniqueNumber || !institutionUniqueNumber || !locationAddress) throw new Error("missing-location-identity-or-address");
  if (!context.activeCertificates?.has(certificate)) throw new Error("location-institution-not-active");
  const sourceRecordId = `location:${uniqueNumber}`;
  return {
    schema_version: FDIC_SCHEMA_VERSION,
    normalized_record_id: `fdic-bankfind:${sourceRecordId}`,
    entity_candidates: {
      organization_id: `organization:fdic_cert_${certificate}`,
      physical_site_id: `site:fdic_location_${uniqueNumber}`,
      establishment_id: `establishment:fdic_location_${uniqueNumber}`,
      identity_status: "provisional",
    },
    external_identifiers: [
      { type: "fdic_location_unique_number", value: uniqueNumber, source_field: "UNINUM" },
      { type: "fdic_certificate", value: certificate, source_field: "CERT" },
      { type: "fdic_institution_unique_number", value: institutionUniqueNumber, source_field: "FI_UNINUM" },
    ],
    institution_name: text(source.NAME),
    office_name: text(source.OFFNAME),
    office_number: text(source.OFFNUM),
    main_office: Number(source.MAINOFF) === 1,
    address: locationAddress,
    location: point(source.LATITUDE, source.LONGITUDE),
    geography: geography(locationAddress.zip_code, context.baselineByZip),
    service_type: { code: Number.isFinite(Number(source.SERVTYPE)) ? Number(source.SERVTYPE) : null, description: text(source.SERVTYPE_DESC) },
    institution_class_code: text(source.BKCLASS),
    established_date: isoDate(source.ESTYMD),
    source_run_date: isoDate(source.RUNDATE),
    source_status: {
      value: "fdic-current-location-for-active-institution-as-of-index",
      scope: "Present in the pinned current FDIC locations index and joined to an ACTIVE=1 institution; not independent confirmation of public access, current hours, or every offered service",
      observed_at: context.sourceUpdatedAt,
    },
    observed_at: context.retrievedAt,
    provenance: provenance(context, sourceRecordId),
    export_policy: "public",
  };
}

function assertAllowedUrl(urlValue) {
  const url = new URL(urlValue);
  if (url.protocol !== "https:" || url.hostname !== "api.fdic.gov" || !["/banks/institutions", "/banks/locations"].includes(url.pathname)) {
    throw new Error(`Disallowed FDIC URL ${url.origin}${url.pathname}.`);
  }
  return url;
}

async function requestJson(urlValue, { fetchImpl, retries = 3 }) {
  const url = assertAllowedUrl(urlValue);
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchImpl(url, { headers: { Accept: "application/json", "User-Agent": "CoTive-Collector/0.1" }, redirect: "error", signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      const payload = await response.json();
      if (!Number.isInteger(payload.meta?.total) || !payload.meta?.index?.name || !Array.isArray(payload.data)) throw new Error("FDIC response has no coherent metadata or data array.");
      return payload;
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
      await new Promise((resolve) => setTimeout(resolve, 500 * (2 ** attempt)));
    }
  }
  throw lastError;
}

function endpointUrl(endpoint, { fields, filter = null, limit, offset, sortBy }) {
  const url = new URL(`${FDIC_API_ROOT}/${endpoint}`);
  if (filter) url.searchParams.set("filters", filter);
  url.searchParams.set("fields", fields.join(","));
  url.searchParams.set("sort_by", sortBy);
  url.searchParams.set("sort_order", "ASC");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("format", "json");
  return url.toString();
}

function sameIndex(left, right) {
  return left?.name === right?.name && left?.createTimestamp === right?.createTimestamp;
}

async function acquireEndpoint({ endpoint, fields, filter, sortBy, pageSize, fetchImpl, consume, logger, firstPage = null }) {
  const first = firstPage ?? await requestJson(endpointUrl(endpoint, { fields, filter, limit: pageSize, offset: 0, sortBy }), { fetchImpl });
  const expectedTotal = first.meta.total;
  const expectedIndex = first.meta.index;
  let acquired = 0;
  for (let offset = 0; offset < expectedTotal; offset += pageSize) {
    const page = offset === 0 ? first : await requestJson(endpointUrl(endpoint, { fields, filter, limit: pageSize, offset, sortBy }), { fetchImpl });
    if (page.meta.total !== expectedTotal || !sameIndex(page.meta.index, expectedIndex)) throw new Error(`FDIC ${endpoint} index changed during acquisition.`);
    const expectedPageCount = Math.min(pageSize, expectedTotal - offset);
    if (page.data.length !== expectedPageCount) throw new Error(`FDIC ${endpoint} page at offset ${offset} returned ${page.data.length} of ${expectedPageCount} records.`);
    for (const wrapper of page.data) {
      await consume(wrapper);
      acquired += 1;
    }
    logger(`Acquired ${acquired.toLocaleString("en-US")}/${expectedTotal.toLocaleString("en-US")} FDIC ${endpoint}.`);
  }
  const after = await requestJson(endpointUrl(endpoint, { fields, filter, limit: 1, offset: 0, sortBy }), { fetchImpl });
  if (after.meta.total !== expectedTotal || !sameIndex(after.meta.index, expectedIndex)) throw new Error(`FDIC ${endpoint} index changed before publication.`);
  return { total: expectedTotal, index: expectedIndex };
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
  const buffer = await readFile(path.join(path.dirname(manifestPath), artifact.path));
  if (buffer.length !== artifact.bytes || sha256(buffer) !== artifact.sha256) throw new Error("Census ZBP coverage checksum failed.");
  const rows = buffer.toString("utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
  return { rows, byZip: new Map(rows.map((row) => [row.zip_code, row])), manifest, manifestSha256: sha256(manifestBuffer) };
}

function buildZipCoverage(baselineRows, countsByZip, context) {
  const baselineByZip = new Map(baselineRows.map((row) => [row.zip_code, row]));
  const zipCodes = [...new Set([...baselineByZip.keys(), ...countsByZip.keys()])].sort();
  return zipCodes.map((zipCode) => {
    const baseline = baselineByZip.get(zipCode);
    const counts = countsByZip.get(zipCode) ?? { locations: 0, main_offices: 0, branches: 0 };
    return {
      schema_version: FDIC_SCHEMA_VERSION,
      zip_code: zipCode,
      fdic_current_location_snapshot: {
        status: counts.locations ? "published-current-active-institution-locations" : "no-location-in-current-source-snapshot",
        location_count: counts.locations,
        main_office_count: counts.main_offices,
        branch_count: counts.branches,
        source_release_id: context.sourceReleaseId,
        source_updated_at: context.sourceUpdatedAt,
      },
      current_usps_validity: baseline?.current_usps_validity ?? { status: "unverified", reason: "ZIP appears in FDIC locations but is outside the current ZBP/ZCTA union." },
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

export async function buildFdicBankfind({
  outputRoot,
  zbpPointer,
  pageSize = 10_000,
  minimumInstitutions = 3_000,
  minimumLocations = 60_000,
  fetchImpl = globalThis.fetch,
  logger = console.log,
  now = () => new Date(),
} = {}) {
  if (!outputRoot || !zbpPointer) throw new Error("outputRoot and zbpPointer are required.");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 10_000) throw new Error("pageSize must be from 1 through 10000.");
  const retrievedAt = now().toISOString();
  const runId = randomUUID();
  const baseline = await loadZbpBaseline(zbpPointer);
  const releaseId = `fdic-bankfind-${releaseTimestamp(retrievedAt)}-${runId.slice(0, 8)}`;
  const stagingDirectory = path.join(outputRoot, ".staging", runId);
  await mkdir(stagingDirectory, { recursive: true });
  const rawInstitutionWriter = await openGzipWriter(stagingDirectory, "source/institutions.jsonl.gz");
  const rawLocationWriter = await openGzipWriter(stagingDirectory, "source/locations.jsonl.gz");
  const quarantineWriter = await openGzipWriter(stagingDirectory, "quarantine/records.jsonl.gz");
  const institutionWriters = new Map();
  const locationWriters = new Map();
  for (const prefix of "0123456789") {
    institutionWriters.set(prefix, await openGzipWriter(stagingDirectory, `derived/institutions/cert-prefix=${prefix}.jsonl.gz`));
    locationWriters.set(prefix, await openGzipWriter(stagingDirectory, `derived/locations/zip-prefix=${prefix}.jsonl.gz`));
  }

  const activeCertificates = new Set();
  const institutionIds = new Set();
  const locationIds = new Set();
  const countsByZip = new Map();
  const stateCounts = new Map();
  const serviceTypeCounts = new Map();
  let acceptedInstitutions = 0;
  let acceptedLocations = 0;
  let quarantined = 0;
  let excludedLocations = 0;
  let excludedOutsideUnitedStates = 0;
  let institutionIndex;
  let locationIndex;

  const institutionFirstPage = await requestJson(endpointUrl("institutions", { fields: INSTITUTION_FIELDS, filter: "ACTIVE:1", limit: pageSize, offset: 0, sortBy: "CERT" }), { fetchImpl });
  const locationFirstPage = await requestJson(endpointUrl("locations", { fields: LOCATION_FIELDS, filter: null, limit: pageSize, offset: 0, sortBy: "UNINUM" }), { fetchImpl });
  const sourceUpdatedAt = new Date(Math.max(Date.parse(institutionFirstPage.meta.index.createTimestamp), Date.parse(locationFirstPage.meta.index.createTimestamp))).toISOString();
  const sourceReleaseId = `fdic-bankfind-${sha256(JSON.stringify([institutionFirstPage.meta.index, locationFirstPage.meta.index])).slice(0, 16)}`;
  const context = { runId, retrievedAt, sourceUpdatedAt, sourceReleaseId, baselineByZip: baseline.byZip, activeCertificates };

  const pendingInstitutionRecords = [];
  const institutionAcquisition = await acquireEndpoint({
    endpoint: "institutions",
    fields: INSTITUTION_FIELDS,
    filter: "ACTIVE:1",
    sortBy: "CERT",
    pageSize,
    fetchImpl,
    logger,
    firstPage: institutionFirstPage,
    consume: async (wrapper) => {
      await writeGzipRecord(rawInstitutionWriter, wrapper);
      pendingInstitutionRecords.push(wrapper.data);
    },
  });
  institutionIndex = institutionAcquisition.index;
  for (const source of pendingInstitutionRecords) {
    try {
      const normalized = normalizeFdicInstitution(source, context);
      assertNormalizedUsPostalFieldsDeep(normalized, "fdic institution");
      const certificate = normalized.external_identifiers[0].value;
      if (institutionIds.has(normalized.normalized_record_id)) throw new Error("duplicate-institution-id");
      institutionIds.add(normalized.normalized_record_id);
      activeCertificates.add(certificate);
      await writeGzipRecord(institutionWriters.get(certificate[0]), normalized);
      acceptedInstitutions += 1;
    } catch (error) {
      await writeGzipRecord(quarantineWriter, { source_type: "institution", source_id: source.CERT ?? null, reason: error.message });
      quarantined += 1;
    }
  }
  if (acceptedInstitutions < minimumInstitutions) throw new Error(`FDIC institution count ${acceptedInstitutions} is below the ${minimumInstitutions} quality floor.`);

  const locationAcquisition = await acquireEndpoint({
    endpoint: "locations",
    fields: LOCATION_FIELDS,
    filter: null,
    sortBy: "UNINUM",
    pageSize,
    fetchImpl,
    logger,
    firstPage: locationFirstPage,
    consume: async (wrapper) => {
      await writeGzipRecord(rawLocationWriter, wrapper);
      try {
        const normalized = normalizeFdicLocation(wrapper.data, context);
        assertNormalizedUsPostalFieldsDeep(normalized, "fdic location");
        if (locationIds.has(normalized.normalized_record_id)) throw new Error("duplicate-location-id");
        locationIds.add(normalized.normalized_record_id);
        const zipCode = normalized.address.zip_code;
        await writeGzipRecord(locationWriters.get(zipCode[0]), normalized);
        const counts = countsByZip.get(zipCode) ?? { locations: 0, main_offices: 0, branches: 0 };
        counts.locations += 1;
        if (normalized.main_office) counts.main_offices += 1;
        else counts.branches += 1;
        countsByZip.set(zipCode, counts);
        stateCounts.set(normalized.address.state, (stateCounts.get(normalized.address.state) ?? 0) + 1);
        const service = normalized.service_type.description ?? String(normalized.service_type.code ?? "Unclassified");
        serviceTypeCounts.set(service, (serviceTypeCounts.get(service) ?? 0) + 1);
        acceptedLocations += 1;
      } catch (error) {
        if (error.message === "location-institution-not-active") excludedLocations += 1;
        else if (error.message === "location-outside-us") excludedOutsideUnitedStates += 1;
        else {
          await writeGzipRecord(quarantineWriter, { source_type: "location", source_id: wrapper.data?.UNINUM ?? null, certificate: wrapper.data?.CERT ?? null, reason: error.message });
          quarantined += 1;
        }
      }
    },
  });
  locationIndex = locationAcquisition.index;
  if (acceptedLocations < minimumLocations) throw new Error(`FDIC location count ${acceptedLocations} is below the ${minimumLocations} quality floor.`);
  if (quarantined / Math.max(1, institutionAcquisition.total + locationAcquisition.total) > 0.005) throw new Error("FDIC quarantine rate exceeds 0.5%.");

  const finalSourceUpdatedAt = new Date(Math.max(Date.parse(institutionIndex.createTimestamp), Date.parse(locationIndex.createTimestamp))).toISOString();
  const finalSourceReleaseId = `fdic-bankfind-${sha256(JSON.stringify([institutionIndex, locationIndex])).slice(0, 16)}`;
  if (finalSourceReleaseId !== context.sourceReleaseId || finalSourceUpdatedAt !== context.sourceUpdatedAt) throw new Error("FDIC source indexes changed after snapshot pinning.");

  const artifacts = [];
  artifacts.push(...await closeGzipWriters([rawInstitutionWriter], "fdic-source-institution-jsonl-gzip"));
  artifacts.push(...await closeGzipWriters([rawLocationWriter], "fdic-source-location-jsonl-gzip"));
  artifacts.push(...await closeGzipWriters([...institutionWriters.values()], "normalized-fdic-institution-jsonl-gzip"));
  artifacts.push(...await closeGzipWriters([...locationWriters.values()], "normalized-fdic-location-jsonl-gzip"));
  artifacts.push(...await closeGzipWriters([quarantineWriter], "quarantine-jsonl-gzip"));

  const coverageRows = buildZipCoverage(baseline.rows, countsByZip, { sourceReleaseId: finalSourceReleaseId, sourceUpdatedAt: finalSourceUpdatedAt });
  artifacts.push(await writeArtifact(stagingDirectory, "derived/zip-coverage.jsonl", jsonLines(coverageRows), { artifact_type: "fdic-zip-coverage-jsonl", record_count: coverageRows.length }));
  const summary = {
    states_and_territories: Object.fromEntries([...stateCounts].sort(([left], [right]) => left.localeCompare(right))),
    service_types: Object.fromEntries([...serviceTypeCounts].sort(([left], [right]) => left.localeCompare(right))),
  };
  artifacts.push(await writeArtifact(stagingDirectory, "derived/source-summary.json", json(summary), { artifact_type: "fdic-source-summary" }));
  artifacts.push(await writeArtifact(stagingDirectory, "source/indexes.json", json({ institutions: institutionIndex, locations: locationIndex }), { artifact_type: "fdic-source-index-metadata" }));

  const manifest = {
    schema_version: FDIC_SCHEMA_VERSION,
    dataset_id: "fdic-bankfind",
    connector: { id: "fdic-bankfind", version: "1.0.1" },
    release_id: releaseId,
    run_id: runId,
    retrieved_at: retrievedAt,
    source_updated_at: finalSourceUpdatedAt,
    source_release_id: finalSourceReleaseId,
    status: "published",
    complete_current_structure_snapshot: true,
    coverage: {
      source_institutions: institutionAcquisition.total,
      accepted_active_institutions: acceptedInstitutions,
      source_locations: locationAcquisition.total,
      accepted_current_locations: acceptedLocations,
      excluded_locations_without_active_institution: excludedLocations,
      excluded_locations_outside_united_states: excludedOutsideUnitedStates,
      quarantined_records: quarantined,
      source_zip_codes: countsByZip.size,
      zip_union_records: coverageRows.length,
      states_and_territories: stateCounts.size,
      service_types: serviceTypeCounts.size,
    },
    dependencies: [
      { dataset_id: baseline.manifest.dataset_id, release_id: baseline.manifest.release_id, manifest_sha256: baseline.manifestSha256 },
      baseline.manifest.geography_dependency,
    ],
    source: {
      publisher: "Federal Deposit Insurance Corporation",
      api_documentation: "https://api.fdic.gov/banks/docs/",
      institutions_endpoint: `${FDIC_API_ROOT}/institutions`,
      locations_endpoint: `${FDIC_API_ROOT}/locations`,
      api_key_used: false,
      policy_profile: "config/source-policies/fdic-bankfind.json",
    },
    limitations: [
      "The source covers FDIC-insured banking institutions and their current indexed locations, not all financial businesses or all U.S. businesses.",
      "A current location record does not independently confirm public access, current hours, or every service offered at the address.",
      "Institution and location identities are provisional until cross-source entity resolution is applied.",
      "Locations are joined only to institutions returned by the pinned ACTIVE:1 institution snapshot.",
      "Foreign offices represented with no U.S. state and state/county code 00 are counted and excluded from the U.S. location layer.",
      "Current USPS ZIP validity remains unverified until an authoritative denominator is integrated.",
    ],
    artifacts: artifacts.sort((left, right) => left.path.localeCompare(right.path)),
  };
  await writeArtifact(stagingDirectory, "manifest.json", json(manifest));
  const releaseDirectory = path.join(outputRoot, "releases", releaseId);
  await mkdir(path.dirname(releaseDirectory), { recursive: true });
  await rename(stagingDirectory, releaseDirectory);
  const pointerPath = path.join(outputRoot, "current.json");
  const temporaryPointer = `${pointerPath}.tmp-${runId}`;
  await writeFile(temporaryPointer, json({ dataset_id: manifest.dataset_id, release_id: releaseId, manifest: `releases/${releaseId}/manifest.json`, updated_at: retrievedAt }));
  await rename(temporaryPointer, pointerPath);
  if (!(await stat(releaseDirectory)).isDirectory()) throw new Error("Published FDIC release is not a directory.");
  return { manifest, releaseDirectory, pointerPath };
}

async function forEachGzipRecord(filename, consume) {
  const lines = createInterface({ input: createReadStream(filename).pipe(createGunzip()), crlfDelay: Infinity });
  let count = 0;
  for await (const line of lines) {
    if (!line) continue;
    consume(JSON.parse(line));
    count += 1;
  }
  return count;
}

export async function verifyFdicBankfind(manifestPath) {
  const absoluteManifestPath = path.resolve(manifestPath);
  const releaseDirectory = path.dirname(absoluteManifestPath);
  const manifest = JSON.parse(await readFile(absoluteManifestPath, "utf8"));
  const failures = [];
  if (manifest.dataset_id !== "fdic-bankfind" || manifest.status !== "published" || !manifest.complete_current_structure_snapshot) failures.push({ path: "manifest.json", reason: "unexpected or incomplete manifest" });
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
  const institutionArtifacts = manifest.artifacts?.filter((item) => item.artifact_type === "normalized-fdic-institution-jsonl-gzip") ?? [];
  const locationArtifacts = manifest.artifacts?.filter((item) => item.artifact_type === "normalized-fdic-location-jsonl-gzip") ?? [];
  if (institutionArtifacts.length !== 10) failures.push({ path: "manifest.json", reason: "expected 10 normalized institution partitions" });
  if (locationArtifacts.length !== 10) failures.push({ path: "manifest.json", reason: "expected 10 normalized location partitions" });
  for (const [artifactType, expectedCount] of [
    ["fdic-source-institution-jsonl-gzip", manifest.coverage?.source_institutions],
    ["fdic-source-location-jsonl-gzip", manifest.coverage?.source_locations],
    ["quarantine-jsonl-gzip", manifest.coverage?.quarantined_records],
  ]) {
    const matches = manifest.artifacts?.filter((item) => item.artifact_type === artifactType) ?? [];
    if (matches.length !== 1) failures.push({ path: "manifest.json", reason: `expected one ${artifactType} artifact` });
    else {
      try {
        const count = await forEachGzipRecord(path.join(releaseDirectory, matches[0].path), () => {});
        if (count !== matches[0].record_count || count !== expectedCount) failures.push({ path: matches[0].path, reason: `${artifactType} line count mismatch` });
      } catch (error) {
        failures.push({ path: matches[0].path, reason: `${artifactType} parse failed: ${error.message}` });
      }
    }
  }
  const certificates = new Set();
  let institutions = 0;
  for (const artifact of institutionArtifacts) {
    try {
      const count = await forEachGzipRecord(path.join(releaseDirectory, artifact.path), (record) => {
        const certificate = record.external_identifiers?.find((item) => item.type === "fdic_certificate")?.value;
        if (!certificate || certificates.has(certificate) || record.source_status?.value !== "fdic-active-insured-institution-as-of-index" || !record.provenance?.source_record_id || record.export_policy !== "public") throw new Error(`invalid institution ${certificate}`);
        certificates.add(certificate);
      });
      if (count !== artifact.record_count) failures.push({ path: artifact.path, reason: "institution line count mismatch" });
      institutions += count;
    } catch (error) {
      failures.push({ path: artifact.path, reason: `institution validation failed: ${error.message}` });
    }
  }
  if (institutions !== manifest.coverage?.accepted_active_institutions) failures.push({ path: "manifest.json", reason: "institution count mismatch" });
  const locationIds = new Set();
  let locations = 0;
  for (const artifact of locationArtifacts) {
    try {
      const partition = artifact.path.match(/zip-prefix=(\d)/)?.[1];
      const count = await forEachGzipRecord(path.join(releaseDirectory, artifact.path), (record) => {
        const certificate = record.external_identifiers?.find((item) => item.type === "fdic_certificate")?.value;
        if (!certificates.has(certificate) || locationIds.has(record.normalized_record_id) || record.address?.zip_code?.[0] !== partition || record.source_status?.value !== "fdic-current-location-for-active-institution-as-of-index" || !record.provenance?.source_record_id || record.export_policy !== "public") throw new Error(`invalid location ${record.normalized_record_id}`);
        locationIds.add(record.normalized_record_id);
      });
      if (count !== artifact.record_count) failures.push({ path: artifact.path, reason: "location line count mismatch" });
      locations += count;
    } catch (error) {
      failures.push({ path: artifact.path, reason: `location validation failed: ${error.message}` });
    }
  }
  if (locations !== manifest.coverage?.accepted_current_locations) failures.push({ path: "manifest.json", reason: "location count mismatch" });
  const zipArtifact = manifest.artifacts?.find((item) => item.artifact_type === "fdic-zip-coverage-jsonl");
  try {
    const rows = (await readFile(path.join(releaseDirectory, zipArtifact.path), "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse);
    if (rows.length !== zipArtifact.record_count || rows.length !== manifest.coverage.zip_union_records || new Set(rows.map((row) => row.zip_code)).size !== rows.length) throw new Error("ZIP row count or uniqueness mismatch");
    if (rows.reduce((sum, row) => sum + row.fdic_current_location_snapshot.location_count, 0) !== locations) throw new Error("ZIP location counts do not reconcile");
    if (rows.some((row) => row.current_usps_validity?.status !== "unverified")) throw new Error("unsupported USPS validity claim");
  } catch (error) {
    failures.push({ path: zipArtifact?.path ?? "derived/zip-coverage.jsonl", reason: `ZIP validation failed: ${error.message}` });
  }
  if (failures.length) {
    const error = new Error(`FDIC BankFind release verification failed for ${failures.length} check(s).`);
    error.failures = failures;
    throw error;
  }
  return { dataset_id: manifest.dataset_id, release_id: manifest.release_id, source_release_id: manifest.source_release_id, artifact_count: manifest.artifacts.length, coverage: manifest.coverage };
}
