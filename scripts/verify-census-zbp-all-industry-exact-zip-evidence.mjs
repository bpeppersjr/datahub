import {verifyCensusZbpAllIndustryExactZipEvidence} from '../runner/census-zbp-all-industry-exact-zip-evidence.mjs';

const controller=new AbortController();
for(const event of ['SIGINT','SIGTERM'])process.once(event,()=>controller.abort(new Error(`Cancelled by ${event}`)));
try{
 const result=await verifyCensusZbpAllIndustryExactZipEvidence({signal:controller.signal});
 process.stdout.write(`${JSON.stringify({verified:result.verified,dataset_id:result.dataset_id,source_release_id:result.source_release_id,profile_index_release_id:result.profile_index_release_id,counts:result.counts,claims:result.claims},null,2)}\n`);
}catch(error){process.stderr.write(`${error.stack??error}\n`);process.exitCode=1;}
