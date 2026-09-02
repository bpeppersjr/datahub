import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { finished } from "node:stream/promises";
import { createInterface } from "node:readline";
import { createGunzip, createGzip } from "node:zlib";
import { assertNormalizedUsPostalFieldsDeep } from "./normalized-us-postal-code.mjs";

export const SNAP_SCHEMA_VERSION = "1.0.0";
export const SNAP_ITEM_ID = "8b260f9a10b0459aa441ad8588c2251c";
export const SNAP_ITEM_URL = `https://www.arcgis.com/sharing/rest/content/items/${SNAP_ITEM_ID}`;
export const SNAP_LAYER_URL = "https://services1.arcgis.com/RLQu0rK7h4kbsBq5/arcgis/rest/services/snap_retailer_location_data/FeatureServer/0";

const ALLOWED_URLS = [
  { host: "www.arcgis.com", pathPrefix: `/sharing/rest/content/items/${SNAP_ITEM_ID}` },
  { host: "services1.arcgis.com", pathPrefix: "/RLQu0rK7h4kbsBq5/arcgis/rest/services/snap_retailer_location_data/FeatureServer/0" },
];

function assertAllowedUrl(value) {
  const url = new URL(value);
  const allowed = ALLOWED_URLS.some(({ host, pathPrefix }) => url.protocol === "https:" && url.hostname === host && url.pathname.startsWith(pathPrefix));
  if (!allowed) throw new Error(`Disallowed USDA SNAP source URL ${url.origin}${url.pathname}.`);
  return url;
}

function textOrNull(value) {
  const result = value === null || value === undefined ? "" : String(value).trim();
  return result || null;
}

function zip5(value) {
  const result = String(value ?? "").trim().padStart(5, "0");
  if (!/^\d{5}$/.test(result)) throw new Error("missing-or-invalid-zip");
  return result;
}

function zip4(value) {
  const cleaned = String(value ?? "").trim();
  if (!cleaned) return null;
  const result = cleaned.padStart(4, "0");
  return /^\d{4}$/.test(result) ? result : null;
}

function coordinate(value, minimum, maximum, reason) {
  const result = Number(value);
  if (!Number.isFinite(result) || result < minimum || result > maximum) throw new Error(reason);
  return result;
}

