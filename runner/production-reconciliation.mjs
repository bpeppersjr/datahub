import path from 'node:path';
import process from 'node:process';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { link, mkdir, open, readFile, realpath, unlink, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { finished } from 'node:stream/promises';
import { isDeepStrictEqual } from 'node:util';
import { APP_ROOT } from './paths.mjs';
import { inspectNormalizedUsPostalMigration } from './normalized-us-postal-migration.mjs';
import { verifyMaChildcareRelease } from './ma-childcare-release.mjs';
import { verifyNjChildcareRelease } from './nj-childcare-release.mjs';
import { verifyTnChildcareRecoveredRelease } from './tn-childcare-recovered-release.mjs';
import { verifyTnChildcareRelease } from './tn-childcare-release.mjs';
import { writeReconciliationReceipt as atomic } from './reconciliation-receipt.mjs';
import { productionMemoryPolicy, productionMemoryArguments } from './production-memory.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const DEFINITION = 'config/migrations/normalized-us-postal-fields-v1.json';
const FLAGS = { snap:'--snap', nppes:'--nppes', fdic:'--fdic', ncua:'--ncua', fsis:'--fsis', echo:'--echo', fmcsa:'--fmcsa', irsEo:'--irs-eo', ctBusiness:'--ct-business', deBusiness:'--de-business', akBusiness:'--ak-business', coBusiness:'--co-business', waLniActiveContractors:'--wa-lni-contractors', orBusiness:'--or-business', iaBusiness:'--ia-business', nyBusiness:'--ny-business', flBusiness:'--fl-business', paBusiness:'--pa-business', laActiveBusinesses:'--la-active-businesses', txActiveSalesTax:'--tx-sales-tax', chicagoActiveBusinessLicenses:'--chicago-licenses', dcBasicBusinessLicenses:'--dc-licenses', caAbcActiveLicenses:'--ca-abc', nyRetailFoodStores:'--ny-retail-food', nycDcwpActiveLicenses:'--nyc-dcwp' };
const OUTPUTS = { registry:'data/business-registry', resolution:'data/business-entity-resolution', benchmark:'data/business-entity-resolution-benchmark', coverage:'data/business-coverage-views' };
const DATASETS = { registry:'national-business-registry', resolution:'national-business-entity-resolution', benchmark:'national-business-entity-resolution-benchmark', coverage:'national-business-coverage-views' };
const INPUTS = { geography:'data/geography/current.json', crosswalk:'data/zcta-jurisdiction-crosswalk/current.json', nonemployer:'data/business-baselines/census-nonemployer/current.json', zbp:'data/business-baselines/census-zbp/current.json' };
const STAGES = [ ['registry-build','build','scripts/build-business-registry.mjs'], ['registry-verify','verify','scripts/verify-business-registry.mjs'], ['resolution-build','build','scripts/build-business-entity-resolution.mjs'], ['resolution-verify','verify','scripts/verify-business-entity-resolution.mjs'], ['benchmark-build','build','scripts/build-entity-resolution-benchmark.mjs'], ['benchmark-verify','verify','scripts/verify-entity-resolution-benchmark.mjs'], ['coverage-build','build','scripts/build-national-business-coverage-views.mjs'], ['coverage-verify','verify','scripts/verify-national-business-coverage-views.mjs'] ];
const MODULES = ['runner/business-registry.mjs','runner/business-entity-resolution.mjs','runner/entity-resolution-benchmark.mjs','runner/national-business-coverage-views.mjs','runner/tn-childcare-fresh-registry-input.mjs','runner/tn-childcare-release.mjs'];
// Pin newly imported fresh modules even when TN is not selected. Saved plans
// remain immutable; historical recovery still requires its exact original pins.
// TN-enabled plans additionally cover the full relative static-import closure.
const TN_MODULES = [...new Set([...MODULES,
  ...['census-geography','childcare-geographic-evidence','normalized-us-postal-code','normalized-us-postal-cutover','normalized-us-postal-migration','paths','source-http-guards'].map(name=>`runner/${name}.mjs`),
  ...['ma','nj'].flatMap(prefix=>['acquisition','normalization','preflight','registry-adapter','registry-input','release',...(prefix==='nj'?['metadata']:[])].map(suffix=>`runner/${prefix}-childcare-${suffix}.mjs`)),
  ...['acquisition','geographic-evidence','normalization','preflight','recovered-release','recovery-inspection','registry-adapter','registry-input','fresh-registry-input','release'].map(suffix=>`runner/tn-childcare-${suffix}.mjs`),
])].sort();
const CHILDCARE = {
  maChildcare: { flag:'--ma-childcare', dataset:'ma-licensed-center-based-childcare', prefix:'ma', policy:'massgis-eec-childcare-local-review', verify:verifyMaChildcareRelease },
  njChildcare: { flag:'--nj-childcare', dataset:'nj-licensed-childcare-centers', prefix:'nj', policy:'njdep-childcare-local-review', verify:verifyNjChildcareRelease },
  tnChildcare: { flag:'--tn-childcare', dataset:'tn-dhs-active-childcare-centers', policy:'tn-childcare-local-review', verify:verifyTnChildcareRecoveredRelease },
  tnFreshChildcare: { flag:'--tn-fresh-childcare', dataset:'tn-dhs-active-childcare-centers', policy:'tn-childcare-local-review', verify:verifyTnChildcareRelease, fresh:true },
  ohChildcareReceipt: { flag:'--oh-childcare-receipt', dataset:'oh-dcy-publisher-open-childcare-centers' },
};
const hash = value => createHash('sha256').update(value).digest('hex');
const rel = (root, file) => path.relative(root, file).replaceAll('\\','/');
function inside(root, value) { const file = path.resolve(root,value), relative = path.relative(root,file); if(relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Reconciliation path escapes datahub.'); return file; }
async function safe(root, value, required = true) {
  const file = inside(root,value); let current = file;
  while(current !== root) { try { if(path.resolve(await realpath(current)) !== current) throw new Error('Reconciliation path crosses a link or junction.'); } catch(error) { if(error.code !== 'ENOENT' || required && current === file) throw error; } current = path.dirname(current); }
  return file;
}
async function fileHash(file) { const h = createHash('sha256'); let bytes = 0; for await(const chunk of createReadStream(file)) { h.update(chunk); bytes += chunk.length; } return {sha256:h.digest('hex'),bytes}; }
async function pin(root,id,pointer) {
  const file = await safe(root,pointer), bytes = await readFile(file), value = JSON.parse(bytes);
  if(typeof value.manifest !== 'string' || !value.manifest) throw new Error('Pointer must name a manifest.');
  if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(value.release_id??'') || path.resolve(path.dirname(file),value.manifest) !== path.join(path.dirname(file),'releases',value.release_id,'manifest.json')) throw new Error('Production manifest must belong to its canonical immutable source release.');
  const manifestFile = await safe(root,path.resolve(path.dirname(file),value.manifest)), manifestBytes = await readFile(manifestFile), manifest = JSON.parse(manifestBytes);
  if(!value.release_id || value.release_id !== manifest.release_id || value.dataset_id && value.dataset_id !== manifest.dataset_id) throw new Error('Pointer and manifest identities differ.');
  return {id,path:rel(root,file),sha256:hash(bytes),manifestPath:rel(root,manifestFile),manifestSha256:hash(manifestBytes),releaseId:manifest.release_id,datasetId:manifest.dataset_id};
}
async function pinChildcare(root, key, selected) {
  const contract=CHILDCARE[key];
  if(typeof selected!=='string'||!selected.trim())throw new Error('Childcare input must be one explicit immutable manifest path.');
  const file=await safe(root,selected);
  if(path.basename(file)!=='manifest.json'||path.basename(path.dirname(path.dirname(file)))!=='releases')throw new Error('Childcare input must name an immutable release manifest, not a pointer or staging.');
  const before=await fileHash(file), verified=await contract.verify(file), bytes=await readFile(file), manifest=JSON.parse(bytes);
  if(verified.status!=='verified'||manifest.dataset_id!==contract.dataset||verified.release_id!==manifest.release_id||path.basename(path.dirname(file))!==manifest.release_id||before.sha256!==verified.manifest_sha256||hash(bytes)!==before.sha256)throw new Error('Childcare verified release identity changed.');
  if(contract.fresh&&(manifest.connector_version!=='1.1.0'||manifest.transformation_version!=='tn-childcare-normalization@1.0.1'||Object.hasOwn(manifest,'recovery_version')))throw new Error('Fresh Tennessee input requires ordinary connector 1.1.0.');
  const artifacts=[];
  for(const artifact of manifest.artifacts){const artifactFile=await safe(root,path.resolve(path.dirname(file),artifact.path)), actual=await fileHash(artifactFile);if(actual.sha256!==artifact.sha256||actual.bytes!==artifact.bytes)throw new Error('Childcare artifact changed after verification.');artifacts.push({path:rel(root,artifactFile),...actual});}
  const configurationPins=[];
  for(const relative of [`config/connectors/${contract.dataset}.json`,`config/source-policies/${contract.policy}.json`])configurationPins.push({path:relative,...await fileHash(await safe(root,relative))});
  return {sourceKey:key,manifestPath:rel(root,file),manifestSha256:before.sha256,releaseId:manifest.release_id,datasetId:manifest.dataset_id,artifacts,configurationPins};
}
function stageDefinitions(sources,optionalSources=[]) {
  const pointer = group => `${OUTPUTS[group]}/current.json`;
  const args = [ ['--output',OUTPUTS.registry,...sources.flatMap(source => [FLAGS[source.sourceKey],source.pointer])], [pointer('registry')], ['--output',OUTPUTS.resolution,'--registry',pointer('registry')], [pointer('resolution')], ['--output',OUTPUTS.benchmark,'--registry',pointer('registry'),'--resolution',pointer('resolution')], [pointer('benchmark')], ['--output',OUTPUTS.coverage,'--registry',pointer('registry'),'--resolution',pointer('resolution'),'--benchmark',pointer('benchmark'),'--geography',INPUTS.geography,'--crosswalk',INPUTS.crosswalk,'--nonemployer',INPUTS.nonemployer], [pointer('coverage')] ];
  args[0].push(...optionalSources.flatMap(source=>[CHILDCARE[source.sourceKey]?.flag,source.receiptPath??source.manifestPath]));
  return STAGES.map(([id,kind,script],index) => ({id,kind,script,args:args[index]}));
}
export async function planProductionReconciliation({root=APP_ROOT,runId=randomUUID(),recoverBenchmarkFrom,recoverResolutionFrom,maChildcare,njChildcare,tnChildcare,tnFreshChildcare,ohChildcareReceipt,retainedChildcareSelection,memoryProfile,readinessInspector=inspectNormalizedUsPostalMigration}={}) {
  if(retainedChildcareSelection!==undefined&&(recoverBenchmarkFrom!==undefined||recoverResolutionFrom!==undefined))throw new Error('Retained childcare integration requires a fresh plan, not historical recovery.');
  const memoryPolicy = productionMemoryPolicy(memoryProfile);
  if(memoryPolicy&&(recoverBenchmarkFrom!==undefined||recoverResolutionFrom!==undefined))throw new Error('Memory profile requires a fresh retained-data plan, not historical recovery.');
  if(tnChildcare!==undefined&&tnFreshChildcare!==undefined)throw new Error('Choose one Tennessee source: fresh and recovered are mutually exclusive.');
  if(recoverBenchmarkFrom!==undefined&&recoverResolutionFrom!==undefined)throw new Error('Recovery modes are mutually exclusive.');
  if(ohChildcareReceipt!==undefined&&(recoverBenchmarkFrom!==undefined||recoverResolutionFrom!==undefined))throw new Error('Ohio requires a fresh retained-data production plan, not historical recovery.');
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
  const optionalSourcePins=[];
  for(const [key,selected] of Object.entries({maChildcare,njChildcare,tnChildcare,tnFreshChildcare}))if(selected!==undefined)optionalSourcePins.push(await pinChildcare(root,key,selected));
  let ohio = null;
  if(ohChildcareReceipt!==undefined){ohio=await import('./oh-childcare-production-input.mjs');optionalSourcePins.push(await ohio.pinOhioProductionInput(root,ohChildcareReceipt,{safe,fileHash,rel}));}
  if(new Set(optionalSourcePins.map(p=>p.manifestPath)).size!==optionalSourcePins.length)throw new Error('Duplicate childcare release selection.');
  const stages = stageDefinitions(sourcePins,optionalSourcePins), scriptPins = []; for(const stage of stages) scriptPins.push({stage:stage.id,path:stage.script,...await fileHash(await safe(root,stage.script))});
  let retainedChildcarePin=null,retainedChildcareApi=null;
  if(retainedChildcareSelection!==undefined){
    retainedChildcareApi=await import('./retained-childcare-production-input.mjs');
    retainedChildcarePin=await retainedChildcareApi.pinRetainedChildcareProductionInput(root,retainedChildcareSelection,{safe,fileHash});
    stages[0].args.push('--retained-childcare-selection',retainedChildcarePin.declaration.selection.path);
  }
  const modules=tnChildcare!==undefined||tnFreshChildcare!==undefined||ohio?[...TN_MODULES]:[...MODULES];
  if(tnChildcare===undefined&&tnFreshChildcare===undefined&&!ohio){
    if(optionalSourcePins.length)modules.push('runner/childcare-geographic-evidence.mjs','runner/normalized-us-postal-code.mjs','runner/source-http-guards.mjs','runner/paths.mjs');
    else modules.push('runner/childcare-geographic-evidence.mjs','runner/normalized-us-postal-code.mjs');
    for(const selected of optionalSourcePins){const prefix=CHILDCARE[selected.sourceKey].prefix;for(const suffix of ['registry-input','registry-adapter','release','normalization','preflight','acquisition',...(prefix==='nj'?['metadata']:[])])modules.push(`runner/${prefix}-childcare-${suffix}.mjs`);}
  }
  if(ohio)modules.push(...ohio.OH_PRODUCTION_MODULES);
  if(memoryPolicy)modules.push('runner/production-memory.mjs','runner/production-reconciliation.mjs');
  if(retainedChildcarePin)modules.push(...await retainedChildcareApi.retainedChildcareImplementationFiles(root));
  const implementationPins = []; for(const file of retainedChildcarePin?[...new Set(modules)].sort():modules) implementationPins.push({path:file,...await fileHash(await safe(root,file))});
  const outputRoot = `data/reconciliations/production-runs/${runId}`; await safe(root,outputRoot,false);
  const plan = {schemaVersion:1,mode:'production',runId,createdAt:new Date().toISOString(),outputRoot,readinessPlanSha256:report.plan_sha256,definitionSha256:hash(definitionBytes),sourcePins,inputPins,previousOutputs,scriptPins,implementationPins,stages};
  if(memoryPolicy)plan.memoryPolicy=memoryPolicy;
  if(optionalSourcePins.length)plan.optionalSourcePins=optionalSourcePins;
  if(retainedChildcarePin)plan.retainedChildcarePin=retainedChildcarePin;
  if(recoverBenchmarkFrom !== undefined) {
    plan.recovery = await benchmarkRecovery(root,plan,recoverBenchmarkFrom);
    plan.stages = stages.slice(5);
  }
  if(recoverResolutionFrom!==undefined){plan.recovery=await resolutionRecovery(root,plan,recoverResolutionFrom);plan.stages=stages.slice(2);}
  plan.planSha256 = hash(JSON.stringify(plan)); return plan;
}
export function executeProductionStage(stage,{cwd,logPath,onSpawn,memoryPolicy}) {
  const nodeArgs=productionMemoryArguments(memoryPolicy);
  return new Promise(resolve => {
    const log = createWriteStream(logPath,{flags:'wx'}); const done = finished(log).then(()=>null,error=>error);
    const child = spawn(process.execPath,[...nodeArgs,stage.script,...stage.args],{cwd,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
    const ownership = Promise.resolve().then(()=>onSpawn(child.pid)).catch(error=>error); let spawnError;
    child.once('error',error=>{spawnError=error;}); child.stdout.pipe(log,{end:false}); child.stderr.pipe(log,{end:false});
    log.once('error',()=>{child.stdout.unpipe(log);child.stderr.unpipe(log);child.stdout.resume();child.stderr.resume();});
    child.once('close',code=>{void (async()=>{const ownerError=await ownership;if(!log.destroyed)log.end();const logError=await done;const error=spawnError??(ownerError instanceof Error?ownerError:null)??logError;resolve({exitCode:error?1:code??1,pid:child.pid,error:error?.message});})();});
  });
}
async function checkPins(root,plan,outputs) {
  const checks = [[DEFINITION,plan.definitionSha256]];
  for(const pin of plan.retainedChildcarePin?.evidencePins??[])checks.push([pin.path,pin.sha256]);
  for(const p of plan.recovery?.evidencePins??[])checks.push([p.path,p.sha256]);
  for(const p of plan.sourcePins) checks.push([p.pointer,p.sha256],[p.manifestPath,p.manifestSha256],[p.connectorConfigPath,p.connectorConfigSha256]);
  for(const p of plan.optionalSourcePins??[]){checks.push([p.manifestPath,p.manifestSha256]);for(const artifact of [...p.artifacts,...p.configurationPins])checks.push([artifact.path,artifact.sha256]);}
  for(const p of [...plan.inputPins,...Object.values(outputs)]) checks.push([p.path,p.sha256],[p.manifestPath,p.manifestSha256]);
  for(const p of [...plan.scriptPins,...plan.implementationPins]) checks.push([p.path,p.sha256]);
  for(const [file,expected] of checks) if((await fileHash(await safe(root,file))).sha256 !== expected) throw new Error(`Pinned input or output changed: ${file}.`);
}
async function emitted(root,group,previous,expected,ohioSource) {
  const output = await pin(root,group,`${OUTPUTS[group]}/current.json`), manifest = JSON.parse(await readFile(path.join(root,output.manifestPath),'utf8'));
  const acceptedStatus = group === 'benchmark' ? manifest.status === 'awaiting-independent-labels' : String(manifest.status??'').startsWith('published');
  if(output.datasetId !== DATASETS[group] || output.releaseId === previous.releaseId || !acceptedStatus) throw new Error(`Stage did not emit a new published ${group} release.`);
  if(ohioSource&&['registry','coverage'].includes(group)&&(!isDeepStrictEqual(manifest.oh_childcare_source,ohioSource.source)||manifest.publisher?.id!==DATASETS[group]||manifest.publisher.version!==(group==='registry'?'2.15.0':'2.11.0')))throw new Error('Emitted Ohio production version or retained app lineage differs.');
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

// Narrow recovery for the historical benchmark status-classification failure.
// It adopts completed immutable releases in a new run; never rewrites old receipts.
async function benchmarkRecovery(root,current,fromRunId) {
  if(!ID.test(fromRunId??'') || fromRunId===current.runId)throw new Error('Invalid benchmark recovery origin.');
  const directory=`data/reconciliations/production-runs/${fromRunId}`;
  const evidencePins=[];
  async function evidence(file) {const bytes=await readFile(await safe(root,file));evidencePins.push({path:file,sha256:hash(bytes)});return bytes;}
  const original=JSON.parse(await evidence(`${directory}/plan.json`));
  const receipt=JSON.parse(await evidence(`${directory}/receipt.json`));
  const planDigest=hash(JSON.stringify(Object.fromEntries(Object.entries(original).filter(([key])=>key!=='planSha256'))));
  if(original.schemaVersion!==1 || original.mode!=='production' || original.runId!==fromRunId || original.recovery
    || original.outputRoot!==directory || original.planSha256!==planDigest
    || JSON.stringify(original.stages)!==JSON.stringify(stageDefinitions(original.sourcePins??[],original.optionalSourcePins??[])))throw new Error('Invalid original production plan for benchmark recovery.');
  if(JSON.stringify(original.optionalSourcePins??[])!==JSON.stringify(current.optionalSourcePins??[]))throw new Error('Recovery original childcare inputs changed.');
  const failure='Stage did not emit a new published benchmark release.';
  let loggedBenchmark;
  if(receipt.schemaVersion!==1 || receipt.mode!=='production' || receipt.runId!==fromRunId || receipt.status!=='FAILED'
    || receipt.owner || receipt.stopRequested || !Number.isFinite(Date.parse(receipt.finishedAt)) || receipt.error!==failure
    || receipt.stages?.length!==8 || JSON.stringify(receipt.previousOutputs)!==JSON.stringify(original.previousOutputs)
    || JSON.stringify(Object.keys(receipt.outputs??{}).sort())!==JSON.stringify(['registry','resolution']))throw new Error('Receipt is not the supported terminal benchmark failure.');
  for(let index=0;index<8;index++) {
    const stage=receipt.stages[index];
    if(stage.id!==original.stages[index].id || stage.status!==(index<4?'SUCCEEDED':index===4?'FAILED':'SKIPPED')
      || (index<5 && (stage.exitCode!==0 || !Number.isFinite(Date.parse(stage.finishedAt))))
      || (index>4 && [stage.pid,stage.exitCode,stage.startedAt,stage.finishedAt,stage.log,stage.error].some(value=>value!==null))
      || (index===4 && stage.error!==failure))throw new Error('Original stage evidence is not recoverable.');
    if(index<5) {
      if(stage.log?.path!==`${stage.id}.log`)throw new Error('Original log identity is invalid.');
      const bytes=await evidence(`${directory}/${stage.log.path}`);
      if(bytes.length!==stage.log.bytes || hash(bytes)!==stage.log.sha256)throw new Error('Original log evidence changed.');
      if(index===4) {
        const text=bytes.toString('utf8').trim(), start=text.lastIndexOf('\n{');
        try {loggedBenchmark=JSON.parse(start<0?text:text.slice(start+1));}
        catch {throw new Error('Benchmark log lacks its terminal release identity.');}
      }
    }
  }
  for(const key of ['definitionSha256','sourcePins','inputPins','scriptPins','implementationPins']) {
    if(JSON.stringify(original[key])!==JSON.stringify(current[key]))throw new Error(`Recovery original input changed: ${key}.`);
  }
  for(const group of ['registry','resolution']) {
    const build=receipt.stages[group==='registry'?0:2];
    if(JSON.stringify(current.previousOutputs[group])!==JSON.stringify(receipt.outputs[group])
      || JSON.stringify(build.release)!==JSON.stringify(receipt.outputs[group]))throw new Error(`Recovery ${group} output differs from verified receipt.`);
    await emitted(root,group,original.previousOutputs[group],group==='registry'?[...current.sourcePins,...(current.optionalSourcePins??[])]:[current.previousOutputs.registry]);
  }
  if(JSON.stringify(current.previousOutputs.coverage)!==JSON.stringify(original.previousOutputs.coverage))throw new Error('Coverage changed after the failed production run.');
  const benchmark=await emitted(root,'benchmark',original.previousOutputs.benchmark,[current.previousOutputs.registry,current.previousOutputs.resolution]);
  const manifest=JSON.parse(await readFile(await safe(root,benchmark.manifestPath),'utf8'));
  if(manifest.status!=='awaiting-independent-labels')throw new Error('Recovery requires the unlabelled benchmark sample status.');
  if(loggedBenchmark?.release_id!==benchmark.releaseId || loggedBenchmark.status!==manifest.status
    || typeof loggedBenchmark.manifest!=='string' || path.resolve(loggedBenchmark.manifest)!==path.join(root,benchmark.manifestPath))throw new Error('Current benchmark does not match the original build log.');
  return {kind:'benchmark-status-classification',fromRunId,evidencePins,adoptedOutputs:{registry:current.previousOutputs.registry,resolution:current.previousOutputs.resolution,benchmark},
    independentLabelGatePassed:false,semantics:'Verify adopted benchmark, then build and verify coverage; no source acquisition or completed build replay.'};
}
// Only the reviewed registry-2.12 compatibility failure can adopt a completed
// registry here. This is not general failed-stage resume or source acquisition.
async function resolutionRecovery(root,current,fromRunId) {
  if(!ID.test(fromRunId??'')||fromRunId===current.runId)throw new Error('Invalid resolution recovery origin.');
  const directory=`data/reconciliations/production-runs/${fromRunId}`,evidencePins=[];
  async function evidence(file){const bytes=await readFile(await safe(root,file));evidencePins.push({path:file,sha256:hash(bytes),bytes:bytes.length});return bytes;}
  const original=JSON.parse(await evidence(`${directory}/plan.json`)),receipt=JSON.parse(await evidence(`${directory}/receipt.json`));
  const digest=hash(JSON.stringify(Object.fromEntries(Object.entries(original).filter(([key])=>key!=='planSha256'))));
  if(original.schemaVersion!==1||original.mode!=='production'||original.runId!==fromRunId||original.recovery||original.outputRoot!==directory||original.planSha256!==digest
    ||JSON.stringify(original.stages)!==JSON.stringify(stageDefinitions(original.sourcePins??[],original.optionalSourcePins??[])))throw new Error('Invalid original production plan for resolution recovery.');
  for(const key of ['definitionSha256','readinessPlanSha256','sourcePins','inputPins','scriptPins'])if(JSON.stringify(original[key])!==JSON.stringify(current[key]))throw new Error(`Resolution recovery original input changed: ${key}.`);
  if(JSON.stringify(original.optionalSourcePins??[])!==JSON.stringify(current.optionalSourcePins??[]))throw new Error('Resolution recovery childcare inputs changed.');
  const approvedPath='runner/business-entity-resolution.mjs';
  if(!Array.isArray(original.implementationPins)||original.implementationPins.length!==current.implementationPins.length)throw new Error('Resolution recovery implementation roster changed.');
  const changes=[];
  for(let i=0;i<current.implementationPins.length;i++){
    const before=original.implementationPins[i],after=current.implementationPins[i];
    if(before.path!==after.path||before.path!==approvedPath&&JSON.stringify(before)!==JSON.stringify(after))throw new Error('Resolution recovery unrelated implementation changed.');
    if(before.path===approvedPath){if(!/^[a-f0-9]{64}$/.test(before.sha256)||!Number.isSafeInteger(before.bytes)||before.bytes<1||before.sha256===after.sha256)throw new Error('Resolution recovery requires the reviewed compatibility implementation change.');changes.push({path:approvedPath,beforeSha256:before.sha256,afterSha256:after.sha256});}
  }
  if(changes.length!==1)throw new Error('Resolution recovery implementation change is ambiguous.');
  const failure='Stage resolution-build failed with exit code 1.';
  const compatibility='Business entity-resolution build failed: A compatible national business registry 1.2.0 through 2.11.0 partial release with match profiles is required.';
  if(receipt.schemaVersion!==1||receipt.mode!=='production'||receipt.runId!==fromRunId||receipt.status!=='FAILED'||receipt.owner||receipt.stopRequested
    ||!Number.isFinite(Date.parse(receipt.finishedAt))||receipt.error!==failure||receipt.stages?.length!==8
    ||JSON.stringify(receipt.previousOutputs)!==JSON.stringify(original.previousOutputs)||JSON.stringify(Object.keys(receipt.outputs??{}))!==JSON.stringify(['registry']))throw new Error('Receipt is not the supported terminal resolution compatibility failure.');
  const clock=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value?Date.parse(value):NaN;
  let prior=clock(receipt.startedAt);const finished=clock(receipt.finishedAt);
  if(!Number.isFinite(prior)||!Number.isFinite(finished)||prior>finished||!Number.isFinite(clock(original.createdAt))||clock(original.createdAt)>prior)throw new Error('Resolution recovery run chronology is invalid.');
  const logs=[];
  for(let i=0;i<8;i++){
    const stage=receipt.stages[i];
    if(stage.id!==original.stages[i].id||stage.status!==(i<2?'SUCCEEDED':i===2?'FAILED':'SKIPPED')
      ||i<3&&(stage.exitCode!==(i===2?1:0)||!Number.isFinite(Date.parse(stage.startedAt))||!Number.isFinite(Date.parse(stage.finishedAt)))
      ||i>2&&[stage.pid,stage.exitCode,stage.startedAt,stage.finishedAt,stage.log,stage.error].some(v=>v!==null)
      ||i===2&&stage.error!==failure||i<2&&stage.error!==null||i>0&&stage.release!==undefined)throw new Error('Resolution recovery stage evidence is invalid.');
    if(i<3){if(stage.log?.path!==`${stage.id}.log`)throw new Error('Resolution recovery log identity is invalid.');const bytes=await evidence(`${directory}/${stage.log.path}`);
      const start=clock(stage.startedAt),end=clock(stage.finishedAt);if(!Number.isFinite(start)||!Number.isFinite(end)||start<prior||end<start||end>finished)throw new Error('Resolution recovery stage chronology is invalid.');prior=end;
      if(bytes.length!==stage.log.bytes||hash(bytes)!==stage.log.sha256)throw new Error('Resolution recovery log evidence changed.');logs.push(bytes.toString('utf8').trim());}
  }
  if(logs[2]!==compatibility)throw new Error('Resolution failure is not the exact historical compatibility error.');
  const terminal=(text)=>{const start=text.lastIndexOf('\n{');try{return JSON.parse(start<0?text:text.slice(start+1));}catch{throw new Error('Registry log lacks terminal JSON evidence.');}};
  const built=terminal(logs[0]),verified=terminal(logs[1]),registry=current.previousOutputs.registry;
  if(JSON.stringify(registry)!==JSON.stringify(receipt.outputs.registry)||JSON.stringify(receipt.stages[0].release)!==JSON.stringify(registry))throw new Error('Adopted registry differs from verified build receipt.');
  await emitted(root,'registry',original.previousOutputs.registry,[...current.sourcePins,...(current.optionalSourcePins??[])]);
  for(const group of ['resolution','benchmark','coverage'])if(JSON.stringify(current.previousOutputs[group])!==JSON.stringify(original.previousOutputs[group]))throw new Error(`Resolution recovery downstream ${group} changed.`);
  const manifest=JSON.parse(await evidence(registry.manifestPath));
  if(manifest.schema_version!=='1.0.0'||manifest.publisher?.id!=='national-business-registry'||manifest.publisher.version!=='2.12.0'||manifest.status!=='published-partial'||!Array.isArray(manifest.artifacts)||manifest.artifacts.length<1)throw new Error('Resolution recovery requires a registry 2.12 partial release.');
  if(built.release_id!==registry.releaseId||built.status!==manifest.status||typeof built.manifest!=='string'||path.resolve(built.manifest)!==path.join(root,registry.manifestPath)
    ||typeof built.release_directory!=='string'||path.resolve(built.release_directory)!==path.dirname(path.join(root,registry.manifestPath))
    ||JSON.stringify(built.coverage)!==JSON.stringify(manifest.coverage)||verified.dataset_id!==registry.datasetId||verified.release_id!==registry.releaseId
    ||verified.status!==manifest.status||verified.artifact_count!==manifest.artifacts.length||JSON.stringify(verified.coverage)!==JSON.stringify(manifest.coverage))throw new Error('Registry build and verification logs do not match adopted manifest.');
  const seen=new Set();
  for(const artifact of manifest.artifacts){
    if(typeof artifact.path!=='string'||!artifact.path||path.isAbsolute(artifact.path)||artifact.path.includes('\\')||artifact.path.split('/').some(p=>!p||p==='.'||p==='..')||seen.has(artifact.path)
      ||!Number.isSafeInteger(artifact.bytes)||artifact.bytes<0||!/^[a-f0-9]{64}$/.test(artifact.sha256))throw new Error('Adopted registry artifact contract is invalid.');
    seen.add(artifact.path);
    // Pin only resolution-consumed evidence here; the original independently
    // verified manifest attests the rest. Downstream consumers verify their own
    // artifact bytes, avoiding a repeated full 191M-assertion registry scan.
    if(!['entity-resolution-location-profile-jsonl-gzip','business-reporting-location-evidence-jsonl-gzip'].includes(artifact.artifact_type))continue;
    const file=rel(root,path.join(path.dirname(path.join(root,registry.manifestPath)),artifact.path)),actual=await fileHash(await safe(root,file));
    if(actual.sha256!==artifact.sha256||actual.bytes!==artifact.bytes)throw new Error('Adopted registry artifact changed.');evidencePins.push({path:file,...actual});
  }
  return {kind:'resolution-registry-compatibility',fromRunId,evidencePins,adoptedOutputs:{registry},implementationChanges:changes,
    artifactProofBoundary:'Current bytes pinned for resolution matching/reporting evidence only; original verifier log and immutable manifest attest other registry artifacts, which downstream consumers verify when read.',
    semantics:'Reuse the verified registry; build and verify resolution, benchmark and coverage with unchanged source inputs. No downloads or completed registry rebuild.'};
}
export async function runProductionReconciliation(plan,{root=APP_ROOT,readinessInspector=inspectNormalizedUsPostalMigration,executor=executeProductionStage,signal}={}) {
  root=await realpath(path.resolve(root));
  if(plan?.schemaVersion !== 1 || plan.mode !== 'production' || !ID.test(plan.runId??'') || hash(JSON.stringify(Object.fromEntries(Object.entries(plan).filter(([key])=>key!=='planSha256')))) !== plan.planSha256) throw new Error('Invalid production reconciliation plan.');
  if(plan.optionalSourcePins!==undefined&&(!Array.isArray(plan.optionalSourcePins)||!plan.optionalSourcePins.length||plan.optionalSourcePins.length>4||plan.optionalSourcePins.some(p=>!p||!Object.hasOwn(CHILDCARE,p.sourceKey))||new Set(plan.optionalSourcePins.map(p=>p.sourceKey)).size!==plan.optionalSourcePins.length))throw new Error('Invalid optional childcare input cohort.');
  const selected=Object.fromEntries((plan.optionalSourcePins??[]).map(p=>[p.sourceKey,p.sourceKey==='ohChildcareReceipt'?p.receiptPath:p.manifestPath]));
  if(plan.recovery&&!['benchmark-status-classification','resolution-registry-compatibility'].includes(plan.recovery.kind))throw new Error('Unknown production recovery kind.');
  const recoveryOptions=plan.recovery?.kind==='resolution-registry-compatibility'?{recoverResolutionFrom:plan.recovery.fromRunId}:{recoverBenchmarkFrom:plan.recovery?.fromRunId};
  if(Object.hasOwn(plan,'memoryPolicy')&&!isDeepStrictEqual(plan.memoryPolicy,productionMemoryPolicy(plan.memoryPolicy?.id)))throw new Error('Production memory policy changed.');
  const current = await planProductionReconciliation({root,runId:plan.runId,...recoveryOptions,...selected,
    ...(plan.retainedChildcarePin?{retainedChildcareSelection:plan.retainedChildcarePin.declaration.selection.path}:{}),memoryProfile:plan.memoryPolicy?.id,readinessInspector});
  for(const key of Object.keys(current).filter(key=>!['createdAt','planSha256'].includes(key))) if(JSON.stringify(current[key]) !== JSON.stringify(plan[key])) throw new Error(`Production reconciliation plan changed: ${key}.`);
  const runRoot=await safe(root,plan.outputRoot,false), lockPath=await safe(root,'data/reconciliations/controller.lock',false); await mkdir(path.dirname(lockPath),{recursive:true}); await safe(root,path.dirname(lockPath));
  let lock; const token=randomUUID();
  try { lock=await open(lockPath,'wx'); await lock.writeFile(`${JSON.stringify({pid:process.pid,runId:plan.runId,mode:'production',token,startedAt:new Date().toISOString()})}\n`); } catch(error) { if(lock){await lock.close();await unlink(lockPath);} if(error.code==='EEXIST') throw new Error('Another reconciliation owns the controller lock; inspect ownership before recovery.'); throw error; }
  const receipt={schemaVersion:1,mode:'production',runId:plan.runId,status:'RUNNING',startedAt:new Date().toISOString(),finishedAt:null,owner:{pid:process.pid},stopRequested:false,previousOutputs:plan.previousOutputs,outputs:{},stages:plan.stages.map(s=>({id:s.id,status:'PENDING',pid:null,exitCode:null,startedAt:null,finishedAt:null,log:null,error:null})),error:null};
  const receiptPath=path.join(runRoot,'receipt.json'), planPath=path.join(runRoot,'plan.json'); let initialized=false, persistenceError=null, saves=Promise.resolve(), poll=null, pendingPoll=null;
  if(plan.recovery)receipt.recovery=plan.recovery;
  if(plan.memoryPolicy)receipt.memoryPolicy=plan.memoryPolicy;
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
      const logPath=path.join(runRoot,`${stage.id}.log`);const result=await executor(stage,{cwd:root,logPath,memoryPolicy:plan.memoryPolicy,onSpawn:async pid=>{record.pid=pid;await save();}});
      record.exitCode=result?.exitCode??1;record.pid??=result?.pid??null;record.finishedAt=new Date().toISOString();record.log={path:path.basename(logPath),...await fileHash(logPath)};
      if(record.exitCode!==0)throw new Error(`Stage ${stage.id} failed with exit code ${record.exitCode}.`);
      if(stage.kind==='build') {const group=stage.id.split('-')[0];const expected=group==='registry'?[...plan.sourcePins,...(plan.optionalSourcePins??[]),...(plan.retainedChildcarePin?.declaration.bindings??[]).map(b=>({datasetId:b.dataset_id,releaseId:b.release_id,manifestSha256:b.manifest_sha256,manifestPath:b.manifest_path}))]:group==='resolution'?[outputs.registry]:group==='benchmark'?[outputs.registry,outputs.resolution]:[outputs.registry,outputs.resolution,outputs.benchmark,...plan.inputPins.filter(p=>p.id!=='zbp')];outputs[group]=await emitted(root,group,plan.previousOutputs[group],expected,plan.optionalSourcePins?.find(p=>p.sourceKey==='ohChildcareReceipt'));receipt.outputs[group]=outputs[group];record.release=outputs[group];}
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
