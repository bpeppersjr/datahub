import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdir} from 'node:fs/promises';
import {_electron} from 'playwright';
import electronPath from 'electron';

// Explicit desktop acceptance. Only the existing retained credential view is
// built; no acquisition, export, production operation or refresh is dispatched.
const root=process.cwd(),output=path.join(root,'data/ui-verification');await mkdir(output,{recursive:true});
const app=await _electron.launch({executablePath:electronPath,args:[path.join(root,'desktop/main.mjs')],cwd:root,env:{...process.env,DATAHUB_DESKTOP_TEST_MODE:'1'}});
try {
  const page=await app.firstWindow(),mode=page.getByLabel('Heatmap record type',{exact:true});await mode.waitFor();
  await page.getByLabel('Text size',{exact:true}).selectOption('100');
  const business=page.locator('#business-intelligence');await business.locator('svg path').first().waitFor({timeout:60000});
  const businessCount=await business.locator('svg path').count();assert.equal(await business.getByLabel('Business category hierarchy').inputValue(),'all');
  await mode.selectOption('credentials');
  const panel=page.getByRole('region',{name:'Credential Heatmap Builder'}),summary=panel.getByRole('complementary',{name:'Credential alignment summary'});
  await panel.locator('svg path').first().waitFor({timeout:180000});
  assert.equal(await panel.locator('svg path').count(),51);assert.match(await summary.innerText(),/11,456/);
  assert.equal(await panel.getByLabel('Minimum population',{exact:true}).count(),0);assert.equal(await panel.getByText('Business category hierarchy',{exact:true}).count(),0);
  console.log('Native retained view loaded: 51 states/DC; 11,456 accepted credential rows.');
  const native=await page.evaluate(async()=>{const c=await window.cotiveCollector.getRunnerConnection();const response=await fetch(`${c.runnerUrl}/api/credential-heatmap`,{headers:{Authorization:`Bearer ${c.controlToken}`}});const v=await response.json();return {generation:v.generation,rows:v.acceptedCohortRows,states:v.nationalStates.length,sourceObservedAt:v.sourceObservedAt,verifiedAt:v.verifiedAt};});
  await panel.locator('svg path[aria-label^="Minnesota;"]').click();
  await page.waitForFunction(()=>document.querySelector('[aria-label="Credential alignment summary"]')?.textContent.includes('10,899'));
  assert.equal(await panel.getByLabel('Heatmap reported-address state',{exact:true}).inputValue(),'MN');
  await panel.getByLabel('Heatmap credential category',{exact:true}).selectOption('residential-building-contractor');
  await page.waitForFunction(()=>document.querySelector('[aria-label="Credential alignment summary"]')?.textContent.includes('10,374'));
  assert.equal(await panel.locator('svg path').count(),51);assert.match(await summary.innerText(),/90.56%/);
  await panel.screenshot({path:path.join(output,'credential-heatmap-100.png')});
  const svg=panel.getByRole('group',{name:'Reported-address state credential choropleth'});await svg.scrollIntoViewIfNeeded();
  const beforeZoom=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.getZoomFactor());
  const beforeText=await page.getByLabel('Text size',{exact:true}).inputValue();
  const box=await svg.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.keyboard.down('Control');await page.mouse.wheel(0,-300);await page.keyboard.up('Control');
  await panel.getByText('1.2× · Ctrl+scroll',{exact:true}).waitFor();
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.getZoomFactor()),beforeZoom,'Ctrl+wheel must not change Electron page zoom');
  assert.equal(await page.getByLabel('Text size',{exact:true}).inputValue(),beforeText);
  await panel.getByRole('button',{name:'Reset zoom',exact:true}).click();
  await page.getByLabel('Text size',{exact:true}).selectOption('200');
  await panel.scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
  const mapBox=await svg.boundingBox(),summaryBox=await summary.boundingBox();assert.ok(summaryBox.x>=mapBox.x+mapBox.width-2,'Summary stays to the right at desktop 200% text');
  await panel.screenshot({path:path.join(output,'credential-heatmap-200.png')});
  await page.getByRole('button',{name:'Reset text size',exact:true}).click();
  await panel.getByLabel('Heatmap credential category',{exact:true}).selectOption('');await panel.locator('svg path').first().waitFor();
  const wi=panel.locator('svg path[aria-label^="Wisconsin;"]');await wi.focus();await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.querySelector('[aria-label="Heatmap reported-address state"]')?.value==='WI');
  const missing=panel.getByRole('button').filter({hasText:'WI · Missing ZIP'});await missing.waitFor();await missing.click();
  assert.match(await summary.innerText(),/WI · Missing ZIP/);assert.match(await summary.innerText(),/not collection completeness/);
  await panel.getByLabel('Heatmap credential category',{exact:true}).selectOption('construction-contractor-registration');
  await panel.locator('svg path[aria-label*="0 Construction contractor registration credential rows"]').first().waitFor();
  assert.equal(await panel.locator('svg path').count(),51);assert.equal(await summary.getByRole('button',{name:'Clear ZIP selection',exact:true}).count(),0);
  await page.route('**/api/credential-heatmap?*',route=>route.fulfill({json:{available:false,status:'unavailable',generation:99,nationalStates:[],postalGroups:[],summary:null,acceptedCohortRows:null}}));
  await panel.getByRole('button',{name:'Recheck retained evidence',exact:true}).click();await panel.getByText(/Verified evidence is unavailable/).waitFor();assert.equal(await panel.locator('svg path').count(),0);
  await panel.screenshot({path:path.join(output,'credential-heatmap-unavailable.png')});await page.unroute('**/api/credential-heatmap?*');
  await mode.selectOption('business');await business.locator('svg path').first().waitFor({timeout:60000});assert.equal(await business.locator('svg path').count(),businessCount);assert.equal(await business.getByLabel('Business category hierarchy').inputValue(),'all');
  await mode.selectOption('credentials');await panel.locator('svg path').first().waitFor({timeout:60000});assert.equal(await panel.getByLabel('Heatmap reported-address state',{exact:true}).inputValue(),'');assert.equal(await panel.getByLabel('Heatmap credential category',{exact:true}).inputValue(),'');
  console.log(JSON.stringify({status:'passed',native,states:51,mnRows:10899,mnResidentialRows:10374,missingZipVisible:true,zeroCategoryVisible:true,keyboardStateSelection:true,ctrlWheelMapOnly:true,desktop200RightSummary:true,modeReset:true,unavailableMock:true,businessPathsPreserved:businessCount}));
} finally {await app.close();}
