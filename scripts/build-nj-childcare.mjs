#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";
import { createCliCancellation } from "../runner/cli-cancellation.mjs";
import { buildNjChildcareRelease } from "../runner/nj-childcare-release.mjs";

const cancellation = createCliCancellation();
try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    process.stdout.write("Usage: node scripts/build-nj-childcare.mjs [--output <datahub path>]\nAcquires the fixed NJDEP childcare source and retains publisher metadata in a verified local-review release. No AI session or credential is required.\n");
  } else {
    if (args.length !== 0 && !(args.length === 2 && args[0] === "--output" && args[1] && !args[1].startsWith("--"))) throw new Error("Unsupported build arguments; use --help.");
    const outputRoot = assertInsideApp(path.resolve(APP_ROOT, args[1] ?? "data/business-sources/nj-licensed-childcare-centers"));
    const result = await buildNjChildcareRelease({ outputRoot, signal: cancellation.signal,
      logger: (message) => process.stdout.write(`${message}\n`) });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
} catch (error) {
  process.stderr.write(`New Jersey childcare build failed: ${error.message}\n`);
  process.exitCode = 1;
} finally { cancellation.dispose(); }
