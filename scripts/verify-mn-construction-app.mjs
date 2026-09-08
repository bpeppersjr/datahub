#!/usr/bin/env node
import { verifyMnConstructionAppJob } from '../runner/mn-construction-app.mjs';
import { resolveAppPath } from '../runner/paths.mjs';
import { createCliCancellation } from '../runner/cli-cancellation.mjs';
const cancellation=createCliCancellation();
try {
  const args=process.argv.slice(2);
  if(args.length!==2 || args[0]!=='--receipt' || !args[1])throw new Error('Exact receipt required.');
  process.stdout.write(JSON.stringify(await verifyMnConstructionAppJob(resolveAppPath(args[1]),{signal:cancellation.signal}),null,2)+'\n');
} catch {process.stderr.write('Minnesota app receipt verification failed; no acquisition was performed.\n');process.exitCode=1;}
finally {cancellation.dispose();}
