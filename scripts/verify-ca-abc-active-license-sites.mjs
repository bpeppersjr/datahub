#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { readFile } from "node:fs/promises";
import { verifyCaAbcActiveLicenseSites } from "../runner/ca-abc-active-license-sites.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";

try {
  const requested = process.argv[2] ?? "data/business-sources/ca-abc-active-license-sites/current.json";
  const requestedPath = assertInsideApp(path.resolve(APP_ROOT, requested));
  const input = JSON.parse(await readFile(requestedPath, "utf8"));
  const manifestPath = input.manifest ? assertInsideApp(path.resolve(path.dirname(requestedPath), input.manifest)) : requestedPath;
  process.stdout.write(`${JSON.stringify(await verifyCaAbcActiveLicenseSites(manifestPath), null, 2)}\n`);
} catch (error) {
  process.stderr.write(`California ABC active-license verification failed: ${error.message}\n`);
  process.exitCode = 1;
}
