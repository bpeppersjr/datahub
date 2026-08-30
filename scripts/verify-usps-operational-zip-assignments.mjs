#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { readFile } from "node:fs/promises";
import { verifyUspsOperationalZipRelease } from "../runner/usps-operational-zip-assignments.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";

try {
  const requested = process.argv[2] ?? "data/zip-validity/usps-operational-zips/current.json";
  const requestedPath = assertInsideApp(path.resolve(APP_ROOT, requested));
  const input = JSON.parse(await readFile(requestedPath, "utf8"));
  const manifestPath = input.manifest
    ? assertInsideApp(path.resolve(path.dirname(requestedPath), input.manifest))
    : requestedPath;
  const result = await verifyUspsOperationalZipRelease(manifestPath);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`USPS operational ZIP verification failed: ${error.message}\n`);
  if (error.failures) process.stderr.write(`${JSON.stringify(error.failures, null, 2)}\n`);
  process.exitCode = 1;
}
