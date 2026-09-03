import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createBusinessCoverageViewStore } from "./business-coverage-view-store.mjs";

function json(value) {
  return `${JSON.stringify(value)}\n`;
}

function jsonLines(values) {
  return `${values.map((value) => JSON.stringify(value)).join("\n")}\n`;
}

test("serves filtered read-only coverage dimensions and compact ZIP records", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "datahub-coverage-store-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const releaseId = "coverage-store-fixture";
  const releaseDirectory = path.join(root, "releases", releaseId);
  await mkdir(path.join(releaseDirectory, "views"), { recursive: true });
  const artifacts = [];
  async function artifact(type, name, rows) {
    const relativePath = `views/${name}.jsonl`;
    await writeFile(path.join(releaseDirectory, relativePath), jsonLines(rows));
    artifacts.push({ artifact_type: type, path: relativePath, record_count: rows.length });
  }
  await artifact("national-coverage-view-jsonl", "national", [{ view_id: "national:registry-union", scope: "registry-union" }]);
  await artifact("state-coverage-view-jsonl", "states", [{
    view_id: "state:01",
    state_fips: "01",
    state_name: "Fixture State",
    postal_abbreviation: "AA",
    state_equivalent_kind: "state",
    is_50_states_or_dc: true,
    geography: { county_equivalent_count: 1 },
    registry_evidence: { reported_address_profile_count: 2, coordinate_assigned_profile_count: 1, reported_coordinate_state_conflict_count: 0 },
    zcta_coverage: { material_intersecting_zcta_count: 1, zctas_with_record_level_source_contribution: 1, zctas_denominator_only_no_record_level_contribution: 0 },
    nonemployer_baseline: { status: "published-annual-aggregate", reference_year: 2023, nonemployer_establishments: 5 },
  }]);
  await artifact("county-coverage-view-jsonl", "counties", [{
    view_id: "county:01001",
    county_geoid: "01001",
    county_name: "Fixture County",
    state_fips: "01",
    registry_evidence: { coordinate_assigned_profile_count: 1, earliest_observed_at: "2026-08-01T00:00:00.000Z", latest_observed_at: "2026-08-02T00:00:00.000Z" },
    zcta_coverage: { material_intersecting_zcta_count: 1, zctas_with_record_level_source_contribution: 1, zctas_denominator_only_no_record_level_contribution: 0 },
    nonemployer_baseline: { status: "published-annual-aggregate", reference_year: 2023, nonemployer_establishments: 4 },
  }]);
  await artifact("zip-coverage-view-jsonl", "zips", [{
    view_id: "zip:12345",
    zip_code: "12345",
    registry_coverage: { status: "record-level-source-contribution", physical_site_count: 2, establishment_count: 2, organization_primary_location_count: 1 },
    geography: { status: "2020-zcta-polygon-available", geoid: "12345" },
    spatial_zip_polygon_membership: { status: "included" },
    employer_baseline: { status: "published", establishments: 4 },
    jurisdiction_overlay: { relationships: [{ material_intersection: true }] },
    current_usps_validity: { status: "unverified" },
    coverage_gap_codes: [],
  }]);
  await artifact("source-coverage-view-jsonl", "sources", [{
    view_id: "source:snap",
    source_key: "snap",
    profile_source_id: "snap-source",
    source_kind: "aggregate-baseline",
    aggregate_baseline: { national_nonemployer_establishments: 5, state_totals: 1, county_totals: 1, zip_allocation_available: false },
    release_metadata: {},
    zip_level_counts: { record_count: 2 },
    zip_rows_with_contribution: 1,
    location_profile_geography: {
      profile_count: 2,
      reported_state_assigned_count: 2,
      coordinate_present_valid_count: 1,
      coordinate_assigned_single_count: 1,
      coordinate_missing_count: 1,
      coordinate_unmatched_count: 0,
      coordinate_ambiguous_boundary_count: 0,
      earliest_observed_at: "2026-08-01T00:00:00.000Z",
      latest_observed_at: "2026-08-02T00:00:00.000Z",
    },
  }, {
    view_id: "source:fl_business_registry_quarterly_active_entities",
    source_key: "fl_business_registry_quarterly_active_entities",
    profile_source_id: null,
    release_metadata: {},
    zip_level_counts: { organization_reported_principal_address_count: 2 },
    zip_rows_with_contribution: 1,
    location_profile_geography: {
      profile_count: 0,
      reported_state_assigned_count: 0,
      coordinate_present_valid_count: 0,
      coordinate_assigned_single_count: 0,
      coordinate_missing_count: 0,
      coordinate_unmatched_count: 0,
      coordinate_ambiguous_boundary_count: 0,
      earliest_observed_at: null,
      latest_observed_at: null,
    },
  }, {
    view_id: "source:de_business_licenses_current",
    source_key: "de_business_licenses_current",
    profile_source_id: null,
    release_metadata: {},
    zip_level_counts: { organization_reported_business_address_count: 4 },
    zip_rows_with_contribution: 2,
    location_profile_geography: {
      profile_count: 0,
      reported_state_assigned_count: 0,
      coordinate_present_valid_count: 0,
      coordinate_assigned_single_count: 0,
      coordinate_missing_count: 0,
      coordinate_unmatched_count: 0,
      coordinate_ambiguous_boundary_count: 0,
      earliest_observed_at: null,
      latest_observed_at: null,
    },
  }, {
    view_id: "source:ak_active_business_licenses",
    source_key: "ak_active_business_licenses",
    profile_source_id: "alaska-dcced-active-business-licenses",
    release_metadata: {},
    zip_level_counts: { provisional_physical_site_count: 1 },
    zip_rows_with_contribution: 1,
    location_profile_geography: {
      profile_count: 1,
      reported_state_assigned_count: 1,
      coordinate_present_valid_count: 0,
      coordinate_assigned_single_count: 0,
      coordinate_missing_count: 1,
      coordinate_unmatched_count: 0,
      coordinate_ambiguous_boundary_count: 0,
      earliest_observed_at: "2026-09-01T12:00:00.000Z",
      latest_observed_at: "2026-09-01T12:00:00.000Z"
    }
  }, {
    view_id: "source:california_abc_active_issued_license_sites",
    source_key: "california_abc_active_issued_license_sites",
    profile_source_id: "california-abc-daily-active-licenses",
    release_metadata: {
      source_release_id: "ca-abc-license-fixture",
      source_modified_at: "2026-09-01T10:50:26.000Z"
    },
    zip_level_counts: { licensed_site_count: 1 },
    zip_rows_with_contribution: 1,
    location_profile_geography: {
      profile_count: 1,
      reported_state_assigned_count: 1,
      coordinate_present_valid_count: 0,
      coordinate_assigned_single_count: 0,
      coordinate_missing_count: 1,
      coordinate_unmatched_count: 0,
      coordinate_ambiguous_boundary_count: 0,
      earliest_observed_at: "2026-09-01T10:50:26.000Z",
      latest_observed_at: "2026-09-01T10:50:26.000Z"
    }
  }]);
  await artifact("coverage-gap-view-jsonl", "coverage-gaps", [{
    gap_id: "gap:reported-zip5-outside-zcta:54321",
    gap_type: "reported-zip5-not-in-census-zcta5-polygon-denominator",
    scope_type: "zip",
    scope_id: "54321",
    severity: "geography",
    consequence: "No ZCTA is available.",
    evidence: {},
  }]);
  await writeFile(path.join(releaseDirectory, "manifest.json"), json({
    dataset_id: "national-business-coverage-views",
    release_id: releaseId,
    created_at: "2026-08-30T12:00:00.000Z",
    status: "published-partial-local-aggregate",
    export_policy: "local-aggregate-review-required",
    complete_all_businesses: false,
    entity_resolution_applied: false,
    spatial_zip_polygon_denominator: { count: 1, geography_type: "census-zcta5", zip4_polygon_applicability: "not-applicable" },
    normalized_postal_field_migration: { status: "pre-migration-registry-release", registry_publisher_version: "2.9.0", required_registry_publisher_version: "2.10.0" },
    usps_operational_zip_evidence: null,
    authoritative_current_usps_zip_denominator: null,
    coverage: { state_views: 1, county_views: 1, zip_views: 1, source_views: 5, gap_views: 1 },
    count_semantics: {},
    limitations: [],
    artifacts,
  }));
  const pointerPath = path.join(root, "current.json");
  await writeFile(pointerPath, json({
    dataset_id: "national-business-coverage-views",
    release_id: releaseId,
    manifest: `releases/${releaseId}/manifest.json`,
  }));

  const store = createBusinessCoverageViewStore({ pointerPath, now: () => new Date("2026-09-03T12:00:00.000Z") });
  const overview = await store.getOverview();
  assert.equal(overview.available, true);
  assert.equal(overview.release_id, releaseId);
  assert.equal(overview.spatial_zip_polygon_denominator.count, 1);
  assert.equal(overview.normalized_postal_field_migration.status, "pre-migration-registry-release");
  assert.equal(overview.usps_operational_zip_evidence, null);
  assert.equal(overview.sources[0].profile_count, 2);
  assert.deepEqual(overview.source_temporal_summary, {
    total_sources: 5,
    policy_configured: 4,
    within_review_window: 1,
    review_due: 0,
    missing_source_reference: 3,
    future_source_reference: 0,
    unconfigured_source_policy: 1,
    general_business_operating_status_asserted: 0,
  });
  assert.deepEqual(overview.state_source_readiness_summary, {
    policy_version: "1.0.0",
    jurisdictions_in_scope: 0,
    broad_jurisdiction_organization_layers: 0,
    missing_broad_jurisdiction_organization_layers: 0,
    statewide_scoped_layers_without_broad_layer: 0,
    local_layers_without_broad_or_statewide_layer: 0,
    national_sector_layers_only: 0,
    jurisdictions_with_national_sector_evidence: 0,
    reported_location_profiles: 0,
    coordinate_assigned_profiles: 0,
    coordinate_assignment_percent: null,
    complete_all_active_businesses: false,
  });
  const states = await store.listDimension("states", { query: "fixture" });
  assert.equal(states.total, 1);
  assert.equal(states.records[0].reported_address_profile_count, 2);
  assert.equal(states.records[0].nonemployer_baseline.nonemployer_establishments, 5);
  assert.equal(states.records[0].state_source_readiness.source_scope_status, "outside-50-states-and-dc-peer-scope");
  const counties = await store.listDimension("counties", { stateFips: "99" });
  assert.equal(counties.total, 0);
  const sourceRows = await store.listDimension("sources");
  assert.equal(sourceRows.records[0].source_kind, "aggregate-baseline");
  assert.equal(sourceRows.records[0].aggregate_baseline.national_nonemployer_establishments, 5);
  const floridaSources = await store.listDimension("sources", { query: "Florida" });
  assert.equal(floridaSources.total, 1);
  assert.equal(floridaSources.records[0].source_name, "Florida Business Registry Quarterly Active Entities");
  const delawareSources = await store.listDimension("sources", { query: "Delaware" });
  assert.equal(delawareSources.total, 1);
  assert.equal(delawareSources.records[0].source_name, "Delaware Division of Revenue Current Business Licenses");
  const alaskaSources = await store.listDimension("sources", { query: "Alaska" });
  assert.equal(alaskaSources.total, 1);
  assert.equal(alaskaSources.records[0].source_name, "Alaska DCCED Active Business Licenses");
  const californiaSources = await store.listDimension("sources", { query: "California ABC" });
  assert.equal(californiaSources.total, 1);
  assert.equal(californiaSources.records[0].source_name, "California ABC Active Issued-License Sites");
  assert.equal(californiaSources.records[0].profile_source_id, "california-abc-daily-active-licenses");
  assert.equal(californiaSources.records[0].coordinate_missing_count, 1);
  assert.equal(californiaSources.records[0].temporal_status.status, "within-review-window");
  assert.equal(californiaSources.records[0].temporal_status.source_reference_date, "2026-09-01");
  const zips = await store.listDimension("zips", { query: "123" });
  assert.equal(zips.total, 1);
  assert.equal(zips.records[0].physical_site_count, 2);
  assert.equal(zips.records[0].material_county_count, 1);
  assert.equal(zips.records[0].spatial_zip_polygon_membership_status, "included");
  const gaps = await store.listDimension("gaps", { gapType: "reported-zip5-not-in-census-zcta5-polygon-denominator" });
  assert.equal(gaps.total, 1);
  await assert.rejects(store.listDimension("unsupported"), /Unsupported coverage dimension/);
});

test("reports unavailable when no current coverage release exists", async () => {
  const store = createBusinessCoverageViewStore({ pointerPath: path.join(os.tmpdir(), `missing-${crypto.randomUUID()}.json`) });
  assert.deepEqual(await store.getOverview(), { available: false });
});
