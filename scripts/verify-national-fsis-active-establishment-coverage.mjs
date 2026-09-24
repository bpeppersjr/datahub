import { verifyNationalFsisActiveEstablishmentCoverageCurrent } from '../runner/national-fsis-active-establishment-coverage.mjs';
const result = await verifyNationalFsisActiveEstablishmentCoverageCurrent();
console.log(JSON.stringify({ release_id: result.manifest.release_id, manifest_sha256: result.manifestSha256, pointer_sha256: result.pointerSha256, coverage: result.coverage }, null, 2));
