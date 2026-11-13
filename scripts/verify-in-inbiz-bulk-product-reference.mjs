import {
  loadInInbizBulkProductReference,
  IN_BULK_PRODUCT_REFERENCE_SHA256,
} from "../runner/in-inbiz-bulk-product-reference.mjs";

if (process.argv.length !== 2) {
  throw new Error("Usage: node scripts/verify-in-inbiz-bulk-product-reference.mjs");
}
const reference = await loadInInbizBulkProductReference();
process.stdout.write(`${JSON.stringify({
  status: "documentation-reference-verified",
  reference_id: reference.reference_id,
  evidence_sha256: IN_BULK_PRODUCT_REFERENCE_SHA256,
  decision: reference.decision,
  current_schema_compatibility_verified: reference.current_schema_compatibility_verified,
  scope_semantics_verified: reference.scope_semantics_verified,
  connector_ready: reference.connector_ready,
  acquisition_authorized: reference.acquisition_authorized,
  account_created: reference.account_created,
  purchase_made: reference.purchase_made,
  required_source_files: reference.required_source_files,
  source_records_acquired: reference.source_records_acquired,
  pdf_files_retained: reference.controls.pdf_files_retained,
}, null, 2)}\n`);
