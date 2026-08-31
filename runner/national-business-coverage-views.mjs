import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import RBush from "rbush";
import { geometryBounds } from "./census-geography.mjs";

export const COVERAGE_VIEWS_SCHEMA_VERSION = "1.0.0";
export const COVERAGE_VIEWS_TRANSFORMATION_VERSION = "national-business-coverage-views@1.5.0";

const SOURCE_KEY_TO_PROFILE_SOURCE_ID = Object.freeze({
  usda_snap_retailers: "usda-snap-current-retailers",
  cms_nppes_organizations: "cms-nppes-monthly-v2",
  fdic_bankfind: "fdic-bankfind-current-structure",
  ncua_quarterly_credit_unions: "ncua-final-quarterly-call-report",
  fsis_active_mpi_establishments: "usda-fsis-active-mpi-directory",
  epa_echo_active_facilities: "epa-echo-exporter-active-facility",
  fmcsa_active_us_company_census: "fmcsa-company-census-active-us-principal-office",
  irs_eo_bmf_organizations: "irs-eo-bmf-organizations",
});

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

function updateProfileStats(stats, sourceId, observedAt) {
  stats.profile_count += 1;
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
    gap_id: "gap:authoritative-usps-zip-denominator",
    gap_type: "authoritative-current-usps-zip-denominator-unavailable",
    scope_type: "national",
    scope_id: "registry-union",
    severity: "denominator-blocking",
    evidence: { authoritative_current_usps_zip_denominator: registry.manifest.coverage?.authoritative_current_usps_zip_denominator ?? null },
    consequence: "Percentages over all valid current ZIP Codes are prohibited.",
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
      state_and_county_view_basis: "physical-site location profiles",
    },
    consequence: "Organization-or-brand evidence such as IRS EO filing addresses and Connecticut, Colorado, Oregon, Iowa, New York, or Florida registry-reported addresses remains visible in national, ZIP, and source views but is not mixed into physical-site state or county counts.",
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
      gap_id: `gap:zip-no-zcta:${zip.zip_code}`,
      gap_type: "zip-without-2020-zcta-polygon",
      scope_type: "zip",
      scope_id: zip.zip_code,
      severity: "geography",
      evidence: { geography_status: zip.geography.status, baseline_coverage_status: zip.baseline_coverage_status },
      consequence: "No Census ZCTA polygon is available; the ZIP cannot inherit polygon jurisdiction relationships.",
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
  if (!stateIndexArtifact || !countyIndexArtifact) throw new Error("Geography normalized state/county indexes are required.");
  const [stateIndexRecords, countyIndexRecords] = await Promise.all([
    readJsonLines(artifactPath(geography, stateIndexArtifact)),
    readJsonLines(artifactPath(geography, countyIndexArtifact)),
  ]);
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
  let processedProfiles = 0;
  for (const artifact of profileArtifacts) {
    for await (const profile of streamGzipJsonLines(artifactPath(registry, artifact))) {
      processedProfiles += 1;
      const sourceId = profile.source?.source_id ?? "unknown-source";
      const observedAt = profile.observed_at ?? null;
      if (!sourceStats.has(sourceId)) sourceStats.set(sourceId, emptyProfileStats());
      const source = sourceStats.get(sourceId);
      updateProfileStats(profileSummary, sourceId, observedAt);
      updateProfileStats(source, sourceId, observedAt);
      const reportedState = stateByAbbreviation.get(profile.normalized_address?.state ?? profile.address?.state ?? "");
      if (reportedState) {
        profileSummary.reported_state_assigned_count += 1;
        source.reported_state_assigned_count += 1;
        const stats = stateStats.get(reportedState.geoid);
        updateProfileStats(stats, sourceId, observedAt);
      } else {
        profileSummary.reported_state_missing_or_unsupported_count += 1;
        source.reported_state_missing_or_unsupported_count += 1;
      }
      const location = profile.location;
      if (!location) {
        profileSummary.coordinate_missing_count += 1;
        source.coordinate_missing_count += 1;
        continue;
      }
      const assignment = assignPointToCounty(location.coordinates, countySpatialIndex);
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
      const county = countyStats.get(assignment.county.geoid);
      updateProfileStats(county, sourceId, observedAt);
      const coordinateState = stateStats.get(assignment.county.stateFips);
      coordinateState.coordinate_assigned_single_count += 1;
      increment(coordinateState.coordinate_source_counts, sourceId);
      updateObservationRange(coordinateState, observedAt);
      if (reportedState && reportedState.geoid !== assignment.county.stateFips) {
        profileSummary.reported_coordinate_state_conflict_count += 1;
        source.reported_coordinate_state_conflict_count += 1;
        stateStats.get(reportedState.geoid).reported_coordinate_state_conflict_count += 1;
        coordinateState.reported_coordinate_state_conflict_count += 1;
      }
      if (processedProfiles % 250_000 === 0) logger(`Geographically assessed ${processedProfiles}/${registry.manifest.coverage.resolution_location_profiles} profiles.`);
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
  const identitySemantics = {
    entity_resolution_applied: false,
    count_semantics: "source-preserving-provisional-location-profiles-not-deduplicated-businesses",
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
        source_profile_counts: sortedObject(stats.source_counts),
        earliest_observed_at: stats.earliest_observed_at,
        latest_observed_at: stats.latest_observed_at,
        subset_semantics: "only source-preserving profiles with one valid point falling in this generalized Census county polygon",
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
    const zcta = row.geography?.geoid ?? null;
    const relationships = zcta ? relationshipsByZcta.get(zcta) ?? [] : [];
    const gapCodes = ["authoritative-current-usps-validity-unverified", "incomplete-business-universe", "entity-resolution-not-applied", "no-census-nonemployer-zip-allocation"];
    if (row.registry_coverage.status !== "record-level-source-contribution") gapCodes.push("no-record-level-source-contribution");
    if (!zcta) gapCodes.push("no-2020-zcta-polygon");
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
        reported_state_assigned_count: profiles.reported_state_assigned_count,
        reported_state_missing_or_unsupported_count: profiles.reported_state_missing_or_unsupported_count,
        coordinate_present_valid_count: profiles.coordinate_present_valid_count,
        coordinate_missing_count: profiles.coordinate_missing_count,
        coordinate_invalid_count: profiles.coordinate_invalid_count,
        coordinate_assigned_single_count: profiles.coordinate_assigned_single_count,
        coordinate_unmatched_count: profiles.coordinate_unmatched_count,
        coordinate_ambiguous_boundary_count: profiles.coordinate_ambiguous_boundary_count,
        reported_coordinate_state_conflict_count: profiles.reported_coordinate_state_conflict_count,
        earliest_observed_at: profiles.earliest_observed_at,
        latest_observed_at: profiles.latest_observed_at,
      },
      complete_source_for_all_businesses: false,
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
      zip_union: {
        row_count: zipViews.length,
        rows_with_record_level_source_contribution: zipViews.filter((row) => row.registry_coverage.status === "record-level-source-contribution").length,
        rows_without_record_level_source_contribution: zipViews.filter((row) => row.registry_coverage.status !== "record-level-source-contribution").length,
        rows_with_zcta_polygon: zipViews.filter(hasZctaGeography).length,
        rows_without_zcta_polygon: zipViews.filter((row) => !hasZctaGeography(row)).length,
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
  const zipViewsWithZcta = zipViews.filter(hasZctaGeography).length;
  if (zipViewsWithZcta !== zctaSummaries.length) {
    throw new Error(`Registry ZIP views contain ${zipViewsWithZcta} ZCTA rows; the crosswalk contains ${zctaSummaries.length}.`);
  }
  const gapCountsByType = sortedObject(Object.fromEntries(
    [...Map.groupBy(gapViews, (gap) => gap.gap_type)].map(([gapType, rows]) => [gapType, rows.length]),
  ));

  const createdAt = now().toISOString();
  const runId = randomUUID();
  const releaseId = `national-business-coverage-views-${releaseTimestamp(createdAt)}-${runId.slice(0, 8)}`;
  const stagingDirectory = path.join(outputRoot, ".staging", runId);
  const artifacts = [];
  for (const [relativePath, records, artifactType] of [
    ["views/national.jsonl", nationalViews, "national-coverage-view-jsonl"],
    ["views/states.jsonl", stateViews, "state-coverage-view-jsonl"],
    ["views/counties.jsonl", countyViews, "county-coverage-view-jsonl"],
    ["views/zips.jsonl", zipViews, "zip-coverage-view-jsonl"],
    ["views/sources.jsonl", sourceViews, "source-coverage-view-jsonl"],
    ["views/coverage-gaps.jsonl", gapViews, "coverage-gap-view-jsonl"],
  ]) artifacts.push(await writeArtifact(stagingDirectory, relativePath, jsonLines(records), { artifact_type: artifactType, record_count: records.length }));
  artifacts.push(await writeArtifact(
    stagingDirectory,
    "derived/profile-geography-summary.json",
    json(profileSummary),
    { artifact_type: "profile-geography-summary-json", record_count: 1 },
  ));
  const dependencies = [registry, geography, crosswalk, resolution, benchmark, nonemployer].map((dataset) => ({
    dataset_id: dataset.manifest.dataset_id,
    release_id: dataset.manifest.release_id,
    manifest_sha256: dataset.manifestSha256,
  }));
  const manifest = {
    schema_version: COVERAGE_VIEWS_SCHEMA_VERSION,
    dataset_id: "national-business-coverage-views",
    publisher: { id: "national-business-coverage-views", version: "1.5.0" },
    release_id: releaseId,
    run_id: runId,
    created_at: createdAt,
    status: "published-partial-local-aggregate",
    complete_all_businesses: false,
    authoritative_current_usps_zip_denominator: registry.manifest.coverage.authoritative_current_usps_zip_denominator,
    entity_resolution_applied: false,
    export_policy: "local-aggregate-review-required",
    dependencies,
    coverage: {
      national_views: nationalViews.length,
      state_views: stateViews.length,
      county_views: countyViews.length,
      zip_views: zipViews.length,
      source_views: sourceViews.length,
      gap_views: gapViews.length,
      gap_counts_by_type: gapCountsByType,
      location_profiles_assessed: profileSummary.profile_count,
      coordinate_assigned_profiles: profileSummary.coordinate_assigned_single_count,
      profiles_without_valid_coordinate_assignment: profileSummary.profile_count - profileSummary.coordinate_assigned_single_count,
      zctas: zctaSummaries.length,
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
    },
    count_semantics: {
      national_state_zip: "source-preserving provisional registry evidence; not deduplicated businesses",
      county: "source-preserving profiles with one valid point assigned to a generalized Census county polygon",
      zcta_relationships: "polygon-area-only-not-business-location",
      nonemployer: "annual Census aggregate baseline for businesses with no paid employees; not named records, not current status, and never allocated to ZIPs",
      absence: "no integrated source evidence is not evidence of no active business",
    },
    limitations: [
      "This is a partial governed coverage view, not a complete census of active U.S. businesses.",
      "Entity-resolution decisions are not applied until independent labels, precision approval, and export-policy review pass.",
      "County profile counts cover only profiles with one valid coordinate assignment; ZIP counts are never area-weighted into counties.",
      "Source-specific active, authorized, registered, current, or filing evidence is not generalized into one universal operating-status claim.",
      "Oregon assumed business names remain provisional brands without inferred owners, organizations, physical sites, establishments, or relationships.",
      "Iowa home-office addresses and source geocodes remain organization-only registration evidence without inferred owners, physical sites, establishments, or relationships.",
      "New York monthly active-extract membership and reported locations remain organization-only registration evidence without inferred owners, physical sites, establishments, or relationships.",
      "Florida quarterly corporate records coded A and their principal addresses remain organization-only registration evidence without inferred owners, agents, officers, physical sites, establishments, or relationships.",
      "Current USPS ZIP validity remains unverified because no governed authorized operational ZIP denominator is integrated.",
      "Census ZCTAs are statistical areas and are not exact USPS ZIP delivery boundaries.",
      "Census Nonemployer Statistics is an annual aggregate for its no-paid-employee source universe and cannot be linked to named businesses or treated as current operating status.",
      "Census Nonemployer Statistics has no ZIP-level geography; national, state, and county totals are never allocated to ZIPs or ZCTAs.",
    ],
    artifacts: artifacts.sort((left, right) => left.path.localeCompare(right.path)),
  };
  await writeArtifact(stagingDirectory, "manifest.json", json(manifest));
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

async function countJsonLines(filePath, visitor = null) {
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
  if (manifest.status !== "published-partial-local-aggregate") throw new Error(`Unexpected release status ${manifest.status ?? "missing"}.`);
  if (manifest.complete_all_businesses !== false || manifest.entity_resolution_applied !== false) {
    throw new Error("Coverage views must not claim completeness or applied entity resolution.");
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
  const nationalCount = await countJsonLines(path.join(releaseDirectory, artifacts.get("national-coverage-view-jsonl").path), (row) => {
    if (row.complete_all_businesses !== false || row.identity_semantics?.entity_resolution_applied !== false) throw new Error(`${row.view_id} has invalid completeness semantics.`);
    if (!row.nonemployer_baseline || row.nonemployer_baseline.current_named_business_status !== false) throw new Error(`${row.view_id} has invalid Nonemployer baseline semantics.`);
  });
  let stateNonemployerEstablishments = 0;
  let stateViewsWithNonemployerBaseline = 0;
  const stateCount = await countJsonLines(path.join(releaseDirectory, artifacts.get("state-coverage-view-jsonl").path), (row) => {
    if (row.complete_all_businesses !== false || row.employer_baseline_allocation !== null) throw new Error(`${row.view_id} has unsupported state completeness/allocation.`);
    if (!row.nonemployer_baseline || row.nonemployer_baseline.current_named_business_status !== false) throw new Error(`${row.view_id} has invalid Nonemployer semantics.`);
    if (row.nonemployer_baseline.status === "published-annual-aggregate") {
      stateViewsWithNonemployerBaseline += 1;
      stateNonemployerEstablishments += row.nonemployer_baseline.nonemployer_establishments;
    }
  });
  let countyAssignedProfiles = 0;
  let countyNonemployerEstablishments = 0;
  let countyViewsWithNonemployerBaseline = 0;
  const countyCount = await countJsonLines(path.join(releaseDirectory, artifacts.get("county-coverage-view-jsonl").path), (row) => {
    if (row.complete_all_businesses !== false || row.zip_business_count_allocation !== null) throw new Error(`${row.view_id} has unsupported county completeness/allocation.`);
    countyAssignedProfiles += row.registry_evidence.coordinate_assigned_profile_count;
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
  const zipCount = await countJsonLines(path.join(releaseDirectory, artifacts.get("zip-coverage-view-jsonl").path), (row) => {
    if (row.complete_all_businesses !== false || row.registry_coverage.complete_all_businesses !== false) throw new Error(`${row.view_id} has invalid ZIP completeness semantics.`);
    if (row.nonemployer_baseline_allocation !== null || !row.coverage_gap_codes.includes("no-census-nonemployer-zip-allocation")) throw new Error(`${row.view_id} has unsupported Nonemployer ZIP allocation.`);
    zipPhysicalSites += row.registry_coverage.physical_site_count;
    if (hasZctaGeography(row)) zipRowsWithZcta += 1;
    if (row.registry_coverage.status === "record-level-source-contribution") zipRowsWithRecordContribution += 1;
    if (hasPublishedEmployerBaseline(row)) zipRowsWithPublishedEmployerBaseline += 1;
  });
  let sourceProfileTotal = 0;
  let sourceCoordinateAssignedTotal = 0;
  let nonemployerSourceViews = 0;
  const sourceCount = await countJsonLines(path.join(releaseDirectory, artifacts.get("source-coverage-view-jsonl").path), (row) => {
    sourceProfileTotal += row.location_profile_geography.profile_count;
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
  const gapCount = await countJsonLines(path.join(releaseDirectory, artifacts.get("coverage-gap-view-jsonl").path), (row) => {
    increment(gapCountsByType, row.gap_type);
  });
  for (const [actual, expected, label] of [
    [nationalCount, coverage.national_views, "national"],
    [stateCount, coverage.state_views, "state"],
    [countyCount, coverage.county_views, "county"],
    [zipCount, coverage.zip_views, "ZIP"],
    [sourceCount, coverage.source_views, "source"],
    [gapCount, coverage.gap_views, "gap"],
  ]) if (actual !== expected) throw new Error(`${label} view count ${actual} does not match manifest ${expected}.`);
  const profileSummary = JSON.parse(await readFile(path.join(releaseDirectory, artifacts.get("profile-geography-summary-json").path), "utf8"));
  if (profileSummary.profile_count !== coverage.location_profiles_assessed) throw new Error("Profile summary count does not match manifest.");
  if (zipRowsWithZcta !== coverage.zctas || zipRowsWithZcta !== coverage.zip_views_with_zcta_polygon) throw new Error("ZIP ZCTA coverage does not reconcile to the crosswalk denominator.");
  if (zipCount - zipRowsWithZcta !== coverage.zip_views_without_zcta_polygon) throw new Error("ZIP no-ZCTA count does not match manifest.");
  if (zipRowsWithRecordContribution !== coverage.zip_views_with_record_level_source_contribution) throw new Error("ZIP contribution count does not match manifest.");
  if (zipCount - zipRowsWithRecordContribution !== coverage.zip_views_without_record_level_source_contribution) throw new Error("ZIP no-contribution count does not match manifest.");
  if (zipRowsWithPublishedEmployerBaseline !== coverage.zip_views_with_published_employer_baseline) throw new Error("ZIP employer-baseline count does not match manifest.");
  if (zipCount - zipRowsWithPublishedEmployerBaseline !== coverage.zip_views_without_published_employer_baseline) throw new Error("ZIP missing-employer-baseline count does not match manifest.");
  if (JSON.stringify(sortedObject(gapCountsByType)) !== JSON.stringify(coverage.gap_counts_by_type)) throw new Error("Coverage-gap type counts do not match manifest.");
  if (countyAssignedProfiles !== profileSummary.coordinate_assigned_single_count) throw new Error("County-assigned profile counts do not reconcile to the profile summary.");
  if (sourceProfileTotal !== profileSummary.profile_count) throw new Error("Source-view profile counts do not reconcile to the profile summary.");
  if (sourceCoordinateAssignedTotal !== profileSummary.coordinate_assigned_single_count) throw new Error("Source-view coordinate counts do not reconcile to the profile summary.");
  const registryDependency = manifest.dependencies.find((dependency) => dependency.dataset_id === "national-business-registry");
  if (!registryDependency) throw new Error("Registry dependency is missing.");
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
  if (zipPhysicalSites !== profileSummary.profile_count) throw new Error("ZIP physical-site totals do not reconcile to location profiles.");
  return {
    dataset_id: manifest.dataset_id,
    release_id: manifest.release_id,
    artifact_count: manifest.artifacts.length,
    verified_bytes: manifest.artifacts.reduce((sum, artifact) => sum + artifact.bytes, 0),
    coverage: manifest.coverage,
  };
}
