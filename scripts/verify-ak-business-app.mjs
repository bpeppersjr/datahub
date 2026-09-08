#!/usr/bin/env node
import { resolveAppPath } from '../runner/paths.mjs';
import { createCliCancellation } from '../runner/cli-cancellation.mjs';

const cancellation=createCliCancellation();
try {
  const args=process.argv.slice(2);
  if(args.length===1 && args[0]==='--help')process.stdout.write('Usage: node scripts/verify-ak-business-app.mjs --receipt <app receipt>\nRead-only local verification; no source acquisition.\n');
  else {
    if(args.length!==2||args[0]!=='--receipt'||!args[1]?.trim()||args[1].startsWith('--'))throw Error('Exact receipt required');
    const receipt=resolveAppPath(args[1]);cancellation.signal.throwIfAborted();
    const {verifyAkBusinessAppJob}=await import('../runner/ak-business-app.mjs');
    process.stdout.write(JSON.stringify(await verifyAkBusinessAppJob(receipt,{signal:cancellation.signal}),null,2)+'\n');
  }
} catch {
  process.stderr.write('Alaska app receipt could not be verified. Preserve and inspect retained evidence; no source acquisition was performed.\n');process.exitCode=1;
} finally {cancellation.dispose();}
