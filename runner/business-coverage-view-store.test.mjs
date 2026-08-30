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
    employer_baseline: { status: "published", establishments: 4 },
    jurisdiction_overlay: { relationships: [{ material_intersection: true }] },
    current_usps_validity: { status: "unverified" },
    coverage_gap_codes: ["authoritative-current-usps-validity-unverified"],
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
  }]);
  await artifact("coverage-gap-view-jsonl", "coverage-gaps", [{
    gap_id: "gap:zip-no-zcta:54321",
    gap_type: "zip-without-2020-zcta-polygon",
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
    authoritative_current_usps_zip_denominator: null,
    coverage: { state_views: 1, county_views: 1, zip_views: 1, source_views: 1, gap_views: 1 },
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

  const store = createBusinessCoverageViewStore({ pointerPath });
  const overview = await store.getOverview();
  assert.equal(overview.available, true);
  assert.equal(overview.release_id, releaseId);
  assert.equal(overview.sources[0].profile_count, 2);
  const states = await store.listDimension("states", { query: "fixture" });
  assert.equal(states.total, 1);
  assert.equal(states.records[0].reported_address_profile_count, 2);
  assert.equal(states.records[0].nonemployer_baseline.nonemployer_establishments, 5);
  const counties = await store.listDimension("counties", { stateFips: "99" });
  assert.equal(counties.total, 0);
  const sourceRows = await store.listDimension("sources");
  assert.equal(sourceRows.records[0].source_kind, "aggregate-baseline");
  assert.equal(sourceRows.records[0].aggregate_baseline.national_nonemployer_establishments, 5);
  const zips = await store.listDimension("zips", { query: "123" });
  assert.equal(zips.total, 1);
  assert.equal(zips.records[0].physical_site_count, 2);
  assert.equal(zips.records[0].material_county_count, 1);
  const gaps = await store.listDimension("gaps", { gapType: "zip-without-2020-zcta-polygon" });
  assert.equal(gaps.total, 1);
  await assert.rejects(store.listDimension("unsupported"), /Unsupported coverage dimension/);
});

test("reports unavailable when no current coverage release exists", async () => {
  const store = createBusinessCoverageViewStore({ pointerPath: path.join(os.tmpdir(), `missing-${crypto.randomUUID()}.json`) });
  assert.deepEqual(await store.getOverview(), { available: false });
});
