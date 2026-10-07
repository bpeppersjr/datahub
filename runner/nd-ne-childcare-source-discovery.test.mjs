import test from "node:test";
import assert from "node:assert/strict";
import { readNdChildcareSourceDiscovery } from "./nd-childcare-source-discovery.mjs";
import { readNeChildcareSourceDiscovery } from "./ne-childcare-source-discovery.mjs";

test("North Dakota preserves licensed and self-declared search-only posture", () => {
  const value = readNdChildcareSourceDiscovery();
  assert.equal(value.access.supported_bulk_export_verified, false);
  assert.equal(value.access.portal_automation_authorized, false);
  assert.equal(value.claims.provider_rows_acquired, 0);
});

test("Nebraska preserves direct roster discovery without acquiring rows", () => {
  const value = readNeChildcareSourceDiscovery();
  assert.equal(value.access.supported_bulk_export_verified, true);
  assert.equal(value.access.direct_download_endpoint_verified, true);
  assert.match(value.temporal.publisher_cadence, /conflict-unresolved/);
  assert.equal(value.claims.provider_rows_acquired, 0);
});
