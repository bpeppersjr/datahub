import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { APP_ROOT } from "./paths.mjs";

export const MO_BULK_PRODUCT_REFERENCE_ID = "mo-corporate-bulk-product-reference-2026-11-13";
export const MO_BULK_PRODUCT_REFERENCE_PATH = "config/state-business-source-assessments/mo-bulk-product-reference-2026-11-13.json";
export const MO_BULK_PRODUCT_REFERENCE_SHA256 = "69e1cd77101b19381291bd713acee87d0b2a719bf033394ead729dba85daccd8";
const CONTENT_SHA256 = "f062887c64a8528bfeec71baa9068d464bb64073934495c8fea6c1ecfc345019";
const digest = value => createHash("sha256").update(value).digest("hex");
const fail = message => { throw new Error(`MO bulk-product reference rejected: ${message}`); };

// Immutable documentary evidence; never an executable source contract or acquisition grant.
export function validateMoCorporateBulkProductReference(value) {
  if (value?.schema_version !== "mo-corporate-bulk-product-reference@1.0.0"
      || value.reference_id !== MO_BULK_PRODUCT_REFERENCE_ID || value.observed_at !== "2026-11-13"
      || value.state !== "MO" || value.scope !== "standalone-documentation-only-prerequisite"
      || value.decision !== "hold") fail("identity or scope drifted");
  if (value.current_schema_compatibility_verified !== false || value.connector_ready !== false
      || value.acquisition_authorized !== false || value.required_source_files !== 0
      || value.source_records_acquired !== 0 || value.broad_layer_gaps_resolved !== 0
      || !value.authority || Object.values(value.authority).some(entry => entry !== false)
      || !value.controls || Object.values(value.controls).some(entry => entry !== false && entry !== 0)) {
    fail("zero-row, zero-authority boundary drifted");
  }
  if (value.historical_implementation?.current_product_availability_verified !== false
      || value.historical_implementation?.current_schema_compatibility_verified !== false
      || value.historical_implementation?.retained_locally !== false
      || value.historical_implementation?.direct_retrieval_status !== 404) {
    fail("historical provenance or retention claims widened");
  }
  // Pin all required and unknown fields, current observations and historical qualifications.
  if (digest(JSON.stringify(value)) !== CONTENT_SHA256) fail("immutable evidence content digest drifted");
  return structuredClone(value);
}

export function verifyMoCorporateBulkProductReferenceBytes(bytes) {
  if (digest(bytes) !== MO_BULK_PRODUCT_REFERENCE_SHA256) fail("file bytes drifted");
  return validateMoCorporateBulkProductReference(JSON.parse(bytes));
}

export async function loadMoCorporateBulkProductReference({ root = APP_ROOT } = {}) {
  return verifyMoCorporateBulkProductReferenceBytes(await readFile(path.join(root, MO_BULK_PRODUCT_REFERENCE_PATH)));
}
