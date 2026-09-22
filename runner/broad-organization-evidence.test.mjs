import assert from "node:assert/strict";
import test from "node:test";
import { BROAD_ORGANIZATION_SOURCES, buildBroadOrganizationEvidence } from "./broad-organization-evidence.mjs";

const source = (state) => ({ source_key: BROAD_ORGANIZATION_SOURCES[state].sourceKey, complete_source_for_all_businesses: false, zip_rows_with_contribution: 4, zip_level_counts: { organization_address_count: 10 }, release_metadata: { source_release_id: `release-${state}`, source_rows_updated_at: "2026-09-01T00:00:00Z", source_modified_at: "2026-09-01T00:00:00Z" }, location_profile_geography: { profile_count: 0, coordinate_assigned_single_count: 0 } });

test("projects all eight retained sources without borrowing geocode coverage or authority", async () => {
  for (const state of Object.keys(BROAD_ORGANIZATION_SOURCES)) {
    const evidence = await buildBroadOrganizationEvidence({ state, source: source(state), asOf: "2026-09-22T00:00:00Z" });
    assert.deepEqual(evidence.geocode, { status: "unmeasured-at-source-level", assigned: null, eligible: null, percent: null, scope: "selected-broad-organization-source" });
    assert.equal(evidence.authorization.acquisition_authorized, false);
    assert.equal(evidence.general_business_operating_status_asserted, false);
    assert.match(evidence.policy.sha256, /^[a-f0-9]{64}$/);
  }
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
});
