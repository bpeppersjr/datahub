import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { APP_ROOT } from './paths.mjs';

export const EXISTING_SOURCE_STATES=Object.freeze(['CO','CT','DE','FL','IA','NY','OR','PA']);
const KEYS=['schema_version','assessment_id','observed_at','state','decision','controls','source','access','fields','status_semantics','address_zip','temporal','authorization','citations','unresolved_gates','strongest_next_action'];
const check=(value,message='Existing governed state-source assessment rejected.')=>{if(!value)throw Error(message);};
const plain=value=>value&&Object.getPrototypeOf(value)===Object.prototype;

export function validateExistingGovernedSourceAssessment(value){
  check(plain(value)&&JSON.stringify(Object.keys(value))===JSON.stringify(KEYS));
  check(value.schema_version==='state-business-source-existing-assessment@1.0.0'&&value.observed_at==='2026-09-22');
  check(plain(value.state)&&EXISTING_SOURCE_STATES.includes(value.state.abbreviation)&&typeof value.state.name==='string');
  check(value.assessment_id===`${value.state.abbreviation.toLowerCase()}-existing-governed-source-2026-09-22`&&value.decision==='existing-governed-source');
  check(JSON.stringify(value.controls)===JSON.stringify({official_primary_sources_only:true,record_requests:0,downloads:0,accounts_created:0,terms_accepted:0,fees_paid:0,portal_automation:false,production_changes:0}));
  check(plain(value.source)&&typeof value.source.publisher==='string'&&typeof value.source.dataset_id==='string'&&typeof value.source.retained_release_id==='string');
  check(plain(value.access)&&['anonymous-api','public-sftp'].includes(value.access.classification)&&typeof value.access.summary==='string');
  for(const key of ['fields','status_semantics','address_zip','temporal'])check(typeof value[key]==='string'&&value[key].length>40);
  check(JSON.stringify(value.authorization)===JSON.stringify({retained_release_reuse_eligible:true,fresh_acquisition_authorized:false,autonomous_acquisition_authorized:false,production_pointer_change_authorized:false,active_business_claim_authorized:false}));
  check(Array.isArray(value.citations)&&value.citations.length>=2&&value.citations.every(row=>plain(row)&&Object.keys(row).length===2&&/^https:\/\//.test(row.url)&&typeof row.evidence==='string'));
  check(Array.isArray(value.unresolved_gates)&&value.unresolved_gates.length>=4&&new Set(value.unresolved_gates).size===value.unresolved_gates.length&&typeof value.strongest_next_action==='string'&&value.strongest_next_action.length>40);
  return structuredClone(value);
}

export async function loadExistingGovernedSourceAssessmentWave({root=APP_ROOT}={}){
  const states=[];
  for(const code of EXISTING_SOURCE_STATES){const file=path.join(root,'config/state-business-source-existing-assessments',`${code.toLowerCase()}-2026-09-22.json`);states.push(validateExistingGovernedSourceAssessment(JSON.parse(await readFile(file,'utf8'))));}
  check(new Set(states.map(row=>row.state.abbreviation)).size===EXISTING_SOURCE_STATES.length);
  return{schema_version:'state-business-source-existing-wave@1.0.0',observed_at:'2026-09-22',scope:[...EXISTING_SOURCE_STATES],decisions:{existing_governed_source:8},controls:{downloads:0,record_requests:0,accounts_created:0,terms_accepted:0,fees_paid:0,production_changes:0},states};
}
