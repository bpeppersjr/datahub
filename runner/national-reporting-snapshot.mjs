import path from 'node:path';
import { open, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { APP_ROOT } from './paths.mjs';
import { mnSelectionCanonical as canonical } from './mn-construction-retained-selection.mjs';
import { nationalReportingCount } from './national-reporting-catalog.mjs';

const check = value => { if (!value) throw Error('National reporting snapshot rejected.'); };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const stable = (a,b) => a.isFile() && b.isFile() && !a.isSymbolicLink() && !b.isSymbolicLink()
  && a.nlink===1n && b.nlink===1n && a.ino===b.ino && a.dev===b.dev && a.size===b.size && a.mtimeNs===b.mtimeNs && a.ctimeNs===b.ctimeNs;
async function bounded(file, maximum, signal) {
  check(typeof file==='string' && file===path.resolve(file));
  await canonical(path.dirname(file),{signal});signal?.throwIfAborted();
  const before=await lstat(file,{bigint:true});check(before.isFile() && !before.isSymbolicLink() && before.nlink===1n && before.size<=BigInt(maximum));
  const handle=await open(file,'r');const chunks=[];let bytes=0;
  try {
    check(stable(before,await handle.stat({bigint:true})));
    for (;;) {signal?.throwIfAborted();const buffer=Buffer.alloc(65536),read=await handle.read(buffer);if(!read.bytesRead)break;
      bytes+=read.bytesRead;check(bytes<=maximum);chunks.push(buffer.subarray(0,read.bytesRead));}
    check(stable(before,await handle.stat({bigint:true})) && stable(before,await lstat(file,{bigint:true})));
  } finally {await handle.close();}
  const data=Buffer.concat(chunks);return {data,bytes,sha256:sha(data),identity:before,file};
}
function child(root, relative) {
  check(typeof relative==='string' && relative.length>0 && !relative.includes('\\') && !path.isAbsolute(relative));
  check(relative.split('/').every(part=>part && part!=='.' && part!=='..'));
  const file=path.resolve(root,relative);check(!path.relative(root,file).startsWith('..'));return file;
}
const dependencies = {
  'national-business-registry':'registry_release_id', 'us-census-geography':'geography_release_id',
  'us-census-zcta-jurisdiction-crosswalk':'zcta_jurisdiction_crosswalk_release_id',
  'national-business-entity-resolution':'entity_resolution_release_id',
  'national-business-entity-resolution-benchmark':'entity_resolution_benchmark_release_id',
  'census-nonemployer-baseline':'census_nonemployer_release_id',
};

// Integrity verification of small published aggregates, not raw-source replay or
// publisher authentication. No cache: same-ID file replacement is rechecked.
export async function readNationalReportingSnapshot({pointerPath=path.join(APP_ROOT,'data/business-coverage-views/current.json'),signal}={}) {
  const pinned=[];
  const read=async(file,max)=>{const value=await bounded(file,max,signal);pinned.push(value);return value;};
  const pointerBytes=await read(pointerPath,16000), pointer=JSON.parse(pointerBytes.data);
  check(pointer.dataset_id==='national-business-coverage-views' && typeof pointer.release_id==='string' && /^[a-zA-Z0-9._-]+$/.test(pointer.release_id));
  check(pointer.manifest===`releases/${pointer.release_id}/manifest.json`);
  const manifestPath=child(path.dirname(pointerPath),pointer.manifest), manifestBytes=await read(manifestPath,2000000),manifest=JSON.parse(manifestBytes.data);
  check(manifest.schema_version==='1.0.0' && manifest.dataset_id===pointer.dataset_id && manifest.release_id===pointer.release_id
    && manifest.status==='published-partial-local-aggregate' && Array.isArray(manifest.artifacts) && Array.isArray(manifest.dependencies));
  const types=new Set(),paths=new Set();for(const artifact of manifest.artifacts){check(!types.has(artifact.artifact_type) && !paths.has(artifact.path));types.add(artifact.artifact_type);paths.add(artifact.path);}
  const lineage={};for(const [dataset,key] of Object.entries(dependencies)) {const matches=manifest.dependencies.filter(row=>row.dataset_id===dataset);check(matches.length===1 && typeof matches[0].release_id==='string');lineage[key]=matches[0].release_id;}
  const results={},evidence={};let transformation;
  for (const [name,type,maxRows] of [['states','state-coverage-view-jsonl',100],['sources','source-coverage-view-jsonl',1000]]) {
    const artifact=manifest.artifacts.find(row=>row.artifact_type===type);
    check(artifact && Number.isSafeInteger(artifact.bytes) && artifact.bytes>0 && artifact.bytes<=8000000
      && typeof artifact.sha256==='string' && /^[a-f0-9]{64}$/.test(artifact.sha256)
      && Number.isSafeInteger(artifact.record_count) && artifact.record_count>=0 && artifact.record_count<=maxRows
      && ['internal','local-review-only'].includes(artifact.export_policy));
    const raw=await read(child(path.dirname(manifestPath),artifact.path),8000000);
    check(raw.bytes===artifact.bytes && raw.sha256===artifact.sha256);
    const lines=new TextDecoder('utf-8',{fatal:true}).decode(raw.data).split('\n');if(lines.at(-1)==='')lines.pop();
    check(lines.length===artifact.record_count && lines.length<=maxRows);
    const rows=lines.map(line=>JSON.parse(line)),keys=new Set();
    for(const row of rows){
      check(row.schema_version==='1.0.0' && row.view_type===(name==='states'?'state':'source') && row.lineage);
      for(const [key,value] of Object.entries(lineage))check(row.lineage[key]===value);
      check(row.lineage.transformation_version==='national-business-coverage-views@2.11.0');
      transformation??=row.lineage.transformation_version;check(row.lineage.transformation_version===transformation);
      const key=name==='states'?row.postal_abbreviation:row.source_key;check(typeof key==='string' && key && !keys.has(key));keys.add(key);
      if(name==='states') {check(/^[A-Z]{2}$/.test(key) && row.complete_all_businesses===false);
        const counts=row.registry_evidence?.source_profile_counts_by_reported_address_state;
        check(counts && typeof counts==='object' && !Array.isArray(counts));for(const value of Object.values(counts))nationalReportingCount(value);
      } else check(row.complete_source_for_all_businesses===false);
    }
    results[name]=rows;evidence[name]={sha256:raw.sha256,bytes:raw.bytes,recordCount:rows.length,exportPolicy:artifact.export_policy};
  }
  // Rehash every selected input and repeat non-alias ownership checks at return.
  for(const initial of [...pinned].reverse()){const after=await bounded(initial.file,initial.bytes,signal);check(after.sha256===initial.sha256 && stable(initial.identity,after.identity));}
  return {manifest,states:results.states,sources:results.sources,evidence:{coverageReleaseId:manifest.release_id,
    pointerSha256:pointerBytes.sha256,manifestSha256:manifestBytes.sha256,artifacts:evidence,
    exportPolicy:Object.values(evidence).some(row=>row.exportPolicy==='internal')?'internal':'local-review-only',
    sourceReplayPerformedThisRead:false,publisherAuthenticationPerformed:false,allBusinessesPercent:null}};
}
