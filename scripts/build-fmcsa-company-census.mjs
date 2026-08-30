#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { readFile } from "node:fs/promises";
import { buildFmcsaCompanyCensus } from "../runner/fmcsa-company-census.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";

function usage() {
  return `Build the governed FMCSA active U.S. Company Census release.

Usage:
  node scripts/build-fmcsa-company-census.mjs [options]

Options:
  --source-csv <path>       Existing selected official CSV (requires --dictionary and --metadata)
  --dictionary <path>       Existing official Company Census dictionary PDF
  --metadata <path>         JSON object containing metadata, datasetRecords, and activeUsRecords
  --output <path>           Output root (default: data/business-sources/fmcsa-active-us-company-census)
  --zbp <path>              Census ZBP current.json prerequisite
  --help                    Show this help
`;
}

function parseArguments(args) {
  const options = {
    sourceCsv: null,
    dictionary: null,
    metadata: null,
    output: "data/business-sources/fmcsa-active-us-company-census",
    zbp: "data/business-baselines/census-zbp/current.json",
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") return { help: true };
    if (["--source-csv", "--dictionary", "--metadata", "--output", "--zbp"].includes(argument)) {
      const value = args[index + 1];
      if (!value) throw new Error(`${argument} requires a value.`);
      index += 1;
      if (argument === "--source-csv") options.sourceCsv = value;
      if (argument === "--dictionary") options.dictionary = value;
      if (argument === "--metadata") options.metadata = value;
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
  const localInputs = [options.sourceCsv, options.dictionary, options.metadata];
  if (localInputs.some(Boolean) && !localInputs.every(Boolean)) throw new Error("--source-csv, --dictionary, and --metadata must be supplied together.");
  const result = await buildFmcsaCompanyCensus({
    outputRoot: assertInsideApp(path.resolve(APP_ROOT, options.output)),
    zbpPointer: assertInsideApp(path.resolve(APP_ROOT, options.zbp)),
    sourceCsvPath: options.sourceCsv ? assertInsideApp(path.resolve(APP_ROOT, options.sourceCsv)) : null,
    dictionaryPath: options.dictionary ? assertInsideApp(path.resolve(APP_ROOT, options.dictionary)) : null,
    sourceMetadata: options.metadata ? JSON.parse(await readFile(assertInsideApp(path.resolve(APP_ROOT, options.metadata)), "utf8")) : null,
    logger: (message) => process.stdout.write(`${message}\n`),
  });
  process.stdout.write(`${JSON.stringify({
    release_id: result.manifest.release_id,
    release_directory: result.releaseDirectory,
    manifest: path.join(result.releaseDirectory, "manifest.json"),
    coverage: result.manifest.coverage,
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`FMCSA Company Census build failed: ${error.message}\n`);
  process.exitCode = 1;
}
