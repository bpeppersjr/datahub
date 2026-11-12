import { buildNationalExactZipIndustryEvidenceMatrixV34 } from "../runner/national-exact-zip-industry-evidence-matrix-v3-3.mjs";
process.stdout.write(`${JSON.stringify(await buildNationalExactZipIndustryEvidenceMatrixV34(), null, 2)}\n`);
