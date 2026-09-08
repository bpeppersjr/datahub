import path from 'node:path';
import { mkdir,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { buildDeBusinessLicenses, DE_BUSINESS_LICENSE_SCHEMA } from '../de-business-licenses.mjs';
import { createCliCancellation } from '../cli-cancellation.mjs';
const outputRoot=process.argv[3],root=path.resolve(outputRoot,'../..'),cancellation=createCliCancellation();
globalThis.fetch=()=>{throw Error('No network permitted in fixture');};
try {
  await writeFile(path.join(root,'child-pid.json'),JSON.stringify({pid:process.pid}));
  const baseline=path.join(root,'baseline');await mkdir(path.join(baseline,'derived'),{recursive:true});
  const bytes=Buffer.from(JSON.stringify({zip_code:'19801',geography:{},employer_baseline:{}})+'\n');
  await writeFile(path.join(baseline,'derived/zip-coverage.jsonl'),bytes);
  await writeFile(path.join(baseline,'manifest.json'),JSON.stringify({dataset_id:'census-zbp-baseline',complete_national_release:true,release_id:'fixture',artifacts:[{path:'derived/zip-coverage.jsonl',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}]}));
  await writeFile(path.join(baseline,'current.json'),JSON.stringify({manifest:'manifest.json'}));
  const row={socrata_row_id:'one',business_name:'Synthetic Fixture LLC',license_number:'2026000001',category:'RETAIL',current_license_valid_from:'2026-01-01T00:00:00.000',current_license_valid_to:'2026-12-31T00:00:00.000',address_1:'100 Market St',city:'Wilmington',state:'DE',zip:'19801',country:'UNITED STATES'};
  const result=await buildDeBusinessLicenses({outputRoot,zbpPointer:path.join(baseline,'current.json'),sourceRecords:[row],catalogMetadata:{id:'5zy2-grhr',name:'Delaware Business Licenses',attribution:'Department of Finance, Division of Revenue',description:'Information for businesses currently licensed in Delaware.',license:{name:'Public Domain'},rowsUpdatedAt:1788175917,sourceRecordCount:1,distinctLicenseCount:1,columns:DE_BUSINESS_LICENSE_SCHEMA.map(([fieldName,dataTypeName])=>({fieldName,dataTypeName}))},minimumLicenseRows:1,signal:cancellation.signal,logger:()=>{},onAfterCommit:async()=>{
    await writeFile(path.join(root,'ready.json'),JSON.stringify({pid:process.pid}));
    const keepAlive=setInterval(()=>{},1000);
    try { if(!cancellation.signal.aborted)await new Promise(resolve=>cancellation.signal.addEventListener('abort',resolve,{once:true})); }
    finally {clearInterval(keepAlive);}
    await delay(16000); // Cooperative postcommit work, not a simulation of blocked OS I/O.
  }});
  await writeFile(path.join(root,'completed.json'),JSON.stringify({manifest:path.join(result.releaseDirectory,'manifest.json'),outputRoot,cancelled:cancellation.signal.aborted}));
} finally {cancellation.dispose();}
