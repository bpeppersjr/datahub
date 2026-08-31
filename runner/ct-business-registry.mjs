import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { finished } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";

export const CT_BUSINESS_REGISTRY_SCHEMA_VERSION = "1.0.0";
export const CT_BUSINESS_REGISTRY_TRANSFORMATION_VERSION = "ct-business-registry@1.0.0";
export const CT_BUSINESS_REGISTRY_DATASET_ID = "n7gp-d28j";
export const CT_BUSINESS_REGISTRY_METADATA_URL = `https://data.ct.gov/api/views/${CT_BUSINESS_REGISTRY_DATASET_ID}`;
export const CT_BUSINESS_REGISTRY_API_URL = `https://data.ct.gov/resource/${CT_BUSINESS_REGISTRY_DATASET_ID}.json`;
export const CT_BUSINESS_REGISTRY_STORY_URL = "https://data.ct.gov/stories/s/CT-Business-Registrations/dagr-u2hb/";

export const CT_BUSINESS_REGISTRY_SCHEMA = Object.freeze([
  ["id", "text"],
  ["name", "text"],
  ["business_type", "text"],
  ["status", "text"],
  ["sub_status", "text"],
  ["accountnumber", "text"],
  ["annual_report_due_date", "calendar_date"],
  ["began_transacting_in_ct", "calendar_date"],
  ["billingstreet", "text"],
  ["billing_unit", "text"],
  ["billingcity", "text"],
  ["billingcountry", "text"],
  ["billingpostalcode", "text"],
  ["billingstate", "text"],
  ["business_name_in_state_country", "text"],
  ["citizenship", "text"],
  ["country_formation", "text"],
  ["date_registration", "calendar_date"],
  ["formation_place", "text"],
  ["state_or_territory_formation", "text"],
  ["dissolution_date", "calendar_date"],
  ["naics_code", "text"],
  ["naics_sub_code", "text"],
  ["create_dt", "text"],
  ["geo_location", "point"],
]);

export const CT_BUSINESS_REGISTRY_FIELDS = Object.freeze(CT_BUSINESS_REGISTRY_SCHEMA.map(([field]) => field));
export const CT_BUSINESS_REGISTRY_SCHEMA_FINGERPRINT = "0f71d3f98ec718043ff3cb42368fa3be565c4a0defc1761a51b84b8a5ed377f9";

const US_STATE_AND_TERRITORY_CODES = new Set([
  "AL", "AK", "AS", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "GU", "HI", "ID", "IL", "IN", "IA", "KS", "KY",
  "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "MP", "OH", "OK",
  "OR", "PA", "PR", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "VI", "WA", "WV", "WI", "WY",
]);

const US_COUNTRY_VALUES = new Set(["UNITED STATES", "UNITED STATES OF AMERICA", "USA", "U.S.A.", "US", "U.S."]);
const EXCLUDED_SOURCE_FIELDS = new Set([
  "business_email_address", "category_survey_email_address", "mailing_address", "mailing_international_address", "mail_jurisdiction",
  "mailing_jurisdiction_address", "office_jurisdiction_address", "record_address", "records_address_street", "woman_owned_organization",
  "veteran_owned_organization", "minority_owned_organization", "org_owned_by_person_s_with", "organization_is_lgbtqi_owned", "agent", "principal",
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

function json(value) {
  return `${JSON.stringify(value)}\n`;
}

function jsonLines(records) {
  return records.length ? `${records.map((record) => JSON.stringify(record)).join("\n")}\n` : "";
}

function releaseTimestamp(instant) {
  return instant.replaceAll(/[-:.]/g, "").replace("T", "-").replace("Z", "Z");
}

function sourceTimestamp(unixSeconds) {
  if (!Number.isInteger(unixSeconds) || unixSeconds <= 0) throw new Error("Connecticut catalog rowsUpdatedAt must be a positive Unix timestamp.");
  return new Date(unixSeconds * 1000).toISOString();
}

function date(value) {
  const raw = text(value);
  if (!raw) return null;
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})(?:T.*)?$/);
  return match ? match[1] : null;
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
  const raw = text(value);
  const normalized = raw?.toUpperCase() ?? null;
  return normalized && US_STATE_AND_TERRITORY_CODES.has(normalized) ? normalized : null;
}

function countryScope(value) {
  const raw = text(value);
  if (!raw) return "country-not-reported";
  return US_COUNTRY_VALUES.has(raw.toUpperCase()) ? "reported-united-states" : "reported-other-country-or-unrecognized-value";
}

function naics(value) {
  const raw = text(value);
  if (!raw) return null;
  const parenthetical = raw.match(/\((\d{2,6})\)\s*$/);
  const direct = raw.match(/^\d{2,6}$/);
  const code = parenthetical?.[1] ?? direct?.[0] ?? null;
  return { source_value: raw, code, title: parenthetical ? raw.slice(0, parenthetical.index).trim() || null : null };
}

