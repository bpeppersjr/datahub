import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {APP_ROOT} from './paths.mjs';
import { createInterface } from "node:readline";
import { finished } from "node:stream/promises";
import { createGunzip, gunzipSync } from "node:zlib";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import RBush from "rbush";
import { geometryBounds } from "./census-geography.mjs";
import { validateChildcareGeographicEvidence } from "./childcare-geographic-evidence.mjs";
import { validateTnChildcareGeographicEvidence, validateFreshTnChildcareGeographicEvidence } from "./tn-childcare-geographic-evidence.mjs";

export const COVERAGE_VIEWS_SCHEMA_VERSION = "1.0.0";
export const COVERAGE_VIEWS_TRANSFORMATION_VERSION = "national-business-coverage-views@2.8.0";
export const TN_COVERAGE_VIEWS_TRANSFORMATION_VERSION = "national-business-coverage-views@2.9.0";
export const TN_FRESH_COVERAGE_VIEWS_TRANSFORMATION_VERSION = "national-business-coverage-views@2.10.0";
export const OH_COVERAGE_VIEWS_TRANSFORMATION_VERSION = "national-business-coverage-views@2.11.0";
const OH_SOURCE = "oh-dcy-publisher-open-childcare-centers", OH_KEY = "oh_childcare_centers";
const ohioCoverage = () => import("./oh-childcare-coverage-evidence.mjs");
const TN_SOURCE = "tn-dhs-active-childcare-centers";
const TN_KEY = "tn_childcare_centers";
function emptyTnReporting() {
  return { records: 0, with_zip: 0, without_zip: 0, missing_zip_reasons: { "missing-source-zip": 0, "invalid-source-zip-placeholder": 0 }, missing_points: 0, zip_inferred: false };
}
function addTnReporting(stats, row) {
  stats.records++;
  if (row.zip_code === null) { stats.without_zip++; stats.missing_zip_reasons[row.evidence.zip_unavailable_reason]++; }
  else stats.with_zip++;
  if (row.location.latitude === null && row.location.longitude === null) stats.missing_points++;
}
function sumTnReporting(rows) {
  const total = emptyTnReporting();
  for (const row of rows) {
    for (const key of ["records", "with_zip", "without_zip", "missing_points"]) total[key] += row[key];
    for (const key of Object.keys(total.missing_zip_reasons)) total.missing_zip_reasons[key] += row.missing_zip_reasons[key];
  }
  return total;
}
function checkTnReporting(value) {
  const empty = emptyTnReporting();
  if (!value || !isDeepStrictEqual(Object.keys(value).sort(), Object.keys(empty).sort())
    || ![value.records, value.with_zip, value.without_zip, value.missing_points].every(n => Number.isSafeInteger(n) && n >= 0)
    || value.with_zip + value.without_zip !== value.records || value.missing_points > value.records || value.zip_inferred !== false
    || !value.missing_zip_reasons || !isDeepStrictEqual(Object.keys(value.missing_zip_reasons).sort(), Object.keys(empty.missing_zip_reasons).sort())
    || !Object.values(value.missing_zip_reasons).every(n => Number.isSafeInteger(n) && n >= 0)
    || Object.values(value.missing_zip_reasons).reduce((sum, n) => sum + n, 0) !== value.without_zip) throw new Error("TN reporting ZIP accounting is invalid.");
  return value;
}

const SOURCE_KEY_TO_PROFILE_SOURCE_ID = Object.freeze({
  usda_snap_retailers: "usda-snap-current-retailers",
  cms_nppes_organizations: "cms-nppes-monthly-v2",
  fdic_bankfind: "fdic-bankfind-current-structure",
  ncua_quarterly_credit_unions: "ncua-final-quarterly-call-report",
  fsis_active_mpi_establishments: "usda-fsis-active-mpi-directory",
  epa_echo_active_facilities: "epa-echo-exporter-active-facility",
  fmcsa_active_us_company_census: "fmcsa-company-census-active-us-principal-office",
  la_active_business_location_accounts: "los-angeles-office-of-finance-active-businesses",
  tx_active_sales_tax_permit_outlets: "texas-comptroller-active-sales-tax-permits",
  ak_active_business_licenses: "alaska-dcced-active-business-licenses",
  chicago_active_business_license_sites: "city-of-chicago-bacp-current-active-business-licenses",
  dc_basic_business_license_sites: "dc-dlcp-active-basic-business-licenses",
  california_abc_active_issued_license_sites: "california-abc-daily-active-licenses",
  ny_retail_food_store_license_sites: "new-york-agriculture-markets-retail-food-stores",
  nyc_dcwp_active_license_sites: "nyc-dcwp-issued-licenses-active-premises",
  irs_eo_bmf_organizations: "irs-eo-bmf-organizations",
  il_business_registry_active_organizations: null,
  wa_lni_active_contractor_organizations: null,
  ma_childcare_centers: "ma-licensed-center-based-childcare",
  nj_childcare_centers: "nj-licensed-childcare-centers",
  tn_childcare_centers: TN_SOURCE,
  oh_childcare_centers: OH_SOURCE,
});

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function versionAtLeast(version, minimum) {
  const actual = String(version ?? "").split(".").map(Number);
  const required = String(minimum).split(".").map(Number);
  if (actual.length !== 3 || required.length !== 3 || [...actual, ...required].some((part) => !Number.isInteger(part) || part < 0)) return false;
  for (let index = 0; index < 3; index += 1) {
    if (actual[index] !== required[index]) return actual[index] > required[index];
  }
  return true;
}

function releaseTimestamp(instant) {
  return instant.replaceAll(/[-:.]/g, "").replace("T", "-").replace("Z", "Z");
}

function json(value) {
  return `${JSON.stringify(value)}\n`;
}

function increment(object, key, amount = 1) {
  object[key] = (object[key] ?? 0) + amount;
}

function sortedObject(object) {
  return Object.fromEntries(Object.entries(object).sort(([left], [right]) => left.localeCompare(right)));
}

function updateObservationRange(stats, observedAt) {
  if (!observedAt) return;
  if (!stats.earliest_observed_at || observedAt < stats.earliest_observed_at) stats.earliest_observed_at = observedAt;
  if (!stats.latest_observed_at || observedAt > stats.latest_observed_at) stats.latest_observed_at = observedAt;
}

function emptyProfileStats() {
  return {
    profile_count: 0,
    matching_profile_count: 0,
    reporting_only_count: 0,
    reporting_only_coordinate_assigned_count: 0,
    reported_state_assigned_count: 0,
    reported_state_missing_or_unsupported_count: 0,
    coordinate_present_valid_count: 0,
    coordinate_missing_count: 0,
    coordinate_invalid_count: 0,
    coordinate_assigned_single_count: 0,
    coordinate_unmatched_count: 0,
    coordinate_ambiguous_boundary_count: 0,
    reported_coordinate_state_conflict_count: 0,
    source_counts: {},
    earliest_observed_at: null,
    latest_observed_at: null,
  };
}

function updateProfileStats(stats, sourceId, observedAt, reportingOnly = false) {
  stats.profile_count += 1;
  stats[reportingOnly ? "reporting_only_count" : "matching_profile_count"] += 1;
  increment(stats.source_counts, sourceId);
  updateObservationRange(stats, observedAt);
}

async function renameWithRetry(sourcePath, destinationPath, attempts = 7) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await rename(sourcePath, destinationPath);
      return;
    } catch (error) {
      lastError = error;
      if (!["EACCES", "EBUSY", "EPERM"].includes(error.code) || attempt === attempts - 1) break;
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

async function writeJsonLinesArtifact(releaseDirectory, relativePath, records, metadata = {}) {
  const absolutePath = path.join(releaseDirectory, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  const temporaryPath = `${absolutePath}.tmp-${randomUUID()}`;
  const output = createWriteStream(temporaryPath, { encoding: "utf8" });
  const hash = createHash("sha256");
  let bytes = 0;
  try {
    for (const record of records) {
      const line = `${JSON.stringify(record)}\n`;
      hash.update(line);
      bytes += Buffer.byteLength(line);
      if (!output.write(line)) await once(output, "drain");
    }
    output.end();
    await finished(output);
    await renameWithRetry(temporaryPath, absolutePath);
  } catch (error) {
    output.destroy();
    throw error;
  }
  return {
    path: relativePath.replaceAll("\\", "/"),
    bytes,
    sha256: hash.digest("hex"),
    ...metadata,
  };
}

async function resolveDataset(inputPath, expectedDatasetId) {
  const absoluteInputPath = path.resolve(inputPath);
  const input = JSON.parse(await readFile(absoluteInputPath, "utf8"));
  const manifestPath = input.manifest
    ? path.resolve(path.dirname(absoluteInputPath), input.manifest)
    : absoluteInputPath;
  const manifestBuffer = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBuffer.toString("utf8"));
  if (manifest.dataset_id !== expectedDatasetId) {
    throw new Error(`Expected ${expectedDatasetId}, received ${manifest.dataset_id ?? "missing dataset_id"}.`);
  }
  return {
    manifest,
    manifestPath,
    manifestSha256: sha256(manifestBuffer),
    manifestBuffer,
    releaseDirectory: path.dirname(manifestPath),
  };
}

function artifactByType(dataset, artifactType) {
  const matches = (dataset.manifest.artifacts ?? []).filter((artifact) => artifact.artifact_type === artifactType);
  if (matches.length !== 1) throw new Error(`${dataset.manifest.dataset_id} must have exactly one ${artifactType} artifact.`);
  return matches[0];
}

function artifactPath(dataset, artifact) {
  const absolutePath = path.resolve(dataset.releaseDirectory, artifact.path);
  const relative = path.relative(dataset.releaseDirectory, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`Artifact path escapes release: ${artifact.path}`);
  return absolutePath;
}

async function readJsonLines(filePath) {
  const content = await readFile(filePath, "utf8");
  return content.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

async function* streamGzipJsonLines(filePath) {
  const input = createReadStream(filePath).pipe(createGunzip());
  const lines = createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    if (line) yield JSON.parse(line);
  }
}

function visitCoordinates(coordinates, visitor) {
  if (!Array.isArray(coordinates)) return coordinates;
  if (coordinates.length >= 2 && typeof coordinates[0] === "number" && typeof coordinates[1] === "number") {
    return visitor(coordinates);
  }
  return coordinates.map((child) => visitCoordinates(child, visitor));
}

function shiftAntimeridianGeometry(geometry) {
  return {
    ...geometry,
    coordinates: visitCoordinates(geometry.coordinates, ([longitude, latitude, ...rest]) => [
      longitude < 0 ? longitude + 360 : longitude,
      latitude,
      ...rest,
    ]),
  };
}

function createCountySpatialIndex(countyFeatures, countyIndexRecords) {
  const metadataByGeoid = new Map(countyIndexRecords.map((record) => [record.geoid, record]));
  const index = new RBush();
  const entries = [];
  for (const feature of countyFeatures) {
    const geoid = String(feature.properties?.GEOID ?? "");
    const metadata = metadataByGeoid.get(geoid);
    if (!metadata) throw new Error(`County geometry ${geoid || "<missing>"} has no normalized index record.`);
    const originalBounds = geometryBounds(feature.geometry);
    const wrapped = originalBounds[2] - originalBounds[0] > 180;
    const geometry = wrapped ? shiftAntimeridianGeometry(feature.geometry) : feature.geometry;
    const bbox = geometryBounds(geometry);
    entries.push({
      minX: bbox[0],
      minY: bbox[1],
      maxX: bbox[2],
      maxY: bbox[3],
      geoid,
      stateFips: metadata.state_fips,
      wrapped,
      feature: { type: "Feature", properties: { GEOID: geoid }, geometry },
    });
  }
  index.load(entries);
  return index;
}

export function assignPointToCounty(coordinates, countySpatialIndex) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return { status: "invalid-coordinate", county: null };
  const longitude = Number(coordinates[0]);
  const latitude = Number(coordinates[1]);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
    return { status: "invalid-coordinate", county: null };
  }
  const candidateMap = new Map();
  for (const queryLongitude of new Set([longitude, longitude < 0 ? longitude + 360 : longitude])) {
    for (const candidate of countySpatialIndex.search({
      minX: queryLongitude,
      minY: latitude,
      maxX: queryLongitude,
      maxY: latitude,
    })) candidateMap.set(candidate.geoid, candidate);
  }
  const matches = [];
  for (const candidate of candidateMap.values()) {
    const candidateLongitude = candidate.wrapped && longitude < 0 ? longitude + 360 : longitude;
    if (booleanPointInPolygon([candidateLongitude, latitude], candidate.feature, { ignoreBoundary: false })) matches.push(candidate);
  }
  matches.sort((left, right) => left.geoid.localeCompare(right.geoid));
  if (matches.length === 0) return { status: "coordinate-not-in-county-polygon", county: null };
  if (matches.length > 1) return { status: "ambiguous-county-boundary", county: null, candidate_geoids: matches.map((match) => match.geoid) };
  return { status: "assigned-single-county", county: matches[0] };
}

function profilePointCoordinates(location) {
  if (Array.isArray(location?.coordinates)) return location.coordinates;
  if (location && Object.hasOwn(location, "longitude") && Object.hasOwn(location, "latitude")) {
    return [location.longitude, location.latitude];
  }
  return null;
}

function sourceContributionSummary(zipRows) {
  const summaries = new Map();
  for (const row of zipRows) {
    for (const [sourceKey, contribution] of Object.entries(row.source_contributions ?? {})) {
      if (!summaries.has(sourceKey)) {
        summaries.set(sourceKey, {
          source_key: sourceKey,
          profile_source_id: SOURCE_KEY_TO_PROFILE_SOURCE_ID[sourceKey] ?? null,
          zip_level_counts: {},
          release_metadata: {},
          zip_rows_with_contribution: 0,
        });
      }
      const summary = summaries.get(sourceKey);
      let contributed = false;
      for (const [field, value] of Object.entries(contribution)) {
        if ((field === "record_count" || field.endsWith("_count")) && Number.isFinite(value)) {
          increment(summary.zip_level_counts, field, value);
          if (value > 0) contributed = true;
        } else if (value !== null && value !== undefined) {
          if (summary.release_metadata[field] !== undefined && summary.release_metadata[field] !== value) {
            throw new Error(`${sourceKey} has inconsistent ${field} across ZIP rows.`);
          }
          summary.release_metadata[field] = value;
        }
      }
      if (contributed) summary.zip_rows_with_contribution += 1;
    }
  }
  return summaries;
}

function createLineage(registry, geography, crosswalk, resolution, benchmark, nonemployer) {
  return {
    registry_release_id: registry.manifest.release_id,
    geography_release_id: geography.manifest.release_id,
    zcta_jurisdiction_crosswalk_release_id: crosswalk.manifest.release_id,
    entity_resolution_release_id: resolution.manifest.release_id,
    entity_resolution_benchmark_release_id: benchmark.manifest.release_id,
    census_nonemployer_release_id: nonemployer.manifest.release_id,
    transformation_version: COVERAGE_VIEWS_TRANSFORMATION_VERSION,
  };
}

function baselineForGeography(row, nonemployer, expectedInScope) {
  if (row) {
    return {
      status: row.status,
      reference_year: row.reference_year,
      observation_period: row.observation_period,
      universe: row.universe,
      nonemployer_establishments: row.nonemployer_establishments,
      receipts_thousands_usd: row.receipts_thousands_usd,
      receipts_flag: row.receipts_flag,
      receipts_noise_range_thousands_usd: row.receipts_noise_range_thousands_usd,
      receipts_noise_range_flag: row.receipts_noise_range_flag,
      source_release_id: nonemployer.manifest.release_id,
      provenance: row.provenance,
      current_named_business_status: false,
    };
  }
  return {
    status: expectedInScope ? "not-published-for-geography" : "outside-source-geography-scope",
    reference_year: nonemployer.manifest.reference_year,
    observation_period: { from: `${nonemployer.manifest.reference_year}-01-01`, to: `${nonemployer.manifest.reference_year}-12-31` },
    universe: "businesses-with-no-paid-employees-subject-to-federal-income-tax-and-meeting-source-receipts-threshold",
    nonemployer_establishments: null,
    receipts_thousands_usd: null,
    receipts_flag: null,
    receipts_noise_range_thousands_usd: null,
    receipts_noise_range_flag: null,
    source_release_id: nonemployer.manifest.release_id,
    provenance: null,
    current_named_business_status: false,
  };
}

function nonemployerBaselineForScope(selectedStates, nonemployer) {
  const published = selectedStates.filter((state) => state.nonemployer_baseline.status === "published-annual-aggregate");
  const missing = selectedStates.filter((state) => state.nonemployer_baseline.status !== "published-annual-aggregate");
  return {
    status: missing.length === 0 ? "published-complete-for-selected-state-scope" : "published-partial-for-selected-state-scope",
    reference_year: nonemployer.manifest.reference_year,
    source_release_id: nonemployer.manifest.release_id,
    source_geography_scope: nonemployer.manifest.geography_scope,
    selected_state_equivalent_count: selectedStates.length,
    published_state_equivalent_count: published.length,
    missing_state_equivalent_count: missing.length,
    missing_state_fips: missing.map((state) => state.state_fips),
    published_nonemployer_establishments: published.reduce(
      (sum, state) => sum + (state.nonemployer_baseline.nonemployer_establishments ?? 0),
      0,
    ),
    universe: "businesses-with-no-paid-employees-subject-to-federal-income-tax-and-meeting-source-receipts-threshold",
    current_named_business_status: false,
  };
}

function zctaCoverageForSet(zctaSet, zipByCode, zctaSummaryByCode) {
  let withContribution = 0;
  let denominatorOnly = 0;
  let missingFromRegistryUnion = 0;
  let overlayDiagnostic = 0;
  for (const zcta of zctaSet) {
    const zip = zipByCode.get(zcta);
    if (!zip) missingFromRegistryUnion += 1;
    else if (zip.registry_coverage?.status === "record-level-source-contribution") withContribution += 1;
    else denominatorOnly += 1;
    if (zctaSummaryByCode.get(zcta)?.overlay_status !== "complete-within-tolerance") overlayDiagnostic += 1;
  }
  return {
    zcta_denominator_count: zctaSet.size,
    zctas_with_record_level_source_contribution: withContribution,
    zctas_denominator_only_no_record_level_contribution: denominatorOnly,
    zctas_missing_from_registry_union: missingFromRegistryUnion,
    zctas_with_overlay_diagnostics: overlayDiagnostic,
    denominator_semantics: "materially-intersecting-2020-census-zcta-polygons",
  };
}

