import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import area from "@turf/area";
import polygonClipping from "polygon-clipping";
import RBush from "rbush";
import { geometryBounds } from "./census-geography.mjs";

export const ZCTA_JURISDICTION_SCHEMA_VERSION = "1.0.0";
export const ZCTA_JURISDICTION_TRANSFORMATION_VERSION = "us-census-zcta-jurisdiction-crosswalk@1.0.0";
export const MATERIAL_INTERSECTION_MINIMUM_SHARE = 0.001;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function releaseTimestamp(instant) {
  return instant.replaceAll(/[-:.]/g, "").replace("T", "-").replace("Z", "Z");
}

function json(value) {
  return `${JSON.stringify(value)}\n`;
}

function jsonLines(records) {
  return records.length === 0 ? "" : `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
}

function rounded(value, decimalPlaces = 12) {
  return Number(value.toFixed(decimalPlaces));
}

async function renameWithRetry(sourcePath, destinationPath, attempts = 7) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await rename(sourcePath, destinationPath);
      return;
    } catch (error) {
      lastError = error;
      const retryable = ["EACCES", "EBUSY", "EPERM"].includes(error.code);
      if (!retryable || attempt === attempts - 1) break;
      await new Promise((resolve) => setTimeout(resolve, 50 * (2 ** attempt)));
    }
  }
  throw lastError;
}

async function writeArtifact(releaseDirectory, relativePath, value, metadata = {}) {
  const absolutePath = path.join(releaseDirectory, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8");
  const temporaryPath = `${absolutePath}.tmp-${randomUUID()}`;
  await writeFile(temporaryPath, buffer);
  await renameWithRetry(temporaryPath, absolutePath);
  return {
    path: relativePath.replaceAll("\\", "/"),
    bytes: buffer.byteLength,
    sha256: sha256(buffer),
    ...metadata,
  };
}

async function readJsonLines(filePath) {
  const content = await readFile(filePath, "utf8");
  return content
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function multiPolygonCoordinates(geometry) {
  if (geometry?.type === "Polygon") return [geometry.coordinates];
  if (geometry?.type === "MultiPolygon") return geometry.coordinates;
  throw new Error(`Expected Polygon or MultiPolygon, received ${geometry?.type ?? "no geometry"}.`);
}

function featureAreaM2(geometry) {
  return area({ type: "Feature", properties: {}, geometry });
}

function intersectionAreaM2(leftGeometry, rightGeometry) {
  const coordinates = polygonClipping.intersection(
    multiPolygonCoordinates(leftGeometry),
    multiPolygonCoordinates(rightGeometry),
  );
  if (coordinates.length === 0) return 0;
  return featureAreaM2({ type: "MultiPolygon", coordinates });
}

function featureGeoid(feature) {
  return String(feature?.properties?.GEOID ?? "");
}

function validateFeature(feature, type) {
  if (!featureGeoid(feature)) throw new Error(`${type} feature is missing GEOID.`);
  if (!feature?.geometry || !["Polygon", "MultiPolygon"].includes(feature.geometry.type)) {
    throw new Error(`${type} ${featureGeoid(feature)} is missing polygon geometry.`);
  }
}

async function resolveGeographyRelease(geographyPointerPath) {
  const absoluteInputPath = path.resolve(geographyPointerPath);
  const input = JSON.parse(await readFile(absoluteInputPath, "utf8"));
  const manifestPath = input.manifest
    ? path.resolve(path.dirname(absoluteInputPath), input.manifest)
    : absoluteInputPath;
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.dataset_id !== "us-census-geography") {
    throw new Error(`Expected us-census-geography input, received ${manifest.dataset_id ?? "missing dataset_id"}.`);
  }
  if (manifest.status !== "published") throw new Error("The geography input is not a published release.");
  return { manifest, manifestPath, releaseDirectory: path.dirname(manifestPath) };
}

async function readFeatureArtifact(releaseDirectory, artifact) {
  const artifactPath = path.resolve(releaseDirectory, artifact.path);
  const relative = path.relative(releaseDirectory, artifactPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Geography artifact escapes its release directory: ${artifact.path}`);
  }
  const collection = JSON.parse(await readFile(artifactPath, "utf8"));
  if (collection.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
    throw new Error(`Geography artifact ${artifact.path} is not a FeatureCollection.`);
  }
  return collection.features;
}

