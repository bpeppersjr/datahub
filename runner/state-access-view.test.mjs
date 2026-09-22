import assert from 'node:assert/strict';
import { copyFile, link, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';
import { APP_ROOT } from './paths.mjs';
import { stateAccessView } from './state-access-view.mjs';

const REPORT='data/state-access/reports/20260922160633-d5b0e712-77b3-496c-838c-121d8d30be5f.json';
test('bounded state-access view exposes exact temporal, aggregate, and typed directory evidence',async()=>{
  const construction=await stateAccessView({state:'AL',industry:'construction'});assert.equal(construction.temporalStatus.status,'missing-source-reference');assert.equal(construction.exactBindings.length,construction.temporalStatus.positiveEvidenceItems);assert.equal(construction.annualAggregateContext.referenceYear,2023);assert.equal(construction.annualAggregateContext.zipOrZctaInferencePermitted,false);
  const childcare=await stateAccessView({state:'IA',industry:'childcare'});assert.equal(childcare.exactBindings.length,childcare.temporalStatus.positiveEvidenceItems);assert.ok(childcare.exactBindings.every(row=>row.temporalEvidence.binding.startsWith('exact-')));
  const health=await stateAccessView({state:'MN',industry:'health-care'});assert.equal(health.retainedDirectoryEvidence.length,2);assert.ok(health.retainedDirectoryEvidence.some(row=>row.sourceId==='cms-nursing-home-provider-information'&&row.directoryRows===338));assert.equal(Object.hasOwn(health,'appHandoff'),false);assert.equal(Object.hasOwn(health,'evidence'),false);
});
test('state-access view fails closed on enrolled report drift and invalid selections',async t=>{const root=await mkdtemp(path.join(os.tmpdir(),'state-access-view-'));t.after(()=>rm(root,{recursive:true,force:true}));for(const file of ['config/state-access-ui-enrollment.json',REPORT]){const target=path.join(root,file);await mkdir(path.dirname(target),{recursive:true});await copyFile(path.join(APP_ROOT,file),target);}await writeFile(path.join(root,REPORT),`${await readFile(path.join(root,REPORT),'utf8')} `);await assert.rejects(stateAccessView({root,state:'NY',industry:'retail-consumer'}),/hash changed/);await assert.rejects(stateAccessView({state:'PR',industry:'retail-consumer'}),/outside/);await assert.rejects(stateAccessView({state:'NY',industry:'made-up'}),/outside/);});
test('state-access enrollment rejects a hard-linked report',async t=>{const root=await mkdtemp(path.join(os.tmpdir(),'state-access-link-'));t.after(()=>rm(root,{recursive:true,force:true}));const config=path.join(root,'config/state-access-ui-enrollment.json'),report=path.join(root,REPORT),owner=path.join(root,'owner.json');await mkdir(path.dirname(config),{recursive:true});await mkdir(path.dirname(report),{recursive:true});await copyFile(path.join(APP_ROOT,'config/state-access-ui-enrollment.json'),config);await copyFile(path.join(APP_ROOT,REPORT),owner);await link(owner,report);await assert.rejects(stateAccessView({root,state:'NY',industry:'retail-consumer'}),/independent canonical file/);await unlink(report);});
