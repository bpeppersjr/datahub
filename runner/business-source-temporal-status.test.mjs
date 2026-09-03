import assert from "node:assert/strict";
import test from "node:test";

import {
  assessBusinessSourceTemporalStatus,
  BUSINESS_SOURCE_TEMPORAL_POLICIES,
  summarizeBusinessSourceTemporalStatus,
} from "./business-source-temporal-status.mjs";

const AS_OF = new Date("2026-09-03T12:00:00.000Z");

function row(sourceKey, releaseMetadata = {}, observation = {}) {
  return {
    source_key: sourceKey,
    release_metadata: releaseMetadata,
    location_profile_geography: observation,
  };
}

test("pins temporal policies for every source in the current coverage release", () => {
  assert.equal(Object.keys(BUSINESS_SOURCE_TEMPORAL_POLICIES).length, 27);
  assert.equal(BUSINESS_SOURCE_TEMPORAL_POLICIES.ny_retail_food_store_license_sites.review_after_days, 120);
  assert.deepEqual(BUSINESS_SOURCE_TEMPORAL_POLICIES.il_business_registry_active_organizations.reference_fields, ["source_run_date"]);
});

test("assesses source reference age without claiming general business operation", () => {
  const result = assessBusinessSourceTemporalStatus(row(
    "california_abc_active_issued_license_sites",
    { source_modified_at: "2026-09-01T10:50:26.000Z" },
    { earliest_observed_at: "2026-09-02T00:00:00.000Z", latest_observed_at: "2026-09-02T01:00:00.000Z" },
  ), { asOf: AS_OF });
  assert.equal(result.status, "within-review-window");
  assert.equal(result.source_reference_field, "source_modified_at");
  assert.equal(result.source_reference_date, "2026-09-01");
  assert.equal(result.age_days, 2);
  assert.equal(result.general_business_operating_status_asserted, false);
  assert.deepEqual(result.normalized_record_observation_window, {
    first_seen: "2026-09-02T00:00:00.000Z",
    last_seen: "2026-09-02T01:00:00.000Z",
    meaning: "Registry profile observation time; not publisher source currency or proof of current operation.",
  });
});

test("marks aged, missing, future, and unconfigured evidence explicitly", () => {
  const due = assessBusinessSourceTemporalStatus(row("ny_retail_food_store_license_sites", { source_rows_updated_at: "2025-09-30T15:15:15.000Z" }), { asOf: AS_OF });
  const missing = assessBusinessSourceTemporalStatus(row("tx_active_sales_tax_permit_outlets"), { asOf: AS_OF });
  const future = assessBusinessSourceTemporalStatus(row("tx_active_sales_tax_permit_outlets", { source_rows_updated_at: "2026-09-10T00:00:00.000Z" }), { asOf: AS_OF });
  const unknown = assessBusinessSourceTemporalStatus(row("new_source", { source_updated_at: "2026-09-01" }), { asOf: AS_OF });
  assert.equal(due.status, "review-due");
  assert.equal(missing.status, "missing-source-reference");
  assert.equal(future.status, "future-source-reference");
  assert.equal(unknown.status, "unconfigured-source-policy");
  assert.deepEqual(summarizeBusinessSourceTemporalStatus([due, missing, future, unknown]), {
    total_sources: 4,
    policy_configured: 3,
    within_review_window: 0,
    review_due: 1,
    missing_source_reference: 1,
    future_source_reference: 1,
    unconfigured_source_policy: 1,
    general_business_operating_status_asserted: 0,
  });
});

test("normalizes annual reference years without treating them as named-business status", () => {
  const result = assessBusinessSourceTemporalStatus(row("census_nonemployer_statistics", { reference_year: 2023 }), { asOf: AS_OF });
  assert.equal(result.source_reference_at, "2023-12-31T23:59:59.999Z");
  assert.equal(result.status, "within-review-window");
  assert.equal(result.evidence_scope, "annual-aggregate-not-current-named-business-evidence");
});