function hasZctaGeography(row) {
  return /^\d{5}$/.test(row.geography?.geoid ?? "")
    && row.geography?.geo_id === `zcta:${row.geography.geoid}`;
}

function hasPublishedEmployerBaseline(row) {
  return row.employer_baseline?.status === "published"
    && Number.isFinite(row.employer_baseline.establishments);
}

function buildGapRecords({ zipViews, zctaSummaries, stateViews, countyViews, profileSummary, registry, resolution, benchmark, nonemployer, lineage }) {
  const gaps = [];
  const add = (gap) => gaps.push({
    schema_version: COVERAGE_VIEWS_SCHEMA_VERSION,
    view_type: "coverage-gap",
    status: "open",
    lineage,
    ...gap,
  });
  add({
    gap_id: "gap:complete-business-universe",
    gap_type: "incomplete-business-universe",
    scope_type: "national",
    scope_id: "registry-union",
    severity: "fundamental",
    evidence: { complete_national_business_registry: registry.manifest.complete_national_business_registry },
    consequence: "The registry and every derived view are partial governed source evidence, not a census of all active U.S. businesses.",
  });
  add({
    gap_id: "gap:address-derived-zip-county-crosswalk",
    gap_type: "address-derived-zip-county-crosswalk-unavailable",
    scope_type: "national",
    scope_id: "registry-union",
    severity: "county-allocation-blocking",
    evidence: { current_method: "Census polygon topology and coordinate-assigned profile subset" },
    consequence: "ZIP totals are not allocated to counties using polygon-area weights; county profile counts cover coordinate-bearing profiles only.",
  });
  add({
    gap_id: "gap:organization-or-brand-jurisdiction-allocation",
    gap_type: "organization-or-brand-records-not-allocated-to-state-or-county-views",
    scope_type: "national",
    scope_id: "registry-union",
    severity: "jurisdiction-coverage",
    evidence: {
      irs_eo_organization_records: registry.manifest.coverage?.irs_eo_organization_records ?? null,
      ct_business_registry_active_organization_records: registry.manifest.coverage?.ct_business_registry_active_organization_records ?? null,
      ct_business_registry_eligible_reported_us_business_addresses: registry.manifest.coverage?.ct_business_registry_eligible_reported_us_business_addresses ?? null,
      de_business_license_current_organization_records: registry.manifest.coverage?.de_business_license_current_organization_records ?? null,
      de_business_license_eligible_reported_us_business_addresses: registry.manifest.coverage?.de_business_license_eligible_reported_us_business_addresses ?? null,
      ak_active_business_license_organizations: registry.manifest.coverage?.ak_active_business_license_organizations ?? null,
      ak_active_business_license_provisional_physical_sites: registry.manifest.coverage?.ak_active_business_license_provisional_physical_sites ?? null,
      ak_active_business_license_organizations_without_eligible_physical_site: registry.manifest.coverage?.ak_active_business_license_organizations_without_eligible_physical_site ?? null,
      co_business_registry_good_standing_or_delinquent_organization_records: registry.manifest.coverage?.co_business_registry_good_standing_or_delinquent_organization_records ?? null,
      co_business_registry_quarantined_source_records: registry.manifest.coverage?.co_business_registry_quarantined_source_records ?? null,
      co_business_registry_eligible_reported_us_business_addresses: registry.manifest.coverage?.co_business_registry_eligible_reported_us_business_addresses ?? null,
      or_business_registry_active_registration_records: registry.manifest.coverage?.or_business_registry_active_registration_records ?? null,
      or_business_registry_legal_entity_registrations: registry.manifest.coverage?.or_business_registry_legal_entity_registrations ?? null,
      or_business_registry_assumed_business_name_registrations: registry.manifest.coverage?.or_business_registry_assumed_business_name_registrations ?? null,
      or_business_registry_eligible_registration_zip_contributions: registry.manifest.coverage?.or_business_registry_eligible_registration_zip_contributions ?? null,
      ia_business_registry_active_organization_records: registry.manifest.coverage?.ia_business_registry_active_organization_records ?? null,
      ia_business_registry_entities_with_eligible_us_home_office_address: registry.manifest.coverage?.ia_business_registry_entities_with_eligible_us_home_office_address ?? null,
      ia_business_registry_eligible_entity_zip_contributions: registry.manifest.coverage?.ia_business_registry_eligible_entity_zip_contributions ?? null,
      ny_business_registry_active_organization_records: registry.manifest.coverage?.ny_business_registry_active_organization_records ?? null,
      ny_business_registry_eligible_reported_us_location_addresses: registry.manifest.coverage?.ny_business_registry_eligible_reported_us_location_addresses ?? null,
      fl_business_registry_active_organization_records: registry.manifest.coverage?.fl_business_registry_active_organization_records ?? null,
      fl_business_registry_eligible_reported_us_principal_addresses: registry.manifest.coverage?.fl_business_registry_eligible_reported_us_principal_addresses ?? null,
      pa_business_registry_active_organization_records: registry.manifest.coverage?.pa_business_registry_active_organization_records ?? null,
      pa_business_registry_eligible_reported_us_business_addresses: registry.manifest.coverage?.pa_business_registry_eligible_reported_us_business_addresses ?? null,
      il_business_registry_active_organization_records: registry.manifest.coverage?.il_business_registry_active_organization_records ?? null,
      il_business_registry_eligible_llc_records_office_addresses: registry.manifest.coverage?.il_business_registry_eligible_llc_records_office_addresses ?? null,
      wa_lni_active_contractor_organizations: registry.manifest.coverage?.wa_lni_active_contractor_organizations ?? null,
      wa_lni_active_contractor_eligible_reported_us_mailing_addresses: registry.manifest.coverage?.wa_lni_active_contractor_eligible_reported_us_mailing_addresses ?? null,
      ny_retail_food_store_organizations: registry.manifest.coverage?.ny_retail_food_store_organizations ?? null,
      ny_retail_food_store_provisional_physical_sites: registry.manifest.coverage?.ny_retail_food_store_provisional_physical_sites ?? null,
      ny_retail_food_store_organizations_without_complete_physical_site: Math.max(
        0,
        (registry.manifest.coverage?.ny_retail_food_store_organizations ?? 0)
          - (registry.manifest.coverage?.ny_retail_food_store_provisional_physical_sites ?? 0),
      ),
      state_and_county_view_basis: "physical-site location profiles",
    },
    consequence: "Organization-or-brand evidence such as IRS EO filing addresses; Connecticut, Delaware, Colorado, Oregon, Iowa, New York corporate, Florida, Pennsylvania, or Illinois registry-reported addresses; Washington L&I contractor mailing addresses; and New York retail-food licenses without a complete site address remains visible in national, ZIP, and source views but is not mixed into physical-site state or county counts.",
  });
  add({
    gap_id: "gap:entity-resolution-precision-approval",
    gap_type: "entity-resolution-not-approved-for-aggregate-application",
    scope_type: "national",
    scope_id: "registry-union",
    severity: "deduplication-blocking",
    evidence: {
      resolution_status: resolution.manifest.status,
      benchmark_status: benchmark.manifest.status,
      submitted_labels: benchmark.manifest.coverage?.submitted_labels ?? 0,
      benchmark_gate_passed: benchmark.manifest.coverage?.benchmark_gate_passed ?? false,
    },
    consequence: "All site and establishment counts remain source-preserving provisional counts; resolution aliases are not applied.",
  });
  add({
    gap_id: "gap:nonemployer-zip-allocation",
    gap_type: "nonemployer-baseline-unavailable-at-zip",
    scope_type: "national",
    scope_id: "registry-union",
    severity: "baseline-geography",
    evidence: {
      source_release_id: nonemployer.manifest.release_id,
      reference_year: nonemployer.manifest.reference_year,
      smallest_published_geography: "county",
    },
    consequence: "Census Nonemployer Statistics publishes no ZIP-level counts; national, state, and county totals are never allocated to ZIPs or ZCTAs.",
  });
  for (const state of stateViews.filter((row) => row.nonemployer_baseline.status !== "published-annual-aggregate")) add({
    gap_id: `gap:state-no-nonemployer-baseline:${state.state_fips}`,
    gap_type: "state-equivalent-without-census-nonemployer-baseline",
    scope_type: "state",
    scope_id: state.state_fips,
    severity: "baseline-geography",
    evidence: {
      state_name: state.state_name,
      baseline_status: state.nonemployer_baseline.status,
      source_geography_scope: nonemployer.manifest.geography_scope,
    },
    consequence: "The state-equivalent view remains visible with a null Nonemployer baseline because it is outside or absent from the source geography scope.",
  });
  for (const county of countyViews.filter((row) => row.nonemployer_baseline.status !== "published-annual-aggregate")) add({
    gap_id: `gap:county-no-nonemployer-baseline:${county.county_geoid}`,
    gap_type: "county-equivalent-without-census-nonemployer-baseline",
    scope_type: "county",
    scope_id: county.county_geoid,
    severity: "baseline-geography",
    evidence: {
      county_name: county.county_name,
      state_fips: county.state_fips,
      baseline_status: county.nonemployer_baseline.status,
      source_geography_scope: nonemployer.manifest.geography_scope,
    },
    consequence: "The county-equivalent view remains visible with a null Nonemployer baseline because it is outside or absent from the source geography scope.",
  });
  if (nonemployer.manifest.coverage.nonemployer_establishments_not_allocated_to_county > 0) add({
    gap_id: "gap:nonemployer-not-allocated-to-county",
    gap_type: "nonemployer-establishments-not-allocated-to-county",
    scope_type: "national",
    scope_id: "50-states-and-dc",
    severity: "source-reconciliation",
    evidence: {
      national_nonemployer_establishments: nonemployer.manifest.coverage.national_nonemployer_establishments,
      county_nonemployer_establishments: nonemployer.manifest.coverage.county_nonemployer_establishments,
      difference: nonemployer.manifest.coverage.nonemployer_establishments_not_allocated_to_county,
    },
    consequence: "The source national total exceeds the sum of published county totals; the difference remains unallocated rather than being forced into a county.",
  });
  (registry.manifest.limitations ?? []).forEach((limitation, index) => add({
    gap_id: `gap:registry-limitation:${String(index + 1).padStart(3, "0")}`,
    gap_type: "registry-source-or-semantics-limitation",
    scope_type: "national",
    scope_id: "registry-union",
    severity: "declared-limitation",
    evidence: { registry_limitation_index: index + 1 },
    consequence: limitation,
  }));
  for (const source of profileSummary.source_stats) {
    if (source.coordinate_missing_count > 0 || source.coordinate_invalid_count > 0) add({
      gap_id: `gap:profile-coordinate-coverage:${source.source_id}`,
      gap_type: "profile-coordinate-coverage-incomplete",
      scope_type: "source",
      scope_id: source.source_id,
      severity: "county-coverage",
      evidence: {
        profile_count: source.profile_count,
        matching_profile_count: source.matching_profile_count,
        reporting_only_count: source.reporting_only_count,
        reporting_only_identity_matching_eligible: false,
        coordinate_missing_count: source.coordinate_missing_count,
        coordinate_invalid_count: source.coordinate_invalid_count,
      },
      consequence: "Profiles without valid points are excluded from coordinate-assigned county counts.",
    });
  }
  if (profileSummary.coordinate_unmatched_count > 0) add({
    gap_id: "gap:coordinate-not-in-county-polygon",
    gap_type: "coordinate-not-in-county-polygon",
    scope_type: "national",
    scope_id: "registry-union",
    severity: "county-coverage",
    evidence: { profile_count: profileSummary.coordinate_unmatched_count },
    consequence: "These coordinate-bearing profiles are not assigned to a county view.",
  });
  if (profileSummary.coordinate_ambiguous_boundary_count > 0) add({
    gap_id: "gap:coordinate-ambiguous-county-boundary",
    gap_type: "coordinate-ambiguous-county-boundary",
    scope_type: "national",
    scope_id: "registry-union",
    severity: "county-coverage",
    evidence: { profile_count: profileSummary.coordinate_ambiguous_boundary_count },
    consequence: "Boundary points matching multiple county polygons are retained as ambiguous and not forced into one county.",
  });
  if (profileSummary.reported_coordinate_state_conflict_count > 0) add({
    gap_id: "gap:reported-coordinate-state-conflict",
    gap_type: "reported-address-state-conflicts-with-coordinate-county-state",
    scope_type: "national",
    scope_id: "registry-union",
    severity: "jurisdiction-conflict",
    evidence: { profile_count: profileSummary.reported_coordinate_state_conflict_count },
    consequence: "Both reported-state and coordinate-derived evidence remain separate; neither silently overwrites the other.",
  });
  for (const zip of zipViews) {
    if (zip.registry_coverage.status !== "record-level-source-contribution") add({
      gap_id: `gap:zip-no-record-contribution:${zip.zip_code}`,
      gap_type: "zip-denominator-only-no-record-level-contribution",
      scope_type: "zip",
      scope_id: zip.zip_code,
      severity: "source-coverage",
      evidence: { registry_coverage_status: zip.registry_coverage.status },
      consequence: "No integrated record-level source contributed evidence in this ZIP; this is not evidence that no business exists.",
    });
    if (!hasZctaGeography(zip)) add({
      gap_id: `gap:reported-zip5-outside-zcta:${zip.zip_code}`,
      gap_type: "reported-zip5-not-in-census-zcta5-polygon-denominator",
      scope_type: "zip",
      scope_id: zip.zip_code,
      severity: "outside-spatial-denominator",
      evidence: {
        geography_status: zip.geography.status,
        baseline_coverage_status: zip.baseline_coverage_status,
        spatial_zip_polygon_membership: zip.spatial_zip_polygon_membership,
      },
      consequence: "The reported five-digit postal value is retained as source evidence but is outside the selected Census ZCTA5 polygon denominator and cannot participate in polygon topology.",
    });
    if (!hasPublishedEmployerBaseline(zip)) add({
      gap_id: `gap:zip-no-employer-baseline:${zip.zip_code}`,
      gap_type: "zip-without-census-zbp-employer-baseline",
      scope_type: "zip",
      scope_id: zip.zip_code,
      severity: "baseline",
      evidence: { baseline_coverage_status: zip.baseline_coverage_status },
      consequence: "No Census ZBP employer-establishment baseline is available for this registry ZIP row.",
    });
  }
  for (const summary of zctaSummaries.filter((row) => row.overlay_status !== "complete-within-tolerance")) add({
    gap_id: `gap:zcta-overlay:${summary.zcta}`,
    gap_type: "zcta-county-overlay-outside-complete-tolerance",
    scope_type: "zcta",
    scope_id: summary.zcta,
    severity: "geography-overlay",
    evidence: { overlay_status: summary.overlay_status, raw_matched_area_ratio: summary.raw_matched_area_ratio },
    consequence: "The topology remains published, but the raw county-intersection area does not fall within the documented complete tolerance.",
  });
  for (const county of countyViews.filter((row) => row.zcta_coverage.topological_intersecting_zcta_count === 0)) add({
    gap_id: `gap:county-no-zcta:${county.county_geoid}`,
    gap_type: "county-equivalent-without-zcta-intersection",
    scope_type: "county",
    scope_id: county.county_geoid,
    severity: "geography",
    evidence: { county_name: county.county_name, state_fips: county.state_fips },
    consequence: "The county equivalent remains visible but has no 2020 ZCTA relationship.",
  });
  gaps.sort((left, right) => left.gap_id.localeCompare(right.gap_id));
  return gaps;
}

