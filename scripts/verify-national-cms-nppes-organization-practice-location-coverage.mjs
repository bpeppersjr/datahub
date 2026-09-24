import { verifyNationalCmsNppesOrganizationPracticeLocationCoverageCurrent } from '../runner/national-cms-nppes-organization-practice-location-coverage.mjs';

const result = await verifyNationalCmsNppesOrganizationPracticeLocationCoverageCurrent();
console.log(JSON.stringify(result, null, 2));
