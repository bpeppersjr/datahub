import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { APP_ROOT } from "./paths.mjs";
import { assessBusinessSourceTemporalStatus, summarizeBusinessSourceTemporalStatus } from "./business-source-temporal-status.mjs";
import { assessStateBusinessSourceReadiness, summarizeStateBusinessSourceReadiness } from "./business-state-source-readiness.mjs";
import {
  DEFAULT_STATE_BUSINESS_SOURCE_REVALIDATION_PATH,
  indexStateBusinessSourceRevalidation,
  loadStateBusinessSourceRevalidation,
  summarizeStateBusinessSourceRevalidation,
} from "./state-business-source-revalidation.mjs";

const DEFAULT_POINTER_PATH = path.join(APP_ROOT, "data", "business-coverage-views", "current.json");
const DEFAULT_STATE_SOURCE_REVALIDATION_PROVIDER = Object.freeze({
  load: loadStateBusinessSourceRevalidation,
  index: indexStateBusinessSourceRevalidation,
  summarize: summarizeStateBusinessSourceRevalidation,
});
const DIMENSION_ARTIFACT_TYPES = Object.freeze({
  states: "state-coverage-view-jsonl",
  counties: "county-coverage-view-jsonl",
  zips: "zip-coverage-view-jsonl",
  sources: "source-coverage-view-jsonl",
  gaps: "coverage-gap-view-jsonl",
});

const SOURCE_DISPLAY_NAMES = Object.freeze({
  census_nonemployer_statistics: "Census Nonemployer Statistics",
  california_abc_active_issued_license_sites: "California ABC Active Issued-License Sites",
  chicago_active_business_license_sites: "Chicago Current Active Business License Sites",
  dc_basic_business_license_sites: "DC DLCP Active Basic Business License Sites",
  nyc_dcwp_active_license_sites: "NYC DCWP Active Premise-License Sites",
  cms_nppes_organizations: "CMS NPPES Organizations",
  co_business_registry_good_standing_or_delinquent_organizations: "Colorado Business Registry Good Standing or Delinquent Organizations",
  ct_business_registry_active_organizations: "Connecticut Business Registry Active Organizations",
  de_business_licenses_current: "Delaware Division of Revenue Current Business Licenses",
  ak_active_business_licenses: "Alaska DCCED Active Business Licenses",
  epa_echo_active_facilities: "EPA ECHO Active Facilities",
  fdic_bankfind: "FDIC BankFind",
  fl_business_registry_quarterly_active_entities: "Florida Business Registry Quarterly Active Entities",
  fmcsa_active_us_company_census: "FMCSA Active U.S. Company Census",
  fsis_active_mpi_establishments: "FSIS Active MPI Establishments",
  ia_business_registry_active_entities: "Iowa Business Registry Active Entities",
  irs_eo_bmf_organizations: "IRS EO BMF Organizations",
  la_active_business_location_accounts: "Los Angeles Active Business Location Accounts",
  ncua_quarterly_credit_unions: "NCUA Quarterly Credit Unions",
  ny_business_registry_active_entities: "New York Business Registry Active Entities",
  ny_retail_food_store_license_sites: "New York Retail Food Store License Sites",
  or_business_registry_active_registrations: "Oregon Business Registry Active Registrations",
  pa_business_registry_active_registrations: "Pennsylvania Department of State Active Business Registrations",
  tx_active_sales_tax_permit_outlets: "Texas Active Sales Tax Permit Outlets",
  usda_snap_retailers: "USDA SNAP Retailers",
  wa_lni_active_contractor_organizations: "Washington L&I Active Contractor Organizations",
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
      spatial_zip_polygon_membership_status: row.spatial_zip_polygon_membership?.status ?? "unknown",
      employer_baseline_status: row.employer_baseline?.status ?? "missing",
      employer_establishments: row.employer_baseline?.establishments ?? null,
      material_county_count: row.jurisdiction_overlay.relationships.filter((relationship) => relationship.material_intersection).length,
      current_usps_validity_status: row.current_usps_validity?.status ?? "unverified",
      coverage_gap_codes: row.coverage_gap_codes,
    });
  }
  return records;
}

