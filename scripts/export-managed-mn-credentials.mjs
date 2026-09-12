import {createCliCancellation} from '../runner/cli-cancellation.mjs';
import {exportMnCredentialFlatForOperation} from '../runner/mn-credential-flat-export.mjs';
const cancellation=createCliCancellation();
try {
 const args=process.argv.slice(2),single=new Map(),fields=[],states=[];
 if(args.length%2)throw Error('Invalid arguments');
 for(let i=0;i<args.length;i+=2){const key=args[i],value=args[i+1];if(!['--output','--operation-id','--format','--field','--state'].includes(key)||!value||value.startsWith('--'))throw Error('Invalid arguments');
  if(key==='--field')fields.push(value);else if(key==='--state')states.push(value);else{if(single.has(key))throw Error('Duplicate argument');single.set(key,value);}}
 if(single.size!==3)throw Error('Missing arguments');
 const result=await exportMnCredentialFlatForOperation({selection:'config/mn-credential-registry-selection.json',policyMode:'local-review-only',format:single.get('--format'),fields,states,signal:cancellation.signal},{output:single.get('--output'),operationId:single.get('--operation-id')});
 console.log(JSON.stringify(result));
} catch(error) {if(error?.recovery)console.log(JSON.stringify({recovery:error.recovery}));console.error('Managed credential export did not complete; inspect operation output.');process.exitCode=1;}
finally{cancellation.dispose();}
