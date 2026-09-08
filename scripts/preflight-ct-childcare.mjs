#!/usr/bin/env node
import {createCliCancellation} from '../runner/cli-cancellation.mjs';
const cancellation=createCliCancellation();
try{
  if(process.argv.length!==2)throw Error('Unexpected arguments');
  const {acquireCtChildcarePreflight,writeCtChildcarePreflight}=await import('../runner/ct-childcare-preflight.mjs');
  const receipt=await acquireCtChildcarePreflight({signal:cancellation.signal});
  process.stdout.write(JSON.stringify(await writeCtChildcarePreflight(receipt,{signal:cancellation.signal}))+'\n');
}catch(error){process.stderr.write(error?.code==='CT_CHILDCARE_PUBLICATION_INCOMPLETE'?'Connecticut preflight output may exist; preserve and inspect it before retry.\n':'Connecticut metadata/count preflight did not complete; no facility rows were requested.\n');process.exitCode=1;}
finally{cancellation.dispose();}
