import { buildNationalIrsEoBmfOrganizationCoverage } from '../runner/national-irs-eo-bmf-organization-coverage.mjs';

const result = await buildNationalIrsEoBmfOrganizationCoverage();
console.log(JSON.stringify({ release_id: result.manifest.release_id, manifest_sha256: result.manifestSha256, coverage: result.coverage }, null, 2));
