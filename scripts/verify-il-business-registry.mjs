#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { readFile } from "node:fs/promises";
import { verifyIllinoisBusinessRegistry } from "../runner/il-business-registry.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";
import { createCliCancellation } from "../runner/cli-cancellation.mjs";
const cancellation=createCliCancellation();

try {
  const requested = process.argv[2] ?? "data/business-sources/il-business-registry-active-organizations/current.json";
  const requestedPath = assertInsideApp(path.resolve(APP_ROOT, requested));
  const input = JSON.parse(await readFile(requestedPath, {encoding:"utf8",signal:cancellation.signal}));
  const manifestPath = input.manifest ? assertInsideApp(path.resolve(path.dirname(requestedPath), input.manifest)) : requestedPath;
  const result = await verifyIllinoisBusinessRegistry(manifestPath,{signal:cancellation.signal});
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(cancellation.signal.aborted?"Illinois Business Registry verification cancelled.\n":`Illinois Business Registry verification failed: ${error.message}\n`);
  if (error.failures) process.stderr.write(`${JSON.stringify(error.failures, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  cancellation.dispose();
}
