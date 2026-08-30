import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { APP_ROOT } from "./paths.mjs";

const DEFAULT_POINTER_PATH = path.join(APP_ROOT, "data", "business-coverage-views", "current.json");
const DIMENSION_ARTIFACT_TYPES = Object.freeze({
  states: "state-coverage-view-jsonl",
  counties: "county-coverage-view-jsonl",
  zips: "zip-coverage-view-jsonl",
  sources: "source-coverage-view-jsonl",
  gaps: "coverage-gap-view-jsonl",
});

function positiveInteger(value, fallback, maximum) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, maximum);
}

function cleanQuery(value) {
  return String(value ?? "").trim().toLocaleLowerCase("en-US").slice(0, 120);
}

async function readJsonLines(filePath) {
  const content = await readFile(filePath, "utf8");
  return content.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

async function readCompactZipIndex(filePath) {
  const records = [];
  const lines = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line) continue;
    const row = JSON.parse(line);
    records.push({
      view_id: row.view_id,
      zip_code: row.zip_code,
      coverage_status: row.registry_coverage.status,
      physical_site_count: row.registry_coverage.physical_site_count,
      establishment_count: row.registry_coverage.establishment_count,
      organization_primary_location_count: row.registry_coverage.organization_primary_location_count,
      zcta_geoid: row.geography?.geoid ?? null,
      zcta_status: row.geography?.status ?? "missing",
      employer_baseline_status: row.employer_baseline?.status ?? "missing",
      employer_establishments: row.employer_baseline?.establishments ?? null,
      material_county_count: row.jurisdiction_overlay.relationships.filter((relationship) => relationship.material_intersection).length,
      current_usps_validity_status: row.current_usps_validity?.status ?? "unverified",
      coverage_gap_codes: row.coverage_gap_codes,
    });
  }
  return records;
}

function stateApiRow(row) {
  return {
    view_id: row.view_id,
    state_fips: row.state_fips,
    state_name: row.state_name,
    postal_abbreviation: row.postal_abbreviation,
    state_equivalent_kind: row.state_equivalent_kind,
    is_50_states_or_dc: row.is_50_states_or_dc,
    county_equivalent_count: row.geography.county_equivalent_count,
    reported_address_profile_count: row.registry_evidence.reported_address_profile_count,
    coordinate_assigned_profile_count: row.registry_evidence.coordinate_assigned_profile_count,
    reported_coordinate_state_conflict_count: row.registry_evidence.reported_coordinate_state_conflict_count,
    material_intersecting_zcta_count: row.zcta_coverage.material_intersecting_zcta_count,
    zctas_with_record_level_source_contribution: row.zcta_coverage.zctas_with_record_level_source_contribution,
    zctas_denominator_only_no_record_level_contribution: row.zcta_coverage.zctas_denominator_only_no_record_level_contribution,
    nonemployer_baseline: row.nonemployer_baseline,
  };
}

function countyApiRow(row) {
  return {
    view_id: row.view_id,
    county_geoid: row.county_geoid,
    county_name: row.county_name,
    state_fips: row.state_fips,
    coordinate_assigned_profile_count: row.registry_evidence.coordinate_assigned_profile_count,
    earliest_observed_at: row.registry_evidence.earliest_observed_at,
    latest_observed_at: row.registry_evidence.latest_observed_at,
    material_intersecting_zcta_count: row.zcta_coverage.material_intersecting_zcta_count,
    zctas_with_record_level_source_contribution: row.zcta_coverage.zctas_with_record_level_source_contribution,
    zctas_denominator_only_no_record_level_contribution: row.zcta_coverage.zctas_denominator_only_no_record_level_contribution,
    nonemployer_baseline: row.nonemployer_baseline,
  };
}

function sourceApiRow(row) {
  return {
    view_id: row.view_id,
    source_key: row.source_key,
    profile_source_id: row.profile_source_id,
    source_kind: row.source_kind ?? "record-level-evidence",
    release_metadata: row.release_metadata,
    zip_level_counts: row.zip_level_counts,
    zip_rows_with_contribution: row.zip_rows_with_contribution,
    profile_count: row.location_profile_geography.profile_count,
    reported_state_assigned_count: row.location_profile_geography.reported_state_assigned_count,
    coordinate_present_valid_count: row.location_profile_geography.coordinate_present_valid_count,
    coordinate_assigned_single_count: row.location_profile_geography.coordinate_assigned_single_count,
    coordinate_missing_count: row.location_profile_geography.coordinate_missing_count,
    coordinate_unmatched_count: row.location_profile_geography.coordinate_unmatched_count,
    coordinate_ambiguous_boundary_count: row.location_profile_geography.coordinate_ambiguous_boundary_count,
    earliest_observed_at: row.location_profile_geography.earliest_observed_at,
    latest_observed_at: row.location_profile_geography.latest_observed_at,
    aggregate_baseline: row.aggregate_baseline ?? null,
  };
}

function gapApiRow(row) {
  return {
    gap_id: row.gap_id,
    gap_type: row.gap_type,
    scope_type: row.scope_type,
    scope_id: row.scope_id,
    severity: row.severity,
    consequence: row.consequence,
    evidence: row.evidence,
  };
}

function contains(record, fields, query) {
  if (!query) return true;
  return fields.some((field) => String(record[field] ?? "").toLocaleLowerCase("en-US").includes(query));
}

