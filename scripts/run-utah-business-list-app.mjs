#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";
import { createCliCancellation } from "../runner/cli-cancellation.mjs";
import { runUtahBusinessListAppJob } from "../runner/utah-business-list-app.mjs";

const cancellation = createCliCancellation();
try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") process.stdout.write("Usage: node scripts/run-utah-business-list-app.mjs --selection data/imports/utah-business-list/packages/<package-id>/selection.json\nOffline only; no purchase, account creation, download, current-pointer change, or national admission.\n");
  else {
    if (args.length !== 2 || args[0] !== "--selection") throw new Error("Invalid arguments.");
    const result = await runUtahBusinessListAppJob({ selectionPath: assertInsideApp(path.resolve(APP_ROOT, args[1])), signal: cancellation.signal });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
} catch {
  process.stderr.write("Utah Business List offline app operation did not finalize cleanly; inspect its durable receipt before retrying.\n");
  process.exitCode = 1;
} finally { cancellation.dispose(); }
