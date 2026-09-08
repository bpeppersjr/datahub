#!/usr/bin/env node
import {createCliCancellation} from '../runner/cli-cancellation.mjs';
const cancellation=createCliCancellation();
try{
 if(process.argv.length===3&&process.argv[2]==='--help')process.stdout.write('Usage: node scripts/preflight-vt-childcare.mjs\nMetadata and aggregate review only; no provider records.\n');
 else{
  if(process.argv.length!==2)throw Error('Unexpected arguments');
  const {acquireVtChildcarePreflight,writeVtChildcarePreflight}=await import('../runner/vt-childcare-preflight.mjs');
  const receipt=await acquireVtChildcarePreflight({signal:cancellation.signal});
  process.stdout.write(JSON.stringify(await writeVtChildcarePreflight(receipt,{signal:cancellation.signal}))+'\n');
 }
}catch(error){process.stderr.write(error?.code==='VT_CHILDCARE_PUBLICATION_INCOMPLETE'?'Vermont preflight output may exist; preserve and inspect it before retry.\n':'Vermont metadata/aggregate preflight did not complete; no provider rows were requested.\n');process.exitCode=1;}
finally{cancellation.dispose();}
