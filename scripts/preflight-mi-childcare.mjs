#!/usr/bin/env node
import process from "node:process";
import { createCliCancellation } from "../runner/cli-cancellation.mjs";
import { relativeToApp } from "../runner/paths.mjs";
import { preflightMiChildcare, writeMiChildcarePreflight } from "../runner/mi-childcare-preflight.mjs";

const cancellation = createCliCancellation();
try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    process.stdout.write("Usage: node scripts/preflight-mi-childcare.mjs\nChecks fixed Michigan center metadata/count only; saves an immutable receipt. No facility rows, acquisition, agreement acceptance, export approval or scheduling.\n");
  } else {
    if (args.length) throw new Error("Unsupported preflight arguments; use --help.");
    const receipt = await preflightMiChildcare({ signal: cancellation.signal });
    const saved = await writeMiChildcarePreflight(receipt, { signal: cancellation.signal });
    process.stdout.write(`${JSON.stringify({ status: receipt.status, receipt: relativeToApp(saved.path), sha256: saved.sha256, bytes: saved.bytes,
      source_record_count: receipt.source.record_count, readiness: receipt.readiness }, null, 2)}\n`);
  }
} catch (error) { process.stderr.write(`Michigan childcare preflight failed: ${error.message}\n`); process.exitCode = 1; }
finally { cancellation.dispose(); }