function artifactsFor(manifest, geographyType) {
  return (manifest.artifacts ?? [])
    .filter((artifact) => artifact.geography_type === geographyType && artifact.path.startsWith("source/"))
    .sort((left, right) => left.path.localeCompare(right.path));
}

function createCountyIndex(countyFeatures) {
  const index = new RBush();
  const records = countyFeatures.map((feature) => {
    validateFeature(feature, "county");
    const bbox = geometryBounds(feature.geometry);
    const geoid = featureGeoid(feature);
    return {
      minX: bbox[0],
      minY: bbox[1],
      maxX: bbox[2],
      maxY: bbox[3],
      geoid,
      stateFips: String(feature.properties?.STATE ?? geoid.slice(0, 2)),
      countyFips: String(feature.properties?.COUNTY ?? geoid.slice(2)),
      name: feature.properties?.NAME ?? feature.properties?.BASENAME ?? geoid,
      geometry: feature.geometry,
    };
  });
  index.load(records);
  return { index, records };
}

export function overlayZctaFeature(zctaFeature, countyIndex) {
  validateFeature(zctaFeature, "ZCTA");
  const zcta = String(zctaFeature.properties?.ZCTA5 ?? featureGeoid(zctaFeature)).padStart(5, "0");
  const bbox = geometryBounds(zctaFeature.geometry);
  const zctaPolygonAreaM2 = featureAreaM2(zctaFeature.geometry);
  if (!(zctaPolygonAreaM2 > 0)) throw new Error(`ZCTA ${zcta} has zero polygon area.`);
  const candidates = countyIndex.search({ minX: bbox[0], minY: bbox[1], maxX: bbox[2], maxY: bbox[3] });
  const intersections = [];
  for (const county of candidates) {
    const intersectionM2 = intersectionAreaM2(zctaFeature.geometry, county.geometry);
    if (!(intersectionM2 > 0.01)) continue;
    intersections.push({ county, intersectionM2 });
  }
  intersections.sort((left, right) => left.county.geoid.localeCompare(right.county.geoid));
  const totalIntersectionM2 = intersections.reduce((sum, item) => sum + item.intersectionM2, 0);
  const relationships = intersections.map(({ county, intersectionM2 }) => {
    const rawShare = intersectionM2 / zctaPolygonAreaM2;
    const publishedRawShare = rounded(rawShare);
    return {
      schema_version: ZCTA_JURISDICTION_SCHEMA_VERSION,
      relationship_id: `zcta-county-area:${zcta}:${county.geoid}`,
      relationship_type: "zcta_polygon_intersects_county_equivalent",
      zcta_geo_id: `zcta:${zcta}`,
      zcta,
      county_geo_id: `county:${county.geoid}`,
      county_geoid: county.geoid,
      county_name: county.name,
      state_geo_id: `state:${county.stateFips}`,
      state_fips: county.stateFips,
      county_fips: county.countyFips,
      intersection_area_m2: rounded(intersectionM2, 3),
      zcta_polygon_area_m2: rounded(zctaPolygonAreaM2, 3),
      raw_share_of_zcta_polygon_area: publishedRawShare,
      normalized_share_of_matched_zcta_area: rounded(intersectionM2 / totalIntersectionM2),
      material_intersection: publishedRawShare >= MATERIAL_INTERSECTION_MINIMUM_SHARE,
      material_intersection_minimum_share: MATERIAL_INTERSECTION_MINIMUM_SHARE,
      allocation_semantics: "polygon-area-only-not-business-location",
      transformation_version: ZCTA_JURISDICTION_TRANSFORMATION_VERSION,
    };
  });
  const states = new Set(intersections.map(({ county }) => county.stateFips));
  const materialRelationships = relationships.filter((relationship) => relationship.material_intersection);
  const materialStates = new Set(materialRelationships.map((relationship) => relationship.state_fips));
  const coverageRatio = totalIntersectionM2 / zctaPolygonAreaM2;
  const overlayStatus = intersections.length === 0
    ? "unmatched"
    : coverageRatio >= 0.995 && coverageRatio <= 1.005
      ? "complete-within-tolerance"
      : "partial-or-overlapping";
  const dominant = [...relationships].sort((left, right) => (
    right.normalized_share_of_matched_zcta_area - left.normalized_share_of_matched_zcta_area
      || left.county_geoid.localeCompare(right.county_geoid)
  ))[0] ?? null;
  return {
    relationships,
    summary: {
      schema_version: ZCTA_JURISDICTION_SCHEMA_VERSION,
      zcta_geo_id: `zcta:${zcta}`,
      zcta,
      zcta_polygon_area_m2: rounded(zctaPolygonAreaM2, 3),
      matched_intersection_area_m2: rounded(totalIntersectionM2, 3),
      raw_matched_area_ratio: rounded(coverageRatio),
      normalized_area_weight_sum: rounded(relationships.reduce(
        (sum, relationship) => sum + relationship.normalized_share_of_matched_zcta_area,
        0,
      )),
      county_equivalent_count: relationships.length,
      state_equivalent_count: states.size,
      material_county_equivalent_count: materialRelationships.length,
      material_state_equivalent_count: materialStates.size,
      has_multiple_county_topological_intersections: relationships.length > 1,
      has_multiple_state_topological_intersections: states.size > 1,
      crosses_county_boundary_materially: materialRelationships.length > 1,
      crosses_state_boundary_materially: materialStates.size > 1,
      dominant_county_geo_id: dominant?.county_geo_id ?? null,
      dominant_state_geo_id: dominant?.state_geo_id ?? null,
      overlay_status: overlayStatus,
      allocation_semantics: "polygon-area-only-not-business-location",
      transformation_version: ZCTA_JURISDICTION_TRANSFORMATION_VERSION,
    },
  };
}

