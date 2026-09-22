import { buildCmsNppesPharmacyNonprimaryAddresses, inspectCmsNppesPharmacyNonprimaryAddresses } from '../runner/cms-nppes-pharmacy-nonprimary-addresses.mjs';

function options(argv) {
  const result = { inspect: argv.includes('--inspect') };
  for (let index = 2; index < argv.length; index += 1) {
    const flag = argv[index]; if (flag === '--inspect') continue; const value = argv[++index];
    if (flag === '--output') result.outputRoot = value;
    else if (flag === '--pharmacy-pointer') result.pharmacyPointer = value;
    else if (flag === '--organizations-pointer') result.organizationsPointer = value;
    else if (flag) throw new Error(`Unknown option ${flag}.`);
  }
  return result;
}

try {
  const controller = new AbortController();
  process.once('SIGINT', () => controller.abort()); process.once('SIGTERM', () => controller.abort());
  const settings = options(process.argv);
  const result = settings.inspect
    ? await inspectCmsNppesPharmacyNonprimaryAddresses({ ...settings, signal: controller.signal })
    : await buildCmsNppesPharmacyNonprimaryAddresses({ ...settings, signal: controller.signal, onProgress: (percent, message) => process.stderr.write(`${percent}% ${message}\n`) });
  process.stdout.write(JSON.stringify({ ...(result.manifest ? { release_id: result.manifest.release_id, pointer: result.pointerPath } : { mode: 'inspection', ...result }), coverage: result.manifest?.coverage ?? result.coverage }) + '\n');
} catch (error) {
  process.stderr.write(`CMS NPPES pharmacy non-primary address build failed: ${error.message}\n`); process.exitCode = 1;
}
