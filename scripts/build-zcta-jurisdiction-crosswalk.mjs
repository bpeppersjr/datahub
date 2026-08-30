#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import {
  buildZctaJurisdictionCrosswalk,
  publishStagedZctaJurisdictionCrosswalk,
} from "../runner/zcta-jurisdiction-crosswalk.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";

function usage() {
  return `Build the governed Census ZCTA-to-county/state polygon overlay.

Usage:
  node scripts/build-zcta-jurisdiction-crosswalk.mjs [options]

Options:
  --geography <path>  Census geography pointer or manifest (default: data/geography/current.json)
  --output <path>     Output root inside datahub (default: data/zcta-jurisdiction-crosswalk)
  --resume-staged <path>
                       Verify and publish a completed run from the output root's .staging directory
  --help              Show this help
`;
}

function parseArguments(args) {
  const options = {
    geography: "data/geography/current.json",
    output: "data/zcta-jurisdiction-crosswalk",
    resumeStaged: null,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") return { help: true };
    if (["--geography", "--output", "--resume-staged"].includes(argument)) {
      const value = args[index + 1];
      if (!value) throw new Error(`${argument} requires a value.`);
      index += 1;
      if (argument === "--geography") options.geography = value;
      if (argument === "--output") options.output = value;
      if (argument === "--resume-staged") options.resumeStaged = value;
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
  const result = options.resumeStaged
    ? await publishStagedZctaJurisdictionCrosswalk({
        stagingDirectory: assertInsideApp(path.resolve(APP_ROOT, options.resumeStaged)),
        outputRoot,
      })
    : await buildZctaJurisdictionCrosswalk({
        geographyPointerPath: assertInsideApp(path.resolve(APP_ROOT, options.geography)),
        outputRoot,
        logger: (message) => process.stdout.write(`${message}\n`),
      });
  process.stdout.write(`${JSON.stringify({
    release_id: result.manifest.release_id,
    release_directory: result.releaseDirectory,
    manifest: path.join(result.releaseDirectory, "manifest.json"),
    coverage: result.manifest.coverage,
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`ZCTA jurisdiction crosswalk build failed: ${error.message}\n`);
  process.exitCode = 1;
}
