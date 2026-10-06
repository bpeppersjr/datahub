import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual as same} from 'node:util';
import {APP_ROOT} from './paths.mjs';
import {verifyCensusNonemployerIndustryContext} from './census-nonemployer-industry-context.mjs';

const REGISTRATION='config/datasets/census-nonemployer-county-industry-adjacent-evidence.json';
const check=(v,m)=>{if(!v)throw Error(`Census Nonemployer county-industry adjacent evidence rejected: ${m}.`);};
const hash=b=>createHash('sha256').update(b).digest('hex');
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&same(Object.keys(v).sort(),[...keys].sort());
const stable=(a,b)=>a.isFile()&&b.isFile()&&!a.isSymbolicLink()&&!b.isSymbolicLink()&&a.nlink===1n&&b.nlink===1n&&['dev','ino','size','mtimeNs','ctimeNs'].every(k=>a[k]===b[k]);
function file(root,relative){check(typeof relative==='string'&&!path.isAbsolute(relative)&&!relative.includes('\\')&&relative.split('/').every(p=>p&&p!=='.'&&p!=='..'),'path');const value=path.resolve(root,relative);check(value.startsWith(`${path.resolve(root)}${path.sep}`),'containment');return value;}
async function read(root,relative,expected,max){const target=file(root,relative),before=await fs.lstat(target,{bigint:true});check(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1n&&before.size<=BigInt(max),'file bounds/ownership');const raw=await fs.readFile(target);if(expected)check(hash(raw)===expected,'hash pin');const after=await fs.lstat(target,{bigint:true});check(stable(before,after),'input mutation');return{target,raw,value:relative.endsWith('.json')?JSON.parse(raw):null,identity:after};}
function forbiddenKeys(value){if(!value||typeof value!=='object')return[];const bad=[];for(const[k,v]of Object.entries(value)){if(/(?:^|_)(?:zip5?|zip4|zcta|latitude|longitude|coordinates?|crosswalk|allocation)(?:$|_)/i.test(k))bad.push(k);bad.push(...forbiddenKeys(v));}return bad;}
export function projectCensusNonemployerCountyIndustryRows(rows){
 check(Array.isArray(rows),'rows');const seen=new Set();return rows.filter(r=>r.geography_type==='county').map(r=>{
  check(exact(r,['schema_version','naics','geography_type','geoid','state_fips','county_fips','geography_name','reference_year','status','missing_cell','measures','provenance']),'retained row shape');
  check(/^\d{5}$/.test(r.geoid)&&r.state_fips===r.geoid.slice(0,2)&&r.county_fips===r.geoid.slice(2)&&['23','62441'].includes(r.naics?.code)&&r.naics.classification==='2022 NAICS'&&r.reference_year===2023,'county/industry identity');
  const key=`${r.geoid}:${r.naics.code}`;check(!seen.has(key),'duplicate key');seen.add(key);check(forbiddenKeys(r).length===0,'ZIP/geocode/allocation field');
  const m=r.measures,flag=m.nonemployer_establishments_flag,raw=m.nonemployer_establishments_raw,usable=m.nonemployer_establishments;
  if(r.missing_cell)check(r.status==='not-published-in-retained-selected-total-cells'&&raw===null&&usable===null&&flag===null,'absent semantics');
  else if(flag)check(Number.isSafeInteger(raw)&&raw>=0&&usable===null,'flagged semantics');
  else check(Number.isSafeInteger(raw)&&raw>=0&&usable===raw,'usable semantics');
  check(r.provenance?.source_release_id==='census-nonemployer-2023-20260830-230249716Z-78268f89'&&r.provenance.transformation_version==='census-nonemployer-county-industry-context@1.0.0','provenance');
  return{schema_version:'census-nonemployer-county-industry-adjacent-evidence@1.0.0',county_geoid:r.geoid,state_fips:r.state_fips,county_fips:r.county_fips,county_name:r.geography_name,naics_2022:{code:r.naics.code,label:r.naics.label},reference_year:2023,temporal_status:'annual-reference-year-current-operation-unverified',measurement_status:r.missing_cell?'absent-from-retained-source-cell':flag?'published-flagged-unusable':usable===0?'measured-zero':'measured-positive',source_status:r.status,missing_cell:r.missing_cell,measures:structuredClone(m),provenance:structuredClone(r.provenance)};
 });
}
export async function verifyCensusNonemployerCountyIndustryAdjacentEvidence(opts={}){
 check(opts&&Object.keys(opts).every(k=>['root','signal'].includes(k)),'options');const root=path.resolve(opts.root??APP_ROOT),signal=opts.signal;signal?.throwIfAborted();
 const registration=await read(root,REGISTRATION,null,200000),r=registration.value;check(exact(r,['dataset_id','schema_version','status','release_only','runtime_pointer','production_enrollment','matrix_enrollment','exact_zip_catalog_enrollment','source','policy','retained_context','selection','expected_counts','claims','documentation'])&&r.dataset_id==='census-nonemployer-county-industry-adjacent-evidence'&&r.status==='registered-local-adjacent-evidence'&&r.release_only===true&&r.runtime_pointer===null&&r.production_enrollment===false&&r.matrix_enrollment===false&&r.exact_zip_catalog_enrollment===false,'closed registration');
 const pointer=await read(root,r.source.pointer_path,r.source.pointer_sha256,20000),source=await read(root,r.source.manifest_path,r.source.manifest_sha256,2000000),policy=await read(root,r.policy.path,r.policy.sha256,100000),contextConfig=await read(root,r.retained_context.config_path,r.retained_context.config_sha256,100000),contextManifest=await read(root,r.retained_context.manifest_path,r.retained_context.manifest_sha256,2000000);
 check(pointer.value.release_id===r.source.release_id&&source.value.release_id===r.source.release_id&&source.value.reference_year===2023&&source.value.artifacts.some(a=>a.path==='derived/industry/county.jsonl.gz'&&a.sha256===r.source.county_industry_artifact_sha256),'source binding');
 check(policy.value.prohibited_use.includes('allocating national, state, or county totals to ZIP codes without a published source relationship')&&policy.value.prohibited_use.includes('representing annual aggregate counts as a current named-business directory'),'policy boundary');
 check(contextConfig.value.production_pointer_updated===false&&contextManifest.value.release_id===r.retained_context.release_id&&contextManifest.value.source.manifest_sha256===r.source.manifest_sha256&&contextManifest.value.coverage.rows===r.retained_context.artifact_rows,'context binding');
 if(root===APP_ROOT)await verifyCensusNonemployerIndustryContext(file(root,r.retained_context.manifest_path));
 const artifact=await read(root,`${path.posix.dirname(r.retained_context.manifest_path)}/${r.retained_context.artifact_path}`,r.retained_context.artifact_sha256,r.retained_context.artifact_bytes);check(artifact.raw.length===r.retained_context.artifact_bytes,'artifact bytes');const retained=artifact.raw.toString('utf8').trimEnd().split(/\r?\n/).map(JSON.parse);check(retained.length===r.retained_context.artifact_rows,'artifact rows');signal?.throwIfAborted();
 const rows=projectCensusNonemployerCountyIndustryRows(retained),counts={county_geographies:new Set(rows.map(x=>x.county_geoid)).size,projected_rows:rows.length,direct_published_cells:rows.filter(x=>!x.missing_cell).length,usable_cells:rows.filter(x=>['measured-positive','measured-zero'].includes(x.measurement_status)).length,flagged_cells:rows.filter(x=>x.measurement_status==='published-flagged-unusable').length,absent_cells:rows.filter(x=>x.missing_cell).length,by_naics:{}};
 for(const code of r.selection.naics_codes){const group=rows.filter(x=>x.naics_2022.code===code);counts.by_naics[code]={rows:group.length,usable:group.filter(x=>['measured-positive','measured-zero'].includes(x.measurement_status)).length,flagged:group.filter(x=>x.measurement_status==='published-flagged-unusable').length,absent:group.filter(x=>x.missing_cell).length,establishments_usable_sum:group.reduce((n,x)=>n+(x.measures.nonemployer_establishments??0),0)};}
 check(same(counts,r.expected_counts),'count conservation');check(rows.every(x=>forbiddenKeys(x).length===0),'projection geography boundary');
 for(const input of [registration,pointer,source,policy,contextConfig,contextManifest,artifact])check(stable(input.identity,await fs.lstat(input.target,{bigint:true})),'post-read mutation');
 return{verified:true,dataset_id:r.dataset_id,source_release_id:r.source.release_id,context_release_id:r.retained_context.release_id,counts,claims:r.claims,rows};
}
