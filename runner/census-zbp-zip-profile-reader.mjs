import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual as same} from 'node:util';
import {APP_ROOT} from './paths.mjs';
import {mnSelectionReadJson as readJson,mnSelectionCanonical as canonical} from './mn-construction-retained-selection.mjs';
import {readCensusZbpZipProfile,CENSUS_ZBP_ZIP_PROFILE_INDEX_VERSION} from './census-zbp-zip-profile-index.mjs';
const ID='census-zbp-zip-profile-index',hash=v=>createHash('sha256').update(v).digest('hex');
const check=v=>{if(!v)throw Error('Registered ZBP ZIP profile unavailable or incompatible.');};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&same(Object.keys(v).sort(),keys.sort());
const stable=(a,b)=>a?.isFile()&&b?.isFile()&&!a.isSymbolicLink()&&!b.isSymbolicLink()&&a.nlink===1n&&b.nlink===1n&&['ino','dev','size','mtimeNs','ctimeNs'].every(k=>a[k]===b[k]);
const claims={export_policy:'local-review-only',reference_year:2023,hierarchical_aggregation_permitted:false,zip4:null,current_operations_verified:false,current_operating_business_count:null,gdp:null,all_business_completion_percent:null,network_requests:0,current_pointer_written:false,production_enrollment:false};
export function unavailableCensusZbpZipProfile(zip){return{schema_version:'census-zbp-zip-industry-view@1.0.0',zip5:zip,available:false,status:'unavailable',scope:'zip-wide-not-filtered-by-app-category',reference_year:2023,index:null,bindings:null,profile:null,claims:{...claims}};}
/** Closed tracked registration only. No discovery, decompression, build or fallback. */
export async function readRegisteredCensusZbpZipProfile(opts={}){
 check(opts&&Object.keys(opts).every(k=>['root','zip','signal','catalog'].includes(k)));const{zip,signal,catalog}=opts,root=path.resolve(opts.root??APP_ROOT);check(/^\d{5}$/.test(zip));signal?.throwIfAborted();
 const reads=[],files=[];
 async function read(relative,max){check(typeof relative==='string'&&!path.isAbsolute(relative)&&!relative.includes('\\')&&relative.split('/').every(p=>p&&p!=='.'&&p!=='..'));const file=path.join(root,relative),meter={},value=await readJson(file,max,signal,meter);reads.push({file,max,...meter});return{value,meter};}
 const {value:r}=await read(`config/datasets/${ID}.json`,100000);
 check(exact(r,['dataset_id','schema_version','status','release_only','runtime_pointer','production_enrollment','national_reporting_denominator_enrollment','current_pointer_written','export_policy','retained_release','claims','limitations','documentation'])&&r.dataset_id===ID&&r.schema_version==='1.0.0'&&r.status==='registered-local-lookup-index'&&r.release_only===true&&r.runtime_pointer===null&&r.production_enrollment===false&&r.national_reporting_denominator_enrollment===false&&r.current_pointer_written===false&&r.export_policy==='local-review-only'&&same(r.claims,claims));
 const p=r.retained_release;check(exact(p,['release_id','manifest','manifest_sha256','manifest_bytes','manifest_schema_version','status','created_at','source_rows','indexed_zip_count','bindings','artifact_count','artifact_bytes','artifact_inventory_sha256','artifact_inventory_hash_encoding','artifacts'])&&new RegExp(`^${ID}-[a-f0-9]{64}$`).test(p.release_id)&&p.manifest===`data/${ID}/releases/${p.release_id}/manifest.json`);
 const {value:m,meter}=await read(p.manifest,100000);check(meter.bytes===p.manifest_bytes&&meter.sha256===p.manifest_sha256&&m.schema_version===CENSUS_ZBP_ZIP_PROFILE_INDEX_VERSION&&p.manifest_schema_version===m.schema_version&&same(m.claims,claims));
 for(const k of ['release_id','status','created_at','source_rows','indexed_zip_count','bindings','artifacts'])check(same(m[k],p[k]));
 check(m.artifacts.length===20&&p.artifact_count===20&&p.artifact_bytes===m.artifacts.reduce((n,a)=>n+a.bytes,0)&&p.artifact_inventory_sha256===hash(JSON.stringify(m.artifacts))&&p.artifact_inventory_hash_encoding==='SHA-256 of UTF-8 JSON.stringify(manifest.artifacts), in retained order');
 const b=m.bindings;
 // The selected registry's baseline dependency may occur once per integrated source;
 // every occurrence must agree, not merely the first match.
 const {value:rp,meter:rpMeter}=await read('data/business-registry/current.json',16000);check(rp.dataset_id==='national-business-registry'&&/^releases\/[A-Za-z0-9-]+\/manifest.json$/.test(rp.manifest));
 const {value:rm,meter:rmMeter}=await read(`data/business-registry/${rp.manifest}`,2000000);check(rm.release_id===rp.release_id&&rm.dataset_id===rp.dataset_id);const deps=rm.dependencies.filter(d=>d.dataset_id==='census-zbp-baseline');check(deps.length>0&&deps.every(d=>d.release_id===b.release_id&&d.manifest_sha256===b.manifest_sha256));
 if(catalog)check(catalog.registry_release_id===rm.release_id&&catalog.registry_manifest_sha256===rmMeter.sha256&&catalog.geography_release_id===b.geography.release_id&&catalog.geography_manifest_sha256===b.geography.manifest_sha256);
 const source=await read(b.pointer_path,16000),sourceManifest=await read(b.manifest_path,2000000);check(source.meter.sha256===b.pointer_sha256&&sourceManifest.meter.sha256===b.manifest_sha256);
 const geo=await read('data/geography/current.json',16000);check(/^releases\/[A-Za-z0-9-]+\/manifest.json$/.test(geo.value.manifest));const gm=await read(`data/geography/${geo.value.manifest}`,2000000);check(geo.meter.sha256===b.geography.pointer_sha256&&gm.meter.sha256===b.geography.manifest_sha256);
 const policy=await read('config/source-policies/us-census-zbp.json',32000);check(policy.meter.sha256===b.policy.sha256);
 const dir=path.posix.dirname(p.manifest),bucket=m.artifacts.find(a=>a.path===`index-${zip[0]}.json`);check(bucket);const index=await read(`${dir}/${bucket.path}`,2000000);check(index.meter.sha256===bucket.sha256&&index.meter.bytes===bucket.bytes);
 for(const a of [m.artifacts.find(a=>a.path===`profiles-${zip[0]}.jsonl`),...b.artifacts]){check(a);const file=path.join(root,a.path.startsWith('profiles-')?dir:path.posix.dirname(b.manifest_path),a.path);await canonical(path.dirname(file),{signal});const identity=await fs.lstat(file,{bigint:true});check(stable(identity,identity)&&identity.size===BigInt(a.bytes));files.push({file,identity});}
 const result=await readCensusZbpZipProfile({root,signal,manifestPath:path.join(root,p.manifest),manifestSha256:p.manifest_sha256,zip5:zip});
 check(result.zip5===zip&&result.index_release_id===p.release_id&&result.index_manifest_sha256===p.manifest_sha256&&same(result.bindings,b)&&same(result.claims,claims)&&['present','absent-from-selected-zbp-zip-union'].includes(result.status));
 if(result.profile)check(result.profile.zip5===zip&&result.profile.reference_year===2023&&result.profile.zip4===null&&['published-industry-rows','no-published-industry-rows'].includes(result.profile.status));
 const value={schema_version:'census-zbp-zip-industry-view@1.0.0',zip5:zip,available:true,status:result.status,scope:'zip-wide-not-filtered-by-app-category',reference_year:2023,index:{release_id:p.release_id,manifest_sha256:p.manifest_sha256,registration_sha256:reads[0].sha256},bindings:{...b,selected_registry:{release_id:rm.release_id,manifest_sha256:rmMeter.sha256,pointer_sha256:rpMeter.sha256}},profile:result.profile,claims:{...claims}};
 check(Buffer.byteLength(JSON.stringify(value))<=1500000);
 async function recheck(){for(const r of reads){const meter={};await readJson(r.file,r.max,signal,meter);check(meter.sha256===r.sha256&&stable(meter.identity,r.identity));}for(const f of files){await canonical(path.dirname(f.file),{signal});check(stable(f.identity,await fs.lstat(f.file,{bigint:true})));}signal?.throwIfAborted();}
 await recheck();return{value,recheck};
}
