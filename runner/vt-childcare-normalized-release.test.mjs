import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { watch } from 'node:fs';
import fsPromises from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { mkdtemp, readFile, readdir, writeFile, rm, mkdir, symlink } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import test from 'node:test';
import { APP_ROOT } from './paths.mjs';
import { buildVtChildcareAcquiredReleaseWithTransport } from './vt-childcare-acquired-release.mjs';
import { buildVtChildcareNormalizedRelease, readVtChildcareNormalizedRelease } from './vt-childcare-normalized-release.mjs';
import { createVtChildcareFixture } from './vt-childcare-test-fixtures.mjs';

const execute=promisify(execFile),hash=raw=>createHash('sha256').update(raw).digest('hex');
const readJson=async filename=>JSON.parse(await readFile(filename));

test('VT normalized release and CLI reject invalid modes and early cancellation',async()=>{
  const signal=AbortSignal.abort();
  await assert.rejects(buildVtChildcareNormalizedRelease('unread',{signal}),{name:'AbortError'});
  await assert.rejects(buildVtChildcareNormalizedRelease('unread',{url:'https://example.invalid'}));
  await assert.rejects(readVtChildcareNormalizedRelease('unread',{url:'https://example.invalid'}));
  for(const args of [[],['--acquired'],['--verify','relative.json'],['--acquired','x','--verify','y'],['--url','https://example.invalid']])
    await assert.rejects(execute(process.execPath,['scripts/reprocess-vt-childcare.mjs',...args],{cwd:APP_ROOT,windowsHide:true}));
});

