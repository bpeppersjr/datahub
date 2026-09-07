#!/usr/bin/env node
import process from "node:process";
import { createCliCancellation } from "../runner/cli-cancellation.mjs";
import { preflightMaChildcare, writeMaChildcarePreflight } from "../runner/ma-childcare-preflight.mjs";
import { relativeToApp } from "../runner/paths.mjs";

const cancellation = createCliCancellation();
try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    process.stdout.write("Usage: node scripts/preflight-ma-childcare.mjs [--stdout-only]\nChecks official metadata and counts only. Default writes an immutable local preflight receipt; no records are downloaded or published.\n");
  } else {
    if (args.length > 1 || (args.length === 1 && args[0] !== "--stdout-only")) throw new Error("Unsupported preflight arguments; use --help.");
    const receipt = await preflightMaChildcare({ signal: cancellation.signal });
    if (args[0] === "--stdout-only") process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
    else {
      const artifact = await writeMaChildcarePreflight(receipt, { signal: cancellation.signal });
      process.stdout.write(`${JSON.stringify({ status: receipt.status, record_count: receipt.source.record_count,
        connector_ready: false, row_data_acquired: false, receipt: relativeToApp(artifact.path), sha256: artifact.sha256 }, null, 2)}\n`);
    }
  }
} catch (error) {
  process.stderr.write(`Massachusetts childcare preflight failed: ${error.message}\n`);
  process.exitCode = 1;
} finally { cancellation.dispose(); }
