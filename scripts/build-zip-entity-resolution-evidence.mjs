import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {APP_ROOT} from '../runner/paths.mjs';
import {buildZipEntityResolutionEvidence,DATASET} from '../runner/zip-entity-resolution-evidence.mjs';

const built=await buildZipEntityResolutionEvidence({root:APP_ROOT});
const manifestPath=path.posix.join('data',DATASET,'releases',built.manifest.release_id,'manifest.json');
const raw=Buffer.from(`${JSON.stringify(built.manifest)}\n`),manifestSha256=createHash('sha256').update(raw).digest('hex');
const registration={schema_version:'1.0.0',dataset_id:DATASET,status:'registered-pointer-free-local-review-evidence',runtime_pointer:null,production_enrollment:false,export_policy:'local-review-only',retained_release:{release_id:built.manifest.release_id,manifest:manifestPath,manifest_sha256:manifestSha256,manifest_bytes:raw.length,artifact_count:built.manifest.artifacts.length,zip_rows:built.manifest.summary.zip_union_count,artifact_bytes:built.manifest.artifacts.reduce((n,a)=>n+a.bytes,0),maximum_prefix_bytes:Math.max(...built.manifest.artifacts.map(a=>a.bytes))},claims:built.manifest.claims};
await writeFile(path.join(APP_ROOT,`config/datasets/${DATASET}.json`),`${JSON.stringify(registration,null,2)}\n`);
console.log(JSON.stringify({release_id:built.manifest.release_id,manifest_sha256:manifestSha256,manifest_path:manifestPath,...built.manifest.summary,maximum_prefix_bytes:registration.retained_release.maximum_prefix_bytes},null,2));
