#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { buildCensusGeography } from "../runner/census-geography.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";

function usage() {
  return `Build the versioned U.S. Census geography foundation.

Usage:
  node scripts/build-us-geography.mjs [options]

Options:
  --output <path>      Output root inside datahub (default: data/geography)
  --offset <degrees>   Geometry generalization tolerance (default: 0.0001)
  --page-size <count>  TIGERweb page size (default: 500)
  --sample             Fetch a tiny ZCTA-prefix-0 release for verification
  --help               Show this help
`;
}

function parseArguments(args) {
  const options = {
    output: "data/geography",
    geometryOffset: 0.0001,
    pageSize: 500,
    sample: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") return { help: true };
    if (argument === "--sample") {
      options.sample = true;
      continue;
    }
    if (["--output", "--offset", "--page-size"].includes(argument)) {
      const value = args[index + 1];
      if (!value) throw new Error(`${argument} requires a value.`);
      index += 1;
      if (argument === "--output") options.output = value;
      if (argument === "--offset") options.geometryOffset = Number(value);
      if (argument === "--page-size") options.pageSize = Number(value);
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
  const requestedOutput = options.sample && options.output === "data/geography"
    ? "data/geography-samples"
    : options.output;
  const outputRoot = assertInsideApp(path.resolve(APP_ROOT, requestedOutput));
  const result = await buildCensusGeography({
    outputRoot,
    geometryOffset: options.geometryOffset,
    pageSize: options.pageSize,
    maxFeatures: options.sample ? 3 : null,
    zctaPrefixes: options.sample ? ["0"] : undefined,
    logger: (message) => process.stdout.write(`${message}\n`),
  });
  process.stdout.write(`${JSON.stringify({
    release_id: result.manifest.release_id,
    release_directory: result.releaseDirectory,
    manifest: path.join(result.releaseDirectory, "manifest.json"),
    coverage: result.manifest.coverage,
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`Geography build failed: ${error.message}\n`);
  process.exitCode = 1;
}
