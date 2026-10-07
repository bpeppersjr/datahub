import test from "node:test";
import assert from "node:assert/strict";
import { readVtChildcareSourceDiscovery } from "./vt-childcare-source-discovery.mjs";
import { readWaChildcareSourceDiscovery } from "./wa-childcare-source-discovery.mjs";

test("Vermont binds the retained center cohort and excludes jittered coordinates", async () => {
  const value = await readVtChildcareSourceDiscovery();
  assert.equal(value.retained_release.accepted_rows, 503);
  assert.equal(value.retained_release.zip5_available_rows, 503);
  assert.equal(value.retained_release.zip4_available_rows, 2);
  assert.equal(value.retained_release.geocoded_rows, 0);
  assert.equal(value.access.record_acquisition_authorized, false);
});

test("Washington preserves metadata-only API readiness and contact exclusion", () => {
  const value = readWaChildcareSourceDiscovery();
  assert.equal(value.retained_metadata_observation.count_only_rows, 2525);
  assert.equal(value.retained_metadata_observation.provider_rows_acquired, 0);
  assert.equal(value.scope.personal_contact_fields_excluded, true);
  assert.equal(value.access.supported_api_verified, true);
  assert.equal(value.access.record_acquisition_authorized, false);
});
