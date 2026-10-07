import test from "node:test";
import assert from "node:assert/strict";
import { readCoChildcareSourceDiscovery } from "./co-childcare-source-discovery.mjs";
import { readCtChildcareSourceDiscovery } from "./ct-childcare-source-discovery.mjs";
import { stateAccessMaintenanceBacklog } from "./state-access-view.mjs";

test("Colorado discovery preserves public Socrata capability without acquiring providers", () => {
  const value = readCoChildcareSourceDiscovery();
  assert.equal(value.state, "CO");
  assert.equal(value.access.supported_bulk_export_verified, true);
  assert.equal(value.access.supported_api_verified, true);
  assert.equal(value.access.record_acquisition_authorized, false);
  assert.equal(value.claims.provider_rows_acquired, 0);
  assert.equal(value.scope.residential_provider_privacy_review_required, true);
});

test("Connecticut discovery keeps center and residential cohorts distinct", () => {
  const value = readCtChildcareSourceDiscovery();
  assert.deepEqual(value.scope.publisher_described_members, ["active-child-care-centers-and-group-child-care-homes", "active-family-child-care-homes"]);
  assert.equal(value.access.supported_bulk_export_verified, true);
  assert.equal(value.access.supported_api_verified, false);
  assert.equal(value.access.record_acquisition_authorized, false);
  assert.equal(value.claims.provider_rows_acquired, 0);
});

test("maintenance backlog verifies governed Colorado and Connecticut source posture before batching", async () => {
  let coReads = 0, ctReads = 0;
  const value = await stateAccessMaintenanceBacklog({
    maintainedIndustries: ["childcare"],
    maintenanceRevision: 12,
    coChildcareDiscoveryLoader: () => { coReads++; return readCoChildcareSourceDiscovery(); },
    ctChildcareDiscoveryLoader: () => { ctReads++; return readCtChildcareSourceDiscovery(); },
  });
  assert.equal(value.schema_version, "state-access-maintenance-backlog@2.17.0");
  assert.equal(coReads, 1);
  assert.equal(ctReads, 1);
  assert.equal(value.claims.acquisition_authorized, false);
});
