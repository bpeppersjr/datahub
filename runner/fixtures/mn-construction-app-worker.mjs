import assert from 'node:assert/strict';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { APP_ROOT } from '../paths.mjs';
import { MN_CONSTRUCTION_COLUMNS, MN_CONSTRUCTION_EXPORTS } from '../mn-construction-preflight.mjs';
import { runMnConstructionAppJobWithTransport as run, runMnConstructionAppJob as native, verifyMnConstructionAppJob as verify } from '../mn-construction-app.mjs';
const mode=process.argv[2], notices=JSON.parse(await readFile(path.join(APP_ROOT,'notice-fixture.json'),'utf8')), calls=[];
const controller=new AbortController();
const root=path.join(APP_ROOT,'app'), lockFile=path.join(APP_ROOT,'data/business-sources/mn-dli-construction/runtime/publisher.lock');
const row=(registration)=>({...Object.fromEntries(MN_CONSTRUCTION_COLUMNS.map(k=>[k,''])),Bus_Pers:'Business',Status:'Issued',Name:'Synthetic app contractor',Lic_Number:registration?'IR123456':'BC123456',St:'MN',Zip:'55001-1234',Phone_No:'PRIVATE CONTACT'});
const source=registration=>{
  const csv=MN_CONSTRUCTION_COLUMNS.join(',')+'\r\n'+Array.from({length:60},(_,i)=>{
    const value=row(registration);if(mode==='mixed-encoding' && i===0)value.Name='BYTE_MARKER';if(mode==='mixed-encoding' && i===1)value.Phone_No='BYTE_MARKER';
    return MN_CONSTRUCTION_COLUMNS.map(k=>JSON.stringify(value[k])).join(',')+'\r\n';}).join('');
  const body=Buffer.concat(csv.split('BYTE_MARKER').flatMap((part,i)=>i?[Buffer.from([0xa4]),Buffer.from(part)]:[Buffer.from(part)]));
  return Buffer.concat([body,mode==='invalid-utf8'?Buffer.from([0xff]):Buffer.alloc(0)]);
};
const fetchImpl=async(url,options)=>{
  calls.push({url,method:options.method,range:options.headers.Range??null});
  if(mode==='http-failure')return new Response('PRIVATE FAILURE',{status:403});
  const notice=notices.observations.find(item=>item.url===url);
  if(notice)return new Response(notice.article_html,{headers:{'content-type':'text/html'}});
  assert.ok(MN_CONSTRUCTION_EXPORTS.includes(url));
  const body=source(url===MN_CONSTRUCTION_EXPORTS[0]);
  const headers={'content-length':String(body.length),'content-type':'application/octet-stream',etag:'"fixture-source"','last-modified':'Tue, 08 Sep 2026 11:00:00 GMT'};
  if(mode==='held-version' && url===MN_CONSTRUCTION_EXPORTS[0])headers.etag='"06cd86f3fdd1:0"';
  if(options.method==='HEAD')return new Response(null,{headers});
  if(options.headers.Range)return new Response(body.subarray(0,4096),{status:206,headers:{...headers,'content-length':'4096','content-range':`bytes 0-4095/${body.length}`}});
  if(mode==='cancel-transfer')controller.abort();
  return new Response(body,{headers});
};
const options={cohort:'registrations',outputRoot:root,fetchImpl,sleep:async()=>{},signal:controller.signal,
  logger:async phase=>{
    if(['cancel-after-commit','failed-cohort-tamper'].includes(mode) && phase==='acquisition-persisted')controller.abort();if(mode==='late-failure' && phase==='before-complete')throw new Error('PRIVATE LOGGER FAILURE');
    if(mode==='checkpoint-tamper' && phase==='before-complete'){
      const [id]=await readdir(path.join(root,'jobs')),file=path.join(root,'jobs',id,'acquisition-checkpoint.json');
      const value=JSON.parse(await readFile(file,'utf8'));value.acquisition.sha256='0'.repeat(64);await writeFile(file,JSON.stringify(value));
    }
  }};
