import path from 'node:path';
import {verifyCmsRetainedDirectoryZipEvidence} from '../runner/cms-retained-directory-zip-evidence.mjs';
const args=process.argv.slice(2);if(args.length!==1)throw Error('Usage: <manifest.json>; full retained-source replay, no writes.');
const controller=new AbortController();process.once('SIGINT',()=>controller.abort());process.once('SIGTERM',()=>controller.abort());
console.log(JSON.stringify(await verifyCmsRetainedDirectoryZipEvidence(path.resolve(args[0]),{signal:controller.signal}),null,2));
