import test from "node:test";
import assert from "node:assert/strict";
import { readNyChildcareSourceDiscovery } from "./ny-childcare-source-discovery.mjs";
import { readOhChildcareSourceDiscovery } from "./oh-childcare-source-discovery.mjs";

test("New York preserves daily API access and the NYC center exclusion", () => {
  const value = readNyChildcareSourceDiscovery();
  assert.equal(value.access.supported_api_verified, true);
  assert.equal(value.temporal.publisher_cadence, "daily");
  assert.equal(value.scope.nyc_center_based_programs_included, false);
  assert.equal(value.claims.provider_rows_acquired, 0);
});

test("Ohio preserves manual code and published CSV download limits", () => {
  const value = readOhChildcareSourceDiscovery();
  assert.equal(value.access.supported_bulk_export_verified, true);
  assert.equal(value.access.manual_email_access_code_required, true);
  assert.equal(value.access.download_limit_per_email_per_day, 5);
  assert.equal(value.access.download_limit_per_email_per_month, 10);
  assert.equal(value.claims.provider_rows_acquired, 0);
});
