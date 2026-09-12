import path from 'node:path';
import {isDeepStrictEqual as same} from 'node:util';
import {mnSelectionReadJson as readJson} from './mn-construction-retained-selection.mjs';
import {inspectOkZipBatch} from './ok-childcare-zip-batch.mjs';
import {okRetainedHash as hash} from './ok-childcare-retained-contract.mjs';
const fail=()=>{throw Error('Oklahoma batch status projection rejected.');};
const count=n=>Number.isSafeInteger(n)&&n>=0;
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
function plain(value){if(!value||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).some(k=>typeof k!=='string'||!Object.hasOwn(Object.getOwnPropertyDescriptor(value,k),'value')))fail();}
function dense(value){if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length>100000||Reflect.ownKeys(value).length!==value.length+1)fail();for(let i=0;i<value.length;i++)if(!Object.hasOwn(Object.getOwnPropertyDescriptor(value,String(i))??{},'value'))fail();}
const zip=v=>typeof v==='string'&&/^\d{5}$/.test(v)&&v!=='00000';
const claims={statewide_completeness:'unknown',selected_search_completeness:'unknown',public_export_authorized:false,automatic_retry_authorized:false,unique_business_count:null};

/** Structural projection only; source verification belongs to the enclosing inspector. */
export function projectOkChildcareBatchStatus(state,plannedZip5){
 plain(state);dense(plannedZip5);dense(state.completed);dense(state.pending_zip5);dense(state.reused);
 if(!sha(state.plan_sha256)||!['native-fetch','synthetic-test-transport'].includes(state.mode)
  ||!['inspection-required','incomplete','completed-internal-candidates'].includes(state.status)
  ||plannedZip5.some(v=>!zip(v))||new Set(plannedZip5).size!==plannedZip5.length)fail();
 const remaining=new Set(plannedZip5);let accepted=0,rejected=0,acceptedRows=0,reusedRows=0;
 const completedZip=[];
 for(const row of state.completed){plain(row);if(!remaining.delete(row.zip5)||!sha(row.intent_sha256)||!sha(row.result_sha256))fail();completedZip.push(row.zip5);
  if(row.status==='accepted-internal-source-candidates'){if(!count(row.rows)||row.rows>100)fail();accepted++;acceptedRows+=row.rows;}
  else if(row.status==='rejected'&&row.rows===null)rejected++;else fail();
 }
 for(const value of state.pending_zip5)if(!zip(value)||!remaining.delete(value))fail();
 const unresolved=[...remaining];
 // Verified journals are an issued prefix followed by never-issued queries.
 if(!same(plannedZip5,[...completedZip,...unresolved,...state.pending_zip5])||rejected>1
  ||rejected&&state.completed.at(-1)?.status!=='rejected')fail();
 const expected=rejected||unresolved.length?'inspection-required':state.pending_zip5.length?'incomplete':'completed-internal-candidates';
 if(state.status!==expected)fail();
 const reused=new Set();for(const row of state.reused){plain(row);if(!zip(row.zip5)||remaining.has(row.zip5)||plannedZip5.includes(row.zip5)||reused.has(row.zip5)||!count(row.source_rows))fail();reused.add(row.zip5);reusedRows+=row.source_rows;}
 if(!count(acceptedRows)||!count(reusedRows))fail();
 return {schema_version:'ok-childcare-batch-status@1.0.0',available:true,verification_mode:'structural-projection-only',status:state.status,
  plan_sha256:state.plan_sha256,source_mode:state.mode,planned_new_queries:plannedZip5.length,
  terminal_queries:state.completed.length,accepted_queries:accepted,rejected_queries:rejected,
  unresolved_intent_queries:unresolved.length,never_issued_queries:state.pending_zip5.length,
  accepted_query_source_rows:acceptedRows,reused_baseline_queries:state.reused.length,reused_baseline_source_rows:reusedRows,
  accepted_rows_unit:'sum-of-accepted-query-source-rows-not-deduplicated-businesses',
  query_conservation:'planned_new = accepted + rejected + unresolved_intent + never_issued; baseline reuse is separate',...claims};
}

/** Read-only wrapper; current-pins failures do not authorize historical bypass or retry. */
export async function inspectOkChildcareBatchStatus(outputRoot,{signal}={}){
 signal?.throwIfAborted();
 if(typeof outputRoot!=='string'||outputRoot!==path.resolve(outputRoot))fail();
 try{
  // Existing inspector owns root admissibility, journal replay and current implementation pins.
  const state=await inspectOkZipBatch(outputRoot,{signal});
  const meter={},saved=await readJson(path.join(outputRoot,'plan.json'),7000000,signal,meter);
  if(saved.plan_sha256!==state.plan_sha256||hash(JSON.stringify(saved.plan))!==state.plan_sha256||saved.mode!==state.mode)fail();
  const projected=projectOkChildcareBatchStatus(state,saved.plan.zip5);
  const after={},again=await readJson(path.join(outputRoot,'plan.json'),7000000,signal,after);
  if(after.sha256!==meter.sha256||!same(again,saved))fail();signal?.throwIfAborted();
  return {...projected,verification_mode:'current-pinned-retained-inspector',plan_file_sha256:meter.sha256};
 }catch(error){if(signal?.aborted)throw error;
  return {schema_version:'ok-childcare-batch-status@1.0.0',available:false,status:'inspection-required',verification_mode:'unavailable',
   reason:'current-pinned-retained-inspection-not-verified',planned_new_queries:null,terminal_queries:null,accepted_queries:null,rejected_queries:null,
   unresolved_intent_queries:null,never_issued_queries:null,accepted_query_source_rows:null,reused_baseline_queries:null,reused_baseline_source_rows:null,...claims};
 }
}
