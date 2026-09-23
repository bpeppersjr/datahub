import { verifyBroadOrganizationZipEvidence } from "../runner/broad-organization-zip-evidence.mjs";

try {
  const target = process.argv[2];
  if (!target || process.argv.length !== 3) throw new Error("Usage: node scripts/verify-broad-organization-zip-evidence.mjs <release-directory>");
  const result = await verifyBroadOrganizationZipEvidence(target);
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  process.stderr.write(`Broad organization ZIP evidence verification failed: ${error.message}\n`); process.exitCode = 1;
}
