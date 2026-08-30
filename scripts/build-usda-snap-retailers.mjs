#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { buildUsdaSnapRetailers } from "../runner/usda-snap-retailers.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";

function usage() {
  return `Build the governed USDA SNAP current-retailer release.

Usage:
  node scripts/build-usda-snap-retailers.mjs [options]

Options:
  --output <path>       Output root (default: data/business-sources/usda-snap)
  --zbp <path>          Census ZBP current.json prerequisite
  --page-size <count>   ArcGIS page size, maximum 1000 (default: 1000)
  --concurrency <count> Concurrent page requests, maximum 8 (default: 4)
  --help                Show this help
`;
}

function parseArguments(args) {
  const options = {
    output: "data/business-sources/usda-snap",
    zbp: "data/business-baselines/census-zbp/current.json",
    pageSize: 1_000,
    concurrency: 4,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") return { help: true };
    if (["--output", "--zbp", "--page-size", "--concurrency"].includes(argument)) {
      const value = args[index + 1];
      if (!value) throw new Error(`${argument} requires a value.`);
      index += 1;
      if (argument === "--output") options.output = value;
      if (argument === "--zbp") options.zbp = value;
      if (argument === "--page-size") options.pageSize = Number(value);
      if (argument === "--concurrency") options.concurrency = Number(value);
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
  const result = await buildUsdaSnapRetailers({
    outputRoot: assertInsideApp(path.resolve(APP_ROOT, options.output)),
    zbpPointer: assertInsideApp(path.resolve(APP_ROOT, options.zbp)),
    pageSize: options.pageSize,
    concurrency: options.concurrency,
    logger: (message) => process.stdout.write(`${message}\n`),
  });
  process.stdout.write(`${JSON.stringify({
    release_id: result.manifest.release_id,
    release_directory: result.releaseDirectory,
    manifest: path.join(result.releaseDirectory, "manifest.json"),
    coverage: result.manifest.coverage,
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`USDA SNAP build failed: ${error.message}\n`);
  process.exitCode = 1;
}
