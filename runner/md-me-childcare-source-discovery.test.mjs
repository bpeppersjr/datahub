import test from "node:test";
import assert from "node:assert/strict";
import { readMdChildcareSourceDiscovery } from "./md-childcare-source-discovery.mjs";
import { readMeChildcareSourceDiscovery } from "./me-childcare-source-discovery.mjs";

test("Maryland keeps open-provider compliance search unautomated", () => {
  const value = readMdChildcareSourceDiscovery();
  assert.equal(value.official_sources.length, 3);
  assert.equal(value.access.supported_bulk_export_verified, false);
  assert.equal(value.access.portal_automation_authorized, false);
  assert.equal(value.claims.provider_rows_acquired, 0);
});

test("Maine distinguishes monthly list contact from public bulk access", () => {
  const value = readMeChildcareSourceDiscovery();
  assert.equal(value.official_sources.length, 5);
  assert.equal(value.access.monthly_list_contact_path_available, true);
  assert.equal(value.access.supported_bulk_export_verified, false);
  assert.equal(value.access.record_acquisition_authorized, false);
  assert.equal(value.claims.provider_rows_acquired, 0);
});
