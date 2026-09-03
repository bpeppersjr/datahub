import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { finished } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";
import { assertNormalizedUsPostalFieldsDeep } from "./normalized-us-postal-code.mjs";

export const NY_RETAIL_FOOD_SCHEMA_VERSION = "1.0.0";
export const NY_RETAIL_FOOD_TRANSFORMATION_VERSION = "ny-retail-food-stores@1.0.1";
export const NY_RETAIL_FOOD_DATASET_ID = "9a8c-vfzj";
export const NY_RETAIL_FOOD_METADATA_URL = `https://data.ny.gov/api/views/${NY_RETAIL_FOOD_DATASET_ID}`;
export const NY_RETAIL_FOOD_API_URL = `https://data.ny.gov/resource/${NY_RETAIL_FOOD_DATASET_ID}.json`;
export const NY_RETAIL_FOOD_PAGE_URL = "https://data.ny.gov/Economic-Development/Retail-Food-Stores/9a8c-vfzj/about";

export const NY_RETAIL_FOOD_SCHEMA = Object.freeze([
  ["county", "text"],
  ["license_number", "text"],
  ["operation_type", "text"],
  ["estab_type", "text"],
  ["entity_name", "text"],
  ["dba_name", "text"],
  ["street_number", "text"],
  ["street_name", "text"],
  ["address_line_2", "text"],
  ["address_line_3", "text"],
  ["city", "text"],
  ["state", "text"],
  ["zip_code", "text"],
  ["square_footage", "number"],
  ["georeference", "point"],
]);
export const NY_RETAIL_FOOD_FIELDS = Object.freeze(NY_RETAIL_FOOD_SCHEMA.map(([field]) => field));
export const NY_RETAIL_FOOD_SCHEMA_FINGERPRINT = "562e707cc527afbf3028a5f8c167b0a71125af7d6c7f852b8d9208f61911e365";

const ESTABLISHMENT_CODE_LABELS = Object.freeze({
  A: "Store / Article 28-A",
  B: "Bakery / Article 20-C",
  C: "Food Manufacturer / Article 20-C",
  D: "Food Warehouse / Article 28-D",
  E: "Beverage Plant / Article 20-C",
  F: "Feed Mill, Non-Medicated / Article 8",
  G: "Processing Plant / Article 20",
  H: "Wholesale Manufacturer / Article 20-C",
  I: "Refrigerated Warehouse / Article 19",
  J: "Multiple Operations",
  K: "Vehicle",
  L: "Produce Refrigerated Warehouse / Article 19",
  M: "Salvage Dealer / Article 17-B",
  N: "Wholesale Produce Packer",
  O: "Produce Grower, Packer, Broker, or Storage",
  P: "Controlled Atmosphere Room",
  Q: "Feed Mill, Medicated / Article 8",
  R: "Pet Food Manufacturer / Article 8",
  S: "Feed Warehouse or Distributor / Article 8",
  T: "Disposal Plant / Article 5-C",
  U: "Disposal Plant or Transportation Service / Article 5-C",
  V: "Slaughterhouse / Article 5-A",
  W: "Farm Winery exempt from Article 20-C",
  Z: "Farm Product Use Only",
});
const QUARANTINE_REASONS = new Set(["missing-or-invalid-license-identity", "source-filter-drift"]);

function textValue(value) {
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
  if (!Number.isInteger(unixSeconds) || unixSeconds <= 0) throw new Error("New York retail-food catalog rowsUpdatedAt must be a positive Unix timestamp.");
  return new Date(unixSeconds * 1000).toISOString();
}

function postalCode(value) {
  const raw = textValue(value);
  if (!/^[0-9]{5}$/.test(raw ?? "") || raw === "00000") return { source: raw, zip_code: null, status: "invalid-or-missing-zip5" };
  return { source: raw, zip_code: raw, status: "valid-source-reported-zip5" };
}

function squareFootage(value) {
  const raw = textValue(value);
  if (raw === null) return null;
  const number = Number(raw);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error("source-filter-drift");
  return number;
}

function geography(zipCode, baselineByZip) {
  if (!zipCode) return { zip_code: null, zcta_match_status: "not-evaluated-without-valid-zip", zcta_geo_id: null, zcta_geoid: null, zcta_geometry_file: null };
  const baseline = baselineByZip?.get(zipCode);
  return {
    zip_code: zipCode,
    zcta_match_status: baseline?.geography?.status ?? "no-2020-zcta-polygon",
    zcta_geo_id: baseline?.geography?.geo_id ?? null,
    zcta_geoid: baseline?.geography?.geoid ?? null,
    zcta_geometry_file: baseline?.geography?.geometry_file ?? null,
  };
}

function coordinate(value) {
  const coordinates = value?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length !== 2) return null;
  const longitude = Number(coordinates[0]);
  const latitude = Number(coordinates[1]);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  if (longitude < -80 || longitude > -71.7 || latitude < 40.4 || latitude > 45.1) return null;
  return {
    longitude,
    latitude,
    precision: "open-data-platform-generated-address-component-centroid",
    independently_verified: false,
    premise_coordinate_claim_permitted: false,
  };
}

