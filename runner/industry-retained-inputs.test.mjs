import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { APP_ROOT } from './paths.mjs';
import { buildIndustryPlan, runIndustryPlan, industryPlanFingerprint } from './industry-segments.mjs';
import { normalizeRetainedInputs, retainedSourceArguments, verifyRetainedPlan } from './industry-retained-inputs.mjs';
import { runCtChildcareAppJobWithTransport } from './ct-childcare-app.mjs';
import { createCtChildcareFixture } from './ct-childcare-test-fixtures.mjs';
import { createManagedOperations } from './managed-operations.mjs';
import { runIaChildcareAppJobWithTransport } from './ia-childcare-app.mjs';
import { IA_CHILDCARE_URLS, IA_CHILDCARE_TEST_CLIENT } from './ia-childcare-acquisition.mjs';
import { IA_CHILDCARE_ACQUIRED_TEST_ROOT } from './ia-childcare-acquired.mjs';

const id = 'state-ct-childcare-centers';
const config = { version: 1, max_concurrency: 1, states: ['CT'], industries: {childcare: [id]}, sources: {
  [id]: {script:'scripts/build-ct-childcare.mjs',scope:'state',states:['CT'],state_filter_supported:false,prerequisites:[]}
}};
const selection = {industries:['childcare'],states:['CT'],sourceIds:[id]};
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const descriptor = {kind:'childcare-acquired-manifest-v1',manifestPath:path.join(APP_ROOT,'data','fixture','manifest.json'),manifestSha256:'a'.repeat(64),appReceiptPath:path.join(APP_ROOT,'data','fixture','receipt.json'),appReceiptSha256:'b'.repeat(64)};

test('retained schema is closed, exact-source bound, and absence preserves legacy plan', () => {
  const legacy = buildIndustryPlan(config, selection);
  assert.deepEqual(buildIndustryPlan(config,{...selection,retainedInputs:undefined,runId:legacy.runId}),legacy);
  assert.equal(Object.hasOwn(legacy,'retainedInputs'),false);
  const retained = buildIndustryPlan(config,{...selection,retainedInputs:{[id]:descriptor}});
  assert.notEqual(industryPlanFingerprint(legacy),industryPlanFingerprint(retained));
  assert.deepEqual(retainedSourceArguments(retained.tasks[0]),['--acquired',descriptor.manifestPath]);
  for (const input of [null,{}, {[id]:{...descriptor,extra:true}}, {[id]:{...descriptor,manifestSha256:'bad'}}, {[id]:{...descriptor,appReceiptPath:APP_ROOT}}, {unknown:descriptor}]) {
    assert.throws(()=>normalizeRetainedInputs(input,[id],config));
  }
  assert.throws(()=>normalizeRetainedInputs({[id]:descriptor},undefined,config));
  assert.throws(()=>normalizeRetainedInputs({[id]:descriptor},[],config));
  const getter={};Object.defineProperty(getter,id,{enumerable:true,get(){assert.fail('getter executed');}});
  assert.throws(()=>normalizeRetainedInputs(getter,[id],config));
  for(const state of ['pa','ct','md','vt','co','ia']) {
    const sourceId=`state-${state}-childcare-centers`,stateConfig={sources:{[sourceId]:{script:`scripts/build-${state}-childcare.mjs`,scope:'state',states:[state.toUpperCase()],state_filter_supported:false,prerequisites:[]}}};
    assert.deepEqual(normalizeRetainedInputs({[sourceId]:descriptor},[sourceId],stateConfig)[sourceId],descriptor);
    const fullConfig={version:1,max_concurrency:1,states:[state.toUpperCase()],industries:{childcare:[sourceId]},...stateConfig};
    const dispatch=buildIndustryPlan(fullConfig,{industries:['childcare'],states:[state.toUpperCase()],sourceIds:[sourceId],retainedInputs:{[sourceId]:descriptor}}).tasks[0];
    assert.equal(dispatch.script,`scripts/build-${state}-childcare.mjs`);
    assert.deepEqual(retainedSourceArguments(dispatch),['--acquired',descriptor.manifestPath]);
    assert.throws(()=>normalizeRetainedInputs({[sourceId]:descriptor},[sourceId],{sources:{[sourceId]:{...stateConfig.sources[sourceId],script:'scripts/other.mjs'}}}));
  }
});

