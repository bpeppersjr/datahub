import path from 'node:path';
import process from 'node:process';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { link, mkdir, open, readFile, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { finished } from 'node:stream/promises';
import { APP_ROOT } from './paths.mjs';
import { inspectNormalizedUsPostalMigration } from './normalized-us-postal-migration.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const DEFINITION = 'config/migrations/normalized-us-postal-fields-v1.json';
const FLAGS = { snap:'--snap', nppes:'--nppes', fdic:'--fdic', ncua:'--ncua', fsis:'--fsis', echo:'--echo', fmcsa:'--fmcsa', irsEo:'--irs-eo', ctBusiness:'--ct-business', deBusiness:'--de-business', akBusiness:'--ak-business', coBusiness:'--co-business', waLniActiveContractors:'--wa-lni-contractors', orBusiness:'--or-business', iaBusiness:'--ia-business', nyBusiness:'--ny-business', flBusiness:'--fl-business', paBusiness:'--pa-business', laActiveBusinesses:'--la-active-businesses', txActiveSalesTax:'--tx-sales-tax', chicagoActiveBusinessLicenses:'--chicago-licenses', dcBasicBusinessLicenses:'--dc-licenses', caAbcActiveLicenses:'--ca-abc', nyRetailFoodStores:'--ny-retail-food', nycDcwpActiveLicenses:'--nyc-dcwp' };
const OUTPUTS = { registry:'data/business-registry', resolution:'data/business-entity-resolution', benchmark:'data/business-entity-resolution-benchmark', coverage:'data/business-coverage-views' };
const DATASETS = { registry:'national-business-registry', resolution:'national-business-entity-resolution', benchmark:'national-business-entity-resolution-benchmark', coverage:'national-business-coverage-views' };
const INPUTS = { geography:'data/geography/current.json', crosswalk:'data/zcta-jurisdiction-crosswalk/current.json', nonemployer:'data/business-baselines/census-nonemployer/current.json', zbp:'data/business-baselines/census-zbp/current.json' };
const STAGES = [ ['registry-build','build','scripts/build-business-registry.mjs'], ['registry-verify','verify','scripts/verify-business-registry.mjs'], ['resolution-build','build','scripts/build-business-entity-resolution.mjs'], ['resolution-verify','verify','scripts/verify-business-entity-resolution.mjs'], ['benchmark-build','build','scripts/build-entity-resolution-benchmark.mjs'], ['benchmark-verify','verify','scripts/verify-entity-resolution-benchmark.mjs'], ['coverage-build','build','scripts/build-national-business-coverage-views.mjs'], ['coverage-verify','verify','scripts/verify-national-business-coverage-views.mjs'] ];
const MODULES = ['runner/business-registry.mjs','runner/business-entity-resolution.mjs','runner/entity-resolution-benchmark.mjs','runner/national-business-coverage-views.mjs'];
const hash = value => createHash('sha256').update(value).digest('hex');
const rel = (root, file) => path.relative(root, file).replaceAll('\\','/');
function inside(root, value) { const file = path.resolve(root,value), relative = path.relative(root,file); if(relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Reconciliation path escapes datahub.'); return file; }
async function safe(root, value, required = true) {
  const file = inside(root,value); let current = file;
  while(current !== root) { try { if(path.resolve(await realpath(current)) !== current) throw new Error('Reconciliation path crosses a link or junction.'); } catch(error) { if(error.code !== 'ENOENT' || required && current === file) throw error; } current = path.dirname(current); }
  return file;
}
async function fileHash(file) { const h = createHash('sha256'); let bytes = 0; for await(const chunk of createReadStream(file)) { h.update(chunk); bytes += chunk.length; } return {sha256:h.digest('hex'),bytes}; }
async function atomic(file, value) { const temporary = `${file}.tmp-${randomUUID()}`; await writeFile(temporary,`${JSON.stringify(value,null,2)}\n`); await rename(temporary,file); }
async function pin(root,id,pointer) {
  const file = await safe(root,pointer), bytes = await readFile(file), value = JSON.parse(bytes);
  if(typeof value.manifest !== 'string' || !value.manifest) throw new Error('Pointer must name a manifest.');
  if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(value.release_id??'') || path.resolve(path.dirname(file),value.manifest) !== path.join(path.dirname(file),'releases',value.release_id,'manifest.json')) throw new Error('Production manifest must belong to its canonical immutable source release.');
  const manifestFile = await safe(root,path.resolve(path.dirname(file),value.manifest)), manifestBytes = await readFile(manifestFile), manifest = JSON.parse(manifestBytes);
  if(!value.release_id || value.release_id !== manifest.release_id || value.dataset_id && value.dataset_id !== manifest.dataset_id) throw new Error('Pointer and manifest identities differ.');
  return {id,path:rel(root,file),sha256:hash(bytes),manifestPath:rel(root,manifestFile),manifestSha256:hash(manifestBytes),releaseId:manifest.release_id,datasetId:manifest.dataset_id};
}
function stageDefinitions(sources) {
  const pointer = group => `${OUTPUTS[group]}/current.json`;
  const args = [ ['--output',OUTPUTS.registry,...sources.flatMap(source => [FLAGS[source.sourceKey],source.pointer])], [pointer('registry')], ['--output',OUTPUTS.resolution,'--registry',pointer('registry')], [pointer('resolution')], ['--output',OUTPUTS.benchmark,'--registry',pointer('registry'),'--resolution',pointer('resolution')], [pointer('benchmark')], ['--output',OUTPUTS.coverage,'--registry',pointer('registry'),'--resolution',pointer('resolution'),'--benchmark',pointer('benchmark'),'--geography',INPUTS.geography,'--crosswalk',INPUTS.crosswalk,'--nonemployer',INPUTS.nonemployer], [pointer('coverage')] ];
  return STAGES.map(([id,kind,script],index) => ({id,kind,script,args:args[index]}));
}
export async function planProductionReconciliation({root=APP_ROOT,runId=randomUUID(),readinessInspector=inspectNormalizedUsPostalMigration}={}) {
  root = await realpath(path.resolve(root)); if(!ID.test(runId)) throw new Error('Invalid production run ID.');
  const report = await readinessInspector({appRoot:root,useCandidatePointers:false});
  if(!report.ready_for_registry_2_10 || report.counts?.total !== 25 || report.sources?.length !== 25 || report.sources.some(s=>s.status !== 'ready' || s.pointer_scope !== 'production')) throw new Error('All 25 production sources must be ready.');
  const definitionPath = await safe(root,DEFINITION), definitionBytes = await readFile(definitionPath), definition = JSON.parse(definitionBytes);
  const sourcePins = [];
  for(const source of report.sources) {
    const configured = definition.sources.find(s=>s.source_key === source.source_key);
    if(!Object.hasOwn(FLAGS,source.source_key) || !configured || path.resolve(root,configured.pointer) !== path.resolve(source.pointer)) throw new Error('Source is not a canonical production input.');
    const actual = await pin(root,source.source_key,configured.pointer), configPath = await safe(root,configured.connector_config), configHash = (await fileHash(configPath)).sha256;
    if(actual.sha256 !== source.pointer_sha256 || actual.manifestSha256 !== source.manifest_sha256 || actual.releaseId !== source.current_release_id || actual.datasetId !== source.dataset_id || configHash !== source.connector_config_sha256) throw new Error('Production readiness source pins changed.');
    sourcePins.push({sourceKey:source.source_key,pointer:actual.path,...actual,connectorConfigPath:rel(root,configPath),connectorConfigSha256:configHash});
  }
  if(new Set(sourcePins.map(s=>s.sourceKey)).size !== 25) throw new Error('Production source cohort contains duplicates.');
  const inputPins = []; for(const [id,pointer] of Object.entries(INPUTS)) inputPins.push(await pin(root,id,pointer));
  const previousOutputs = {}; for(const [group,directory] of Object.entries(OUTPUTS)) { await safe(root,directory); const previous = await pin(root,group,`${directory}/current.json`); if(previous.datasetId !== DATASETS[group]) throw new Error('Existing production output dataset is invalid.'); previousOutputs[group]=previous; }
  const stages = stageDefinitions(sourcePins), scriptPins = []; for(const stage of stages) scriptPins.push({stage:stage.id,path:stage.script,...await fileHash(await safe(root,stage.script))});
  const implementationPins = []; for(const file of MODULES) implementationPins.push({path:file,...await fileHash(await safe(root,file))});
  const outputRoot = `data/reconciliations/production-runs/${runId}`; await safe(root,outputRoot,false);
  const plan = {schemaVersion:1,mode:'production',runId,createdAt:new Date().toISOString(),outputRoot,readinessPlanSha256:report.plan_sha256,definitionSha256:hash(definitionBytes),sourcePins,inputPins,previousOutputs,scriptPins,implementationPins,stages};
  plan.planSha256 = hash(JSON.stringify(plan)); return plan;
}
function execute(stage,{cwd,logPath,onSpawn}) {
  return new Promise(resolve => {
    const log = createWriteStream(logPath,{flags:'wx'}); const done = finished(log).then(()=>null,error=>error);
    const child = spawn(process.execPath,[stage.script,...stage.args],{cwd,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
    const ownership = Promise.resolve().then(()=>onSpawn(child.pid)).catch(error=>error); let spawnError;
    child.once('error',error=>{spawnError=error;}); child.stdout.pipe(log,{end:false}); child.stderr.pipe(log,{end:false});
    log.once('error',()=>{child.stdout.unpipe(log);child.stderr.unpipe(log);child.stdout.resume();child.stderr.resume();});
    child.once('close',code=>{void (async()=>{const ownerError=await ownership;if(!log.destroyed)log.end();const logError=await done;const error=spawnError??(ownerError instanceof Error?ownerError:null)??logError;resolve({exitCode:error?1:code??1,pid:child.pid,error:error?.message});})();});
  });
}
async function checkPins(root,plan,outputs) {
  const checks = [[DEFINITION,plan.definitionSha256]];
  for(const p of plan.sourcePins) checks.push([p.pointer,p.sha256],[p.manifestPath,p.manifestSha256],[p.connectorConfigPath,p.connectorConfigSha256]);
  for(const p of [...plan.inputPins,...Object.values(outputs)]) checks.push([p.path,p.sha256],[p.manifestPath,p.manifestSha256]);
  for(const p of [...plan.scriptPins,...plan.implementationPins]) checks.push([p.path,p.sha256]);
  for(const [file,expected] of checks) if((await fileHash(await safe(root,file))).sha256 !== expected) throw new Error(`Pinned input or output changed: ${file}.`);
}
async function emitted(root,group,previous,expected) {
  const output = await pin(root,group,`${OUTPUTS[group]}/current.json`), manifest = JSON.parse(await readFile(path.join(root,output.manifestPath),'utf8'));
  if(output.datasetId !== DATASETS[group] || output.releaseId === previous.releaseId || !String(manifest.status??'').startsWith('published')) throw new Error(`Stage did not emit a new published ${group} release.`);
  const dependencies = group === 'resolution' ? [manifest.dependency] : group === 'benchmark' ? Object.values(manifest.dependencies??{}) : manifest.dependencies;
  if(!Array.isArray(dependencies) || group !== 'registry' && dependencies.length !== expected.length) throw new Error(`Invalid ${group} dependency set.`);
  if(group==='registry') {
    const inherited=[];for(const source of expected){const sourceManifest=JSON.parse(await readFile(await safe(root,source.manifestPath),'utf8'));if(sourceManifest.dependencies!==undefined&&!Array.isArray(sourceManifest.dependencies))throw new Error('Invalid inherited source dependencies.');inherited.push(...(sourceManifest.dependencies??[]));}
    const direct=expected.map(p=>({dataset_id:p.datasetId,release_id:p.releaseId,manifest_sha256:p.manifestSha256}));
    const stable=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);
    if(JSON.stringify(dependencies.map(stable).sort())!==JSON.stringify([...direct,...inherited].map(stable).sort()))throw new Error('Registry inherited dependency multiset differs from pinned sources.');
  }
  for(const p of expected) { const matches = dependencies.filter(d=>d?.dataset_id === p.datasetId); if(matches.length !== 1 || matches[0].release_id !== p.releaseId || matches[0].manifest_sha256 !== p.manifestSha256) throw new Error(`Emitted ${group} dependency does not match ${p.datasetId}.`); }
  return output;
}
export async function runProductionReconciliation(plan,{root=APP_ROOT,readinessInspector=inspectNormalizedUsPostalMigration,executor=execute,signal}={}) {
  root=await realpath(path.resolve(root));
  if(plan?.schemaVersion !== 1 || plan.mode !== 'production' || !ID.test(plan.runId??'') || hash(JSON.stringify(Object.fromEntries(Object.entries(plan).filter(([key])=>key!=='planSha256')))) !== plan.planSha256) throw new Error('Invalid production reconciliation plan.');
  const current = await planProductionReconciliation({root,runId:plan.runId,readinessInspector});
  for(const key of Object.keys(current).filter(key=>!['createdAt','planSha256'].includes(key))) if(JSON.stringify(current[key]) !== JSON.stringify(plan[key])) throw new Error(`Production reconciliation plan changed: ${key}.`);
  const runRoot=await safe(root,plan.outputRoot,false), lockPath=await safe(root,'data/reconciliations/controller.lock',false); await mkdir(path.dirname(lockPath),{recursive:true}); await safe(root,path.dirname(lockPath));
  let lock; const token=randomUUID();
  try { lock=await open(lockPath,'wx'); await lock.writeFile(`${JSON.stringify({pid:process.pid,runId:plan.runId,mode:'production',token,startedAt:new Date().toISOString()})}\n`); } catch(error) { if(lock){await lock.close();await unlink(lockPath);} if(error.code==='EEXIST') throw new Error('Another reconciliation owns the controller lock; inspect ownership before recovery.'); throw error; }
  const receipt={schemaVersion:1,mode:'production',runId:plan.runId,status:'RUNNING',startedAt:new Date().toISOString(),finishedAt:null,owner:{pid:process.pid},stopRequested:false,previousOutputs:plan.previousOutputs,outputs:{},stages:plan.stages.map(s=>({id:s.id,status:'PENDING',pid:null,exitCode:null,startedAt:null,finishedAt:null,log:null,error:null})),error:null};
  const receiptPath=path.join(runRoot,'receipt.json'), planPath=path.join(runRoot,'plan.json'); let initialized=false, persistenceError=null, saves=Promise.resolve(), poll=null, pendingPoll=null;
  const save=()=>{saves=saves.catch(()=>{}).then(()=>atomic(receiptPath,receipt));return saves;};
  const requestStop=()=>{receipt.stopRequested=true;if(initialized)void save().catch(error=>{persistenceError=error;});};
  const inspectStop=async()=>{try{const file=await safe(root,path.join(runRoot,'stop-request.json'));const request=JSON.parse(await readFile(file,'utf8'));if(request.runId!==plan.runId)throw new Error('Stop request run identity differs.');if(!receipt.stopRequested)requestStop();}catch(error){if(error.code!=='ENOENT')throw error;}};
  signal?.addEventListener('abort',requestStop,{once:true});
  try {
    await mkdir(path.dirname(runRoot),{recursive:true}); await safe(root,path.dirname(runRoot)); await mkdir(runRoot); await writeFile(planPath,`${JSON.stringify(plan,null,2)}\n`,{flag:'wx'}); initialized=true; await save();
    poll=setInterval(()=>{if(!pendingPoll)pendingPoll=inspectStop().catch(error=>{persistenceError=error;}).finally(()=>{pendingPoll=null;});},1000);poll.unref();
    const outputs={...plan.previousOutputs};
    for(let index=0;index<plan.stages.length;index++) {
      await inspectStop();if(persistenceError)throw persistenceError;
      if(signal?.aborted||receipt.stopRequested){receipt.status='STOPPED';receipt.stopRequested=true;break;}
      await checkPins(root,plan,outputs); const stage=plan.stages[index],record=receipt.stages[index];record.status='RUNNING';record.startedAt=new Date().toISOString();await save();
      const logPath=path.join(runRoot,`${stage.id}.log`);const result=await executor(stage,{cwd:root,logPath,onSpawn:async pid=>{record.pid=pid;await save();}});
      record.exitCode=result?.exitCode??1;record.pid??=result?.pid??null;record.finishedAt=new Date().toISOString();record.log={path:path.basename(logPath),...await fileHash(logPath)};
      if(record.exitCode!==0)throw new Error(`Stage ${stage.id} failed with exit code ${record.exitCode}.`);
      if(stage.kind==='build') {const group=stage.id.split('-')[0];const expected=group==='registry'?plan.sourcePins:group==='resolution'?[outputs.registry]:group==='benchmark'?[outputs.registry,outputs.resolution]:[outputs.registry,outputs.resolution,outputs.benchmark,...plan.inputPins.filter(p=>p.id!=='zbp')];outputs[group]=await emitted(root,group,plan.previousOutputs[group],expected);receipt.outputs[group]=outputs[group];record.release=outputs[group];}
      await checkPins(root,plan,outputs);if(persistenceError)throw persistenceError;record.status='SUCCEEDED';await save();
    }
    if(receipt.status==='RUNNING')receipt.status='SUCCEEDED';
  } catch(error) { receipt.status='FAILED';receipt.error=String(error.message).slice(0,500);const active=receipt.stages.find(s=>s.status==='RUNNING');if(active){active.status='FAILED';active.error=receipt.error;active.finishedAt=new Date().toISOString();} }
  finally {
    signal?.removeEventListener('abort',requestStop);if(poll)clearInterval(poll);if(pendingPoll)await pendingPoll;
    receipt.stopRequested ||= Boolean(signal?.aborted);for(const stage of receipt.stages)if(stage.status==='PENDING')stage.status='SKIPPED';receipt.finishedAt=new Date().toISOString();delete receipt.owner;
    try {if(initialized)await save();} finally {await lock.close();const owner=JSON.parse(await readFile(lockPath,'utf8'));if(owner.token!==token)throw new Error('Controller lock ownership changed.');await unlink(lockPath);}
  }
  if(!initialized)throw new Error(receipt.error??'Production run could not initialize.');return {planPath,receiptPath,receipt};
}

export async function requestProductionReconciliationStop({root=APP_ROOT,runId}={}) {
  root=await realpath(path.resolve(root));if(!ID.test(runId??''))throw new Error('Invalid production run ID.');
  const directory=await safe(root,`data/reconciliations/production-runs/${runId}`),receiptPath=await safe(root,path.join(directory,'receipt.json'));
  const receipt=JSON.parse(await readFile(receiptPath,'utf8'));if(receipt.runId!==runId||receipt.mode!=='production'||receipt.status!=='RUNNING')throw new Error('Only a running production receipt can receive a stop request.');
  const file=await safe(root,path.join(directory,'stop-request.json'),false),request={runId,requestedAt:new Date().toISOString(),semantics:'stage-boundary'};
  const temporary=path.join(directory,`.stop-request-${randomUUID()}.tmp`);
  try{await writeFile(temporary,`${JSON.stringify(request,null,2)}\n`,{flag:'wx'});try{await link(temporary,file);}catch(error){if(error.code!=='EEXIST')throw error;const existing=JSON.parse(await readFile(await safe(root,file),'utf8'));if(existing.runId!==runId)throw new Error('Existing stop request identity differs.');}}finally{await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
  return {status:'STOP_REQUESTED',runId,requestPath:file,acceptedByController:false};
}
