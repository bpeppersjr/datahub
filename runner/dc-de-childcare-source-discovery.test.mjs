import test from "node:test";
import assert from "node:assert/strict";
import { readDcChildcareSourceDiscovery } from "./dc-childcare-source-discovery.mjs";
import { readDeChildcareSourceDiscovery } from "./de-childcare-source-discovery.mjs";

test("DC discovery preserves the PDF label mismatch and acquires no rows", () => {
  const value = readDcChildcareSourceDiscovery();
  assert.equal(value.temporal.landing_label, "August 2026");
  assert.match(value.temporal.attachment_filename_label, /July 2026/);
  assert.equal(value.claims.provider_rows_acquired, 0);
  assert.equal(value.access.record_acquisition_authorized, false);
});

test("Delaware discovery replays retained official metadata without acquiring rows", async () => {
  const value = await readDeChildcareSourceDiscovery();
  assert.equal(value.temporal.publisher_cadence, "daily");
  assert.equal(value.access.supported_api_verified, true);
  assert.equal(value.claims.provider_rows_acquired, 0);
  assert.equal(value.claims.production_admission, false);
});
