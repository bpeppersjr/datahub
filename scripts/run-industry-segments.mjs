#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { DEFAULT_CONFIG, loadIndustryConfig, buildIndustryPlan, industryPlanFingerprint, runIndustryPlan } from "../runner/industry-segments.mjs";
import { createCliCancellation } from "../runner/cli-cancellation.mjs";

function usage() {
  return `Run independent industry/state source segments.

Usage:
  node scripts/run-industry-segments.mjs plan [--industry <id>[,...]] [--state <ST>[,...]] [--config <path>]
  node scripts/run-industry-segments.mjs run [--industry <id>[,...]] [--state <ST>[,...]] [--config <path>] [--run-id <id>] [--expected-plan-sha256 <hash>]

plan is read-only. run is explicit and may acquire source data through the configured builders.
Optional --sources <id[,id]> restricts manual selection to applicable sources; it does not retry or skip existing data.
`;
}

function parse(args) {
  const mode = args[0] && !args[0].startsWith("--") ? args.shift() : "plan";
  const options = { mode, config: DEFAULT_CONFIG, industries: [], states: [], runId: null };
  for (let i = 0; i < args.length; i += 1) {
    const flag = args[i];
    if (flag === "--help") return { help: true };
    const value = args[++i];
    if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
    if (flag === "--config") options.config = value;
    else if (flag === "--industry") options.industries.push(value);
    else if (flag === "--state") options.states.push(value.toUpperCase());
    else if (flag === "--sources") { if(options.sourceIds !== undefined) throw new Error("--sources may only be supplied once."); options.sourceIds=value.split(","); }
    else if (flag === "--run-id") options.runId = value;
    else if (flag === "--expected-plan-sha256") options.expectedPlanHash = value;
    else throw new Error(`Unknown argument ${flag}.`);
  }
  if (!["plan", "run"].includes(options.mode)) throw new Error("Mode must be plan or run.");
  if (options.expectedPlanHash !== undefined && (options.mode !== "run" || !/^[a-f0-9]{64}$/.test(options.expectedPlanHash))) throw new Error("--expected-plan-sha256 requires run mode and a 64-character lowercase SHA256 hash.");
  return options;
}

const cancellation = createCliCancellation();
try {
  const options = parse(process.argv.slice(2));
  if (options.help) { process.stdout.write(usage()); process.exit(0); }
  const config = await loadIndustryConfig(options.config);
  const plan = buildIndustryPlan(config, { industries: options.industries, states: options.states, ...(options.sourceIds === undefined ? {} : {sourceIds:options.sourceIds}), runId: options.runId || undefined });
  if (options.mode === "plan") { process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`); process.exit(0); }
  if (options.expectedPlanHash && industryPlanFingerprint(plan) !== options.expectedPlanHash) throw new Error("Scheduled industry plan changed; acquisition is blocked.");
  const result = await runIndustryPlan(config, plan, { signal: cancellation.signal });
  process.stdout.write(`${JSON.stringify({ status: result.receipt.status, run_id: plan.runId, receipt: path.relative(process.cwd(), result.receiptPath).replaceAll("\\", "/") }, null, 2)}\n`);
  process.exitCode = result.receipt.status === "succeeded" ? 0 : 1;
} catch (error) {
  process.stderr.write(`Industry segment orchestration failed: ${error.message}\n`);
  process.exitCode = 1;
} finally {
  cancellation.dispose();
}
