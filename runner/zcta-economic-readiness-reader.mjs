import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {APP_ROOT} from './paths.mjs';
import {mnSelectionReadJson as readJson} from './mn-construction-retained-selection.mjs';
import {validateZctaEconomicReadinessRow} from './zcta-economic-readiness-index.mjs';

const SHA=/^[a-f0-9]{64}$/;
const check=ok=>{if(!ok)throw Error('Registered ZCTA readiness evidence is unavailable or incompatible.');};
const hash=value=>createHash('sha256').update(value).digest('hex');
const stable=(a,b)=>a&&b&&a.isFile()&&b.isFile()&&!a.isSymbolicLink()&&!b.isSymbolicLink()&&a.nlink===1n&&b.nlink===1n&&['dev','ino','size','mtimeNs','ctimeNs'].every(key=>a[key]===b[key]);
const claims={official_zip_code:false,active_businesses:false,numeric_gdp_or_demographic_allocation:false};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(key=>Object.hasOwn(v,key));
const integer=v=>Number.isSafeInteger(v)&&v>=0;
const safeRelative=v=>typeof v==='string'&&!path.isAbsolute(v)&&!v.includes('\\')&&v.split('/').every(p=>p&&p!=='.'&&p!=='..');

async function slice(file,entry,signal){
 signal?.throwIfAborted();const handle=await fs.open(file,'r');
 try{const before=await handle.stat({bigint:true}),buffer=Buffer.alloc(entry.bytes);let read=0;while(read<buffer.length){const part=await handle.read(buffer,read,buffer.length-read,entry.offset+read);check(part.bytesRead>0);read+=part.bytesRead;}signal?.throwIfAborted();const after=await handle.stat({bigint:true});check(stable(before,after)&&hash(buffer)===entry.sha256&&buffer.at(-1)===10);return {value:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer)),identity:after};}
 finally{await handle.close();}
}

function project(row,manifest,registration,zcta){
 const provenance={release_id:manifest.release_id,manifest_sha256:registration.retained_release.source_manifest_sha256,artifact_sha256:manifest.artifacts[0].sha256,created_at:manifest.created_at,geography_release_id:row?.geography_release_id??manifest.inputs.find(input=>input.dataset_id==='us-census-geography').release_id,input_releases:manifest.inputs.map(({dataset_id,release_id,manifest_sha256})=>({dataset_id,release_id,manifest_sha256}))};
 const base={schema_version:'zcta-economic-readiness-view@1.0.0',zcta,available:Boolean(row),status:row?'found':'not-found',provenance,limitations:[...manifest.limitations],claims:{...claims}};
 if(!row)return {...base,readiness:null};
 check(row.claims?.official_zip_code===false&&row.claims?.active_businesses===false&&row.claims?.numeric_gdp_or_demographic_allocation===false&&row.model_status==='withheld');
 const readiness=Object.fromEntries(['population_2020','housing_units_2020','zbp_publication_status','relationship_count','material_relationship_count','state_fips','county_geoids','direct_county_gdp_count','missing_county_gdp_geoids','direct_gdp_relationship_coverage','model_status','blockers'].map(key=>[key,row[key]]));
 return {...base,readiness};
}

