import { buildNationalEpaEchoActiveFacilityCoverage } from '../runner/national-epa-echo-active-facility-coverage.mjs';
const result = await buildNationalEpaEchoActiveFacilityCoverage();
console.log(JSON.stringify({ release_id: result.manifest.release_id, manifest_sha256: result.manifestSha256, coverage: result.coverage }, null, 2));


