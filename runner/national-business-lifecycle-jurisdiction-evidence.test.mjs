import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateLifecycleJurisdictionRowsForTest,
  lifecycleJurisdictionClaimsForTest,
  verifyRegisteredNationalBusinessLifecycleJurisdictionEvidence,
} from "./national-business-lifecycle-jurisdiction-evidence.mjs";

const counts = (current = 0) => ({ "source-defined-current": current, "non-active-reporting": 0, unknown: 0, contradictory: 0 });
const reviews = (current = 0) => ({ "within-review-window": current, stale: 0, unmeasured: 0, unmapped: 0 });

test("fixture aggregation keeps special scopes separate and conserves membership", () => {
  const scope = id => ({ scope_id: id, scope_label: id, state_geo_id: null, state_fips: null, state_name: null, postal_abbreviation: null });
  const rows = aggregateLifecycleJurisdictionRowsForTest(
    [scope("state:01"), scope("multi-state-material")],
    new Map([["12345", "state:01"], ["99999", "multi-state-material"]]),
    [
      { zip5: "12345", profile_membership_count: 3, lifecycle_evidence_counts: counts(3), review_status_counts: reviews(3) },
      { zip5: "99999", profile_membership_count: 0, lifecycle_evidence_counts: counts(), review_status_counts: reviews() },
    ],
    ["source-one"],
  );
  assert.equal(rows.length, 2);
  assert.equal(rows.find(row => row.scope_id === "state:01").profile_membership_count, 3);
  assert.equal(rows.find(row => row.scope_id === "multi-state-material").zero_profile_zip5_rows, 1);
});

test("claims prohibit numerator, operation, completeness, allocation, and additivity overclaims", () => {
  const claims = lifecycleJurisdictionClaimsForTest();
  assert.equal(claims.non_numerator_sidecar, true);
  assert.equal(claims.unique_business_count, null);
  assert.equal(claims.current_operation_verified, false);
  assert.equal(claims.all_business_completeness, null);
  assert.equal(claims.usps_zip_state_assignment, false);
  assert.equal(claims.multi_state_evidence_allocated, false);
  assert.equal(claims.cross_source_additivity, false);
});

test("registered immutable lifecycle jurisdiction release verifies", async () => {
  const result = await verifyRegisteredNationalBusinessLifecycleJurisdictionEvidence();
  assert.equal(result.scope_rows, 60);
  assert.equal(result.zip5_rows, 48_194);
  assert.equal(result.profile_membership_count, 8_011_213);
});
