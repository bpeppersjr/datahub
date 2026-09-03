#!/usr/bin/env node

import process from "node:process";

import {
  auditZipDenominators,
  DEFAULT_ZIP_DENOMINATOR_AUDIT_COHORTS,
} from "../runner/zip-denominator-audit.mjs";

function usage() {
  return `Usage:
  node scripts/audit-zip-denominator.mjs [options]

Options:
  --production-only          Audit only data/business-registry/current.json.
  --candidate-only           Audit only the isolated postal-migration registry candidate.
  --production-pointer PATH  Override the production pointer path.
  --candidate-pointer PATH   Override the candidate pointer path.
  --include-rows             Include deterministic per-ZIP audit rows.
  --summary-only             Omit complete ZIP lists; retain counts, hashes, and samples.
  --allow-contract-gaps      Exit zero after reporting reason-contract failures.
  --help                     Show this help.

The command is read-only. It never changes current pointers, releases, or cutover state.
`;
}

function valueAfter(args, index, option) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${option} requires a path.`);
  return value;
}

function parseArgs(args) {
  const options = {
    productionOnly: false,
    candidateOnly: false,
    productionPointer: DEFAULT_ZIP_DENOMINATOR_AUDIT_COHORTS[0].pointer,
    candidatePointer: DEFAULT_ZIP_DENOMINATOR_AUDIT_COHORTS[1].pointer,
    includeRows: false,
    includeZipLists: true,
    allowContractGaps: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help") return { help: true };
    if (arg === "--production-only") options.productionOnly = true;
    else if (arg === "--candidate-only") options.candidateOnly = true;
    else if (arg === "--include-rows") options.includeRows = true;
    else if (arg === "--summary-only") options.includeZipLists = false;
    else if (arg === "--allow-contract-gaps") options.allowContractGaps = true;
    else if (arg === "--production-pointer") {
      options.productionPointer = valueAfter(args, index, arg);
      index += 1;
    } else if (arg === "--candidate-pointer") {
      options.candidatePointer = valueAfter(args, index, arg);
      index += 1;
    } else throw new Error(`Unknown option ${arg}.`);
  }
  if (options.productionOnly && options.candidateOnly) {
    throw new Error("--production-only and --candidate-only cannot be combined.");
  }
  return options;
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
  } else {
    const cohorts = [];
    if (!options.candidateOnly) cohorts.push({
      cohort_id: "production-current",
      pointer: options.productionPointer,
      required: true,
    });
    if (!options.productionOnly) cohorts.push({
      cohort_id: "postal-migration-candidate",
      pointer: options.candidatePointer,
      required: options.candidateOnly,
    });
    const report = await auditZipDenominators({
      cohorts,
      includeRows: options.includeRows,
      includeZipLists: options.includeZipLists,
    });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (report.overall_contract_status !== "passed" && !options.allowContractGaps) process.exitCode = 1;
  }
} catch (error) {
  process.stderr.write(`ZIP denominator audit failed: ${error.message}\n`);
  process.exitCode = 1;
}
