#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { buildNationalBusinessCoverageViews } from "../runner/national-business-coverage-views.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";

function usage() {
  return `Build governed national, state, county, ZIP, source, and coverage-gap views.

Usage:
  node scripts/build-national-business-coverage-views.mjs [options]

Options:
  --registry <path>    Registry pointer or manifest (default: data/business-registry/current.json)
  --geography <path>   Geography pointer or manifest (default: data/geography/current.json)
  --crosswalk <path>   ZCTA jurisdiction pointer or manifest (default: data/zcta-jurisdiction-crosswalk/current.json)
  --resolution <path>  Entity-resolution pointer or manifest (default: data/business-entity-resolution/current.json)
  --benchmark <path>   Benchmark pointer or manifest (default: data/business-entity-resolution-benchmark/current.json)
  --nonemployer <path> Census Nonemployer pointer or manifest (default: data/business-baselines/census-nonemployer/current.json)
  --output <path>      Output root (default: data/business-coverage-views)
  --help               Show this help
`;
}

function parseArguments(args) {
  const options = {
    registry: "data/business-registry/current.json",
    geography: "data/geography/current.json",
    crosswalk: "data/zcta-jurisdiction-crosswalk/current.json",
    resolution: "data/business-entity-resolution/current.json",
    benchmark: "data/business-entity-resolution-benchmark/current.json",
    nonemployer: "data/business-baselines/census-nonemployer/current.json",
    output: "data/business-coverage-views",
  };
  const names = new Set(["--registry", "--geography", "--crosswalk", "--resolution", "--benchmark", "--nonemployer", "--output"]);
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") return { help: true };
    if (!names.has(argument)) throw new Error(`Unknown argument ${argument}.`);
    const value = args[index + 1];
    if (!value) throw new Error(`${argument} requires a value.`);
    index += 1;
    options[argument.slice(2)] = value;
  }
  return options;
}

try {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    process.exit(0);
  }
  const inside = (requested) => assertInsideApp(path.resolve(APP_ROOT, requested));
  const result = await buildNationalBusinessCoverageViews({
    registryPointerPath: inside(options.registry),
    geographyPointerPath: inside(options.geography),
    crosswalkPointerPath: inside(options.crosswalk),
    resolutionPointerPath: inside(options.resolution),
    benchmarkPointerPath: inside(options.benchmark),
    nonemployerPointerPath: inside(options.nonemployer),
    outputRoot: inside(options.output),
    logger: (message) => process.stdout.write(`${message}\n`),
  });
  process.stdout.write(`${JSON.stringify({
    release_id: result.manifest.release_id,
    release_directory: result.releaseDirectory,
    manifest: path.join(result.releaseDirectory, "manifest.json"),
    coverage: result.manifest.coverage,
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`Business coverage-view build failed: ${error.message}\n`);
  process.exitCode = 1;
}