export async function buildNationalBusinessCoverageViews({
  registryPointerPath,
  geographyPointerPath,
  crosswalkPointerPath,
  resolutionPointerPath,
  benchmarkPointerPath,
  nonemployerPointerPath,
  outputRoot,
  now = () => new Date(),
  logger = console.log,
} = {}) {
  for (const [name, value] of Object.entries({ registryPointerPath, geographyPointerPath, crosswalkPointerPath, resolutionPointerPath, benchmarkPointerPath, nonemployerPointerPath, outputRoot })) {
    if (!value) throw new Error(`${name} is required.`);
  }
  const [registry, geography, crosswalk, resolution, benchmark, nonemployer] = await Promise.all([
    resolveDataset(registryPointerPath, "national-business-registry"),
    resolveDataset(geographyPointerPath, "us-census-geography"),
    resolveDataset(crosswalkPointerPath, "us-census-zcta-jurisdiction-crosswalk"),
    resolveDataset(resolutionPointerPath, "national-business-entity-resolution"),
    resolveDataset(benchmarkPointerPath, "national-business-entity-resolution-benchmark"),
    resolveDataset(nonemployerPointerPath, "census-nonemployer-baseline"),
  ]);
  const ohSupported = registry.manifest.publisher?.version === "2.15.0";
  const retainedChildcareApi = await import('./retained-childcare-registry-input.mjs');
  const retainedChildcare = await retainedChildcareApi.verifyRetainedChildcareRegistryExtension(registry.manifest, registry.releaseDirectory);
  const mnCredentialApi = await import('./mn-credential-registry-input.mjs');
  const mnCredentials = await mnCredentialApi.verifyMnCredentialRegistryExtension(registry.manifest, registry.releaseDirectory);
  if (ohSupported && !registry.manifest.oh_childcare_source) throw new Error("Unreviewed registry publisher version for coverage: Ohio app source required.");
  const ohApi = ohSupported ? await ohioCoverage() : null;
  const ohContext = ohSupported ? await ohApi.loadOhioCoverageContext(registry.manifest) : null;
  const ohTotal = ohContext?.total;
  const tnFresh = registry.manifest.publisher?.version === "2.14.0" || (ohSupported && registry.manifest.tn_childcare_origin === "fresh");
  const tnSupported = registry.manifest.publisher?.version === "2.13.0" || tnFresh || (ohSupported && registry.manifest.tn_childcare_origin === "recovered");
  if (versionAtLeast(registry.manifest.publisher?.version, "2.13.0") && !tnSupported && !ohSupported) throw new Error("Unreviewed registry publisher version for coverage.");
  const tnDependencies = registry.manifest.dependencies?.filter(row => row.dataset_id === TN_SOURCE) ?? [];
  const tnDependency = tnDependencies[0];
  if (tnDependencies.length !== Number(tnSupported)) throw new Error("TN reporting requires exact registry 2.13 and retained source dependency.");
  const transformationVersion = ohSupported ? OH_COVERAGE_VIEWS_TRANSFORMATION_VERSION : tnFresh ? TN_FRESH_COVERAGE_VIEWS_TRANSFORMATION_VERSION : tnSupported ? TN_COVERAGE_VIEWS_TRANSFORMATION_VERSION : COVERAGE_VIEWS_TRANSFORMATION_VERSION;
  const tnTotal = emptyTnReporting(), tnStates = new Map(), tnCounties = new Map();
  let tnCoordinateAssigned = 0;
  if (!geography.manifest.complete_national_release || !crosswalk.manifest.complete_national_release) {
    throw new Error("Complete national geography and ZCTA crosswalk releases are required.");
  }
  if (crosswalk.manifest.upstream?.release_id !== geography.manifest.release_id) {
    throw new Error("Crosswalk and geography release IDs do not match.");
  }
  if (resolution.manifest.dependency?.release_id !== registry.manifest.release_id) {
    throw new Error("Entity resolution does not depend on the selected registry release.");
  }
  if (benchmark.manifest.dependencies?.resolution?.release_id !== resolution.manifest.release_id
      || benchmark.manifest.dependencies?.registry?.release_id !== registry.manifest.release_id) {
    throw new Error("Benchmark dependencies do not match the selected resolution and registry releases.");
  }
  if (nonemployer.manifest.status !== "published-annual-aggregate" || nonemployer.manifest.complete_source_release !== true) {
    throw new Error("A complete published Census Nonemployer baseline is required.");
  }

  const nonemployerTotalsArtifact = artifactByType(nonemployer, "nonemployer-geography-totals-jsonl");
  const nonemployerTotals = await readJsonLines(artifactPath(nonemployer, nonemployerTotalsArtifact));
  const nonemployerNationalTotals = nonemployerTotals.filter((row) => row.geography_type === "national");
  if (nonemployerNationalTotals.length !== 1) throw new Error("Census Nonemployer baseline must contain one national total.");
  const nonemployerNationalTotal = nonemployerNationalTotals[0];
  const nonemployerStateByFips = new Map(nonemployerTotals.filter((row) => row.geography_type === "state").map((row) => [row.geoid, row]));
  const nonemployerCountyByGeoid = new Map(nonemployerTotals.filter((row) => row.geography_type === "county").map((row) => [row.geoid, row]));
  if (nonemployerStateByFips.size !== nonemployer.manifest.coverage.state_totals
      || nonemployerCountyByGeoid.size !== nonemployer.manifest.coverage.county_totals) {
    throw new Error("Census Nonemployer geography totals do not reconcile to its manifest.");
  }

  const stateIndexArtifact = (geography.manifest.artifacts ?? []).find((artifact) => artifact.path === "derived/index/states.jsonl");
  const countyIndexArtifact = (geography.manifest.artifacts ?? []).find((artifact) => artifact.path === "derived/index/counties.jsonl");
  const zctaIndexArtifact = (geography.manifest.artifacts ?? []).find((artifact) => artifact.path === "derived/index/zctas.jsonl");
  if (!stateIndexArtifact || !countyIndexArtifact || !zctaIndexArtifact) {
    throw new Error("Geography normalized state, county, and ZCTA indexes are required.");
  }
  const [stateIndexRecords, countyIndexRecords, zctaIndexRecords] = await Promise.all([
    readJsonLines(artifactPath(geography, stateIndexArtifact)),
    readJsonLines(artifactPath(geography, countyIndexArtifact)),
    readJsonLines(artifactPath(geography, zctaIndexArtifact)),
  ]);
  const zctaIndexByCode = new Map(zctaIndexRecords.map((record) => [record.zcta, record]));
  if (zctaIndexByCode.size !== zctaIndexRecords.length
      || zctaIndexRecords.some((record) => record.geo_type !== "zcta" || record.geo_id !== `zcta:${record.zcta}` || !/^\d{5}$/.test(record.zcta))) {
    throw new Error("Census ZCTA index has duplicate or structurally invalid records.");
  }
  if (Number.isInteger(geography.manifest.coverage?.zctas)
      && geography.manifest.coverage.zctas !== zctaIndexRecords.length) {
    throw new Error("Census ZCTA index count does not match the geography manifest.");
  }
  const zctaSource = (geography.manifest.sources ?? []).find((source) => Number.isInteger(source.layers?.zctas));
  const zctaMemberSetSha256 = sha256(`${[...zctaIndexByCode.keys()].sort().join("\n")}\n`);
  const spatialZipPolygonDenominator = {
    count: zctaIndexRecords.length,
    geography_type: "census-zcta5",
    evidence_scope: "complete-selected-census-zcta5-polygon-release",
    dataset_id: geography.manifest.dataset_id,
    release_id: geography.manifest.release_id,
    geography_manifest_sha256: geography.manifestSha256,
    zcta_index_artifact_path: zctaIndexArtifact.path,
    zcta_index_artifact_sha256: zctaIndexArtifact.sha256,
    zcta_member_set_sha256: zctaMemberSetSha256,
    source_id: zctaSource?.source_id ?? "us-census-tigerweb-zcta",
    source_vintage: zctaSource?.source_vintage ?? "selected Census ZCTA vintage",
    match_key: "exact-five-digit-zcta-code",
    zip4_polygon_applicability: "not-applicable",
  };
  const countyGeometryArtifacts = (geography.manifest.artifacts ?? [])
    .filter((artifact) => artifact.geography_type === "county" && artifact.path.startsWith("source/"));
  const countyFeatures = (await Promise.all(countyGeometryArtifacts.map(async (artifact) => {
    const collection = JSON.parse(await readFile(artifactPath(geography, artifact), "utf8"));
    return collection.features ?? [];
  }))).flat();
  const countySpatialIndex = createCountySpatialIndex(countyFeatures, countyIndexRecords);

  const relationshipArtifact = artifactByType(crosswalk, "zcta-county-area-weights");
  const zctaSummaryArtifact = artifactByType(crosswalk, "zcta-overlay-summary");
  const [crosswalkRelationships, zctaSummaries] = await Promise.all([
    readJsonLines(artifactPath(crosswalk, relationshipArtifact)),
    readJsonLines(artifactPath(crosswalk, zctaSummaryArtifact)),
  ]);
  const zctaSummaryByCode = new Map(zctaSummaries.map((row) => [row.zcta, row]));
  if (zctaSummaryByCode.size !== zctaIndexByCode.size
      || [...zctaIndexByCode.keys()].some((zcta) => !zctaSummaryByCode.has(zcta))) {
    throw new Error("ZCTA crosswalk summaries do not cover the complete selected Census ZCTA5 polygon denominator.");
  }
  const relationshipsByZcta = Map.groupBy(crosswalkRelationships, (row) => row.zcta);
  const topologicalZctasByState = new Map();
  const materialZctasByState = new Map();
  const topologicalZctasByCounty = new Map();
  const materialZctasByCounty = new Map();
  for (const relationship of crosswalkRelationships) {
    if (!topologicalZctasByState.has(relationship.state_fips)) topologicalZctasByState.set(relationship.state_fips, new Set());
    if (!topologicalZctasByCounty.has(relationship.county_geoid)) topologicalZctasByCounty.set(relationship.county_geoid, new Set());
    topologicalZctasByState.get(relationship.state_fips).add(relationship.zcta);
    topologicalZctasByCounty.get(relationship.county_geoid).add(relationship.zcta);
    if (relationship.material_intersection) {
      if (!materialZctasByState.has(relationship.state_fips)) materialZctasByState.set(relationship.state_fips, new Set());
      if (!materialZctasByCounty.has(relationship.county_geoid)) materialZctasByCounty.set(relationship.county_geoid, new Set());
      materialZctasByState.get(relationship.state_fips).add(relationship.zcta);
      materialZctasByCounty.get(relationship.county_geoid).add(relationship.zcta);
    }
  }

  const zipArtifact = artifactByType(registry, "registry-zip-coverage-jsonl");
  const registryZipRows = await readJsonLines(artifactPath(registry, zipArtifact));
  const zipByCode = new Map(registryZipRows.map((row) => [row.zip_code, row]));
  const sourceContributionSummaries = sourceContributionSummary(registryZipRows);
  const stateByAbbreviation = new Map(stateIndexRecords.map((record) => [record.postal_abbreviation, record]));
  const stateIndexByFips = new Map(stateIndexRecords.map((record) => [record.geoid, record]));
  const stateStats = new Map(stateIndexRecords.map((record) => [record.geoid, {
    ...emptyProfileStats(),
    coordinate_source_counts: {},
  }]));
  const countyStats = new Map(countyIndexRecords.map((record) => [record.geoid, emptyProfileStats()]));
  const sourceStats = new Map();
  const profileSummary = emptyProfileStats();
  const profileArtifacts = (registry.manifest.artifacts ?? [])
    .filter((artifact) => artifact.artifact_type === "entity-resolution-location-profile-jsonl-gzip")
    .sort((left, right) => left.path.localeCompare(right.path));
  if (profileArtifacts.length !== 100) throw new Error(`Expected 100 registry location-profile artifacts, found ${profileArtifacts.length}.`);
  const reportingArtifacts = (registry.manifest.artifacts ?? []).filter((artifact) => artifact.artifact_type === "business-reporting-location-evidence-jsonl-gzip");
  const reportingRows = [], reportingSiteIds = new Set();
  for (const artifact of reportingArtifacts) {
    let verifiedRows;
    if (tnSupported || ohSupported) {
      if (!Number.isSafeInteger(artifact.bytes) || artifact.bytes < 1 || artifact.bytes > 100_000_000) throw new Error("Reporting artifact byte limit.");
      const hash = createHash("sha256"), chunks = []; let bytes = 0;
      for await (const chunk of createReadStream(artifactPath(registry, artifact))) {
        bytes += chunk.length; if (bytes > artifact.bytes) throw new Error("Reporting artifact byte mismatch."); hash.update(chunk); chunks.push(chunk);
      }
      if (bytes !== artifact.bytes || hash.digest("hex") !== artifact.sha256) throw new Error("Reporting artifact checksum mismatch.");
      // Decode only the bytes just verified, never a second mutable path read.
      const decoded = gunzipSync(Buffer.concat(chunks, bytes), { maxOutputLength: 100_000_000 });
      verifiedRows = new TextDecoder("utf-8", { fatal: true }).decode(decoded).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
    }
    let count = 0;
    for await (const row of verifiedRows ?? streamGzipJsonLines(artifactPath(registry, artifact))) {
      if (row.source?.source_id === OH_SOURCE) {
        if (!ohSupported) throw new Error("Ohio reporting requires registry 2.15.");
        ohApi.validateOhChildcareGeographicEvidence(row, ohContext.input.verificationContext);
        if (artifact.path !== `reporting/location-evidence/zip2=${row.zip_code?.slice(0, 2) ?? "unassigned"}/records.jsonl.gz`
          || artifact.export_policy !== "local-review-only") throw new Error("Ohio reporting partition or policy differs.");
      } else if (row.source?.source_id === TN_SOURCE) {
        if (!tnSupported) throw new Error("TN reporting requires registry 2.13.");
        (tnFresh ? validateFreshTnChildcareGeographicEvidence : validateTnChildcareGeographicEvidence)(row);
        const zip2 = row.zip_code?.slice(0, 2) ?? "unassigned";
        if (artifact.path !== `reporting/location-evidence/zip2=${zip2}/records.jsonl.gz` || artifact.export_policy !== "local-review-only"
          || row.evidence.release_id !== tnDependency.release_id || row.evidence.manifest_sha256 !== tnDependency.manifest_sha256) throw new Error("TN reporting partition or dependency differs.");
        addTnReporting(tnTotal, row);
      } else validateChildcareGeographicEvidence(row);
      if (reportingSiteIds.has(row.site_entity_id)) throw new Error("Duplicate reporting-only site evidence.");
      reportingSiteIds.add(row.site_entity_id); reportingRows.push(row); count++;
    }
    if (count !== artifact.record_count) throw new Error("Reporting-only artifact record count mismatch.");
  }
  if (reportingRows.length !== (registry.manifest.coverage.reporting_location_evidence ?? 0)) throw new Error("Reporting-only registry count mismatch.");
  if (tnSupported && (!tnTotal.records || tnTotal.records !== registry.manifest.coverage.tn_childcare_center_sites
    || tnTotal.with_zip !== registry.manifest.coverage.tn_childcare_center_sites_with_zip
    || tnTotal.without_zip !== registry.manifest.coverage.tn_childcare_center_sites_without_zip
    || tnTotal.without_zip + (ohTotal?.without_zip ?? 0) !== registry.manifest.coverage.reporting_location_evidence_without_zip
    || JSON.stringify(tnTotal.missing_zip_reasons) !== JSON.stringify(registry.manifest.coverage.tn_childcare_missing_zip_reasons))) throw new Error("TN reporting ZIP counts differ from registry.");
  for (const [sourceId, sourceKey, countKey] of [
    ["ma-licensed-center-based-childcare", "ma_childcare_centers", "ma_childcare_center_sites"],
    ["nj-licensed-childcare-centers", "nj_childcare_centers", "nj_childcare_center_sites"],
    ...(tnSupported ? [[TN_SOURCE, TN_KEY, "tn_childcare_center_sites"]] : []),
    ...(ohSupported ? [[OH_SOURCE, OH_KEY, "oh_childcare_center_sites"]] : []),
  ]) {
    const byZip = new Map(); let count = 0;
    for (const row of reportingRows.filter((entry) => entry.source.source_id === sourceId)) {
      count++;
      if (row.zip_code === null) continue;
      if (!zipByCode.has(row.zip_code)) throw new Error("Reporting-only ZIP is missing from registry coverage.");
      byZip.set(row.zip_code, (byZip.get(row.zip_code) ?? 0) + 1);
    }
    if (count !== (registry.manifest.coverage[countKey] ?? 0)) throw new Error("Reporting-only source count mismatch.");
    for (const row of registryZipRows) {
      if ((row.source_contributions?.[sourceKey]?.reported_center_count ?? 0) !== (byZip.get(row.zip_code) ?? 0)) throw new Error("Reporting-only ZIP source contribution mismatch.");
    }
  }
  if (ohSupported) {
    await ohApi.verifyOhChildcareGeographicMembership(reportingRows.filter(row => row.source.source_id === OH_SOURCE), ohContext.input.verificationContext);
    if (stateByAbbreviation.get("OH")?.geoid !== "39") throw new Error("Ohio state index is required for reporting.");
    if ((tnTotal.without_zip + ohTotal.without_zip) !== registry.manifest.coverage.reporting_location_evidence_without_zip) throw new Error("Combined reporting missing ZIP total differs.");
    profileSummary.coordinate_assignment_ineligible_count = 0;
  }
  const reportingEstablishmentIds = new Set(reportingRows.map(row => row.establishment_entity_id));
  const geographicArtifacts = [...profileArtifacts, { reportingOnly: true }];
  let processedProfiles = 0;
  for (const artifact of geographicArtifacts) {
    const reportingOnly = artifact.reportingOnly === true;
    for await (const profile of reportingOnly ? reportingRows : streamGzipJsonLines(artifactPath(registry, artifact))) {
      if (!reportingOnly) {
        if (reportingSiteIds.has(profile.site_entity_id)) throw new Error("Reporting-only site also appears in identity-matching profiles.");
        if (["ma-licensed-center-based-childcare", "nj-licensed-childcare-centers", TN_SOURCE, OH_SOURCE].includes(profile.source?.source_id)
          || reportingEstablishmentIds.has(profile.establishment_entity_id)) throw new Error("Childcare reporting-only source cannot be an identity-matching profile.");
        processedProfiles += 1;
      }
      const sourceId = profile.source?.source_id ?? "unknown-source";
      const observedAt = profile.observed_at ?? null;
      if (!sourceStats.has(sourceId)) sourceStats.set(sourceId, emptyProfileStats());
      const source = sourceStats.get(sourceId);
      updateProfileStats(profileSummary, sourceId, observedAt, reportingOnly);
      updateProfileStats(source, sourceId, observedAt, reportingOnly);
      const reportedState = stateByAbbreviation.get(profile.normalized_address?.state ?? profile.address?.state ?? "");
      if (reportedState) {
        if (sourceId === TN_SOURCE) {
          if (!tnStates.has(reportedState.geoid)) tnStates.set(reportedState.geoid, emptyTnReporting());
          addTnReporting(tnStates.get(reportedState.geoid), profile);
        }
        profileSummary.reported_state_assigned_count += 1;
        source.reported_state_assigned_count += 1;
        const stats = stateStats.get(reportedState.geoid);
        updateProfileStats(stats, sourceId, observedAt, reportingOnly);
      } else {
        profileSummary.reported_state_missing_or_unsupported_count += 1;
        source.reported_state_missing_or_unsupported_count += 1;
      }
      const location = profile.location;
      if (sourceId === OH_SOURCE) {
        // The source contract forbids assignment even when the point is valid.
        // Preserve availability evidence without calling point-in-polygon.
        profileSummary.coordinate_assignment_ineligible_count++;
        source.coordinate_assignment_ineligible_count = (source.coordinate_assignment_ineligible_count ?? 0) + 1;
        const missing = location.latitude === null && location.longitude === null;
        const key = missing ? "coordinate_missing_count" : "coordinate_present_valid_count";
        profileSummary[key]++; source[key]++;
        continue;
      }
      if (!location || (reportingOnly && location.latitude === null && location.longitude === null)) {
        profileSummary.coordinate_missing_count += 1;
        source.coordinate_missing_count += 1;
        continue;
      }
      const assignment = assignPointToCounty(profilePointCoordinates(location), countySpatialIndex);
      if (assignment.status === "invalid-coordinate") {
        profileSummary.coordinate_invalid_count += 1;
        source.coordinate_invalid_count += 1;
        continue;
      }
      profileSummary.coordinate_present_valid_count += 1;
      source.coordinate_present_valid_count += 1;
      if (assignment.status === "coordinate-not-in-county-polygon") {
        profileSummary.coordinate_unmatched_count += 1;
        source.coordinate_unmatched_count += 1;
        continue;
      }
      if (assignment.status === "ambiguous-county-boundary") {
        profileSummary.coordinate_ambiguous_boundary_count += 1;
        source.coordinate_ambiguous_boundary_count += 1;
        continue;
      }
      profileSummary.coordinate_assigned_single_count += 1;
      source.coordinate_assigned_single_count += 1;
      if (reportingOnly) {
        profileSummary.reporting_only_coordinate_assigned_count++;
        source.reporting_only_coordinate_assigned_count++;
      }
      const county = countyStats.get(assignment.county.geoid);
      if (sourceId === TN_SOURCE) {
        tnCoordinateAssigned++;
        if (!tnCounties.has(assignment.county.geoid)) tnCounties.set(assignment.county.geoid, emptyTnReporting());
        addTnReporting(tnCounties.get(assignment.county.geoid), profile);
      }
      updateProfileStats(county, sourceId, observedAt, reportingOnly);
      if (reportingOnly) county.reporting_only_coordinate_assigned_count++;
      const coordinateState = stateStats.get(assignment.county.stateFips);
      coordinateState.coordinate_assigned_single_count += 1;
      if (reportingOnly) coordinateState.reporting_only_coordinate_assigned_count++;
      increment(coordinateState.coordinate_source_counts, sourceId);
      updateObservationRange(coordinateState, observedAt);
      if (reportedState && reportedState.geoid !== assignment.county.stateFips) {
        profileSummary.reported_coordinate_state_conflict_count += 1;
        source.reported_coordinate_state_conflict_count += 1;
        stateStats.get(reportedState.geoid).reported_coordinate_state_conflict_count += 1;
        coordinateState.reported_coordinate_state_conflict_count += 1;
      }
      if (!reportingOnly && processedProfiles % 250_000 === 0) logger(`Geographically assessed ${processedProfiles}/${registry.manifest.coverage.resolution_location_profiles} matching profiles.`);
    }
  }
  if (processedProfiles !== registry.manifest.coverage.resolution_location_profiles) {
    throw new Error(`Expected ${registry.manifest.coverage.resolution_location_profiles} profiles, processed ${processedProfiles}.`);
  }

  profileSummary.source_counts = sortedObject(profileSummary.source_counts);
  profileSummary.source_stats = [...sourceStats.entries()].map(([sourceId, stats]) => ({
    source_id: sourceId,
    ...stats,
    source_counts: undefined,
  })).sort((left, right) => left.source_id.localeCompare(right.source_id));
  const lineage = createLineage(registry, geography, crosswalk, resolution, benchmark, nonemployer);
  lineage.transformation_version = transformationVersion;
  const identitySemantics = {
    entity_resolution_applied: false,
    count_semantics: "source-preserving-geographic-evidence-including-reporting-only-not-deduplicated-businesses",
    reporting_only_evidence_enables_identity_matching: false,
    resolution_status: resolution.manifest.status,
    benchmark_status: benchmark.manifest.status,
    benchmark_gate_passed: benchmark.manifest.coverage?.benchmark_gate_passed ?? false,
    export_authorized: false,
  };

  const stateViews = stateIndexRecords.map((state) => {
    const stats = stateStats.get(state.geoid);
    const materialZctas = materialZctasByState.get(state.geoid) ?? new Set();
    return {
      schema_version: COVERAGE_VIEWS_SCHEMA_VERSION,
      view_type: "state",
      view_id: `state:${state.geoid}`,
      state_fips: state.geoid,
      state_name: state.name,
      postal_abbreviation: state.postal_abbreviation,
      state_equivalent_kind: state.state_equivalent_kind,
      is_50_states_or_dc: state.is_50_states_or_dc,
      geography: {
        geo_id: state.geo_id,
        centroid: state.centroid,
        bbox: state.bbox,
        geometry_file: state.geometry_file,
        county_equivalent_count: countyIndexRecords.filter((county) => county.state_fips === state.geoid).length,
      },
      registry_evidence: {
        reported_address_profile_count: stats.profile_count,
        matching_profile_count: stats.matching_profile_count,
        reporting_only_count: stats.reporting_only_count,
        reporting_only_coordinate_assigned_count: stats.reporting_only_coordinate_assigned_count,
        ...(tnSupported ? { tn_childcare_reporting: tnStates.get(state.geoid) ?? emptyTnReporting() } : {}),
        ...(ohSupported ? { oh_childcare_reporting: state.geoid === "39" ? ohTotal : ohApi.emptyOhioReporting() } : {}),
        coordinate_assigned_profile_count: stats.coordinate_assigned_single_count,
        reported_coordinate_state_conflict_count: stats.reported_coordinate_state_conflict_count,
        source_profile_counts_by_reported_address_state: sortedObject(stats.source_counts),
        source_profile_counts_by_coordinate_assigned_state: sortedObject(stats.coordinate_source_counts),
        earliest_observed_at: stats.earliest_observed_at,
        latest_observed_at: stats.latest_observed_at,
      },
      zcta_coverage: {
        topological_intersecting_zcta_count: (topologicalZctasByState.get(state.geoid) ?? new Set()).size,
        material_intersecting_zcta_count: materialZctas.size,
        ...zctaCoverageForSet(materialZctas, zipByCode, zctaSummaryByCode),
      },
      employer_baseline_allocation: null,
      employer_baseline_gap: "ZIP-level Census ZBP counts are not allocated to states with polygon-area weights.",
      nonemployer_baseline: baselineForGeography(
        nonemployerStateByFips.get(state.geoid),
        nonemployer,
        state.is_50_states_or_dc,
      ),
      identity_semantics: identitySemantics,
      complete_all_businesses: false,
      lineage,
    };
  }).sort((left, right) => left.state_fips.localeCompare(right.state_fips));

  const countyViews = countyIndexRecords.map((county) => {
    const stats = countyStats.get(county.geoid);
    const materialZctas = materialZctasByCounty.get(county.geoid) ?? new Set();
    return {
      schema_version: COVERAGE_VIEWS_SCHEMA_VERSION,
      view_type: "county",
      view_id: `county:${county.geoid}`,
      county_geoid: county.geoid,
      county_name: county.name,
      state_fips: county.state_fips,
      county_fips: county.county_fips,
      state_geo_id: `state:${county.state_fips}`,
      geography: {
        geo_id: county.geo_id,
        centroid: county.centroid,
        bbox: county.bbox,
        geometry_file: county.geometry_file,
      },
      registry_evidence: {
        coordinate_assigned_profile_count: stats.profile_count,
        ...(tnSupported ? { tn_childcare_reporting: tnCounties.get(county.geoid) ?? emptyTnReporting() } : {}),
        ...(ohSupported ? { oh_childcare_reporting: ohApi.emptyOhioReporting() } : {}),
        matching_profile_count: stats.matching_profile_count,
        reporting_only_count: stats.reporting_only_count,
        source_profile_counts: sortedObject(stats.source_counts),
        earliest_observed_at: stats.earliest_observed_at,
        latest_observed_at: stats.latest_observed_at,
        subset_semantics: "source-preserving matching and reporting-only evidence with one valid point in this generalized Census county polygon; not deduplicated businesses",
        profiles_without_coordinates_are_not_allocated: true,
      },
      zcta_coverage: {
        topological_intersecting_zcta_count: (topologicalZctasByCounty.get(county.geoid) ?? new Set()).size,
        material_intersecting_zcta_count: materialZctas.size,
        ...zctaCoverageForSet(materialZctas, zipByCode, zctaSummaryByCode),
      },
      zip_business_count_allocation: null,
      zip_business_count_allocation_gap: "Polygon-area weights are not business-location weights; ZIP totals are not allocated to counties.",
      nonemployer_baseline: baselineForGeography(
        nonemployerCountyByGeoid.get(county.geoid),
        nonemployer,
        stateIndexByFips.get(county.state_fips)?.is_50_states_or_dc === true,
      ),
      identity_semantics: identitySemantics,
      complete_all_businesses: false,
      lineage,
    };
  }).sort((left, right) => left.county_geoid.localeCompare(right.county_geoid));

  const zipViews = registryZipRows.map((row) => {
    const zctaRecord = zctaIndexByCode.get(row.zip_code) ?? null;
    const zcta = zctaRecord?.zcta ?? null;
    if (hasZctaGeography(row) !== Boolean(zctaRecord)) {
      throw new Error(`Registry ZIP ${row.zip_code} disagrees with the selected Census ZCTA5 polygon denominator.`);
    }
    const relationships = zcta ? relationshipsByZcta.get(zcta) ?? [] : [];
    const gapCodes = ["incomplete-business-universe", "entity-resolution-not-applied", "no-census-nonemployer-zip-allocation"];
    if (row.registry_coverage.status !== "record-level-source-contribution") gapCodes.push("no-record-level-source-contribution");
    if (!zcta) gapCodes.push("not-in-census-zcta5-polygon-denominator");
    if (!hasPublishedEmployerBaseline(row)) gapCodes.push("no-published-census-zbp-employer-baseline");
    return {
      schema_version: COVERAGE_VIEWS_SCHEMA_VERSION,
      view_type: "zip",
      view_id: `zip:${row.zip_code}`,
      zip_code: row.zip_code,
      registry_coverage: row.registry_coverage,
      source_contributions: row.source_contributions,
      current_usps_validity: row.current_usps_validity,
      geography: row.geography,
      spatial_zip_polygon_membership: zctaRecord ? {
        status: "included",
        zip_code: row.zip_code,
        geo_id: zctaRecord.geo_id,
        geometry_file: zctaRecord.geometry_file,
        geography_release_id: geography.manifest.release_id,
        match_method: "exact-five-digit-zcta-code",
        zip4_polygon_applicability: "not-applicable",
      } : {
        status: "not-in-denominator",
        zip_code: row.zip_code,
        geo_id: null,
        geometry_file: null,
        geography_release_id: geography.manifest.release_id,
        match_method: "exact-five-digit-zcta-code",
        zip4_polygon_applicability: "not-applicable",
      },
      employer_baseline: row.employer_baseline,
      nonemployer_baseline_allocation: null,
      nonemployer_baseline_allocation_gap: "Census Nonemployer Statistics has no ZIP-level published geography.",
      baseline_coverage_status: row.baseline_coverage_status,
      jurisdiction_overlay: {
        status: zcta ? zctaSummaryByCode.get(zcta)?.overlay_status ?? "missing-crosswalk-summary" : "not-applicable-no-zcta",
        allocation_semantics: "polygon-area-only-not-business-location",
        relationships: relationships.map((relationship) => ({
          county_geo_id: relationship.county_geo_id,
          state_geo_id: relationship.state_geo_id,
          intersection_area_m2: relationship.intersection_area_m2,
          raw_share_of_zcta_polygon_area: relationship.raw_share_of_zcta_polygon_area,
          normalized_share_of_matched_zcta_area: relationship.normalized_share_of_matched_zcta_area,
          material_intersection: relationship.material_intersection,
        })),
      },
      coverage_gap_codes: gapCodes.sort(),
      identity_semantics: identitySemantics,
      complete_all_businesses: false,
      lineage,
    };
  }).sort((left, right) => left.zip_code.localeCompare(right.zip_code));

  if (tnSupported && !sourceContributionSummaries.has(TN_KEY)) {
    const first = reportingRows.find(row => row.source.source_id === TN_SOURCE);
    sourceContributionSummaries.set(TN_KEY, { source_key: TN_KEY, profile_source_id: TN_SOURCE, zip_level_counts: { reported_center_count: 0 },
      release_metadata: { source_release_id: first.source.source_release_id, observed_at: first.observed_at, record_level_distribution: "local-review-only", active_business_verified: false }, zip_rows_with_contribution: 0 });
  }
  if (ohSupported && !sourceContributionSummaries.has(OH_KEY)) sourceContributionSummaries.set(OH_KEY, {
    source_key: OH_KEY, profile_source_id: OH_SOURCE, zip_level_counts: { reported_center_count: 0 }, zip_rows_with_contribution: 0,
    release_metadata: { source_release_id: ohContext.input.source.sourceReleaseId, observed_at: ohContext.input.source.observedAt, record_level_distribution: "local-review-only", active_business_verified: false } });
  const sourceViews = [...sourceContributionSummaries.values()].map((summary) => {
    const profiles = summary.profile_source_id ? sourceStats.get(summary.profile_source_id) ?? emptyProfileStats() : emptyProfileStats();
    return {
      schema_version: COVERAGE_VIEWS_SCHEMA_VERSION,
      view_type: "source",
      view_id: `source:${summary.source_key}`,
      source_key: summary.source_key,
      profile_source_id: summary.profile_source_id,
      release_metadata: sortedObject(summary.release_metadata),
      zip_level_counts: sortedObject(summary.zip_level_counts),
      zip_rows_with_contribution: summary.zip_rows_with_contribution,
      location_profile_geography: {
        profile_count: profiles.profile_count,
        matching_profile_count: profiles.matching_profile_count,
        reporting_only_count: profiles.reporting_only_count,
        reporting_only_coordinate_assigned_count: profiles.reporting_only_coordinate_assigned_count,
        reported_state_assigned_count: profiles.reported_state_assigned_count,
        reported_state_missing_or_unsupported_count: profiles.reported_state_missing_or_unsupported_count,
        coordinate_present_valid_count: profiles.coordinate_present_valid_count,
        coordinate_missing_count: profiles.coordinate_missing_count,
        ...(ohSupported ? { coordinate_assignment_ineligible_count: profiles.coordinate_assignment_ineligible_count ?? 0 } : {}),
        coordinate_invalid_count: profiles.coordinate_invalid_count,
        coordinate_assigned_single_count: profiles.coordinate_assigned_single_count,
        coordinate_unmatched_count: profiles.coordinate_unmatched_count,
        coordinate_ambiguous_boundary_count: profiles.coordinate_ambiguous_boundary_count,
        reported_coordinate_state_conflict_count: profiles.reported_coordinate_state_conflict_count,
        earliest_observed_at: profiles.earliest_observed_at,
        latest_observed_at: profiles.latest_observed_at,
      },
      complete_source_for_all_businesses: false,
      ...(tnSupported && summary.source_key === TN_KEY ? { tn_childcare_reporting: tnTotal, source_manifest: { ...tnDependency } } : {}),
      ...(ohSupported && summary.source_key === OH_KEY ? { oh_childcare_reporting: ohTotal, source_manifest: { ...ohContext.dependency }, governed_geographic_assignment_eligible: false,
        identity_matching_eligible: false, export_policy: "local-review-only" } : {}),
      ...(profiles.reporting_only_count > 0 ? {
        identity_matching_eligible: false,
        export_policy: "local-review-only",
        industry_scope: summary.source_key === OH_KEY ? "Ohio publisher-open Child Care Center rows; not verified operations or county/ZCTA assignments"
          : summary.source_key === TN_KEY ? "Tennessee DHS Active Child Care Center source rows; source status is not verified operation; TDOE and other care types excluded"
          : summary.source_key === "ma_childcare_centers"
          ? "MassGIS/EEC center-based childcare; source scope is not identical to NJDEP/DCF"
          : "NJDEP/DCF licensed childcare centers including public-school facilities; not all childcare businesses",
      } : {}),
      source_kind: "record-level-evidence",
      lineage,
    };
  });
  sourceViews.push({
    schema_version: COVERAGE_VIEWS_SCHEMA_VERSION,
    view_type: "source",
    view_id: "source:census_nonemployer_statistics",
    source_key: "census_nonemployer_statistics",
    profile_source_id: null,
    source_kind: "aggregate-baseline",
    release_metadata: {
      source_release_id: nonemployer.manifest.release_id,
      reference_year: nonemployer.manifest.reference_year,
      geography_scope: nonemployer.manifest.geography_scope,
    },
    zip_level_counts: {},
    zip_rows_with_contribution: 0,
    location_profile_geography: emptyProfileStats(),
    aggregate_baseline: {
      national_nonemployer_establishments: nonemployer.manifest.coverage.national_nonemployer_establishments,
      state_totals: nonemployer.manifest.coverage.state_totals,
      county_totals: nonemployer.manifest.coverage.county_totals,
      county_nonemployer_establishments: nonemployer.manifest.coverage.county_nonemployer_establishments,
      establishments_not_allocated_to_county: nonemployer.manifest.coverage.nonemployer_establishments_not_allocated_to_county,
      zip_allocation_available: false,
      current_named_business_status: false,
    },
    complete_source_for_all_businesses: false,
    lineage,
  });
  sourceViews.sort((left, right) => left.source_key.localeCompare(right.source_key));

  const allStateFips = new Set(stateViews.map((state) => state.state_fips));
  const statesDcFips = new Set(stateViews.filter((state) => state.is_50_states_or_dc).map((state) => state.state_fips));
  const nationalForScope = (scope, stateFips, name) => {
    const selectedStates = stateViews.filter((state) => stateFips.has(state.state_fips));
    const selectedCounties = countyViews.filter((county) => stateFips.has(county.state_fips));
    const selectedZctas = new Set(selectedStates.flatMap((state) => [...(materialZctasByState.get(state.state_fips) ?? [])]));
    return {
      schema_version: COVERAGE_VIEWS_SCHEMA_VERSION,
      view_type: "national",
      view_id: `national:${scope}`,
      scope,
      name,
      geography: {
        state_equivalent_count: selectedStates.length,
        county_equivalent_count: selectedCounties.length,
        material_zcta_count: selectedZctas.size,
      },
      registry_evidence: {
        reported_address_profile_count: selectedStates.reduce((sum, state) => sum + state.registry_evidence.reported_address_profile_count, 0),
        ...(tnSupported ? { tn_childcare_reporting: sumTnReporting(selectedStates.map(state => state.registry_evidence.tn_childcare_reporting)) } : {}),
        ...(ohSupported ? { oh_childcare_reporting: ohApi.sumOhioReporting(selectedStates.map(state => state.registry_evidence.oh_childcare_reporting)) } : {}),
        matching_profile_count: selectedStates.reduce((sum, state) => sum + state.registry_evidence.matching_profile_count, 0),
        reporting_only_count: selectedStates.reduce((sum, state) => sum + state.registry_evidence.reporting_only_count, 0),
        coordinate_assigned_profile_count: selectedCounties.reduce((sum, county) => sum + county.registry_evidence.coordinate_assigned_profile_count, 0),
        reported_coordinate_state_conflict_endpoint_count: selectedStates.reduce(
          (sum, state) => sum + state.registry_evidence.reported_coordinate_state_conflict_count,
          0,
        ),
        conflict_endpoint_semantics: "one endpoint for each reported or coordinate-derived state in scope; see registry-union profile summary for national incident count",
      },
      zcta_coverage: zctaCoverageForSet(selectedZctas, zipByCode, zctaSummaryByCode),
      nonemployer_baseline: nonemployerBaselineForScope(selectedStates, nonemployer),
      identity_semantics: identitySemantics,
      complete_all_businesses: false,
      lineage,
    };
  };
  const nationalViews = [
    {
      schema_version: COVERAGE_VIEWS_SCHEMA_VERSION,
      view_type: "national",
      view_id: "national:registry-union",
      scope: "registry-union",
      name: "All supported U.S. and territory records in the selected registry release",
      registry_manifest_coverage: registry.manifest.coverage,
      profile_geography_summary: profileSummary,
      ...(tnSupported ? { tn_childcare_reporting: tnTotal } : {}),
      ...(ohSupported ? { oh_childcare_reporting: ohTotal } : {}),
      zip_union: {
        row_count: zipViews.length,
        rows_with_record_level_source_contribution: zipViews.filter((row) => row.registry_coverage.status === "record-level-source-contribution").length,
        rows_without_record_level_source_contribution: zipViews.filter((row) => row.registry_coverage.status !== "record-level-source-contribution").length,
        rows_with_zcta_polygon: zipViews.filter(hasZctaGeography).length,
        rows_without_zcta_polygon: zipViews.filter((row) => !hasZctaGeography(row)).length,
        spatial_zip_polygon_denominator: spatialZipPolygonDenominator,
        usps_operational_zip_evidence: registry.manifest.coverage.authoritative_current_usps_zip_denominator,
        authoritative_current_usps_zip_denominator: registry.manifest.coverage.authoritative_current_usps_zip_denominator,
      },
      nonemployer_baseline: {
        ...nonemployerBaselineForScope(stateViews, nonemployer),
        national_source_total: nonemployerNationalTotal.nonemployer_establishments,
        source_national_geography: nonemployerNationalTotal.geography_name,
      },
      identity_semantics: identitySemantics,
      complete_all_businesses: false,
      lineage,
    },
    nationalForScope("all-census-us-areas", allStateFips, "United States — all Census state-equivalent areas"),
    nationalForScope("50-states-and-dc", statesDcFips, "United States — 50 states and District of Columbia"),
  ];

  const gapViews = buildGapRecords({
    zipViews,
    zctaSummaries,
    stateViews,
    countyViews,
    profileSummary,
    registry,
    resolution,
    benchmark,
    nonemployer,
    lineage,
  });
  if (tnSupported && tnTotal.without_zip) gapViews.push({ gap_id: "gap:tn-childcare-source-zip-unavailable", gap_type: "reporting-source-zip-unavailable", scope_type: "source", scope_id: TN_KEY,
    schema_version: COVERAGE_VIEWS_SCHEMA_VERSION, view_type: "coverage-gap", status: "open", severity: "declared-limitation",
    evidence: { source_id: TN_SOURCE, record_count: tnTotal.without_zip, reasons: tnTotal.missing_zip_reasons, zip_inferred: false },
    consequence: "Retained in source and reported-state totals; valid points may contribute to counties. No ZIP or ZCTA inferred from coordinates.", lineage });
  const zipViewsWithZcta = zipViews.filter(hasZctaGeography).length;
  if (ohSupported) gapViews.push(...ohApi.ohioCoverageGaps(ohTotal, lineage));
  if (zipViewsWithZcta !== zctaSummaries.length) {
    throw new Error(`Registry ZIP views contain ${zipViewsWithZcta} ZCTA rows; the crosswalk contains ${zctaSummaries.length}.`);
  }
  const gapCountsByType = sortedObject(Object.fromEntries(
    [...Map.groupBy(gapViews, (gap) => gap.gap_type)].map(([gapType, rows]) => [gapType, rows.length]),
  ));

  const createdAt = now().toISOString();
  if (mnCredentials && createdAt < registry.manifest.created_at) throw new Error('Coverage processing time precedes retained credential registry.');
  const runId = randomUUID();
  const releaseId = `national-business-coverage-views-${releaseTimestamp(createdAt)}-${runId.slice(0, 8)}`;
  const stagingDirectory = path.join(outputRoot, ".staging", runId);
  const artifacts = [];
  let retainedChildcareDeclaration = null;
  let mnCredentialDeclaration = null;
  if (mnCredentials) {
    const {applyMnCredentialCoverage} = await import('./mn-credential-coverage-extension.mjs');
    mnCredentialDeclaration = {...applyMnCredentialCoverage(mnCredentials, {national:nationalViews,states:stateViews,counties:countyViews,zips:zipViews}),
      registry_manifest_path:path.relative(APP_ROOT, path.join(registry.releaseDirectory,'manifest.json')).replaceAll('\\','/')};
  }
  if (retainedChildcare) {
    const {applyRetainedChildcareCoverage} = await import('./retained-childcare-coverage-extension.mjs');
    retainedChildcareDeclaration = {...applyRetainedChildcareCoverage(retainedChildcare, {national:nationalViews,states:stateViews,counties:countyViews,zips:zipViews}),
      registry_manifest_path:path.relative(APP_ROOT, path.join(registry.releaseDirectory,'manifest.json')).replaceAll('\\','/')};
  }
  for (const [relativePath, records, artifactType] of [
    ["views/national.jsonl", nationalViews, "national-coverage-view-jsonl"],
    ["views/states.jsonl", stateViews, "state-coverage-view-jsonl"],
    ["views/counties.jsonl", countyViews, "county-coverage-view-jsonl"],
    ["views/zips.jsonl", zipViews, "zip-coverage-view-jsonl"],
    ["views/sources.jsonl", sourceViews, "source-coverage-view-jsonl"],
    ["views/coverage-gaps.jsonl", gapViews, "coverage-gap-view-jsonl"],
  ]) artifacts.push(await writeJsonLinesArtifact(stagingDirectory, relativePath, records, { artifact_type: artifactType, record_count: records.length,
    ...(mnCredentials ? {export_policy:'local-review-only'} : retainedChildcare ? {export_policy:'internal'} : {}) }));
  artifacts.push(await writeArtifact(
    stagingDirectory,
    "derived/profile-geography-summary.json",
    json(profileSummary),
    { artifact_type: "profile-geography-summary-json", record_count: 1 },
  ));
  if (tnSupported || ohSupported || retainedChildcare || mnCredentials) {
    if (registry.manifestBuffer.length > 4_000_000) throw new Error("Registry declaration exceeds retained evidence limit.");
    artifacts.push(await writeArtifact(stagingDirectory, "evidence/registry-manifest.json", registry.manifestBuffer,
      { artifact_type: "retained-registry-manifest-json", record_count: 1, export_policy: "internal" }));
  }
  const dependencies = [registry, geography, crosswalk, resolution, benchmark, nonemployer].map((dataset) => ({
    dataset_id: dataset.manifest.dataset_id,
    release_id: dataset.manifest.release_id,
    publisher_version: dataset.manifest.publisher?.version ?? null,
    manifest_sha256: dataset.manifestSha256,
  }));
  const registryPostalContractEnforced = versionAtLeast(registry.manifest.publisher?.version, "2.10.0");
  const manifest = {
    schema_version: COVERAGE_VIEWS_SCHEMA_VERSION,
    dataset_id: "national-business-coverage-views",
    publisher: { id: "national-business-coverage-views", version: transformationVersion.split("@")[1] },
    ...(ohSupported ? { oh_childcare_source: structuredClone(ohContext.input.source), tn_childcare_origin: registry.manifest.tn_childcare_origin } : {}),
    release_id: releaseId,
    run_id: runId,
    created_at: createdAt,
    status: "published-partial-local-aggregate",
    complete_all_businesses: false,
    spatial_zip_polygon_denominator: spatialZipPolygonDenominator,
    usps_operational_zip_evidence: registry.manifest.coverage.authoritative_current_usps_zip_denominator,
    authoritative_current_usps_zip_denominator: registry.manifest.coverage.authoritative_current_usps_zip_denominator,
    normalized_postal_field_migration: {
      status: registryPostalContractEnforced ? "enforced-in-registry-release" : "pre-migration-registry-release",
      registry_publisher_version: registry.manifest.publisher?.version ?? null,
      required_registry_publisher_version: "2.10.0",
      normalized_output_contract: "zip_code-and-postal_code-are-zip5;zip4-is-separate-or-null",
      joined_zip4_allowed_in_new_normalized_output: false,
    },
    entity_resolution_applied: false,
    export_policy: "local-aggregate-review-required",
    dependencies,
    coverage: {
      ...(ohSupported ? { oh_childcare_reporting: ohTotal, oh_childcare_coordinate_assigned: 0, oh_childcare_without_county_assignment: ohTotal.records } : {}),
      ...(tnSupported ? { tn_childcare_reporting: tnTotal, tn_childcare_coordinate_assigned: tnCoordinateAssigned,
        tn_childcare_without_county_assignment: tnTotal.records - tnCoordinateAssigned } : {}),
      national_views: nationalViews.length,
      state_views: stateViews.length,
      county_views: countyViews.length,
      zip_views: zipViews.length,
      source_views: sourceViews.length,
      gap_views: gapViews.length,
      gap_counts_by_type: gapCountsByType,
      location_profiles_assessed: profileSummary.matching_profile_count,
      geographic_evidence_assessed: profileSummary.profile_count,
      reporting_only_locations_assessed: profileSummary.reporting_only_count,
      reporting_only_coordinate_assigned: profileSummary.reporting_only_coordinate_assigned_count,
      reporting_only_identity_matching_eligible: false,
      coordinate_assigned_profiles: profileSummary.coordinate_assigned_single_count - profileSummary.reporting_only_coordinate_assigned_count,
      profiles_without_valid_coordinate_assignment: profileSummary.matching_profile_count - (profileSummary.coordinate_assigned_single_count - profileSummary.reporting_only_coordinate_assigned_count),
      geographic_evidence_coordinate_assigned: profileSummary.coordinate_assigned_single_count,
      geographic_evidence_without_valid_coordinate_assignment: profileSummary.profile_count - profileSummary.coordinate_assigned_single_count,
      zctas: zctaSummaries.length,
      spatial_zip_polygon_denominator_count: spatialZipPolygonDenominator.count,
      zip_views_with_zcta_polygon: zipViewsWithZcta,
      zip_views_without_zcta_polygon: zipViews.length - zipViewsWithZcta,
      zip_views_with_record_level_source_contribution: zipViews.filter((row) => row.registry_coverage.status === "record-level-source-contribution").length,
      zip_views_without_record_level_source_contribution: zipViews.filter((row) => row.registry_coverage.status !== "record-level-source-contribution").length,
      zip_views_with_published_employer_baseline: zipViews.filter(hasPublishedEmployerBaseline).length,
      zip_views_without_published_employer_baseline: zipViews.filter((row) => !hasPublishedEmployerBaseline(row)).length,
      nonemployer_reference_year: nonemployer.manifest.reference_year,
      national_nonemployer_establishments: nonemployer.manifest.coverage.national_nonemployer_establishments,
      county_nonemployer_establishments: nonemployer.manifest.coverage.county_nonemployer_establishments,
      nonemployer_establishments_not_allocated_to_county: nonemployer.manifest.coverage.nonemployer_establishments_not_allocated_to_county,
      state_views_with_published_nonemployer_baseline: stateViews.filter((row) => row.nonemployer_baseline.status === "published-annual-aggregate").length,
      state_views_without_published_nonemployer_baseline: stateViews.filter((row) => row.nonemployer_baseline.status !== "published-annual-aggregate").length,
      county_views_with_published_nonemployer_baseline: countyViews.filter((row) => row.nonemployer_baseline.status === "published-annual-aggregate").length,
      county_views_without_published_nonemployer_baseline: countyViews.filter((row) => row.nonemployer_baseline.status !== "published-annual-aggregate").length,
      ct_business_registry_active_organization_records: registry.manifest.coverage?.ct_business_registry_active_organization_records ?? 0,
      ct_business_registry_eligible_reported_us_business_addresses: registry.manifest.coverage?.ct_business_registry_eligible_reported_us_business_addresses ?? 0,
      de_business_license_source_current_license_rows: registry.manifest.coverage?.de_business_license_source_current_license_rows ?? 0,
      de_business_license_accepted_current_license_rows: registry.manifest.coverage?.de_business_license_accepted_current_license_rows ?? 0,
      de_business_license_current_organization_records: registry.manifest.coverage?.de_business_license_current_organization_records ?? 0,
      de_business_license_quarantined_source_records: registry.manifest.coverage?.de_business_license_quarantined_source_records ?? 0,
      de_business_license_quarantined_license_groups: registry.manifest.coverage?.de_business_license_quarantined_license_groups ?? 0,
      de_business_license_eligible_reported_us_business_addresses: registry.manifest.coverage?.de_business_license_eligible_reported_us_business_addresses ?? 0,
      ak_active_business_license_source_rows: registry.manifest.coverage?.ak_active_business_license_source_rows ?? 0,
      ak_active_business_license_organizations: registry.manifest.coverage?.ak_active_business_license_organizations ?? 0,
      ak_active_business_license_provisional_physical_sites: registry.manifest.coverage?.ak_active_business_license_provisional_physical_sites ?? 0,
      ak_active_business_license_organizations_without_eligible_physical_site: registry.manifest.coverage?.ak_active_business_license_organizations_without_eligible_physical_site ?? 0,
      ak_active_business_license_reported_us_address_zip_contributions: registry.manifest.coverage?.ak_active_business_license_reported_us_address_zip_contributions ?? 0,
      ak_active_business_license_quarantined_source_records: registry.manifest.coverage?.ak_active_business_license_quarantined_source_records ?? 0,
      ak_active_business_license_accepted_naics_pairs: registry.manifest.coverage?.ak_active_business_license_accepted_naics_pairs ?? 0,
      co_business_registry_good_standing_or_delinquent_organization_records: registry.manifest.coverage?.co_business_registry_good_standing_or_delinquent_organization_records ?? 0,
      co_business_registry_quarantined_source_records: registry.manifest.coverage?.co_business_registry_quarantined_source_records ?? 0,
      co_business_registry_eligible_reported_us_business_addresses: registry.manifest.coverage?.co_business_registry_eligible_reported_us_business_addresses ?? 0,
      or_business_registry_source_principal_place_rows: registry.manifest.coverage?.or_business_registry_source_principal_place_rows ?? 0,
      or_business_registry_active_registration_records: registry.manifest.coverage?.or_business_registry_active_registration_records ?? 0,
      or_business_registry_legal_entity_registrations: registry.manifest.coverage?.or_business_registry_legal_entity_registrations ?? 0,
      or_business_registry_assumed_business_name_registrations: registry.manifest.coverage?.or_business_registry_assumed_business_name_registrations ?? 0,
      or_business_registry_eligible_registration_zip_contributions: registry.manifest.coverage?.or_business_registry_eligible_registration_zip_contributions ?? 0,
      ia_business_registry_active_organization_records: registry.manifest.coverage?.ia_business_registry_active_organization_records ?? 0,
      ia_business_registry_quarantined_entities: registry.manifest.coverage?.ia_business_registry_quarantined_entities ?? 0,
      ia_business_registry_entities_with_eligible_us_home_office_address: registry.manifest.coverage?.ia_business_registry_entities_with_eligible_us_home_office_address ?? 0,
      ia_business_registry_eligible_entity_zip_contributions: registry.manifest.coverage?.ia_business_registry_eligible_entity_zip_contributions ?? 0,
      ia_business_registry_entities_with_source_geocoded_coordinates: registry.manifest.coverage?.ia_business_registry_entities_with_source_geocoded_coordinates ?? 0,
      ny_business_registry_active_organization_records: registry.manifest.coverage?.ny_business_registry_active_organization_records ?? 0,
      ny_business_registry_quarantined_source_records: registry.manifest.coverage?.ny_business_registry_quarantined_source_records ?? 0,
      ny_business_registry_eligible_reported_us_location_addresses: registry.manifest.coverage?.ny_business_registry_eligible_reported_us_location_addresses ?? 0,
      fl_business_registry_source_records: registry.manifest.coverage?.fl_business_registry_source_records ?? 0,
      fl_business_registry_active_source_records: registry.manifest.coverage?.fl_business_registry_active_source_records ?? 0,
      fl_business_registry_inactive_source_records_excluded: registry.manifest.coverage?.fl_business_registry_inactive_source_records_excluded ?? 0,
      fl_business_registry_active_organization_records: registry.manifest.coverage?.fl_business_registry_active_organization_records ?? 0,
      fl_business_registry_quarantined_source_records: registry.manifest.coverage?.fl_business_registry_quarantined_source_records ?? 0,
      fl_business_registry_eligible_reported_us_principal_addresses: registry.manifest.coverage?.fl_business_registry_eligible_reported_us_principal_addresses ?? 0,
      pa_business_registry_source_active_registration_rows: registry.manifest.coverage?.pa_business_registry_source_active_registration_rows ?? 0,
      pa_business_registry_active_organization_records: registry.manifest.coverage?.pa_business_registry_active_organization_records ?? 0,
      pa_business_registry_duplicate_filing_number_groups: registry.manifest.coverage?.pa_business_registry_duplicate_filing_number_groups ?? 0,
      pa_business_registry_duplicate_rows_collapsed: registry.manifest.coverage?.pa_business_registry_duplicate_rows_collapsed ?? 0,
      pa_business_registry_eligible_reported_us_business_addresses: registry.manifest.coverage?.pa_business_registry_eligible_reported_us_business_addresses ?? 0,
      pa_business_registry_source_geocoded_reported_business_addresses: registry.manifest.coverage?.pa_business_registry_source_geocoded_reported_business_addresses ?? 0,
      pa_business_registry_reported_pa_address_geocodes_outside_broad_pa_bounds: registry.manifest.coverage?.pa_business_registry_reported_pa_address_geocodes_outside_broad_pa_bounds ?? 0,
      il_business_registry_source_records: registry.manifest.coverage?.il_business_registry_source_records ?? 0,
      il_business_registry_active_organization_records: registry.manifest.coverage?.il_business_registry_active_organization_records ?? 0,
      il_business_registry_active_corporation_records: registry.manifest.coverage?.il_business_registry_active_corporation_records ?? 0,
      il_business_registry_active_llc_records: registry.manifest.coverage?.il_business_registry_active_llc_records ?? 0,
      il_business_registry_eligible_llc_records_office_addresses: registry.manifest.coverage?.il_business_registry_eligible_llc_records_office_addresses ?? 0,
      il_business_registry_possible_corporation_ngs_month_rule_not_evaluated: registry.manifest.coverage?.il_business_registry_possible_corporation_ngs_month_rule_not_evaluated ?? 0,
      wa_lni_active_contractor_license_source_rows: registry.manifest.coverage?.wa_lni_active_contractor_license_source_rows ?? 0,
      wa_lni_active_contractor_organizations: registry.manifest.coverage?.wa_lni_active_contractor_organizations ?? 0,
      wa_lni_active_contractor_license_activities: registry.manifest.coverage?.wa_lni_active_contractor_license_activities ?? 0,
      wa_lni_active_contractor_grouped_multi_license_organizations: registry.manifest.coverage?.wa_lni_active_contractor_grouped_multi_license_organizations ?? 0,
      wa_lni_active_contractor_reported_business_names: registry.manifest.coverage?.wa_lni_active_contractor_reported_business_names ?? 0,
      wa_lni_active_contractor_reported_mailing_addresses: registry.manifest.coverage?.wa_lni_active_contractor_reported_mailing_addresses ?? 0,
      wa_lni_active_contractor_eligible_reported_us_mailing_addresses: registry.manifest.coverage?.wa_lni_active_contractor_eligible_reported_us_mailing_addresses ?? 0,
      wa_lni_active_contractor_organizations_without_eligible_us_zip_address: registry.manifest.coverage?.wa_lni_active_contractor_organizations_without_eligible_us_zip_address ?? 0,
      la_active_business_source_location_accounts: registry.manifest.coverage?.la_active_business_source_location_accounts ?? 0,
      la_active_business_normalized_us_location_accounts: registry.manifest.coverage?.la_active_business_normalized_us_location_accounts ?? 0,
      la_active_business_quarantined_source_records: registry.manifest.coverage?.la_active_business_quarantined_source_records ?? 0,
      la_active_business_source_geocoded_locations: registry.manifest.coverage?.la_active_business_source_geocoded_locations ?? 0,
      la_active_business_in_city_council_district_locations: registry.manifest.coverage?.la_active_business_in_city_council_district_locations ?? 0,
      la_active_business_out_of_city_locations: registry.manifest.coverage?.la_active_business_out_of_city_locations ?? 0,
      la_active_business_suspect_in_city_coordinates: registry.manifest.coverage?.la_active_business_suspect_in_city_coordinates ?? 0,
      tx_active_sales_tax_source_outlet_permits: registry.manifest.coverage?.tx_active_sales_tax_source_outlet_permits ?? 0,
      tx_active_sales_tax_normalized_outlet_permits: registry.manifest.coverage?.tx_active_sales_tax_normalized_outlet_permits ?? 0,
      tx_active_sales_tax_unique_taxpayers: registry.manifest.coverage?.tx_active_sales_tax_unique_taxpayers ?? 0,
      tx_active_sales_tax_quarantined_source_records: registry.manifest.coverage?.tx_active_sales_tax_quarantined_source_records ?? 0,
      tx_active_sales_tax_inside_city_limits_outlets: registry.manifest.coverage?.tx_active_sales_tax_inside_city_limits_outlets ?? 0,
      tx_active_sales_tax_outside_city_limits_outlets: registry.manifest.coverage?.tx_active_sales_tax_outside_city_limits_outlets ?? 0,
      tx_active_sales_tax_city_limits_unreported_outlets: registry.manifest.coverage?.tx_active_sales_tax_city_limits_unreported_outlets ?? 0,
      chicago_active_business_license_source_records: registry.manifest.coverage?.chicago_active_business_license_source_records ?? 0,
      chicago_active_business_license_accepted_records: registry.manifest.coverage?.chicago_active_business_license_accepted_records ?? 0,
      chicago_active_business_license_normalized_sites: registry.manifest.coverage?.chicago_active_business_license_normalized_sites ?? 0,
      chicago_active_business_license_unique_accounts: registry.manifest.coverage?.chicago_active_business_license_unique_accounts ?? 0,
      chicago_active_business_license_quarantined_source_records: registry.manifest.coverage?.chicago_active_business_license_quarantined_source_records ?? 0,
      chicago_active_business_license_quarantined_site_groups: registry.manifest.coverage?.chicago_active_business_license_quarantined_site_groups ?? 0,
      chicago_active_business_license_source_geocoded_sites: registry.manifest.coverage?.chicago_active_business_license_source_geocoded_sites ?? 0,
      chicago_active_business_license_in_chicago_ward_sites: registry.manifest.coverage?.chicago_active_business_license_in_chicago_ward_sites ?? 0,
      chicago_active_business_license_outside_or_unreported_ward_sites: registry.manifest.coverage?.chicago_active_business_license_outside_or_unreported_ward_sites ?? 0,
      dc_basic_business_license_source_rows: registry.manifest.coverage?.dc_basic_business_license_source_rows ?? 0,
      dc_basic_business_license_accepted_rows: registry.manifest.coverage?.dc_basic_business_license_accepted_rows ?? 0,
      dc_basic_business_license_normalized_sites: registry.manifest.coverage?.dc_basic_business_license_normalized_sites ?? 0,
      dc_basic_business_license_organizations: registry.manifest.coverage?.dc_basic_business_license_organizations ?? 0,
      dc_basic_business_license_quarantined_source_records: registry.manifest.coverage?.dc_basic_business_license_quarantined_source_records ?? 0,
      dc_basic_business_license_quarantined_customer_groups: registry.manifest.coverage?.dc_basic_business_license_quarantined_customer_groups ?? 0,
      dc_basic_business_license_source_geocoded_sites: registry.manifest.coverage?.dc_basic_business_license_source_geocoded_sites ?? 0,
      dc_basic_business_license_source_coordinate_conflict_sites: registry.manifest.coverage?.dc_basic_business_license_source_coordinate_conflict_sites ?? 0,
      dc_basic_business_license_in_dc_premise_sites: registry.manifest.coverage?.dc_basic_business_license_in_dc_premise_sites ?? 0,
      dc_basic_business_license_outside_dc_premise_sites: registry.manifest.coverage?.dc_basic_business_license_outside_dc_premise_sites ?? 0,
      ca_abc_source_records: registry.manifest.coverage?.ca_abc_source_records ?? 0,
      ca_abc_selected_active_issued_license_rows: registry.manifest.coverage?.ca_abc_selected_active_issued_license_rows ?? 0,
      ca_abc_excluded_source_rows: registry.manifest.coverage?.ca_abc_excluded_source_rows ?? 0,
      ca_abc_active_issued_license_normalized_sites: registry.manifest.coverage?.ca_abc_active_issued_license_normalized_sites ?? 0,
      ca_abc_active_issued_license_organizations: registry.manifest.coverage?.ca_abc_active_issued_license_organizations ?? 0,
      ca_abc_active_issued_license_activities: registry.manifest.coverage?.ca_abc_active_issued_license_activities ?? 0,
      ca_abc_quarantined_source_rows: registry.manifest.coverage?.ca_abc_quarantined_source_rows ?? 0,
      ca_abc_quarantined_file_groups: registry.manifest.coverage?.ca_abc_quarantined_file_groups ?? 0,
      ca_abc_source_active_rows_with_expiration_before_observation: registry.manifest.coverage?.ca_abc_source_active_rows_with_expiration_before_observation ?? 0,
      ny_retail_food_store_source_license_records: registry.manifest.coverage?.ny_retail_food_store_source_license_records ?? 0,
      ny_retail_food_store_organizations: registry.manifest.coverage?.ny_retail_food_store_organizations ?? 0,
      ny_retail_food_store_provisional_physical_sites: registry.manifest.coverage?.ny_retail_food_store_provisional_physical_sites ?? 0,
      ny_retail_food_store_organizations_without_complete_physical_site: Math.max(
        0,
        (registry.manifest.coverage?.ny_retail_food_store_organizations ?? 0)
          - (registry.manifest.coverage?.ny_retail_food_store_provisional_physical_sites ?? 0),
      ),
      ny_retail_food_store_zip_evidence_addresses: registry.manifest.coverage?.ny_retail_food_store_zip_evidence_addresses ?? 0,
      ny_retail_food_store_usable_platform_geocodes: registry.manifest.coverage?.ny_retail_food_store_usable_platform_geocodes ?? 0,
      ny_retail_food_store_rows_with_undocumented_establishment_codes: registry.manifest.coverage?.ny_retail_food_store_rows_with_undocumented_establishment_codes ?? 0,
      ny_retail_food_store_quarantined_source_records: registry.manifest.coverage?.ny_retail_food_store_quarantined_source_records ?? 0,
      nyc_dcwp_active_license_source_records: registry.manifest.coverage?.nyc_dcwp_active_license_source_records ?? 0,
      nyc_dcwp_active_license_accepted_records: registry.manifest.coverage?.nyc_dcwp_active_license_accepted_records ?? 0,
      nyc_dcwp_active_license_normalized_sites: registry.manifest.coverage?.nyc_dcwp_active_license_normalized_sites ?? 0,
      nyc_dcwp_active_license_unique_business_ids: registry.manifest.coverage?.nyc_dcwp_active_license_unique_business_ids ?? 0,
      nyc_dcwp_active_license_quarantined_source_records: registry.manifest.coverage?.nyc_dcwp_active_license_quarantined_source_records ?? 0,
      nyc_dcwp_active_license_quarantined_business_groups: registry.manifest.coverage?.nyc_dcwp_active_license_quarantined_business_groups ?? 0,
      nyc_dcwp_active_license_source_geocoded_sites: registry.manifest.coverage?.nyc_dcwp_active_license_source_geocoded_sites ?? 0,
      nyc_dcwp_active_license_in_nyc_borough_sites: registry.manifest.coverage?.nyc_dcwp_active_license_in_nyc_borough_sites ?? 0,
      nyc_dcwp_active_license_outside_or_unreported_nyc_borough_sites: registry.manifest.coverage?.nyc_dcwp_active_license_outside_or_unreported_nyc_borough_sites ?? 0,
    },
    count_semantics: {
      national_state_zip: "source-preserving provisional registry evidence; not deduplicated businesses",
      county: "source-preserving profiles with one valid point assigned to a generalized Census county polygon",
      zcta_relationships: "polygon-area-only-not-business-location",
      zip_polygon_denominator: "complete selected U.S. Census Bureau ZCTA5 polygon release; ZIP+4 is a separate address-level field and never defines a polygon",
      reported_postal_values_outside_denominator: "retained as source evidence without being promoted into the Census ZCTA5 polygon denominator",
      nonemployer: "annual Census aggregate baseline for businesses with no paid employees; not named records, not current status, and never allocated to ZIPs",
      absence: "no integrated source evidence is not evidence of no active business",
    },
    limitations: [
      ...(tnSupported ? [tnFresh ? "TN DHS fresh childcare source rows remain local-review-only, reporting-only and not verified operating businesses. Missing source ZIPs remain unassigned to ZIP/ZCTA while reported state and valid point-derived county evidence are retained. Coverage publication does not refresh the source observation or invent processing or recovery timestamps." : "TN DHS recovered childcare source rows remain local-review-only, reporting-only and not verified operating businesses. Missing source ZIPs remain unassigned to ZIP/ZCTA while reported state and valid point-derived county evidence are retained. Original source observation is not refreshed by recovery or coverage publication.",
        tnFresh ? "The retained registry manifest binds TN counts and source dependency declarations to the recorded hash; this is not a fresh scan or replay of the registry's full assertions or underlying ordinary acquisition." : "The retained registry manifest binds TN counts and source dependency declarations to the recorded hash; this is not a fresh scan or replay of the registry's full assertions or underlying recovered acquisition."] : []),
      "MA/NJ childcare rows contribute separately counted reporting-only geographic evidence, never identity-matching candidates. Geographic profile-compatible fields include both evidence classes; location_profiles_assessed and coordinate_assigned_profiles retain matching-only totals. Neither class is a deduplicated or independently verified active-business count.",
      "MassGIS/EEC center-based childcare and NJDEP/DCF licensed centers have different source scopes, including NJ public-school facilities. Their shares are not comparable completeness percentages. Record-level childcare evidence remains local-review-only; NJ publisher metadata and prescribed notices remain mandatory for any separately authorized distribution.",
      "This is a partial governed coverage view, not a complete census of active U.S. businesses.",
      "Entity-resolution decisions are not applied until independent labels, precision approval, and export-policy review pass.",
      "County profile counts cover only profiles with one valid coordinate assignment; ZIP counts are never area-weighted into counties.",
      "Source-specific active, authorized, registered, current, or filing evidence is not generalized into one universal operating-status claim.",
      "Delaware current-license records and reported business addresses remain organization-only evidence; repeated license rows are grouped, conflicting groups are quarantined, person/contact fields are excluded, portal geocodes are not treated as verified premises, and no owner, physical site, establishment, or relationship is inferred.",
      "Oregon assumed business names remain provisional brands without inferred owners, organizations, physical sites, establishments, or relationships.",
      "Iowa home-office addresses and source geocodes remain organization-only registration evidence without inferred owners, physical sites, establishments, or relationships.",
      "New York monthly active-extract membership and reported locations remain organization-only registration evidence without inferred owners, physical sites, establishments, or relationships.",
      "Florida quarterly corporate records coded A and their principal addresses remain organization-only registration evidence without inferred owners, agents, officers, physical sites, establishments, or relationships.",
      "Pennsylvania active-registration dataset inclusion and reported business addresses remain organization-only evidence; the publisher's statutory-overcount warning is retained, officer/person fields are excluded, portal geocodes are not treated as verified premises, and no owner, physical site, establishment, or relationship is inferred.",
      "Illinois complete official daily-file membership preserves source-listed good-standing or reinstated registration evidence only; corporation rows do not contribute addresses, eligible LLC records-office addresses remain organization-only, person and agent data are excluded, all Illinois-derived output remains local-review-only, and no owner, physical site, establishment, or relationship is inferred.",
      "Washington L&I A/ACTIVE contractor-license rows are grouped by canonical nine-digit UBI; reported business names, license activities, and mailing addresses remain organization-only evidence, person/contact fields are excluded, and no owner, parent, network, physical site, establishment, storefront, worksite, or general operating status is inferred.",
      "Los Angeles Office of Finance location accounts create source-preserving provisional sites and establishments, but source-defined active status is not proof of continuous operations or public access; person/home-address risk keeps record-level data and linkage local-review-only.",
      "City of Chicago BACP current-active license accounts and sites create source-preserving provisional organizations, sites, and establishments, but AAI status plus future expiration is not proof of continuous operations, public access, or complete business coverage; multiple licenses do not inflate site counts and person/home-address risk keeps record-level data and linkage local-review-only.",
      "DC DLCP Active Basic Business License Customer Number groups create source-preserving provisional organizations, sites, and establishments, but municipal-license status is not proof of continuous operations, public access, or complete business coverage; multiple activity rows do not inflate site counts, record-level data and linkage remain local-review-only, and aggregate redistribution requires CC BY 4.0 attribution plus the retained semantic limitations.",
      "California ABC ACTIVE/LIC File Number groups create source-preserving provisional organizations, premises, and establishments, but alcohol-license status is not proof of continuous operation, public access, current hours, solvency, compliance, or complete California business coverage; multiple license-type rows do not inflate site counts, source-active rows with a reported expiration before observation remain explicit, mailing fields are excluded, record-level data and linkage remain local-review-only, and aggregate redistribution requires California ABC attribution plus the retained semantic limitations.",
      "New York Agriculture and Markets retail-food-license rows create source-preserving provisional organizations and conditional sites only from complete numbered physical addresses; annual-snapshot membership is not proof of day-to-day operation, public access, current hours, ownership, parent or network affiliation, drive-through or mail-order service, NABP registration, NPI enumeration, or complete business/pharmacy coverage. Platform geocodes remain address-component centroids, undocumented establishment codes remain uninterpreted, record-level data and linkage remain local-review-only, and aggregate redistribution requires OPEN-NY attribution plus retained limitations.",
      "NYC DCWP Active Premises-license Business Unique ID groups create source-preserving provisional organizations, sites, and establishments, but license status is not proof of continuous operations, public access, or complete business coverage; multiple licenses do not inflate site counts and person/home-address risk keeps record-level data and linkage local-review-only.",
      "The selected complete U.S. Census Bureau ZCTA5 release is the spatial ZIP polygon denominator; percentages using it must be labeled Census ZCTA5 polygon coverage.",
      "USPS operational ZIP evidence is optional supplemental routing evidence and does not gate Census ZCTA5 polygon coverage.",
      "Census ZCTAs are statistical areas and are not exact USPS ZIP delivery boundaries; reported five-digit postal values outside the ZCTA set remain source evidence without polygon membership.",
      "ZIP+4 is an address-level component stored separately from ZIP5 and is never assigned a polygon.",
      "Census Nonemployer Statistics is an annual aggregate for its no-paid-employee source universe and cannot be linked to named businesses or treated as current operating status.",
      "Census Nonemployer Statistics has no ZIP-level geography; national, state, and county totals are never allocated to ZIPs or ZCTAs.",
    ],
    artifacts: artifacts.sort((left, right) => left.path.localeCompare(right.path)),
  };
  if (retainedChildcareDeclaration) manifest.retained_childcare_reporting = retainedChildcareDeclaration;
  if (mnCredentialDeclaration) manifest.mn_construction_credential_reporting = mnCredentialDeclaration;
  await writeArtifact(stagingDirectory, "manifest.json", json(manifest));
  if (ohSupported || retainedChildcareDeclaration || mnCredentialDeclaration) await verifyNationalBusinessCoverageViewsRelease(path.join(stagingDirectory, "manifest.json"));
  const releaseDirectory = path.join(outputRoot, "releases", releaseId);
  await mkdir(path.dirname(releaseDirectory), { recursive: true });
  await renameWithRetry(stagingDirectory, releaseDirectory);
  const pointerPath = path.join(outputRoot, "current.json");
  const temporaryPointerPath = `${pointerPath}.tmp-${runId}`;
  await writeFile(temporaryPointerPath, json({
    dataset_id: manifest.dataset_id,
    release_id: releaseId,
    manifest: `releases/${releaseId}/manifest.json`,
    updated_at: createdAt,
  }));
  await renameWithRetry(temporaryPointerPath, pointerPath);
  return { manifest, releaseDirectory, pointerPath };
}

