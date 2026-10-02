import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {existsSync,readdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {APP_ROOT} from './paths.mjs';
import {publishRegistryZipQualityIndex as publish,verifyRegistryZipQualityIndex as verify,readRegistryZipQualityLookup as lookup,REGISTRY_ZIP_QUALITY_INDEX_LIMITS as limits} from './registry-zip-quality-index.mjs';

const hash=v=>createHash('sha256').update(v).digest('hex'),bytes=v=>Buffer.from(`${JSON.stringify(v)}\n`),createdAt='2026-10-02T19:00:00.000Z';
function row(zip,status='record-level-source-contribution'){return {zip_code:zip,postal_code:zip,zip4:null,registry_coverage:{status},geography:{status:'not-observed-in-integrated-census-coverage-union'},current_usps_validity:{status:'unverified',reason:'No current operational source.'},source_contributions:{alpha:{source_release_id:'source-alpha',source_date:'2026-01-01',records:2}},retained_unknown_field:{label:'Café',value:0}};}
async function fixture(t,{policy='local-review-only',rows=[row('99999','denominator-only-no-record-level-contribution'),row('00000'),row('00501'),{...row('00601'),geography:{status:'2020-zcta-polygon-available',geo_id:'zcta:00601',geoid:'00601',provenance:{source_release_id:'geo-1'}}}]}={}){
 await fs.mkdir(path.join(APP_ROOT,'data/tmp'),{recursive:true});const root=await fs.mkdtemp(path.join(APP_ROOT,'data/tmp/registry-zip-index-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const release='registry-fixture',sourceDir=path.join(root,`data/business-registry/releases/${release}`),sourceFile=path.join(sourceDir,'derived/zip-coverage.jsonl');await fs.mkdir(path.dirname(sourceFile),{recursive:true});await fs.mkdir(path.join(root,'config'),{recursive:true});
 const rawRows=rows.map((r,i)=>Buffer.from(` ${JSON.stringify(r)}${i===rows.length-1?'':i%2?'\n':'\r\n'}`)),raw=Buffer.concat(rawRows);await fs.writeFile(sourceFile,raw);
 const manifest={dataset_id:'national-business-registry',release_id:release,status:'published-partial',complete_national_business_registry:false,publisher:{version:'2.15.0'},export_policy:'Mixed-source prose is descriptive, not permission.',artifacts:[{path:'derived/zip-coverage.jsonl',artifact_type:'registry-zip-coverage-jsonl',bytes:raw.length,record_count:rows.length,sha256:hash(raw),distribution_policy:policy}]};
 const manifestPath=path.join(sourceDir,'manifest.json'),pointer={dataset_id:manifest.dataset_id,release_id:release,manifest:`releases/${release}/manifest.json`},pointerPath=path.join(root,'data/business-registry/current.json');await fs.writeFile(manifestPath,bytes(manifest));await fs.writeFile(pointerPath,bytes(pointer));
 const enrollment={schema_version:'1.0.0',cohort_id:'production-current',pointer_path:'data/business-registry/current.json',release_id:release,pointer_sha256:hash(bytes(pointer)),manifest_sha256:hash(bytes(manifest)),zip_artifact_sha256:hash(raw)},enrollmentPath=path.join(root,'config/zip-quality-view-enrollment.json');await fs.writeFile(enrollmentPath,bytes(enrollment));
 return {root,sourceDir,sourceFile,rows,rawRows,manifest,manifestPath,pointerPath,enrollment,enrollmentPath};
}
const read=(f,p,zip5,signal)=>lookup({root:f.root,manifestPath:p.manifest_path,manifestSha256:p.manifest_sha256,zip5,signal});

test('publisher independently verifies, preserves complete exact bytes and audit semantics, reuses without a pointer',async t=>{
 const f=await fixture(t),p=await publish({root:f.root,createdAt}),v=await verify(p.manifest_path,{root:f.root});assert.equal(v.indexed_zip_count,4);
 for(let i=0;i<f.rows.length;i++){const r=await read(f,p,f.rows[i].zip_code);assert.deepEqual(r.row,f.rows[i]);assert.equal(r.raw_jsonl_utf8,f.rawRows[i].toString());assert.equal(r.source_bytes_read,f.rawRows[i].length);assert.equal(r.full_source_replay_performed,false);assert.equal(r.claims.export_policy,'local-review-only');}
 assert.equal((await read(f,p,'00000')).quality.source_reported_zip5_quality.class,'explicit-placeholder');
 assert.equal((await read(f,p,'00501')).quality.source_reported_zip5_quality.class,'valid-format-source-reported-no-same-code-zcta');
 assert.equal((await read(f,p,'99999')).quality.source_reported_zip5_quality.class,'valid-format-denominator-only-no-same-code-zcta');
 assert.equal((await read(f,p,'00601')).quality.governed_zcta_membership.status,'included');
 assert.equal((await read(f,p,'00502')).status,'absent-from-selected-artifact');assert.equal((await read(f,p,'00502')).row,null);
 assert.equal((await publish({root:f.root,createdAt})).reused,true);assert.equal(existsSync(path.join(f.root,'data/registry-zip-quality-index/current.json')),false);
 const m=JSON.parse(await fs.readFile(p.manifest_path));assert.equal(m.bindings.registry_manifest_sha256,f.enrollment.manifest_sha256);assert.equal(m.bindings.audit_schema_version,'1.3.0');
});

test('internal restriction survives explanatory manifest prose; lookup uses only bounded row reads',async t=>{
 const f=await fixture(t,{policy:'internal'}),p=await publish({root:f.root,createdAt}),original=fs.open;let sourceReadBytes=0;
 const mock=t.mock.method(fs,'open',async(file,...args)=>{const h=await original(file,...args);if(file!==f.sourceFile)return h;return {stat:h.stat.bind(h),close:h.close.bind(h),read:async(...values)=>{assert.ok(values[2]<=65536);assert.equal(typeof values[3],'number');const r=await h.read(...values);sourceReadBytes+=r.bytesRead;return r;}};});
 const result=await read(f,p,'00501');mock.mock.restore();assert.equal(result.claims.export_policy,'internal');assert.equal(sourceReadBytes,f.rawRows[2].length);assert.equal(result.quality.positive_source_contributions[0].positive_counts.records,2);
});

test('all input pins, aliases, hardlinks, inventories and source range mutations fail closed',async t=>{
 for(const mode of ['pin','source','bucket','extra','hardlink','alias','enrollment','pointer']){
  const f=await fixture(t),p=await publish({root:f.root,createdAt}),dir=path.dirname(p.manifest_path),bucket=path.join(dir,'zip-00.json');
  if(mode==='pin')p.manifest_sha256='0'.repeat(64);
  if(mode==='source'){const raw=await fs.readFile(f.sourceFile);raw[f.rawRows[0].length+f.rawRows[1].length+10]^=1;await fs.writeFile(f.sourceFile,raw);}
  if(mode==='bucket')await fs.writeFile(bucket,'[]\n');
  if(mode==='extra')await fs.writeFile(path.join(dir,'current.json'),'{}');
  if(mode==='hardlink')await fs.link(bucket,path.join(f.root,'linked.json'));
  if(mode==='alias'){const alias=path.join(f.root,'alias');await fs.symlink(dir,alias,'junction');p.manifest_path=path.join(alias,'manifest.json');}
  if(mode==='enrollment')await fs.writeFile(f.enrollmentPath,bytes({...f.enrollment,manifest_sha256:'0'.repeat(64)}));
  if(mode==='pointer')await fs.appendFile(f.pointerPath,' ');
  await assert.rejects(read(f,p,'00501'),undefined,mode);
 }
});

test('full reconstruction rejects omitted ZIP replaced by a locally consistent forged entry',async t=>{
 const f=await fixture(t),p=await publish({root:f.root,createdAt}),dir=path.dirname(p.manifest_path),bucket=path.join(dir,'zip-00.json'),entries=JSON.parse(await fs.readFile(bucket));
 entries.find(e=>e.zip5==='00501').zip5='00502';const raw=bytes(entries);await fs.writeFile(bucket,raw);
 const m=JSON.parse(await fs.readFile(p.manifest_path));Object.assign(m.artifacts.find(a=>a.path==='zip-00.json'),{bytes:raw.length,sha256:hash(raw)});const {release_id,...body}=m;void release_id;m.release_id=`registry-zip-quality-index-${hash(JSON.stringify(body))}`;await fs.writeFile(p.manifest_path,bytes(m));const moved=path.join(path.dirname(dir),m.release_id);await fs.rename(dir,moved);p.manifest_path=path.join(moved,'manifest.json');
 await assert.rejects(read(f,p,'00501'),/pinned manifest/);p.manifest_sha256=hash(bytes(m));assert.equal((await read(f,p,'00501')).status,'absent-from-selected-artifact');await assert.rejects(verify(p.manifest_path,{root:f.root}),/reconstruction/);await assert.rejects(read(f,p,'00502'),/ZIP identity/);
});

test('separate rehashed offset forgery cannot return unrelated row bytes',async t=>{
 const f=await fixture(t),p=await publish({root:f.root,createdAt}),dir=path.dirname(p.manifest_path),file=path.join(dir,'zip-00.json'),entries=JSON.parse(await fs.readFile(file));entries[0].offset++;await fs.writeFile(file,bytes(entries));await assert.rejects(read(f,p,'00000'));await assert.rejects(verify(p.manifest_path,{root:f.root}));
});

test('full verification detects unrelated source mutation that a bounded selected-row lookup does not read',async t=>{
 const f=await fixture(t),p=await publish({root:f.root,createdAt});const raw=await fs.readFile(f.sourceFile);raw[raw.indexOf('Caf')+2]=120;await fs.writeFile(f.sourceFile,raw);
 assert.equal((await read(f,p,'00501')).status,'present');await assert.rejects(verify(p.manifest_path,{root:f.root}),/source integrity/);
});

test('exact one-row byte ceiling succeeds while one additional byte is rejected',async t=>{
 const r={...row('00501'),padding:''},base=Buffer.byteLength(` ${JSON.stringify(r)}`);r.padding='x'.repeat(limits.rowBytes-base);
 const f=await fixture(t,{rows:[r]}),p=await publish({root:f.root,createdAt});assert.equal((await read(f,p,'00501')).source_bytes_read,limits.rowBytes);
 const g=await fixture(t,{rows:[{...r,padding:r.padding+'x'}]});await assert.rejects(publish({root:g.root,createdAt}),/row byte bound/);
});

test('optional USPS reconciliation preserves the exact member set and rejects equal-count drift',async t=>{
 for(const changed of [false,true]){
  const r=row('00501');r.current_usps_validity={status:'listed-in-current-usps-area-district-file',source_release_id:'usps-1',source_month:'2026-09',reason:'Exact governed member.'};
  const f=await fixture(t,{rows:[r]}),members={count:1,member_set_sha256:hash('00501\n')},reconciliation={schema_version:'zip5-evidence-reconciliation@1.0.0',exact_usps_member_set_match:true,registry_listed_members:changed?{...members,member_set_sha256:hash('00502\n')}:members,source:{assignment_members:members}};
  const raw=bytes(reconciliation),relative='derived/zip5-evidence-reconciliation.json';await fs.writeFile(path.join(f.sourceDir,relative),raw);f.manifest.artifacts.push({path:relative,artifact_type:'registry-zip5-evidence-reconciliation-json',bytes:raw.length,sha256:hash(raw)});f.manifest.coverage={authoritative_current_usps_zip_denominator:members};await fs.writeFile(f.manifestPath,bytes(f.manifest));f.enrollment.manifest_sha256=hash(bytes(f.manifest));await fs.writeFile(f.enrollmentPath,bytes(f.enrollment));
  if(changed)await assert.rejects(publish({root:f.root,createdAt}),/USPS member reconciliation/);
  else{const p=await publish({root:f.root,createdAt}),found=await read(f,p,'00501');assert.equal(found.quality.usps_operational_evidence.status,'listed-in-current-usps-area-district-file');assert.equal(found.bindings.usps_reconciliation.sha256,hash(raw));await verify(p.manifest_path,{root:f.root});}
 }
});

test('invalid/duplicate ZIPs, postal joins, aliases and resource ceilings cannot publish',async t=>{
 for(const rows of [[row('ABCDE')],[row('00501'),row('00501')],[{...row('00501'),postal_code:'00501-1234',zip4:'1234'}],[{...row('00501'),huge:'x'.repeat(limits.rowBytes)}]]){
  const f=await fixture(t,{rows});await assert.rejects(publish({root:f.root,createdAt}));assert.equal(existsSync(path.join(f.root,'data/registry-zip-quality-index/current.json')),false);
 }
 const f=await fixture(t);for(const opts of [{root:f.root,createdAt,loader:()=>{}},{root:f.root,createdAt,sourceFile:f.sourceFile}])await assert.rejects(publish(opts),/unsupported option/);
 for(const zip5 of ['501','00501-1234','../00'])await assert.rejects(lookup({root:f.root,manifestPath:'manifest.json',manifestSha256:'0'.repeat(64),zip5}),/lookup options/);
});

test('concurrent publishers converge or refuse occupied lock; cancellation closes reader and cleans only owned staging',async t=>{
 const f=await fixture(t),out=await Promise.allSettled([publish({root:f.root,createdAt}),publish({root:f.root,createdAt})]);assert.ok(out.some(r=>r.status==='fulfilled'));for(const r of out)if(r.status==='rejected')assert.equal(r.reason.code,'EEXIST');
 for(const phase of ['pre','read','stage','published']){
  const f=await fixture(t),controller=new AbortController(),base=path.join(f.root,'data/registry-zip-quality-index');let checks=0;
  const original=controller.signal.throwIfAborted.bind(controller.signal);controller.signal.throwIfAborted=()=>{checks++;const d=path.join(base,phase==='published'?'releases':'.staging');if(phase==='pre'||phase==='read'&&checks===30||['stage','published'].includes(phase)&&existsSync(d)&&readdirSync(d).some(n=>phase==='published'||existsSync(path.join(d,n,'zip-00.json'))))controller.abort();original();};
  await assert.rejects(publish({root:f.root,createdAt,signal:controller.signal}),/abort/i);
  if(existsSync(path.join(base,'.locks')))assert.deepEqual(await fs.readdir(path.join(base,'.locks')),[]);
  if(existsSync(path.join(base,'.staging')))assert.deepEqual(await fs.readdir(path.join(base,'.staging')),[]);
  assert.equal((await publish({root:f.root,createdAt})).verified,true);
 }
});

test('lock unlink/ownership faults report durable recovery and retain primary cancellation',async t=>{
 for(const mode of ['unlink','replacement','primary']){
  const f=await fixture(t),base=path.join(f.root,'data/registry-zip-quality-index'),originalUnlink=fs.unlink,originalOpen=fs.open,controller=new AbortController(),primary=Error('primary cancellation');let mock;
  if(mode==='replacement')mock=t.mock.method(fs,'open',async(file,...args)=>{const h=await originalOpen(file,...args);if(path.dirname(file)!==path.join(base,'.locks'))return h;return {stat:h.stat.bind(h),close:async()=>{await h.close();await fs.rename(file,path.join(f.root,'old.lock'));await fs.writeFile(file,'replacement');}};});
  else mock=t.mock.method(fs,'unlink',async(file,...args)=>{if(path.dirname(file)===path.join(base,'.locks'))throw Error('fault');return originalUnlink(file,...args);});
  if(mode==='primary'){const original=controller.signal.throwIfAborted.bind(controller.signal);controller.signal.throwIfAborted=()=>{const d=path.join(base,'.staging');if(existsSync(d)&&readdirSync(d).some(n=>existsSync(path.join(d,n,'zip-00.json'))))controller.abort(primary);original();};}
  try{await assert.rejects(publish({root:f.root,createdAt,signal:controller.signal}),e=>{assert.equal(e.inspection_required,true);assert.equal(e.recovery.publication_state,mode==='primary'?'not-published':'published');if(mode==='primary')assert.equal(e,primary);return true;});}finally{mock.mock.restore();}
  assert.equal((await fs.readdir(path.join(base,'.locks'))).length,1);
 }
});

test('in-flight source mutation and lookup cancellation reject without leaked handles',async t=>{
 const f=await fixture(t),p=await publish({root:f.root,createdAt}),original=fs.open;let closed=false;
 const mock=t.mock.method(fs,'open',async(file,...args)=>{const h=await original(file,...args);if(file!==f.sourceFile)return h;return {stat:h.stat.bind(h),close:async()=>{closed=true;await h.close();},read:async(...args)=>{const r=await h.read(...args);writeFileSync(f.sourceFile,Buffer.concat(f.rawRows).toString().replace('Café','Cafe'));return r;}};});
 await assert.rejects(read(f,p,'00501'));mock.mock.restore();assert.equal(closed,true);
 const g=await fixture(t),q=await publish({root:g.root,createdAt}),controller=new AbortController();const stub=t.mock.method(fs,'open',async(file,...args)=>{const h=await original(file,...args);if(file===g.sourceFile)controller.abort();return h;});try{await assert.rejects(read(g,q,'00501',controller.signal),/abort/i);}finally{stub.mock.restore();}
});

test('source growth during the first read rejects at the declared byte boundary and closes the handle',async t=>{
 const f=await fixture(t),originalOpen=fs.open;let reads=0,consumed=0,closed=false;
 const mock=t.mock.method(fs,'open',async(file,...args)=>{
  const handle=await originalOpen(file,...args);if(file!==f.sourceFile)return handle;
  return {stat:handle.stat.bind(handle),close:async()=>{closed=true;await handle.close();},read:async(...values)=>{
   if(reads++===0)await fs.appendFile(f.sourceFile,Buffer.alloc(200000,120));
   const result=await handle.read(...values);consumed+=result.bytesRead;return result;
  }};
 });
 try{await assert.rejects(publish({root:f.root,createdAt}),/source byte ceiling/);}finally{mock.mock.restore();}
 assert.equal(consumed,f.manifest.artifacts[0].bytes,'No appended byte is consumed');
 assert.equal(reads,1);assert.equal(closed,true);
 assert.equal(existsSync(path.join(f.root,'data/registry-zip-quality-index')),false,'Growth fails before staging or lock creation');
});

test('reviewed audit pins reject cached-function versus disk drift at load and after lookup without editing production code',async t=>{
 const f=await fixture(t),auditCopy=path.join(f.root,'audit-copy.mjs'),auditBytes=await fs.readFile(new URL('./zip-denominator-audit.mjs',import.meta.url));await fs.writeFile(auditCopy,auditBytes);
 // Private memory-only instrumentation changes only the audit FILE under test.
 // The imported audit function remains the actual statically loaded implementation.
 const moduleUrl=new URL('./registry-zip-quality-index.mjs',import.meta.url);
 const source=(await fs.readFile(moduleUrl,'utf8')).replace("const AUDIT_FILE=fileURLToPath(new URL('./zip-denominator-audit.mjs',import.meta.url));",`const AUDIT_FILE=${JSON.stringify(auditCopy)};`).replace(/from '(\.\/[^']+)'/g,(_,relative)=>`from '${new URL(relative,moduleUrl).href}'`);
 const isolated=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
 await fs.appendFile(auditCopy,'\n// drift');await assert.rejects(isolated.publishRegistryZipQualityIndex({root:f.root,createdAt}),/audit code drift/);await fs.writeFile(auditCopy,auditBytes);
 const p=await isolated.publishRegistryZipQualityIndex({root:f.root,createdAt}),original=fs.open;let changed=false;
 const mock=t.mock.method(fs,'open',async(file,...args)=>{const h=await original(file,...args);if(file!==f.sourceFile)return h;return {stat:h.stat.bind(h),close:h.close.bind(h),read:async(...args)=>{const r=await h.read(...args);if(!changed){changed=true;await fs.appendFile(auditCopy,'\n// mid-read drift');}return r;}};});
 try{await assert.rejects(isolated.readRegistryZipQualityLookup({root:f.root,manifestPath:p.manifest_path,manifestSha256:p.manifest_sha256,zip5:'00501'}),/identity changed|audit code drift/);}finally{mock.mock.restore();}
 assert.equal(changed,true);assert.deepEqual(await fs.readFile(new URL('./zip-denominator-audit.mjs',import.meta.url)),auditBytes);
});
