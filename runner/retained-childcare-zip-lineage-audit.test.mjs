import test from "node:test";
import assert from "node:assert/strict";
import { auditRetainedChildcareZipLineage } from "./retained-childcare-zip-lineage-audit.mjs";

test("retained childcare production selection exposes the exact registered ZIP successor delta", async () => {
  const audit = await auditRetainedChildcareZipLineage();
  assert.equal(audit.status, "successor-published-not-registered");
  assert.equal(audit.registered_zip_release.candidate_rows, 12_210);
  assert.equal(audit.selected_candidate_rows, 12_234);
  assert.equal(audit.candidate_row_delta, 24);
  assert.deepEqual(audit.successor_zip_release, { release_id: "retained-childcare-zip-evidence-fff67989bf590fe4c4c878c6fd5dffdbaeb612a10deeed8ac049997716da2e0e", manifest_path: "data/retained-childcare-zip-evidence/releases/retained-childcare-zip-evidence-fff67989bf590fe4c4c878c6fd5dffdbaeb612a10deeed8ac049997716da2e0e/manifest.json", manifest_sha256: "4fa7e65399c3a123a723fab8aa2fa9919594db61fa34c0883c581e6cf01c14f0", candidate_rows: 12_234, zip_present_candidate_rows: 12_232, missing_zip_candidate_rows: 1, invalid_zip_candidate_rows: 1, indexed_zip_count: 2_356 });
  assert.deepEqual(audit.states.filter((row) => row.candidate_row_delta !== 0).map((row) => [row.state, row.candidate_row_delta]), [["PA", 24]]);
  assert.deepEqual(audit.claims, { network_requests: 0, acquisition_performed: false, production_pointer_changed: false, registered_zip_release_changed: false, current_operations_verified: false, unique_business_count: null, national_completeness_percent: null, zip4_aggregated: false });
});

test("lineage audit honors pre-abort without reading source evidence", async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(auditRetainedChildcareZipLineage({ signal: controller.signal }), { name: "AbortError" });
});
