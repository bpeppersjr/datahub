import {createHash} from 'node:crypto';
import {readdir} from 'node:fs/promises';
import path from 'node:path';
import {mnSelectionCanonical as canonical, mnSelectionReadJson as readJson} from './mn-construction-retained-selection.mjs';

const fail=()=>{throw Error('Authorization view release inventory or newest lineage is invalid.');};
const hash=value=>createHash('sha256').update(value).digest('hex');

// Check every retained envelope, including historical ones, without replaying
// historical policy through today's implementation. Never skip corrupt entries.
export async function readAuthorizationViewReleases(root,dataset,artifactName){
  const releases=path.join(root,'releases');await canonical(releases);
  const entries=await readdir(releases,{withFileTypes:true});if(!entries.length)fail();
  const result=[];
  for(const entry of entries){
    if(!entry.isDirectory()||entry.isSymbolicLink()||!entry.name.startsWith(`${dataset}-`))fail();
    const directory=path.join(releases,entry.name);await canonical(directory);
    if(JSON.stringify((await readdir(directory)).sort())!==JSON.stringify([artifactName,'manifest.json'].sort()))fail();
    const manifestPath=path.join(directory,'manifest.json'),manifestMeter={},artifactMeter={};
    const manifest=await readJson(manifestPath,1000000,undefined,manifestMeter);
    const artifact=await readJson(path.join(directory,artifactName),4000000,undefined,artifactMeter);
    const date=artifact.observed_at,instant=Date.parse(date);
    if(typeof date!=='string'||!Number.isFinite(instant)||!(/^\d{4}-\d{2}-\d{2}$/.test(date)?new Date(instant).toISOString().slice(0,10)===date:new Date(instant).toISOString()===date)
      ||manifest.dataset_id!==dataset||artifact.dataset_id!==dataset||manifest.release_id!==entry.name
      ||manifest.release_id!==`${dataset}-${date.replace(/[^A-Za-z0-9._-]/g,'-')}-${artifactMeter.sha256.slice(0,12)}`
      ||manifest.artifacts?.length!==1||manifest.artifacts[0].path!==artifactName||manifest.artifacts[0].bytes!==artifactMeter.bytes||manifest.artifacts[0].sha256!==artifactMeter.sha256
      ||hash(`${JSON.stringify(manifest,null,2)}\n`)!==manifestMeter.sha256||hash(`${JSON.stringify(artifact,null,2)}\n`)!==artifactMeter.sha256)fail();
    result.push({manifest,artifact,manifestPath,manifestSha256:manifestMeter.sha256,instant});
  }
  return result;
}

export function newestAuthorizationCohort(rows,key){
  if(!rows.length)fail();
  const latest=Math.max(...rows.map(row=>row.instant));
  const current=rows.filter(row=>row.instant===latest);
  if(new Set(current.map(key)).size!==1)fail();
  return current;
}
