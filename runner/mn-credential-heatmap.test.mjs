import test from 'node:test';
import assert from 'node:assert/strict';
import {MN_CONSTRUCTION_COLUMNS} from './mn-construction-preflight.mjs';
import {normalizeMnConstructionRecord} from './mn-construction-normalization.mjs';
import {projectMnConstructionCredential} from './mn-construction-credential-reporting.mjs';
import {aggregateMnCredentialHeatmap as aggregate,buildMnCredentialHeatmap as build,selectMnCredentialHeatmap as select} from './mn-credential-heatmap.mjs';
function fixture(){return [{St:'MN',Zip:'00501-0012'},{St:'WI',Zip:'00501'},{St:'WI',Zip:''},{St:'MN',Zip:'99999',Lic_Number:'RR123456'}].map((changes,i)=>projectMnConstructionCredential(normalizeMnConstructionRecord({...Object.fromEntries(MN_CONSTRUCTION_COLUMNS.map(k=>[k,''])),Bus_Pers:'Business',Lic_Number:'BC123456',Status:'Issued',Name:'PRIVATE NAME',Addr1:'PRIVATE STREET',City:'PRIVATE CITY',Phone_No:'PRIVATE CONTACT',...changes},{runId:'heat-fixture',sourceReleaseId:'heat-fixture',observedAt:'2026-09-08T12:00:00.000Z',cohort:'residential',sourceFileSha256:'a'.repeat(64),rowNumber:i+1})));}
test('typed groups preserve cross-state same ZIP, repeated credentials, missing and unsupported ZIP codes',async()=>{
 const result=await aggregate(fixture());assert.equal(result.acceptedCohortRows,4);assert.equal(result.zips.length,4);assert.equal(result.zips.reduce((n,z)=>n+z.credentialRows,0),4);
 assert.equal(result.zips.filter(z=>z.zip5==='00501').length,2);assert.equal(result.zips.find(z=>z.zip5===null).state,'WI');assert.equal(result.zips.find(z=>z.zip5==='99999').credentialRows,1);
 assert.equal(result.missingZip5Rows,1);assert.equal(result.rowsWithoutExistingZipView,null);assert.equal(result.verificationMode,'structural-input-only');assert.equal(result.pins,null);
 assert.doesNotMatch(JSON.stringify(result),/PRIVATE|BC123456|latitude|longitude|00501-0012/);assert.equal(result.claims.uniqueBusinessCount,null);assert.equal(result.claims.zipPolygonMembershipEstablished,false);
});
test('state and category filters preserve original denominators and complete accounting',async()=>{
 const snapshot=await aggregate(fixture()),selected=select(snapshot,{state:'WI',category:'residential-building-contractor'});
 assert.equal(selected.selectedCredentialRows,2);assert.equal(selected.filteredOutCredentialRows,2);assert.equal(selected.states[0].categories[0].categoryWithinState,100);
 assert.equal(selected.states[0].categories[0].stateShareOfCategory,2/3*100);assert.equal(selected.zips[0].percentOfAcceptedCohort,25);assert.equal(selected.zips[0].percentOfReportedState,50);
 assert.equal(snapshot.states.length,51);assert.equal(snapshot.zips.length,4);assert.throws(()=>{snapshot.zips[0].credentialRows=99;});
 const zero=select(snapshot,{state:'AK'});assert.equal(zero.selectedCredentialRows,0);assert.equal(zero.states[0].heatValue,0);assert.equal(zero.states[0].categories[0].categoryWithinState,null);
});
test('empty cohort has null percentages; registrations remain zero, not industry absence',async()=>{
 const empty=await aggregate([]);assert.equal(empty.acceptedCohortRows,0);assert.equal(empty.states[0].stateShareOfNationalCohort,null);
 const registration=select(await aggregate(fixture()),{category:'construction-contractor-registration'});assert.equal(registration.selectedCredentialRows,0);assert.equal(registration.filteredOutCredentialRows,4);
});
test('invalid rows, duplicates, sparse input and forged snapshots reject',async()=>{
 const rows=fixture();await assert.rejects(aggregate([...rows,rows[0]]));await assert.rejects(aggregate(new Array(1)));
 rows[0].record.business_name='invalid\nname';await assert.rejects(aggregate(rows));assert.throws(()=>select({states:[],zips:[]}));
 const snapshot=await aggregate(fixture());for(const filters of [{state:'ZZ'},{category:'all'},{county:'001'}])assert.throws(()=>select(snapshot,filters));
});
test('cancellation and invalid native options reject before retained access',async()=>{
 const controller=new AbortController();controller.abort();await assert.rejects(aggregate(fixture(),{signal:controller.signal}),{name:'AbortError'});
 await assert.rejects(build({selection:'config/mn-credential-registry-selection.json',signal:controller.signal}),{name:'AbortError'});
 await assert.rejects(build({selection:'data/unreviewed.json'}));await assert.rejects(build({selection:'config/mn-credential-registry-selection.json',loader:()=>fixture()}));
});
test('outside display states remain explicitly conserved without leaking arbitrary state labels',async()=>{
 const rows=fixture();const record=rows[0].record;record.reported_address.state='PR';record.reported_address.country='US';
 rows[0]=projectMnConstructionCredential(record);const result=await aggregate(rows);
 assert.equal(result.outside50DcOrUnresolvedRows,1);assert.equal(result.national50DcRows,3);
 assert.equal(result.zips.find(row=>row.state===null).credentialRows,1);assert.equal(select(result).selectedCredentialRows,4);
 assert.equal(select(result,{state:'MN'}).selectedCredentialRows,1);
});
test('mid-build cancellation yields no partial snapshot',async()=>{
 const template=fixture()[0].record,rows=Array.from({length:256},(_,i)=>{
  const record=structuredClone(template);record.provenance.source_row_number=i+1;record.source_record_id=`heat-fixture:residential:row:${i+1}`;
  return projectMnConstructionCredential(record);
 });
 const controller=new AbortController();setImmediate(()=>controller.abort());await assert.rejects(aggregate(rows,{signal:controller.signal}),{name:'AbortError'});
});
test('inherited custom array iteration cannot diverge state and ZIP conservation',async()=>{
 class Omitted extends Array{*[Symbol.iterator](){yield this[0];}}
 await assert.rejects(aggregate(Omitted.from(fixture())));
 const rows=fixture();Object.setPrototypeOf(rows,{[Symbol.iterator]:function*(){}});await assert.rejects(aggregate(rows));
});
