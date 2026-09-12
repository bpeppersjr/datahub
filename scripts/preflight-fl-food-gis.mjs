import {createCliCancellation} from '../runner/cli-cancellation.mjs';
import {preflightFlFoodGis,verifyFlFoodGisPreflight} from '../runner/fl-food-gis-preflight.mjs';
const cancellation=createCliCancellation();
try{const args=process.argv.slice(2);if(args.length===1&&args[0]==='--help')console.log('No arguments: fixed FDACS service/retail-layer/iteminfo metadata only; no establishment query.\n--verify <canonical manifest path> --sha256 <hash>: offline receipt verification.');
else if(args.length===0)console.log(JSON.stringify(await preflightFlFoodGis({signal:cancellation.signal})));
else if(args.length===4&&args[0]==='--verify'&&args[2]==='--sha256'){const m=await verifyFlFoodGisPreflight(args[1],args[3],{signal:cancellation.signal});console.log(JSON.stringify({runId:m.runId,result:m.result,claims:m.claims,sourceRequestsThisRead:false}));}
else throw Error('Invalid arguments.');}catch(error){if(error.recovery)console.log(JSON.stringify({recovery:error.recovery}));console.error('Florida FDACS metadata preflight did not complete. Inspect arguments or retained receipt; no automatic retry.');process.exitCode=1;}finally{cancellation.dispose();}
