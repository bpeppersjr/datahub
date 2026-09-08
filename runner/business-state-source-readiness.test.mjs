import assert from "node:assert/strict";
import test from "node:test";

import {
  assessStateBusinessSourceReadiness,
  FIFTY_STATES_AND_DC,
  summarizeStateBusinessSourceReadiness,
} from "./business-state-source-readiness.mjs";

function state(postalAbbreviation, profiles = 100, coordinates = 10, isPeer = true) {
  return {
    postal_abbreviation: postalAbbreviation,
    is_50_states_or_dc: isPeer,
    registry_evidence: {
      reported_address_profile_count: profiles,
      coordinate_assigned_profile_count: coordinates,
      source_profile_counts_by_reported_address_state: { "cms-nppes-monthly-v2": profiles },
    },
  };
}

test("pins the exact 50-state and District of Columbia peer set", () => {
  assert.equal(FIFTY_STATES_AND_DC.length, 51);
  assert.equal(new Set(FIFTY_STATES_AND_DC).size, 51);
  assert.equal(FIFTY_STATES_AND_DC.includes("DC"), true);
  assert.equal(FIFTY_STATES_AND_DC.includes("PR"), false);
});

test("separates broad, scoped, local, and national-sector-only state evidence", () => {
  const broad = assessStateBusinessSourceReadiness(state("CO"));
  const scoped = assessStateBusinessSourceReadiness(state("TX"));
  const local = assessStateBusinessSourceReadiness(state("IL"));
  const national = assessStateBusinessSourceReadiness(state("AL"));
  const territory = assessStateBusinessSourceReadiness(state("PR", 20, 2, false));
  assert.equal(broad.source_scope_status, "broad-jurisdiction-organization-layer");
  assert.equal(broad.broad_jurisdiction_organization_layer.source_key, "co_business_registry_good_standing_or_delinquent_organizations");
  assert.deepEqual(scoped.statewide_scoped_source_keys, ["tx_active_sales_tax_permit_outlets"]);
  assert.equal(local.source_scope_status, "local-and-national-sector-layers-only");
  assert.deepEqual(local.local_source_keys, ["chicago_active_business_license_sites"]);
  assert.equal(national.source_scope_status, "national-sector-layers-only");
  assert.equal(territory.source_scope_status, "outside-50-states-and-dc-peer-scope");
  assert.equal(national.geometry_policy, "business-entities-use-address-latitude-longitude-only-no-business-geometry");
  assert.equal(national.complete_all_active_businesses, false);
});

test("summarizes the production source-scope model without converting profiles into businesses", () => {
  const rows = FIFTY_STATES_AND_DC.map((abbreviation) => state(abbreviation, 100, 10));
  const result = summarizeStateBusinessSourceReadiness(rows);
  assert.deepEqual(result, {
    policy_version: "1.1.0",
    jurisdictions_in_scope: 51,
    broad_jurisdiction_organization_layers: 8,
    missing_broad_jurisdiction_organization_layers: 43,
    statewide_scoped_layers_without_broad_layer: 5,
    local_layers_without_broad_or_statewide_layer: 1,
    national_sector_layers_only: 37,
    jurisdictions_with_national_sector_evidence: 51,
    reported_location_profiles: 5100,
    coordinate_assigned_profiles: 510,
    coordinate_assignment_percent: 10,
    complete_all_active_businesses: false,
  });
});

test("current MA/NJ reporting-only childcare is scoped industry evidence, not broad coverage or matching", () => {
  for (const [abbreviation, source] of [["MA", "ma-licensed-center-based-childcare"], ["NJ", "nj-licensed-childcare-centers"]]) {
    const historical = state(abbreviation); const current = structuredClone(historical);
    current.registry_evidence.source_profile_counts_by_reported_address_state[source] = 3;
    Object.assign(current.registry_evidence, { matching_profile_count: 100, reporting_only_count: 3, reported_address_profile_count: 103 });
    current.state_source_readiness = assessStateBusinessSourceReadiness(historical); current.state_source_readiness.policy_version = "1.0.0";
    const result = assessStateBusinessSourceReadiness(current);
    assert.equal(result.source_scope_status, "statewide-scoped-layer-only"); assert.equal(result.broad_jurisdiction_organization_layer.status, "missing");
    assert.equal(result.statewide_reporting_industry_evidence.identity_matching_eligible, false);
    assert.equal(assessStateBusinessSourceReadiness(historical).source_scope_status, "national-sector-layers-only");
    assert.equal(summarizeStateBusinessSourceReadiness([current]).statewide_scoped_layers_without_broad_layer, 1);
    current.registry_evidence.reporting_only_count = 2;
    assert.equal(assessStateBusinessSourceReadiness(current).source_scope_status, "national-sector-layers-only");
  }
});
