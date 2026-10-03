import {publishCmsRetainedDirectoryZipEvidence} from '../runner/cms-retained-directory-zip-evidence.mjs';
const args=process.argv.slice(2);
if(args.length!==2||args[0]!=='--created-at')throw Error('Usage: --created-at <canonical UTC instant>; retained-only publication, no current pointer.');
const controller=new AbortController();process.once('SIGINT',()=>controller.abort());process.once('SIGTERM',()=>controller.abort());
console.log(JSON.stringify(await publishCmsRetainedDirectoryZipEvidence({createdAt:args[1],signal:controller.signal}),null,2));