function point(value) {
  if (!value || value.type !== "Point" || !Array.isArray(value.coordinates) || value.coordinates.length < 2) return null;
  const longitude = Number(value.coordinates[0]);
  const latitude = Number(value.coordinates[1]);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) return null;
  return {
    type: "Point",
    coordinates: [longitude, latitude],
    coordinate_scope: "source-geocoded-reported-business-address-not-verified-physical-operating-site",
  };
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
    source_id: "connecticut-business-registry-business-master-active",
    source_release_id: context.sourceReleaseId,
    source_record_id: sourceRecordId,
    ingest_run_id: context.runId,
    transformation_version: CT_BUSINESS_REGISTRY_TRANSFORMATION_VERSION,
    policy_id: "ct-business-registry",
  };
}

export function schemaFingerprint(columns) {
  const byField = new Map((columns ?? []).map((column) => [column.fieldName, column.dataTypeName]));
  const actual = CT_BUSINESS_REGISTRY_SCHEMA.map(([field]) => [field, byField.get(field) ?? null]);
  return sha256(actual.map(([field, type]) => `${field}:${type}`).join("\u0000"));
}

function selectedRecord(row) {
  return Object.fromEntries(CT_BUSINESS_REGISTRY_FIELDS.filter((field) => row[field] !== undefined).map((field) => [field, row[field]]));
}

export function normalizeCtBusinessOrganization(source, context) {
  const sourceRecordId = text(source.id);
  const legalName = text(source.name);
  if (!sourceRecordId || !/^[A-Za-z0-9_-]{8,64}$/.test(sourceRecordId) || !legalName) throw new Error("missing-or-invalid-organization-identity");
  if (text(source.status) !== "Active") throw new Error("source-record-is-not-active");
  const accountNumberSource = text(source.accountnumber);
  const authoritativeLegalEntityIdentifier = accountNumberSource && accountNumberSource !== "0000000" ? accountNumberSource : null;
  if (authoritativeLegalEntityIdentifier && !/^\d+$/.test(authoritativeLegalEntityIdentifier)) throw new Error("invalid-authoritative-legal-entity-identifier");
  const postal = postalCode(source.billingpostalcode);
  const state = stateCode(source.billingstate);
  const country = countryScope(source.billingcountry);
  const street = text(source.billingstreet);
  const city = text(source.billingcity);
  const addressEligibleForUsZipCoverage = Boolean(street && city && state && postal.zip_code && country !== "reported-other-country-or-unrecognized-value");
  const organizationId = `organization:ct_sots_record_${sourceRecordId}`;
  const formationName = text(source.business_name_in_state_country);
  const otherNames = formationName && formationName.toUpperCase() !== legalName.toUpperCase()
    ? [{ name: formationName, name_type: "name-in-formation-jurisdiction-for-foreign-registered-entity" }]
    : [];
  return {
    schema_version: CT_BUSINESS_REGISTRY_SCHEMA_VERSION,
    normalized_record_id: `ct-business-registry:organization:${sourceRecordId}`,
    entity_candidates: { organization_id: organizationId, identity_status: "provisional" },
    external_identifiers: [
      { type: "ct_business_registry_record_id", value: sourceRecordId, source_field: "id" },
      ...(authoritativeLegalEntityIdentifier ? [{ type: "ct_authoritative_legal_entity_identifier", value: authoritativeLegalEntityIdentifier, source_field: "accountnumber" }] : []),
    ],
    legal_name: legalName,
    other_names: otherNames,
    reported_business_address: {
      street,
      unit_or_additional: text(source.billing_unit),
      city,
      state_source: text(source.billingstate),
      state_code: state,
      postal_code_source: postal.raw,
      zip_code: postal.zip_code,
      postal_code: postal.postal_code,
      zip4: postal.zip4,
      postal_code_status: postal.status,
      country_source: text(source.billingcountry),
      country_scope: country,
      address_scope: "secretary-of-state-reported-business-address-not-verified-physical-operating-site",
      eligible_for_us_zip_coverage: addressEligibleForUsZipCoverage,
    },
    reported_address_coordinate: point(source.geo_location),
    geography: geography(addressEligibleForUsZipCoverage ? postal.zip_code : null, context.baselineByZip),
    registration_profile: {
      business_type: text(source.business_type),
      citizenship: text(source.citizenship),
      country_of_formation: text(source.country_formation),
      formation_place: text(source.formation_place),
      state_or_territory_of_formation: text(source.state_or_territory_formation),
      registration_date: date(source.date_registration),
      began_transacting_in_connecticut_date: date(source.began_transacting_in_ct),
      annual_report_due_date: date(source.annual_report_due_date),
      dissolution_or_withdrawal_date_reported_while_active: date(source.dissolution_date),
      naics: naics(source.naics_code),
      naics_sub_code: naics(source.naics_sub_code),
    },
    source_status: {
      value: "listed-active-in-connecticut-business-registry-as-of-retrieval",
      status: "Active",
      sub_status: text(source.sub_status),
      source_rows_updated_at: context.sourceRowsUpdatedAt,
      source_record_refresh_value: text(source.create_dt),
      semantics: "active-in-secretary-of-state-records-not-independent-proof-of-current-operations-or-good-standing",
    },
    observed_at: context.retrievedAt,
    provenance: provenance(context, sourceRecordId),
    export_policy: "public",
  };
}

