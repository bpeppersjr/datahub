import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";

export const AK_DC_REASSESSMENT_STATES = Object.freeze(["AK", "DC"]);
export const AK_DC_REASSESSMENT_IDS = Object.freeze(Object.fromEntries(AK_DC_REASSESSMENT_STATES.map(state => [state, `${state.toLowerCase()}-business-source-reassessment-2026-10-03`])));
const DIGESTS = Object.freeze({ AK: "f5981da29d3af903fcb6a40ff35b76a1b6293a98702819ed40121c587525c31c", DC: "778a5daf24d78aa6103afb47ffa2f7c1a810bc87086731dbf57ee4908d5d6b3f" });
const CONTROLS = Object.freeze({ official_primary_sources_only: true, record_requests: 0, datasets_acquired: 0, accounts_created: 0, terms_accepted: 0, fees_paid: 0, publisher_contacts: 0, portal_automation: false, production_changes: 0 });
const AUTHORITY = Object.freeze({ source_access: false, acquisition: false, connector_implementation: true, production: false });
const check = (condition, message) => { if (!condition) throw new Error(`AK/DC business-source reassessment rejected: ${message}`); };

export function validateAkDcBusinessSourceReassessment(value, expectedState = value?.state?.abbreviation) {
  check(AK_DC_REASSESSMENT_STATES.includes(expectedState) && value?.state?.abbreviation === expectedState, "state identity");
  check(value.schema_version === "state-business-source-reassessment@1.0.0" && value.assessment_id === AK_DC_REASSESSMENT_IDS[expectedState] && value.observed_at === "2026-10-03", "provenance");
  check(value.supersedes_assessment_id === "state-business-source-discovery-queue-4-wave-3-2026-09-03", "superseded evidence identity");
  check(value.decision === "proceed-to-bounded-connector" && value.connector_candidate === true && JSON.stringify(value.controls) === JSON.stringify(CONTROLS) && JSON.stringify(value.authority) === JSON.stringify(AUTHORITY), "bounded offline implementation boundary");
  // Entire reviewed observation is pinned; amendments need a successor review.
  check(createHash("sha256").update(JSON.stringify(value)).digest("hex") === DIGESTS[expectedState], "immutable evidence content digest");
  return structuredClone(value);
}

export async function loadAkDcBusinessSourceReassessment(state, { root = APP_ROOT } = {}) {
  check(AK_DC_REASSESSMENT_STATES.includes(state), "state identity");
  return validateAkDcBusinessSourceReassessment(JSON.parse(await readFile(path.join(root, "config", "state-business-source-assessments", `${state.toLowerCase()}-2026-10-03.json`), "utf8")), state);
}

export async function loadAkDcBusinessSourceReassessments({ root = APP_ROOT } = {}) {
  return Promise.all(AK_DC_REASSESSMENT_STATES.map(state => loadAkDcBusinessSourceReassessment(state, { root })));
}
