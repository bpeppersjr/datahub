#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { buildCtBusinessRegistry, publishCtBusinessRegistryStaging } from "../runner/ct-business-registry.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";

function usage() {
  return `Build the governed Connecticut active Business Registry organization release.

Usage:
  node scripts/build-ct-business-registry.mjs [options]

Options:
  --output <path>       Output root (default: data/business-sources/ct-business-registry-active-organizations)
  --zbp <path>          Census ZBP current.json prerequisite
  --page-size <number>  Socrata keyset page size (default: 25000; maximum: 50000)
  --resume-staging-run <UUID>
                        Verify and publish one complete unpublished staging run without downloading again
  --help                Show this help
`;
}

function parseArguments(args) {
  const options = {
    output: "data/business-sources/ct-business-registry-active-organizations",
    zbp: "data/business-baselines/census-zbp/current.json",
    pageSize: 25_000,
    resumeStagingRun: null,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") return { help: true };
    if (["--output", "--zbp", "--page-size", "--resume-staging-run"].includes(argument)) {
      const value = args[index + 1];
      if (!value) throw new Error(`${argument} requires a value.`);
      index += 1;
      if (argument === "--output") options.output = value;
      if (argument === "--zbp") options.zbp = value;
      if (argument === "--page-size") options.pageSize = Number(value);
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
    ? await publishCtBusinessRegistryStaging({ outputRoot, stagingRunId: options.resumeStagingRun })
    : await buildCtBusinessRegistry({
      outputRoot,
      zbpPointer: assertInsideApp(path.resolve(APP_ROOT, options.zbp)),
      pageSize: options.pageSize,
      logger: (message) => process.stdout.write(`${message}\n`),
    });
  process.stdout.write(`${JSON.stringify({
    release_id: result.manifest.release_id,
    release_directory: result.releaseDirectory,
    manifest: path.join(result.releaseDirectory, "manifest.json"),
    coverage: result.manifest.coverage,
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`Connecticut Business Registry build failed: ${error.message}\n`);
  process.exitCode = 1;
}
