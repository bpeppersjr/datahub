#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";
import { createCliCancellation } from "../runner/cli-cancellation.mjs";
import { buildTnChildcareRelease } from "../runner/tn-childcare-release.mjs";

const cancellation = createCliCancellation();
try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") process.stdout.write("Usage: node scripts/build-tn-childcare.mjs [--output <datahub path>]\nAcquires fixed Tennessee center-only selected evidence into a verified local-review release. No AI session required.\n");
  else {
    if (args.length !== 0 && !(args.length === 2 && args[0] === "--output" && args[1] && !args[1].startsWith("--"))) throw new Error("Unsupported build arguments; use --help.");
    const outputRoot = assertInsideApp(path.resolve(APP_ROOT, args[1] ?? "data/business-sources/tn-dhs-active-childcare-centers"));
    process.stdout.write(`${JSON.stringify(await buildTnChildcareRelease({ outputRoot, signal: cancellation.signal, logger: (message) => process.stdout.write(`${message}\n`) }), null, 2)}\n`);
  }
} catch (error) { process.stderr.write(`Tennessee childcare build failed: ${error.message}\n`); process.exitCode = 1; }
finally { cancellation.dispose(); }
