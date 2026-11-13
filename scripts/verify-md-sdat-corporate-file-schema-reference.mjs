import {
  loadMdSdatCorporateFileSchemaReference,
  MD_SCHEMA_REFERENCE_SHA256,
} from "../runner/md-sdat-corporate-file-schema-reference.mjs";

if (process.argv.length !== 2) {
  throw new Error("Usage: node scripts/verify-md-sdat-corporate-file-schema-reference.mjs");
}
const reference = await loadMdSdatCorporateFileSchemaReference();
process.stdout.write(`${JSON.stringify({
  status: "documentation-reference-verified",
  reference_id: reference.reference_id,
  evidence_sha256: MD_SCHEMA_REFERENCE_SHA256,
  decision: reference.decision,
  current_schema_compatibility_verified: reference.current_schema_compatibility_verified,
  connector_ready: reference.connector_ready,
  acquisition_authorized: reference.acquisition_authorized,
  required_source_files: reference.required_source_files,
  source_records_acquired: reference.source_records_acquired,
  pdf_files_retained: reference.controls.pdf_files_retained,
}, null, 2)}\n`);
