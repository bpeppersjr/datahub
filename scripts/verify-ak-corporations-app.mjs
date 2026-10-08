#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";
import { verifyAkCorporationsAppJob } from "../runner/ak-corporations-app.mjs";

try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") process.stdout.write("Usage: node scripts/verify-ak-corporations-app.mjs --receipt data/imports/ak-corporations/operations/<run-id>/receipt.json\n");
  else {
    if (args.length !== 2 || args[0] !== "--receipt") throw new Error("Invalid arguments.");
    const verified = await verifyAkCorporationsAppJob(assertInsideApp(path.resolve(APP_ROOT, args[1])));
    process.stdout.write(`${JSON.stringify(verified, null, 2)}\n`);
  }
} catch { process.stderr.write("Alaska Corporations offline app receipt verification failed.\n"); process.exitCode = 1; }
