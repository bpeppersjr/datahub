import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";

export const MI_MD_LA_REASSESSMENT_IDS = Object.freeze({
  MI: "mi-business-source-reassessment-2026-10-03",
  MD: "md-business-source-reassessment-2026-10-03",
  LA: "la-business-source-reassessment-2026-10-03",
});
const SPECS = Object.freeze({
  MI: Object.freeze({ name: "Michigan", digest: "b31851bcc251cc7a62f9c42119f7c7fbc801a569f38d50f6858142ee70377e2b" }),
  MD: Object.freeze({ name: "Maryland", digest: "2763f4d27120d7c7317abbd6882b6eb101ef029f28c6f37f6230bab4a4794820" }),
  LA: Object.freeze({ name: "Louisiana", digest: "9843e4517405b036a58049556c67627eee935b6967b51b8101805757626ac9f9" }),
});
const CONTROL = { official_primary_sources_only: true, record_requests: 0, downloads: 0, accounts_created: 0, terms_accepted: 0, fees_paid: 0, contacts_made: 0, portal_automation: false, production_changes: 0 };
const check = (condition) => { if (!condition) throw new Error("MI/MD/LA business-source reassessment rejected."); };

export function validateMiMdLaBusinessSourceReassessment(value) {
  const state = value?.state?.abbreviation;
  const spec = SPECS[state];
  check(spec && value.schema_version === "state-business-source-reassessment@1.0.0");
  check(value.assessment_id === MI_MD_LA_REASSESSMENT_IDS[state] && value.state.name === spec.name);
  check(value.observed_at === "2026-10-03" && value.decision === "hold" && value.connector_candidate === false);
  check(JSON.stringify(value.controls) === JSON.stringify(CONTROL));
  check(Object.values(value.authority ?? {}).length === 8 && Object.values(value.authority).every((authorized) => authorized === false));
  // The digest pins the complete reviewed evidence, including source provenance and
  // the no-action boundary. Changed facts require a separately reviewed version.
  check(createHash("sha256").update(JSON.stringify(value)).digest("hex") === spec.digest);
  return structuredClone(value);
}

export async function loadMiMdLaBusinessSourceReassessment(state, file = path.join(APP_ROOT, "config", "state-business-source-assessments", `${String(state).toLowerCase()}-2026-10-03.json`)) {
  check(Object.hasOwn(SPECS, state));
  const value = validateMiMdLaBusinessSourceReassessment(JSON.parse(await readFile(file, "utf8")));
  check(value.state.abbreviation === state);
  return value;
}

export function loadMiMdLaBusinessSourceReassessments() {
  return Promise.all(Object.keys(SPECS).map((state) => loadMiMdLaBusinessSourceReassessment(state)));
}
