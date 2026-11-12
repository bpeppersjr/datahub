import path from "node:path";
import { verifyNationalExactZipIndustryEvidenceMatrixV34 } from "../runner/national-exact-zip-industry-evidence-matrix-v3-3.mjs";
const [manifest] = process.argv.slice(2); if (!manifest) throw new Error("Usage: <manifest.json>");
process.stdout.write(`${JSON.stringify(await verifyNationalExactZipIndustryEvidenceMatrixV34(path.resolve(manifest)), null, 2)}\n`);
