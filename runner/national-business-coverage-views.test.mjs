import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assignPointToCounty,
  buildNationalBusinessCoverageViews,
  verifyNationalBusinessCoverageViewsRelease,
} from "./national-business-coverage-views.mjs";

function polygonFeature(properties, west = -90, south = 30, east = -89, north = 31) {
  return {
    type: "Feature",
    properties,
    geometry: {
      type: "Polygon",
      coordinates: [[
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ]],
    },
  };
}

function countyCandidate(geoid, stateFips, feature) {
  return { geoid, stateFips, wrapped: false, feature };
}

function json(value) {
  return `${JSON.stringify(value)}\n`;
}

function jsonLines(values) {
  return values.length ? `${values.map((value) => JSON.stringify(value)).join("\n")}\n` : "";
}

async function writeArtifact(releaseDirectory, relativePath, value, metadata = {}) {
  const filePath = path.join(releaseDirectory, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value);
  return { path: relativePath.replaceAll("\\", "/"), bytes: Buffer.byteLength(value), ...metadata };
}

async function publishFixture(root, datasetId, releaseId, manifest) {
  const releaseDirectory = path.join(root, "releases", releaseId);
  await mkdir(releaseDirectory, { recursive: true });
  await writeFile(path.join(releaseDirectory, "manifest.json"), json({
    schema_version: "1.0.0",
    dataset_id: datasetId,
    release_id: releaseId,
    status: "published",
    artifacts: [],
    ...manifest,
  }));
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, "current.json"), json({
    dataset_id: datasetId,
    release_id: releaseId,
    manifest: `releases/${releaseId}/manifest.json`,
  }));
  return { releaseDirectory, pointerPath: path.join(root, "current.json") };
}

test("assigns an interior point and refuses a point matching multiple counties", () => {
  const leftFeature = polygonFeature({ GEOID: "01001" }, -90, 30, -89, 31);
  const rightFeature = polygonFeature({ GEOID: "01003" }, -89, 30, -88, 31);
  const candidates = [
    countyCandidate("01001", "01", leftFeature),
    countyCandidate("01003", "01", rightFeature),
  ];
  const index = { search: () => candidates };
  const assigned = assignPointToCounty([-89.5, 30.5], index);
  assert.equal(assigned.status, "assigned-single-county");
  assert.equal(assigned.county.geoid, "01001");
  const boundary = assignPointToCounty([-89, 30.5], index);
  assert.equal(boundary.status, "ambiguous-county-boundary");
  assert.deepEqual(boundary.candidate_geoids, ["01001", "01003"]);
  assert.equal(assignPointToCounty([999, 30], index).status, "invalid-coordinate");
});

