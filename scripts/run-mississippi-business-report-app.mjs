#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { createCliCancellation } from "../runner/cli-cancellation.mjs";
import { runMississippiBusinessReportAppJob } from "../runner/mississippi-business-report-app.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";
const cancellation = createCliCancellation({ abortOnDisconnect: true });
try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    process.stdout.write("Usage: node scripts/run-mississippi-business-report-app.mjs --package data/imports/mississippi-business-report/packages/<package-id>\nValidates local intake and writes private readiness metadata.\n");
  } else {
    if (args[0] !== "--package" || (args.length !== 2 && (args.length !== 4 || args[2] !== "--operation-id"))) throw Error("Invalid arguments.");
    const result = await runMississippiBusinessReportAppJob({
      packageDirectory: assertInsideApp(path.resolve(APP_ROOT, args[1])), operationId: args[3], signal: cancellation.signal,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
} catch (error) {
  const reason = error.code === "MS_REPORT_INTAKE_LOCKED" ? "Another Mississippi intake owns the operation lock or requires inspection." : "Mississippi intake did not finalize cleanly. Inspect its private receipt before retrying.";
  process.stderr.write(`${reason}\n`);
  process.exitCode = 1;
} finally {
  cancellation.dispose();
}
