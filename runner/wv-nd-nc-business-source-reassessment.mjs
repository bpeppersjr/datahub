import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";

export const WV_ND_NC_REASSESSMENT_STATES = Object.freeze(["WV", "ND", "NC"]);
export const WV_ND_NC_REASSESSMENT_IDS = Object.freeze(Object.fromEntries(WV_ND_NC_REASSESSMENT_STATES.map(state => [state, `${state.toLowerCase()}-business-source-reassessment-2026-10-03`])));
const DIGESTS = Object.freeze({
  WV: "5c01b6b22de62cab35cb33c7de9c6c704cccf44d8c7e6aad1809265145aadc87",
  ND: "8ec88cbdd5a5b3f58127d9b147dbd42f4eb96cb3d8923af77db1cf5a7283cf42",
  NC: "51d8a84aa7073c2f49bef2210bee95bbc6279f24c48c2e57c4a155f0b7b719fd",
});
const CONTROLS = { official_primary_sources_only: true, record_requests: 0, datasets_acquired: 0, accounts_created: 0, terms_accepted: 0, fees_paid: 0, publisher_contacts: 0, portal_automation: false, production_changes: 0 };
const check = (condition, reason) => { if (!condition) throw new Error(`WV/ND/NC business-source reassessment rejected: ${reason}`); };

export function validateWvNdNcBusinessSourceReassessment(value, expectedState = value?.state?.abbreviation) {
  check(WV_ND_NC_REASSESSMENT_STATES.includes(expectedState) && value?.state?.abbreviation === expectedState, "state identity");
  check(value.schema_version === "state-business-source-reassessment@1.0.0" && value.assessment_id === WV_ND_NC_REASSESSMENT_IDS[expectedState] && value.observed_at === "2026-10-03", "provenance");
  check(value.decision === "hold" && value.connector_candidate === false && JSON.stringify(value.controls) === JSON.stringify(CONTROLS), "zero-action HOLD boundary");
  check(Object.values(value.authority ?? {}).length === 8 && Object.values(value.authority).every(authorized => authorized === false), "authority");
  // Pin the entire dated observation; changed facts require a new review version.
  check(createHash("sha256").update(JSON.stringify(value)).digest("hex") === DIGESTS[expectedState], "immutable evidence content digest");
  return structuredClone(value);
}

export async function loadWvNdNcBusinessSourceReassessment(state, { root = APP_ROOT } = {}) {
  check(WV_ND_NC_REASSESSMENT_STATES.includes(state), "state identity");
  return validateWvNdNcBusinessSourceReassessment(JSON.parse(await readFile(path.join(root, "config", "state-business-source-assessments", `${state.toLowerCase()}-2026-10-03.json`), "utf8")), state);
}

export async function loadWvNdNcBusinessSourceReassessments({ root = APP_ROOT } = {}) {
  return Promise.all(WV_ND_NC_REASSESSMENT_STATES.map(state => loadWvNdNcBusinessSourceReassessment(state, { root })));
}
