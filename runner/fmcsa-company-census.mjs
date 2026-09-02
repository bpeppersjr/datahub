import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { finished, pipeline } from "node:stream/promises";
import { createInterface } from "node:readline";
import { createGunzip, createGzip } from "node:zlib";
import { parse } from "csv-parse";
import { assertNormalizedUsPostalFieldsDeep } from "./normalized-us-postal-code.mjs";

export const FMCSA_SCHEMA_VERSION = "1.0.0";
export const FMCSA_TRANSFORMATION_VERSION = "fmcsa-company-census@1.0.2";
export const FMCSA_DATASET_ID = "az4n-8mr2";
export const FMCSA_METADATA_URL = `https://data.transportation.gov/api/views/${FMCSA_DATASET_ID}`;
export const FMCSA_RESOURCE_URL = `https://data.transportation.gov/resource/${FMCSA_DATASET_ID}`;
export const FMCSA_SOURCE_PAGE = "https://www.fmcsa.dot.gov/registration/fmcsa-data-dissemination-program";
export const FMCSA_DATASET_PAGE = `https://data.transportation.gov/w/${FMCSA_DATASET_ID}/m7rw-edbr`;
export const FMCSA_DICTIONARY_FILENAME = "MCMIS Company Census Data Dictionary(Rev08)2026-01-23.pdf";
export const FMCSA_DICTIONARY_ASSET_ID = "05274d1b-8109-4409-a4ef-237e12f870c9";

export const FMCSA_SELECTED_COLUMNS = [
  ["mcs150_date", "text"],
  ["add_date", "text"],
  ["status_code", "text"],
  ["dot_number", "number"],
  ["carrier_operation", "text"],
  ["business_org_id", "text"],
  ["business_org_desc", "text"],
  ["carship", "text"],
  ["classdef", "text"],
  ["legal_name", "text"],
  ["dba_name", "text"],
  ["phy_street", "text"],
  ["phy_city", "text"],
  ["phy_country", "text"],
  ["phy_state", "text"],
  ["phy_zip", "text"],
  ["phy_cnty", "text"],
  ["phy_omc_region", "text"],
  ["undeliv_phy", "text"],
  ["hm_ind", "text"],
  ["docket1prefix", "text"],
  ["docket1", "text"],
  ["docket1_status_code", "text"],
  ["docket2prefix", "text"],
  ["docket2", "text"],
  ["docket2_status_code", "text"],
  ["docket3prefix", "text"],
  ["docket3", "text"],
  ["docket3_status_code", "text"],
];

export const FMCSA_SCHEMA_FINGERPRINT = "1419b8d33d85eee978015bcd6fa68e99102697aeb7c57cdc0778cfc9b8f71867";
export const FMCSA_EXPORT_WHERE = "status_code='A' AND phy_country='US'";
export const FMCSA_EXPORT_ORDER = "dot_number";

const US_STATE_AND_TERRITORY_CODES = new Set([
  "AL", "AK", "AS", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "GU", "HI", "ID", "IL", "IN", "IA", "KS", "KY",
  "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "MP", "OH", "OK",
  "OR", "PA", "PR", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "VI", "WA", "WV", "WI", "WY",
]);

const CARRIER_OPERATION_LABELS = new Map([
  ["A", "interstate-carrier"],
  ["B", "intrastate-hazardous-materials-carrier"],
  ["C", "intrastate-non-hazardous-materials-carrier"],
]);

const CARSHIP_LABELS = new Map([
  ["B", "broker"],
  ["C", "carrier"],
  ["F", "freight-forwarder"],
  ["I", "intermodal-equipment-provider"],
  ["R", "registrant"],
  ["S", "shipper"],
  ["T", "cargo-tank"],
]);

const BUSINESS_ORGANIZATION_LABELS = new Map([
  ["1", "individual"],
  ["2", "partnership"],
  ["3", "corporation"],
]);

const FORBIDDEN_NORMALIZED_KEYS = new Set([
  "phone", "fax", "cell_phone", "email", "email_address", "company_officer_1", "company_officer_2", "duns_number",
  "mailing_address", "mailing_street", "mailing_city", "mailing_state", "mailing_zip", "crash_total", "review_date",
]);

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

function selectedColumnFingerprint(columns = FMCSA_SELECTED_COLUMNS) {
  return sha256(columns.map(([name, type]) => `${name}:${type}`).join("\u0000"));
}

function postalCode(value) {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d{5})(?:-?(\d{4}))?$/);
  if (!match || match[1] === "00000") return null;
  return { zip_code: match[1], postal_code: match[1], zip4: match[2] ?? null };
}

