import path from 'node:path';
import {readdir} from 'node:fs/promises';
import {APP_ROOT} from './paths.mjs';
import {loadRetainedChildcareRegistryInput,retainedChildcareRegistryDeclaration} from './retained-childcare-registry-input.mjs';

/** Conservative code/configuration inventory covers dynamic imports and PDF helpers too. */
export async function retainedChildcareImplementationFiles(root=APP_ROOT){
  const files=[];
  async function visit(directory){
    for(const entry of await readdir(path.join(root,directory),{withFileTypes:true})){
      if(entry.isSymbolicLink())throw Error('Retained childcare implementation crosses a link.');
      const file=`${directory}/${entry.name}`;
      if(entry.isDirectory())await visit(file);
      else if(entry.isFile()&&/\.(mjs|js|py|json|lock|ps1|bat)$/.test(entry.name))files.push(file);
      if(files.length>5000)throw Error('Retained childcare implementation inventory exceeds limit.');
    }
  }
  for(const directory of ['runner','scripts','config'])await visit(directory);
  return files.sort();
}

export async function pinRetainedChildcareProductionInput(root,selection,{safe,fileHash}){
  if(path.resolve(root)!==APP_ROOT)throw Error('Retained childcare production input requires the native app root.');
  const input=await loadRetainedChildcareRegistryInput(await safe(root,selection));
  const files=new Set([input.selection.path,...input.bindings.flatMap(b=>[b.enrollment_path,b.app_receipt_path,b.manifest_path,b.normalized_path])]);
  const evidencePins=[];for(const file of [...files].sort())evidencePins.push({path:file,...await fileHash(await safe(root,file))});
  return {declaration:retainedChildcareRegistryDeclaration(input),evidencePins};
}
