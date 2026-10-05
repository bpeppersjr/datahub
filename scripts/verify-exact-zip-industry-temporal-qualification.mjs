import {readExactZipIndustryTemporalQualification} from '../runner/exact-zip-industry-temporal-qualification.mjs';
const result=await readExactZipIndustryTemporalQualification({zip5:'10000'});
process.stdout.write(`${JSON.stringify({status:'verified',release_id:result.provenance.release_id,manifest_sha256:result.provenance.manifest_sha256,summary:result.summary},null,2)}\n`);
