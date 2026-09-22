import {createCliCancellation} from '../runner/cli-cancellation.mjs';
const cancellation=createCliCancellation();
try{if(process.argv.length!==2)throw Error('No arguments accepted.');const {acquireCmsSnfPecos}=await import('../runner/cms-snf-pecos-acquisition.mjs');console.log(JSON.stringify(await acquireCmsSnfPecos({signal:cancellation.signal})));}
catch(e){if(e.recovery)console.log(JSON.stringify({recovery:e.recovery}));console.error('PECOS acquisition unavailable or requires inspection; no automatic retry.');process.exitCode=1;}
finally{cancellation.dispose();}
