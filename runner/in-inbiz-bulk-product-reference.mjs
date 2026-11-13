import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { APP_ROOT } from "./paths.mjs";

export const IN_BULK_PRODUCT_REFERENCE_ID = "in-inbiz-bulk-product-reference-2026-11-13";
export const IN_BULK_PRODUCT_REFERENCE_PATH = "config/state-business-source-assessments/in-bulk-product-reference-2026-11-13.json";
export const IN_BULK_PRODUCT_REFERENCE_SHA256 = "a1e9eb88639ad312f638832bf7dd60f222350a30fd5c91b62c2d9d95a6b4e8b8";
const CONTENT_SHA256 = "e4181a6c441415ca27a05d49312f24f7f10491b9bdc3771bc9fcc8432538bc48";
const digest = value => createHash("sha256").update(value).digest("hex");
const fail = message => { throw new Error(`IN bulk-product reference rejected: ${message}`); };

// Immutable documentary evidence; never an executable source contract or acquisition grant.
export function validateInInbizBulkProductReference(value) {
  if (value?.schema_version !== "in-inbiz-bulk-product-reference@1.0.0"
      || value.reference_id !== IN_BULK_PRODUCT_REFERENCE_ID || value.observed_at !== "2026-11-13"
      || value.state !== "IN" || value.scope !== "standalone-documentation-only-prerequisite"
      || value.decision !== "hold") fail("identity or scope drifted");
  if (value.current_schema_compatibility_verified !== false || value.scope_semantics_verified !== false
      || value.connector_ready !== false || value.acquisition_authorized !== false
      || value.account_created !== false || value.purchase_made !== false
      || value.required_source_files !== 0 || value.source_records_acquired !== 0
      || value.broad_layer_gaps_resolved !== 0 || !value.authority
      || Object.values(value.authority).some(entry => entry !== false)
      || !value.controls || Object.values(value.controls).some(entry => entry !== false && entry !== 0)) {
    fail("zero-row, zero-authority boundary drifted");
  }
  if (value.current_documentation?.regulatory_analysis?.retained_locally !== false
      || value.current_documentation?.regulatory_analysis?.scope_conflict_resolved !== false
      || value.current_documentation?.regulatory_analysis?.current_schema_proof !== false
      || value.current_documentation?.inbiz_bulk_services?.current_schema_proof !== false
      || value.current_documentation?.inbiz_bulk_services?.account_required !== true) {
    fail("document retention, scope ambiguity or access claims widened");
  }
  // Pin required and unknown fields, citations, price provenance and unresolved qualifications.
  if (digest(JSON.stringify(value)) !== CONTENT_SHA256) fail("immutable evidence content digest drifted");
  return structuredClone(value);
}

export function verifyInInbizBulkProductReferenceBytes(bytes) {
  if (digest(bytes) !== IN_BULK_PRODUCT_REFERENCE_SHA256) fail("file bytes drifted");
  return validateInInbizBulkProductReference(JSON.parse(bytes));
}

export async function loadInInbizBulkProductReference({ root = APP_ROOT } = {}) {
  return verifyInInbizBulkProductReferenceBytes(await readFile(path.join(root, IN_BULK_PRODUCT_REFERENCE_PATH)));
}
