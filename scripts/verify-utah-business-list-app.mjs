#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";
import { verifyUtahBusinessListAppJob } from "../runner/utah-business-list-app.mjs";

try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") process.stdout.write("Usage: node scripts/verify-utah-business-list-app.mjs --receipt data/imports/utah-business-list/operations/<run-id>/receipt.json\n");
  else {
    if (args.length !== 2 || args[0] !== "--receipt") throw new Error("Invalid arguments.");
    process.stdout.write(`${JSON.stringify(await verifyUtahBusinessListAppJob(assertInsideApp(path.resolve(APP_ROOT, args[1]))), null, 2)}\n`);
  }
} catch {
  process.stderr.write("Utah Business List offline app receipt verification failed.\n");
  process.exitCode = 1;
}
