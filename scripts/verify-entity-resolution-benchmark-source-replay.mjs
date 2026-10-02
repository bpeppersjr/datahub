#!/usr/bin/env node
import path from "node:path";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";
import { verifyEntityResolutionBenchmarkSourceReplay } from "../runner/entity-resolution-benchmark.mjs";

const controller = new AbortController();
const cancel = () => controller.abort();
process.once("SIGINT", cancel);
process.once("SIGTERM", cancel);
try {
  if (process.argv.length !== 5) throw new Error("Usage: verify-entity-resolution-benchmark-source-replay.mjs <benchmark-manifest.json> <resolution-manifest.json> <registry-manifest.json>");
  const inputs = process.argv.slice(2).map(value => assertInsideApp(path.resolve(APP_ROOT,value)));
  const result = await verifyEntityResolutionBenchmarkSourceReplay(...inputs,{signal:controller.signal});
  process.stdout.write(`${JSON.stringify(result,null,2)}\n`);
} catch(error) {
  process.stderr.write(`Benchmark source replay failed: ${error.message}\n`);
  process.exitCode = 1;
} finally {
  process.removeListener("SIGINT",cancel);
  process.removeListener("SIGTERM",cancel);
}
