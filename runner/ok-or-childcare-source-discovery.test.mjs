import test from "node:test";
import assert from "node:assert/strict";
import { readOkChildcareSourceDiscovery } from "./ok-childcare-source-discovery.mjs";
import { readOrChildcareSourceDiscovery } from "./or-childcare-source-discovery.mjs";

test("Oklahoma preserves locator discovery without inventing bulk access", () => {
  const value = readOkChildcareSourceDiscovery();
  assert.equal(value.access.supported_bulk_export_verified, false);
  assert.equal(value.access.portal_automation_authorized, false);
  assert.match(value.temporal.limitation, /previous 36 months/);
  assert.equal(value.claims.provider_rows_acquired, 0);
});

test("Oregon keeps daily portal and quarterly aggregate data distinct", () => {
  const value = readOrChildcareSourceDiscovery();
  assert.equal(value.access.supported_bulk_export_verified, false);
  assert.equal(
    value.temporal.publisher_cadence,
    "daily-portal-quarterly-aggregate-dashboard",
  );
  assert.match(value.temporal.limitation, /cannot substitute/);
  assert.equal(value.claims.provider_rows_acquired, 0);
});