function establishmentCodes(value) {
  const source = textValue(value);
  if (!source || !/^[A-Z]+$/.test(source) || !source.includes("A")) throw new Error("source-filter-drift");
  return [...new Set(source)].map((code) => ({
    code,
    label: ESTABLISHMENT_CODE_LABELS[code] ?? null,
    definition_status: ESTABLISHMENT_CODE_LABELS[code] ? "documented-in-source-code-reference" : "undocumented-in-current-source-code-reference",
  }));
}

function provenance(context, licenseNumber) {
  return {
    source_id: "new-york-agriculture-markets-retail-food-stores",
    source_release_id: context.sourceReleaseId,
    source_record_id: licenseNumber,
    ingest_run_id: context.runId,
    transformation_version: NY_RETAIL_FOOD_TRANSFORMATION_VERSION,
    policy_id: "ny-retail-food-stores",
  };
}

export function schemaFingerprint(columns) {
  const byField = new Map((columns ?? []).map((column) => [column.fieldName, column.dataTypeName]));
  return sha256(NY_RETAIL_FOOD_SCHEMA.map(([field]) => `${field}:${byField.get(field) ?? null}`).join("\u0000"));
}

export function normalizeNyRetailFoodStore(source, context) {
  const licenseNumber = textValue(source.license_number);
  const entityName = textValue(source.entity_name);
  const dbaName = textValue(source.dba_name);
  if (!/^[0-9]{6}$/.test(licenseNumber ?? "") || (!entityName && !dbaName)) throw new Error("missing-or-invalid-license-identity");
  if (textValue(source.operation_type) !== "Store" || textValue(source.state)?.toUpperCase() !== "NY") throw new Error("source-filter-drift");
  const postal = postalCode(source.zip_code);
  const streetNumber = textValue(source.street_number);
  const streetName = textValue(source.street_name);
  const city = textValue(source.city);
  const street = [streetNumber, streetName].filter(Boolean).join(" ") || null;
  const zipCoverageEligible = Boolean(streetName && city && postal.zip_code);
  const siteEligible = Boolean(streetNumber && streetName && city && postal.zip_code);
  const organizationId = `organization:ny_agm_retail_food_license_${licenseNumber}`;
  const entityCandidates = { organization_id: organizationId, identity_status: "provisional-license-record" };
  if (siteEligible) {
    entityCandidates.physical_site_id = `site:ny_agm_retail_food_license_${licenseNumber}`;
    entityCandidates.establishment_id = `establishment:ny_agm_retail_food_license_${licenseNumber}`;
  }
  return {
    schema_version: NY_RETAIL_FOOD_SCHEMA_VERSION,
    normalized_record_id: `ny-retail-food-store-license:${licenseNumber}`,
    entity_candidates: entityCandidates,
    external_identifiers: [{ type: "ny_agriculture_markets_retail_food_store_license", value: licenseNumber, source_field: "license_number" }],
    licensed_entity_name: entityName,
    doing_business_as_name: dbaName,
    display_name: dbaName ?? entityName,
    physical_address: {
      street_number: streetNumber,
      street_name: streetName,
      street,
      address_line_2: textValue(source.address_line_2),
      address_line_3: textValue(source.address_line_3),
      city,
      state: "NY",
      postal_code_source: postal.source,
      zip_code: postal.zip_code,
      postal_code: postal.zip_code,
      zip4: null,
      country: "US",
      postal_code_status: postal.status,
      county_source: textValue(source.county),
      source_scope: "department-reported-physical-location-for-this-license-snapshot",
      independently_verified: false,
      zip_coverage_eligible: zipCoverageEligible,
      site_inference_eligible: siteEligible,
      site_inference_reason: siteEligible ? "complete-source-reported-physical-address" : "incomplete-source-reported-physical-address",
    },
    reported_coordinate: coordinate(source.georeference),
    geography: geography(zipCoverageEligible ? postal.zip_code : null, context.baselineByZip),
    retail_food_store_license_profile: {
      license_number: licenseNumber,
      operation_type: "Store",
      establishment_type_source: textValue(source.estab_type),
      establishment_codes: establishmentCodes(source.estab_type),
      square_footage_source_reported: squareFootage(source.square_footage),
      county_source: textValue(source.county),
    },
    source_status: {
      value: "included-in-current-new-york-retail-food-store-license-snapshot",
      status_class: "current-source-snapshot-membership",
      source_rows_updated_at: context.sourceRowsUpdatedAt,
      semantics: "source-reported-license-list-membership-not-independent-proof-of-current-hours-continuous-operation-public-access-or-address-coordinate-precision",
    },
    privacy: {
      classification: "possible-natural-person-name-or-residential-business-location",
      record_level_distribution: "local-review-only",
    },
    observed_at: context.retrievedAt,
    provenance: provenance(context, licenseNumber),
    export_policy: "local-review-only",
  };
}

