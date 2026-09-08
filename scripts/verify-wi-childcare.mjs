#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";
import { createCliCancellation } from "../runner/cli-cancellation.mjs";
import { verifyWiChildcareRelease } from "../runner/wi-childcare-release.mjs";

const cancellation = createCliCancellation();
try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") process.stdout.write("Usage: node scripts/verify-wi-childcare.mjs <manifest.json>\nIndependently replays an immutable Wisconsin offline-review bundle. Verification is not acquisition, source authenticity, export or national-reporting approval.\n");
  else {
    if (args.length !== 1 || !args[0] || args[0].startsWith("--")) throw new Error("Invalid arguments.");
    const manifest = assertInsideApp(path.resolve(APP_ROOT, args[0]));
    if (path.basename(manifest) !== "manifest.json" || path.basename(path.dirname(path.dirname(manifest))) !== "releases") throw new Error("Immutable manifest required.");
    process.stdout.write(`${JSON.stringify(await verifyWiChildcareRelease(manifest, { signal: cancellation.signal }), null, 2)}\n`);
  }
} catch (error) {
  const detail = typeof error.message === "string" && error.message.startsWith("Wisconsin ") ? error.message : "Supply an intact immutable release manifest inside datahub.";
  process.stderr.write(`Wisconsin offline verification failed: ${detail} No acquisition was performed.\n`); process.exitCode = 1;
}
finally { cancellation.dispose(); }
