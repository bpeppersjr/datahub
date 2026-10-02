import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual as same} from 'node:util';
import {APP_ROOT} from './paths.mjs';
import {mnSelectionReadJson as readJson,mnSelectionCanonical as canonical} from './mn-construction-retained-selection.mjs';
import {readRegistryZipQualityLookup,REGISTRY_ZIP_QUALITY_INDEX_VERSION} from './registry-zip-quality-index.mjs';
import {readCoverageZipViewLookup,COVERAGE_ZIP_VIEW_INDEX_VERSION} from './coverage-zip-view-index.mjs';
import {businessMapCategoryMetadata} from './business-map-store.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const check=ok=>{if(!ok)throw Error('Selected bounded ZIP evidence is unavailable or incompatible.');};
const SHA=/^[a-f0-9]{64}$/;
const stable=(a,b)=>a&&b&&a.isFile()&&b.isFile()&&!a.isSymbolicLink()&&!b.isSymbolicLink()&&a.nlink===1n&&b.nlink===1n&&['ino','dev','size','mtimeNs','ctimeNs'].every(key=>a[key]===b[key]);
function compact(row){return {view_id:row.view_id,zip_code:row.zip_code,coverage_status:row.registry_coverage.status,physical_site_count:row.registry_coverage.physical_site_count,establishment_count:row.registry_coverage.establishment_count,organization_primary_location_count:row.registry_coverage.organization_primary_location_count,zcta_geoid:row.geography?.geoid??null,zcta_status:row.geography?.status??'missing',spatial_zip_polygon_membership_status:row.spatial_zip_polygon_membership?.status??'unknown',employer_baseline_status:row.employer_baseline?.status??'missing',employer_establishments:row.employer_baseline?.establishments??null,material_county_count:row.jurisdiction_overlay.relationships.filter(r=>r.material_intersection).length,current_usps_validity_status:row.current_usps_validity?.status??'unverified',coverage_gap_codes:row.coverage_gap_codes};}
function qualityView(result){
 const b=result.bindings,q=result.quality,bindings={audit_id:`indexed-${result.index_release_id}`,release_id:b.registry_release_id,pointer_sha256:b.registry_pointer_sha256,manifest_sha256:b.registry_manifest_sha256,zip_artifact_sha256:b.zip_artifact.sha256};
 if(result.status==='absent-from-selected-artifact')return {schema_version:'1.0.0',bindings,zip5:result.zip5,found:false,classification:null};
 check(result.status==='present'&&q?.zip5===result.zip5);const postal=q.usps_operational_evidence;
 return {schema_version:'1.0.0',bindings,zip5:result.zip5,found:true,classification:q.source_reported_zip5_quality,postal_fields:q.artifact_postal_fields,split_postal_contract:q.split_postal_contract,registry_coverage_status:q.registry_coverage_status,governed_zcta_membership:q.governed_zcta_membership,positive_source_contributions:q.positive_source_contributions,usps_operational_evidence:{operational_status:postal.status==='unverified'?null:postal.status,evidence_status:postal.status,reason:postal.reason,source_release_id:postal.source_release_id,source_month:postal.source_month,deliverability_status:'not-asserted'},limitations:q.unresolved_proof_gap_codes};
}

