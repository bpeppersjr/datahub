import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";

export const ILLINOIS_REASSESSMENT_ID = "il-business-source-reassessment-2026-10-03";
export const MISSISSIPPI_REASSESSMENT_ID = "ms-business-source-reassessment-2026-10-03";
const SPECS = Object.freeze({
  IL: Object.freeze({ id: ILLINOIS_REASSESSMENT_ID, name: "Illinois", digest: "2ed9e3ed61bd4f3e247090aa87130c676e61795d56a29fed23b06d8bc3c65da9" }),
  MS: Object.freeze({ id: MISSISSIPPI_REASSESSMENT_ID, name: "Mississippi", digest: "81302c46febea4773f19034e67a73dc84f329f77da774f0e747356bae95c4da3" }),
});
const CONTROL = { official_primary_sources_only: true, record_requests: 0, downloads: 0, accounts_created: 0, terms_accepted: 0, fees_paid: 0, contacts_made: 0, portal_automation: false, production_changes: 0 };
const check = (condition) => { if (!condition) throw new Error("Illinois/Mississippi business-source reassessment rejected."); };

export function validateIllinoisMississippiBusinessSourceReassessment(value) {
  const spec = SPECS[value?.state?.abbreviation];
  check(spec && value.schema_version === "state-business-source-reassessment@1.0.0" && value.assessment_id === spec.id);
  check(value.state.name === spec.name && value.observed_at === "2026-10-03");
  check(value.decision === "hold" && value.connector_candidate === false);
  check(JSON.stringify(value.controls) === JSON.stringify(CONTROL));
  // Pin the complete reviewed evidence as well as the no-action boundary. Whitespace in
  // the JSON file is immaterial; changed facts require a separately reviewed version.
  check(createHash("sha256").update(JSON.stringify(value)).digest("hex") === spec.digest);
  return structuredClone(value);
}

async function loadReassessment(abbreviation, file) {
  const value = validateIllinoisMississippiBusinessSourceReassessment(JSON.parse(await readFile(file, "utf8")));
  check(value.state.abbreviation === abbreviation);
  return value;
}

export function loadIllinoisBusinessSourceReassessment(file = path.join(APP_ROOT, "config", "state-business-source-assessments", "il-2026-10-03.json")) {
  return loadReassessment("IL", file);
}

export function loadMississippiBusinessSourceReassessment(file = path.join(APP_ROOT, "config", "state-business-source-assessments", "ms-2026-10-03.json")) {
  return loadReassessment("MS", file);
}
