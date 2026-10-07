import test from "node:test";
import assert from "node:assert/strict";
import { readMiChildcareSourceDiscovery } from "./mi-childcare-source-discovery.mjs";
import { readMnChildcareSourceDiscovery } from "./mn-childcare-source-discovery.mjs";

test("Michigan preserves intended current-facilities report without admitting rows", () => {
  const value = readMiChildcareSourceDiscovery();
  assert.equal(value.official_sources.length, 4);
  assert.equal(value.access.supported_bulk_export_verified, true);
  assert.equal(value.access.direct_download_endpoint_verified, false);
  assert.equal(value.claims.provider_rows_acquired, 0);
});

test("Minnesota identifies official daily lookup CSV without acquisition", () => {
  const value = readMnChildcareSourceDiscovery();
  assert.equal(value.official_sources.length, 4);
  assert.equal(value.access.csv_export_control_verified, true);
  assert.equal(value.access.supported_bulk_export_verified, true);
  assert.equal(value.access.record_acquisition_authorized, false);
  assert.equal(value.claims.provider_rows_acquired, 0);
});
