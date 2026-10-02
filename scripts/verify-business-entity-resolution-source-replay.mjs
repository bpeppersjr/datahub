#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { realpath } from "node:fs/promises";
import { verifyBusinessEntityResolutionSourceReplay } from "../runner/business-entity-resolution.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";

try {
  if (process.argv.length !== 4) throw new Error("Usage: node scripts/verify-business-entity-resolution-source-replay.mjs <resolution-manifest.json> <registry-manifest.json>");
  const resolutionManifestPath = assertInsideApp(await realpath(assertInsideApp(path.resolve(APP_ROOT, process.argv[2]))));
  const registryManifestPath = assertInsideApp(await realpath(assertInsideApp(path.resolve(APP_ROOT, process.argv[3]))));
  const result = await verifyBusinessEntityResolutionSourceReplay(resolutionManifestPath, registryManifestPath);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`Business entity-resolution source replay failed: ${error.message}\n`);
  if (error.failures) process.stderr.write(`${JSON.stringify(error.failures, null, 2)}\n`);
  process.exitCode = 1;
}
