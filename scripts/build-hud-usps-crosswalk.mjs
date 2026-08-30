#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { buildHudUspsCrosswalk } from "../runner/hud-usps-crosswalk.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";

function usage() {
  return `Build a governed quarterly HUD-USPS ZIP-to-county release.

Usage:
  node scripts/build-hud-usps-crosswalk.mjs --year <yyyy> --quarter <1-4> [options]

Required environment:
  HUD_USPS_API_TOKEN    HUD USER USPS Crosswalk API token

Options:
  --output <path>      Output root (default: data/zip-validity/hud-usps)
  --geography <path>   Geography current.json (default: data/geography/current.json)
  --year <yyyy>        Explicit source year
  --quarter <1-4>      Explicit source quarter
  --help               Show this help
`;
}

function parseArguments(args) {
  const options = {
    output: "data/zip-validity/hud-usps",
    geography: "data/geography/current.json",
    year: null,
    quarter: null,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") return { help: true };
    if (["--output", "--geography", "--year", "--quarter"].includes(argument)) {
      const value = args[index + 1];
      if (!value) throw new Error(`${argument} requires a value.`);
      index += 1;
      if (argument === "--output") options.output = value;
      if (argument === "--geography") options.geography = value;
      if (argument === "--year") options.year = Number(value);
      if (argument === "--quarter") options.quarter = Number(value);
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
  const result = await buildHudUspsCrosswalk({
    outputRoot: assertInsideApp(path.resolve(APP_ROOT, options.output)),
    geographyPointer: assertInsideApp(path.resolve(APP_ROOT, options.geography)),
    config: { year: options.year, quarter: options.quarter },
    token: process.env.HUD_USPS_API_TOKEN,
  });
  process.stdout.write(`${JSON.stringify({
    release_id: result.manifest.release_id,
    release_directory: result.releaseDirectory,
    manifest: path.join(result.releaseDirectory, "manifest.json"),
    coverage: result.manifest.coverage,
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`HUD-USPS build failed: ${error.message}\n`);
  process.exitCode = 1;
}
