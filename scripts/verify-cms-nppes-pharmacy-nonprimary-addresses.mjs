import { verifyCmsNppesPharmacyNonprimaryAddresses } from '../runner/cms-nppes-pharmacy-nonprimary-addresses.mjs';

try {
  const pointer = process.argv[2] ?? 'data/business-sources/cms-nppes-pharmacy-nonprimary-addresses/current.json';
  process.stdout.write(JSON.stringify(await verifyCmsNppesPharmacyNonprimaryAddresses(pointer)) + '\n');
} catch (error) {
  process.stderr.write(`CMS NPPES pharmacy non-primary address verification failed: ${error.message}\n`);
  if (error.failures) process.stderr.write(`${JSON.stringify(error.failures)}\n`);
  process.exitCode = 1;
}
