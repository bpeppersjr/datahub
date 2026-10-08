import { buildNaicsReference } from '../runner/us-census-naics-reference.mjs';
const controller=new AbortController();
process.once('SIGINT',()=>controller.abort()); process.once('SIGTERM',()=>controller.abort());
try {
  const args=process.argv.slice(2);
  if(args[0]==='--help')console.log('Acquire: node scripts/build-us-census-naics-reference.mjs --acquire\nReplay: node scripts/build-us-census-naics-reference.mjs --replay <manifest>\nContract correction: node scripts/build-us-census-naics-reference.mjs --rebind-contracts <manifest>\nRecover failed acquisition: node scripts/build-us-census-naics-reference.mjs --recover-run <run-id>');
  else {
    if(!(args.length===1&&args[0]==='--acquire') && !(args.length===2&&['--replay','--rebind-contracts','--recover-run'].includes(args[0])))throw new Error('Choose --acquire, --replay <manifest>, --rebind-contracts <manifest>, or --recover-run <failed-run-id>.');
    const result=await buildNaicsReference({acquire:['--acquire','--recover-run'].includes(args[0]),retainedRunId:args[0]==='--recover-run'?args[1]:null,replayManifest:['--replay','--rebind-contracts'].includes(args[0])?args[1]:null,rebindContracts:args[0]==='--rebind-contracts',signal:controller.signal});
    console.log(JSON.stringify(result,null,2));
  }
} catch(error) { console.error(`NAICS reference operation failed: ${error.message}`);process.exitCode=1; }
