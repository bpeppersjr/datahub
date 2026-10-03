#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";
import { createCliCancellation } from "../runner/cli-cancellation.mjs";
import { runDcCorporateRegistrationAppJob } from "../runner/dc-corporate-registration-app.mjs";

const cancellation = createCliCancellation();
try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") process.stdout.write("Usage: node scripts/run-dc-corporate-registration-app.mjs --selection data/imports/dc-corporate-registration/packages/<package-id>/selection.json\nOffline only; no discovery, download, source pointer change, or national admission.\n");
  else {
    if (args.length !== 2 || args[0] !== "--selection") throw new Error("Invalid arguments.");
    const result = await runDcCorporateRegistrationAppJob({ selectionPath: assertInsideApp(path.resolve(APP_ROOT, args[1])), signal: cancellation.signal });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
} catch {
  process.stderr.write("DC Corporate Registration offline app operation did not finalize cleanly; inspect its durable receipt before retrying.\n");
  process.exitCode = 1;
} finally { cancellation.dispose(); }
