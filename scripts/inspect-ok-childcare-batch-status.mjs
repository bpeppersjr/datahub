import {createCliCancellation} from '../runner/cli-cancellation.mjs';
const args=process.argv.slice(2),cancellation=createCliCancellation();
try{
 if(args.length!==2||args[0]!=='--output')throw Error('Invalid arguments');
 const {inspectOkChildcareBatchStatus}=await import('../runner/ok-childcare-batch-status.mjs');
 const result=await inspectOkChildcareBatchStatus(args[1],{signal:cancellation.signal});console.log(JSON.stringify(result));if(!result.available)process.exitCode=1;
}catch{console.error('Oklahoma retained batch status unavailable. Supply --output ABSOLUTE_PATH. No source request or retry was authorized.');process.exitCode=1;}
finally{cancellation.dispose();}
