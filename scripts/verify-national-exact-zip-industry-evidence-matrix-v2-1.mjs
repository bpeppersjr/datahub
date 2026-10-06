import{verifyNationalExactZipIndustryEvidenceMatrixV21 as verify,verifyRegisteredNationalExactZipIndustryEvidenceMatrixV21 as registered}from'../runner/national-exact-zip-industry-evidence-matrix-v2-1.mjs';
console.log(JSON.stringify(process.argv[2]?await verify(process.argv[2]):await registered(),null,2));
