import { readFile } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { APP_ROOT } from "./paths.mjs";

export const UTAH_REASSESSMENT_ID = "ut-business-source-reassessment-2026-10-03";
export const WASHINGTON_REASSESSMENT_ID = "wa-business-source-reassessment-2026-10-03";
const STATES = { UT: { name: "Utah", id: UTAH_REASSESSMENT_ID, classification: "paid-subscriber-bulk", hosts: ["secure.utah.gov", "www.utah.gov"] }, WA: { name: "Washington", id: WASHINGTON_REASSESSMENT_ID, classification: "bounded-search-export", hosts: ["www.sos.wa.gov", "data.wa.gov", "dor.wa.gov"] } };
const KEYS = ["schema_version","assessment_id","observed_at","state","supersedes_assessment_id","reassessment_reason","decision","connector_candidate","controls","authority","access","fields","active_status_semantics","statewide_completeness","address_zip","automation_terms_fees","redistribution","temporal_refresh","citations","unresolved_gates","strongest_next_action"];
const CONTROLS = {official_primary_sources_only:true,record_requests:0,downloads:0,accounts_created:0,terms_accepted:0,fees_paid:0,contacts_made:0,portal_automation:false,production_changes:0};
const AUTHORITY = {acquisition:false,network_execution:false,account_creation:false,payment:false,terms_acceptance:false,source_contact:false,pointer_changes:false,national_admission:false};
const plain = value => value && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys) => plain(value) && isDeepStrictEqual(Object.keys(value).sort(), [...keys].sort());
const check = condition => { if (!condition) throw Error("Utah/Washington business-source reassessment rejected."); };

export function validateUtahWashingtonBusinessSourceReassessment(value) {
  check(exact(value, KEYS));
  const state = STATES[value.state?.abbreviation];
  check(state && isDeepStrictEqual(value.state, { abbreviation: value.state.abbreviation, name: state.name }));
  check(value.schema_version === "state-business-source-reassessment@1.0.0" && value.assessment_id === state.id && value.observed_at === "2026-10-03");
  check(value.supersedes_assessment_id === `${value.state.abbreviation.toLowerCase()}-business-source-2026-09-22`);
  check(value.decision === "hold" && value.connector_candidate === false && isDeepStrictEqual(value.controls, CONTROLS) && isDeepStrictEqual(value.authority, AUTHORITY));
  check(exact(value.access, ["classification", "bulk", "api", "search"]) && value.access.classification === state.classification);
  for (const key of ["bulk", "api", "search"]) check(typeof value.access[key] === "string" && value.access[key].length > 40);
  check(exact(value.fields, ["published", "summary"]) && value.fields.published === (value.state.abbreviation === "UT") && typeof value.fields.summary === "string" && value.fields.summary.length > 80);
  for (const key of ["reassessment_reason","active_status_semantics","statewide_completeness","address_zip","automation_terms_fees","redistribution","temporal_refresh","strongest_next_action"]) check(typeof value[key] === "string" && value[key].length > 40);
  check(value.active_status_semantics.includes("not proof of current business operation"));
  check(Array.isArray(value.citations) && value.citations.length >= 5 && value.citations.every(c => { if (!exact(c,["url","evidence"]) || typeof c.evidence !== "string" || c.evidence.length < 20) return false; try { const url = new URL(c.url); return url.protocol === "https:" && state.hosts.includes(url.hostname) && !url.username && !url.password; } catch { return false; } }));
  check(Array.isArray(value.unresolved_gates) && value.unresolved_gates.length >= 10 && new Set(value.unresolved_gates).size === value.unresolved_gates.length && value.unresolved_gates.every(gate => typeof gate === "string" && gate.length > 3));
  if (value.state.abbreviation === "UT") {
    check(value.access.bulk.includes("$0.01 per record") && value.access.bulk.includes("$125 annually") && value.access.bulk.includes("subscribers only"));
    check(value.fields.summary.includes("does not parse or reproducibly extract") && value.redistribution.includes("admission-ineligible"));
    check(value.citations.some(c => c.url === "https://secure.utah.gov/datarequest/businesses/listExample.html"));
  } else {
    check(value.access.api.includes("columns: []") && value.access.api.includes("href") && value.automation_terms_fees.includes("noncommercial-purpose declaration"));
    check(value.citations.some(c => c.url === "https://data.wa.gov/api/views/4wur-kfnr") && value.citations.some(c => c.url === "https://dor.wa.gov/contact/public-records"));
  }
  return structuredClone(value);
}

async function load(file, state) {
  const value = validateUtahWashingtonBusinessSourceReassessment(JSON.parse(await readFile(file, "utf8")));
  check(value.state.abbreviation === state);
  return value;
}
export function loadUtahBusinessSourceReassessment(file = path.join(APP_ROOT,"config/state-business-source-assessments/ut-2026-10-03.json")) { return load(file, "UT"); }
export function loadWashingtonBusinessSourceReassessment(file = path.join(APP_ROOT,"config/state-business-source-assessments/wa-2026-10-03.json")) { return load(file, "WA"); }
