import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import path from "node:path";
import { BROAD_ORGANIZATION_EVIDENCE_TEST_HOOKS, BROAD_ORGANIZATION_SOURCES, DC_BROAD_ORGANIZATION_CONTRACT_VERSION, DC_BROAD_ORGANIZATION_SOURCE, TX_BROAD_ORGANIZATION_CONTRACT_VERSION, TX_BROAD_ORGANIZATION_SOURCE, buildBroadOrganizationEvidence } from "./broad-organization-evidence.mjs";
import { APP_ROOT } from "./paths.mjs";

const source = (state) => ({ source_key: BROAD_ORGANIZATION_SOURCES[state].sourceKey, ...(BROAD_ORGANIZATION_SOURCES[state].profileSourceId ? { profile_source_id: BROAD_ORGANIZATION_SOURCES[state].profileSourceId } : {}), complete_source_for_all_businesses: false, zip_rows_with_contribution: state === "DC" ? 3125 : 4, zip_level_counts: state === "DC" ? { licensed_site_count: 54910 } : { organization_address_count: 10, provisional_physical_site_count: 9 }, release_metadata: { source_release_id: BROAD_ORGANIZATION_SOURCES[state].sourceReleaseId ?? `release-${state}`, source_rows_updated_at: "2026-09-01T00:00:00Z", source_modified_at: "2026-09-01T00:00:00Z", ...(state === "DC" ? { source_refreshed_at: "2026-09-07T04:00:00.000Z" } : {}), ...(state === "AK" ? { source_observed_from: "2026-09-03T00:37:00Z", source_observed_through: "2026-09-03T00:37:03Z" } : {}), ...(BROAD_ORGANIZATION_SOURCES[state].localReviewOnly ? { record_level_distribution: "local-review-only" } : {}) }, location_profile_geography: state === "DC" ? { profile_count: 54910, coordinate_present_valid_count: 42744, coordinate_assigned_single_count: 42743 } : { profile_count: 0, coordinate_present_valid_count: 0, coordinate_assigned_single_count: 0 } });
const dcCoverage = () => ({ dc_basic_business_license_source_rows: 70276, dc_basic_business_license_accepted_rows: 57418, dc_basic_business_license_normalized_sites: 54910, dc_basic_business_license_organizations: 54910, dc_basic_business_license_quarantined_source_records: 12858, dc_basic_business_license_quarantined_customer_groups: 12696, dc_basic_business_license_source_geocoded_sites: 42744, dc_basic_business_license_source_coordinate_conflict_sites: 0, dc_basic_business_license_in_dc_premise_sites: 44055, dc_basic_business_license_outside_dc_premise_sites: 10855 });
const txCoverage = () => ({ tx_active_sales_tax_source_outlet_permits: 885278, tx_active_sales_tax_normalized_outlet_permits: 885097, tx_active_sales_tax_unique_taxpayers: 700705, tx_active_sales_tax_quarantined_source_records: 181 });
const txProfileCounts = () => ({ CO: 1, FL: 1, LA: 1, TX: 885093, VA: 1 });

