#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { readFile } from "node:fs/promises";
import { verifyDeBusinessLicenses } from "../runner/de-business-licenses.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";
import { createCliCancellation } from "../runner/cli-cancellation.mjs";

const cancellation = createCliCancellation();
try {
  cancellation.signal.throwIfAborted();
  const requested = process.argv[2] ?? "data/business-sources/de-business-licenses-current/current.json";
  const requestedPath = assertInsideApp(path.resolve(APP_ROOT, requested));
  const input = JSON.parse(await readFile(requestedPath, {encoding:'utf8', signal:cancellation.signal}));
  const manifestPath = input.manifest
    ? assertInsideApp(path.resolve(path.dirname(requestedPath), input.manifest))
    : requestedPath;
  const result = await verifyDeBusinessLicenses(manifestPath, {signal:cancellation.signal});
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(cancellation.signal.aborted ? 'Delaware business-license verification cancelled.\n' : `Delaware business-license verification failed: ${error.message}\n`);
  if (!cancellation.signal.aborted && error.failures) process.stderr.write(`${JSON.stringify(error.failures, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  cancellation.dispose();
}
