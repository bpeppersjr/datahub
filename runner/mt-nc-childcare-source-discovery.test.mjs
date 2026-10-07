import test from "node:test";
import assert from "node:assert/strict";
import { readMtChildcareSourceDiscovery } from "./mt-childcare-source-discovery.mjs";
import { readNcChildcareSourceDiscovery } from "./nc-childcare-source-discovery.mjs";

test("Montana keeps licensed-provider dashboard unautomated", () => {
  const value = readMtChildcareSourceDiscovery();
  assert.equal(value.official_sources.length, 4);
  assert.equal(value.access.supported_bulk_export_verified, false);
  assert.equal(value.access.portal_automation_authorized, false);
  assert.equal(value.claims.provider_rows_acquired, 0);
});

test("North Carolina separates aggregate downloads from provider rows", () => {
  const value = readNcChildcareSourceDiscovery();
  assert.equal(value.official_sources.length, 4);
  assert.equal(value.access.aggregate_dashboard_download_available, true);
  assert.equal(value.access.provider_level_data_request_path_available, true);
  assert.equal(value.temporal.maximum_described_facility_record_age_days, 364);
  assert.equal(value.claims.provider_rows_acquired, 0);
});
