#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { buildCmsNppesOrganizations } from '../runner/cms-nppes-organizations.mjs';
import { ensureNppesSource } from '../runner/nppes-source.mjs';
import { APP_ROOT, assertInsideApp } from '../runner/paths.mjs';
import { createCliCancellation } from '../runner/cli-cancellation.mjs';
const cancellation = createCliCancellation();

function usage() {
  return `Build the governed CMS NPPES organization-provider source release.

Usage:
  node scripts/build-cms-nppes-organizations.mjs [options]

Options:
  --output <path>             Output root (default: data/business-sources/cms-nppes-organizations)
  --source <path>             Use an explicitly prepared NPPES directory; skip discovery/download
  --source-root <path>        Managed source root (default: data/pharmacy-sources)
  --keep-archive              Retain the downloaded CMS ZIP after verified extraction
  --zbp <path>                Census ZBP current.json prerequisite
  --minimum-organizations <n> Publication floor (default: 1000000)
  --help                      Show this help
`;
}

function parseArguments(args) {
  const options = {
    output: 'data/business-sources/cms-nppes-organizations',
    source: null,
    sourceRoot: 'data/pharmacy-sources',
    keepArchive: false,
    zbp: 'data/business-baselines/census-zbp/current.json',
    minimumOrganizations: 1_000_000,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help') return { help: true };
    if (argument === '--keep-archive') {
      options.keepArchive = true;
      continue;
    }
    if (['--output', '--source', '--source-root', '--zbp', '--minimum-organizations'].includes(argument)) {
      const value = args[index + 1];
      if (!value) throw new Error(`${argument} requires a value.`);
      index += 1;
      if (argument === '--output') options.output = value;
      if (argument === '--source') options.source = value;
      if (argument === '--source-root') options.sourceRoot = value;
      if (argument === '--zbp') options.zbp = value;
      if (argument === '--minimum-organizations') options.minimumOrganizations = Number(value);
      continue;
    }
    throw new Error(`Unknown argument ${argument}.`);
  }
  return options;
}

try {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    process.exit(0);
  }
  const sourceDirectory = options.source
    ? assertInsideApp(path.resolve(APP_ROOT, options.source))
    : path.dirname((await ensureNppesSource({
        rootDirectory: assertInsideApp(path.resolve(APP_ROOT, options.sourceRoot)),
        keepArchive: options.keepArchive,
        signal: cancellation.signal,
        onProgress: (value, message) => process.stdout.write(`${String(Math.round(value)).padStart(3, ' ')}%  ${message}\n`),
        onLog: (message) => process.stdout.write(`${message}\n`),
      })).inputPath);
  const result = await buildCmsNppesOrganizations({
    signal: cancellation.signal,
    outputRoot: assertInsideApp(path.resolve(APP_ROOT, options.output)),
    sourceDirectory,
    zbpPointer: assertInsideApp(path.resolve(APP_ROOT, options.zbp)),
    minimumOrganizations: options.minimumOrganizations,
    logger: (message) => process.stdout.write(`${message}\n`),
  });
  process.stdout.write(`${JSON.stringify({
    release_id: result.manifest.release_id,
    release_directory: result.releaseDirectory,
    manifest: path.join(result.releaseDirectory, 'manifest.json'),
    coverage: result.manifest.coverage,
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`CMS NPPES organization build failed: ${error.message}\n`);
  process.exitCode = 1;
} finally {
  cancellation.dispose();
}
