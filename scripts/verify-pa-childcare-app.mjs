#!/usr/bin/env node
import path from 'node:path';
import { createCliCancellation } from '../runner/cli-cancellation.mjs';
import { verifyPaChildcareAppJob } from '../runner/pa-childcare-app.mjs';
const cancellation=createCliCancellation();
try {
  const args=process.argv.slice(2);
  if(args.length!==2||args[0]!=='--receipt'||!path.isAbsolute(args[1])||args[1]!==path.resolve(args[1]))throw Error('Invalid receipt');
  process.stdout.write(JSON.stringify(await verifyPaChildcareAppJob(args[1],{signal:cancellation.signal}))+'\n');
} catch {process.stderr.write('Pennsylvania app verification failed. Preserve and inspect retained evidence; no acquisition was performed.\n');process.exitCode=1;}
finally {cancellation.dispose();}
