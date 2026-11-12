#!/usr/bin/env node
import path from 'node:path';
import { APP_ROOT, assertInsideApp } from '../runner/paths.mjs';
import { createCliCancellation } from '../runner/cli-cancellation.mjs';
import { publishVtChildcareCurrentPointer, runVtChildcareAppJob, verifyVtChildcare } from '../runner/vt-childcare.mjs';

const cancellation=createCliCancellation();
try {
  const args=process.argv.slice(2), values=new Map();
  if(args.length===1&&args[0]==='--help') process.stdout.write('Usage: node scripts/build-vt-childcare.mjs [--output <datahub folder>] [--acquired <absolute retained manifest>]\nRuns standalone VT childcare collection or offline retained-input reuse, verifies the immutable receipt, and publishes the governed current pointer. No AI session required.\n');
  else {
    for(let i=0;i<args.length;i+=2){const key=args[i],value=args[i+1];if(!['--output','--acquired'].includes(key)||values.has(key)||!value||value.startsWith('--'))throw Error('Invalid arguments');values.set(key,value);}
    const acquiredManifestPath=values.get('--acquired');
    if(acquiredManifestPath!==undefined&&(!path.isAbsolute(acquiredManifestPath)||acquiredManifestPath!==path.resolve(acquiredManifestPath)))throw Error('Invalid retained path');
    const outputRoot=values.has('--output')?assertInsideApp(path.resolve(APP_ROOT,values.get('--output'))):path.join(APP_ROOT,'data/business-sources/vt-childcare-licensed-center-candidates');
    const result=await runVtChildcareAppJob({outputRoot,acquiredManifestPath,signal:cancellation.signal,industryRunId:process.env.INDUSTRY_SEGMENT_RUN_ID});
    const verified=await verifyVtChildcare(result.receiptPath,{signal:cancellation.signal});
    if(JSON.stringify(verified.receipt)!==JSON.stringify(result.receipt))throw Error('Receipt changed');
    const published=await publishVtChildcareCurrentPointer(outputRoot,verified,{signal:cancellation.signal});
    process.stdout.write(JSON.stringify({...verified,currentPointer:published.path})+'\n');
  }
} catch(error) {
  let supplied;try{supplied=Object.getOwnPropertyDescriptor(error??{},'code')?.value;}catch{/* Do not expose injected error properties. */}
  const allowed=['VT_CHILDCARE_APP_INCOMPLETE','VT_CHILDCARE_PUBLICATION_INCOMPLETE','VT_CHILDCARE_NORMALIZATION_INCOMPLETE','VT_CHILDCARE_APP_DEADLINE','VT_CHILDCARE_APP_REJECTED','VT_CHILDCARE_PUBLISHER_BUSY','VT_CHILDCARE_DEFERRED','VT_CHILDCARE_PREFLIGHT_FAILED','VT_CHILDCARE_ACQUISITION_FAILED','VT_CHILDCARE_APP_CANCELLED','VT_CHILDCARE_APP_FAILED'];
  const code=allowed.includes(supplied)?supplied:'VT_CHILDCARE_CLI_FAILED';
  process.stderr.write(`${code}: Vermont collection did not finalize cleanly. Preserve and inspect app receipts and child releases before retrying.\n`);process.exitCode=1;
} finally {cancellation.dispose();}
