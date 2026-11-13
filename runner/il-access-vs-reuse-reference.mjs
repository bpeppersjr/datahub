import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { APP_ROOT } from "./paths.mjs";

export const IL_ACCESS_VS_REUSE_REFERENCE_ID = "il-access-vs-reuse-reference-2026-11-13";
export const IL_ACCESS_VS_REUSE_REFERENCE_PATH = "config/state-business-source-assessments/il-access-vs-reuse-reference-2026-11-13.json";
export const IL_ACCESS_VS_REUSE_REFERENCE_SHA256 = "bdec8b0210ae98a8cf317c5ea05e2ceba6027bd9216886e49e3342fa2a7589b6";
const CONTENT_SHA256 = "e3e700ae97613132c036fb608538f8c12c579cf1ab6e9c4243581e4ea326f9a1";
const digest = value => createHash("sha256").update(value).digest("hex");
const fail = message => { throw new Error(`IL access-vs-reuse reference rejected: ${message}`); };

// Immutable documentary evidence, not an authorization or executable source contract.
export function validateIlAccessVsReuseReference(value) {
  if (value?.schema_version !== "il-access-vs-reuse-reference@1.0.0"
      || value.reference_id !== IL_ACCESS_VS_REUSE_REFERENCE_ID || value.observed_at !== "2026-11-13"
      || value.state !== "IL" || value.scope !== "standalone-documentation-only-prerequisite"
      || value.decision !== "hold") fail("identity or scope drifted");
  if (["connector_ready", "acquisition_authorized", "processing_authorized", "publication_authorized", "national_admission_authorized", "reuse_reconciled"].some(key => value[key] !== false)
      || value.source_files_retained !== 0 || value.source_rows_retained !== 0
      || !value.authority || Object.values(value.authority).some(entry => entry !== false)
      || !value.controls || Object.values(value.controls).some(entry => entry !== 0)
      || value.official_sos_evidence?.automation_authorized !== false
      || value.official_sos_evidence?.actual_package_verified !== false
      || value.statutory_evidence?.direct_live_page_retrieval_verified !== false
      || value.statutory_evidence?.reuse_reconciliation_complete !== false) fail("evidence or authority boundary drifted");
  if (digest(JSON.stringify(value)) !== CONTENT_SHA256) fail("immutable evidence content digest drifted");
  return structuredClone(value);
}

export function verifyIlAccessVsReuseReferenceBytes(bytes) {
  if (digest(bytes) !== IL_ACCESS_VS_REUSE_REFERENCE_SHA256) fail("file bytes drifted");
  return validateIlAccessVsReuseReference(JSON.parse(bytes));
}

export async function loadIlAccessVsReuseReference({ root = APP_ROOT } = {}) {
  return verifyIlAccessVsReuseReferenceBytes(await readFile(path.join(root, IL_ACCESS_VS_REUSE_REFERENCE_PATH)));
}