function assertAllowedUrl(urlValue, type) {
  const url = new URL(urlValue);
  if (url.protocol !== "https:" || url.hostname !== "data.ct.gov") throw new Error(`Connecticut ${type} URL is outside the allowlist.`);
  const expectedPath = type === "metadata" ? `/api/views/${CT_BUSINESS_REGISTRY_DATASET_ID}` : `/resource/${CT_BUSINESS_REGISTRY_DATASET_ID}.json`;
  if (url.pathname !== expectedPath) throw new Error(`Connecticut ${type} URL has an unexpected path.`);
  return url;
}

function retryDelay(response, attempt) {
  const retryAfter = Number(response?.headers?.get?.("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter >= 0) return Math.min(10_000, retryAfter * 1000);
  return Math.min(4_000, 250 * (2 ** attempt));
}

export async function requestCtJson(urlValue, {
  fetchImpl = globalThis.fetch,
  signal,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  maximumResponseBytes = 50_000_000,
  type = "data",
  attempts = 5,
} = {}) {
  const url = assertAllowedUrl(urlValue, type);
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    signal?.throwIfAborted?.();
    try {
      const response = await fetchImpl(url, {
        method: "GET",
        redirect: "manual",
        signal,
        headers: { accept: "application/json", "user-agent": "Co*Tive-Collector/0.1 governed-public-data-connector" },
      });
      if (response.status >= 300 && response.status < 400) throw new Error("Connecticut source redirect rejected.");
      if ((response.status === 429 || response.status >= 500) && attempt < attempts - 1) {
        await sleep(retryDelay(response, attempt));
        continue;
      }
      if (!response.ok) throw new Error(`Connecticut source request failed with HTTP ${response.status}.`);
      const declaredBytes = Number(response.headers?.get?.("content-length"));
      if (Number.isFinite(declaredBytes) && declaredBytes > maximumResponseBytes) throw new Error("Connecticut source response exceeds the configured byte limit.");
      const body = await response.text();
      if (Buffer.byteLength(body) > maximumResponseBytes) throw new Error("Connecticut source response exceeds the configured byte limit.");
      return JSON.parse(body);
    } catch (error) {
      lastError = error;
      if (error.name === "AbortError" || /redirect rejected|byte limit|HTTP 4\d\d/.test(error.message) || attempt === attempts - 1) throw error;
      await sleep(250 * (2 ** attempt));
    }
  }
  throw lastError;
}

function validateCatalogMetadata(metadata, expectedFingerprint = CT_BUSINESS_REGISTRY_SCHEMA_FINGERPRINT) {
  if (metadata?.id !== CT_BUSINESS_REGISTRY_DATASET_ID || metadata?.name !== "Connecticut Business Registry - Business Master") throw new Error("Unexpected Connecticut Business Master catalog metadata.");
  if (metadata?.license?.name !== "Public Domain") throw new Error("Connecticut Business Master catalog license is no longer Public Domain.");
  if (metadata?.attribution !== "Secretary of the State") throw new Error("Connecticut Business Master attribution changed.");
  const fingerprint = schemaFingerprint(metadata.columns);
  if (fingerprint !== expectedFingerprint) throw new Error(`Connecticut Business Master selected schema changed (${fingerprint}).`);
  return { rowsUpdatedAt: metadata.rowsUpdatedAt, rowsUpdatedAtIso: sourceTimestamp(metadata.rowsUpdatedAt), schemaFingerprint: fingerprint };
}

function soqlUrl(parameters) {
  const url = new URL(CT_BUSINESS_REGISTRY_API_URL);
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
  return url.toString();
}

async function activeRecordCount(options) {
  const rows = await requestCtJson(soqlUrl({ $select: "count(*) as records", $where: "status='Active'" }), options);
  const count = Number(rows?.[0]?.records);
  if (!Number.isInteger(count) || count < 0) throw new Error("Connecticut active record count response is invalid.");
  return count;
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
  if (!writer.gzip.write(`${JSON.stringify(record)}\n`)) await once(writer.gzip, "drain");
  writer.records += 1;
}

async function closeGzipWriter(writer, artifactType, metadata = {}) {
  writer.gzip.end();
  await finished(writer.output);
  await renameWithRetry(writer.temporary, writer.destination);
  return { path: writer.relativePath, ...(await hashFile(writer.destination)), record_count: writer.records, artifact_type: artifactType, ...metadata };
}

function abortGzipWriters(writers) {
  for (const writer of writers) {
    writer.gzip.destroy();
    writer.output.destroy();
  }
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

function sourceSafeRecord(record) {
  for (const field of Object.keys(record)) if (!CT_BUSINESS_REGISTRY_FIELDS.includes(field)) throw new Error(`Unapproved Connecticut source field ${field}.`);
  return selectedRecord(record);
}

async function acquireSource({ writer, sourceRecords, expectedCount, fetchImpl, signal, sleep, pageSize, logger }) {
  let count = 0;
  let previousId = null;
  const consume = async (input) => {
    signal?.throwIfAborted?.();
    const record = sourceSafeRecord(input);
    const id = text(record.id);
    if (!id || text(record.status) !== "Active") throw new Error("Connecticut source acquisition received an invalid or non-active row.");
    if (previousId !== null && id.localeCompare(previousId) <= 0) throw new Error(`Connecticut source IDs are not strictly increasing at ${id}.`);
    previousId = id;
    await writeGzipRecord(writer, record);
    count += 1;
  };
  if (sourceRecords) {
    for (const record of sourceRecords) await consume(record);
  } else {
    let lastId = null;
    while (true) {
      const where = lastId ? `status='Active' AND id>'${lastId.replaceAll("'", "''")}'` : "status='Active'";
      const rows = await requestCtJson(soqlUrl({
        $select: CT_BUSINESS_REGISTRY_FIELDS.join(","),
        $where: where,
        $order: "id ASC",
        $limit: String(pageSize),
      }), { fetchImpl, signal, sleep, type: "data" });
      if (!Array.isArray(rows) || rows.length > pageSize) throw new Error("Connecticut source page is invalid or exceeds the page-size limit.");
      if (rows.length === 0) break;
      for (const record of rows) await consume(record);
      lastId = previousId;
      logger(`Acquired ${count.toLocaleString("en-US")} active Connecticut business records.`);
      if (rows.length < pageSize) break;
    }
  }
  if (count !== expectedCount) throw new Error(`Connecticut source acquisition returned ${count} active rows; preflight reported ${expectedCount}.`);
  return count;
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
      ct_business_registry_active_snapshot: {
        status: count ? "published-active-registration-reported-business-addresses" : "no-eligible-reported-business-address-in-current-source-snapshot",
        organization_reported_business_address_count: count,
        source_release_id: context.sourceReleaseId,
        source_rows_updated_at: context.sourceRowsUpdatedAt,
        physical_site_count: null,
        physical_site_inference_permitted: false,
      },
    };
  });
}

