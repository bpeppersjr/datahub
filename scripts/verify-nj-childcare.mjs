#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";
import { createCliCancellation } from "../runner/cli-cancellation.mjs";
import { verifyNjChildcareRelease } from "../runner/nj-childcare-release.mjs";

const cancellation = createCliCancellation();
try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    process.stdout.write("Usage: node scripts/verify-nj-childcare.mjs <manifest.json>\nVerifies retained publisher metadata, source evidence, transformations and artifact checksums without downloading data. Supply a release manifest, not current.json.\n");
  } else {
    if (args.length !== 1 || !args[0] || args[0].startsWith("--")) throw new Error("A release manifest path is required; use --help.");
    const manifestPath = assertInsideApp(path.resolve(APP_ROOT, args[0]));
    const result = await verifyNjChildcareRelease(manifestPath, { signal: cancellation.signal });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
} catch (error) {
  process.stderr.write(`New Jersey childcare verification failed: ${error.message}\n`);
  process.exitCode = 1;
} finally { cancellation.dispose(); }
