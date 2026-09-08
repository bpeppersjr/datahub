#!/usr/bin/env node
import path from 'node:path';
import { APP_ROOT, assertInsideApp } from '../runner/paths.mjs';
import { createCliCancellation } from '../runner/cli-cancellation.mjs';
import { runMdChildcareAppJob, verifyMdChildcareAppJob } from '../runner/md-childcare-app.mjs';

const cancellation=createCliCancellation();
try {
  const args=process.argv.slice(2), values=new Map();
  if(args.length===1&&args[0]==='--help') process.stdout.write('Usage: node scripts/build-md-childcare.mjs [--output <datahub folder>] [--acquired <absolute retained manifest>]\nRuns standalone MD childcare collection, or offline retained-input reuse. No AI session required.\n');
  else {
    for(let i=0;i<args.length;i+=2){const key=args[i],value=args[i+1];if(!['--output','--acquired'].includes(key)||values.has(key)||!value||value.startsWith('--'))throw Error('Invalid arguments');values.set(key,value);}
    const acquiredManifestPath=values.get('--acquired');
    if(acquiredManifestPath!==undefined&&(!path.isAbsolute(acquiredManifestPath)||acquiredManifestPath!==path.resolve(acquiredManifestPath)))throw Error('Invalid retained path');
    const outputRoot=values.has('--output')?assertInsideApp(path.resolve(APP_ROOT,values.get('--output'))):undefined;
    const result=await runMdChildcareAppJob({outputRoot,acquiredManifestPath,signal:cancellation.signal,industryRunId:process.env.INDUSTRY_SEGMENT_RUN_ID});
    const verified=await verifyMdChildcareAppJob(result.receiptPath,{signal:cancellation.signal});
    if(JSON.stringify(verified.receipt)!==JSON.stringify(result.receipt))throw Error('Receipt changed');
    process.stdout.write(JSON.stringify(verified)+'\n');
  }
} catch(error) {
  let supplied;try{supplied=Object.getOwnPropertyDescriptor(error??{},'code')?.value;}catch{/* Do not expose injected error properties. */}
  const allowed=['MD_CHILDCARE_APP_INCOMPLETE','MD_CHILDCARE_PUBLICATION_INCOMPLETE','MD_CHILDCARE_NORMALIZATION_INCOMPLETE','MD_CHILDCARE_APP_DEADLINE','MD_CHILDCARE_APP_REJECTED','MD_CHILDCARE_PUBLISHER_BUSY','MD_CHILDCARE_DEFERRED','MD_CHILDCARE_PREFLIGHT_FAILED','MD_CHILDCARE_ACQUISITION_FAILED','MD_CHILDCARE_APP_CANCELLED','MD_CHILDCARE_APP_FAILED'];
  const code=allowed.includes(supplied)?supplied:'MD_CHILDCARE_CLI_FAILED';
  process.stderr.write(`${code}: Maryland collection did not finalize cleanly. Preserve and inspect app receipts and child releases before retrying.\n`);process.exitCode=1;
} finally {cancellation.dispose();}
