#!/usr/bin/env node
import path from "node:path";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";
import { createCliCancellation } from "../runner/cli-cancellation.mjs";
import { publishOhChildcareCurrentPointer, runOhChildcareAppJob, verifyOhChildcare } from "../runner/oh-childcare.mjs";

const cancellation = createCliCancellation();
try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") process.stdout.write("Usage: node scripts/build-oh-childcare.mjs [--output <datahub folder>]\nRuns a fixed Ohio Open-center acquisition and verified local-review normalization with durable app receipts. No AI session required.\n");
  else {
    if (args.length !== 0 && !(args.length === 2 && args[0] === "--output" && args[1] && !args[1].startsWith("--"))) throw new Error("Invalid arguments.");
    const outputRoot = args[1] ? assertInsideApp(path.resolve(APP_ROOT, args[1])) : path.join(APP_ROOT,"data/business-sources/oh-childcare-open-center-candidates");
    const result=await runOhChildcareAppJob({ outputRoot, signal: cancellation.signal, industryRunId: process.env.INDUSTRY_SEGMENT_RUN_ID });
    const verified=await verifyOhChildcare(result.receipt_path,{signal:cancellation.signal});
    if(JSON.stringify(verified)!==JSON.stringify(result))throw Error("Receipt changed.");
    const published=await publishOhChildcareCurrentPointer(outputRoot,verified,{signal:cancellation.signal});
    process.stdout.write(`${JSON.stringify({...verified,currentPointer:published.pointerPath}, null, 2)}\n`);
  }
} catch (error) {
  const detail = typeof error.message === "string" && error.message.startsWith("Ohio ") ? error.message : "Inspect local job receipts, output ownership and source prerequisites.";
  process.stderr.write(`Ohio app collection failed: ${detail}\n`); process.exitCode = 1;
} finally { cancellation.dispose(); }
