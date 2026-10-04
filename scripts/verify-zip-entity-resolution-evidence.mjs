import path from 'node:path';
import {APP_ROOT} from '../runner/paths.mjs';
import {DATASET,verifyZipEntityResolutionEvidence} from '../runner/zip-entity-resolution-evidence.mjs';

const config=JSON.parse(await (await import('node:fs/promises')).readFile(path.join(APP_ROOT,`config/datasets/${DATASET}.json`),'utf8'));
const result=await verifyZipEntityResolutionEvidence(path.join(APP_ROOT,config.retained_release.manifest),{root:APP_ROOT});
console.log(JSON.stringify(result,null,2));