export async function buildCtBusinessRegistry({
  outputRoot,
  zbpPointer,
  catalogMetadata = null,
  sourceRecords = null,
  minimumOrganizations = 400_000,
  pageSize = 25_000,
  schemaFingerprintExpected = CT_BUSINESS_REGISTRY_SCHEMA_FINGERPRINT,
  fetchImpl = globalThis.fetch,
  signal,
  sleep,
  logger = console.log,
  now = () => new Date(),
} = {}) {
  if (!outputRoot || !zbpPointer) throw new Error("outputRoot and zbpPointer are required.");
  if (!Number.isInteger(minimumOrganizations) || minimumOrganizations < 1) throw new Error("minimumOrganizations must be a positive integer.");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50_000) throw new Error("pageSize must be from 1 through 50000.");
  signal?.throwIfAborted?.();
  const retrievedAt = now().toISOString();
  const runId = randomUUID();
  const releaseId = `ct-business-registry-${releaseTimestamp(retrievedAt)}-${runId.slice(0, 8)}`;
  const stagingDirectory = path.join(outputRoot, ".staging", runId);
  await mkdir(stagingDirectory, { recursive: true });
  const baseline = await loadZbpBaseline(zbpPointer);
  const requestOptions = { fetchImpl, signal, sleep, type: "metadata" };
  const initialMetadata = catalogMetadata ?? await requestCtJson(CT_BUSINESS_REGISTRY_METADATA_URL, requestOptions);
  const catalog = validateCatalogMetadata(initialMetadata, schemaFingerprintExpected);
  const expectedCount = sourceRecords ? Number(initialMetadata.activeRecordCount ?? sourceRecords.length) : await activeRecordCount({ fetchImpl, signal, sleep, type: "data" });
  if (!Number.isInteger(expectedCount) || expectedCount < minimumOrganizations) throw new Error(`Connecticut active organization count ${expectedCount} is below the ${minimumOrganizations} quality floor.`);
  const rawWriter = await openGzipWriter(stagingDirectory, "source/active-business-master.jsonl.gz");
  let sourceArtifact;
  try {
    await acquireSource({ writer: rawWriter, sourceRecords, expectedCount, fetchImpl, signal, sleep, pageSize, logger });
    sourceArtifact = await closeGzipWriter(rawWriter, "ct-business-registry-source-jsonl-gzip", { export_policy: "internal" });
  } catch (error) {
    abortGzipWriters([rawWriter]);
    throw error;
  }
  if (!sourceRecords) {
    const finalMetadata = await requestCtJson(CT_BUSINESS_REGISTRY_METADATA_URL, requestOptions);
    const finalCatalog = validateCatalogMetadata(finalMetadata, schemaFingerprintExpected);
    const finalCount = await activeRecordCount({ fetchImpl, signal, sleep, type: "data" });
    if (finalCatalog.rowsUpdatedAt !== catalog.rowsUpdatedAt || finalCount !== expectedCount) throw new Error("Connecticut source changed during acquisition; the run is not publishable.");
  }
  const sourceReleaseDigest = sha256(`${catalog.rowsUpdatedAtIso}\u0000${sourceArtifact.sha256}`);
  const sourceReleaseId = `ct-business-registry-${catalog.rowsUpdatedAtIso.slice(0, 10)}-${sourceReleaseDigest.slice(0, 16)}`;
  const context = { runId, retrievedAt, sourceRowsUpdatedAt: catalog.rowsUpdatedAtIso, sourceReleaseId, baselineByZip: baseline.byZip };
  const writers = new Map();
  for (const prefix of "0123456789abcdef") writers.set(prefix, await openGzipWriter(stagingDirectory, `derived/organizations/id-hash-prefix=${prefix}.jsonl.gz`));
  const ids = new Set();
  const nonPlaceholderAlei = new Set();
  const countsByZip = new Map();
  const businessTypes = new Map();
  const subStatuses = new Map();
  const addressStates = new Map();
  const citizenshipValues = new Map();
  let organizations = 0;
  let eligibleUsAddresses = 0;
  let geocodedAddresses = 0;
  let placeholderAleiRecords = 0;
  let activeRecordsWithDissolutionDate = 0;
  try {
    for await (const source of gzipRecords(path.join(stagingDirectory, sourceArtifact.path))) {
      signal?.throwIfAborted?.();
      const normalized = normalizeCtBusinessOrganization(source, context);
      const id = normalized.external_identifiers[0].value;
      if (ids.has(id)) throw new Error(`Duplicate Connecticut source record ID ${id}.`);
      ids.add(id);
      const alei = normalized.external_identifiers.find((item) => item.type === "ct_authoritative_legal_entity_identifier")?.value;
      if (alei) {
        if (nonPlaceholderAlei.has(alei)) throw new Error(`Duplicate non-placeholder Connecticut ALEI ${alei}.`);
        nonPlaceholderAlei.add(alei);
      } else if (text(source.accountnumber) === "0000000") placeholderAleiRecords += 1;
      const partition = sha256(id)[0];
      await writeGzipRecord(writers.get(partition), normalized);
      increment(businessTypes, normalized.registration_profile.business_type);
      increment(subStatuses, normalized.source_status.sub_status);
      increment(addressStates, normalized.reported_business_address.state_code ?? normalized.reported_business_address.state_source);
      increment(citizenshipValues, normalized.registration_profile.citizenship);
      if (normalized.registration_profile.dissolution_or_withdrawal_date_reported_while_active) activeRecordsWithDissolutionDate += 1;
      if (normalized.reported_address_coordinate) geocodedAddresses += 1;
      if (normalized.reported_business_address.eligible_for_us_zip_coverage) {
        const zipCode = normalized.reported_business_address.zip_code;
        countsByZip.set(zipCode, (countsByZip.get(zipCode) ?? 0) + 1);
        eligibleUsAddresses += 1;
      }
      organizations += 1;
    }
  } catch (error) {
    abortGzipWriters([...writers.values()]);
    throw error;
  }
  if (organizations !== expectedCount) throw new Error("Connecticut normalized organization count does not reconcile to the source snapshot.");
  const artifacts = [sourceArtifact, ...await Promise.all([...writers.values()].map((writer) => closeGzipWriter(writer, "normalized-ct-business-organization-jsonl-gzip")))];
  const coverageRows = buildZipCoverage(baseline.rows, countsByZip, context);
  artifacts.push(await writeArtifact(stagingDirectory, "derived/zip-coverage.jsonl", jsonLines(coverageRows), { artifact_type: "ct-business-registry-zip-coverage-jsonl", record_count: coverageRows.length }));
  artifacts.push(await writeArtifact(stagingDirectory, "derived/source-summary.json", json({
    active_organizations: organizations,
    eligible_reported_us_business_addresses: eligibleUsAddresses,
    organizations_without_eligible_us_zip_address: organizations - eligibleUsAddresses,
    source_geocoded_reported_business_addresses: geocodedAddresses,
    placeholder_alei_0000000_records: placeholderAleiRecords,
    active_records_with_dissolution_or_withdrawal_date: activeRecordsWithDissolutionDate,
    business_types: sortedCounts(businessTypes),
    sub_statuses: sortedCounts(subStatuses),
    reported_address_states: sortedCounts(addressStates),
    citizenship_values: sortedCounts(citizenshipValues),
  }), { artifact_type: "ct-business-registry-source-summary" }));
  artifacts.push(await writeArtifact(stagingDirectory, "source/release-metadata.json", json({
    dataset_id: CT_BUSINESS_REGISTRY_DATASET_ID,
    dataset_name: initialMetadata.name,
    publisher: initialMetadata.attribution,
    license: initialMetadata.license,
    source_rows_updated_at: catalog.rowsUpdatedAtIso,
    source_rows_updated_at_unix: catalog.rowsUpdatedAt,
    selected_schema: CT_BUSINESS_REGISTRY_SCHEMA,
    selected_schema_fingerprint: catalog.schemaFingerprint,
    selected_fields: CT_BUSINESS_REGISTRY_FIELDS,
    explicitly_excluded_field_classes: ["business and survey email addresses", "ownership-category survey responses", "mailing, office, and records addresses", "registered agents", "principals and other people"],
    query: { filter: "status='Active'", order: "id ASC", keyset_pagination: true, page_size: pageSize },
    expected_active_record_count: expectedCount,
    source_urls: { metadata: CT_BUSINESS_REGISTRY_METADATA_URL, api: CT_BUSINESS_REGISTRY_API_URL, documentation: CT_BUSINESS_REGISTRY_STORY_URL },
  }), { artifact_type: "ct-business-registry-source-release-metadata" }));
  const manifest = {
    schema_version: CT_BUSINESS_REGISTRY_SCHEMA_VERSION,
    dataset_id: "ct-business-registry-active-organizations",
    connector: { id: "ct-business-registry", version: "1.0.0" },
    release_id: releaseId,
    run_id: runId,
    retrieved_at: retrievedAt,
    source_rows_updated_at: catalog.rowsUpdatedAtIso,
    source_release_id: sourceReleaseId,
    status: "published",
    complete_active_business_master_snapshot: true,
    coverage: {
      source_active_records: expectedCount,
      active_organizations_published: organizations,
      eligible_reported_us_business_addresses: eligibleUsAddresses,
      organizations_without_eligible_us_zip_address: organizations - eligibleUsAddresses,
      source_geocoded_reported_business_addresses: geocodedAddresses,
      source_zip_codes: countsByZip.size,
      zip_union_records: coverageRows.length,
      placeholder_alei_0000000_records: placeholderAleiRecords,
      active_records_with_dissolution_or_withdrawal_date: activeRecordsWithDissolutionDate,
      physical_sites: null,
      establishments: null,
    },
    quality_gates: {
      minimum_organizations: minimumOrganizations,
      source_and_normalized_counts_match: organizations === expectedCount,
      selected_schema_fingerprint: catalog.schemaFingerprint,
      duplicate_source_record_ids: 0,
      duplicate_non_placeholder_alei_values: 0,
      source_unchanged_during_acquisition: true,
    },
    dependencies: [
      { dataset_id: baseline.manifest.dataset_id, release_id: baseline.manifest.release_id, manifest_sha256: baseline.manifestSha256 },
      baseline.manifest.geography_dependency,
    ],
    source: {
      publisher: "Connecticut Secretary of the State, Business Services Division",
      catalog_dataset_id: CT_BUSINESS_REGISTRY_DATASET_ID,
      source_page: CT_BUSINESS_REGISTRY_STORY_URL,
      api_url: CT_BUSINESS_REGISTRY_API_URL,
      access_method: sourceRecords ? "explicit test fixture records" : "anonymous public Socrata API with stable keyset pagination",
      license: "Public Domain",
      api_key_used: false,
      policy_profile: "config/source-policies/ct-business-registry.json",
    },
    limitations: [
      "Active means active in Connecticut Secretary-of-the-State records at the source refresh; it is not independent proof of current operations, good standing, licensure, solvency, public access, or an open storefront.",
      "The Business Master includes domestic and foreign-registered entities and is not a census of every business operating in Connecticut or the United States.",
      "Reported business addresses can be administrative, home, virtual, mailing-like, incomplete, stale, outside Connecticut, or outside the United States; no physical site or establishment is created from them.",
      "Source geocodes describe the reported business address and are not independently validated physical operating coordinates.",
      "Active rows may carry a sub-status such as annual report past due or administrative dissolution initiated, and may contain a dissolution or withdrawal date; these source facts are preserved without overriding the source's Active status.",
      "The placeholder ALEI value 0000000 is not emitted as an external identifier; the source system record ID remains the provisional organization identity.",
      "Email fields, ownership-category survey responses, mailing/office/records addresses, registered-agent data, principals, and other person-linked subsidiary datasets are excluded.",
      "Current USPS ZIP validity remains unverified until an authorized operational ZIP denominator is integrated.",
    ],
    artifacts,
  };
  await writeArtifact(stagingDirectory, "manifest.json", json(manifest));
  const publication = await publishCtBusinessRegistryStaging({ outputRoot, stagingRunId: runId, expectedReleaseId: releaseId });
  logger(`Published ${organizations.toLocaleString("en-US")} active Connecticut registered organizations.`);
  return { manifest, releaseDirectory: publication.releaseDirectory, pointerPath: publication.pointerPath };
}

