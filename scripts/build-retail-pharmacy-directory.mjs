import { buildRetailPharmacyDirectory } from '../runner/pharmacy-directory.mjs';

function argumentsFrom(commandLine) {
  const result = {};
  for (let index = 0; index < commandLine.length; index += 1) {
    const item = commandLine[index];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    const value = commandLine[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${key}.`);
    result[key] = value;
    index += 1;
  }
  return result;
}

const args = argumentsFrom(process.argv.slice(2));
if (!args.nppes) {
  console.error('Usage: node scripts/build-retail-pharmacy-directory.mjs --nppes <NPPES CSV or directory> [--enrichment <NCPDP dataQ CSV>] [--column-map <JSON>] [--output <directory>] [--zip-start 00100] [--zip-end 99999]');
  process.exit(1);
}

try {
  const result = await buildRetailPharmacyDirectory({
    config: {
      nppesFile: args.nppes,
      enrichmentFile: args.enrichment || '',
      columnMapFile: args['column-map'] || '',
      outputDirectory: args.output || 'data/pharmacies',
      zipStart: args['zip-start'] || '00100',
      zipEnd: args['zip-end'] || '99999',
    },
    onProgress: (value, message) => console.log(`${String(Math.round(value)).padStart(3, ' ')}%  ${message}`),
    onLog: (message) => console.log(message),
  });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
