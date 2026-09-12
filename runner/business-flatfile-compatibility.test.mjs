import test from 'node:test';
import assert from 'node:assert/strict';
import { flatfileReportingCompatibility as compatibility } from './business-flatfile-compatibility.mjs';

const tn='tn-dhs-active-childcare-centers',oh='oh-dcy-publisher-open-childcare-centers';
function manifest(origin){return {dataset_id:'national-business-registry',status:'published-partial',publisher:{id:'national-business-registry',version:'2.15.0'},tn_childcare_origin:origin,
  dependencies:[{dataset_id:oh},...(origin===null?[]:[{dataset_id:tn,release_id:`tn-childcare-${origin==='recovered'?'recovered-':''}11111111-1111-4111-8111-111111111111`}])]};}
test('explicit 2.15 supports fresh/recovered/no-TN only with exact dependency origin',()=>{
  for(const origin of [null,'fresh','recovered']){const result=compatibility(manifest(origin));assert.equal(result.ohio,true);assert.equal(result.tennessee,origin!==null);assert.equal(result.tnFresh,origin==='fresh');}
  for(const mutate of [m=>m.publisher.version='2.15.1',m=>delete m.tn_childcare_origin,m=>m.dependencies=[],m=>m.dependencies.push(m.dependencies[0]),m=>m.publisher.id='other',m=>m.tn_childcare_origin='fresh']){
    const m=manifest('recovered');mutate(m);assert.throws(()=>compatibility(m));
  }
  const absent=manifest(null);absent.coverage={tn_childcare_center_sites:1};assert.throws(()=>compatibility(absent));
});
