import {verifyMnConstructionExactZipAdmission as verify} from '../runner/mn-construction-exact-zip-evidence.mjs';
if(process.argv.length!==2)throw Error('This verifier accepts no source or output overrides.');
const controller=new AbortController();for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>controller.abort());
const result=await verify({signal:controller.signal});console.log(JSON.stringify({status:result.status,dimension_id:result.dimension_id,source_release_id:result.source.release_id,summary:result.summary,claims:result.claims},null,2));
