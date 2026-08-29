import { buildRetailPharmacyDirectory } from '../runner/pharmacy-directory.mjs';
import { prepareNppesInput } from '../runner/nppes-source.mjs';

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

try {
  const source = await prepareNppesInput({
    configuredPath: args.nppes || 'auto',
    autoDownload: true,
    keepArchive: args['keep-archive'] === 'true',
    onProgress: (value, message) => console.log(`${String(Math.round(value * 0.25)).padStart(3, ' ')}%  ${message}`),
    onLog: (message) => console.log(message),
  });
  const result = await buildRetailPharmacyDirectory({
    config: {
      nppesFile: source.inputPath,
      enrichmentFile: args.enrichment || '',
      columnMapFile: args['column-map'] || '',
      outputDirectory: args.output || 'data/pharmacies',
      zipStart: args['zip-start'] || '00100',
      zipEnd: args['zip-end'] || '99999',
    },
    onProgress: (value, message) => console.log(`${String(Math.round(25 + value * 0.75)).padStart(3, ' ')}%  ${message}`),
    onLog: (message) => console.log(message),
  });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
