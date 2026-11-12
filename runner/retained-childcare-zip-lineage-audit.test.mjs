import test from "node:test";
import assert from "node:assert/strict";
import { auditRetainedChildcareZipLineage } from "./retained-childcare-zip-lineage-audit.mjs";

test("retained childcare production selection exposes the exact registered ZIP successor delta", async () => {
  const audit = await auditRetainedChildcareZipLineage();
  assert.equal(audit.status, "successor-required");
  assert.equal(audit.registered_zip_release.candidate_rows, 12_210);
  assert.equal(audit.selected_candidate_rows, 12_234);
  assert.equal(audit.candidate_row_delta, 24);
  assert.deepEqual(audit.states.filter((row) => row.candidate_row_delta !== 0).map((row) => [row.state, row.candidate_row_delta]), [["PA", 24]]);
  assert.deepEqual(audit.claims, { network_requests: 0, acquisition_performed: false, production_pointer_changed: false, registered_zip_release_changed: false, current_operations_verified: false, unique_business_count: null, national_completeness_percent: null, zip4_aggregated: false });
});

test("lineage audit honors pre-abort without reading source evidence", async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(auditRetainedChildcareZipLineage({ signal: controller.signal }), { name: "AbortError" });
});
