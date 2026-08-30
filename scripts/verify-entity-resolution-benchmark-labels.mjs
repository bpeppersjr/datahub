#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { readFile } from "node:fs/promises";
import { verifyEntityResolutionBenchmarkLabelRelease } from "../runner/entity-resolution-benchmark-labels.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";

function parseArguments(args) {
  const options = {
    labels: "data/business-entity-resolution-benchmark-labels/current.json",
    benchmark: "data/business-entity-resolution-benchmark/current.json",
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (["--labels", "--benchmark"].includes(argument)) {
      const value = args[index + 1];
      if (!value) throw new Error(`${argument} requires a value.`);
      index += 1;
      if (argument === "--labels") options.labels = value;
      if (argument === "--benchmark") options.benchmark = value;
      continue;
    }
    throw new Error(`Unknown argument ${argument}.`);
  }
  return options;
}

try {
  const options = parseArguments(process.argv.slice(2));
  const requestedPath = assertInsideApp(path.resolve(APP_ROOT, options.labels));
  const input = JSON.parse(await readFile(requestedPath, "utf8"));
  const manifestPath = input.manifest
    ? assertInsideApp(path.resolve(path.dirname(requestedPath), input.manifest))
    : requestedPath;
  const result = await verifyEntityResolutionBenchmarkLabelRelease(manifestPath, {
    benchmarkPointer: assertInsideApp(path.resolve(APP_ROOT, options.benchmark)),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`Entity-resolution benchmark label verification failed: ${error.message}\n`);
  if (error.failures) process.stderr.write(`${JSON.stringify(error.failures, null, 2)}\n`);
  process.exitCode = 1;
}
