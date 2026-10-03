import { buildZipDenominatorGapCohort } from "../runner/zip-denominator-gap-cohort.mjs";
const result=await buildZipDenominatorGapCohort();process.stdout.write(`${JSON.stringify(result,null,2)}\n`);
