import {verifyRetainedChildcareZipEvidence} from '../runner/retained-childcare-zip-evidence.mjs';
const args=process.argv.slice(2);if(args.length!==1)throw Error('Usage: <manifest path>');
const controller=new AbortController();process.once('SIGINT',()=>controller.abort());process.once('SIGTERM',()=>controller.abort());
console.log(JSON.stringify(await verifyRetainedChildcareZipEvidence(args[0],{signal:controller.signal}),null,2));
