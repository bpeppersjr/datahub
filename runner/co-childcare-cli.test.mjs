import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,symlink,rm} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {APP_ROOT} from './paths.mjs';
import contract from '../config/co-childcare-source-contract.json' with {type:'json'};
import {acquireCoChildcarePreflight,writeCoChildcarePreflight,CO_CHILDCARE_URLS,CO_CHILDCARE_CATEGORIES} from './co-childcare-preflight.mjs';

// Test-only process preload: any attempted network exits distinctly, rather
// than allowing the CLI's redacted-error path to hide an unintended request.
const trap='data:text/javascript,'+encodeURIComponent('globalThis.fetch=()=>{process.exit(91)}');
function run(args){return spawnSync(process.execPath,['--import',trap,'scripts/preflight-co-childcare.mjs',...args],{cwd:APP_ROOT,windowsHide:true,encoding:'utf8',timeout:10000});}
test('CO preflight CLI help and malformed options never acquire',()=>{
  const help=run(['--help']);assert.equal(help.status,0);assert.match(help.stdout,/no facility rows or provider-ID inventory/);assert.match(help.stdout,/offline/);
  for(const args of [['--help','--help'],['--url','https://private.invalid'],['--output','data/private'],['--download'],['--verify'],['--verify','relative'],['--verify',APP_ROOT,'--verify',APP_ROOT],['--verify',path.resolve(APP_ROOT,'..','outside.json')]]){
    const result=run(args);assert.equal(result.status,1);assert.equal(result.stdout,'');assert.equal(result.stderr.includes('private.invalid'),false);assert.equal(result.stderr.includes('outside.json'),false);
  }
});
test('CO offline verification rejects malformed, oversized and aliased receipts without writes or networking',async()=>{
  const root=await mkdtemp(path.join(APP_ROOT,'data/tmp/co-cli-test-'));
  try{
    const file=path.join(root,'receipt.json');
    for(const value of ['{}','null','{"schema_version":"forged","claims":{"acquisition_ready":true}}','{', ' '.repeat(4_000_001)]){
      await writeFile(file,value);const before=await readFile(file),result=run(['--verify',file]);assert.equal(result.status,1);assert.deepEqual(await readFile(file),before);assert.equal(result.stdout,'');
    }
    await mkdir(path.join(root,'directory'));assert.equal(run(['--verify',path.join(root,'directory')]).status,1);
    await symlink(root,path.join(root,'directory','alias'),'junction');assert.equal(run(['--verify',path.join(root,'directory','alias','receipt.json')]).status,1);
    assert.equal(run(['--verify',path.join(root,'missing.json')]).status,1);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('CO CLI independently verifies an immutable synthetic preflight offline',async()=>{
  const metadata={...structuredClone(contract),rowsUpdatedAt:1700000000,viewLastModified:1700000000,publicationDate:1700000000,metadata:{custom_fields:structuredClone(contract.custom)},columns:Object.entries(contract.fieldTypes).map(([fieldName,dataTypeName])=>({fieldName,dataTypeName,description:contract.descriptions[fieldName]??''}))};
  const groups=CO_CHILDCARE_CATEGORIES.map(provider_service_type=>({provider_service_type,source_rows:provider_service_type==='Child Care Center'?'3':'1'}));
  const aggregate=[{source_rows:'3',distinct_licenses:'3',address_count:'2',zip_count:'1',state_count:'3'}];let calls=0;
  const receipt=await acquireCoChildcarePreflight({fetchImpl:async url=>{calls++;const kind=Object.keys(CO_CHILDCARE_URLS).find(k=>CO_CHILDCARE_URLS[k]===url);assert.ok(kind);return Response.json(kind==='metadata'?metadata:kind==='groups'?groups:aggregate);}});
  assert.equal(calls,6);const saved=await writeCoChildcarePreflight(receipt);
  try{const before=await readFile(saved.path),result=run(['--verify',saved.path]);assert.equal(result.status,0,result.stderr);const verified=JSON.parse(result.stdout);assert.equal(verified.status,'verified');assert.equal(verified.sha256,saved.sha256);assert.equal(verified.bytes,saved.bytes);assert.deepEqual(verified.receipt,receipt);assert.equal(verified.receipt.execution_mode,'injected-test-transport');assert.equal(verified.receipt.readiness.acquisition_ready,false);assert.deepEqual(await readFile(saved.path),before);}
  finally{await rm(saved.path);}
});
