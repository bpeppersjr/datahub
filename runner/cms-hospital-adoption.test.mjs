import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir,mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {randomUUID,createHash} from 'node:crypto';
import {APP_ROOT} from './paths.mjs';
import {acquireCmsHospitalsWithTestTransport} from './cms-hospital-acquisition.mjs';
import {CMS_HOSPITAL_SELECTED_HEADERS} from './cms-hospital-prerequisite.mjs';
import {buildCmsHospitalAdoption,buildCmsHospitalAdoptionWithTestInput as build,verifyCmsHospitalAdoptionWithTestInput as verify,CMS_HOSPITAL_RETAINED_ADOPTION as source} from './cms-hospital-adoption.mjs';
import {ManagedOperations} from './managed-operations.mjs';

// Source lifecycle fixtures use fixed roots. Isolate the whole fixture process
// so concurrent acquisition tests can never sweep another test's directories.
if(process.env.DATAHUB_CMS_ADOPTION_FIXTURE!=='1') {
  test('CMS adoption isolated source replay, ownership and managed lifecycle fixtures',async t=>{
    const parent=path.join(APP_ROOT,'data/tmp');await mkdir(parent,{recursive:true});const root=await mkdtemp(path.join(parent,'cms-adoption-suite-'));
    t.after(()=>rm(root,{recursive:true,force:true}));
    const environment={...process.env,DATAHUB_ROOT:root,DATAHUB_CMS_ADOPTION_FIXTURE:'1'};delete environment.NODE_TEST_CONTEXT;
    const child=spawn(process.execPath,['--test',fileURLToPath(import.meta.url)],{cwd:APP_ROOT,env:environment,windowsHide:true,stdio:['ignore','pipe','pipe']});
    let output='';child.stdout.on('data',chunk=>{output+=chunk;});child.stderr.on('data',chunk=>{output+=chunk;});
    const [exit]=await once(child,'close');assert.equal(exit,0,output);assert.match(output,/tests 8/);assert.doesNotMatch(output,/skipping running files/);t.diagnostic(output);
  });
} else {
  const metadata={identifier:'xubh-q36u',title:'Hospital General Information',accessLevel:'public',publisher:{name:'Centers for Medicare & Medicaid Services (CMS)'},landingPage:'https://data.cms.gov/provider-data/dataset/xubh-q36u',issued:'2025-01-08',modified:'2026-07-22',released:'2026-08-13',distribution:[{mediaType:'text/csv',downloadURL:'https://data.cms.gov/provider-data/sites/default/files/resources/893c372430d9d71a1c52737d01239d47_1785189955/Hospital_General_Information.csv',describedBy:'https://data.cms.gov/provider-data/sites/default/files/data_dictionaries/hospital/HOSPITAL_Data_Dictionary.pdf',describedByType:'application/pdf'}]};
  const csv=[...CMS_HOSPITAL_SELECTED_HEADERS,'Telephone Number'].join(',')+'\n010001,PRIVATE Facility,1 Street,City,AL,00501-0012,County,Type,Ownership,Unknown,PRIVATE PHONE\n010002,PRIVATE Second,2 Street,City,PR,00901,County,Type,Ownership,Unknown,PRIVATE PHONE\n';
  let transportCalls=0;
  const fixture=await acquireCmsHospitalsWithTestTransport(async()=>{const sequence=++transportCalls;return new Response(sequence===2?'%PDF-SYNTHETIC-CMS-REUSE-NOTICE':sequence===3?csv:JSON.stringify(metadata),{headers:{'content-type':sequence===2?'application/pdf':sequence===3?'text/csv':'application/json'}});});
  const input={manifestPath:fixture.manifestPath,manifestSha256:fixture.manifestSha256};
  async function op(){const operationId=randomUUID();await mkdir(path.join(APP_ROOT,'data/tmp/cms-hospital-adoption',operationId),{recursive:true});return {operationId};}
  const digest=value=>createHash('sha256').update(value).digest('hex');
  test('adoption fully replays source and preserves original source identity/dates while emitting only summary',async()=>{
    const operation=await op(),descriptor=await build(operation,input),receipt=await verify(descriptor,operation,input);
    assert.equal(receipt.summary.directoryRows,2);assert.equal(receipt.summary.statesDcRows,1);assert.equal(receipt.summary.territoryRows,1);assert.equal(receipt.summary.states.AL,1);assert.equal(receipt.summary.territories.PR,1);
    assert.equal(receipt.summary.sourceRunId,fixture.runId);assert.deepEqual(receipt.summary.sourceDates,{issued:metadata.issued,modified:metadata.modified,released:metadata.released});
    assert.equal(receipt.claims.networkRequestsPerformed,0);assert.equal(receipt.claims.nationalReportingIntegrated,false);assert.equal(receipt.executionMode,'synthetic-test-input');assert.equal(transportCalls,4);
    assert.doesNotMatch(JSON.stringify(receipt),/PRIVATE|00501|00901|1 Street/);
    await assert.rejects(verify(descriptor,await op(),input));
    assert.throws(()=>buildCmsHospitalAdoption(operation,{url:'https://invalid'}));
  });
  test('rehashed wrong counts, claims, chronology and source identity reject',async()=>{
    const operation=await op(),descriptor=await build(operation,input),original=await readFile(descriptor.manifestPath);
    for(const mutate of [r=>r.summary.states.AL++,r=>r.claims.publicExportAuthorized=true,r=>r.startedAt='2000-01-01T00:00:00.000Z',r=>r.summary.sourceManifestSha256='0'.repeat(64)]){
      const value=JSON.parse(original);mutate(value);const bytes=Buffer.from(JSON.stringify(value)+'\n');await writeFile(descriptor.manifestPath,bytes);
      await assert.rejects(verify({...descriptor,manifestSha256:digest(bytes)},operation,input));
    }
    await writeFile(descriptor.manifestPath,original);
    const selected=path.join(path.dirname(input.manifestPath),'selected.jsonl'),rows=await readFile(selected);await writeFile(selected,Buffer.concat([rows,Buffer.from('\n')]));
    await assert.rejects(verify(descriptor,operation,input));await writeFile(selected,rows);
  });
  test('pre/post publication cancellation never mints ready output; existing output is never replaced',async()=>{
    const before=new AbortController();before.abort();await assert.rejects(build(await op(),input,{signal:before.signal}));
    const operation=await op(),descriptor=await build(operation,input);await assert.rejects(build(operation,input));await verify(descriptor,operation,input);
    const after=new AbortController();let recovery;await assert.rejects(build(await op(),input,{signal:after.signal,hook:async stage=>{if(stage==='after-publication')after.abort();}}),error=>{recovery=error.recovery;return true;});assert.equal(recovery.inspectionRequired,true);
  });
  async function settled(service,id){for(let n=0;n<100;n++){const value=await service.get(id);if(!['QUEUED','RUNNING'].includes(value.status))return value;await new Promise(r=>setTimeout(r,5));}throw Error('Fixture operation did not settle');}
  const fakeReceipt=(id)=>({operationId:id,executionMode:'verified-retained-source',startedAt:new Date().toISOString(),finishedAt:new Date().toISOString(),summary:{sourceRunId:source.runId,sourceManifestSha256:source.manifestSha256,directoryRows:2}});
  test('managed fixed dispatch, duplicate refusal, independent verification and restart do not expose artifacts',async()=>{
    let release,entered;const began=new Promise(r=>entered=r),gate=new Promise(r=>release=r);let id;
    const service=new ManagedOperations({executor:async request=>{assert.equal(request.script,'scripts/adopt-cms-hospitals.mjs');assert.deepEqual(request.args.slice(0,1),['--operation-id']);id=request.args[1];entered();await gate;return {code:0,stdout:JSON.stringify({operationId:id})};},adoptionVerifier:async(_descriptor,binding,{signal})=>{assert.equal(binding.operationId,id);assert.equal(signal.aborted,false);return fakeReceipt(id);}});
    for(const bad of [{},{sourceId:source.sourceId,path:'x'},{sourceId:'other'}])await assert.rejects(service.startSourceAdoption(bad),{statusCode:400});
    const started=await service.startSourceAdoption({sourceId:source.sourceId});await began;await assert.rejects(service.startSourceAdoption({sourceId:source.sourceId}),{statusCode:409});release();const done=await settled(service,started.id);assert.equal(done.status,'SUCCEEDED');assert.equal(done.result.receiptIntegrityVerified,true);assert.equal(done.result.descriptor,undefined);assert.deepEqual(done.artifacts,[]);assert.equal(await service.artifact(id,'selected.jsonl'),null);await service.close();
    const reopened=new ManagedOperations({executor:()=>assert.fail('restart must not execute')});assert.equal((await reopened.get(id)).status,'SUCCEEDED');await reopened.close();
  });
  test('managed cancellation during verifier observes signal and withholds counts',async()=>{
    let started;const began=new Promise(r=>started=r);const service=new ManagedOperations({executor:async()=>({code:0,stdout:'{}'}),adoptionVerifier:async(_d,_i,{signal})=>{started();await new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));}});
    const value=await service.startSourceAdoption({sourceId:source.sourceId});await began;await service.cancel(value.id);const done=await settled(service,value.id);assert.equal(done.status,'CANCELLED');assert.equal(done.result.receiptIntegrityVerified,false);assert.equal(done.result.summary,undefined);await service.close();
  });
  test('child failure and wrong operation source binding remain failed inspection',async()=>{
    for(const wrong of [false,true]){const service=new ManagedOperations({executor:async()=>({code:wrong?0:1,stdout:'{}'}),adoptionVerifier:async()=>fakeReceipt(randomUUID())});const value=await service.startSourceAdoption({sourceId:source.sourceId});const done=await settled(service,value.id);assert.equal(done.status,'FAILED');assert.equal(done.result.inspectionRequired,true);assert.equal(done.result.summary,undefined);await service.close();}
  });
  test('actual deadline after publication preserves inspection receipt',async()=>{
    const operation=await op();let recovery;
    await assert.rejects(build(operation,input,{testDeadlineMs:1000,hook:async stage=>{if(stage==='after-publication')await new Promise(resolve=>setTimeout(resolve,1100));}}),error=>{recovery=error.recovery;return true;});
    assert.equal(recovery?.inspectionRequired,true);assert.equal(JSON.parse(await readFile(recovery.manifestPath)).operationId,operation.operationId);
    assert.throws(()=>buildCmsHospitalAdoption(operation,{testDeadlineMs:1}));
  });
  test('actual managed deadline bounds noncooperative child and verifier and preserves ownership hold',async()=>{
    for(const stage of ['child','verifier']){
      let observed;const service=new ManagedOperations({adoptionTestTiming:{deadlineMs:30,childCleanupMs:20,verifierCleanupMs:20},executor:async({signal})=>{if(stage==='child'){observed=signal;return new Promise(()=>{});}return {code:0,stdout:'{}'};},adoptionVerifier:async(_d,_i,{signal})=>{observed=signal;return new Promise(()=>{});}});
      const started=Date.now(),value=await service.startSourceAdoption({sourceId:source.sourceId}),done=await settled(service,value.id);
      assert.equal(done.status,'UNKNOWN');assert.equal(observed.aborted,true);assert.equal(done.finishedAt,null);assert.equal(done.result.summary,undefined);assert.equal(done.result.inspectionRequired,true);assert.ok(Date.now()-started<1000);
      await assert.rejects(service.startSourceAdoption({sourceId:source.sourceId}),{statusCode:409});await service.close();
      const receipt=JSON.parse(await readFile(path.join(APP_ROOT,'data/managed-operations',value.id,'receipt.json')));assert.equal(receipt.owner.supervisorPid,process.pid);
      // Deliberately unresolved fixture has no actual child or I/O; remove only
      // this test-owned receipt so the next independent timer case can start.
      await rm(path.join(APP_ROOT,'data/managed-operations',value.id),{recursive:true});
    }
  });
}
