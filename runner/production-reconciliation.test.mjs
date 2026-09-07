import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { APP_ROOT } from './paths.mjs';
import { planProductionReconciliation, runProductionReconciliation, requestProductionReconciliationStop } from './production-reconciliation.mjs';
import { buildMaChildcareRelease } from './ma-childcare-release.mjs';
import { buildNjChildcareRelease } from './nj-childcare-release.mjs';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const scripts = ['build-business-registry', 'verify-business-registry', 'build-business-entity-resolution', 'verify-business-entity-resolution', 'build-entity-resolution-benchmark', 'verify-entity-resolution-benchmark', 'build-national-business-coverage-views', 'verify-national-business-coverage-views'];
const outputs = { registry: 'data/business-registry', resolution: 'data/business-entity-resolution', benchmark: 'data/business-entity-resolution-benchmark', coverage: 'data/business-coverage-views' };
const datasets = { registry: 'national-business-registry', resolution: 'national-business-entity-resolution', benchmark: 'national-business-entity-resolution-benchmark', coverage: 'national-business-coverage-views' };
async function json(file, value) { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, `${JSON.stringify(value)}\n`); }
async function release(root, directory, dataset, id, extra = {}) {
  await json(path.join(root, directory, 'releases', id, 'manifest.json'), { dataset_id: dataset, release_id: id, status: 'published-partial', artifacts: [], ...extra });
  await json(path.join(root, directory, 'current.json'), { dataset_id: dataset, release_id: id, manifest: `releases/${id}/manifest.json` });
}
async function dependency(root, pointer) {
  const file = path.resolve(root, pointer), p = JSON.parse(await readFile(file));
  const bytes = await readFile(path.resolve(path.dirname(file), p.manifest)), m = JSON.parse(bytes);
  return { dataset_id: m.dataset_id, release_id: m.release_id, manifest_sha256: sha(bytes) };
}
async function fixture(t) {
  const temp = path.join(APP_ROOT, 'data/tmp'); await mkdir(temp, { recursive: true });
  const root = await mkdtemp(path.join(temp, 'production-chain-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const definitionFile = 'config/migrations/normalized-us-postal-fields-v1.json';
  await mkdir(path.join(root, 'config/migrations'), { recursive: true });
  await copyFile(path.join(APP_ROOT, definitionFile), path.join(root, definitionFile));
  const definition = JSON.parse(await readFile(path.join(root, definitionFile)));
  for (const source of definition.sources) {
    await json(path.join(root, source.connector_config), { id: source.source_key, version: source.minimum_connector_version });
    await release(root, path.dirname(source.pointer), source.dataset_id, `fixture-${source.source_key}`);
  }
  for (const [directory, dataset] of [['data/geography', 'us-census-geography'], ['data/zcta-jurisdiction-crosswalk', 'us-census-zcta-jurisdiction-crosswalk'], ['data/business-baselines/census-nonemployer', 'census-nonemployer-baseline'], ['data/business-baselines/census-zbp', 'census-zbp-baseline']]) await release(root, directory, dataset, `fixture-${dataset}`);
  for (const [key, directory] of Object.entries(outputs)) await release(root, directory, datasets[key], `previous-${key}`);
  for (const script of scripts) { const file = path.join(root, 'scripts', `${script}.mjs`); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, '// Fixture exits zero but emits no release.\n'); }
  for (const implementation of ['business-registry', 'business-entity-resolution', 'entity-resolution-benchmark', 'national-business-coverage-views']) { const file = path.join(root, 'runner', `${implementation}.mjs`); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, '// Fixture implementation.\n'); }
  const readinessInspector = async (options) => {
    assert.equal(options.useCandidatePointers, false);
    const sources = [];
    for (const source of definition.sources) {
      const pointer = path.join(root, source.pointer), p = JSON.parse(await readFile(pointer)), manifest = path.resolve(path.dirname(pointer), p.manifest);
      sources.push({ source_key: source.source_key, dataset_id: source.dataset_id, pointer, manifest, current_release_id: p.release_id, pointer_sha256: sha(await readFile(pointer)), manifest_sha256: sha(await readFile(manifest)), connector_config_sha256: sha(await readFile(path.join(root, source.connector_config))), status: 'ready', pointer_scope: 'production' });
    }
    return { ready_for_registry_2_10: true, plan_sha256: sha(JSON.stringify(sources)), counts: { total: 25, ready: 25, blocked: 0, rebuild_required: 0, candidate_pointers_used: 0 }, sources };
  };
  return { root, definition, readinessInspector };
}
async function executeFixture(f, stage, { logPath, onSpawn }) {
  await writeFile(logPath, `${stage.id}\n`); await onSpawn(process.pid);
  if (stage.kind !== 'build') return { exitCode: 0 };
  const value = (flag) => stage.args[stage.args.indexOf(flag) + 1], key = stage.id.split('-')[0];
  let extra;
  if (key === 'registry') {
    extra = { dependencies: await Promise.all(f.definition.sources.map((s) => dependency(f.root, s.pointer))) };
    for(const flag of ['--ma-childcare','--nj-childcare'])if(stage.args.includes(flag)){const bytes=await readFile(path.resolve(f.root,value(flag))), m=JSON.parse(bytes);extra.dependencies.push({dataset_id:m.dataset_id,release_id:m.release_id,manifest_sha256:sha(bytes)});}
  }
  if (key === 'resolution') extra = { dependency: await dependency(f.root, value('--registry')) };
  if (key === 'benchmark') extra = { status: 'awaiting-independent-labels', dependencies: { registry: await dependency(f.root, value('--registry')), resolution: await dependency(f.root, value('--resolution')) } };
  if (key === 'coverage') extra = { dependencies: await Promise.all(['--registry', '--resolution', '--benchmark', '--geography', '--crosswalk', '--nonemployer'].map((flag) => dependency(f.root, value(flag)))) };
  await release(f.root, value('--output'), datasets[key], `fresh-${key}`, extra);
  return { exitCode: 0 };
}

