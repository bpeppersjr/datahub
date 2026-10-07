import path from "node:path";
import fs from "node:fs/promises";
import { APP_ROOT } from "../runner/paths.mjs";
import { verifyStateExactZipIndustryEvidenceDispositionV30 } from "../runner/state-exact-zip-industry-evidence-disposition-v3-0.mjs";
const r = JSON.parse(
  await fs.readFile(
    path.join(
      APP_ROOT,
      "config/datasets/state-exact-zip-industry-evidence-disposition-v3-0.json",
    ),
  ),
);
process.stdout.write(
  JSON.stringify(
    await verifyStateExactZipIndustryEvidenceDispositionV30(
      path.join(APP_ROOT, r.retained_release.manifest),
    ),
    null,
    2,
  ) + "\n",
);
