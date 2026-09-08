#!/usr/bin/env node
import path from "node:path";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";
import { createCliCancellation } from "../runner/cli-cancellation.mjs";
import { verifyOhChildcareAcquiredRelease } from "../runner/oh-childcare-acquired-release.mjs";

const cancellation = createCliCancellation();
try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") process.stdout.write("Usage: node scripts/verify-oh-childcare-acquired.mjs <manifest.json>\nReplays retained Ohio acquisition, source-use prerequisites and observation journal. No network or native-execution authentication.\n");
  else {
    if (args.length !== 1 || !args[0] || args[0].startsWith("--")) throw new Error("Invalid arguments.");
    const manifest = assertInsideApp(path.resolve(APP_ROOT, args[0]));
    if (path.basename(manifest) !== "manifest.json" || path.basename(path.dirname(path.dirname(manifest))) !== "releases") throw new Error("Immutable manifest required.");
    process.stdout.write(`${JSON.stringify(await verifyOhChildcareAcquiredRelease(manifest, { signal: cancellation.signal }), null, 2)}\n`);
  }
} catch (error) {
  const detail = typeof error.message === "string" && error.message.startsWith("Ohio ") ? error.message : "Supply an intact immutable acquisition manifest inside datahub.";
  process.stderr.write(`Ohio acquired verification failed: ${detail} No acquisition performed.\n`); process.exitCode = 1;
} finally { cancellation.dispose(); }