test('production plan pins 25 production sources, four old outputs, and fixed local-only stages without writes', async (t) => {
  const f = await fixture(t), plan = await planProductionReconciliation({ ...f, runId: 'plan-proof' });
  assert.equal(plan.mode, 'production'); assert.equal(plan.sourcePins.length, 25); assert.equal(plan.stages.length, 8);
  assert.equal(plan.stages[0].args.filter((v) => v.endsWith('current.json')).length, 25);
  for (const stage of plan.stages.filter((s) => s.kind === 'build')) assert.equal(stage.args[stage.args.indexOf('--output') + 1], outputs[stage.id.split('-')[0]]);
  await assert.rejects(readdir(path.join(f.root, 'data/reconciliations/production-runs/plan-proof')), /ENOENT/);
});
test('production rejects candidate evidence before launch', async (t) => {
  const f = await fixture(t);
  await assert.rejects(planProductionReconciliation({ ...f, readinessInspector: async (options) => { const report = await f.readinessInspector(options); report.sources[0].pointer_scope = 'candidate'; return report; } }), /production|scope|ready/i);
});
test('production executes ordered local chain and persists release and log evidence', async (t) => {
  const f = await fixture(t), plan = await planProductionReconciliation({ ...f, runId: 'success-proof' }), calls = [];
  const result = await runProductionReconciliation(plan, { ...f, executor: async (stage, context) => { calls.push(stage.id); return executeFixture(f, stage, context); } });
  assert.equal(result.receipt.status, 'SUCCEEDED'); assert.deepEqual(calls, plan.stages.map((s) => s.id));
  assert.deepEqual(JSON.parse(await readFile(result.receiptPath)), result.receipt);
  for (const stage of result.receipt.stages) assert.match(stage.log.sha256, /^[a-f0-9]{64}$/);
  for (const [key, directory] of Object.entries(outputs)) assert.equal(JSON.parse(await readFile(path.join(f.root, directory, 'current.json'))).release_id, `fresh-${key}`);
});
test('production real child cannot pass by leaving an old valid pointer unchanged', async (t) => {
  const f = await fixture(t), plan = await planProductionReconciliation({ ...f, runId: 'old-pointer-proof' });
  const result = await runProductionReconciliation(plan, f);
  assert.equal(result.receipt.status, 'FAILED'); assert.equal(result.receipt.stages[0].exitCode, 0);
  assert.ok(result.receipt.stages.slice(1).every((s) => s.status === 'SKIPPED'));
});
test('production verifier failure stops before dependent builds without deleting retained old releases', async (t) => {
  const f = await fixture(t), plan = await planProductionReconciliation({ ...f, runId: 'failure-proof' }), calls = [];
  const result = await runProductionReconciliation(plan, { ...f, executor: async (stage, context) => { calls.push(stage.id); await executeFixture(f, stage, context); return { exitCode: stage.id === 'registry-verify' ? 8 : 0 }; } });
  assert.equal(result.receipt.status, 'FAILED'); assert.deepEqual(calls, ['registry-build', 'registry-verify']);
  assert.equal(JSON.parse(await readFile(path.join(f.root, outputs.registry, 'releases/previous-registry/manifest.json'))).release_id, 'previous-registry');
});
test('production stage-boundary cancellation finishes current stage but launches no next stage', async (t) => {
  const f = await fixture(t), plan = await planProductionReconciliation({ ...f, runId: 'stop-proof' }), controller = new AbortController(), calls = [];
  const result = await runProductionReconciliation(plan, { ...f, signal: controller.signal, executor: async (stage, context) => { calls.push(stage.id); controller.abort(); return executeFixture(f, stage, context); } });
  assert.equal(result.receipt.status, 'STOPPED'); assert.deepEqual(calls, ['registry-build']);
});
test('production refuses changed source, implementation, or output before executing', async (t) => {
  for (const kind of ['source', 'implementation', 'output']) {
    const f = await fixture(t), plan = await planProductionReconciliation({ ...f, runId: `drift-${kind}` }); let calls = 0;
    const target = kind === 'source' ? f.definition.sources[0].pointer : kind === 'implementation' ? 'runner/business-registry.mjs' : `${outputs.coverage}/current.json`;
    await writeFile(path.join(f.root, target), '{}\n');
    await assert.rejects(runProductionReconciliation(plan, { ...f, executor: () => { calls += 1; } })); assert.equal(calls, 0);
  }
});
test('production shares candidate lock and never steals stale-looking ownership', async (t) => {
  const f = await fixture(t), plan = await planProductionReconciliation({ ...f, runId: 'lock-proof' });
  const lock = path.join(f.root, 'data/reconciliations/controller.lock'); await json(lock, { pid: 99999999, runId: 'retained-owner' });
  await assert.rejects(runProductionReconciliation(plan, { ...f, executor: () => assert.fail('duplicate launch') }), /lock|owns|controller/i);
  assert.equal(JSON.parse(await readFile(lock)).runId, 'retained-owner');
});
test('production refuses junctioned output before any writes to its destination', async (t) => {
  const f = await fixture(t), plan = await planProductionReconciliation({ ...f, runId: 'link-proof' });
  const other = path.join(f.root, 'redirected'); await mkdir(other);
  await mkdir(path.join(f.root, 'data/reconciliations'), { recursive: true });
  await symlink(other, path.join(f.root, 'data/reconciliations/production-runs'), 'junction');
  await assert.rejects(runProductionReconciliation(plan, { ...f, executor: () => assert.fail('linked launch') }), /link|junction/i);
  assert.deepEqual(await readdir(other), []);
});

