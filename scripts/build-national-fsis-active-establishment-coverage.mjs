import { buildNationalFsisActiveEstablishmentCoverage } from '../runner/national-fsis-active-establishment-coverage.mjs';
const result = await buildNationalFsisActiveEstablishmentCoverage();
console.log(JSON.stringify({ release_id: result.manifest.release_id, manifest_sha256: result.manifestSha256, coverage: result.coverage }, null, 2));
