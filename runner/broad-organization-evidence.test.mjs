import assert from "node:assert/strict";
import test from "node:test";
import { BROAD_ORGANIZATION_SOURCES, DC_BROAD_ORGANIZATION_CONTRACT_VERSION, buildBroadOrganizationEvidence } from "./broad-organization-evidence.mjs";

const source = (state) => ({ source_key: BROAD_ORGANIZATION_SOURCES[state].sourceKey, ...(BROAD_ORGANIZATION_SOURCES[state].profileSourceId ? { profile_source_id: BROAD_ORGANIZATION_SOURCES[state].profileSourceId } : {}), complete_source_for_all_businesses: false, zip_rows_with_contribution: 4, zip_level_counts: { organization_address_count: 10, provisional_physical_site_count: 9 }, release_metadata: { source_release_id: BROAD_ORGANIZATION_SOURCES[state].sourceReleaseId ?? `release-${state}`, source_rows_updated_at: "2026-09-01T00:00:00Z", source_modified_at: "2026-09-01T00:00:00Z", ...(state === "DC" ? { source_refreshed_at: "2026-09-07T04:00:00.000Z" } : {}), ...(state === "AK" ? { source_observed_from: "2026-09-03T00:37:00Z", source_observed_through: "2026-09-03T00:37:03Z" } : {}), ...(BROAD_ORGANIZATION_SOURCES[state].localReviewOnly ? { record_level_distribution: "local-review-only" } : {}) }, location_profile_geography: state === "DC" ? { profile_count: 54890, coordinate_present_valid_count: 42750, coordinate_assigned_single_count: 42749 } : { profile_count: 0, coordinate_present_valid_count: 0, coordinate_assigned_single_count: 0 } });
const dcCoverage = () => ({ dc_basic_business_license_source_rows: 70098, dc_basic_business_license_accepted_rows: 57372, dc_basic_business_license_organizations: 54890, dc_basic_business_license_quarantined_source_records: 12726, dc_basic_business_license_quarantined_customer_groups: 12567, dc_basic_business_license_source_geocoded_sites: 42750 });

test("projects retained sources without borrowing geocode coverage or authority", async () => {
  for (const state of Object.keys(BROAD_ORGANIZATION_SOURCES)) {
    const evidence = await buildBroadOrganizationEvidence({ state, source: source(state), ...(state === "DC" ? { registryCoverage: dcCoverage() } : {}), asOf: "2026-09-22T00:00:00Z" });
    assert.equal(evidence.authorization.acquisition_authorized, false);
    assert.equal(evidence.general_business_operating_status_asserted, false);
    assert.match(evidence.policy.sha256, /^[a-f0-9]{64}$/);
    if (state !== "DC") assert.deepEqual(evidence.geocode, { status: "unmeasured-at-source-level", assigned: null, eligible: null, percent: null, scope: "selected-broad-organization-source" });
  }
  const ak = await buildBroadOrganizationEvidence({ state: "AK", source: source("AK"), asOf: "2026-09-22T00:00:00Z" });
  assert.equal(ak.source_key, "ak_active_business_licenses");
  assert.equal(ak.profile_source_id, "alaska-dcced-active-business-licenses");
  assert.equal(ak.source_release_id, "ak-active-business-licenses-2026-09-03-d77a60ab0d6e75dc");
  assert.equal(ak.record_unit_semantics, BROAD_ORGANIZATION_SOURCES.AK.recordUnitSemantics);
  assert.equal(ak.zip_contribution.address_counts.organization_address_count, 10);
  assert.equal(ak.zip_contribution.address_counts.provisional_physical_site_count, 9);
  assert.equal(ak.policy.field_export_policy.normalized_record_level_organizations_addresses_sites_assertions_relationships_and_match_profiles, "local-review-only");
  const dc = await buildBroadOrganizationEvidence({ state: "DC", source: source("DC"), registryCoverage: dcCoverage(), asOf: "2026-09-22T00:00:00Z" });
  assert.equal(dc.schema_version, "1.2.0");
  assert.equal(dc.source_key, "dc_basic_business_license_sites");
  assert.equal(dc.profile_source_id, "dc-dlcp-active-basic-business-licenses");
  assert.equal(dc.source_release_id, "dc-basic-business-licenses-2026-09-07-70f09a6a032c9408");
  assert.equal(dc.evidence_contract.schema_version, DC_BROAD_ORGANIZATION_CONTRACT_VERSION);
  assert.equal(dc.evidence_contract.record_level_distribution, "local-review-only");
  assert.equal(dc.evidence_contract.all_business_completeness_percent, null);
  assert.equal(dc.evidence_contract.active_business_completeness_percent, null);
  assert.match(dc.evidence_contract.active_status_semantics, /not proof of continuous operation/);
  assert.match(dc.evidence_contract.excluded_business_universe, /exempt businesses/);
  assert.match(dc.record_unit_semantics, /Customer Number/);
  assert.deepEqual({ assigned: dc.geocode.assigned, eligible: dc.geocode.eligible }, { assigned: 42749, eligible: 54890 });
  assert.equal(dc.geocode.coordinate_present_valid, 42750);
  assert.match(dc.geocode.scope, /not a D.C.-address-state/);
  assert.deepEqual({ source: dc.quarantine.source_rows, accepted: dc.quarantine.accepted_license_activity_rows, quarantined: dc.quarantine.quarantined_source_records, groups: dc.quarantine.quarantined_customer_groups }, { source: 70098, accepted: 57372, quarantined: 12726, groups: 12567 });
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
  const dc = source("DC"); dc.release_metadata.source_release_id = "wrong-release";
  await assert.rejects(buildBroadOrganizationEvidence({ state: "DC", source: dc, registryCoverage: dcCoverage(), asOf: "2026-09-22T00:00:00Z" }), /source release lineage drifted/);
  const brokenCoverage = dcCoverage(); brokenCoverage.dc_basic_business_license_quarantined_source_records = 0;
  await assert.rejects(buildBroadOrganizationEvidence({ state: "DC", source: source("DC"), registryCoverage: brokenCoverage, asOf: "2026-09-22T00:00:00Z" }), /do not conserve/);
});
