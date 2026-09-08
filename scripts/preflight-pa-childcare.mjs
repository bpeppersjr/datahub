#!/usr/bin/env node
import { createCliCancellation } from '../runner/cli-cancellation.mjs';
import { acquirePaChildcarePreflight, writePaChildcarePreflight } from '../runner/pa-childcare-preflight.mjs';
const cancellation=createCliCancellation();
try{
  const args=process.argv.slice(2);
  if(args.length===1 && args[0]==='--help')process.stdout.write('Usage: node scripts/preflight-pa-childcare.mjs\nFixed Pennsylvania childcare policy, metadata and aggregate preflight only; no facility rows or acquisition approval.\n');
  else{
    if(args.length)throw Error('Unsupported arguments');
    const receipt=await acquirePaChildcarePreflight({signal:cancellation.signal});
    const saved=await writePaChildcarePreflight(receipt,{signal:cancellation.signal});
    process.stdout.write(JSON.stringify({...saved,source:receipt.source,readiness:receipt.readiness})+'\n');
  }
}catch(error){
  process.stderr.write(error?.code==='PA_CHILDCARE_PUBLICATION_INCOMPLETE'
    ? 'Pennsylvania preflight publication requires inspection: a receipt may already exist. Preserve the preflights directory; do not automatically repeat publication. No facility acquisition or approval.\n'
    : 'Pennsylvania childcare preflight did not complete. No facility acquisition or approval.\n');
  process.exitCode=1;
}
finally{cancellation.dispose();}
