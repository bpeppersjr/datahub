import path from "node:path";
import { verifyNationalExactZipIndustryEvidenceMatrixV33 } from "../runner/national-exact-zip-industry-evidence-matrix-v3-3.mjs";
const [manifest] = process.argv.slice(2); if (!manifest) throw Error("Usage: <manifest.json>");
console.log(JSON.stringify(await verifyNationalExactZipIndustryEvidenceMatrixV33(path.resolve(manifest)), null, 2));
