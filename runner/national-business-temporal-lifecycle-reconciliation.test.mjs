import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {reconcileTemporalLifecycle,verifyNationalBusinessTemporalLifecycleReconciliation} from './national-business-temporal-lifecycle-reconciliation.mjs';
import {APP_ROOT} from './paths.mjs';

const classifications=[...Array(22).fill('source-defined-current-membership'),...Array(7).fill('non-active-reporting-membership'),'annual-aggregate'];
function fixture(){
 const temporalRows=classifications.map((classification,index)=>({source_key:`source_${index}`,profile_source_id:index<15?`profile_${index}`:null,source_release_id:`release_${index}`,policy_sha256:`${index}`.padStart(64,'0'),classification,source_status_term:index===0?'active cohort':'term',as_of_or_observed_from:index===0?'2026-08-15T15:37:22.000Z':null,as_of_or_observed_through:null,current_operations_verified:false,complete_all_businesses:false,broad_state_dc_source_defined_active:index>0&&index<12}));
 temporalRows[0]={...temporalRows[0],source_key:'la',profile_source_id:'la-profile',source_release_id:'la-release',policy_sha256:'a'.repeat(64)};
 const sources=temporalRows.slice(0,15).map((row,index)=>({source_id:row.profile_source_id,source_key:row.source_key,source_release_id:row.source_release_id,policy_sha256:row.policy_sha256,membership_class:index===0?'unknown-source-status':row.classification,lifecycle_evidence:index===0?'unknown':'source-defined-current'}));
 const expected_profile_counts=Object.fromEntries(sources.map((source,index)=>[source.source_id,index===0?633232:1]));
 const expected={temporal_rows:30,lifecycle_bound_sources:15,classification_matches:14,classification_mismatches:1,mismatch_profiles:633232,effective_classification_counts:{'source-defined-current-membership':21,'non-active-reporting-membership':7,'annual-aggregate':1,'unknown-source-status':1},broad_state_dc_source_defined_active:11,broad_state_dc_total:51,verified_current_complete_jurisdictions:0,verified_current_complete_total:51,active_business_count:null,completeness_percentage:null};
 return{temporalRows,taxonomy:{sources,expected_profile_counts},expected,losAngeles:{source_key:'la',profile_source_id:'la-profile',source_release_id:'la-release',profile_count:633232}};
}

test('full retained reconciliation verifies exact pins and closed claims',async()=>{const result=await verifyNationalBusinessTemporalLifecycleReconciliation();assert.equal(result.verified,true);assert.equal(result.summary.temporal_rows,30);assert.equal(result.mismatch.profile_count,633232);assert.equal(result.mismatch.effective_profile_classification,'unknown-source-status');assert.equal(result.claims.current_operation_verified,false);});
test('reconciliation preserves the source cohort label while lifecycle keeps LA unknown',()=>{const result=reconcileTemporalLifecycle(fixture());assert.equal(result.bindings[0].source_cohort_classification,'source-defined-current-membership');assert.equal(result.bindings[0].effective_profile_classification,'unknown-source-status');assert.equal(result.bindings[0].as_of_or_observed_from,'2026-08-15T15:37:22.000Z');assert.equal(result.bindings[0].current_operations_verified,false);assert.deepEqual(result.summary.effective_classification_counts,fixture().expected.effective_classification_counts);});
test('duplicate, missing and count drift fail closed',()=>{const duplicate=fixture();duplicate.temporalRows[1].source_key=duplicate.temporalRows[0].source_key;assert.throws(()=>reconcileTemporalLifecycle(duplicate),/unique temporal source/);const missing=fixture();missing.temporalRows.pop();assert.throws(()=>reconcileTemporalLifecycle(missing),/temporal row count/);const drift=fixture();drift.taxonomy.expected_profile_counts['la-profile']=633231;assert.throws(()=>reconcileTemporalLifecycle(drift),/mismatch conservation/);});
test('taxonomy and classification tampering fail closed',()=>{const taxonomy=fixture();taxonomy.taxonomy.sources[0].membership_class='source-defined-current-membership';assert.throws(()=>reconcileTemporalLifecycle(taxonomy),/mismatch conservation/);const binding=fixture();binding.taxonomy.sources[0].policy_sha256='b'.repeat(64);assert.throws(()=>reconcileTemporalLifecycle(binding),/exact lifecycle binding/);const current=fixture();current.temporalRows[0].current_operations_verified=true;assert.throws(()=>reconcileTemporalLifecycle(current),/closed temporal claims/);});
test('pinned input byte tampering fails closed',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'temporal-lifecycle-reconciliation-'));
 try{
  const configPath='config/datasets/national-business-temporal-lifecycle-reconciliation.json',config=JSON.parse(await fs.readFile(path.join(APP_ROOT,configPath),'utf8'));
  const paths=[configPath,config.temporal.manifest_path,config.temporal.artifact_path,config.lifecycle.manifest_path,config.taxonomy.path,config.los_angeles.pointer_path,config.los_angeles.manifest_path];
  for(const relative of paths){const destination=path.join(temp,...relative.split('/'));await fs.mkdir(path.dirname(destination),{recursive:true});await fs.copyFile(path.join(APP_ROOT,...relative.split('/')),destination);}
  await fs.appendFile(path.join(temp,...config.taxonomy.path.split('/')),' ');
  await assert.rejects(()=>verifyNationalBusinessTemporalLifecycleReconciliation({root:temp}),/hash pin/);
 }finally{const resolved=path.resolve(temp);assert.ok(resolved.startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(resolved,{recursive:true,force:true});}
});
test('an already-aborted verification does not read retained inputs',async()=>{const controller=new AbortController();controller.abort();await assert.rejects(()=>verifyNationalBusinessTemporalLifecycleReconciliation({signal:controller.signal}),error=>error?.name==='AbortError');});
