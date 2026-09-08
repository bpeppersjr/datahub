#!/usr/bin/env node
import { createCliCancellation } from "../runner/cli-cancellation.mjs";
import { relativeToApp } from "../runner/paths.mjs";
import { preflightOhChildcare, writeOhChildcarePreflight } from "../runner/oh-childcare-preflight.mjs";

const cancellation = createCliCancellation();
try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    process.stdout.write("Usage: node scripts/preflight-oh-childcare.mjs\nChecks fixed Ohio metadata/status counts and saves a prerequisite receipt. No facility downloads, authorization or scheduling.\n");
  } else {
    if (args.length) throw new Error("Unsupported arguments.");
    const receipt = await preflightOhChildcare({ signal: cancellation.signal });
    const saved = await writeOhChildcarePreflight(receipt, { signal: cancellation.signal });
    process.stdout.write(`${JSON.stringify({ status: receipt.status, receipt: relativeToApp(saved.path), sha256: saved.sha256, bytes: saved.bytes, source: receipt.source, acquisition: receipt.acquisition, remaining_gates: receipt.remaining_gates }, null, 2)}\n`);
  }
} catch { process.stderr.write("Ohio childcare preflight failed; inspect source contract, transport or local storage. No acquisition approved.\n"); process.exitCode = 1; }
finally { cancellation.dispose(); }
