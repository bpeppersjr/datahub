#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { readFile } from "node:fs/promises";
import { evaluateBenchmarkLabels, verifyEntityResolutionBenchmarkSample } from "../runner/entity-resolution-benchmark.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";

function parseArguments(args) {
  const options = { benchmark: "data/business-entity-resolution-benchmark/current.json", labels: null };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (["--benchmark", "--labels"].includes(argument)) {
      const value = args[index + 1];
      if (!value) throw new Error(`${argument} requires a value.`);
      index += 1;
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
  const requestedPath = assertInsideApp(path.resolve(APP_ROOT, options.benchmark));
  const input = JSON.parse(await readFile(requestedPath, "utf8"));
  const manifestPath = input.manifest
    ? assertInsideApp(path.resolve(path.dirname(requestedPath), input.manifest))
    : requestedPath;
  const verified = await verifyEntityResolutionBenchmarkSample(manifestPath);
  const labels = options.labels
    ? (await readFile(assertInsideApp(path.resolve(APP_ROOT, options.labels)), "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse)
    : verified.labels;
  const assessment = evaluateBenchmarkLabels(verified.candidates, labels);
  process.stdout.write(`${JSON.stringify(assessment, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`Entity-resolution benchmark evaluation failed: ${error.message}\n`);
  process.exitCode = 1;
}
