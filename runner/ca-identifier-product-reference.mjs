import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { APP_ROOT } from "./paths.mjs";

export const CA_IDENTIFIER_PRODUCT_REFERENCE_ID = "ca-identifier-product-reference-2026-11-13";
export const CA_IDENTIFIER_PRODUCT_REFERENCE_PATH = "config/state-business-source-assessments/ca-identifier-product-reference-2026-11-13.json";
export const CA_IDENTIFIER_PRODUCT_REFERENCE_SHA256 = "5e57a3e3ed4f9b9c1b41e31d3219f850713066a53032d8ff05fa895667c67dd4";
const CONTENT_SHA256 = "fe9306beb231b9c9f92f360300aeebde11b6712fc338bef7a6910a5c9eafa1d7";
const digest = value => createHash("sha256").update(value).digest("hex");
const fail = message => { throw new Error(`CA identifier-product reference rejected: ${message}`); };

// Documentary evidence only; this does not establish a source contract or grant authority.
export function validateCaIdentifierProductReference(value) {
  if (value?.schema_version !== "ca-identifier-product-reference@1.0.0"
      || value.reference_id !== CA_IDENTIFIER_PRODUCT_REFERENCE_ID || value.observed_at !== "2026-11-13"
      || value.state !== "CA" || value.scope !== "standalone-documentation-only-prerequisite"
      || value.decision !== "hold") fail("identity or scope drifted");
  if (value.current_schema_compatibility_verified !== false || value.connector_ready !== false
      || value.acquisition_authorized !== false || value.required_source_files !== 0
      || value.source_records_acquired !== 0 || value.broad_layer_gaps_resolved !== 0
      || !value.authority || Object.values(value.authority).some(entry => entry !== false)
      || !value.controls || Object.values(value.controls).some(entry => entry !== false && entry !== 0)) {
    fail("zero-row, zero-authority boundary drifted");
  }
  if (digest(JSON.stringify(value)) !== CONTENT_SHA256) fail("immutable evidence content digest drifted");
  return structuredClone(value);
}

export function verifyCaIdentifierProductReferenceBytes(bytes) {
  if (digest(bytes) !== CA_IDENTIFIER_PRODUCT_REFERENCE_SHA256) fail("file bytes drifted");
  return validateCaIdentifierProductReference(JSON.parse(bytes));
}

export async function loadCaIdentifierProductReference({ root = APP_ROOT } = {}) {
  return verifyCaIdentifierProductReferenceBytes(await readFile(path.join(root, CA_IDENTIFIER_PRODUCT_REFERENCE_PATH)));
}

// Offline synthetic preservation only; deliberately imposes no format or meaning.
export function preserveSyntheticCaIdentifier(value) {
  if (typeof value !== "string" || value.trim().length === 0) throw new TypeError("identifier must be a nonblank string");
  return value;
}
