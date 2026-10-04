import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";

export const TEXAS_REASSESSMENT_ID = "tx-business-source-reassessment-2026-10-03";
const DIGEST = "28c1cdc791d36d2fd14ab7f29df715254e231056545d7ce7b158917e7272d15e";

// Historical evidence is pinned; a later correction requires a successor identity.
export function validateTexasBusinessSourceReassessment(value) {
  const digest = value && createHash("sha256").update(JSON.stringify(value)).digest("hex");
  if (value?.assessment_id !== TEXAS_REASSESSMENT_ID || value?.state?.abbreviation !== "TX" || digest !== DIGEST) {
    throw new Error("Texas business-source reassessment rejected: immutable evidence differs.");
  }
  return structuredClone(value);
}

export async function loadTexasBusinessSourceReassessment(file = path.join(APP_ROOT, "config/state-business-source-assessments/tx-2026-10-03.json")) {
  return validateTexasBusinessSourceReassessment(JSON.parse(await readFile(file, "utf8")));
}
