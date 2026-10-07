import test from "node:test";
import assert from "node:assert/strict";
import { readWiChildcareSourceDiscovery } from "./wi-childcare-source-discovery.mjs";
import { readWvChildcareSourceDiscovery } from "./wv-childcare-source-discovery.mjs";
test("Wisconsin binds its metadata preflight while source use remains pending", async () => {
  const value = await readWiChildcareSourceDiscovery();
  assert.equal(value.retained_metadata_preflight.source_record_count, 2382);
  assert.equal(value.retained_metadata_preflight.provider_rows_acquired, 0);
  assert.equal(
    value.retained_metadata_preflight.source_use_decision,
    "pending",
  );
  assert.equal(value.access.supported_api_verified, true);
  assert.equal(value.access.record_acquisition_authorized, false);
});
test("West Virginia preserves WV PATH as human search without portal automation", () => {
  const value = readWvChildcareSourceDiscovery();
  assert.equal(value.scope.residential_provider_privacy_review_required, true);
  assert.equal(value.access.supported_bulk_export_verified, false);
  assert.equal(value.access.supported_api_verified, false);
  assert.equal(value.access.portal_automation_authorized, false);
  assert.equal(value.claims.provider_rows_acquired, 0);
});
