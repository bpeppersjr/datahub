#!/usr/bin/env node

import path from "node:path";
import process from "node:process";

import {
  preflightTxActiveFranchiseTaxpayers,
  writeTxActiveFranchisePreflightReceipt,
} from "../runner/tx-active-franchise-taxpayers.mjs";
import { APP_ROOT, assertInsideApp, relativeToApp } from "../runner/paths.mjs";

function usage() {
  return `Run the governed Texas Active Franchise Taxpayers metadata/count-only preflight.

Usage:
  node scripts/preflight-tx-active-franchise-taxpayers.mjs [options]

Options:
  --output <path>       Immutable receipt directory inside datahub
                        (default: data/business-sources/tx-active-franchise-taxpayers/preflights)
  --stdout-only         Do not write a receipt; print the validated observation only
  --help                Show this help

This command makes exactly two request types: official dataset metadata and count(*).
It never requests taxpayer rows, creates normalized records, or publishes current.json.
Large acquisition remains default-denied and is not implemented by this command.
`;
}

function parseArguments(arguments_) {
  const options = {
    output: "data/business-sources/tx-active-franchise-taxpayers/preflights",
    stdoutOnly: false,
  };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--help") return { help: true };
    if (argument === "--stdout-only") {
      options.stdoutOnly = true;
      continue;
    }
    if (argument === "--output") {
      const value = arguments_[index + 1];
      if (!value) throw new Error("--output requires a value.");
      options.output = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument ${argument}.`);
  }
  return options;
}

try {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    process.exit(0);
  }
  const receipt = await preflightTxActiveFranchiseTaxpayers();
  if (options.stdoutOnly) {
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  } else {
    const outputRoot = assertInsideApp(path.resolve(APP_ROOT, options.output));
    const artifact = await writeTxActiveFranchisePreflightReceipt({ receipt, outputRoot });
    process.stdout.write(`${JSON.stringify({
      status: receipt.status,
      dataset_id: receipt.dataset_id,
      source_rows_updated_at: receipt.source_rows_updated_at,
      source_record_count: receipt.source_record_count,
      schema_fingerprint: receipt.schema_fingerprint,
      source_observation_fingerprint: receipt.source_observation_fingerprint,
      row_data_requests: receipt.acquisition.row_data_requests,
      row_data_acquired: receipt.acquisition.row_data_acquired,
      receipt: relativeToApp(artifact.path),
      receipt_sha256: artifact.sha256,
    }, null, 2)}\n`);
  }
} catch (error) {
  process.stderr.write(`Texas Active Franchise Taxpayers preflight failed: ${error.message}\n`);
  process.exitCode = 1;
}
