import { verifyZipDenominatorGapCohort } from "../runner/zip-denominator-gap-cohort.mjs";
const file=process.argv[2];if(!file)throw new Error("manifest path required");process.stdout.write(`${JSON.stringify(await verifyZipDenominatorGapCohort(file),null,2)}\n`);
