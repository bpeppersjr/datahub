import path from 'node:path';
import {createCliCancellation} from '../runner/cli-cancellation.mjs';
import {readRetainedChildcareCohortSnapshot} from '../runner/retained-childcare-cohort-snapshot.mjs';
const cancellation=createCliCancellation();
try{
  const args=process.argv.slice(2);
  if(args.length===1&&args[0]==='--help')console.log('Usage: node scripts/verify-retained-childcare-cohort-snapshot.mjs --manifest ABSOLUTE_MANIFEST --sha256 EXPECTED_HASH. Snapshot integrity only; no source replay or downloads.');
  else{
    if(args.length!==4||args[0]!=='--manifest'||!path.isAbsolute(args[1])||args[1]!==path.resolve(args[1])||args[2]!=='--sha256'||!/^[a-f0-9]{64}$/.test(args[3]))throw Error('Invalid arguments');
    const result=await readRetainedChildcareCohortSnapshot(args[1],args[3],{signal:cancellation.signal});console.log(JSON.stringify(result.verification));
  }
}catch{console.error('Retained childcare snapshot integrity verification failed. No source replay was performed.');process.exitCode=1;}
finally{cancellation.dispose();}
