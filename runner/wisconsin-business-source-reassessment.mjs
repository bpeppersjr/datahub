import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";

export const WI_REASSESSMENT_ID = "wi-business-source-reassessment-2026-10-03";
const DIGEST = "823075d5f6939eb07f91528d49a8ea8d6255131ff486c10f5c44af9b6467eb4b";
const check = (condition, message) => { if (!condition) throw new Error(`Wisconsin business-source reassessment rejected: ${message}`); };

// A later observation must be a successor record; this dated evidence is immutable.
export function validateWisconsinBusinessSourceReassessment(value) {
  check(value?.state?.abbreviation === "WI", "state identity");
  check(value.schema_version === "state-business-source-reassessment@1.0.0" && value.assessment_id === WI_REASSESSMENT_ID && value.observed_at === "2026-10-03", "provenance");
  check(value.supersedes_assessment_id === "state-business-source-discovery-queue-8-wave-1-2026-09-03", "superseded evidence identity");
  check(value.decision === "hold" && value.connector_candidate === false && value.authority && Object.values(value.authority).every(flag => flag === false), "HOLD and authority");
  check(createHash("sha256").update(JSON.stringify(value)).digest("hex") === DIGEST, "immutable evidence content digest");
  return structuredClone(value);
}

export async function loadWisconsinBusinessSourceReassessment({ root = APP_ROOT } = {}) {
  return validateWisconsinBusinessSourceReassessment(JSON.parse(await readFile(path.join(root, "config", "state-business-source-assessments", "wi-2026-10-03.json"), "utf8")));
}
