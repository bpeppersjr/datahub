#!/usr/bin/env node
import path from "node:path";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";
import { verifyTnChildcareRecoveredRelease } from "../runner/tn-childcare-recovered-release.mjs";
import { createCliCancellation } from "../runner/cli-cancellation.mjs";

const cancellation = createCliCancellation();
try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") process.stdout.write("Usage: node scripts/verify-tn-childcare-recovered.mjs <immutable manifest.json>\nIndependently replays retained Tennessee recovered acquisition and normalization evidence offline. Does not accept current.json, acquire data, or publish a release.\n");
  else {
    if (args.length !== 1 || !args[0] || args[0].startsWith("--") || path.basename(args[0]) !== "manifest.json") throw new Error("Immutable manifest required");
    const manifest = assertInsideApp(path.resolve(APP_ROOT, args[0]));
    process.stdout.write(`${JSON.stringify(await verifyTnChildcareRecoveredRelease(manifest, { signal: cancellation.signal }), null, 2)}\n`);
  }
} catch { process.stderr.write("Tennessee recovered-release verification failed; inspect immutable evidence integrity and cancellation status.\n"); process.exitCode = 1; }
finally { cancellation.dispose(); }