test('production rejects freshly published registry with wrong source lineage', async (t) => {
  const f = await fixture(t), plan = await planProductionReconciliation({ ...f, runId: 'lineage-proof' }), calls = [];
  const result = await runProductionReconciliation(plan, { ...f, executor: async (stage, context) => {
    calls.push(stage.id); await executeFixture(f, stage, context);
    const file = path.join(f.root, outputs.registry, 'releases/fresh-registry/manifest.json'), manifest = JSON.parse(await readFile(file));
    manifest.dependencies[0].manifest_sha256 = '0'.repeat(64); await json(file, manifest);
    return { exitCode: 0 };
  } });
  assert.equal(result.receipt.status, 'FAILED'); assert.deepEqual(calls, ['registry-build']);
});
test('production detects source mutation during child execution', async (t) => {
  const f = await fixture(t), plan = await planProductionReconciliation({ ...f, runId: 'source-midrun-proof' }), calls = [];
  const result = await runProductionReconciliation(plan, { ...f, executor: async (stage, context) => {
    calls.push(stage.id); await executeFixture(f, stage, context);
    await writeFile(path.join(f.root, f.definition.sources[0].pointer), '{}\n'); return { exitCode: 0 };
  } });
  assert.equal(result.receipt.status, 'FAILED'); assert.deepEqual(calls, ['registry-build']);
});
test('production detects publication mutation during independent verification', async (t) => {
  const f = await fixture(t), plan = await planProductionReconciliation({ ...f, runId: 'verify-drift-proof' }), calls = [];
  const result = await runProductionReconciliation(plan, { ...f, executor: async (stage, context) => {
    calls.push(stage.id); await executeFixture(f, stage, context);
    if (stage.id === 'registry-verify') await writeFile(path.join(f.root, outputs.registry, 'current.json'), '{}\n');
    return { exitCode: 0 };
  } });
  assert.equal(result.receipt.status, 'FAILED'); assert.deepEqual(calls, ['registry-build', 'registry-verify']);
});
test('production never overwrites or resumes an existing run receipt', async (t) => {
  const f = await fixture(t), plan = await planProductionReconciliation({ ...f, runId: 'existing-proof' });
  const result = await runProductionReconciliation(plan, { ...f, executor: async (stage, context) => { await writeFile(context.logPath, 'failed\n'); return { exitCode: 7 }; } });
  const before = await readFile(result.receiptPath);
  await assert.rejects(runProductionReconciliation(plan, { ...f, executor: () => assert.fail('must not resume') }), /exist|already|run/i);
  assert.deepEqual(await readFile(result.receiptPath), before);
});
test('production rejects canonical pointer redirected to an isolated candidate manifest', async (t) => {
  const f = await fixture(t), source = f.definition.sources[0];
  const pointerPath = path.join(f.root, source.pointer), pointer = JSON.parse(await readFile(pointerPath));
  const copied = path.join(f.root, 'data/isolated/release/manifest.json');
  await mkdir(path.dirname(copied), { recursive: true }); await copyFile(path.resolve(path.dirname(pointerPath), pointer.manifest), copied);
  pointer.manifest = path.relative(path.dirname(pointerPath), copied); await json(pointerPath, pointer);
  await assert.rejects(planProductionReconciliation({ ...f, runId: 'candidate-pointer-proof' }), /manifest|release|production|canonical/i);
});
test('production rejects unpinned registry dependency but permits inherited source dependencies', async (t) => {
  for (const unexpected of [false, true]) {
    const f = await fixture(t), source = f.definition.sources[0], p = JSON.parse(await readFile(path.join(f.root, source.pointer)));
    const manifestPath = path.resolve(f.root, path.dirname(source.pointer), p.manifest), m = JSON.parse(await readFile(manifestPath));
    const inherited = await dependency(f.root, 'data/geography/current.json'); m.dependencies = [inherited, inherited]; await json(manifestPath, m);
    const plan = await planProductionReconciliation({ ...f, runId: `inherited-${unexpected}` });
    const result = await runProductionReconciliation(plan, { ...f, executor: async (stage, context) => {
      await executeFixture(f, stage, context);
      if (stage.id === 'registry-build') {
        const file = path.join(f.root, outputs.registry, 'releases/fresh-registry/manifest.json'), emitted = JSON.parse(await readFile(file));
        emitted.dependencies.push(inherited, inherited);
        if (unexpected) emitted.dependencies.push({ ...inherited, dataset_id: 'unplanned-source' });
        await json(file, emitted);
      }
      return { exitCode: 0 };
    } });
    assert.equal(result.receipt.status, unexpected ? 'FAILED' : 'SUCCEEDED');
  }
});

