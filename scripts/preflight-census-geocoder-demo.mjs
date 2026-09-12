import {createCliCancellation} from '../runner/cli-cancellation.mjs';
const cancellation=createCliCancellation();
try{if(process.argv.length!==2)throw Error('The public demo accepts no arguments.');const {runCensusGeocoderDemo}=await import('../runner/census-geocoder-demo-prerequisite.mjs');console.log(JSON.stringify(await runCensusGeocoderDemo({signal:cancellation.signal})));}
catch(error){if(error.recovery)console.log(JSON.stringify({recovery:error.recovery}));console.error('Census public-demo prerequisite did not complete. Inspect retained evidence; no automatic retry.');process.exitCode=1;}
finally{cancellation.dispose();}
