#!/usr/bin/env node

import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import {
  buildTxActiveFranchiseTaxpayersOffline,
  TX_ACTIVE_FRANCHISE_OFFLINE_BUILD_ACKNOWLEDGEMENT,
} from "../runner/tx-active-franchise-offline.mjs";
import { APP_ROOT, assertInsideApp, relativeToApp } from "../runner/paths.mjs";

function usage() {
  return `Build a default-denied, local-review-only Texas Active Franchise Taxpayers staging release from an operator-supplied file.

Usage:
  node scripts/build-tx-active-franchise-offline.mjs --source <path> --preflight <receipt.json> --acknowledgement <exact-value> [options]

Required:
  --source <path>             Offline .csv/.csv.gz/.jsonl/.jsonl.gz/.ndjson/.ndjson.gz file inside datahub
  --preflight <path>          Fresh immutable preflight receipt inside datahub
  --acknowledgement <value>   Must equal ${TX_ACTIVE_FRANCHISE_OFFLINE_BUILD_ACKNOWLEDGEMENT}

Options:
  --output <path>             Staging root (default: data/business-sources/tx-active-franchise-taxpayers)
  --tx-sales-tax <path>       Optional corrected Texas sales-tax current.json or candidate pointer for exact-ID reconciliation
  --maximum-quarantine-rate <fraction>
                              Maximum 0..1 quarantine fraction (default: 0.005)
  --maximum-preflight-age-hours <hours>
                              Maximum receipt age (default: 48)
  --help                      Show this help

This command never downloads taxpayer rows, writes current.json, publishes a release, creates sites/geocodes, or feeds Heatmap Builder.
`;
}

function parseArguments(arguments_) {
  const options = {
    source: null,
    preflight: null,
    acknowledgement: null,
    output: "data/business-sources/tx-active-franchise-taxpayers",
    txSalesTax: null,
    maximumQuarantineRate: 0.005,
    maximumPreflightAgeHours: 48,
  };
  const valueArguments = new Set(["--source", "--preflight", "--acknowledgement", "--output", "--tx-sales-tax", "--maximum-quarantine-rate", "--maximum-preflight-age-hours"]);
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--help") return { help: true };
    if (!valueArguments.has(argument)) throw new Error(`Unknown argument ${argument}.`);
    const value = arguments_[index + 1];
    if (!value) throw new Error(`${argument} requires a value.`);
    index += 1;
    if (argument === "--source") options.source = value;
    if (argument === "--preflight") options.preflight = value;
    if (argument === "--acknowledgement") options.acknowledgement = value;
    if (argument === "--output") options.output = value;
    if (argument === "--tx-sales-tax") options.txSalesTax = value;
    if (argument === "--maximum-quarantine-rate") options.maximumQuarantineRate = Number(value);
    if (argument === "--maximum-preflight-age-hours") options.maximumPreflightAgeHours = Number(value);
  }
  if (!options.source || !options.preflight || !options.acknowledgement) throw new Error("--source, --preflight, and --acknowledgement are required.");
  return options;
}

function assertInsideResolvedRoot(appRoot, candidate, label) {
  const relative = path.relative(appRoot, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`${label} resolves outside the datahub folder.`);
}

async function existingPathInsideApp(candidate, label) {
  const lexical = assertInsideApp(path.resolve(APP_ROOT, candidate));
  const [appRoot, resolved] = await Promise.all([realpath(APP_ROOT), realpath(lexical)]);
  assertInsideResolvedRoot(appRoot, resolved, label);
  return resolved;
}

async function writablePathInsideApp(candidate, label) {
  const lexical = assertInsideApp(path.resolve(APP_ROOT, candidate));
  const appRoot = await realpath(APP_ROOT);
  let ancestor = lexical;
  while (true) {
    try {
      const resolvedAncestor = await realpath(ancestor);
      assertInsideResolvedRoot(appRoot, resolvedAncestor, label);
      return lexical;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const parent = path.dirname(ancestor);
      if (parent === ancestor) throw new Error(`${label} has no existing in-datahub ancestor.`);
      ancestor = parent;
    }
  }
}

try {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    process.exit(0);
  }
  if (!Number.isFinite(options.maximumPreflightAgeHours) || options.maximumPreflightAgeHours <= 0) throw new Error("--maximum-preflight-age-hours must be positive.");
  const sourcePath = await existingPathInsideApp(options.source, "Offline source");
  const preflightPath = await existingPathInsideApp(options.preflight, "Preflight receipt");
  const outputRoot = await writablePathInsideApp(options.output, "Offline staging output");
  const salesTaxPointerPath = options.txSalesTax ? await existingPathInsideApp(options.txSalesTax, "Texas sales-tax dependency") : null;
  const preflight = JSON.parse(await readFile(preflightPath, "utf8"));
  const result = await buildTxActiveFranchiseTaxpayersOffline({
    outputRoot,
    sourcePath,
    preflight,
    acknowledgement: options.acknowledgement,
    salesTaxPointerPath,
    maximumQuarantineRate: options.maximumQuarantineRate,
    maximumPreflightAgeMs: Math.round(options.maximumPreflightAgeHours * 60 * 60 * 1000),
    logger: (message) => process.stdout.write(`${message}\n`),
  });
  process.stdout.write(`${JSON.stringify({
    dataset_id: result.manifest.dataset_id,
    release_id: result.manifest.release_id,
    status: result.manifest.status,
    manifest: relativeToApp(result.manifestPath),
    staging_directory: relativeToApp(result.stagingDirectory),
    production_pointer_published: false,
    heatmap_status: result.manifest.heatmap.status,
    coverage: result.manifest.coverage,
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`Texas Active Franchise Taxpayers offline build failed: ${error.message}\n`);
  if (error.failures) process.stderr.write(`${JSON.stringify(error.failures, null, 2)}\n`);
  process.exitCode = 1;
}
