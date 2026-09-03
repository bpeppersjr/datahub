import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { finished } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";
import { DuckDBInstance } from "@duckdb/node-api";

export const OVERTURE_US_PLACE_SCHEMA_VERSION = "1.0.0";
export const OVERTURE_US_PLACE_TRANSFORMATION_VERSION = "overture-us-places@1.0.0";
export const OVERTURE_STAC_URL = "https://stac.overturemaps.org/catalog.json";
export const OVERTURE_ATTRIBUTION_URL = "https://docs.overturemaps.org/attribution/";
export const OVERTURE_PLACES_GUIDE_URL = "https://docs.overturemaps.org/guides/places/";
export const OVERTURE_PLACE_SCHEMA_URL = "https://docs.overturemaps.org/schema/reference/places/place/";
export const OVERTURE_MAX_STAC_ASSETS = 32;
export const OVERTURE_MAX_DECLARED_GLOBAL_ROWS = 100_000_000;
export const OVERTURE_LARGE_ACQUISITION_CONFIRMATION = "I-APPROVE-OVERTURE-LARGE-ACQUISITION";
export const OVERTURE_PLACES_NOTICE = `Overture Maps Foundation Places theme\n\nSource and licensing details: https://docs.overturemaps.org/attribution/\n\nThe theme contains data from Meta, Microsoft, PinMeTo, Krick, RenderSEO, DAC, and BrightQuery under CDLA-Permissive-2.0; Foursquare under Apache-2.0; and AllThePlaces under CC0-1.0.\n\nFoursquare data: Copyright 2024 Foursquare Labs, Inc. All rights reserved. The data was transformed to the Overture schema. Preserve the applicable Foursquare NOTICE available from https://opensource.foursquare.com/NOTICE.txt when redistributing covered record-level derivatives.\n`;

export const OVERTURE_SELECTED_FIELDS = Object.freeze([
  "id", "version", "operating_status", "basic_category", "taxonomy_primary", "taxonomy_hierarchy", "taxonomy_alternates",
  "confidence", "primary_name", "common_names", "websites", "brand_primary_name", "brand_common_names", "brand_wikidata",
  "address_freeform", "address_locality", "address_postcode", "address_region", "address_country", "latitude", "longitude", "sources",
]);

const GERS_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RELEASE_ID = /^20\d{2}-\d{2}-\d{2}\.\d+$/;
const QUARANTINE_REASONS = new Set([
  "missing-or-invalid-gers-id", "missing-place-name", "missing-or-invalid-taxonomy", "invalid-confidence", "permanently-closed-record",
  "invalid-address-country", "missing-or-invalid-coordinate", "missing-source-provenance", "invalid-version",
]);
const BUSINESS_OR_INSTITUTION_TOP_LEVELS = new Set([
  "services_and_business", "shopping", "food_and_drink", "lifestyle_services", "travel_and_transportation", "health_care",
  "education", "cultural_and_historic", "sports_and_recreation", "lodging", "arts_and_entertainment",
]);
const FORBIDDEN_RECORD_KEYS = new Set(["geometry", "bbox", "emails", "phones", "socials"]);
const SOURCE_LICENSES = new Map([
  ["alltheplaces", "CC0-1.0"], ["brightquery", "CDLA-Permissive-2.0"], ["dac", "CDLA-Permissive-2.0"],
  ["foursquare", "Apache-2.0"], ["krick", "CDLA-Permissive-2.0"], ["meta", "CDLA-Permissive-2.0"],
  ["microsoft", "CDLA-Permissive-2.0"], ["pinmeto", "CDLA-Permissive-2.0"], ["renderseo", "CDLA-Permissive-2.0"],
]);

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
  return `${JSON.stringify(value, null, 2)}\n`;
}

function jsonLines(values) {
  return values.length ? `${values.map((value) => JSON.stringify(value)).join("\n")}\n` : "";
}

function releaseTimestamp(instant) {
  return instant.replaceAll(/[-:.]/g, "").replace("T", "-").replace("Z", "Z");
}

function compareText(left, right) {
  return String(left ?? "").localeCompare(String(right ?? ""), "en", { numeric: true });
}

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function sortedCounts(map) {
  return Object.fromEntries([...map.entries()].sort(([left], [right]) => compareText(left, right)));
}

function assertContained(parent, child, label) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`${label} escapes its governed directory.`);
}

