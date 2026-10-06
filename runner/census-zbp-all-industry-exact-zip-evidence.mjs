import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createGunzip} from 'node:zlib';
import {Readable} from 'node:stream';
import {parse} from 'csv-parse';
import {isDeepStrictEqual as same} from 'node:util';
import {APP_ROOT} from './paths.mjs';

const SIZES=['size_1_4','size_5_9','size_10_19','size_20_49','size_50_99','size_100_249','size_250_499','size_500_999','size_1000_plus'];
const COLUMNS=['zip_code','naics_code','establishments',...SIZES.flatMap(k=>[k,`${k}_suppression_code`]),'preferred_city','preferred_state','county_name'];
const REGISTRATION_KEYS=['dataset_id','schema_version','status','release_only','runtime_pointer','production_enrollment','national_reporting_denominator_enrollment','dimension_id','source_pointer','source_manifest','policy','geography','profile_index','selection','expected_coverage','claims','documentation'];
const EXPECTED_CLAIMS={export_policy:'local-review-only',reference_year:2023,record_unit:'census-published-zip-all-industry-employer-establishment-aggregate',hierarchical_aggregation_permitted:false,zip4:null,business_count:false,physical_site_count:false,all_business_completeness:false,geocoding_performed:false,current_operations_verified:false,current_operating_business_count:null,gdp:null,all_business_completion_percent:null,matrix_admission_performed:false,nonadditive:true,public_export_authorized:false,network_requests:0,current_pointer_written:false,production_enrollment:false};
const check=(v,m)=>{if(!v)throw Error(`ZBP all-industry exact-ZIP evidence rejected: ${m}.`);};
const hash=b=>createHash('sha256').update(b).digest('hex');
const stable=(a,b)=>a.isFile()&&b.isFile()&&!a.isSymbolicLink()&&!b.isSymbolicLink()&&a.nlink===1n&&b.nlink===1n&&['dev','ino','size','mtimeNs','ctimeNs'].every(k=>a[k]===b[k]);
const safe=(root,relative)=>{check(typeof relative==='string'&&!path.isAbsolute(relative)&&!relative.includes('\\')&&relative.split('/').every(p=>p&&p!=='.'&&p!=='..'),'unsafe path');const f=path.resolve(root,relative);check(f.startsWith(`${path.resolve(root)}${path.sep}`),'path containment');return f;};
async function pinned(root,relative,sha,max=100000000){const file=safe(root,relative),before=await fs.lstat(file,{bigint:true});check(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1n&&before.size<=BigInt(max),'file ownership/bounds');const raw=await fs.readFile(file);check(hash(raw)===sha,'pinned hash');const after=await fs.lstat(file,{bigint:true});check(stable(before,after),'input mutation');return{file,raw,value:JSON.parse(raw),identity:after};}
async function pinnedBytes(root,relative,sha,max){const file=safe(root,relative),before=await fs.lstat(file,{bigint:true});check(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1n&&before.size<=BigInt(max),'artifact ownership/bounds');const raw=await fs.readFile(file);check(hash(raw)===sha,'artifact hash');const after=await fs.lstat(file,{bigint:true});check(stable(before,after),'artifact mutation');return{file,raw,identity:after};}
async function localJson(root,relative,max=200000){const file=safe(root,relative),before=await fs.lstat(file,{bigint:true});check(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1n&&before.size<=BigInt(max),'registration ownership/bounds');const raw=await fs.readFile(file),after=await fs.lstat(file,{bigint:true});check(stable(before,after),'registration mutation');return{file,raw,value:JSON.parse(raw),identity:after};}
function integer(v){return v===''?null:(check(/^\d+$/.test(v),'count'),Number(v));}
function normalizeDirect(row){
 check(same(Object.keys(row),COLUMNS)&&row.naics_code==='------'&&/^\d{5}$/.test(row.zip_code),'direct row');
 const raw={zip_code:row.zip_code,naics_code:row.naics_code,establishments:integer(row.establishments)};
 for(const k of SIZES){raw[k]=integer(row[k]);raw[`${k}_suppression_code`]=row[`${k}_suppression_code`]||null;check(raw[`${k}_suppression_code`]===null||raw[k]===null,'suppression semantics');}
 raw.preferred_city=row.preferred_city||null;raw.preferred_state=row.preferred_state||null;raw.county_name=row.county_name||null;
 return raw;
}
export function projectZbpAllIndustryExactZip(coverage,direct){
 check(Array.isArray(coverage)&&direct instanceof Map,'projection inputs');const seen=new Set();return coverage.map(c=>{
  check(/^\d{5}$/.test(c.zip_code)&&!seen.has(c.zip_code),'coverage ZIP identity');seen.add(c.zip_code);
  const published=c.employer_baseline?.status==='published',zcta=c.geography?.status==='2020-zcta-polygon-available',raw=direct.get(c.zip_code)??null;
  check(published===Boolean(raw),'direct-row/published conservation');
  const establishments=raw?.establishments??null;
  return{schema_version:'census-zbp-all-industry-exact-zip@1.0.0',zip5:c.zip_code,zip4:null,reference_year:2023,coverage_status:c.coverage_status,published_zbp:published,same_code_zcta:zcta,measurement_status:!published?'not-published-for-zip':establishments===null?'suppressed-or-unpublished':establishments===0?'measured-zero':'measured-positive',establishments,source_values:raw,source_employer_baseline:c.employer_baseline,source_evidence:c.source_evidence,provenance:c.employer_baseline?.provenance??null};
 });
}
export async function verifyCensusZbpAllIndustryExactZipEvidence(opts={}){
 check(opts&&Object.keys(opts).every(k=>['root','signal'].includes(k)),'options');const root=path.resolve(opts.root??APP_ROOT),signal=opts.signal;signal?.throwIfAborted();
 const registration=await localJson(root,'config/datasets/census-zbp-all-industry-exact-zip-evidence.json');
 const r=registration.value;check(same(Object.keys(r).sort(),[...REGISTRATION_KEYS].sort())&&r.schema_version==='1.0.0'&&r.dataset_id==='census-zbp-all-industry-exact-zip-evidence'&&r.status==='registered-local-adjacent-evidence'&&r.runtime_pointer===null&&r.production_enrollment===false&&r.national_reporting_denominator_enrollment===false&&r.dimension_id==='census_zbp_2023_all_industry_employer_establishments'&&same(r.claims,EXPECTED_CLAIMS),'closed registration');
 const pointer=await pinned(root,r.source_pointer.path,r.source_pointer.sha256,20000),manifest=await pinned(root,r.source_manifest.path,r.source_manifest.sha256,2000000),policy=await pinned(root,r.policy.path,r.policy.sha256,100000),geoPointer=await pinned(root,r.geography.pointer_path,r.geography.pointer_sha256,20000);
 check(pointer.value.release_id===r.source_manifest.release_id&&manifest.value.release_id===r.source_manifest.release_id&&manifest.value.reference_year===2023,'source binding');
 check(policy.value.policy_id==='us-census-zbp'&&policy.value.prohibited_use.includes('converting suppressed or unpublished values to zero'),'policy semantics');
 const geoManifest=await pinned(root,`data/geography/${geoPointer.value.manifest}`,r.geography.manifest_sha256,2000000);check(geoManifest.value.release_id===r.geography.release_id&&same(manifest.value.geography_dependency.manifest_sha256,r.geography.manifest_sha256),'geography binding');
 const profileReg=await pinned(root,r.profile_index.registration_path,r.profile_index.registration_sha256,200000),profileManifest=await pinned(root,r.profile_index.manifest_path,r.profile_index.manifest_sha256,200000);
 check(profileReg.value.retained_release.release_id===r.profile_index.release_id&&same(profileReg.value.retained_release.bindings,profileManifest.value.bindings)&&hash(Buffer.from(JSON.stringify(profileManifest.value.artifacts)))===r.profile_index.artifact_inventory_sha256,'profile-index replay');
 const boundArtifacts=new Map(profileManifest.value.bindings.artifacts.map(a=>[a.path,a]));check(boundArtifacts.size===12&&manifest.value.artifacts.filter(a=>['zip-coverage-union-jsonl','naics-coverage-jsonl','normalized-zbp-naics-csv-gzip'].includes(a.artifact_type)).every(a=>same(boundArtifacts.get(a.path),a)),'source artifact inventory');
 const profileDir=path.posix.dirname(r.profile_index.manifest_path);for(const a of profileManifest.value.artifacts){const st=await fs.lstat(safe(root,`${profileDir}/${a.path}`),{bigint:true});check(st.isFile()&&!st.isSymbolicLink()&&st.nlink===1n&&st.size===BigInt(a.bytes),'profile artifact inventory');}
 const sourceDir=path.posix.dirname(r.source_manifest.path),coverageArtifact=manifest.value.artifacts.find(a=>a.artifact_type==='zip-coverage-union-jsonl'),coverageFile=await pinnedBytes(root,`${sourceDir}/${coverageArtifact.path}`,coverageArtifact.sha256,100000000),sourceFiles=[coverageFile];const coverage=coverageFile.raw.toString('utf8').trimEnd().split('\n').map(JSON.parse);check(coverage.length===coverageArtifact.record_count,'coverage row count');
 const naicsArtifact=manifest.value.artifacts.find(a=>a.artifact_type==='naics-coverage-jsonl');sourceFiles.push(await pinnedBytes(root,`${sourceDir}/${naicsArtifact.path}`,naicsArtifact.sha256,1000000));
 const direct=new Map();for(const a of manifest.value.artifacts.filter(a=>a.artifact_type==='normalized-zbp-naics-csv-gzip')){signal?.throwIfAborted();const input=await pinnedBytes(root,`${sourceDir}/${a.path}`,a.sha256,32000000);sourceFiles.push(input);const parser=Readable.from([input.raw]).pipe(createGunzip()).pipe(parse({columns:true,max_record_size:8192}));let rows=0;for await(const row of parser){signal?.throwIfAborted();rows++;if(row.naics_code==='------'){const v=normalizeDirect(row);check(!direct.has(v.zip_code),'duplicate direct row');direct.set(v.zip_code,v);}}check(rows===a.record_count,'partition row count');}
 const rows=projectZbpAllIndustryExactZip(coverage,direct),counts={union_zip_status_rows:rows.length,published_zbp:rows.filter(x=>x.published_zbp).length,same_code_zcta:rows.filter(x=>x.same_code_zcta).length,both:rows.filter(x=>x.published_zbp&&x.same_code_zcta).length,zbp_without_zcta:rows.filter(x=>x.published_zbp&&!x.same_code_zcta).length,zcta_without_zbp:rows.filter(x=>!x.published_zbp&&x.same_code_zcta).length,direct_all_industry_rows:direct.size,measured_positive:rows.filter(x=>x.measurement_status==='measured-positive').length,measured_zero:rows.filter(x=>x.measurement_status==='measured-zero').length,unmeasured:rows.filter(x=>x.establishments===null).length};
 for(const[k,v]of Object.entries(r.expected_coverage))check(counts[k]===v,`${k} conservation`);check(rows.every(x=>x.zip4===null)&&counts.unmeasured===counts.zcta_without_zbp,'ZIP/status semantics');
 for(const x of [registration,pointer,manifest,policy,geoPointer,geoManifest,profileReg,profileManifest,...sourceFiles])check(stable(x.identity,await fs.lstat(x.file,{bigint:true})),'post-read mutation');
 return{verified:true,dataset_id:r.dataset_id,dimension_id:r.dimension_id,registration_sha256:hash(registration.raw),source_release_id:r.source_manifest.release_id,source_manifest_sha256:r.source_manifest.sha256,source_evidence_sha256:r.profile_index.manifest_sha256,profile_index_release_id:r.profile_index.release_id,counts,claims:{...r.claims},rows};
}
