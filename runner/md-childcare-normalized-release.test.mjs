import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { watch } from 'node:fs';
import { mkdtemp, readFile, readdir, writeFile, rm, mkdir, symlink } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import test from 'node:test';
import { APP_ROOT } from './paths.mjs';
import { buildMdChildcareAcquiredReleaseWithTransport } from './md-childcare-acquired-release.mjs';
import { buildMdChildcareNormalizedRelease, readMdChildcareNormalizedRelease } from './md-childcare-normalized-release.mjs';
import { createMdChildcareFixture } from './md-childcare-test-fixtures.mjs';

const execute=promisify(execFile),hash=raw=>createHash('sha256').update(raw).digest('hex');
const readJson=async filename=>JSON.parse(await readFile(filename));

test('MD normalized release and CLI reject invalid modes and early cancellation',async()=>{
  const signal=AbortSignal.abort();
  await assert.rejects(buildMdChildcareNormalizedRelease('unread',{signal}),{name:'AbortError'});
  await assert.rejects(buildMdChildcareNormalizedRelease('unread',{url:'https://example.invalid'}));
  await assert.rejects(readMdChildcareNormalizedRelease('unread',{url:'https://example.invalid'}));
  for(const args of [[],['--acquired'],['--verify','relative.json'],['--acquired','x','--verify','y'],['--url','https://example.invalid']])
    await assert.rejects(execute(process.execPath,['scripts/reprocess-md-childcare.mjs',...args],{cwd:APP_ROOT,windowsHide:true}));
});

