#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { buildIrsEoBmf } from "../runner/irs-eo-bmf.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";

function usage() {
  return `Build the governed IRS EO Business Master File organization release.

Usage:
  node scripts/build-irs-eo-bmf.mjs [options]

Options:
  --source-directory <path>  Existing official eo1.csv through eo4.csv files; otherwise stream IRS
  --output <path>            Output root (default: data/business-sources/irs-eo-bmf-organizations)
  --zbp <path>               Census ZBP current.json prerequisite
  --help                     Show this help
`;
}

function parseArguments(args) {
  const options = {
    sourceDirectory: null,
    output: "data/business-sources/irs-eo-bmf-organizations",
    zbp: "data/business-baselines/census-zbp/current.json",
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") return { help: true };
    if (["--source-directory", "--output", "--zbp"].includes(argument)) {
      const value = args[index + 1];
      if (!value) throw new Error(`${argument} requires a value.`);
      index += 1;
      if (argument === "--source-directory") options.sourceDirectory = value;
      if (argument === "--output") options.output = value;
      if (argument === "--zbp") options.zbp = value;
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
  const result = await buildIrsEoBmf({
    outputRoot: assertInsideApp(path.resolve(APP_ROOT, options.output)),
    zbpPointer: assertInsideApp(path.resolve(APP_ROOT, options.zbp)),
    sourceDirectory: options.sourceDirectory ? assertInsideApp(path.resolve(APP_ROOT, options.sourceDirectory)) : null,
    logger: (message) => process.stdout.write(`${message}\n`),
  });
  process.stdout.write(`${JSON.stringify({
    release_id: result.manifest.release_id,
    release_directory: result.releaseDirectory,
    manifest: path.join(result.releaseDirectory, "manifest.json"),
    coverage: result.manifest.coverage,
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`IRS EO BMF build failed: ${error.message}\n`);
  process.exitCode = 1;
}