function containsExcludedField(value) {
  if (Array.isArray(value)) return value.some(containsExcludedField);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) => EXCLUDED_SOURCE_FIELDS.has(key.toLowerCase()) || containsExcludedField(child));
}

export async function publishCtBusinessRegistryStaging({ outputRoot, stagingRunId, expectedReleaseId = null } = {}) {
  if (!outputRoot || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stagingRunId ?? "")) {
    throw new Error("outputRoot and a valid stagingRunId are required.");
  }
  const stagingRoot = path.join(outputRoot, ".staging");
  const stagingDirectory = path.resolve(stagingRoot, stagingRunId);
  assertContained(stagingRoot, stagingDirectory, "Connecticut staging run");
  const manifestPath = path.join(stagingDirectory, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.run_id !== stagingRunId || manifest.dataset_id !== "ct-business-registry-active-organizations" || manifest.status !== "published") {
    throw new Error("Connecticut staging manifest does not match the requested complete run.");
  }
  if (expectedReleaseId && manifest.release_id !== expectedReleaseId) throw new Error("Connecticut staging release ID does not match the build result.");
  await verifyCtBusinessRegistry(manifestPath);
  const releasesDirectory = path.join(outputRoot, "releases");
  await mkdir(releasesDirectory, { recursive: true });
  const releaseDirectory = path.join(releasesDirectory, manifest.release_id);
  try {
    await stat(releaseDirectory);
    throw new Error(`Connecticut release destination already exists: ${manifest.release_id}.`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
  await renameWithRetry(stagingDirectory, releaseDirectory);
  const pointerPath = path.join(outputRoot, "current.json");
  const temporaryPointer = `${pointerPath}.tmp-${randomUUID()}`;
  await writeFile(temporaryPointer, json({
    dataset_id: manifest.dataset_id,
    release_id: manifest.release_id,
    manifest: `releases/${manifest.release_id}/manifest.json`,
    updated_at: manifest.retrieved_at,
  }), { flag: "wx" });
  await renameWithRetry(temporaryPointer, pointerPath);
  if (!(await stat(releaseDirectory)).isDirectory()) throw new Error("Published Connecticut Business Registry release is not a directory.");
  return { manifest, releaseDirectory, pointerPath };
}

export async function verifyCtBusinessRegistry(manifestPath) {
  const absoluteManifestPath = path.resolve(manifestPath);
  const releaseDirectory = path.dirname(absoluteManifestPath);
  const manifest = JSON.parse(await readFile(absoluteManifestPath, "utf8"));
  const failures = [];
  if (manifest.dataset_id !== "ct-business-registry-active-organizations" || manifest.status !== "published" || !manifest.complete_active_business_master_snapshot) failures.push({ path: "manifest.json", reason: "unexpected or incomplete manifest" });
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
  const sourceArtifacts = manifest.artifacts?.filter((artifact) => artifact.artifact_type === "ct-business-registry-source-jsonl-gzip") ?? [];
  const normalizedArtifacts = manifest.artifacts?.filter((artifact) => artifact.artifact_type === "normalized-ct-business-organization-jsonl-gzip") ?? [];
  if (sourceArtifacts.length !== 1 || sourceArtifacts[0]?.export_policy !== "internal") failures.push({ path: "manifest.json", reason: "expected one internal selected-field source artifact" });
  if (normalizedArtifacts.length !== 16) failures.push({ path: "manifest.json", reason: "expected 16 normalized organization partitions" });
  if (sourceArtifacts.length === 1) {
    const digest = sha256(`${manifest.source_rows_updated_at}\u0000${sourceArtifacts[0].sha256}`);
    if (manifest.source_release_id !== `ct-business-registry-${manifest.source_rows_updated_at.slice(0, 10)}-${digest.slice(0, 16)}`) failures.push({ path: "manifest.json", reason: "source release ID is not bound to refresh timestamp and selected source checksum" });
    try {
      let sourceCount = 0;
      let previousId = null;
      for await (const record of gzipRecords(path.join(releaseDirectory, sourceArtifacts[0].path))) {
        for (const field of Object.keys(record)) if (!CT_BUSINESS_REGISTRY_FIELDS.includes(field)) throw new Error(`unapproved source field ${field}`);
        const id = text(record.id);
        if (!id || text(record.status) !== "Active" || (previousId && id.localeCompare(previousId) <= 0)) throw new Error(`invalid source ordering or status at ${id}`);
        previousId = id;
        sourceCount += 1;
      }
      if (sourceCount !== sourceArtifacts[0].record_count || sourceCount !== manifest.coverage?.source_active_records) throw new Error("source record count mismatch");
    } catch (error) {
      failures.push({ path: sourceArtifacts[0].path, reason: `source validation failed: ${error.message}` });
    }
  }
  const ids = new Set();
  const aleiValues = new Set();
  const countsByZip = new Map();
  let organizations = 0;
  let eligibleAddresses = 0;
  for (const artifact of normalizedArtifacts) {
    try {
      const prefix = artifact.path.match(/id-hash-prefix=([0-9a-f])/)?.[1];
      let partitionCount = 0;
      for await (const record of gzipRecords(path.join(releaseDirectory, artifact.path))) {
        const id = record.external_identifiers?.find((item) => item.type === "ct_business_registry_record_id")?.value;
        if (!id || ids.has(id) || sha256(id)[0] !== prefix) throw new Error(`duplicate, missing, or incorrectly partitioned source ID ${id}`);
        ids.add(id);
        const alei = record.external_identifiers?.find((item) => item.type === "ct_authoritative_legal_entity_identifier")?.value;
        if (alei === "0000000" || (alei && aleiValues.has(alei))) throw new Error(`invalid or duplicate ALEI ${alei}`);
        if (alei) aleiValues.add(alei);
        if (record.entity_candidates?.organization_id !== `organization:ct_sots_record_${id}` || record.entity_candidates?.physical_site_id || record.entity_candidates?.establishment_id) throw new Error(`invalid organization-only identity for ${id}`);
        if (record.source_status?.status !== "Active" || record.source_status?.value !== "listed-active-in-connecticut-business-registry-as-of-retrieval") throw new Error(`invalid source status for ${id}`);
        if (record.provenance?.source_release_id !== manifest.source_release_id || record.provenance?.policy_id !== "ct-business-registry" || record.export_policy !== "public") throw new Error(`invalid provenance for ${id}`);
        if (containsExcludedField(record)) throw new Error(`excluded field leaked for ${id}`);
        if (record.reported_business_address?.address_scope !== "secretary-of-state-reported-business-address-not-verified-physical-operating-site") throw new Error(`invalid address scope for ${id}`);
        if (record.reported_business_address?.eligible_for_us_zip_coverage) {
          const zipCode = record.reported_business_address.zip_code;
          if (!/^\d{5}$/.test(zipCode ?? "")) throw new Error(`invalid eligible ZIP for ${id}`);
          countsByZip.set(zipCode, (countsByZip.get(zipCode) ?? 0) + 1);
          eligibleAddresses += 1;
        }
        partitionCount += 1;
      }
      if (partitionCount !== artifact.record_count) throw new Error("partition record count mismatch");
      organizations += partitionCount;
    } catch (error) {
      failures.push({ path: artifact.path, reason: `normalized validation failed: ${error.message}` });
    }
  }
  if (organizations !== manifest.coverage?.active_organizations_published || organizations !== manifest.coverage?.source_active_records) failures.push({ path: "manifest.json", reason: "organization counts do not reconcile" });
  if (eligibleAddresses !== manifest.coverage?.eligible_reported_us_business_addresses) failures.push({ path: "manifest.json", reason: "eligible address count does not reconcile" });
  const zipArtifact = manifest.artifacts?.find((artifact) => artifact.artifact_type === "ct-business-registry-zip-coverage-jsonl");
  if (!zipArtifact) failures.push({ path: "manifest.json", reason: "missing ZIP coverage artifact" });
  else {
    try {
      const rows = (await readFile(path.join(releaseDirectory, zipArtifact.path), "utf8")).split(/\r?\n/).filter(Boolean).map(JSON.parse);
      if (rows.length !== zipArtifact.record_count || rows.length !== manifest.coverage?.zip_union_records) throw new Error("ZIP row count mismatch");
      const total = rows.reduce((sum, row) => sum + row.ct_business_registry_active_snapshot.organization_reported_business_address_count, 0);
      if (total !== eligibleAddresses) throw new Error("ZIP organization address counts do not reconcile");
      for (const row of rows) {
        if ((countsByZip.get(row.zip_code) ?? 0) !== row.ct_business_registry_active_snapshot.organization_reported_business_address_count) throw new Error(`ZIP ${row.zip_code} does not reconcile`);
        if (row.current_usps_validity?.status !== "unverified") throw new Error(`ZIP ${row.zip_code} has unsupported USPS validity`);
        if (row.ct_business_registry_active_snapshot.physical_site_count !== null || row.ct_business_registry_active_snapshot.physical_site_inference_permitted !== false) throw new Error(`ZIP ${row.zip_code} implies a physical site`);
      }
    } catch (error) {
      failures.push({ path: zipArtifact.path, reason: `ZIP validation failed: ${error.message}` });
    }
  }
  if (failures.length) {
    const error = new Error(`Connecticut Business Registry release verification failed for ${failures.length} check(s).`);
    error.failures = failures;
    throw error;
  }
  return { dataset_id: manifest.dataset_id, release_id: manifest.release_id, source_release_id: manifest.source_release_id, artifact_count: manifest.artifacts.length, coverage: manifest.coverage };
}