test("publishes and verifies governed national through ZIP coverage views", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "datahub-coverage-views-"));
  context.after(() => rm(root, { recursive: true, force: true }));

  const geographyRoot = path.join(root, "geography");
  const geographyReleaseId = "geography-fixture";
  const geographyRelease = path.join(geographyRoot, "releases", geographyReleaseId);
  const stateIndex = [{
    geo_id: "state:01",
    geo_type: "state",
    geoid: "01",
    name: "Fixture State",
    postal_abbreviation: "AA",
    state_equivalent_kind: "state",
    is_50_states_or_dc: true,
    centroid: [-89.5, 30.5],
    bbox: [-90, 30, -89, 31],
    geometry_file: "source/states.geojson",
  }];
  const countyIndex = [{
    geo_id: "county:01001",
    geo_type: "county",
    geoid: "01001",
    name: "Fixture County",
    state_fips: "01",
    county_fips: "001",
    centroid: [-89.5, 30.5],
    bbox: [-90, 30, -89, 31],
    geometry_file: "source/counties/state=01.geojson",
  }];
  const geographyArtifacts = [
    await writeArtifact(geographyRelease, "derived/index/states.jsonl", jsonLines(stateIndex)),
    await writeArtifact(geographyRelease, "derived/index/counties.jsonl", jsonLines(countyIndex)),
    await writeArtifact(
      geographyRelease,
      "source/counties/state=01.geojson",
      json({ type: "FeatureCollection", features: [polygonFeature({ GEOID: "01001" })] }),
      { geography_type: "county" },
    ),
  ];
  const geography = await publishFixture(geographyRoot, "us-census-geography", geographyReleaseId, {
    complete_national_release: true,
    artifacts: geographyArtifacts,
  });

  const crosswalkRoot = path.join(root, "crosswalk");
  const crosswalkReleaseId = "crosswalk-fixture";
  const crosswalkRelease = path.join(crosswalkRoot, "releases", crosswalkReleaseId);
  const relationship = {
    zcta: "12345",
    county_geoid: "01001",
    county_geo_id: "county:01001",
    state_fips: "01",
    state_geo_id: "state:01",
    intersection_area_m2: 100,
    raw_share_of_zcta_polygon_area: 1,
    normalized_share_of_matched_zcta_area: 1,
    material_intersection: true,
  };
  const zctaSummary = { zcta: "12345", overlay_status: "complete-within-tolerance" };
  const crosswalkArtifacts = [
    await writeArtifact(crosswalkRelease, "derived/relationships.jsonl", jsonLines([relationship]), { artifact_type: "zcta-county-area-weights" }),
    await writeArtifact(crosswalkRelease, "derived/zcta-summary.jsonl", jsonLines([zctaSummary]), { artifact_type: "zcta-overlay-summary" }),
  ];
  const crosswalk = await publishFixture(crosswalkRoot, "us-census-zcta-jurisdiction-crosswalk", crosswalkReleaseId, {
    complete_national_release: true,
    upstream: { release_id: geographyReleaseId },
    artifacts: crosswalkArtifacts,
  });

  const registryRoot = path.join(root, "registry");
  const registryReleaseId = "registry-fixture";
  const registryRelease = path.join(registryRoot, "releases", registryReleaseId);
  const sourceContribution = {
    usda_snap_retailers: {
      record_count: 2,
      source_release_id: "snap-fixture",
      source_updated_at: "2026-08-01T00:00:00.000Z",
    },
    co_business_registry_good_standing_or_delinquent_organizations: {
      organization_principal_office_address_count: 3,
      source_release_id: "co-business-fixture",
      source_updated_at: "2026-08-30T11:20:54.000Z",
    },
    fl_business_registry_quarterly_active_entities: {
      organization_reported_principal_address_count: 2,
      source_release_id: "fl-business-fixture",
      source_modified_at: "2026-07-10T17:41:15.000Z",
    },
    pa_business_registry_active_registrations: {
      organization_reported_business_address_count: 2,
      source_release_id: "pa-business-fixture",
      source_rows_updated_at: "2026-08-04T14:12:34.000Z",
    },
    wa_lni_active_contractor_organizations: {
      active_contractor_organization_mailing_address_count: 2,
      source_release_id: "wa-lni-contractor-fixture",
      source_rows_updated_at: "2026-09-01T19:35:41.000Z",
      record_level_distribution: "local-review-only",
      aggregate_distribution: "public-under-pddl-with-attribution-and-semantic-limitations",
      general_operating_status_inferred: false,
    },
    la_active_business_location_accounts: {
      registered_business_location_count: 1,
      source_release_id: "la-active-business-fixture",
      source_rows_updated_at: "2026-08-15T15:37:22.000Z",
      record_level_distribution: "local-review-only",
    },
    tx_active_sales_tax_permit_outlets: {
      permitted_outlet_count: 2,
      source_release_id: "tx-sales-tax-fixture",
      source_rows_updated_at: "2026-08-29T08:21:49.000Z",
      record_level_distribution: "local-review-only",
    },
    ak_active_business_licenses: {
      active_license_organization_reported_address_count: 1,
      provisional_physical_site_count: 1,
      source_release_id: "ak-business-fixture",
      source_observed_from: "2026-09-01T11:59:00.000Z",
      source_observed_through: "2026-09-01T12:00:00.000Z",
      record_level_distribution: "local-review-only",
      aggregate_distribution: "local-aggregate-review-required",
    },
    chicago_active_business_license_sites: {
      licensed_site_count: 1,
      source_release_id: "chicago-license-fixture",
      source_rows_updated_at: "2026-08-29T09:58:27.000Z",
      source_filter_reference_date: "2026-08-31",
      record_level_distribution: "local-review-only",
    },
    dc_basic_business_license_sites: {
      licensed_site_count: 1,
      source_release_id: "dc-license-fixture",
      source_refreshed_at: "2026-09-01T04:00:00.000Z",
      record_level_distribution: "local-review-only",
      aggregate_distribution: "public-with-cc-by-4.0-attribution-and-source-limitations",
    },
    california_abc_active_issued_license_sites: {
      licensed_site_count: 1,
      source_release_id: "ca-abc-license-fixture",
      source_modified_at: "2026-09-01T10:50:26.000Z",
      record_level_distribution: "local-review-only",
      aggregate_distribution: "public-with-attribution-and-source-limitations",
      general_operating_status_inferred: false,
    },
    nyc_dcwp_active_license_sites: {
      licensed_site_count: 1,
      source_release_id: "nyc-dcwp-license-fixture",
      source_rows_updated_at: "2026-08-20T13:24:53.000Z",
      record_level_distribution: "local-review-only",
    },
  };
  const zipRows = [
    {
      zip_code: "12345",
      registry_coverage: {
        status: "record-level-source-contribution",
        complete_all_businesses: false,
        physical_site_count: 8,
        establishment_count: 8,
      },
      source_contributions: sourceContribution,
      current_usps_validity: { status: "unverified" },
      geography: { status: "2020-zcta-polygon-available", geoid: "12345", geo_id: "zcta:12345" },
      employer_baseline: { status: "published", establishments: 4 },
      baseline_coverage_status: "zbp-and-zcta",
    },
    {
      zip_code: "54321",
      registry_coverage: {
        status: "denominator-only-no-record-level-contribution",
        complete_all_businesses: false,
        physical_site_count: 0,
        establishment_count: 0,
      },
      source_contributions: {
        usda_snap_retailers: {
          record_count: 0,
          source_release_id: "snap-fixture",
          source_updated_at: "2026-08-01T00:00:00.000Z",
        },
      },
      current_usps_validity: { status: "unverified" },
      geography: { status: "no-2020-zcta-polygon", geoid: null, geo_id: null },
      employer_baseline: null,
      baseline_coverage_status: "outside-zbp-zcta-union",
    },
  ];
  const registryArtifacts = [
    await writeArtifact(registryRelease, "derived/zip-coverage.jsonl", jsonLines(zipRows), {
      artifact_type: "registry-zip-coverage-jsonl",
      record_count: zipRows.length,
    }),
  ];
  const profiles = [
    {
      profile_id: "profile:1",
      normalized_address: { state: "AA" },
      location: { type: "Point", coordinates: [-89.5, 30.5] },
      observed_at: "2026-08-01T00:00:00.000Z",
      source: { source_id: "usda-snap-current-retailers" },
    },
    {
      profile_id: "profile:2",
      normalized_address: { state: "AA" },
      location: null,
      observed_at: "2026-08-02T00:00:00.000Z",
      source: { source_id: "usda-snap-current-retailers" },
    },
    {
      profile_id: "profile:3",
      normalized_address: { state: "AA" },
      location: null,
      observed_at: "2026-08-03T00:00:00.000Z",
      source: { source_id: "los-angeles-office-of-finance-active-businesses" },
    },
    {
      profile_id: "profile:4",
      normalized_address: { state: "AA" },
      location: null,
      observed_at: "2026-08-04T00:00:00.000Z",
      source: { source_id: "city-of-chicago-bacp-current-active-business-licenses" },
    },
    {
      profile_id: "profile:5",
      normalized_address: { state: "AA" },
      location: null,
      observed_at: "2026-08-05T00:00:00.000Z",
      source: { source_id: "nyc-dcwp-issued-licenses-active-premises" },
    },
    {
      profile_id: "profile:6",
      normalized_address: { state: "AA" },
      location: null,
      observed_at: "2026-09-01T12:00:00.000Z",
      source: { source_id: "alaska-dcced-active-business-licenses" },
    },
    {
      profile_id: "profile:7",
      normalized_address: { state: "AA" },
      location: null,
      observed_at: "2026-09-01T12:30:00.000Z",
      source: { source_id: "dc-dlcp-active-basic-business-licenses" },
    },
    {
      profile_id: "profile:8",
      normalized_address: { state: "AA" },
      location: null,
      observed_at: "2026-09-01T10:50:26.000Z",
      source: { source_id: "california-abc-daily-active-licenses" },
    },
  ];
  for (let partition = 0; partition < 100; partition += 1) {
    const rows = partition === 12 ? profiles : [];
    registryArtifacts.push(await writeArtifact(
      registryRelease,
      `resolution/location-profiles/zip2=${String(partition).padStart(2, "0")}.jsonl.gz`,
      gzipSync(jsonLines(rows)),
      { artifact_type: "entity-resolution-location-profile-jsonl-gzip", record_count: rows.length },
    ));
  }
  const registry = await publishFixture(registryRoot, "national-business-registry", registryReleaseId, {
    publisher: { id: "national-business-registry", version: "2.8.0" },
    status: "published-partial",
    complete_national_business_registry: false,
    coverage: {
      resolution_location_profiles: 8,
      physical_sites: 8,
      establishments: 8,
      zip_union_records: 2,
      zips_with_record_level_contributions: 1,
      authoritative_current_usps_zip_denominator: null,
      de_business_license_source_current_license_rows: 7,
      de_business_license_accepted_current_license_rows: 6,
      de_business_license_current_organization_records: 5,
      de_business_license_quarantined_source_records: 1,
      de_business_license_quarantined_license_groups: 1,
      de_business_license_eligible_reported_us_business_addresses: 4,
      ak_active_business_license_source_rows: 3,
      ak_active_business_license_organizations: 2,
      ak_active_business_license_provisional_physical_sites: 1,
      ak_active_business_license_organizations_without_eligible_physical_site: 1,
      ak_active_business_license_reported_us_address_zip_contributions: 1,
      ak_active_business_license_quarantined_source_records: 1,
      ak_active_business_license_accepted_naics_pairs: 2,
      co_business_registry_good_standing_or_delinquent_organization_records: 3,
      co_business_registry_quarantined_source_records: 1,
      co_business_registry_eligible_reported_us_business_addresses: 3,
      fl_business_registry_source_records: 10,
      fl_business_registry_active_source_records: 4,
      fl_business_registry_inactive_source_records_excluded: 6,
      fl_business_registry_active_organization_records: 3,
      fl_business_registry_quarantined_source_records: 1,
      fl_business_registry_eligible_reported_us_principal_addresses: 2,
      pa_business_registry_source_active_registration_rows: 4,
      pa_business_registry_active_organization_records: 3,
      pa_business_registry_duplicate_filing_number_groups: 1,
      pa_business_registry_duplicate_rows_collapsed: 1,
      pa_business_registry_eligible_reported_us_business_addresses: 2,
      pa_business_registry_source_geocoded_reported_business_addresses: 2,
      pa_business_registry_reported_pa_address_geocodes_outside_broad_pa_bounds: 1,
      wa_lni_active_contractor_license_source_rows: 4,
      wa_lni_active_contractor_organizations: 3,
      wa_lni_active_contractor_license_activities: 4,
      wa_lni_active_contractor_grouped_multi_license_organizations: 1,
      wa_lni_active_contractor_reported_business_names: 3,
      wa_lni_active_contractor_reported_mailing_addresses: 3,
      wa_lni_active_contractor_eligible_reported_us_mailing_addresses: 2,
      wa_lni_active_contractor_organizations_without_eligible_us_zip_address: 1,
      la_active_business_source_location_accounts: 2,
      la_active_business_normalized_us_location_accounts: 1,
      la_active_business_quarantined_source_records: 1,
      la_active_business_source_geocoded_locations: 1,
      la_active_business_in_city_council_district_locations: 1,
      la_active_business_out_of_city_locations: 0,
      la_active_business_suspect_in_city_coordinates: 0,
      tx_active_sales_tax_source_outlet_permits: 3,
      tx_active_sales_tax_normalized_outlet_permits: 2,
      tx_active_sales_tax_unique_taxpayers: 1,
      tx_active_sales_tax_quarantined_source_records: 1,
      tx_active_sales_tax_inside_city_limits_outlets: 1,
      tx_active_sales_tax_outside_city_limits_outlets: 1,
      tx_active_sales_tax_city_limits_unreported_outlets: 0,
      chicago_active_business_license_source_records: 4,
      chicago_active_business_license_accepted_records: 3,
      chicago_active_business_license_normalized_sites: 1,
      chicago_active_business_license_unique_accounts: 1,
      chicago_active_business_license_quarantined_source_records: 1,
      chicago_active_business_license_quarantined_site_groups: 1,
      chicago_active_business_license_source_geocoded_sites: 1,
      chicago_active_business_license_in_chicago_ward_sites: 1,
      chicago_active_business_license_outside_or_unreported_ward_sites: 0,
      dc_basic_business_license_source_rows: 4,
      dc_basic_business_license_accepted_rows: 3,
      dc_basic_business_license_normalized_sites: 1,
      dc_basic_business_license_organizations: 1,
      dc_basic_business_license_quarantined_source_records: 1,
      dc_basic_business_license_quarantined_customer_groups: 1,
      dc_basic_business_license_source_geocoded_sites: 1,
      dc_basic_business_license_source_coordinate_conflict_sites: 0,
      dc_basic_business_license_in_dc_premise_sites: 1,
      dc_basic_business_license_outside_dc_premise_sites: 0,
      ca_abc_source_records: 6,
      ca_abc_selected_active_issued_license_rows: 4,
      ca_abc_excluded_source_rows: 2,
      ca_abc_active_issued_license_normalized_sites: 1,
      ca_abc_active_issued_license_organizations: 1,
      ca_abc_active_issued_license_activities: 3,
      ca_abc_quarantined_source_rows: 1,
      ca_abc_quarantined_file_groups: 1,
      ca_abc_source_active_rows_with_expiration_before_observation: 1,
      nyc_dcwp_active_license_source_records: 4,
      nyc_dcwp_active_license_accepted_records: 3,
      nyc_dcwp_active_license_normalized_sites: 1,
      nyc_dcwp_active_license_unique_business_ids: 1,
      nyc_dcwp_active_license_quarantined_source_records: 1,
      nyc_dcwp_active_license_quarantined_business_groups: 1,
      nyc_dcwp_active_license_source_geocoded_sites: 1,
      nyc_dcwp_active_license_in_nyc_borough_sites: 1,
      nyc_dcwp_active_license_outside_or_unreported_nyc_borough_sites: 0,
    },
    limitations: [],
    artifacts: registryArtifacts,
  });

  const resolution = await publishFixture(path.join(root, "resolution"), "national-business-entity-resolution", "resolution-fixture", {
    status: "published-reviewable-partial",
    dependency: { dataset_id: "national-business-registry", release_id: registryReleaseId },
    coverage: { profiles: 8 },
  });
  const benchmark = await publishFixture(path.join(root, "benchmark"), "national-business-entity-resolution-benchmark", "benchmark-fixture", {
    status: "awaiting-independent-labels",
    dependencies: {
      registry: { dataset_id: "national-business-registry", release_id: registryReleaseId },
      resolution: { dataset_id: "national-business-entity-resolution", release_id: "resolution-fixture" },
    },
    coverage: { submitted_labels: 0, benchmark_gate_passed: false },
  });

  const nonemployerRoot = path.join(root, "nonemployer");
  const nonemployerReleaseId = "nonemployer-fixture";
  const nonemployerRelease = path.join(nonemployerRoot, "releases", nonemployerReleaseId);
  const nonemployerTotals = [
    {
      schema_version: "1.0.0",
      geography_type: "national",
      geoid: "US",
      state_fips: null,
      county_fips: null,
      geography_name: "United States",
      reference_year: 2023,
      observation_period: { from: "2023-01-01", to: "2023-12-31" },
      status: "published-annual-aggregate",
      universe: "businesses-with-no-paid-employees-subject-to-federal-income-tax-and-meeting-source-receipts-threshold",
      nonemployer_establishments: 5,
      receipts_thousands_usd: 100,
      receipts_flag: null,
      receipts_noise_range_thousands_usd: 0,
      receipts_noise_range_flag: "G",
      provenance: { policy_id: "us-census-nonemployer" },
    },
    {
      schema_version: "1.0.0",
      geography_type: "state",
      geoid: "01",
      state_fips: "01",
      county_fips: null,
      geography_name: "Fixture State",
      reference_year: 2023,
      observation_period: { from: "2023-01-01", to: "2023-12-31" },
      status: "published-annual-aggregate",
      universe: "businesses-with-no-paid-employees-subject-to-federal-income-tax-and-meeting-source-receipts-threshold",
      nonemployer_establishments: 5,
      receipts_thousands_usd: 100,
      receipts_flag: null,
      receipts_noise_range_thousands_usd: 0,
      receipts_noise_range_flag: "G",
      provenance: { policy_id: "us-census-nonemployer" },
    },
    {
      schema_version: "1.0.0",
      geography_type: "county",
      geoid: "01001",
      state_fips: "01",
      county_fips: "001",
      geography_name: "Fixture County",
      reference_year: 2023,
      observation_period: { from: "2023-01-01", to: "2023-12-31" },
      status: "published-annual-aggregate",
      universe: "businesses-with-no-paid-employees-subject-to-federal-income-tax-and-meeting-source-receipts-threshold",
      nonemployer_establishments: 4,
      receipts_thousands_usd: 80,
      receipts_flag: null,
      receipts_noise_range_thousands_usd: 0,
      receipts_noise_range_flag: "G",
      provenance: { policy_id: "us-census-nonemployer" },
    },
  ];
  const nonemployerArtifact = await writeArtifact(
    nonemployerRelease,
    "derived/geography-totals.jsonl",
    jsonLines(nonemployerTotals),
    { artifact_type: "nonemployer-geography-totals-jsonl", record_count: nonemployerTotals.length },
  );
  const nonemployer = await publishFixture(nonemployerRoot, "census-nonemployer-baseline", nonemployerReleaseId, {
    status: "published-annual-aggregate",
    complete_source_release: true,
    reference_year: 2023,
    geography_scope: "50-states-and-district-of-columbia",
    coverage: {
      state_totals: 1,
      county_totals: 1,
      national_nonemployer_establishments: 5,
      county_nonemployer_establishments: 4,
      nonemployer_establishments_not_allocated_to_county: 1,
    },
    artifacts: [nonemployerArtifact],
  });

  const outputRoot = path.join(root, "coverage-views");
  const result = await buildNationalBusinessCoverageViews({
    registryPointerPath: registry.pointerPath,
    geographyPointerPath: geography.pointerPath,
    crosswalkPointerPath: crosswalk.pointerPath,
    resolutionPointerPath: resolution.pointerPath,
    benchmarkPointerPath: benchmark.pointerPath,
    nonemployerPointerPath: nonemployer.pointerPath,
    outputRoot,
    now: () => new Date("2026-08-30T12:00:00.000Z"),
    logger: () => {},
  });
  const verification = await verifyNationalBusinessCoverageViewsRelease(path.join(result.releaseDirectory, "manifest.json"));
  assert.equal(result.manifest.publisher.version, "2.5.0");
  assert.equal(verification.coverage.national_views, 3);
  assert.equal(verification.coverage.state_views, 1);
  assert.equal(verification.coverage.county_views, 1);
  assert.equal(verification.coverage.zip_views, 2);
  assert.equal(verification.coverage.source_views, 13);
  assert.equal(verification.coverage.location_profiles_assessed, 8);
  assert.equal(verification.coverage.coordinate_assigned_profiles, 1);
  const states = (await readFile(path.join(result.releaseDirectory, "views/states.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
  assert.equal(states[0].registry_evidence.reported_address_profile_count, 8);
  assert.equal(states[0].registry_evidence.coordinate_assigned_profile_count, 1);
  assert.equal(states[0].nonemployer_baseline.nonemployer_establishments, 5);
  const counties = (await readFile(path.join(result.releaseDirectory, "views/counties.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
  assert.equal(counties[0].registry_evidence.coordinate_assigned_profile_count, 1);
  assert.equal(counties[0].zip_business_count_allocation, null);
  assert.equal(counties[0].nonemployer_baseline.nonemployer_establishments, 4);
  assert.equal(verification.coverage.national_nonemployer_establishments, 5);
  assert.equal(verification.coverage.co_business_registry_good_standing_or_delinquent_organization_records, 3);
  assert.equal(verification.coverage.co_business_registry_quarantined_source_records, 1);
  assert.equal(verification.coverage.co_business_registry_eligible_reported_us_business_addresses, 3);
  assert.equal(verification.coverage.de_business_license_source_current_license_rows, 7);
  assert.equal(verification.coverage.de_business_license_accepted_current_license_rows, 6);
  assert.equal(verification.coverage.de_business_license_current_organization_records, 5);
  assert.equal(verification.coverage.de_business_license_quarantined_source_records, 1);
  assert.equal(verification.coverage.de_business_license_quarantined_license_groups, 1);
  assert.equal(verification.coverage.de_business_license_eligible_reported_us_business_addresses, 4);
  assert.equal(verification.coverage.ak_active_business_license_source_rows, 3);
  assert.equal(verification.coverage.ak_active_business_license_organizations, 2);
  assert.equal(verification.coverage.ak_active_business_license_provisional_physical_sites, 1);
  assert.equal(verification.coverage.ak_active_business_license_quarantined_source_records, 1);
  assert.equal(verification.coverage.fl_business_registry_source_records, 10);
  assert.equal(verification.coverage.fl_business_registry_active_organization_records, 3);
  assert.equal(verification.coverage.fl_business_registry_eligible_reported_us_principal_addresses, 2);
  assert.equal(verification.coverage.pa_business_registry_source_active_registration_rows, 4);
  assert.equal(verification.coverage.pa_business_registry_active_organization_records, 3);
  assert.equal(verification.coverage.pa_business_registry_duplicate_rows_collapsed, 1);
  assert.equal(verification.coverage.pa_business_registry_eligible_reported_us_business_addresses, 2);
  assert.equal(verification.coverage.wa_lni_active_contractor_license_source_rows, 4);
  assert.equal(verification.coverage.wa_lni_active_contractor_organizations, 3);
  assert.equal(verification.coverage.wa_lni_active_contractor_license_activities, 4);
  assert.equal(verification.coverage.wa_lni_active_contractor_grouped_multi_license_organizations, 1);
  assert.equal(verification.coverage.wa_lni_active_contractor_reported_business_names, 3);
  assert.equal(verification.coverage.wa_lni_active_contractor_reported_mailing_addresses, 3);
  assert.equal(verification.coverage.wa_lni_active_contractor_eligible_reported_us_mailing_addresses, 2);
  assert.equal(verification.coverage.wa_lni_active_contractor_organizations_without_eligible_us_zip_address, 1);
  assert.equal(verification.coverage.la_active_business_source_location_accounts, 2);
  assert.equal(verification.coverage.la_active_business_normalized_us_location_accounts, 1);
  assert.equal(verification.coverage.tx_active_sales_tax_source_outlet_permits, 3);
  assert.equal(verification.coverage.tx_active_sales_tax_normalized_outlet_permits, 2);
  assert.equal(verification.coverage.tx_active_sales_tax_unique_taxpayers, 1);
  assert.equal(verification.coverage.chicago_active_business_license_source_records, 4);
  assert.equal(verification.coverage.chicago_active_business_license_normalized_sites, 1);
  assert.equal(verification.coverage.chicago_active_business_license_unique_accounts, 1);
  assert.equal(verification.coverage.dc_basic_business_license_source_rows, 4);
  assert.equal(verification.coverage.dc_basic_business_license_accepted_rows, 3);
  assert.equal(verification.coverage.dc_basic_business_license_normalized_sites, 1);
  assert.equal(verification.coverage.dc_basic_business_license_organizations, 1);
  assert.equal(verification.coverage.ca_abc_source_records, 6);
  assert.equal(verification.coverage.ca_abc_selected_active_issued_license_rows, 4);
  assert.equal(verification.coverage.ca_abc_excluded_source_rows, 2);
  assert.equal(verification.coverage.ca_abc_active_issued_license_normalized_sites, 1);
  assert.equal(verification.coverage.ca_abc_active_issued_license_organizations, 1);
  assert.equal(verification.coverage.ca_abc_active_issued_license_activities, 3);
  assert.equal(verification.coverage.ca_abc_quarantined_source_rows, 1);
  assert.equal(verification.coverage.ca_abc_quarantined_file_groups, 1);
  assert.equal(verification.coverage.ca_abc_source_active_rows_with_expiration_before_observation, 1);
  assert.equal(verification.coverage.nyc_dcwp_active_license_source_records, 4);
  assert.equal(verification.coverage.nyc_dcwp_active_license_normalized_sites, 1);
  assert.equal(verification.coverage.nyc_dcwp_active_license_unique_business_ids, 1);
  const sources = (await readFile(path.join(result.releaseDirectory, "views/sources.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
  const colorado = sources.find((row) => row.source_key === "co_business_registry_good_standing_or_delinquent_organizations");
  assert.equal(colorado.profile_source_id, null);
  assert.equal(colorado.zip_level_counts.organization_principal_office_address_count, 3);
  assert.equal(colorado.zip_rows_with_contribution, 1);
  assert.equal(colorado.location_profile_geography.profile_count, 0);
  const florida = sources.find((row) => row.source_key === "fl_business_registry_quarterly_active_entities");
  assert.equal(florida.profile_source_id, null);
  assert.equal(florida.zip_level_counts.organization_reported_principal_address_count, 2);
  assert.equal(florida.zip_rows_with_contribution, 1);
  assert.equal(florida.location_profile_geography.profile_count, 0);
  const pennsylvania = sources.find((row) => row.source_key === "pa_business_registry_active_registrations");
  assert.equal(pennsylvania.profile_source_id, null);
  assert.equal(pennsylvania.zip_level_counts.organization_reported_business_address_count, 2);
  assert.equal(pennsylvania.zip_rows_with_contribution, 1);
  assert.equal(pennsylvania.location_profile_geography.profile_count, 0);
  const washington = sources.find((row) => row.source_key === "wa_lni_active_contractor_organizations");
  assert.equal(washington.profile_source_id, null);
  assert.equal(washington.zip_level_counts.active_contractor_organization_mailing_address_count, 2);
  assert.equal(washington.zip_rows_with_contribution, 1);
  assert.equal(washington.location_profile_geography.profile_count, 0);
  const losAngeles = sources.find((row) => row.source_key === "la_active_business_location_accounts");
  assert.equal(losAngeles.profile_source_id, "los-angeles-office-of-finance-active-businesses");
  assert.equal(losAngeles.zip_level_counts.registered_business_location_count, 1);
  assert.equal(losAngeles.zip_rows_with_contribution, 1);
  assert.equal(losAngeles.location_profile_geography.profile_count, 1);
  const texas = sources.find((row) => row.source_key === "tx_active_sales_tax_permit_outlets");
  assert.equal(texas.profile_source_id, "texas-comptroller-active-sales-tax-permits");
  assert.equal(texas.zip_level_counts.permitted_outlet_count, 2);
  assert.equal(texas.zip_rows_with_contribution, 1);
  const alaska = sources.find((row) => row.source_key === "ak_active_business_licenses");
  assert.equal(alaska.profile_source_id, "alaska-dcced-active-business-licenses");
  assert.equal(alaska.zip_level_counts.active_license_organization_reported_address_count, 1);
  assert.equal(alaska.zip_level_counts.provisional_physical_site_count, 1);
  assert.equal(alaska.zip_rows_with_contribution, 1);
  assert.equal(alaska.location_profile_geography.profile_count, 1);
  const chicago = sources.find((row) => row.source_key === "chicago_active_business_license_sites");
  assert.equal(chicago.profile_source_id, "city-of-chicago-bacp-current-active-business-licenses");
  assert.equal(chicago.zip_level_counts.licensed_site_count, 1);
  assert.equal(chicago.zip_rows_with_contribution, 1);
  assert.equal(chicago.location_profile_geography.profile_count, 1);
  const dc = sources.find((row) => row.source_key === "dc_basic_business_license_sites");
  assert.equal(dc.profile_source_id, "dc-dlcp-active-basic-business-licenses");
  assert.equal(dc.zip_level_counts.licensed_site_count, 1);
  assert.equal(dc.zip_rows_with_contribution, 1);
  assert.equal(dc.location_profile_geography.profile_count, 1);
  const californiaAbc = sources.find((row) => row.source_key === "california_abc_active_issued_license_sites");
  assert.equal(californiaAbc.profile_source_id, "california-abc-daily-active-licenses");
  assert.equal(californiaAbc.zip_level_counts.licensed_site_count, 1);
  assert.equal(californiaAbc.zip_rows_with_contribution, 1);
  assert.equal(californiaAbc.location_profile_geography.profile_count, 1);
  assert.equal(californiaAbc.location_profile_geography.coordinate_missing_count, 1);
  const nycDcwp = sources.find((row) => row.source_key === "nyc_dcwp_active_license_sites");
  assert.equal(nycDcwp.profile_source_id, "nyc-dcwp-issued-licenses-active-premises");
  assert.equal(nycDcwp.zip_level_counts.licensed_site_count, 1);
  assert.equal(nycDcwp.zip_rows_with_contribution, 1);
  assert.equal(nycDcwp.location_profile_geography.profile_count, 1);
  const pointer = JSON.parse(await readFile(result.pointerPath, "utf8"));
  assert.equal(pointer.release_id, result.manifest.release_id);
});