export function createBusinessCoverageViewStore({ pointerPath = DEFAULT_POINTER_PATH } = {}) {
  let activeReleaseId = null;
  let release = null;
  const cache = new Map();

  async function ensureRelease() {
    let pointer;
    try {
      pointer = JSON.parse(await readFile(pointerPath, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
    if (pointer.dataset_id !== "national-business-coverage-views" || !pointer.manifest) {
      throw new Error("Business coverage current pointer is invalid.");
    }
    if (pointer.release_id === activeReleaseId && release) return release;
    const pointerDirectory = path.dirname(pointerPath);
    const manifestPath = path.resolve(pointerDirectory, pointer.manifest);
    const relativeManifest = path.relative(pointerDirectory, manifestPath);
    if (relativeManifest.startsWith("..") || path.isAbsolute(relativeManifest)) {
      throw new Error("Business coverage manifest path escapes its dataset directory.");
    }
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    if (manifest.dataset_id !== "national-business-coverage-views"
        || manifest.release_id !== pointer.release_id
        || manifest.status !== "published-partial-local-aggregate") {
      throw new Error("Business coverage manifest is not a compatible published release.");
    }
    const releaseDirectory = path.dirname(manifestPath);
    const artifacts = new Map((manifest.artifacts ?? []).map((artifact) => [artifact.artifact_type, artifact]));
    release = { manifest, releaseDirectory, artifacts };
    activeReleaseId = pointer.release_id;
    cache.clear();
    return release;
  }

  function safeArtifactPath(current, artifactType) {
    const artifact = current.artifacts.get(artifactType);
    if (!artifact) throw new Error(`Business coverage release is missing ${artifactType}.`);
    const filePath = path.resolve(current.releaseDirectory, artifact.path);
    const relative = path.relative(current.releaseDirectory, filePath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`Business coverage artifact escapes release: ${artifact.path}`);
    return filePath;
  }

  async function loadDimension(dimension) {
    const current = await ensureRelease();
    if (!current) return null;
    if (cache.has(dimension)) return cache.get(dimension);
    let records;
    if (dimension === "national") {
      records = await readJsonLines(safeArtifactPath(current, "national-coverage-view-jsonl"));
    } else if (dimension === "zips") {
      records = await readCompactZipIndex(safeArtifactPath(current, DIMENSION_ARTIFACT_TYPES.zips));
    } else {
      records = await readJsonLines(safeArtifactPath(current, DIMENSION_ARTIFACT_TYPES[dimension]));
      if (dimension === "states") records = records.map(stateApiRow);
      if (dimension === "counties") records = records.map(countyApiRow);
      if (dimension === "sources") records = records.map(sourceApiRow);
      if (dimension === "gaps") records = records.map(gapApiRow);
    }
    cache.set(dimension, records);
    return records;
  }

  async function getOverview() {
    const current = await ensureRelease();
    if (!current) return { available: false };
    const [national, sources] = await Promise.all([loadDimension("national"), loadDimension("sources")]);
    return {
      available: true,
      dataset_id: current.manifest.dataset_id,
      release_id: current.manifest.release_id,
      created_at: current.manifest.created_at,
      status: current.manifest.status,
      export_policy: current.manifest.export_policy,
      complete_all_businesses: current.manifest.complete_all_businesses,
      entity_resolution_applied: current.manifest.entity_resolution_applied,
      authoritative_current_usps_zip_denominator: current.manifest.authoritative_current_usps_zip_denominator,
      coverage: current.manifest.coverage,
      count_semantics: current.manifest.count_semantics,
      national,
      sources,
      limitations: current.manifest.limitations,
    };
  }

  async function listDimension(dimension, options = {}) {
    if (!Object.hasOwn(DIMENSION_ARTIFACT_TYPES, dimension)) throw Object.assign(new Error("Unsupported coverage dimension."), { statusCode: 404 });
    const records = await loadDimension(dimension);
    if (!records) return { available: false, dimension, total: 0, offset: 0, limit: 0, records: [] };
    const query = cleanQuery(options.query);
    const stateFips = String(options.stateFips ?? "").trim();
    const gapType = String(options.gapType ?? "").trim();
    let filtered = records;
    if (dimension === "states") filtered = records.filter((row) => contains(row, ["state_name", "postal_abbreviation", "state_fips"], query));
    if (dimension === "counties") filtered = records.filter((row) => (!stateFips || row.state_fips === stateFips) && contains(row, ["county_name", "county_geoid", "state_fips"], query));
    if (dimension === "zips") filtered = records.filter((row) => !query || row.zip_code.startsWith(query));
    if (dimension === "sources") filtered = records.filter((row) => contains(row, ["source_key", "profile_source_id"], query));
    if (dimension === "gaps") filtered = records.filter((row) => (!gapType || row.gap_type === gapType) && contains(row, ["gap_type", "scope_type", "scope_id", "severity", "consequence"], query));
    const offset = positiveInteger(options.offset, 0, Math.max(0, filtered.length));
    const limit = Math.max(1, positiveInteger(options.limit, 25, 100));
    return {
      available: true,
      release_id: activeReleaseId,
      dimension,
      total: filtered.length,
      offset,
      limit,
      records: filtered.slice(offset, offset + limit),
    };
  }

  return { getOverview, listDimension };
}
