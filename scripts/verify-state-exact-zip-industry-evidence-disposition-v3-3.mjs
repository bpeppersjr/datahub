import path from "node:path";
import { verifyStateExactZipIndustryEvidenceDispositionV33 } from "../runner/state-exact-zip-industry-evidence-disposition-v3-3.mjs";
const [manifest] = process.argv.slice(2); if (!manifest) throw Error("Usage: <manifest.json>"); console.log(JSON.stringify(await verifyStateExactZipIndustryEvidenceDispositionV33(path.resolve(manifest)), null, 2));
