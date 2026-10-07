import test from "node:test";
import assert from "node:assert/strict";
import { readLaChildcareSourceDiscovery } from "./la-childcare-source-discovery.mjs";
import { readMaChildcareSourceDiscovery } from "./ma-childcare-source-discovery.mjs";

test("Louisiana keeps the statewide consumer Finder unautomated", () => {
  const value = readLaChildcareSourceDiscovery();
  assert.equal(value.official_sources.length, 4);
  assert.equal(value.access.supported_bulk_export_verified, false);
  assert.equal(value.access.portal_automation_authorized, false);
  assert.equal(value.claims.provider_rows_acquired, 0);
  assert.equal(value.claims.active_business_count, null);
});

test("Massachusetts preserves intended downloads without admitting rows", () => {
  const value = readMaChildcareSourceDiscovery();
  assert.equal(value.official_sources.length, 5);
  assert.equal(value.access.supported_bulk_export_verified, true);
  assert.equal(value.access.direct_download_endpoint_verified, false);
  assert.equal(value.access.record_acquisition_authorized, false);
  assert.equal(value.claims.provider_rows_acquired, 0);
});
