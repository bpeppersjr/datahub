import test from "node:test";
import assert from "node:assert/strict";
import { readNhChildcareSourceDiscovery } from "./nh-childcare-source-discovery.mjs";
import { readNjChildcareSourceDiscovery } from "./nj-childcare-source-discovery.mjs";

test("New Hampshire preserves official search without inventing bulk access", () => {
  const value = readNhChildcareSourceDiscovery();
  assert.equal(value.access.supported_bulk_export_verified, false);
  assert.equal(value.access.supported_api_verified, false);
  assert.equal(value.access.portal_automation_authorized, false);
  assert.equal(value.claims.provider_rows_acquired, 0);
});

test("New Jersey preserves dated roster and API access without acquiring rows", () => {
  const value = readNjChildcareSourceDiscovery();
  assert.equal(value.access.supported_bulk_export_verified, true);
  assert.equal(value.access.supported_api_verified, true);
  assert.equal(value.temporal.snapshot_date, "2026-10-01");
  assert.equal(value.claims.provider_rows_acquired, 0);
});
