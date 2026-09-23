import assert from "node:assert/strict";
import test from "node:test";
import { BROAD_ORGANIZATION_SOURCES, buildBroadOrganizationEvidence } from "./broad-organization-evidence.mjs";

const source = (state) => ({ source_key: BROAD_ORGANIZATION_SOURCES[state].sourceKey, ...(BROAD_ORGANIZATION_SOURCES[state].profileSourceId ? { profile_source_id: BROAD_ORGANIZATION_SOURCES[state].profileSourceId } : {}), complete_source_for_all_businesses: false, zip_rows_with_contribution: 4, zip_level_counts: { organization_address_count: 10, provisional_physical_site_count: 9 }, release_metadata: { source_release_id: BROAD_ORGANIZATION_SOURCES[state].sourceReleaseId ?? `release-${state}`, source_rows_updated_at: "2026-09-01T00:00:00Z", source_modified_at: "2026-09-01T00:00:00Z", ...(state === "AK" ? { source_observed_from: "2026-09-03T00:37:00Z", source_observed_through: "2026-09-03T00:37:03Z" } : {}), ...(BROAD_ORGANIZATION_SOURCES[state].localReviewOnly ? { record_level_distribution: "local-review-only" } : {}) }, location_profile_geography: { profile_count: 0, coordinate_assigned_single_count: 0 } });

test("projects all nine retained sources without borrowing geocode coverage or authority", async () => {
  for (const state of Object.keys(BROAD_ORGANIZATION_SOURCES)) {
    const evidence = await buildBroadOrganizationEvidence({ state, source: source(state), asOf: "2026-09-22T00:00:00Z" });
    assert.deepEqual(evidence.geocode, { status: "unmeasured-at-source-level", assigned: null, eligible: null, percent: null, scope: "selected-broad-organization-source" });
    assert.equal(evidence.authorization.acquisition_authorized, false);
    assert.equal(evidence.general_business_operating_status_asserted, false);
    assert.match(evidence.policy.sha256, /^[a-f0-9]{64}$/);
  }
  const ak = await buildBroadOrganizationEvidence({ state: "AK", source: source("AK"), asOf: "2026-09-22T00:00:00Z" });
  assert.equal(ak.source_key, "ak_active_business_licenses");
  assert.equal(ak.profile_source_id, "alaska-dcced-active-business-licenses");
  assert.equal(ak.source_release_id, "ak-active-business-licenses-2026-09-03-d77a60ab0d6e75dc");
  assert.equal(ak.record_unit_semantics, BROAD_ORGANIZATION_SOURCES.AK.recordUnitSemantics);
  assert.equal(ak.zip_contribution.address_counts.organization_address_count, 10);
  assert.equal(ak.zip_contribution.address_counts.provisional_physical_site_count, 9);
  assert.equal(ak.policy.field_export_policy.normalized_record_level_organizations_addresses_sites_assertions_relationships_and_match_profiles, "local-review-only");
});

test("fails closed on source identity, completeness, ZIP, and temporal drift", async () => {
  for (const mutate of [
    (row) => { row.source_key = "wrong"; },
    (row) => { row.complete_source_for_all_businesses = true; },
    (row) => { row.zip_rows_with_contribution = -1; },
    (row) => { row.release_metadata = {}; },
  ]) {
    const row = source("CO"); mutate(row);
    await assert.rejects(buildBroadOrganizationEvidence({ state: "CO", source: row, asOf: "2026-09-22T00:00:00Z" }), /rejected/);
  }
  const alaska = source("AK"); alaska.profile_source_id = "wrong-profile";
  await assert.rejects(buildBroadOrganizationEvidence({ state: "AK", source: alaska, asOf: "2026-09-22T00:00:00Z" }), /profile source identity drifted/);
});
