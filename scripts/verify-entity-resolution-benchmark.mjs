#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { readFile } from "node:fs/promises";
import { verifyEntityResolutionBenchmarkSample } from "../runner/entity-resolution-benchmark.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";

try {
  const requested = process.argv[2] ?? "data/business-entity-resolution-benchmark/current.json";
  const requestedPath = assertInsideApp(path.resolve(APP_ROOT, requested));
  const input = JSON.parse(await readFile(requestedPath, "utf8"));
  const manifestPath = input.manifest
    ? assertInsideApp(path.resolve(path.dirname(requestedPath), input.manifest))
    : requestedPath;
  const result = await verifyEntityResolutionBenchmarkSample(manifestPath);
  process.stdout.write(`${JSON.stringify({
    dataset_id: result.dataset_id,
    release_id: result.release_id,
    status: result.status,
    artifact_count: result.artifact_count,
    coverage: result.coverage,
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`Entity-resolution benchmark verification failed: ${error.message}\n`);
  if (error.failures) process.stderr.write(`${JSON.stringify(error.failures, null, 2)}\n`);
  process.exitCode = 1;
}
