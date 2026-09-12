import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID,createHash } from 'node:crypto';
import { mkdir,readFile,writeFile,rm } from 'node:fs/promises';
import {gzipSync,gunzipSync} from 'node:zlib';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {APP_ROOT} from './paths.mjs';
import {gatedTransport} from './fixtures/oh-childcare-gated-transport.mjs';
import {runOhChildcareAppJobWithTransport} from './oh-childcare-app.mjs';
import {loadOhChildcareGeographicInput} from './oh-childcare-geographic-evidence.mjs';
import {createTnChildcareReportingFixture} from './fixtures/tn-childcare-reporting.mjs';
import {createFreshTnReportingRows} from './fixtures/tn-childcare-fresh-reporting.mjs';
import {composeFlatBusinessExport,BUSINESS_FLATFILE_CATEGORIES} from '../scripts/compose-flat-business-export.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const OH='oh-dcy-publisher-open-childcare-centers';

test('2.15 export verifies Ohio whole membership, includes childcare and excludes MN credentials',async t=>{
  const root=path.join(APP_ROOT,'data/tmp',`flat-oh-${randomUUID()}`);await mkdir(root,{recursive:true});t.after(()=>rm(root,{recursive:true,force:true}));
  const f=await gatedTransport(),job=await runOhChildcareAppJobWithTransport({...f.options,outputRoot:path.join(root,'app')});
  const input=await loadOhChildcareGeographicInput(job.receipt_path);
  const oldFetch=globalThis.fetch;globalThis.fetch=()=>assert.fail('export must be offline');t.after(()=>{globalThis.fetch=oldFetch;});
  assert.ok(BUSINESS_FLATFILE_CATEGORIES.childcare.includes(OH));
  for(const origin of [null,'recovered','fresh']){
    const release=path.join(root,String(origin));await mkdir(release);
    const tnRows=origin===null?[]:origin==='fresh'?await createFreshTnReportingRows(t,{allMissing:true}):[createTnChildcareReportingFixture({zip:null}).row];
    const rows=[...input.rows,...tnRows];
    const manifest={dataset_id:'national-business-registry',release_id:'fixture-'+origin,status:'published-partial',publisher:{id:'national-business-registry',version:'2.15.0'},tn_childcare_origin:origin,
      oh_childcare_source:input.source,dependencies:[{dataset_id:OH,release_id:input.source.releaseId,manifest_sha256:input.source.manifestSha256},
      ...(tnRows.length?[{dataset_id:tnRows[0].source.source_id,release_id:tnRows[0].evidence.release_id,manifest_sha256:tnRows[0].evidence.manifest_sha256}]:[])],
      coverage:{oh_childcare_center_sites:input.rows.length,oh_childcare_center_sites_with_zip:1,oh_childcare_center_sites_without_zip:2,oh_childcare_missing_zip_reasons:input.quality.zip_unavailable_reasons,
        reporting_location_evidence_without_zip:2+tnRows.length,...(tnRows.length?{tn_childcare_center_sites:tnRows.length,tn_childcare_center_sites_with_zip:0,tn_childcare_center_sites_without_zip:tnRows.length,
          tn_childcare_missing_zip_reasons:origin==='fresh'?{'missing-source-zip':2,'invalid-source-zip-placeholder':1}:{'missing-source-zip':1,'invalid-source-zip-placeholder':0}}:{})},artifacts:[]};
    for(const [partition,records] of Map.groupBy(rows,r=>r.zip_code?.slice(0,2)??'unassigned')){
      const relative=`reporting/location-evidence/zip2=${partition}/records.jsonl.gz`,file=path.join(release,relative),bytes=gzipSync(records.map(JSON.stringify).join('\n')+'\n');
      await mkdir(path.dirname(file),{recursive:true});await writeFile(file,bytes);manifest.artifacts.push({path:relative,artifact_type:'business-reporting-location-evidence-jsonl-gzip',record_count:records.length,export_policy:'local-review-only',bytes:bytes.length,sha256:sha(bytes)});
    }
    // Legitimately distinct artifact type remains outside the business-profile scan.
    const credentials=Buffer.from('{"credential_rows":11456}\n');await mkdir(path.join(release,'reporting/mn-construction'),{recursive:true});await writeFile(path.join(release,'reporting/mn-construction/credentials.jsonl'),credentials);
    manifest.artifacts.push({path:'reporting/mn-construction/credentials.jsonl',artifact_type:'mn-construction-credential-reporting-jsonl',record_count:1,export_policy:'local-review-only',bytes:credentials.length,sha256:sha(credentials)});
    const manifestPath=path.join(release,'manifest.json');await writeFile(manifestPath,JSON.stringify(manifest));
    const args=['--source',manifestPath,'--output',root,'--category','childcare','--format','jsonl'];
    await assert.rejects(composeFlatBusinessExport([...args,'--output-prefix',`preabort-${origin}`],{signal:AbortSignal.abort()}));
    const local=await composeFlatBusinessExport([...args,'--output-prefix',`local-${origin}`,'--policy-mode','local-review']);
    assert.equal(local.summary.counts.rows_written,rows.length);assert.equal(local.summary.counts.source_rows_read,rows.length);
    const exported=(await readFile(path.join(local.outputDirectory,'records.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal(exported.filter(r=>r.source_id===OH).length,3);assert.ok(exported.every(r=>r.identity_matching_eligible===false));
    assert.ok(exported.filter(r=>r.source_id===OH).every(r=>r.governed_geographic_assignment_eligible===false));
    assert.ok(exported.every(r=>r.export_policy==='local-review-only'));assert.equal(local.manifest.export_policy,'local-review-only');
    const verified=JSON.parse((await promisify(execFile)(process.execPath,['scripts/verify-flat-business-export.mjs',local.manifestPath],{cwd:APP_ROOT,windowsHide:true})).stdout);
    assert.equal(verified.verified,true);assert.equal(verified.jsonl_rows,rows.length);
    const publicResult=await composeFlatBusinessExport([...args,'--output-prefix',`public-${origin}`]);assert.equal(publicResult.summary.counts.rows_written,0);
    const mismatch=structuredClone(manifest);mismatch.coverage.reporting_location_evidence_without_zip=tnRows.length;
    await writeFile(manifestPath,JSON.stringify(mismatch));await assert.rejects(composeFlatBusinessExport([...args,'--output-prefix',`bad-count-${origin}`]),/missing ZIP/);
    await writeFile(manifestPath,JSON.stringify(manifest));
    if(origin===null){
      const badPin=structuredClone(manifest);badPin.dependencies[0].manifest_sha256='0'.repeat(64);await writeFile(manifestPath,JSON.stringify(badPin));
      await assert.rejects(composeFlatBusinessExport([...args,'--output-prefix','wrong-oh-pin']));
      const artifact=manifest.artifacts.find(a=>a.path.includes('zip2=unassigned')),file=path.join(release,artifact.path),original=await readFile(file);
      const savedRows=gunzipSync(original).toString().trim().split('\n').map(JSON.parse);
      for(const [label,changed] of [['duplicate',[...savedRows,savedRows[0]]],['assigned',savedRows.map((r,i)=>i===0?{...r,governed_geographic_assignment_eligible:true}:r)]]){
        const bytes=gzipSync(changed.map(JSON.stringify).join('\n')+'\n'),bad=structuredClone(manifest),entry=bad.artifacts.find(a=>a.path===artifact.path);
        Object.assign(entry,{bytes:bytes.length,sha256:sha(bytes),record_count:changed.length});await writeFile(file,bytes);await writeFile(manifestPath,JSON.stringify(bad));
        await assert.rejects(composeFlatBusinessExport([...args,'--output-prefix',label]));
      }
      await writeFile(file,original);await writeFile(manifestPath,JSON.stringify(manifest));
    }
    const omitted=structuredClone(manifest);omitted.artifacts=omitted.artifacts.filter(a=>!a.path.includes('zip2=unassigned'));
    await writeFile(manifestPath,JSON.stringify(omitted));await assert.rejects(composeFlatBusinessExport([...args,'--output-prefix',`omitted-${origin}`]));
  }
});
