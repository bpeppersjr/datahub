#!/usr/bin/env node
import {createCliCancellation} from '../runner/cli-cancellation.mjs';
const cancellation=createCliCancellation();
try{
  if(process.argv.length!==2)throw Error('Unexpected arguments');
  const {acquireMdChildcarePreflight,writeMdChildcarePreflight}=await import('../runner/md-childcare-preflight.mjs');
  const receipt=await acquireMdChildcarePreflight({signal:cancellation.signal});
  process.stdout.write(JSON.stringify(await writeMdChildcarePreflight(receipt,{signal:cancellation.signal}))+'\n');
}catch(error){process.stderr.write(error?.code==='MD_CHILDCARE_PUBLICATION_INCOMPLETE'?'Maryland preflight output may exist; preserve and inspect it before retry.\n':'Maryland metadata/count preflight did not complete; no facility rows were requested.\n');process.exitCode=1;}
finally{cancellation.dispose();}
