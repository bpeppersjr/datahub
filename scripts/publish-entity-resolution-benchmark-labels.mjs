#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { buildEntityResolutionBenchmarkLabelRelease } from "../runner/entity-resolution-benchmark-labels.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";

function parseArguments(args) {
  const options = {
    output: "data/business-entity-resolution-benchmark-labels",
    benchmark: "data/business-entity-resolution-benchmark/current.json",
    labels: null,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (["--output", "--benchmark", "--labels"].includes(argument)) {
      const value = args[index + 1];
      if (!value) throw new Error(`${argument} requires a value.`);
      index += 1;
      if (argument === "--output") options.output = value;
      if (argument === "--benchmark") options.benchmark = value;
      if (argument === "--labels") options.labels = value;
      continue;
    }
    throw new Error(`Unknown argument ${argument}.`);
  }
  return options;
}

try {
  const options = parseArguments(process.argv.slice(2));
  const result = await buildEntityResolutionBenchmarkLabelRelease({
    outputRoot: assertInsideApp(path.resolve(APP_ROOT, options.output)),
    benchmarkPointer: assertInsideApp(path.resolve(APP_ROOT, options.benchmark)),
    labelsPath: options.labels ? assertInsideApp(path.resolve(APP_ROOT, options.labels)) : null,
  });
  process.stdout.write(`${JSON.stringify({
    release_id: result.manifest.release_id,
    release_directory: result.releaseDirectory,
    manifest: path.join(result.releaseDirectory, "manifest.json"),
    status: result.manifest.status,
    coverage: result.manifest.coverage,
    automatic_precision_gate_passed: result.manifest.automatic_precision_gate_passed,
    export_authorized: result.manifest.export_authorized,
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`Entity-resolution benchmark label publication failed: ${error.message}\n`);
  process.exitCode = 1;
}
