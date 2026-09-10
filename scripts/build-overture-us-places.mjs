#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { buildOvertureUsPlaces } from "../runner/overture-us-places.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";
import { createCliCancellation } from "../runner/cli-cancellation.mjs";

function usage() {
  return `Build and retain a governed Overture U.S. Places release from an already prepared source.
The default does not update current.json. Promotion requires --publish.

Usage:
  node scripts/build-overture-us-places.mjs --source <jsonl.gz> --source-metadata <json> [options]

Options:
  --source <path>            Prepared selected-us-places.jsonl.gz (required)
  --source-metadata <path>   Matching source-metadata.json (required)
  --output <path>            Output root (default: data/business-sources/overture-us-places)
  --zbp <path>               Census ZBP current.json prerequisite
  --minimum <count>          Minimum selected places (default: 1000000)
  --max-quarantine <ratio>   Maximum quarantine ratio (default: 0.02)
  --publish                  Explicitly promote the verified build to current.json
  --help                     Show this help
`;
}

function parseArguments(args) {
  const options = {
    source: null,
    sourceMetadata: null,
    output: "data/business-sources/overture-us-places",
    zbp: "data/business-baselines/census-zbp/current.json",
    minimumPlaces: 1_000_000,
    maximumQuarantineRatio: 0.02,
    publicationMode: "retain",
  };
  const seen = new Set();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") return { help: true };
    if (seen.has(argument)) throw new Error("Duplicate build option.");
    seen.add(argument);
    if (argument === "--publish") { options.publicationMode = "publish"; continue; }
    if (["--source", "--source-metadata", "--output", "--zbp", "--minimum", "--max-quarantine"].includes(argument)) {
      const value = args[index + 1];
      if (!value) throw new Error(`${argument} requires a value.`);
      index += 1;
      if (argument === "--source") options.source = value;
      if (argument === "--source-metadata") options.sourceMetadata = value;
      if (argument === "--output") options.output = value;
      if (argument === "--zbp") options.zbp = value;
      if (argument === "--minimum") options.minimumPlaces = Number(value);
      if (argument === "--max-quarantine") options.maximumQuarantineRatio = Number(value);
      continue;
    }
    throw new Error(`Unknown argument ${argument}.`);
  }
  if (!options.source || !options.sourceMetadata) throw new Error("--source and --source-metadata are required. Run the preflight/prepare command first.");
  return options;
}

let cancellation;
try {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) { process.stdout.write(usage()); process.exit(0); }
  cancellation = createCliCancellation();
  const result = await buildOvertureUsPlaces({
    outputRoot: assertInsideApp(path.resolve(APP_ROOT, options.output)),
    zbpPointer: assertInsideApp(path.resolve(APP_ROOT, options.zbp)),
    sourceFile: assertInsideApp(path.resolve(APP_ROOT, options.source)),
    sourceMetadataFile: assertInsideApp(path.resolve(APP_ROOT, options.sourceMetadata)),
    minimumPlaces: options.minimumPlaces,
    maximumQuarantineRatio: options.maximumQuarantineRatio,
    publicationMode: options.publicationMode,
    signal: cancellation.signal,
    logger: (message) => process.stdout.write(`${message}\n`),
  });
  process.stdout.write(`${JSON.stringify({ status: result.status, staging_run_id: result.stagingRunId ?? null, pointer: result.pointerPath,
    release_id: result.manifest.release_id, release_directory: result.releaseDirectory, manifest: path.join(result.releaseDirectory, "manifest.json"), coverage: result.manifest.coverage }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`Overture U.S. Places build failed: ${error.message}\n`);
  process.exitCode = 1;
} finally { cancellation?.dispose(); }
