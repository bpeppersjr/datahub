import {buildNationalFdicBankfindCoverage} from '../runner/national-fdic-bankfind-coverage.mjs';
const r=await buildNationalFdicBankfindCoverage();console.log(JSON.stringify({release_id:r.manifest.release_id,manifest_sha256:r.manifestSha256,coverage:r.coverage},null,2));
