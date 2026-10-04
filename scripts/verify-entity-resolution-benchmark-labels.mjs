#!/usr/bin/env node

import process from "node:process";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { verifyBenchmarkLabelSnapshot } from "../runner/benchmark-label-finalization.mjs";
import { APP_ROOT } from "../runner/paths.mjs";

try {
  const args = process.argv.slice(2);
  let releaseId = null;
  if (args.length) {
    if (args.length !== 2 || args[0] !== "--release-id" || !/^[a-z0-9][a-z0-9-]{2,127}$/.test(args[1])) throw new Error("Usage: verify-entity-resolution-benchmark-labels.mjs [--release-id <registered-release-id>]");
    releaseId = args[1];
  }
  const pointerPath = path.join(APP_ROOT, "data", "business-entity-resolution-benchmark-labels", "current.json");
  let selected = releaseId;
  if (!selected) {
    const pointer = JSON.parse(await readFile(pointerPath, "utf8"));
    selected = pointer.release_id;
  }
  const manifestPath = path.join(APP_ROOT, "data", "business-entity-resolution-benchmark-labels", "releases", selected, "manifest.json");
  const result = await verifyBenchmarkLabelSnapshot(manifestPath);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`Entity-resolution benchmark label verification failed: ${error.message}\n`);
  process.exitCode = 1;
}
