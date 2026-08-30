#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { buildEpaEcho } from "../runner/epa-echo.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";

function usage() {
  return `Build the governed EPA ECHO active regulated-facility release.

Usage:
  node scripts/build-epa-echo.mjs [options]

Options:
  --archive <path>  Existing official echo_exporter.zip; if omitted, stream the official download
  --output <path>   Output root (default: data/business-sources/epa-echo-active-facilities)
  --zbp <path>      Census ZBP current.json prerequisite
  --help            Show this help
`;
}

function parseArguments(args) {
  const options = {
    archive: null,
    output: "data/business-sources/epa-echo-active-facilities",
    zbp: "data/business-baselines/census-zbp/current.json",
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") return { help: true };
    if (["--archive", "--output", "--zbp"].includes(argument)) {
      const value = args[index + 1];
      if (!value) throw new Error(`${argument} requires a value.`);
      index += 1;
      if (argument === "--archive") options.archive = value;
      if (argument === "--output") options.output = value;
      if (argument === "--zbp") options.zbp = value;
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
  const result = await buildEpaEcho({
    outputRoot: assertInsideApp(path.resolve(APP_ROOT, options.output)),
    zbpPointer: assertInsideApp(path.resolve(APP_ROOT, options.zbp)),
    archivePath: options.archive ? assertInsideApp(path.resolve(APP_ROOT, options.archive)) : null,
    logger: (message) => process.stdout.write(`${message}\n`),
  });
  process.stdout.write(`${JSON.stringify({
    release_id: result.manifest.release_id,
    release_directory: result.releaseDirectory,
    manifest: path.join(result.releaseDirectory, "manifest.json"),
    coverage: result.manifest.coverage,
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`EPA ECHO build failed: ${error.message}\n`);
  process.exitCode = 1;
}
