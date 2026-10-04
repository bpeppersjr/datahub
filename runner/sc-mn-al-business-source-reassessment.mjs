import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";

export const SC_MN_AL_REASSESSMENT_STATES = Object.freeze(["SC", "MN", "AL"]);
export const SC_MN_AL_REASSESSMENT_IDS = Object.freeze(Object.fromEntries(SC_MN_AL_REASSESSMENT_STATES.map(state => [state, `${state.toLowerCase()}-business-source-reassessment-2026-10-03`])));
const DIGESTS = Object.freeze({
  SC: "69071b2c5f40129f9a468058c86669589bbfed275806e3a4bc6a4751c3923eeb",
  MN: "cfa384462469a24b57fd85cb191a7fda147149315dd0c4ea79b98d870df89079",
  AL: "92ad805ab4d95e0f1a8e80e4a1e9982934953f654b2a75262ecf1cb13c0205f8",
});
const check = (condition, message) => { if (!condition) throw new Error(`SC/MN/AL business-source reassessment rejected: ${message}`); };

// Date-specific content is immutable; later observations require new records.
export function validateScMnAlBusinessSourceReassessment(value, expectedState = value?.state?.abbreviation) {
  check(SC_MN_AL_REASSESSMENT_STATES.includes(expectedState) && value?.state?.abbreviation === expectedState, "state identity");
  check(value.schema_version === "state-business-source-reassessment@1.0.0" && value.assessment_id === SC_MN_AL_REASSESSMENT_IDS[expectedState] && value.observed_at === "2026-10-03", "provenance");
  check(value.supersedes_assessment_id === `state-business-source-discovery-queue-${expectedState === "SC" ? "7" : "8"}-wave-1-2026-09-03`, "superseded evidence identity");
  check(value.decision === "hold" && value.connector_candidate === false && value.authority && Object.values(value.authority).every(flag => flag === false), "HOLD and authority");
  check(createHash("sha256").update(JSON.stringify(value)).digest("hex") === DIGESTS[expectedState], "immutable evidence content digest");
  return structuredClone(value);
}

export async function loadScMnAlBusinessSourceReassessment(state, { root = APP_ROOT } = {}) {
  check(SC_MN_AL_REASSESSMENT_STATES.includes(state), "state identity");
  return validateScMnAlBusinessSourceReassessment(JSON.parse(await readFile(path.join(root, "config", "state-business-source-assessments", `${state.toLowerCase()}-2026-10-03.json`), "utf8")), state);
}

export async function loadScMnAlBusinessSourceReassessments({ root = APP_ROOT } = {}) {
  return Promise.all(SC_MN_AL_REASSESSMENT_STATES.map(state => loadScMnAlBusinessSourceReassessment(state, { root })));
}
