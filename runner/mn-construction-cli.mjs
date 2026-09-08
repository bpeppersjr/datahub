import path from 'node:path';
import { APP_ROOT, assertInsideApp } from './paths.mjs';
import { createCliCancellation } from './cli-cancellation.mjs';
import { runMnConstructionAppJob } from './mn-construction-app.mjs';

export async function runMnConstructionCli(cohort) {
  const cancellation=createCliCancellation();
  try {
    const args=process.argv.slice(2);
    if(args.length===1 && args[0]==='--help')process.stdout.write(`Usage: node ${path.basename(process.argv[1])} [--output <datahub folder>]\nFixed Minnesota ${cohort} app acquisition with durable receipts; no AI session required.\n`);
    else {
      if(args.length!==0 && !(args.length===2 && args[0]==='--output' && args[1] && !args[1].startsWith('--')))throw new Error('Invalid arguments.');
      const outputRoot=args[1]?assertInsideApp(path.resolve(APP_ROOT,args[1])):undefined;
      const result=await runMnConstructionAppJob({cohort,...(outputRoot?{outputRoot}:{}),signal:cancellation.signal,industryRunId:process.env.INDUSTRY_SEGMENT_RUN_ID??null});
      process.stdout.write(JSON.stringify(result,null,2)+'\n');
    }
  } catch(error) {
    process.stderr.write(JSON.stringify({status:'NOT_COMPLETED',message:'Inspect retained app receipts before another acquisition.',run_id:error.run_id??null,receipt_path:error.receipt_path??null})+'\n');process.exitCode=1;
  } finally {cancellation.dispose();}
}