/** Inspector-only. No monolithic scans, discovery, build or fallback on failure. */
export async function readIndexedZipInspectorEvidence(opts={}){
 check(opts&&Object.keys(opts).every(k=>['root','zip','categoryId','signal'].includes(k)));const {zip,categoryId='all',signal}=opts,root=path.resolve(opts.root??APP_ROOT),categories=businessMapCategoryMetadata();
 if(!/^\d{5}$/.test(zip??'')||!categories.some(c=>c.id===categoryId))throw Object.assign(Error('Provide an exact ZIP5 and supported map category.'),{statusCode:400});
 signal?.throwIfAborted();const reads=[],sourceReads=[];
 async function read(relative,max){check(typeof relative==='string'&&!path.isAbsolute(relative)&&relative.split('/').every(s=>s&&s!=='.'&&s!=='..')&&!relative.includes('\\'));const file=path.join(root,relative),meter={},value=await readJson(file,max,signal,meter);reads.push({file,max,...meter});return {value,meter};}
 async function registration(id,version){
  const {value:r}=await read(`config/datasets/${id}.json`,200000);check(r.dataset_id===id&&r.schema_version==='1.0.0'&&r.status==='registered-local-lookup-index'&&r.release_only===true&&r.runtime_pointer===null&&r.production_enrollment===false&&r.national_reporting_denominator_enrollment===false&&r.current_pointer_written===false&&['internal','local-review-only'].includes(r.export_policy));const p=r.retained_release;
  check(p&&new RegExp(`^${id}-[a-f0-9]{64}$`).test(p.release_id)&&p.manifest===`data/${id}/releases/${p.release_id}/manifest.json`&&SHA.test(p.manifest_sha256));
  const {value:m,meter}=await read(p.manifest,100000);check(meter.sha256===p.manifest_sha256&&meter.bytes===p.manifest_bytes&&m.schema_version===version&&p.manifest_schema_version===version);
  for(const key of ['release_id','status','created_at','indexed_zip_count','bindings'])check(same(m[key],p[key]));
  check(same(m.claims,r.claims)&&m.claims.export_policy===r.export_policy&&p.artifact_inventory_hash_encoding==='SHA-256 of UTF-8 JSON.stringify(manifest.artifacts), in retained order'&&Array.isArray(m.artifacts)&&m.artifacts.length===p.artifact_count&&m.artifacts.reduce((n,a)=>n+a.bytes,0)===p.artifact_bytes&&hash(JSON.stringify(m.artifacts))===p.artifact_inventory_sha256);
  if(id==='coverage-zip-view-index')check(m.source_zip_rows===p.source_zip_rows);else check(hash(JSON.stringify(m.audit_summary))===p.audit_summary_sha256&&same(m.audit_summary.counts,p.audit_counts)&&m.audit_summary.audit_status===p.audit_status);
  const bucket=m.artifacts.find(a=>a.path===`zip-${zip.slice(0,2)}.json`);if(bucket)await read(`${path.posix.dirname(p.manifest)}/${bucket.path}`,256000);
  return {registration:r,pin:p,manifest:m};
 }
 const registry=await registration('registry-zip-quality-index',REGISTRY_ZIP_QUALITY_INDEX_VERSION),coverage=await registration('coverage-zip-view-index',COVERAGE_ZIP_VIEW_INDEX_VERSION),rb=registry.manifest.bindings,cb=coverage.manifest.bindings;
 check(rb.registry_release_id===cb.registry.release_id&&rb.registry_manifest_sha256===cb.registry.manifest_sha256&&rb.registry_pointer_sha256===cb.registry.pointer_sha256&&rb.registry_manifest_path===cb.registry.manifest_path&&rb.zip_artifact.path==='derived/zip-coverage.jsonl'&&cb.zip_artifact.path==='views/zips.jsonl');
 await read('config/zip-quality-view-enrollment.json',16000);await read('config/datasets/national-business-coverage-views.json',2000000);
 for(const b of [cb.coverage,cb.registry,cb.geography]){const p=await read(b.pointer_path,16000),m=await read(b.manifest_path,2000000);check(p.meter.sha256===b.pointer_sha256&&m.meter.sha256===b.manifest_sha256&&p.value.release_id===b.release_id&&m.value.release_id===b.release_id);}
 for(const [manifest,artifact]of [[rb.registry_manifest_path,rb.zip_artifact],[cb.coverage.manifest_path,cb.zip_artifact]]){const file=path.join(root,path.posix.dirname(manifest),artifact.path);await canonical(path.dirname(file),{signal});const identity=await fs.lstat(file,{bigint:true});check(stable(identity,identity)&&identity.size===BigInt(artifact.bytes));sourceReads.push({file,identity});}
 const q=await readRegistryZipQualityLookup({root,signal,manifestPath:path.join(root,registry.pin.manifest),manifestSha256:registry.pin.manifest_sha256,zip5:zip});
 const c=await readCoverageZipViewLookup({root,signal,manifestPath:path.join(root,coverage.pin.manifest),manifestSha256:coverage.pin.manifest_sha256,zip5:zip});
 check(same(q.bindings,rb)&&same(c.bindings,cb)&&q.zip5===zip&&c.zip5===zip&&q.index_release_id===registry.pin.release_id&&c.index_release_id===coverage.pin.release_id);
 async function recheck(){
  for(const r of reads){const meter={};await readJson(r.file,r.max,signal,meter);check(meter.sha256===r.sha256&&stable(meter.identity,r.identity));}
  for(const r of sourceReads){await canonical(path.dirname(r.file),{signal});check(stable(r.identity,await fs.lstat(r.file,{bigint:true})));}signal?.throwIfAborted();
 }
 await recheck();
 return {catalog:{available:true,coverage_release_id:cb.coverage.release_id,coverage_manifest_sha256:cb.coverage.manifest_sha256,registry_release_id:cb.registry.release_id,registry_manifest_sha256:cb.registry.manifest_sha256,geography_release_id:cb.geography.release_id,geography_manifest_sha256:cb.geography.manifest_sha256,categories},quality:qualityView(q),coverage:{available:true,release_id:cb.coverage.release_id,records:c.row?[compact(c.row)]:[]},recheck};
}
