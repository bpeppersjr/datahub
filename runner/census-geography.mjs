import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export const DATASET_SCHEMA_VERSION = "1.0.0";

export const CENSUS_LAYERS = Object.freeze({
  states: {
    id: "states",
    url: "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/0",
    geographyType: "state",
    sourceVintage: "TIGERweb Current",
  },
  counties: {
    id: "counties",
    url: "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1",
    geographyType: "county",
    sourceVintage: "TIGERweb Current",
  },
  zctas: {
    id: "zctas",
    url: "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/PUMA_TAD_TAZ_UGA_ZCTA/MapServer/1",
    geographyType: "zcta",
    sourceVintage: "2020 Census",
  },
});

const STATE_POSTAL_CODES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
]);

const TERRITORY_POSTAL_CODES = new Set(["AS", "GU", "MP", "PR", "VI"]);

export function classifyStateEquivalent(postalCode) {
  if (STATE_POSTAL_CODES.has(postalCode)) return "state";
  if (postalCode === "DC") return "district";
  if (TERRITORY_POSTAL_CODES.has(postalCode)) return "territory";
  return "other_state_equivalent";
}

function visitCoordinates(coordinates, visitor) {
  if (!Array.isArray(coordinates)) return;
  if (
    coordinates.length >= 2
    && typeof coordinates[0] === "number"
    && typeof coordinates[1] === "number"
  ) {
    visitor(coordinates[0], coordinates[1]);
    return;
  }
  for (const child of coordinates) visitCoordinates(child, visitor);
}

export function geometryBounds(geometry) {
  if (!geometry?.coordinates) return null;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  visitCoordinates(geometry.coordinates, (longitude, latitude) => {
    west = Math.min(west, longitude);
    south = Math.min(south, latitude);
    east = Math.max(east, longitude);
    north = Math.max(north, latitude);
  });
  return Number.isFinite(west) ? [west, south, east, north] : null;
}