async function countJsonLinesStream(filePath, visitor = null) {
  const lines = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
  let count = 0;
  for await (const line of lines) {
    if (!line) continue;
    count += 1;
    if (visitor) visitor(JSON.parse(line));
  }
  return count;
}

export async function verifyNationalBusinessCoverageViewsRelease(manifestPath) {
  const absoluteManifestPath = path.resolve(manifestPath);
  const releaseDirectory = path.dirname(absoluteManifestPath);
  const manifest = JSON.parse(await readFile(absoluteManifestPath, "utf8"));
  if (manifest.dataset_id !== "national-business-coverage-views") throw new Error(`Unexpected dataset_id ${manifest.dataset_id ?? "missing"}.`);
  if (manifest.publisher?.id !== "national-business-coverage-views"
    || !["2.7.0", "2.8.0", "2.9.0", "2.10.0", "2.11.0"].includes(manifest.publisher?.version)) {
    throw new Error(`Unexpected publisher version ${manifest.publisher?.version ?? "missing"}.`);
  }
  if (manifest.status !== "published-partial-local-aggregate") throw new Error(`Unexpected release status ${manifest.status ?? "missing"}.`);
  if (manifest.complete_all_businesses !== false || manifest.entity_resolution_applied !== false) {
    throw new Error("Coverage views must not claim completeness or applied entity resolution.");
  }
  const spatialZipPolygonDenominator = manifest.spatial_zip_polygon_denominator;
  const postalMigration = manifest.normalized_postal_field_migration;
  if (!postalMigration
      || !["enforced-in-registry-release", "pre-migration-registry-release"].includes(postalMigration.status)
      || postalMigration.required_registry_publisher_version !== "2.10.0"
      || postalMigration.normalized_output_contract !== "zip_code-and-postal_code-are-zip5;zip4-is-separate-or-null"
      || postalMigration.joined_zip4_allowed_in_new_normalized_output !== false) {
    throw new Error("Coverage views have invalid normalized postal-field migration metadata.");
  }
  if (!spatialZipPolygonDenominator
      || spatialZipPolygonDenominator.geography_type !== "census-zcta5"
      || spatialZipPolygonDenominator.evidence_scope !== "complete-selected-census-zcta5-polygon-release"
      || spatialZipPolygonDenominator.zip4_polygon_applicability !== "not-applicable"
      || spatialZipPolygonDenominator.match_key !== "exact-five-digit-zcta-code"
      || !/^[a-f0-9]{64}$/.test(spatialZipPolygonDenominator.geography_manifest_sha256 ?? "")
      || spatialZipPolygonDenominator.zcta_index_artifact_path !== "derived/index/zctas.jsonl"
      || !/^[a-f0-9]{64}$/.test(spatialZipPolygonDenominator.zcta_index_artifact_sha256 ?? "")
      || !/^[a-f0-9]{64}$/.test(spatialZipPolygonDenominator.zcta_member_set_sha256 ?? "")
      || !Number.isInteger(spatialZipPolygonDenominator.count)
      || spatialZipPolygonDenominator.count < 1) {
    throw new Error(`Coverage views have an invalid spatial ZIP polygon denominator: ${JSON.stringify(spatialZipPolygonDenominator)}.`);
  }
  if (JSON.stringify(manifest.usps_operational_zip_evidence ?? null)
      !== JSON.stringify(manifest.authoritative_current_usps_zip_denominator ?? null)) {
    throw new Error("Supplemental USPS operational ZIP evidence is inconsistent with the compatibility field.");
  }
  const failures = [];
  for (const artifact of manifest.artifacts ?? []) {
    const absolutePath = path.resolve(releaseDirectory, artifact.path);
    const relative = path.relative(releaseDirectory, absolutePath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      failures.push({ path: artifact.path, reason: "path escapes release directory" });
      continue;
    }
    try {
      const buffer = await readFile(absolutePath);
      if (buffer.byteLength !== artifact.bytes) failures.push({ path: artifact.path, reason: `expected ${artifact.bytes} bytes, found ${buffer.byteLength}` });
      else if (sha256(buffer) !== artifact.sha256) failures.push({ path: artifact.path, reason: "SHA-256 mismatch" });
    } catch (error) {
      failures.push({ path: artifact.path, reason: error.code === "ENOENT" ? "missing" : error.message });
    }
  }
  if (failures.length > 0) {
    const error = new Error(`Coverage-view verification failed for ${failures.length} artifact(s).`);
    error.failures = failures;
    throw error;
  }
  const artifacts = new Map(manifest.artifacts.map((artifact) => [artifact.artifact_type, artifact]));
  const expectedTypes = [
    "national-coverage-view-jsonl",
    "state-coverage-view-jsonl",
    "county-coverage-view-jsonl",
    "zip-coverage-view-jsonl",
    "source-coverage-view-jsonl",
    "coverage-gap-view-jsonl",
    "profile-geography-summary-json",
  ];
  for (const type of expectedTypes) if (!artifacts.has(type)) throw new Error(`Missing ${type} artifact.`);
  const coverage = manifest.coverage;
  const ohSupported = manifest.publisher.version === "2.11.0";
  async function verifiedViewText(filePath) {
    const descriptor = manifest.artifacts.find(a => path.resolve(releaseDirectory, a.path) === path.resolve(filePath));
    const { ohioBoundedRead } = await import("./oh-childcare-release.mjs");
    const bytes = await ohioBoundedRead(filePath, 200_000_000);
    if (!descriptor || bytes.length !== descriptor.bytes || sha256(bytes) !== descriptor.sha256) throw new Error("Ohio coverage consumed artifact bytes differ.");
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  }
  async function countJsonLines(filePath, visitor) {
    if (!ohSupported) return countJsonLinesStream(filePath, visitor);
    const descriptor = manifest.artifacts.find(a => path.resolve(releaseDirectory, a.path) === path.resolve(filePath));
    if (!descriptor || !Number.isSafeInteger(descriptor.bytes) || descriptor.bytes < 0 || descriptor.bytes > 2_000_000_000) throw new Error("Ohio coverage artifact size is outside its bounded contract.");
    const hash = createHash("sha256"), decoder = new TextDecoder("utf-8", { fatal: true });
    let bytes = 0, pending = "", count = 0;
    const consume = line => {
      if (line.length > 2_000_000) throw new Error("Ohio coverage row exceeds its bounded contract.");
      if (line.trim()) { visitor(JSON.parse(line)); count++; }
    };
    for await (const chunk of createReadStream(filePath)) {
      bytes += chunk.length;
      if (bytes > descriptor.bytes) throw new Error("Ohio coverage consumed artifact bytes differ.");
      hash.update(chunk); pending += decoder.decode(chunk, { stream: true });
      let end;
      while ((end = pending.indexOf("\n")) !== -1) { consume(pending.slice(0, end)); pending = pending.slice(end + 1); }
      if (pending.length > 2_000_000) throw new Error("Ohio coverage row exceeds its bounded contract.");
    }
    consume(pending + decoder.decode());
    if (bytes !== descriptor.bytes || hash.digest("hex") !== descriptor.sha256) throw new Error("Ohio coverage consumed artifact bytes differ.");
    return count;
  }
  const tnFresh = manifest.publisher.version === "2.10.0" || (ohSupported && manifest.tn_childcare_origin === "fresh");
  const tnSupported = manifest.publisher.version === "2.9.0" || tnFresh || (ohSupported && manifest.tn_childcare_origin === "recovered");
  let ohApi = null, ohContext = null;
  const ohViews = { national: [], states: [], counties: [], zips: [], sources: [], gaps: [] };
  if (ohSupported) {
    ohApi = await ohioCoverage();
    const a = artifacts.get("retained-registry-manifest-json"), dependency = manifest.dependencies.find(d => d.dataset_id === "national-business-registry");
    if (!a || manifest.artifacts.filter(v => v.artifact_type === "retained-registry-manifest-json").length !== 1
      || a.path !== "evidence/registry-manifest.json" || a.export_policy !== "internal" || a.sha256 !== dependency?.manifest_sha256
      || dependency.publisher_version !== "2.15.0") throw new Error("Ohio retained registry declaration differs.");
    const { ohioBoundedRead } = await import("./oh-childcare-release.mjs");
    const raw = await ohioBoundedRead(path.join(releaseDirectory, a.path), 4_000_000);
    if (raw.length !== a.bytes || sha256(raw) !== a.sha256) throw new Error("Ohio retained registry bytes changed.");
    const declared = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
    if (declared.dataset_id !== dependency.dataset_id || declared.release_id !== dependency.release_id || declared.status !== "published-partial"
      || declared.complete_national_business_registry !== false || declared.tn_childcare_origin !== manifest.tn_childcare_origin
      || declared.coverage.resolution_location_profiles !== coverage.location_profiles_assessed || declared.coverage.reporting_location_evidence !== coverage.reporting_only_locations_assessed
      || declared.coverage.physical_sites !== coverage.geographic_evidence_assessed) throw new Error("Ohio retained registry counts or origin differ.");
    ohContext = await ohApi.loadOhioCoverageContext(declared);
    if (declared.coverage.reporting_location_evidence_without_zip !== ohContext.total.without_zip + (coverage.tn_childcare_reporting?.without_zip ?? 0)) throw new Error("Ohio combined ZIP availability differs.");
  } else if (Object.hasOwn(manifest, "oh_childcare_source") || Object.hasOwn(manifest, "tn_childcare_origin") || Object.keys(coverage).some(k => k.startsWith("oh_childcare_"))) throw new Error("Ohio accounting requires coverage 2.11.");
  function trackOhio(kind, row) {
    if (!manifest.mn_construction_credential_reporting && Object.hasOwn(row, 'mn_construction_credential_reporting')) throw new Error('Minnesota credential view requires an explicit extension declaration.');
    if (!manifest.retained_childcare_reporting && Object.hasOwn(row, 'retained_childcare_reporting')) throw new Error('Retained childcare view requires an explicit extension declaration.');
    if (ohSupported) ohViews[kind].push(kind === "zips" ? { zip_code: row.zip_code,
      registry_coverage: { oh_childcare_center_site_count: row.registry_coverage.oh_childcare_center_site_count },
      source_contributions: { [OH_KEY]: row.source_contributions?.[OH_KEY] } } : row);
    else if (Object.hasOwn(row, "oh_childcare_reporting") || Object.hasOwn(row.registry_evidence ?? {}, "oh_childcare_reporting")
      || Object.hasOwn(row.registry_coverage ?? {}, "oh_childcare_center_site_count") || Object.hasOwn(row.source_contributions ?? {}, OH_KEY)
      || row.source_key === OH_KEY || row.profile_source_id === OH_SOURCE || row.scope_id === OH_KEY || row.evidence?.source_id === OH_SOURCE) throw new Error("Ohio view fields require coverage 2.11.");
  }
  const tnTotal = tnSupported ? checkTnReporting(coverage.tn_childcare_reporting) : emptyTnReporting();
  if (!tnSupported && ["tn_childcare_reporting", "tn_childcare_coordinate_assigned", "tn_childcare_without_county_assignment"].some(key => Object.hasOwn(coverage, key))) throw new Error("TN accounting requires coverage 2.9.");
  if (tnSupported && (!tnTotal.records || !Number.isSafeInteger(coverage.tn_childcare_coordinate_assigned) || coverage.tn_childcare_coordinate_assigned < 0
    || coverage.tn_childcare_coordinate_assigned > tnTotal.records - tnTotal.missing_points
    || coverage.tn_childcare_without_county_assignment !== tnTotal.records - coverage.tn_childcare_coordinate_assigned)) throw new Error("TN county accounting is invalid.");
  const tnStateTotals = [], tnCountyTotals = [], tnNationalRows = [];
  let tnSourceCount = 0, tnZipCount = 0, tnMissingGapCount = 0, tnSourceDeclaration;
  if (!tnSupported && !ohSupported && !manifest.retained_childcare_reporting && !manifest.mn_construction_credential_reporting && artifacts.has("retained-registry-manifest-json")) throw new Error("Retained registry declaration requires coverage 2.9 or an explicit retained reporting extension.");
  const reportingSupported = versionAtLeast(manifest.publisher.version, "2.8.0");
  const checkSplit = (row, total) => {
    if (!reportingSupported) return;
    if (![row?.matching_profile_count, row?.reporting_only_count].every((value) => Number.isSafeInteger(value) && value >= 0)
      || row.matching_profile_count + row.reporting_only_count !== total) throw new Error("Matching/reporting-only geography split is inconsistent.");
  };
  const nationalCount = await countJsonLines(path.join(releaseDirectory, artifacts.get("national-coverage-view-jsonl").path), (row) => {
    trackOhio("national", row);
    if (!tnSupported && (Object.hasOwn(row, "tn_childcare_reporting") || Object.hasOwn(row.registry_evidence ?? {}, "tn_childcare_reporting"))) throw new Error("TN national accounting requires coverage 2.9.");
    if (tnSupported) { checkTnReporting(row.tn_childcare_reporting ?? row.registry_evidence?.tn_childcare_reporting); tnNationalRows.push(row); }
    if (row.complete_all_businesses !== false || row.identity_semantics?.entity_resolution_applied !== false) throw new Error(`${row.view_id} has invalid completeness semantics.`);
    if (!row.nonemployer_baseline || row.nonemployer_baseline.current_named_business_status !== false) throw new Error(`${row.view_id} has invalid Nonemployer baseline semantics.`);
  });
  let stateNonemployerEstablishments = 0;
  let stateViewsWithNonemployerBaseline = 0;
  const stateCount = await countJsonLines(path.join(releaseDirectory, artifacts.get("state-coverage-view-jsonl").path), (row) => {
    trackOhio("states", row);
    if (!tnSupported && Object.hasOwn(row.registry_evidence, "tn_childcare_reporting")) throw new Error("TN state accounting requires coverage 2.9.");
    if (tnSupported) {
      const counts = checkTnReporting(row.registry_evidence.tn_childcare_reporting);
      if (counts.records !== (row.registry_evidence.source_profile_counts_by_reported_address_state[TN_SOURCE] ?? 0)) throw new Error("TN state counts differ.");
      tnStateTotals.push(counts);
    }
    checkSplit(row.registry_evidence, row.registry_evidence.reported_address_profile_count);
    if (row.complete_all_businesses !== false || row.employer_baseline_allocation !== null) throw new Error(`${row.view_id} has unsupported state completeness/allocation.`);
    if (!row.nonemployer_baseline || row.nonemployer_baseline.current_named_business_status !== false) throw new Error(`${row.view_id} has invalid Nonemployer semantics.`);
    if (row.nonemployer_baseline.status === "published-annual-aggregate") {
      stateViewsWithNonemployerBaseline += 1;
      stateNonemployerEstablishments += row.nonemployer_baseline.nonemployer_establishments;
    }
  });
  let countyAssignedProfiles = 0;
  let countyReportingOnly = 0;
  let countyNonemployerEstablishments = 0;
  let countyViewsWithNonemployerBaseline = 0;
  const countyCount = await countJsonLines(path.join(releaseDirectory, artifacts.get("county-coverage-view-jsonl").path), (row) => {
    trackOhio("counties", row);
    if (!tnSupported && Object.hasOwn(row.registry_evidence, "tn_childcare_reporting")) throw new Error("TN county accounting requires coverage 2.9.");
    if (tnSupported) {
      const counts = checkTnReporting(row.registry_evidence.tn_childcare_reporting);
      if (counts.missing_points !== 0 || counts.records !== (row.registry_evidence.source_profile_counts[TN_SOURCE] ?? 0)) throw new Error("TN county counts differ.");
      tnCountyTotals.push(counts);
    }
    checkSplit(row.registry_evidence, row.registry_evidence.coordinate_assigned_profile_count);
    if (row.complete_all_businesses !== false || row.zip_business_count_allocation !== null) throw new Error(`${row.view_id} has unsupported county completeness/allocation.`);
    countyAssignedProfiles += row.registry_evidence.coordinate_assigned_profile_count;
    countyReportingOnly += row.registry_evidence.reporting_only_count ?? 0;
    if (!row.nonemployer_baseline || row.nonemployer_baseline.current_named_business_status !== false) throw new Error(`${row.view_id} has invalid Nonemployer semantics.`);
    if (row.nonemployer_baseline.status === "published-annual-aggregate") {
      countyViewsWithNonemployerBaseline += 1;
      countyNonemployerEstablishments += row.nonemployer_baseline.nonemployer_establishments;
    }
  });
  let zipPhysicalSites = 0;
  let zipRowsWithZcta = 0;
  let zipRowsWithRecordContribution = 0;
  let zipRowsWithPublishedEmployerBaseline = 0;
  const zipKeys = new Set();
  const zipViewIds = new Set();
  const includedZctaCodes = new Set();
  const excludedSpatialZipCodes = new Set();
  const zipCount = await countJsonLines(path.join(releaseDirectory, artifacts.get("zip-coverage-view-jsonl").path), (row) => {
    trackOhio("zips", row);
    if (tnSupported) {
      const n = row.registry_coverage.tn_childcare_center_site_count;
      if (!Number.isSafeInteger(n) || n < 0 || (row.source_contributions?.[TN_KEY]?.reported_center_count ?? 0) !== n) throw new Error("TN ZIP contributions differ.");
      tnZipCount += n;
    }
    if (row.complete_all_businesses !== false || row.registry_coverage.complete_all_businesses !== false) throw new Error(`${row.view_id} has invalid ZIP completeness semantics.`);
    if (row.nonemployer_baseline_allocation !== null || !row.coverage_gap_codes.includes("no-census-nonemployer-zip-allocation")) throw new Error(`${row.view_id} has unsupported Nonemployer ZIP allocation.`);
    if (!/^\d{5}$/.test(row.zip_code) || row.view_id !== `zip:${row.zip_code}`) throw new Error(`${row.view_id} has an invalid ZIP5 key.`);
    if (zipKeys.has(row.zip_code)) throw new Error(`${row.view_id} duplicates ZIP5 key ${row.zip_code}.`);
    zipKeys.add(row.zip_code);
    if (zipViewIds.has(row.view_id)) throw new Error(`${row.view_id} is duplicated.`);
    zipViewIds.add(row.view_id);
    const includedInSpatialDenominator = hasZctaGeography(row);
    const expectedSpatialStatus = includedInSpatialDenominator ? "included" : "not-in-denominator";
    if (row.spatial_zip_polygon_membership?.status !== expectedSpatialStatus
        || row.spatial_zip_polygon_membership?.zip_code !== row.zip_code
        || row.spatial_zip_polygon_membership?.geography_release_id !== spatialZipPolygonDenominator.release_id
        || row.spatial_zip_polygon_membership?.match_method !== "exact-five-digit-zcta-code"
        || row.spatial_zip_polygon_membership?.zip4_polygon_applicability !== "not-applicable"
        || (includedInSpatialDenominator && row.geography?.geoid !== row.zip_code)
        || (includedInSpatialDenominator && row.spatial_zip_polygon_membership?.geo_id !== `zcta:${row.zip_code}`)
        || (!includedInSpatialDenominator && (row.spatial_zip_polygon_membership?.geo_id !== null || !row.coverage_gap_codes.includes("not-in-census-zcta5-polygon-denominator")))
        || row.coverage_gap_codes.includes("authoritative-current-usps-validity-unverified")) {
      throw new Error(`${row.view_id} has inconsistent Census ZCTA5 polygon membership.`);
    }
    if (includedInSpatialDenominator) includedZctaCodes.add(row.zip_code);
    else excludedSpatialZipCodes.add(row.zip_code);
    zipPhysicalSites += row.registry_coverage.physical_site_count;
    if (hasZctaGeography(row)) zipRowsWithZcta += 1;
    if (row.registry_coverage.status === "record-level-source-contribution") zipRowsWithRecordContribution += 1;
    if (hasPublishedEmployerBaseline(row)) zipRowsWithPublishedEmployerBaseline += 1;
  });
  let sourceProfileTotal = 0;
  let sourceReportingOnly = 0;
  let sourceCoordinateAssignedTotal = 0;
  let nonemployerSourceViews = 0;
  const sourceCount = await countJsonLines(path.join(releaseDirectory, artifacts.get("source-coverage-view-jsonl").path), (row) => {
    trackOhio("sources", row);
    if (row.source_key === TN_KEY || row.profile_source_id === TN_SOURCE) {
      tnSourceDeclaration = row.source_manifest;
      if (!tnSupported || row.source_key !== TN_KEY || row.profile_source_id !== TN_SOURCE || ++tnSourceCount !== 1
        || !isDeepStrictEqual(checkTnReporting(row.tn_childcare_reporting), tnTotal)
        || row.location_profile_geography.reporting_only_count !== tnTotal.records || row.location_profile_geography.matching_profile_count !== 0
        || row.location_profile_geography.coordinate_missing_count !== tnTotal.missing_points
        || row.location_profile_geography.coordinate_assigned_single_count !== coverage.tn_childcare_coordinate_assigned
        || row.zip_level_counts.reported_center_count !== tnTotal.with_zip) throw new Error("TN source accounting differs.");
    }
    checkSplit(row.location_profile_geography, row.location_profile_geography.profile_count);
    if (reportingSupported && row.location_profile_geography.reporting_only_count > 0
      && (row.identity_matching_eligible !== false || row.export_policy !== "local-review-only")) throw new Error("Reporting-only source lost its identity/export restrictions.");
    sourceProfileTotal += row.location_profile_geography.profile_count;
    sourceReportingOnly += row.location_profile_geography.reporting_only_count ?? 0;
    sourceCoordinateAssignedTotal += row.location_profile_geography.coordinate_assigned_single_count;
    if (row.source_kind === "aggregate-baseline") {
      nonemployerSourceViews += 1;
      if (row.source_key !== "census_nonemployer_statistics"
          || row.aggregate_baseline?.national_nonemployer_establishments !== coverage.national_nonemployer_establishments
          || row.aggregate_baseline?.zip_allocation_available !== false) {
        throw new Error("Census Nonemployer source view does not reconcile to the manifest.");
      }
    }
  });
  const gapCountsByType = {};
  const excludedSpatialGapZipCodes = new Set();
  const gapCount = await countJsonLines(path.join(releaseDirectory, artifacts.get("coverage-gap-view-jsonl").path), (row) => {
    trackOhio("gaps", row);
    if (row.gap_type === "reporting-source-zip-unavailable" && row.evidence?.source_id !== OH_SOURCE) {
      if (!tnSupported || !tnTotal.without_zip || ++tnMissingGapCount !== 1 || row.gap_id !== "gap:tn-childcare-source-zip-unavailable"
        || row.scope_type !== "source" || row.scope_id !== TN_KEY || row.evidence?.source_id !== TN_SOURCE || row.evidence.record_count !== tnTotal.without_zip
        || row.evidence.zip_inferred !== false || !isDeepStrictEqual(row.evidence.reasons, tnTotal.missing_zip_reasons)) throw new Error("TN missing ZIP gap differs.");
    }
    increment(gapCountsByType, row.gap_type);
    if (row.gap_type === "reported-zip5-not-in-census-zcta5-polygon-denominator") {
      if (row.scope_type !== "zip" || !/^\d{5}$/.test(row.scope_id ?? "") || row.gap_id !== `gap:reported-zip5-outside-zcta:${row.scope_id}`) {
        throw new Error(`${row.gap_id ?? "<unknown>"} has invalid excluded spatial ZIP scope.`);
      }
      if (excludedSpatialGapZipCodes.has(row.scope_id)) throw new Error(`${row.gap_id} duplicates excluded spatial ZIP ${row.scope_id}.`);
      excludedSpatialGapZipCodes.add(row.scope_id);
    }
  });
  for (const [actual, expected, label] of [
    [nationalCount, coverage.national_views, "national"],
    [stateCount, coverage.state_views, "state"],
    [countyCount, coverage.county_views, "county"],
    [zipCount, coverage.zip_views, "ZIP"],
    [sourceCount, coverage.source_views, "source"],
    [gapCount, coverage.gap_views, "gap"],
  ]) if (actual !== expected) throw new Error(`${label} view count ${actual} does not match manifest ${expected}.`);
  const profilePath = path.join(releaseDirectory, artifacts.get("profile-geography-summary-json").path);
  const profileSummary = JSON.parse(ohSupported ? await verifiedViewText(profilePath) : await readFile(profilePath, "utf8"));
  if (profileSummary.profile_count !== (reportingSupported ? coverage.geographic_evidence_assessed : coverage.location_profiles_assessed)) throw new Error("Profile summary count does not match manifest.");
  if (reportingSupported) {
    checkSplit(profileSummary, profileSummary.profile_count);
    if (profileSummary.matching_profile_count !== coverage.location_profiles_assessed
      || profileSummary.reporting_only_count !== coverage.reporting_only_locations_assessed
      || profileSummary.reporting_only_coordinate_assigned_count !== coverage.reporting_only_coordinate_assigned
      || profileSummary.coordinate_assigned_single_count !== coverage.geographic_evidence_coordinate_assigned
      || profileSummary.profile_count - profileSummary.coordinate_assigned_single_count !== coverage.geographic_evidence_without_valid_coordinate_assignment
      || profileSummary.coordinate_assigned_single_count - profileSummary.reporting_only_coordinate_assigned_count !== coverage.coordinate_assigned_profiles
      || profileSummary.matching_profile_count - coverage.coordinate_assigned_profiles !== coverage.profiles_without_valid_coordinate_assignment
      || sourceReportingOnly !== profileSummary.reporting_only_count
      || countyReportingOnly !== profileSummary.reporting_only_coordinate_assigned_count
      || coverage.reporting_only_identity_matching_eligible !== false) throw new Error("Reporting-only manifest counts or eligibility are inconsistent.");
  }
  if (zipRowsWithZcta !== coverage.zctas || zipRowsWithZcta !== coverage.zip_views_with_zcta_polygon) throw new Error("ZIP ZCTA coverage does not reconcile to the crosswalk denominator.");
  if (zipRowsWithZcta !== spatialZipPolygonDenominator.count
      || zipRowsWithZcta !== coverage.spatial_zip_polygon_denominator_count) {
    throw new Error("ZIP ZCTA coverage does not reconcile to the declared spatial ZIP polygon denominator.");
  }
  const actualZctaMemberSetSha256 = sha256(`${[...includedZctaCodes].sort().join("\n")}\n`);
  if (actualZctaMemberSetSha256 !== spatialZipPolygonDenominator.zcta_member_set_sha256) {
    throw new Error("ZIP ZCTA member set does not match the declared Census denominator set hash.");
  }
  if (zipCount - zipRowsWithZcta !== coverage.zip_views_without_zcta_polygon) throw new Error("ZIP no-ZCTA count does not match manifest.");
  if (zipRowsWithRecordContribution !== coverage.zip_views_with_record_level_source_contribution) throw new Error("ZIP contribution count does not match manifest.");
  if (zipCount - zipRowsWithRecordContribution !== coverage.zip_views_without_record_level_source_contribution) throw new Error("ZIP no-contribution count does not match manifest.");
  if (zipRowsWithPublishedEmployerBaseline !== coverage.zip_views_with_published_employer_baseline) throw new Error("ZIP employer-baseline count does not match manifest.");
  if (zipCount - zipRowsWithPublishedEmployerBaseline !== coverage.zip_views_without_published_employer_baseline) throw new Error("ZIP missing-employer-baseline count does not match manifest.");
  if (JSON.stringify(sortedObject(gapCountsByType)) !== JSON.stringify(coverage.gap_counts_by_type)) throw new Error("Coverage-gap type counts do not match manifest.");
  if (gapCountsByType["authoritative-current-usps-zip-denominator-unavailable"] !== undefined
      || (gapCountsByType["reported-zip5-not-in-census-zcta5-polygon-denominator"] ?? 0) !== zipCount - zipRowsWithZcta) {
    throw new Error("Coverage gaps do not match the Census ZCTA5 spatial denominator policy.");
  }
  if (excludedSpatialGapZipCodes.size !== excludedSpatialZipCodes.size
      || [...excludedSpatialZipCodes].some((zipCode) => !excludedSpatialGapZipCodes.has(zipCode))) {
    throw new Error("Excluded spatial ZIP rows do not exactly match their coverage-gap scopes.");
  }
  if (countyAssignedProfiles !== profileSummary.coordinate_assigned_single_count) throw new Error("County-assigned profile counts do not reconcile to the profile summary.");
  if (sourceProfileTotal !== profileSummary.profile_count) throw new Error("Source-view profile counts do not reconcile to the profile summary.");
  if (sourceCoordinateAssignedTotal !== profileSummary.coordinate_assigned_single_count) throw new Error("Source-view coordinate counts do not reconcile to the profile summary.");
  const registryDependency = manifest.dependencies.find((dependency) => dependency.dataset_id === "national-business-registry");
  if (!registryDependency) throw new Error("Registry dependency is missing.");
  if (ohSupported !== (registryDependency.publisher_version === "2.15.0") || tnSupported !== (["2.13.0", "2.14.0"].includes(registryDependency.publisher_version) || (ohSupported && manifest.tn_childcare_origin !== null))
    || tnSupported && registryDependency.publisher_version !== (ohSupported ? "2.15.0" : tnFresh ? "2.14.0" : "2.13.0")) throw new Error("TN coverage version and registry dependency differ.");
  if (tnSupported) {
    const artifact = artifacts.get("retained-registry-manifest-json");
    if (!artifact || artifact.path !== "evidence/registry-manifest.json" || artifact.bytes > 4_000_000 || artifact.export_policy !== "internal" || artifact.sha256 !== registryDependency.manifest_sha256) throw new Error("TN retained registry declaration differs from dependency.");
    const declared = JSON.parse(await readFile(path.join(releaseDirectory, artifact.path), "utf8"));
    const counts = declared.coverage;
    if (declared.dataset_id !== registryDependency.dataset_id || declared.release_id !== registryDependency.release_id
      || declared.publisher?.version !== (ohSupported ? "2.15.0" : tnFresh ? "2.14.0" : "2.13.0") || declared.publisher.id !== "national-business-registry" || declared.status !== "published-partial" || declared.complete_national_business_registry !== false
      || counts?.tn_childcare_center_sites !== tnTotal.records || counts.tn_childcare_center_sites_with_zip !== tnTotal.with_zip
      || counts.tn_childcare_center_sites_without_zip !== tnTotal.without_zip || counts.reporting_location_evidence_without_zip !== tnTotal.without_zip + (ohContext?.total.without_zip ?? 0)
      || !isDeepStrictEqual(counts.tn_childcare_missing_zip_reasons, tnTotal.missing_zip_reasons)
      || counts.resolution_location_profiles !== coverage.location_profiles_assessed || counts.reporting_location_evidence !== coverage.reporting_only_locations_assessed
      || counts.physical_sites !== coverage.geographic_evidence_assessed) throw new Error("TN totals differ from retained registry declaration.");
    const sourceDeclarations = declared.dependencies?.filter(row => row.dataset_id === TN_SOURCE) ?? [];
    if (sourceDeclarations.length !== 1 || !(tnFresh ? /^tn-childcare-[a-f0-9-]{36}$/ : /^tn-childcare-recovered-[a-f0-9-]{36}$/).test(sourceDeclarations[0].release_id ?? "")
      || !/^[a-f0-9]{64}$/.test(sourceDeclarations[0].manifest_sha256 ?? "")
      || !isDeepStrictEqual(sourceDeclarations[0], tnSourceDeclaration)) throw new Error("TN source declaration differs from retained registry dependency.");
    const countyTotals = sumTnReporting(tnCountyTotals);
    if (tnSourceCount !== 1 || tnZipCount !== tnTotal.with_zip || tnMissingGapCount !== Number(tnTotal.without_zip > 0)
      || !isDeepStrictEqual(sumTnReporting(tnStateTotals), tnTotal)
      || countyTotals.records !== coverage.tn_childcare_coordinate_assigned || countyTotals.with_zip > tnTotal.with_zip || countyTotals.without_zip > tnTotal.without_zip
      || Object.keys(tnTotal.missing_zip_reasons).some(reason => countyTotals.missing_zip_reasons[reason] > tnTotal.missing_zip_reasons[reason])
      || tnNationalRows.some(row => !isDeepStrictEqual(row.tn_childcare_reporting ?? row.registry_evidence?.tn_childcare_reporting, tnTotal))) throw new Error("TN reporting source/state/county/ZIP totals do not reconcile.");
  }
  const expectedPostalMigrationStatus = versionAtLeast(registryDependency.publisher_version, "2.10.0")
    ? "enforced-in-registry-release" : "pre-migration-registry-release";
  if (postalMigration.registry_publisher_version !== registryDependency.publisher_version
      || postalMigration.status !== expectedPostalMigrationStatus) {
    throw new Error("Normalized postal-field migration status does not match the registry dependency.");
  }
  const geographyDependency = manifest.dependencies.find((dependency) => dependency.dataset_id === "us-census-geography");
  if (!geographyDependency) throw new Error("Census geography dependency is missing.");
  if (spatialZipPolygonDenominator.dataset_id !== geographyDependency.dataset_id
      || spatialZipPolygonDenominator.release_id !== geographyDependency.release_id
      || spatialZipPolygonDenominator.geography_manifest_sha256 !== geographyDependency.manifest_sha256) {
    throw new Error("Spatial ZIP polygon denominator does not match the Census geography dependency.");
  }
  const nonemployerDependency = manifest.dependencies.find((dependency) => dependency.dataset_id === "census-nonemployer-baseline");
  if (!nonemployerDependency) throw new Error("Census Nonemployer dependency is missing.");
  if (nonemployerSourceViews !== 1) throw new Error(`Expected one Census Nonemployer source view, found ${nonemployerSourceViews}.`);
  if (stateViewsWithNonemployerBaseline !== coverage.state_views_with_published_nonemployer_baseline
      || stateCount - stateViewsWithNonemployerBaseline !== coverage.state_views_without_published_nonemployer_baseline) {
    throw new Error("State Nonemployer baseline coverage does not match the manifest.");
  }
  if (stateNonemployerEstablishments !== coverage.national_nonemployer_establishments) throw new Error("State Nonemployer establishments do not reconcile to national.");
  if (countyViewsWithNonemployerBaseline !== coverage.county_views_with_published_nonemployer_baseline
      || countyCount - countyViewsWithNonemployerBaseline !== coverage.county_views_without_published_nonemployer_baseline) {
    throw new Error("County Nonemployer baseline coverage does not match the manifest.");
  }
  if (countyNonemployerEstablishments !== coverage.county_nonemployer_establishments) throw new Error("County Nonemployer establishments do not match the manifest.");
  if (zipPhysicalSites + tnTotal.without_zip + (ohContext?.total.without_zip ?? 0) !== profileSummary.profile_count) throw new Error("ZIP physical-site totals do not reconcile to location profiles.");
  if (ohSupported) await ohApi.verifyOhioCoverageViews({ context: ohContext, manifest, views: ohViews, profileSummary });
  {
    const {verifyRetainedChildcareCoverageExtension} = await import('./retained-childcare-coverage-extension.mjs');
    await verifyRetainedChildcareCoverageExtension(manifest, releaseDirectory);
    const {verifyMnCredentialCoverageExtension} = await import('./mn-credential-coverage-extension.mjs');
    await verifyMnCredentialCoverageExtension(manifest, releaseDirectory);
  }
  return {
    dataset_id: manifest.dataset_id,
    release_id: manifest.release_id,
    artifact_count: manifest.artifacts.length,
    verified_bytes: manifest.artifacts.reduce((sum, artifact) => sum + artifact.bytes, 0),
    coverage: manifest.coverage,
  };
}
