import assert from 'node:assert/strict';
import path from 'node:path';
import {readFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {_electron} from 'playwright';
import electronPath from 'electron';
const root=process.cwd(),out=path.join(root,'data/ui-verification');await mkdir(out,{recursive:true});
const source=path.join(root,'data/business-sources/cms-hospital-general-information/jobs/7140acea-6dfb-478e-8769-5dd991bc1875/manifest.json');
const hash=async()=>createHash('sha256').update(await readFile(source)).digest('hex');
const before=await hash();assert.equal(before,'856992891a8ded15d0f924169991cd3c7d0bda6112de1a0702dd5600305e9239');
let app,operation;
const existing=process.argv[2];assert.ok(existing===undefined||/^[a-f0-9-]{36}$/.test(existing));
async function open(){app=await _electron.launch({executablePath:electronPath,args:[path.join(root,'desktop/main.mjs')],cwd:root,env:{...process.env,DATAHUB_DESKTOP_TEST_MODE:'1'}});return app.firstWindow();}
async function operations(page){return page.evaluate(async()=>{const c=await window.cotiveCollector.getRunnerConnection();const r=await fetch(`${c.runnerUrl}/api/data-operations/operations`,{headers:{Authorization:`Bearer ${c.controlToken}`}});if(!r.ok)throw Error('Operations unavailable');return r.json();});}
try{
 let page=await open();const panel=page.getByRole('region',{name:'Retained CMS hospital directory'});await panel.waitFor({timeout:60000});
 if(existing){operation={id:existing};console.log(JSON.stringify({reusedOperation:existing,newDispatch:false}));}
 else {const responsePromise=page.waitForResponse(r=>r.url().endsWith('/api/data-operations/source-adoptions')&&r.request().method()==='POST');
 await panel.getByRole('button',{name:'Inspect / adopt retained hospitals',exact:true}).click();const response=await responsePromise;assert.equal(response.status(),202);operation=await response.json();console.log(JSON.stringify({dispatchedOperation:operation.id,responseStatus:response.status()}));}
 await panel.getByText('5,419 dated hospital directory rows',{exact:true}).waitFor({timeout:220000});
 await page.getByLabel('Text size',{exact:true}).selectOption('100');const heading=panel.getByRole('heading',{name:'Retained CMS hospital directory'});await heading.scrollIntoViewIfNeeded();const headingBox=await heading.boundingBox();assert.ok(headingBox.y>=0);await page.screenshot({path:path.join(out,'cms-adoption-100.png')});
 assert.match(await panel.innerText(),/5,354 rows in states\/DC/);assert.match(await panel.innerText(),/65 territory rows/);
 await page.getByLabel('Text size',{exact:true}).selectOption('200');await panel.scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));await panel.screenshot({path:path.join(out,'cms-adoption-200.png')});
 assert.match(await panel.innerText(),/2026-08-13/);assert.match(await panel.innerText(),/Current source bytes have not been replayed/);assert.match(await panel.innerText(),/No public redistribution or downloads/);
 await page.getByRole('button',{name:'Reset text size',exact:true}).click();
 const receipt=JSON.parse(await readFile(path.join(root,'data/managed-operations',operation.id,'receipt.json'),'utf8'));assert.equal(receipt.status,'SUCCEEDED');assert.equal(receipt.result.summary.directoryRows,5419);assert.deepEqual(receipt.artifacts,[]);assert.equal(receipt.result.summary.sourceManifestSha256,before);assert.equal(receipt.result.newAcquisitionPerformed,false);
 const derived=JSON.parse(await readFile(receipt.result.descriptor.manifestPath,'utf8'));assert.equal(derived.operationId,operation.id);assert.equal(derived.claims.networkRequestsPerformed,0);
 await app.close();app=null;page=await open();const reopened=page.getByRole('region',{name:'Retained CMS hospital directory'});await reopened.getByText('5,419 dated hospital directory rows',{exact:true}).waitFor({timeout:60000});
 const history=await operations(page);assert.ok(JSON.stringify(history).includes(operation.id));assert.equal(await hash(),before);
 console.log(JSON.stringify({status:'passed',operationId:operation.id,manifestSha256:receipt.result.descriptor.manifestSha256,directoryRows:5419,statesDcRows:receipt.result.summary.statesDcRows,territoryRows:receipt.result.summary.territoryRows,unknownStateRows:receipt.result.summary.unknownStateRows,adoptedAt:receipt.result.adoptedAt,noDownloads:true,restartVisible:true,sourceManifestUnchanged:true,text200:true}));
}finally{if(app)await app.close();}
