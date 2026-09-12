import {createCliCancellation} from '../runner/cli-cancellation.mjs';
// No injected transport or arbitrary endpoint is accepted by this native CLI.
const cancellation=createCliCancellation();
try{
 const args=process.argv.slice(2);let managed;
 if(args.length){
  if(args.length!==4)throw Error('Unsupported arguments.');const fields=new Map();
  for(let i=0;i<args.length;i+=2){if(!['--output','--operation-id'].includes(args[i])||fields.has(args[i])||!args[i+1]||args[i+1].startsWith('--'))throw Error('Unsupported arguments.');fields.set(args[i],args[i+1]);}
  const {validateMeManagedOptions}=await import('../runner/me-asc-preflight-reader.mjs');
  managed=await validateMeManagedOptions({output:fields.get('--output'),operationId:fields.get('--operation-id')});
 }
 const {runMeAscPreflight}=await import('../runner/me-asc-preflight-session.mjs');
 const {persistMeAscReceipt}=await import('../runner/me-asc-preflight-receipt.mjs');
 const receipt=await runMeAscPreflight({signal:cancellation.signal});
 const result=await persistMeAscReceipt(receipt,{signal:cancellation.signal,...managed});
 process.stdout.write(JSON.stringify(result)+'\n');
 if(receipt.status==='inspection-required')process.exitCode=2;
}catch(error){if(error?.code==='ME_ASC_PUBLICATION_UNCERTAIN')process.stdout.write(JSON.stringify({recovery:error.recovery})+'\n');process.stderr.write('Maine ASC metadata preflight did not complete; inspect local evidence before retry.\n');process.exitCode=1;}
finally{cancellation.dispose();}
