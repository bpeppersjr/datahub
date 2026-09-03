#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { readFile } from "node:fs/promises";
import { verifyOvertureUsPlaces } from "../runner/overture-us-places.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";

try {
  const requested = process.argv[2] ?? "data/business-sources/overture-us-places/current.json";
  const requestedPath = assertInsideApp(path.resolve(APP_ROOT, requested));
  const input = JSON.parse(await readFile(requestedPath, "utf8"));
  const manifestPath = input.manifest ? assertInsideApp(path.resolve(path.dirname(requestedPath), input.manifest)) : requestedPath;
  process.stdout.write(`${JSON.stringify(await verifyOvertureUsPlaces(manifestPath), null, 2)}\n`);
} catch (error) {
  process.stderr.write(`Overture U.S. Places verification failed: ${error.message}\n`);
  process.exitCode = 1;
}
