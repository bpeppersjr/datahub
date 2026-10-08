#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";
import { createCliCancellation } from "../runner/cli-cancellation.mjs";
import { runAkCorporationsAppJob } from "../runner/ak-corporations-app.mjs";

const cancellation = createCliCancellation();
try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") process.stdout.write("Usage: node scripts/run-ak-corporations-app.mjs --selection data/imports/ak-corporations/packages/<package-id>/selection.json\nOffline only; no source acquisition, current pointer, coverage/Heatmap admission, or production authorization.\n");
  else {
    if (args.length !== 2 || args[0] !== "--selection") throw new Error("Invalid arguments.");
    process.stdout.write(`${JSON.stringify(await runAkCorporationsAppJob({ selectionPath: assertInsideApp(path.resolve(APP_ROOT, args[1])), signal: cancellation.signal }), null, 2)}\n`);
  }
} catch { process.stderr.write("Alaska Corporations offline app operation did not finalize cleanly; inspect its durable receipt before retrying.\n"); process.exitCode = 1; }
finally { cancellation.dispose(); }
