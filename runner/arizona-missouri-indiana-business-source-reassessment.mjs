import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";

export const ARIZONA_REASSESSMENT_ID = "az-business-source-reassessment-2026-10-03";
export const MISSOURI_REASSESSMENT_ID = "mo-business-source-reassessment-2026-10-03";
export const INDIANA_REASSESSMENT_ID = "in-business-source-reassessment-2026-10-03";

// Dated evidence is immutable. Corrections require a successor assessment identity.
const STATES = Object.freeze({
  AZ: { id: ARIZONA_REASSESSMENT_ID, digest: "57aab61a352e9ec16b7ee83dce875b952140ffa10f7a25ffb551f1921092a635" },
  MO: { id: MISSOURI_REASSESSMENT_ID, digest: "75180ff5575ddfa1611cd951862a9162d7cd5223f60cb2b812e896cc7212e468" },
  IN: { id: INDIANA_REASSESSMENT_ID, digest: "2472b42f6274b1f691996f7eb0d648bc3060ddd5296d8b206a70893c5bd71dee" },
});

export function validateArizonaMissouriIndianaBusinessSourceReassessment(value) {
  const state = STATES[value?.state?.abbreviation];
  const digest = value && createHash("sha256").update(JSON.stringify(value)).digest("hex");
  if (!state || value.assessment_id !== state.id || digest !== state.digest) {
    throw new Error("Arizona/Missouri/Indiana business-source reassessment rejected: immutable evidence differs.");
  }
  return structuredClone(value);
}

async function load(file, abbreviation) {
  const value = validateArizonaMissouriIndianaBusinessSourceReassessment(JSON.parse(await readFile(file, "utf8")));
  if (value.state.abbreviation !== abbreviation) throw new Error("Business-source reassessment state substitution rejected.");
  return value;
}

export function loadArizonaBusinessSourceReassessment(file = path.join(APP_ROOT, "config/state-business-source-assessments/az-2026-10-03.json")) { return load(file, "AZ"); }
export function loadMissouriBusinessSourceReassessment(file = path.join(APP_ROOT, "config/state-business-source-assessments/mo-2026-10-03.json")) { return load(file, "MO"); }
export function loadIndianaBusinessSourceReassessment(file = path.join(APP_ROOT, "config/state-business-source-assessments/in-2026-10-03.json")) { return load(file, "IN"); }
