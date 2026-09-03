#!/usr/bin/env node

import { realpath } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { verifyTxActiveFranchiseTaxpayersOffline } from "../runner/tx-active-franchise-offline.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";

function usage() {
  return `Verify one Texas Active Franchise Taxpayers offline staging manifest.

Usage:
  node scripts/verify-tx-active-franchise-offline.mjs <path-to-manifest.json>

The manifest must be inside datahub. This command never publishes current.json.
`;
}

try {
  const requested = process.argv[2];
  if (!requested || requested === "--help") {
    process.stdout.write(usage());
    if (!requested) process.exitCode = 1;
  } else if (process.argv.length > 3) {
    throw new Error("Only one manifest path is accepted.");
  } else {
    const lexical = assertInsideApp(path.resolve(APP_ROOT, requested));
    const [appRoot, manifestPath] = await Promise.all([realpath(APP_ROOT), realpath(lexical)]);
    const relative = path.relative(appRoot, manifestPath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Manifest resolves outside the datahub folder.");
    const result = await verifyTxActiveFranchiseTaxpayersOffline(manifestPath);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
} catch (error) {
  process.stderr.write(`Texas Active Franchise Taxpayers offline verification failed: ${error.message}\n`);
  if (error.failures) process.stderr.write(`${JSON.stringify(error.failures, null, 2)}\n`);
  process.exitCode = 1;
}