function sourceDate(value, withOptionalTime = false) {
  const raw = text(value);
  if (!raw) return null;
  const pattern = withOptionalTime ? /^(\d{4})(\d{2})(\d{2})(?:\s+(\d{2})(\d{2}))?$/ : /^(\d{4})(\d{2})(\d{2})$/;
  const match = raw.match(pattern);
  if (!match) return { raw, iso_date: null, warning: "unparsed-source-date" };
  const date = `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return { raw, iso_date: null, warning: "invalid-source-date" };
  return {
    raw,
    iso_date: date,
    reported_time: match[4] ? `${match[4]}:${match[5]}` : null,
    warning: match[4] ? "source-time-zone-not-specified" : null,
  };
}

function semicolonList(value) {
  return [...new Set(String(value ?? "").split(";").map((item) => item.trim()).filter(Boolean))];
}

function codedList(value, labels) {
  return semicolonList(value).map((code) => ({
    code,
    label: labels.get(code) ?? null,
    warning: labels.has(code) ? null : "source-code-not-defined-in-current-published-data-dictionary",
  }));
}

function dockets(source) {
  const result = [];
  for (const index of [1, 2, 3]) {
    const prefix = text(source[`docket${index}prefix`])?.toUpperCase() ?? null;
    const number = text(source[`docket${index}`]);
    const statusCode = text(source[`docket${index}_status_code`])?.toUpperCase() ?? null;
    if (!prefix && !number && !statusCode) continue;
    result.push({
      prefix,
      number,
      formatted_identifier: prefix && number ? `${prefix}${number}` : null,
      status_code: statusCode,
    });
  }
  return result;
}

function geography(zipCode, context) {
  const baseline = context.baselineByZip?.get(zipCode);
  return {
    zip_code: zipCode,
    zcta_match_status: baseline?.geography?.status ?? "no-2020-zcta-polygon",
    zcta_geo_id: baseline?.geography?.geo_id ?? null,
    zcta_geoid: baseline?.geography?.geoid ?? null,
    zcta_geometry_file: baseline?.geography?.geometry_file ?? null,
  };
}

function provenance(context, dotNumber) {
  return {
    source_id: "fmcsa-company-census-active-us-principal-office",
    source_release_id: context.sourceReleaseId,
    source_record_id: `usdot:${dotNumber}`,
    ingest_run_id: context.runId,
    transformation_version: FMCSA_TRANSFORMATION_VERSION,
    policy_id: "fmcsa-company-census",
  };
}

export function normalizeFmcsaCompany(source, context) {
  if (text(source.status_code)?.toUpperCase() !== "A") throw new Error("registration-not-fmcsa-active");
  if (text(source.phy_country)?.toUpperCase() !== "US") throw new Error("principal-office-outside-us-and-territories");
  const dotNumber = text(source.dot_number);
  if (!dotNumber || !/^\d+$/.test(dotNumber) || dotNumber === "0") throw new Error("invalid-usdot-number");
  const legalName = text(source.legal_name);
  if (!legalName) throw new Error("missing-legal-name");
  if (text(source.undeliv_phy)?.toUpperCase() === "U") throw new Error("source-reported-undeliverable-physical-address");
  const state = text(source.phy_state)?.toUpperCase() ?? null;
  if (!US_STATE_AND_TERRITORY_CODES.has(state)) throw new Error("invalid-us-state-or-territory");
  const postal = postalCode(source.phy_zip);
  const street = text(source.phy_street);
  const city = text(source.phy_city);
  if (!postal || !street || !city) throw new Error("missing-or-invalid-principal-office-address");
  const carrierOperationCode = text(source.carrier_operation)?.toUpperCase() ?? null;
  const businessOrganizationCode = text(source.business_org_id);
  const authorityDockets = dockets(source);
  const externalIdentifiers = [{ type: "usdot_number", value: dotNumber, source_field: "DOT_NUMBER" }];
  const docketIdentifiers = new Set();
  for (const docket of authorityDockets) {
    if (docket.formatted_identifier && !docketIdentifiers.has(docket.formatted_identifier)) {
      docketIdentifiers.add(docket.formatted_identifier);
      externalIdentifiers.push({ type: "fmcsa_docket_number", value: docket.formatted_identifier, source_field: "DOCKET1PREFIX|DOCKET1 through DOCKET3PREFIX|DOCKET3" });
    }
  }
  return {
    schema_version: FMCSA_SCHEMA_VERSION,
    normalized_record_id: `fmcsa-company-census:usdot:${dotNumber}`,
    entity_candidates: {
      physical_site_id: `site:fmcsa_usdot_${dotNumber}_principal_office`,
      establishment_id: `establishment:fmcsa_usdot_${dotNumber}_principal_office`,
      identity_status: "provisional",
      organization_inference: "not-created-because-source-entity-may-be-an-individual-and-business-organization-type-is-review-only-and-incomplete",
    },
    external_identifiers: externalIdentifiers,
    legal_name: legalName,
    dba_name: text(source.dba_name),
    address: {
      street,
      unit_or_additional: null,
      city,
      state,
      zip_code: postal.zip_code,
      postal_code: postal.postal_code,
      zip4: postal.zip4,
      reported_county_code: text(source.phy_cnty),
      country: "US",
      address_role: "fmcsa-reported-physical-location-of-principal-office",
    },
    geography: geography(postal.zip_code, context),
    registration_profile: {
      carrier_operation: carrierOperationCode ? {
        code: carrierOperationCode,
        label: CARRIER_OPERATION_LABELS.get(carrierOperationCode) ?? null,
        warning: CARRIER_OPERATION_LABELS.has(carrierOperationCode) ? null : "source-code-not-defined-in-current-published-data-dictionary",
      } : null,
      entity_roles: codedList(source.carship, CARSHIP_LABELS),
      source_classes: semicolonList(source.classdef),
      hazardous_materials_indicator: text(source.hm_ind)?.toUpperCase() === "Y" ? true : text(source.hm_ind)?.toUpperCase() === "N" ? false : null,
      business_organization_type: businessOrganizationCode ? {
        code: businessOrganizationCode,
        label: BUSINESS_ORGANIZATION_LABELS.get(businessOrganizationCode) ?? text(source.business_org_desc)?.toLowerCase() ?? null,
        completeness_warning: "source-dictionary-identifies-this-as-review-only-and-the-field-is-not-complete",
      } : null,
      fmcsa_region: text(source.phy_omc_region),
      authority_dockets: authorityDockets,
      mcs150_reported_at: sourceDate(source.mcs150_date, true),
      added_to_source_at: sourceDate(source.add_date),
    },
    source_status: {
      value: "fmcsa-active-registration-as-of-daily-source-release",
      source_code: "A",
      scope: "FMCSA defines active for this census as currently in business and subject to FMCSR/HMR, or a qualifying intrastate non-hazardous-materials carrier with a USDOT number; this is source-specific and not proof of public storefront access, parent ownership, or status outside FMCSA scope",
      source_updated_at: context.sourceUpdatedAt,
    },
    data_sensitivity: {
      public_regulatory_record: true,
      may_identify_individual_proprietor: true,
      principal_office_may_be_home_based: true,
      excluded_contact_and_officer_fields: true,
    },
    observed_at: context.retrievedAt,
    provenance: provenance(context, dotNumber),
    export_policy: "public",
  };
}

function assertAllowedUrl(urlValue, kind) {
  const url = new URL(urlValue);
  if (url.protocol !== "https:" || url.hostname !== "data.transportation.gov" || url.username || url.password || url.hash) throw new Error(`Disallowed FMCSA ${kind} source URL.`);
  const allowed = kind === "metadata"
    ? url.pathname === `/api/views/${FMCSA_DATASET_ID}` && !url.search
    : kind === "dictionary"
      ? url.pathname === `/api/views/${FMCSA_DATASET_ID}/files/${FMCSA_DICTIONARY_ASSET_ID}` && !url.search
      : url.pathname === `/resource/${FMCSA_DATASET_ID}.csv`;
  if (!allowed) throw new Error(`Disallowed FMCSA ${kind} source path ${url.pathname}.`);
  return url;
}

function exportUrl() {
  const url = new URL(`${FMCSA_RESOURCE_URL}.csv`);
  url.searchParams.set("$select", FMCSA_SELECTED_COLUMNS.map(([name]) => name).join(","));
  url.searchParams.set("$where", FMCSA_EXPORT_WHERE);
  url.searchParams.set("$order", FMCSA_EXPORT_ORDER);
  url.searchParams.set("$limit", "3000000");
  return url;
}

function dictionaryUrl() {
  return new URL(`/api/views/${FMCSA_DATASET_ID}/files/${FMCSA_DICTIONARY_ASSET_ID}`, "https://data.transportation.gov");
}

async function fetchJson(url, fetchImpl) {
  const response = await fetchImpl(url, {
    headers: { Accept: "application/json", "User-Agent": "CoTive-Collector/0.1" },
    redirect: "error",
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`FMCSA request failed with HTTP ${response.status} ${response.statusText}.`);
  return response.json();
}

function validateMetadata(metadata) {
  if (metadata?.id !== FMCSA_DATASET_ID || metadata?.name !== "Company Census File") throw new Error("Unexpected FMCSA Company Census dataset identity.");
  if (!Number.isInteger(metadata.rowsUpdatedAt) || metadata.rowsUpdatedAt < 1) throw new Error("FMCSA metadata has no valid rowsUpdatedAt timestamp.");
  const attachment = metadata.metadata?.attachments?.find((item) => item.assetId === FMCSA_DICTIONARY_ASSET_ID);
  if (!attachment || attachment.filename !== FMCSA_DICTIONARY_FILENAME) throw new Error("FMCSA Company Census data dictionary attachment changed.");
  const byName = new Map((metadata.columns ?? []).map((column) => [column.fieldName, column]));
  const selected = FMCSA_SELECTED_COLUMNS.map(([fieldName, dataTypeName]) => {
    const actual = byName.get(fieldName);
    if (!actual || actual.dataTypeName !== dataTypeName) throw new Error(`FMCSA selected schema changed at ${fieldName}.`);
    return [fieldName, dataTypeName];
  });
  const fingerprint = selectedColumnFingerprint(selected);
  if (fingerprint !== FMCSA_SCHEMA_FINGERPRINT) throw new Error(`FMCSA selected schema fingerprint is not pinned (${fingerprint}).`);
  return { fingerprint, attachment };
}

async function discoverSource(fetchImpl) {
  const metadataUrl = assertAllowedUrl(FMCSA_METADATA_URL, "metadata");
  const metadata = await fetchJson(metadataUrl, fetchImpl);
  const validated = validateMetadata(metadata);
  const countUrl = new URL(`${FMCSA_RESOURCE_URL}.json`);
  countUrl.searchParams.set("$select", "count(*) as records");
  const activeUrl = new URL(`${FMCSA_RESOURCE_URL}.json`);
  activeUrl.searchParams.set("$select", "count(*) as records");
  activeUrl.searchParams.set("$where", FMCSA_EXPORT_WHERE);
  const [countRows, activeRows] = await Promise.all([fetchJson(countUrl, fetchImpl), fetchJson(activeUrl, fetchImpl)]);
  const datasetRecords = Number(countRows?.[0]?.records);
  const activeUsRecords = Number(activeRows?.[0]?.records);
  if (!Number.isInteger(datasetRecords) || datasetRecords < 1 || !Number.isInteger(activeUsRecords) || activeUsRecords < 1 || activeUsRecords > datasetRecords) {
    throw new Error("FMCSA aggregate source counts are invalid.");
  }
  return { metadata, datasetRecords, activeUsRecords, ...validated };
}

async function acquireResponse(url, destination, fetchImpl, accept, maximumBytes) {
  const response = await fetchImpl(url, {
    headers: { Accept: accept, "User-Agent": "CoTive-Collector/0.1" },
    redirect: "error",
    signal: AbortSignal.timeout(60 * 60_000),
  });
  if (!response.ok || !response.body) throw new Error(`FMCSA acquisition failed with HTTP ${response.status} ${response.statusText}.`);
  const contentLength = Number(response.headers.get("content-length"));
  const contentEncoding = text(response.headers.get("content-encoding"))?.toLowerCase() ?? null;
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) throw new Error(`FMCSA source exceeds the ${maximumBytes} byte acquisition limit.`);
  const temporary = `${destination}.tmp-${randomUUID()}`;
  await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary, { flags: "wx" }));
  const fileStat = await stat(temporary);
  if (!fileStat.isFile() || fileStat.size < 4 || fileStat.size > maximumBytes) throw new Error(`FMCSA acquired file size ${fileStat.size} is outside its safety limit.`);
  if (Number.isFinite(contentLength) && (!contentEncoding || contentEncoding === "identity") && fileStat.size !== contentLength) {
    throw new Error("FMCSA identity-encoded download size does not match Content-Length.");
  }
  await rename(temporary, destination);
  return {
    content_type: text(response.headers.get("content-type")),
    content_encoding: contentEncoding,
    transport_content_length: Number.isFinite(contentLength) ? contentLength : null,
    decoded_file_bytes: fileStat.size,
  };
}

async function copySource(sourcePath, destination, maximumBytes) {
  const fileStat = await stat(sourcePath);
  if (!fileStat.isFile() || fileStat.size < 4 || fileStat.size > maximumBytes) throw new Error(`Local FMCSA source size ${fileStat.size} is outside its safety limit.`);
  const temporary = `${destination}.tmp-${randomUUID()}`;
  await copyFile(sourcePath, temporary);
  await rename(temporary, destination);
  return { content_type: null, content_encoding: null, transport_content_length: fileStat.size, decoded_file_bytes: fileStat.size };
}

async function assertPdf(filename) {
  const handle = await readFile(filename);
  if (handle.length < 5 || handle.subarray(0, 5).toString("ascii") !== "%PDF-") throw new Error("FMCSA data dictionary is not a PDF.");
}

async function forEachSourceRow(filename, consume) {
  let schemaFingerprint = null;
  const expectedHeaders = FMCSA_SELECTED_COLUMNS.map(([name]) => name);
  const parser = parse({
    bom: true,
    columns: (headers) => {
      schemaFingerprint = sha256(headers.join("\u0000"));
      if (headers.length !== expectedHeaders.length || headers.some((header, index) => header !== expectedHeaders[index])) {
        throw new Error(`FMCSA selected CSV schema changed (${schemaFingerprint}).`);
      }
      return headers;
    },
    skip_empty_lines: true,
    max_record_size: 200_000,
  });
  createReadStream(filename).pipe(parser);
  let records = 0;
  let priorDotNumber = null;
  for await (const row of parser) {
    const dotNumber = Number(text(row.dot_number));
    if (!Number.isSafeInteger(dotNumber) || dotNumber < 1) throw new Error("FMCSA selected source contains an invalid USDOT number.");
    if (priorDotNumber !== null && dotNumber <= priorDotNumber) throw new Error("FMCSA selected source is not strictly ordered by unique USDOT number.");
    priorDotNumber = dotNumber;
    await consume(row);
    records += 1;
  }
  if (!schemaFingerprint) throw new Error("FMCSA selected source has no header row.");
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
  return [...new Set([...baselineByZip.keys(), ...countsByZip.keys()])].sort().map((zipCode) => {
    const baseline = baselineByZip.get(zipCode);
    const count = countsByZip.get(zipCode) ?? 0;
    return {
      schema_version: FMCSA_SCHEMA_VERSION,
      zip_code: zipCode,
      fmcsa_active_registration_principal_office_snapshot: {
        status: count ? "published-active-fmcsa-principal-office-records" : "no-accepted-active-fmcsa-principal-office-in-source-snapshot",
        record_count: count,
        source_release_id: context.sourceReleaseId,
        source_updated_at: context.sourceUpdatedAt,
      },
      current_usps_validity: baseline?.current_usps_validity ?? { status: "unverified", reason: "ZIP appears in an FMCSA principal-office record but is outside the current ZBP/ZCTA union." },
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

function normalizedMetadata(sourceMetadata) {
  if (!sourceMetadata) return null;
  if (sourceMetadata.metadata) {
    validateMetadata(sourceMetadata.metadata);
    if (!Number.isInteger(sourceMetadata.datasetRecords) || !Number.isInteger(sourceMetadata.activeUsRecords)) throw new Error("Explicit FMCSA source metadata has invalid counts.");
    return { ...sourceMetadata, fingerprint: FMCSA_SCHEMA_FINGERPRINT };
  }
  const rowsUpdatedAt = Math.floor(new Date(sourceMetadata.rows_updated_at ?? "").getTime() / 1000);
  const selectedColumns = (sourceMetadata.selected_columns ?? []).map((column) => [column.field_name, column.data_type]);
  const metadata = {
    id: sourceMetadata.dataset_id,
    name: sourceMetadata.dataset_name,
    rowsUpdatedAt,
    columns: selectedColumns.map(([fieldName, dataTypeName]) => ({ fieldName, dataTypeName, name: fieldName.toUpperCase() })),
    metadata: { attachments: [{ filename: sourceMetadata.data_dictionary_filename, assetId: sourceMetadata.data_dictionary_asset_id }] },
  };
  validateMetadata(metadata);
  const datasetRecords = Number(sourceMetadata.dataset_records);
  const activeUsRecords = Number(sourceMetadata.active_us_records);
  if (!Number.isInteger(datasetRecords) || !Number.isInteger(activeUsRecords)) throw new Error("Retained FMCSA release metadata has invalid counts.");
  return { metadata, datasetRecords, activeUsRecords, fingerprint: FMCSA_SCHEMA_FINGERPRINT };
}

export async function buildFmcsaCompanyCensus({
  outputRoot,
  zbpPointer,
  sourceCsvPath = null,
  dictionaryPath = null,
  sourceMetadata = null,
  minimumAcceptedRecords = 2_000_000,
  maximumQuarantineRate = 0.02,
  fetchImpl = globalThis.fetch,
  logger = console.log,
  now = () => new Date(),
} = {}) {
  if (!outputRoot || !zbpPointer) throw new Error("outputRoot and zbpPointer are required.");
  if (!Number.isInteger(minimumAcceptedRecords) || minimumAcceptedRecords < 1) throw new Error("minimumAcceptedRecords must be a positive integer.");
  if (!Number.isFinite(maximumQuarantineRate) || maximumQuarantineRate < 0 || maximumQuarantineRate > 1) throw new Error("maximumQuarantineRate must be from 0 through 1.");
  if ((sourceCsvPath || dictionaryPath || sourceMetadata) && !(sourceCsvPath && dictionaryPath && sourceMetadata)) {
    throw new Error("sourceCsvPath, dictionaryPath, and sourceMetadata must be supplied together for an explicit local source.");
  }
  const retrievedAt = now().toISOString();
  const runId = randomUUID();
  const releaseId = `fmcsa-company-census-${releaseTimestamp(retrievedAt)}-${runId.slice(0, 8)}`;
  const stagingDirectory = path.join(outputRoot, ".staging", runId);
  await mkdir(path.join(stagingDirectory, "source"), { recursive: true });
  const baseline = await loadZbpBaseline(zbpPointer);
  const discoveryBefore = sourceMetadata ? normalizedMetadata(sourceMetadata) : await discoverSource(fetchImpl);
  const sourceUpdatedAt = new Date(discoveryBefore.metadata.rowsUpdatedAt * 1000).toISOString();
  if (sourceUpdatedAt > retrievedAt) throw new Error("FMCSA rowsUpdatedAt timestamp is after retrieval time.");
  const retainedCsvPath = path.join(stagingDirectory, "source", "active-us-company-census-selected.csv");
  const retainedDictionaryPath = path.join(stagingDirectory, "source", "company-census-data-dictionary.pdf");
  let csvAcquisition;
  let dictionaryAcquisition;
  if (sourceCsvPath) {
    csvAcquisition = await copySource(sourceCsvPath, retainedCsvPath, 1_500_000_000);
    dictionaryAcquisition = await copySource(dictionaryPath, retainedDictionaryPath, 20_000_000);
  } else {
    const csvUrl = assertAllowedUrl(exportUrl(), "export");
    const pdfUrl = assertAllowedUrl(dictionaryUrl(), "dictionary");
    csvAcquisition = await acquireResponse(csvUrl, retainedCsvPath, fetchImpl, "text/csv", 1_500_000_000);
    dictionaryAcquisition = await acquireResponse(pdfUrl, retainedDictionaryPath, fetchImpl, "application/pdf, application/octet-stream", 20_000_000);
  }
  await assertPdf(retainedDictionaryPath);
  const discoveryAfter = sourceMetadata ? discoveryBefore : await discoverSource(fetchImpl);
  if (discoveryAfter.metadata.rowsUpdatedAt !== discoveryBefore.metadata.rowsUpdatedAt
    || discoveryAfter.datasetRecords !== discoveryBefore.datasetRecords
    || discoveryAfter.activeUsRecords !== discoveryBefore.activeUsRecords) {
    throw new Error("FMCSA Company Census changed during acquisition; the unpublished snapshot was rejected.");
  }
  const csvHash = await hashFile(retainedCsvPath);
  const dictionaryHash = await hashFile(retainedDictionaryPath);
  const query = exportUrl().searchParams.toString();
  const querySha256 = sha256(query);
  const sourceReleaseId = `fmcsa-company-census-${sourceUpdatedAt.slice(0, 10)}-${sha256(`${csvHash.sha256}:${FMCSA_SCHEMA_FINGERPRINT}:${querySha256}`).slice(0, 16)}`;
  const context = { runId, retrievedAt, sourceUpdatedAt, sourceReleaseId, baselineByZip: baseline.byZip };
  const writers = new Map();
  for (const prefix of "0123456789") writers.set(prefix, await openGzipWriter(stagingDirectory, `derived/records/zip-prefix=${prefix}.jsonl.gz`));
  const quarantineWriter = await openGzipWriter(stagingDirectory, "quarantine/records.jsonl.gz");
  const countsByZip = new Map();
  const stateCounts = new Map();
  const quarantineReasonCounts = new Map();
  const carrierOperationCounts = new Map();
  const sourceRoleCounts = new Map();
  let accepted = 0;
  let quarantined = 0;
  let sourceTable;
  try {
    sourceTable = await forEachSourceRow(retainedCsvPath, async (source) => {
      const sourceId = text(source.dot_number);
      try {
        const normalized = normalizeFmcsaCompany(source, context);
        assertNormalizedUsPostalFieldsDeep(normalized);
        const zipCode = normalized.address.zip_code;
        await writeGzipRecord(writers.get(zipCode[0]), normalized);
        countsByZip.set(zipCode, (countsByZip.get(zipCode) ?? 0) + 1);
        stateCounts.set(normalized.address.state, (stateCounts.get(normalized.address.state) ?? 0) + 1);
        const operation = normalized.registration_profile.carrier_operation?.code ?? "blank";
        carrierOperationCounts.set(operation, (carrierOperationCounts.get(operation) ?? 0) + 1);
        for (const role of normalized.registration_profile.entity_roles) sourceRoleCounts.set(role.code, (sourceRoleCounts.get(role.code) ?? 0) + 1);
        accepted += 1;
      } catch (error) {
        quarantineReasonCounts.set(error.message, (quarantineReasonCounts.get(error.message) ?? 0) + 1);
        await writeGzipRecord(quarantineWriter, { source_type: "fmcsa-company-census-record", source_id: sourceId, reason: error.message });
        quarantined += 1;
      }
    });
    if (sourceTable.records !== discoveryBefore.activeUsRecords) throw new Error(`FMCSA selected export count ${sourceTable.records} does not match the pinned active U.S. count ${discoveryBefore.activeUsRecords}.`);
    if (accepted + quarantined !== sourceTable.records) throw new Error("FMCSA accepted and quarantined counts do not reconcile to the selected source.");
    if (accepted < minimumAcceptedRecords) throw new Error(`FMCSA accepted record count ${accepted} is below the ${minimumAcceptedRecords} quality floor.`);
    if (quarantined / Math.max(1, sourceTable.records) > maximumQuarantineRate) {
      throw new Error(`FMCSA quarantine rate ${(100 * quarantined / Math.max(1, sourceTable.records)).toFixed(4)}% exceeds ${maximumQuarantineRate * 100}%.`);
    }
  } catch (error) {
    abortGzipWriters([...writers.values(), quarantineWriter]);
    throw error;
  }
  const artifacts = [
    { path: "source/active-us-company-census-selected.csv", ...csvHash, record_count: sourceTable.records, artifact_type: "fmcsa-selected-source-csv", export_policy: "internal" },
    { path: "source/company-census-data-dictionary.pdf", ...dictionaryHash, artifact_type: "fmcsa-source-data-dictionary-pdf", export_policy: "internal" },
  ];
  artifacts.push(...await closeGzipWriters([...writers.values()], "normalized-fmcsa-company-census-record-jsonl-gzip"));
  artifacts.push(...await closeGzipWriters([quarantineWriter], "quarantine-jsonl-gzip"));
  const coverageRows = buildZipCoverage(baseline.rows, countsByZip, context);
  artifacts.push(await writeArtifact(stagingDirectory, "derived/zip-coverage.jsonl", jsonLines(coverageRows), { artifact_type: "fmcsa-company-census-zip-coverage-jsonl", record_count: coverageRows.length }));
  artifacts.push(await writeArtifact(stagingDirectory, "derived/source-summary.json", json({
    selected_source_records: sourceTable.records,
    accepted_records: accepted,
    quarantined_records: quarantined,
    quarantine_reasons: Object.fromEntries([...quarantineReasonCounts].sort((left, right) => right[1] - left[1])),
    states_and_territories: Object.fromEntries([...stateCounts].sort(([left], [right]) => left.localeCompare(right))),
    carrier_operations: Object.fromEntries([...carrierOperationCounts].sort(([left], [right]) => left.localeCompare(right))),
    source_entity_roles: Object.fromEntries([...sourceRoleCounts].sort(([left], [right]) => left.localeCompare(right))),
  }), { artifact_type: "fmcsa-company-census-source-summary" }));
  artifacts.push(await writeArtifact(stagingDirectory, "source/release-metadata.json", json({
    source_page: FMCSA_SOURCE_PAGE,
    dataset_page: FMCSA_DATASET_PAGE,
    metadata_url: FMCSA_METADATA_URL,
    dataset_id: FMCSA_DATASET_ID,
    dataset_name: discoveryBefore.metadata.name,
    rows_updated_at: sourceUpdatedAt,
    retrieved_at: retrievedAt,
    dataset_records: discoveryBefore.datasetRecords,
    active_us_records: discoveryBefore.activeUsRecords,
    selected_columns: FMCSA_SELECTED_COLUMNS.map(([field_name, data_type]) => ({ field_name, data_type })),
    selected_schema_fingerprint: sourceTable.schemaFingerprint,
    metadata_schema_fingerprint: discoveryBefore.fingerprint,
    export_filter: FMCSA_EXPORT_WHERE,
    export_order: FMCSA_EXPORT_ORDER,
    export_query_sha256: querySha256,
    csv_sha256: csvHash.sha256,
    csv_bytes: csvHash.bytes,
    csv_content_type: csvAcquisition.content_type,
    csv_content_encoding: csvAcquisition.content_encoding,
    csv_transport_content_length: csvAcquisition.transport_content_length,
    data_dictionary_filename: FMCSA_DICTIONARY_FILENAME,
    data_dictionary_asset_id: FMCSA_DICTIONARY_ASSET_ID,
    data_dictionary_sha256: dictionaryHash.sha256,
    data_dictionary_bytes: dictionaryHash.bytes,
    data_dictionary_content_type: dictionaryAcquisition.content_type,
    data_dictionary_content_encoding: dictionaryAcquisition.content_encoding,
    data_dictionary_transport_content_length: dictionaryAcquisition.transport_content_length,
    access_method: sourceCsvPath ? "explicit-local-minimized-source-and-dictionary" : "streamed-official-socrata-selected-export-and-dictionary",
  }), { artifact_type: "fmcsa-company-census-source-release-metadata" }));
  const manifest = {
    schema_version: FMCSA_SCHEMA_VERSION,
    dataset_id: "fmcsa-active-us-company-census",
    connector: { id: "fmcsa-company-census", version: "1.0.2" },
    release_id: releaseId,
    run_id: runId,
    retrieved_at: retrievedAt,
    source_updated_at: sourceUpdatedAt,
    source_release_id: sourceReleaseId,
    status: "published",
    complete_pinned_active_us_selected_snapshot: true,
    source_filter: FMCSA_EXPORT_WHERE,
    source_order: FMCSA_EXPORT_ORDER,
    quality_gates: {
      minimum_accepted_records: minimumAcceptedRecords,
      maximum_quarantine_rate: maximumQuarantineRate,
      actual_quarantine_rate: quarantined / Math.max(1, sourceTable.records),
      quarantine_reasons: Object.fromEntries([...quarantineReasonCounts].sort((left, right) => right[1] - left[1])),
    },
    coverage: {
      full_company_census_records: discoveryBefore.datasetRecords,
      selected_active_us_and_territory_records: sourceTable.records,
      accepted_principal_office_records: accepted,
      quarantined_selected_records: quarantined,
      source_zip_codes: countsByZip.size,
      zip_union_records: coverageRows.length,
      states_and_territories: stateCounts.size,
    },
    dependencies: [
      { dataset_id: baseline.manifest.dataset_id, release_id: baseline.manifest.release_id, manifest_sha256: baseline.manifestSha256 },
      baseline.manifest.geography_dependency,
    ],
    source: {
      publisher: "United States Department of Transportation, Federal Motor Carrier Safety Administration",
      source_page: FMCSA_SOURCE_PAGE,
      dataset_page: FMCSA_DATASET_PAGE,
      metadata_url: FMCSA_METADATA_URL,
      source_api: `${FMCSA_RESOURCE_URL}.csv`,
      data_dictionary_asset_id: FMCSA_DICTIONARY_ASSET_ID,
      access_method: sourceCsvPath ? "explicit-local-minimized-source-and-dictionary" : "official-public-anonymous-socrata-api",
      api_key_used: false,
      policy_profile: "config/source-policies/fmcsa-company-census.json",
    },
    privacy: {
      source_columns_available: discoveryBefore.metadata.columns.length,
      source_columns_acquired: FMCSA_SELECTED_COLUMNS.length,
      excluded_before_acquisition: ["PHONE", "FAX", "CELL_PHONE", "EMAIL_ADDRESS", "COMPANY_OFFICER_1", "COMPANY_OFFICER_2", "DUNS_NUMBER", "all mailing-address fields", "crash, review, inspection, safety-rating, and unnecessary operational metrics"],
      normalized_records_may_identify_individual_proprietors: true,
      normalized_principal_office_may_be_home_based: true,
    },
    limitations: [
      "The FMCSA Company Census covers entities registered with FMCSA, not every U.S. business, and excludes shipper-only business types and entities with an active Hazardous Materials Safety Permit from this public file.",
      "Only STATUS_CODE=A and PHY_COUNTRY=US rows are acquired. Source-reported undeliverable addresses and records without a valid supported U.S./territory principal-office address are quarantined.",
      "FMCSA states the daily file is generated from a database about 24 hours old and is not real-time; the Socrata rowsUpdatedAt timestamp is pinned before and after acquisition.",
      "The physical address is FMCSA's reported principal-office location. It is not proof of a public storefront, customer access, a distinct operating facility, address deliverability beyond the source flag, or current USPS ZIP validity.",
      "A principal office may be home-based and a legal name may identify an individual proprietor. Public officer, phone, cell, fax, email, D&B, mailing-address, crash, review, and unrelated operational fields are excluded before acquisition.",
      "No legal organization or parent is inferred because BUSINESS_ORG_ID is review-only and incomplete and the registered entity can be an individual. One provisional physical site and establishment are created per accepted USDOT record.",
      "FMCSA active status is retained as a source-specific regulatory status and is not generalized beyond FMCSA's definition.",
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
  logger(`Published ${accepted.toLocaleString("en-US")} FMCSA active U.S./territory principal-office records.`);
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

function findForbiddenKey(value) {
  if (!value || typeof value !== "object") return null;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_NORMALIZED_KEYS.has(key.toLowerCase())) return key;
    const nested = findForbiddenKey(child);
    if (nested) return nested;
  }
  return null;
}

export async function verifyFmcsaCompanyCensus(manifestPath) {
  const absoluteManifestPath = path.resolve(manifestPath);
  const releaseDirectory = path.dirname(absoluteManifestPath);
  const manifest = JSON.parse(await readFile(absoluteManifestPath, "utf8"));
  const failures = [];
  if (manifest.dataset_id !== "fmcsa-active-us-company-census" || manifest.status !== "published" || !manifest.complete_pinned_active_us_selected_snapshot
    || manifest.source_filter !== FMCSA_EXPORT_WHERE || manifest.source_order !== FMCSA_EXPORT_ORDER) {
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
  const sourceArtifacts = manifest.artifacts?.filter((item) => item.artifact_type === "fmcsa-selected-source-csv") ?? [];
  const dictionaryArtifacts = manifest.artifacts?.filter((item) => item.artifact_type === "fmcsa-source-data-dictionary-pdf") ?? [];
  const metadataArtifacts = manifest.artifacts?.filter((item) => item.artifact_type === "fmcsa-company-census-source-release-metadata") ?? [];
  const normalizedArtifacts = manifest.artifacts?.filter((item) => item.artifact_type === "normalized-fmcsa-company-census-record-jsonl-gzip") ?? [];
  const quarantineArtifacts = manifest.artifacts?.filter((item) => item.artifact_type === "quarantine-jsonl-gzip") ?? [];
  if (sourceArtifacts.length !== 1 || dictionaryArtifacts.length !== 1 || metadataArtifacts.length !== 1) failures.push({ path: "manifest.json", reason: "incomplete retained FMCSA source evidence" });
  if (normalizedArtifacts.length !== 10) failures.push({ path: "manifest.json", reason: "expected 10 normalized FMCSA ZIP partitions" });
  if (quarantineArtifacts.length !== 1) failures.push({ path: "manifest.json", reason: "expected one quarantine artifact" });
  if (sourceArtifacts.length === 1) {
    try {
      if (sourceArtifacts[0].export_policy !== "internal") throw new Error("selected source is not internal");
      const sourceTable = await forEachSourceRow(path.join(releaseDirectory, sourceArtifacts[0].path), (row) => {
        if (text(row.status_code)?.toUpperCase() !== "A" || text(row.phy_country)?.toUpperCase() !== "US") throw new Error("selected source filter violation");
      });
      if (sourceTable.records !== sourceArtifacts[0].record_count || sourceTable.records !== manifest.coverage?.selected_active_us_and_territory_records) throw new Error("selected source record count mismatch");
      if (sourceTable.schemaFingerprint !== sha256(FMCSA_SELECTED_COLUMNS.map(([name]) => name).join("\u0000"))) throw new Error("selected CSV header fingerprint mismatch");
    } catch (error) {
      failures.push({ path: sourceArtifacts[0].path, reason: `selected source validation failed: ${error.message}` });
    }
  }
  if (dictionaryArtifacts.length === 1) {
    try { await assertPdf(path.join(releaseDirectory, dictionaryArtifacts[0].path)); } catch (error) { failures.push({ path: dictionaryArtifacts[0].path, reason: error.message }); }
  }
  const quarantineTotal = Object.values(manifest.quality_gates?.quarantine_reasons ?? {}).reduce((sum, count) => sum + count, 0);
  if (quarantineTotal !== manifest.coverage?.quarantined_selected_records) failures.push({ path: "manifest.json", reason: "quarantine reasons do not reconcile" });
  if ((manifest.coverage?.accepted_principal_office_records ?? 0) + (manifest.coverage?.quarantined_selected_records ?? 0) !== manifest.coverage?.selected_active_us_and_territory_records) {
    failures.push({ path: "manifest.json", reason: "accepted and quarantined records do not reconcile" });
  }
  if ((manifest.quality_gates?.actual_quarantine_rate ?? 1) > (manifest.quality_gates?.maximum_quarantine_rate ?? 0)) failures.push({ path: "manifest.json", reason: "published release exceeds its quarantine gate" });
  const countsByZip = new Map();
  const ids = new Set();
  let accepted = 0;
  for (const artifact of normalizedArtifacts) {
    try {
      const partition = artifact.path.match(/zip-prefix=(\d)/)?.[1];
      const count = await forEachGzipRecord(path.join(releaseDirectory, artifact.path), (record) => {
        const dotNumber = record.external_identifiers?.find((item) => item.type === "usdot_number")?.value;
        if (!/^\d+$/.test(dotNumber ?? "") || ids.has(dotNumber)) throw new Error(`duplicate or invalid USDOT number ${dotNumber}`);
        if (record.address?.zip_code?.[0] !== partition || !/^\d{5}$/.test(record.address.zip_code)) throw new Error(`invalid ZIP partition for USDOT ${dotNumber}`);
        if (record.entity_candidates?.organization_id) throw new Error(`organization inferred for USDOT ${dotNumber}`);
        if (record.source_status?.value !== "fmcsa-active-registration-as-of-daily-source-release" || record.source_status.source_updated_at !== manifest.source_updated_at) throw new Error(`invalid source status for USDOT ${dotNumber}`);
        if (record.provenance?.source_release_id !== manifest.source_release_id || record.provenance?.policy_id !== "fmcsa-company-census" || record.export_policy !== "public") throw new Error(`invalid provenance for USDOT ${dotNumber}`);
        const forbidden = findForbiddenKey(record);
        if (forbidden) throw new Error(`excluded field ${forbidden} leaked for USDOT ${dotNumber}`);
        const externalIdentifierKeys = (record.external_identifiers ?? []).map((item) => `${item.type}:${item.value}`);
        if (new Set(externalIdentifierKeys).size !== externalIdentifierKeys.length) throw new Error(`duplicate external identifier for USDOT ${dotNumber}`);
        ids.add(dotNumber);
        countsByZip.set(record.address.zip_code, (countsByZip.get(record.address.zip_code) ?? 0) + 1);
      });
      if (count !== artifact.record_count) failures.push({ path: artifact.path, reason: "actual normalized line count mismatch" });
      accepted += count;
    } catch (error) {
      failures.push({ path: artifact.path, reason: `normalized validation failed: ${error.message}` });
    }
  }
  if (accepted !== manifest.coverage?.accepted_principal_office_records) failures.push({ path: "manifest.json", reason: "accepted normalized count does not reconcile" });
  if (quarantineArtifacts.length === 1) {
    try {
      const count = await forEachGzipRecord(path.join(releaseDirectory, quarantineArtifacts[0].path), (record) => {
        if (Object.keys(record).some((key) => !["source_type", "source_id", "reason"].includes(key))) throw new Error("quarantine record contains an unapproved field");
      });
      if (count !== quarantineArtifacts[0].record_count || count !== manifest.coverage?.quarantined_selected_records) throw new Error("quarantine count mismatch");
    } catch (error) {
      failures.push({ path: quarantineArtifacts[0].path, reason: `quarantine validation failed: ${error.message}` });
    }
  }
  const zipArtifact = manifest.artifacts?.find((item) => item.artifact_type === "fmcsa-company-census-zip-coverage-jsonl");
  if (!zipArtifact) failures.push({ path: "manifest.json", reason: "missing ZIP coverage artifact" });
  else {
    try {
      const rows = (await readFile(path.join(releaseDirectory, zipArtifact.path), "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse);
      if (rows.length !== zipArtifact.record_count || rows.length !== manifest.coverage?.zip_union_records) throw new Error("ZIP row count mismatch");
      if (rows.reduce((sum, row) => sum + row.fmcsa_active_registration_principal_office_snapshot.record_count, 0) !== accepted) throw new Error("ZIP counts do not reconcile");
      for (const row of rows) {
        if ((countsByZip.get(row.zip_code) ?? 0) !== row.fmcsa_active_registration_principal_office_snapshot.record_count) throw new Error(`ZIP ${row.zip_code} does not reconcile`);
        if (row.current_usps_validity?.status !== "unverified") throw new Error(`ZIP ${row.zip_code} has unsupported USPS validity`);
      }
    } catch (error) {
      failures.push({ path: zipArtifact.path, reason: `ZIP validation failed: ${error.message}` });
    }
  }
  if (sourceArtifacts.length === 1 && manifest.source_release_id !== `fmcsa-company-census-${manifest.source_updated_at.slice(0, 10)}-${sha256(`${sourceArtifacts[0].sha256}:${FMCSA_SCHEMA_FINGERPRINT}:${sha256(exportUrl().searchParams.toString())}`).slice(0, 16)}`) {
    failures.push({ path: "manifest.json", reason: "source release ID is not bound to timestamp, selected source, schema, and query" });
  }
  if (failures.length) {
    const error = new Error(`FMCSA Company Census release verification failed for ${failures.length} check(s).`);
    error.failures = failures;
    throw error;
  }
  return { dataset_id: manifest.dataset_id, release_id: manifest.release_id, source_release_id: manifest.source_release_id, artifact_count: manifest.artifacts.length, coverage: manifest.coverage };
}
