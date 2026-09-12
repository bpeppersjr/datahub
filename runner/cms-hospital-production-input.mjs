import path from 'node:path';
import {readdir} from 'node:fs/promises';
import {isDeepStrictEqual as same} from 'node:util';
import {APP_ROOT} from './paths.mjs';
import {loadCmsHospitalRegistryInput,cmsHospitalRegistryDeclaration} from './cms-hospital-registry-input.mjs';
import {retainedChildcareImplementationFiles} from './retained-childcare-production-input.mjs';
const check=v=>{if(!v)throw Error('CMS hospital production evidence changed or is invalid.');};
const NAMES=['manifest.json','intent.json','request-1.json','request-2.json','request-3.json','request-4.json','metadata-before.json','reuse-notice.pdf','source.csv','metadata-after.json','selected.jsonl','policy.json'].sort();
export async function pinCmsHospitalProductionInput(root,selection,{safe,fileHash}){
 check(path.resolve(root)===APP_ROOT);const selected=await safe(root,selection),input=await loadCmsHospitalRegistryInput(selected),directory=path.dirname(await safe(root,input.source.manifest_path));
 check(same((await readdir(directory)).sort(),NAMES));const files=[input.selection.path,...NAMES.map(name=>path.relative(root,path.join(directory,name)).replaceAll('\\','/'))].sort(),evidencePins=[];
 for(const file of files)evidencePins.push({path:file,...await fileHash(await safe(root,file))});
 const after=await loadCmsHospitalRegistryInput(selected);check(same(cmsHospitalRegistryDeclaration(input),cmsHospitalRegistryDeclaration(after))&&same((await readdir(directory)).sort(),NAMES));
 for(const pin of evidencePins)check(same({sha256:pin.sha256,bytes:pin.bytes},await fileHash(await safe(root,pin.path))));
 return {declaration:cmsHospitalRegistryDeclaration(input),evidencePins,admissionScope:'typed-registry-directory-rows-only',coverageProjectionImplemented:false};
}
export async function cmsHospitalImplementationFiles(root=APP_ROOT){return [...new Set([...await retainedChildcareImplementationFiles(root),'package.json','package-lock.json'])].sort();}