function stateApiRow(row, sourceRevalidation = null, sourceRevalidationDocument = null, currentCoverageReleaseId = null) {
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
    state_source_readiness: assessStateBusinessSourceReadiness(row),
    latest_source_revalidation: sourceRevalidation ? {
      revalidation_id: sourceRevalidationDocument?.revalidation_id ?? null,
      observed_at: sourceRevalidationDocument?.observed_at ?? null,
      coverage_release_id: sourceRevalidationDocument?.coverage_release_id ?? null,
      coverage_release_matches_current: sourceRevalidationDocument?.coverage_release_id === currentCoverageReleaseId,
      prior_decision: sourceRevalidation.prior_decision,
      decision: sourceRevalidation.decision,
      changed_since_prior_review: sourceRevalidation.changed_since_prior_review,
      candidate: structuredClone(sourceRevalidation.candidate),
      bounded_connector_implementation_authorized: sourceRevalidation.bounded_connector_implementation_authorized,
      autonomous_acquisition_authorized: sourceRevalidation.autonomous_acquisition_authorized,
      complete_source_acquisition_authorized: sourceRevalidation.complete_source_acquisition_authorized,
      production_ready: sourceRevalidation.production_ready,
      unresolved_gates: [...sourceRevalidation.unresolved_gates],
      strongest_bounded_next_action: sourceRevalidation.strongest_bounded_next_action,
      official_urls: [...sourceRevalidation.official_urls],
    } : null,
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

function sourceApiRow(row, asOf) {
  return {
    view_id: row.view_id,
    source_key: row.source_key,
    source_name: SOURCE_DISPLAY_NAMES[row.source_key] ?? row.source_key.replaceAll("_", " "),
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
    temporal_status: assessBusinessSourceTemporalStatus(row, { asOf }),
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

export function createBusinessCoverageViewStore({
  pointerPath = DEFAULT_POINTER_PATH,
  now = () => new Date(),
  stateSourceRevalidationPath = DEFAULT_STATE_BUSINESS_SOURCE_REVALIDATION_PATH,
  stateSourceRevalidationProvider = DEFAULT_STATE_SOURCE_REVALIDATION_PROVIDER,
} = {}) {
  let activeReleaseId = null;
  let release = null;
  let stateSourceRevalidationPromise = null;
  const cache = new Map();

  async function ensureStateSourceRevalidation() {
    if (stateSourceRevalidationPath === null) return null;
    stateSourceRevalidationPromise ??= stateSourceRevalidationProvider.load(stateSourceRevalidationPath);
    try {
      return await stateSourceRevalidationPromise;
    } catch (error) {
      stateSourceRevalidationPromise = null;
      throw error;
    }
  }

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
    const loadedRelease = { manifest, releaseDirectory, artifacts };
    const latestPointer = JSON.parse(await readFile(pointerPath, "utf8"));
    if (latestPointer.dataset_id !== pointer.dataset_id || latestPointer.release_id !== pointer.release_id || latestPointer.manifest !== pointer.manifest) return ensureRelease();
    release = loadedRelease;
    activeReleaseId = pointer.release_id;
    for (const key of cache.keys()) if (!key.startsWith(`${activeReleaseId}:`)) cache.delete(key);
    return loadedRelease;
  }

  function safeArtifactPath(current, artifactType) {
    const artifact = current.artifacts.get(artifactType);
    if (!artifact) throw new Error(`Business coverage release is missing ${artifactType}.`);
    const filePath = path.resolve(current.releaseDirectory, artifact.path);
    const relative = path.relative(current.releaseDirectory, filePath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`Business coverage artifact escapes release: ${artifact.path}`);
    return filePath;
  }

  async function loadDimension(dimension, releaseSnapshot = null) {
    const current = releaseSnapshot ?? await ensureRelease();
    if (!current) return null;
    const cacheKey = `${current.manifest.release_id}:${dimension}`;
    if (cache.has(cacheKey)) return structuredClone(cache.get(cacheKey));
    let records;
    if (dimension === "national") {
      records = await readJsonLines(safeArtifactPath(current, "national-coverage-view-jsonl"));
    } else if (dimension === "zips") {
      records = await readCompactZipIndex(safeArtifactPath(current, DIMENSION_ARTIFACT_TYPES.zips));
    } else {
      records = await readJsonLines(safeArtifactPath(current, DIMENSION_ARTIFACT_TYPES[dimension]));
      if (dimension === "states") {
        const sourceRevalidation = await ensureStateSourceRevalidation();
        const sourceRevalidationIndex = sourceRevalidation ? stateSourceRevalidationProvider.index(sourceRevalidation) : new Map();
        records = records.map((row) => stateApiRow(
          row,
          sourceRevalidationIndex.get(row.postal_abbreviation) ?? null,
          sourceRevalidation,
          current.manifest.release_id,
        ));
      }
      if (dimension === "counties") records = records.map(countyApiRow);
      if (dimension === "sources") records = records.map((row) => sourceApiRow(row, now()));
      if (dimension === "gaps") records = records.map(gapApiRow);
    }
    if (activeReleaseId === current.manifest.release_id) cache.set(cacheKey, structuredClone(records));
    return structuredClone(records);
  }

  async function getOverview() {
    const current = await ensureRelease();
    if (!current) return { available: false };
    const [national, sources, states, sourceRevalidation] = await Promise.all([
      loadDimension("national", current),
      loadDimension("sources", current),
      loadDimension("states", current),
      ensureStateSourceRevalidation(),
    ]);
    return structuredClone({
      available: true,
      dataset_id: current.manifest.dataset_id,
      release_id: current.manifest.release_id,
      created_at: current.manifest.created_at,
      status: current.manifest.status,
      export_policy: current.manifest.export_policy,
      complete_all_businesses: current.manifest.complete_all_businesses,
      entity_resolution_applied: current.manifest.entity_resolution_applied,
      spatial_zip_polygon_denominator: current.manifest.spatial_zip_polygon_denominator,
      normalized_postal_field_migration: current.manifest.normalized_postal_field_migration,
      usps_operational_zip_evidence: current.manifest.usps_operational_zip_evidence,
      authoritative_current_usps_zip_denominator: current.manifest.authoritative_current_usps_zip_denominator,
      coverage: current.manifest.coverage,
      count_semantics: current.manifest.count_semantics,
      national,
      sources,
      source_temporal_summary: summarizeBusinessSourceTemporalStatus(sources),
      state_source_readiness_summary: summarizeStateBusinessSourceReadiness(states),
      state_source_revalidation_summary: sourceRevalidation
        ? stateSourceRevalidationProvider.summarize(sourceRevalidation, current.manifest.release_id)
        : null,
      limitations: current.manifest.limitations,
    });
  }

  async function listDimension(dimension, options = {}) {
    if (!Object.hasOwn(DIMENSION_ARTIFACT_TYPES, dimension)) throw Object.assign(new Error("Unsupported coverage dimension."), { statusCode: 404 });
    const current = await ensureRelease();
    const records = await loadDimension(dimension, current);
    if (!records) return { available: false, dimension, total: 0, offset: 0, limit: 0, records: [] };
    const query = cleanQuery(options.query);
    const stateFips = String(options.stateFips ?? "").trim();
    const gapType = String(options.gapType ?? "").trim();
    let filtered = records;
    if (dimension === "states") filtered = records.filter((row) => contains({
      ...row,
      source_candidate: row.latest_source_revalidation?.candidate?.product,
      source_decision: row.latest_source_revalidation?.decision,
    }, ["state_name", "postal_abbreviation", "state_fips", "source_candidate", "source_decision"], query));
    if (dimension === "counties") filtered = records.filter((row) => (!stateFips || row.state_fips === stateFips) && contains(row, ["county_name", "county_geoid", "state_fips"], query));
    if (dimension === "zips") filtered = records.filter((row) => !query || row.zip_code.startsWith(query));
    if (dimension === "sources") filtered = records.filter((row) => contains(row, ["source_key", "source_name", "profile_source_id"], query));
    if (dimension === "gaps") filtered = records.filter((row) => (!gapType || row.gap_type === gapType) && contains(row, ["gap_type", "scope_type", "scope_id", "severity", "consequence"], query));
    const offset = positiveInteger(options.offset, 0, Math.max(0, filtered.length));
    const limit = Math.max(1, positiveInteger(options.limit, 25, 100));
    return {
      available: true,
      release_id: current.manifest.release_id,
      dimension,
      total: filtered.length,
      offset,
      limit,
      records: filtered.slice(offset, offset + limit),
    };
  }

  return { getOverview, listDimension };
}
