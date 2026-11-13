import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { APP_ROOT } from "./paths.mjs";

export const SC_CONTRACT_SCHEMA_REFERENCE_ID = "sc-corporation-bulk-contract-schema-reference-2026-11-13";
export const SC_CONTRACT_SCHEMA_REFERENCE_PATH = "config/state-business-source-assessments/sc-contract-schema-reference-2026-11-13.json";
export const SC_CONTRACT_SCHEMA_REFERENCE_SHA256 = "65218be42c5c1fdc4f4d3340f81dca5ac5357f1ab516ca619bdc9cb84bfc6e7f";
const CONTENT_SHA256 = "f15d94e41029724cc4c38db083a22c509efd76c9599c07e5a1164de0c4d9db6e";
const digest = value => createHash("sha256").update(value).digest("hex");
const fail = message => { throw new Error(`SC contract-schema reference rejected: ${message}`); };

// Immutable documentary evidence, never an executable source contract or acquisition grant.
export function validateScCorporationBulkContractSchemaReference(value) {
  if (value?.schema_version !== "sc-corporation-bulk-contract-schema-reference@1.0.0"
      || value.reference_id !== SC_CONTRACT_SCHEMA_REFERENCE_ID || value.observed_at !== "2026-11-13"
      || value.state !== "SC" || value.scope !== "standalone-documentation-only-prerequisite"
      || value.decision !== "hold") fail("identity or scope drifted");
  const falseFields = ["current_schema_compatibility_verified", "connector_ready", "acquisition_authorized", "registration_authorized", "signature_authorized", "payment_authorized", "credentials_authorized"];
  if (falseFields.some(key => value[key] !== false)
      || value.required_source_files !== 0 || value.source_records_acquired !== 0 || value.broad_layer_gaps_resolved !== 0
      || !value.authority || Object.values(value.authority).some(entry => entry !== false)
      || !value.controls || Object.values(value.controls).some(entry => entry !== false && entry !== 0)) {
    fail("zero-row, zero-authority boundary drifted");
  }
  if (value.current_documentation?.subscriber_agreement?.retained_locally !== false
      || value.current_documentation?.subscriber_agreement?.current_schema_proof !== false
      || value.current_documentation?.business_filings_portal?.bulk_identity_verification_applicability_verified !== false) {
    fail("document retention, schema or filing-login scope claims widened");
  }
  // Pins every required and unknown field, product fact, citation and unresolved gate.
  if (digest(JSON.stringify(value)) !== CONTENT_SHA256) fail("immutable evidence content digest drifted");
  return structuredClone(value);
}

export function verifyScCorporationBulkContractSchemaReferenceBytes(bytes) {
  if (digest(bytes) !== SC_CONTRACT_SCHEMA_REFERENCE_SHA256) fail("file bytes drifted");
  return validateScCorporationBulkContractSchemaReference(JSON.parse(bytes));
}

export async function loadScCorporationBulkContractSchemaReference({ root = APP_ROOT } = {}) {
  return verifyScCorporationBulkContractSchemaReferenceBytes(await readFile(path.join(root, SC_CONTRACT_SCHEMA_REFERENCE_PATH)));
}
