#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { buildNationalBusinessRegistry } from "../runner/business-registry.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";

function usage() {
  return `Build the governed partial national business registry release.

Usage:
  node scripts/build-business-registry.mjs [options]

Options:
  --output <path>  Output root (default: data/business-registry)
  --snap <path>    USDA SNAP current.json prerequisite
  --help           Show this help
`;
}

function parseArguments(args) {
  const options = {
    output: "data/business-registry",
    snap: "data/business-sources/usda-snap/current.json",
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") return { help: true };
    if (["--output", "--snap"].includes(argument)) {
      const value = args[index + 1];
      if (!value) throw new Error(`${argument} requires a value.`);
      index += 1;
      if (argument === "--output") options.output = value;
      if (argument === "--snap") options.snap = value;
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
  const result = await buildNationalBusinessRegistry({
    outputRoot: assertInsideApp(path.resolve(APP_ROOT, options.output)),
    snapPointer: assertInsideApp(path.resolve(APP_ROOT, options.snap)),
    logger: (message) => process.stdout.write(`${message}\n`),
  });
  process.stdout.write(`${JSON.stringify({
    release_id: result.manifest.release_id,
    release_directory: result.releaseDirectory,
    manifest: path.join(result.releaseDirectory, "manifest.json"),
    status: result.manifest.status,
    coverage: result.manifest.coverage,
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`National business registry build failed: ${error.message}\n`);
  process.exitCode = 1;
}
