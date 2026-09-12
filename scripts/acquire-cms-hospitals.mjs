import {createCliCancellation} from '../runner/cli-cancellation.mjs';
import {acquireCmsHospitals} from '../runner/cms-hospital-acquisition.mjs';
const cancellation=createCliCancellation();
try {if(process.argv.length!==2)throw Error('This fixed national acquisition accepts no source or output overrides.');console.log(JSON.stringify(await acquireCmsHospitals({signal:cancellation.signal})));}
catch(error){if(error.recovery)console.log(JSON.stringify({recovery:error.recovery}));console.error('CMS hospital acquisition did not complete. Inspect the retained run; no automatic retry.');process.exitCode=1;}
finally{cancellation.dispose();}
