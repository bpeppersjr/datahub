import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {Readable,Writable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {APP_ROOT} from './paths.mjs';
import {publishCensusZbpZipProfileIndex as publish,verifyCensusZbpZipProfileIndex as verify,readCensusZbpZipProfile as lookup} from './census-zbp-zip-profile-index.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex'),raw=v=>Buffer.from(`${JSON.stringify(v)}\n`),clock='2026-10-02T00:00:00.000Z';
const sizes=['size_1_4','size_5_9','size_10_19','size_20_49','size_50_99','size_100_249','size_250_499','size_500_999','size_1000_plus'];
const columns=['zip_code','naics_code','establishments',...sizes.flatMap(k=>[k,`${k}_suppression_code`]),'preferred_city','preferred_state','county_name'];
async function fixture(t,{duplicate=false}={}){
 const root=await fs.mkdtemp(path.join(APP_ROOT,'data/tmp/zbp-zip-index-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 async function write(relative,value){const file=path.join(root,relative),b=Buffer.isBuffer(value)?value:raw(value);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,b);return b;}
 const geo={schema_version:'1.0.0',dataset_id:'us-census-geography',release_id:'geo-fixture',artifacts:[]},gb=await write('data/geography/releases/geo-fixture/manifest.json',geo);
 await write('data/geography/current.json',{dataset_id:geo.dataset_id,release_id:geo.release_id,manifest:'releases/geo-fixture/manifest.json'});
 await write('config/source-policies/us-census-zbp.json',JSON.parse(await fs.readFile(path.join(APP_ROOT,'config/source-policies/us-census-zbp.json'))));
 const base='data/business-baselines/census-zbp/releases/zbp-fixture',artifacts=[];
 async function artifact(p,b,type,n,partition){await write(`${base}/${p}`,b);artifacts.push({path:p,bytes:b.length,sha256:sha(b),record_count:n,artifact_type:type,...(partition!==undefined?{partition}: {})});}
 const cover=['00501','00502','99999'].map(zip=>({zip_code:zip,reference_year:2023,geography:{status:zip==='99999'?'not-observed':'2020-zcta-polygon-available',geoid:zip==='99999'?null:zip},baseline:{establishments:zip==='00502'?null:0}}));
 await artifact('derived/zip-coverage.jsonl',Buffer.concat(cover.map(raw)),'zip-coverage-union-jsonl',3);
 await artifact('derived/naics-coverage.jsonl',Buffer.concat(['23----','236---'].map(naics_code=>raw({naics_code}))),'naics-coverage-jsonl',2);
 function row(zip,code){const r=Object.fromEntries(columns.map(k=>[k,'']));Object.assign(r,{zip_code:zip,naics_code:code,establishments:'0',size_1_4:'0',size_5_9_suppression_code:'D',preferred_city:'Publisher label',preferred_state:'NY',county_name:'Not an assignment'});return columns.map(k=>r[k]).join(',');}
 for(let i=0;i<10;i++){const rows=i===0?[row('00501','23----'),row('00501',duplicate?'23----':'236---')]:i===9?[row('99999','23----')]:[];await artifact(`derived/zip-naics/prefix=${i}.csv.gz`,gzipSync(`${columns.join(',')}\n${rows.length?`${rows.join('\n')}\n`:''}`),'normalized-zbp-naics-csv-gzip',rows.length,String(i));}
 const manifest={schema_version:'1.0.0',dataset_id:'census-zbp-baseline',release_id:'zbp-fixture',reference_year:2023,retrieved_at:'2026-01-01T00:00:00.000Z',complete_national_release:true,coverage:{industry_detail_rows:3},geography_dependency:{release_id:geo.release_id,manifest_sha256:sha(gb)},artifacts};await write(`${base}/manifest.json`,manifest);await write('data/business-baselines/census-zbp/current.json',{dataset_id:manifest.dataset_id,release_id:manifest.release_id,manifest:'releases/zbp-fixture/manifest.json'});
 return{root,write,base,manifest,source:path.join(root,base,artifacts[2].path)};
}
const build=f=>publish({root:f.root,createdAt:clock});
const read=(f,r,zip5)=>lookup({root:f.root,manifestPath:r.manifest_path,manifestSha256:r.manifest_sha256,zip5});

test('full reconstruction and bounded lookup preserve exact NAICS hierarchy, suppression, zero, labels and absent semantics',async t=>{
 const f=await fixture(t),r=await build(f),v=await verify(r.manifest_path,{root:f.root});assert.equal(v.source_rows,3);assert.equal(v.indexed_zip_count,3);
 const q=await read(f,r,'00501');assert.equal(q.source_payload_bytes_read,0);assert.equal(q.profile.industry_rows.length,2);assert.deepEqual(q.profile.industry_rows.map(r=>r.naics_code),['23----','236---']);assert.equal(q.profile.industry_rows[0].establishments,0);assert.equal(q.profile.industry_rows[0].size_5_9,null);assert.equal(q.profile.industry_rows[0].size_5_9_suppression_code,'D');assert.equal(q.profile.industry_rows[0].publisher_place_labels.county_name,'Not an assignment');assert.equal(q.claims.gdp,null);assert.equal(q.claims.hierarchical_aggregation_permitted,false);
 assert.equal((await read(f,r,'00502')).profile.status,'no-published-industry-rows');assert.equal((await read(f,r,'00001')).status,'absent-from-selected-zbp-zip-union');assert.equal((await read(f,r,'99999')).profile.zip_coverage.geography.geoid,null);
 assert.equal((await build(f)).reused,true);await assert.rejects(fs.stat(path.join(f.root,'data/census-zbp-zip-profile-index/current.json')),{code:'ENOENT'});
});

test('lookup uses positional derivative ranges and never opens a compressed source',async t=>{
 const f=await fixture(t),r=await build(f),original=fs.open;let rangeReads=0;t.mock.method(fs,'open',async function(file,...args){assert.ok(!String(file).endsWith('.csv.gz'));const h=await original.call(this,file,...args);if(String(file).endsWith('profiles-0.jsonl')){const read=h.read.bind(h);h.read=async(...a)=>{assert.ok(Number.isInteger(a[3]));rangeReads++;return read(...a);};}return h;});await read(f,r,'00501');assert.ok(rangeReads>0);
});

test('duplicate ZIP/NAICS fails and cleans owned staging/lock',async t=>{const f=await fixture(t,{duplicate:true});await assert.rejects(build(f),/duplicate/);assert.deepEqual(await fs.readdir(path.join(f.root,'data/census-zbp-zip-profile-index/.staging')),[]);assert.deepEqual(await fs.readdir(path.join(f.root,'data/census-zbp-zip-profile-index/.locks')),[]);});

test('source pointer drift and extra release files fail closed',async t=>{
 const f=await fixture(t),r=await build(f);await fs.writeFile(path.join(path.dirname(r.manifest_path),'extra.json'),'{}');await assert.rejects(read(f,r,'00501'),/inventory/);await fs.unlink(path.join(path.dirname(r.manifest_path),'extra.json'));await f.write('data/business-baselines/census-zbp/current.json',{dataset_id:'wrong'});await assert.rejects(read(f,r,'00501'),/pointer/);
});

test('rehashed omitted profile entry is rejected by independent full reconstruction',async t=>{
 const f=await fixture(t),r=await build(f),dir=path.dirname(r.manifest_path),m=JSON.parse(await fs.readFile(r.manifest_path));
 const entries=JSON.parse(await fs.readFile(path.join(dir,'index-0.json'))),cut=entries[0].bytes,shard=await fs.readFile(path.join(dir,'profiles-0.jsonl'));entries.shift();for(const e of entries)e.offset-=cut;
 const nextShard=shard.subarray(cut),nextIndex=raw(entries);await fs.writeFile(path.join(dir,'profiles-0.jsonl'),nextShard);await fs.writeFile(path.join(dir,'index-0.json'),nextIndex);
 Object.assign(m.artifacts[0],{bytes:nextShard.length,sha256:sha(nextShard),profiles:1,industry_rows:0});Object.assign(m.artifacts[1],{bytes:nextIndex.length,sha256:sha(nextIndex),profiles:1});const{release_id,...body}=m;void release_id;m.release_id=`census-zbp-zip-profile-index-${sha(JSON.stringify(body))}`;await fs.writeFile(r.manifest_path,raw(m));const moved=path.join(path.dirname(dir),m.release_id);await fs.rename(dir,moved);await assert.rejects(verify(path.join(moved,'manifest.json'),{root:f.root}),/reconstruction/);
});

test('range tamper, hardlinks and symlink ancestry are rejected',async t=>{
 const f=await fixture(t),r=await build(f),file=path.join(path.dirname(r.manifest_path),'profiles-0.jsonl'),backup=await fs.readFile(file);await fs.writeFile(file,Buffer.alloc(backup.length,32));await assert.rejects(read(f,r,'00501'),/range hash/);await fs.writeFile(file,backup);const link=path.join(f.root,'hardlink');await fs.link(file,link);await assert.rejects(read(f,r,'00501'),/shard/);await fs.unlink(link);
 const alias=path.join(f.root,'alias');await fs.symlink(path.dirname(r.manifest_path),alias,'junction');await assert.rejects(lookup({root:f.root,manifestPath:path.join(alias,'manifest.json'),manifestSha256:r.manifest_sha256,zip5:'00501'}),/alias|path/);
});

test('cancel during first compressed read closes handle and cleans before publication',async t=>{
 const f=await fixture(t),controller=new AbortController(),original=fs.open;let closed=false;t.mock.method(fs,'open',async function(file,...args){const h=await original.call(this,file,...args);if(String(file)===f.source){const read=h.read.bind(h),close=h.close.bind(h);h.read=async(...a)=>{const r=await read(...a);controller.abort();return r;};h.close=async()=>{closed=true;await close();};}return h;});await assert.rejects(publish({root:f.root,createdAt:clock,signal:controller.signal}),{name:'AbortError'});assert.equal(closed,true);assert.deepEqual(await fs.readdir(path.join(f.root,'data/census-zbp-zip-profile-index/.staging')),[]);
});

test('concurrent identical publishers never take another lock',async t=>{const f=await fixture(t);const results=await Promise.allSettled([build(f),build(f)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);});

test('lock cleanup failure reports published recovery rather than successful completion',async t=>{
 const f=await fixture(t),original=fs.unlink;t.mock.method(fs,'unlink',async function(file,...args){if(String(file).endsWith('.lock'))throw Error('fixture unlink');return original.call(this,file,...args);});await assert.rejects(build(f),e=>e.inspection_required&&e.recovery.publication_state==='published'&&e.recovery.lock_cleanup.issues.includes('lock-unlink-failed'));
});

test('unsupported options and malformed lookup ZIP reject without dispatch',async()=>{await assert.rejects(publish({createdAt:clock,source:'arbitrary'}),/options/);await assert.rejects(lookup({zip5:'501',manifestPath:'manifest.json',manifestSha256:'a'.repeat(64)}),/input/);});

test('changed lock ownership is retained and primary source error remains primary',async t=>{
 const f=await fixture(t,{duplicate:true}),original=fs.open;let replacement;
 t.mock.method(fs,'open',async function(file,...args){const h=await original.call(this,file,...args);if(String(file).endsWith('.lock')){const close=h.close.bind(h);h.close=async()=>{await close();await fs.unlink(file);await fs.writeFile(file,'replacement');replacement=String(file);};}return h;});
 await assert.rejects(build(f),e=>/duplicate/.test(e.message)&&e.recovery?.publication_state==='not-published'&&e.recovery.lock_cleanup.issues.includes('lock-ownership-mismatch'));
 assert.equal(await fs.readFile(replacement,'utf8'),'replacement');
});

test('cancel immediately after atomic rename retains published release for inspection',async t=>{
 const f=await fixture(t),controller=new AbortController(),original=fs.rename;let target;
 t.mock.method(fs,'rename',async function(from,to){await original.call(this,from,to);target=to;controller.abort();});
 await assert.rejects(publish({root:f.root,createdAt:clock,signal:controller.signal}),e=>e.name==='AbortError'&&e.inspection_required&&/^census-zbp-zip-profile-index-/.test(e.release_id));
 assert.ok((await fs.stat(path.join(target,'manifest.json'))).isFile());
});

test('concurrent compressed source growth is rejected without consuming appended bytes',async t=>{
 const f=await fixture(t),original=fs.open,expected=(await fs.stat(f.source)).size;let consumed=0,changed=false;
 t.mock.method(fs,'open',async function(file,...args){const h=await original.call(this,file,...args);if(String(file)===f.source){const read=h.read.bind(h);h.read=async(...a)=>{const result=await read(...a);consumed+=result.bytesRead;if(!changed){changed=true;await fs.appendFile(file,Buffer.alloc(4096));}return result;};}return h;});
 await assert.rejects(build(f),/file changed/);assert.equal(consumed,expected);
});

// Test-only exposure from an owned module copy, not an installed API or option.
async function admissionFixture(t,installedRoot=APP_ROOT){
 const root=await fs.mkdtemp(path.join(APP_ROOT,'data/tmp/zbp-resource-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const source=await fs.readFile(new URL('./census-zbp-zip-profile-index.mjs',import.meta.url),'utf8');
 const isolated=source.replace("import {APP_ROOT} from './paths.mjs';",`const APP_ROOT=${JSON.stringify(installedRoot)};`).replace(/from '(\.\/[^']+)'/g,(_all,relative)=>`from '${new URL(relative,import.meta.url).href}'`);
 const file=path.join(root,'resource-fixture.mjs');await fs.writeFile(file,`${isolated}\nexport {resourceAdmission,decodedCeiling};\n`);
 return import(pathToFileURL(file).href);
}

test('native resource admission rejects low disk/memory and accepts exact conservative boundaries',async t=>{
 const subject=await admissionFixture(t),limits=subject.CENSUS_ZBP_ZIP_PROFILE_ADMISSION;let disk=BigInt(limits.freeDiskBytes),total=limits.totalMemoryBytes,free=limits.freeMemoryBytes;
 t.mock.method(fs,'statfs',async()=>({bavail:disk,bsize:1n}));t.mock.method(os,'totalmem',()=>total);t.mock.method(os,'freemem',()=>free);
 disk--;await assert.rejects(subject.resourceAdmission(APP_ROOT),/insufficient free disk/);disk++;
 total--;await assert.rejects(subject.resourceAdmission(APP_ROOT),/insufficient memory/);total++;
 free--;await assert.rejects(subject.resourceAdmission(APP_ROOT),/insufficient memory/);free++;
 await subject.resourceAdmission(APP_ROOT);free=NaN;await assert.rejects(subject.resourceAdmission(APP_ROOT),/insufficient memory/);
});

test('installed publisher cannot bypass native admission via resolved root or override before lock/staging',async t=>{
 const f=await fixture(t),subject=await admissionFixture(t,f.root);
 const original=fs.open;let lockOpens=0;t.mock.method(fs,'statfs',async()=>({bavail:0n,bsize:4096n}));t.mock.method(fs,'open',async function(file,...args){if(String(file).endsWith('.lock'))lockOpens++;return original.call(this,file,...args);});
 await assert.rejects(subject.publishCensusZbpZipProfileIndex({root:path.join(f.root,'.'),createdAt:clock}),/insufficient free disk/);assert.equal(lockOpens,0);
 await assert.rejects(subject.publishCensusZbpZipProfileIndex({root:f.root,createdAt:clock,skipResourceAdmission:true}),/options/);
});

test('distinct app-contained synthetic root does not impose host resource floors',async t=>{
 const f=await fixture(t);t.mock.method(fs,'statfs',()=>assert.fail('fixture must not require native disk floor'));t.mock.method(os,'totalmem',()=>0);t.mock.method(os,'freemem',()=>0);assert.equal((await build(f)).verified,true);
});

test('high-cardinality long-label decoded stream stops at byte ceiling before forwarding over-bound chunk',async t=>{
 const subject=await admissionFixture(t),maximum=subject.CENSUS_ZBP_ZIP_PROFILE_LIMITS.decoded;let emitted=0,produced=0;
 async function* rows(){const label='X'.repeat(256);for(let i=0;i<200000;i++){const zip=String(Math.floor(i/200)).padStart(5,'0'),code=String(100000+i%200),row=Buffer.from(`${zip},${code},0,${label},${label},${label}\n`);produced+=row.length;yield row;}}
 await assert.rejects(pipeline(Readable.from(rows()),subject.decodedCeiling(),new Writable({write(chunk,_encoding,done){emitted+=chunk.length;done();}})),/decoded ceiling/);
 assert.ok(emitted<=maximum);assert.ok(produced>maximum);assert.ok(emitted>maximum-1000);
 let accepted=0;async function* boundary(){let remaining=maximum;while(remaining){const n=Math.min(65536,remaining);remaining-=n;yield Buffer.alloc(n);}}
 await pipeline(Readable.from(boundary()),subject.decodedCeiling(),new Writable({write(chunk,_encoding,done){accepted+=chunk.length;done();}}));assert.equal(accepted,maximum);
});
