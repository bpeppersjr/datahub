import {
  loadNcBusinessRegistrationSchemaReference,
  NC_SCHEMA_REFERENCE_SHA256,
} from "../runner/nc-business-registration-schema-reference.mjs";

if (process.argv.length !== 2) {
  throw new Error("Usage: node scripts/verify-nc-business-registration-schema-reference.mjs");
}
const reference = await loadNcBusinessRegistrationSchemaReference();
process.stdout.write(`${JSON.stringify({
  status: "documentation-reference-verified",
  reference_id: reference.reference_id,
  evidence_sha256: NC_SCHEMA_REFERENCE_SHA256,
  decision: reference.decision,
  current_schema_compatibility_verified: reference.current_schema_compatibility_verified,
  connector_ready: reference.connector_ready,
  acquisition_authorized: reference.acquisition_authorized,
  required_source_files: reference.required_source_files,
  source_records_acquired: reference.source_records_acquired,
}, null, 2)}\n`);
