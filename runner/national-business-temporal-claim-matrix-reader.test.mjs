import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  readNationalBusinessTemporalClaimMatrix,
  readNationalBusinessTemporalClaimRows,
} from "./national-business-temporal-claim-matrix-reader.mjs";

test("reads the selected temporal matrix with pinned local supplemental postures and preserves unknown all-business claims", async () => {
  const view = await readNationalBusinessTemporalClaimMatrix();
  assert.equal(
    view.schema_version,
    "national-business-temporal-claim-matrix-view@1.2.0",
  );
  assert.equal(view.available, true);
  assert.equal(
    view.scope,
    "effective-profile-classification-with-source-cohort-provenance",
  );
  assert.deepEqual(view.summary.source_cohort_counts, {
    source_defined_current_membership: 22,
    non_active_reporting_membership: 7,
    annual_aggregate: 1,
  });
  assert.deepEqual(view.summary.effective_profile_source_counts, {
    source_defined_current_membership: 21,
    non_active_reporting_membership: 7,
    annual_aggregate: 1,
    unknown_source_status: 1,
  });
  assert.equal(view.summary.classification_mismatches, 1);
  assert.equal(view.summary.mismatch_profiles, 633232);
  assert.deepEqual(view.publisher_membership, {
    source_key: "la_active_business_location_accounts",
    profile_source_id: "los-angeles-office-of-finance-active-businesses",
    assertion: "active-list-membership-without-row-status",
    profile_count: 633232,
    row_status: "null",
    lifecycle_evidence: "unknown",
  });
  assert.deepEqual(view.source_status_posture, { source_id: "cms-nppes-monthly-v2", status: "source-defined-current-registration-status", profile_count: 1958089, non_primary_reporting_count: 130691 });
  assert.deepEqual(view.organization_assertion_status_posture, { source_id: "co-business-registry", good_standing: { status: "source-defined-current-registry-standing", organization_count: 1019372 }, delinquent: { status: "non-active-reporting", organization_count: 1145439 } });
  assert.equal(view.provenance.source_status_posture.access_mode, "pointer-pinned-local-only");
  assert.equal(view.provenance.organization_assertion_status_posture.scope, "separate-organization-assertion-cohort");
  assert.equal(
    view.provenance.temporal.release_id,
    "national-business-temporal-claim-matrix-534d123499d07ec1beace832268a741fd2228897f222354905c43c2fb09d2090",
  );
  assert.equal(
    view.provenance.temporal.manifest_sha256,
    "342691d68f76cc38bc8ce480266fd5d36be3c7f892d258b8bfde5be94417ed05",
  );
  assert.equal(
    view.provenance.temporal.artifact_sha256,
    "d7ceedd8651500f2affce2df1dc93dea5c8d9a5b69e19720c67b76ecc76231b0",
  );
  assert.equal(
    view.provenance.reconciliation.registration_sha256,
    "8d772918c6f0bcf3ab664bc769f732a1c4941414bd1b5ce4c430516a252b007e",
  );
  assert.deepEqual(view.mismatch, {
    source_key: "la_active_business_location_accounts",
    profile_source_id: "los-angeles-office-of-finance-active-businesses",
    source_release_id: "la-active-businesses-2026-08-15-7a4190d1dfe2b2ac",
    source_cohort_classification: "source-defined-current-membership",
    effective_profile_classification: "unknown-source-status",
    lifecycle_evidence: "unknown",
    profile_count: 633232,
    current_operations_verified: false,
  });
  assert.equal(view.claims.current_operations_verified, false);
  assert.equal(view.claims.active_business_count, null);
  assert.equal(view.claims.completeness_percentage, null);
});

test("reader remains bounded and contains no acquisition path or pointer mutation", async () => {
  const code = await readFile(
    new URL(
      "./national-business-temporal-claim-matrix-reader.mjs",
      import.meta.url,
    ),
    "utf8",
  );
  assert.doesNotMatch(
    code,
    /current\.json|fetch\(|https?:|acquir|production.*write/i,
  );
  assert.match(code, /selected\s*===\s*true/);
  assert.match(code, /artifact\.bytes\s*<=\s*65536/);
});

test("internal semantic reader exposes only validated compact source semantics while summary remains unchanged", async () => {
  const summary = await readNationalBusinessTemporalClaimMatrix(),
    internal = await readNationalBusinessTemporalClaimRows();
  assert.equal(
    (await readNationalBusinessTemporalClaimMatrix({ includeRows: true }))
      .semantic_rows,
    undefined,
  );
  await assert.rejects(
    readNationalBusinessTemporalClaimMatrix({ includeRows: "true" }),
    /unavailable or incompatible/,
  );
  await assert.rejects(
    readNationalBusinessTemporalClaimMatrix({ includeRaws: true }),
    /unavailable or incompatible/,
  );
  assert.equal(summary.semantic_rows, undefined);
  assert.equal(internal.rows.length, 30);
  assert.equal(new Set(internal.rows.map((row) => row.source_key)).size, 30);
  assert.equal(
    internal.provenance.artifact_sha256,
    "d7ceedd8651500f2affce2df1dc93dea5c8d9a5b69e19720c67b76ecc76231b0",
  );
  assert.equal(internal.summary.source_defined_current_membership_sources, 22);
  const ny = internal.rows.find(
    (row) => row.source_key === "ny_retail_food_store_license_sites",
  );
  assert.equal(
    ny.source_release_id,
    "ny-retail-food-stores-2025-09-30-9dfbb0199594dab8",
  );
  assert.equal(ny.classification, "non-active-reporting-membership");
  assert.equal(ny.policy_sha256.length, 64);
  assert.ok(
    internal.rows.every((row) =>
      Object.keys(row).every((key) =>
        [
          "source_key",
          "profile_source_id",
          "source_release_id",
          "classification",
          "source_status_term",
          "cohort_scope",
          "jurisdiction_scope",
          "policy_path",
          "policy_sha256",
          "as_of_or_observed_from",
          "as_of_or_observed_through",
        ].includes(key),
      ),
    ),
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    readNationalBusinessTemporalClaimRows({ signal: controller.signal }),
    /abort/i,
  );
});
