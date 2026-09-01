#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { buildAkActiveBusinessLicenses, publishAkActiveBusinessLicensesStaging } from "../runner/ak-active-business-licenses.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";

function usage() {
  return `Build the governed Alaska DCCED active business-license release.

Usage:
  node scripts/build-ak-active-business-licenses.mjs [options]

Options:
  --output <path>       Output root (default: data/business-sources/ak-active-business-licenses)
  --zbp <path>          Census ZBP current.json prerequisite
  --minimum-license-rows <number>
                        Source-row quality floor (default: 80000)
  --maximum-quarantine-rate <number>
                        Maximum rejected source-row share (default: 0.01)
  --minimum-naics-coverage-rate <number>
                        Minimum share of license IDs represented in NAICS download (default: 0.99)
  --resume-staging-run <UUID>
                        Verify and publish one complete unpublished staging run without downloading again
  --help                Show this help
`;
}

function parseArguments(args) {
  const options = {
    output: "data/business-sources/ak-active-business-licenses",
    zbp: "data/business-baselines/census-zbp/current.json",
    minimumLicenseRows: 80_000,
    maximumQuarantineRate: 0.01,
    minimumNaicsCoverageRate: 0.99,
    resumeStagingRun: null,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") return { help: true };
    if (["--output", "--zbp", "--minimum-license-rows", "--maximum-quarantine-rate", "--minimum-naics-coverage-rate", "--resume-staging-run"].includes(argument)) {
      const value = args[index + 1];
      if (!value) throw new Error(`${argument} requires a value.`);
      index += 1;
      if (argument === "--output") options.output = value;
      if (argument === "--zbp") options.zbp = value;
      if (argument === "--minimum-license-rows") options.minimumLicenseRows = Number(value);
      if (argument === "--maximum-quarantine-rate") options.maximumQuarantineRate = Number(value);
      if (argument === "--minimum-naics-coverage-rate") options.minimumNaicsCoverageRate = Number(value);
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
    ? await publishAkActiveBusinessLicensesStaging({ outputRoot, stagingRunId: options.resumeStagingRun })
    : await buildAkActiveBusinessLicenses({
      outputRoot,
      zbpPointer: assertInsideApp(path.resolve(APP_ROOT, options.zbp)),
      minimumLicenseRows: options.minimumLicenseRows,
      maximumQuarantineRate: options.maximumQuarantineRate,
      minimumNaicsCoverageRate: options.minimumNaicsCoverageRate,
      logger: (message) => process.stdout.write(`${message}\n`),
    });
  process.stdout.write(`${JSON.stringify({
    release_id: result.manifest.release_id,
    release_directory: result.releaseDirectory,
    manifest: path.join(result.releaseDirectory, "manifest.json"),
    coverage: result.manifest.coverage,
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`Alaska active business-license build failed: ${error.message}\n`);
  process.exitCode = 1;
}
