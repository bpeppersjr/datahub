import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {projectOkChildcareBatchStatus as project,inspectOkChildcareBatchStatus as inspect} from './ok-childcare-batch-status.mjs';
const roster=['66778','73001','73002'];
const terminal=(zip5,status='accepted-internal-source-candidates',rows=0)=>({zip5,status,rows,intent_sha256:'a'.repeat(64),result_sha256:'b'.repeat(64)});
const fixture=()=>({mode:'synthetic-test-transport',plan_sha256:'c'.repeat(64),status:'inspection-required',completed:[terminal('66778','rejected',null)],pending_zip5:['73001','73002'],reused:[{zip5:'73102',source_rows:4,evidence:{private:'NOT OUTPUT'}}]});
test('rejected terminal record is not successful acquisition; baseline reuse is separate',()=>{
 const result=project(fixture(),roster);assert.equal(result.terminal_queries,1);assert.equal(result.accepted_queries,0);assert.equal(result.rejected_queries,1);
 assert.equal(result.never_issued_queries,2);assert.equal(result.reused_baseline_queries,1);assert.equal(result.reused_baseline_source_rows,4);assert.equal(result.accepted_query_source_rows,0);
 assert.equal(result.planned_new_queries,result.accepted_queries+result.rejected_queries+result.unresolved_intent_queries+result.never_issued_queries);assert.doesNotMatch(JSON.stringify(result),/NOT OUTPUT|73102|66778/);
 assert.equal(result.verification_mode,'structural-projection-only');
});
test('intent without terminal result is unresolved, not pending or accepted',()=>{
 const state=fixture();state.completed=[];const result=project(state,roster);assert.equal(result.unresolved_intent_queries,1);assert.equal(result.terminal_queries,0);assert.equal(result.never_issued_queries,2);
});
test('accepted empty result counts as one query, not statewide zero; completion is scoped',()=>{
 const state=fixture();state.status='completed-internal-candidates';state.pending_zip5=[];state.completed=roster.map(zip=>terminal(zip));
 const result=project(state,roster);assert.equal(result.accepted_queries,3);assert.equal(result.accepted_query_source_rows,0);assert.equal(result.statewide_completeness,'unknown');assert.equal(result.unique_business_count,null);
});
test('incomplete issued prefix and fixed conservation preserve all planned queries',()=>{
 const state=fixture();state.status='incomplete';state.completed=[terminal('66778',undefined,2)];const result=project(state,roster);assert.equal(result.accepted_queries,1);assert.equal(result.accepted_query_source_rows,2);assert.equal(result.unresolved_intent_queries,0);
});
test('duplicates, overlap, invalid status/counts and alternate array iteration reject',()=>{
 for(const mutate of [s=>s.completed.push(s.completed[0]),s=>s.pending_zip5.push('66778'),s=>s.status='completed-internal-candidates',s=>s.completed[0].rows=0,s=>s.reused[0].zip5='66778',s=>s.reused[0].source_rows=-1]){const state=fixture();mutate(state);assert.throws(()=>project(state,roster));}
 class Other extends Array{*[Symbol.iterator](){}}
 assert.throws(()=>project(fixture(),Other.from(roster)));assert.throws(()=>project(fixture(),new Array(3)));
});
test('pre-abort and unsupported CLI arguments do not start inspection',async()=>{
 const controller=new AbortController();controller.abort();await assert.rejects(inspect('unused',{signal:controller.signal}),{name:'AbortError'});
 await assert.rejects(promisify(execFile)(process.execPath,[fileURLToPath(new URL('../scripts/inspect-ok-childcare-batch-status.mjs',import.meta.url)),'--run'],{windowsHide:true,timeout:10000}),error=>{assert.equal(error.code,1);assert.equal(error.stdout,'');return true;});
});
