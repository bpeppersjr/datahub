#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";
import { verifyIllinoisBusinessAppJob } from "../runner/il-business-app.mjs";

try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") process.stdout.write("Usage: node scripts/verify-il-business-app.mjs --receipt <operation receipt.json>\n");
  else {
    if (args.length !== 2 || args[0] !== "--receipt") throw new Error("Invalid arguments.");
    process.stdout.write(`${JSON.stringify(await verifyIllinoisBusinessAppJob(assertInsideApp(path.resolve(APP_ROOT, args[1]))), null, 2)}\n`);
  }
} catch { process.stderr.write("Illinois offline app receipt verification failed.\n"); process.exitCode = 1; }
