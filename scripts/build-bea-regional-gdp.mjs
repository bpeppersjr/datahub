#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { buildBeaRegionalGdp } from "../runner/bea-regional-gdp.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";

function usage() {
  return `Build the governed BEA CAGDP1 state/county GDP baseline.

Usage:
  node scripts/build-bea-regional-gdp.mjs [options]

Options:
  --output <path>      Output root (default: data/business-baselines/bea-regional-gdp)
  --geography <path>   Geography current.json (default: data/geography/current.json)
  --source <path>      Use a local CAGDP1.zip already inside datahub
  --help               Show this help
`;
}

function parseArguments(args) {
  const options = {
    output: "data/business-baselines/bea-regional-gdp",
    geography: "data/geography/current.json",
    source: null,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") return { help: true };
    if (["--output", "--geography", "--source"].includes(argument)) {
      const value = args[index + 1];
      if (!value) throw new Error(`${argument} requires a value.`);
      index += 1;
      if (argument === "--output") options.output = value;
      if (argument === "--geography") options.geography = value;
      if (argument === "--source") options.source = value;
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
  const result = await buildBeaRegionalGdp({
    outputRoot: assertInsideApp(path.resolve(APP_ROOT, options.output)),
    geographyPointer: assertInsideApp(path.resolve(APP_ROOT, options.geography)),
    sourcePath: options.source ? assertInsideApp(path.resolve(APP_ROOT, options.source)) : null,
    logger: (message) => process.stdout.write(`${message}\n`),
  });
  process.stdout.write(`${JSON.stringify({
    release_id: result.manifest.release_id,
    release_directory: result.releaseDirectory,
    manifest: path.join(result.releaseDirectory, "manifest.json"),
    coverage: result.manifest.coverage,
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`BEA regional GDP build failed: ${error.message}\n`);
  process.exitCode = 1;
}
