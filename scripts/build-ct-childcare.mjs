#!/usr/bin/env node
import path from 'node:path';
import { APP_ROOT, assertInsideApp } from '../runner/paths.mjs';
import { createCliCancellation } from '../runner/cli-cancellation.mjs';
import { runCtChildcareAppJob, verifyCtChildcareAppJob } from '../runner/ct-childcare-app.mjs';

const cancellation=createCliCancellation();
try {
  const args=process.argv.slice(2), values=new Map();
  if(args.length===1&&args[0]==='--help') process.stdout.write('Usage: node scripts/build-ct-childcare.mjs [--output <datahub folder>] [--acquired <absolute retained manifest>]\nRuns standalone CT childcare collection, or offline retained-input reuse. No AI session required.\n');
  else {
    for(let i=0;i<args.length;i+=2){const key=args[i],value=args[i+1];if(!['--output','--acquired'].includes(key)||values.has(key)||!value||value.startsWith('--'))throw Error('Invalid arguments');values.set(key,value);}
    const acquiredManifestPath=values.get('--acquired');
    if(acquiredManifestPath!==undefined&&(!path.isAbsolute(acquiredManifestPath)||acquiredManifestPath!==path.resolve(acquiredManifestPath)))throw Error('Invalid retained path');
    const outputRoot=values.has('--output')?assertInsideApp(path.resolve(APP_ROOT,values.get('--output'))):undefined;
    const result=await runCtChildcareAppJob({outputRoot,acquiredManifestPath,signal:cancellation.signal,industryRunId:process.env.INDUSTRY_SEGMENT_RUN_ID});
    const verified=await verifyCtChildcareAppJob(result.receiptPath,{signal:cancellation.signal});
    if(JSON.stringify(verified.receipt)!==JSON.stringify(result.receipt))throw Error('Receipt changed');
    process.stdout.write(JSON.stringify(verified)+'\n');
  }
} catch(error) {
  let supplied;try{supplied=Object.getOwnPropertyDescriptor(error??{},'code')?.value;}catch{/* Do not expose injected error properties. */}
  const allowed=['CT_CHILDCARE_APP_INCOMPLETE','CT_CHILDCARE_PUBLICATION_INCOMPLETE','CT_CHILDCARE_NORMALIZATION_INCOMPLETE','CT_CHILDCARE_APP_DEADLINE','CT_CHILDCARE_APP_REJECTED','CT_CHILDCARE_PUBLISHER_BUSY','CT_CHILDCARE_DEFERRED','CT_CHILDCARE_PREFLIGHT_FAILED','CT_CHILDCARE_ACQUISITION_FAILED','CT_CHILDCARE_APP_CANCELLED','CT_CHILDCARE_APP_FAILED'];
  const code=allowed.includes(supplied)?supplied:'CT_CHILDCARE_CLI_FAILED';
  process.stderr.write(`${code}: Connecticut collection did not finalize cleanly. Preserve and inspect app receipts and child releases before retrying.\n`);process.exitCode=1;
} finally {cancellation.dispose();}
