import {buildExactZipIndustryEvidenceMatrix} from '../runner/national-exact-zip-industry-evidence-matrix.mjs';
const result=await buildExactZipIndustryEvidenceMatrix({createdAt:new Date().toISOString()});process.stdout.write(`${JSON.stringify(result,null,2)}\n`);
