import test from "node:test";
import assert from "node:assert/strict";
import { readTnChildcareSourceDiscovery } from "./tn-childcare-source-discovery.mjs";
import { readTxChildcareSourceDiscovery } from "./tx-childcare-source-discovery.mjs";

test("Tennessee binds the exact retained center-only release without authorizing refresh", async () => {
  const value = await readTnChildcareSourceDiscovery();
  assert.equal(value.retained_release.accepted_rows, 1863);
  assert.equal(value.retained_release.zip5_available_rows, 1691);
  assert.equal(value.retained_release.zip5_unavailable_rows, 172);
  assert.equal(value.access.supported_api_verified, true);
  assert.equal(value.access.record_acquisition_authorized, false);
  assert.equal(value.claims.current_operations_verified, false);
});

test("Texas preserves regulated cohorts without automating the search portal", () => {
  const value = readTxChildcareSourceDiscovery();
  assert.equal(value.scope.residential_provider_privacy_review_required, true);
  assert.equal(value.access.supported_bulk_export_verified, false);
  assert.equal(value.access.supported_api_verified, false);
  assert.equal(value.access.portal_automation_authorized, false);
  assert.equal(value.claims.provider_rows_acquired, 0);
});
