import {createCliCancellation} from '../runner/cli-cancellation.mjs';
// No injected transport or arbitrary endpoint is accepted by this native CLI.
const cancellation=createCliCancellation();
try{
 if(process.argv.length!==2)throw Error('Unsupported arguments.');
 const {runMeAscPreflight}=await import('../runner/me-asc-preflight-session.mjs');
 const {persistMeAscReceipt}=await import('../runner/me-asc-preflight-receipt.mjs');
 const receipt=await runMeAscPreflight({signal:cancellation.signal});
 const result=await persistMeAscReceipt(receipt,{signal:cancellation.signal});
 process.stdout.write(JSON.stringify(result)+'\n');
 if(receipt.status==='inspection-required')process.exitCode=2;
}catch{process.stderr.write('Maine ASC metadata preflight did not complete; inspect local evidence before retry.\n');process.exitCode=1;}
finally{cancellation.dispose();}