test('MD normalized releases conserve source rows, replay offline and reject rehashed substitutions without repulling',async()=>{
  const root=await mkdtemp(path.join(APP_ROOT,'data/tmp/md-normalized-test-'));
  try{
    const fixture=createMdChildcareFixture({count:3,mutate:(rows,kind)=>{
      if(kind!=='page')return;
      const features=rows.features;
      features[0].attributes.Zip_Code=null;features[0].attributes.Facility_Name=null;features[0].attributes.License_Number=null;features[0].geometry=null;
      features[1].attributes.Zip_Code=21201;
      for(const field of ['Facility_Name','DBA_Name','Street_Address','City'])features[2].attributes[field]='x'.repeat(8000);
    }});
    const acquired=await buildMdChildcareAcquiredReleaseWithTransport({fetchImpl:fixture.fetchImpl,outputRoot:path.join(root,'acquired')});
    const acquiredBytes=await readFile(acquired.manifest_path),acquisitionPath=path.join(path.dirname(acquired.manifest_path),'acquisition.json'),inputBytes=await readFile(acquisitionPath);
    const requests=fixture.calls.length,outputRoot=path.join(root,'normalized');
    let first,second;
    const oldFetch=globalThis.fetch;globalThis.fetch=()=>assert.fail('Normalization must not acquire data');
    try{
      first=await buildMdChildcareNormalizedRelease(acquired.manifest_path,{outputRoot});
      second=await buildMdChildcareNormalizedRelease(acquired.manifest_path,{outputRoot});
      const result=await readMdChildcareNormalizedRelease(first.manifest_path);
      assert.equal(result.verification.record_count,2);assert.equal(result.verification.quarantine_count,1);
      assert.equal(result.summary.source_records,3);assert.equal(result.summary.accepted_with_points,1);
      assert.equal(result.records[0].reported_address.zip_code,null);assert.equal(result.records[0].reported_address.zip4,null);
      assert.equal(result.records[0].geocode.latitude,null);
      assert.equal(result.records[0].business_name,null);assert.deepEqual(result.records[0].external_identifiers,[]);
      assert.equal(result.records[0].quality.name_unavailable_reason,'missing-source-name');assert.equal(result.records[0].quality.license_unavailable_reason,'missing-source-license');
      assert.equal(result.records[1].reported_address.zip_code,'21201');assert.equal(result.records[1].reported_address.postal_code,'21201');assert.equal(result.records[1].reported_address.zip4,null);
      assert.equal(result.records[1].claims.geographic_boundary_verified,false);
      assert.equal(result.manifest.acquired.manifest_sha256,hash(acquiredBytes));
      assert.equal(result.verification.public_export_authorized,false);assert.equal(result.verification.national_reporting_integrated,false);
      assert.equal(result.verification.current_operations_verified,false);assert.equal(result.verification.publisher_cohort_date,'2026-02-13');
      assert.notEqual(first.run_id,second.run_id);assert.notEqual(first.manifest_path,second.manifest_path);
      assert.equal(second.acquired_manifest_sha256,first.acquired_manifest_sha256);
      await assert.rejects(buildMdChildcareNormalizedRelease(acquired.manifest_path,{outputRoot:path.dirname(acquired.manifest_path)}));
      await assert.rejects(buildMdChildcareNormalizedRelease(acquired.manifest_path,{outputRoot:APP_ROOT}));
      await assert.rejects(buildMdChildcareNormalizedRelease(acquired.manifest_path,{processedAt:'2000-01-01T00:00:00.000Z',outputRoot}));
      await mkdir(path.join(root,'alias-target'));await symlink(path.join(root,'alias-target'),path.join(root,'alias'),'junction');
      await assert.rejects(buildMdChildcareNormalizedRelease(acquired.manifest_path,{outputRoot:path.join(root,'alias')}));
      await writeFile(path.join(outputRoot,'.owner.lock'),'foreign ownership');
      await assert.rejects(buildMdChildcareNormalizedRelease(acquired.manifest_path,{outputRoot}),{code:'EEXIST'});
      assert.equal(await readFile(path.join(outputRoot,'.owner.lock'),'utf8'),'foreign ownership');
    }finally{globalThis.fetch=oldFetch;}
    assert.deepEqual(await readFile(acquired.manifest_path),acquiredBytes);assert.deepEqual(await readFile(acquisitionPath),inputBytes);assert.equal(fixture.calls.length,requests);
    const cancelledRoot=path.join(root,'cancelled-normalized'),cancelledJobs=path.join(cancelledRoot,'jobs');
    await mkdir(cancelledJobs,{recursive:true});await writeFile(path.join(cancelledRoot,'keep.txt'),'unrelated');
    const controller=new AbortController();let sawOwnedJob=false;
    const watcher=watch(cancelledJobs,{persistent:false},(_event,name)=>{if(/^[a-f0-9-]{36}$/.test(String(name))){sawOwnedJob=true;controller.abort();}});
    const deadline=setTimeout(()=>controller.abort(),5000);
    try{
      await assert.rejects(buildMdChildcareNormalizedRelease(acquired.manifest_path,{outputRoot:cancelledRoot,signal:controller.signal}),{name:'AbortError'});
      assert.equal(sawOwnedJob,true);assert.deepEqual(await readdir(cancelledJobs),[]);
      assert.equal(await readFile(path.join(cancelledRoot,'keep.txt'),'utf8'),'unrelated');
      await assert.rejects(readFile(path.join(cancelledRoot,'.owner.lock')),{code:'ENOENT'});
      assert.deepEqual(await readFile(acquisitionPath),inputBytes);
    }finally{clearTimeout(deadline);watcher.close();}
    const verified=await execute(process.execPath,['scripts/reprocess-md-childcare.mjs','--verify',first.manifest_path],{cwd:APP_ROOT,windowsHide:true});
    assert.equal(JSON.parse(verified.stdout).record_count,2);
    const independent=await execute(process.execPath,['scripts/verify-md-childcare-normalized.mjs','--manifest',first.manifest_path],{cwd:APP_ROOT,windowsHide:true});assert.equal(JSON.parse(independent.stdout).quarantine_count,1);
    await assert.rejects(execute(process.execPath,['scripts/verify-md-childcare-normalized.mjs'],{cwd:APP_ROOT,windowsHide:true}));
    const rebuilt=await execute(process.execPath,['scripts/reprocess-md-childcare.mjs','--acquired',acquired.manifest_path,'--output',path.join(root,'cli-normalized')],{cwd:APP_ROOT,windowsHide:true});
    assert.equal(JSON.parse(rebuilt.stdout).acquired_manifest_sha256,first.acquired_manifest_sha256);
    const directory=path.dirname(first.manifest_path),recordsPath=path.join(directory,'normalized.jsonl');
    const manifestBytes=await readFile(first.manifest_path),recordsBytes=await readFile(recordsPath);
    const modeForgery=JSON.parse(manifestBytes);modeForgery.acquired.execution_mode='fixed-native-fetch';await writeFile(first.manifest_path,JSON.stringify(modeForgery)+'\n');await assert.rejects(readMdChildcareNormalizedRelease(first.manifest_path));await writeFile(first.manifest_path,manifestBytes);
    const rows=recordsBytes.toString('utf8').trim().split('\n').map(JSON.parse);rows[0].business_name='Rehashed substitution';
    const replacement=Buffer.from(rows.map(row=>JSON.stringify(row)+'\n').join(''));await writeFile(recordsPath,replacement);
    const manifest=JSON.parse(manifestBytes),artifact=manifest.artifacts.find(a=>a.path==='normalized.jsonl');artifact.bytes=replacement.length;artifact.sha256=hash(replacement);
    await writeFile(first.manifest_path,JSON.stringify(manifest)+'\n');await assert.rejects(readMdChildcareNormalizedRelease(first.manifest_path));
    await writeFile(recordsPath,recordsBytes);await writeFile(first.manifest_path,manifestBytes);
    assert.equal((await readMdChildcareNormalizedRelease(first.manifest_path)).verification.record_count,2);
    const corrupt=JSON.parse(inputBytes);corrupt.observations[1].payload.features[0].attributes.Facility_Name='Changed acquired row';await writeFile(acquisitionPath,JSON.stringify(corrupt)+'\n');
    await assert.rejects(readMdChildcareNormalizedRelease(first.manifest_path));await writeFile(acquisitionPath,inputBytes);
    assert.equal((await readMdChildcareNormalizedRelease(first.manifest_path)).verification.record_count,2);
    await writeFile(path.join(directory,'unexpected.txt'),'extra evidence');await assert.rejects(readMdChildcareNormalizedRelease(first.manifest_path));
    assert.equal((await readdir(path.join(outputRoot,'jobs'))).length,2);
    assert.equal((await readJson(second.manifest_path)).run_id,second.run_id);
  }finally{await rm(root,{recursive:true,force:true});}
});
