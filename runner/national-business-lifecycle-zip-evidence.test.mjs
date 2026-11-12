import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { aggregateLifecycleZipRowsForTest, lifecycleZipEvidenceClaimsForTest, validateLifecycleZipDecisionForTest } from "./national-business-lifecycle-zip-evidence.mjs";
import { APP_ROOT } from "./paths.mjs";

const decision = (overrides = {}) => ({
  schema_version: "business-entity-lifecycle-eligibility-row@1.0.0",
  profile_id: "location-profile:one",
  zip5: "12345",
  source_id: "publisher-one",
  source_release_id: "release-one",
  source_record_lineage_sha256: "1".repeat(64),
  policy_id: "publisher-one",
  policy_sha256: "2".repeat(64),
  taxonomy_source_key: "publisher_one",
  source_status_value: "publisher-current-membership",
  source_status_sha256: "3".repeat(64),
  profile_observed_at: "2026-09-01T00:00:00.000Z",
  source_reference_at: "2026-08-31T00:00:00.000Z",
  assessment_as_of: "2026-10-02T16:30:00.000Z",
  source_membership_class: "source-defined-current-membership",
  review_status: "within-review-window",
  lifecycle_evidence: "source-defined-current",
  current_operation_verified: false,
  active_business_eligible: false,
  reason_codes: ["source-membership-is-not-operation-verification"],
  ...overrides,
});

test("lifecycle ZIP decision contract rejects operation and active-business overclaims", () => {
  assert.doesNotThrow(() => validateLifecycleZipDecisionForTest(decision()));
  for (const mutate of [
    value => { value.current_operation_verified = true; },
    value => { value.active_business_eligible = true; },
    value => { value.zip5 = "1234"; },
    value => { value.lifecycle_evidence = "active-business"; },
    value => { value.review_status = "fresh-enough"; },
    value => { value.reason_codes = []; },
    value => { value.extra = true; },
  ]) {
    const changed = structuredClone(decision()); mutate(changed);
    assert.throws(() => validateLifecycleZipDecisionForTest(changed), /lifecycle decision contract/i);
  }
});

test("fixture aggregation is dense, source-relative and conserves lifecycle evidence", () => {
  const result = aggregateLifecycleZipRowsForTest([
    { zip5: "12345", classification: "same-code-census-zcta" },
    { zip5: "12346", classification: "denominator-only-outside-zcta" },
  ], [
    decision(),
    decision({ profile_id: "location-profile:two", lifecycle_evidence: "contradictory", source_membership_class: "non-active-reporting-membership", reason_codes: ["source-date-contradiction"] }),
    decision({ profile_id: "location-profile:three", zip5: "99999", source_id: "publisher-two", source_release_id: "release-two", taxonomy_source_key: "publisher_two", lifecycle_evidence: "unknown", review_status: "unmeasured", source_status_value: null, reason_codes: ["source-status-unavailable"] }),
  ]);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].profile_membership_count, 2);
  assert.equal(result.rows[1].profile_membership_count, 0);
  assert.deepEqual(result.rows[0].lifecycle_evidence_counts, { "source-defined-current": 1, "non-active-reporting": 0, unknown: 0, contradictory: 1 });
  assert.equal(result.rows[0].sources[0].profile_membership_count, 2);
  assert.equal(result.outside_rows.length, 1);
  assert.equal(result.outside_rows[0].zip5, "99999");
  assert.equal(result.totals.profile_membership_count, 3);
  assert.deepEqual(result.totals.review_status_counts, { "within-review-window": 2, stale: 0, unmeasured: 1, unmapped: 0 });
});

test("release claims preserve the non-numerator evidence boundary", () => {
  assert.deepEqual(lifecycleZipEvidenceClaimsForTest(), {
    record_unit: "registry-location-profile-lifecycle-membership",
    dense_governed_zip_cohort: true,
    source_relative_lifecycle_evidence: true,
    non_numerator_sidecar: true,
    unique_business_count: null,
    active_business_count: null,
    current_operating_business_count: null,
    all_business_completeness: null,
    current_operation_verified: false,
    active_business_eligible: false,
    identity_resolution_applied: false,
    additive_across_sources: false,
    authoritative_current_usps_zip_denominator: null,
    zip4_joined: false,
    network_requests: 0,
    source_acquisition_performed: false,
    current_pointer_written: false,
    production_enrollment: false,
  });
});

test("registered lifecycle ZIP release pins its exact closed manifest", async () => {
  const registration = JSON.parse(await readFile(path.join(APP_ROOT, "config/datasets/national-business-lifecycle-zip-evidence.json"), "utf8"));
  assert.deepEqual(Object.keys(registration).sort(), ["schema_version", "dataset_id", "status", "runtime_pointer", "production_enrollment", "retained_release", "claims", "documentation"].sort());
  assert.equal(registration.schema_version, "national-business-lifecycle-zip-evidence-registration@1.0.0");
  assert.equal(registration.runtime_pointer, null);
  assert.equal(registration.production_enrollment, false);
  assert.equal(registration.retained_release.zip5_rows, 48194);
  assert.equal(registration.retained_release.positive_zip5_rows, 42267);
  assert.equal(registration.retained_release.profile_membership_count, 8011213);
  assert.equal(registration.retained_release.artifact_count, 102);
  assert.deepEqual(registration.claims, lifecycleZipEvidenceClaimsForTest());
  const manifestBytes = await readFile(path.join(APP_ROOT, registration.retained_release.manifest));
  assert.equal(createHash("sha256").update(manifestBytes).digest("hex"), registration.retained_release.manifest_sha256);
  assert.equal(manifestBytes.length, registration.retained_release.manifest_bytes);
  const manifest = JSON.parse(manifestBytes);
  assert.equal(manifest.release_id, registration.retained_release.release_id);
  assert.equal(manifest.artifacts.length, registration.retained_release.artifact_count);
  assert.deepEqual(manifest.claims, lifecycleZipEvidenceClaimsForTest());
  assert.equal(manifest.summary.outside_cohort_profile_memberships, 0);
});
