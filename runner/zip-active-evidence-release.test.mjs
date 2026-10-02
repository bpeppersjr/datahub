import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {mkdir,mkdtemp,rm,writeFile,readFile,readdir,link,unlink,symlink} from 'node:fs/promises';
import fs from 'node:fs/promises';
import {existsSync,readdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {APP_ROOT} from './paths.mjs';
import {publishZipActiveEvidenceRelease,verifyZipActiveEvidenceRelease} from './zip-active-evidence-release.mjs';
const asOf='2026-10-02T12:00:00.000Z',createdAt='2026-10-03T12:00:00.000Z';
const sha=value=>createHash('sha256').update(value).digest('hex');
function source(){return {source_key:'usda_snap_retailers',source_kind:'record-level-evidence',complete_source_for_all_businesses:false,release_metadata:{source_release_id:'release-usda_snap_retailers',source_updated_at:'2026-09-20'},zip_level_counts:{retailer_count:2},zip_rows_with_contribution:1};}
const zip=sources=>({zip_code:'00501',complete_all_businesses:false,source_contributions:Object.fromEntries(sources.map(row=>[row.source_key,{...row.release_metadata,...row.zip_level_counts}]))});
async function fixture(t){
 await mkdir(path.join(APP_ROOT,'data/tmp'),{recursive:true});const root=await mkdtemp(path.join(APP_ROOT,'data/tmp/zip-qualification-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const put=async(file,value)=>{await mkdir(path.dirname(file),{recursive:true});const bytes=typeof value==='string'?value:JSON.stringify(value);await writeFile(file,bytes);return {sha256:sha(bytes),bytes:Buffer.byteLength(bytes)};};
 const registry={dataset_id:'national-business-registry',release_id:'registry-fixture',schema_version:'1.0.0',status:'published-partial',publisher:{id:'national-business-registry',version:'2.15.0'},coverage:{resolution_location_profiles:2}};
 const rp=path.join(root,'data/business-registry/current.json'),rmf=path.join(root,'data/business-registry/releases/registry-fixture/manifest.json');const registryHash=await put(rmf,registry);await put(rp,{dataset_id:registry.dataset_id,release_id:registry.release_id,manifest:'releases/registry-fixture/manifest.json'});
 const dependencies=[['national-business-registry','registry_release_id'],['us-census-geography','geography_release_id'],['us-census-zcta-jurisdiction-crosswalk','zcta_jurisdiction_crosswalk_release_id'],['national-business-entity-resolution','entity_resolution_release_id'],['national-business-entity-resolution-benchmark','entity_resolution_benchmark_release_id'],['census-nonemployer-baseline','census_nonemployer_release_id']];
 const lineage={transformation_version:'national-business-coverage-views@2.11.0',...Object.fromEntries(dependencies.map(([id,key])=>[key,id===registry.dataset_id?registry.release_id:`${id}-fixture`]))};
 const s={...source(),schema_version:'1.0.0',view_type:'source',lineage},z={...zip([s]),schema_version:'1.0.0',view_type:'zip',lineage};
 const dir=path.join(root,'data/business-coverage-views/releases/coverage-fixture'),artifacts=[];
 for(const [name,type,rows]of [['states','state-coverage-view-jsonl',[{schema_version:'1.0.0',view_type:'state',postal_abbreviation:'NY',complete_all_businesses:false,registry_evidence:{source_profile_counts_by_reported_address_state:{}},lineage}]],['sources','source-coverage-view-jsonl',[s]],['zips','zip-coverage-view-jsonl',[z]]]){const info=await put(path.join(dir,`${name}.jsonl`),rows.map(row=>JSON.stringify(row)).join('\n')+'\n');artifacts.push({path:`${name}.jsonl`,artifact_type:type,record_count:rows.length,export_policy:'local-review-only',...info});}
 const manifest={schema_version:'1.0.0',dataset_id:'national-business-coverage-views',release_id:'coverage-fixture',status:'published-partial-local-aggregate',coverage:{location_profiles_assessed:2},dependencies:dependencies.map(([id,key])=>({dataset_id:id,release_id:lineage[key],...(id===registry.dataset_id?{manifest_sha256:registryHash.sha256,publisher_version:'2.15.0'}:{})})),artifacts};
 await put(path.join(dir,'manifest.json'),manifest);await put(path.join(root,'data/business-coverage-views/current.json'),{dataset_id:manifest.dataset_id,release_id:manifest.release_id,manifest:'releases/coverage-fixture/manifest.json'});
 return {root,dir,manifest,put,rp};
}
const publish=root=>publishZipActiveEvidenceRelease({root,asOf,createdAt});
const manifestPath=result=>path.join(result.directory,'manifest.json');

test('immutable release independently verifies, retains policies and reuses exact bytes without pointers',async t=>{
 const {root,dir,manifest,put}=await fixture(t);
 manifest.artifacts.find(a=>a.path==='sources.jsonl').export_policy='internal';await put(path.join(dir,'manifest.json'),manifest);
 const pointer=path.join(root,'data/business-coverage-views/current.json'),before=await readFile(pointer);
 const result=await publish(root);assert.equal(result.reused,false);assert.equal(result.export_policy,'internal');
 assert.equal((await verifyZipActiveEvidenceRelease(manifestPath(result),{root})).verified,true);
 const original=await readFile(manifestPath(result));const again=await publish(root);
 assert.equal(again.reused,true);assert.equal(again.release_id,result.release_id);assert.deepEqual(await readFile(manifestPath(result)),original);
 assert.deepEqual(await readFile(pointer),before);assert.equal(existsSync(path.join(root,'data/zip-active-evidence-qualification/current.json')),false);
 assert.deepEqual(await readdir(path.join(root,'data/zip-active-evidence-qualification/.locks')),[]);
 assert.deepEqual(await readdir(path.join(root,'data/zip-active-evidence-qualification/.staging')),[]);
 const metadata=JSON.parse(await readFile(path.join(result.directory,'projection.json')));
 assert.equal(metadata.claims.current_operations_verified,false);assert.equal(metadata.claims.all_business_denominator,null);
});

test('partitions bounded row counts and verifies complete conservation',async t=>{
 const {root,dir,manifest,put}=await fixture(t),s=JSON.parse(await readFile(path.join(dir,'sources.jsonl'),'utf8')),z=JSON.parse(await readFile(path.join(dir,'zips.jsonl'),'utf8'));
 s.zip_level_counts.retailer_count=1001;s.zip_rows_with_contribution=1001;
 Object.assign(manifest.artifacts.find(a=>a.path==='sources.jsonl'),await put(path.join(dir,'sources.jsonl'),JSON.stringify(s)+'\n'));
 const rows=Array.from({length:1001},(_,i)=>({...z,zip_code:String(i).padStart(5,'0'),source_contributions:{usda_snap_retailers:{...s.release_metadata,retailer_count:1}}}));
 const artifact=manifest.artifacts.find(a=>a.path==='zips.jsonl');Object.assign(artifact,await put(path.join(dir,'zips.jsonl'),rows.map(r=>JSON.stringify(r)).join('\n')+'\n'),{record_count:1001});
 await put(path.join(dir,'manifest.json'),manifest);
 const result=await publish(root),m=JSON.parse(await readFile(manifestPath(result)));
 assert.equal(result.source_zip_rows,1001);assert.equal(m.artifacts.length,3);assert.deepEqual(m.artifacts.slice(1).map(a=>a.record_count),[1000,1]);
 assert.ok(m.artifacts.slice(1).every(a=>a.bytes<=2000000));assert.equal((await verifyZipActiveEvidenceRelease(manifestPath(result),{root})).verified,true);
});

test('tamper, rehashed forgery, unknown manifest fields and unexpected entries never reuse or overwrite',async t=>{
 for(const mode of ['bytes','rehashed','manifest','extra']){
  const {root}=await fixture(t),result=await publish(root),mp=manifestPath(result),m=JSON.parse(await readFile(mp)),rp=path.join(result.directory,'rows-0000.jsonl');
  if(mode==='extra')await writeFile(path.join(result.directory,'current.json'),'{}');
  else if(mode==='manifest'){m.unknown=true;await writeFile(mp,JSON.stringify(m));}
  else{const row=JSON.parse(await readFile(rp));row.eligible_evidence_counts_by_unit.retailer_count=99;const body=JSON.stringify(row)+'\n';await writeFile(rp,body);if(mode==='rehashed'){Object.assign(m.artifacts[1],{sha256:sha(body),bytes:Buffer.byteLength(body)});await writeFile(mp,JSON.stringify(m));}}
  const before=await readFile(mp);await assert.rejects(verifyZipActiveEvidenceRelease(mp,{root}));await assert.rejects(publish(root));assert.deepEqual(await readFile(mp),before);
 }
});

test('hardlinks and directory aliases are rejected',async t=>{
 const {root}=await fixture(t),result=await publish(root),row=path.join(result.directory,'rows-0000.jsonl'),alias=path.join(root,'hardlink.jsonl');
 await link(row,alias);await assert.rejects(verifyZipActiveEvidenceRelease(manifestPath(result),{root}));await unlink(alias);
 const linked=path.join(root,'release-alias');await symlink(result.directory,linked,'junction');await assert.rejects(verifyZipActiveEvidenceRelease(path.join(linked,'manifest.json'),{root}));
});

test('source drift and verification-time mutation reject rather than certify cached evidence',async t=>{
 const {root,dir}=await fixture(t),result=await publish(root),controller=new AbortController();let changed=false;
 const original=controller.signal.throwIfAborted.bind(controller.signal);
 controller.signal.throwIfAborted=()=>{original();if(!changed){changed=true;writeFileSync(path.join(result.directory,'projection.json'),'{}\n');}};
 await assert.rejects(verifyZipActiveEvidenceRelease(manifestPath(result),{root,signal:controller.signal}));
 await writeFile(path.join(dir,'zips.jsonl'),'{}\n');await assert.rejects(publish(root));
});

test('release admission uses the shared source/ZIP bound before source replay',async t=>{
 const {root}=await fixture(t),result=await publish(root),file=manifestPath(result),manifest=JSON.parse(await readFile(file));
 manifest.source_zip_rows=1_500_001;await writeFile(file,JSON.stringify(manifest));
 await assert.rejects(verifyZipActiveEvidenceRelease(file,{root}),/ZIP\/source pair limit exceeded/);
 manifest.source_zip_rows=1_500_000;await writeFile(file,JSON.stringify(manifest));
 await assert.rejects(verifyZipActiveEvidenceRelease(file,{root}),/Source replay or content identity mismatch/);
});

test('concurrent publishers serialize and restart reuses the sole completed release',async t=>{
 const {root}=await fixture(t),results=await Promise.allSettled([publish(root),publish(root)]);
 assert.ok(results.some(r=>r.status==='fulfilled'));for(const r of results)if(r.status==='rejected')assert.equal(r.reason.code,'EEXIST');
 const base=path.join(root,'data/zip-active-evidence-qualification');assert.equal((await readdir(path.join(base,'releases'))).length,1);assert.deepEqual(await readdir(path.join(base,'.locks')),[]);
 assert.equal((await publish(root)).reused,true);
});

test('cancellation before staging and mid-write cleans only owned staging; post-rename preserves inspectable release',async t=>{
 for(const boundary of ['before','staging','published']){
  const {root}=await fixture(t),controller=new AbortController(),base=path.join(root,'data/zip-active-evidence-qualification');
  if(boundary==='before')controller.abort();
  else{const original=controller.signal.throwIfAborted.bind(controller.signal);controller.signal.throwIfAborted=()=>{
   const dir=path.join(base,boundary==='staging'?'.staging':'releases');
   if(existsSync(dir)&&readdirSync(dir).some(name=>boundary==='published'||existsSync(path.join(dir,name,'projection.json'))))controller.abort();
   original();
  };}
  await assert.rejects(publishZipActiveEvidenceRelease({root,asOf,createdAt,signal:controller.signal}),error=>{
   assert.match(error.message,/abort/i);if(boundary==='published')assert.equal(error.inspection_required,true);return true;
  });
  if(boundary!=='before'){assert.deepEqual(await readdir(path.join(base,'.locks')),[]);assert.deepEqual(await readdir(path.join(base,'.staging')),[]);
   const releases=await readdir(path.join(base,'releases'));assert.equal(releases.length,boundary==='published'?1:0);
   if(boundary==='published')assert.equal((await publish(root)).reused,true);
  }
 }
});

test('lock cleanup faults report structured published/reused outcomes without removing uncertain locks',async t=>{
 for(const state of ['published','reused'])for(const fault of ['unlink','inspection','close','replacement']){
  const {root}=await fixture(t);if(state==='reused')await publish(root);
  const lockRoot=path.join(root,'data/zip-active-evidence-qualification/.locks');
  const isLock=file=>typeof file==='string'&&path.dirname(file)===lockRoot;
  const handles=[];let originalLock;
  if(fault==='unlink'||fault==='inspection'){
   const method=fault==='unlink'?'unlink':'lstat',original=fs[method];
   handles.push(t.mock.method(fs,method,async(file,...args)=>{if(isLock(file))throw Object.assign(new Error('injected sensitive cleanup detail'),{code:'EACCES'});return original(file,...args);}));
  }else{
   const original=fs.open;
   handles.push(t.mock.method(fs,'open',async(file,...args)=>{
    const handle=await original(file,...args);if(!isLock(file))return handle;
    return {stat:handle.stat.bind(handle),close:async()=>{
     await handle.close();if(fault==='close')throw new Error('injected close failure');
     originalLock=path.join(root,'retained-original.lock');await fs.rename(file,originalLock);await writeFile(file,'replacement-owner');
    }};
   }));
  }
  let caught;try{await publish(root);}catch(error){caught=error;}finally{for(const handle of handles)handle.mock.restore();}
  assert.equal(caught?.code,'ZIP_RELEASE_INSPECTION_REQUIRED');assert.equal(caught.recovery.publication_state,state);
  assert.equal(caught.recovery.published,state==='published');assert.equal(caught.recovery.reused,state==='reused');
  assert.equal(caught.inspection_required,true);assert.match(caught.release_id,/^zip-active-evidence-[a-f0-9]{64}$/);
  assert.deepEqual(caught.recovery.lock_cleanup.issues,[{unlink:'lock-unlink-failed',inspection:'lock-inspection-failed',close:'lock-close-failed',replacement:'lock-ownership-mismatch'}[fault]]);
  assert.equal(JSON.stringify(caught).includes('sensitive'),false);
  const locks=await readdir(lockRoot);assert.equal(locks.length,1);
  if(fault==='replacement'){assert.equal(await readFile(path.join(lockRoot,locks[0]),'utf8'),'replacement-owner');assert.equal(existsSync(originalLock),true);}
  const release=path.join(root,'data/zip-active-evidence-qualification/releases',caught.release_id,'manifest.json');
  assert.equal((await verifyZipActiveEvidenceRelease(release,{root})).verified,true);
 }
});

test('cleanup failure preserves the original cancellation object and owned staging cleanup',async t=>{
 const {root}=await fixture(t),controller=new AbortController(),primary=new Error('original cancellation');primary.code='FIXTURE_CANCELLED';
 const base=path.join(root,'data/zip-active-evidence-qualification'),originalCheck=controller.signal.throwIfAborted.bind(controller.signal);
 controller.signal.throwIfAborted=()=>{const stage=path.join(base,'.staging');if(existsSync(stage)&&readdirSync(stage).some(name=>existsSync(path.join(stage,name,'projection.json'))))controller.abort(primary);originalCheck();};
 const original=fs.unlink,stub=t.mock.method(fs,'unlink',async(file,...args)=>{if(path.dirname(file)===path.join(base,'.locks'))throw new Error('secondary unlink failure');return original(file,...args);});
 try{await assert.rejects(publishZipActiveEvidenceRelease({root,asOf,createdAt,signal:controller.signal}),error=>{
  assert.equal(error,primary);assert.equal(error.code,'FIXTURE_CANCELLED');assert.equal(error.recovery.publication_state,'not-published');
  assert.equal(error.recovery.published,false);assert.equal(error.recovery.reused,false);assert.deepEqual(error.recovery.lock_cleanup.issues,['lock-unlink-failed']);return true;
 });}finally{stub.mock.restore();}
 assert.deepEqual(await readdir(path.join(base,'.staging')),[]);assert.deepEqual(await readdir(path.join(base,'releases')),[]);assert.equal((await readdir(path.join(base,'.locks'))).length,1);
});

