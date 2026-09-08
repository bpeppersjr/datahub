#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";
import { createCliCancellation } from "../runner/cli-cancellation.mjs";
import { verifyMiChildcareRelease } from "../runner/mi-childcare-release.mjs";

const cancellation = createCliCancellation();
try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") process.stdout.write("Usage: node scripts/verify-mi-childcare.mjs <manifest.json>\nOffline verification of retained Michigan evidence. Supply an immutable manifest, not current.json. Verification is not acquisition, legal approval or export authorization.\n");
  else {
    if (args.length !== 1 || !args[0] || args[0].startsWith("--")) throw new Error("A release manifest path is required; use --help.");
    const manifest = assertInsideApp(path.resolve(APP_ROOT, args[0]));
    if (path.basename(manifest) !== "manifest.json" || path.basename(path.dirname(path.dirname(manifest))) !== "releases") throw new Error("Supply an immutable release manifest, not a pointer or staging path.");
    process.stdout.write(`${JSON.stringify(await verifyMiChildcareRelease(manifest, { signal: cancellation.signal }), null, 2)}\n`);
  }
} catch (error) { process.stderr.write(`Michigan childcare verification failed: ${error.message}\n`); process.exitCode = 1; }
finally { cancellation.dispose(); }