function assertAllowedUrl(urlValue, type) {
  const url = new URL(urlValue);
  const expectedPath = type === "metadata" ? `/api/views/${NY_RETAIL_FOOD_DATASET_ID}` : `/resource/${NY_RETAIL_FOOD_DATASET_ID}.json`;
  if (url.protocol !== "https:" || url.hostname !== "data.ny.gov" || url.pathname !== expectedPath || url.username || url.password || url.hash) {
    throw new Error(`New York retail-food ${type} URL is outside the allowlist.`);
  }
  return url;
}

export async function requestNyRetailFoodJson(urlValue, {
  type = "data",
  fetchImpl = globalThis.fetch,
  signal,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  attempts = 5,
  maximumResponseBytes = 50_000_000,
} = {}) {
  const url = assertAllowedUrl(urlValue, type);
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    signal?.throwIfAborted?.();
    try {
      const response = await fetchImpl(url, { method: "GET", redirect: "manual", signal, headers: { accept: "application/json", "user-agent": "Co*Tive-Collector/0.1 governed-public-data-connector" } });
      if (response.status >= 300 && response.status < 400) throw new Error("New York retail-food source redirect rejected.");
      if ((response.status === 429 || response.status >= 500) && attempt < attempts - 1) {
        const retryAfter = Number(response.headers.get("retry-after"));
        await sleep(Number.isFinite(retryAfter) ? Math.min(10_000, retryAfter * 1000) : Math.min(4_000, 250 * (2 ** attempt)));
        continue;
      }
      if (!response.ok) throw new Error(`New York retail-food source request failed with HTTP ${response.status}.`);
      const declaredBytes = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredBytes) && declaredBytes > maximumResponseBytes) throw new Error("New York retail-food response exceeds the byte limit.");
      const body = await response.text();
      if (Buffer.byteLength(body) > maximumResponseBytes) throw new Error("New York retail-food response exceeds the byte limit.");
      return JSON.parse(body);
    } catch (error) {
      lastError = error;
      if (error.name === "AbortError" || /redirect rejected|byte limit|HTTP 4\d\d/.test(error.message) || attempt === attempts - 1) throw error;
      await sleep(Math.min(4_000, 250 * (2 ** attempt)));
    }
  }
  throw lastError;
}

function validateCatalogMetadata(metadata, expectedFingerprint = NY_RETAIL_FOOD_SCHEMA_FINGERPRINT) {
  if (metadata?.id !== NY_RETAIL_FOOD_DATASET_ID || metadata?.name !== "Retail Food Stores") throw new Error("Unexpected New York Retail Food Stores catalog metadata.");
  if (metadata?.license !== null && metadata?.license !== undefined) throw new Error("New York Retail Food Stores dataset-specific license metadata changed.");
  if (metadata?.attribution !== "New York State Department of Agriculture and Markets" || metadata?.provenance !== "official" || metadata?.publicationStage !== "published") throw new Error("New York Retail Food Stores authority metadata changed.");
  const summary = metadata?.metadata?.custom_fields?.["Dataset Summary"];
  if (summary?.Organization !== "Division of Food Safety & Inspection" || summary?.["Time Period"] !== "Current" || summary?.["Posting Frequency"] !== "Annually" || summary?.Coverage !== "Statewide" || summary?.Granularity !== "Licensed entity") {
    throw new Error("New York Retail Food Stores scope metadata changed.");
  }
  const fingerprint = schemaFingerprint(metadata.columns);
  if (fingerprint !== expectedFingerprint) throw new Error(`New York Retail Food Stores selected schema changed (${fingerprint}).`);
  return { rowsUpdatedAt: metadata.rowsUpdatedAt, rowsUpdatedAtIso: sourceTimestamp(metadata.rowsUpdatedAt), schemaFingerprint: fingerprint };
}

function soqlUrl(parameters) {
  const url = new URL(NY_RETAIL_FOOD_API_URL);
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
  return url.toString();
}

