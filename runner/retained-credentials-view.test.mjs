import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRetainedCredentialsView } from './retained-credentials-view.mjs';
const create=options=>createRetainedCredentialsView({publicationLoader:async()=>({status:'not-enrolled',included:null,credentialRows:null}),...options});
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
  for(const query of ['state=ZZ','state=mn','state=MN&state=WI','url=https://example.com','offset=-1','limit=101','limit=0','offset=1.5','view=unknown','view=categories&category=unknown','category=residential-roofer','view=categories&category=residential-roofer&category=residential-remodeler'])await assert.rejects(view.get(new URLSearchParams(query)),{statusCode:400});
  assert.equal(calls,0);
});

const coverageAvailable=()=>({status:'available',summary:available().summary,evidence:{reportingReleaseId:'fixture-coverage',reportingManifestSha256:'b'.repeat(64)},
  coverage:{allAcceptedCohortRows:4,national50DcRows:4,outside50DcOrUnresolvedRows:0,missingZip5Rows:1,percentageDenominators:{stateShareOfCategory:'all accepted category rows in 50 states + DC'},
    states:[{state:'MN',credentialRows:3,stateShareOfNationalCohort:75,cohortObservation:'observed-positive',businessCoverage:'unknown',categories:[{category:'residential-building-contractor',credentialRows:2,categoryWithinState:2/3*100,stateShareOfCategory:2/3*100},{category:'residential-remodeler',credentialRows:1,categoryWithinState:1/3*100,stateShareOfCategory:100}]},
      {state:'WI',credentialRows:1,stateShareOfNationalCohort:25,cohortObservation:'observed-positive',businessCoverage:'unknown',categories:[{category:'residential-building-contractor',credentialRows:1,categoryWithinState:100,stateShareOfCategory:1/3*100},{category:'residential-remodeler',credentialRows:0,categoryWithinState:0,stateShareOfCategory:0}]}]}});

test('credential category view filters without shrinking source denominators or exposing private data',async()=>{
  const view=create({coverageLoader:async()=>coverageAvailable(),loader:async()=>{throw Error('Postal loader must not run');}});
  const all=await view.get(new URLSearchParams('view=categories'));assert.equal(all.total,4);assert.equal(all.records[0].state,'MN');assert.equal(all.national50DcRows,4);
  const selected=await view.get(new URLSearchParams('view=categories&state=WI&category=residential-building-contractor'));
  assert.equal(selected.total,1);assert.equal(selected.records[0].categoryWithinState,100);assert.equal(selected.records[0].stateShareOfCategory,1/3*100);
  assert.equal(selected.acceptedCohortRows,4);assert.equal(selected.stateRows,1);assert.equal(selected.nationalReportingIntegrated,false);
  assert.doesNotMatch(JSON.stringify(selected),/PRIVATE|business_name|app_receipt_path/);
  const page=await view.get(new URLSearchParams('view=categories&offset=1&limit=1'));assert.equal(page.records.length,1);assert.equal(page.total,4);
});

test('credential category view coalesces verification and never falls back to a failed source',async()=>{
  let calls=0,release;const gate=new Promise(resolve=>{release=resolve;});
  const view=create({coverageLoader:async()=>{calls++;await gate;return coverageAvailable();}});
  const a=view.get(new URLSearchParams('view=categories')),b=view.get(new URLSearchParams('view=categories'));release();await Promise.all([a,b]);assert.equal(calls,1);
  await view.get(new URLSearchParams('view=categories'));assert.equal(calls,2);
  for(const status of ['not-enrolled','unavailable']){const result=await create({coverageLoader:async()=>({status})}).get(new URLSearchParams('view=categories'));assert.equal(result.available,false);assert.equal(result.national50DcRows,undefined);}
  await assert.rejects(create({coverageLoader:async()=>{throw Error('PRIVATE');}}).get(new URLSearchParams('view=categories')),error=>error.statusCode===503&&!error.message.includes('PRIVATE'));
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
  assert.doesNotMatch(source,/not included in published national totals/);assert.match(source,/downstreamPublication\?\.included===true/);assert.match(source,/Downstream publication: Unknown/);assert.match(source,/Publication proof is metadata-only/);assert.match(source,/historical flag is unchanged/);assert.match(source,/not shares of all U.S. businesses/);assert.match(source,/Registrations are not included/);assert.match(source,/No source download is started/);assert.doesNotMatch(source,/setInterval|localStorage|\/collections|dangerouslySetInnerHTML/);
  assert.match(source,/Category share % \(50 states \+ D.C.\)/);assert.match(source,/Within-state %/);assert.match(source,/setCategory\(event.target.value\);setOffset\(0\)/);assert.match(source,/setMode\(event.target.value\);setOffset\(0\)/);
});

test('downstream publication stays separate from historical source flags and rechecks drift for both views',async()=>{
  const publication={status:'verified-downstream-publication',included:true,credentialRows:4,sourceObservedAt:available().summary.provenance.observed_at,sourceReleaseId:'fixture',sourceAppReceiptSha256:'a'.repeat(64),reportingReleaseId:'fixture-coverage',reportingManifestSha256:'b'.repeat(64),historicalSourceNationalReportingIntegrated:false,sourceReplayThisRead:false,credentialArtifactRehashedThisRead:false};
  let current=publication,calls=0;
  const view=create({loader:async()=>available(),coverageLoader:async()=>coverageAvailable(),publicationLoader:async()=>{calls++;return structuredClone(current);}});
  for(const mode of ['postal','categories']) {
    const response=await view.get(new URLSearchParams('view='+mode));assert.equal(response.downstreamPublication.included,true);
    assert.equal(response.nationalReportingIntegrated,false);assert.equal(response.uniqueActiveBusinessCount,null);assert.equal(response.physicalSiteCount,null);
    assert.equal(response.downstreamPublication.credentialArtifactRehashedThisRead,false);
  }
  assert.equal(calls,2);
  current={...publication,sourceAppReceiptSha256:'c'.repeat(64)};
  for(const mode of ['postal','categories']) {
    const response=await view.get(new URLSearchParams('view='+mode));
    assert.equal(response.downstreamPublication.included,null);assert.equal(response.downstreamPublication.status,'evidence-unverified');
  }
  current={...publication,status:'evidence-unverified',included:null,credentialRows:null};
  const drift=await view.get();assert.equal(drift.available,true);assert.equal(drift.acceptedCohortRows,4);assert.equal(drift.downstreamPublication.included,null);
  for(const changed of [{credentialRows:5},{sourceObservedAt:'2026-09-09T00:00:00.000Z'},{sourceReleaseId:'other'},{reportingManifestSha256:'c'.repeat(64)}]) {
    current={...publication,...changed};const response=await view.get(new URLSearchParams('view=categories'));
    assert.equal(response.downstreamPublication.status,'evidence-unverified');assert.equal(response.downstreamPublication.included,null);assert.equal(response.downstreamPublication.credentialRows,null);
  }
  const failure=await create({loader:async()=>available(),publicationLoader:async()=>{throw Error('PRIVATE');}}).get();
  assert.equal(failure.available,true);assert.equal(failure.downstreamPublication.status,'evidence-unavailable');assert.doesNotMatch(JSON.stringify(failure),/PRIVATE/);
  const absent=await create({loader:async()=>({status:'unavailable'})}).get();assert.equal(absent.downstreamPublication,null);
});
