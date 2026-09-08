#!/usr/bin/env node
import { resolveAppPath } from '../runner/paths.mjs';
import { createCliCancellation } from '../runner/cli-cancellation.mjs';

const cancellation=createCliCancellation();
try {
  const args=process.argv.slice(2);
  if(args.length===1 && args[0]==='--help') {
    process.stdout.write('Usage: node scripts/run-ak-business-app.mjs [--output <datahub folder>] [--retained-manifest <immutable manifest>]\nOmitting --retained-manifest explicitly acquires source data. Retained mode verifies local evidence without acquisition.\n');
  } else {
    const values=new Map();
    for(let i=0;i<args.length;i+=2){
      const flag=args[i],value=args[i+1];
      if(!['--output','--retained-manifest'].includes(flag)||values.has(flag)||typeof value!=='string'||!value.trim()||value.startsWith('--'))throw Error('Invalid arguments');
      values.set(flag,value);
    }
    const outputRoot=resolveAppPath(values.get('--output')??'data/business-sources/ak-active-business-licenses/app');
    const retainedManifest=values.has('--retained-manifest')?resolveAppPath(values.get('--retained-manifest')):undefined;
    cancellation.signal.throwIfAborted();
    const {runAkBusinessAppJob}=await import('../runner/ak-business-app.mjs');
    const result=await runAkBusinessAppJob({outputRoot,signal:cancellation.signal,industryRunId:process.env.INDUSTRY_SEGMENT_RUN_ID??null,...(retainedManifest===undefined?{}:{retainedManifest})});
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
  }
} catch {
  process.stderr.write('Alaska app job did not finalize cleanly. Preserve and inspect retained job and publication evidence before any retry; completed or partial publication may exist.\n');
  process.exitCode=1;
} finally {cancellation.dispose();}
