import { verifyNaicsReference } from '../runner/us-census-naics-reference.mjs';
try {
  if(process.argv.length!==3)throw new Error('Supply exactly one retained manifest path.');
  const result=await verifyNaicsReference(process.argv[2]);
  console.log(JSON.stringify({release_id:result.manifest.release_id,manifest_sha256:result.manifestSha256,code_count:result.manifest.code_count,editions:result.summaries.map(s=>({edition:s.edition,code_count:s.code_count,authority_scope:s.authority_scope}))},null,2));
}catch(error){console.error(`NAICS reference verification failed: ${error.message}`);process.exitCode=1;}
