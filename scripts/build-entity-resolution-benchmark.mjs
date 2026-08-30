#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import {
  buildEntityResolutionBenchmarkSample,
  DEFAULT_BENCHMARK_SEED,
  DEFAULT_SAMPLE_SIZE_PER_STRATUM,
} from "../runner/entity-resolution-benchmark.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";

function usage() {
  return `Build a deterministic local-review entity-resolution benchmark sample.

Usage:
  node scripts/build-entity-resolution-benchmark.mjs [options]

Options:
  --output <path>       Output root (default: data/business-entity-resolution-benchmark)
  --resolution <path>   Resolution current.json (default: data/business-entity-resolution/current.json)
  --registry <path>     Registry current.json (default: data/business-registry/current.json)
  --sample-size <n>     Candidates per stratum (default: ${DEFAULT_SAMPLE_SIZE_PER_STRATUM})
  --seed <text>         Stable min-hash seed (default: ${DEFAULT_BENCHMARK_SEED})
  --help                Show this help
`;
}

function parseArguments(args) {
  const options = {
    output: "data/business-entity-resolution-benchmark",
    resolution: "data/business-entity-resolution/current.json",
    registry: "data/business-registry/current.json",
    sampleSize: DEFAULT_SAMPLE_SIZE_PER_STRATUM,
    seed: DEFAULT_BENCHMARK_SEED,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") return { help: true };
    if (["--output", "--resolution", "--registry", "--sample-size", "--seed"].includes(argument)) {
      const value = args[index + 1];
      if (!value) throw new Error(`${argument} requires a value.`);
      index += 1;
      if (argument === "--output") options.output = value;
      if (argument === "--resolution") options.resolution = value;
      if (argument === "--registry") options.registry = value;
      if (argument === "--sample-size") options.sampleSize = Number(value);
      if (argument === "--seed") options.seed = value;
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
  const result = await buildEntityResolutionBenchmarkSample({
    outputRoot: assertInsideApp(path.resolve(APP_ROOT, options.output)),
    resolutionPointer: assertInsideApp(path.resolve(APP_ROOT, options.resolution)),
    registryPointer: assertInsideApp(path.resolve(APP_ROOT, options.registry)),
    sampleSizePerStratum: options.sampleSize,
    seed: options.seed,
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
  process.stderr.write(`Entity-resolution benchmark sample build failed: ${error.message}\n`);
  process.exitCode = 1;
}
