#!/usr/bin/env node
import path from 'node:path';
import {createCliCancellation} from '../runner/cli-cancellation.mjs';
import {summarizeVtChildcareAppJob} from '../runner/vt-childcare-reporting.mjs';
import {loadVtChildcareReportingEnrollment} from '../runner/vt-childcare-reporting-enrollment.mjs';
const cancellation=createCliCancellation();
try {
  const args=process.argv.slice(2);let report;
  if(args.length===0){report=await loadVtChildcareReportingEnrollment({signal:cancellation.signal});if(report.status!=='available')process.exitCode=2;}
  else {
    if(args.length!==2||args[0]!=='--receipt'||!path.isAbsolute(args[1])||args[1]!==path.resolve(args[1]))throw Error('Invalid arguments');
    report=await summarizeVtChildcareAppJob(args[1],{signal:cancellation.signal});
  }
  process.stdout.write(JSON.stringify(report)+'\n');
}catch{process.stderr.write('Vermont reporting failed verification. No acquisition was performed; preserve and inspect retained evidence.\n');process.exitCode=1;}
finally{cancellation.dispose();}
