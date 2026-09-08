import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";
import { createTnChildcareReportingFixture } from "./fixtures/tn-childcare-reporting.mjs";
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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function writeArtifact(releaseDirectory, relativePath, value, metadata = {}) {
  const filePath = path.join(releaseDirectory, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value);
  return { path: relativePath.replaceAll("\\", "/"), bytes: Buffer.byteLength(value), sha256: sha256(value), ...metadata };
}

async function publishFixture(root, datasetId, releaseId, manifest) {
  const releaseDirectory = path.join(root, "releases", releaseId);
  await mkdir(releaseDirectory, { recursive: true });
  const manifestValue = {
    schema_version: "1.0.0",
    dataset_id: datasetId,
    release_id: releaseId,
    status: "published",
    artifacts: [],
    ...manifest,
  };
  const manifestBuffer = json(manifestValue);
  await writeFile(path.join(releaseDirectory, "manifest.json"), manifestBuffer);
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, "current.json"), json({
    dataset_id: datasetId,
    release_id: releaseId,
    manifest: `releases/${releaseId}/manifest.json`,
  }));
  return { releaseDirectory, pointerPath: path.join(root, "current.json"), manifestSha256: sha256(manifestBuffer) };
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
  const zctaIndex = [{
    geo_id: "zcta:12345",
    geo_type: "zcta",
    geoid: "12345",
    zcta: "12345",
    geometry_file: "source/zctas/prefix=1.geojson",
  }];
  const geographyArtifacts = [
    await writeArtifact(geographyRelease, "derived/index/states.jsonl", jsonLines(stateIndex)),
    await writeArtifact(geographyRelease, "derived/index/counties.jsonl", jsonLines(countyIndex)),
    await writeArtifact(geographyRelease, "derived/index/zctas.jsonl", jsonLines(zctaIndex)),
    await writeArtifact(
      geographyRelease,
      "source/counties/state=01.geojson",
      json({ type: "FeatureCollection", features: [polygonFeature({ GEOID: "01001" })] }),
      { geography_type: "county" },
    ),
  ];
  const geography = await publishFixture(geographyRoot, "us-census-geography", geographyReleaseId, {
    complete_national_release: true,
    coverage: { zctas: 1 },
    sources: [{ source_id: "us-census-tigerweb-zcta-2020", source_vintage: "2020 Census", layers: { zctas: 1 } }],
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
    ny_retail_food_store_license_sites: {
      licensed_location_address_count: 1,
      provisional_physical_site_count: 1,
      source_release_id: "ny-retail-food-fixture",
      source_rows_updated_at: "2025-09-30T15:15:15.000Z",
      record_level_distribution: "local-review-only",
      aggregate_distribution: "public-under-open-ny-terms-with-attribution-and-limitations",
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
        physical_site_count: 9,
        establishment_count: 9,
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
      location: {
        longitude: -89.5,
        latitude: 30.5,
        precision: "open-data-platform-generated-address-component-centroid",
        independently_verified: false,
        premise_coordinate_claim_permitted: false,
      },
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
    {
      profile_id: "profile:9",
      normalized_address: { state: "AA" },
      location: { type: "Point", coordinates: [-89.5, 30.5] },
      observed_at: "2026-09-02T04:30:18.958Z",
      source: { source_id: "new-york-agriculture-markets-retail-food-stores" },
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
    publisher: { id: "national-business-registry", version: "2.9.0" },
    status: "published-partial",
    complete_national_business_registry: false,
    coverage: {
      resolution_location_profiles: 9,
      physical_sites: 9,
      establishments: 9,
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
      ny_retail_food_store_source_license_records: 3,
      ny_retail_food_store_organizations: 2,
      ny_retail_food_store_provisional_physical_sites: 1,
      ny_retail_food_store_zip_evidence_addresses: 1,
      ny_retail_food_store_usable_platform_geocodes: 1,
      ny_retail_food_store_rows_with_undocumented_establishment_codes: 1,
      ny_retail_food_store_quarantined_source_records: 1,
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
    coverage: { profiles: 9 },
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
  assert.equal(result.manifest.publisher.version, "2.8.0");
  assert.deepEqual(result.manifest.spatial_zip_polygon_denominator, {
    count: 1,
    geography_type: "census-zcta5",
    evidence_scope: "complete-selected-census-zcta5-polygon-release",
    dataset_id: "us-census-geography",
    release_id: geographyReleaseId,
    geography_manifest_sha256: geography.manifestSha256,
    zcta_index_artifact_path: "derived/index/zctas.jsonl",
    zcta_index_artifact_sha256: geographyArtifacts[2].sha256,
    zcta_member_set_sha256: sha256("12345\n"),
    source_id: "us-census-tigerweb-zcta-2020",
    source_vintage: "2020 Census",
    match_key: "exact-five-digit-zcta-code",
    zip4_polygon_applicability: "not-applicable",
  });
  assert.equal(result.manifest.usps_operational_zip_evidence, null);
  assert.deepEqual(result.manifest.normalized_postal_field_migration, {
    status: "pre-migration-registry-release",
    registry_publisher_version: "2.9.0",
    required_registry_publisher_version: "2.10.0",
    normalized_output_contract: "zip_code-and-postal_code-are-zip5;zip4-is-separate-or-null",
    joined_zip4_allowed_in_new_normalized_output: false,
  });
  assert.equal(verification.coverage.national_views, 3);
  assert.equal(verification.coverage.state_views, 1);
  assert.equal(verification.coverage.county_views, 1);
  assert.equal(verification.coverage.zip_views, 2);
  assert.equal(verification.coverage.spatial_zip_polygon_denominator_count, 1);
  assert.equal(verification.coverage.source_views, 14);
  assert.equal(verification.coverage.location_profiles_assessed, 9);
  assert.equal(verification.coverage.coordinate_assigned_profiles, 2);
  const zips = (await readFile(path.join(result.releaseDirectory, "views/zips.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
  assert.equal(zips[0].spatial_zip_polygon_membership.status, "included");
  assert.equal(zips[0].spatial_zip_polygon_membership.zip4_polygon_applicability, "not-applicable");
  assert.equal(zips[0].coverage_gap_codes.includes("authoritative-current-usps-validity-unverified"), false);
  assert.equal(zips[1].spatial_zip_polygon_membership.status, "not-in-denominator");
  assert.equal(zips[1].coverage_gap_codes.includes("not-in-census-zcta5-polygon-denominator"), true);
  const states = (await readFile(path.join(result.releaseDirectory, "views/states.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
  assert.equal(states[0].registry_evidence.reported_address_profile_count, 9);
  assert.equal(states[0].registry_evidence.coordinate_assigned_profile_count, 2);
  assert.equal(states[0].nonemployer_baseline.nonemployer_establishments, 5);
  const counties = (await readFile(path.join(result.releaseDirectory, "views/counties.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
  assert.equal(counties[0].registry_evidence.coordinate_assigned_profile_count, 2);
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
  assert.equal(verification.coverage.ny_retail_food_store_source_license_records, 3);
  assert.equal(verification.coverage.ny_retail_food_store_organizations, 2);
  assert.equal(verification.coverage.ny_retail_food_store_provisional_physical_sites, 1);
  assert.equal(verification.coverage.ny_retail_food_store_organizations_without_complete_physical_site, 1);
  assert.equal(verification.coverage.ny_retail_food_store_zip_evidence_addresses, 1);
  assert.equal(verification.coverage.ny_retail_food_store_usable_platform_geocodes, 1);
  assert.equal(verification.coverage.ny_retail_food_store_rows_with_undocumented_establishment_codes, 1);
  assert.equal(verification.coverage.ny_retail_food_store_quarantined_source_records, 1);
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
  const nyRetailFood = sources.find((row) => row.source_key === "ny_retail_food_store_license_sites");
  assert.equal(nyRetailFood.profile_source_id, "new-york-agriculture-markets-retail-food-stores");
  assert.equal(nyRetailFood.zip_level_counts.licensed_location_address_count, 1);
  assert.equal(nyRetailFood.zip_level_counts.provisional_physical_site_count, 1);
  assert.equal(nyRetailFood.zip_rows_with_contribution, 1);
  assert.equal(nyRetailFood.location_profile_geography.profile_count, 1);
  assert.equal(nyRetailFood.location_profile_geography.coordinate_assigned_single_count, 1);
  const nycDcwp = sources.find((row) => row.source_key === "nyc_dcwp_active_license_sites");
  assert.equal(nycDcwp.profile_source_id, "nyc-dcwp-issued-licenses-active-premises");
  assert.equal(nycDcwp.zip_level_counts.licensed_site_count, 1);
  assert.equal(nycDcwp.zip_rows_with_contribution, 1);
  assert.equal(nycDcwp.location_profile_geography.profile_count, 1);
  const pointer = JSON.parse(await readFile(result.pointerPath, "utf8"));
  assert.equal(pointer.release_id, result.manifest.release_id);

  const manifestPath = path.join(result.releaseDirectory, "manifest.json");
  const zipPath = path.join(result.releaseDirectory, "views/zips.jsonl");
  const gapPath = path.join(result.releaseDirectory, "views/coverage-gaps.jsonl");
  const originalManifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const originalZipText = await readFile(zipPath, "utf8");
  const originalGapText = await readFile(gapPath, "utf8");
  const writeMutation = async ({ zipText = originalZipText, gapText = originalGapText, mutateManifest = () => {} } = {}) => {
    const mutatedManifest = structuredClone(originalManifest);
    for (const [artifactType, artifactText] of [
      ["zip-coverage-view-jsonl", zipText],
      ["coverage-gap-view-jsonl", gapText],
    ]) {
      const artifact = mutatedManifest.artifacts.find((item) => item.artifact_type === artifactType);
      artifact.bytes = Buffer.byteLength(artifactText);
      artifact.sha256 = sha256(artifactText);
    }
    mutateManifest(mutatedManifest);
    await Promise.all([
      writeFile(zipPath, zipText),
      writeFile(gapPath, gapText),
      writeFile(manifestPath, json(mutatedManifest)),
    ]);
  };

  try {
    const duplicateZips = originalZipText.trim().split("\n").map(JSON.parse);
    duplicateZips[1].zip_code = duplicateZips[0].zip_code;
    duplicateZips[1].view_id = duplicateZips[0].view_id;
    await writeMutation({ zipText: jsonLines(duplicateZips) });
    await assert.rejects(() => verifyNationalBusinessCoverageViewsRelease(manifestPath), /duplicates ZIP5 key/);

    await writeMutation({
      mutateManifest: (manifest) => {
        manifest.spatial_zip_polygon_denominator.geography_manifest_sha256 = "0".repeat(64);
      },
    });
    await assert.rejects(() => verifyNationalBusinessCoverageViewsRelease(manifestPath), /does not match the Census geography dependency/);

    const wrongGapScope = originalGapText.trim().split("\n").map(JSON.parse);
    const excludedGap = wrongGapScope.find((row) => row.gap_type === "reported-zip5-not-in-census-zcta5-polygon-denominator");
    excludedGap.scope_id = "99999";
    excludedGap.gap_id = "gap:reported-zip5-outside-zcta:99999";
    await writeMutation({ gapText: jsonLines(wrongGapScope) });
    await assert.rejects(() => verifyNationalBusinessCoverageViewsRelease(manifestPath), /do not exactly match their coverage-gap scopes/);

    await writeMutation({
      mutateManifest: (manifest) => {
        manifest.spatial_zip_polygon_denominator.zcta_member_set_sha256 = "0".repeat(64);
      },
    });
    await assert.rejects(() => verifyNationalBusinessCoverageViewsRelease(manifestPath), /member set does not match/);
  } finally {
    await Promise.all([
      writeFile(zipPath, originalZipText),
      writeFile(gapPath, originalGapText),
      writeFile(manifestPath, json(originalManifest)),
    ]);
  }

  // Add geography-only childcare evidence without changing resolver/benchmark inputs.
  const reportingRow = (state, number, location) => {
    const slug = state.toLowerCase(), sourceId = state === "MA" ? "ma-licensed-center-based-childcare" : "nj-licensed-childcare-centers";
    const policyId = state === "MA" ? "massgis-eec-childcare-local-review" : "njdep-childcare-local-review";
    const sourceRelease = `${slug}-childcare-${"a".repeat(64)}`, suffix = `${slug}_childcare_${String(number).padStart(32, "0")}`;
    return { schema_version: "1.0.0", site_entity_id: `site:${suffix}`, establishment_entity_id: `establishment:${suffix}`,
      zip_code: "12345", address: { street: "10 Fixture Street", city: "Fixture", state, country: "US", zip_code: "12345", postal_code: "12345", zip4: "0123" },
      location, source: { source_id: sourceId, source_release_id: sourceRelease, source_record_id: `${sourceRelease}:object:${number}`,
        ingest_run_id: "fixture-childcare", transformation_version: "fixture-childcare@1.0.0", policy_id: policyId },
      observed_at: "2026-08-01T00:00:00.000Z", identity_matching_eligible: false, export_policy: "local-review-only", category: "childcare",
      names: [{ raw: "Fixture Childcare" }], source_status: { active_business_verified: false, status_source: null, licensed_capacity: null,
        ...(state === "NJ" ? { approval_date_epoch_ms: null, renewal_date_epoch_ms: null } : {}),
        status_interpretation: state === "MA" ? "missing-source-status" : "active-licensed-center-layer-membership-only" },
      evidence: { manifest_sha256: "b".repeat(64), policy_profile: `${policyId}@1.0.0` } };
  };
  const reportingRows = [reportingRow("MA", 1, { latitude: 42, longitude: -72 }),
    reportingRow("MA", 2, { latitude: null, longitude: null }), reportingRow("MA", 3, { latitude: 42.5, longitude: -69.5 }),
    reportingRow("NJ", 4, { latitude: 40.5, longitude: -74.5 })];
  const reportingArtifact = await writeArtifact(registryRelease, "reporting/location-evidence/zip2=12/records.jsonl.gz", gzipSync(jsonLines(reportingRows)),
    { artifact_type: "business-reporting-location-evidence-jsonl-gzip", record_count: 4 });
  const registryManifestPath = path.join(registryRelease, "manifest.json");
  const updatedRegistry = JSON.parse(await readFile(registryManifestPath, "utf8"));
  updatedRegistry.artifacts.push(reportingArtifact);
  Object.assign(updatedRegistry.coverage, { physical_sites: 13, establishments: 13, reporting_location_evidence: 4, ma_childcare_center_sites: 3, nj_childcare_center_sites: 1 });
  zipRows[0].registry_coverage.physical_site_count = 13;
  zipRows[0].registry_coverage.establishment_count = 13;
  Object.assign(zipRows[0].registry_coverage, { ma_childcare_center_site_count: 3, nj_childcare_center_site_count: 1 });
  for (const [key, count, row] of [["ma_childcare_centers", 3, reportingRows[0]], ["nj_childcare_centers", 1, reportingRows[3]]]) {
    zipRows[0].source_contributions[key] = { reported_center_count: count, source_release_id: row.source.source_release_id,
      observed_at: row.observed_at, record_level_distribution: "local-review-only" };
  }
  Object.assign(updatedRegistry.artifacts[0], await writeArtifact(registryRelease, "derived/zip-coverage.jsonl", jsonLines(zipRows),
    { artifact_type: "registry-zip-coverage-jsonl", record_count: zipRows.length }));
  await writeFile(registryManifestPath, json(updatedRegistry));
  const updatedGeography = JSON.parse(await readFile(path.join(geographyRelease, "manifest.json"), "utf8"));
  stateIndex[0].postal_abbreviation = "MA";
  Object.assign(updatedGeography.artifacts[0], await writeArtifact(geographyRelease, "derived/index/states.jsonl", jsonLines(stateIndex)));
  Object.assign(updatedGeography.artifacts[3], await writeArtifact(geographyRelease, "source/counties/state=01.geojson",
    json({ type: "FeatureCollection", features: [polygonFeature({ GEOID: "01001" }, -74, 41, -71, 43)] }), { geography_type: "county" }));
  await writeFile(path.join(geographyRelease, "manifest.json"), json(updatedGeography));
  const buildWithReporting = (output) => buildNationalBusinessCoverageViews({ registryPointerPath: registry.pointerPath,
    geographyPointerPath: geography.pointerPath, crosswalkPointerPath: crosswalk.pointerPath, resolutionPointerPath: resolution.pointerPath,
    benchmarkPointerPath: benchmark.pointerPath, nonemployerPointerPath: nonemployer.pointerPath, outputRoot: path.join(root, output), logger: () => {} });
  const withReporting = await buildWithReporting("reporting-coverage");
  await verifyNationalBusinessCoverageViewsRelease(path.join(withReporting.releaseDirectory, "manifest.json"));
  assert.equal(withReporting.manifest.coverage.location_profiles_assessed, 9);
  assert.equal(withReporting.manifest.coverage.geographic_evidence_assessed, 13);
  assert.equal(withReporting.manifest.coverage.reporting_only_locations_assessed, 4);
  assert.equal(withReporting.manifest.coverage.reporting_only_coordinate_assigned, 1);
  const reportingSources = (await readFile(path.join(withReporting.releaseDirectory, "views/sources.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
  const maReporting = reportingSources.find((row) => row.source_key === "ma_childcare_centers");
  assert.equal(maReporting.location_profile_geography.matching_profile_count, 0);
  assert.equal(maReporting.location_profile_geography.reporting_only_count, 3);
  assert.equal(maReporting.location_profile_geography.coordinate_missing_count, 1);
  assert.equal(maReporting.location_profile_geography.coordinate_unmatched_count, 1);
  assert.equal(maReporting.identity_matching_eligible, false);
  assert.equal(maReporting.export_policy, "local-review-only");
  const reportingStates = (await readFile(path.join(withReporting.releaseDirectory, "views/states.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
  assert.equal(reportingStates[0].registry_evidence.reporting_only_count, 3);
  assert.equal(reportingStates[0].registry_evidence.source_profile_counts_by_reported_address_state["ma-licensed-center-based-childcare"], 3);
  const reportingManifestPath = path.join(withReporting.releaseDirectory, "manifest.json");
  const reportingManifestBytes = await readFile(reportingManifestPath);
  const forgedReportingManifest = JSON.parse(reportingManifestBytes);
  forgedReportingManifest.coverage.reporting_only_locations_assessed = 0;
  await writeFile(reportingManifestPath, json(forgedReportingManifest));
  await assert.rejects(verifyNationalBusinessCoverageViewsRelease(reportingManifestPath), /Reporting-only manifest/);
  await writeFile(reportingManifestPath, reportingManifestBytes);
  // Older published aggregate artifacts remain independently verifiable.
  const legacyManifest = structuredClone(originalManifest);
  legacyManifest.publisher.version = "2.7.0";
  await writeFile(manifestPath, json(legacyManifest));
  await verifyNationalBusinessCoverageViewsRelease(manifestPath);
  await writeFile(manifestPath, json(originalManifest));
  reportingRows[0].identity_matching_eligible = true;
  await writeFile(path.join(registryRelease, reportingArtifact.path), gzipSync(jsonLines(reportingRows)));
  await assert.rejects(buildWithReporting("invalid-reporting-coverage"), /reporting-only childcare/);
  // TN's ZIP-null rows remain geographic evidence, including when every row lacks ZIP.
  for (const allMissing of [false, true]) {
    const tnRows = [
      createTnChildcareReportingFixture({ zip: allMissing ? null : "12345", attributes: { OBJECTID: 1 } }).row,
      createTnChildcareReportingFixture({ zip: null, attributes: { OBJECTID: 2 } }).row,
      createTnChildcareReportingFixture({ zip: "0", attributes: { OBJECTID: 3 }, geometry: null }).row,
    ];
    const missing = allMissing ? 3 : 2, available = 3 - missing;
    const tnRegistry = structuredClone(updatedRegistry);
    tnRegistry.publisher = { id: "national-business-registry", version: "2.13.0" };
    tnRegistry.dependencies = [{ dataset_id: "tn-dhs-active-childcare-centers", release_id: tnRows[0].evidence.release_id, manifest_sha256: tnRows[0].evidence.manifest_sha256 }];
    tnRegistry.artifacts = tnRegistry.artifacts.filter(a => a.artifact_type !== "business-reporting-location-evidence-jsonl-gzip");
    Object.assign(tnRegistry.coverage, { physical_sites: 12, establishments: 12, reporting_location_evidence: 3, ma_childcare_center_sites: 0, nj_childcare_center_sites: 0,
      tn_childcare_center_sites: 3, tn_childcare_center_sites_with_zip: available, tn_childcare_center_sites_without_zip: missing,
      reporting_location_evidence_without_zip: missing, tn_childcare_missing_zip_reasons: { "missing-source-zip": missing - 1, "invalid-source-zip-placeholder": 1 } });
    const tnZipRows = structuredClone(zipRows);
    for (const row of tnZipRows) {
      row.registry_coverage.tn_childcare_center_site_count = row.zip_code === "12345" ? available : 0;
      delete row.source_contributions.ma_childcare_centers; delete row.source_contributions.nj_childcare_centers;
      row.registry_coverage.ma_childcare_center_site_count = 0; row.registry_coverage.nj_childcare_center_site_count = 0;
      row.source_contributions.tn_childcare_centers = { reported_center_count: row.registry_coverage.tn_childcare_center_site_count,
        source_release_id: tnRows[0].source.source_release_id, observed_at: tnRows[0].observed_at, record_level_distribution: "local-review-only", active_business_verified: false };
    }
    tnZipRows[0].registry_coverage.physical_site_count = 9 + available;
    tnZipRows[0].registry_coverage.establishment_count = 9 + available;
    // Exercise independent source-summary seeding, not just zero contributions on ZIP rows.
    if (allMissing) for (const row of tnZipRows) delete row.source_contributions.tn_childcare_centers;
    Object.assign(tnRegistry.artifacts[0], await writeArtifact(registryRelease, "derived/zip-coverage.jsonl", jsonLines(tnZipRows), { artifact_type: "registry-zip-coverage-jsonl", record_count: tnZipRows.length }));
    for (const [partition, rows] of [["12", tnRows.filter(row => row.zip_code !== null)], ["unassigned", tnRows.filter(row => row.zip_code === null)]]) {
      if (!rows.length) continue;
      tnRegistry.artifacts.push(await writeArtifact(registryRelease, `reporting/location-evidence/zip2=${partition}/records.jsonl.gz`, gzipSync(jsonLines(rows)),
        { artifact_type: "business-reporting-location-evidence-jsonl-gzip", record_count: rows.length, export_policy: "local-review-only" }));
    }
    await writeFile(registryManifestPath, json(tnRegistry));
    stateIndex[0].postal_abbreviation = "TN";
    Object.assign(updatedGeography.artifacts[0], await writeArtifact(geographyRelease, "derived/index/states.jsonl", jsonLines(stateIndex)));
    Object.assign(updatedGeography.artifacts[3], await writeArtifact(geographyRelease, "source/counties/state=01.geojson",
      json({ type: "FeatureCollection", features: [polygonFeature({ GEOID: "01001" }, -87, 35, -86, 37)] }), { geography_type: "county" }));
    await writeFile(path.join(geographyRelease, "manifest.json"), json(updatedGeography));
    const built = await buildWithReporting(`tn-${allMissing}`), target = path.join(built.releaseDirectory, "manifest.json");
    await verifyNationalBusinessCoverageViewsRelease(target);
    assert.equal(built.manifest.publisher.version, "2.9.0");
    assert.equal(built.manifest.coverage.location_profiles_assessed, 9);
    assert.equal(built.manifest.coverage.tn_childcare_reporting.without_zip, missing);
    assert.equal(built.manifest.coverage.tn_childcare_coordinate_assigned, 2);
    const readRows = async name => (await readFile(path.join(built.releaseDirectory, `views/${name}.jsonl`), "utf8")).trim().split("\n").map(JSON.parse);
    const source = (await readRows("sources")).find(row => row.source_key === "tn_childcare_centers");
    assert.equal(source.location_profile_geography.reporting_only_count, 3);
    assert.equal(source.location_profile_geography.coordinate_missing_count, 1);
    assert.equal(source.tn_childcare_reporting.with_zip, available);
    assert.equal((await readRows("states"))[0].registry_evidence.tn_childcare_reporting.records, 3);
    assert.equal((await readRows("counties"))[0].registry_evidence.tn_childcare_reporting.records, 2);
    assert.ok((await readRows("zips")).every(row => /^\d{5}$/.test(row.zip_code)));
    const require = createRequire(import.meta.url);
    const Ajv2020 = createRequire(require.resolve("ajv-formats/package.json"))("ajv/dist/2020.js").default;
    const gapSchema = JSON.parse(await readFile(new URL("../config/schemas/business-coverage-gap.schema.json", import.meta.url), "utf8"));
    const validateGap = new Ajv2020({ strict: false }).compile(gapSchema);
    for (const gap of await readRows("coverage-gaps")) assert.equal(validateGap(gap), true, JSON.stringify(validateGap.errors));
    const clean = await readFile(target), bad = JSON.parse(clean); bad.coverage.tn_childcare_reporting.without_zip--;
    await writeFile(target, json(bad)); await assert.rejects(verifyNationalBusinessCoverageViewsRelease(target), /TN/); await writeFile(target, clean);
    // Rehashed output corruption must not pass aggregate-only self consistency.
    for (const [name, mutate] of [
      ["states", rows => { rows[0].registry_evidence.tn_childcare_reporting.records++; }],
      ["counties", rows => { const value = rows[0].registry_evidence.tn_childcare_reporting.missing_zip_reasons; value["invalid-source-zip-placeholder"] += value["missing-source-zip"]; value["missing-source-zip"] = 0; }],
      ["sources", rows => { rows.find(row => row.source_key === "tn_childcare_centers").source_key = "forged-source"; }],
      ["coverage-gaps", rows => { rows.splice(rows.findIndex(row => row.gap_type === "reporting-source-zip-unavailable"), 1); }],
    ]) {
      // In the mixed case there is one point-assigned missing ZIP; make it exceed the sole missing-placeholder source count.
      if (name === "counties" && !allMissing) continue;
      const file = path.join(built.releaseDirectory, `views/${name}.jsonl`), original = await readFile(file), rows = original.toString().trim().split("\n").map(JSON.parse);
      mutate(rows); const changed = Buffer.from(jsonLines(rows)), manifest = JSON.parse(clean), artifact = manifest.artifacts.find(a => a.path === `views/${name}.jsonl`);
      Object.assign(artifact, { bytes: changed.length, sha256: sha256(changed), record_count: rows.length });
      await writeFile(file, changed); await writeFile(target, json(manifest)); await assert.rejects(verifyNationalBusinessCoverageViewsRelease(target));
      await writeFile(file, original); await writeFile(target, clean);
    }
    const inputArtifact = tnRegistry.artifacts.find(a => a.artifact_type === "business-reporting-location-evidence-jsonl-gzip");
    const inputPath = path.join(registryRelease, inputArtifact.path), originalInput = await readFile(inputPath), originalDescriptor = { ...inputArtifact };
    // A self-consistently hashed compressed artifact still must decode strictly.
    const malformedUtf8 = gzipSync(Buffer.from([0xff]));
    await writeFile(inputPath, malformedUtf8);
    Object.assign(inputArtifact, { bytes: malformedUtf8.length, sha256: sha256(malformedUtf8) });
    await writeFile(registryManifestPath, json(tnRegistry));
    await assert.rejects(buildWithReporting(`invalid-utf8-${allMissing}`), /encoded data|encoding/i);
    await writeFile(inputPath, originalInput); Object.assign(inputArtifact, originalDescriptor);
    tnRegistry.dependencies.push(tnRegistry.dependencies[0]); await writeFile(registryManifestPath, json(tnRegistry));
    await assert.rejects(buildWithReporting(`duplicate-${allMissing}`), /dependency/); tnRegistry.dependencies.pop();
    const declarationPath = path.join(built.releaseDirectory, "evidence/registry-manifest.json"), declarationBytes = await readFile(declarationPath);
    for (const kind of ["dependency", "status", "counts"]) {
      const declaration = JSON.parse(declarationBytes), manifest = JSON.parse(clean);
      if (kind === "dependency") declaration.dependencies = [];
      if (kind === "status") declaration.status = "unverified";
      if (kind === "counts") declaration.coverage.tn_childcare_center_sites++;
      const bytes = Buffer.from(json(declaration)), artifact = manifest.artifacts.find(a => a.artifact_type === "retained-registry-manifest-json");
      artifact.bytes = bytes.length; artifact.sha256 = sha256(bytes);
      manifest.dependencies.find(d => d.dataset_id === "national-business-registry").manifest_sha256 = artifact.sha256;
      await writeFile(declarationPath, bytes); await writeFile(target, json(manifest)); await assert.rejects(verifyNationalBusinessCoverageViewsRelease(target), /TN/);
      await writeFile(declarationPath, declarationBytes); await writeFile(target, clean);
    }
    for (const version of ["2.13.1", "2.14.0"]) {
      tnRegistry.publisher.version = version; await writeFile(registryManifestPath, json(tnRegistry));
      await assert.rejects(buildWithReporting(`future-${version}-${allMissing}`), /Unreviewed/);
    }
  }
});