async function renameWithRetry(source, destination) {
  let lastError;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await rename(source, destination);
      return;
    } catch (error) {
      lastError = error;
      if (!["EPERM", "EACCES", "EBUSY"].includes(error?.code) || attempt === 5) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function writeArtifact(directory, relativePath, content, metadata = {}) {
  const destination = path.join(directory, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
  const temporary = `${destination}.tmp-${randomUUID()}`;
  await writeFile(temporary, buffer);
  await renameWithRetry(temporary, destination);
  return { path: relativePath.replaceAll("\\", "/"), bytes: buffer.length, sha256: sha256(buffer), ...metadata };
}

async function openGzipWriter(directory, relativePath) {
  const destination = path.join(directory, relativePath);
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

async function closeGzipWriter(writer, artifactType, metadata = {}) {
  const completion = finished(writer.output);
  writer.gzip.end();
  await completion;
  await renameWithRetry(writer.temporary, writer.destination);
  return { path: writer.relativePath.replaceAll("\\", "/"), ...(await hashFile(writer.destination)), record_count: writer.records, artifact_type: artifactType, ...metadata };
}

async function abortGzipWriters(writers) {
  for (const writer of writers.filter(Boolean)) {
    if (!writer.gzip.destroyed && !writer.gzip.writableEnded) writer.gzip.destroy();
    writer.output.destroy();
  }
  await Promise.allSettled(writers.filter(Boolean).map((writer) => finished(writer.output)));
}

async function* gzipRecords(filename) {
  const input = createReadStream(filename).pipe(createGunzip());
  const lines = createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) if (line.trim()) yield JSON.parse(line);
}

async function countGzipRecords(filename, signal) {
  let count = 0;
  for await (const unused of gzipRecords(filename)) {
    void unused;
    signal?.throwIfAborted?.();
    count += 1;
  }
  return count;
}

function assertExactSelectedRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error("Overture selected source record must be an object.");
  const actual = Object.keys(record).sort();
  const expected = [...OVERTURE_SELECTED_FIELDS].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("Overture selected source fields drifted.");
  const serialized = JSON.stringify(record).toLowerCase();
  for (const key of FORBIDDEN_RECORD_KEYS) if (serialized.includes(`\"${key}\"`)) throw new Error(`Forbidden Overture field ${key} leaked into the selected source.`);
  return record;
}

function normalizeRegion(value) {
  const raw = textValue(value)?.toUpperCase();
  if (!raw) return null;
  const match = raw.match(/^(?:US-)?([A-Z]{2})$/);
  return match?.[1] ?? null;
}

export function splitUsPostcode(value) {
  const raw = textValue(value);
  const match = raw?.match(/^(\d{5})(?:-?(\d{4}))?$/);
  if (!match || match[1] === "00000") return { zip_code: null, zip4: null, source_postcode: raw, status: raw ? "unusable-source-postcode" : "source-postcode-unreported" };
  return { zip_code: match[1], zip4: match[2] ?? null, source_postcode: raw, status: match[2] ? "normalized-us-zip-plus-4" : "normalized-us-zip5" };
}

function sourceLicense(dataset, declaredLicense) {
  const normalized = textValue(dataset)?.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
  return textValue(declaredLicense) ?? SOURCE_LICENSES.get(normalized) ?? "source-license-review-required";
}

function normalizeSources(value) {
  if (!Array.isArray(value) || value.length === 0) throw new Error("missing-source-provenance");
  const result = value.map((source) => {
    const dataset = textValue(source?.dataset);
    const recordId = textValue(source?.record_id);
    if (!dataset || !recordId) throw new Error("missing-source-provenance");
    return {
      dataset,
      record_id: recordId,
      update_time: textValue(source.update_time),
      source_confidence: Number.isFinite(Number(source.confidence)) ? Number(source.confidence) : null,
      license: sourceLicense(dataset, source.license),
    };
  });
  result.sort((left, right) => compareText(`${left.dataset}:${left.record_id}`, `${right.dataset}:${right.record_id}`));
  return result;
}

function operatingStatus(value) {
  const raw = textValue(value)?.toLowerCase() ?? null;
  if (raw === "permanently_closed") throw new Error("permanently-closed-record");
  if (raw === "open") return { source_value: raw, status_class: "source-indicated-continued-operation", active_business_status_inferred: false };
  if (raw === "temporarily_closed") return { source_value: raw, status_class: "source-indicated-temporary-operating-hiatus", active_business_status_inferred: false };
  if (raw === null) return { source_value: null, status_class: "source-operating-status-unreported", active_business_status_inferred: false };
  return { source_value: raw, status_class: "unrecognized-source-operating-status", active_business_status_inferred: false };
}

function placeScope(topLevel) {
  if (topLevel === "geographic_entities") return "non-business-geographic-context";
  if (topLevel === "community_and_government") return "community-or-government-place-context";
  if (BUSINESS_OR_INSTITUTION_TOP_LEVELS.has(topLevel)) return "business-or-institution-place-candidate";
  return "unclassified-place-candidate";
}

export function normalizeOvertureUsPlace(source, context) {
  assertExactSelectedRecord(source);
  const id = textValue(source.id)?.toLowerCase();
  if (!id || !GERS_ID.test(id)) throw new Error("missing-or-invalid-gers-id");
  const version = Number(source.version);
  if (!Number.isSafeInteger(version) || version < 0) throw new Error("invalid-version");
  const primaryName = textValue(source.primary_name);
  if (!primaryName) throw new Error("missing-place-name");
  const taxonomyPrimary = textValue(source.taxonomy_primary);
  const hierarchy = Array.isArray(source.taxonomy_hierarchy) ? source.taxonomy_hierarchy.map(textValue).filter(Boolean) : [];
  if (!taxonomyPrimary || hierarchy.length === 0 || hierarchy.at(-1) !== taxonomyPrimary || new Set(hierarchy).size !== hierarchy.length) throw new Error("missing-or-invalid-taxonomy");
  const confidence = source.confidence === null || source.confidence === undefined ? null : Number(source.confidence);
  if (confidence !== null && (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)) throw new Error("invalid-confidence");
  const latitude = Number(source.latitude);
  const longitude = Number(source.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new Error("missing-or-invalid-coordinate");
  if (textValue(source.address_country)?.toUpperCase() !== "US") throw new Error("invalid-address-country");
  const postal = splitUsPostcode(source.address_postcode);
  const baseline = postal.zip_code ? context.baselineByZip.get(postal.zip_code) : null;
  const state = normalizeRegion(source.address_region);
  const postalState = textValue(baseline?.postal_label?.preferred_state)?.toUpperCase() ?? null;
  const topLevel = hierarchy[0];
  const sourceRecords = normalizeSources(source.sources);
  const status = operatingStatus(source.operating_status);
  const websites = Array.isArray(source.websites)
    ? [...new Set(source.websites.map(textValue).filter((value) => /^https?:\/\//i.test(value ?? "")))].sort(compareText)
    : [];
  const brandName = textValue(source.brand_primary_name);
  return {
    schema_version: OVERTURE_US_PLACE_SCHEMA_VERSION,
    normalized_record_id: `overture-us-place:${id}`,
    external_identifiers: [{ type: "overture_gers_id", value: id, version }],
    names: { primary_name: primaryName, common_names: source.common_names ?? null },
    classification: {
      basic_category: textValue(source.basic_category),
      taxonomy_primary: taxonomyPrimary,
      taxonomy_hierarchy: hierarchy,
      taxonomy_alternates: Array.isArray(source.taxonomy_alternates) ? source.taxonomy_alternates.map(textValue).filter(Boolean) : [],
      top_level_category: topLevel,
      place_scope: placeScope(topLevel),
      commercial_business_asserted: false,
    },
    source_status: { ...status, confidence, confidence_semantics: "relative-existence-confidence-not-calibrated-probability-or-coverage" },
    reported_address: {
      address_line: textValue(source.address_freeform),
      locality: textValue(source.address_locality),
      state,
      zip_code: postal.zip_code,
      zip4: postal.zip4,
      source_postcode: postal.source_postcode,
      country: "US",
      validation_status: baseline ? postal.status : (postal.zip_code ? "zip-not-in-current-zbp-zcta-union" : postal.status),
      source_state_conflicts_with_postal_label: Boolean(state && postalState && state !== postalState),
    },
    geocode: { latitude, longitude, source: "overture-place-point" },
    websites,
    brand: brandName || textValue(source.brand_wikidata) ? {
      primary_name: brandName,
      common_names: source.brand_common_names ?? null,
      wikidata: textValue(source.brand_wikidata),
    } : null,
    source_records: sourceRecords,
    entity_candidates: {
      physical_site_id: `physical_site:overture_gers_${id}`,
      establishment_id: `establishment:overture_gers_${id}`,
      brand_id: brandName ? `brand:overture_${sha256(`${brandName}:${textValue(source.brand_wikidata) ?? ""}`).slice(0, 24)}` : null,
    },
    provenance: {
      source_id: "overture-maps-places",
      source_release_id: context.sourceReleaseId,
      source_record_id: id,
      ingest_run_id: context.runId,
      transformation_version: OVERTURE_US_PLACE_TRANSFORMATION_VERSION,
      policy_id: "overture-us-places",
      observed_at: context.releaseObservedAt,
      retrieved_at: context.retrievedAt,
    },
    privacy: { geometry_excluded: true, bbox_excluded: true, emails_excluded: true, phones_excluded: true, socials_excluded: true },
    export_policy: "local-review-only",
  };
}

function exactHttpsUrl(value, { host, pathPattern, label }) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== host || url.username || url.password || url.port || url.search || url.hash || !pathPattern.test(url.pathname)) {
    throw new Error(`Unexpected ${label} URL.`);
  }
  return url;
}

async function requestJson(url, { fetchImpl = fetch, signal, sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)), attempts = 4 } = {}) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    signal?.throwIfAborted?.();
    try {
      const response = await fetchImpl(url, { redirect: "manual", signal, headers: { Accept: "application/json", "User-Agent": "CoTiveCollector/0.1 (+governed-public-data-ingest)" } });
      if (response.status >= 300 && response.status < 400) throw new Error("Overture metadata redirects are not permitted.");
      if ([408, 425, 429, 500, 502, 503, 504].includes(response.status) && attempt < attempts - 1) {
        await sleep(Math.min(8_000, 500 * (2 ** attempt)));
        continue;
      }
      if (!response.ok) throw new Error(`Overture metadata returned HTTP ${response.status}.`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (error?.name === "AbortError" || /redirects|HTTP 4\d\d/.test(error.message) || attempt === attempts - 1) throw error;
      await sleep(Math.min(8_000, 500 * (2 ** attempt)));
    }
  }
  throw lastError;
}

