#!/usr/bin/env node
import path from 'node:path';
import {createCliCancellation} from '../runner/cli-cancellation.mjs';
const cancellation=createCliCancellation();
try {
  const args=process.argv.slice(2);
  if(args.length!==2||args[0]!=='--manifest'||!path.isAbsolute(args[1])||args[1]!==path.resolve(args[1]))throw Error('Exact absolute manifest required');
  const {readIaChildcareNormalizedRelease}=await import('../runner/ia-childcare-normalized-release.mjs');
  const result=await readIaChildcareNormalizedRelease(args[1],{signal:cancellation.signal});
  process.stdout.write(JSON.stringify(result.verification)+'\n');
} catch {process.stderr.write('Iowa normalized evidence could not be verified. Preserve retained files; no source request was made.\n');process.exitCode=1;}
finally {cancellation.dispose();}
