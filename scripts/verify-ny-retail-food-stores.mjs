#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { readFile } from "node:fs/promises";
import { verifyNyRetailFoodStores } from "../runner/ny-retail-food-stores.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";

try {
  const requested = process.argv[2] ?? "data/business-sources/ny-retail-food-store-license-sites/current.json";
  const requestedPath = assertInsideApp(path.resolve(APP_ROOT, requested));
  const input = JSON.parse(await readFile(requestedPath, "utf8"));
  const manifestPath = input.manifest ? assertInsideApp(path.resolve(path.dirname(requestedPath), input.manifest)) : requestedPath;
  process.stdout.write(`${JSON.stringify(await verifyNyRetailFoodStores(manifestPath), null, 2)}\n`);
} catch (error) {
  process.stderr.write(`New York retail-food-store verification failed: ${error.message}\n`);
  if (error.failures) process.stderr.write(`${JSON.stringify(error.failures, null, 2)}\n`);
  process.exitCode = 1;
}
