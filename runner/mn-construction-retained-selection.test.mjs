import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import path from 'node:path';
import { APP_ROOT } from './paths.mjs';
import { MN_CONSTRUCTION_COLUMNS } from './mn-construction-preflight.mjs';
import { buildMnConstructionRetainedSelection as build, verifyMnConstructionRetainedSelection as verify } from './mn-construction-retained-selection.mjs';
const context={runId:'fixture-run',sourceReleaseId:'fixture-release',observedAt:'2026-09-08T12:00:00.000Z',cohort:'residential'};
const csv=()=>Buffer.from(MN_CONSTRUCTION_COLUMNS.join(',')+'\r\n'+[true,false].map(b=>{
  const row={...Object.fromEntries(MN_CONSTRUCTION_COLUMNS.map(k=>[k,''])),Bus_Pers:b?'Business':'Person',Status:'Issued',Lic_Number:'BC123456',Name:b?'Fixture Contractor':'SECRET PERSON',Phone_No:'SECRET PHONE',Email_Address:'SECRET EMAIL',St:'MN',Zip:'00501-0012'};
  return MN_CONSTRUCTION_COLUMNS.map(k=>`"${row[k]}"`).join(',')+'\r\n';}).join(''));
const source=()=>Readable.from([csv()]);
const sha=v=>createHash('sha256').update(v).digest('hex');
async function fixture(t){const base=path.join(APP_ROOT,'data/tmp');await fs.mkdir(base,{recursive:true});const root=await fs.mkdtemp(path.join(base,'mn-retained-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;}
async function bundle(t){const root=await fixture(t);const result=await build(source(),{context,outputRoot:path.join(root,'output')});return {root,...result,directory:path.dirname(result.manifest_path)};}
test('MN durable selection writes only selected evidence and replays disk bytes without fetching',async t=>{
  t.mock.method(globalThis,'fetch',()=>assert.fail('No provider calls'));const b=await bundle(t),result=await verify(b.manifest_path);
  assert.equal(result.manifest.counts.source_records,2);assert.equal(result.manifest.counts.accepted_records,1);assert.equal(result.manifest.counts.rejected_records,1);
  assert.equal(result.verification.accepted_records_replayed,true);assert.equal(result.manifest.claims.native_acquisition_verified,false);
  assert.deepEqual((await fs.readdir(b.directory)).sort(),['manifest.json','normalized.jsonl','selected.jsonl','selection-receipt.json']);
  for(const name of await fs.readdir(b.directory))assert.ok(!(await fs.readFile(path.join(b.directory,name),'utf8')).includes('SECRET'));
  const receipt=JSON.parse(await fs.readFile(path.join(b.directory,'selection-receipt.json')));assert.equal(receipt.source_file_sha256,sha(csv()));
  const normalized=JSON.parse(await fs.readFile(path.join(b.directory,'normalized.jsonl')));assert.equal(normalized.reported_address.zip4,'0012');assert.equal(normalized.geocode.latitude,null);
  const prior=await fs.readFile(b.manifest_path);const second=await build(source(),{context,outputRoot:path.dirname(b.directory)});assert.notEqual(second.bundle_id,b.bundle_id);assert.deepEqual(await fs.readFile(b.manifest_path),prior);
});
test('MN verifier rejects rehashed normalized mutations and extra/private artifacts',async t=>{
  const b=await bundle(t),file=path.join(b.directory,'normalized.jsonl'),manifest=JSON.parse(await fs.readFile(b.manifest_path));
  const normalized=JSON.parse(await fs.readFile(file));normalized.geocode.latitude=44;const raw=Buffer.from(JSON.stringify(normalized)+'\n');await fs.writeFile(file,raw);
  manifest.artifacts[2].sha256=sha(raw);manifest.artifacts[2].bytes=raw.length;await fs.writeFile(b.manifest_path,JSON.stringify(manifest)+'\n');await assert.rejects(verify(b.manifest_path));
  const clean=await build(source(),{context,outputRoot:path.join(b.root,'other')});await fs.writeFile(path.join(path.dirname(clean.manifest_path),'private.txt'),'SECRET');await assert.rejects(verify(clean.manifest_path));
});
test('MN schema failures retain incomplete evidence without a success manifest',async t=>{
  const root=await fixture(t),outputRoot=path.join(root,'output');await assert.rejects(build(Readable.from([Buffer.from('wrong,header\nSECRET')]),{context,outputRoot}),/incomplete evidence retained/);
  const entries=await fs.readdir(outputRoot);assert.equal(entries.length,1);const directory=path.join(outputRoot,entries[0]);assert.deepEqual(await fs.readdir(directory),['selected.jsonl']);await assert.rejects(verify(path.join(directory,'manifest.json')));
});
test('MN cancellation removes only its owned incomplete bundle and preserves prior evidence',async t=>{
  const b=await bundle(t),prior=await fs.readFile(b.manifest_path),controller=new AbortController();let started=false;
  const stalled=new Readable({read(){if(!started){started=true;this.push(csv());setImmediate(()=>controller.abort());}}});
  await assert.rejects(build(stalled,{context,signal:controller.signal,outputRoot:path.dirname(b.directory)}),e=>e.name==='AbortError');
  assert.deepEqual(await fs.readdir(path.dirname(b.directory)),[b.bundle_id]);assert.deepEqual(await fs.readFile(b.manifest_path),prior);
  const pre=new AbortController();pre.abort();await assert.rejects(build(source(),{context,signal:pre.signal,outputRoot:path.join(b.root,'never-created')}));await assert.rejects(fs.stat(path.join(b.root,'never-created')),{code:'ENOENT'});
});
test('MN rejects unsafe outputs before reading source and rejects linked retained files',async t=>{
  const b=await bundle(t);await fs.symlink(b.root,path.join(b.root,'alias'),'junction');
  for(const outputRoot of [APP_ROOT,path.join(b.root,'alias','out'),path.join(b.directory,'nested'),path.join(b.root,'ReLeAsEs','out'),path.join(b.root,'trailing.','out')]){
    const unread=new Readable({read(){assert.fail('Unsafe path read source');}});await assert.rejects(build(unread,{context,outputRoot}));unread.destroy();
  }
  await fs.link(path.join(b.directory,'selected.jsonl'),path.join(b.root,'linked-selected'));await assert.rejects(verify(b.manifest_path));
});
test('MN disk floor fails before input consumption or output creation',async t=>{
  const root=await fixture(t);t.mock.method(fs,'statfs',async()=>({bavail:0n,bsize:4096n}));syncBuiltinESMExports();t.after(()=>{t.mock.restoreAll();syncBuiltinESMExports();});
  const unread=new Readable({read(){assert.fail('No source on insufficient disk');}});await assert.rejects(build(unread,{context,outputRoot:path.join(root,'output')}),/disk headroom/);unread.destroy();assert.deepEqual(await fs.readdir(root),[]);
});
test('MN publication refuses an in-place artifact mutation after replay',async t=>{
  const root=await fixture(t),outputRoot=path.join(root,'output'),original=fs.lstat;let mutated=false,manifestStats=0;
  t.mock.method(fs,'lstat',async function(file,...args){
    if(String(file).endsWith('manifest.tmp'))manifestStats++;
    if(!mutated&&String(file).endsWith('manifest.tmp')&&manifestStats===4){
      const directory=path.dirname(file);const normalized=path.join(directory,'normalized.jsonl');
      // Fourth lookup starts the second manifest read, after full disk replay
      // and cross-file checks. Inode-only final checks used to miss this edit.
      try{await original(file);const raw=await fs.readFile(normalized);await fs.writeFile(normalized,Buffer.from(raw.toString().replace('Fixture Contractor','Fixture ContracTOR')));mutated=true;}catch(e){if(e.code!=='ENOENT')throw e;}
    }
    return original.call(this,file,...args);
  });syncBuiltinESMExports();t.after(()=>{t.mock.restoreAll();syncBuiltinESMExports();});
  await assert.rejects(build(source(),{context,outputRoot}));assert.equal(mutated,true);const [id]=await fs.readdir(outputRoot);await assert.rejects(fs.stat(path.join(outputRoot,id,'manifest.json')),{code:'ENOENT'});
});
test('MN writer initialization failure closes its opened handle',async t=>{
  const root=await fixture(t),original=fs.open;let closed=false;
  t.mock.method(fs,'open',async function(file,flags,...args){const handle=await original.call(this,file,flags,...args);if(flags==='wx'&&String(file).endsWith('selected.jsonl')){
    const close=handle.close.bind(handle);handle.close=async()=>{closed=true;return close();};handle.stat=async()=>{throw new Error('fixture stat failure');};}return handle;});
  syncBuiltinESMExports();t.after(()=>{t.mock.restoreAll();syncBuiltinESMExports();});
  await assert.rejects(build(source(),{context,outputRoot:path.join(root,'output')}));assert.equal(closed,true);
});
