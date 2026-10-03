import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";

const SPECS = Object.freeze({
  CA: Object.freeze({ name: "California", digest: "f1d07d09ba6ce5aa3a2fad8ff822659894bc99ede29d6e6bf5c4f4e91ca3e5ff" }),
  ID: Object.freeze({ name: "Idaho", digest: "ae1696bb43421e9a883687f28405943cee72e767e84484f232e66577f3b33948" }),
  NH: Object.freeze({ name: "New Hampshire", digest: "26937b85dd792da503731807c539484f85ca8d23151d5d25af228b6789de37cb" }),
  OH: Object.freeze({ name: "Ohio", digest: "e77a3835dff15af1368d99edf794de25036bd7450412a3bee8e332c291f848c4" }),
});
export const CA_ID_NH_OH_REASSESSMENT_IDS = Object.freeze(Object.fromEntries(Object.keys(SPECS).map((state) => [state, `${state.toLowerCase()}-business-source-reassessment-2026-10-03`])));
const CONTROL = { official_primary_sources_only: true, record_requests: 0, downloads: 0, accounts_created: 0, terms_accepted: 0, fees_paid: 0, contacts_made: 0, portal_automation: false, production_changes: 0 };
const check = (condition) => { if (!condition) throw new Error("CA/ID/NH/OH business-source reassessment rejected."); };

export function validateCaIdNhOhBusinessSourceReassessment(value) {
  const state = value?.state?.abbreviation;
  const spec = SPECS[state];
  check(spec && value.schema_version === "state-business-source-reassessment@1.0.0");
  check(value.assessment_id === CA_ID_NH_OH_REASSESSMENT_IDS[state] && value.state.name === spec.name && value.observed_at === "2026-10-03");
  check(value.decision === "hold" && value.connector_candidate === false);
  check(JSON.stringify(value.controls) === JSON.stringify(CONTROL));
  // Complete evidence is pinned, including explicit authority, failed retrievals and
  // distinctions between web definitions and an unverified bulk contract.
  check(createHash("sha256").update(JSON.stringify(value)).digest("hex") === spec.digest);
  return structuredClone(value);
}

export async function loadCaIdNhOhBusinessSourceReassessment(state, file = undefined) {
  check(Object.hasOwn(SPECS, state));
  const target = file ?? path.join(APP_ROOT, "config", "state-business-source-assessments", `${state.toLowerCase()}-2026-10-03.json`);
  const value = validateCaIdNhOhBusinessSourceReassessment(JSON.parse(await readFile(target, "utf8")));
  check(value.state.abbreviation === state);
  return value;
}

export async function loadCaIdNhOhBusinessSourceReassessments() {
  return Promise.all(Object.keys(SPECS).map((state) => loadCaIdNhOhBusinessSourceReassessment(state)));
}
