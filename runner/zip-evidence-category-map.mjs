import path from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual as same} from 'node:util';
import {APP_ROOT} from './paths.mjs';
import {mnSelectionReadJson as readJson,mnSelectionReadLines as readLines} from './mn-construction-retained-selection.mjs';

export const ZIP_CATEGORY_MAP_VERSION='zip-evidence-category-map@1.0.0';
export const ZIP_CATEGORY_TAXONOMY_VERSION='zip-economy-source-categories@1.0.0';
export const ZIP_CATEGORY_MAP_SHA256='af9eeac347d77cb999944f4e9072d40a421cea1bc6201fa75a8b84f87f58db3a';
const check=(ok,message)=>{if(!ok)throw Error(`ZIP category mapping rejected: ${message}.`);};
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const keys=rows=>rows.map(row=>row.source_key).sort();

/** Exact v1 authored taxonomy; no label joins, inferred aliases, or reassignment. */
export function validateZipEvidenceCategoryMap(mapping,{projection,sources}){
 check(mapping?.schema_version===ZIP_CATEGORY_MAP_VERSION&&mapping.taxonomy_version===ZIP_CATEGORY_TAXONOMY_VERSION,'unsupported version');
 check(digest(mapping)===ZIP_CATEGORY_MAP_SHA256,'authored mapping identity changed; requires a reviewed version');
 check(Array.isArray(sources)&&sources.length===30&&projection?.conservation?.length===30,'source universe size');
 const expected=keys(mapping.sources);
 check(new Set(keys(sources)).size===30&&new Set(keys(projection.conservation)).size===30&&same(keys(sources),expected)&&same(keys(projection.conservation),expected),'source universe drift');
 check(projection.bindings?.coverage?.coverageReleaseId===mapping.bindings.coverage_release_id
  &&projection.bindings.coverage.manifestSha256===mapping.bindings.coverage_manifest_sha256
  &&projection.bindings.coverage.artifacts?.sources?.sha256===mapping.bindings.sources_sha256,'coverage binding drift');
 for(const row of mapping.sources){
  const source=sources.find(item=>item.source_key===row.source_key),conservation=projection.conservation.find(item=>item.source_key===row.source_key);
  check((source.profile_source_id??null)===row.profile_source_id&&source.source_kind===row.source_kind
   &&source.release_metadata?.source_release_id===row.source_release_id&&conservation.source_release_id===row.source_release_id,'source identity drift');
  check(same(source.zip_level_counts,conservation.counts_by_unit)&&source.zip_rows_with_contribution===conservation.positive_zip_members,'typed source conservation drift');
 }
 return {verified:true,mapping_version:ZIP_CATEGORY_MAP_VERSION,taxonomy_version:ZIP_CATEGORY_TAXONOMY_VERSION,mapping_sha256:ZIP_CATEGORY_MAP_SHA256,
  source_count:30,categories:structuredClone(mapping.categories),sources:structuredClone(mapping.sources),export_policy:'local-review-only',
  source_replay_performed:false,qualification_rows_verified:false,national_denominator_changed:false,network_requests:0,production_pointers_changed:false};
}

/** Bounded installed metadata check only; never scans ZIP rows or builds a release. */
export async function readZipEvidenceCategoryMap({root=APP_ROOT,signal}={}){
 const reads=[];
 async function json(relative,max,expected){const file=path.join(root,relative),meter={};const value=await readJson(file,max,signal,meter);if(expected)check(meter.sha256===expected,'artifact digest drift');reads.push({file,max,sha256:meter.sha256});return value;}
 const mapping=await json('config/zip-evidence-category-map.json',32000);
 check(digest(mapping)===ZIP_CATEGORY_MAP_SHA256,'mapping digest');
 const b=mapping.bindings,release=`data/zip-active-evidence-qualification/releases/${b.qualification_release_id}`;
 const manifest=await json(`${release}/manifest.json`,1000000,b.qualification_manifest_sha256);
 check(manifest.release_id===b.qualification_release_id&&manifest.artifacts?.[0]?.path==='projection.json'&&manifest.artifacts[0].sha256===b.projection_sha256,'qualification metadata identity');
 const projection=await json(`${release}/projection.json`,32000,b.projection_sha256);
 const coverage=`data/business-coverage-views/releases/${b.coverage_release_id}`;
 const coverageManifest=await json(`${coverage}/manifest.json`,2000000,b.coverage_manifest_sha256);
 const artifacts=coverageManifest.artifacts.filter(row=>row.artifact_type==='source-coverage-view-jsonl');
 check(artifacts.length===1&&artifacts[0].path==='views/sources.jsonl'&&artifacts[0].sha256===b.sources_sha256&&artifacts[0].record_count===30,'coverage source artifact identity');
 const sourceFile=path.join(root,coverage,'views/sources.jsonl'),meter={},sources=[];
 for await(const row of readLines(sourceFile,64000,signal,meter))sources.push(row);
 check(meter.sha256===b.sources_sha256&&meter.bytes===artifacts[0].bytes,'coverage source artifact digest');
 const result=validateZipEvidenceCategoryMap(mapping,{projection,sources});
 for(const entry of reads){const after={};await readJson(entry.file,entry.max,signal,after);check(after.sha256===entry.sha256,'metadata changed during read');}
 const final={};for await(const row of readLines(sourceFile,64000,signal,final)){void row;}
 check(final.sha256===meter.sha256,'sources changed during read');signal?.throwIfAborted();return result;
}
