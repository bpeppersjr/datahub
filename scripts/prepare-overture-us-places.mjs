#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import {
  OVERTURE_LARGE_ACQUISITION_CONFIRMATION,
  preflightOverturePlaces,
  prepareOvertureUsPlacesSource,
} from "../runner/overture-us-places.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";

function usage() {
  return `Preflight or explicitly authorize preparation of a minimized U.S. Overture Places source snapshot.

Usage:
  node scripts/prepare-overture-us-places.mjs --preflight-only [--release <id>]
  node scripts/prepare-overture-us-places.mjs --authorize-large-acquisition ${OVERTURE_LARGE_ACQUISITION_CONFIRMATION} [options]

Options:
  --preflight-only                    Read STAC metadata only; never query GeoParquet assets
  --release <YYYY-MM-DD.N>            Pin one release (default: current STAC latest)
  --output <path>                     Prepared source root (default: downloads/overture-us-places)
  --authorize-large-acquisition <v>   Required exact confirmation for the large remote query
  --help                              Show this help

The selected source contains address latitude/longitude only. It excludes geometry, bbox,
email, phone, and social fields. ZIP5 and ZIP+4 remain separate in normalized output.
`;
}

function parseArguments(args) {
  const options = { output: "downloads/overture-us-places", requestedRelease: null, authorization: null, preflightOnly: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") return { help: true };
    if (argument === "--preflight-only") { options.preflightOnly = true; continue; }
    if (["--release", "--output", "--authorize-large-acquisition"].includes(argument)) {
      const value = args[index + 1];
      if (!value) throw new Error(`${argument} requires a value.`);
      index += 1;
      if (argument === "--release") options.requestedRelease = value;
      if (argument === "--output") options.output = value;
      if (argument === "--authorize-large-acquisition") options.authorization = value;
      continue;
    }
    throw new Error(`Unknown argument ${argument}.`);
  }
  return options;
}

try {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) { process.stdout.write(usage()); process.exit(0); }
  if (options.preflightOnly) {
    if (options.authorization) throw new Error("Choose metadata-only preflight or authorized acquisition, not both.");
    const result = await preflightOverturePlaces({ requestedRelease: options.requestedRelease });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    const result = await prepareOvertureUsPlacesSource({
      outputRoot: assertInsideApp(path.resolve(APP_ROOT, options.output)),
      requestedRelease: options.requestedRelease,
      authorization: options.authorization,
      logger: (message) => process.stdout.write(`${message}\n`),
    });
    process.stdout.write(`${JSON.stringify({ release_directory: result.releaseDirectory, source: result.sourcePath, source_metadata: result.metadataPath, record_count: result.metadata.record_count }, null, 2)}\n`);
  }
} catch (error) {
  process.stderr.write(`Overture U.S. Places preparation failed: ${error.message}\n`);
  process.exitCode = 1;
}
