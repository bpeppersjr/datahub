import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { APP_ROOT } from "./paths.mjs";
import { verifyFlFoodGisPreflight } from "./fl-food-gis-preflight.mjs";
import { readFlFoodGisPreflightRegistration, validateFlFoodFeTypeAssessmentForTest, validateFlFoodFeTypeDistributionForTest, validateFlFoodGisPreflightRegistrationForTest } from "./fl-food-gis-preflight-registration.mjs";

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
  assert.equal(view.schema_version, "fl-food-gis-preflight-registration-status@1.2.0");
  assert.equal(view.metadata_contract_validated, true);
  assert.equal(view.provider_rows_acquired, false);
  assert.equal(view.source_rows, null);
  assert.equal(view.claims.network_requests, 0);
  assert.equal(view.classification.confirmed_code_count, 4);
  assert.equal(view.classification.observed_code_count, 70);
  assert.equal(view.classification.observed_aggregate_rows, 47059);
  assert.equal(view.classification.confirmed_mapping_rows, 16309);
  assert.deepEqual(view.classification.confirmed_codes.map(row => row.code), ["111", "122", "123", "124"]);
  assert.deepEqual(view.classification.confirmed_codes.map(row => row.aggregate_rows), [2387, 2634, 6594, 4694]);
  assert.equal(view.classification.complete_codebook_verified, false);
  assert.equal(view.classification.unresolved_gate_count, 7);
  assert.match(view.classification.assessment_sha256, /^[a-f0-9]{64}$/);
});

test("Florida FE_TYPE distribution retains only a checksum-pinned aggregate", async () => {
  const distribution = JSON.parse(await readFile(path.join(APP_ROOT, "config/source-assessments/fl-food-fe-type-distribution-2026-11-12.json"), "utf8"));
  assert.doesNotThrow(() => validateFlFoodFeTypeDistributionForTest(distribution));
  assert.equal(distribution.rows.reduce((sum, row) => sum + row.row_count, 0), 47059);
  assert.deepEqual(distribution.claims, { aggregate_only: true, provider_rows_returned: 0, names_returned: false, addresses_returned: false, contacts_returned: false, geometry_returned: false, response_body_retained: false, complete_codebook_verified: false, current_operations_verified: false, record_acquisition_authorized: false, production_admission: false, business_completeness: null });
  for (const mutate of [
    value => { value.claims.provider_rows_returned = 1; },
    value => { value.claims.complete_codebook_verified = true; },
    value => { value.total_rows += 1; },
    value => { value.rows[0].row_count += 1; },
    value => { [value.rows[0], value.rows[1]] = [value.rows[1], value.rows[0]]; },
    value => { value.request.response_sha256 = "0".repeat(64); },
  ]) {
    const changed = structuredClone(distribution); mutate(changed);
    assert.throws(() => validateFlFoodFeTypeDistributionForTest(changed), /classification distribution/);
  }
});

test("Florida FE_TYPE assessment preserves a partial publisher-evidenced crosswalk", async () => {
  const assessment = JSON.parse(await readFile(path.join(APP_ROOT, "config/source-assessments/fl-food-fe-type-partial-crosswalk-2026-11-12.json"), "utf8"));
  assert.doesNotThrow(() => validateFlFoodFeTypeAssessmentForTest(assessment));
  for (const mutate of [value => { value.claims.complete_codebook_verified = true; }, value => { value.claims.record_acquisition_authorized = true; }, value => { value.confirmed_mappings.push({ ...value.confirmed_mappings[0], code: "999" }); }, value => { value.unresolved_gates.pop(); }]) {
    const changed = structuredClone(assessment); mutate(changed);
    assert.throws(() => validateFlFoodFeTypeAssessmentForTest(changed), /classification assessment/);
  }
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
