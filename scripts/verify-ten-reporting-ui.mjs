import assert from 'node:assert/strict';
import path from 'node:path';
import {_electron} from 'playwright';
import electronPath from 'electron';
const root=process.cwd(),app=await _electron.launch({executablePath:electronPath,args:[path.join(root,'desktop/main.mjs')],cwd:root,env:{...process.env,DATAHUB_DESKTOP_TEST_MODE:'1'}});
try{const page=await app.firstWindow(),selector=page.getByLabel('National reporting source set',{exact:true});await selector.waitFor({timeout:60000});assert.equal(await selector.inputValue(),'eight');
 const eight=page.getByRole('region',{name:'State dataset coverage'});await eight.getByText(/Published release:/).waitFor({timeout:60000});const before=await eight.innerText();
 const native=await page.evaluate(async()=>{const c=await window.cotiveCollector.getRunnerConnection(),headers={Authorization:`Bearer ${c.controlToken}`};const values={};for(const key of ['eight','ten']){const r=await fetch(`${c.runnerUrl}/api/dataset-representation${key==='ten'?'/ten':''}`,{headers});if(!r.ok)throw Error('Representation endpoint unavailable');const v=await r.json();values[key]={available:v.available,version:v.denominatorVersion,states:v.states?.length??null,reason:v.reason??null,allBusinessesPercent:v.allBusinessesPercent??null};}return values;});
 assert.equal(native.eight.available,true);assert.equal(native.eight.states,51);assert.equal(native.ten.available,false);assert.equal(native.ten.reason,'production-enrollment-absent');
 await selector.selectOption('ten');const ten=page.getByRole('region',{name:'Ten-source dataset presence'});await ten.getByText(/Pending production enrollment/).waitFor();assert.equal(await ten.locator('table').count(),0);assert.doesNotMatch(await ten.innerText(),/10\/10|0\.0%/);
 await page.getByLabel('Text size',{exact:true}).selectOption('100');await ten.screenshot({path:path.join(root,'data/ui-verification/ten-reporting-pending-100.png')});
 await page.getByLabel('Text size',{exact:true}).selectOption('200');await ten.scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));await ten.screenshot({path:path.join(root,'data/ui-verification/ten-reporting-pending-200.png')});
 await page.getByRole('button',{name:'Reset text size',exact:true}).click();await selector.selectOption('eight');await eight.getByText(/Published release:/).waitFor();assert.equal(await eight.innerText(),before);
 console.log(JSON.stringify({status:'passed',native,defaultEight:true,tenPendingWithoutCounts:true,eightRestored:true,text200:true,writesPerformed:0}));
}finally{await app.close();}
