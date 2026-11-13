import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { APP_ROOT } from "./paths.mjs";

export const MD_SCHEMA_REFERENCE_ID = "md-sdat-corporate-file-schema-reference-2026-11-13";
export const MD_SCHEMA_REFERENCE_PATH = "config/state-business-source-assessments/md-schema-reference-2026-11-13.json";
export const MD_SCHEMA_REFERENCE_SHA256 = "023d9aef7462c23555c1c1ef90cadcb54e50f65de586667adea7e2d7c8ed13a7";
const CONTENT_SHA256 = "fff6ce98b19409430ead0478947d349e58fce30190ad5fa0ac139e953dc8ea54";
const digest = value => createHash("sha256").update(value).digest("hex");
const fail = message => { throw new Error(`MD schema reference rejected: ${message}`); };

// Immutable documentary evidence only; this module has no acquisition lifecycle.
export function validateMdSdatCorporateFileSchemaReference(value) {
  if (value?.schema_version !== "md-sdat-corporate-file-schema-reference@1.0.0"
      || value.reference_id !== MD_SCHEMA_REFERENCE_ID || value.observed_at !== "2026-11-13"
      || value.state !== "MD" || value.scope !== "standalone-documentation-only-prerequisite"
      || value.decision !== "hold") fail("identity or scope drifted");
  if (value.current_schema_compatibility_verified !== false || value.connector_ready !== false
      || value.acquisition_authorized !== false || value.required_source_files !== 0
      || value.source_records_acquired !== 0 || value.broad_layer_gaps_resolved !== 0
      || !value.authority || Object.values(value.authority).some(entry => entry !== false)
      || !value.controls || Object.values(value.controls).some(entry => entry !== false && entry !== 0)) {
    fail("zero-row, zero-authority boundary drifted");
  }
  if (value.published_layout?.current_schema_compatibility_verified !== false
      || value.published_layout?.compatibility_promise_verified !== false
      || value.published_layout?.retained_locally !== false
      || value.current_documentation?.website_usage?.interactive_search_automation_permitted !== false
      || value.current_documentation?.website_usage?.data_mining_software_access !== "will-be-blocked") {
    fail("schema, retention or search/data-mining policy boundary drifted");
  }
  // Pin all fields, missing/unknown keys, citations, transport qualifications and gates.
  if (digest(JSON.stringify(value)) !== CONTENT_SHA256) fail("immutable evidence content digest drifted");
  return structuredClone(value);
}

export function verifyMdSdatCorporateFileSchemaReferenceBytes(bytes) {
  if (digest(bytes) !== MD_SCHEMA_REFERENCE_SHA256) fail("file bytes drifted");
  return validateMdSdatCorporateFileSchemaReference(JSON.parse(bytes));
}

export async function loadMdSdatCorporateFileSchemaReference({ root = APP_ROOT } = {}) {
  return verifyMdSdatCorporateFileSchemaReferenceBytes(await readFile(path.join(root, MD_SCHEMA_REFERENCE_PATH)));
}
