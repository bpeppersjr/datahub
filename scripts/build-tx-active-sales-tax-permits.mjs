#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { buildTxActiveSalesTaxPermits, publishTxActiveSalesTaxPermitsStaging } from "../runner/tx-active-sales-tax-permits.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";

function usage() {
  return `Build the governed Texas Comptroller active sales-tax permit outlet release.

Usage:
  node scripts/build-tx-active-sales-tax-permits.mjs [options]

Options:
  --output <path>       Output root (default: data/business-sources/tx-active-sales-tax-outlets)
  --zbp <path>          Census ZBP current.json prerequisite
  --page-size <count>   Socrata page size from 1 through 50000 (default: 50000)
  --minimum <count>     Minimum source outlet permits (default: 800000)
  --resume-staging-run <UUID>
                        Verify and publish a complete staging run without reacquiring it
  --help                Show this help
`;
}

function parseArguments(args) {
  const options = {
    output: "data/business-sources/tx-active-sales-tax-outlets",
    zbp: "data/business-baselines/census-zbp/current.json",
    pageSize: 50_000,
    minimumOutlets: 800_000,
    resumeStagingRun: null,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") return { help: true };
    if (["--output", "--zbp", "--page-size", "--minimum", "--resume-staging-run"].includes(argument)) {
      const value = args[index + 1];
      if (!value) throw new Error(`${argument} requires a value.`);
      index += 1;
      if (argument === "--output") options.output = value;
      if (argument === "--zbp") options.zbp = value;
      if (argument === "--page-size") options.pageSize = Number(value);
      if (argument === "--minimum") options.minimumOutlets = Number(value);
      if (argument === "--resume-staging-run") options.resumeStagingRun = value;
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
  const outputRoot = assertInsideApp(path.resolve(APP_ROOT, options.output));
  const result = options.resumeStagingRun
    ? await publishTxActiveSalesTaxPermitsStaging({ outputRoot, stagingRunId: options.resumeStagingRun })
    : await buildTxActiveSalesTaxPermits({
      outputRoot,
      zbpPointer: assertInsideApp(path.resolve(APP_ROOT, options.zbp)),
      pageSize: options.pageSize,
      minimumOutlets: options.minimumOutlets,
      logger: (message) => process.stdout.write(`${message}\n`),
    });
  process.stdout.write(`${JSON.stringify({
    release_id: result.manifest.release_id,
    release_directory: result.releaseDirectory,
    manifest: path.join(result.releaseDirectory, "manifest.json"),
    status: result.manifest.status,
    coverage: result.manifest.coverage,
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`Texas active-sales-tax permit build failed: ${error.message}\n`);
  if (error.failures) process.stderr.write(`${JSON.stringify(error.failures, null, 2)}\n`);
  process.exitCode = 1;
}
