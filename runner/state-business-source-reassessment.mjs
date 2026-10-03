import { readFile } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";

export const KANSAS_REASSESSMENT_ID = "ks-business-source-reassessment-2026-10-03";
export const DEFAULT_KANSAS_REASSESSMENT_PATH = path.join(APP_ROOT, "config", "state-business-source-assessments", "ks-2026-10-03.json");
const KEYS = ["schema_version","assessment_id","observed_at","state","supersedes_assessment_id","correction_reason","decision","connector_candidate","controls","access","fields","active_status_semantics","statewide_completeness","address_zip","automation_terms_fees","redistribution","temporal_refresh","citations","unresolved_gates","strongest_next_action"];
const plain = (value) => value && Object.getPrototypeOf(value) === Object.prototype;
const check = (condition, message = "Kansas business-source reassessment rejected.") => { if (!condition) throw new Error(message); };

export function validateKansasBusinessSourceReassessment(value) {
  check(plain(value) && JSON.stringify(Object.keys(value)) === JSON.stringify(KEYS));
  check(value.schema_version === "state-business-source-reassessment@1.0.0" && value.assessment_id === KANSAS_REASSESSMENT_ID && value.observed_at === "2026-10-03");
  check(JSON.stringify(value.state) === JSON.stringify({ abbreviation: "KS", name: "Kansas" }));
  check(value.supersedes_assessment_id === "ks-business-source-2026-09-22" && value.correction_reason.includes("UCC") && value.correction_reason.includes("corporate"));
  check(value.decision === "hold" && value.connector_candidate === false);
  check(JSON.stringify(value.controls) === JSON.stringify({ official_primary_sources_only:true,record_requests:0,downloads:0,accounts_created:0,terms_accepted:0,fees_paid:0,portal_automation:false,production_changes:0 }));
  check(value.access?.classification === "one-time-paid-request" && value.access.bulk.includes("$200") && value.access.bulk.includes("$150") && value.access.bulk.includes("INK"));
  check(!value.access.bulk.includes("$1,500") && value.automation_terms_fees.includes("No recurring corporate feed"));
  check(value.fields?.published === true && value.fields.summary.includes("Business Entity ID"));
  for (const key of ["active_status_semantics","statewide_completeness","address_zip","automation_terms_fees","redistribution","temporal_refresh","strongest_next_action"]) check(typeof value[key] === "string" && value[key].length > 20);
  check(Array.isArray(value.citations) && value.citations.length >= 4 && value.citations.every((citation) => plain(citation) && Object.keys(citation).length === 2 && /^https:\/\//.test(citation.url) && citation.evidence));
  check(value.citations.some(({url}) => url.endsWith("/RAR.pdf")) && value.citations.some(({url}) => url.includes("/ucc/")));
  check(Array.isArray(value.unresolved_gates) && value.unresolved_gates.length >= 5 && new Set(value.unresolved_gates).size === value.unresolved_gates.length);
  return structuredClone(value);
}

export async function loadKansasBusinessSourceReassessment(file = DEFAULT_KANSAS_REASSESSMENT_PATH) {
  return validateKansasBusinessSourceReassessment(JSON.parse(await readFile(file, "utf8")));
}
