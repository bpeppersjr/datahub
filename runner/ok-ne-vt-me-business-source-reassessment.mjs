import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";

export const OK_NE_VT_ME_REASSESSMENT_STATES = Object.freeze(["OK", "NE", "VT", "ME"]);
export const OK_NE_VT_ME_REASSESSMENT_IDS = Object.freeze(Object.fromEntries(OK_NE_VT_ME_REASSESSMENT_STATES.map(state => [state, `${state.toLowerCase()}-business-source-reassessment-2026-10-03`])));
const DIGESTS = Object.freeze({
  OK: "43360575bc0bec97ecc6a46e20849f1daff921c8e1157bbd35a96da5480e1bd2",
  NE: "db9fa3dd6d8bc7cb60c88ec2b15f9086aff6ef056abb71da2147e1291f392437",
  VT: "b71f5f1f10d792ca32072f7f61719e95a977c16671cb79fe84b3917404f1238e",
  ME: "99f3db510cf73aad225d7fa72ae050662a19e5ac241b673a9ca220798619abf8",
});
const CONTROLS = Object.freeze({ official_primary_sources_only: true, record_requests: 0, datasets_acquired: 0, accounts_created: 0, terms_accepted: 0, fees_paid: 0, publisher_contacts: 0, portal_automation: false, production_changes: 0 });
const check = (condition, message) => { if (!condition) throw new Error(`OK/NE/VT/ME business-source reassessment rejected: ${message}`); };

// Each dated observation is immutable. A later source contract requires new evidence.
export function validateOkNeVtMeBusinessSourceReassessment(value, expectedState = value?.state?.abbreviation) {
  check(OK_NE_VT_ME_REASSESSMENT_STATES.includes(expectedState) && value?.state?.abbreviation === expectedState, "state identity");
  check(value.schema_version === "state-business-source-reassessment@1.0.0" && value.assessment_id === OK_NE_VT_ME_REASSESSMENT_IDS[expectedState] && value.observed_at === "2026-10-03", "provenance");
  const supersedes = expectedState === "ME" ? "state-business-source-discovery-queue-4-wave-1-2026-09-03" : "state-business-source-revalidation-2026-09-03";
  check(value.supersedes_assessment_id === supersedes, "superseded evidence identity");
  check(value.decision === "hold" && value.connector_candidate === false && JSON.stringify(value.controls) === JSON.stringify(CONTROLS), "zero-action HOLD boundary");
  check(createHash("sha256").update(JSON.stringify(value)).digest("hex") === DIGESTS[expectedState], "immutable evidence content digest");
  return structuredClone(value);
}

export async function loadOkNeVtMeBusinessSourceReassessment(state, { root = APP_ROOT } = {}) {
  check(OK_NE_VT_ME_REASSESSMENT_STATES.includes(state), "state identity");
  return validateOkNeVtMeBusinessSourceReassessment(JSON.parse(await readFile(path.join(root, "config", "state-business-source-assessments", `${state.toLowerCase()}-2026-10-03.json`), "utf8")), state);
}

export async function loadOkNeVtMeBusinessSourceReassessments({ root = APP_ROOT } = {}) {
  return Promise.all(OK_NE_VT_ME_REASSESSMENT_STATES.map(state => loadOkNeVtMeBusinessSourceReassessment(state, { root })));
}
