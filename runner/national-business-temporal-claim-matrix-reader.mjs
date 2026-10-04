import path from 'node:path';
import {createHash} from 'node:crypto';
import {APP_ROOT} from './paths.mjs';
import {mnSelectionReadJson as readJson} from './mn-construction-retained-selection.mjs';

const SHA=/^[a-f0-9]{64}$/;
const RELEASE=/^national-business-temporal-claim-matrix-[a-f0-9]{64}$/;
const check=ok=>{if(!ok)throw Error('Registered national temporal coverage evidence is unavailable or incompatible.');};
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const safeRelative=value=>typeof value==='string'&&!path.isAbsolute(value)&&!value.includes('\\')&&value.split('/').every(part=>part&&part!=='.'&&part!=='..');
const hash=value=>createHash('sha256').update(value).digest('hex');
const integer=value=>Number.isSafeInteger(value)&&value>=0;

function validateSummary(summary){
 const keys=['source_count','source_defined_current_membership_sources','non_active_directory_registration_reporting_sources','annual_aggregate_sources','broad_state_dc_source_defined_active','broad_state_dc_total','broad_state_dc_gaps','verified_current_complete_jurisdictions','verified_current_complete_gaps','active_business_count','completeness_percentage'];
 check(exact(summary,keys)&&keys.slice(0,9).every(key=>integer(summary[key]))&&summary.source_count===30&&summary.source_defined_current_membership_sources===22&&summary.non_active_directory_registration_reporting_sources===7&&summary.annual_aggregate_sources===1&&summary.broad_state_dc_source_defined_active===11&&summary.broad_state_dc_total===51&&summary.broad_state_dc_gaps===40&&summary.verified_current_complete_jurisdictions===0&&summary.verified_current_complete_gaps===51&&summary.active_business_count===null&&summary.completeness_percentage===null);
}

function validateRows(raw){
 const text=new TextDecoder('utf-8',{fatal:true}).decode(raw);check(text.endsWith('\n'));
 const lines=text.slice(0,-1).split('\n');check(lines.length===30);const seen=new Set(),rows=[];let current=0,nonActive=0,annual=0,broad=0;
 for(const line of lines){const row=JSON.parse(line);check(row.schema_version==='1.0.0'&&typeof row.source_key==='string'&&!seen.has(row.source_key)&&['source-defined-current-membership','non-active-reporting-membership','annual-aggregate'].includes(row.classification)&&typeof row.cohort_scope==='string'&&typeof row.jurisdiction_scope==='string'&&row.current_operations_verified===false&&row.complete_all_businesses===false&&Array.isArray(row.temporal_limitations)&&row.temporal_limitations.length===3&&SHA.test(row.policy_sha256));seen.add(row.source_key);check(row.source_defined_current_membership===(row.classification==='source-defined-current-membership'));current+=Number(row.source_defined_current_membership);nonActive+=Number(row.classification==='non-active-reporting-membership');annual+=Number(row.classification==='annual-aggregate');broad+=Number(row.broad_state_dc_source_defined_active===true);rows.push(row);}
 check(seen.size===30&&current===22&&nonActive===7&&annual===1&&broad===11);
 return rows;
}

