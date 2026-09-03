import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { lstat, mkdir, readFile, realpath, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";
import unzipper from "unzipper";
import { assertNormalizedUsPostalFieldsDeep } from "./normalized-us-postal-code.mjs";

export const IL_BUSINESS_REGISTRY_SCHEMA_VERSION = "1.0.0";
export const IL_BUSINESS_REGISTRY_TRANSFORMATION_VERSION = "il-business-registry@1.0.0";
export const IL_BUSINESS_REGISTRY_SOURCE_HOME = "https://www.ilsos.gov/data/bus-serv-home.html";

export const IL_SOURCE_LAYOUTS = Object.freeze({
  corporation_master: { width: 160, artifactType: "il-sos-corporation-master-selected-source-jsonl-gzip" },
  corporation_name: { width: 197, artifactType: "il-sos-corporation-name-selected-source-jsonl-gzip" },
  corporation_annual: { width: 126, artifactType: "il-sos-corporation-annual-selected-source-jsonl-gzip" },
  llc_master: { width: 136, artifactType: "il-sos-llc-master-selected-source-jsonl-gzip" },
  llc_name: { width: 128, artifactType: "il-sos-llc-name-selected-source-jsonl-gzip" },
});

const SOURCE_KEYS = Object.freeze(Object.keys(IL_SOURCE_LAYOUTS));
const CORP_STATUS_LABELS = Object.freeze(Object.fromEntries(Array.from({ length: 18 }, (_, index) => {
  const code = String(index).padStart(2, "0");
  return [code, code === "00" ? "Goodstanding" : code === "01" ? "Reinstated" : `documented-nonselected-status-${code}`];
})));
const LLC_STATUS_LABELS = Object.freeze(Object.fromEntries(Array.from({ length: 15 }, (_, index) => {
  const code = String(index).padStart(2, "0");
  return [code, code === "00" ? "Goodstanding" : code === "01" ? "Reinstated" : `documented-nonselected-status-${code}`];
})));
const CORP_TYPE_LABELS = Object.freeze({
  "2": "summons-or-not-qualified", "3": "registered-name-only", "4": "domestic-business-corporation",
  "5": "not-for-profit-corporation", "6": "foreign-business-corporation",
});
const US_STATE_AND_TERRITORY_CODES = new Set([
  "AL", "AK", "AS", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "GU", "HI", "ID", "IL", "IN", "IA", "KS", "KY",
  "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "MP", "OH", "OK",
  "OR", "PA", "PR", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "VI", "WA", "WV", "WI", "WY",
]);
const EXCLUDED_FIELDS = new Set(["president", "secretary", "agent", "manager", "member", "stock", "finance", "personal_address"]);
const MAX_INPUT_BYTES = 2_000_000_000;
const MAX_UNCOMPRESSED_BYTES = 2_000_000_000;

function clean(value) {
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

function parseDate(value, label, { required = false } = {}) {
  const raw = clean(value);
  if (!raw || /^0{8}$/.test(raw)) {
    if (required) throw new Error(`${label} is required.`);
    return null;
  }
  if (!/^\d{8}$/.test(raw)) throw new Error(`${label} must use CCYYMMDD.`);
  const normalized = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  const instant = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(instant.getTime()) || instant.toISOString().slice(0, 10) !== normalized) throw new Error(`${label} is not a valid date.`);
  return normalized;
}

function fileNumber(value, kind) {
  const result = clean(value);
  if (!/^\d{8}$/.test(result ?? "") || /^0{8}$/.test(result)) throw new Error(`${kind} has an invalid Illinois SOS file number.`);
  return result;
}

function slice(line, start, end) {
  return clean(line.slice(start, end));
}

export function parseIllinoisSourceRecord(kind, line) {
  const layout = IL_SOURCE_LAYOUTS[kind];
  if (!layout) throw new Error(`Unknown Illinois source document ${kind}.`);
  if (line.length !== layout.width) throw new Error(`${kind} record width ${line.length} does not equal ${layout.width}.`);
  const id = fileNumber(line.slice(0, 8), kind);
  if (kind === "corporation_master") {
    const status_code = line.slice(29, 31);
    const entity_type_code = line.slice(31, 32);
    if (!Object.hasOwn(CORP_STATUS_LABELS, status_code)) throw new Error(`Corporation ${id} has unknown status ${status_code}.`);
    if (!Object.hasOwn(CORP_TYPE_LABELS, entity_type_code)) throw new Error(`Corporation ${id} has unknown entity type ${entity_type_code}.`);
    return {
      file_number: id,
      incorporation_date: parseDate(line.slice(8, 16), `Corporation ${id} incorporation date`),
      extended_date: parseDate(line.slice(16, 24), `Corporation ${id} extended date`),
      jurisdiction_code: slice(line, 24, 26),
      intent_code: slice(line, 26, 29),
      status_code,
      entity_type_code,
      transaction_date: parseDate(line.slice(32, 40), `Corporation ${id} transaction date`),
    };
  }
  if (kind === "corporation_name" || kind === "llc_name") {
    const name = clean(line.slice(8));
    if (!name) throw new Error(`${kind} ${id} has no organization name.`);
    return { file_number: id, name };
  }
  if (kind === "corporation_annual") {
    return {
      file_number: id,
      current_report_run_date: parseDate(line.slice(43, 51), `Corporation ${id} current report run date`),
      current_report_paid_date: parseDate(line.slice(59, 67), `Corporation ${id} current report paid date`),
    };
  }
  const status_code = line.slice(14, 16);
  if (!Object.hasOwn(LLC_STATUS_LABELS, status_code)) throw new Error(`LLC ${id} has unknown status ${status_code}.`);
  return {
    file_number: id,
    purpose_code: slice(line, 8, 14),
    status_code,
    status_date: parseDate(line.slice(16, 24), `LLC ${id} status date`),
    organized_date: parseDate(line.slice(24, 32), `LLC ${id} organized date`),
    dissolution_date: parseDate(line.slice(32, 40), `LLC ${id} dissolution date`),
    management_type: slice(line, 40, 41),
    jurisdiction_organized_code: slice(line, 41, 43),
    records_office_street: slice(line, 43, 88),
    records_office_city: slice(line, 88, 118),
    records_office_zip: slice(line, 118, 127),
    records_office_jurisdiction: slice(line, 127, 129),
    source_flags: slice(line, 129, 136),
  };
}

function postalCode(value) {
  const raw = clean(value);
  if (!raw) return { raw: null, zip_code: null, postal_code: null, zip4: null, status: "missing" };
  const compact = raw.replace(/[- ]/g, "");
  const match = compact.match(/^(\d{5})(\d{4})?$/);
  if (!match || match[1] === "00000") return { raw, zip_code: null, postal_code: null, zip4: null, status: "invalid-or-non-us-format" };
  return { raw, zip_code: match[1], postal_code: match[1], zip4: match[2] ?? null, status: match[2] ? "normalized-zip-plus-4" : "normalized-zip5" };
}

function geography(zipCode, baselineByZip) {
  if (!zipCode) return { zip_code: null, zcta_match_status: "not-evaluated-without-eligible-us-records-office-address", zcta_geo_id: null, zcta_geoid: null, zcta_geometry_file: null };
  const baseline = baselineByZip?.get(zipCode);
  return {
    zip_code: zipCode,
    zcta_match_status: baseline?.geography?.status ?? "no-2020-zcta-polygon",
    zcta_geo_id: baseline?.geography?.geo_id ?? null,
    zcta_geoid: baseline?.geography?.geoid ?? null,
    zcta_geometry_file: baseline?.geography?.geometry_file ?? null,
  };
}

function provenance(context, kind, sourceRecordId) {
  return {
    source_id: `illinois-sos-${kind}-daily-files`,
    source_release_id: context.sourceReleaseId,
    source_record_id: sourceRecordId,
    source_run_date: context.sourceRunDate,
    ingest_run_id: context.runId,
    transformation_version: IL_BUSINESS_REGISTRY_TRANSFORMATION_VERSION,
    policy_id: "il-business-registry",
  };
}

export function normalizeIllinoisOrganization({ entityKind, master, name, annual = null }, context) {
  if (!master || !name || !["corporation", "llc"].includes(entityKind)) throw new Error("Illinois normalization requires an entity kind, master record, and name record.");
  const id = master.file_number;
  if (name.file_number !== id || (annual && annual.file_number !== id)) throw new Error(`Illinois source joins do not match for ${id}.`);
  const isCorporation = entityKind === "corporation";
  const active = ["00", "01"].includes(master.status_code) && (!isCorporation || ["4", "5", "6"].includes(master.entity_type_code));
  if (!active) throw new Error(`Illinois ${entityKind} ${id} is outside the selected active organization scope.`);
  const statusLabels = isCorporation ? CORP_STATUS_LABELS : LLC_STATUS_LABELS;
  const addressPostal = postalCode(isCorporation ? null : master.records_office_zip);
  const stateSource = isCorporation ? null : clean(master.records_office_jurisdiction)?.toUpperCase();
  const stateCode = stateSource && US_STATE_AND_TERRITORY_CODES.has(stateSource) ? stateSource : null;
  const recordsOfficeAddress = isCorporation ? null : {
    street: master.records_office_street,
    city: master.records_office_city,
    state_source: stateSource,
    state_code: stateCode,
    postal_code_raw: addressPostal.raw,
    zip_code: addressPostal.zip_code,
    postal_code: addressPostal.postal_code,
    zip4: addressPostal.zip4,
    postal_normalization_status: addressPostal.status,
    address_scope: "secretary-of-state-records-office-address-not-verified-physical-operating-site",
    eligible_for_us_zip_coverage: Boolean(master.records_office_street && master.records_office_city && stateCode && addressPostal.zip_code),
  };
  const possibleNgs = Boolean(isCorporation && annual?.current_report_run_date && !annual.current_report_paid_date);
  const organizationId = `organization:il_sos_${entityKind}_${id}`;
  const record = {
    schema_version: IL_BUSINESS_REGISTRY_SCHEMA_VERSION,
    normalized_record_id: `il-business-registry:organization:${entityKind}:${id}`,
    entity_candidates: { organization_id: organizationId, identity_status: "provisional" },
    external_identifiers: [{
      type: "il_sos_file_number",
      value: id,
      entity_kind: entityKind,
      check_digit_method: "source-documented-modified-modulus-11",
      check_digit_validation: "not-recomputed-algorithm-not-published",
    }],
    legal_name: name.name,
    other_names: [],
    records_office_address: recordsOfficeAddress,
    geography: geography(recordsOfficeAddress?.eligible_for_us_zip_coverage ? recordsOfficeAddress.zip_code : null, context.baselineByZip),
    registration_profile: isCorporation ? {
      entity_kind: entityKind,
      entity_type_code: master.entity_type_code,
      entity_type: CORP_TYPE_LABELS[master.entity_type_code],
      jurisdiction_code: master.jurisdiction_code,
      intent_code: master.intent_code,
      incorporation_date: master.incorporation_date,
      extended_date: master.extended_date,
      transaction_date: master.transaction_date,
    } : {
      entity_kind: entityKind,
      purpose_code: master.purpose_code,
      management_type: master.management_type,
      jurisdiction_organized_code: master.jurisdiction_organized_code,
      organized_date: master.organized_date,
      dissolution_date: master.dissolution_date,
      status_date: master.status_date,
      source_flags: master.source_flags,
    },
    annual_report_evidence: isCorporation ? {
      current_report_run_date: annual?.current_report_run_date ?? null,
      current_report_paid_date: annual?.current_report_paid_date ?? null,
      possible_not_goodstanding_due_to_mailed_unpaid_report: possibleNgs,
      month_rule_evaluation: possibleNgs ? "not-evaluated-published-rule-is-ambiguous" : "not-applicable-from-published-inputs",
    } : null,
    source_status: {
      code: master.status_code,
      label: statusLabels[master.status_code],
      value: "listed-goodstanding-or-reinstated-in-illinois-sos-daily-files",
      semantics: "source-registration-status-not-independent-proof-of-current-operations-or-a-physical-site",
    },
    observed_at: `${context.sourceRunDate}T00:00:00.000Z`,
    provenance: provenance(context, entityKind, id),
    export_policy: "local-review-only",
  };
  assertNormalizedUsPostalFieldsDeep(record);
  return record;
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

async function openGzipWriter(stagingDirectory, relativePath) {
  const destination = path.join(stagingDirectory, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp-${randomUUID()}`;
  const output = createWriteStream(temporary, { flags: "wx" });
  const gzip = createGzip({ level: 9 });
  gzip.pipe(output);
  return { relativePath: relativePath.replaceAll("\\", "/"), destination, temporary, output, gzip, records: 0, closed: false };
}

async function writeGzipRecord(writer, record) {
  if (!writer.gzip.write(json(record))) await once(writer.gzip, "drain");
  writer.records += 1;
}

async function closeGzipWriter(writer, artifactType, metadata = {}) {
  writer.gzip.end();
  await finished(writer.output);
  await renameWithRetry(writer.temporary, writer.destination);
  writer.closed = true;
  return { path: writer.relativePath, ...(await hashFile(writer.destination)), record_count: writer.records, artifact_type: artifactType, ...metadata };
}

function abortGzipWriters(writers) {
  for (const writer of writers) if (!writer.closed) {
    writer.gzip.destroy();
    writer.output.destroy();
  }
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
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`${label} escapes its allowed directory.`);
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

async function* byteLines(stream) {
  let pending = Buffer.alloc(0);
  for await (const chunk of stream) {
    pending = pending.length ? Buffer.concat([pending, chunk]) : Buffer.from(chunk);
    let delimiter;
    while ((delimiter = pending.indexOf(0x0a)) >= 0) {
      let line = pending.subarray(0, delimiter);
      pending = pending.subarray(delimiter + 1);
      if (line.at(-1) === 0x0d) line = line.subarray(0, -1);
      yield new TextDecoder("windows-1252", { fatal: false }).decode(line);
    }
  }
  if (pending.length) {
    if (pending.at(-1) === 0x0d) pending = pending.subarray(0, -1);
    yield new TextDecoder("windows-1252", { fatal: false }).decode(pending);
  }
}

async function openSafeInput(sourcePath, allowedRoot) {
  const root = await realpath(path.resolve(allowedRoot));
  const resolved = await realpath(path.resolve(sourcePath));
  assertContained(root, resolved, "Illinois source input");
  const info = await lstat(resolved);
  if (!info.isFile() || info.size <= 0 || info.size > MAX_INPUT_BYTES) throw new Error("Illinois source input must be a non-empty bounded regular file.");
  const inputHash = await hashFile(resolved);
  if (path.extname(resolved).toLowerCase() !== ".zip") return { stream: createReadStream(resolved), input: { ...inputHash, archive: false, basename: path.basename(resolved) } };
  const directory = await unzipper.Open.file(resolved);
  const files = directory.files.filter((entry) => entry.type === "File");
  if (files.length !== 1) throw new Error("Each Illinois ZIP input must contain exactly one regular file.");
  const entry = files[0];
  if (!entry.path || entry.path.includes("..") || path.isAbsolute(entry.path) || entry.path.includes("/") || entry.path.includes("\\")) throw new Error(`Unsafe Illinois archive entry ${entry.path}.`);
  const uncompressedBytes = Number(entry.uncompressedSize ?? entry.vars?.uncompressedSize ?? 0);
  if (!Number.isSafeInteger(uncompressedBytes) || uncompressedBytes <= 0 || uncompressedBytes > MAX_UNCOMPRESSED_BYTES) throw new Error("Illinois archive member size is invalid or exceeds the configured limit.");
  return { stream: entry.stream(), input: { ...inputHash, archive: true, basename: path.basename(resolved), member: entry.path, uncompressed_bytes: uncompressedBytes } };
}

async function openSource(kind, { sourcePaths, sourceDocuments, allowedRoot }) {
  if (sourceDocuments) {
    if (!Object.hasOwn(sourceDocuments, kind)) throw new Error(`Missing Illinois fixture document ${kind}.`);
    const buffer = Buffer.isBuffer(sourceDocuments[kind]) ? sourceDocuments[kind] : Buffer.from(String(sourceDocuments[kind]), "latin1");
    if (!buffer.length || buffer.length > MAX_INPUT_BYTES) throw new Error(`${kind} fixture document is empty or too large.`);
    return { stream: Readable.from([buffer]), input: { bytes: buffer.length, sha256: sha256(buffer), archive: false, basename: `${kind}.fixture.txt`, fixture: true } };
  }
  if (!sourcePaths || !Object.hasOwn(sourcePaths, kind)) throw new Error(`Missing Illinois source path ${kind}.`);
  if (!allowedRoot) throw new Error("allowedRoot is required for operator-supplied Illinois source paths.");
  return openSafeInput(sourcePaths[kind], allowedRoot);
}

async function parseDocument(kind, options, writer, onRecord, signal) {
  const { stream, input } = await openSource(kind, options);
  let header = null;
  let trailer = null;
  let count = 0;
  for await (const line of byteLines(stream)) {
    signal?.throwIfAborted?.();
    if (!header) {
      const match = line.trimEnd().match(/^RUN DATE\s*=\s*(\d{8})\s+FILE:\s*(.+?)\s*$/i);
      if (!match) throw new Error(`${kind} does not start with the official RUN DATE/FILE header.`);
      header = { run_date: parseDate(match[1], `${kind} run date`, { required: true }), source_file_name: match[2] };
      continue;
    }
    if (trailer) throw new Error(`${kind} contains data after its END OF FILE trailer.`);
    const trailerMatch = line.trimEnd().match(/^END OF FILE RECORD COUNT=\s*(\d{1,7})\s*$/i);
    if (trailerMatch) {
      trailer = { declared_record_count: Number(trailerMatch[1]) };
      continue;
    }
    if (!line.length) throw new Error(`${kind} contains a blank record.`);
    const record = parseIllinoisSourceRecord(kind, line);
    await writeGzipRecord(writer, record);
    await onRecord(record);
    count += 1;
  }
  if (!header || !trailer) throw new Error(`${kind} is missing its official header or trailer.`);
  if (trailer.declared_record_count !== count) throw new Error(`${kind} trailer count ${trailer.declared_record_count} does not match ${count} parsed records.`);
  return { ...header, ...trailer, parsed_record_count: count, input };
}

function assertSameSet(left, right, label) {
  if (left.size !== right.size) throw new Error(`${label} file-number sets differ in size (${left.size} versus ${right.size}).`);
  for (const value of left) if (!right.has(value)) throw new Error(`${label} is missing file number ${value}.`);
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
      il_business_registry_active_snapshot: {
        status: count ? "published-eligible-llc-records-office-addresses" : "no-eligible-llc-records-office-address-in-current-source-snapshot",
        organization_records_office_address_count: count,
        source_release_id: context.sourceReleaseId,
        source_run_date: context.sourceRunDate,
        physical_site_count: null,
        physical_site_inference_permitted: false,
      },
    };
  });
}

export async function buildIllinoisBusinessRegistry({
  outputRoot,
  zbpPointer,
  sourcePaths = null,
  sourceDocuments = null,
  allowedRoot = null,
  minimumOrganizations = 500_000,
  signal,
  logger = console.log,
  now = () => new Date(),
} = {}) {
  if (!outputRoot || !zbpPointer) throw new Error("outputRoot and zbpPointer are required.");
  if (Boolean(sourcePaths) === Boolean(sourceDocuments)) throw new Error("Provide exactly one of sourcePaths or sourceDocuments.");
  if (!Number.isInteger(minimumOrganizations) || minimumOrganizations < 1) throw new Error("minimumOrganizations must be a positive integer.");
  for (const key of SOURCE_KEYS) if (!(key in (sourcePaths ?? sourceDocuments ?? {}))) throw new Error(`Illinois input ${key} is required.`);
  signal?.throwIfAborted?.();
  const retrievedAt = now().toISOString();
  const runId = randomUUID();
  const releaseId = `il-business-registry-${releaseTimestamp(retrievedAt)}-${runId.slice(0, 8)}`;
  const stagingDirectory = path.join(outputRoot, ".staging", runId);
  await mkdir(stagingDirectory, { recursive: true });
  const baseline = await loadZbpBaseline(zbpPointer);
  const sourceWriters = new Map();
  for (const key of SOURCE_KEYS) sourceWriters.set(key, await openGzipWriter(stagingDirectory, `source/${key.replaceAll("_", "-")}.selected.jsonl.gz`));
  const corporationMasterIds = new Set();
  const corporationNameIds = new Set();
  const corporationAnnualIds = new Set();
  const llcMasterIds = new Set();
  const llcNameIds = new Set();
  const activeCorporations = new Map();
  const activeCorporationNames = new Map();
  const activeCorporationAnnual = new Map();
  const activeLlcs = new Map();
  const activeLlcNames = new Map();
  const documentMetadata = {};
  const addUnique = (set, id, label) => {
    if (set.has(id)) throw new Error(`Duplicate Illinois file number ${id} in ${label}.`);
    set.add(id);
  };
  try {
    documentMetadata.corporation_master = await parseDocument("corporation_master", { sourcePaths, sourceDocuments, allowedRoot }, sourceWriters.get("corporation_master"), async (record) => {
      addUnique(corporationMasterIds, record.file_number, "corporation_master");
      if (["00", "01"].includes(record.status_code) && ["4", "5", "6"].includes(record.entity_type_code)) activeCorporations.set(record.file_number, record);
    }, signal);
    documentMetadata.corporation_name = await parseDocument("corporation_name", { sourcePaths, sourceDocuments, allowedRoot }, sourceWriters.get("corporation_name"), async (record) => {
      addUnique(corporationNameIds, record.file_number, "corporation_name");
      if (activeCorporations.has(record.file_number)) activeCorporationNames.set(record.file_number, record);
    }, signal);
    documentMetadata.corporation_annual = await parseDocument("corporation_annual", { sourcePaths, sourceDocuments, allowedRoot }, sourceWriters.get("corporation_annual"), async (record) => {
      addUnique(corporationAnnualIds, record.file_number, "corporation_annual");
      if (activeCorporations.has(record.file_number)) activeCorporationAnnual.set(record.file_number, record);
    }, signal);
    documentMetadata.llc_master = await parseDocument("llc_master", { sourcePaths, sourceDocuments, allowedRoot }, sourceWriters.get("llc_master"), async (record) => {
      addUnique(llcMasterIds, record.file_number, "llc_master");
      if (["00", "01"].includes(record.status_code)) activeLlcs.set(record.file_number, record);
    }, signal);
    documentMetadata.llc_name = await parseDocument("llc_name", { sourcePaths, sourceDocuments, allowedRoot }, sourceWriters.get("llc_name"), async (record) => {
      addUnique(llcNameIds, record.file_number, "llc_name");
      if (activeLlcs.has(record.file_number)) activeLlcNames.set(record.file_number, record);
    }, signal);
    assertSameSet(corporationMasterIds, corporationNameIds, "Corporation master/name join");
    assertSameSet(corporationMasterIds, corporationAnnualIds, "Corporation master/annual join");
    assertSameSet(llcMasterIds, llcNameIds, "LLC master/name join");
    const runDates = new Set(Object.values(documentMetadata).map((item) => item.run_date));
    if (runDates.size !== 1) throw new Error(`Illinois daily files have mixed RUN DATE values: ${[...runDates].join(", ")}.`);
  } catch (error) {
    abortGzipWriters([...sourceWriters.values()]);
    throw error;
  }
  const sourceArtifacts = await Promise.all(SOURCE_KEYS.map((key) => closeGzipWriter(sourceWriters.get(key), IL_SOURCE_LAYOUTS[key].artifactType, { export_policy: "local-review-only" })));
  const sourceRunDate = documentMetadata.corporation_master.run_date;
  const inputDigestMaterial = SOURCE_KEYS.map((key) => `${key}:${documentMetadata[key].input.sha256}`).join("\u0000");
  const sourceReleaseDigest = sha256(`${sourceRunDate}\u0000${inputDigestMaterial}`);
  const sourceReleaseId = `il-business-registry-${sourceRunDate}-${sourceReleaseDigest.slice(0, 16)}`;
  const context = { runId, retrievedAt, sourceRunDate, sourceReleaseId, baselineByZip: baseline.byZip };
  const writers = new Map();
  for (const prefix of "0123456789abcdef") writers.set(prefix, await openGzipWriter(stagingDirectory, `derived/organizations/id-hash-prefix=${prefix}.jsonl.gz`));
  const countsByZip = new Map();
  const statuses = new Map();
  const entityTypes = new Map();
  let organizations = 0;
  let corporations = 0;
  let llcs = 0;
  let eligibleRecordsOfficeAddresses = 0;
  let possibleNgs = 0;
  try {
    for (const id of [...activeCorporations.keys()].sort()) {
      signal?.throwIfAborted?.();
      const record = normalizeIllinoisOrganization({ entityKind: "corporation", master: activeCorporations.get(id), name: activeCorporationNames.get(id), annual: activeCorporationAnnual.get(id) }, context);
      await writeGzipRecord(writers.get(sha256(`corporation:${id}`)[0]), record);
      increment(statuses, record.source_status.code);
      increment(entityTypes, record.registration_profile.entity_type);
      if (record.annual_report_evidence.possible_not_goodstanding_due_to_mailed_unpaid_report) possibleNgs += 1;
      organizations += 1;
      corporations += 1;
    }
    for (const id of [...activeLlcs.keys()].sort()) {
      signal?.throwIfAborted?.();
      const record = normalizeIllinoisOrganization({ entityKind: "llc", master: activeLlcs.get(id), name: activeLlcNames.get(id) }, context);
      await writeGzipRecord(writers.get(sha256(`llc:${id}`)[0]), record);
      increment(statuses, record.source_status.code);
      increment(entityTypes, "limited-liability-company");
      if (record.records_office_address.eligible_for_us_zip_coverage) {
        const zipCode = record.records_office_address.zip_code;
        countsByZip.set(zipCode, (countsByZip.get(zipCode) ?? 0) + 1);
        eligibleRecordsOfficeAddresses += 1;
      }
      organizations += 1;
      llcs += 1;
    }
  } catch (error) {
    abortGzipWriters([...writers.values()]);
    throw error;
  }
  if (organizations < minimumOrganizations) {
    abortGzipWriters([...writers.values()]);
    throw new Error(`Illinois selected organization count ${organizations} is below the ${minimumOrganizations} quality floor.`);
  }
  const artifacts = [...sourceArtifacts, ...await Promise.all([...writers.values()].map((writer) => closeGzipWriter(writer, "normalized-il-business-organization-jsonl-gzip", { export_policy: "local-review-only" })))];
  const coverageRows = buildZipCoverage(baseline.rows, countsByZip, context);
  artifacts.push(await writeArtifact(stagingDirectory, "derived/zip-coverage.jsonl", jsonLines(coverageRows), { artifact_type: "il-business-registry-zip-coverage-jsonl", record_count: coverageRows.length, export_policy: "local-review-only" }));
  artifacts.push(await writeArtifact(stagingDirectory, "derived/source-summary.json", json({
    source_rows: Object.fromEntries(SOURCE_KEYS.map((key) => [key, documentMetadata[key].parsed_record_count])),
    active_organizations: organizations,
    active_corporations: corporations,
    active_llcs: llcs,
    eligible_llc_records_office_addresses: eligibleRecordsOfficeAddresses,
    organizations_without_eligible_records_office_zip: organizations - eligibleRecordsOfficeAddresses,
    possible_corporation_ngs_month_rule_not_evaluated: possibleNgs,
    source_statuses: sortedCounts(statuses),
    entity_types: sortedCounts(entityTypes),
  }), { artifact_type: "il-business-registry-source-summary", export_policy: "local-review-only" }));
  const releaseMetadataArtifact = await writeArtifact(stagingDirectory, "source/release-metadata.json", json({
    source_run_date: sourceRunDate,
    documents: documentMetadata,
    source_layout_version: "Illinois SOS corporation and LLC layouts version 004, 2024-04-04",
    source_urls: {
      data_transparency: IL_BUSINESS_REGISTRY_SOURCE_HOME,
      corporation_specification: "https://www.ilsos.gov/content/dam/data/bs/proc_corp_data.pdf",
      llc_specification: "https://www.ilsos.gov/content/dam/data/bs/proc_llc_data.pdf",
    },
    selection: { corporation_status_codes: ["00", "01"], corporation_type_codes: ["4", "5", "6"], llc_status_codes: ["00", "01"] },
    privacy_exclusions: ["corporation president name/address", "corporation secretary name/address", "registered agents", "LLC managers/members", "stock and finance fields"],
    file_number_check_digit_validation: "not-recomputed-because-the-source-documents-name-modified-modulus-11-but-do-not-publish-the-algorithm",
    acquisition: sourceDocuments ? "explicit-test-fixture-documents" : "offline-operator-supplied-official-files-no-web-automation",
  }), { artifact_type: "il-business-registry-source-release-metadata", export_policy: "local-review-only" });
  artifacts.push(releaseMetadataArtifact);
  const manifest = {
    schema_version: IL_BUSINESS_REGISTRY_SCHEMA_VERSION,
    dataset_id: "il-business-registry-active-organizations",
    connector: { id: "il-business-registry", version: "1.0.0" },
    release_id: releaseId,
    run_id: runId,
    retrieved_at: retrievedAt,
    source_run_date: sourceRunDate,
    source_release_id: sourceReleaseId,
    status: "published",
    export_policy: "local-review-only",
    complete_official_daily_file_set: true,
    coverage: {
      source_records: Object.fromEntries(SOURCE_KEYS.map((key) => [key, documentMetadata[key].parsed_record_count])),
      active_organizations_published: organizations,
      active_corporations_published: corporations,
      active_llcs_published: llcs,
      eligible_llc_records_office_addresses: eligibleRecordsOfficeAddresses,
      source_zip_codes: countsByZip.size,
      zip_union_records: coverageRows.length,
      possible_corporation_ngs_month_rule_not_evaluated: possibleNgs,
      physical_sites: null,
      establishments: null,
    },
    quality_gates: {
      minimum_organizations: minimumOrganizations,
      minimum_organizations_met: organizations >= minimumOrganizations,
      all_document_run_dates_match: true,
      all_header_trailer_counts_match: true,
      corporation_master_name_join_exact: true,
      corporation_master_annual_join_exact: true,
      llc_master_name_join_exact: true,
      duplicate_file_numbers: 0,
      file_number_numeric_syntax_valid: true,
      modified_modulus_11_check_digit_recomputed: false,
      prohibited_person_fields_retained: false,
      network_requests: 0,
    },
    dependencies: [
      { dataset_id: baseline.manifest.dataset_id, release_id: baseline.manifest.release_id, manifest_sha256: baseline.manifestSha256 },
      baseline.manifest.geography_dependency,
    ],
    source: {
      publisher: "Illinois Secretary of State, Business Services",
      source_page: IL_BUSINESS_REGISTRY_SOURCE_HOME,
      access_method: sourceDocuments ? "explicit test fixture documents" : "offline operator-supplied official daily files; no automated website queries",
      policy_profile: "config/source-policies/il-business-registry.json",
      unattended_download_authorized: false,
    },
    limitations: [
      "The Illinois Secretary of State prohibits automated queries to its website; this connector performs no network requests and accepts only operator-supplied official files.",
      "Goodstanding or Reinstated is source-specific registration evidence, not independent proof of current operations, solvency, licensure, public access, or an open storefront.",
      "LLC records-office addresses are administrative evidence and never create physical-site or establishment identities; corporation officer addresses are excluded entirely.",
      "The published corporation NGS rule includes an ambiguous month condition. Mailed-but-unpaid annual-report inputs are preserved and flagged, but the month rule is not guessed.",
      "The source documents state that file numbers use a modified modulus-11 check digit but do not publish the algorithm, so numeric syntax, uniqueness, and joins are validated without claiming independent check-digit verification.",
      "All source-derived outputs remain local-review-only pending written source confirmation and a redistribution review.",
      "Current USPS ZIP validity remains source-dependent; ZIP5 and ZIP+4 are stored separately.",
    ],
    artifacts,
  };
  await writeArtifact(stagingDirectory, "manifest.json", json(manifest));
  const publication = await publishIllinoisBusinessRegistryStaging({ outputRoot, stagingRunId: runId, expectedReleaseId: releaseId });
  logger(`Published ${organizations.toLocaleString("en-US")} Illinois active organization records for local review.`);
  return { manifest, releaseDirectory: publication.releaseDirectory, pointerPath: publication.pointerPath };
}

async function* gzipRecords(filename) {
  let pending = "";
  for await (const chunk of createReadStream(filename).pipe(createGunzip())) {
    pending += chunk.toString("utf8");
    let delimiter;
    while ((delimiter = pending.indexOf("\n")) >= 0) {
      const line = pending.slice(0, delimiter);
      pending = pending.slice(delimiter + 1);
      if (line) yield JSON.parse(line);
    }
  }
  if (pending.trim()) yield JSON.parse(pending);
}

function containsExcludedField(value) {
  if (Array.isArray(value)) return value.some(containsExcludedField);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) => EXCLUDED_FIELDS.has(key.toLowerCase()) || containsExcludedField(child));
}

export async function publishIllinoisBusinessRegistryStaging({ outputRoot, stagingRunId, expectedReleaseId = null } = {}) {
  if (!outputRoot || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stagingRunId ?? "")) throw new Error("outputRoot and a valid stagingRunId are required.");
  const stagingRoot = path.join(outputRoot, ".staging");
  const stagingDirectory = path.resolve(stagingRoot, stagingRunId);
  assertContained(stagingRoot, stagingDirectory, "Illinois staging run");
  const manifestPath = path.join(stagingDirectory, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.run_id !== stagingRunId || manifest.dataset_id !== "il-business-registry-active-organizations" || manifest.status !== "published") throw new Error("Illinois staging manifest does not match the requested complete run.");
  if (expectedReleaseId && manifest.release_id !== expectedReleaseId) throw new Error("Illinois staging release ID does not match the build result.");
  await verifyIllinoisBusinessRegistry(manifestPath);
  const releasesDirectory = path.join(outputRoot, "releases");
  await mkdir(releasesDirectory, { recursive: true });
  const releaseDirectory = path.join(releasesDirectory, manifest.release_id);
  try {
    await stat(releaseDirectory);
    throw new Error(`Illinois release destination already exists: ${manifest.release_id}.`);
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

export async function verifyIllinoisBusinessRegistry(manifestPath) {
  const absoluteManifestPath = path.resolve(manifestPath);
  const releaseDirectory = path.dirname(absoluteManifestPath);
  const manifest = JSON.parse(await readFile(absoluteManifestPath, "utf8"));
  const failures = [];
  if (manifest.dataset_id !== "il-business-registry-active-organizations" || manifest.status !== "published" || manifest.export_policy !== "local-review-only" || !manifest.complete_official_daily_file_set) failures.push({ path: "manifest.json", reason: "unexpected, incomplete, or non-review-only manifest" });
  for (const [gate, value] of Object.entries(manifest.quality_gates ?? {})) {
    if (["minimum_organizations", "duplicate_file_numbers"].includes(gate) || gate === "modified_modulus_11_check_digit_recomputed") continue;
    if (gate === "prohibited_person_fields_retained" || gate === "network_requests") {
      if (value !== false && value !== 0) failures.push({ path: `manifest.json:quality_gates.${gate}`, reason: "quality gate failed" });
    } else if (value !== true) failures.push({ path: `manifest.json:quality_gates.${gate}`, reason: "quality gate failed" });
  }
  if (manifest.quality_gates?.duplicate_file_numbers !== 0 || manifest.quality_gates?.modified_modulus_11_check_digit_recomputed !== false || !Number.isInteger(manifest.quality_gates?.minimum_organizations) || manifest.quality_gates.minimum_organizations < 1) failures.push({ path: "manifest.json:quality_gates", reason: "invalid duplicate, check-digit, or minimum-organization declaration" });
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
  const sourceArtifacts = manifest.artifacts?.filter((artifact) => artifact.artifact_type?.startsWith("il-sos-") && artifact.artifact_type.endsWith("selected-source-jsonl-gzip")) ?? [];
  const expectedSourceTypes = new Set(SOURCE_KEYS.map((key) => IL_SOURCE_LAYOUTS[key].artifactType));
  if (sourceArtifacts.length !== 5 || sourceArtifacts.some((artifact) => !expectedSourceTypes.has(artifact.artifact_type) || artifact.export_policy !== "local-review-only") || [...expectedSourceTypes].some((type) => sourceArtifacts.filter((artifact) => artifact.artifact_type === type).length !== 1)) failures.push({ path: "manifest.json", reason: "expected one of each of the five local-review-only selected source artifacts" });
  const metadataArtifact = manifest.artifacts?.find((artifact) => artifact.artifact_type === "il-business-registry-source-release-metadata");
  if (!metadataArtifact) failures.push({ path: "manifest.json", reason: "missing source release metadata" });
  else {
    try {
      const metadata = JSON.parse(await readFile(path.join(releaseDirectory, metadataArtifact.path), "utf8"));
      const inputMaterial = SOURCE_KEYS.map((key) => `${key}:${metadata.documents[key].input.sha256}`).join("\u0000");
      const digest = sha256(`${metadata.source_run_date}\u0000${inputMaterial}`);
      if (manifest.source_release_id !== `il-business-registry-${metadata.source_run_date}-${digest.slice(0, 16)}` || metadata.source_run_date !== manifest.source_run_date) throw new Error("source release identity is not bound to all five input checksums and the common run date");
      if (new Set(SOURCE_KEYS.map((key) => metadata.documents[key].run_date)).size !== 1) throw new Error("metadata contains mixed source run dates");
    } catch (error) {
      failures.push({ path: metadataArtifact.path, reason: error.message });
    }
  }
  const sourceRecordsByKey = new Map();
  for (const artifact of sourceArtifacts) {
    try {
      let count = 0;
      const ids = new Set();
      const records = new Map();
      for await (const record of gzipRecords(path.join(releaseDirectory, artifact.path))) {
        if (!/^\d{8}$/.test(record.file_number ?? "") || ids.has(record.file_number) || containsExcludedField(record)) throw new Error(`invalid, duplicate, or non-minimized source record ${record.file_number}`);
        ids.add(record.file_number);
        records.set(record.file_number, record);
        count += 1;
      }
      if (count !== artifact.record_count) throw new Error("source artifact count mismatch");
      const key = SOURCE_KEYS.find((candidate) => IL_SOURCE_LAYOUTS[candidate].artifactType === artifact.artifact_type);
      if (!key || manifest.coverage?.source_records?.[key] !== count) throw new Error("source artifact does not reconcile to the manifest source count");
      sourceRecordsByKey.set(key, records);
    } catch (error) {
      failures.push({ path: artifact.path, reason: `source validation failed: ${error.message}` });
    }
  }
  if (sourceRecordsByKey.size === 5) {
    try {
      assertSameSet(new Set(sourceRecordsByKey.get("corporation_master").keys()), new Set(sourceRecordsByKey.get("corporation_name").keys()), "Verified corporation master/name join");
      assertSameSet(new Set(sourceRecordsByKey.get("corporation_master").keys()), new Set(sourceRecordsByKey.get("corporation_annual").keys()), "Verified corporation master/annual join");
      assertSameSet(new Set(sourceRecordsByKey.get("llc_master").keys()), new Set(sourceRecordsByKey.get("llc_name").keys()), "Verified LLC master/name join");
    } catch (error) {
      failures.push({ path: "manifest.json", reason: error.message });
    }
  }
  const normalizedArtifacts = manifest.artifacts?.filter((artifact) => artifact.artifact_type === "normalized-il-business-organization-jsonl-gzip") ?? [];
  if (normalizedArtifacts.length !== 16 || normalizedArtifacts.some((artifact) => artifact.export_policy !== "local-review-only")) failures.push({ path: "manifest.json", reason: "expected 16 local-review-only normalized partitions" });
  const identities = new Set();
  const countsByZip = new Map();
  let organizations = 0;
  let corporations = 0;
  let llcs = 0;
  let eligibleAddresses = 0;
  for (const artifact of normalizedArtifacts) {
    try {
      const prefix = artifact.path.match(/id-hash-prefix=([0-9a-f])/)?.[1];
      let partitionCount = 0;
      for await (const record of gzipRecords(path.join(releaseDirectory, artifact.path))) {
        assertNormalizedUsPostalFieldsDeep(record);
        const identifier = record.external_identifiers?.find((item) => item.type === "il_sos_file_number");
        const identity = `${identifier?.entity_kind}:${identifier?.value}`;
        if (!identifier || identities.has(identity) || sha256(identity)[0] !== prefix) throw new Error(`duplicate, missing, or incorrectly partitioned identity ${identity}`);
        identities.add(identity);
        if (record.entity_candidates?.physical_site_id || record.entity_candidates?.establishment_id || record.export_policy !== "local-review-only" || containsExcludedField(record)) throw new Error(`invalid non-site or privacy contract for ${identity}`);
        if (record.provenance?.source_release_id !== manifest.source_release_id || record.provenance?.policy_id !== "il-business-registry" || record.provenance?.source_run_date !== manifest.source_run_date) throw new Error(`invalid provenance for ${identity}`);
        if (record.source_status?.value !== "listed-goodstanding-or-reinstated-in-illinois-sos-daily-files") throw new Error(`invalid selected status for ${identity}`);
        if (identifier.entity_kind === "corporation") {
          corporations += 1;
          if (record.records_office_address !== null) throw new Error(`corporation address leakage for ${identity}`);
          const master = sourceRecordsByKey.get("corporation_master")?.get(identifier.value);
          const name = sourceRecordsByKey.get("corporation_name")?.get(identifier.value);
          const annual = sourceRecordsByKey.get("corporation_annual")?.get(identifier.value);
          if (!master || !name || !annual || !["00", "01"].includes(master.status_code) || !["4", "5", "6"].includes(master.entity_type_code) || name.name !== record.legal_name || annual.current_report_run_date !== record.annual_report_evidence?.current_report_run_date || annual.current_report_paid_date !== record.annual_report_evidence?.current_report_paid_date) throw new Error(`corporation does not reconcile to its selected source records for ${identity}`);
        } else if (identifier.entity_kind === "llc") {
          llcs += 1;
          if (record.records_office_address?.address_scope !== "secretary-of-state-records-office-address-not-verified-physical-operating-site") throw new Error(`invalid LLC address scope for ${identity}`);
          const master = sourceRecordsByKey.get("llc_master")?.get(identifier.value);
          const name = sourceRecordsByKey.get("llc_name")?.get(identifier.value);
          if (!master || !name || !["00", "01"].includes(master.status_code) || name.name !== record.legal_name) throw new Error(`LLC does not reconcile to its selected source records for ${identity}`);
          if (record.records_office_address.eligible_for_us_zip_coverage) {
            const zipCode = record.records_office_address.zip_code;
            if (!/^\d{5}$/.test(zipCode ?? "")) throw new Error(`invalid eligible ZIP for ${identity}`);
            countsByZip.set(zipCode, (countsByZip.get(zipCode) ?? 0) + 1);
            eligibleAddresses += 1;
          }
        } else throw new Error(`unknown Illinois entity kind for ${identity}`);
        partitionCount += 1;
      }
      if (partitionCount !== artifact.record_count) throw new Error("normalized partition count mismatch");
      organizations += partitionCount;
    } catch (error) {
      failures.push({ path: artifact.path, reason: `normalized validation failed: ${error.message}` });
    }
  }
  if (organizations !== manifest.coverage?.active_organizations_published || corporations !== manifest.coverage?.active_corporations_published || llcs !== manifest.coverage?.active_llcs_published || eligibleAddresses !== manifest.coverage?.eligible_llc_records_office_addresses) failures.push({ path: "manifest.json", reason: "normalized counts do not reconcile" });
  if (organizations < manifest.quality_gates?.minimum_organizations) failures.push({ path: "manifest.json", reason: "normalized count is below the manifest quality floor" });
  if (sourceRecordsByKey.size === 5) {
    const selectedSourceIdentities = new Set();
    for (const record of sourceRecordsByKey.get("corporation_master").values()) if (["00", "01"].includes(record.status_code) && ["4", "5", "6"].includes(record.entity_type_code)) selectedSourceIdentities.add(`corporation:${record.file_number}`);
    for (const record of sourceRecordsByKey.get("llc_master").values()) if (["00", "01"].includes(record.status_code)) selectedSourceIdentities.add(`llc:${record.file_number}`);
    if (selectedSourceIdentities.size !== identities.size || [...selectedSourceIdentities].some((identity) => !identities.has(identity))) failures.push({ path: "manifest.json", reason: "normalized identities do not exactly equal the selected source identities" });
  }
  const zipArtifact = manifest.artifacts?.find((artifact) => artifact.artifact_type === "il-business-registry-zip-coverage-jsonl");
  if (!zipArtifact) failures.push({ path: "manifest.json", reason: "missing ZIP coverage artifact" });
  else {
    try {
      const rows = (await readFile(path.join(releaseDirectory, zipArtifact.path), "utf8")).split(/\r?\n/).filter(Boolean).map(JSON.parse);
      if (rows.length !== zipArtifact.record_count || rows.length !== manifest.coverage?.zip_union_records) throw new Error("ZIP row count mismatch");
      let total = 0;
      for (const row of rows) {
        const value = row.il_business_registry_active_snapshot;
        if ((countsByZip.get(row.zip_code) ?? 0) !== value.organization_records_office_address_count || value.physical_site_count !== null || value.physical_site_inference_permitted !== false) throw new Error(`ZIP ${row.zip_code} does not reconcile or implies a physical site`);
        total += value.organization_records_office_address_count;
      }
      if (total !== eligibleAddresses) throw new Error("ZIP address counts do not reconcile");
    } catch (error) {
      failures.push({ path: zipArtifact.path, reason: `ZIP validation failed: ${error.message}` });
    }
  }
  if (failures.length) {
    const error = new Error(`Illinois Business Registry release verification failed for ${failures.length} check(s).`);
    error.failures = failures;
    throw error;
  }
  return { dataset_id: manifest.dataset_id, release_id: manifest.release_id, source_release_id: manifest.source_release_id, artifact_count: manifest.artifacts.length, coverage: manifest.coverage };
}
