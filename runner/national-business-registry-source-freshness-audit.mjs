import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual as same} from 'node:util';
import {APP_ROOT} from './paths.mjs';
import {inspectNormalizedUsPostalMigration} from './normalized-us-postal-migration.mjs';

const CONFIG='config/datasets/national-business-registry-source-freshness-audit.json';
const check=(v,m)=>{if(!v)throw Error(`Registry source freshness audit rejected: ${m}.`);};
const hash=b=>createHash('sha256').update(b).digest('hex');
const stable=(a,b)=>a.isFile()&&b.isFile()&&!a.isSymbolicLink()&&!b.isSymbolicLink()&&a.nlink===1n&&b.nlink===1n&&['dev','ino','size','mtimeNs','ctimeNs'].every(k=>a[k]===b[k]);
function target(root,relative){check(typeof relative==='string'&&!path.isAbsolute(relative)&&!relative.includes('\\')&&relative.split('/').every(p=>p&&p!=='.'&&p!=='..'),'path');const f=path.resolve(root,relative);check(f.startsWith(`${path.resolve(root)}${path.sep}`),'containment');return f;}
async function read(root,relative,sha,max){const file=target(root,relative),before=await fs.lstat(file,{bigint:true});check(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1n&&before.size<=BigInt(max),'file ownership/bounds');const raw=await fs.readFile(file);if(sha)check(hash(raw)===sha,'hash pin');const after=await fs.lstat(file,{bigint:true});check(stable(before,after),'input mutation');return{file,raw,value:JSON.parse(raw),identity:after,sha256:hash(raw)};}
export function reconcileRegistryFreshnessSources(sources,dependencies,pointerPairs){
 check(Array.isArray(sources)&&Array.isArray(dependencies)&&pointerPairs instanceof Map,'inputs');const seenSources=new Set();return sources.map(source=>{
  check(source.status==='ready'&&source.pointer_scope==='candidate'&&!seenSources.has(source.dataset_id),'ready unique source');seenSources.add(source.dataset_id);
  const matches=dependencies.filter(d=>d.dataset_id===source.dataset_id),pair=pointerPairs.get(source.source_key);check(pair,'pointer pair');
  const bindingStatus=matches.length===0?'missing':matches.length>1?'duplicate':matches[0].release_id!==source.current_release_id||matches[0].manifest_sha256!==source.manifest_sha256?'different':'exact-match';
  return{source_key:source.source_key,dataset_id:source.dataset_id,production_pointer_path:pair.production_path,candidate_pointer_path:pair.candidate_path,production_pointer_sha256:pair.production_sha256,candidate_pointer_sha256:pair.candidate_sha256,pointers_byte_identical:pair.production_sha256===pair.candidate_sha256,candidate_release_id:source.current_release_id,candidate_manifest_sha256:source.manifest_sha256,registry_dependency_occurrences:matches.length,registry_release_id:matches[0]?.release_id??null,registry_manifest_sha256:matches[0]?.manifest_sha256??null,binding_status:bindingStatus};
 });
}
export async function verifyNationalBusinessRegistrySourceFreshnessAudit(opts={}){
 check(opts&&Object.keys(opts).every(k=>['root','signal'].includes(k)),'options');const root=path.resolve(opts.root??APP_ROOT),signal=opts.signal;signal?.throwIfAborted();
 const registration=await read(root,CONFIG,null,100000),c=registration.value;check(c.dataset_id==='national-business-registry-source-freshness-audit'&&c.status==='registered-pointer-free-local-audit'&&c.claims.network_requests===0&&Object.entries(c.claims).filter(([k])=>k!=='network_requests').every(([,v])=>v===false),'closed claims');
 const registryPointer=await read(root,c.registry.pointer_path,c.registry.pointer_sha256,20000),registryManifest=await read(root,c.registry.manifest_path,c.registry.manifest_sha256,2000000),definition=await read(root,c.migration.definition_path,c.migration.definition_file_sha256,200000);
 check(registryPointer.value.release_id===c.registry.release_id&&registryManifest.value.release_id===c.registry.release_id&&registryManifest.value.dependencies.length===c.registry.dependency_count,'registry binding');
 const candidate=await inspectNormalizedUsPostalMigration({appRoot:root,definition:definition.value,useCandidatePointers:true,environment:{}});check(candidate.ready_for_registry_2_10&&candidate.counts.total===c.migration.source_count&&candidate.counts.ready===c.migration.source_count&&candidate.counts.candidate_pointers_used===c.migration.source_count&&candidate.plan_sha256===c.migration.frozen_candidate_readiness_sha256,'frozen candidate readiness');
 const pairs=new Map(),reads=[];for(const source of definition.value.sources){signal?.throwIfAborted();const production=await read(root,source.pointer,null,20000),candidatePath=`${definition.value.candidate_root}/sources/${source.source_key}/current.json`,candidatePointer=await read(root,candidatePath,null,20000);reads.push(production,candidatePointer);pairs.set(source.source_key,{production_path:source.pointer,candidate_path:candidatePath,production_sha256:production.sha256,candidate_sha256:candidatePointer.sha256});}
 const rows=reconcileRegistryFreshnessSources(candidate.sources,registryManifest.value.dependencies,pairs),summary={ready_sources:rows.length,exact_registry_dependency_matches:rows.filter(x=>x.binding_status==='exact-match').length,different_bindings:rows.filter(x=>x.binding_status==='different').length,missing_bindings:rows.filter(x=>x.binding_status==='missing').length,duplicate_bindings:rows.filter(x=>x.binding_status==='duplicate').length,production_candidate_pointer_byte_matches:rows.filter(x=>x.pointers_byte_identical).length};
 check(same(summary,c.expected_summary)&&rows.every(x=>x.binding_status==='exact-match'&&x.pointers_byte_identical),'freshness conservation');
 for(const input of [registration,registryPointer,registryManifest,definition,...reads])check(stable(input.identity,await fs.lstat(input.file,{bigint:true})),'post-read mutation');
 return{schema_version:'national-business-registry-source-freshness-audit@1.0.0',verified:true,status:'exact-source-bindings-no-refresh-needed',registry:{release_id:c.registry.release_id,pointer_sha256:registryPointer.sha256,manifest_sha256:registryManifest.sha256,dependency_count:c.registry.dependency_count},migration:{definition_file_sha256:definition.sha256,readiness_plan_sha256:c.migration.frozen_candidate_readiness_sha256},summary,rows,claims:c.claims,recommendation:{download_required:false,source_refresh_required:false,no_download_replay_source_safe:true,full_registry_dependency_recheck_required_before_replay:true}};
}
