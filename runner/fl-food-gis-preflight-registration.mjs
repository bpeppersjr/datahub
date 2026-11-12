import { readFile } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import { verifyFlFoodGisPreflight } from "./fl-food-gis-preflight.mjs";

const REGISTRATION = "config/datasets/fl-food-gis-preflight-evidence.json";
const KEYS = ["claims", "dataset_id", "industry", "manifest_path", "manifest_sha256", "production_enrollment", "publisher", "retained_bytes", "retained_file_count", "run_id", "runtime_pointer", "schema_version", "source_request_count", "source_response_bytes", "state", "status"];
const CLAIMS = { metadata_contract_validated: true, native_transport_verified: true, provider_rows_acquired: false, source_rows: null, current_operations_verified: false, acquisition_ready: false, record_acquisition_use_basis_established: false, public_export_authorized: false, business_completeness: null, zip_coverage: null, zip4_joined: false };
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join("|") === [...keys].sort().join("|");
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const fail = message => { throw new Error(`Florida retail prerequisite registration rejected: ${message}.`); };

export function validateFlFoodGisPreflightRegistrationForTest(value) {
  if (!exact(value, KEYS) || value.schema_version !== "1.0.0" || value.dataset_id !== "fl-food-gis-preflight-evidence" || value.status !== "registered-retained-source-prerequisite" || value.state !== "FL" || value.industry !== "retail-consumer" || typeof value.publisher !== "string" || value.run_id !== "fd982c92-8370-4ae6-84b9-3d3d2986571c" || value.manifest_path !== `data/business-sources/fl-food/gis-preflight/jobs/${value.run_id}/manifest.json` || !/^[a-f0-9]{64}$/.test(value.manifest_sha256) || value.retained_file_count !== 9 || value.retained_bytes !== 26244 || value.source_request_count !== 3 || value.source_response_bytes !== 19730 || value.runtime_pointer !== null || value.production_enrollment !== false || !same(value.claims, CLAIMS)) fail("closed contract");
  return structuredClone(value);
}

export async function readFlFoodGisPreflightRegistration({ root = APP_ROOT, signal } = {}) {
  signal?.throwIfAborted();
  const canonicalRoot = path.resolve(root), registrationPath = path.join(canonicalRoot, ...REGISTRATION.split("/"));
  const registration = validateFlFoodGisPreflightRegistrationForTest(JSON.parse(await readFile(registrationPath, "utf8")));
  signal?.throwIfAborted();
  const manifest = path.join(canonicalRoot, ...registration.manifest_path.split("/"));
  const verified = await verifyFlFoodGisPreflight(manifest, registration.manifest_sha256, { signal });
  if (verified.runId !== registration.run_id || verified.result.metadataContractValidated !== true || verified.result.sourceRows !== null || verified.result.sourceRowsAcquired !== false || verified.result.acquisitionReady !== false || verified.result.postalFields.joined !== false || verified.claims.providerRowsAcquired !== false || verified.claims.currentOperationsVerified !== false) fail("retained replay");
  return { schema_version: "fl-food-gis-preflight-registration-status@1.0.0", state: registration.state, industry: registration.industry, publisher: registration.publisher, run_id: registration.run_id, manifest_sha256: registration.manifest_sha256, retained_file_count: registration.retained_file_count, retained_bytes: registration.retained_bytes, metadata_contract_validated: true, source_rows: null, provider_rows_acquired: false, acquisition_ready: false, current_operations_verified: false, production_enrollment: false, runtime_pointer: null, claims: { network_requests: 0, runtime_writes: 0, business_completeness: null, zip_coverage: null, zip4_joined: false } };
}
