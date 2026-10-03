import { readFile } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";

export const ARKANSAS_REASSESSMENT_ID = "ar-business-source-reassessment-2026-10-03";
export const DEFAULT_ARKANSAS_REASSESSMENT_PATH = path.join(APP_ROOT, "config", "state-business-source-assessments", "ar-2026-10-03.json");
const KEYS = ["schema_version","assessment_id","observed_at","state","supersedes_assessment_id","reassessment_reason","decision","connector_candidate","controls","access","fields","active_status_semantics","statewide_completeness","address_zip","automation_terms_fees","redistribution","temporal_refresh","citations","unresolved_gates","strongest_next_action"];
const CONTROL = {official_primary_sources_only:true,record_requests:0,downloads:0,accounts_created:0,terms_accepted:0,fees_paid:0,contacts_made:0,portal_automation:false,production_changes:0};
const plain=value=>value&&Object.getPrototypeOf(value)===Object.prototype;
const check=(condition,message="Arkansas business-source reassessment rejected.")=>{if(!condition)throw Error(message);};

export function validateArkansasBusinessSourceReassessment(value){
 check(plain(value)&&JSON.stringify(Object.keys(value))===JSON.stringify(KEYS));
 check(value.schema_version==="state-business-source-reassessment@1.0.0"&&value.assessment_id===ARKANSAS_REASSESSMENT_ID&&value.observed_at==="2026-10-03");
 check(JSON.stringify(value.state)===JSON.stringify({abbreviation:"AR",name:"Arkansas"})&&value.supersedes_assessment_id==="state-business-source-ar-20260922-v1");
 check(value.decision==="hold"&&value.connector_candidate===false&&JSON.stringify(value.controls)===JSON.stringify(CONTROL));
 check(value.access?.classification==="paid-subscriber-bulk-or-list-builder"&&value.access.bulk.includes("$2,000 per month")&&value.access.bulk.includes("daily, weekly, bi-weekly, and monthly")&&value.access.list_builder.includes("$0.10 per record")&&value.access.list_builder.includes("$10 minimum")&&value.access.subscriber_account.includes("$150 per year")&&value.access.subscriber_account.includes("pre-activation"));
 check(value.fields?.published===false&&value.fields.summary.includes("No public bulk schema")&&value.fields.summary.includes("Registered-agent and natural-person fields must be excluded"));
 for(const key of ["reassessment_reason","active_status_semantics","statewide_completeness","address_zip","automation_terms_fees","redistribution","temporal_refresh","strongest_next_action"])check(typeof value[key]==="string"&&value[key].length>40);
 check(value.active_status_semantics.includes("not proof of current business operation")&&value.statewide_completeness.includes("not established")&&value.address_zip.includes("represented as a verified physical site"));
 check(value.strongest_next_action.includes("unsigned product-specific terms")&&value.strongest_next_action.includes("zero-row person-free schema")&&value.strongest_next_action.includes("before any payment or enrollment"));
 check(Array.isArray(value.citations)&&value.citations.length===5&&value.citations.every(citation=>plain(citation)&&JSON.stringify(Object.keys(citation))===JSON.stringify(["url","evidence"])&&/^https:\/\//.test(citation.url)&&citation.evidence));
 check(value.citations.some(({url})=>url==="https://cdb-manager.ark.org/login")&&value.citations.some(({url})=>url.includes("DoingBusinessInArkansas2025.pdf"))&&value.citations.some(({url})=>url.includes("sublegal_liab.html")));
 check(Array.isArray(value.unresolved_gates)&&value.unresolved_gates.length===11&&new Set(value.unresolved_gates).size===value.unresolved_gates.length);
 return structuredClone(value);
}

export async function loadArkansasBusinessSourceReassessment(file=DEFAULT_ARKANSAS_REASSESSMENT_PATH){return validateArkansasBusinessSourceReassessment(JSON.parse(await readFile(file,"utf8")));}
