import path from 'node:path';
import {readdir} from 'node:fs/promises';
import {isDeepStrictEqual as same} from 'node:util';
import {APP_ROOT} from './paths.mjs';
import {mnSelectionReadJson as readJson} from './mn-construction-retained-selection.mjs';
import {loadMnCredentialRegistryInput,mnCredentialRegistryDeclaration} from './mn-credential-registry-input.mjs';
import {retainedChildcareImplementationFiles} from './retained-childcare-production-input.mjs';

const relative=file=>path.relative(APP_ROOT,file).replaceAll('\\','/');
const check=value=>{if(!value)throw Error('Minnesota production evidence changed or is invalid.');};

async function roster(input,safe){
  const job=path.dirname(await safe(APP_ROOT,input.source.source_app_receipt));
  const receipt=await readJson(path.join(job,'receipt.json'),30000);
  const acquisitionFile=await safe(APP_ROOT,path.join(job,receipt.acquisition.path));
  const acquisition=await readJson(acquisitionFile,1000000);
  const selected=path.dirname(await safe(APP_ROOT,acquisition.evidence.bundle.manifest_path));
  check(path.dirname(path.dirname(selected))===job);
  const jobNames=(await readdir(job)).sort(),selectedNames=(await readdir(selected)).sort();
  check(same(selectedNames,['manifest.json','normalized.jsonl','selected.jsonl','selection-receipt.json']));
  const files=[input.selection.path,input.source.manifest_path,input.source.artifact_path,
    'config/mn-construction-app-enrollment.json','config/source-policies/mn-construction-internal-acquisition.json',
    ...['start.json','receipt.json','acquisition-checkpoint.json','notices-before.json','schema-preflight.json',
      ...(jobNames.includes('publisher-wait.json')?['publisher-wait.json']:[])].map(name=>relative(path.join(job,name))),
    relative(acquisitionFile),...selectedNames.map(name=>relative(path.join(selected,name)))];
  check(new Set(files).size===files.length);
  return {files:files.sort(),jobNames,selectedNames};
}

/** Replay only the selected retained lineage; never acquire or scan sibling jobs. */
export async function pinMnCredentialProductionInput(root,selection,{safe,fileHash}){
  check(path.resolve(root)===APP_ROOT);
  const selectedPath=await safe(root,selection),input=await loadMnCredentialRegistryInput(selectedPath);
  const before=await roster(input,safe),evidencePins=[];
  for(const file of before.files)evidencePins.push({path:file,...await fileHash(await safe(root,file))});
  const replay=await loadMnCredentialRegistryInput(selectedPath);
  check(same(mnCredentialRegistryDeclaration(input),mnCredentialRegistryDeclaration(replay))&&same(before,await roster(replay,safe)));
  for(const pin of evidencePins)check(same({sha256:pin.sha256,bytes:pin.bytes},await fileHash(await safe(root,pin.path))));
  return {declaration:mnCredentialRegistryDeclaration(input),evidencePins};
}

export async function mnCredentialImplementationFiles(root=APP_ROOT){
  return [...new Set([...await retainedChildcareImplementationFiles(root),'package.json','package-lock.json'])].sort();
}