test('VT normalized releases conserve source rows, replay offline and reject rehashed substitutions without repulling',async()=>{
  const root=await mkdtemp(path.join(APP_ROOT,'data/tmp/vt-normalized-test-'));
  try{
    const fixture=createVtChildcareFixture({count:3,mutate:(rows,kind)=>{
      if(kind!=='page'||rows.length===0)return;
      rows[0].zip_code='invalid';rows[1].zip_code='01234-0067';delete rows[0].address_1;
      for(const field of ['provider_name','address_1'])rows[2][field]='x'.repeat(20000);
    }});
    const acquired=await buildVtChildcareAcquiredReleaseWithTransport({fetchImpl:fixture.fetchImpl,outputRoot:path.join(root,'acquired')});
    const acquiredBytes=await readFile(acquired.manifest_path),acquisitionPath=path.join(path.dirname(acquired.manifest_path),'acquisition.json'),inputBytes=await readFile(acquisitionPath);
    const requests=fixture.calls.length,outputRoot=path.join(root,'normalized');
    let first,second;
    const oldFetch=globalThis.fetch;globalThis.fetch=()=>assert.fail('Normalization must not acquire data');
    try{
      first=await buildVtChildcareNormalizedRelease(acquired.manifest_path,{outputRoot});
      second=await buildVtChildcareNormalizedRelease(acquired.manifest_path,{outputRoot});
      const result=await readVtChildcareNormalizedRelease(first.manifest_path);
      assert.equal(result.verification.record_count,2);assert.equal(result.verification.quarantine_count,1);
      assert.equal(result.summary.source_records,3);assert.equal(result.summary.accepted_with_points,0);
      assert.equal(result.records[0].reported_address.zip_code,null);assert.equal(result.records[0].reported_address.zip4,null);
      assert.equal(result.records[0].geocode.latitude,null);
      assert.equal(result.records[1].reported_address.state,null);assert.equal(result.records[1].reported_address.country,null);
      assert.equal(result.records[1].source.selected_fields.zip_code,'01234-0067');
      assert.equal(result.records[1].reported_address.zip_code,'01234');assert.equal(result.records[1].reported_address.postal_code,'01234');assert.equal(result.records[1].reported_address.zip4,'0067');
      assert.equal(result.records[1].claims.geographic_boundary_verified,false);
      assert.equal(result.manifest.acquired.manifest_sha256,hash(acquiredBytes));
      assert.equal(result.verification.public_export_authorized,false);assert.equal(result.verification.national_reporting_integrated,false);
      assert.notEqual(first.run_id,second.run_id);assert.notEqual(first.manifest_path,second.manifest_path);
      assert.equal(second.acquired_manifest_sha256,first.acquired_manifest_sha256);
      await assert.rejects(buildVtChildcareNormalizedRelease(acquired.manifest_path,{outputRoot:path.dirname(acquired.manifest_path)}));
      await assert.rejects(buildVtChildcareNormalizedRelease(acquired.manifest_path,{outputRoot:APP_ROOT}));
      await assert.rejects(buildVtChildcareNormalizedRelease(acquired.manifest_path,{processedAt:'2000-01-01T00:00:00.000Z',outputRoot}));
      await mkdir(path.join(root,'alias-target'));await symlink(path.join(root,'alias-target'),path.join(root,'alias'),'junction');
      await assert.rejects(buildVtChildcareNormalizedRelease(acquired.manifest_path,{outputRoot:path.join(root,'alias')}));
      await writeFile(path.join(outputRoot,'.owner.lock'),'foreign ownership');
      await assert.rejects(buildVtChildcareNormalizedRelease(acquired.manifest_path,{outputRoot}),{code:'EEXIST'});
      assert.equal(await readFile(path.join(outputRoot,'.owner.lock'),'utf8'),'foreign ownership');
    }finally{globalThis.fetch=oldFetch;}
    assert.deepEqual(await readFile(acquired.manifest_path),acquiredBytes);assert.deepEqual(await readFile(acquisitionPath),inputBytes);assert.equal(fixture.calls.length,requests);
    const cancelledRoot=path.join(root,'cancelled-normalized'),cancelledJobs=path.join(cancelledRoot,'jobs');
    await mkdir(cancelledJobs,{recursive:true});await writeFile(path.join(cancelledRoot,'keep.txt'),'unrelated');
    const controller=new AbortController();let sawOwnedJob=false;
    const watcher=watch(cancelledJobs,{persistent:false},(_event,name)=>{if(/^[a-f0-9-]{36}$/.test(String(name))){sawOwnedJob=true;controller.abort();}});
    const deadline=setTimeout(()=>controller.abort(),5000);
    try{
      await assert.rejects(buildVtChildcareNormalizedRelease(acquired.manifest_path,{outputRoot:cancelledRoot,signal:controller.signal}),{name:'AbortError'});
      assert.equal(sawOwnedJob,true);assert.deepEqual(await readdir(cancelledJobs),[]);
      assert.equal(await readFile(path.join(cancelledRoot,'keep.txt'),'utf8'),'unrelated');
      await assert.rejects(readFile(path.join(cancelledRoot,'.owner.lock')),{code:'ENOENT'});
      assert.deepEqual(await readFile(acquisitionPath),inputBytes);
    }finally{clearTimeout(deadline);watcher.close();}
    const uncertainRoot=path.join(root,'uncertain-normalized'),publicationAbort=new AbortController(),originalUnlink=fsPromises.unlink;
    let injected=false;
    fsPromises.unlink=async filename=>{
      if(String(filename).startsWith(uncertainRoot+path.sep)&&path.basename(filename)==='.manifest.tmp'){
        injected=true;publicationAbort.abort();throw Error('Synthetic finalization failure');
      }
      return originalUnlink(filename);
    };
    syncBuiltinESMExports();
    try{
      await assert.rejects(buildVtChildcareNormalizedRelease(acquired.manifest_path,{outputRoot:uncertainRoot,signal:publicationAbort.signal}),{code:'VT_CHILDCARE_NORMALIZATION_INCOMPLETE'});
      assert.equal(injected,true);
      const jobs=await readdir(path.join(uncertainRoot,'jobs'));assert.equal(jobs.length,1);
      const retained=path.join(uncertainRoot,'jobs',jobs[0]);
      assert.deepEqual(await readFile(path.join(retained,'manifest.json')),await readFile(path.join(retained,'.manifest.tmp')));
      assert.ok((await readFile(path.join(retained,'normalized.jsonl'))).length>0);
      await assert.rejects(readVtChildcareNormalizedRelease(path.join(retained,'manifest.json')));
      assert.deepEqual(await readFile(acquisitionPath),inputBytes);
    }finally{fsPromises.unlink=originalUnlink;syncBuiltinESMExports();}
    const verified=await execute(process.execPath,['scripts/reprocess-vt-childcare.mjs','--verify',first.manifest_path],{cwd:APP_ROOT,windowsHide:true});
    assert.equal(JSON.parse(verified.stdout).record_count,2);
    const independent=await execute(process.execPath,['scripts/verify-vt-childcare-normalized.mjs','--manifest',first.manifest_path],{cwd:APP_ROOT,windowsHide:true});assert.equal(JSON.parse(independent.stdout).quarantine_count,1);
    await assert.rejects(execute(process.execPath,['scripts/verify-vt-childcare-normalized.mjs'],{cwd:APP_ROOT,windowsHide:true}));
    const rebuilt=await execute(process.execPath,['scripts/reprocess-vt-childcare.mjs','--acquired',acquired.manifest_path,'--output',path.join(root,'cli-normalized')],{cwd:APP_ROOT,windowsHide:true});
    assert.equal(JSON.parse(rebuilt.stdout).acquired_manifest_sha256,first.acquired_manifest_sha256);
    const directory=path.dirname(first.manifest_path),recordsPath=path.join(directory,'normalized.jsonl');
    const manifestBytes=await readFile(first.manifest_path),recordsBytes=await readFile(recordsPath);
    const modeForgery=JSON.parse(manifestBytes);modeForgery.acquired.execution_mode='fixed-native-fetch';await writeFile(first.manifest_path,JSON.stringify(modeForgery)+'\n');await assert.rejects(readVtChildcareNormalizedRelease(first.manifest_path));await writeFile(first.manifest_path,manifestBytes);
    const rows=recordsBytes.toString('utf8').trim().split('\n').map(JSON.parse);rows[0].business_name='Rehashed substitution';
    const replacement=Buffer.from(rows.map(row=>JSON.stringify(row)+'\n').join(''));await writeFile(recordsPath,replacement);
    const manifest=JSON.parse(manifestBytes),artifact=manifest.artifacts.find(a=>a.path==='normalized.jsonl');artifact.bytes=replacement.length;artifact.sha256=hash(replacement);
    await writeFile(first.manifest_path,JSON.stringify(manifest)+'\n');await assert.rejects(readVtChildcareNormalizedRelease(first.manifest_path));
    await writeFile(recordsPath,recordsBytes);await writeFile(first.manifest_path,manifestBytes);
    assert.equal((await readVtChildcareNormalizedRelease(first.manifest_path)).verification.record_count,2);
    const corrupt=JSON.parse(inputBytes);corrupt.observations[2].payload[0].provider_name='Changed acquired row';await writeFile(acquisitionPath,JSON.stringify(corrupt)+'\n');
    await assert.rejects(readVtChildcareNormalizedRelease(first.manifest_path));await writeFile(acquisitionPath,inputBytes);
    assert.equal((await readVtChildcareNormalizedRelease(first.manifest_path)).verification.record_count,2);
    await writeFile(path.join(directory,'unexpected.txt'),'extra evidence');await assert.rejects(readVtChildcareNormalizedRelease(first.manifest_path));
    assert.equal((await readdir(path.join(outputRoot,'jobs'))).length,2);
    assert.equal((await readJson(second.manifest_path)).run_id,second.run_id);
  }finally{await rm(root,{recursive:true,force:true});}
});
