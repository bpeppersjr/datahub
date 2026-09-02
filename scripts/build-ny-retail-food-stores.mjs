#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { buildNyRetailFoodStores } from "../runner/ny-retail-food-stores.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";

function usage() {
  return `Build the governed New York retail-food-store license release.

Usage:
  node scripts/build-ny-retail-food-stores.mjs [options]

Options:
  --output <path>                  Output root
  --zbp <path>                     Census ZBP current.json prerequisite
  --minimum-rows <number>          Source-row quality floor (default: 20000)
  --maximum-quarantine-rate <n>    Maximum rejected source-row share (default: 0.001)
  --help                           Show this help
`;
}

function parseArguments(args) {
  const options = {
    output: "data/business-sources/ny-retail-food-store-license-sites",
    zbp: "data/business-baselines/census-zbp/current.json",
    minimumRows: 20_000,
    maximumQuarantineRate: 0.001,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") return { help: true };
    if (["--output", "--zbp", "--minimum-rows", "--maximum-quarantine-rate"].includes(argument)) {
      const value = args[++index];
      if (!value) throw new Error(`${argument} requires a value.`);
      if (argument === "--output") options.output = value;
      if (argument === "--zbp") options.zbp = value;
      if (argument === "--minimum-rows") options.minimumRows = Number(value);
      if (argument === "--maximum-quarantine-rate") options.maximumQuarantineRate = Number(value);
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
  const result = await buildNyRetailFoodStores({
    outputRoot: assertInsideApp(path.resolve(APP_ROOT, options.output)),
    zbpPointer: assertInsideApp(path.resolve(APP_ROOT, options.zbp)),
    minimumRows: options.minimumRows,
    maximumQuarantineRate: options.maximumQuarantineRate,
    logger: (message) => process.stdout.write(`${message}\n`),
  });
  process.stdout.write(`${JSON.stringify({ release_id: result.manifest.release_id, release_directory: result.releaseDirectory, manifest: path.join(result.releaseDirectory, "manifest.json"), coverage: result.manifest.coverage }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`New York retail-food-store build failed: ${error.message}\n`);
  process.exitCode = 1;
}
