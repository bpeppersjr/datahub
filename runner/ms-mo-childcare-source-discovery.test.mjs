import test from "node:test";
import assert from "node:assert/strict";
import { readMsChildcareSourceDiscovery } from "./ms-childcare-source-discovery.mjs";
import { readMoChildcareSourceDiscovery } from "./mo-childcare-source-discovery.mjs";

test("Mississippi uses the records path without automating facility search", () => {
  const value = readMsChildcareSourceDiscovery();
  assert.equal(value.official_sources.length, 4);
  assert.equal(value.access.public_records_request_path_available, true);
  assert.equal(value.access.supported_bulk_export_verified, false);
  assert.equal(value.claims.provider_rows_acquired, 0);
});

test("Missouri preserves the dated licensed and exempt listing contract gate", () => {
  const value = readMoChildcareSourceDiscovery();
  assert.equal(value.official_sources.length, 4);
  assert.equal(value.temporal.listing_label_date, "2026-09-01");
  assert.equal(value.access.supported_bulk_export_verified, true);
  assert.equal(value.access.direct_download_endpoint_verified, false);
  assert.equal(value.claims.provider_rows_acquired, 0);
});