export function normalizeSnapFeature(feature, context) {
  const source = feature?.attributes ?? {};
  const recordId = Number(source.Record_ID);
  if (!Number.isInteger(recordId) || recordId <= 0) throw new Error("missing-or-invalid-record-id");
  const name = textOrNull(source.Store_Name);
  if (!name) throw new Error("missing-store-name");
  const postalCode = zip5(source.Zip_Code);
  const state = textOrNull(source.State);
  if (!state || !/^[A-Z]{2}$/.test(state)) throw new Error("missing-or-invalid-state");
  const latitude = coordinate(source.Latitude ?? feature.geometry?.y, -90, 90, "missing-or-invalid-latitude");
  const longitude = coordinate(source.Longitude ?? feature.geometry?.x, -180, 180, "missing-or-invalid-longitude");
  const plus4 = zip4(source.Zip4);
  const geography = context.zipCoverage?.geography ?? {
    status: "no-2020-zcta-polygon",
    geo_id: null,
    geoid: null,
    centroid: null,
    internal_point: null,
    bbox: null,
    geometry_file: null,
  };
  const sourceRecordId = String(recordId);
  const provenance = {
    source_id: "usda-snap-current-retailers",
    source_release_id: context.sourceReleaseId,
    source_record_id: sourceRecordId,
    ingest_run_id: context.runId,
    transformation_version: "usda-snap-retailers@1.0.1",
    policy_id: "usda-snap-retailers",
  };
  return {
    schema_version: SNAP_SCHEMA_VERSION,
    normalized_record_id: `usda-snap:${sourceRecordId}`,
    entity_candidates: {
      physical_site_id: `site:usda_snap_${sourceRecordId}`,
      establishment_id: `establishment:usda_snap_${sourceRecordId}`,
      identity_status: "provisional",
    },
    external_identifiers: [
      { type: "usda_snap_record_id", value: sourceRecordId, source_field: "Record_ID" },
    ],
    name: name,
    address: {
      street: textOrNull(source.Store_Street_Address),
      unit_or_additional: textOrNull(source.Additonal_Address),
      city: textOrNull(source.City),
      state,
      zip_code: postalCode,
      zip4: plus4,
      postal_code: postalCode,
      county_name: textOrNull(source.County),
    },
    location: {
      type: "Point",
      coordinates: [longitude, latitude],
      coordinate_reference_system: "EPSG:4326",
    },
    source_classification: {
      system: "USDA SNAP Store Type",
      value: textOrNull(source.Store_Type),
    },
    service_assertions: {
      snap_authorized: true,
      healthy_incentive_program: textOrNull(source.Incentive_Program),
      healthy_incentive_grantee: textOrNull(source.Grantee_Name),
    },
    operating_status: {
      value: "snap-authorized-as-of-source-update",
      scope: "SNAP program participation at this location; not a general operating-status guarantee",
      observed_at: context.sourceUpdatedAt,
    },
    geography: {
      zip_code: postalCode,
      zcta_match_status: geography.status,
      zcta_geo_id: geography.geo_id,
      zcta_geoid: geography.geoid,
      zcta_geometry_file: geography.geometry_file,
    },
    observed_at: context.retrievedAt,
    source_updated_at: context.sourceUpdatedAt,
    provenance,
    field_lineage: {
      name: "Store_Name",
      address_street: "Store_Street_Address",
      address_additional: "Additonal_Address",
      address_city: "City",
      address_state: "State",
      address_zip: "Zip_Code",
      address_zip4: "Zip4",
      address_county: "County",
      store_type: "Store_Type",
      latitude: "Latitude",
      longitude: "Longitude",
      incentive_program: "Incentive_Program",
      grantee_name: "Grantee_Name",
    },
  };
}

export function buildSnapZipCoverage(snapCountsByZip, baselineRecords, context) {
  const baselineByZip = new Map(baselineRecords.map((record) => [record.zip_code, record]));
  const zipCodes = [...new Set([...baselineByZip.keys(), ...snapCountsByZip.keys()])].sort();
  return zipCodes.map((zipCode) => {
    const baseline = baselineByZip.get(zipCode);
    const sourceCount = snapCountsByZip.get(zipCode) ?? 0;
    return {
      schema_version: SNAP_SCHEMA_VERSION,
      zip_code: zipCode,
      snap_retailer_snapshot: {
        status: sourceCount > 0 ? "published-current-authorized-retailers" : "no-retailer-in-source-snapshot",
        retailer_count: sourceCount,
        source_release_id: context.sourceReleaseId,
        source_updated_at: context.sourceUpdatedAt,
        ingest_run_id: context.runId,
      },
      current_usps_validity: baseline?.current_usps_validity ?? {
        status: "unverified",
        reason: "ZIP appeared in the SNAP snapshot but is outside the current ZBP/ZCTA union.",
      },
      geography: baseline?.geography ?? {
        status: "no-2020-zcta-polygon",
        geo_id: null,
        geoid: null,
        geometry_file: null,
      },
      employer_baseline: baseline?.employer_baseline ?? null,
      baseline_coverage_status: baseline?.coverage_status ?? "outside-zbp-zcta-union",
    };
  });
}

async function requestJson(urlValue, options, { fetchImpl, retries = 3 }) {
  const url = assertAllowedUrl(urlValue);
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        redirect: "error",
        signal: AbortSignal.timeout(120_000),
        ...options,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      const payload = await response.json();
      if (payload.error) throw new Error(payload.error.message ?? "ArcGIS query failed.");
      return payload;
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
      await new Promise((resolve) => setTimeout(resolve, 500 * (2 ** attempt)));
    }
  }
  throw lastError;
}

