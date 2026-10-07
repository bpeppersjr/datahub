import { buildStateExactZipIndustryEvidenceDispositionV30 } from "../runner/state-exact-zip-industry-evidence-disposition-v3-0.mjs";
process.stdout.write(
  JSON.stringify(
    await buildStateExactZipIndustryEvidenceDispositionV30(),
    null,
    2,
  ) + "\n",
);
