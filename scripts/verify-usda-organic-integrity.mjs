#!/usr/bin/env node

import { realpath } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { verifyUsdaOrganicIntegrityOffline } from "../runner/usda-organic-integrity.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";

function usage() {
  return `Verify one USDA Organic INTEGRITY offline staging manifest.

Usage:
  node scripts/verify-usda-organic-integrity.mjs <path-to-manifest.json>

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
    const [root, manifestPath] = await Promise.all([realpath(APP_ROOT), realpath(lexical)]);
    const relative = path.relative(root, manifestPath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Manifest resolves outside datahub.");
    process.stdout.write(`${JSON.stringify(await verifyUsdaOrganicIntegrityOffline(manifestPath), null, 2)}\n`);
  }
} catch (error) {
  process.stderr.write(`USDA Organic INTEGRITY verification failed: ${error.message}\n`);
  if (error.failures) process.stderr.write(`${JSON.stringify(error.failures, null, 2)}\n`);
  process.exitCode = 1;
}
