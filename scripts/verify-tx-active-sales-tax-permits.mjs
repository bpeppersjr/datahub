#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { readFile } from "node:fs/promises";
import { verifyTxActiveSalesTaxPermits } from "../runner/tx-active-sales-tax-permits.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";

try {
  const requested = process.argv[2] ?? "data/business-sources/tx-active-sales-tax-outlets/current.json";
  const requestedPath = assertInsideApp(path.resolve(APP_ROOT, requested));
  const input = JSON.parse(await readFile(requestedPath, "utf8"));
  const manifestPath = input.manifest
    ? assertInsideApp(path.resolve(path.dirname(requestedPath), input.manifest))
    : requestedPath;
  const result = await verifyTxActiveSalesTaxPermits(manifestPath);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`Texas active-sales-tax permit verification failed: ${error.message}\n`);
  if (error.failures) process.stderr.write(`${JSON.stringify(error.failures, null, 2)}\n`);
  process.exitCode = 1;
}
