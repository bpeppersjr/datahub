#!/usr/bin/env node
import process from "node:process";
import { createCliCancellation } from "../runner/cli-cancellation.mjs";
import { relativeToApp } from "../runner/paths.mjs";
import { preflightWiChildcare, writeWiChildcarePreflight } from "../runner/wi-childcare-preflight.mjs";

const cancellation = createCliCancellation();
try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    process.stdout.write("Usage: node scripts/preflight-wi-childcare.mjs\nChecks fixed public Wisconsin metadata/counts and saves an immutable prerequisite receipt. No facility download, acquisition approval or scheduling.\n");
  } else {
    if (args.length) throw new Error("Unsupported arguments; use --help.");
    const receipt = await preflightWiChildcare({ signal: cancellation.signal });
    const saved = await writeWiChildcarePreflight(receipt, { signal: cancellation.signal });
    process.stdout.write(`${JSON.stringify({ status: receipt.status, receipt: relativeToApp(saved.path), sha256: saved.sha256, bytes: saved.bytes, source_record_count: receipt.source.source_record_count, acquisition: receipt.acquisition, remaining_gates: receipt.remaining_gates }, null, 2)}\n`);
  }
} catch (error) { process.stderr.write(`Wisconsin childcare preflight failed: ${error.message}\n`); process.exitCode = 1; }
finally { cancellation.dispose(); }
