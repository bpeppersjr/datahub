import path from "node:path";
import { verifyCmsRetainedDirectoryCoverageCatalog } from "../runner/cms-retained-directory-coverage-catalog.mjs";

const args = process.argv.slice(2);
const usage = "Usage: node scripts/verify-cms-retained-directory-coverage-catalog.mjs --manifest <manifest.json> --expected-manifest-sha256 <64-hex-sha256>";
if (args.length === 1 && args[0] === "--help") {
  process.stdout.write(`${usage}\n`);
  process.exit(0);
}
const values = new Map();
for (let index = 0; index < args.length; index += 1) {
  const flag = args[index];
  if (!["--manifest", "--expected-manifest-sha256"].includes(flag) || values.has(flag) || !args[index + 1] || args[index + 1].startsWith("--")) throw new Error(usage);
  values.set(flag, args[index + 1]);
  index += 1;
}
if (values.size !== 2) throw new Error(usage);
const manifestPath = path.resolve(values.get("--manifest"));
const expectedManifestSha256 = values.get("--expected-manifest-sha256");
if (!/^[a-f0-9]{64}$/.test(expectedManifestSha256)) throw new Error(usage);
const result = await verifyCmsRetainedDirectoryCoverageCatalog(manifestPath, { expectedManifestSha256 });
process.stdout.write(`${JSON.stringify({ release_id: result.manifest.release_id, manifest_sha256: result.manifestSha256, jurisdiction_count: result.manifest.jurisdiction_count, source_count: result.manifest.source_count, denominators: result.manifest.denominators, network_requests_performed: 0, production_enrollment: false, national_reporting_denominator_enrollment: false, current_pointer_written: false, valid: true }, null, 2)}\n`);
