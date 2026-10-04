import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";

export const NJ_VA_TN_MA_REASSESSMENT_STATES = Object.freeze(["NJ", "VA", "TN", "MA"]);
export const NJ_VA_TN_MA_REASSESSMENT_IDS = Object.freeze(Object.fromEntries(NJ_VA_TN_MA_REASSESSMENT_STATES.map(state => [state, `${state.toLowerCase()}-business-source-reassessment-2026-10-03`])));
const DIGESTS = Object.freeze({
  NJ: "2b9f3c7f338e930540b60d4b035d984781923c660834f8a6925a70104f6ff847",
  VA: "34401d5d210a82d74b331eb0498baa51bb1365005100134962d7c66aabccb81d",
  TN: "e6836dfccd4fa47a3c830b9cbe7fce799541efc7557a7c2d799d37024db12e56",
  MA: "aa413a209911ab8e6f1247ac024fc19fd76e44bfff268367cd6cd2ad1ce1a6eb",
});
const CONTROLS = Object.freeze({ official_primary_sources_only: true, record_requests: 0, datasets_acquired: 0, accounts_created: 0, terms_accepted: 0, fees_paid: 0, publisher_contacts: 0, portal_automation: false, production_changes: 0 });
const AUTHORITY = Object.freeze({ source_access: false, acquisition: false, connector_implementation: false, production: false });
const check = (condition, message) => { if (!condition) throw new Error(`NJ/VA/TN/MA business-source reassessment rejected: ${message}`); };

export function validateNjVaTnMaBusinessSourceReassessment(value, expectedState = value?.state?.abbreviation) {
  check(NJ_VA_TN_MA_REASSESSMENT_STATES.includes(expectedState) && value?.state?.abbreviation === expectedState, "state identity");
  check(value.schema_version === "state-business-source-reassessment@1.0.0" && value.assessment_id === NJ_VA_TN_MA_REASSESSMENT_IDS[expectedState] && value.observed_at === "2026-10-03", "provenance");
  const queue = ["NJ", "VA"].includes(expectedState) ? 5 : 6;
  check(value.supersedes_assessment_id === `state-business-source-discovery-queue-${queue}-wave-1-2026-09-03`, "superseded evidence identity");
  check(value.decision === "hold" && value.connector_candidate === false && JSON.stringify(value.controls) === JSON.stringify(CONTROLS) && JSON.stringify(value.authority) === JSON.stringify(AUTHORITY), "zero-action HOLD boundary");
  // Pin the complete reviewed observation; changed evidence requires a new review.
  check(createHash("sha256").update(JSON.stringify(value)).digest("hex") === DIGESTS[expectedState], "immutable evidence content digest");
  return structuredClone(value);
}

export async function loadNjVaTnMaBusinessSourceReassessment(state, { root = APP_ROOT } = {}) {
  check(NJ_VA_TN_MA_REASSESSMENT_STATES.includes(state), "state identity");
  return validateNjVaTnMaBusinessSourceReassessment(JSON.parse(await readFile(path.join(root, "config", "state-business-source-assessments", `${state.toLowerCase()}-2026-10-03.json`), "utf8")), state);
}

export async function loadNjVaTnMaBusinessSourceReassessments({ root = APP_ROOT } = {}) {
  return Promise.all(NJ_VA_TN_MA_REASSESSMENT_STATES.map(state => loadNjVaTnMaBusinessSourceReassessment(state, { root })));
}
