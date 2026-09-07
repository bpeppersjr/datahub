#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";
import { createCliCancellation } from "../runner/cli-cancellation.mjs";
import { reprocessNjChildcareRelease } from "../runner/nj-childcare-release.mjs";

const cancellation = createCliCancellation();
try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    process.stdout.write("Usage: node scripts/reprocess-nj-childcare.mjs <manifest.json> [--output <datahub path>]\nReprocesses a verified retained NJ 1.0.0 release using sessions-only LF handling in transformation 1.0.1. No network requests; original release preserved.\n");
  } else {
    if (![1, 3].includes(args.length) || !args[0] || args[0].startsWith("--")
      || (args.length === 3 && (args[1] !== "--output" || !args[2] || args[2].startsWith("--")))) throw new Error("Unsupported reprocessing arguments; use --help.");
    const inputManifestPath = assertInsideApp(path.resolve(APP_ROOT, args[0]));
    const output = args.length === 3 ? { outputRoot: assertInsideApp(path.resolve(APP_ROOT, args[2])) } : {};
    const result = await reprocessNjChildcareRelease(inputManifestPath, { ...output, signal: cancellation.signal,
      logger: (message) => process.stdout.write(`${message}\n`) });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
} catch (error) {
  process.stderr.write(`New Jersey childcare reprocessing failed: ${error.message}\n`);
  process.exitCode = 1;
} finally { cancellation.dispose(); }
