import {createCliCancellation} from '../runner/cli-cancellation.mjs';
import {buildCmsHospitalAdoption} from '../runner/cms-hospital-adoption.mjs';
const cancellation=createCliCancellation();
try {
  if(process.argv.length!==4||process.argv[2]!=='--operation-id')throw Error('Closed adoption request required.');
  console.log(JSON.stringify(await buildCmsHospitalAdoption({operationId:process.argv[3]},{signal:cancellation.signal})));
} catch(error) {
  if(error.recovery)console.log(JSON.stringify({recovery:error.recovery}));
  console.error('CMS hospital retained adoption did not complete. Preserve the operation for inspection; no automatic retry.');process.exitCode=1;
} finally {cancellation.dispose();}