function summarizeCounties(countyRecords, relationships) {
  const byCounty = Map.groupBy(relationships, (relationship) => relationship.county_geoid);
  return countyRecords
    .map((county) => {
      const rows = byCounty.get(county.geoid) ?? [];
      return {
        schema_version: ZCTA_JURISDICTION_SCHEMA_VERSION,
        county_geo_id: `county:${county.geoid}`,
        county_geoid: county.geoid,
        county_name: county.name,
        state_geo_id: `state:${county.stateFips}`,
        state_fips: county.stateFips,
        county_fips: county.countyFips,
        intersecting_zcta_count: rows.length,
        materially_intersecting_zcta_count: rows.filter((row) => row.material_intersection).length,
        intersected_zcta_area_m2: rounded(rows.reduce((sum, row) => sum + row.intersection_area_m2, 0), 3),
        allocation_semantics: "polygon-area-only-not-business-location",
      };
    })
    .sort((left, right) => left.county_geoid.localeCompare(right.county_geoid));
}

function summarizeStates(stateFeatures, countySummaries, relationships) {
  const countiesByState = Map.groupBy(countySummaries, (county) => county.state_fips);
  const relationshipsByState = Map.groupBy(relationships, (relationship) => relationship.state_fips);
  return stateFeatures
    .map((feature) => {
      validateFeature(feature, "state");
      const geoid = featureGeoid(feature);
      const countyRows = countiesByState.get(geoid) ?? [];
      const relationshipRows = relationshipsByState.get(geoid) ?? [];
      const materialRelationshipRows = relationshipRows.filter((relationship) => relationship.material_intersection);
      return {
        schema_version: ZCTA_JURISDICTION_SCHEMA_VERSION,
        state_geo_id: `state:${geoid}`,
        state_fips: geoid,
        state_name: feature.properties?.NAME ?? feature.properties?.BASENAME ?? geoid,
        postal_abbreviation: feature.properties?.STUSAB ?? null,
        county_equivalent_count: countyRows.length,
        counties_with_zcta_intersections: countyRows.filter((county) => county.intersecting_zcta_count > 0).length,
        intersecting_zcta_count: new Set(relationshipRows.map((relationship) => relationship.zcta)).size,
        materially_intersecting_zcta_count: new Set(materialRelationshipRows.map((relationship) => relationship.zcta)).size,
        intersected_zcta_area_m2: rounded(relationshipRows.reduce((sum, row) => sum + row.intersection_area_m2, 0), 3),
        allocation_semantics: "polygon-area-only-not-business-location",
      };
    })
    .sort((left, right) => left.state_fips.localeCompare(right.state_fips));
}

