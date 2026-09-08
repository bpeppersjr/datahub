import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { APP_ROOT } from './paths.mjs';
import { buildMnConstructionCredentialRelease as build, verifyMnConstructionCredentialRelease as verify } from './mn-construction-credential-release.mjs';
import { loadMnConstructionCredentialReportingInput as load } from './mn-construction-credential-input.mjs';

const retained=path.join(APP_ROOT,'data/industry-segments/runs/a01b1819-420b-4036-a5fb-40f9c29ba861/state-mn-residential-contractors-MN/jobs/ebfad910-440e-46bb-b42b-2fc44b6d32f3/receipt.json');
test('MN credential reporting derives and verifies the retained cohort offline without changing source evidence',{timeout:120000},async t=>{
  try{await access(retained);}catch(error){if(error.code==='ENOENT'){t.skip('Exact retained internal cohort absent; no source downloaded.');return;}throw error;}
  const root=await mkdtemp(path.join(APP_ROOT,'data/tmp/mn-credential-release-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const original=await readFile(retained),fetchOriginal=globalThis.fetch;globalThis.fetch=()=>{throw Error('NO_NETWORK');};
  try{
    const sourceRoster=await readdir(path.dirname(retained));
    await assert.rejects(build(retained,{outputRoot:path.dirname(retained)}));
    await assert.rejects(build(retained,{outputRoot:path.join(path.dirname(retained),'nested')}));
    assert.deepEqual(await readdir(path.dirname(retained)),sourceRoster);
    const result=await build(retained,{outputRoot:root}),verified=await verify(result.manifest_path);
    assert.equal(verified.manifest_sha256,result.manifest_sha256);assert.equal(result.manifest.artifacts[0].records,11456);
    assert.equal(result.manifest.summary.rows_without_reported_zip5,1);
    assert.equal(result.manifest.semantics.national_reporting_integrated,false);
    assert.deepEqual(await readFile(retained),original);
    const manifestOriginal=await readFile(result.manifest_path),changed=JSON.parse(manifestOriginal);
    changed.semantics.identity_matching_eligible=true;await writeFile(result.manifest_path,JSON.stringify(changed));await assert.rejects(verify(result.manifest_path));await writeFile(result.manifest_path,manifestOriginal);
    const old=JSON.parse(manifestOriginal);old.created_at='2000-01-01T00:00:00.000Z';await writeFile(result.manifest_path,JSON.stringify(old));await assert.rejects(verify(result.manifest_path));await writeFile(result.manifest_path,manifestOriginal);
    const data=path.join(path.dirname(result.manifest_path),'credentials.jsonl');const bytes=await readFile(data);await writeFile(data,bytes.subarray(bytes.indexOf(10)+1));await assert.rejects(verify(result.manifest_path));await writeFile(data,bytes);
    await assert.rejects(build(retained,{outputRoot:path.dirname(result.manifest_path)}));
    const before=await readdir(root);await assert.rejects(build(retained,{outputRoot:root,signal:AbortSignal.abort()}));assert.deepEqual(await readdir(root),before);
    await assert.rejects(load(retained,{fetchImpl:()=>{}}));
  }finally{globalThis.fetch=fetchOriginal;}
});

test('MN credential reporting CLI strictly separates offline build and verification',async()=>{
  const exec=promisify(execFile),invoke=args=>exec(process.execPath,['scripts/build-mn-credential-reporting.mjs',...args],{cwd:APP_ROOT,windowsHide:true});
  assert.match((await invoke(['--help'])).stdout,/no downloads/);
  for(const args of [[],['--receipt'],['--receipt','x','--receipt','y'],['--verify','x','--output','y'],['--url','PRIVATE_CANARY'],['--help','--receipt','x']])
    await assert.rejects(invoke(args),error=>{assert.doesNotMatch(error.stderr,/PRIVATE_CANARY/);return true;});
});
