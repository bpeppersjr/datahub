import test from "node:test";
import assert from "node:assert/strict";
import { readScChildcareSourceDiscovery } from "./sc-childcare-source-discovery.mjs";
import { readSdChildcareSourceDiscovery } from "./sd-childcare-source-discovery.mjs";

test("South Carolina preserves manual Excel discovery without automating the portal", () => {
  const value = readScChildcareSourceDiscovery();
  assert.equal(value.access.manual_ui_export_identified, true);
  assert.equal(value.access.supported_bulk_export_verified, false);
  assert.equal(value.access.supported_api_verified, false);
  assert.equal(value.scope.home_provider_privacy_review_required, true);
  assert.equal(value.claims.provider_rows_acquired, 0);
});

test("South Dakota preserves mixed cohorts and voluntary registration limits", () => {
  const value = readSdChildcareSourceDiscovery();
  assert.equal(value.scope.voluntary_registration_denominator_limit, true);
  assert.equal(value.scope.home_provider_privacy_review_required, true);
  assert.equal(value.access.portal_automation_authorized, false);
  assert.equal(value.access.supported_bulk_export_verified, false);
  assert.equal(value.claims.provider_rows_acquired, 0);
});
