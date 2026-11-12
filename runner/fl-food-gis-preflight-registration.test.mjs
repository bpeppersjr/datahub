import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { APP_ROOT } from "./paths.mjs";
import { verifyFlFoodGisPreflight } from "./fl-food-gis-preflight.mjs";
import { readFlFoodGisPreflightRegistration, validateFlFoodGisPreflightRegistrationForTest } from "./fl-food-gis-preflight-registration.mjs";

const registrationPath = path.join(APP_ROOT, "config/datasets/fl-food-gis-preflight-evidence.json");

test("registered Florida retail metadata prerequisite replays exact canonical retained evidence", async () => {
  const registration = JSON.parse(await readFile(registrationPath, "utf8"));
  assert.deepEqual(Object.keys(registration).sort(), ["claims", "dataset_id", "industry", "manifest_path", "manifest_sha256", "production_enrollment", "publisher", "retained_bytes", "retained_file_count", "run_id", "runtime_pointer", "schema_version", "source_request_count", "source_response_bytes", "state", "status"].sort());
  assert.equal(registration.schema_version, "1.0.0");
  assert.equal(registration.dataset_id, "fl-food-gis-preflight-evidence");
  assert.equal(registration.status, "registered-retained-source-prerequisite");
  assert.equal(registration.state, "FL");
  assert.equal(registration.industry, "retail-consumer");
  assert.equal(registration.runtime_pointer, null);
  assert.equal(registration.production_enrollment, false);
  assert.equal(registration.retained_file_count, 9);
  assert.equal(registration.retained_bytes, 26244);
  assert.equal(registration.source_request_count, 3);
  assert.equal(registration.source_response_bytes, 19730);
  assert.deepEqual(registration.claims, { metadata_contract_validated: true, native_transport_verified: true, provider_rows_acquired: false, source_rows: null, current_operations_verified: false, acquisition_ready: false, record_acquisition_use_basis_established: false, public_export_authorized: false, business_completeness: null, zip_coverage: null, zip4_joined: false });
  const manifest = path.join(APP_ROOT, ...registration.manifest_path.split("/"));
  const verified = await verifyFlFoodGisPreflight(manifest, registration.manifest_sha256);
  assert.equal(verified.runId, registration.run_id);
  assert.equal(verified.result.metadataContractValidated, true);
  assert.equal(verified.result.sourceRows, null);
  assert.equal(verified.result.sourceRowsAcquired, false);
  assert.equal(verified.result.acquisitionReady, false);
  assert.equal(verified.result.postalFields.joined, false);
  assert.equal(verified.claims.providerRowsAcquired, false);
  assert.equal(verified.claims.currentOperationsVerified, false);
  const view = await readFlFoodGisPreflightRegistration();
  assert.equal(view.schema_version, "fl-food-gis-preflight-registration-status@1.0.0");
  assert.equal(view.metadata_contract_validated, true);
  assert.equal(view.provider_rows_acquired, false);
  assert.equal(view.source_rows, null);
  assert.equal(view.claims.network_requests, 0);
});

test("Florida retail prerequisite registration cannot silently widen source authority", async () => {
  const registration = JSON.parse(await readFile(registrationPath, "utf8"));
  for (const mutate of [
    value => { value.production_enrollment = true; },
    value => { value.claims.provider_rows_acquired = true; },
    value => { value.claims.acquisition_ready = true; },
    value => { value.claims.record_acquisition_use_basis_established = true; },
    value => { value.claims.current_operations_verified = true; },
    value => { value.claims.business_completeness = 100; },
  ]) {
    const changed = structuredClone(registration);
    mutate(changed);
    assert.throws(() => validateFlFoodGisPreflightRegistrationForTest(changed), /closed contract/);
  }
});