export async function buildZctaJurisdictionCrosswalk({
  geographyPointerPath,
  outputRoot,
  now = () => new Date(),
  logger = console.log,
} = {}) {
  if (!geographyPointerPath) throw new Error("geographyPointerPath is required.");
  if (!outputRoot) throw new Error("outputRoot is required.");
  const geography = await resolveGeographyRelease(geographyPointerPath);
  if (!geography.manifest.complete_national_release) {
    throw new Error("A complete national Census geography release is required.");
  }
  const stateArtifacts = artifactsFor(geography.manifest, "state");
  const countyArtifacts = artifactsFor(geography.manifest, "county");
  const zctaArtifacts = artifactsFor(geography.manifest, "zcta");
  if (stateArtifacts.length !== 1 || countyArtifacts.length === 0 || zctaArtifacts.length === 0) {
    throw new Error("The geography release is missing required state, county, or ZCTA source artifacts.");
  }

  const [stateFeatureSets, countyFeatureSets] = await Promise.all([
    Promise.all(stateArtifacts.map((artifact) => readFeatureArtifact(geography.releaseDirectory, artifact))),
    Promise.all(countyArtifacts.map((artifact) => readFeatureArtifact(geography.releaseDirectory, artifact))),
  ]);
  const stateFeatures = stateFeatureSets.flat();
  const countyFeatures = countyFeatureSets.flat();
  const { index: countyIndex, records: countyRecords } = createCountyIndex(countyFeatures);
  const relationships = [];
  const zctaSummaries = [];
  for (const artifact of zctaArtifacts) {
    const features = await readFeatureArtifact(geography.releaseDirectory, artifact);
    for (const feature of features) {
      const overlay = overlayZctaFeature(feature, countyIndex);
      relationships.push(...overlay.relationships);
      zctaSummaries.push(overlay.summary);
    }
    logger(`Overlayed ${zctaSummaries.length}/${geography.manifest.coverage.zctas} ZCTAs.`);
  }
  relationships.sort((left, right) => left.relationship_id.localeCompare(right.relationship_id));
  zctaSummaries.sort((left, right) => left.zcta.localeCompare(right.zcta));
  const countySummaries = summarizeCounties(countyRecords, relationships);
  const stateSummaries = summarizeStates(stateFeatures, countySummaries, relationships);

  const retrievedAt = now().toISOString();
  const runId = randomUUID();
  const releaseId = `us-census-zcta-jurisdiction-crosswalk-${releaseTimestamp(retrievedAt)}-${runId.slice(0, 8)}`;
  const stagingDirectory = path.join(outputRoot, ".staging", runId);
  const artifacts = [];
  artifacts.push(await writeArtifact(
    stagingDirectory,
    "derived/zcta-county-area-weights.jsonl",
    jsonLines(relationships),
    { artifact_type: "zcta-county-area-weights", record_count: relationships.length },
  ));
  artifacts.push(await writeArtifact(
    stagingDirectory,
    "derived/zcta-overlay-summary.jsonl",
    jsonLines(zctaSummaries),
    { artifact_type: "zcta-overlay-summary", record_count: zctaSummaries.length },
  ));
  artifacts.push(await writeArtifact(
    stagingDirectory,
    "derived/county-overlay-summary.jsonl",
    jsonLines(countySummaries),
    { artifact_type: "county-overlay-summary", record_count: countySummaries.length },
  ));
  artifacts.push(await writeArtifact(
    stagingDirectory,
    "derived/state-overlay-summary.jsonl",
    jsonLines(stateSummaries),
    { artifact_type: "state-overlay-summary", record_count: stateSummaries.length },
  ));

  const complete = zctaSummaries.filter((row) => row.overlay_status === "complete-within-tolerance").length;
  const unmatched = zctaSummaries.filter((row) => row.overlay_status === "unmatched").length;
  const partial = zctaSummaries.length - complete - unmatched;
  const manifest = {
    schema_version: ZCTA_JURISDICTION_SCHEMA_VERSION,
    dataset_id: "us-census-zcta-jurisdiction-crosswalk",
    connector: { id: "us-census-zcta-jurisdiction-crosswalk", version: "1.0.0" },
    transformation_version: ZCTA_JURISDICTION_TRANSFORMATION_VERSION,
    release_id: releaseId,
    run_id: runId,
    created_at: retrievedAt,
    status: "published",
    complete_national_release: true,
    upstream: {
      dataset_id: geography.manifest.dataset_id,
      release_id: geography.manifest.release_id,
      manifest_sha256: sha256(await readFile(geography.manifestPath)),
      coordinate_reference_system: geography.manifest.coordinate_reference_system,
      geometry_generalization: geography.manifest.geometry,
    },
    method: {
      candidate_selection: "R-tree bounding-box search",
      polygon_intersection: "polygon-clipping",
      area_measurement: "Turf geodesic area on EPSG:4326 intersection geometry",
      normalized_weight: "intersection area divided by total county-intersection area for the ZCTA",
      complete_coverage_tolerance: { minimum_ratio: 0.995, maximum_ratio: 1.005 },
      material_intersection_minimum_raw_share_of_zcta_polygon: MATERIAL_INTERSECTION_MINIMUM_SHARE,
      allocation_semantics: "polygon-area-only-not-business-location",
    },
    coverage: {
      state_equivalents: stateSummaries.length,
      county_equivalents: countySummaries.length,
      counties_with_zcta_intersections: countySummaries.filter((row) => row.intersecting_zcta_count > 0).length,
      zctas: zctaSummaries.length,
      zcta_count_complete_within_tolerance: complete,
      zcta_count_partial_or_overlapping: partial,
      zcta_count_unmatched: unmatched,
      zctas_with_multiple_county_topological_intersections: zctaSummaries.filter((row) => row.has_multiple_county_topological_intersections).length,
      zctas_with_multiple_state_topological_intersections: zctaSummaries.filter((row) => row.has_multiple_state_topological_intersections).length,
      zctas_crossing_county_boundaries_materially: zctaSummaries.filter((row) => row.crosses_county_boundary_materially).length,
      zctas_crossing_state_boundaries_materially: zctaSummaries.filter((row) => row.crosses_state_boundary_materially).length,
      zcta_county_relationships: relationships.length,
    },
    limitations: [
      "ZCTAs are Census statistical areas and are not USPS ZIP Code delivery boundaries.",
      "Area weights describe polygon overlap only; they must not be represented as the distribution of people, addresses, establishments, or businesses.",
      "County boundaries are TIGERweb Current while the ZCTA layer is 2020 Census vintage; the release reports overlay gaps and overages caused by vintage or generalized-geometry differences.",
      "Valid USPS ZIP Codes without a ZCTA are outside this polygon crosswalk and require a separately authorized operational ZIP assignment source.",
      "The generalized upstream geometry is not survey-grade.",
    ],
    artifacts: artifacts.sort((left, right) => left.path.localeCompare(right.path)),
  };
  await writeArtifact(stagingDirectory, "manifest.json", json(manifest));
  return publishStagedZctaJurisdictionCrosswalk({ stagingDirectory, outputRoot, manifest });
}