test("projects retained sources without borrowing geocode coverage or authority", async () => {
  for (const state of Object.keys(BROAD_ORGANIZATION_SOURCES)) {
    const evidence = await buildBroadOrganizationEvidence({ state, source: source(state), ...(state === "DC" ? { registryCoverage: dcCoverage() } : {}), ...(state === "TX" ? { registryCoverage: txCoverage(), reportedAddressProfileCounts: txProfileCounts() } : {}), asOf: "2026-09-22T00:00:00Z" });
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
  assert.equal(dc.schema_version, "1.3.0");
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
  assert.deepEqual({ assigned: dc.geocode.assigned, eligible: dc.geocode.eligible }, { assigned: 42743, eligible: 54910 });
  assert.equal(dc.geocode.coordinate_present_valid, 42744);
  assert.match(dc.geocode.scope, /not a D.C.-address-state/);
  assert.deepEqual({ source: dc.quarantine.source_rows, accepted: dc.quarantine.accepted_license_activity_rows, quarantined: dc.quarantine.quarantined_source_records, groups: dc.quarantine.quarantined_customer_groups }, { source: 70276, accepted: 57418, quarantined: 12858, groups: 12696 });
  assert.equal(dc.dataset_release_id, DC_BROAD_ORGANIZATION_SOURCE.datasetReleaseId);
  assert.equal(dc.dataset_manifest_sha256, DC_BROAD_ORGANIZATION_SOURCE.datasetManifestSha256);
  const tx = await buildBroadOrganizationEvidence({ state: "TX", source: source("TX"), registryCoverage: txCoverage(), reportedAddressProfileCounts: txProfileCounts(), asOf: "2026-09-22T00:00:00Z" });
  assert.equal(tx.dataset_release_id, TX_BROAD_ORGANIZATION_SOURCE.datasetReleaseId);
  assert.equal(tx.dataset_manifest_sha256, TX_BROAD_ORGANIZATION_SOURCE.datasetManifestSha256);
  assert.equal(tx.evidence_contract.schema_version, TX_BROAD_ORGANIZATION_CONTRACT_VERSION);
  assert.deepEqual(tx.evidence_contract.reported_address_profiles_by_state, txProfileCounts());
  assert.equal(tx.evidence_contract.normalized_permitted_outlets, 885097);
  assert.equal(tx.evidence_contract.unique_taxpayer_organizations, 700705);
  assert.equal(tx.evidence_contract.source_zip_keys, 2156);
  assert.equal(tx.evidence_contract.all_business_completeness_percent, null);
  assert.equal(tx.evidence_contract.active_business_completeness_percent, null);
  assert.equal(tx.evidence_contract.record_level_distribution, "local-review-only");
  assert.match(tx.evidence_contract.excluded_business_universe, /not the Texas Secretary of State entity master/);
  assert.match(tx.evidence_contract.active_status_semantics, /not proof of continuous operation/);
  assert.match(tx.evidence_contract.outlet_semantics, /not establish a currently operating/);
  assert.match(tx.evidence_contract.source_geocodes, /not-provided/);
  assert.equal(tx.geocode.percent, null);
  assert.equal(tx.geocode.assigned, null);
  assert.equal(tx.geocode.eligible, null);
  assert.equal(tx.policy.field_export_policy.normalized_record_level_taxpayers_outlets_sites_assertions_relationships_and_match_profiles, "local-review-only");
});

test("DC retained manifest pin rejects hash, release, source-release, count, policy, and claim drift", async () => {
  const file = path.join(APP_ROOT, ...DC_BROAD_ORGANIZATION_SOURCE.datasetManifestPath.split("/"));
  const originalBytes = await readFile(file), original = JSON.parse(originalBytes);
  const sourceRow = source("DC"); sourceRow.zip_rows_with_contribution = original.coverage.source_zip_codes;
  const verify = (bytes, spec = DC_BROAD_ORGANIZATION_SOURCE, coverage = dcCoverage()) => BROAD_ORGANIZATION_EVIDENCE_TEST_HOOKS.validateDcRetainedRelease(bytes, spec, coverage, sourceRow);
  assert.throws(() => verify(Buffer.concat([originalBytes, Buffer.from(" ")])), /manifest hash drifted/);
  for (const [label, mutate, pattern] of [
    ["release", value => { value.release_id = "wrong-release"; }, /release, policy, or completeness claim drifted/],
    ["source release", value => { value.source_release_id = "wrong-source-release"; }, /release, policy, or completeness claim drifted/],
    ["count", value => { value.coverage.organizations++; }, /coverage, quarantine, address-state, or ZIP counts drifted/],
    ["policy", value => { value.policy.record_level_distribution = "public"; }, /release, policy, or completeness claim drifted/],
    ["claim", value => { value.coverage.complete_all_businesses = true; }, /release, policy, or completeness claim drifted/],
  ]) {
    const value = structuredClone(original); mutate(value);
    const bytes = Buffer.from(JSON.stringify(value));
    const spec = { ...DC_BROAD_ORGANIZATION_SOURCE, datasetManifestSha256: createHash("sha256").update(bytes).digest("hex") };
    assert.throws(() => verify(bytes, spec), pattern, label);
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
  const alaska = source("AK"); alaska.profile_source_id = "wrong-profile";
  await assert.rejects(buildBroadOrganizationEvidence({ state: "AK", source: alaska, asOf: "2026-09-22T00:00:00Z" }), /profile source identity drifted/);
  const dc = source("DC"); dc.release_metadata.source_release_id = "wrong-release";
  await assert.rejects(buildBroadOrganizationEvidence({ state: "DC", source: dc, registryCoverage: dcCoverage(), asOf: "2026-09-22T00:00:00Z" }), /source release lineage drifted/);
  const brokenCoverage = dcCoverage(); brokenCoverage.dc_basic_business_license_quarantined_source_records = 0;
  await assert.rejects(buildBroadOrganizationEvidence({ state: "DC", source: source("DC"), registryCoverage: brokenCoverage, asOf: "2026-09-22T00:00:00Z" }), /coverage, quarantine, address-state, or ZIP counts drifted/);
  const brokenTxCoverage = txCoverage(); brokenTxCoverage.tx_active_sales_tax_normalized_outlet_permits++;
  await assert.rejects(buildBroadOrganizationEvidence({ state: "TX", source: source("TX"), registryCoverage: brokenTxCoverage, reportedAddressProfileCounts: txProfileCounts(), asOf: "2026-09-22T00:00:00Z" }), /counts or ZIP-key evidence/);
  const brokenTxProfiles = txProfileCounts(); brokenTxProfiles.TX++;
  await assert.rejects(buildBroadOrganizationEvidence({ state: "TX", source: source("TX"), registryCoverage: txCoverage(), reportedAddressProfileCounts: brokenTxProfiles, asOf: "2026-09-22T00:00:00Z" }), /profile counts drifted/);
  const wrongTx = source("TX"); wrongTx.profile_source_id = "wrong-profile";
  await assert.rejects(buildBroadOrganizationEvidence({ state: "TX", source: wrongTx, registryCoverage: txCoverage(), reportedAddressProfileCounts: txProfileCounts(), asOf: "2026-09-22T00:00:00Z" }), /profile source identity drifted/);
});