function stacFingerprint(metadata) {
  return sha256(JSON.stringify({
    release_id: metadata.release_id,
    assets: metadata.assets.map(({ item_id, url, num_rows, num_row_groups, datetime }) => ({ item_id, url, num_rows, num_row_groups, datetime })),
  }));
}

export async function preflightOverturePlaces({ requestedRelease = null, fetchImpl = fetch, signal, sleep, now = () => new Date() } = {}) {
  if (requestedRelease !== null && !RELEASE_ID.test(requestedRelease)) throw new Error("Overture release must match YYYY-MM-DD.N.");
  const rootUrl = exactHttpsUrl(OVERTURE_STAC_URL, { host: "stac.overturemaps.org", pathPattern: /^\/catalog\.json$/, label: "Overture STAC root" });
  const root = await requestJson(rootUrl, { fetchImpl, signal, sleep });
  if (root.type !== "Catalog" || root.stac_version !== "1.1.0") throw new Error("Overture STAC root identity or version drifted.");
  const latestLinks = (root.links ?? []).filter((link) => link.rel === "child" && link.latest === true);
  if (latestLinks.length !== 1) throw new Error("Overture STAC root does not declare exactly one latest release.");
  const latest = latestLinks[0];
  const latestUrl = latest ? exactHttpsUrl(latest.href, { host: "stac.overturemaps.org", pathPattern: /^\/20\d{2}-\d{2}-\d{2}\.\d+\/catalog\.json$/, label: "latest release" }) : null;
  if (!latestUrl) throw new Error("Overture STAC root has no unique latest release link.");
  const latestReleaseId = latestUrl.pathname.split("/")[1];
  const releaseId = requestedRelease ?? latestReleaseId;
  const collectionUrl = new URL(`https://stac.overturemaps.org/${releaseId}/places/place/collection.json`);
  const collection = await requestJson(collectionUrl, { fetchImpl, signal, sleep });
  if (collection.type !== "Collection" || collection.id !== "place" || collection.stac_version !== "1.1.0") throw new Error("Overture places collection identity or version drifted.");
  const itemLinks = (collection.links ?? []).filter((link) => link.rel === "item").map((link) => exactHttpsUrl(link.href, {
    host: "stac.overturemaps.org", pathPattern: new RegExp(`^/${releaseId.replace(".", "\\.")}/places/place/\\d{5}/\\d{5}\\.json$`), label: "place item",
  }));
  if (itemLinks.length < 1 || itemLinks.length > OVERTURE_MAX_STAC_ASSETS || new Set(itemLinks.map(String)).size !== itemLinks.length) throw new Error("Overture place item count or uniqueness failed its guardrail.");
  const assets = [];
  for (const itemUrl of itemLinks) {
    signal?.throwIfAborted?.();
    const item = await requestJson(itemUrl, { fetchImpl, signal, sleep });
    const assetUrl = exactHttpsUrl(item.assets?.aws?.href ?? "", {
      host: "overturemaps-us-west-2.s3.us-west-2.amazonaws.com",
      pathPattern: new RegExp(`^/release/${releaseId.replace(".", "\\.")}/theme=places/type=place/part-\\d{5}-[0-9a-f-]+-c000\\.zstd\\.parquet$`),
      label: "AWS place asset",
    });
    const numRows = Number(item.properties?.num_rows);
    const numRowGroups = Number(item.properties?.num_row_groups);
    if (item.type !== "Feature" || !Number.isSafeInteger(numRows) || numRows < 1 || !Number.isSafeInteger(numRowGroups) || numRowGroups < 1) throw new Error("Overture place item metadata drifted.");
    const itemId = textValue(item.id);
    if (itemId !== itemUrl.pathname.split("/").at(-2)) throw new Error("Overture place item ID does not match its immutable path.");
    assets.push({ item_id: itemId, item_url: String(itemUrl), url: String(assetUrl), num_rows: numRows, num_row_groups: numRowGroups, datetime: textValue(item.properties.datetime) });
  }
  assets.sort((left, right) => compareText(left.item_id, right.item_id));
  const declaredGlobalRows = assets.reduce((sum, asset) => sum + asset.num_rows, 0);
  if (declaredGlobalRows > OVERTURE_MAX_DECLARED_GLOBAL_ROWS) throw new Error("Overture declared global place rows exceed the configured guardrail.");
  const result = {
    schema_version: OVERTURE_US_PLACE_SCHEMA_VERSION,
    status: "ready-metadata-only-large-acquisition-not-authorized",
    latest_release_id: latestReleaseId,
    release_id: releaseId,
    root_url: OVERTURE_STAC_URL,
    collection_url: String(collectionUrl),
    observed_at: now().toISOString(),
    asset_count: assets.length,
    declared_global_rows: declaredGlobalRows,
    assets,
    geometry_policy: "business-records-retain-latitude-and-longitude-only",
  };
  result.stac_fingerprint = stacFingerprint(result);
  return result;
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function overtureExtractionSql(assetUrls, destination) {
  if (!Array.isArray(assetUrls) || assetUrls.length < 1 || assetUrls.length > OVERTURE_MAX_STAC_ASSETS) throw new Error("A bounded Overture asset list is required.");
  for (const value of assetUrls) exactHttpsUrl(value, {
    host: "overturemaps-us-west-2.s3.us-west-2.amazonaws.com", pathPattern: /^\/release\/20\d{2}-\d{2}-\d{2}\.\d+\/theme=places\/type=place\/part-\d{5}-[0-9a-f-]+-c000\.zstd\.parquet$/, label: "AWS place asset",
  });
  const urls = `[${assetUrls.map(sqlLiteral).join(",")}]`;
  const target = sqlLiteral(path.resolve(destination).replaceAll("\\", "/"));
  return `COPY (
WITH selected AS (
  SELECT *, list_extract(list_filter(addresses, address -> upper(coalesce(address.country, '')) = 'US'), 1) AS us_address
  FROM read_parquet(${urls}, union_by_name = true)
  WHERE list_contains(list_transform(addresses, address -> upper(coalesce(address.country, ''))), 'US')
    AND coalesce(operating_status::VARCHAR, '') <> 'permanently_closed'
)
SELECT
  id::VARCHAR AS id,
  version::BIGINT AS version,
  operating_status::VARCHAR AS operating_status,
  basic_category::VARCHAR AS basic_category,
  taxonomy.primary::VARCHAR AS taxonomy_primary,
  taxonomy.hierarchy AS taxonomy_hierarchy,
  taxonomy.alternates AS taxonomy_alternates,
  confidence::DOUBLE AS confidence,
  names.primary::VARCHAR AS primary_name,
  names.common AS common_names,
  websites,
  brand.names.primary::VARCHAR AS brand_primary_name,
  brand.names.common AS brand_common_names,
  brand.wikidata::VARCHAR AS brand_wikidata,
  us_address.freeform::VARCHAR AS address_freeform,
  us_address.locality::VARCHAR AS address_locality,
  us_address.postcode::VARCHAR AS address_postcode,
  us_address.region::VARCHAR AS address_region,
  us_address.country::VARCHAR AS address_country,
  ((bbox.ymin + bbox.ymax) / 2)::DOUBLE AS latitude,
  ((bbox.xmin + bbox.xmax) / 2)::DOUBLE AS longitude,
  sources
FROM selected
) TO ${target} (FORMAT JSON, ARRAY false, COMPRESSION gzip);`;
}

export async function prepareOvertureUsPlacesSource({
  outputRoot, requestedRelease = null, authorization, fetchImpl = fetch, signal, sleep, logger = console.log, now = () => new Date(),
} = {}) {
  if (!outputRoot) throw new Error("outputRoot is required.");
  if (authorization !== OVERTURE_LARGE_ACQUISITION_CONFIRMATION) throw new Error("Large Overture acquisition is blocked without the exact explicit authorization confirmation.");
  signal?.throwIfAborted?.();
  const preflight = await preflightOverturePlaces({ requestedRelease, fetchImpl, signal, sleep, now });
  const runId = randomUUID();
  const stagingDirectory = path.join(outputRoot, ".staging", runId);
  await mkdir(stagingDirectory, { recursive: true });
  const sourcePath = path.join(stagingDirectory, "selected-us-places.jsonl.gz");
  const query = overtureExtractionSql(preflight.assets.map((asset) => asset.url), sourcePath);
  const queryContractSha256 = sha256(query.replaceAll(path.resolve(sourcePath).replaceAll("\\", "/"), "<RUN_SCOPED_DESTINATION>"));
  const databasePath = path.join(stagingDirectory, "overture-extraction.duckdb");
  logger(`Starting authorized Overture ${preflight.release_id} U.S. place extraction from ${preflight.asset_count} immutable assets.`);
  const instance = await DuckDBInstance.create(databasePath, { threads: "4", enable_external_access: "true" });
  const connection = await instance.connect();
  const interrupt = () => connection.interrupt();
  signal?.addEventListener?.("abort", interrupt, { once: true });
  try {
    await connection.run(query);
  } finally {
    signal?.removeEventListener?.("abort", interrupt);
    connection.closeSync();
    await Promise.allSettled([rm(databasePath, { force: true }), rm(`${databasePath}.wal`, { force: true })]);
  }
  signal?.throwIfAborted?.();
  const sourceDigest = await hashFile(sourcePath);
  const recordCount = await countGzipRecords(sourcePath, signal);
  const finalPreflight = await preflightOverturePlaces({ requestedRelease: preflight.release_id, fetchImpl, signal, sleep, now });
  if (finalPreflight.stac_fingerprint !== preflight.stac_fingerprint) throw new Error("Overture release metadata changed during extraction; the staged source was not promoted.");
  const metadata = {
    schema_version: OVERTURE_US_PLACE_SCHEMA_VERSION,
    artifact_type: "overture-us-place-selected-source-jsonl-gzip",
    overture_release_id: preflight.release_id,
    overture_release_datetime: preflight.assets[0]?.datetime ?? null,
    prepared_at: now().toISOString(),
    record_count: recordCount,
    bytes: sourceDigest.bytes,
    sha256: sourceDigest.sha256,
    stac_fingerprint: preflight.stac_fingerprint,
    query_contract_sha256: queryContractSha256,
    selected_fields: OVERTURE_SELECTED_FIELDS,
    country_filter: "at-least-one-reported-address-country-equals-US",
    operating_status_filter: "exclude-permanently_closed",
    geometry_policy: "geometry-and-bbox-excluded-after-deriving-address-associated-latitude-longitude",
    preflight,
  };
  await writeFile(path.join(stagingDirectory, "source-metadata.json"), json(metadata));
  const releaseDirectory = path.join(outputRoot, `${preflight.release_id}-${sourceDigest.sha256.slice(0, 16)}`);
  await mkdir(outputRoot, { recursive: true });
  try {
    await stat(releaseDirectory);
    throw new Error(`Prepared Overture source ${path.basename(releaseDirectory)} already exists.`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await renameWithRetry(stagingDirectory, releaseDirectory);
  logger(`Prepared ${recordCount.toLocaleString()} U.S. Overture place records without retaining global assets.`);
  return { releaseDirectory, sourcePath: path.join(releaseDirectory, "selected-us-places.jsonl.gz"), metadataPath: path.join(releaseDirectory, "source-metadata.json"), metadata };
}

async function loadZbpBaseline(pointerPath) {
  const pointer = JSON.parse(await readFile(pointerPath, "utf8"));
  const base = path.dirname(pointerPath);
  const manifestPath = path.resolve(base, pointer.manifest ?? "");
  assertContained(base, manifestPath, "Census ZBP manifest");
  const manifestBuffer = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBuffer.toString("utf8"));
  if (manifest.dataset_id !== "census-zbp-baseline" || manifest.complete_national_release !== true) throw new Error("A complete Census ZBP baseline release is required.");
  const artifact = manifest.artifacts?.find((candidate) => candidate.path === "derived/zip-coverage.jsonl");
  if (!artifact) throw new Error("Census ZBP baseline has no ZIP coverage artifact.");
  const filename = path.resolve(path.dirname(manifestPath), artifact.path);
  assertContained(path.dirname(manifestPath), filename, "Census ZBP coverage artifact");
  const buffer = await readFile(filename);
  if (buffer.length !== artifact.bytes || sha256(buffer) !== artifact.sha256) throw new Error("Census ZBP coverage checksum failed.");
  const rows = buffer.toString("utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
  return { rows, byZip: new Map(rows.map((row) => [row.zip_code, row])), manifest, manifestSha256: sha256(manifestBuffer) };
}

function buildZipCoverage(baselineRows, countsByZip, context) {
  const baselineByZip = new Map(baselineRows.map((row) => [row.zip_code, row]));
  const zipCodes = [...new Set([...baselineByZip.keys(), ...countsByZip.keys()])].sort(compareText);
  return zipCodes.map((zipCode) => {
    const baseline = baselineByZip.get(zipCode);
    const count = countsByZip.get(zipCode) ?? 0;
    return {
      schema_version: OVERTURE_US_PLACE_SCHEMA_VERSION,
      zip_code: zipCode,
      overture_places_snapshot: {
        status: count ? "source-reported-address-place-evidence" : "no-source-reported-address-place-in-current-snapshot",
        place_count: count,
        source_release_id: context.sourceReleaseId,
        overture_release_id: context.overtureReleaseId,
        semantics: "place-count-not-complete-business-count-and-not-proof-of-current-operation",
      },
      current_usps_validity: baseline?.current_usps_validity ?? { status: "unverified", reason: "ZIP appears in Overture but is outside the current ZBP/ZCTA union." },
      postal_label: baseline?.postal_label ?? null,
      geography: baseline?.geography ?? { status: "no-2020-zcta-polygon", geo_id: null, geoid: null, geometry_file: null },
      employer_baseline: baseline?.employer_baseline ?? null,
      baseline_coverage_status: baseline?.coverage_status ?? "outside-zbp-zcta-union",
    };
  });
}

async function copyPreparedSource(sourceFile, sourceMetadataFile, stagingDirectory) {
  const metadata = JSON.parse(await readFile(sourceMetadataFile, "utf8"));
  if (metadata.artifact_type !== "overture-us-place-selected-source-jsonl-gzip" || !RELEASE_ID.test(metadata.overture_release_id ?? "") || metadata.selected_fields?.join("\n") !== OVERTURE_SELECTED_FIELDS.join("\n")) {
    throw new Error("Prepared Overture source metadata identity or selected fields drifted.");
  }
  const sourceDigest = await hashFile(sourceFile);
  if (sourceDigest.bytes !== metadata.bytes || sourceDigest.sha256 !== metadata.sha256) throw new Error("Prepared Overture source checksum failed.");
  const destination = path.join(stagingDirectory, "source", "selected-records.jsonl.gz");
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp-${randomUUID()}`;
  await copyFile(sourceFile, temporary);
  await renameWithRetry(temporary, destination);
  return {
    metadata,
    artifact: { path: "source/selected-records.jsonl.gz", ...sourceDigest, record_count: metadata.record_count, artifact_type: "overture-us-place-selected-source-jsonl-gzip", export_policy: "internal" },
  };
}

async function writeFixtureSource(sourceRecords, sourceMetadata, stagingDirectory) {
  if (!Array.isArray(sourceRecords) || !sourceMetadata) throw new Error("Fixture source records and metadata are required together.");
  const writer = await openGzipWriter(stagingDirectory, "source/selected-records.jsonl.gz");
  try {
    for (const record of sourceRecords) await writeGzipRecord(writer, assertExactSelectedRecord(record));
  } catch (error) {
    await abortGzipWriters([writer]);
    throw error;
  }
  const artifact = await closeGzipWriter(writer, "overture-us-place-selected-source-jsonl-gzip", { export_policy: "internal" });
  const metadata = {
    schema_version: OVERTURE_US_PLACE_SCHEMA_VERSION,
    artifact_type: "overture-us-place-selected-source-jsonl-gzip",
    overture_release_id: sourceMetadata.overture_release_id,
    overture_release_datetime: sourceMetadata.overture_release_datetime,
    prepared_at: sourceMetadata.prepared_at,
    record_count: sourceRecords.length,
    bytes: artifact.bytes,
    sha256: artifact.sha256,
    stac_fingerprint: sourceMetadata.stac_fingerprint,
    query_contract_sha256: sourceMetadata.query_contract_sha256,
    selected_fields: OVERTURE_SELECTED_FIELDS,
    country_filter: "fixture-equivalent-US-address-filter",
    operating_status_filter: "fixture-equivalent-exclude-permanently-closed",
    geometry_policy: "geometry-and-bbox-excluded-after-deriving-address-associated-latitude-longitude",
    preflight: sourceMetadata.preflight ?? null,
  };
  return { metadata, artifact };
}

export async function buildOvertureUsPlaces({
  outputRoot, zbpPointer, sourceFile = null, sourceMetadataFile = null, sourceRecords = null, sourceMetadata = null,
  minimumPlaces = 1_000_000, maximumQuarantineRatio = 0.02, signal, logger = console.log, now = () => new Date(),
} = {}) {
  if (!outputRoot || !zbpPointer) throw new Error("outputRoot and zbpPointer are required.");
  if (!Number.isInteger(minimumPlaces) || minimumPlaces < 1) throw new Error("minimumPlaces must be a positive integer.");
  if (!Number.isFinite(maximumQuarantineRatio) || maximumQuarantineRatio < 0 || maximumQuarantineRatio > 1) throw new Error("maximumQuarantineRatio must be from 0 through 1.");
  if (Boolean(sourceFile) !== Boolean(sourceMetadataFile)) throw new Error("sourceFile and sourceMetadataFile are required together.");
  if (sourceFile && sourceRecords) throw new Error("Choose a prepared source file or fixture records, not both.");
  signal?.throwIfAborted?.();
  const retrievedAt = now().toISOString();
  const runId = randomUUID();
  const stagingDirectory = path.join(outputRoot, ".staging", runId);
  await mkdir(stagingDirectory, { recursive: true });
  const baseline = await loadZbpBaseline(zbpPointer);
  const input = sourceFile
    ? await copyPreparedSource(sourceFile, sourceMetadataFile, stagingDirectory)
    : await writeFixtureSource(sourceRecords, sourceMetadata, stagingDirectory);
  if (!RELEASE_ID.test(input.metadata.overture_release_id ?? "") || input.metadata.record_count !== input.artifact.record_count) throw new Error("Overture prepared source metadata failed release or count validation.");
  if (input.artifact.record_count < minimumPlaces) throw new Error(`Overture selected source count ${input.artifact.record_count} is below the minimum ${minimumPlaces}.`);
  const sourceReleaseId = `overture-places-${input.metadata.overture_release_id}-${input.artifact.sha256.slice(0, 16)}`;
  const releaseId = `overture-us-places-${releaseTimestamp(retrievedAt)}-${runId.slice(0, 8)}`;
  const context = {
    runId, retrievedAt, sourceReleaseId, overtureReleaseId: input.metadata.overture_release_id,
    releaseObservedAt: input.metadata.overture_release_datetime ?? input.metadata.prepared_at, baselineByZip: baseline.byZip,
  };
  const normalizedWriters = new Map();
  for (const prefix of "0123456789abcdef") normalizedWriters.set(prefix, await openGzipWriter(stagingDirectory, `normalized/places/prefix=${prefix}.jsonl.gz`));
  const quarantineWriter = await openGzipWriter(stagingDirectory, "quality/quarantine.jsonl.gz");
  const ids = new Set();
  const zipCounts = new Map();
  const categoryCounts = new Map();
  const scopeCounts = new Map();
  const statusCounts = new Map();
  const providerCounts = new Map();
  const quarantineReasons = new Map();
  let normalizedCount = 0;
  let validZipCount = 0;
  let zip4Count = 0;
  try {
    for await (const source of gzipRecords(path.join(stagingDirectory, input.artifact.path))) {
      signal?.throwIfAborted?.();
      assertExactSelectedRecord(source);
      const id = textValue(source.id)?.toLowerCase() ?? "<blank>";
      if (ids.has(id)) throw new Error(`Duplicate Overture GERS ID ${id}.`);
      ids.add(id);
      try {
        const normalized = normalizeOvertureUsPlace(source, context);
        await writeGzipRecord(normalizedWriters.get(sha256(id)[0]), normalized);
        normalizedCount += 1;
        increment(categoryCounts, normalized.classification.top_level_category);
        increment(scopeCounts, normalized.classification.place_scope);
        increment(statusCounts, normalized.source_status.status_class);
        for (const sourceRecord of normalized.source_records) increment(providerCounts, sourceRecord.dataset);
        if (normalized.reported_address.zip_code) {
          validZipCount += 1;
          increment(zipCounts, normalized.reported_address.zip_code);
        }
        if (normalized.reported_address.zip4) zip4Count += 1;
      } catch (error) {
        if (!QUARANTINE_REASONS.has(error.message)) throw error;
        increment(quarantineReasons, error.message);
        await writeGzipRecord(quarantineWriter, { schema_version: OVERTURE_US_PLACE_SCHEMA_VERSION, source_record_id: id, reason: error.message, source_release_id: sourceReleaseId, export_policy: "internal" });
      }
    }
  } catch (error) {
    await abortGzipWriters([...normalizedWriters.values(), quarantineWriter]);
    throw error;
  }
  const quarantineRatio = input.artifact.record_count ? quarantineWriter.records / input.artifact.record_count : 0;
  if (quarantineRatio > maximumQuarantineRatio || normalizedCount < minimumPlaces - Math.floor(input.artifact.record_count * maximumQuarantineRatio)) {
    await abortGzipWriters([...normalizedWriters.values(), quarantineWriter]);
    throw new Error(`Overture quality gate failed: normalized ${normalizedCount}, quarantined ${quarantineWriter.records}, ratio ${quarantineRatio}.`);
  }
  const normalizedArtifacts = [];
  for (const writer of normalizedWriters.values()) normalizedArtifacts.push(await closeGzipWriter(writer, "normalized-overture-us-place-jsonl-gzip", { export_policy: "local-review-only" }));
  const quarantineArtifact = await closeGzipWriter(quarantineWriter, "overture-us-place-quarantine-jsonl-gzip", { export_policy: "internal" });
  const zipRows = buildZipCoverage(baseline.rows, zipCounts, context);
  const zipArtifact = await writeArtifact(stagingDirectory, "derived/zip-coverage.jsonl", jsonLines(zipRows), {
    record_count: zipRows.length, artifact_type: "overture-us-place-zip-coverage-jsonl", distribution_policy: "public-aggregate-with-overture-attribution-and-source-license-limitations",
  });
  const summary = {
    dataset_id: "overture-us-places", source_release_id: sourceReleaseId, overture_release_id: input.metadata.overture_release_id, retrieved_at: retrievedAt,
    selected_us_place_records: input.artifact.record_count, normalized_places: normalizedCount, quarantined_records: quarantineArtifact.record_count,
    quarantine_ratio: quarantineRatio, quarantine_reasons: sortedCounts(quarantineReasons), records_with_valid_zip5: validZipCount,
    records_with_separate_zip4: zip4Count, source_reported_zip_codes: zipCounts.size, top_level_category_counts: sortedCounts(categoryCounts),
    place_scope_counts: sortedCounts(scopeCounts), source_status_counts: sortedCounts(statusCounts), contributing_source_record_counts: sortedCounts(providerCounts),
    stored_spatial_fields: ["latitude", "longitude"], excluded_spatial_fields: ["geometry", "bbox"], complete_all_us_businesses: false,
  };
  const summaryArtifact = await writeArtifact(stagingDirectory, "quality/source-summary.json", json(summary), { artifact_type: "overture-us-place-source-summary" });
  const metadataArtifact = await writeArtifact(stagingDirectory, "source/source-metadata.json", json(input.metadata), { artifact_type: "overture-stac-preflight", export_policy: "internal" });
  const noticeArtifact = await writeArtifact(stagingDirectory, "legal/NOTICE.txt", OVERTURE_PLACES_NOTICE, { artifact_type: "overture-place-attribution-notice", distribution_policy: "redistribute-with-derived-artifacts" });
  const artifacts = [input.artifact, metadataArtifact, noticeArtifact, ...normalizedArtifacts, quarantineArtifact, zipArtifact, summaryArtifact];
  const manifest = {
    schema_version: OVERTURE_US_PLACE_SCHEMA_VERSION,
    dataset_id: "overture-us-places",
    connector: { id: "overture-us-places", version: "1.0.0" },
    release_id: releaseId,
    source_release_id: sourceReleaseId,
    status: "complete",
    complete_selected_us_place_snapshot: true,
    created_at: retrievedAt,
    source: {
      publisher: "Overture Maps Foundation", theme: "places", type: "place", overture_release_id: input.metadata.overture_release_id,
      stac_url: OVERTURE_STAC_URL, guide_url: OVERTURE_PLACES_GUIDE_URL, schema_url: OVERTURE_PLACE_SCHEMA_URL,
      attribution_url: OVERTURE_ATTRIBUTION_URL, stac_fingerprint: input.metadata.stac_fingerprint,
      license_classes: ["CDLA-Permissive-2.0", "Apache-2.0", "CC0-1.0"],
    },
    coverage: {
      selected_us_place_records: input.artifact.record_count, normalized_places: normalizedCount, quarantined_records: quarantineArtifact.record_count,
      quarantine_ratio: quarantineRatio, records_with_valid_zip5: validZipCount, records_with_separate_zip4: zip4Count,
      source_reported_zip_codes: zipCounts.size, zip_union_records: zipRows.length, physical_site_candidates: normalizedCount,
      establishment_candidates: normalizedCount, complete_all_us_businesses: false,
    },
    dependencies: [
      { dataset_id: baseline.manifest.dataset_id, release_id: baseline.manifest.release_id, manifest_sha256: baseline.manifestSha256 },
      ...(baseline.manifest.geography_dependency ? [baseline.manifest.geography_dependency] : []),
    ],
    policy: {
      policy_id: "overture-us-places", record_level_distribution: "local-review-only",
      aggregate_distribution: "public-with-overture-attribution-source-license-and-semantic-limitations",
      spatial_boundary: "business-place-records-store-address-associated-latitude-and-longitude-only; polygons-remain-in-US-state-county-ZIP-governed-geography-layers",
    },
    limitations: [
      "Overture Places is not a complete census of U.S. businesses and also contains institutional, public, cultural, recreational, and geographic places.",
      "A place classified as a business-or-institution candidate is not asserted to be a legal or commercial business entity.",
      "Source operating status is preserved but never treated as independent proof of current operation, legal status, solvency, public access, or current hours.",
      "Overture confidence is relative existence evidence, not a calibrated probability or completeness score.",
      "Only source-reported U.S. addresses are selected; a coordinate-only point without a U.S. address is outside this connector version.",
      "Business/place records retain only address-associated latitude and longitude; geometry and bbox fields are excluded.",
      "ZIP5 and ZIP+4 are stored in separate fields and are not joined in the normalized dataset.",
      "No ownership, parent company, network affiliation, or cross-source identity relationship is inferred.",
    ],
    artifacts,
  };
  await writeFile(path.join(stagingDirectory, "manifest.json"), json(manifest));
  await verifyOvertureUsPlaces(path.join(stagingDirectory, "manifest.json"));
  logger(`Verified ${normalizedCount.toLocaleString()} normalized Overture U.S. place candidates.`);
  return publishOvertureUsPlacesStaging({ outputRoot, stagingRunId: runId, expectedReleaseId: releaseId });
}

export async function publishOvertureUsPlacesStaging({ outputRoot, stagingRunId, expectedReleaseId = null } = {}) {
  if (!outputRoot || !stagingRunId) throw new Error("outputRoot and stagingRunId are required.");
  const stagingDirectory = path.join(outputRoot, ".staging", stagingRunId);
  const manifestPath = path.join(stagingDirectory, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (expectedReleaseId && manifest.release_id !== expectedReleaseId) throw new Error("Overture staging release ID mismatch.");
  await verifyOvertureUsPlaces(manifestPath);
  const releasesDirectory = path.join(outputRoot, "releases");
  const releaseDirectory = path.join(releasesDirectory, manifest.release_id);
  await mkdir(releasesDirectory, { recursive: true });
  try {
    await stat(releaseDirectory);
    throw new Error(`Overture release ${manifest.release_id} already exists.`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await renameWithRetry(stagingDirectory, releaseDirectory);
  const pointerPath = path.join(outputRoot, "current.json");
  const pointer = { dataset_id: manifest.dataset_id, release_id: manifest.release_id, source_release_id: manifest.source_release_id, manifest: `releases/${manifest.release_id}/manifest.json`, updated_at: manifest.created_at };
  await mkdir(outputRoot, { recursive: true });
  const temporaryPointer = `${pointerPath}.tmp-${randomUUID()}`;
  await writeFile(temporaryPointer, json(pointer));
  await renameWithRetry(temporaryPointer, pointerPath);
  return { manifest, releaseDirectory, pointerPath };
}

function containsForbiddenRecordField(record) {
  const serialized = JSON.stringify(record).toLowerCase();
  return [...FORBIDDEN_RECORD_KEYS].some((field) => serialized.includes(`\"${field}\"`));
}

export async function verifyOvertureUsPlaces(manifestPath) {
  const absoluteManifestPath = path.resolve(manifestPath);
  const releaseDirectory = path.dirname(absoluteManifestPath);
  const manifest = JSON.parse(await readFile(absoluteManifestPath, "utf8"));
  const failures = [];
  if (manifest.dataset_id !== "overture-us-places" || manifest.schema_version !== OVERTURE_US_PLACE_SCHEMA_VERSION || manifest.status !== "complete" || manifest.complete_selected_us_place_snapshot !== true) failures.push({ path: "manifest.json", reason: "invalid dataset identity, schema, status, or snapshot declaration" });
  if (manifest.connector?.id !== "overture-us-places" || !RELEASE_ID.test(manifest.source?.overture_release_id ?? "") || manifest.coverage?.complete_all_us_businesses !== false) failures.push({ path: "manifest.json", reason: "connector identity, source release, or completeness declaration failed" });
  if (manifest.policy?.record_level_distribution !== "local-review-only" || !manifest.policy?.spatial_boundary?.includes("latitude-and-longitude-only")) failures.push({ path: "manifest.json", reason: "record policy or spatial boundary was overstated" });
  const artifacts = manifest.artifacts ?? [];
  const noticeArtifact = artifacts.find((artifact) => artifact.artifact_type === "overture-place-attribution-notice");
  if (!noticeArtifact || noticeArtifact.distribution_policy !== "redistribute-with-derived-artifacts") failures.push({ path: "legal/NOTICE.txt", reason: "missing Overture/Foursquare attribution notice" });
  for (const artifact of artifacts) {
    try {
      const filename = path.resolve(releaseDirectory, artifact.path);
      assertContained(releaseDirectory, filename, `Artifact ${artifact.path}`);
      const digest = await hashFile(filename);
      if (digest.bytes !== artifact.bytes || digest.sha256 !== artifact.sha256) throw new Error("checksum or byte count mismatch");
    } catch (error) {
      failures.push({ path: artifact.path, reason: error.message });
    }
  }
  const sourceArtifact = artifacts.find((artifact) => artifact.artifact_type === "overture-us-place-selected-source-jsonl-gzip");
  let sourceCount = 0;
  try {
    if (!sourceArtifact || sourceArtifact.export_policy !== "internal") throw new Error("missing or misclassified selected source artifact");
    for await (const record of gzipRecords(path.join(releaseDirectory, sourceArtifact.path))) {
      sourceCount += 1;
      assertExactSelectedRecord(record);
    }
    if (sourceCount !== sourceArtifact.record_count || sourceCount !== manifest.coverage.selected_us_place_records) throw new Error("selected source count mismatch");
  } catch (error) {
    failures.push({ path: sourceArtifact?.path ?? "source/selected-records.jsonl.gz", reason: error.message });
  }
  const normalizedArtifacts = artifacts.filter((artifact) => artifact.artifact_type === "normalized-overture-us-place-jsonl-gzip");
  const normalizedIds = new Set();
  const zipCounts = new Map();
  let normalizedCount = 0;
  let zip4Count = 0;
  for (const artifact of normalizedArtifacts) {
    try {
      if (artifact.export_policy !== "local-review-only") throw new Error("normalized artifact lost local-review-only policy");
      let artifactCount = 0;
      for await (const record of gzipRecords(path.join(releaseDirectory, artifact.path))) {
        artifactCount += 1;
        normalizedCount += 1;
        if (normalizedIds.has(record.normalized_record_id)) throw new Error(`duplicate normalized record ${record.normalized_record_id}`);
        normalizedIds.add(record.normalized_record_id);
        if (!/^overture-us-place:[0-9a-f-]{36}$/.test(record.normalized_record_id ?? "") || record.export_policy !== "local-review-only") throw new Error("invalid normalized identity or export policy");
        if (!Number.isFinite(record.geocode?.latitude) || !Number.isFinite(record.geocode?.longitude) || record.geocode?.source !== "overture-place-point") throw new Error("invalid normalized geocode");
        if (containsForbiddenRecordField(record) || record.privacy?.geometry_excluded !== true || record.privacy?.bbox_excluded !== true) throw new Error("forbidden geometry or contact field leaked");
        if (record.reported_address?.country !== "US" || (record.reported_address?.zip_code && !/^\d{5}$/.test(record.reported_address.zip_code)) || (record.reported_address?.zip4 && !/^\d{4}$/.test(record.reported_address.zip4))) throw new Error("invalid normalized postal fields");
        if (record.reported_address?.zip_code) increment(zipCounts, record.reported_address.zip_code);
        if (record.reported_address?.zip4) zip4Count += 1;
        if (record.source_status?.active_business_status_inferred !== false || record.classification?.commercial_business_asserted !== false) throw new Error("source status or commercial semantics were overstated");
        if (record.provenance?.policy_id !== "overture-us-places" || record.provenance?.source_release_id !== manifest.source_release_id) throw new Error("invalid provenance");
      }
      if (artifactCount !== artifact.record_count) throw new Error("normalized artifact record count mismatch");
    } catch (error) {
      failures.push({ path: artifact.path, reason: error.message });
    }
  }
  const quarantineArtifact = artifacts.find((artifact) => artifact.artifact_type === "overture-us-place-quarantine-jsonl-gzip");
  let quarantineCount = 0;
  try {
    if (!quarantineArtifact || quarantineArtifact.export_policy !== "internal") throw new Error("missing or misclassified quarantine artifact");
    for await (const record of gzipRecords(path.join(releaseDirectory, quarantineArtifact.path))) {
      quarantineCount += 1;
      if (!QUARANTINE_REASONS.has(record.reason) || record.export_policy !== "internal") throw new Error("invalid quarantine record");
    }
    if (quarantineCount !== quarantineArtifact.record_count || quarantineCount !== manifest.coverage.quarantined_records) throw new Error("quarantine count mismatch");
  } catch (error) {
    failures.push({ path: quarantineArtifact?.path ?? "quality/quarantine.jsonl.gz", reason: error.message });
  }
  if (sourceCount !== normalizedCount + quarantineCount || normalizedCount !== manifest.coverage?.normalized_places || zip4Count !== manifest.coverage?.records_with_separate_zip4) failures.push({ path: "manifest.json", reason: "selected, normalized, quarantine, or ZIP+4 counts do not reconcile" });
  const zipArtifact = artifacts.find((artifact) => artifact.artifact_type === "overture-us-place-zip-coverage-jsonl");
  try {
    if (!zipArtifact || !zipArtifact.distribution_policy?.startsWith("public-aggregate")) throw new Error("missing or misclassified ZIP coverage artifact");
    const rows = (await readFile(path.join(releaseDirectory, zipArtifact.path), "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse);
    if (rows.length !== zipArtifact.record_count || rows.length !== manifest.coverage.zip_union_records || new Set(rows.map((row) => row.zip_code)).size !== rows.length) throw new Error("ZIP row count or uniqueness mismatch");
    const contributionCount = rows.reduce((sum, row) => sum + (row.overture_places_snapshot?.place_count ?? 0), 0);
    if (contributionCount !== manifest.coverage.records_with_valid_zip5) throw new Error("ZIP contribution counts do not reconcile");
    for (const [zipCode, count] of zipCounts) if (rows.find((row) => row.zip_code === zipCode)?.overture_places_snapshot?.place_count !== count) throw new Error(`ZIP ${zipCode} contribution mismatch`);
  } catch (error) {
    failures.push({ path: zipArtifact?.path ?? "derived/zip-coverage.jsonl", reason: error.message });
  }
  if (failures.length) {
    const error = new Error(`Overture U.S. places verification failed for ${failures.length} check(s).`);
    error.failures = failures;
    throw error;
  }
  return { dataset_id: manifest.dataset_id, release_id: manifest.release_id, source_release_id: manifest.source_release_id, artifact_count: artifacts.length, coverage: manifest.coverage };
}
