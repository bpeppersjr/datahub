import test from "node:test";
import assert from "node:assert/strict";
import { readPaChildcareSourceDiscovery } from "./pa-childcare-source-discovery.mjs";
import { readRiChildcareSourceDiscovery } from "./ri-childcare-source-discovery.mjs";

test("Pennsylvania preserves monthly OData access and regulated cohort boundary", () => {
  const value = readPaChildcareSourceDiscovery();
  assert.equal(value.access.supported_api_verified, true);
  assert.equal(value.access.public_domain_verified, true);
  assert.equal(value.scope.regulated_childcare_predicate_required, true);
  assert.equal(value.temporal.snapshot_date, "2026-08-31");
  assert.equal(value.claims.provider_rows_acquired, 0);
});

test("Rhode Island preserves RISES search without inventing bulk access", () => {
  const value = readRiChildcareSourceDiscovery();
  assert.equal(value.access.supported_bulk_export_verified, false);
  assert.equal(value.access.supported_api_verified, false);
  assert.equal(value.access.portal_automation_authorized, false);
  assert.equal(value.claims.provider_rows_acquired, 0);
});
