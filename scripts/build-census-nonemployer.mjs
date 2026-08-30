#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { buildCensusNonemployerBaseline } from "../runner/census-nonemployer.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";

function usage() {
  return `Build the governed Census Nonemployer Statistics baseline.

Usage:
  node scripts/build-census-nonemployer.mjs [options]

Options:
  --output <path>      Output root (default: data/business-baselines/census-nonemployer)
  --year <yyyy>        Pin a Census reference year instead of discovering latest
  --help               Show this help
`;
}

function parseArguments(args) {
  const options = { output: "data/business-baselines/census-nonemployer", year: null };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") return { help: true };
    if (!["--output", "--year"].includes(argument)) throw new Error(`Unknown argument ${argument}.`);
    const value = args[index + 1];
    if (!value) throw new Error(`${argument} requires a value.`);
    index += 1;
    if (argument === "--output") options.output = value;
    if (argument === "--year") options.year = Number(value);
  }
  return options;
}

try {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    process.exit(0);
  }
  const result = await buildCensusNonemployerBaseline({
    outputRoot: assertInsideApp(path.resolve(APP_ROOT, options.output)),
    year: options.year,
    logger: (message) => process.stdout.write(`${message}\n`),
  });
  process.stdout.write(`${JSON.stringify({
    release_id: result.manifest.release_id,
    release_directory: result.releaseDirectory,
    manifest: path.join(result.releaseDirectory, "manifest.json"),
    coverage: result.manifest.coverage,
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`Census Nonemployer build failed: ${error.message}\n`);
  process.exitCode = 1;
}
