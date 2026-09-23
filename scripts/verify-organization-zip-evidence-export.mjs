import { verifyOrganizationZipEvidenceExport } from '../runner/organization-zip-evidence-export.mjs';

try {
  const args = process.argv.slice(2); if (args.length !== 4 || args[0] !== '--manifest' || !args[1] || args[1].startsWith('--')) throw new Error('Usage: node scripts/verify-organization-zip-evidence-export.mjs --manifest <manifest.json> --sha256 <hash>');
  if (args[2] !== '--sha256' || !args[3]) throw new Error('Supply the manifest SHA-256.');
  if (!/^[a-f0-9]{64}$/.test(args[3])) throw new Error('Manifest SHA-256 is invalid.');
  process.stdout.write(`${JSON.stringify(await verifyOrganizationZipEvidenceExport(args[1], args[3]))}\n`);
} catch (error) { process.stderr.write(`Organization ZIP export verification failed: ${error.message}\n`); process.exitCode = 1; }
