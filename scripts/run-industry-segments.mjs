#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { DEFAULT_CONFIG, loadIndustryConfig, buildIndustryPlan, runIndustryPlan } from "../runner/industry-segments.mjs";

function usage() {
  return `Run independent industry/state source segments.

Usage:
  node scripts/run-industry-segments.mjs plan [--industry <id>[,...]] [--state <ST>[,...]] [--config <path>]
  node scripts/run-industry-segments.mjs run [--industry <id>[,...]] [--state <ST>[,...]] [--config <path>] [--run-id <id>]

plan is read-only. run is explicit and may acquire source data through the configured builders.
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
    else if (flag === "--run-id") options.runId = value;
    else throw new Error(`Unknown argument ${flag}.`);
  }
  if (!["plan", "run"].includes(options.mode)) throw new Error("Mode must be plan or run.");
  return options;
}

try {
  const options = parse(process.argv.slice(2));
  if (options.help) { process.stdout.write(usage()); process.exit(0); }
  const config = await loadIndustryConfig(options.config);
  const plan = buildIndustryPlan(config, { industries: options.industries, states: options.states, runId: options.runId || undefined });
  if (options.mode === "plan") { process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`); process.exit(0); }
  const abort = new AbortController();
  process.once("SIGINT", () => abort.abort());
  process.once("SIGTERM", () => abort.abort());
  const result = await runIndustryPlan(config, plan, { signal: abort.signal });
  process.stdout.write(`${JSON.stringify({ status: result.receipt.status, run_id: plan.runId, receipt: path.relative(process.cwd(), result.receiptPath).replaceAll("\\", "/") }, null, 2)}\n`);
  process.exitCode = result.receipt.status === "succeeded" ? 0 : 1;
} catch (error) {
  process.stderr.write(`Industry segment orchestration failed: ${error.message}\n`);
  process.exitCode = 1;
}
