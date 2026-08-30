#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { readFile } from "node:fs/promises";
import { verifyFmcsaCompanyCensus } from "../runner/fmcsa-company-census.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";

try {
  if (process.argv[2] === "--help") {
    process.stdout.write("Verify the current governed FMCSA Company Census release or a supplied current.json/manifest.json path.\n");
    process.exit(0);
  }
  const requested = process.argv[2] ?? "data/business-sources/fmcsa-active-us-company-census/current.json";
  const requestedPath = assertInsideApp(path.resolve(APP_ROOT, requested));
  const input = JSON.parse(await readFile(requestedPath, "utf8"));
  const manifestPath = input.manifest
    ? assertInsideApp(path.resolve(path.dirname(requestedPath), input.manifest))
    : requestedPath;
  const result = await verifyFmcsaCompanyCensus(manifestPath);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`FMCSA Company Census verification failed: ${error.message}\n`);
  if (error.failures) process.stderr.write(`${JSON.stringify(error.failures, null, 2)}\n`);
  process.exitCode = 1;
}
