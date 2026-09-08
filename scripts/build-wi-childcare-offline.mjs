#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";
import { createCliCancellation } from "../runner/cli-cancellation.mjs";
import { readWiChildcareEvidence, buildWiChildcareRelease } from "../runner/wi-childcare-release.mjs";

const cancellation = createCliCancellation();
try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") process.stdout.write("Usage: node scripts/build-wi-childcare-offline.mjs <source-observation.json> [--output <folder>]\nAssembles supplied evidence into an immutable offline-review bundle. No network, approval, scheduling or production integration. All paths must remain within datahub.\n");
  else {
    if (![1, 3].includes(args.length) || !args[0] || args[0].startsWith("--") || (args.length === 3 && (args[1] !== "--output" || !args[2] || args[2].startsWith("--")))) throw new Error("Invalid arguments; use --help.");
    const evidence = await readWiChildcareEvidence(assertInsideApp(path.resolve(APP_ROOT, args[0])), { signal: cancellation.signal });
    const result = await buildWiChildcareRelease({ evidence, signal: cancellation.signal, ...(args.length === 3 ? { outputRoot: assertInsideApp(path.resolve(APP_ROOT, args[2])) } : {}) });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
} catch (error) {
  const detail = typeof error.message === "string" && error.message.startsWith("Wisconsin ") ? error.message : "Input or storage check failed; inspect source evidence, path ownership and source policy.";
  process.stderr.write(`Wisconsin offline release failed: ${detail} No acquisition was performed.\n`); process.exitCode = 1;
}
finally { cancellation.dispose(); }
