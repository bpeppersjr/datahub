#!/usr/bin/env node
import path from 'node:path';
import { createCliCancellation } from '../runner/cli-cancellation.mjs';
const cancellation=createCliCancellation();
try{
  const args=process.argv.slice(2);
  if(args.length!==2||args[0]!=='--manifest'||!path.isAbsolute(args[1])||args[1]!==path.resolve(args[1]))throw Error('Exact absolute manifest required');
  cancellation.signal.throwIfAborted();
  const {readCoChildcareNormalizedRelease}=await import('../runner/co-childcare-normalized-release.mjs');
  const {verification}=await readCoChildcareNormalizedRelease(args[1],{signal:cancellation.signal});
  process.stdout.write(JSON.stringify(verification)+'\n');
}catch{process.stderr.write('Colorado normalized evidence could not be verified. Preserve and inspect retained files; no source request was made.\n');process.exitCode=1;}
finally{cancellation.dispose();}
