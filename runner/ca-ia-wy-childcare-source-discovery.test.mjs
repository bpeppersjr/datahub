import test from "node:test";
import assert from "node:assert/strict";
import { readCaChildcareSourceDiscovery } from "./ca-childcare-source-discovery.mjs";
import { readIaChildcareSourceDiscovery } from "./ia-childcare-source-discovery.mjs";
import { readWyChildcareSourceDiscovery } from "./wy-childcare-source-discovery.mjs";
import { stateAccessMaintenanceBacklog } from "./state-access-view.mjs";

test("California discovery binds the existing app and retained reporting without authorizing a repull", () => {
  const value = readCaChildcareSourceDiscovery();
  assert.equal(value.access.supported_bulk_export_verified, true);
  assert.equal(value.access.supported_api_verified, true);
  assert.equal(value.access.record_acquisition_authorized, false);
  assert.match(value.scope.retained_application_evidence, /checksum-pinned/);
  assert.equal(value.claims.provider_rows_acquired, 0);
});

test("Iowa discovery preserves regulated cohorts and the agreement gate", () => {
  const value = readIaChildcareSourceDiscovery();
  assert.equal(value.access.supported_bulk_export_verified, false);
  assert.equal(value.access.supported_api_verified, false);
  assert.equal(value.scope.residential_provider_privacy_review_required, true);
  assert.match(value.unresolved_gates[0], /data-sharing-agreement/);
});

test("Wyoming discovery separates licensed and exempt monthly counts", async () => {
  const value = await readWyChildcareSourceDiscovery();
  assert.equal(value.scope.published_monthly_licensed_total, 492);
  assert.equal(value.scope.published_monthly_exempt_total, 124);
  assert.equal(value.access.supported_bulk_export_verified, true);
  assert.equal(value.access.supported_api_verified, false);
  assert.equal(value.claims.provider_rows_acquired, 0);
});

test("maintenance backlog verifies all three final discovery contracts before batching", async () => {
  const reads = { CA: 0, IA: 0, WY: 0 };
  const value = await stateAccessMaintenanceBacklog({
    maintainedIndustries: ["childcare"], maintenanceRevision: 13,
    caChildcareDiscoveryLoader: () => { reads.CA++; return readCaChildcareSourceDiscovery(); },
    iaChildcareDiscoveryLoader: () => { reads.IA++; return readIaChildcareSourceDiscovery(); },
    wyChildcareDiscoveryLoader: async () => { reads.WY++; return readWyChildcareSourceDiscovery(); },
  });
  assert.equal(value.schema_version, "state-access-maintenance-backlog@2.18.0");
  assert.deepEqual(reads, { CA: 1, IA: 1, WY: 1 });
  assert.equal(value.claims.acquisition_authorized, false);
});