/** Reads the one explicitly selected pointer-free release; it never consults or creates a runtime pointer. */
async function readMatrix({root=APP_ROOT,signal,includeRows=false}={}){
 root=path.resolve(root);signal?.throwIfAborted();
 const registrationMeter={},registration=await readJson(path.join(root,'config/datasets/national-business-temporal-claim-matrix.json'),64000,signal,registrationMeter);
 check(exact(registration,['schema_version','dataset_id','status','current_pointer','production_enrollment','retained_releases'])&&registration.schema_version==='local-review-release-registration@1.0.0'&&registration.dataset_id==='national-business-temporal-claim-matrix'&&registration.status==='registered-pointer-free-local-review-only'&&registration.current_pointer===null&&registration.production_enrollment===false&&Array.isArray(registration.retained_releases));
 const selected=registration.retained_releases.filter(item=>item?.selected===true);check(selected.length===1);const pin=selected[0];
 check(exact(pin,['release_id','manifest_path','manifest_sha256','status','selected'])&&RELEASE.test(pin.release_id)&&safeRelative(pin.manifest_path)&&pin.manifest_path===`data/national-business-temporal-claim-matrix/releases/${pin.release_id}/manifest.json`&&SHA.test(pin.manifest_sha256)&&pin.status==='verified-final-successor');
 const manifestMeter={},manifest=await readJson(path.join(root,pin.manifest_path),64000,signal,manifestMeter);check(manifestMeter.sha256===pin.manifest_sha256&&manifest.release_id===pin.release_id&&manifest.schema_version==='national-business-temporal-claim-matrix@1.0.0'&&manifest.status==='immutable-local-review-only'&&manifest.publication_mode==='pointer-free');
 check(exact(manifest.claims,['network_requests','current_pointer_written','production_enrollment','current_operations_verified','active_business_count','completeness_inferred'])&&manifest.claims.network_requests===0&&Object.entries(manifest.claims).filter(([key])=>key!=='network_requests').every(([,value])=>value===false));validateSummary(manifest.summary);
 check(Array.isArray(manifest.artifacts)&&manifest.artifacts.length===1);const artifact=manifest.artifacts[0];check(exact(artifact,['path','bytes','sha256','record_count'])&&artifact.path==='temporal-claims.jsonl'&&integer(artifact.bytes)&&artifact.bytes>0&&artifact.bytes<=65536&&SHA.test(artifact.sha256)&&artifact.record_count===30);
 const artifactMeter={},rawRows=await readJsonLines(path.join(path.dirname(path.join(root,pin.manifest_path)),artifact.path),artifact.bytes,signal,artifactMeter);check(artifactMeter.bytes===artifact.bytes&&artifactMeter.sha256===artifact.sha256);const rows=validateRows(rawRows);
 const inputs=manifest.inputs;check(exact(inputs,['config_sha256','registry_release_id','registry_manifest_sha256','coverage_release_id','coverage_manifest_sha256','source_artifact_path','source_artifact_sha256'])&&Object.entries(inputs).filter(([key])=>key.endsWith('_sha256')).every(([,value])=>SHA.test(value)));
 signal?.throwIfAborted();return {schema_version:'national-business-temporal-claim-matrix-view@1.0.0',available:true,scope:'retained-source-classification-only',summary:{...manifest.summary},provenance:{release_id:manifest.release_id,manifest_sha256:pin.manifest_sha256,artifact_sha256:artifact.sha256,created_at:manifest.created_at,registry_release_id:inputs.registry_release_id,registry_manifest_sha256:inputs.registry_manifest_sha256,coverage_release_id:inputs.coverage_release_id,coverage_manifest_sha256:inputs.coverage_manifest_sha256},claims:{...manifest.claims},...(includeRows?{semantic_rows:rows.map(row=>({source_key:row.source_key,profile_source_id:row.profile_source_id,source_release_id:row.source_release_id,classification:row.classification,source_status_term:row.source_status_term,cohort_scope:row.cohort_scope,jurisdiction_scope:row.jurisdiction_scope,policy_sha256:row.policy_sha256,as_of_or_observed_from:row.as_of_or_observed_from,as_of_or_observed_through:row.as_of_or_observed_through}))}:{})};
}

/** Public summary API deliberately omits the row-level semantic roster. */
export async function readNationalBusinessTemporalClaimMatrix(opts={}){check(opts&&Object.keys(opts).every(key=>['root','signal','includeRows'].includes(key))&&(opts.includeRows===undefined||typeof opts.includeRows==='boolean'));return readMatrix({root:opts.root,signal:opts.signal});}

/** Validated bounded semantic roster for internal joins to the pinned ZIP view. */
export async function readNationalBusinessTemporalClaimRows(opts={}){
 check(opts&&Object.keys(opts).every(key=>['root','signal'].includes(key)));const view=await readMatrix({root:opts.root,signal:opts.signal,includeRows:true});return {summary:view.summary,provenance:view.provenance,claims:view.claims,rows:view.semantic_rows};
}

async function readJsonLines(file,maximum,signal,meter){
 // Reuse the hardened JSON reader by wrapping the bounded JSONL bytes as a JSON string is not possible;
 // this local read mirrors its single-link, stable-identity contract.
 const fs=await import('node:fs/promises');signal?.throwIfAborted();const handle=await fs.open(file,'r');
 try{const before=await handle.stat({bigint:true});check(before.isFile()&&before.nlink===1n&&before.size===BigInt(maximum));const raw=await handle.readFile();signal?.throwIfAborted();const after=await handle.stat({bigint:true}),named=await fs.lstat(file,{bigint:true});check(!named.isSymbolicLink()&&['dev','ino','size','mtimeNs','ctimeNs'].every(key=>before[key]===after[key]&&before[key]===named[key]));meter.bytes=raw.length;meter.sha256=hash(raw);return raw;}finally{await handle.close();}
}
