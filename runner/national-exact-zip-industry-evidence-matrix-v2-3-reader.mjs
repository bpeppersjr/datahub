import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { APP_ROOT } from './paths.mjs';
import { readExactZipIndustryEvidenceV22 } from './national-exact-zip-industry-evidence-matrix-v2-2-reader.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),ck=v=>{if(!v)throw Error('Exact-ZIP v2.3 bounded reader rejected.')};
export async function readExactZipIndustryEvidenceV23({root=APP_ROOT,zip5,signal}={}) {
  ck(/^\d{5}$/.test(zip5??'')); signal?.throwIfAborted();
  const registration=JSON.parse(await readFile(path.join(root,'config/datasets/national-exact-zip-industry-evidence-matrix-v2-3.json'))),p=registration.retained_release,mp=path.join(root,p.manifest),mb=await readFile(mp);
  ck(registration.schema_version==='2.3.0'&&registration.runtime_pointer===null&&registration.production_enrollment===false&&sha(mb)===p.manifest_sha256);
  const manifest=JSON.parse(mb),descriptor=manifest.artifacts.find(a=>a.path===`prefix=${zip5.slice(0,2)}.json`); ck(descriptor);
  const bytes=await readFile(path.join(path.dirname(mp),descriptor.path)); ck(bytes.length===descriptor.bytes&&sha(bytes)===descriptor.sha256);
  const rows=JSON.parse(bytes),row=rows.find(x=>x.zip5===zip5)??null;
  ck(rows.length===descriptor.record_count&&rows.every((x,n)=>/^\d{5}$/.test(x.zip5)&&(n===0||rows[n-1].zip5<x.zip5)&&x.schema_version==='national-exact-zip-industry-evidence-row@2.3.0'&&Object.keys(x.cells).length===44&&Object.hasOwn(x.cells,'cross_source_entity_resolution_linkage_evidence')));
  const predecessor=await readExactZipIndustryEvidenceV22({root,zip5,signal}); ck(predecessor.release_id===manifest.bindings.predecessor.release_id&&predecessor.manifest_sha256===manifest.bindings.predecessor.manifest_sha256);
  return {schema_version:'national-exact-zip-industry-evidence-row@2.3.0',status:row?'present':'absent',row,release_id:manifest.release_id,manifest_sha256:sha(mb),full_matrix_replay_performed:false,recursive_lineage_verified:true,gap_sidecars:predecessor.gap_sidecars,claims:manifest.claims};
}