export async function publishStagedZctaJurisdictionCrosswalk({ stagingDirectory, outputRoot, manifest = null } = {}) {
  if (!stagingDirectory) throw new Error("stagingDirectory is required.");
  if (!outputRoot) throw new Error("outputRoot is required.");
  const absoluteOutputRoot = path.resolve(outputRoot);
  const absoluteStagingDirectory = path.resolve(stagingDirectory);
  const relativeStagingPath = path.relative(absoluteOutputRoot, absoluteStagingDirectory);
  if (relativeStagingPath.startsWith("..") || path.isAbsolute(relativeStagingPath) || relativeStagingPath.split(path.sep)[0] !== ".staging") {
    throw new Error("The staged release must be inside the output root's .staging directory.");
  }
  const stagedManifestPath = path.join(absoluteStagingDirectory, "manifest.json");
  const stagedManifest = manifest ?? JSON.parse(await readFile(stagedManifestPath, "utf8"));
  if (stagedManifest.dataset_id !== "us-census-zcta-jurisdiction-crosswalk" || stagedManifest.status !== "published") {
    throw new Error("The staged manifest is not a published ZCTA jurisdiction crosswalk release.");
  }
  await verifyZctaJurisdictionCrosswalkRelease(stagedManifestPath);
  const releaseDirectory = path.join(absoluteOutputRoot, "releases", stagedManifest.release_id);
  await mkdir(path.dirname(releaseDirectory), { recursive: true });
  await renameWithRetry(absoluteStagingDirectory, releaseDirectory);
  const currentPointer = {
    dataset_id: stagedManifest.dataset_id,
    release_id: stagedManifest.release_id,
    manifest: `releases/${stagedManifest.release_id}/manifest.json`,
    updated_at: stagedManifest.created_at,
  };
  await mkdir(absoluteOutputRoot, { recursive: true });
  const pointerPath = path.join(absoluteOutputRoot, "current.json");
  const temporaryPointerPath = `${pointerPath}.tmp-${stagedManifest.run_id}`;
  await writeFile(temporaryPointerPath, json(currentPointer), "utf8");
  await renameWithRetry(temporaryPointerPath, pointerPath);
  return { manifest: stagedManifest, releaseDirectory, pointerPath };
}

