import {createCliCancellation} from '../runner/cli-cancellation.mjs';
const cancellation=createCliCancellation();
try{if(process.argv.length!==2)throw Error('The fixed retained hospital geocoder accepts no arguments.');const {geocodeRetainedCmsHospitals}=await import('../runner/cms-hospital-census-geocoding.mjs');console.log(JSON.stringify(await geocodeRetainedCmsHospitals({signal:cancellation.signal})));}
catch(error){if(error.recovery)console.log(JSON.stringify({recovery:error.recovery}));console.error('Hospital geocoding did not complete. Inspect retained evidence; no automatic retry.');process.exitCode=1;}
finally{cancellation.dispose();}
