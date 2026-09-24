import { buildNationalCmsNppesOrganizationPracticeLocationCoverage } from '../runner/national-cms-nppes-organization-practice-location-coverage.mjs';

const result = await buildNationalCmsNppesOrganizationPracticeLocationCoverage();
console.log(JSON.stringify({ release_id: result.manifest.release_id, manifest_sha256: result.manifestSha256, coverage: result.coverage }, null, 2));
