import {publishNationalReportingTenEnrollment} from '../runner/national-reporting-ten-enrollment-publisher.mjs';

const usage='Usage: node scripts/publish-national-reporting-ten-enrollment.mjs <production-run-id>\nValidates one completed production receipt and the current reporting evidence, then atomically creates the ten-source enrollment. It never runs production or downloads data.\n';
const args=process.argv.slice(2);
if(args.length===1&&args[0]==='--help')process.stdout.write(usage);
else if(args.length!==1){process.stderr.write(usage);process.exitCode=2;}
else{
  const stop=new AbortController(),cancel=()=>stop.abort();process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
  try{process.stdout.write(`${JSON.stringify(await publishNationalReportingTenEnrollment(args[0],{signal:stop.signal}),null,2)}\n`);}
  catch(error){process.stderr.write(`Ten-source enrollment was not published: ${error.message}\n`);process.exitCode=1;}
  finally{process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);}
}
