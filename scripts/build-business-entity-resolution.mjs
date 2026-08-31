#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { buildBusinessEntityResolution } from "../runner/business-entity-resolution.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";

function usage() {
  return `Build the governed national business entity-resolution decision layer.

Usage:
  node scripts/build-business-entity-resolution.mjs [options]

Options:
  --output <path>    Output root (default: data/business-entity-resolution)
  --registry <path>  Compatible registry current.json with match profiles (default: data/business-registry/current.json)
  --help             Show this help
`;
}

function parseArguments(args) {
  const options = { output: "data/business-entity-resolution", registry: "data/business-registry/current.json" };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") return { help: true };
    if (["--output", "--registry"].includes(argument)) {
      const value = args[index + 1];
      if (!value) throw new Error(`${argument} requires a value.`);
      index += 1;
      if (argument === "--output") options.output = value;
      if (argument === "--registry") options.registry = value;
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
  const result = await buildBusinessEntityResolution({
    outputRoot: assertInsideApp(path.resolve(APP_ROOT, options.output)),
    registryPointer: assertInsideApp(path.resolve(APP_ROOT, options.registry)),
    logger: (message) => process.stdout.write(`${message}\n`),
  });
  process.stdout.write(`${JSON.stringify({
    release_id: result.manifest.release_id,
    release_directory: result.releaseDirectory,
    manifest: path.join(result.releaseDirectory, "manifest.json"),
    status: result.manifest.status,
    ruleset_version: result.manifest.ruleset_version,
    coverage: result.manifest.coverage,
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`Business entity-resolution build failed: ${error.message}\n`);
  process.exitCode = 1;
}
