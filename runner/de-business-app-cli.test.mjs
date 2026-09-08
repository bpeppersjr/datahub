import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp,mkdir,writeFile,access,rm,readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { buildDeBusinessLicenses, DE_BUSINESS_LICENSE_SCHEMA } from './de-business-licenses.mjs';
import path from 'node:path';
import { APP_ROOT } from './paths.mjs';
const exec=promisify(execFile);
const invoke=(script,args,preload)=>exec(process.execPath,[...(preload?['--import',preload]:[]),`scripts/${script}-de-business-app.mjs`,...args],{cwd:APP_ROOT,timeout:10000,windowsHide:true});

test('DE app CLI help is side-effect-free and malformed options never create output',async t=>{
  const root=await mkdtemp(path.join(APP_ROOT,'data/tmp/de-app-cli-'));t.after(()=>rm(root,{recursive:true,force:true}));const output=path.join(root,'absent');
  for(const script of ['run','verify'])assert.match((await invoke(script,['--help'])).stdout,/Usage:/);
  for(const args of [['--unknown','secret'],['--output'],['--output',output,'--output',output],['--retained-manifest','one','--retained-manifest','two'],['--help','--output',output],['--output',output,'--url','https://example.com']]){
    await assert.rejects(invoke('run',args),error=>{assert.doesNotMatch(error.stderr,/secret|example\.com/);assert.match(error.stderr,/Preserve and inspect/);return true;});
    await assert.rejects(access(output),{code:'ENOENT'});
  }
  for(const args of [[],['--receipt'],['--receipt','one','--receipt','two'],['--url','secret']])await assert.rejects(invoke('verify',args),error=>{assert.match(error.stderr,/no source acquisition/);assert.doesNotMatch(error.stderr,/secret/);return true;});
});

test('DE app CLI uses cooperative cancellation and exposes no transport overrides',async()=>{
  for(const script of ['run','verify']){
    const source=await readFile(path.join(APP_ROOT,`scripts/${script}-de-business-app.mjs`),'utf8');
    assert.match(source,/createCliCancellation/);assert.match(source,/finally \{cancellation.dispose\(\);\}/);assert.match(source,/signal:cancellation.signal/);
    assert.doesNotMatch(source,/fetchImpl|resourceProbe|onBeforeCommit|onAfterCommit|error\.message/);
  }
});

test('DE app CLI verifies a synthetic retained release and its durable job without reacquisition',async t=>{
  const root=await mkdtemp(path.join(APP_ROOT,'data/tmp/de-app-cli-retained-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const baseline=path.join(root,'baseline');await mkdir(path.join(baseline,'derived'),{recursive:true});
  const bytes=Buffer.from(JSON.stringify({zip_code:'19801',geography:{},employer_baseline:{}})+'\n');
  await writeFile(path.join(baseline,'derived/zip-coverage.jsonl'),bytes);
  await writeFile(path.join(baseline,'manifest.json'),JSON.stringify({dataset_id:'census-zbp-baseline',complete_national_release:true,release_id:'fixture',artifacts:[{path:'derived/zip-coverage.jsonl',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}]}));
  await writeFile(path.join(baseline,'current.json'),JSON.stringify({manifest:'manifest.json'}));
  const row={socrata_row_id:'one',business_name:'Synthetic Fixture LLC',license_number:'2026000001',category:'RETAIL',current_license_valid_from:'2026-01-01T00:00:00.000',current_license_valid_to:'2026-12-31T00:00:00.000',address_1:'100 Market St',city:'Wilmington',state:'DE',zip:'19801',country:'UNITED STATES'};
  const source=await buildDeBusinessLicenses({outputRoot:path.join(root,'source'),zbpPointer:path.join(baseline,'current.json'),sourceRecords:[row],catalogMetadata:{id:'5zy2-grhr',name:'Delaware Business Licenses',attribution:'Department of Finance, Division of Revenue',description:'Information for businesses currently licensed in Delaware.',license:{name:'Public Domain'},rowsUpdatedAt:1788175917,sourceRecordCount:1,distinctLicenseCount:1,columns:DE_BUSINESS_LICENSE_SCHEMA.map(([fieldName,dataTypeName])=>({fieldName,dataTypeName}))},minimumLicenseRows:1,logger:()=>{},fetchImpl:()=>{throw Error('No fixture network');},resourceProbe:async()=>({availableDiskBytes:2n**40n,freeMemoryBytes:2**31,heapLimitBytes:2**30})});
  const before=await readFile(source.pointerPath),guard=path.join(root,'no-network.mjs');
  await writeFile(guard,"globalThis.fetch=()=>{throw Error('No network permitted in retained CLI test');};\n");
  const {pathToFileURL}=await import('node:url');const preload=pathToFileURL(guard).href;
  const result=JSON.parse((await invoke('run',['--output',path.join(root,'app'),'--retained-manifest',path.join(source.releaseDirectory,'manifest.json')],preload)).stdout);
  assert.equal(result.receipt.status,'SUCCEEDED');assert.equal(result.receipt.execution_mode,'retained-local-verification');
  const verified=JSON.parse((await invoke('verify',['--receipt',result.receiptPath],preload)).stdout);
  assert.ok(JSON.stringify(verified).includes('retained-local-verification'));
  assert.deepEqual(await readFile(source.pointerPath),before);
});
