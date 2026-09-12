import {createCliCancellation} from '../runner/cli-cancellation.mjs';
const cancellation=createCliCancellation();
try{if(process.argv.length!==2)throw Error('Fixed retained recovery accepts no overrides.');const {recoverCmsNursingHomes}=await import('../runner/cms-nursing-home-recovery.mjs');console.log(JSON.stringify(await recoverCmsNursingHomes({signal:cancellation.signal})));}
catch(error){if(error.recovery)console.log(JSON.stringify({recovery:error.recovery}));console.error('CMS nursing-home retained recovery did not complete. No source request or automatic retry.');process.exitCode=1;}
finally{cancellation.dispose();}
