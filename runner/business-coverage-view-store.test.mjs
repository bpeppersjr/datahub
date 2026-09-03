import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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
    view_id: "state:06",
    state_fips: "06",
    state_name: "Fixture State",
    postal_abbreviation: "CA",
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

  let revalidationReady = false;
  const revalidationDocument = {
    schema_version: "fixture",
    revalidation_id: "state-source-revalidation-fixture",
    observed_at: "2026-09-03",
    coverage_release_id: "fixture-source-coverage-release",
    states: [{
      state_abbreviation: "CA",
      prior_decision: "hold",
      decision: "hold",
      changed_since_prior_review: false,
      candidate: { publisher: "Fixture publisher", product: "Fixture source candidate", availability: "fixture", price: "$0" },
      authorized_next_action_type: "written-preflight-inquiry",
      bounded_connector_implementation_authorized: false,
      autonomous_acquisition_authorized: false,
      complete_source_acquisition_authorized: false,
      offline_fixture_connector_authorized: false,
      production_ready: false,
      unresolved_gates: ["schema", "rights"],
      strongest_bounded_next_action: "Obtain the fixture contract. Do not acquire before approval.",
      official_urls: ["https://example.gov/source"],
    }],
  };
  const stateSourceRevalidationProvider = {
    async load() {
      if (!revalidationReady) throw Object.assign(new Error("fixture revalidation missing"), { code: "ENOENT" });
      return structuredClone(revalidationDocument);
    },
    index(document) {
      return new Map(document.states.map((state) => [state.state_abbreviation, state]));
    },
    summarize(document, currentCoverageReleaseId) {
      return {
        schema_version: document.schema_version,
        revalidation_id: document.revalidation_id,
        observed_at: document.observed_at,
        coverage_release_id: document.coverage_release_id,
        current_coverage_release_id: currentCoverageReleaseId,
        coverage_release_matches_current: document.coverage_release_id === currentCoverageReleaseId,
        jurisdictions_revalidated: document.states.length,
        hold_decisions: document.states.filter((state) => state.decision === "hold").length,
        bounded_connector_decisions: 0,
        changed_decisions: 0,
        autonomous_acquisitions_authorized: 0,
        production_ready_jurisdictions: 0,
      };
    },
  };
  let currentNow = new Date("2026-09-03T12:00:00.000Z");
  const store = createBusinessCoverageViewStore({
    pointerPath,
    now: () => currentNow,
    stateSourceRevalidationPath: "fixture",
    stateSourceRevalidationProvider,
  });
  await assert.rejects(store.getOverview(), (error) => error?.code === "ENOENT");
  revalidationReady = true;
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
    jurisdictions_in_scope: 1,
    broad_jurisdiction_organization_layers: 0,
    missing_broad_jurisdiction_organization_layers: 1,
    statewide_scoped_layers_without_broad_layer: 1,
    local_layers_without_broad_or_statewide_layer: 0,
    national_sector_layers_only: 0,
    jurisdictions_with_national_sector_evidence: 0,
    reported_location_profiles: 2,
    coordinate_assigned_profiles: 1,
    coordinate_assignment_percent: 50,
    complete_all_active_businesses: false,
  });
  assert.deepEqual(overview.state_source_revalidation_summary, {
    schema_version: "fixture",
    revalidation_id: "state-source-revalidation-fixture",
    observed_at: "2026-09-03",
    coverage_release_id: "fixture-source-coverage-release",
    current_coverage_release_id: releaseId,
    coverage_release_matches_current: false,
    jurisdictions_revalidated: 1,
    hold_decisions: 1,
    bounded_connector_decisions: 0,
    changed_decisions: 0,
    autonomous_acquisitions_authorized: 0,
    production_ready_jurisdictions: 0,
  });
  assert.deepEqual(overview.state_source_assessment_summary, overview.state_source_revalidation_summary);
  const states = await store.listDimension("states", { query: "fixture" });
  assert.equal(states.total, 1);
  assert.equal(states.records[0].reported_address_profile_count, 2);
  assert.equal(states.records[0].nonemployer_baseline.nonemployer_establishments, 5);
  assert.equal(states.records[0].state_source_readiness.source_scope_status, "statewide-scoped-layer-only");
  assert.equal(states.records[0].latest_source_revalidation.decision, "hold");
  assert.equal(states.records[0].latest_source_revalidation.candidate.product, "Fixture source candidate");
  assert.equal(states.records[0].latest_source_revalidation.coverage_release_matches_current, false);
  assert.equal(states.records[0].latest_source_assessment.assessment_kind, "revalidation");
  assert.equal(states.records[0].latest_source_assessment.candidate.product, "Fixture source candidate");
  assert.equal(states.records[0].latest_source_assessment.authorized_next_action_type, "written-preflight-inquiry");
  assert.equal(states.records[0].latest_source_assessment.offline_fixture_connector_authorized, false);
  states.records[0].latest_source_revalidation.candidate.product = "mutated caller value";
  assert.equal((await store.listDimension("states", { query: "Fixture source candidate" })).total, 1);
  assert.equal((await store.listDimension("states", { query: "mutated caller value" })).total, 0);
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
  currentNow = new Date("2026-10-20T12:00:00.000Z");
  const californiaSourcesAfterReviewWindow = await store.listDimension("sources", { query: "California ABC" });
  assert.equal(californiaSourcesAfterReviewWindow.records[0].temporal_status.status, "review-due");
  assert.equal(californiaSourcesAfterReviewWindow.records[0].temporal_status.age_days > 45, true);

  const discoveryDocument = structuredClone(revalidationDocument);
  discoveryDocument.assessment_catalog_id = "assessment-catalog-fixture";
  discoveryDocument.states[0].assessment_id = "source-discovery-fixture";
  discoveryDocument.states[0].assessment_kind = "source-discovery";
  const discoveryStore = createBusinessCoverageViewStore({
    pointerPath,
    stateSourceRevalidationPath: "fixture",
    stateSourceRevalidationProvider: {
      ...stateSourceRevalidationProvider,
      async load() {
        return structuredClone(discoveryDocument);
      },
    },
  });
  const discoveryState = (await discoveryStore.listDimension("states")).records[0];
  assert.equal(discoveryState.latest_source_assessment.assessment_id, "source-discovery-fixture");
  assert.equal(discoveryState.latest_source_assessment.assessment_kind, "source-discovery");
  assert.equal(discoveryState.latest_source_assessment.revalidation_id, null);
  assert.equal(discoveryState.latest_source_revalidation, null);
  const zips = await store.listDimension("zips", { query: "123" });
  assert.equal(zips.total, 1);
  assert.equal(zips.records[0].physical_site_count, 2);
  assert.equal(zips.records[0].material_county_count, 1);
  assert.equal(zips.records[0].spatial_zip_polygon_membership_status, "included");
  const gaps = await store.listDimension("gaps", { gapType: "reported-zip5-not-in-census-zcta5-polygon-denominator" });
  assert.equal(gaps.total, 1);
  await assert.rejects(store.listDimension("unsupported"), /Unsupported coverage dimension/);

  const rolloverReleaseId = "coverage-store-rollover-fixture";
  const rolloverDirectory = path.join(root, "releases", rolloverReleaseId);
  await cp(releaseDirectory, rolloverDirectory, { recursive: true });
  const rolloverStatePath = path.join(rolloverDirectory, "views", "states.jsonl");
  const rolloverState = JSON.parse((await readFile(rolloverStatePath, "utf8")).trim());
  rolloverState.state_name = "Rollover State";
  await writeFile(rolloverStatePath, jsonLines([rolloverState]));
  const rolloverManifestPath = path.join(rolloverDirectory, "manifest.json");
  const rolloverManifest = JSON.parse(await readFile(rolloverManifestPath, "utf8"));
  rolloverManifest.release_id = rolloverReleaseId;
  await writeFile(rolloverManifestPath, json(rolloverManifest));
  await writeFile(pointerPath, json({
    dataset_id: "national-business-coverage-views",
    release_id: rolloverReleaseId,
    manifest: `releases/${rolloverReleaseId}/manifest.json`,
  }));
  const rollover = await store.listDimension("states", { query: "rollover" });
  assert.equal(rollover.release_id, rolloverReleaseId);
  assert.equal(rollover.total, 1);
  assert.equal(rollover.records[0].state_name, "Rollover State");
  assert.equal(rollover.records[0].latest_source_revalidation.coverage_release_matches_current, false);
});

test("projects exact HOLD and bounded-connector permissions from the governed catalog", async () => {
  const states = (await createBusinessCoverageViewStore().listDimension("states", { limit: 100 })).records;
  for (const stateAbbreviation of ["DC", "AK"]) {
    const assessment = states.find((state) => state.postal_abbreviation === stateAbbreviation).latest_source_assessment;
    assert.equal(assessment.decision, "proceed-to-bounded-connector");
    assert.equal(assessment.authorized_next_action_type, "bounded-connector-implementation");
    assert.equal(assessment.offline_fixture_connector_authorized, true);
  }
  const hold = states.find((state) => state.postal_abbreviation === "MI").latest_source_assessment;
  assert.equal(hold.decision, "hold");
  assert.equal(hold.authorized_next_action_type, "written-preflight-inquiry");
  assert.equal(hold.offline_fixture_connector_authorized, false);
});

test("reports unavailable when no current coverage release exists", async () => {
  const store = createBusinessCoverageViewStore({
    pointerPath: path.join(os.tmpdir(), `missing-${crypto.randomUUID()}.json`),
    stateSourceRevalidationPath: null,
  });
  assert.deepEqual(await store.getOverview(), { available: false });
});
