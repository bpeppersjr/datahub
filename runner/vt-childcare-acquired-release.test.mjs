import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir, symlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fsPromises from 'node:fs/promises';
import {syncBuiltinESMExports} from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { APP_ROOT } from './paths.mjs';
import { buildVtChildcareAcquiredRelease, buildVtChildcareAcquiredReleaseWithTransport, readVtChildcareAcquiredEvidence } from './vt-childcare-acquired-release.mjs';
import { createVtChildcareFixture } from './vt-childcare-test-fixtures.mjs';

test('VT postcommit unlink failure with cancellation preserves published evidence and reports uncertainty',async()=>{
  const root=await mkdtemp(path.join(APP_ROOT,'data/tmp/vt-acquired-commit-')),controller=new AbortController(),originalUnlink=fsPromises.unlink;
  let failed=false;
  fsPromises.unlink=async filename=>{
    if(!failed&&filename.startsWith(root+path.sep)&&path.basename(filename).startsWith('manifest.json.tmp-')){
      failed=true;controller.abort();throw Error('Synthetic postcommit unlink fault');
    }
    return originalUnlink(filename);
  };
  syncBuiltinESMExports();
  try{
    const fixture=createVtChildcareFixture();
    await assert.rejects(buildVtChildcareAcquiredReleaseWithTransport({fetchImpl:fixture.fetchImpl,outputRoot:root,signal:controller.signal}),{code:'VT_CHILDCARE_PUBLICATION_INCOMPLETE'});
    assert.equal(failed,true);const [job]=await readdir(path.join(root,'jobs')),directory=path.join(root,'jobs',job),roster=await readdir(directory);
    assert.ok(roster.includes('manifest.json'));assert.ok(roster.includes('acquisition.json'));assert.ok(roster.some(name=>name.startsWith('manifest.json.tmp-')));
    await absent(path.join(root,'.owner.lock'));
    await assert.rejects(readVtChildcareAcquiredEvidence(path.join(directory,'manifest.json')),'uncertain leftover hardlink must not be silently treated as verified');
  }finally{fsPromises.unlink=originalUnlink;syncBuiltinESMExports();await rm(root,{recursive:true,force:true});}
});

const runFile=promisify(execFile);
const hash=raw=>createHash('sha256').update(raw).digest('hex');
const absent=async filename=>assert.rejects(readFile(filename),{code:'ENOENT'});

test('VT acquired builder rejects native transport overrides, missing transports and unsafe options before requests',async()=>{
  let requests=0;const fetchImpl=async()=>{requests++;throw Error('unexpected');};
  await assert.rejects(buildVtChildcareAcquiredRelease({fetchImpl}));
  await assert.rejects(buildVtChildcareAcquiredReleaseWithTransport({}));
  await assert.rejects(buildVtChildcareAcquiredReleaseWithTransport({fetchImpl,url:'https://example.invalid'}));
  await assert.rejects(buildVtChildcareAcquiredReleaseWithTransport({fetchImpl,outputRoot:APP_ROOT}));
  const signal=AbortSignal.abort();
  await assert.rejects(buildVtChildcareAcquiredReleaseWithTransport({fetchImpl,signal}),{name:'AbortError'});
  assert.equal(requests,0);
});

