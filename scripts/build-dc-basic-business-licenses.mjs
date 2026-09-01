#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { buildDcBasicBusinessLicenses } from "../runner/dc-basic-business-licenses.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";

function usage() {
  return `Build the governed District of Columbia active Basic Business License site release.

Usage:
  node scripts/build-dc-basic-business-licenses.mjs [options]

Options:
  --output <path>       Output root (default: data/business-sources/dc-basic-business-license-sites)
  --zbp <path>          Census ZBP current.json prerequisite
  --page-size <count>   ArcGIS page size from 1 through 2000 (default: 2000)
  --minimum <count>     Minimum source Active Business License rows (default: 50000)
  --max-quarantine <n> Maximum quarantined source-row ratio (default: 0.25)
  --help                Show this help
`;
}

function parseArguments(args) {
  const options = {
    output: "data/business-sources/dc-basic-business-license-sites",
    zbp: "data/business-baselines/census-zbp/current.json",
    pageSize: 2000,
    minimumActiveLicenseRecords: 50_000,
    maximumQuarantineRate: 0.25,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") return { help: true };
    if (["--output", "--zbp", "--page-size", "--minimum", "--max-quarantine"].includes(argument)) {
      const value = args[index + 1];
      if (!value) throw new Error(`${argument} requires a value.`);
      index += 1;
      if (argument === "--output") options.output = value;
      if (argument === "--zbp") options.zbp = value;
      if (argument === "--page-size") options.pageSize = Number(value);
      if (argument === "--minimum") options.minimumActiveLicenseRecords = Number(value);
      if (argument === "--max-quarantine") options.maximumQuarantineRate = Number(value);
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
  const result = await buildDcBasicBusinessLicenses({
    outputRoot: assertInsideApp(path.resolve(APP_ROOT, options.output)),
    zbpPointer: assertInsideApp(path.resolve(APP_ROOT, options.zbp)),
    pageSize: options.pageSize,
    minimumActiveLicenseRecords: options.minimumActiveLicenseRecords,
    maximumQuarantineRate: options.maximumQuarantineRate,
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
  process.stderr.write(`DC Basic Business License build failed: ${error.message}\n`);
  if (error.failures) process.stderr.write(`${JSON.stringify(error.failures, null, 2)}\n`);
  process.exitCode = 1;
}
