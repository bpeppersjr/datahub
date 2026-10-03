import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";

export const GEORGIA_REASSESSMENT_ID = "ga-business-source-reassessment-2026-10-03";
export const NEW_MEXICO_REASSESSMENT_ID = "nm-business-source-reassessment-2026-10-03";
export const MONTANA_REASSESSMENT_ID = "mt-business-source-reassessment-2026-10-03";

// Pins protect this dated evidence from silently changing while retaining its ID.
// A changed observation belongs in a successor assessment, not this snapshot.
const STATES = Object.freeze({
  GA: { id: GEORGIA_REASSESSMENT_ID, digest: "9062ba5f37d1508948a8643bc39d9d893e35f97ede9f829df8491da1d9d9effa" },
  NM: { id: NEW_MEXICO_REASSESSMENT_ID, digest: "e91998df6cc9bfb35598c3f988af5387859ff2a193d6564f5666d84dddf7a874" },
  MT: { id: MONTANA_REASSESSMENT_ID, digest: "fb99d6a7153f6e91be97da52b9660ee1654b333928e8a3526f73cc84779ddc23" },
});

export function validateGeorgiaNewMexicoMontanaBusinessSourceReassessment(value) {
  const state = STATES[value?.state?.abbreviation];
  const digest = value && createHash("sha256").update(JSON.stringify(value)).digest("hex");
  if (!state || value.assessment_id !== state.id || digest !== state.digest) {
    throw new Error("Georgia/New Mexico/Montana business-source reassessment rejected: immutable evidence differs.");
  }
  return structuredClone(value);
}

async function load(file, abbreviation) {
  const value = validateGeorgiaNewMexicoMontanaBusinessSourceReassessment(JSON.parse(await readFile(file, "utf8")));
  if (value.state.abbreviation !== abbreviation) throw new Error("Business-source reassessment state substitution rejected.");
  return value;
}

export function loadGeorgiaBusinessSourceReassessment(file = path.join(APP_ROOT, "config/state-business-source-assessments/ga-2026-10-03.json")) { return load(file, "GA"); }
export function loadNewMexicoBusinessSourceReassessment(file = path.join(APP_ROOT, "config/state-business-source-assessments/nm-2026-10-03.json")) { return load(file, "NM"); }
export function loadMontanaBusinessSourceReassessment(file = path.join(APP_ROOT, "config/state-business-source-assessments/mt-2026-10-03.json")) { return load(file, "MT"); }
