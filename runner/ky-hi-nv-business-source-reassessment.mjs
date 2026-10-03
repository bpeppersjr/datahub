import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";

export const KY_HI_NV_REASSESSMENT_STATES = Object.freeze(["KY", "HI", "NV"]);
export const KY_HI_NV_REASSESSMENT_IDS = Object.freeze(Object.fromEntries(KY_HI_NV_REASSESSMENT_STATES.map(state => [state, `${state.toLowerCase()}-business-source-reassessment-2026-10-03`])));
const CONTENT_DIGESTS = Object.freeze({
  KY: "b2f46f68a398a9cae5e434269b9257e87a995022ddea5b96a79af2a3e7403b79",
  HI: "ee9b5858669d17632eb996367d7bf050adec6c4abfb8a70ad592aeebdc32504a",
  NV: "49136a6d4997000b832b6187154aa6f250c641266301f4debde8601973eef32e",
});
const ZERO_ACTION_CONTROLS = Object.freeze({ official_primary_sources_only: true, record_requests: 0, datasets_acquired: 0, accounts_created: 0, terms_accepted: 0, fees_paid: 0, publisher_contacts: 0, portal_automation: false, production_changes: 0 });
const SUPERSEDES = Object.freeze({ KY: "ky-business-source-2026-09-22", HI: "state-business-source-hi-20260922-v1", NV: "state-business-source-nv-20260922-v1" });
const check = (condition, message) => { if (!condition) throw new Error(`KY/HI/NV business-source reassessment rejected: ${message}`); };

// These dated evidence records are immutable: changed evidence requires a new review,
// not an edit that silently grants acquisition or weakens the source restrictions.
export function validateKyHiNvBusinessSourceReassessment(value, expectedState = value?.state?.abbreviation) {
  check(KY_HI_NV_REASSESSMENT_STATES.includes(expectedState) && value?.state?.abbreviation === expectedState, "state identity");
  check(value.schema_version === "state-business-source-reassessment@1.0.0" && value.assessment_id === KY_HI_NV_REASSESSMENT_IDS[expectedState] && value.observed_at === "2026-10-03" && value.supersedes_assessment_id === SUPERSEDES[expectedState], "provenance");
  check(value.decision === "hold" && value.connector_candidate === false && JSON.stringify(value.controls) === JSON.stringify(ZERO_ACTION_CONTROLS), "zero-action HOLD boundary");
  check(createHash("sha256").update(JSON.stringify(value)).digest("hex") === CONTENT_DIGESTS[expectedState], "immutable evidence content digest");
  return structuredClone(value);
}

export async function loadKyHiNvBusinessSourceReassessment(state, { root = APP_ROOT } = {}) {
  check(KY_HI_NV_REASSESSMENT_STATES.includes(state), "state identity");
  const file = path.join(root, "config", "state-business-source-assessments", `${state.toLowerCase()}-2026-10-03.json`);
  return validateKyHiNvBusinessSourceReassessment(JSON.parse(await readFile(file, "utf8")), state);
}

export async function loadKyHiNvBusinessSourceReassessments({ root = APP_ROOT } = {}) {
  return Promise.all(KY_HI_NV_REASSESSMENT_STATES.map(state => loadKyHiNvBusinessSourceReassessment(state, { root })));
}
