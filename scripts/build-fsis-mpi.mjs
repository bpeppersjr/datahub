#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { buildFsisMpi } from "../runner/fsis-mpi.mjs";
import { APP_ROOT, assertInsideApp } from "../runner/paths.mjs";

function usage() {
  return `Build the governed USDA FSIS active MPI establishment release.

Usage:
  node scripts/build-fsis-mpi.mjs --source-date <YYYY-MM-DD> [options]

Options:
  --directory <path>    Official MPI_Directory_by_Establishment_Name.csv input
                        (default: downloads/fsis-mpi/MPI_Directory_by_Establishment_Name.csv)
  --demographic <path>  Official Dataset_Establishment_Demographic_Data.csv input
                        (default: downloads/fsis-mpi/Dataset_Establishment_Demographic_Data.csv)
  --source-date <date>  Date printed beside both official source links (required)
  --output <path>       Output root (default: data/business-sources/fsis-active-mpi-establishments)
  --zbp <path>          Census ZBP current.json prerequisite
  --help                Show this help
`;
}

function parseArguments(args) {
  const options = {
    directory: "downloads/fsis-mpi/MPI_Directory_by_Establishment_Name.csv",
    demographic: "downloads/fsis-mpi/Dataset_Establishment_Demographic_Data.csv",
    sourceDate: null,
    output: "data/business-sources/fsis-active-mpi-establishments",
    zbp: "data/business-baselines/census-zbp/current.json",
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") return { help: true };
    if (["--directory", "--demographic", "--source-date", "--output", "--zbp"].includes(argument)) {
      const value = args[index + 1];
      if (!value) throw new Error(`${argument} requires a value.`);
      index += 1;
      if (argument === "--directory") options.directory = value;
      if (argument === "--demographic") options.demographic = value;
      if (argument === "--source-date") options.sourceDate = value;
      if (argument === "--output") options.output = value;
      if (argument === "--zbp") options.zbp = value;
      continue;
    }
    throw new Error(`Unknown argument ${argument}.`);
  }
  if (!options.sourceDate) throw new Error("--source-date is required.");
  return options;
}

try {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    process.exit(0);
  }
  const result = await buildFsisMpi({
    outputRoot: assertInsideApp(path.resolve(APP_ROOT, options.output)),
    zbpPointer: assertInsideApp(path.resolve(APP_ROOT, options.zbp)),
    directoryPath: assertInsideApp(path.resolve(APP_ROOT, options.directory)),
    demographicPath: assertInsideApp(path.resolve(APP_ROOT, options.demographic)),
    sourceDate: options.sourceDate,
    logger: (message) => process.stdout.write(`${message}\n`),
  });
  process.stdout.write(`${JSON.stringify({
    release_id: result.manifest.release_id,
    release_directory: result.releaseDirectory,
    manifest: path.join(result.releaseDirectory, "manifest.json"),
    coverage: result.manifest.coverage,
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`FSIS MPI build failed: ${error.message}\n`);
  process.exitCode = 1;
}