async function countQuery(select, options) {
  const rows = await requestNyRetailFoodJson(soqlUrl({ $select: select }), options);
  const count = Number(rows?.[0]?.records);
  if (!Number.isInteger(count) || count < 0) throw new Error("New York retail-food count response is invalid.");
  return count;
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

async function openGzipWriter(directory, relativePath) {
  const destination = path.join(directory, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp-${randomUUID()}`;
  const output = createWriteStream(temporary, { flags: "wx" });
  const gzip = createGzip({ level: 9 });
  gzip.pipe(output);
  return { relativePath: relativePath.replaceAll("\\", "/"), destination, temporary, output, gzip, records: 0 };
}

async function writeGzipRecord(writer, record) {
  if (!writer.gzip.write(json(record))) await once(writer.gzip, "drain");
  writer.records += 1;
}

async function closeGzipWriter(writer, artifactType, metadata = {}) {
  writer.gzip.end();
  await finished(writer.output);
  await renameWithRetry(writer.temporary, writer.destination);
  return { path: writer.relativePath, ...(await hashFile(writer.destination)), record_count: writer.records, artifact_type: artifactType, ...metadata };
}

function abortWriter(writer) {
  writer.gzip.on("error", () => {});
  writer.output.on("error", () => {});
  writer.gzip.destroy();
  writer.output.destroy();
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
  const rows = (await readFile(path.resolve(path.dirname(manifestPath), artifact.path), "utf8")).split(/\r?\n/).filter(Boolean).map(JSON.parse);
  return { rows, byZip: new Map(rows.map((row) => [row.zip_code, row])), manifest, manifestSha256: sha256(manifestBuffer) };
}

async function* gzipRecords(filename) {
  const lines = createInterface({ input: createReadStream(filename).pipe(createGunzip()), crlfDelay: Infinity });
  for await (const line of lines) if (line) yield JSON.parse(line);
}

function sourceSafeRecord(record) {
  for (const field of Object.keys(record ?? {})) if (!NY_RETAIL_FOOD_FIELDS.includes(field)) throw new Error(`Unapproved New York retail-food source field ${field}.`);
  return Object.fromEntries(NY_RETAIL_FOOD_FIELDS.filter((field) => record[field] !== undefined).map((field) => [field, record[field]]));
}

async function acquireSource({ writer, sourceRecords, expectedCount, fetchImpl, signal, sleep, pageSize, logger }) {
  let count = 0;
  let previousId = null;
  const consume = async (input) => {
    signal?.throwIfAborted?.();
    const record = sourceSafeRecord(input);
    const id = textValue(record.license_number);
    if (!/^[0-9]{6}$/.test(id ?? "")) throw new Error("New York retail-food acquisition received an invalid license number.");
    if (previousId !== null && id <= previousId) throw new Error(`New York retail-food license numbers are not strictly increasing at ${id}.`);
    previousId = id;
    await writeGzipRecord(writer, record);
    count += 1;
  };
  if (sourceRecords) {
    for await (const record of sourceRecords) await consume(record);
  } else {
    let lastId = null;
    while (true) {
      const parameters = { $select: NY_RETAIL_FOOD_FIELDS.join(","), $order: "license_number ASC", $limit: String(pageSize) };
      if (lastId) parameters.$where = `license_number>'${lastId}'`;
      const rows = await requestNyRetailFoodJson(soqlUrl(parameters), { fetchImpl, signal, sleep, type: "data", maximumResponseBytes: 50_000_000 });
      if (!Array.isArray(rows) || rows.length > pageSize) throw new Error("New York retail-food page is invalid.");
      if (!rows.length) break;
      for (const record of rows) await consume(record);
      lastId = previousId;
      logger(`Acquired ${count.toLocaleString("en-US")} New York retail-food license records.`);
      if (rows.length < pageSize) break;
    }
  }
  if (count !== expectedCount) throw new Error(`New York retail-food acquisition returned ${count} rows; preflight reported ${expectedCount}.`);
  return count;
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
      ny_retail_food_store_license_snapshot: {
        status: count ? "published-source-reported-physical-location-evidence" : "no-source-reported-physical-location-evidence-in-current-snapshot",
        licensed_location_address_count: count,
        source_release_id: context.sourceReleaseId,
        source_rows_updated_at: context.sourceRowsUpdatedAt,
        semantics: "ZIP evidence can include an address missing street number; site entities require a complete numbered street address",
      },
    };
  });
}

function increment(map, key) {
  map.set(key ?? "(blank)", (map.get(key ?? "(blank)") ?? 0) + 1);
}

function sortedCounts(map) {
  return Object.fromEntries([...map].sort(([a], [b]) => String(a).localeCompare(String(b))));
}

export async function buildNyRetailFoodStores({
  outputRoot,
  zbpPointer,
  catalogMetadata = null,
  sourceRecords = null,
  minimumRows = 20_000,
  maximumQuarantineRate = 0.001,
  pageSize = 25_000,
  schemaFingerprintExpected = NY_RETAIL_FOOD_SCHEMA_FINGERPRINT,
  fetchImpl = globalThis.fetch,
  signal,
  sleep,
  logger = console.log,
  now = () => new Date(),
} = {}) {
  if (!outputRoot || !zbpPointer) throw new Error("outputRoot and zbpPointer are required.");
  if (!Number.isInteger(minimumRows) || minimumRows < 1) throw new Error("minimumRows must be positive.");
  if (!Number.isFinite(maximumQuarantineRate) || maximumQuarantineRate < 0 || maximumQuarantineRate > 1) throw new Error("maximumQuarantineRate must be from zero through one.");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50_000) throw new Error("pageSize must be from 1 through 50000.");
  signal?.throwIfAborted?.();
  const retrievedAt = now().toISOString();
  const runId = randomUUID();
  const releaseId = `ny-retail-food-stores-${releaseTimestamp(retrievedAt)}-${runId.slice(0, 8)}`;
  const stagingDirectory = path.join(outputRoot, ".staging", runId);
  await mkdir(stagingDirectory, { recursive: true });
  const baseline = await loadZbpBaseline(zbpPointer);
  const initialMetadata = catalogMetadata ?? await requestNyRetailFoodJson(NY_RETAIL_FOOD_METADATA_URL, { fetchImpl, signal, sleep, type: "metadata" });
  const catalog = validateCatalogMetadata(initialMetadata, schemaFingerprintExpected);
  const fixtureInput = sourceRecords !== null;
  const expectedCount = fixtureInput ? Number(initialMetadata.selectedRecordCount ?? sourceRecords.length) : await countQuery("count(*) as records", { fetchImpl, signal, sleep });
  const expectedDistinct = fixtureInput ? Number(initialMetadata.distinctLicenseCount ?? expectedCount) : await countQuery("count(distinct license_number) as records", { fetchImpl, signal, sleep });
  if (expectedCount !== expectedDistinct) throw new Error("New York retail-food license numbers are not unique.");
  if (expectedCount < minimumRows) throw new Error(`New York retail-food row count ${expectedCount} is below the ${minimumRows} quality floor.`);
  const preflightArtifact = await writeArtifact(stagingDirectory, "source/preflight.json", json({
    dataset_id: NY_RETAIL_FOOD_DATASET_ID,
    source_rows_updated_at: catalog.rowsUpdatedAtIso,
    selected_schema_fingerprint: catalog.schemaFingerprint,
    expected_source_rows: expectedCount,
    expected_distinct_license_numbers: expectedDistinct,
    selected_fields: NY_RETAIL_FOOD_FIELDS,
  }), { artifact_type: "ny-retail-food-stores-preflight", export_policy: "internal" });
  const sourceWriter = await openGzipWriter(stagingDirectory, "source/retail-food-stores-selected-fields.jsonl.gz");
  let sourceArtifact;
  try {
    await acquireSource({ writer: sourceWriter, sourceRecords, expectedCount, fetchImpl, signal, sleep, pageSize, logger });
    sourceArtifact = await closeGzipWriter(sourceWriter, "ny-retail-food-stores-source-jsonl-gzip", { export_policy: "internal" });
  } catch (error) {
    abortWriter(sourceWriter);
    throw error;
  }
  if (!catalogMetadata) {
    const finalMetadata = await requestNyRetailFoodJson(NY_RETAIL_FOOD_METADATA_URL, { fetchImpl, signal, sleep, type: "metadata" });
    const finalCatalog = validateCatalogMetadata(finalMetadata, schemaFingerprintExpected);
    const finalCount = await countQuery("count(*) as records", { fetchImpl, signal, sleep });
    const finalDistinct = await countQuery("count(distinct license_number) as records", { fetchImpl, signal, sleep });
    if (finalCatalog.rowsUpdatedAt !== catalog.rowsUpdatedAt || finalCount !== expectedCount || finalDistinct !== expectedDistinct) throw new Error("New York retail-food source changed during acquisition.");
  }
  const sourceReleaseDigest = sha256(`${catalog.rowsUpdatedAtIso}\u0000${sourceArtifact.sha256}`);
  const sourceReleaseId = `ny-retail-food-stores-${catalog.rowsUpdatedAtIso.slice(0, 10)}-${sourceReleaseDigest.slice(0, 16)}`;
  const context = { runId, retrievedAt, sourceRowsUpdatedAt: catalog.rowsUpdatedAtIso, sourceReleaseId, baselineByZip: baseline.byZip };
  const normalizedWriter = await openGzipWriter(stagingDirectory, "derived/licenses/records.jsonl.gz");
  const quarantineWriter = await openGzipWriter(stagingDirectory, "derived/quarantine/invalid-records.jsonl.gz");
  const countsByZip = new Map();
  const codeCounts = new Map();
  const countyCounts = new Map();
  let organizations = 0;
  let sites = 0;
  let zipEvidenceAddresses = 0;
  let coordinates = 0;
  let undocumentedCodeRows = 0;
  let quarantined = 0;
  try {
    for await (const source of gzipRecords(path.join(stagingDirectory, sourceArtifact.path))) {
      signal?.throwIfAborted?.();
      let normalized;
      try {
        normalized = normalizeNyRetailFoodStore(source, context);
        assertNormalizedUsPostalFieldsDeep(normalized);
      } catch (error) {
        if (!QUARANTINE_REASONS.has(error.message)) throw error;
        await writeGzipRecord(quarantineWriter, { schema_version: NY_RETAIL_FOOD_SCHEMA_VERSION, source_record_id: textValue(source.license_number), reason: error.message, source_release_id: sourceReleaseId, ingest_run_id: runId, export_policy: "internal" });
        quarantined += 1;
        continue;
      }
      await writeGzipRecord(normalizedWriter, normalized);
      organizations += 1;
      if (normalized.entity_candidates.physical_site_id) sites += 1;
      if (normalized.reported_coordinate) coordinates += 1;
      increment(countyCounts, normalized.physical_address.county_source);
      const codes = normalized.retail_food_store_license_profile.establishment_codes;
      if (codes.some((item) => item.definition_status.startsWith("undocumented"))) undocumentedCodeRows += 1;
      for (const item of codes) increment(codeCounts, item.code);
      if (normalized.physical_address.zip_coverage_eligible) {
        const zipCode = normalized.physical_address.zip_code;
        countsByZip.set(zipCode, (countsByZip.get(zipCode) ?? 0) + 1);
        zipEvidenceAddresses += 1;
      }
    }
  } catch (error) {
    abortWriter(normalizedWriter);
    abortWriter(quarantineWriter);
    throw error;
  }
  if (organizations + quarantined !== expectedCount) throw new Error("New York retail-food normalized and quarantined counts do not reconcile.");
  if (quarantined / expectedCount > maximumQuarantineRate) throw new Error("New York retail-food quarantine rate exceeds the configured quality gate.");
  const artifacts = [
    preflightArtifact,
    sourceArtifact,
    await closeGzipWriter(normalizedWriter, "normalized-ny-retail-food-store-license-jsonl-gzip", { export_policy: "local-review-only" }),
    await closeGzipWriter(quarantineWriter, "ny-retail-food-stores-quarantine-jsonl-gzip", { export_policy: "internal" }),
  ];
  const zipRows = buildZipCoverage(baseline.rows, countsByZip, context);
  artifacts.push(await writeArtifact(stagingDirectory, "derived/zip-coverage.jsonl", jsonLines(zipRows), { artifact_type: "ny-retail-food-stores-zip-coverage-jsonl", record_count: zipRows.length, export_policy: "public-aggregate-open-ny-terms" }));
  artifacts.push(await writeArtifact(stagingDirectory, "derived/source-summary.json", json({
    source_rows: expectedCount,
    organizations_published: organizations,
    provisional_physical_sites: sites,
    provisional_establishments: sites,
    organizations_without_complete_site_address: organizations - sites,
    zip_evidence_addresses: zipEvidenceAddresses,
    usable_platform_geocodes: coordinates,
    quarantined_source_records: quarantined,
    source_zip_codes: countsByZip.size,
    rows_with_undocumented_establishment_codes: undocumentedCodeRows,
    establishment_code_occurrences: sortedCounts(codeCounts),
    source_counties: sortedCounts(countyCounts),
  }), { artifact_type: "ny-retail-food-stores-source-summary", export_policy: "public-aggregate-open-ny-terms" }));
  artifacts.push(await writeArtifact(stagingDirectory, "source/release-metadata.json", json({
    dataset_id: NY_RETAIL_FOOD_DATASET_ID,
    dataset_name: initialMetadata.name,
    publisher: initialMetadata.attribution,
    license: initialMetadata.license,
    source_rows_updated_at: catalog.rowsUpdatedAtIso,
    source_rows_updated_at_unix: catalog.rowsUpdatedAt,
    selected_schema: NY_RETAIL_FOOD_SCHEMA,
    selected_schema_fingerprint: catalog.schemaFingerprint,
  }), { artifact_type: "ny-retail-food-stores-source-release-metadata", export_policy: "internal" }));
  const manifest = {
    manifest_version: "1.0.0",
    dataset_id: "ny-retail-food-store-license-sites",
    schema_version: NY_RETAIL_FOOD_SCHEMA_VERSION,
    connector: { id: "ny-retail-food-stores", version: "1.0.1" },
    release_id: releaseId,
    source_release_id: sourceReleaseId,
    run_id: runId,
    status: "published",
    complete_selected_license_snapshot: true,
    retrieved_at: retrievedAt,
    source_rows_updated_at: catalog.rowsUpdatedAtIso,
    coverage: {
      source_license_records: expectedCount,
      organizations_published: organizations,
      provisional_physical_sites: sites,
      provisional_establishments: sites,
      organizations_without_complete_site_address: organizations - sites,
      zip_evidence_addresses: zipEvidenceAddresses,
      usable_platform_geocodes: coordinates,
      quarantined_source_records: quarantined,
      source_zip_codes: countsByZip.size,
      zip_union_records: zipRows.length,
      rows_with_undocumented_establishment_codes: undocumentedCodeRows,
    },
    quality_gates: {
      minimum_source_rows: minimumRows,
      maximum_quarantine_rate: maximumQuarantineRate,
      source_and_published_counts_reconcile: organizations + quarantined === expectedCount,
      distinct_license_numbers_match_rows: expectedDistinct === expectedCount,
      selected_schema_fingerprint: catalog.schemaFingerprint,
      source_unchanged_during_acquisition: true,
    },
    policy: { record_level_distribution: "local-review-only", aggregate_distribution: "public-under-open-ny-terms-with-attribution-and-limitations" },
    dependencies: [
      { dataset_id: baseline.manifest.dataset_id, release_id: baseline.manifest.release_id, manifest_sha256: baseline.manifestSha256 },
      baseline.manifest.geography_dependency,
    ],
    source: {
      publisher: "New York State Department of Agriculture and Markets, Division of Food Safety & Inspection",
      catalog_dataset_id: NY_RETAIL_FOOD_DATASET_ID,
      source_page: NY_RETAIL_FOOD_PAGE_URL,
      api_url: NY_RETAIL_FOOD_API_URL,
      access_method: fixtureInput ? "explicit test fixture records" : "anonymous public Socrata API with stable keyset pagination",
      license: "OPEN-NY Terms of Use; no dataset-specific catalog license",
      api_key_used: false,
      policy_profile: "config/source-policies/ny-retail-food-stores.json",
    },
    limitations: [
      "This annual dataset is a snapshot of Department-licensed retail food stores and may not reflect day-to-day operations, hours, public access, or continuous operation.",
      "Each license row creates a provisional organization candidate; matching legal entities, chains, networks, and parent companies across license rows or other sources requires separate versioned evidence.",
      "A provisional physical site and establishment require a complete numbered street address. ZIP evidence may retain a reported physical location missing a street number.",
      "Coordinates are generated by the Open Data platform from supplied address components, can be shared by multiple records, and are not claimed as verified premise coordinates.",
      "Establishment code Y occurs in the source but is not defined in the attached code reference; it is retained as undocumented rather than interpreted.",
      "Entity names and physical addresses can identify individuals or residences; record-level artifacts are local-review-only.",
      "Current USPS ZIP validity remains unverified until an authorized operational ZIP denominator is integrated.",
    ],
    artifacts,
  };
  await writeArtifact(stagingDirectory, "manifest.json", json(manifest));
  const publication = await publishNyRetailFoodStoresStaging({ outputRoot, stagingRunId: runId, expectedReleaseId: releaseId });
  logger(`Published ${organizations.toLocaleString("en-US")} New York retail-food license records and ${sites.toLocaleString("en-US")} provisional sites.`);
  return { manifest, releaseDirectory: publication.releaseDirectory, pointerPath: publication.pointerPath };
}

function replayRecord(record) {
  const value = structuredClone(record);
  delete value.geography;
  return value;
}

export async function publishNyRetailFoodStoresStaging({ outputRoot, stagingRunId, expectedReleaseId = null } = {}) {
  if (!outputRoot || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stagingRunId ?? "")) throw new Error("outputRoot and a valid stagingRunId are required.");
  const stagingRoot = path.join(outputRoot, ".staging");
  const stagingDirectory = path.resolve(stagingRoot, stagingRunId);
  assertContained(stagingRoot, stagingDirectory, "New York retail-food staging run");
  const manifestPath = path.join(stagingDirectory, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.run_id !== stagingRunId || manifest.dataset_id !== "ny-retail-food-store-license-sites" || manifest.status !== "published") throw new Error("New York retail-food staging manifest does not match the requested complete run.");
  if (expectedReleaseId && manifest.release_id !== expectedReleaseId) throw new Error("New York retail-food staging release ID does not match.");
  await verifyNyRetailFoodStores(manifestPath);
  const releasesDirectory = path.join(outputRoot, "releases");
  await mkdir(releasesDirectory, { recursive: true });
  const releaseDirectory = path.join(releasesDirectory, manifest.release_id);
  try {
    await stat(releaseDirectory);
    throw new Error(`New York retail-food release destination already exists: ${manifest.release_id}.`);
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

export async function verifyNyRetailFoodStores(manifestPath) {
  const releaseDirectory = path.dirname(path.resolve(manifestPath));
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const failures = [];
  if (manifest.dataset_id !== "ny-retail-food-store-license-sites" || manifest.status !== "published" || !manifest.complete_selected_license_snapshot) failures.push({ path: "manifest.json", reason: "unexpected or incomplete manifest" });
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
  const sourceArtifact = manifest.artifacts?.find((artifact) => artifact.artifact_type === "ny-retail-food-stores-source-jsonl-gzip");
  const normalizedArtifact = manifest.artifacts?.find((artifact) => artifact.artifact_type === "normalized-ny-retail-food-store-license-jsonl-gzip");
  const quarantineArtifact = manifest.artifacts?.find((artifact) => artifact.artifact_type === "ny-retail-food-stores-quarantine-jsonl-gzip");
  if (!sourceArtifact || !normalizedArtifact || !quarantineArtifact) failures.push({ path: "manifest.json", reason: "required record artifacts missing" });
  const expectedHash = createHash("sha256");
  const actualHash = createHash("sha256");
  const expectedQuarantineHash = createHash("sha256");
  const actualQuarantineHash = createHash("sha256");
  const countsByZip = new Map();
  const replayContext = { runId: manifest.run_id, retrievedAt: manifest.retrieved_at, sourceRowsUpdatedAt: manifest.source_rows_updated_at, sourceReleaseId: manifest.source_release_id, baselineByZip: new Map() };
  let sourceCount = 0;
  if (sourceArtifact) {
    const digest = sha256(`${manifest.source_rows_updated_at}\u0000${sourceArtifact.sha256}`);
    if (manifest.source_release_id !== `ny-retail-food-stores-${manifest.source_rows_updated_at.slice(0, 10)}-${digest.slice(0, 16)}`) failures.push({ path: "manifest.json", reason: "source release ID is not bound to timestamp and checksum" });
    try {
      let previousId = null;
      for await (const source of gzipRecords(path.join(releaseDirectory, sourceArtifact.path))) {
        const id = textValue(source.license_number);
        if (!/^[0-9]{6}$/.test(id ?? "") || (previousId && id <= previousId)) throw new Error(`invalid source ordering at ${id}`);
        previousId = id;
        try {
          const normalized = normalizeNyRetailFoodStore(source, replayContext);
          assertNormalizedUsPostalFieldsDeep(normalized);
          expectedHash.update(json(replayRecord(normalized)));
        } catch (error) {
          if (!QUARANTINE_REASONS.has(error.message)) throw error;
          expectedQuarantineHash.update(json({ schema_version: NY_RETAIL_FOOD_SCHEMA_VERSION, source_record_id: id, reason: error.message, source_release_id: manifest.source_release_id, ingest_run_id: manifest.run_id, export_policy: "internal" }));
        }
        sourceCount += 1;
      }
    } catch (error) {
      failures.push({ path: sourceArtifact.path, reason: `source validation failed: ${error.message}` });
    }
  }
  let organizations = 0;
  let sites = 0;
  let zipEvidence = 0;
  let coordinates = 0;
  const ids = new Set();
  if (normalizedArtifact) {
    try {
      for await (const record of gzipRecords(path.join(releaseDirectory, normalizedArtifact.path))) {
        const id = record.external_identifiers?.find((item) => item.type === "ny_agriculture_markets_retail_food_store_license")?.value;
        if (!id || ids.has(id)) throw new Error(`missing or duplicate license ${id}`);
        ids.add(id);
        if (record.entity_candidates.organization_id !== `organization:ny_agm_retail_food_license_${id}` || record.export_policy !== "local-review-only" || record.provenance?.policy_id !== "ny-retail-food-stores") throw new Error(`invalid identity, policy, or provenance for ${id}`);
        if (record.entity_candidates.physical_site_id) sites += 1;
        if (record.reported_coordinate) coordinates += 1;
        if (record.physical_address.zip_coverage_eligible) {
          const zipCode = record.physical_address.zip_code;
          countsByZip.set(zipCode, (countsByZip.get(zipCode) ?? 0) + 1);
          zipEvidence += 1;
        }
        actualHash.update(json(replayRecord(record)));
        organizations += 1;
      }
    } catch (error) {
      failures.push({ path: normalizedArtifact.path, reason: `normalized validation failed: ${error.message}` });
    }
  }
  let quarantined = 0;
  if (quarantineArtifact) {
    try {
      for await (const record of gzipRecords(path.join(releaseDirectory, quarantineArtifact.path))) {
        if (!QUARANTINE_REASONS.has(record.reason) || record.export_policy !== "internal") throw new Error(`invalid quarantine record ${record.source_record_id}`);
        actualQuarantineHash.update(json(record));
        quarantined += 1;
      }
    } catch (error) {
      failures.push({ path: quarantineArtifact.path, reason: `quarantine validation failed: ${error.message}` });
    }
  }
  if (sourceCount !== manifest.coverage?.source_license_records || organizations !== manifest.coverage?.organizations_published || organizations + quarantined !== sourceCount) failures.push({ path: "manifest.json", reason: "source, published, and quarantine counts do not reconcile" });
  if (sites !== manifest.coverage?.provisional_physical_sites || zipEvidence !== manifest.coverage?.zip_evidence_addresses || coordinates !== manifest.coverage?.usable_platform_geocodes) failures.push({ path: "manifest.json", reason: "site, ZIP, or coordinate counts do not reconcile" });
  if (expectedHash.digest("hex") !== actualHash.digest("hex") || expectedQuarantineHash.digest("hex") !== actualQuarantineHash.digest("hex")) failures.push({ path: "manifest.json", reason: "source replay does not match derived records" });
  const zipArtifact = manifest.artifacts?.find((artifact) => artifact.artifact_type === "ny-retail-food-stores-zip-coverage-jsonl");
  if (!zipArtifact) failures.push({ path: "manifest.json", reason: "ZIP coverage artifact missing" });
  else {
    try {
      const rows = (await readFile(path.join(releaseDirectory, zipArtifact.path), "utf8")).split(/\r?\n/).filter(Boolean).map(JSON.parse);
      if (rows.length !== manifest.coverage.zip_union_records) throw new Error("ZIP union count mismatch");
      const total = rows.reduce((sum, row) => sum + row.ny_retail_food_store_license_snapshot.licensed_location_address_count, 0);
      if (total !== zipEvidence) throw new Error("ZIP evidence total mismatch");
      for (const row of rows) {
        if ((countsByZip.get(row.zip_code) ?? 0) !== row.ny_retail_food_store_license_snapshot.licensed_location_address_count) throw new Error(`ZIP ${row.zip_code} does not reconcile`);
        if (row.current_usps_validity?.status !== "unverified") throw new Error(`ZIP ${row.zip_code} overstates USPS validity`);
      }
    } catch (error) {
      failures.push({ path: zipArtifact.path, reason: `ZIP validation failed: ${error.message}` });
    }
  }
  if (failures.length) {
    const error = new Error(`New York retail-food release verification failed for ${failures.length} check(s).`);
    error.failures = failures;
    throw error;
  }
  return { dataset_id: manifest.dataset_id, release_id: manifest.release_id, source_release_id: manifest.source_release_id, artifact_count: manifest.artifacts.length, coverage: manifest.coverage };
}
