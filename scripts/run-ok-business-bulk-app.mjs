#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { createCliCancellation } from "../runner/cli-cancellation.mjs";
import { runOkBusinessBulkAppJob } from "../runner/ok-business-bulk-app.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";

const cancellation = createCliCancellation();
try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") process.stdout.write("Usage: node scripts/run-ok-business-bulk-app.mjs --selection data/imports/oklahoma-business-bulk/packages/<package-id>/selection.json\nOffline only; no network, purchase, account action, source pointer change, current-operation claim, physical-site claim, or national admission.\n");
  else {
    if (args.length !== 2 || args[0] !== "--selection") throw new Error("Invalid arguments.");
    const result = await runOkBusinessBulkAppJob({ selectionPath:assertInsideApp(path.resolve(APP_ROOT, args[1])), signal:cancellation.signal });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
} catch { process.stderr.write("Oklahoma offline app operation did not finalize cleanly; inspect its durable receipt before retrying.\n"); process.exitCode = 1; }
finally { cancellation.dispose(); }
