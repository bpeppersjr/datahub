import { verifyCmsNppesCommunityRetailPharmacies } from '../runner/cms-nppes-community-retail-pharmacy.mjs';

try {
  const pointer = process.argv[2] ?? 'data/business-sources/cms-nppes-community-retail-pharmacies/current.json';
  process.stdout.write(JSON.stringify(await verifyCmsNppesCommunityRetailPharmacies(pointer)) + '\n');
} catch (error) {
  process.stderr.write(`CMS NPPES community/retail pharmacy verification failed: ${error.message}\n`);
  if (error.failures) process.stderr.write(`${JSON.stringify(error.failures)}\n`);
  process.exitCode = 1;
}