export async function verifyZctaJurisdictionCrosswalkRelease(manifestPath) {
  const absoluteManifestPath = path.resolve(manifestPath);
  const releaseDirectory = path.dirname(absoluteManifestPath);
  const manifest = JSON.parse(await readFile(absoluteManifestPath, "utf8"));
  if (manifest.dataset_id !== "us-census-zcta-jurisdiction-crosswalk") {
    throw new Error(`Unexpected dataset_id ${manifest.dataset_id ?? "missing"}.`);
  }
  if (manifest.status !== "published") throw new Error(`Release status is ${manifest.status ?? "missing"}.`);
  const failures = [];
  for (const artifact of manifest.artifacts ?? []) {
    const artifactPath = path.resolve(releaseDirectory, artifact.path);
    const relative = path.relative(releaseDirectory, artifactPath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      failures.push({ path: artifact.path, reason: "path escapes release directory" });
      continue;
    }
    try {
      const buffer = await readFile(artifactPath);
      if (buffer.byteLength !== artifact.bytes) {
        failures.push({ path: artifact.path, reason: `expected ${artifact.bytes} bytes, found ${buffer.byteLength}` });
      } else if (sha256(buffer) !== artifact.sha256) {
        failures.push({ path: artifact.path, reason: "SHA-256 mismatch" });
      }
    } catch (error) {
      failures.push({ path: artifact.path, reason: error.code === "ENOENT" ? "missing" : error.message });
    }
  }
  if (failures.length > 0) {
    const error = new Error(`ZCTA jurisdiction crosswalk verification failed for ${failures.length} artifact(s).`);
    error.failures = failures;
    throw error;
  }

  const artifactByType = new Map(manifest.artifacts.map((artifact) => [artifact.artifact_type, artifact]));
  const required = ["zcta-county-area-weights", "zcta-overlay-summary", "county-overlay-summary", "state-overlay-summary"];
  for (const type of required) {
    if (!artifactByType.has(type)) throw new Error(`Missing required ${type} artifact.`);
  }
  const relationships = await readJsonLines(path.join(releaseDirectory, artifactByType.get("zcta-county-area-weights").path));
  const zctaSummaries = await readJsonLines(path.join(releaseDirectory, artifactByType.get("zcta-overlay-summary").path));
  const countySummaries = await readJsonLines(path.join(releaseDirectory, artifactByType.get("county-overlay-summary").path));
  const stateSummaries = await readJsonLines(path.join(releaseDirectory, artifactByType.get("state-overlay-summary").path));
  const relationshipIds = new Set();
  const weightsByZcta = new Map();
  for (const relationship of relationships) {
    if (relationshipIds.has(relationship.relationship_id)) throw new Error(`Duplicate relationship ${relationship.relationship_id}.`);
    relationshipIds.add(relationship.relationship_id);
    if (!(relationship.intersection_area_m2 > 0)) throw new Error(`${relationship.relationship_id} has invalid area.`);
    if (!(relationship.normalized_share_of_matched_zcta_area > 0 && relationship.normalized_share_of_matched_zcta_area <= 1)) {
      throw new Error(`${relationship.relationship_id} has invalid normalized weight.`);
    }
    const expectedMaterial = relationship.raw_share_of_zcta_polygon_area >= MATERIAL_INTERSECTION_MINIMUM_SHARE;
    if (relationship.material_intersection !== expectedMaterial) {
      throw new Error(`${relationship.relationship_id} has an inconsistent material-intersection flag.`);
    }
    weightsByZcta.set(
      relationship.zcta,
      (weightsByZcta.get(relationship.zcta) ?? 0) + relationship.normalized_share_of_matched_zcta_area,
    );
  }
  for (const summary of zctaSummaries) {
    const weight = weightsByZcta.get(summary.zcta) ?? 0;
    if (summary.county_equivalent_count === 0 && weight !== 0) throw new Error(`Unmatched ZCTA ${summary.zcta} has weights.`);
    if (summary.county_equivalent_count > 0 && Math.abs(weight - 1) > 1e-8) {
      throw new Error(`Normalized weights for ZCTA ${summary.zcta} sum to ${weight}.`);
    }
  }
  const expected = manifest.coverage;
  if (relationships.length !== expected.zcta_county_relationships) throw new Error("Relationship count does not match manifest.");
  if (zctaSummaries.length !== expected.zctas) throw new Error("ZCTA count does not match manifest.");
  if (countySummaries.length !== expected.county_equivalents) throw new Error("County count does not match manifest.");
  if (stateSummaries.length !== expected.state_equivalents) throw new Error("State count does not match manifest.");
  return {
    dataset_id: manifest.dataset_id,
    release_id: manifest.release_id,
    artifact_count: manifest.artifacts.length,
    verified_bytes: manifest.artifacts.reduce((sum, artifact) => sum + artifact.bytes, 0),
    coverage: manifest.coverage,
  };
}
