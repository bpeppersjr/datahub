import{buildNationalExactZipIndustryEvidenceMatrixV21 as build}from'../runner/national-exact-zip-industry-evidence-matrix-v2-1.mjs';
const output=process.argv[2]??undefined;console.log(JSON.stringify(await build(output?{outputRoot:output}:{}),null,2));
