#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { buildCaAbcActiveLicenseSites } from "../runner/ca-abc-active-license-sites.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";

function usage() {
  return `Build the governed California ABC active issued-license site release.

Usage:
  node scripts/build-ca-abc-active-license-sites.mjs [options]

Options:
  --output <path>         Output root (default: data/business-sources/ca-abc-active-license-sites)
  --zbp <path>            Census ZBP current.json prerequisite
  --minimum <count>       Minimum normalized sites (default: 50000)
  --max-quarantine <n>    Maximum selected-row quarantine ratio (default: 0.02)
  --help                  Show this help
`;
}

function parseArguments(args) {
  const options = { output: "data/business-sources/ca-abc-active-license-sites", zbp: "data/business-baselines/census-zbp/current.json", minimumSites: 50_000, maximumQuarantineRatio: 0.02 };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") return { help: true };
    if (["--output", "--zbp", "--minimum", "--max-quarantine"].includes(argument)) {
      const value = args[index + 1];
      if (!value) throw new Error(`${argument} requires a value.`);
      index += 1;
      if (argument === "--output") options.output = value;
      if (argument === "--zbp") options.zbp = value;
      if (argument === "--minimum") options.minimumSites = Number(value);
      if (argument === "--max-quarantine") options.maximumQuarantineRatio = Number(value);
      continue;
    }
    throw new Error(`Unknown argument ${argument}.`);
  }
  return options;
}

try {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) { process.stdout.write(usage()); process.exit(0); }
  const result = await buildCaAbcActiveLicenseSites({
    outputRoot: assertInsideApp(path.resolve(APP_ROOT, options.output)),
    zbpPointer: assertInsideApp(path.resolve(APP_ROOT, options.zbp)),
    minimumSites: options.minimumSites,
    maximumQuarantineRatio: options.maximumQuarantineRatio,
    logger: (message) => process.stdout.write(`${message}\n`),
  });
  process.stdout.write(`${JSON.stringify({ release_id: result.manifest.release_id, release_directory: result.releaseDirectory, manifest: path.join(result.releaseDirectory, "manifest.json"), status: result.manifest.status, coverage: result.manifest.coverage }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`California ABC active-license build failed: ${error.message}\n`);
  process.exitCode = 1;
}
