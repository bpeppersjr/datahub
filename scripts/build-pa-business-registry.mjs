#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { buildPaBusinessRegistry, publishPaBusinessRegistryStaging } from "../runner/pa-business-registry.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";

function usage() {
  return `Build the governed Pennsylvania Department of State active-registration release.

Usage:
  node scripts/build-pa-business-registry.mjs [options]

Options:
  --output <path>       Output root (default: data/business-sources/pa-business-registry-active-registrations)
  --zbp <path>          Census ZBP current.json prerequisite
  --page-size <number>  Socrata ordered page size (default: 50000; maximum: 50000)
  --minimum-organizations <number>
                        Distinct-organization quality floor (default: 2000000)
  --resume-staging-run <UUID>
                        Verify and publish one complete unpublished staging run without downloading again
  --help                Show this help
`;
}

function parseArguments(args) {
  const options = {
    output: "data/business-sources/pa-business-registry-active-registrations",
    zbp: "data/business-baselines/census-zbp/current.json",
    pageSize: 50_000,
    minimumOrganizations: 2_000_000,
    resumeStagingRun: null,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") return { help: true };
    if (["--output", "--zbp", "--page-size", "--minimum-organizations", "--resume-staging-run"].includes(argument)) {
      const value = args[index + 1];
      if (!value) throw new Error(`${argument} requires a value.`);
      index += 1;
      if (argument === "--output") options.output = value;
      if (argument === "--zbp") options.zbp = value;
      if (argument === "--page-size") options.pageSize = Number(value);
      if (argument === "--minimum-organizations") options.minimumOrganizations = Number(value);
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
    ? await publishPaBusinessRegistryStaging({ outputRoot, stagingRunId: options.resumeStagingRun })
    : await buildPaBusinessRegistry({
      outputRoot,
      zbpPointer: assertInsideApp(path.resolve(APP_ROOT, options.zbp)),
      pageSize: options.pageSize,
      minimumOrganizations: options.minimumOrganizations,
      logger: (message) => process.stdout.write(`${message}\n`),
    });
  process.stdout.write(`${JSON.stringify({
    release_id: result.manifest.release_id,
    release_directory: result.releaseDirectory,
    manifest: path.join(result.releaseDirectory, "manifest.json"),
    coverage: result.manifest.coverage,
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`Pennsylvania Business Registry build failed: ${error.message}\n`);
  process.exitCode = 1;
}
