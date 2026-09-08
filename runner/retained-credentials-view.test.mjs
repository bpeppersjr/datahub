import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRetainedCredentialsView as create } from './retained-credentials-view.mjs';
const available=()=>({status:'available',summary:{accepted_credential_rows:4,source_row_dispositions:{source_records:6,rejected_records:2},rows_without_reported_zip5:1,by_reported_state:[{state:'MN',credential_rows:3,percent_of_this_accepted_cohort:75},{state:'WI',credential_rows:1,percent_of_this_accepted_cohort:25}],by_reported_zip5:[{state:'MN',zip5:'00501',credential_rows:2},{state:'WI',zip5:'55001',credential_rows:1}],provenance:{observed_at:'2026-09-08T12:00:00.000Z',source_release_id:'fixture',app_receipt_sha256:'a'.repeat(64),app_receipt_path:'PRIVATE PATH'},business_name:'PRIVATE NAME'}});
test('retained view exposes aggregate state/ZIP counts with full cohort denominator and no private inputs',async()=>{
  const view=create({loader:async()=>available()});const all=await view.get();assert.equal(all.records.length,2);assert.equal(all.acceptedCohortRows,4);assert.equal(all.uniqueActiveBusinessCount,null);assert.equal(all.nationalReportingIntegrated,false);
  const mn=await view.get(new URLSearchParams('state=MN&limit=1'));assert.equal(mn.stateRows,3);assert.deepEqual(mn.records,[{state:'MN',zip5:'00501',credentialRows:2,percentOfCohort:50}]);assert.doesNotMatch(JSON.stringify(mn),/PRIVATE/);
  const empty=await view.get(new URLSearchParams('state=AL'));assert.equal(empty.stateRows,0);assert.deepEqual(empty.records,[]);
  const page=await view.get(new URLSearchParams('offset=1&limit=1'));assert.equal(page.records[0].state,'WI');
  all.availableStates.push('ZZ');await assert.rejects(view.get(new URLSearchParams('state=ZZ')),{statusCode:400});
});
test('retained view validates all filters before loading evidence',async()=>{
  let calls=0;const view=create({loader:async()=>{calls++;return available();}});
  for(const query of ['state=ZZ','state=mn','state=MN&state=WI','url=https://example.com','offset=-1','limit=101','limit=0','offset=1.5'])await assert.rejects(view.get(new URLSearchParams(query)),{statusCode:400});
  assert.equal(calls,0);
});
test('retained view distinguishes absent, unavailable and failed verification without manufacturing zeros',async()=>{
  for(const status of ['not-enrolled','unavailable']){const result=await create({loader:async()=>({status})}).get();assert.equal(result.available,false);assert.equal(result.acceptedCohortRows,undefined);}
  await assert.rejects(create({loader:async()=>{throw Error('PRIVATE');}}).get(),error=>error.statusCode===503&&!error.message.includes('PRIVATE'));
});
test('retained view coalesces concurrent verification but does not cache completed evidence',async()=>{
  let calls=0,release;const gate=new Promise(resolve=>{release=resolve;});const view=create({loader:async()=>{calls++;await gate;return available();}});
  const first=view.get(),second=view.get();release();await Promise.all([first,second]);assert.equal(calls,1);await view.get();assert.equal(calls,2);
});
test('retained panel uses authenticated cancellable reads and separate cohort wording',async()=>{
  const source=await readFile(new URL('../app/retained-credentials.tsx',import.meta.url),'utf8');
  assert.match(source,/runnerJson<View>/);assert.match(source,/new AbortController/);assert.match(source,/return\(\)=>controller.abort/);assert.match(source,/setView\(null\)/);assert.match(source,/!controller.signal.aborted/);
  assert.match(source,/not included in published national totals/);assert.match(source,/not shares of all U.S. businesses/);assert.match(source,/Registrations are not included/);assert.match(source,/No source download is started/);assert.doesNotMatch(source,/setInterval|localStorage|\/collections|dangerouslySetInnerHTML/);
});
