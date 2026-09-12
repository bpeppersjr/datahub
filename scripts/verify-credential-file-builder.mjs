import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdir,readdir,readFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {_electron} from 'playwright';
import electronPath from 'electron';

// Explicit runtime acceptance: one small WY-reported-state export from retained
// credentials. No acquisition or national production operation is dispatched.
const root=process.cwd();await mkdir(path.join(root,'data/ui-verification'),{recursive:true});
const launch=()=>_electron.launch({executablePath:electronPath,args:[path.join(root,'desktop/main.mjs')],cwd:root,env:{...process.env,DATAHUB_DESKTOP_TEST_MODE:'1'}});
let app=await launch();
try {
 const page=await app.firstWindow();const type=page.getByLabel('Record type');await type.waitFor();
 await type.selectOption('mn-construction-credentials');
 assert.equal(await page.getByLabel('Use mode').inputValue(),'local-review-only');assert.equal(await page.getByLabel('Use mode').isDisabled(),true);
 assert.equal(await page.getByLabel('Business category').count(),0);
 assert.ok(await page.getByLabel('reporting id (required)',{exact:true}).isDisabled());
 await page.getByLabel('Credential reported address states').selectOption('WY');
 await type.selectOption('business');assert.equal(await page.getByLabel('Use mode').inputValue(),'public-only');
 assert.deepEqual(await page.getByLabel('Business address states').evaluate(el=>Array.from(el.selectedOptions).map(option=>option.value)),[]);
 await type.selectOption('mn-construction-credentials');await page.getByLabel('Credential reported address states').selectOption('WY');
 await page.locator('section[aria-labelledby="export-title"]').getByRole('combobox',{name:/^Format/}).selectOption('jsonl');
 await page.getByLabel('Text size',{exact:true}).selectOption('200');
 await page.getByRole('button',{name:'Build credential file',exact:true}).scrollIntoViewIfNeeded();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2));
 await page.screenshot({path:path.join(root,'data/ui-verification/credential-builder-200.png')});
 const responsePromise=page.waitForResponse(response=>response.url().endsWith('/api/data-operations/exports')&&response.request().method()==='POST');
 await page.getByRole('button',{name:'Build credential file',exact:true}).click();const response=await responsePromise;assert.equal(response.status(),202);const created=await response.json();
 const result=await page.evaluate(async id=>{
   const connection=await window.cotiveCollector.getRunnerConnection();
   for(let i=0;i<180;i++){const response=await fetch(`${connection.runnerUrl}/api/data-operations/operations/${id}`,{headers:{Authorization:`Bearer ${connection.controlToken}`}});const operation=await response.json();if(!['RUNNING','QUEUED'].includes(operation.status))return operation;await new Promise(resolve=>setTimeout(resolve,1000));}
   throw Error('Credential operation did not finish');
 },created.id);
 assert.equal(result.kind,'credential-export');assert.equal(result.status,'SUCCEEDED');assert.equal(result.result.artifactIntegrityVerified,true);
 assert.equal(result.result.recordUnit,'publisher-business-credential-row');assert.equal(result.result.rowsWritten,undefined);assert.equal(result.artifacts.length,2);
 const downloads=path.join(root,'downloads'),before=new Set(await readdir(downloads));
 const download=page.locator('.operation-record').filter({hasText:'Credential flat-file export'}).first().getByRole('button',{name:/^Download credentials.jsonl/});await download.waitFor({timeout:15000});await download.click();
 let savedName;for(let i=0;i<120;i++){savedName=(await readdir(downloads)).find(name=>!before.has(name)&&/^credentials(?:-\d+)?\.jsonl$/.test(name));if(savedName)break;await delay(500);}
 assert.ok(savedName,'Download button must create a local file');const savedPath=path.join(downloads,savedName);let bytes;
 const declared=result.artifacts.find(row=>row.name==='credentials.jsonl');
 for(let i=0;i<120;i++){bytes=await readFile(savedPath);if(bytes.length===declared.bytes)break;await delay(500);}
 assert.equal(bytes.length,declared.bytes);const rows=bytes.toString('utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
 assert.equal(rows.length,result.result.credentialRowsWritten);assert.ok(rows.every(row=>row.reported_state==='WY'&&row.record_unit==='publisher-business-credential-row'&&row.source_national_reporting_integrated===false));
 await page.getByRole('button',{name:'Reset text size',exact:true}).click();
 await page.locator('.credential-publication').getByText('Verified downstream publication:',{exact:true}).waitFor({timeout:60000});
 await page.locator('.credential-publication').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(root,'data/ui-verification/credential-publication-verified.png')});
 await page.route('**/api/retained-credentials?*',async route=>{const response=await route.fetch();const body=await response.json();body.downstreamPublication={status:'evidence-unverified',included:null,credentialRows:null};await route.fulfill({json:body});});
 await page.getByRole('button',{name:'Recheck retained data',exact:true}).click();
 await page.getByText('Downstream publication: Unknown.',{exact:true}).waitFor({timeout:60000});
 await page.screenshot({path:path.join(root,'data/ui-verification/credential-publication-unknown.png')});
 await app.close();app=await launch();const reopened=await app.firstWindow();await reopened.getByLabel('Record type').waitFor();
 const restored=await reopened.evaluate(async id=>{const connection=await window.cotiveCollector.getRunnerConnection();return fetch(`${connection.runnerUrl}/api/data-operations/operations/${id}`,{headers:{Authorization:`Bearer ${connection.controlToken}`}}).then(response=>response.json());},created.id);
 assert.equal(restored.status,'SUCCEEDED');assert.equal(restored.result.credentialRowsWritten,result.result.credentialRowsWritten);
 console.log(JSON.stringify({status:'passed',operationId:created.id,credentialRowsWritten:result.result.credentialRowsWritten,artifacts:result.artifacts,savedPath,savedBytes:bytes.length,restartVisible:true,modeSwitching:true,lockedPolicy:true,publicationVerifiedAndUnknown:true}));
} finally {await app.close();}
