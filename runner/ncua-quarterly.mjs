import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { finished } from "node:stream/promises";
import { createInterface } from "node:readline";
import { createGunzip, createGzip } from "node:zlib";
import { parse } from "csv-parse/sync";
import unzipper from "unzipper";

export const NCUA_SCHEMA_VERSION = "1.0.0";
export const NCUA_TRANSFORMATION_VERSION = "ncua-quarterly@1.0.0";
export const NCUA_QUARTERLY_PAGE_URL = "https://ncua.gov/analysis/credit-union-corporate-call-report-data/quarterly-data";

const REQUIRED_ENTRIES = ["FOICU.txt", "FOICUDES.txt", "Credit Union Branch Information.txt", "TradeNames.txt", "Report1.txt", "Readme.txt"];
const INSTITUTION_HEADERS = [
  "CU_NUMBER", "CYCLE_DATE", "JOIN_NUMBER", "RSSD", "CU_TYPE", "CU_NAME", "CITY", "STATE", "CharterState", "STATE_CODE", "ZIP_CODE",
  "COUNTY_CODE", "CONG_DIST", "SMSA", "ATTENTION_OF", "STREET", "REGION", "SE", "DISTRICT", "YEAR_OPENED", "TOM_CODE", "LIMITED_INC",
  "ISSUE_DATE", "Peer_Group", "Quarter_Flag", "IsMDI", "INSURED_DATE", "AM_DateHeld",
];
const BRANCH_HEADERS = [
  "CU_NUMBER", "CYCLE_DATE", "JOIN_NUMBER", "SiteId", "CU_NAME", "SiteName", "SiteTypeName", "MainOffice", "PhysicalAddressLine1",
  "PhysicalAddressLine2", "PhysicalAddressCity", "PhysicalAddressStateCode", "PhysicalAddressPostalCode", "PhysicalAddressCountyName2",
  "PhysicalAddressCountry", "MailingAddressLine1", "MailingAddressLine2", "MailingAddressCity", "MailingAddressStateCode", "MailingAddressStateName",
  "MailingAddressPostalCode", "PhoneNumber", "HoursOfOperation", "MemberServices", "ATM", "DriveThru", "Shrd_Serv_Cntr_Net",
];
const TRADE_NAME_HEADERS = ["CU_NUMBER", "CycleDate", "JoinNumber", "CU_NAME", "TradeNamesId", "TradeName"];

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
  let match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s|$)/);
  if (match) return `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
  match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function postalCode(value) {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d{5})(?:-(\d{4}))?$/);
  return match ? { zip_code: match[1], postal_code: match[2] ? `${match[1]}-${match[2]}` : match[1], zip4: match[2] ?? null } : null;
}

function physicalAddress(source) {
  const postal = postalCode(source.PhysicalAddressPostalCode);
  const street = text(source.PhysicalAddressLine1);
  const city = text(source.PhysicalAddressCity);
  const state = text(source.PhysicalAddressStateCode)?.toUpperCase() ?? null;
  if (!postal || !street || !city || !/^[A-Z]{2}$/.test(state ?? "")) return null;
  return {
    street,
    unit_or_additional: text(source.PhysicalAddressLine2),
    city,
    state,
    zip_code: postal.zip_code,
    postal_code: postal.postal_code,
    zip4: postal.zip4,
    county_name: text(source.PhysicalAddressCountyName2),
    country: "US",
  };
}

function mailingAddress(source, prefix = "MailingAddress") {
  const postal = postalCode(source[`${prefix}PostalCode`] ?? source.ZIP_CODE);
  const street = text(source[`${prefix}Line1`] ?? source.STREET);
  const city = text(source[`${prefix}City`] ?? source.CITY);
  const state = text(source[`${prefix}StateCode`] ?? source.STATE)?.toUpperCase() ?? null;
  if (!postal || !street || !city || !/^[A-Z]{2}$/.test(state ?? "")) return null;
  return {
    street,
    unit_or_additional: text(source[`${prefix}Line2`]),
    city,
    state,
    zip_code: postal.zip_code,
    postal_code: postal.postal_code,
    zip4: postal.zip4,
    country: "US",
  };
}

function binaryFlag(value) {
  if (String(value).trim() === "1") return true;
  if (String(value).trim() === "0") return false;
  return null;
}

function yesNoFlag(value) {
  if (String(value).trim().toLowerCase() === "yes") return true;
  if (String(value).trim().toLowerCase() === "no") return false;
  return null;
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
    source_id: "ncua-final-quarterly-call-report",
    source_release_id: context.sourceReleaseId,
    source_record_id: sourceRecordId,
    ingest_run_id: context.runId,
    transformation_version: NCUA_TRANSFORMATION_VERSION,
    policy_id: "ncua-quarterly",
  };
}

export function normalizeNcuaInstitution(source, context) {
  const charterNumber = digits(source.CU_NUMBER);
  const joinNumber = digits(source.JOIN_NUMBER);
  const creditUnionType = text(source.CU_TYPE);
  if (!charterNumber || !joinNumber || !text(source.CU_NAME)) throw new Error("missing-institution-identity");
  if (!new Set(["1", "2"]).has(creditUnionType)) throw new Error("institution-not-federally-insured");
  if (sourceDate(source.CYCLE_DATE) !== context.cycleDate) throw new Error("institution-cycle-mismatch");
  const sourceRecordId = `institution:${charterNumber}`;
  const identifiers = [
    { type: "ncua_charter_number", value: charterNumber, source_field: "CU_NUMBER" },
    { type: "ncua_join_number", value: joinNumber, source_field: "JOIN_NUMBER" },
    digits(source.RSSD) ? { type: "federal_reserve_rssd", value: digits(source.RSSD), source_field: "RSSD" } : null,
  ].filter(Boolean);
  return {
    schema_version: NCUA_SCHEMA_VERSION,
    normalized_record_id: `ncua-quarterly:${sourceRecordId}`,
    entity_candidates: { organization_id: `organization:ncua_charter_${charterNumber}`, identity_status: "provisional" },
    external_identifiers: identifiers,
    legal_name: text(source.CU_NAME),
    credit_union_type: {
      code: creditUnionType,
      description: creditUnionType === "1" ? "federally-chartered-federally-insured" : "state-chartered-federally-insured",
      charter_state: text(source.CharterState)?.toUpperCase() ?? null,
    },
    reported_mailing_address: mailingAddress(source, "FOICU"),
    organization_dates: {
      year_opened: /^\d{4}$/.test(String(source.YEAR_OPENED ?? "").trim()) ? Number(source.YEAR_OPENED) : null,
      charter_issue_date: sourceDate(source.ISSUE_DATE),
      ncua_insured_date: sourceDate(source.INSURED_DATE),
    },
    source_classifications: {
      field_of_membership_code: text(source.TOM_CODE),
      low_income_designated: binaryFlag(source.LIMITED_INC),
      minority_depository_institution: String(source.IsMDI ?? "").trim().toLowerCase() === "true",
      peer_group: text(source.Peer_Group),
      ncua_region: text(source.REGION),
    },
    source_status: {
      value: "ncua-federally-insured-credit-union-in-final-quarterly-call-report",
      scope: "CU_TYPE 1 or 2 in the pinned final NCUA quarterly Call Report release; not a statement about every service, branch, membership eligibility, or public-access condition",
      cycle_date: context.cycleDate,
    },
    observed_at: context.retrievedAt,
    provenance: provenance(context, sourceRecordId),
    export_policy: "public",
  };
}

export function normalizeNcuaBranch(source, context) {
  const charterNumber = digits(source.CU_NUMBER);
  const joinNumber = digits(source.JOIN_NUMBER);
  const siteId = digits(source.SiteId);
  if (!charterNumber || !joinNumber || !siteId) throw new Error("missing-branch-identity");
  if (!context.insuredCharters?.has(charterNumber)) throw new Error("branch-institution-not-federally-insured");
  if (sourceDate(source.CYCLE_DATE) !== context.cycleDate) throw new Error("branch-cycle-mismatch");
  if (text(source.PhysicalAddressCountry)?.toLowerCase() !== "united states") throw new Error("branch-outside-us");
  const address = physicalAddress(source);
  if (!address) throw new Error("missing-branch-physical-address");
  const sourceRecordId = `branch:${charterNumber}:${siteId}`;
  return {
    schema_version: NCUA_SCHEMA_VERSION,
    normalized_record_id: `ncua-quarterly:${sourceRecordId}`,
    entity_candidates: {
      organization_id: `organization:ncua_charter_${charterNumber}`,
      physical_site_id: `site:ncua_charter_${charterNumber}_site_${siteId}`,
      establishment_id: `establishment:ncua_charter_${charterNumber}_site_${siteId}`,
      identity_status: "provisional",
    },
    external_identifiers: [
      { type: "ncua_charter_number", value: charterNumber, source_field: "CU_NUMBER" },
      { type: "ncua_site_id", value: siteId, source_field: "SiteId", uniqueness_scope: "within-credit-union-charter" },
      { type: "ncua_join_number", value: joinNumber, source_field: "JOIN_NUMBER" },
    ],
    credit_union_name: text(source.CU_NAME),
    site_name: text(source.SiteName),
    site_type: text(source.SiteTypeName),
    main_office: yesNoFlag(source.MainOffice),
    address,
    mailing_address: mailingAddress(source),
    geography: geography(address.zip_code, context.baselineByZip),
    telephone: digits(source.PhoneNumber) || null,
    reported_hours_of_operation: text(source.HoursOfOperation),
    reported_services: {
      member_services: binaryFlag(source.MemberServices),
      atm: binaryFlag(source.ATM),
      drive_through: binaryFlag(source.DriveThru),
      shared_service_center_network: binaryFlag(source.Shrd_Serv_Cntr_Net),
    },
    source_status: {
      value: "ncua-reported-us-branch-for-federally-insured-credit-union-as-of-final-quarterly-release",
      scope: "U.S. branch row joined to a CU_TYPE 1 or 2 institution in the same pinned final quarterly release; not independent confirmation of current public access, hours, or service availability",
      cycle_date: context.cycleDate,
    },
    observed_at: context.retrievedAt,
    provenance: provenance(context, sourceRecordId),
    export_policy: "public",
  };
}

export function normalizeNcuaTradeName(source, context) {
  const charterNumber = digits(source.CU_NUMBER);
  const tradeNameId = digits(source.TradeNamesId);
  if (!charterNumber || !tradeNameId || !text(source.TradeName)) throw new Error("missing-trade-name-identity");
  if (!context.insuredCharters?.has(charterNumber)) throw new Error("trade-name-institution-not-federally-insured");
  if (sourceDate(source.CycleDate) !== context.cycleDate) throw new Error("trade-name-cycle-mismatch");
  const sourceRecordId = `trade-name:${charterNumber}:${tradeNameId}`;
  return {
    schema_version: NCUA_SCHEMA_VERSION,
    normalized_record_id: `ncua-quarterly:${sourceRecordId}`,
    organization_id: `organization:ncua_charter_${charterNumber}`,
    charter_number: charterNumber,
    trade_name_id: tradeNameId,
    name: text(source.TradeName),
    observed_at: context.retrievedAt,
    provenance: provenance(context, sourceRecordId),
    export_policy: "public",
  };
}

function assertAllowedUrl(urlValue, type) {
  const url = new URL(urlValue);
  const allowed = url.protocol === "https:" && url.hostname === "ncua.gov"
    && (type === "page" ? url.pathname === "/analysis/credit-union-corporate-call-report-data/quarterly-data" : /^\/files\/publications\/analysis\/call-report-data-\d{4}-(03|06|09|12)\.zip$/i.test(url.pathname));
  if (!allowed) throw new Error(`Disallowed NCUA ${type} URL ${url.origin}${url.pathname}.`);
  return url;
}

async function request(urlValue, { fetchImpl, type, accept, retries = 3 }) {
  const url = assertAllowedUrl(urlValue, type);
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchImpl(url, { headers: { Accept: accept, "User-Agent": "CoTive-Collector/0.1" }, redirect: "error", signal: AbortSignal.timeout(60_000) });
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

export function discoverNcuaQuarterlySource(html, pageUrl = NCUA_QUARTERLY_PAGE_URL) {
  const candidates = [];
  const pattern = /href=["']([^"']*call-report-data-(\d{4})-(03|06|09|12)\.zip)["']/gi;
  for (const match of html.matchAll(pattern)) {
    const url = assertAllowedUrl(new URL(match[1], pageUrl), "archive");
    candidates.push({ url: url.toString(), year: Number(match[2]), month: Number(match[3]) });
  }
  candidates.sort((left, right) => right.year - left.year || right.month - left.month || left.url.localeCompare(right.url));
  if (!candidates.length) throw new Error("No NCUA quarterly Call Report archive link was discovered.");
  return candidates[0];
}

async function acquireArchive({ sourceUrl, destination, fetchImpl }) {
  const response = await request(sourceUrl, { fetchImpl, type: "archive", accept: "application/zip, application/octet-stream" });
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > 100_000_000) throw new Error("NCUA source archive exceeds the 100 MB acquisition limit.");
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > 100_000_000 || buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) throw new Error("NCUA response is not an allowed ZIP archive.");
  const temporary = `${destination}.tmp-${randomUUID()}`;
  await writeFile(temporary, buffer);
  await rename(temporary, destination);
  return {
    bytes: buffer.length,
    sha256: sha256(buffer),
    etag: text(response.headers.get("etag")),
    last_modified: text(response.headers.get("last-modified")),
  };
}

function parseCsvTable(buffer, expectedHeaders, label) {
  const rows = parse(buffer, { bom: true, skip_empty_lines: true, relax_quotes: true });
  const headers = rows.shift();
  if (JSON.stringify(headers) !== JSON.stringify(expectedHeaders)) throw new Error(`${label} schema changed.`);
  return rows.map((values, index) => {
    if (values.length !== expectedHeaders.length) throw new Error(`${label} row ${index + 2} has ${values.length} fields; expected ${expectedHeaders.length}.`);
    return Object.fromEntries(expectedHeaders.map((header, column) => [header, values[column]]));
  });
}

async function readSourceTables(archivePath) {
  const archive = await unzipper.Open.file(archivePath);
  const entries = new Map(archive.files.filter((entry) => entry.type === "File").map((entry) => [entry.path, entry]));
  for (const name of REQUIRED_ENTRIES) if (!entries.has(name)) throw new Error(`NCUA archive is missing ${name}.`);
  const institutions = parseCsvTable(await entries.get("FOICU.txt").buffer(), INSTITUTION_HEADERS, "FOICU.txt");
  const branches = parseCsvTable(await entries.get("Credit Union Branch Information.txt").buffer(), BRANCH_HEADERS, "Credit Union Branch Information.txt");
  const tradeNames = parseCsvTable(await entries.get("TradeNames.txt").buffer(), TRADE_NAME_HEADERS, "TradeNames.txt");
  return {
    institutions,
    branches,
    tradeNames,
    entryMetadata: REQUIRED_ENTRIES.map((name) => ({ path: name, bytes: entries.get(name).uncompressedSize })),
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
    const counts = countsByZip.get(zipCode) ?? { locations: 0, main_offices: 0, branches: 0, drive_through: 0, atm: 0 };
    return {
      schema_version: NCUA_SCHEMA_VERSION,
      zip_code: zipCode,
      ncua_quarterly_snapshot: {
        status: counts.locations ? "published-us-locations-for-federally-insured-credit-unions" : "no-location-in-current-source-snapshot",
        location_count: counts.locations,
        main_office_count: counts.main_offices,
        branch_office_count: counts.branches,
        reported_drive_through_count: counts.drive_through,
        reported_atm_count: counts.atm,
        source_release_id: context.sourceReleaseId,
        cycle_date: context.cycleDate,
      },
      current_usps_validity: baseline?.current_usps_validity ?? { status: "unverified", reason: "ZIP appears in NCUA locations but is outside the current ZBP/ZCTA union." },
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

export async function buildNcuaQuarterly({
  outputRoot,
  zbpPointer,
  sourceUrl = null,
  minimumInstitutions = 3_500,
  minimumLocations = 15_000,
  maximumQuarantineRate = 0.005,
  fetchImpl = globalThis.fetch,
  logger = console.log,
  now = () => new Date(),
} = {}) {
  if (!outputRoot || !zbpPointer) throw new Error("outputRoot and zbpPointer are required.");
  if (!Number.isFinite(maximumQuarantineRate) || maximumQuarantineRate < 0 || maximumQuarantineRate > 1) throw new Error("maximumQuarantineRate must be from 0 through 1.");
  const retrievedAt = now().toISOString();
  const runId = randomUUID();
  const releaseId = `ncua-quarterly-${releaseTimestamp(retrievedAt)}-${runId.slice(0, 8)}`;
  const stagingDirectory = path.join(outputRoot, ".staging", runId);
  await mkdir(path.join(stagingDirectory, "source"), { recursive: true });
  const baseline = await loadZbpBaseline(zbpPointer);

  let discovery = null;
  if (!sourceUrl) {
    const pageResponse = await request(NCUA_QUARTERLY_PAGE_URL, { fetchImpl, type: "page", accept: "text/html" });
    discovery = discoverNcuaQuarterlySource(await pageResponse.text());
    sourceUrl = discovery.url;
  } else {
    sourceUrl = assertAllowedUrl(sourceUrl, "archive").toString();
  }
  const archivePath = path.join(stagingDirectory, "source", "call-report-data.zip");
  const acquisition = await acquireArchive({ sourceUrl, destination: archivePath, fetchImpl });
  const tables = await readSourceTables(archivePath);
  const cycleDates = new Set(tables.institutions.map((row) => sourceDate(row.CYCLE_DATE)));
  if (cycleDates.size !== 1 || cycleDates.has(null)) throw new Error("NCUA FOICU data does not have one coherent cycle date.");
  const cycleDate = [...cycleDates][0];
  if (discovery && `${discovery.year}-${String(discovery.month).padStart(2, "0")}` !== cycleDate.slice(0, 7)) throw new Error("NCUA archive filename and source cycle do not match.");
  const sourceReleaseId = `ncua-${cycleDate}-${acquisition.sha256.slice(0, 16)}`;
  const insuredCharters = new Set();
  const context = { runId, retrievedAt, cycleDate, sourceReleaseId, insuredCharters, baselineByZip: baseline.byZip };

  const institutionWriters = new Map();
  const locationWriters = new Map();
  const tradeNameWriters = new Map();
  for (const prefix of "0123456789") {
    institutionWriters.set(prefix, await openGzipWriter(stagingDirectory, `derived/institutions/charter-prefix=${prefix}.jsonl.gz`));
    locationWriters.set(prefix, await openGzipWriter(stagingDirectory, `derived/locations/zip-prefix=${prefix}.jsonl.gz`));
    tradeNameWriters.set(prefix, await openGzipWriter(stagingDirectory, `derived/trade-names/charter-prefix=${prefix}.jsonl.gz`));
  }
  const quarantineWriter = await openGzipWriter(stagingDirectory, "quarantine/records.jsonl.gz");
  const institutionIds = new Set();
  const branchIds = new Set();
  const tradeNameIds = new Set();
  const countsByZip = new Map();
  const stateCounts = new Map();
  const siteTypeCounts = new Map();
  let acceptedInstitutions = 0;
  let excludedNonInsuredInstitutions = 0;
  let acceptedLocations = 0;
  let excludedNonInsuredLocations = 0;
  let excludedForeignLocations = 0;
  let acceptedTradeNames = 0;
  let excludedNonInsuredTradeNames = 0;
  let quarantined = 0;

  for (const source of tables.institutions) {
    try {
      const normalized = normalizeNcuaInstitution(source, context);
      const charter = normalized.external_identifiers[0].value;
      if (institutionIds.has(normalized.normalized_record_id)) throw new Error("duplicate-institution-id");
      institutionIds.add(normalized.normalized_record_id);
      insuredCharters.add(charter);
      await writeGzipRecord(institutionWriters.get(charter[0]), normalized);
      acceptedInstitutions += 1;
    } catch (error) {
      if (error.message === "institution-not-federally-insured") excludedNonInsuredInstitutions += 1;
      else {
        await writeGzipRecord(quarantineWriter, { source_type: "institution", source_id: source.CU_NUMBER ?? null, reason: error.message });
        quarantined += 1;
      }
    }
  }
  if (acceptedInstitutions < minimumInstitutions) throw new Error(`NCUA institution count ${acceptedInstitutions} is below the ${minimumInstitutions} quality floor.`);

  for (const source of tables.branches) {
    try {
      const normalized = normalizeNcuaBranch(source, context);
      if (branchIds.has(normalized.normalized_record_id)) throw new Error("duplicate-branch-id");
      branchIds.add(normalized.normalized_record_id);
      const zipCode = normalized.address.zip_code;
      await writeGzipRecord(locationWriters.get(zipCode[0]), normalized);
      const counts = countsByZip.get(zipCode) ?? { locations: 0, main_offices: 0, branches: 0, drive_through: 0, atm: 0 };
      counts.locations += 1;
      if (normalized.main_office) counts.main_offices += 1;
      else counts.branches += 1;
      if (normalized.reported_services.drive_through) counts.drive_through += 1;
      if (normalized.reported_services.atm) counts.atm += 1;
      countsByZip.set(zipCode, counts);
      stateCounts.set(normalized.address.state, (stateCounts.get(normalized.address.state) ?? 0) + 1);
      siteTypeCounts.set(normalized.site_type ?? "Unclassified", (siteTypeCounts.get(normalized.site_type ?? "Unclassified") ?? 0) + 1);
      acceptedLocations += 1;
    } catch (error) {
      if (error.message === "branch-institution-not-federally-insured") excludedNonInsuredLocations += 1;
      else if (error.message === "branch-outside-us") excludedForeignLocations += 1;
      else {
        await writeGzipRecord(quarantineWriter, { source_type: "branch", source_id: source.SiteId ?? null, charter_number: source.CU_NUMBER ?? null, reason: error.message });
        quarantined += 1;
      }
    }
  }
  if (acceptedLocations < minimumLocations) throw new Error(`NCUA U.S. location count ${acceptedLocations} is below the ${minimumLocations} quality floor.`);

  for (const source of tables.tradeNames) {
    try {
      const normalized = normalizeNcuaTradeName(source, context);
      if (tradeNameIds.has(normalized.normalized_record_id)) throw new Error("duplicate-trade-name-id");
      tradeNameIds.add(normalized.normalized_record_id);
      await writeGzipRecord(tradeNameWriters.get(normalized.charter_number[0]), normalized);
      acceptedTradeNames += 1;
    } catch (error) {
      if (error.message === "trade-name-institution-not-federally-insured") excludedNonInsuredTradeNames += 1;
      else {
        await writeGzipRecord(quarantineWriter, { source_type: "trade_name", source_id: source.TradeNamesId ?? null, charter_number: source.CU_NUMBER ?? null, reason: error.message });
        quarantined += 1;
      }
    }
  }
  if (quarantined / Math.max(1, tables.institutions.length + tables.branches.length + tables.tradeNames.length) > maximumQuarantineRate) throw new Error(`NCUA quarantine rate exceeds ${maximumQuarantineRate * 100}%.`);

  const artifacts = [{ path: "source/call-report-data.zip", ...acquisition, artifact_type: "ncua-source-quarterly-zip" }];
  artifacts.push(...await closeGzipWriters([...institutionWriters.values()], "normalized-ncua-institution-jsonl-gzip"));
  artifacts.push(...await closeGzipWriters([...locationWriters.values()], "normalized-ncua-location-jsonl-gzip"));
  artifacts.push(...await closeGzipWriters([...tradeNameWriters.values()], "normalized-ncua-trade-name-jsonl-gzip"));
  artifacts.push(...await closeGzipWriters([quarantineWriter], "quarantine-jsonl-gzip"));
  const coverageRows = buildZipCoverage(baseline.rows, countsByZip, context);
  artifacts.push(await writeArtifact(stagingDirectory, "derived/zip-coverage.jsonl", jsonLines(coverageRows), { artifact_type: "ncua-zip-coverage-jsonl", record_count: coverageRows.length }));
  artifacts.push(await writeArtifact(stagingDirectory, "derived/source-summary.json", json({
    states_and_territories: Object.fromEntries([...stateCounts].sort(([left], [right]) => left.localeCompare(right))),
    site_types: Object.fromEntries([...siteTypeCounts].sort(([left], [right]) => left.localeCompare(right))),
  }), { artifact_type: "ncua-source-summary" }));
  artifacts.push(await writeArtifact(stagingDirectory, "source/release-metadata.json", json({
    source_url: sourceUrl,
    source_page: NCUA_QUARTERLY_PAGE_URL,
    cycle_date: cycleDate,
    archive_sha256: acquisition.sha256,
    archive_bytes: acquisition.bytes,
    etag: acquisition.etag,
    last_modified: acquisition.last_modified,
    archive_entries: tables.entryMetadata,
    source_table_counts: { institutions: tables.institutions.length, branches: tables.branches.length, trade_names: tables.tradeNames.length },
  }), { artifact_type: "ncua-source-release-metadata" }));

  const manifest = {
    schema_version: NCUA_SCHEMA_VERSION,
    dataset_id: "ncua-quarterly-credit-unions",
    connector: { id: "ncua-quarterly", version: "1.0.0" },
    release_id: releaseId,
    run_id: runId,
    retrieved_at: retrievedAt,
    cycle_date: cycleDate,
    source_release_id: sourceReleaseId,
    status: "published",
    complete_final_quarterly_source_snapshot: true,
    coverage: {
      source_institutions: tables.institutions.length,
      accepted_federally_insured_institutions: acceptedInstitutions,
      excluded_non_federally_insured_institutions: excludedNonInsuredInstitutions,
      source_branch_records: tables.branches.length,
      accepted_us_locations: acceptedLocations,
      excluded_non_federally_insured_locations: excludedNonInsuredLocations,
      excluded_locations_outside_united_states: excludedForeignLocations,
      source_trade_names: tables.tradeNames.length,
      accepted_trade_names: acceptedTradeNames,
      excluded_non_federally_insured_trade_names: excludedNonInsuredTradeNames,
      quarantined_records: quarantined,
      source_zip_codes: countsByZip.size,
      zip_union_records: coverageRows.length,
      states_and_territories: stateCounts.size,
      site_types: siteTypeCounts.size,
    },
    dependencies: [
      { dataset_id: baseline.manifest.dataset_id, release_id: baseline.manifest.release_id, manifest_sha256: baseline.manifestSha256 },
      baseline.manifest.geography_dependency,
    ],
    source: {
      publisher: "National Credit Union Administration",
      source_page: NCUA_QUARTERLY_PAGE_URL,
      source_url: sourceUrl,
      access_method: "public final quarterly bulk ZIP",
      api_key_used: false,
      policy_profile: "config/source-policies/ncua-quarterly.json",
    },
    limitations: [
      "The normalized organization layer includes CU_TYPE 1 and 2 federally insured credit unions, not every financial institution or every U.S. business.",
      "Branch rows are source reports as of the quarter and do not independently confirm current public access, hours, or service availability.",
      "Foreign locations and organizations not identified as federally insured by CU_TYPE are counted and excluded.",
      "SiteId is not globally unique across credit unions; location identity is scoped by charter number and SiteId.",
      "Institution, site, and establishment identities are provisional until cross-source entity resolution is applied.",
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
  if (!(await stat(releaseDirectory)).isDirectory()) throw new Error("Published NCUA release is not a directory.");
  logger(`Published ${acceptedInstitutions.toLocaleString("en-US")} NCUA institutions and ${acceptedLocations.toLocaleString("en-US")} U.S. locations.`);
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

export async function verifyNcuaQuarterly(manifestPath) {
  const absoluteManifestPath = path.resolve(manifestPath);
  const releaseDirectory = path.dirname(absoluteManifestPath);
  const manifest = JSON.parse(await readFile(absoluteManifestPath, "utf8"));
  const failures = [];
  if (manifest.dataset_id !== "ncua-quarterly-credit-unions" || manifest.status !== "published" || !manifest.complete_final_quarterly_source_snapshot) failures.push({ path: "manifest.json", reason: "unexpected or incomplete manifest" });
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
  const sourceArchiveArtifacts = manifest.artifacts?.filter((item) => item.artifact_type === "ncua-source-quarterly-zip") ?? [];
  const metadataArtifacts = manifest.artifacts?.filter((item) => item.artifact_type === "ncua-source-release-metadata") ?? [];
  if (sourceArchiveArtifacts.length !== 1) failures.push({ path: "manifest.json", reason: "expected one retained NCUA source archive" });
  if (metadataArtifacts.length !== 1) failures.push({ path: "manifest.json", reason: "expected one NCUA source metadata artifact" });
  if (sourceArchiveArtifacts.length === 1) {
    const expectedSourceReleaseId = `ncua-${manifest.cycle_date}-${sourceArchiveArtifacts[0].sha256.slice(0, 16)}`;
    if (manifest.source_release_id !== expectedSourceReleaseId) failures.push({ path: "manifest.json", reason: "source release ID is not bound to cycle and archive checksum" });
  }
  if (metadataArtifacts.length === 1 && sourceArchiveArtifacts.length === 1) {
    try {
      const metadata = JSON.parse(await readFile(path.join(releaseDirectory, metadataArtifacts[0].path), "utf8"));
      if (metadata.cycle_date !== manifest.cycle_date || metadata.archive_sha256 !== sourceArchiveArtifacts[0].sha256
        || metadata.source_table_counts?.institutions !== manifest.coverage?.source_institutions
        || metadata.source_table_counts?.branches !== manifest.coverage?.source_branch_records
        || metadata.source_table_counts?.trade_names !== manifest.coverage?.source_trade_names) throw new Error("source metadata does not reconcile");
    } catch (error) {
      failures.push({ path: metadataArtifacts[0].path, reason: `source metadata validation failed: ${error.message}` });
    }
  }
  const sourceTotal = (manifest.coverage?.source_institutions ?? 0) + (manifest.coverage?.source_branch_records ?? 0) + (manifest.coverage?.source_trade_names ?? 0);
  const accountedTotal = (manifest.coverage?.accepted_federally_insured_institutions ?? 0)
    + (manifest.coverage?.excluded_non_federally_insured_institutions ?? 0)
    + (manifest.coverage?.accepted_us_locations ?? 0)
    + (manifest.coverage?.excluded_non_federally_insured_locations ?? 0)
    + (manifest.coverage?.excluded_locations_outside_united_states ?? 0)
    + (manifest.coverage?.accepted_trade_names ?? 0)
    + (manifest.coverage?.excluded_non_federally_insured_trade_names ?? 0)
    + (manifest.coverage?.quarantined_records ?? 0);
  if (sourceTotal !== accountedTotal) failures.push({ path: "manifest.json", reason: "source rows are not fully accounted as accepted, excluded, or quarantined" });
  const institutionArtifacts = manifest.artifacts?.filter((item) => item.artifact_type === "normalized-ncua-institution-jsonl-gzip") ?? [];
  const locationArtifacts = manifest.artifacts?.filter((item) => item.artifact_type === "normalized-ncua-location-jsonl-gzip") ?? [];
  const nameArtifacts = manifest.artifacts?.filter((item) => item.artifact_type === "normalized-ncua-trade-name-jsonl-gzip") ?? [];
  if (institutionArtifacts.length !== 10 || locationArtifacts.length !== 10 || nameArtifacts.length !== 10) failures.push({ path: "manifest.json", reason: "incomplete normalized partition set" });
  const charters = new Set();
  let institutions = 0;
  for (const artifact of institutionArtifacts) {
    try {
      const partition = artifact.path.match(/charter-prefix=(\d)/)?.[1];
      const count = await forEachGzipRecord(path.join(releaseDirectory, artifact.path), (record) => {
        const charter = record.external_identifiers?.find((item) => item.type === "ncua_charter_number")?.value;
        if (!charter || charter[0] !== partition || charters.has(charter) || record.source_status?.value !== "ncua-federally-insured-credit-union-in-final-quarterly-call-report" || !record.provenance?.source_record_id || record.export_policy !== "public") throw new Error(`invalid institution ${charter}`);
        charters.add(charter);
      });
      if (count !== artifact.record_count) failures.push({ path: artifact.path, reason: "institution line count mismatch" });
      institutions += count;
    } catch (error) {
      failures.push({ path: artifact.path, reason: `institution validation failed: ${error.message}` });
    }
  }
  if (institutions !== manifest.coverage?.accepted_federally_insured_institutions) failures.push({ path: "manifest.json", reason: "institution count mismatch" });
  const locationIds = new Set();
  let locations = 0;
  for (const artifact of locationArtifacts) {
    try {
      const partition = artifact.path.match(/zip-prefix=(\d)/)?.[1];
      const count = await forEachGzipRecord(path.join(releaseDirectory, artifact.path), (record) => {
        const charter = record.external_identifiers?.find((item) => item.type === "ncua_charter_number")?.value;
        if (!charters.has(charter) || locationIds.has(record.normalized_record_id) || record.address?.zip_code?.[0] !== partition || record.source_status?.value !== "ncua-reported-us-branch-for-federally-insured-credit-union-as-of-final-quarterly-release" || record.export_policy !== "public") throw new Error(`invalid location ${record.normalized_record_id}`);
        locationIds.add(record.normalized_record_id);
      });
      if (count !== artifact.record_count) failures.push({ path: artifact.path, reason: "location line count mismatch" });
      locations += count;
    } catch (error) {
      failures.push({ path: artifact.path, reason: `location validation failed: ${error.message}` });
    }
  }
  if (locations !== manifest.coverage?.accepted_us_locations) failures.push({ path: "manifest.json", reason: "location count mismatch" });
  const tradeNameIds = new Set();
  let tradeNames = 0;
  for (const artifact of nameArtifacts) {
    try {
      const partition = artifact.path.match(/charter-prefix=(\d)/)?.[1];
      const count = await forEachGzipRecord(path.join(releaseDirectory, artifact.path), (record) => {
        if (!charters.has(record.charter_number) || record.charter_number[0] !== partition || tradeNameIds.has(record.normalized_record_id) || !record.name || record.export_policy !== "public") throw new Error(`invalid trade name ${record.normalized_record_id}`);
        tradeNameIds.add(record.normalized_record_id);
      });
      if (count !== artifact.record_count) failures.push({ path: artifact.path, reason: "trade-name line count mismatch" });
      tradeNames += count;
    } catch (error) {
      failures.push({ path: artifact.path, reason: `trade-name validation failed: ${error.message}` });
    }
  }
  if (tradeNames !== manifest.coverage?.accepted_trade_names) failures.push({ path: "manifest.json", reason: "trade-name count mismatch" });
  const quarantine = manifest.artifacts?.find((item) => item.artifact_type === "quarantine-jsonl-gzip");
  try {
    const count = await forEachGzipRecord(path.join(releaseDirectory, quarantine.path), () => {});
    if (count !== quarantine.record_count || count !== manifest.coverage.quarantined_records) throw new Error("quarantine count mismatch");
  } catch (error) {
    failures.push({ path: quarantine?.path ?? "quarantine/records.jsonl.gz", reason: error.message });
  }
  const zipArtifact = manifest.artifacts?.find((item) => item.artifact_type === "ncua-zip-coverage-jsonl");
  try {
    const rows = (await readFile(path.join(releaseDirectory, zipArtifact.path), "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse);
    if (rows.length !== zipArtifact.record_count || rows.length !== manifest.coverage.zip_union_records || new Set(rows.map((row) => row.zip_code)).size !== rows.length) throw new Error("ZIP row count or uniqueness mismatch");
    if (rows.reduce((sum, row) => sum + row.ncua_quarterly_snapshot.location_count, 0) !== locations) throw new Error("ZIP location counts do not reconcile");
    if (rows.some((row) => row.current_usps_validity?.status !== "unverified")) throw new Error("unsupported USPS validity claim");
  } catch (error) {
    failures.push({ path: zipArtifact?.path ?? "derived/zip-coverage.jsonl", reason: `ZIP validation failed: ${error.message}` });
  }
  if (failures.length) {
    const error = new Error(`NCUA quarterly release verification failed for ${failures.length} check(s).`);
    error.failures = failures;
    throw error;
  }
  return { dataset_id: manifest.dataset_id, release_id: manifest.release_id, source_release_id: manifest.source_release_id, artifact_count: manifest.artifacts.length, coverage: manifest.coverage };
}
