import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";

export const WYOMING_REASSESSMENT_ID = "wy-business-source-reassessment-2026-10-03";
export const RHODE_ISLAND_REASSESSMENT_ID = "ri-business-source-reassessment-2026-10-03";
export const SOUTH_DAKOTA_REASSESSMENT_ID = "sd-business-source-reassessment-2026-10-03";

// Changes to dated evidence require a successor assessment with a new identity.
const STATES = Object.freeze({
  WY: { id: WYOMING_REASSESSMENT_ID, digest: "1bc54129921ba0849cb6a37591ecb12b293ca2e5aa7aee205df6c7370a722717" },
  RI: { id: RHODE_ISLAND_REASSESSMENT_ID, digest: "c192404cadecde0ff9d7a63568d08d80c6529d033eb8e3aa783a1604ad9ce78c" },
  SD: { id: SOUTH_DAKOTA_REASSESSMENT_ID, digest: "1a7d0faee1c4131357f41576eefc4617e3253936ef857d3a19d2eabad9bd13d9" },
});

export function validateWyomingRhodeIslandSouthDakotaBusinessSourceReassessment(value) {
  const state = STATES[value?.state?.abbreviation];
  const digest = value && createHash("sha256").update(JSON.stringify(value)).digest("hex");
  if (!state || value.assessment_id !== state.id || digest !== state.digest) {
    throw new Error("Wyoming/Rhode Island/South Dakota business-source reassessment rejected: immutable evidence differs.");
  }
  return structuredClone(value);
}

async function load(file, abbreviation) {
  const value = validateWyomingRhodeIslandSouthDakotaBusinessSourceReassessment(JSON.parse(await readFile(file, "utf8")));
  if (value.state.abbreviation !== abbreviation) throw new Error("Business-source reassessment state substitution rejected.");
  return value;
}

export function loadWyomingBusinessSourceReassessment(file = path.join(APP_ROOT, "config/state-business-source-assessments/wy-2026-10-03.json")) { return load(file, "WY"); }
export function loadRhodeIslandBusinessSourceReassessment(file = path.join(APP_ROOT, "config/state-business-source-assessments/ri-2026-10-03.json")) { return load(file, "RI"); }
export function loadSouthDakotaBusinessSourceReassessment(file = path.join(APP_ROOT, "config/state-business-source-assessments/sd-2026-10-03.json")) { return load(file, "SD"); }
