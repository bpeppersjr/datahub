import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  loadInInbizBulkProductReference,
  validateInInbizBulkProductReference,
  verifyInInbizBulkProductReferenceBytes,
} from "./in-inbiz-bulk-product-reference.mjs";
import { loadBroadOfflineConnectorReadinessWave } from "./broad-organization-offline-connector-readiness-wave.mjs";
import { APP_ROOT } from "./paths.mjs";

test("IN reference preserves account-gated product observations and unresolved scope without authority", async () => {
  const reference = await loadInInbizBulkProductReference();
  assert.equal(reference.decision, "hold");
  for (const key of ["current_schema_compatibility_verified", "scope_semantics_verified", "connector_ready", "acquisition_authorized", "account_created", "purchase_made"]) assert.equal(reference[key], false);
  for (const key of ["required_source_files", "source_records_acquired", "broad_layer_gaps_resolved"]) assert.equal(reference[key], 0);
  assert.ok(Object.values(reference.authority).every(value => value === false));
  assert.equal(reference.controls.pdf_files_retained, 0);
  const { inbiz_bulk_services: page, regulatory_analysis: analysis } = reference.current_documentation;
  assert.equal(page.http_status, 200);
  assert.equal(page.account_required, true);
  assert.match(page.one_time_file, /first of the month.*all businesses registered.*prior month/);
  assert.equal(page.access_months, 12);
  assert.equal(page.subscription_baseline_usd, 9500);
  assert.equal(page.selected_monthly_update_usd, 500);
  assert.equal(analysis.http_status, 200);
  assert.equal(analysis.retained_locally, false);
  assert.equal(analysis.one_time_baseline_usd, 8000);
  assert.equal(analysis.baseline_delivery_described, "USB");
  assert.equal(analysis.scope_conflict_resolved, false);
  assert.equal(analysis.narrative_scope, "All registered businesses.");
  assert.equal(analysis.comparison_table_scope, "All active businesses.");
  assert.deepEqual(reference.scope_and_privacy_boundaries.excluded_entity_types, ["general partnerships", "sole proprietors"]);
  assert.match(reference.scope_and_privacy_boundaries.address_roles, /principal-office, registered-agent/);
  assert.match(reference.scope_and_privacy_boundaries.zip, /ZIP5 and ZIP4 separate/);
  assert.match(reference.scope_and_privacy_boundaries.cmra, /do not infer.*categorically withheld/);
});

test("IN remains outside readiness wave and its October assessment stays byte-identical", async () => {
  const wave = await loadBroadOfflineConnectorReadinessWave();
  assert.ok(!wave.states.some(row => row.state === "IN"));
  const prior = await readFile(path.join(APP_ROOT, "config/state-business-source-assessments/in-2026-10-03.json"));
  assert.equal(createHash("sha256").update(prior).digest("hex"), "985bee2a6e3c1e46b01451c038f5336d1404d333c381f0b85d5148b73e9a99f7");
  assert.equal(JSON.parse(prior).decision, "hold");
});

test("IN rejects identity, authority, scope, source facts and arbitrary content drift", async () => {
  const reference = await loadInInbizBulkProductReference();
  const mutations = [
    value => { value.state = "IL"; },
    value => { value.schema_version = "in-inbiz-bulk-product-reference@2.0.0"; },
    value => { value.decision = "ready"; },
    ...["current_schema_compatibility_verified", "scope_semantics_verified", "connector_ready", "acquisition_authorized", "account_created", "purchase_made"].map(key => value => { value[key] = true; }),
    ...["required_source_files", "source_records_acquired", "broad_layer_gaps_resolved"].map(key => value => { value[key] = 1; }),
    ...Object.keys(reference.authority).map(key => value => { value.authority[key] = true; }),
    ...Object.keys(reference.controls).map(key => value => { value.controls[key] = 1; }),
    value => { delete value.authority.source_acquisition; },
    value => { value.current_documentation.regulatory_analysis.retained_locally = true; },
    value => { value.current_documentation.regulatory_analysis.scope_conflict_resolved = true; },
    value => { value.current_documentation.regulatory_analysis.comparison_table_scope = "All registered businesses."; },
    value => { value.current_documentation.regulatory_analysis.observed_sha256 = "0".repeat(64); },
    value => { value.current_documentation.inbiz_bulk_services.account_required = false; },
    value => { value.current_documentation.inbiz_bulk_services.url = "https://example.com/"; },
    value => { value.scope_and_privacy_boundaries.excluded_entity_types.pop(); },
    value => { value.scope_and_privacy_boundaries.zip = "Infer ZIP5 from agent addresses."; },
    value => { value.unresolved_gates.pop(); },
    value => { value.unexpected = "field"; },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(reference);
    mutate(changed);
    assert.throws(() => validateInInbizBulkProductReference(changed), /IN bulk-product reference rejected/);
  }
  for (const invalid of [null, [], {}, "IN"]) assert.throws(() => validateInInbizBulkProductReference(invalid), /IN bulk-product reference rejected/);
});

test("IN loader rejects changed bytes, malformed JSON and missing evidence without writing artifacts", async () => {
  const reference = await loadInInbizBulkProductReference();
  assert.throws(() => verifyInInbizBulkProductReferenceBytes(Buffer.from(JSON.stringify(reference))), /file bytes drifted/);
  assert.throws(() => verifyInInbizBulkProductReferenceBytes(Buffer.from("{")), /file bytes drifted/);
  await assert.rejects(loadInInbizBulkProductReference({ root: `${APP_ROOT}/missing-in-reference` }), /ENOENT/);
});
