import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,readFile,writeFile,rm,access } from 'node:fs/promises';
import path from 'node:path';
import { APP_ROOT } from './paths.mjs';
import { loadCredentialCoverageEnrollment as load } from './credential-coverage-enrollment.mjs';

test('credential coverage enrollment distinguishes missing config/artifact and rejects unsafe bindings',async t=>{
  const root=await mkdtemp(path.join(APP_ROOT,'data/tmp/credential-enrollment-'));t.after(()=>rm(root,{recursive:true,force:true}));const configPath=path.join(root,'binding.json');
  assert.equal((await load({configPath})).status,'not-enrolled');
  const binding={schema_version:'credential-coverage-enrollment@1.0.0',manifest_path:'data/credential-reporting/absent-fixture/manifest.json',manifest_sha256:'a'.repeat(64)};
  await writeFile(configPath,JSON.stringify(binding));assert.equal((await load({configPath})).status,'unavailable');
  for(const value of [{...binding,manifest_path:'data/credential-reporting/../outside/manifest.json'},{...binding,manifest_sha256:'bad'},{...binding,extra:true}]){await writeFile(configPath,JSON.stringify(value));await assert.rejects(load({configPath}));}
});

test('credential coverage verifies actual retained release with no network and pinned identity',{timeout:120000},async t=>{
  const original=JSON.parse(await readFile(path.join(APP_ROOT,'config/credential-coverage-enrollment.json')));
  try{await access(path.join(APP_ROOT,original.manifest_path));}catch(error){if(error.code==='ENOENT'){t.skip('Exact internal credential release absent; no download performed.');return;}throw error;}
  const saved=globalThis.fetch;globalThis.fetch=()=>{throw Error('NO_NETWORK');};
  try{const result=await load();assert.equal(result.status,'available');assert.equal(result.coverage.allAcceptedCohortRows,11456);assert.equal(result.coverage.states.length,51);
    assert.equal(result.coverage.national50DcRows+result.coverage.outside50DcOrUnresolvedRows,11456);assert.equal(result.coverage.missingZip5Rows,1);
    assert.equal(result.evidence.reportingManifestSha256,original.manifest_sha256);assert.equal(result.nationalRegistryIntegrated,false);
    const root=await mkdtemp(path.join(APP_ROOT,'data/tmp/credential-enrollment-drift-'));t.after(()=>rm(root,{recursive:true,force:true}));const configPath=path.join(root,'binding.json');
    await writeFile(configPath,JSON.stringify({...original,manifest_sha256:'0'.repeat(64)}));await assert.rejects(load({configPath}));
  }finally{globalThis.fetch=saved;}
});
