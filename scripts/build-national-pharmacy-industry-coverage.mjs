import { buildNationalPharmacyIndustryCoverage } from '../runner/national-pharmacy-industry-coverage.mjs';
try { const result = await buildNationalPharmacyIndustryCoverage(); process.stdout.write(`${JSON.stringify({ release_id: result.manifest.release_id, manifest_sha256: result.manifestSha256, coverage: result.coverage })}\n`); }
catch (error) { process.stderr.write(`National pharmacy industry coverage build failed: ${error.message}\n`); process.exitCode = 1; }
