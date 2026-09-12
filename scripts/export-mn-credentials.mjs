import {createCliCancellation} from '../runner/cli-cancellation.mjs';
const cancellation=createCliCancellation();
try{
 const args=process.argv.slice(2),fields=new Map(),selectedFields=[],states=[];
 if(args.length<6||args.length%2)throw Error('Arguments');
 for(let i=0;i<args.length;i+=2){const flag=args[i],value=args[i+1];if(!['--selection','--policy-mode','--format','--field','--state'].includes(flag)||!value||value.startsWith('--'))throw Error('Arguments');if(flag==='--field')selectedFields.push(value);else if(flag==='--state')states.push(value);else{if(fields.has(flag))throw Error('Arguments');fields.set(flag,value);}}
 if(fields.size!==3||fields.get('--selection')!=='config/mn-credential-registry-selection.json'||fields.get('--policy-mode')!=='local-review-only'||!['csv','jsonl','both'].includes(fields.get('--format')))throw Error('Arguments');
 const {exportMnCredentialFlat}=await import('../runner/mn-credential-flat-export.mjs');
 console.log(JSON.stringify(await exportMnCredentialFlat({selection:fields.get('--selection'),policyMode:fields.get('--policy-mode'),format:fields.get('--format'),...(selectedFields.length?{fields:selectedFields}:{}),states,signal:cancellation.signal})));
}catch(error){if(error?.code==='MN_CREDENTIAL_EXPORT_UNCERTAIN')console.log(JSON.stringify({recovery:error.recovery}));console.error('Typed local-review credential export did not complete; inspect retained evidence.');process.exitCode=1;}
finally{cancellation.dispose();}