async function receiptForFailure(){const ids=await readdir(path.join(root,'jobs'));assert.equal(ids.length,1);return verify(path.join(root,'jobs',ids[0],'receipt.json'));}
if(mode==='success' || mode==='tamper' || mode==='mixed-encoding'){
  const result=await run(options);assert.equal(result.status,'SUCCEEDED');assert.equal(result.execution_mode,'injected-test-transport');assert.equal(result.acquisition.counts.accepted_records,mode==='mixed-encoding'?59:60);
  if(mode==='mixed-encoding'){assert.equal(result.acquisition.counts.source_records,60);assert.equal(result.acquisition.counts.rejected_by_reason['invalid-selected-utf8'],1);}
  assert.equal(calls.length,13);assert.equal(calls.filter(c=>c.method==='GET'&&!c.range&&MN_CONSTRUCTION_EXPORTS.includes(c.url)).length,1);
  assert.ok(!JSON.stringify(result).includes('PRIVATE'));await assert.rejects(readFile(lockFile),{code:'ENOENT'});
  assert.deepEqual(await verify(result.receipt_path),result);
  const {summarizeMnConstructionAppJob}=await import('../mn-construction-reporting.mjs');
  const summary=await summarizeMnConstructionAppJob(result.receipt_path);
  assert.equal(summary.accepted_credential_rows,result.acquisition.counts.accepted_records);assert.equal(summary.semantics.unique_business_count,null);
  assert.equal(summary.by_reported_state[0].percent_of_this_accepted_cohort,100);assert.equal(summary.provenance.app_receipt_sha256,result.receipt_sha256);
  if(mode==='tamper'){const receipt=JSON.parse(await readFile(result.receipt_path,'utf8'));receipt.public_export_authorized=true;await writeFile(result.receipt_path,JSON.stringify(receipt));await assert.rejects(verify(result.receipt_path));}
  process.stdout.write(JSON.stringify({status:'PASS',case:mode,app_receipt:result.receipt_path,requests:calls.length}));
}else if(mode==='parallel'){
  const results=await Promise.all([run(options),run({...options,cohort:'residential'})]);assert.ok(results.every(r=>r.status==='SUCCEEDED'));assert.equal(calls.length,26);
  let waiting=0;for(const result of results)if((await readdir(path.dirname(result.receipt_path))).includes('publisher-wait.json'))waiting++;
  assert.ok(waiting>=1);await assert.rejects(readFile(lockFile),{code:'ENOENT'});process.stdout.write(JSON.stringify({status:'PASS',case:mode,waiting,requests:calls.length}));
}else if(mode==='busy' || mode==='busy-cancel'){
  await mkdir(path.dirname(lockFile),{recursive:true});await writeFile(lockFile,'retained prior owner');
  let timer;if(mode==='busy-cancel')timer=setTimeout(()=>controller.abort(),200);
  try{await assert.rejects(run({...options,publisherWaitMs:mode==='busy'?0:900000}));}finally{clearTimeout(timer);}
  const receipt=await receiptForFailure();assert.equal(receipt.status,mode==='busy'?'BLOCKED':'CANCELLED');assert.equal(calls.length,0);assert.equal(await readFile(lockFile,'utf8'),'retained prior owner');
  process.stdout.write(JSON.stringify({status:'PASS',case:mode}));
}else if(mode==='enrollment-drift'){
  const profilePath=path.join(APP_ROOT,'config/mn-construction-app-enrollment.json'),profile=JSON.parse(await readFile(profilePath,'utf8'));profile.network_retries=2;await writeFile(profilePath,JSON.stringify(profile));
  await assert.rejects(run(options));assert.equal(calls.length,0);process.stdout.write(JSON.stringify({status:'PASS',case:mode}));
}else if(mode==='invalid'){
  for(const changed of [{cohort:'unknown'},{industryRunId:'../escape'},{publisherWaitMs:900001}])await assert.rejects(run({...options,...changed}));
  await assert.rejects(native({cohort:'registrations',fetchImpl}));assert.equal(calls.length,0);await assert.rejects(readFile(lockFile),{code:'ENOENT'});process.stdout.write(JSON.stringify({status:'PASS',case:mode}));
}else{
  await assert.rejects(run(options),error=>!error.message.includes('PRIVATE'));const result=await receiptForFailure();
  assert.equal(result.status,mode.startsWith('cancel')||mode==='failed-cohort-tamper'?'CANCELLED':'FAILED');
  if(['cancel-after-commit','late-failure','checkpoint-tamper','failed-cohort-tamper'].includes(mode))assert.equal(result.acquisition.counts.accepted_records,60);
  else assert.equal(result.acquisition,null);
  if(mode==='held-version') {
    assert.equal(result.failure_diagnostic,'source-version-held');
    assert.equal(calls.length,8); // Two notices and two HEAD/range/HEAD prerequisites; no full export.
    assert.equal(calls.filter(c=>c.method==='GET'&&!c.range&&MN_CONSTRUCTION_EXPORTS.includes(c.url)).length,0);
    assert.ok(!(await readdir(path.dirname(result.receipt_path))).includes('selected'));
  }
  if(mode==='invalid-utf8') {
    const file=path.join(path.dirname(result.receipt_path),'diagnostic.json'),diagnostic=JSON.parse(await readFile(file,'utf8'));
    assert.equal(diagnostic.code,'source-csv-column-count');assert.doesNotMatch(JSON.stringify(diagnostic),/PRIVATE/);
    assert.equal(result.failure_diagnostic,'source-csv-column-count');
    diagnostic.code='source-csv-invalid';await writeFile(file,JSON.stringify(diagnostic));assert.equal((await verify(result.receipt_path)).failure_diagnostic,'source-csv-invalid');
    diagnostic.code='PRIVATE';await writeFile(file,JSON.stringify(diagnostic));await assert.rejects(verify(result.receipt_path));
  }
  if(mode==='failed-cohort-tamper'){
    const startPath=path.join(path.dirname(result.receipt_path),'start.json'),start=JSON.parse(await readFile(startPath,'utf8')),end=JSON.parse(await readFile(result.receipt_path,'utf8'));
    start.cohort='residential';end.cohort='residential';end.publisher_lease.cohort='residential';
    const raw=JSON.stringify(start)+'\n', {createHash}=await import('node:crypto');end.start_sha256=createHash('sha256').update(raw).digest('hex');
    await writeFile(startPath,raw);await writeFile(result.receipt_path,JSON.stringify(end)+'\n');await assert.rejects(verify(result.receipt_path));
  }
  await assert.rejects(readFile(lockFile),{code:'ENOENT'});process.stdout.write(JSON.stringify({status:'PASS',case:mode,terminal:result.status,requests:calls.length}));
}
