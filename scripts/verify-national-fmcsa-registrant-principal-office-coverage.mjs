import {verifyNationalFmcsaRegistrantPrincipalOfficeCoverageCurrent} from '../runner/national-fmcsa-registrant-principal-office-coverage.mjs';
const r=await verifyNationalFmcsaRegistrantPrincipalOfficeCoverageCurrent();console.log(JSON.stringify({release_id:r.manifest.release_id,manifest_sha256:r.manifestSha256,pointer_sha256:r.pointerSha256,coverage:r.coverage},null,2));
