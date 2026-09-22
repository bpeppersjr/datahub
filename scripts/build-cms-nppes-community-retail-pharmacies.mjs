import { buildCmsNppesCommunityRetailPharmacies } from '../runner/cms-nppes-community-retail-pharmacy.mjs';

function options(argv) {
  const result = { outputRoot: 'data/business-sources/cms-nppes-community-retail-pharmacies', sourcePointer: 'data/business-sources/cms-nppes-organizations/current.json' };
  for (let index = 2; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[++index];
    if (flag === '--output') result.outputRoot = value;
    else if (flag === '--source-pointer') result.sourcePointer = value;
    else if (flag) throw new Error(`Unknown option ${flag}.`);
  }
  return result;
}

try {
  const result = await buildCmsNppesCommunityRetailPharmacies({ ...options(process.argv), logger: (message) => process.stderr.write(`${message}\n`) });
  process.stdout.write(JSON.stringify({ release_id: result.manifest.release_id, coverage: result.manifest.coverage, release_directory: result.releaseDirectory, pointer: result.pointerPath }) + '\n');
} catch (error) {
  process.stderr.write(`CMS NPPES community/retail pharmacy build failed: ${error.message}\n`);
  process.exitCode = 1;
}
