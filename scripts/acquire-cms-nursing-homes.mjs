import {createCliCancellation} from '../runner/cli-cancellation.mjs';
const cancellation=createCliCancellation();
try {
 if(process.argv.length!==2)throw Error('This fixed national acquisition accepts no source or output overrides.');
 cancellation.signal.throwIfAborted();
 const {acquireCmsNursingHomes}=await import('../runner/cms-nursing-home-acquisition.mjs');
 console.log(JSON.stringify(await acquireCmsNursingHomes({signal:cancellation.signal})));
} catch(error) {
 if(error.recovery)console.log(JSON.stringify({recovery:error.recovery}));
 console.error('CMS nursing-home acquisition did not complete. Inspect retained evidence; no automatic retry.');process.exitCode=1;
} finally {cancellation.dispose();}