test('Iowa nonnested acquisition is bound by explicit verified app receipt', async t => {
  await mkdir(path.join(APP_ROOT,'data/tmp'),{recursive:true});
  const root=await mkdtemp(path.join(APP_ROOT,'data/tmp/retained-feed-ia-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const result=await runIaChildcareAppJobWithTransport({outputRoot:root,fetchImpl:async url=>new Response(url===IA_CHILDCARE_URLS.client?IA_CHILDCARE_TEST_CLIENT:JSON.stringify([{businessType:'building',businessName:'Synthetic Center',address:'1 Test St',city:'Test',zipCode:50301,latitude:41,longitude:-93,referral:true}]))});
  const acquiredDirectory=path.dirname(result.receipt.acquired.manifest_path);
  assert.equal(path.dirname(acquiredDirectory),IA_CHILDCARE_ACQUIRED_TEST_ROOT);
  t.after(()=>rm(acquiredDirectory,{recursive:true,force:true}));
  const sourceId='state-ia-childcare-centers', iaConfig={version:1,max_concurrency:1,states:['IA'],industries:{childcare:[sourceId]},sources:{[sourceId]:{scope:'state',states:['IA'],script:'scripts/build-ia-childcare.mjs',state_filter_supported:false,prerequisites:[]}}};
  const input={kind:descriptor.kind,manifestPath:result.receipt.acquired.manifest_path,manifestSha256:result.receipt.acquired.manifest_sha256,appReceiptPath:result.receiptPath,appReceiptSha256:sha(await readFile(result.receiptPath))};
  const plan=buildIndustryPlan(iaConfig,{industries:['childcare'],states:['IA'],sourceIds:[sourceId],retainedInputs:{[sourceId]:input}});
  const oldFetch=globalThis.fetch;globalThis.fetch=()=>assert.fail('no source access');
  try {await verifyRetainedPlan(plan);} finally {globalThis.fetch=oldFetch;}
});

test('retained CT app chain verifies locally and generic/managed forwarding is pinned', async t => {
  await mkdir(path.join(APP_ROOT,'data/tmp'),{recursive:true});
  const root=await mkdtemp(path.join(APP_ROOT,'data/tmp/retained-feed-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const fixture=createCtChildcareFixture();
  const original=await runCtChildcareAppJobWithTransport({outputRoot:path.join(root,'original'),fetchImpl:fixture.fetchImpl});
  const input={kind:descriptor.kind,manifestPath:original.receipt.acquired.manifest_path,manifestSha256:original.receipt.acquired.manifest_sha256,
    appReceiptPath:original.receiptPath,appReceiptSha256:sha(await readFile(original.receiptPath))};
  const selected={...selection,retainedInputs:{[id]:input}};
  const before=await readFile(input.manifestPath), oldFetch=globalThis.fetch;
  globalThis.fetch=()=>assert.fail('retained feed must not fetch');
  t.after(()=>{globalThis.fetch=oldFetch;});
  const plan=buildIndustryPlan(config,selected); await verifyRetainedPlan(plan);
  let launches=0;
  const result=await runIndustryPlan(config,plan,{outputRoot:path.join(root,'run'),executor:async task=>{
    launches++;assert.deepEqual(task.retainedInput,input);return {code:0};
  }});
  assert.equal(result.receipt.status,'succeeded');assert.equal(launches,1);
  assert.deepEqual(result.receipt.tasks[0].retained_input,input);
  // Real supervisor CLI and source CLI, using only the synthetic retained chain.
  const fixtureConfig=path.join(root,'config.json');await writeFile(fixtureConfig,JSON.stringify(config));
  const cliRun=`retained-cli-${path.basename(root)}`;
  t.after(()=>rm(path.join(APP_ROOT,'data/industry-segments/runs',cliRun),{recursive:true,force:true}));
  const cli=await promisify(execFile)(process.execPath,['scripts/run-industry-segments.mjs','run','--config',fixtureConfig,
    '--run-id',cliRun,'--industry','childcare','--state','CT','--sources',id,'--retained-inputs-json',JSON.stringify({[id]:input})],{cwd:APP_ROOT,
      env:{...process.env,NODE_OPTIONS:`--import=${pathToFileURL(path.join(APP_ROOT,'runner/fixtures/retained-feed-no-network.mjs')).href}`}});
  assert.equal(JSON.parse(cli.stdout).status,'succeeded');
  const cliReceipt=JSON.parse(await readFile(path.join(APP_ROOT,'data/industry-segments/runs',cliRun,'receipt.json')));
  assert.equal(cliReceipt.tasks[0].retained_verification.execution_mode,'retained-local-verification');
  const service=createManagedOperations({root:path.join(root,'managed'),configLoader:async()=>config,verifyChildReceipts:false,executor:async ({args})=>{
    assert.deepEqual(JSON.parse(args[args.indexOf('--retained-inputs-json')+1]),{[id]:input});
    assert.ok(args.includes('--expected-plan-sha256'));return {code:0};
  }});
  t.after(()=>service.close());
  await service.plan(selected);const op=await service.startCollection(selected);await service.running.get(op.id)?.done;
  assert.equal((await service.get(op.id)).status,'SUCCEEDED');
  const aborted=await runIndustryPlan(config,plan,{outputRoot:path.join(root,'aborted'),signal:AbortSignal.abort(),executor:async()=>assert.fail('aborted launch')});
  assert.equal(aborted.receipt.status,'cancelled');
  assert.equal(aborted.receipt.source_locks,undefined);
  assert.ok(aborted.receipt.tasks.every(task=>task.status==='cancelled'));
  const changed=await runIndustryPlan(config,plan,{outputRoot:path.join(root,'changed-during-child'),executor:async()=>{
    await writeFile(input.manifestPath,Buffer.concat([before,Buffer.from(' ')]));return {code:0};
  }});
  assert.equal(changed.receipt.status,'failed');
  await writeFile(input.manifestPath,before);
  const md='state-md-childcare-centers',mdConfig={...config,states:['MD'],industries:{childcare:[md]},sources:{[md]:{...config.sources[id],script:'scripts/build-md-childcare.mjs',states:['MD']}}};
  await assert.rejects(verifyRetainedPlan(buildIndustryPlan(mdConfig,{industries:['childcare'],states:['MD'],sourceIds:[md],retainedInputs:{[md]:input}})));
  await writeFile(input.manifestPath,Buffer.concat([before,Buffer.from(' ')]));
  await assert.rejects(verifyRetainedPlan(plan));
  const rejected=await runIndustryPlan(config,plan,{outputRoot:path.join(root,'rejected'),executor:async()=>{assert.fail('invalid pin launched');}});
  assert.equal(rejected.receipt.status,'failed');
  await writeFile(input.manifestPath,before);
  await assert.rejects(verifyRetainedPlan(buildIndustryPlan(config,{...selection,retainedInputs:{[id]:{...input,appReceiptSha256:'0'.repeat(64)}}})));
});
