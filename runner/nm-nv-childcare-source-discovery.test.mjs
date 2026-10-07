import test from "node:test";
import assert from "node:assert/strict";
import { readNmChildcareSourceDiscovery } from "./nm-childcare-source-discovery.mjs";
import { readNvChildcareSourceDiscovery } from "./nv-childcare-source-discovery.mjs";

test("New Mexico preserves provider-database lineage without inventing bulk access", () => {
  const value = readNmChildcareSourceDiscovery();
  assert.equal(value.access.supported_bulk_export_verified, false);
  assert.equal(value.access.supported_api_verified, false);
  assert.match(value.temporal.publisher_cadence, /without-machine-readable/);
  assert.equal(value.claims.provider_rows_acquired, 0);
});

test("Nevada preserves unresolved Washoe boundary and rejects stale roster substitution", () => {
  const value = readNvChildcareSourceDiscovery();
  assert.equal(value.scope.washoe_county_boundary_resolved, false);
  assert.equal(value.access.supported_bulk_export_verified, false);
  assert.match(value.temporal.limitation, /older PDF lists/);
  assert.equal(value.claims.provider_rows_acquired, 0);
});
