#!/usr/bin/env node

import process from "node:process";

import {
  executeNormalizedUsPostalCutover,
  prepareNormalizedUsPostalCutover,
  readNormalizedUsPostalCutover,
  recoverNormalizedUsPostalCutover,
  rollbackNormalizedUsPostalCutover,
  writeNormalizedUsPostalCutoverPlan,
} from "../runner/normalized-us-postal-cutover.mjs";

function usage() {
  return `Plan, execute, inspect, recover, or roll back the normalized U.S. postal-field cutover.

Usage:
  node scripts/cutover-normalized-us-postal-migration.mjs plan --write-plan <path>
  node scripts/cutover-normalized-us-postal-migration.mjs execute --plan <path> --expected-plan-sha256 <sha256> --confirm
  node scripts/cutover-normalized-us-postal-migration.mjs status --cutover-id <id>
  node scripts/cutover-normalized-us-postal-migration.mjs recover --cutover-id <id> --expected-plan-sha256 <sha256> --confirm
  node scripts/cutover-normalized-us-postal-migration.mjs rollback --cutover-id <id> --expected-plan-sha256 <sha256> --confirm

Planning and status are read-only except for exclusive creation of --write-plan.
Execution, recovery, and rollback require exact hashes and explicit confirmation.
`;
}

function parseArguments(args) {
  if (args.length === 0 || args.includes("--help")) return { help: true };
  const command = args[0];
  if (!["plan", "execute", "status", "recover", "rollback"].includes(command)) throw new Error(`Unknown cutover command ${command}.`);
  const options = { command, confirm: false };
  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--confirm") {
      options.confirm = true;
      continue;
    }
    if (["--write-plan", "--plan", "--expected-plan-sha256", "--cutover-id"].includes(argument)) {
      const value = args[index + 1];
      if (!value) throw new Error(`${argument} requires a value.`);
      index += 1;
      if (argument === "--write-plan") options.writePlan = value;
      if (argument === "--plan") options.planPath = value;
      if (argument === "--expected-plan-sha256") options.expectedPlanSha256 = value;
      if (argument === "--cutover-id") options.cutoverId = value;
      continue;
    }
    throw new Error(`Unknown argument ${argument}.`);
  }
  return options;
}

function requireOption(options, property, flag) {
  if (!options[property]) throw new Error(`${options.command} requires ${flag}.`);
}

try {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    process.exit(0);
  }
  let result;
  if (options.command === "plan") {
    requireOption(options, "writePlan", "--write-plan");
    const plan = await prepareNormalizedUsPostalCutover({ onProgress: (message) => process.stderr.write(`${message}\n`) });
    const destination = await writeNormalizedUsPostalCutoverPlan({ plan, destination: options.writePlan });
    result = { status: "PLANNED", plan_sha256: plan.plan_sha256, candidate_plan_sha256: plan.candidate_plan_sha256, source_count: plan.sources.length, plan: destination };
  }
  if (options.command === "execute") {
    requireOption(options, "planPath", "--plan");
    requireOption(options, "expectedPlanSha256", "--expected-plan-sha256");
    result = await executeNormalizedUsPostalCutover({
      planPath: options.planPath,
      expectedPlanSha256: options.expectedPlanSha256,
      confirm: options.confirm,
      onProgress: (message) => process.stderr.write(`${message}\n`),
    });
    result = { status: result.state.status, cutover_id: result.state.cutover_id, plan_sha256: result.state.plan_sha256, state_revision: result.state.state_revision };
  }
  if (options.command === "status") {
    requireOption(options, "cutoverId", "--cutover-id");
    result = await readNormalizedUsPostalCutover({ cutoverId: options.cutoverId });
  }
  if (["recover", "rollback"].includes(options.command)) {
    requireOption(options, "cutoverId", "--cutover-id");
    requireOption(options, "expectedPlanSha256", "--expected-plan-sha256");
    const operation = options.command === "recover" ? recoverNormalizedUsPostalCutover : rollbackNormalizedUsPostalCutover;
    result = await operation({
      cutoverId: options.cutoverId,
      expectedPlanSha256: options.expectedPlanSha256,
      confirm: options.confirm,
      onProgress: (message) => process.stderr.write(`${message}\n`),
    });
  }
  process.stdout.write(json(result));
} catch (error) {
  process.stderr.write(`Postal migration cutover failed: ${error.message}\n`);
  if (error.cutover_id) process.stderr.write(`Cutover ID: ${error.cutover_id}\n`);
  process.exitCode = 1;
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}
