#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";
import { createCliCancellation } from "../runner/cli-cancellation.mjs";
import { verifyTnChildcareRelease } from "../runner/tn-childcare-release.mjs";

const cancellation = createCliCancellation();
try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") process.stdout.write("Usage: node scripts/verify-tn-childcare.mjs <manifest.json>\nOffline replay of retained Tennessee source evidence. Supply an immutable release manifest, not current.json.\n");
  else {
    if (args.length !== 1 || !args[0] || args[0].startsWith("--")) throw new Error("A release manifest path is required; use --help.");
    process.stdout.write(`${JSON.stringify(await verifyTnChildcareRelease(assertInsideApp(path.resolve(APP_ROOT, args[0])), { signal: cancellation.signal }), null, 2)}\n`);
  }
} catch (error) { process.stderr.write(`Tennessee childcare verification failed: ${error.message}\n`); process.exitCode = 1; }
finally { cancellation.dispose(); }
