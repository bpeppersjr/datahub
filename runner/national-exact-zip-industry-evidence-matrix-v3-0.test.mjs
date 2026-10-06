import test from "node:test";
import assert from "node:assert/strict";
import {
  verifyRegisteredNationalExactZipIndustryEvidenceMatrixV30 as verify,
  V30_TEST as contract,
} from "./national-exact-zip-industry-evidence-matrix-v3-0.mjs";

const summary = {
  zip5_rows: 48194,
  dimension_count: 51,
  industry_cells: 2457894,
  positive_zip5_rows: 1500,
  measured_zero_zip5_rows: 36336,
  outside_denominator_zip5_rows: 10358,
  address_evidence_sum: 24280,
  member_sha256: "a6b71a13b6f64a3efc39eac9f51ebbd370d26894255b238788f114265b36a943",
  weighted_sha256: "9cd65eb1909de5e1121e4a64792910d73f60cdd67466098705de1129f24f1d7c",
  source_license_records: 24281,
  organizations_published: 24281,
  provisional_physical_sites: 24230,
  provisional_establishments: 24230,
  organizations_without_complete_site_address: 51,
  zip_evidence_addresses: 24280,
  usable_platform_geocodes: 22999,
  quarantined_source_records: 0,
  source_zip_codes: 1500,
  zip_union_records: 37836,
  rows_with_undocumented_establishment_codes: 19,
};

test("v3.0 registered matrix replays the retained New York ZIP evidence", async () => {
  const value = await verify();
  assert.equal(value.release_id, "national-exact-zip-industry-evidence-matrix-e5287a4adc3f9b657499135d2f5641dac05b67359d9dbaf14ad4b72d598c97c9");
  assert.equal(value.manifest_sha256, "07192a24eae937d5fbe3d58f4c877d5cfefcc70d3f2ca24237b450d316d111f7");
  assert.deepEqual(value.summary, summary);
});

test("v3.0 summary conservation rejects drift", () => {
  contract.validSummary(summary);
  for (const key of ["dimension_count", "positive_zip5_rows", "address_evidence_sum", "source_license_records", "provisional_physical_sites", "zip_evidence_addresses", "source_zip_codes"])
    assert.throws(() => contract.validSummary({ ...summary, [key]: summary[key] + 1 }));
  assert.throws(() => contract.validSummary({ ...summary, member_sha256: "a".repeat(64) }));
});

test("v3.0 preserves null outside cells and closed annual-snapshot claims", () => {
  assert.equal(contract.cell(null).count, null);
  assert.equal(contract.cell({ licensed_location_address_count: 0 }).status, "measured-zero");
  assert.equal(contract.cell({ licensed_location_address_count: 1 }).temporal_status.status, "stale");
  const claims = contract.claims();
  assert.equal(claims.lifecycle_status, "non-active-reporting");
  assert.equal(claims.current_operations_verified, false);
  assert.equal(claims.continuous_operation_verified, false);
  assert.equal(claims.site_occupancy_verified, false);
  assert.equal(claims.public_access_verified, false);
  assert.equal(claims.unique_business_count, null);
  assert.equal(claims.complete_all_businesses, false);
  assert.equal(claims.nonadditive_with_ny_retail_food_location_profiles, true);
  assert.equal(claims.address_evidence_may_not_qualify_as_physical_site, true);
  assert.equal(claims.network_requests, 0);
  assert.equal(claims.current_pointer_written, false);
});
