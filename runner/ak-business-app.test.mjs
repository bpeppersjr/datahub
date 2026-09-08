import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,readFile,writeFile,rm } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { APP_ROOT } from './paths.mjs';

test('AK isolated app fresh and retained evidence, tamper, cancellation and locks', {timeout:240000},async t=>{
  const root=await mkdtemp(path.join(APP_ROOT,'data/tmp/ak-app-acceptance-'));t.after(()=>rm(root,{recursive:true,force:true}));
  for(const file of ['config/connectors/ak-active-business-licenses.json','config/connectors/ak-active-business-licenses-app.json','config/source-policies/ak-active-business-licenses.json']){
    await mkdir(path.dirname(path.join(root,file)),{recursive:true});await writeFile(path.join(root,file),await readFile(path.join(APP_ROOT,file)));
  }
  const code=`
    import assert from 'node:assert/strict';import path from 'node:path';import fs from 'node:fs';
    import {syncBuiltinESMExports} from 'node:module';import {createHash,randomUUID} from 'node:crypto';
    import {runAkBusinessAppJob as run,verifyAkBusinessAppJob as verify} from ${JSON.stringify(new URL('./ak-business-app.mjs',import.meta.url).href)};
    import {AK_BUSINESS_LICENSE_HEADERS as LH,AK_BUSINESS_NAICS_HEADERS as NH,AK_BUSINESS_LICENSE_URL as LU,AK_BUSINESS_NAICS_URL as NU,buildAkActiveBusinessLicenses as build} from ${JSON.stringify(new URL('./ak-active-business-licenses.mjs',import.meta.url).href)};
    const io=fs.promises,root=process.env.DATAHUB_ROOT,base=path.join(root,'data/business-baselines/census-zbp');
    await io.mkdir(path.join(base,'releases/zbp-fixture/derived'),{recursive:true});
    const bytes=Buffer.from(JSON.stringify({zip_code:'99501',coverage_status:'zbp-and-zcta',current_usps_validity:{status:'unverified'},geography:{status:'2020-zcta-polygon-available',geo_id:'zcta:99501',geoid:'99501'},employer_baseline:{status:'published',establishments:10}})+'\\n');
    await io.writeFile(path.join(base,'releases/zbp-fixture/derived/zip-coverage.jsonl'),bytes);
    await io.writeFile(path.join(base,'releases/zbp-fixture/manifest.json'),JSON.stringify({dataset_id:'census-zbp-baseline',release_id:'zbp-fixture',complete_national_release:true,geography_dependency:{dataset_id:'us-census-geography',release_id:'geo-fixture'},artifacts:[{path:'derived/zip-coverage.jsonl',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}]}));
    await io.writeFile(path.join(base,'current.json'),JSON.stringify({manifest:'releases/zbp-fixture/manifest.json'}));
    const license=i=>({LicenseNumber:String(i+1),BusinessName:'Synthetic Alaska LLC',Status:'Active',IssueDate:'1/15/2020',RenewDate:'10/9/2025',ExpireDate:'12/31/2099',HasTelemedicine:'No',PhysicalCity:'Anchorage',PhysicalCountry:'UNITED STATES',PhysicalLine1:'100 Market Street',PhysicalLine2:'Suite 200',PhysicalState:'AK',PhysicalZip:'99501',PhysicalZipPlus:'1234'});
    const naics=i=>({Lob:'44-45 - Retail Trade',NaicsCode:'445110 - SUPERMARKETS',NaicsDescription:'SUPERMARKETS',LicenseNumber:String(i+1),BusinessName:'Synthetic Alaska LLC'});
    let calls=0;globalThis.fetch=async value=>{const url=String(value);calls++;assert.ok(url===LU||url===NU);const headers=url===LU?LH:NH,rows=[headers.join(',')];for(let i=0;i<80000;i++){const r=url===LU?license(i):naics(i);rows.push(headers.map(h=>JSON.stringify(r[h]??'')).join(','));}const csv=rows.join('\\r\\n')+'\\r\\n';return new Response(csv,{headers:{'content-type':'text/csv','content-disposition':'attachment; filename='+(url===LU?'BusinessLicenseDownload.csv':'NaicsDownload.csv'),'content-length':String(Buffer.byteLength(csv))}});};
    const fresh=await run({outputRoot:path.join(root,'fresh'),industryRunId:'synthetic-native'});assert.equal(calls,2);
    globalThis.fetch=()=>{throw Error('NETWORK_FORBIDDEN');};
    const checked=await verify(fresh.receiptPath);assert.equal(checked.receipt.execution_mode,'fixed-native-fetch');assert.equal(checked.receipt.native_execution_independently_verified,false);
    assert.equal(checked.receipt.source.counts.source_active_license_rows,80000);assert.equal(checked.receipt.source.counts.active_license_organizations,80000);assert.equal(checked.receipt.source.counts.complete_all_businesses,false);
    assert.ok(checked.receipt.source.manifest.startsWith(path.relative(root,path.dirname(fresh.receiptPath)).replaceAll('\\\\','/')+'/acquired/releases/'));
    const start=JSON.parse(await io.readFile(path.join(path.dirname(fresh.receiptPath),'start.json'))),borrow=structuredClone(checked.receipt),id=randomUUID(),other=path.join(path.dirname(path.dirname(fresh.receiptPath)),id);await io.mkdir(other);start.run_id=id;const raw=Buffer.from(JSON.stringify(start)+'\\n');await io.writeFile(path.join(other,'start.json'),raw);borrow.run_id=id;borrow.start_sha256=createHash('sha256').update(raw).digest('hex');await io.writeFile(path.join(other,'receipt.json'),JSON.stringify(borrow));await assert.rejects(verify(path.join(other,'receipt.json')));
    const small=await build({outputRoot:path.join(root,'small'),zbpPointer:path.join(base,'current.json'),licenseRows:[license(0)],naicsRows:[naics(0)],minimumLicenseRows:1,sourceMetadata:{licenseHeaders:LH,naicsHeaders:NH,licenseObservedAt:'2026-09-01T12:00:00Z',naicsObservedAt:'2026-09-01T12:00:30Z'},now:()=>new Date('2026-09-01T12:01:00Z'),logger:()=>{}});
    const retainedManifest=path.join(small.releaseDirectory,'manifest.json'),pointer=await io.readFile(small.pointerPath),outputRoot=path.join(root,'retained');
    const retained=await run({outputRoot,retainedManifest});assert.equal((await verify(retained.receiptPath)).receipt.execution_mode,'retained-local-verification');assert.deepEqual(await io.readFile(small.pointerPath),pointer);
    const concurrent=await Promise.allSettled([run({outputRoot,retainedManifest}),run({outputRoot,retainedManifest})]);assert.equal(concurrent.filter(x=>x.status==='fulfilled').length,1);assert.equal(concurrent.filter(x=>x.status==='rejected').length,1);
    const {execFileSync}=await import('node:child_process'),{pathToFileURL}=await import('node:url');const guard=path.join(root,'offline-cli.mjs');await io.writeFile(guard,"globalThis.fetch=()=>{throw Error('NETWORK_FORBIDDEN');};\\n");
    const cliArgs=['--import',pathToFileURL(guard).href];
    const cli=JSON.parse(execFileSync(process.execPath,[...cliArgs,${JSON.stringify(path.join(APP_ROOT,'scripts/run-ak-business-app.mjs'))},'--output',path.join(root,'cli'),'--retained-manifest',retainedManifest],{encoding:'utf8',windowsHide:true,timeout:15000}));
    const cliVerified=JSON.parse(execFileSync(process.execPath,[...cliArgs,${JSON.stringify(path.join(APP_ROOT,'scripts/verify-ak-business-app.mjs'))},'--receipt',cli.receiptPath],{encoding:'utf8',windowsHide:true,timeout:15000}));assert.equal(cliVerified.receipt.execution_mode,'retained-local-verification');assert.deepEqual(await io.readFile(small.pointerPath),pointer);
    const receiptRaw=await io.readFile(retained.receiptPath),bad=JSON.parse(receiptRaw);bad.native_execution_independently_verified=true;await io.writeFile(retained.receiptPath,JSON.stringify(bad));await assert.rejects(verify(retained.receiptPath));await io.writeFile(retained.receiptPath,receiptRaw);
    for(const extra of [{fetchImpl:()=>{}},{now:()=>new Date()},{industryRunId:{}}])await assert.rejects(run({outputRoot,retainedManifest,...extra}));
    await assert.rejects(run({outputRoot:path.join(small.releaseDirectory,'nested'),retainedManifest}));
    await io.writeFile(path.join(outputRoot,'.app.lock'),'foreign');await assert.rejects(run({outputRoot,retainedManifest}));assert.equal(await io.readFile(path.join(outputRoot,'.app.lock'),'utf8'),'foreign');await io.unlink(path.join(outputRoot,'.app.lock'));
    const controller=new AbortController(),original=fs.promises.rename,cancelRoot=path.join(root,'cancel');
    fs.promises.rename=async(from,to)=>{const result=await original(from,to);if(String(to).endsWith('start.json'))controller.abort();return result;};syncBuiltinESMExports();
    try{await assert.rejects(run({outputRoot:cancelRoot,retainedManifest,signal:controller.signal}));}finally{fs.promises.rename=original;syncBuiltinESMExports();}
    const [cancelId]=await io.readdir(path.join(cancelRoot,'jobs'));assert.equal(JSON.parse(await io.readFile(path.join(cancelRoot,'jobs',cancelId,'receipt.json'))).status,'CANCELLED');
    await assert.rejects(io.access(path.join(cancelRoot,'.app.lock')),{code:'ENOENT'});
    const manifestRaw=await io.readFile(retainedManifest);await io.writeFile(retainedManifest,'{}');const failedRoot=path.join(root,'failed');await assert.rejects(run({outputRoot:failedRoot,retainedManifest}));const [failedId]=await io.readdir(path.join(failedRoot,'jobs'));assert.equal(JSON.parse(await io.readFile(path.join(failedRoot,'jobs',failedId,'receipt.json'))).status,'FAILED');await io.writeFile(retainedManifest,manifestRaw);
    const contractFile=path.join(root,'config/connectors/ak-active-business-licenses-app.json'),contract=JSON.parse(await io.readFile(contractFile));contract.version='99.0.0';await io.writeFile(contractFile,JSON.stringify(contract));await assert.rejects(run({outputRoot:path.join(root,'drift'),retainedManifest}));await assert.rejects(io.access(path.join(root,'drift')),{code:'ENOENT'});
    console.log('AK_APP_ACCEPTANCE_OK');
  `;
  const {stdout}=await promisify(execFile)(process.execPath,['--input-type=module','-e',code],{cwd:APP_ROOT,windowsHide:true,timeout:220000,maxBuffer:1000000,env:{...process.env,DATAHUB_ROOT:root,TEMP:root,TMP:root}});
  assert.match(stdout,/AK_APP_ACCEPTANCE_OK/);
});