test('VT immutable acquisition persists before queries, excludes overlap, replays offline and preserves failure/cancellation boundaries',async()=>{
  const root=await mkdtemp(path.join(APP_ROOT,'data/tmp/vt-acquired-test-'));
  try{
    await Promise.all([
      (async()=>{
        const outputRoot=path.join(root,'success');
        let entered,release;const ready=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});
        const fixture=createVtChildcareFixture({mutate:async(value,kind,{pageNumber})=>{
          if(kind==='baseline-ids'&&pageNumber===1){
            const jobs=await readdir(path.join(outputRoot,'jobs'));assert.equal(jobs.length,1);
            const prerequisite=JSON.parse(await readFile(path.join(outputRoot,'jobs',jobs[0],'prerequisite.json')));
            assert.equal(prerequisite.preflight.source.record_count,2);
            entered();await gate;
          }
          if(kind==='page'){
            const [job]=await readdir(path.join(outputRoot,'jobs'));
            assert.equal(JSON.parse(await readFile(path.join(outputRoot,'jobs',job,'journal-0000.json'))).observation.kind,'baseline-ids');
          }
        }});
        const running=buildVtChildcareAcquiredReleaseWithTransport({fetchImpl:fixture.fetchImpl,outputRoot});
        const atGate=await Promise.race([ready.then(()=>true),running.then(()=>false)]);assert.equal(atGate,true);
        try{
          let duplicateRequests=0;
          await assert.rejects(buildVtChildcareAcquiredReleaseWithTransport({outputRoot,fetchImpl:async()=>{duplicateRequests++;throw Error('duplicate');}}),{code:'EEXIST'});
          assert.equal(duplicateRequests,0);
        }finally{release();}
        const result=await running;
        assert.equal(result.status,'verified');assert.equal(result.record_count,2);
        assert.equal(result.execution_mode,'injected-test-transport');assert.equal(result.app_enrolled,false);
        assert.equal(result.public_export_authorized,false);assert.equal(result.national_reporting_integrated,false);
        assert.equal(result.address_role,'reported-address-role-unspecified');assert.equal(result.current_operations_verified,false);
        assert.equal(result.exact_address_geocodes_verified,false);assert.equal(result.coordinates_selected,false);assert.equal(result.identity_matching_eligible,false);
        await absent(path.join(outputRoot,'.owner.lock'));
        const manifestBytes=await readFile(result.manifest_path);assert.equal(hash(manifestBytes),result.manifest_sha256);
        const directory=path.dirname(result.manifest_path);
        assert.equal(JSON.parse(await readFile(path.join(directory,'journal-0001.json'))).observation.payload.length,0);
        const forgedMode=JSON.parse(manifestBytes);forgedMode.execution_mode='fixed-native-fetch';await writeFile(result.manifest_path,JSON.stringify(forgedMode)+'\n');await assert.rejects(readVtChildcareAcquiredEvidence(result.manifest_path));await writeFile(result.manifest_path,manifestBytes);
        const oldFetch=globalThis.fetch;globalThis.fetch=()=>assert.fail('Offline replay must not request data');
        try{
          const read=await readVtChildcareAcquiredEvidence(result.manifest_path);
          assert.deepEqual(read.verification,result);assert.equal(read.evidence.before_preflight.source.record_count,2);
        }finally{globalThis.fetch=oldFetch;}
        const cli=await runFile(process.execPath,['scripts/verify-vt-childcare-acquired.mjs','--manifest',result.manifest_path],{cwd:APP_ROOT,windowsHide:true});
        assert.equal(JSON.parse(cli.stdout).record_count,2);
        const journalPath=path.join(directory,'journal-0002.json'),original=await readFile(journalPath);
        const changed=JSON.parse(original);changed.observation.payload[0].provider_name='Rehashed synthetic substitution';
        changed.observation.payload_sha256=hash(JSON.stringify(changed.observation.payload));
        const changedBytes=Buffer.from(JSON.stringify(changed)+'\n');await writeFile(journalPath,changedBytes);
        const manifest=JSON.parse(manifestBytes),entry=manifest.artifacts.find(a=>a.path==='journal-0002.json');entry.bytes=changedBytes.length;entry.sha256=hash(changedBytes);
        await writeFile(result.manifest_path,JSON.stringify(manifest)+'\n');
        await assert.rejects(readVtChildcareAcquiredEvidence(result.manifest_path));
        await writeFile(journalPath,original);await writeFile(result.manifest_path,manifestBytes);
        assert.equal((await readVtChildcareAcquiredEvidence(result.manifest_path)).verification.record_count,2);
        const wrongTime=JSON.parse(original);wrongTime.retained_at='2000-01-01T00:00:00.000Z';
        const wrongTimeBytes=Buffer.from(JSON.stringify(wrongTime)+'\n'),wrongTimeManifest=JSON.parse(manifestBytes),timeEntry=wrongTimeManifest.artifacts.find(a=>a.path==='journal-0002.json');
        timeEntry.bytes=wrongTimeBytes.length;timeEntry.sha256=hash(wrongTimeBytes);await writeFile(journalPath,wrongTimeBytes);await writeFile(result.manifest_path,JSON.stringify(wrongTimeManifest)+'\n');
        await assert.rejects(readVtChildcareAcquiredEvidence(result.manifest_path));await writeFile(journalPath,original);await writeFile(result.manifest_path,manifestBytes);
        await writeFile(path.join(directory,'unexpected.txt'),'unrelated evidence');
        await assert.rejects(readVtChildcareAcquiredEvidence(result.manifest_path));
        await mkdir(path.join(root,'alias-target'));await symlink(path.join(root,'alias-target'),path.join(root,'alias'),'junction');
        await assert.rejects(buildVtChildcareAcquiredReleaseWithTransport({fetchImpl:fixture.fetchImpl,outputRoot:path.join(root,'alias')}));
        await assert.rejects(buildVtChildcareAcquiredReleaseWithTransport({fetchImpl:fixture.fetchImpl,outputRoot:directory}));
      })(),
      (async()=>{
        const outputRoot=path.join(root,'failed');
        const fixture=createVtChildcareFixture({mutate:(_value,kind)=>kind==='page'?new Response(null,{status:503}):undefined});
        await assert.rejects(buildVtChildcareAcquiredReleaseWithTransport({fetchImpl:fixture.fetchImpl,outputRoot}));
        const [job]=await readdir(path.join(outputRoot,'jobs'));
        const roster=await readdir(path.join(outputRoot,'jobs',job));
        assert.ok(roster.includes('prerequisite.json'));assert.ok(roster.includes('journal-0000.json'));assert.ok(!roster.includes('manifest.json'));
        assert.equal(fixture.calls.at(-1).kind,'page');await absent(path.join(outputRoot,'.owner.lock'));
      })(),
      (async()=>{
        const outputRoot=path.join(root,'cancelled');await mkdir(outputRoot);await writeFile(path.join(outputRoot,'keep.txt'),'unrelated');
        const controller=new AbortController();
        const fixture=createVtChildcareFixture({mutate:(_value,kind)=>{if(kind==='baseline-ids')controller.abort();}});
        await assert.rejects(buildVtChildcareAcquiredReleaseWithTransport({fetchImpl:fixture.fetchImpl,outputRoot,signal:controller.signal}),{name:'AbortError'});
        assert.deepEqual(await readdir(path.join(outputRoot,'jobs')),[]);assert.equal(await readFile(path.join(outputRoot,'keep.txt'),'utf8'),'unrelated');
        await absent(path.join(outputRoot,'.owner.lock'));
      })(),
    ]);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('VT acquired verification CLI rejects invalid arguments without acquisition',async()=>{
  for(const args of [[],['--manifest'],['--manifest','relative.json'],['--url','https://example.invalid']])
    await assert.rejects(runFile(process.execPath,['scripts/verify-vt-childcare-acquired.mjs',...args],{cwd:APP_ROOT,windowsHide:true}));
});
