import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import {existsSync,readdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {APP_ROOT} from './paths.mjs';
import {publishZipActiveEvidenceIndex,verifyZipActiveEvidenceIndex,readZipActiveEvidenceLookup} from './zip-active-evidence-index.mjs';

// Instrument a memory-only copy to test private mechanics with a small explicit
// contract. Installed entry points expose no fixture/loader/mapping override.
const moduleUrl=new URL('./zip-active-evidence-index.mjs',import.meta.url);
const source=(await fs.readFile(moduleUrl,'utf8')).replace(/from '(\.\/[^']+)'/g,(_,relative)=>`from '${new URL(relative,moduleUrl).href}'`);
const {fixtureInternals:core}=await import(`data:text/javascript;base64,${Buffer.from(`${source}\nexport const fixtureInternals={publish,verify,lookup,scan,loadRegistered};`).toString('base64')}`);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),bytes=value=>Buffer.from(`${JSON.stringify(value)}\n`),createdAt='2026-10-02T17:00:00.000Z';
async function fixture(t){
 await fs.mkdir(path.join(APP_ROOT,'data/tmp'),{recursive:true});const root=await fs.mkdtemp(path.join(APP_ROOT,'data/tmp/zip-index-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const sourceDir=path.join(root,'data/zip-active-evidence-qualification/releases/source-fixture');await fs.mkdir(sourceDir,{recursive:true});
 const sources=['alpha','beta'].map(source_key=>({source_key,source_release_id:`release-${source_key}`,source_kind:'record-level-evidence',category_ids:[`${source_key}-category`]}));
 const row=(zip5,key,value)=>({zip5,source_key:key,source_release_id:`release-${key}`,source_kind:'record-level-evidence',qualification:'unmeasured',evidence_counts_by_unit:{record_count:value},eligible_evidence_counts_by_unit:{record_count:null},source_reference_metadata:{source_release_id:`release-${key}`,observed_at:'2026-10-01'},current_operations_verified:false,current_operating_business_count:null,all_business_denominator:null,all_business_completion_percent:null});
 const rows=[row('00501','alpha',0),row('00501','beta',3),row('00502','alpha',1),row('00504','alpha',0)],projection={claims:{export_policy:'internal'},conservation:[{source_key:'alpha',counts_by_unit:{record_count:1},positive_zip_members:1},{source_key:'beta',counts_by_unit:{record_count:3},positive_zip_members:1}]};
 const artifacts=[];async function put(name,data,records){await fs.writeFile(path.join(sourceDir,name),data);artifacts.push({path:name,bytes:data.length,sha256:hash(data),record_count:records});}
 await put('projection.json',bytes(projection),1);await put('rows-0000.jsonl',bytes(rows[0]),1);await put('rows-0001.jsonl',Buffer.concat(rows.slice(1).map(bytes)),3);
 const manifest={release_id:'source-fixture',created_at:'2026-10-02T16:30:00.000Z',source_zip_rows:4,artifacts};await fs.writeFile(path.join(sourceDir,'manifest.json'),bytes(manifest));
 const reads=[];for(const name of ['projection.json','manifest.json'])reads.push({file:path.join(sourceDir,name),identity:await fs.lstat(path.join(sourceDir,name),{bigint:true})});
 return {root,sourceDir,rows,manifest,projection,mapping:{sources},binding:{registration_sha256:'a'.repeat(64),source_manifest_sha256:hash(bytes(manifest)),source_inventory_sha256:hash(JSON.stringify(artifacts)),mapping_version:'fixture-map@1',taxonomy_version:'fixture-taxonomy@1'},reads,sourceDirectoryIdentity:await fs.lstat(sourceDir,{bigint:true})};
}
const lookup=(r,zip,c,signal)=>core.lookup(r.directory,r.manifest_sha256,zip,c,signal);
test('immutable index verifies exact ranges, crossing ZIPs, source categories, zero versus absence and reuse',async t=>{
 const context=await fixture(t),result=await core.publish(context,createdAt),verified=await core.verify(result.directory,context);
 assert.equal(verified.manifest.source_zip_rows,4);assert.equal(verified.manifest.indexed_zip_count,3);assert.equal(verified.manifest.claims.export_policy,'internal');
 const first=await lookup(result,'00501',context);assert.deepEqual(first.rows,context.rows.slice(0,2));assert.equal(first.source_shards_read,2);assert.deepEqual(first.categories_by_source,{alpha:['alpha-category'],beta:['beta-category']});
 const zero=await lookup(result,'00504',context);assert.equal(zero.status,'present');assert.equal(zero.rows[0].evidence_counts_by_unit.record_count,0);assert.equal(zero.rows[0].eligible_evidence_counts_by_unit.record_count,null);
 const absent=await lookup(result,'00503',context);assert.equal(absent.status,'absent-from-source-rows');assert.deepEqual(absent.rows,[]);assert.equal(absent.claims.active_business_count,null);assert.equal(absent.source_shards_read,0);
 assert.equal((await lookup(result,'99999',context)).status,'absent-from-source-rows');assert.equal((await core.publish(context,createdAt)).reused,true);
 assert.equal(existsSync(path.join(context.root,'data/zip-active-evidence-index/current.json')),false);
});
test('lookup reads only requested source shards; full verifier still detects unrelated tampering',async t=>{
 const context=await fixture(t),result=await core.publish(context,createdAt);
 await fs.writeFile(path.join(context.sourceDir,'rows-0000.jsonl'),'bad\n');
 assert.equal((await lookup(result,'00504',context)).rows.length,1);
 await assert.rejects(lookup(result,'00501',context));await assert.rejects(core.verify(result.directory,context));
});
test('index pin, rehashed offsets, extra entries, hardlinks and source tamper fail closed',async t=>{
 for(const mode of ['pin','offset','extra','hardlink','source','rehashed']){
  const context=await fixture(t),result=await core.publish(context,createdAt),bucket=path.join(result.directory,'zip-00.json');
  if(mode==='pin'){await assert.rejects(core.lookup(result.directory,'0'.repeat(64),'00501',context));continue;}
  if(mode==='extra')await fs.writeFile(path.join(result.directory,'current.json'),'{}');
  if(mode==='hardlink')await fs.link(bucket,path.join(context.root,'duplicate.json'));
  if(mode==='source')await fs.writeFile(path.join(context.sourceDir,'rows-0001.jsonl'),'{}\n');
  if(mode==='offset'||mode==='rehashed'){
   const entries=JSON.parse(await fs.readFile(bucket));entries[0].segments[0].offset++;
   const raw=bytes(entries);await fs.writeFile(bucket,raw);
   if(mode==='rehashed'){
    const file=path.join(result.directory,'manifest.json'),manifest=JSON.parse(await fs.readFile(file));manifest.artifacts[0].bytes=raw.length;manifest.artifacts[0].sha256=hash(raw);
    const {release_id,...body}=manifest;void release_id;manifest.release_id=`zip-active-evidence-index-${hash(JSON.stringify(body))}`;
    await fs.writeFile(file,bytes(manifest));const moved=path.join(path.dirname(result.directory),manifest.release_id);await fs.rename(result.directory,moved);result.directory=moved;result.manifest_sha256=hash(bytes(manifest));
   }
  }
  await assert.rejects(core.verify(result.directory,context));await assert.rejects(lookup(result,'00501',context));
 }
});
test('full reconstruction detects an omitted ZIP in a locally consistent rehashed index',async t=>{
 const context=await fixture(t),result=await core.publish(context,createdAt),originalPin=result.manifest_sha256;
 const file=path.join(result.directory,'manifest.json'),manifest=JSON.parse(await fs.readFile(file)),bucket=path.join(result.directory,'zip-00.json');
 const entries=JSON.parse(await fs.readFile(bucket));assert.equal(entries.length,3);
 const retained=entries.filter(entry=>entry.zip5!=='00504');assert.equal(retained.length,2);
 const raw=bytes(retained);await fs.writeFile(bucket,raw);
 Object.assign(manifest.artifacts[0],{bytes:raw.length,sha256:hash(raw),zip_count:retained.length});
 manifest.indexed_zip_count=retained.length;
 // source_zip_rows remains the correctly bound SOURCE total. Every local ZIP
 // count, bucket hash/size and content identity is recomputed for the omission.
 const {release_id,...body}=manifest;void release_id;
 manifest.release_id=`zip-active-evidence-index-${hash(JSON.stringify(body))}`;
 const manifestBytes=bytes(manifest);await fs.writeFile(file,manifestBytes);
 const moved=path.join(path.dirname(result.directory),manifest.release_id);await fs.rename(result.directory,moved);
 result.directory=moved;result.manifest_sha256=hash(manifestBytes);
 await assert.rejects(core.lookup(moved,originalPin,'00504',context),/pinned index manifest/);
 // An arbitrary forged pin passes bounded metadata/bucket checks, illustrating
 // why lookup pins must originate from publication or full verification.
 assert.equal((await lookup(result,'00504',context)).status,'absent-from-source-rows');
 assert.equal((await lookup(result,'00501',context)).source_zip_rows,2);
 await assert.rejects(core.verify(moved,context),/independent index reconstruction/);
});
test('concurrency converges or refuses the occupied guard; cancellation cleans only owned staging',async t=>{
 const context=await fixture(t),results=await Promise.allSettled([core.publish(context,createdAt),core.publish(context,createdAt)]);
 assert.ok(results.some(r=>r.status==='fulfilled'));for(const r of results)if(r.status==='rejected')assert.equal(r.reason.code,'EEXIST');
 assert.equal((await core.publish(context,createdAt)).reused,true);
 for(const phase of ['pre','stage','published']){
  const c=await fixture(t),controller=new AbortController(),base=path.join(c.root,'data/zip-active-evidence-index');
  if(phase==='pre')controller.abort();else{const original=controller.signal.throwIfAborted.bind(controller.signal);controller.signal.throwIfAborted=()=>{const dir=path.join(base,phase==='stage'?'.staging':'releases');if(existsSync(dir)&&readdirSync(dir).some(name=>phase==='published'||existsSync(path.join(dir,name,'zip-00.json'))))controller.abort();original();};}
  await assert.rejects(core.publish(c,createdAt,controller.signal),error=>{assert.match(error.message,/abort/i);if(phase==='published')assert.equal(error.inspection_required,true);return true;});
  if(phase!=='pre'){assert.deepEqual(await fs.readdir(path.join(base,'.locks')),[]);assert.deepEqual(await fs.readdir(path.join(base,'.staging')),[]);if(phase==='published')assert.equal((await core.publish(c,createdAt)).reused,true);}
 }
});
test('lock cleanup failures preserve publication state and never remove replacement ownership',async t=>{
 for(const mode of ['unlink','replacement']){
  const c=await fixture(t),originalOpen=fs.open,originalUnlink=fs.unlink,lockDir=path.join(c.root,'data/zip-active-evidence-index/.locks');let stub;
  if(mode==='unlink')stub=t.mock.method(fs,'unlink',async(file,...args)=>{if(path.dirname(file)===lockDir)throw Error('injected');return originalUnlink(file,...args);});
  else stub=t.mock.method(fs,'open',async(file,...args)=>{const handle=await originalOpen(file,...args);if(path.dirname(file)!==lockDir)return handle;return {stat:handle.stat.bind(handle),close:async()=>{await handle.close();await fs.rename(file,path.join(c.root,'original.lock'));await fs.writeFile(file,'replacement');}};});
  let error;try{await core.publish(c,createdAt);}catch(e){error=e;}finally{stub.mock.restore();}
  assert.equal(error.code,'ZIP_INDEX_INSPECTION_REQUIRED');assert.equal(error.recovery.publication_state,'published');assert.equal((await fs.readdir(lockDir)).length,1);
  if(mode==='replacement')assert.equal(await fs.readFile(path.join(lockDir,(await fs.readdir(lockDir))[0]),'utf8'),'replacement');
 }
});
test('public entry points reject injected contracts and alternate-root authored mappings',async t=>{
 const c=await fixture(t);for(const call of [()=>publishZipActiveEvidenceIndex({root:c.root,createdAt,context:c}),()=>readZipActiveEvidenceLookup({root:c.root,contract:c}),()=>verifyZipActiveEvidenceIndex('manifest.json',{root:c.root,loader:()=>c})])await assert.rejects(call(),/unsupported option/);
 await fs.mkdir(path.join(c.root,'config/datasets'),{recursive:true});await fs.writeFile(path.join(c.root,'config/datasets/zip-active-evidence-qualification.json'),'{}');await fs.writeFile(path.join(c.root,'config/datasets/zip-evidence-category-map.json'),'{}');await fs.writeFile(path.join(c.root,'config/zip-evidence-category-map.json'),JSON.stringify(c.mapping));
 await assert.rejects(publishZipActiveEvidenceIndex({root:c.root,createdAt}),/authored mapping/);
 await assert.rejects(readZipActiveEvidenceLookup({root:c.root,manifestPath:path.join(c.root,'manifest.json'),manifestSha256:'0'.repeat(64),zip5:'00501'}),/authored mapping/);
 await assert.rejects(verifyZipActiveEvidenceIndex(path.join(c.root,'manifest.json'),{root:c.root}),/authored mapping/);
});

test('directory aliases, invalid ZIPs, in-flight input mutation and reader cancellation reject',async t=>{
 const c=await fixture(t),r=await core.publish(c,createdAt),alias=path.join(c.root,'alias');await fs.symlink(r.directory,alias,'junction');
 await assert.rejects(core.lookup(alias,r.manifest_sha256,'00501',c));
 for(const zip of ['501','00501-0001','../00','ABCDE'])await assert.rejects(lookup(r,zip,c));
 const controller=new AbortController();let calls=0;const original=controller.signal.throwIfAborted.bind(controller.signal);
 controller.signal.throwIfAborted=()=>{if(++calls===10)controller.abort();original();};
 await assert.rejects(core.verify(r.directory,c,controller.signal),/abort/i);assert.equal((await core.verify(r.directory,c)).manifest.source_zip_rows,4);
 const mutation=new AbortController();let changed=false;mutation.signal.throwIfAborted=()=>{if(!changed){changed=true;writeFileSync(path.join(c.sourceDir,'rows-0000.jsonl'),'{}\n');}};
 await assert.rejects(core.verify(r.directory,c,mutation.signal));
});

test('cleanup fault annotates original cancellation rather than replacing it',async t=>{
 const c=await fixture(t),controller=new AbortController(),primary=new Error('fixture cancellation'),base=path.join(c.root,'data/zip-active-evidence-index');
 const originalCheck=controller.signal.throwIfAborted.bind(controller.signal);controller.signal.throwIfAborted=()=>{const stages=path.join(base,'.staging');if(existsSync(stages)&&readdirSync(stages).some(name=>existsSync(path.join(stages,name,'zip-00.json'))))controller.abort(primary);originalCheck();};
 const unlink=fs.unlink,stub=t.mock.method(fs,'unlink',async(file,...args)=>{if(path.dirname(file)===path.join(base,'.locks'))throw Error('secondary failure');return unlink(file,...args);});
 try{await assert.rejects(core.publish(c,createdAt,controller.signal),error=>{assert.equal(error,primary);assert.equal(error.recovery.publication_state,'not-published');assert.equal(error.inspection_required,true);return true;});}finally{stub.mock.restore();}
});

test('installed source-only index audit conserves current29-row ZIPs and1349 shard crossings',{skip:process.env.DATAHUB_TEST_ZIP_INDEX_NATIVE_SCAN!=='1'},async()=>{
 const context=await core.loadRegistered(APP_ROOT),result=await core.scan(context),entries=[...result.buckets.values()].flat();
 assert.equal(result.total,1_397_626);assert.equal(result.zipCount,48_194);assert.ok(entries.every(entry=>entry.row_count===29));
 assert.equal(Math.max(...entries.map(entry=>entry.segments.length)),2);assert.equal(entries.filter(entry=>entry.segments.length>1).length,1349);
});
