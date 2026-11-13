import { loadIlAccessVsReuseReference, IL_ACCESS_VS_REUSE_REFERENCE_SHA256 } from "../runner/il-access-vs-reuse-reference.mjs";

if (process.argv.length !== 2) throw new Error("Usage: node scripts/verify-il-access-vs-reuse-reference.mjs");
const reference = await loadIlAccessVsReuseReference();
process.stdout.write(`${JSON.stringify({
  status: "documentation-reference-verified",
  reference_id: reference.reference_id,
  evidence_sha256: IL_ACCESS_VS_REUSE_REFERENCE_SHA256,
  decision: reference.decision,
  reuse_reconciled: reference.reuse_reconciled,
  authority: reference.authority,
  source_files_retained: reference.source_files_retained,
  source_rows_retained: reference.source_rows_retained,
}, null, 2)}\n`);
