#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { buildDeBusinessLicenses, publishDeBusinessLicensesStaging } from "../runner/de-business-licenses.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";

function usage() {
  return `Build the governed Delaware Division of Revenue current business-license release.

Usage:
  node scripts/build-de-business-licenses.mjs [options]

Options:
  --output <path>       Output root (default: data/business-sources/de-business-licenses-current)
  --zbp <path>          Census ZBP current.json prerequisite
  --page-size <number>  Socrata ordered page size (default: 50000; maximum: 50000)
  --minimum-license-rows <number>
                        Source-row quality floor (default: 60000)
  --maximum-quarantine-rate <number>
                        Maximum rejected source-row share (default: 0.05)
  --resume-staging-run <UUID>
                        Verify and publish one complete unpublished staging run without downloading again
  --help                Show this help
`;
}

function parseArguments(args) {
  const options = {
    output: "data/business-sources/de-business-licenses-current",
    zbp: "data/business-baselines/census-zbp/current.json",
    pageSize: 50_000,
    minimumLicenseRows: 60_000,
    maximumQuarantineRate: 0.05,
    resumeStagingRun: null,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") return { help: true };
    if (["--output", "--zbp", "--page-size", "--minimum-license-rows", "--maximum-quarantine-rate", "--resume-staging-run"].includes(argument)) {
      const value = args[index + 1];
      if (!value) throw new Error(`${argument} requires a value.`);
      index += 1;
      if (argument === "--output") options.output = value;
      if (argument === "--zbp") options.zbp = value;
      if (argument === "--page-size") options.pageSize = Number(value);
      if (argument === "--minimum-license-rows") options.minimumLicenseRows = Number(value);
      if (argument === "--maximum-quarantine-rate") options.maximumQuarantineRate = Number(value);
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
    ? await publishDeBusinessLicensesStaging({ outputRoot, stagingRunId: options.resumeStagingRun })
    : await buildDeBusinessLicenses({
      outputRoot,
      zbpPointer: assertInsideApp(path.resolve(APP_ROOT, options.zbp)),
      pageSize: options.pageSize,
      minimumLicenseRows: options.minimumLicenseRows,
      maximumQuarantineRate: options.maximumQuarantineRate,
      logger: (message) => process.stdout.write(`${message}\n`),
    });
  process.stdout.write(`${JSON.stringify({
    release_id: result.manifest.release_id,
    release_directory: result.releaseDirectory,
    manifest: path.join(result.releaseDirectory, "manifest.json"),
    coverage: result.manifest.coverage,
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`Delaware business-license build failed: ${error.message}\n`);
  process.exitCode = 1;
}
