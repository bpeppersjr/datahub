import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { APP_ROOT } from "./paths.mjs";

export const VERMONT_DOCUMENT_PREREQUISITE_ID = "vt-business-source-document-prerequisite-2026-10-07";
export const VERMONT_DOCUMENT_PREREQUISITE_SHA256 = "16cdc05219afd5e9dd4bd241781fccb38011ec073505f43621b31c47d0711ebb";
const VERMONT_DOCUMENT_PREREQUISITE_CONTENT_SHA256 = "259f7edbbe67097e2b4ec3eefd9ecdb033f330e45a9eb8d42371335cff19f6d6";

const fail = (message) => { throw new Error(`Vermont business-source document prerequisite rejected: ${message}`); };

export function validateVermontBusinessSourceDocumentPrerequisite(value) {
  if (value?.schema_version !== "state-business-source-prerequisite@1.0.0"
      || value.assessment_id !== VERMONT_DOCUMENT_PREREQUISITE_ID
      || value.observed_at !== "2026-10-07"
      || value.state?.abbreviation !== "VT"
      || value.supersedes_assessment_id !== "vt-business-source-reassessment-2026-10-03"
      || value.supersession_scope !== "Document-prerequisite evidence only; the immutable 51-jurisdiction catalog and historical backlog remain unchanged."
      || value.decision !== "hold" || value.connector_candidate !== false) fail("identity or supplemental scope drifted");
  if (Object.values(value.authority ?? {}).some((entry) => entry !== false)
      || value.controls?.provider_row_requests !== 0 || value.controls?.datasets_acquired !== 0
      || value.controls?.accounts_created !== 0 || value.controls?.fees_paid !== 0
      || value.controls?.terms_accepted !== 0 || value.controls?.publisher_contacts !== 0
      || value.controls?.portal_automation !== false || value.controls?.production_changes !== 0) fail("zero-authority boundary drifted");
  if (value.interface_observation?.delivery_interface_verified !== false
      || value.interface_observation?.schema_or_header_received !== false
      || value.claims?.source_records_acquired !== 0 || value.claims?.source_ready !== false
      || value.claims?.production_ready !== false || value.claims?.current_pointer_written !== false) fail("prerequisite claims widened");
  const digest = createHash("sha256").update(JSON.stringify(value)).digest("hex");
  if (digest !== VERMONT_DOCUMENT_PREREQUISITE_CONTENT_SHA256) fail("immutable evidence content digest drifted");
  return structuredClone(value);
}

export async function loadVermontBusinessSourceDocumentPrerequisite({ root = APP_ROOT } = {}) {
  const bytes = await readFile(path.join(root, "config", "state-business-source-assessments", "vt-2026-10-07.json"));
  if (createHash("sha256").update(bytes).digest("hex") !== VERMONT_DOCUMENT_PREREQUISITE_SHA256) fail("file bytes drifted");
  return validateVermontBusinessSourceDocumentPrerequisite(JSON.parse(bytes));
}