function numeric(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function coordinatePair(longitude, latitude) {
  const lon = numeric(longitude);
  const lat = numeric(latitude);
  return lon === null || lat === null ? null : [lon, lat];
}

export function normalizeFeatureIndex(feature, geographyType, geometryFile) {
  const properties = feature.properties ?? {};
  const geoid = String(properties.GEOID ?? "").padStart(
    geographyType === "zcta" ? 5 : 0,
    "0",
  );
  const stateKind = geographyType === "state"
    ? classifyStateEquivalent(properties.STUSAB)
    : null;

  return {
    geo_id: geographyType === "state"
      ? `state:${geoid}`
      : geographyType === "county"
        ? `county:${geoid}`
        : `zcta:${geoid}`,
    geo_type: geographyType,
    geoid,
    name: properties.NAME ?? properties.BASENAME ?? geoid,
    postal_abbreviation: geographyType === "state" ? properties.STUSAB ?? null : null,
    state_fips: geographyType === "county" ? properties.STATE ?? geoid.slice(0, 2) : geographyType === "state" ? geoid : null,
    county_fips: geographyType === "county" ? properties.COUNTY ?? geoid.slice(2) : null,
    zcta: geographyType === "zcta" ? properties.ZCTA5 ?? geoid : null,
    state_equivalent_kind: stateKind,
    is_50_states_or_dc: geographyType === "state" ? stateKind === "state" || stateKind === "district" : null,
    area_land_m2: numeric(properties.AREALAND),
    area_water_m2: numeric(properties.AREAWATER),
    population_2020: numeric(properties.POP100),
    housing_units_2020: numeric(properties.HU100),
    centroid: coordinatePair(properties.CENTLON, properties.CENTLAT),
    internal_point: coordinatePair(properties.INTPTLON, properties.INTPTLAT),
    bbox: geometryBounds(feature.geometry),
    geometry_file: geometryFile.replaceAll("\\", "/"),
    source_feature_id: properties.OBJECTID ?? properties.OID ?? feature.id ?? null,
  };
}

function polygonParts(geometry) {
  if (geometry?.type === "Polygon") return [geometry.coordinates];
  if (geometry?.type === "MultiPolygon") return geometry.coordinates;
  throw new Error(`Expected Polygon or MultiPolygon, received ${geometry?.type ?? "no geometry"}.`);
}

export function createNationFeature(stateFeatures, scope) {
  const include = scope === "50-states-and-dc"
    ? (feature) => {
        const kind = classifyStateEquivalent(feature.properties?.STUSAB);
        return kind === "state" || kind === "district";
      }
    : () => true;
  const included = stateFeatures.filter(include);
  const coordinates = included.flatMap((feature) => polygonParts(feature.geometry));
  const geometry = { type: "MultiPolygon", coordinates };
  return {
    type: "Feature",
    properties: {
      geo_id: `nation:${scope}`,
      geo_type: "nation",
      name: scope === "50-states-and-dc"
        ? "United States — 50 states and District of Columbia"
        : "United States — all Census state-equivalent areas",
      scope,
      state_equivalent_count: included.length,
      bbox: geometryBounds(geometry),
    },
    geometry,
  };
}

function validateFeatures(features, geographyType) {
  const seen = new Set();
  for (const feature of features) {
    if (!feature?.geometry || !["Polygon", "MultiPolygon"].includes(feature.geometry.type)) {
      throw new Error(`${geographyType} feature is missing polygon geometry.`);
    }
    const geoid = String(feature.properties?.GEOID ?? "");
    if (!geoid) throw new Error(`${geographyType} feature is missing GEOID.`);
    if (seen.has(geoid)) throw new Error(`Duplicate ${geographyType} GEOID ${geoid}.`);
    seen.add(geoid);
  }
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function writeArtifact(releaseDirectory, relativePath, value, metadata = {}) {
  const absolutePath = path.join(releaseDirectory, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8");
  const temporaryPath = `${absolutePath}.tmp-${randomUUID()}`;
  await writeFile(temporaryPath, buffer);
  await rename(temporaryPath, absolutePath);
  return {
    path: relativePath.replaceAll("\\", "/"),
    bytes: buffer.byteLength,
    sha256: sha256(buffer),
    ...metadata,
  };
}

function json(value) {
  return `${JSON.stringify(value)}\n`;
}

function geoJson(features, name) {
  return json({ type: "FeatureCollection", name, features });
}

function jsonLines(records) {
  return `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
}

async function requestJson(url, body, { fetchImpl, retries = 3 }) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: new URLSearchParams(body),
        signal: AbortSignal.timeout(120_000),
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

async function countFeatures(layer, where, options) {
  const payload = await requestJson(`${layer.url}/query`, {
    where,
    returnCountOnly: "true",
    f: "json",
  }, options);
  if (!Number.isInteger(payload.count)) throw new Error(`No count returned for ${layer.id}.`);
  return payload.count;
}

async function acquireFeatures(layer, where, options) {
  const available = await countFeatures(layer, where, options);
  const expected = options.maxFeatures === null
    ? available
    : Math.min(available, options.maxFeatures);
  const features = [];
  while (features.length < expected) {
    const remaining = expected - features.length;
    const payload = await requestJson(`${layer.url}/query`, {
      where,
      outFields: "*",
      returnGeometry: "true",
      outSR: "4326",
      resultOffset: String(features.length),
      resultRecordCount: String(Math.min(options.pageSize, remaining)),
      orderByFields: "GEOID",
      geometryPrecision: String(options.geometryPrecision),
      maxAllowableOffset: String(options.geometryOffset),
      f: "geojson",
    }, options);
    const page = payload.features ?? [];
    if (page.length === 0) break;
    features.push(...page);
    options.logger(`Fetched ${features.length}/${expected} ${layer.id}${where === "1=1" ? "" : ` (${where})`}.`);
  }
  if (features.length !== expected) {
    throw new Error(`Expected ${expected} ${layer.id} features but received ${features.length}.`);
  }
  validateFeatures(features, layer.geographyType);
  return { available, features };
}

function releaseTimestamp(instant) {
  return instant.replaceAll(/[-:.]/g, "").replace("T", "-").replace("Z", "Z");
}

export async function buildCensusGeography({
  outputRoot,
  geometryOffset = 0.0001,
  geometryPrecision = 6,
  pageSize = 500,
  maxFeatures = null,
  zctaPrefixes = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"],
  fetchImpl = globalThis.fetch,
  logger = console.log,
  now = () => new Date(),
} = {}) {
  if (!outputRoot) throw new Error("outputRoot is required.");
  if (!(geometryOffset > 0 && geometryOffset <= 0.01)) {
    throw new Error("geometryOffset must be greater than 0 and no more than 0.01 degrees.");
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 2_000) {
    throw new Error("pageSize must be an integer from 1 through 2000.");
  }
  if (maxFeatures !== null && (!Number.isInteger(maxFeatures) || maxFeatures < 1)) {
    throw new Error("maxFeatures must be null or a positive integer.");
  }

  const retrievedAt = now().toISOString();
  const runId = randomUUID();
  const releaseId = `us-census-geography-${releaseTimestamp(retrievedAt)}-${runId.slice(0, 8)}`;
  const stagingDirectory = path.join(outputRoot, ".staging", runId);
  const releasesDirectory = path.join(outputRoot, "releases");
  const releaseDirectory = path.join(releasesDirectory, releaseId);
  await mkdir(stagingDirectory, { recursive: true });
  const artifacts = [];
  const allIndexes = { states: [], counties: [], zctas: [] };
  const sourceCounts = {};
  const requestOptions = {
    fetchImpl,
    geometryOffset,
    geometryPrecision,
    pageSize,
    maxFeatures,
    logger,
  };

  const statesResult = await acquireFeatures(CENSUS_LAYERS.states, "1=1", requestOptions);
  sourceCounts.states = statesResult.available;
  const statePath = "source/states.geojson";
  artifacts.push(await writeArtifact(
    stagingDirectory,
    statePath,
    geoJson(statesResult.features, "Census TIGERweb state-equivalent boundaries"),
    { feature_count: statesResult.features.length, geography_type: "state" },
  ));
  allIndexes.states = statesResult.features
    .map((feature) => normalizeFeatureIndex(feature, "state", statePath))
    .sort((a, b) => a.geoid.localeCompare(b.geoid));

  const countiesResult = await acquireFeatures(CENSUS_LAYERS.counties, "1=1", requestOptions);
  sourceCounts.counties = countiesResult.available;
  const countiesByState = Map.groupBy(
    countiesResult.features,
    (feature) => String(feature.properties?.STATE ?? feature.properties?.GEOID ?? "").slice(0, 2),
  );
  for (const [stateFips, features] of [...countiesByState].sort(([a], [b]) => a.localeCompare(b))) {
    const countyPath = `source/counties/state=${stateFips}.geojson`;
    artifacts.push(await writeArtifact(
      stagingDirectory,
      countyPath,
      geoJson(features, `Census TIGERweb county boundaries for state FIPS ${stateFips}`),
      { feature_count: features.length, geography_type: "county", partition: stateFips },
    ));
    allIndexes.counties.push(...features.map((feature) => normalizeFeatureIndex(feature, "county", countyPath)));
  }
  allIndexes.counties.sort((a, b) => a.geoid.localeCompare(b.geoid));

  sourceCounts.zctas = await countFeatures(CENSUS_LAYERS.zctas, "1=1", requestOptions);
  let selectedAvailableZctas = 0;
  for (const prefix of zctaPrefixes) {
    if (!/^\d$/.test(prefix)) throw new Error(`Invalid ZCTA prefix ${prefix}.`);
    const where = `GEOID LIKE '${prefix}%'`;
    const zctaResult = await acquireFeatures(CENSUS_LAYERS.zctas, where, requestOptions);
    selectedAvailableZctas += zctaResult.available;
    const zctaPath = `source/zctas/prefix=${prefix}.geojson`;
    artifacts.push(await writeArtifact(
      stagingDirectory,
      zctaPath,
      geoJson(zctaResult.features, `2020 Census ZCTAs beginning with ${prefix}`),
      { feature_count: zctaResult.features.length, geography_type: "zcta", partition: prefix },
    ));
    allIndexes.zctas.push(...zctaResult.features.map((feature) => normalizeFeatureIndex(feature, "zcta", zctaPath)));
  }
  allIndexes.zctas.sort((a, b) => a.geoid.localeCompare(b.geoid));
  validateFeatures(
    zctaPrefixes.length === 10 ? allIndexes.zctas.map((record) => ({
      geometry: { type: "Polygon" },
      properties: { GEOID: record.geoid },
    })) : [],
    "zcta index",
  );

  const nationAll = createNationFeature(statesResult.features, "all-census-us-areas");
  const nationStatesDc = createNationFeature(statesResult.features, "50-states-and-dc");
  artifacts.push(await writeArtifact(
    stagingDirectory,
    "derived/nation-all-census-us-areas.geojson",
    geoJson([nationAll], "United States boundary — all Census state-equivalent areas"),
    { feature_count: 1, geography_type: "nation", scope: "all-census-us-areas" },
  ));
  artifacts.push(await writeArtifact(
    stagingDirectory,
    "derived/nation-50-states-and-dc.geojson",
    geoJson([nationStatesDc], "United States boundary — 50 states and District of Columbia"),
    { feature_count: 1, geography_type: "nation", scope: "50-states-and-dc" },
  ));

  for (const [key, records] of Object.entries(allIndexes)) {
    artifacts.push(await writeArtifact(
      stagingDirectory,
      `derived/index/${key}.jsonl`,
      jsonLines(records),
      { record_count: records.length, artifact_type: "normalized-index" },
    ));
  }

  const hasEveryZctaPrefix = zctaPrefixes.length === 10 && new Set(zctaPrefixes).size === 10;
  const isCompleteNationalRelease = maxFeatures === null && hasEveryZctaPrefix;
  if (isCompleteNationalRelease) {
    if (selectedAvailableZctas !== sourceCounts.zctas) {
      throw new Error(`ZCTA partitions contain ${selectedAvailableZctas} source features; the national layer reports ${sourceCounts.zctas}.`);
    }
    if (allIndexes.states.length < 56) throw new Error("National release has fewer than 56 state-equivalent areas.");
    if (allIndexes.counties.length < 3_200) throw new Error("National release has fewer than 3,200 county equivalents.");
    if (allIndexes.zctas.length < 33_000) throw new Error("National release has fewer than 33,000 ZCTAs.");
  }

  const manifest = {
    schema_version: DATASET_SCHEMA_VERSION,
    dataset_id: "us-census-geography",
    connector: { id: "us-census-geography", version: "1.0.0" },
    release_id: releaseId,
    run_id: runId,
    retrieved_at: retrievedAt,
    status: "published",
    complete_national_release: isCompleteNationalRelease,
    coordinate_reference_system: "EPSG:4326",
    geometry: {
      generalization_method: "ArcGIS maxAllowableOffset",
      max_allowable_offset_degrees: geometryOffset,
      approximate_offset_meters_at_equator: Number((geometryOffset * 111_320).toFixed(2)),
      coordinate_precision_decimal_places: geometryPrecision,
    },
    coverage: {
      state_equivalents: allIndexes.states.length,
      states_and_district_of_columbia: allIndexes.states.filter((record) => record.is_50_states_or_dc).length,
      territories: allIndexes.states.filter((record) => record.state_equivalent_kind === "territory").length,
      county_equivalents: allIndexes.counties.length,
      zctas: allIndexes.zctas.length,
      source_available_counts: sourceCounts,
    },
    sources: [
      {
        source_id: "us-census-tigerweb-state-county-current",
        publisher: "United States Census Bureau",
        source_vintage: "TIGERweb Current at retrieval",
        service_url: "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer",
        layers: { states: 0, counties: 1 },
        policy_profile: "config/source-policies/us-census-geography.json",
      },
      {
        source_id: "us-census-tigerweb-zcta-2020",
        publisher: "United States Census Bureau",
        source_vintage: "2020 Census",
        service_url: "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/PUMA_TAD_TAZ_UGA_ZCTA/MapServer",
        layers: { zctas: 1 },
        policy_profile: "config/source-policies/us-census-geography.json",
      },
    ],
    limitations: [
      "ZIP Code Tabulation Areas (ZCTAs) are Census statistical approximations of generalized ZIP service areas, not USPS delivery-route boundaries.",
      "Some valid USPS ZIP Codes, including many PO Box-only and unique ZIP Codes, do not have a ZCTA polygon.",
      "ZCTAs can cross state and county boundaries and must not be assigned to one jurisdiction without a documented overlay rule.",
      "Published geometry is generalized by the configured offset; use unsimplified TIGER/Line data for survey-grade boundary work.",
    ],
    artifacts: artifacts.sort((a, b) => a.path.localeCompare(b.path)),
  };

  // The manifest is intentionally the last artifact written before the release directory is published.
  await writeArtifact(stagingDirectory, "manifest.json", json(manifest));
  await mkdir(releasesDirectory, { recursive: true });
  await rename(stagingDirectory, releaseDirectory);

  const currentPointer = {
    dataset_id: manifest.dataset_id,
    release_id: releaseId,
    manifest: `releases/${releaseId}/manifest.json`,
    updated_at: retrievedAt,
  };
  const pointerPath = path.join(outputRoot, "current.json");
  const pointerTemporaryPath = `${pointerPath}.tmp-${runId}`;
  await writeFile(pointerTemporaryPath, json(currentPointer), "utf8");
  await rename(pointerTemporaryPath, pointerPath);
  const releaseStats = await stat(releaseDirectory);
  if (!releaseStats.isDirectory()) throw new Error("Published geography release is not a directory.");

  return { manifest, releaseDirectory, pointerPath };
}

export async function verifyCensusGeographyRelease(manifestPath) {
  const absoluteManifestPath = path.resolve(manifestPath);
  const releaseDirectory = path.dirname(absoluteManifestPath);
  const manifest = JSON.parse(await readFile(absoluteManifestPath, "utf8"));
  if (manifest.dataset_id !== "us-census-geography") {
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
    const error = new Error(`Geography release verification failed for ${failures.length} artifact(s).`);
    error.failures = failures;
    throw error;
  }
  return {
    dataset_id: manifest.dataset_id,
    release_id: manifest.release_id,
    artifact_count: manifest.artifacts.length,
    verified_bytes: manifest.artifacts.reduce((sum, artifact) => sum + artifact.bytes, 0),
    coverage: manifest.coverage,
  };
}
