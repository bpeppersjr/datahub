import { ID_REFERENCE_SHA256, loadIdStatutorySourceRouteReference } from "../runner/id-statutory-source-route-reference.mjs";

if (process.argv.length !== 2) throw new Error("Usage: node scripts/verify-id-statutory-source-route-reference.mjs");
const reference = await loadIdStatutorySourceRouteReference();
process.stdout.write(`${JSON.stringify({
  status: "documentation-reference-verified",
  reference_id: reference.reference_id,
  evidence_sha256: ID_REFERENCE_SHA256,
  decision: reference.decision,
  current_product_verified: reference.current_product_verified,
  connector_ready: reference.connector_ready,
  acquisition_authorized: reference.acquisition_authorized,
  required_source_files: reference.required_source_files,
  source_records_acquired: reference.source_records_acquired,
}, null, 2)}\n`);
