import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {APP_ROOT} from './paths.mjs';
import {readAuthorizationViewReleases,newestAuthorizationCohort} from './authorization-view-release-selection.mjs';

test('newest selection rejects ties across lineages and never combines timestamps',()=>{
  const rows=[{instant:1,key:'old',n:1},{instant:1,key:'old',n:2},{instant:2,key:'new',n:1}];
  assert.deepEqual(newestAuthorizationCohort(rows,row=>row.key),[rows[2]]);
  assert.throws(()=>newestAuthorizationCohort([...rows,{instant:2,key:'other'}],row=>row.key));
  assert.throws(()=>newestAuthorizationCohort([],row=>row.key));
});

test('retained envelope selection detects historical and newest tampering before selection',async t=>{
  await fs.mkdir(path.join(APP_ROOT,'data/tmp'),{recursive:true});
  const root=await fs.mkdtemp(path.join(APP_ROOT,'data/tmp/authorization-selection-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const dataset='selection-fixture',files=[];
  for(const date of ['2026-09-01','2026-10-01']){
    const artifact={dataset_id:dataset,observed_at:date},raw=Buffer.from(`${JSON.stringify(artifact,null,2)}\n`),sha=createHash('sha256').update(raw).digest('hex');
    const release=`${dataset}-${date}-${sha.slice(0,12)}`,dir=path.join(root,'releases',release);await fs.mkdir(dir,{recursive:true});
    const manifest={dataset_id:dataset,release_id:release,artifacts:[{path:'fixture.json',bytes:raw.length,sha256:sha}]};
    await fs.writeFile(path.join(dir,'manifest.json'),`${JSON.stringify(manifest,null,2)}\n`);const file=path.join(dir,'fixture.json');await fs.writeFile(file,raw);files.push({file,raw});
  }
  const rows=await readAuthorizationViewReleases(root,dataset,'fixture.json');assert.equal(newestAuthorizationCohort(rows,row=>row.manifest.release_id)[0].artifact.observed_at,'2026-10-01');
  for(const {file,raw}of files){await fs.appendFile(file,' ');await assert.rejects(readAuthorizationViewReleases(root,dataset,'fixture.json'));await fs.writeFile(file,raw);}
  await fs.link(files[0].file,path.join(root,'alias'));await assert.rejects(readAuthorizationViewReleases(root,dataset,'fixture.json'));
});
