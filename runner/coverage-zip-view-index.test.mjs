import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import {existsSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {APP_ROOT} from './paths.mjs';
import {publishCoverageZipViewIndex,verifyCoverageZipViewIndex,readCoverageZipViewLookup} from './coverage-zip-view-index.mjs';

// Private fixture mechanics remain memory-only, never a public runtime bypass.
const url=new URL('./coverage-zip-view-index.mjs',import.meta.url);
const source=(await fs.readFile(url,'utf8')).replace(/from '(\.\/[^']+)'/g,(_,r)=>`from '${new URL(r,url).href}'`);
const {core}=await import(`data:text/javascript;base64,${Buffer.from(`${source}\nexport const core={publish,verify,lookup,scan,loadRegistered};`).toString('base64')}`);
const hash=x=>createHash('sha256').update(x).digest('hex'),bytes=x=>Buffer.from(`${JSON.stringify(x)}\n`),createdAt='2026-10-02T19:00:00.000Z';
async function fixture(t){
 await fs.mkdir(path.join(APP_ROOT,'data/tmp'),{recursive:true});const root=await fs.mkdtemp(path.join(APP_ROOT,'data/tmp/coverage-zip-index-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const sourceDir=path.join(root,'data/business-coverage-views/releases/fixture'),file=path.join(sourceDir,'views/zips.jsonl');await fs.mkdir(path.dirname(file),{recursive:true});
 const rows=[{zip_code:'00000',complete_all_businesses:false,registry_coverage:{status:'record-level-source-contribution'},physical_site_count:1,zcta_geoid:null,source_contributions:{alpha:{site_count:1}},zip4:null},{zip_code:'00501',complete_all_businesses:false,registry_coverage:{status:'denominator-only-no-record-level-contribution'},physical_site_count:0,employer_establishments:null,zcta_geoid:'00501',zip4:null},{zip_code:'99000',complete_all_businesses:false,registry_coverage:{status:'record-level-source-contribution'},physical_site_count:3,zcta_geoid:null,zip4:null}];
 const raw=Buffer.concat(rows.map(bytes));await fs.writeFile(file,raw);const artifact={path:'views/zips.jsonl',bytes:raw.length,sha256:hash(raw),record_count:rows.length,export_policy:'internal'},manifest={created_at:'2026-10-01T00:00:00.000Z'};
 const meta=path.join(sourceDir,'manifest.json');await fs.writeFile(meta,bytes(manifest));
 return {root,sourceDir,file,rows,artifact,manifest,binding:{coverage:{manifest_sha256:hash(bytes(manifest))},zip_artifact:artifact},reads:[{file:meta,identity:await fs.lstat(meta,{bigint:true})}],sourceDirectoryIdentity:await fs.lstat(sourceDir,{bigint:true}),projection:{claims:{export_policy:'internal'}}};
}
const lookup=(r,zip,c,signal)=>core.lookup(r.directory,r.manifest_sha256,zip,c,signal);
test('immutable coverage index preserves exact rows and zero/null/postal semantics, absent ZIP and reuse',async t=>{
 const c=await fixture(t),r=await core.publish(c,createdAt),v=await core.verify(r.directory,c);
 assert.equal(v.manifest.indexed_zip_count,3);assert.equal(v.manifest.claims.export_policy,'internal');
 for(const row of c.rows){const found=await lookup(r,row.zip_code,c);assert.deepEqual(found.row,row);assert.equal(found.source_payload_bytes_read,bytes(row).length);assert.equal(found.full_source_replay_performed,false);}
 assert.equal((await lookup(r,'00502',c)).status,'absent-from-selected-coverage');assert.equal((await lookup(r,'00502',c)).row,null);
 assert.equal((await core.publish(c,createdAt)).reused,true);assert.equal(existsSync(path.join(c.root,'data/coverage-zip-view-index/current.json')),false);
});
test('bounded lookup checks selected row; unrelated source mutation is only full-verifier detectable',async t=>{
 const c=await fixture(t),r=await core.publish(c,createdAt),raw=await fs.readFile(c.file);const at=raw.lastIndexOf(Buffer.from('"physical_site_count":3'));raw[at+'"physical_site_count":'.length]=52;await fs.writeFile(c.file,raw);
 assert.deepEqual((await lookup(r,'00501',c)).row,c.rows[1]);await assert.rejects(lookup(r,'99000',c));await assert.rejects(core.verify(r.directory,c));
});
async function rehash(result,edit){
 const file=path.join(result.directory,'manifest.json'),m=JSON.parse(await fs.readFile(file));await edit(m);
 const {release_id,...body}=m;void release_id;m.release_id=`coverage-zip-view-index-${hash(JSON.stringify(body))}`;await fs.writeFile(file,bytes(m));const moved=path.join(path.dirname(result.directory),m.release_id);await fs.rename(result.directory,moved);result.directory=moved;result.manifest_sha256=hash(bytes(m));
}
test('independent reconstruction rejects self-consistent rehashed omitted entries, wrong ranges and upgraded claims',async t=>{
 for(const mode of ['omit','offset','claims']){
  const c=await fixture(t),r=await core.publish(c,createdAt),oldPin=r.manifest_sha256;
  await rehash(r,async m=>{if(mode==='claims'){m.claims.current_operations_verified=true;return;}
   const a=m.artifacts[0],file=path.join(r.directory,a.path),entries=JSON.parse(await fs.readFile(file));if(mode==='omit')entries.pop();else entries[0].offset++;
   const raw=bytes(entries);await fs.writeFile(file,raw);Object.assign(a,{sha256:hash(raw),bytes:raw.length,zip_count:entries.length});
  });
  await assert.rejects(core.verify(r.directory,c));await assert.rejects(core.lookup(r.directory,oldPin,'00000',c));
  if(mode!=='omit')await assert.rejects(lookup(r,'00000',c));
 }
});
test('source duplicates, malformed claim, noncanonical JSON and source count drift reject before output',async t=>{
 for(const mode of ['duplicate','claim','canonical','count']){
  const c=await fixture(t);let rows=structuredClone(c.rows);if(mode==='duplicate')rows.push(rows[0]);if(mode==='claim')rows[0].complete_all_businesses=true;
  const raw=mode==='canonical'?Buffer.from(rows.map(r=>JSON.stringify(r,null,1)).join('\n')+'\n'):Buffer.concat(rows.map(bytes));await fs.writeFile(c.file,raw);Object.assign(c.artifact,{bytes:raw.length,sha256:hash(raw),record_count:rows.length+(mode==='count'?1:0)});
  await assert.rejects(core.publish(c,createdAt));assert.equal(existsSync(path.join(c.root,'data/coverage-zip-view-index/releases')),false);
 }
});
test('unsafe paths, extra inventory, hardlinks, bad pins, ZIP4 and metadata drift reject',async t=>{
 for(const mode of ['extra','hardlink','junction','pin','zip4','metadata']){
  const c=await fixture(t),r=await core.publish(c,createdAt);
  if(mode==='extra')await fs.writeFile(path.join(r.directory,'extra.json'),'{}');
  if(mode==='hardlink')await fs.link(c.file,path.join(c.root,'alias.jsonl'));
  if(mode==='junction'){const alias=path.join(c.root,'alias');await fs.symlink(r.directory,alias,'junction');r.directory=alias;}
  if(mode==='pin')r.manifest_sha256='0'.repeat(64);
  if(mode==='metadata')await fs.writeFile(c.reads[0].file,'{}');
  await assert.rejects(lookup(r,mode==='zip4'?'00501-0001':'00501',c));
 }
});
test('pre, mid-scan, staging and post-publication cancellation have safe cleanup and recovery',async t=>{
 for(const phase of ['pre','scan','stage','published']){
  const c=await fixture(t),controller=new AbortController(),base=path.join(c.root,'data/coverage-zip-view-index');let calls=0;
  const original=controller.signal.throwIfAborted.bind(controller.signal);controller.signal.throwIfAborted=()=>{calls++;const dir=path.join(base,phase==='stage'?'.staging':'releases');if(phase==='pre'||phase==='scan'&&calls===15||['stage','published'].includes(phase)&&existsSync(dir)&&readdirSync(dir).some(name=>phase==='published'||existsSync(path.join(dir,name,'zip-00.json'))))controller.abort();original();};
  await assert.rejects(core.publish(c,createdAt,controller.signal),e=>{assert.match(e.message,/abort/i);if(phase==='published')assert.equal(e.inspection_required,true);return true;});
  if(existsSync(path.join(base,'.locks')))assert.deepEqual(await fs.readdir(path.join(base,'.locks')),[]);
  if(existsSync(path.join(base,'.staging')))assert.deepEqual(await fs.readdir(path.join(base,'.staging')),[]);
  if(phase==='published')assert.equal((await core.publish(c,createdAt)).reused,true);
 }
});
test('concurrent publishers use exclusive ownership and produce only one exact release',async t=>{
 const c=await fixture(t),results=await Promise.allSettled([core.publish(c,createdAt),core.publish(c,createdAt)]);
 assert.ok(results.some(r=>r.status==='fulfilled'));for(const result of results.filter(r=>r.status==='rejected'))assert.equal(result.reason.code,'EEXIST');
 assert.equal((await fs.readdir(path.join(c.root,'data/coverage-zip-view-index/releases'))).length,1);
 assert.deepEqual(await fs.readdir(path.join(c.root,'data/coverage-zip-view-index/.locks')),[]);
});
test('lock cleanup failure reports retained publication; replacement lock is never removed',async t=>{
 for(const mode of ['unlink','replacement']){
  const c=await fixture(t),open=fs.open,unlink=fs.unlink,dir=path.join(c.root,'data/coverage-zip-view-index/.locks');let stub;
  if(mode==='unlink')stub=t.mock.method(fs,'unlink',async(file,...args)=>{if(path.dirname(file)===dir)throw Error('injected');return unlink(file,...args);});
  else stub=t.mock.method(fs,'open',async(file,...args)=>{const h=await open(file,...args);if(path.dirname(file)!==dir)return h;return {stat:h.stat.bind(h),close:async()=>{await h.close();await fs.rename(file,path.join(c.root,'old.lock'));await fs.writeFile(file,'replacement');}};});
  try{await assert.rejects(core.publish(c,createdAt),e=>{assert.equal(e.code,'COVERAGE_ZIP_INDEX_INSPECTION_REQUIRED');assert.equal(e.recovery.publication_state,'published');return true;});}finally{stub.mock.restore();}
  assert.equal((await fs.readdir(dir)).length,1);
 }
});
test('public functions reject injection; native metadata binds selected 48194-row coverage without scanning',async()=>{
 for(const call of [()=>publishCoverageZipViewIndex({context:{}}),()=>verifyCoverageZipViewIndex('manifest.json',{loader:()=>{}}),()=>readCoverageZipViewLookup({contract:{}})])await assert.rejects(call(),/unsupported option/);
 const c=await core.loadRegistered(APP_ROOT);assert.equal(c.artifact.record_count,48194);assert.equal(c.artifact.sha256,'b24a6dc7026a3bec96cea4cd4cb227aa58d11be9beebd633d8229ca5ee37a6dd');assert.equal(c.binding.spatial_zip_polygon_denominator.count,33791);
});

test('range-read cancellation and in-flight source replacement reject without partial results',async t=>{
 for(const mode of ['cancel','replace']){
  const c=await fixture(t),r=await core.publish(c,createdAt),controller=new AbortController(),open=fs.open;let changed=false;
  const stub=t.mock.method(fs,'open',async(file,...args)=>{const h=await open(file,...args);if(file!==c.file)return h;return {stat:h.stat.bind(h),close:h.close.bind(h),read:async(...readArgs)=>{const result=await h.read(...readArgs);if(!changed){changed=true;if(mode==='cancel')controller.abort();else {await fs.rename(c.file,path.join(c.root,'replaced.jsonl'));await fs.writeFile(c.file,Buffer.concat(c.rows.map(bytes)));}}return result;}};});
  try{await assert.rejects(lookup(r,'00501',c,controller.signal));assert.equal(changed,true);}finally{stub.mock.restore();}
 }
});
