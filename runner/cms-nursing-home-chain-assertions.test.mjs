import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {cmsNursingHomeChainAssertionsFixture as build,loadCmsNursingHomeChainAssertions as load,pageCmsNursingHomeChainAssertions as page} from './cms-nursing-home-chain-assertions.mjs';

const headers=['CMS Certification Number (CCN)','Chain Name','Chain ID','Number of Facilities in Chain','Processing Date'];
function input(values){const raw=Buffer.from([headers,...values.map((v,i)=>[String(i+1).padStart(6,'0'),...v,'08/01/2026'])].map(r=>r.map(v=>'"'+v.replaceAll('"','""')+'"').join(',')).join('\n')+'\n'),hash=createHash('sha256').update(raw).digest('hex');return [raw,values.map((v,i)=>({identifier:{value:String(i+1).padStart(6,'0')},provenance:{sourceRow:i+2,csvSha256:hash},sourceRecordId:`cms-pdc:4pq5-n9py:${hash}:row:${i+2}`}))];}

test('versioned assertions preserve row lineage, raw affiliation evidence, time fields, and conservation',async()=>{
 const [raw,selected]=input([['Example Group','001','2'],['Example Group','001','2'],['','','']]),before=structuredClone(selected),rawHash=createHash('sha256').update(raw).digest('hex');
 const result=await build(raw,selected);
 assert.equal(result.schemaVersion,'cms-nursing-home-chain-assertions@1.0.0');assert.equal(result.nativeSourceVerified,false);assert.equal(result.rows.length,3);
 assert.equal(result.rows[0].assertionId,`${rawHash}:2`);assert.equal(result.rows[0].lineage.sourceRow,2);assert.equal(result.rows[0].lineage.sourceRecordId,selected[0].sourceRecordId);assert.equal(result.rows[0].lineage.ccn,'000001');assert.equal(result.rows[0].lineage.rawCsvSha256,rawHash);
 assert.equal(result.rows[0].chainId.raw,'001');assert.equal(result.rows[0].chainName.raw,'Example Group');assert.equal(result.rows[0].reportedFacilities.raw,'2');assert.equal(result.rows[0].temporal.publisherProcessingDateRaw,'08/01/2026');assert.equal(result.rows[0].temporal.validFrom,null);assert.equal(result.rows[0].temporal.firstSeen,null);
 assert.equal(result.rows[0].chainId.controlCharactersObserved,false);assert.equal(result.rows[0].reportedFacilities.controlCharactersObserved,false);assert.equal(result.rows[0].temporal.sourceFailedAt,null);assert.equal(result.rows[0].temporal.recoveryCreatedAt,null);
 assert.equal(result.summary.assertionRows,3);assert.equal(result.summary.sourceRows,3);assert.equal(result.summary.conservation.assertionRowsEqualSourceRows,true);assert.equal(result.summary.conservation.chainIdStatusesSumToSourceRows,true);
 assert.deepEqual(selected,before);assert.ok(Object.isFrozen(result)&&Object.isFrozen(result.rows[0])&&Object.isFrozen(result.rows[0].lineage));
 assert.equal(result.claims.legalParentVerified,false);assert.equal(result.claims.canonicalNetworkVerified,false);assert.equal(result.claims.healthcareNetworkVerified,false);assert.equal(result.claims.uniqueBusinessCountVerified,false);assert.equal(result.claims.physicalSiteVerified,false);assert.equal(result.claims.currentOperationsVerified,false);assert.equal(result.claims.publicExportAuthorized,false);assert.equal(result.claims.exportPolicy,'local-review-only');assert.equal(result.claims.artifactPersisted,false);
});

test('local pages filter opaque chain IDs and CCNs while enforcing bounds',async()=>{
 const result=await build(...input([['A','001','2'],['A','001','2'],['B','002','1']]));
 const group=page(result,{chainId:'001',limit:1});assert.equal(group.total,2);assert.equal(group.rows.length,1);assert.equal(group.rows[0].lineage.ccn,'000001');
 const second=page(result,{chainId:'001',offset:1,limit:1});assert.equal(second.rows[0].lineage.ccn,'000002');
 const byCcn=page(result,{ccn:'000003'});assert.equal(byCcn.total,1);assert.equal(byCcn.rows[0].chainId.raw,'002');
 assert.throws(()=>page(result,{offset:-1}));assert.throws(()=>page(result,{limit:501}));assert.throws(()=>page(result,{ccn:'bad'}));assert.throws(()=>page(result,{unknown:true}));
 assert.throws(()=>page(Object.freeze({...result,rows:[]})));
});

test('tampered source linkage and malformed options fail closed without network or writes',async t=>{
 t.mock.method(globalThis,'fetch',()=>assert.fail('Assertion projection must not use network'));
 for(const mutation of ['ccn','row','hash','record','option']){
  const [raw,selected]=input([['SENSITIVE GROUP','1','1']]);
  if(mutation==='ccn')selected[0].identifier.value='999999';if(mutation==='row')selected[0].provenance.sourceRow=8;if(mutation==='hash')selected[0].provenance.csvSha256='0'.repeat(64);if(mutation==='record')selected[0].sourceRecordId='tampered';
  if(mutation==='option')await assert.rejects(build(raw,selected,{path:'alternate'}));else await assert.rejects(build(raw,selected),e=>!e.message.includes('SENSITIVE GROUP'));
 }
});

test('native assertion view replays exact retained input and remains local-review-only',{skip:process.env.DATAHUB_TEST_NURSING_RETAINED!=='1',timeout:180000},async t=>{
 t.mock.method(globalThis,'fetch',()=>assert.fail('Native retained replay must not use network'));
 const result=await load({signal:AbortSignal.timeout(180000)});
 assert.equal(result.nativeSourceVerified,true);assert.equal(result.summary.assertionRows,14690);assert.equal(result.summary.sourceRows,14690);assert.equal(result.summary.conservation.assertionRowsEqualSourceRows,true);
 assert.equal(result.evidence.manifestSha256,'89ee608067aa5b97833957b753be61003dc2efcfa22cfaedbb3b78f020396d7e');assert.equal(result.evidence.rawCsv.sha256,result.rows[0].lineage.rawCsvSha256);assert.equal(result.rows[0].lineage.sourceRow,2);assert.equal(result.claims.publiclyExposed,false);assert.equal(result.claims.artifactPersisted,false);assert.equal(result.claims.productionReportingModified,false);
 assert.equal(result.rows[0].temporal.observedAt,result.evidence.observedAt);assert.equal(result.rows[0].temporal.sourceFailedAt,result.evidence.sourceFailedAt);assert.equal(result.rows[0].temporal.recoveryCreatedAt,result.evidence.recoveryCreatedAt);
});
