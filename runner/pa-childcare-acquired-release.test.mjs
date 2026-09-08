import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir, symlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import test from 'node:test';
import { APP_ROOT } from './paths.mjs';
import { buildPaChildcareAcquiredRelease, buildPaChildcareAcquiredReleaseWithTransport, readPaChildcareAcquiredEvidence } from './pa-childcare-acquired-release.mjs';
import { createPaChildcareFixture, paFixtureOptions } from './pa-childcare-test-fixtures.mjs';

const runFile=promisify(execFile);
const hash=raw=>createHash('sha256').update(raw).digest('hex');
const absent=async filename=>assert.rejects(readFile(filename),{code:'ENOENT'});

test('PA acquired builder rejects native transport overrides, missing transports and unsafe options before requests',async()=>{
  let requests=0;const fetchImpl=async()=>{requests++;throw Error('unexpected');};
  await assert.rejects(buildPaChildcareAcquiredRelease({fetchImpl}));
  await assert.rejects(buildPaChildcareAcquiredReleaseWithTransport({}));
  await assert.rejects(buildPaChildcareAcquiredReleaseWithTransport({fetchImpl,url:'https://example.invalid'}));
  await assert.rejects(buildPaChildcareAcquiredReleaseWithTransport({fetchImpl,outputRoot:APP_ROOT}));
  const signal=AbortSignal.abort();
  await assert.rejects(buildPaChildcareAcquiredReleaseWithTransport({fetchImpl,signal}),{name:'AbortError'});
  assert.equal(requests,0);
});

test('PA immutable acquisition persists before queries, excludes overlap, replays offline and preserves failure/cancellation boundaries',paFixtureOptions,async()=>{
  const root=await mkdtemp(path.join(APP_ROOT,'data/tmp/pa-acquired-test-'));
  try{
    await Promise.all([
      (async()=>{
        const outputRoot=path.join(root,'success');
        let entered,release;const ready=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});
        const fixture=createPaChildcareFixture({mutate:async(value,kind)=>{
          if(kind==='baseline-ids'){
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
        const running=buildPaChildcareAcquiredReleaseWithTransport({fetchImpl:fixture.fetchImpl,outputRoot});
        const atGate=await Promise.race([ready.then(()=>true),running.then(()=>false)]);assert.equal(atGate,true);
        try{
          let duplicateRequests=0;
          await assert.rejects(buildPaChildcareAcquiredReleaseWithTransport({outputRoot,fetchImpl:async()=>{duplicateRequests++;throw Error('duplicate');}}),{code:'EEXIST'});
          assert.equal(duplicateRequests,0);
        }finally{release();}
        const result=await running;
        assert.equal(result.status,'verified');assert.equal(result.record_count,2);
        assert.equal(result.execution_mode,'injected-test-transport');assert.equal(result.app_enrolled,false);
        assert.equal(result.public_export_authorized,false);assert.equal(result.national_reporting_integrated,false);
        await absent(path.join(outputRoot,'.owner.lock'));
        const manifestBytes=await readFile(result.manifest_path);assert.equal(hash(manifestBytes),result.manifest_sha256);
        const directory=path.dirname(result.manifest_path);
        const oldFetch=globalThis.fetch;globalThis.fetch=()=>assert.fail('Offline replay must not request data');
        try{
          const read=await readPaChildcareAcquiredEvidence(result.manifest_path);
          assert.deepEqual(read.verification,result);assert.equal(read.evidence.before_preflight.source.point_count,1);
        }finally{globalThis.fetch=oldFetch;}
        const cli=await runFile(process.execPath,['scripts/verify-pa-childcare-acquired.mjs','--manifest',result.manifest_path],{cwd:APP_ROOT,windowsHide:true});
        assert.equal(JSON.parse(cli.stdout).record_count,2);
        const journalPath=path.join(directory,'journal-0001.json'),original=await readFile(journalPath);
        const changed=JSON.parse(original);changed.observation.payload[0].facility_name='Rehashed synthetic substitution';
        changed.observation.payload_sha256=hash(JSON.stringify(changed.observation.payload));
        const changedBytes=Buffer.from(JSON.stringify(changed)+'\n');await writeFile(journalPath,changedBytes);
        const manifest=JSON.parse(manifestBytes),entry=manifest.artifacts.find(a=>a.path==='journal-0001.json');entry.bytes=changedBytes.length;entry.sha256=hash(changedBytes);
        await writeFile(result.manifest_path,JSON.stringify(manifest)+'\n');
        await assert.rejects(readPaChildcareAcquiredEvidence(result.manifest_path));
        await writeFile(journalPath,original);await writeFile(result.manifest_path,manifestBytes);
        assert.equal((await readPaChildcareAcquiredEvidence(result.manifest_path)).verification.record_count,2);
        await writeFile(path.join(directory,'unexpected.txt'),'unrelated evidence');
        await assert.rejects(readPaChildcareAcquiredEvidence(result.manifest_path));
        await mkdir(path.join(root,'alias-target'));await symlink(path.join(root,'alias-target'),path.join(root,'alias'),'junction');
        await assert.rejects(buildPaChildcareAcquiredReleaseWithTransport({fetchImpl:fixture.fetchImpl,outputRoot:path.join(root,'alias')}));
        await assert.rejects(buildPaChildcareAcquiredReleaseWithTransport({fetchImpl:fixture.fetchImpl,outputRoot:directory}));
      })(),
      (async()=>{
        const outputRoot=path.join(root,'failed');
        const fixture=createPaChildcareFixture({mutate:(_value,kind)=>kind==='page'?new Response(null,{status:503}):undefined});
        await assert.rejects(buildPaChildcareAcquiredReleaseWithTransport({fetchImpl:fixture.fetchImpl,outputRoot}));
        const [job]=await readdir(path.join(outputRoot,'jobs'));
        const roster=await readdir(path.join(outputRoot,'jobs',job));
        assert.ok(roster.includes('prerequisite.json'));assert.ok(roster.includes('journal-0000.json'));assert.ok(!roster.includes('manifest.json'));
        assert.equal(fixture.calls.at(-1).kind,'page');await absent(path.join(outputRoot,'.owner.lock'));
      })(),
      (async()=>{
        const outputRoot=path.join(root,'cancelled');await mkdir(outputRoot);await writeFile(path.join(outputRoot,'keep.txt'),'unrelated');
        const controller=new AbortController();
        const fixture=createPaChildcareFixture({mutate:(_value,kind)=>{if(kind==='baseline-ids')controller.abort();}});
        await assert.rejects(buildPaChildcareAcquiredReleaseWithTransport({fetchImpl:fixture.fetchImpl,outputRoot,signal:controller.signal}),{name:'AbortError'});
        assert.deepEqual(await readdir(path.join(outputRoot,'jobs')),[]);assert.equal(await readFile(path.join(outputRoot,'keep.txt'),'utf8'),'unrelated');
        await absent(path.join(outputRoot,'.owner.lock'));
      })(),
    ]);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('PA acquired verification CLI rejects invalid arguments without acquisition',async()=>{
  for(const args of [[],['--manifest'],['--manifest','relative.json'],['--url','https://example.invalid']])
    await assert.rejects(runFile(process.execPath,['scripts/verify-pa-childcare-acquired.mjs',...args],{cwd:APP_ROOT,windowsHide:true}));
});
