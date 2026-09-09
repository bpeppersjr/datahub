import path from 'node:path';
import {createCliCancellation} from '../runner/cli-cancellation.mjs';
import {summarizeIaChildcareAppJob} from '../runner/ia-childcare-reporting.mjs';
import {loadIaChildcareReportingEnrollment} from '../runner/ia-childcare-reporting-enrollment.mjs';
const cancellation=createCliCancellation();
try {
  const args=process.argv.slice(2);let report;
  if(args.length===1&&args[0]==='--help')console.log('Usage: node scripts/report-ia-childcare.mjs [--receipt ABSOLUTE_RECEIPT]. Offline retained reporting; no downloads.');
  else {
    if(args.length===0){report=await loadIaChildcareReportingEnrollment({signal:cancellation.signal});if(report.status!=='available')process.exitCode=2;}
    else {if(args.length!==2||args[0]!=='--receipt'||!path.isAbsolute(args[1])||args[1]!==path.resolve(args[1]))throw Error('Invalid arguments');report=await summarizeIaChildcareAppJob(args[1],{signal:cancellation.signal});}
    console.log(JSON.stringify(report));
  }
} catch {console.error('Iowa reporting failed verification. No acquisition was performed; preserve retained evidence.');process.exitCode=1;}
finally {cancellation.dispose();}
