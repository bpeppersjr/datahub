import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import {createHash} from 'node:crypto';
import {APP_ROOT} from './paths.mjs';
import {validateZctaDemographicInputReadinessRow} from './zcta-demographic-input-readiness.mjs';

const SHA=/^[a-f0-9]{64}$/;
const EXPECTED=33791;
const check=value=>{if(!value)throw Error('Registered ZCTA demographic readiness evidence is unavailable or incompatible.');};
const hash=value=>createHash('sha256').update(value).digest('hex');
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const safeRelative=value=>typeof value==='string'&&!path.isAbsolute(value)&&!value.includes('\\')&&value.split('/').every(part=>part&&part!=='.'&&part!=='..');
const stable=(left,right)=>left?.isFile()&&right?.isFile()&&!left.isSymbolicLink()&&!right.isSymbolicLink()&&left.nlink===1n&&right.nlink===1n&&['dev','ino','size','mtimeNs','ctimeNs'].every(key=>left[key]===right[key]);

async function readJson(file,maximum,signal){
 signal?.throwIfAborted();const before=await fs.lstat(file,{bigint:true});check(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1n&&before.size<=BigInt(maximum));
 const raw=await fs.readFile(file);signal?.throwIfAborted();const after=await fs.lstat(file,{bigint:true});check(stable(before,after));return {value:JSON.parse(raw),raw};
}

function validateRegistration(value){
 check(exact(value,['schema_version','dataset_id','publication_scope','current_pointer','production_enrollment','network_acquisition','retained_releases']));
 check(value.schema_version==='local-review-release-registration@1.0.0'&&value.dataset_id==='zcta-demographic-input-readiness'&&value.publication_scope==='local-review-only'&&value.current_pointer===null&&value.production_enrollment===false&&value.network_acquisition===false&&Array.isArray(value.retained_releases));
 const selected=value.retained_releases.filter(entry=>entry?.selected_for_review===true);check(selected.length===1);
 for(const entry of value.retained_releases)check(exact(entry,['release_id','manifest_path','manifest_sha256','status','selected_for_review'])&&/^zcta-demographic-input-readiness-[a-f0-9]{64}$/.test(entry.release_id)&&safeRelative(entry.manifest_path)&&SHA.test(entry.manifest_sha256)&&typeof entry.status==='string'&&typeof entry.selected_for_review==='boolean');
 check(selected[0].status==='verified-hardened-successor'&&selected[0].manifest_path===`data/zcta-demographic-input-readiness/releases/${selected[0].release_id}/manifest.json`);return selected[0];
}

function validateManifest(value,pin){
 check(exact(value,['release_id','schema_version','status','publication_mode','created_at','source','availability','claims','artifacts']));
 check(value.release_id===pin.release_id&&value.schema_version==='zcta-demographic-input-readiness@1.0.0'&&value.status==='local-review-only'&&value.publication_mode==='immutable-pointer-free'&&new Date(value.created_at).toISOString()===value.created_at);
 check(exact(value.source,['geography_release_id','manifest_path','manifest_sha256','artifact_path','artifact_sha256','record_count'])&&typeof value.source.geography_release_id==='string'&&value.source.geography_release_id.length>0&&safeRelative(value.source.manifest_path)&&safeRelative(value.source.artifact_path)&&SHA.test(value.source.manifest_sha256)&&SHA.test(value.source.artifact_sha256)&&value.source.record_count===EXPECTED);
 check(exact(value.availability,['population_2020','housing_units_2020','race','ancestry_lineage','sex','age'])&&value.availability.population_2020===true&&value.availability.housing_units_2020===true&&['race','ancestry_lineage','sex','age'].every(key=>value.availability[key]===false));
 check(exact(value.claims,['network_requests','current_pointer_written','production_enrollment','usps_zip_code','demographic_percentages','gdp'])&&value.claims.network_requests===0&&['current_pointer_written','production_enrollment','usps_zip_code','demographic_percentages','gdp'].every(key=>value.claims[key]===false));
 check(Array.isArray(value.artifacts)&&value.artifacts.length===1);const artifact=value.artifacts[0];check(exact(artifact,['path','bytes','sha256','record_count'])&&artifact.path==='zcta-demographic-input-readiness.jsonl'&&Number.isSafeInteger(artifact.bytes)&&artifact.bytes>0&&SHA.test(artifact.sha256)&&artifact.record_count===EXPECTED);
 const {release_id,...body}=value;check(release_id===`zcta-demographic-input-readiness-${hash(JSON.stringify(body))}`);return artifact;
}

export async function readZctaDemographicReadiness({zcta,root=APP_ROOT,signal}={}){
 check(/^\d{5}$/.test(zcta??''));root=path.resolve(root);signal?.throwIfAborted();
 const registrationFile=path.join(root,'config/datasets/zcta-demographic-input-readiness.json'),registration=(await readJson(registrationFile,100000,signal)).value,pin=validateRegistration(registration);
 const manifestFile=path.resolve(root,pin.manifest_path);check(manifestFile.startsWith(root+path.sep));const manifestRead=await readJson(manifestFile,200000,signal);check(hash(manifestRead.raw)===pin.manifest_sha256);const manifest=manifestRead.value,artifactMeta=validateManifest(manifest,pin);
 const artifactFile=path.resolve(path.dirname(manifestFile),artifactMeta.path);check(artifactFile.startsWith(path.dirname(manifestFile)+path.sep));const before=await fs.lstat(artifactFile,{bigint:true});check(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1n&&before.size===BigInt(artifactMeta.bytes));
 const digest=createHash('sha256'),stream=createReadStream(artifactFile);signal?.addEventListener('abort',()=>stream.destroy(signal.reason),{once:true});let count=0,previous='',row=null;
 try{for await(const line of readline.createInterface({input:stream,crlfDelay:Infinity})){signal?.throwIfAborted();check(line.length>0);digest.update(`${line}\n`);const candidate=validateZctaDemographicInputReadinessRow(JSON.parse(line));check(candidate.geography_release_id===manifest.source.geography_release_id&&candidate.zcta>previous);previous=candidate.zcta;count++;if(candidate.zcta===zcta)row=candidate;}}
 finally{stream.destroy();}
 signal?.throwIfAborted();const after=await fs.lstat(artifactFile,{bigint:true});check(stable(before,after)&&count===EXPECTED&&digest.digest('hex')===artifactMeta.sha256);
 const blockers=row?['race','ancestry_lineage','sex','age'].filter(key=>row.availability[key]===false).map(key=>`${key.replace('_','-')}-input-unavailable`):[];
 return {schema_version:'zcta-demographic-readiness-view@1.0.0',zcta,available:Boolean(row),status:row?'found':'not-found',readiness:row?{status:row.status,population_2020:row.population_2020,housing_units_2020:row.housing_units_2020,availability:{...row.availability},blockers}:null,provenance:{release_id:manifest.release_id,manifest_sha256:pin.manifest_sha256,artifact_sha256:artifactMeta.sha256,created_at:manifest.created_at,geography_release_id:manifest.source.geography_release_id},claims:{official_zip_code:false,demographic_percentages:false,gdp:false,network_requests:0,current_pointer_written:false,production_enrollment:false}};
}
