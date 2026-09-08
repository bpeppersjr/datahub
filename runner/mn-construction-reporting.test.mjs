import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateMnConstructionReporting as aggregate, mnReportingObservation } from './mn-construction-reporting.mjs';
test('MN reporting preserves original selection observation separately from later transport start',()=>{
  assert.deepEqual(mnReportingObservation({context:{observedAt:'2026-09-08T12:00:00.000Z'}},{started_at:'2026-09-08T12:01:00.000Z'}),{observed_at:'2026-09-08T12:00:00.000Z',transport_started_at:'2026-09-08T12:01:00.000Z'});
});
const row=(state='MN',zip='55001',zip4=null)=>({dataset_id:'mn-dli-construction-business-credentials',export_policy:'local-review-only',credential:{category:'residential-building-contractor',active_business_verified:false},quality:{matching_eligible:false,physical_site_eligible:false},reported_address:{state,zip_code:zip,zip4},business_name:'PRIVATE NAME'});
test('MN reporting denominators describe credential rows and preserve reported ZIP gaps',async()=>{
  const result=await aggregate([row(),row('WI','00501','0012'),row('WI',null),row('foreign',null)]);
  assert.equal(result.accepted_credential_rows,4);assert.equal(result.rows_without_reported_zip5,2);assert.equal(result.rows_with_zip4,1);
  assert.deepEqual(result.by_reported_state,[{state:'MN',credential_rows:1,percent_of_this_accepted_cohort:25},{state:'UNRESOLVED',credential_rows:1,percent_of_this_accepted_cohort:25},{state:'WI',credential_rows:2,percent_of_this_accepted_cohort:50}]);
  assert.deepEqual(result.by_reported_zip5,[{state:'MN',zip5:'55001',credential_rows:1},{state:'WI',zip5:'00501',credential_rows:1}]);
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE|business_name|foreign/);
});
test('MN reporting rejects malformed postal fields and unsupported record claims',async()=>{
  for(const value of [row('MN','55001-0012'),row('MN','00000'),row('MN',null,'0012'),{...row(),export_policy:'public'}])await assert.rejects(aggregate([value]));
  const invalid=row();invalid.credential.active_business_verified=true;await assert.rejects(aggregate([invalid]));
});
test('MN reporting empty and cancelled inputs do not invent population counts',async()=>{
  assert.deepEqual((await aggregate([])).by_reported_state,[]);
  await assert.rejects(aggregate([row()],{signal:AbortSignal.abort()}));
});
