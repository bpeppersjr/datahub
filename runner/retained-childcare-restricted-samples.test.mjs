import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import fs from 'node:fs/promises';
import {syncBuiltinESMExports} from 'node:module';
import {APP_ROOT} from './paths.mjs';
import {buildRetainedChildcareCohortSnapshot as build,readRetainedChildcareCohortSnapshot as read} from './retained-childcare-cohort-snapshot.mjs';
import {loadRestrictedChildcareSamples,validateRestrictedChildcareSamples,RESTRICTED_SAMPLE_INPUTS as pins} from './retained-childcare-restricted-samples.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

test('restricted sample adapter rejects injected options and cancellation',async()=>{
  await assert.rejects(build({includeRetainedSamples:false}));await assert.rejects(build({includeRetainedSamples:true,signal:AbortSignal.abort()}));
  await assert.rejects(loadRestrictedChildcareSamples({signal:AbortSignal.abort()}));
  for(const value of [{},null,{groups:[]}])assert.throws(()=>validateRestrictedChildcareSamples(value));
});

test('installed v2 derivative preserves inputs, rejects rehashed drift, and retains postcommit cancellation',{skip:process.env.DATAHUB_TEST_RESTRICTED_SAMPLES!=='1'},async()=>{
  const parent=path.join(APP_ROOT,'data/restricted-snapshot-tests');await mkdir(parent,{recursive:true});const outputRoot=await mkdtemp(path.join(parent,'run-'));
  const old=await readFile(path.join(APP_ROOT,pins.base_manifest));const previous=globalThis.fetch;globalThis.fetch=()=>assert.fail('no source request');
  try{
    const samples=await loadRestrictedChildcareSamples();assert.deepEqual(samples.groups.map(g=>[g.state,g.count,g.points_available]),[['OK',4,4],['NH',6,0]]);
    const result=await build({outputRoot,includeRetainedSamples:true});const saved=await read(result.manifest_path,result.manifest_sha256);
    assert.equal(saved.manifest.available_source_count,7);assert.equal(saved.verification.source_replay_performed_this_read,true);
    assert.deepEqual(saved.view.restricted_samples,samples);assert.equal((await read(result.manifest_path,result.manifest_sha256,{verifyRestrictedSources:false})).verification.source_replay_performed_this_read,false);
    const samplePath=path.join(path.dirname(result.manifest_path),'restricted-samples.json');
    const publish=async(change,manifestChange=()=>{})=>{
      const sample=structuredClone(samples),manifest=structuredClone(saved.manifest);change(sample);manifestChange(manifest);
      const bytes=Buffer.from(JSON.stringify(sample)+'\n');await writeFile(samplePath,bytes);manifest.artifacts[1].bytes=bytes.length;manifest.artifacts[1].sha256=hash(bytes);
      const raw=Buffer.from(JSON.stringify(manifest)+'\n');await writeFile(result.manifest_path,raw);return hash(raw);
    };
    for(const change of [v=>v.claims.public_export_authorized=true,v=>v.groups[0].rows[0].name='changed',v=>v.groups[0].rows[0].latitude=1,v=>v.groups[0].source_policy='changed',v=>v.inputs.ok_operation_id='wrong-parent',v=>v.groups[1].rows.pop()]){
      await assert.rejects(read(result.manifest_path,await publish(change)));
    }
    await assert.rejects(read(result.manifest_path,await publish(()=>{},m=>{m.started_at='2020-01-01T00:00:00.000Z';m.finished_at=m.started_at;})));
    const controller=new AbortController(),original=fs.link;let published=false;
    fs.link=async(...args)=>{await original(...args);if(path.basename(args[1])==='manifest.json'){published=true;controller.abort();}};syncBuiltinESMExports();
    try{const committed=await build({outputRoot,includeRetainedSamples:true,signal:controller.signal});assert.ok(published);assert.equal((await read(committed.manifest_path,committed.manifest_sha256)).manifest.available_source_count,7);}
    finally{fs.link=original;syncBuiltinESMExports();}
    assert.deepEqual(await readFile(path.join(APP_ROOT,pins.base_manifest)),old);
  }finally{globalThis.fetch=previous;assert.equal(path.dirname(outputRoot),parent);await rm(outputRoot,{recursive:true,force:true});}
});
