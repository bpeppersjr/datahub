import {createCliCancellation} from '../runner/cli-cancellation.mjs';
import {discoverUtChildcareEdition,verifyUtChildcareEditionDiscovery} from '../runner/ut-childcare-edition-discovery.mjs';
const cancellation=createCliCancellation();
try {
 const args=process.argv.slice(2);
 if(args.length===1&&args[0]==='--help')console.log('Discover: --edition Month-YYYY\nVerify retained receipt: --verify <canonical manifest path> --sha256 <hash>\nOne fixed Utah reports-index request; no PDF download or automatic retry.');
 else if(args.length===2&&args[0]==='--edition')console.log(JSON.stringify(await discoverUtChildcareEdition({edition:args[1],signal:cancellation.signal})));
 else if(args.length===4&&args[0]==='--verify'&&args[2]==='--sha256'){
  const manifest=await verifyUtChildcareEditionDiscovery(args[1],args[3],{signal:cancellation.signal});
  console.log(JSON.stringify({runId:manifest.runId,result:manifest.result,claims:manifest.claims,retainedReceiptVerified:true,sourceRequestThisRead:false}));
 }else throw Error('Invalid arguments.');
}catch(error){if(error.recovery)console.log(JSON.stringify({recovery:error.recovery}));console.error('Utah edition discovery did not complete. Inspect arguments or retained evidence; no automatic retry.');process.exitCode=1;}
finally{cancellation.dispose();}
