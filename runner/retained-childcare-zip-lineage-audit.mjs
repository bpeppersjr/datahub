import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import { mnSelectionReadJson as readJson } from "./mn-construction-retained-selection.mjs";
import { validateRetainedChildcareSelection, RETAINED_CHILDCARE_STATES } from "./retained-childcare-registry-input.mjs";

const HASH = /^[a-f0-9]{64}$/;
const fail = (message) => { throw new Error(`Retained childcare ZIP lineage audit rejected: ${message}.`); };
const check = (value, message) => { if (!value) fail(message); };
const relative = (file) => path.relative(APP_ROOT, file).replaceAll("\\", "/");

async function selectedEnrollment(state, expectedSha256, signal) {
  const name = `${state.toLowerCase()}-childcare-reporting-enrollment.json`;
  const candidates = [path.join(APP_ROOT, "config", "current", name), path.join(APP_ROOT, "config", name)];
  let selected = null;
  for (const file of candidates) {
    const meter = {};
    try {
      const value = await readJson(file, 10_000, signal, meter);
      if (meter.sha256 === expectedSha256) {
        check(selected === null, `duplicate selected enrollment for ${state}`);
        selected = { file, value, meter };
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  check(selected, `selected enrollment missing for ${state}`);
  return selected;
}

export async function auditRetainedChildcareZipLineage({ signal } = {}) {
  signal?.throwIfAborted();
  const selectionPath = path.join(APP_ROOT, "config", "retained-childcare-registry-selection-20261112.json"), selectionMeter = {};
  const selection = validateRetainedChildcareSelection(await readJson(selectionPath, 10_000, signal, selectionMeter));
  const registrationPath = path.join(APP_ROOT, "config", "datasets", "retained-childcare-zip-evidence.json"), registrationMeter = {};
  const registration = await readJson(registrationPath, 500_000, signal, registrationMeter), retained = registration.retained_release;
  check(registration.dataset_id === "retained-childcare-zip-evidence" && registration.release_only === true && registration.runtime_pointer === null && registration.production_enrollment === false && registration.national_denominator_enrollment === false, "registered authority boundary");
  check(retained?.release_id === "retained-childcare-zip-evidence-b61acab3e067f828013a17387b1912c90493e69d7cf3f3c12ae6a04b01b3625b" && retained.manifest_sha256 === "9997dc9dcad2f3a35cd49a76244527ecd6bf6b13a4a6000db8a28f7651bf123a" && retained.summary?.accepted_candidate_rows === 12_210, "registered ZIP release pin");
  const states = [];
  for (const state of RETAINED_CHILDCARE_STATES) {
    signal?.throwIfAborted();
    const enrollment = await selectedEnrollment(state, selection.enrollments[state], signal), receiptMeter = {};
    const receipt = await readJson(path.resolve(APP_ROOT, enrollment.value.app_receipt_path), 100_000, signal, receiptMeter);
    check(receiptMeter.sha256 === enrollment.value.app_receipt_sha256 && HASH.test(receipt.normalized?.manifest_sha256), `receipt pin for ${state}`);
    const manifestMeter = {}, manifest = await readJson(receipt.normalized.manifest_path, 200_000, signal, manifestMeter);
    check(manifestMeter.sha256 === receipt.normalized.manifest_sha256 && Number.isSafeInteger(manifest.summary?.accepted_records) && Number.isSafeInteger(manifest.summary?.accepted_with_zip5), `normalized summary for ${state}`);
    const currentRows = retained.sources?.[state]?.accepted_candidate_rows;
    check(Number.isSafeInteger(currentRows), `registered source count for ${state}`);
    states.push({ state, selection_enrollment_path: relative(enrollment.file), selection_enrollment_sha256: enrollment.meter.sha256, normalized_manifest_path: relative(path.resolve(receipt.normalized.manifest_path)), normalized_manifest_sha256: manifestMeter.sha256, selected_candidate_rows: manifest.summary.accepted_records, selected_zip_present_candidate_rows: manifest.summary.accepted_with_zip5, registered_zip_candidate_rows: currentRows, candidate_row_delta: manifest.summary.accepted_records - currentRows });
  }
  const selectedRows = states.reduce((sum, row) => sum + row.selected_candidate_rows, 0), registeredRows = retained.summary.accepted_candidate_rows, delta = selectedRows - registeredRows;
  check(selectedRows === 12_234 && registeredRows === 12_210 && delta === 24 && states.filter((row) => row.candidate_row_delta !== 0).length === 1 && states.find((row) => row.state === "PA")?.candidate_row_delta === 24, "closed successor delta");
  return { schema_version: "retained-childcare-zip-lineage-audit@1.0.0", status: "successor-required", selection: { path: relative(selectionPath), sha256: selectionMeter.sha256 }, registered_zip_release: { release_id: retained.release_id, manifest_sha256: retained.manifest_sha256, registration_path: relative(registrationPath), registration_sha256: registrationMeter.sha256, candidate_rows: registeredRows }, selected_candidate_rows: selectedRows, candidate_row_delta: delta, states, claims: { network_requests: 0, acquisition_performed: false, production_pointer_changed: false, registered_zip_release_changed: false, current_operations_verified: false, unique_business_count: null, national_completeness_percent: null, zip4_aggregated: false } };
}