/** Exact retained-release lookup. Reads one bounded shard and one source row; never scans the JSONL. */
export async function readZctaEconomicReadiness({zcta,root=APP_ROOT,signal}={}){
 check(/^\d{5}$/.test(zcta??''));root=path.resolve(root);signal?.throwIfAborted();
 const registrationRead=await readJson(path.join(root,'config/datasets/zcta-economic-readiness-index.json'),32000,signal,{}),registration=registrationRead;
 check(exact(registration,['schema_version','dataset_id','status','release_only','runtime_pointer','production_enrollment','current_pointer_written','export_policy','retained_release'])&&registration.schema_version==='1.0.0'&&registration.dataset_id==='zcta-economic-readiness-index'&&registration.status==='registered-local-lookup-index'&&registration.release_only===true&&registration.runtime_pointer===null&&registration.production_enrollment===false&&registration.current_pointer_written===false&&registration.export_policy==='aggregate-public-context');
 const pin=registration.retained_release;check(pin&&SHA.test(pin.manifest_sha256)&&SHA.test(pin.source_manifest_sha256)&&SHA.test(pin.source_artifact_sha256));
 check(exact(pin,['release_id','manifest','manifest_bytes','manifest_sha256','source_release_id','source_manifest','source_manifest_sha256','source_artifact_sha256'])&&safeRelative(pin.manifest)&&safeRelative(pin.source_manifest)&&pin.manifest===`data/zcta-economic-readiness-index/releases/${pin.release_id}/manifest.json`);
 const indexMeter={},index=await readJson(path.join(root,pin.manifest),32000,signal,indexMeter);check(indexMeter.sha256===pin.manifest_sha256&&indexMeter.bytes===pin.manifest_bytes&&exact(index,['release_id','schema_version','status','created_at','source','claims','artifacts'])&&index.schema_version==='zcta-economic-readiness-index@1.0.0'&&index.release_id===pin.release_id&&index.status==='immutable-local-lookup-index'&&index.source.release_id===pin.source_release_id&&index.source.record_count===33791&&index.source.artifact_sha256===pin.source_artifact_sha256&&index.claims.network_requests===0&&index.claims.current_pointer_written===false&&index.claims.production_enrollment===false);
 const {release_id:indexReleaseId,...indexBody}=index;check(indexReleaseId===`zcta-economic-readiness-index-${hash(JSON.stringify(indexBody))}`&&exact(index.source,['release_id','manifest_sha256','artifact_path','artifact_bytes','artifact_sha256','record_count'])&&exact(index.claims,['network_requests','current_pointer_written','production_enrollment']));
 let previous='',inventoryCount=0;for(const a of index.artifacts){check(exact(a,['path','prefix','bytes','sha256','record_count'])&&/^zcta-\d{2}\.json$/.test(a.path)&&a.prefix===a.path.slice(5,7)&&a.prefix>previous&&integer(a.bytes)&&a.bytes>0&&a.bytes<=131072&&SHA.test(a.sha256)&&integer(a.record_count)&&a.record_count>0);previous=a.prefix;inventoryCount+=a.record_count;}check(index.artifacts.length<=100&&inventoryCount===index.source.record_count);
 const sourceMeter={},manifest=await readJson(path.join(root,pin.source_manifest),100000,signal,sourceMeter);check(sourceMeter.sha256===pin.source_manifest_sha256&&manifest.dataset_id==='zcta-economic-model-readiness'&&manifest.release_id===pin.source_release_id&&manifest.publication_mode==='immutable-pointer-free'&&manifest.status==='published'&&manifest.artifacts.length===1&&manifest.artifacts[0].sha256===pin.source_artifact_sha256&&manifest.artifacts[0].path===index.source.artifact_path&&manifest.artifacts[0].bytes===index.source.artifact_bytes&&manifest.artifacts[0].record_count===index.source.record_count);
 check(Array.isArray(manifest.inputs)&&manifest.inputs.length===4);for(const input of manifest.inputs){check(exact(input,['dataset_id','release_id','manifest_path','manifest_sha256'])&&SHA.test(input.manifest_sha256));const dependencyPath=path.resolve(input.manifest_path);check(dependencyPath.startsWith(root+path.sep));const meter={},dependency=await readJson(dependencyPath,2000000,signal,meter);check(meter.sha256===input.manifest_sha256&&dependency.dataset_id===input.dataset_id&&dependency.release_id===input.release_id);}
 const shardMeta=index.artifacts.find(item=>item.prefix===zcta.slice(0,2));let row=null,sourceIdentity=null;
 const artifact=path.join(path.dirname(path.join(root,pin.source_manifest)),index.source.artifact_path),before=await fs.lstat(artifact,{bigint:true});check(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1n&&before.size===BigInt(index.source.artifact_bytes));
 if(shardMeta){const meter={},shard=await readJson(path.join(path.dirname(path.join(root,pin.manifest)),shardMeta.path),131072,signal,meter);check(meter.sha256===shardMeta.sha256&&meter.bytes===shardMeta.bytes&&Array.isArray(shard)&&shard.length===shardMeta.record_count);let prior='';for(const entry of shard){check(exact(entry,['zcta','offset','bytes','sha256'])&&/^\d{5}$/.test(entry.zcta)&&entry.zcta.slice(0,2)===shardMeta.prefix&&entry.zcta>prior&&integer(entry.offset)&&integer(entry.bytes)&&entry.bytes>0&&entry.bytes<=16384&&entry.offset+entry.bytes<=index.source.artifact_bytes&&SHA.test(entry.sha256));prior=entry.zcta;}const entry=shard.find(v=>v.zcta===zcta);if(entry){const result=await slice(artifact,entry,signal);row=result.value;sourceIdentity=result.identity;check(row.zcta===zcta);}}
 if(row)validateZctaEconomicReadinessRow(row);const after=await fs.lstat(artifact,{bigint:true});check(stable(before,after)&&(!sourceIdentity||stable(sourceIdentity,after)));signal?.throwIfAborted();return project(row,manifest,registration,zcta);
}
