import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { APP_ROOT } from "./paths.mjs";

export const NC_SCHEMA_REFERENCE_ID = "nc-business-registration-schema-reference-2026-11-13";
export const NC_SCHEMA_REFERENCE_PATH = "config/state-business-source-assessments/nc-schema-reference-2026-11-13.json";
export const NC_SCHEMA_REFERENCE_SHA256 = "47c054784261becab52eee97ff72619185d2749cc014e364a04045eb67b35391";
const CONTENT_SHA256 = "7480040e24114ed6f64ba7009cd5c19e09b1b31f5299ba4f1ed9d97927894528";
const digest = value => createHash("sha256").update(value).digest("hex");
const fail = message => { throw new Error(`NC schema reference rejected: ${message}`); };

// This is an immutable documentary prerequisite, never an executable source contract.
export function validateNcBusinessRegistrationSchemaReference(value) {
  if (value?.schema_version !== "nc-business-registration-schema-reference@1.0.0"
      || value.reference_id !== NC_SCHEMA_REFERENCE_ID || value.observed_at !== "2026-11-13"
      || value.state !== "NC" || value.scope !== "standalone-documentation-only-prerequisite"
      || value.decision !== "hold") fail("identity or scope drifted");
  if (value.current_schema_compatibility_verified !== false || value.connector_ready !== false
      || value.acquisition_authorized !== false || value.required_source_files !== 0
      || value.source_records_acquired !== 0 || value.broad_layer_gaps_resolved !== 0
      || !value.authority || Object.values(value.authority).some(entry => entry !== false)
      || !value.controls || Object.values(value.controls).some(entry => entry !== false && entry !== 0)) {
    fail("zero-row, zero-authority boundary drifted");
  }
  if (value.historical_layout?.current_schema_compatibility_verified !== false
      || value.historical_layout?.retained_locally !== false
      || value.current_documentation?.subscription_manual?.retained_locally !== false
      || value.current_documentation?.subscription_manual?.current_schema_proof !== false) {
    fail("historical evidence or document retention claims widened");
  }
  // Pins all required and unknown fields, citations, gates and historical qualifications.
  if (digest(JSON.stringify(value)) !== CONTENT_SHA256) fail("immutable evidence content digest drifted");
  return structuredClone(value);
}

export function verifyNcBusinessRegistrationSchemaReferenceBytes(bytes) {
  if (digest(bytes) !== NC_SCHEMA_REFERENCE_SHA256) fail("file bytes drifted");
  return validateNcBusinessRegistrationSchemaReference(JSON.parse(bytes));
}

export async function loadNcBusinessRegistrationSchemaReference({ root = APP_ROOT } = {}) {
  return verifyNcBusinessRegistrationSchemaReferenceBytes(await readFile(path.join(root, NC_SCHEMA_REFERENCE_PATH)));
}
