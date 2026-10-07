import test from "node:test";
import assert from "node:assert/strict";
import { readUtChildcareSourceDiscovery } from "./ut-childcare-source-discovery.mjs";
import { readVaChildcareSourceDiscovery } from "./va-childcare-source-discovery.mjs";

test("Utah binds its retained center cohort without treating a newer edition as acquired", async () => {
  const value = await readUtChildcareSourceDiscovery();
  assert.equal(value.retained_release.accepted_rows, 422);
  assert.equal(value.retained_release.zip5_available_rows, 422);
  assert.equal(value.retained_release.geocoded_rows, 0);
  assert.equal(value.temporal.newer_index_edition_date, "2026-10-01");
  assert.equal(value.access.record_acquisition_authorized, false);
});

test("Virginia keeps annual quality workbooks separate from current licensed operations", () => {
  const value = readVaChildcareSourceDiscovery();
  assert.equal(value.access.supported_bulk_export_verified, true);
  assert.equal(value.access.supported_api_verified, false);
  assert.equal(value.access.record_acquisition_authorized, false);
  assert.match(value.temporal.snapshot_date, /2024-2025.*2025-2026/);
  assert.equal(value.claims.current_operations_verified, false);
});