async function getMetadata(fetchImpl) {
  const [item, layer] = await Promise.all([
    requestJson(`${SNAP_ITEM_URL}?f=json`, {}, { fetchImpl }),
    requestJson(`${SNAP_LAYER_URL}?f=json`, {}, { fetchImpl }),
  ]);
  if (item.id !== SNAP_ITEM_ID || item.type !== "Feature Service" || item.access !== "public") {
    throw new Error("Unexpected USDA SNAP ArcGIS item metadata.");
  }
  if (item.url !== SNAP_LAYER_URL.replace(/\/0$/, "") || layer.name !== "snap_retailer_location_data") {
    throw new Error("USDA SNAP item no longer resolves to the approved feature layer.");
  }
  if (!String(layer.capabilities ?? "").split(",").includes("Query")) {
    throw new Error("USDA SNAP feature layer is not queryable.");
  }
  return { item, layer };
}

async function getCount(fetchImpl) {
  const body = new URLSearchParams({ where: "1=1", returnCountOnly: "true", f: "json" });
  const payload = await requestJson(`${SNAP_LAYER_URL}/query`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body,
  }, { fetchImpl });
  if (!Number.isInteger(payload.count)) throw new Error("USDA SNAP query returned no feature count.");
  return payload.count;
}

async function getPage(offset, count, pageSize, fetchImpl) {
  const requested = Math.min(pageSize, count - offset);
  const body = new URLSearchParams({
    where: "1=1",
    outFields: "*",
    returnGeometry: "true",
    outSR: "4326",
    resultOffset: String(offset),
    resultRecordCount: String(requested),
    orderByFields: "ObjectId",
    f: "json",
  });
  const payload = await requestJson(`${SNAP_LAYER_URL}/query`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body,
  }, { fetchImpl });
  const features = payload.features ?? [];
  if (features.length !== requested) {
    throw new Error(`USDA SNAP page at offset ${offset} returned ${features.length} of ${requested} expected records.`);
  }
  return { offset, features };
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
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

