import path from 'node:path';
import {readdir} from 'node:fs/promises';
import {isDeepStrictEqual as same} from 'node:util';
import {APP_ROOT} from './paths.mjs';
import {loadCmsNursingHomeRegistryInput,cmsNursingHomeRegistryDeclaration} from './cms-nursing-home-registry-input.mjs';
import {retainedChildcareImplementationFiles} from './retained-childcare-production-input.mjs';

const check=v=>{if(!v)throw Error('CMS nursing-home production evidence changed or is invalid.');};
const FAILED_NAMES=['dictionary.pdf','failure.json','intent.json','metadata-after.json','metadata-before.json','request-1.json','request-2.json','request-3.json','request-4.json','request-5.json','reuse-notice.pdf','source.csv'].sort();
const RECOVERY_NAMES=['manifest.json','selected.jsonl'];
function options(root,tools){check(typeof root==='string'&&path.resolve(root)===APP_ROOT&&tools&&Object.getPrototypeOf(tools)===Object.prototype&&Reflect.ownKeys(tools).every(k=>['safe','fileHash','signal'].includes(k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(tools,k),'value'))&&typeof tools.safe==='function'&&typeof tools.fileHash==='function'&&(tools.signal===undefined||tools.signal instanceof AbortSignal));tools.signal?.throwIfAborted();}
/** Planner utility only: no plan, output, acquisition, recovery, or production pointer is created. */
export async function pinCmsNursingHomeProductionInput(root,selection,tools){options(root,tools);const {safe,fileHash,signal}=tools;check(typeof selection==='string');const selected=await safe(root,selection),input=await loadCmsNursingHomeRegistryInput(selected,{signal}),source=input.source;
 const recoveryDirectory=path.dirname(await safe(root,source.manifest_path)),failedDirectory=await safe(root,source.failed_source.directory);
 const roster=async()=>{signal?.throwIfAborted();check(same((await readdir(recoveryDirectory)).sort(),RECOVERY_NAMES)&&same((await readdir(failedDirectory)).sort(),FAILED_NAMES));};await roster();
 check(source.failed_source.files.length===12&&same(source.failed_source.files.map(f=>f.path).sort(),FAILED_NAMES));
 const expected=[{path:input.selection.path,sha256:input.selection.sha256,maxBytes:10000},{path:source.manifest_path,sha256:source.manifest_sha256,maxBytes:100000},{path:path.posix.join(path.posix.dirname(source.manifest_path),'selected.jsonl'),sha256:source.selected_artifact.sha256,bytes:source.selected_artifact.bytes,maxBytes:80000000},...source.failed_source.files.map(f=>({path:path.posix.join(source.failed_source.directory,f.path),sha256:f.sha256,bytes:f.bytes,maxBytes:f.bytes}))].sort((a,b)=>a.path.localeCompare(b.path));check(new Set(expected.map(p=>p.path)).size===15);
 const evidencePins=[];for(const pin of expected){signal?.throwIfAborted();const hash=await fileHash(await safe(root,pin.path));check(hash&&same(Object.keys(hash).sort(),['bytes','sha256'])&&hash.sha256===pin.sha256&&Number.isSafeInteger(hash.bytes)&&hash.bytes>0&&hash.bytes<=pin.maxBytes&&(pin.bytes===undefined||hash.bytes===pin.bytes));evidencePins.push({path:pin.path,sha256:hash.sha256,bytes:hash.bytes});}
 const after=await loadCmsNursingHomeRegistryInput(selected,{signal});check(same(cmsNursingHomeRegistryDeclaration(input),cmsNursingHomeRegistryDeclaration(after)));await roster();
 for(const pin of evidencePins){signal?.throwIfAborted();check(same({sha256:pin.sha256,bytes:pin.bytes},await fileHash(await safe(root,pin.path))));}await roster();signal?.throwIfAborted();
 return {declaration:cmsNursingHomeRegistryDeclaration(input),evidencePins,admissionScope:'typed-registry-nursing-home-directory-rows-only',sourceMode:'retained-native-source-recovery',registryAdmissionImplemented:true,coverageProjectionImplemented:true,productionReleaseVerified:false,catalogPublication:false,productionDispatchPerformed:false};
}
/** Same conservative dynamic-import closure used by other optional production sources. */
export async function cmsNursingHomeImplementationFiles(root=APP_ROOT){check(typeof root==='string'&&path.resolve(root)===APP_ROOT);return [...new Set([...await retainedChildcareImplementationFiles(root),'package.json','package-lock.json'])].sort();}
