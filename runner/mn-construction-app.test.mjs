import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, cp } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { APP_ROOT } from './paths.mjs';
import { validateMnConstructionAppEnrollment } from './mn-construction-app.mjs';
import { loadIndustryConfig, buildIndustryPlan } from './industry-segments.mjs';

const noticePath=path.join(APP_ROOT,'data/business-sources/mn-dli-construction/source-use/4326f062-55dd-4469-9d4b-0631b9eefe67.json');
for(const mode of ['success','tamper','mixed-encoding','held-version','parallel','busy','busy-cancel','invalid','enrollment-drift','http-failure','invalid-utf8','cancel-transfer','cancel-after-commit','late-failure','checkpoint-tamper','failed-cohort-tamper'])test(`MN app lifecycle: ${mode}`,async t=>{
  let notice;try{notice=await readFile(noticePath);}catch(error){if(error.code==='ENOENT'){t.skip('Retained internal notice fixture absent; no fixture is downloaded.');return;}throw error;}
  assert.equal(createHash('sha256').update(notice).digest('hex'),'e7e0f8f7a4c3b9098c8c79fbae18cebd236bdb704e119aeb5673e629170445b8');
  const root=await mkdtemp(path.join(APP_ROOT,'data/tmp/mn-app-test-'));await mkdir(path.join(root,'config/source-policies'),{recursive:true});
  for(const name of ['mn-construction-app-enrollment.json','source-policies/mn-construction-internal-acquisition.json'])await cp(path.join(APP_ROOT,'config',name),path.join(root,'config',name));
  await cp(noticePath,path.join(root,'notice-fixture.json'));
  const child=spawn(process.execPath,['runner/fixtures/mn-construction-app-worker.mjs',mode],{cwd:APP_ROOT,windowsHide:true,env:{...process.env,DATAHUB_ROOT:root,TEMP:root,TMP:root},stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',c=>{output+=c;});child.stderr.on('data',c=>{output+=c;});
  const status=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});assert.equal(status,0,output);assert.equal(JSON.parse(output).status,'PASS');
});
test('MN app enrollment pins and fixed cohort CLIs reject drift and overrides',async()=>{
  const profile=JSON.parse(await readFile(path.join(APP_ROOT,'config/mn-construction-app-enrollment.json'),'utf8'));validateMnConstructionAppEnrollment(profile);
  profile.network_retries++;assert.throws(()=>validateMnConstructionAppEnrollment(profile));
  for(const name of ['build-mn-contractor-registrations.mjs','build-mn-residential-contractors.mjs']){
    const help=execFileSync(process.execPath,[`scripts/${name}`,'--help'],{cwd:APP_ROOT,encoding:'utf8'});assert.match(help,/no AI session required/);
    assert.throws(()=>execFileSync(process.execPath,[`scripts/${name}`,'--url','https://example.com'],{cwd:APP_ROOT,stdio:'pipe'}));
  }
});

test('MN construction industry plan has two distinct fixed scripts without expanding state coverage',async()=>{
  const config=await loadIndustryConfig(),plan=buildIndustryPlan(config,{industries:['construction'],states:['MN','WI']});
  assert.equal(plan.taskCount,2);assert.equal(new Set(plan.tasks.map(task=>task.script)).size,2);
  assert.ok(plan.tasks.every(task=>task.state==='MN' && task.prerequisites.includes('config/mn-construction-app-enrollment.json')));
  assert.ok(plan.gaps.some(gap=>gap.state==='WI'));assert.ok(plan.warnings.some(warning=>warning.includes('no network retries')));
});
