#!/usr/bin/env node
import path from "node:path";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";
import { createCliCancellation } from "../runner/cli-cancellation.mjs";
import { verifyOhChildcareAppJob } from "../runner/oh-childcare-app.mjs";

const cancellation = createCliCancellation();
try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") process.stdout.write("Usage: node scripts/verify-oh-childcare-app.mjs <app-receipt.json>\nIndependently verifies a completed Ohio app receipt and both linked releases without network.\n");
  else {
    if (args.length !== 1 || !args[0] || args[0].startsWith("--")) throw new Error("Invalid arguments.");
    process.stdout.write(`${JSON.stringify(await verifyOhChildcareAppJob(assertInsideApp(path.resolve(APP_ROOT, args[0])), { signal: cancellation.signal }), null, 2)}\n`);
  }
} catch (error) {
  const detail = typeof error.message === "string" && error.message.startsWith("Ohio ") ? error.message : "Supply an intact completed app receipt inside datahub.";
  process.stderr.write(`Ohio app verification failed: ${detail}\n`); process.exitCode = 1;
} finally { cancellation.dispose(); }