async function writeArtifact(directory, relativePath, content, metadata = {}) {
  const destination = path.join(directory, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
  const temporary = `${destination}.tmp-${randomUUID()}`;
  await writeFile(temporary, buffer);
  await rename(temporary, destination);
  return { path: relativePath.replaceAll("\\", "/"), bytes: buffer.length, sha256: sha256(buffer), ...metadata };
}

function json(value) {
  return `${JSON.stringify(value)}\n`;
}

function jsonLines(records) {
  return `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
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
    artifacts.push({
      path: writer.relativePath,
      ...(await hashFile(writer.destination)),
      record_count: writer.records,
      artifact_type: artifactType,
    });
  }
  return artifacts;
}

async function loadZbpBaseline(pointerPath) {
  const pointer = JSON.parse(await readFile(pointerPath, "utf8"));
  const manifestPath = path.resolve(path.dirname(pointerPath), pointer.manifest);
  const manifestBuffer = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBuffer.toString("utf8"));
  if (manifest.dataset_id !== "census-zbp-baseline" || !manifest.complete_national_release) {
    throw new Error("A complete census-zbp-baseline release is required.");
  }
  const artifact = manifest.artifacts.find((candidate) => candidate.path === "derived/zip-coverage.jsonl");
  if (!artifact) throw new Error("Census ZBP release has no ZIP coverage artifact.");
  const buffer = await readFile(path.join(path.dirname(manifestPath), artifact.path));
  if (buffer.length !== artifact.bytes || sha256(buffer) !== artifact.sha256) {
    throw new Error("Census ZBP ZIP coverage failed checksum verification.");
  }
  return {
    records: buffer.toString("utf8").trim().split("\n").map((line) => JSON.parse(line)),
    releaseId: manifest.release_id,
    manifestSha256: sha256(manifestBuffer),
    geographyDependency: manifest.geography_dependency,
  };
}

function sourceReleaseId(modifiedMilliseconds) {
  const instant = new Date(modifiedMilliseconds).toISOString().replaceAll(/[-:.]/g, "");
  return `usda-snap-${instant}`;
}

function releaseTimestamp(instant) {
  return instant.replaceAll(/[-:.]/g, "").replace("T", "-").replace("Z", "Z");
}

export async function buildUsdaSnapRetailers({
  outputRoot,
  zbpPointer,
  pageSize = 1_000,
  concurrency = 4,
  fetchImpl = globalThis.fetch,
  logger = console.log,
  now = () => new Date(),
} = {}) {
  if (!outputRoot) throw new Error("outputRoot is required.");
  if (!zbpPointer) throw new Error("zbpPointer is required.");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1_000) throw new Error("pageSize must be from 1 through 1000.");
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) throw new Error("concurrency must be from 1 through 8.");

  const retrievedAt = now().toISOString();
  const runId = randomUUID();
  const baseline = await loadZbpBaseline(zbpPointer);
  const baselineByZip = new Map(baseline.records.map((record) => [record.zip_code, record]));
  const metadata = await getMetadata(fetchImpl);
  const sourceUpdatedAt = new Date(metadata.layer.editingInfo?.dataLastEditDate ?? metadata.item.modified).toISOString();
  const approvedSourceReleaseId = sourceReleaseId(metadata.layer.editingInfo?.dataLastEditDate ?? metadata.item.modified);
  const expectedCount = await getCount(fetchImpl);
  if (expectedCount < 200_000) throw new Error(`USDA SNAP feature count ${expectedCount} is below the 200,000-record quality floor.`);

  const releaseId = `usda-snap-retailers-${releaseTimestamp(retrievedAt)}-${runId.slice(0, 8)}`;
  const stagingDirectory = path.join(outputRoot, ".staging", runId);
  await mkdir(stagingDirectory, { recursive: true });
  const sourceWriter = await openGzipWriter(stagingDirectory, "source/features.jsonl.gz");
  const quarantineWriter = await openGzipWriter(stagingDirectory, "quarantine/records.jsonl.gz");
  const partitionWriters = new Map();
  for (const prefix of "0123456789") {
    partitionWriters.set(prefix, await openGzipWriter(stagingDirectory, `derived/retailers/prefix=${prefix}.jsonl.gz`));
  }

  const recordIds = new Set();
  const objectIds = new Set();
  const snapCountsByZip = new Map();
  const stateCounts = new Map();
  const storeTypeCounts = new Map();
  let acquired = 0;
  let accepted = 0;
  let quarantined = 0;

  for (let batchStart = 0; batchStart < expectedCount; batchStart += pageSize * concurrency) {
    const offsets = [];
    for (let slot = 0; slot < concurrency; slot += 1) {
      const offset = batchStart + (slot * pageSize);
      if (offset < expectedCount) offsets.push(offset);
    }
    const pages = await Promise.all(offsets.map((offset) => getPage(offset, expectedCount, pageSize, fetchImpl)));
    pages.sort((a, b) => a.offset - b.offset);
    for (const page of pages) {
      for (const feature of page.features) {
        acquired += 1;
        await writeGzipRecord(sourceWriter, feature);
        const sourceObjectId = feature.attributes?.ObjectId;
        if (objectIds.has(sourceObjectId)) throw new Error(`Duplicate USDA SNAP ObjectId ${sourceObjectId}.`);
        objectIds.add(sourceObjectId);
        try {
          const numericRecordId = Number(feature.attributes?.Record_ID);
          const sourceRecordId = Number.isInteger(numericRecordId) && numericRecordId > 0 ? String(numericRecordId) : null;
          if (sourceRecordId && recordIds.has(sourceRecordId)) throw new Error("duplicate-record-id");
          if (sourceRecordId) recordIds.add(sourceRecordId);
          const sourceZip = zip5(feature.attributes?.Zip_Code);
          const normalized = normalizeSnapFeature(feature, {
            runId,
            retrievedAt,
            sourceUpdatedAt,
            sourceReleaseId: approvedSourceReleaseId,
            zipCoverage: baselineByZip.get(sourceZip),
          });
          assertNormalizedUsPostalFieldsDeep(normalized);
          await writeGzipRecord(partitionWriters.get(sourceZip[0]), normalized);
          snapCountsByZip.set(sourceZip, (snapCountsByZip.get(sourceZip) ?? 0) + 1);
          const state = normalized.address.state;
          stateCounts.set(state, (stateCounts.get(state) ?? 0) + 1);
          const storeType = normalized.source_classification.value ?? "Unclassified";
          storeTypeCounts.set(storeType, (storeTypeCounts.get(storeType) ?? 0) + 1);
          accepted += 1;
        } catch (error) {
          await writeGzipRecord(quarantineWriter, {
            source_object_id: sourceObjectId ?? null,
            source_record_id: feature.attributes?.Record_ID ?? null,
            reason: error.message,
            source_feature: feature,
          });
          quarantined += 1;
        }
      }
    }
    logger(`Acquired ${acquired.toLocaleString("en-US")}/${expectedCount.toLocaleString("en-US")} USDA SNAP retailers.`);
  }

  const afterMetadata = await getMetadata(fetchImpl);
  const afterEditDate = afterMetadata.layer.editingInfo?.dataLastEditDate ?? afterMetadata.item.modified;
  const beforeEditDate = metadata.layer.editingInfo?.dataLastEditDate ?? metadata.item.modified;
  if (afterEditDate !== beforeEditDate) {
    throw new Error("USDA SNAP source changed during acquisition; rerun to publish one coherent snapshot.");
  }
  if (acquired !== expectedCount || accepted + quarantined !== expectedCount) {
    throw new Error("USDA SNAP acquisition counts do not reconcile.");
  }
  if (quarantined / expectedCount > 0.01) {
    throw new Error(`USDA SNAP quarantine rate ${(quarantined / expectedCount * 100).toFixed(2)}% exceeds the 1% publication threshold.`);
  }

  const artifacts = [];
  artifacts.push(...await closeGzipWriters([sourceWriter], "source-feature-jsonl-gzip"));
  artifacts.push(...await closeGzipWriters([...partitionWriters.values()], "normalized-snap-retailer-jsonl-gzip"));
  artifacts.push(...await closeGzipWriters([quarantineWriter], "quarantine-jsonl-gzip"));
  artifacts.push(await writeArtifact(stagingDirectory, "source/item.json", json(metadata.item), { artifact_type: "source-metadata" }));
  artifacts.push(await writeArtifact(stagingDirectory, "source/layer.json", json(metadata.layer), { artifact_type: "source-metadata" }));

  const zipCoverage = buildSnapZipCoverage(snapCountsByZip, baseline.records, {
    runId,
    sourceReleaseId: approvedSourceReleaseId,
    sourceUpdatedAt,
  });
  artifacts.push(await writeArtifact(stagingDirectory, "derived/zip-coverage.jsonl", jsonLines(zipCoverage), {
    artifact_type: "snap-zip-coverage-jsonl",
    record_count: zipCoverage.length,
  }));
  const summary = {
    states: Object.fromEntries([...stateCounts].sort(([a], [b]) => a.localeCompare(b))),
    store_types: Object.fromEntries([...storeTypeCounts].sort(([a], [b]) => a.localeCompare(b))),
  };
  artifacts.push(await writeArtifact(stagingDirectory, "derived/source-summary.json", json(summary), {
    artifact_type: "source-summary",
  }));

  const manifest = {
    schema_version: SNAP_SCHEMA_VERSION,
    dataset_id: "usda-snap-retailers",
    connector: { id: "usda-snap-retailers", version: "1.0.1" },
    release_id: releaseId,
    run_id: runId,
    retrieved_at: retrievedAt,
    source_updated_at: sourceUpdatedAt,
    source_release_id: approvedSourceReleaseId,
    status: "published",
    complete_source_snapshot: true,
    coverage: {
      source_features: expectedCount,
      accepted_records: accepted,
      quarantined_records: quarantined,
      source_zip_codes: snapCountsByZip.size,
      zip_union_records: zipCoverage.length,
      states_and_territories: stateCounts.size,
      store_types: storeTypeCounts.size,
    },
    dependencies: [
      {
        dataset_id: "census-zbp-baseline",
        release_id: baseline.releaseId,
        manifest_sha256: baseline.manifestSha256,
      },
      baseline.geographyDependency,
    ],
    source: {
      source_id: "usda-snap-current-retailers",
      publisher: "U.S. Department of Agriculture Food and Nutrition Administration",
      arcgis_item_id: SNAP_ITEM_ID,
      item_url: SNAP_ITEM_URL,
      layer_url: SNAP_LAYER_URL,
      item_owner: metadata.item.owner,
      item_modified_at: new Date(metadata.item.modified).toISOString(),
      data_last_edited_at: sourceUpdatedAt,
      policy_profile: "config/source-policies/usda-snap-retailers.json",
    },
    limitations: [
      "The source asserts current SNAP authorization as of its update timestamp; it does not independently prove that a business is open at retrieval time.",
      "SNAP authorization is location- and owner-specific and must not be transferred to a different site or owner during entity resolution.",
      "The source covers SNAP-authorized retailers, not all grocery stores or all U.S. businesses.",
      "Store type is the USDA SNAP classification and is not a NAICS code.",
      "Source names do not by themselves establish brand, parent-company, or legal-organization identity.",
    ],
    artifacts: artifacts.sort((a, b) => a.path.localeCompare(b.path)),
  };
  await writeArtifact(stagingDirectory, "manifest.json", json(manifest));
  const releasesDirectory = path.join(outputRoot, "releases");
  const releaseDirectory = path.join(releasesDirectory, releaseId);
  await mkdir(releasesDirectory, { recursive: true });
  await rename(stagingDirectory, releaseDirectory);
  const pointer = {
    dataset_id: manifest.dataset_id,
    release_id: releaseId,
    manifest: `releases/${releaseId}/manifest.json`,
    updated_at: retrievedAt,
  };
  const pointerPath = path.join(outputRoot, "current.json");
  const temporaryPointer = `${pointerPath}.tmp-${runId}`;
  await writeFile(temporaryPointer, json(pointer), "utf8");
  await rename(temporaryPointer, pointerPath);
  if (!(await stat(releaseDirectory)).isDirectory()) throw new Error("Published USDA SNAP release is not a directory.");
  return { manifest, releaseDirectory, pointerPath };
}

export async function verifyUsdaSnapRelease(manifestPath) {
  const absoluteManifestPath = path.resolve(manifestPath);
  const releaseDirectory = path.dirname(absoluteManifestPath);
  const manifest = JSON.parse(await readFile(absoluteManifestPath, "utf8"));
  if (manifest.dataset_id !== "usda-snap-retailers") throw new Error("Unexpected USDA SNAP dataset manifest.");
  const failures = [];
  for (const artifact of manifest.artifacts ?? []) {
    const artifactPath = path.resolve(releaseDirectory, artifact.path);
    const relative = path.relative(releaseDirectory, artifactPath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      failures.push({ path: artifact.path, reason: "path escapes release directory" });
      continue;
    }
    try {
      const digest = await hashFile(artifactPath);
      if (digest.bytes !== artifact.bytes || digest.sha256 !== artifact.sha256) {
        failures.push({ path: artifact.path, reason: "size or SHA-256 mismatch" });
      }
    } catch (error) {
      failures.push({ path: artifact.path, reason: error.code === "ENOENT" ? "missing" : error.message });
    }
  }
  const sourceArtifact = manifest.artifacts?.find((artifact) => artifact.path === "source/features.jsonl.gz");
  const retailerArtifacts = manifest.artifacts?.filter((artifact) => artifact.artifact_type === "normalized-snap-retailer-jsonl-gzip") ?? [];
  const quarantineArtifact = manifest.artifacts?.find((artifact) => artifact.path === "quarantine/records.jsonl.gz");
  let sourceRecords = 0;
  let accepted = 0;
  let quarantined = 0;
  const normalizedIds = new Set();
  const countGzip = async (artifact, consumer = null) => {
    const reader = createInterface({
      input: createReadStream(path.join(releaseDirectory, artifact.path)).pipe(createGunzip()),
      crlfDelay: Infinity,
    });
    let count = 0;
    for await (const line of reader) {
      if (!line) continue;
      const record = JSON.parse(line);
      if (consumer) consumer(record);
      count += 1;
    }
    return count;
  };
  try {
    sourceRecords = await countGzip(sourceArtifact);
    if (sourceRecords !== sourceArtifact.record_count) failures.push({ path: sourceArtifact.path, reason: "actual source line count mismatch" });
  } catch (error) {
    failures.push({ path: sourceArtifact?.path ?? "source/features.jsonl.gz", reason: `gzip/JSON validation failed: ${error.message}` });
  }
  for (const artifact of retailerArtifacts) {
    try {
      const partition = artifact.path.match(/prefix=(\d)/)?.[1];
      const count = await countGzip(artifact, (record) => {
        if (record.address?.zip_code?.[0] !== partition) throw new Error(`record ${record.normalized_record_id} is in the wrong ZIP partition`);
        if (normalizedIds.has(record.normalized_record_id)) throw new Error(`duplicate ${record.normalized_record_id}`);
        normalizedIds.add(record.normalized_record_id);
        if (record.operating_status?.value !== "snap-authorized-as-of-source-update") throw new Error("invalid SNAP authorization status");
        if (!record.provenance?.source_record_id || !record.provenance?.ingest_run_id) throw new Error("missing provenance");
      });
      if (count !== artifact.record_count) failures.push({ path: artifact.path, reason: "actual normalized line count mismatch" });
      accepted += count;
    } catch (error) {
      failures.push({ path: artifact.path, reason: `gzip/JSON validation failed: ${error.message}` });
    }
  }
  try {
    quarantined = await countGzip(quarantineArtifact);
    if (quarantined !== quarantineArtifact.record_count) failures.push({ path: quarantineArtifact.path, reason: "actual quarantine line count mismatch" });
  } catch (error) {
    failures.push({ path: quarantineArtifact?.path ?? "quarantine/records.jsonl.gz", reason: `gzip/JSON validation failed: ${error.message}` });
  }
  if (retailerArtifacts.length !== 10) failures.push({ path: "derived/retailers", reason: `expected 10 partitions, found ${retailerArtifacts.length}` });
  if (sourceRecords !== manifest.coverage.source_features) failures.push({ path: "source/features.jsonl.gz", reason: "source count mismatch" });
  if (accepted !== manifest.coverage.accepted_records || quarantined !== manifest.coverage.quarantined_records) {
    failures.push({ path: "manifest.json", reason: "accepted/quarantine counts do not reconcile" });
  }
  if (accepted + quarantined !== manifest.coverage.source_features) failures.push({ path: "manifest.json", reason: "published counts do not equal source count" });
  const zipArtifact = manifest.artifacts?.find((artifact) => artifact.path === "derived/zip-coverage.jsonl");
  try {
    const zipRows = (await readFile(path.join(releaseDirectory, zipArtifact.path), "utf8")).trim().split("\n").map(JSON.parse);
    if (zipRows.length !== zipArtifact.record_count || zipRows.length !== manifest.coverage.zip_union_records) {
      failures.push({ path: zipArtifact.path, reason: "ZIP coverage count mismatch" });
    }
    if (new Set(zipRows.map((row) => row.zip_code)).size !== zipRows.length) failures.push({ path: zipArtifact.path, reason: "duplicate ZIP coverage row" });
    if (zipRows.some((row) => row.current_usps_validity?.status !== "unverified")) failures.push({ path: zipArtifact.path, reason: "unsupported USPS validity assertion" });
  } catch (error) {
    failures.push({ path: "derived/zip-coverage.jsonl", reason: `structural validation failed: ${error.message}` });
  }
  if (failures.length > 0) {
    const error = new Error(`USDA SNAP release verification failed for ${failures.length} check(s).`);
    error.failures = failures;
    throw error;
  }
  return {
    dataset_id: manifest.dataset_id,
    release_id: manifest.release_id,
    source_updated_at: manifest.source_updated_at,
    artifact_count: manifest.artifacts.length,
    coverage: manifest.coverage,
  };
}