test('production durable stop is visible while a child runs and prevents next stage', async (t) => {
  const f = await fixture(t), plan = await planProductionReconciliation({ ...f, runId: 'durable-stop-proof' });
  let started, finish; const begun = new Promise((resolve) => { started = resolve; }), gate = new Promise((resolve) => { finish = resolve; });
  const running = runProductionReconciliation(plan, { ...f, executor: async (stage, context) => {
    await executeFixture(f, stage, context); started(); await gate; return { exitCode: 0 };
  } });
  await begun;
  try {
    await requestProductionReconciliationStop({ root: f.root, runId: plan.runId });
    const receiptPath = path.join(f.root, plan.outputRoot, 'receipt.json');
    let visible = false;
    for (let attempt = 0; attempt < 80; attempt++) {
      const receipt = JSON.parse(await readFile(receiptPath));
      if (receipt.stopRequested) { visible = true; assert.equal(receipt.status, 'RUNNING'); break; }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.equal(visible, true);
  } finally { finish(); }
  const result = await running; assert.equal(result.receipt.status, 'STOPPED');
  assert.ok(result.receipt.stages.slice(1).every((s) => s.status === 'SKIPPED'));
});

test('production stop refuses missing run and escaping run IDs', async (t) => {
  const f = await fixture(t);
  await assert.rejects(requestProductionReconciliationStop({ root: f.root, runId: 'missing' }));
  await assert.rejects(requestProductionReconciliationStop({ root: f.root, runId: '../outside' }));
});

async function historicalBenchmarkFailure(t) {
  const f=await fixture(t), original=await planProductionReconciliation({...f,runId:'historical-failure'});
  const manifestPath=path.join(f.root,outputs.benchmark,'releases/fresh-benchmark/manifest.json');
  const result=await runProductionReconciliation(original,{...f,executor:async(stage,context)=>{
    await executeFixture(f,stage,context);
    // Simulate the old classifier rejecting this sample, then restore its real status below.
    if(stage.id==='benchmark-build'){const manifest=JSON.parse(await readFile(manifestPath));manifest.status='draft';await json(manifestPath,manifest);}
    return {exitCode:0};
  }});
  assert.equal(result.receipt.status,'FAILED');assert.equal(result.receipt.stages[4].exitCode,0);
  const manifest=JSON.parse(await readFile(manifestPath));manifest.status='awaiting-independent-labels';await json(manifestPath,manifest);
  const logPath=path.join(f.root,original.outputRoot,'benchmark-build.log');
  const log=`Completed fixture sample.\n${JSON.stringify({release_id:'fresh-benchmark',manifest:manifestPath,status:manifest.status},null,2)}\n`;
  await writeFile(logPath,log);result.receipt.stages[4].log={path:'benchmark-build.log',sha256:sha(log),bytes:Buffer.byteLength(log)};
  await json(result.receiptPath,result.receipt);
  return {...f,original,receiptPath:result.receiptPath};
}

test('benchmark status recovery executes only remaining local stages and preserves failed evidence',async(t)=>{
  const f=await historicalBenchmarkFailure(t), before=await readFile(f.receiptPath);
  const plan=await planProductionReconciliation({...f,runId:'recovery',recoverBenchmarkFrom:f.original.runId});
  assert.deepEqual(plan.stages.map(s=>s.id),['benchmark-verify','coverage-build','coverage-verify']);
  assert.equal(plan.recovery.evidencePins.length,7);assert.equal(plan.recovery.independentLabelGatePassed,false);
  const calls=[];const result=await runProductionReconciliation(plan,{...f,executor:async(s,c)=>{calls.push(s.id);return executeFixture(f,s,c);}});
  assert.equal(result.receipt.status,'SUCCEEDED');assert.deepEqual(calls,plan.stages.map(s=>s.id));
  assert.deepEqual(await readFile(f.receiptPath),before);assert.deepEqual(result.receipt.recovery,plan.recovery);
});

test('benchmark recovery rejects changed origins, source pins and unrelated compatible samples',async(t)=>{
  for(const mutation of ['receipt','log','source','benchmark','coverage','skipped']){
    const f=await historicalBenchmarkFailure(t);
    if(mutation==='receipt'||mutation==='skipped'){const r=JSON.parse(await readFile(f.receiptPath));if(mutation==='receipt')r.stages[1].exitCode=8;else r.stages[5].pid=123;await json(f.receiptPath,r);}
    if(mutation==='log')await writeFile(path.join(f.root,f.original.outputRoot,'benchmark-build.log'),'altered');
    if(mutation==='source')await writeFile(path.join(f.root,f.definition.sources[0].connector_config),'{}');
    if(mutation==='benchmark'){const m=JSON.parse(await readFile(path.join(f.root,outputs.benchmark,'releases/fresh-benchmark/manifest.json')));await release(f.root,outputs.benchmark,datasets.benchmark,'unrelated-benchmark',{...m,release_id:'unrelated-benchmark'});}
    if(mutation==='coverage')await release(f.root,outputs.coverage,datasets.coverage,'unrelated-coverage');
    await assert.rejects(planProductionReconciliation({...f,runId:`reject-${mutation}`,recoverBenchmarkFrom:f.original.runId}));
  }
});

test('benchmark recovery rejects evidence drift after planning and excludes locked execution',async(t)=>{
  for(const mutation of ['receipt','lock']){
    const f=await historicalBenchmarkFailure(t),plan=await planProductionReconciliation({...f,runId:`recovery-${mutation}`,recoverBenchmarkFrom:f.original.runId});
    if(mutation==='receipt')await writeFile(f.receiptPath,'{}');
    else await json(path.join(f.root,'data/reconciliations/controller.lock'),{pid:99999999,runId:'other'});
    await assert.rejects(runProductionReconciliation(plan,{...f,executor:()=>assert.fail('must not launch')}));
  }
});

test('benchmark recovery does not build coverage after verification failure or pre-cancellation',async(t)=>{
  for(const cancelled of [false,true]){
    const f=await historicalBenchmarkFailure(t),plan=await planProductionReconciliation({...f,runId:`recovery-stop-${cancelled}`,recoverBenchmarkFrom:f.original.runId}),calls=[];
    const result=await runProductionReconciliation(plan,{...f,signal:cancelled?AbortSignal.abort():undefined,executor:async(s,c)=>{calls.push(s.id);await writeFile(c.logPath,'verification failed');return {exitCode:3};}});
    assert.equal(result.receipt.status,cancelled?'STOPPED':'FAILED');assert.deepEqual(calls,cancelled?[]:['benchmark-verify']);
  }
});

test('benchmark recovery detects historical evidence mutation during verification before coverage',async(t)=>{
  const f=await historicalBenchmarkFailure(t),plan=await planProductionReconciliation({...f,runId:'recovery-midrun',recoverBenchmarkFrom:f.original.runId}),calls=[];
  const result=await runProductionReconciliation(plan,{...f,executor:async(s,c)=>{
    calls.push(s.id);await executeFixture(f,s,c);await writeFile(f.receiptPath,'{}');return {exitCode:0};
  }});
  assert.equal(result.receipt.status,'FAILED');assert.deepEqual(calls,['benchmark-verify']);assert.match(result.receipt.error,/Pinned input or output changed/);
});

async function childcareFixture(f, prefixes=['ma','nj']) {
  const selected={};
  for(const prefix of prefixes){
    // Reuse the real subprocess fixture transport without leaving global fetch changed.
    const original=globalThis.fetch; let fetchImpl;
    try{await import(`${pathToFileURL(path.join(APP_ROOT,`runner/fixtures/${prefix}-childcare-fetch.mjs`)).href}?test=${randomUUID()}`);fetchImpl=globalThis.fetch;}finally{globalThis.fetch=original;}
    const result=await (prefix==='ma'?buildMaChildcareRelease:buildNjChildcareRelease)({outputRoot:path.join(f.root,`data/childcare-${prefix}`),fetchImpl,sleep:async()=>{},now:()=>new Date('2026-09-07T20:00:00.000Z')});
    selected[`${prefix}Childcare`]=result.manifest_path;
    const dataset=prefix==='ma'?'ma-licensed-center-based-childcare':'nj-licensed-childcare-centers';
    const policy=prefix==='ma'?'massgis-eec-childcare-local-review':'njdep-childcare-local-review';
    const files=[`config/connectors/${dataset}.json`,`config/source-policies/${policy}.json`,...['registry-input','registry-adapter','release','normalization','preflight','acquisition',...(prefix==='nj'?['metadata']:[])].map(s=>`runner/${prefix}-childcare-${s}.mjs`)];
    for(const file of files){await mkdir(path.dirname(path.join(f.root,file)),{recursive:true});await copyFile(path.join(APP_ROOT,file),path.join(f.root,file));}
  }
  for(const file of ['childcare-geographic-evidence','normalized-us-postal-code','source-http-guards','paths'])await copyFile(path.join(APP_ROOT,`runner/${file}.mjs`),path.join(f.root,`runner/${file}.mjs`));
  return selected;
}

test('production independently verifies explicit childcare manifests while keeping migration cohort at 25',async(t)=>{
  const f=await fixture(t), selected=await childcareFixture(f), plan=await planProductionReconciliation({...f,...selected,runId:'childcare-proof'});
  assert.equal(plan.sourcePins.length,25);assert.equal(plan.optionalSourcePins.length,2);
  assert.deepEqual(plan.optionalSourcePins.map(p=>p.sourceKey),['maChildcare','njChildcare']);
  for(const p of plan.optionalSourcePins){assert.ok(p.artifacts.length>=4);assert.equal(p.configurationPins.length,2);assert.ok(plan.stages[0].args.includes(p.manifestPath));}
  assert.ok(plan.implementationPins.some(p=>p.path==='runner/childcare-geographic-evidence.mjs'));
  const result=await runProductionReconciliation(plan,{...f,executor:(s,c)=>executeFixture(f,s,c)});
  assert.equal(result.receipt.status,'SUCCEEDED');
  const emitted=JSON.parse(await readFile(path.join(f.root,outputs.registry,'releases/fresh-registry/manifest.json')));
  assert.equal(emitted.dependencies.length,27);
});

test('production childcare rejects pointer, staging, wrong dataset and duplicate selection values',async(t)=>{
  const f=await fixture(t), selected=await childcareFixture(f,['ma']);
  for(const maChildcare of ['',null,[selected.maChildcare,selected.maChildcare],path.join(f.root,'data/childcare-ma/current.json')])await assert.rejects(planProductionReconciliation({...f,maChildcare}));
  await assert.rejects(planProductionReconciliation({...f,njChildcare:selected.maChildcare}));
  const staging=path.join(f.root,'data/childcare-ma/.staging/copied/manifest.json');await mkdir(path.dirname(staging),{recursive:true});await copyFile(selected.maChildcare,staging);
  await assert.rejects(planProductionReconciliation({...f,maChildcare:staging}),/immutable|staging/);
});

test('production childcare pins refuse artifact and implementation drift before launch',async(t)=>{
  for(const kind of ['artifact','implementation','policy']){
    const f=await fixture(t), selected=await childcareFixture(f,['ma']), plan=await planProductionReconciliation({...f,...selected,runId:`childcare-drift-${kind}`});
    const target=kind==='artifact'?plan.optionalSourcePins[0].artifacts[0].path:kind==='policy'?plan.optionalSourcePins[0].configurationPins[1].path:'runner/ma-childcare-registry-adapter.mjs';
    await writeFile(path.join(f.root,target),'changed');
    await assert.rejects(runProductionReconciliation(plan,{...f,executor:()=>assert.fail('must not launch')}));
  }
});

test('production rejects extra missing or duplicate emitted childcare dependencies',async(t)=>{
  for(const kind of ['missing','duplicate','wronghash']){
    const f=await fixture(t), selected=await childcareFixture(f,['ma']),plan=await planProductionReconciliation({...f,...selected,runId:`childcare-dep-${kind}`}),calls=[];
    const result=await runProductionReconciliation(plan,{...f,executor:async(s,c)=>{
      calls.push(s.id);await executeFixture(f,s,c);
      const file=path.join(f.root,outputs.registry,'releases/fresh-registry/manifest.json'),manifest=JSON.parse(await readFile(file));
      if(kind==='missing')manifest.dependencies.pop();else if(kind==='duplicate')manifest.dependencies.push(manifest.dependencies.at(-1));else manifest.dependencies.at(-1).manifest_sha256='0'.repeat(64);
      await json(file,manifest);return {exitCode:0};
    }});
    assert.equal(result.receipt.status,'FAILED');assert.deepEqual(calls,['registry-build']);
  }
});

test('production refuses rehashed optional-input tampering and adding childcare to historical recovery',async(t)=>{
  const f=await historicalBenchmarkFailure(t),selected=await childcareFixture(f,['ma']);
  await assert.rejects(planProductionReconciliation({...f,...selected,runId:'incompatible-childcare-recovery',recoverBenchmarkFrom:f.original.runId}),/childcare inputs/);
  const plan=await planProductionReconciliation({...f,...selected,runId:'duplicate-childcare'});
  plan.optionalSourcePins.push(structuredClone(plan.optionalSourcePins[0]));
  delete plan.planSha256;plan.planSha256=sha(JSON.stringify(plan));
  await assert.rejects(runProductionReconciliation(plan,{...f,executor:()=>assert.fail('must not launch')}),/cohort/);
});

test('production CLI rejects repeated or non-plan childcare options without planning or launching',()=>{
  for(const args of [['plan','--ma-childcare','a','--ma-childcare','b'],['plan','--nj-childcare'],['run','--ma-childcare','a'],['stop','--nj-childcare','a']]){
    const result=spawnSync(process.execPath,['scripts/reconcile-business-production.mjs',...args],{cwd:APP_ROOT,encoding:'utf8',windowsHide:true});
    assert.equal(result.status,1);assert.match(result.stderr,/argument|Only plan/i);
  }
});

test('production detects retained childcare artifact mutation during a child before the next stage',async(t)=>{
  const f=await fixture(t),selected=await childcareFixture(f,['nj']),plan=await planProductionReconciliation({...f,...selected,runId:'childcare-midrun'}),calls=[];
  const result=await runProductionReconciliation(plan,{...f,executor:async(s,c)=>{
    calls.push(s.id);await executeFixture(f,s,c);await writeFile(path.join(f.root,plan.optionalSourcePins[0].artifacts[0].path),'changed');return {exitCode:0};
  }});
  assert.equal(result.receipt.status,'FAILED');assert.deepEqual(calls,['registry-build']);assert.match(result.receipt.error,/Pinned input or output changed/);
});
